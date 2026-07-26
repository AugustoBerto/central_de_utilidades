import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync, promises as fs, statfsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { HttpError } from './errors.js';

const PREVIEW_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain'
]);

const DOCUMENT_TYPES = [
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

function nowIso() {
  return new Date().toISOString();
}

function toFile(row) {
  return (
    row && {
      id: row.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      folderId: row.folder_id ?? null,
      folderPath: row.folder_path ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      previewAvailable: PREVIEW_TYPES.has(row.mime_type)
    }
  );
}

function validateId(id) {
  const parsed = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new HttpError(404, 'FILE_NOT_FOUND', 'Arquivo não encontrado.');
  return parsed;
}

function validateFolderId(folderId) {
  if (folderId === null || folderId === undefined || folderId === '') return null;
  const parsed = Number.parseInt(folderId, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new HttpError(422, 'VALIDATION_ERROR', 'Pasta de destino inválida.', {
      folderId: 'Informe uma pasta válida.'
    });
  return parsed;
}

function validateOriginalName(name) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 255 ||
    basename(name) !== name ||
    name.includes('\\') ||
    name.includes('/') ||
    Array.from(name).some((character) => character.charCodeAt(0) < 32)
  )
    throw new HttpError(422, 'VALIDATION_ERROR', 'Nome de arquivo inválido.', {
      originalName: 'Informe um nome de arquivo válido com até 255 caracteres.'
    });
  return name.trim();
}

function contentType(value) {
  return typeof value === 'string' && value
    ? value.split(';')[0].trim().toLowerCase()
    : 'application/octet-stream';
}

function nonNegativeInteger(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new HttpError(422, 'VALIDATION_ERROR', 'Filtro de tamanho inválido.', {
      [field]: 'Informe um número inteiro maior ou igual a zero.'
    });
  return parsed;
}

function dateBoundary(value, field, endOfDay = false) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : text;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime()))
    throw new HttpError(422, 'VALIDATION_ERROR', 'Filtro de data inválido.', {
      [field]: 'Informe uma data válida.'
    });
  return date.toISOString();
}

function typeCondition(type) {
  if (type === null || type === undefined || type === '' || type === 'all') return null;
  if (type === 'image') return "files.mime_type LIKE 'image/%'";
  if (type === 'audio') return "files.mime_type LIKE 'audio/%'";
  if (type === 'video') return "files.mime_type LIKE 'video/%'";
  const placeholders = DOCUMENT_TYPES.map(() => '?').join(', ');
  const document = `(files.mime_type LIKE 'text/%' OR files.mime_type IN (${placeholders}))`;
  if (type === 'document') return document;
  if (type === 'other')
    return `(files.mime_type NOT LIKE 'image/%' AND files.mime_type NOT LIKE 'audio/%' AND files.mime_type NOT LIKE 'video/%' AND NOT ${document})`;
  throw new HttpError(422, 'VALIDATION_ERROR', 'Tipo de arquivo inválido.', {
    type: 'Use image, audio, video, document, other ou all.'
  });
}

function folderPathCte() {
  return `WITH RECURSIVE folder_paths(id, path) AS (
    SELECT id, name FROM folders WHERE parent_id IS NULL
    UNION ALL
    SELECT folders.id, folder_paths.path || ' / ' || folders.name
    FROM folders
    JOIN folder_paths ON folders.parent_id = folder_paths.id
  )`;
}

export class FileService {
  constructor(database, { filesDir, maxUploadBytes, driveSettingsService = null }) {
    this.database = database;
    this.filesDir = resolve(filesDir);
    this.tempDir = join(this.filesDir, '.tmp');
    this.maxUploadBytes = maxUploadBytes;
    this.driveSettingsService = driveSettingsService;
    mkdirSync(this.tempDir, { recursive: true });
  }

  list({
    folderId = null,
    query = '',
    scope,
    sort = 'updatedAt',
    order = 'desc',
    from,
    to,
    minSize,
    maxSize,
    type,
    limit = 50,
    offset = 0
  } = {}) {
    const search = String(query).trim();
    const normalizedFolderId = validateFolderId(folderId);
    const normalizedScope = scope === undefined || scope === null || scope === ''
      ? search
        ? 'all'
        : 'folder'
      : String(scope);
    if (!['all', 'folder'].includes(normalizedScope))
      throw new HttpError(422, 'VALIDATION_ERROR', 'Escopo de busca inválido.', {
        scope: 'Use all ou folder.'
      });
    if (normalizedScope === 'folder') this.assertFolderExists(normalizedFolderId);

    const sortColumn =
      {
        name: 'files.original_name',
        size: 'files.size_bytes',
        createdAt: 'files.created_at',
        updatedAt: 'files.updated_at'
      }[sort] ?? 'files.updated_at';
    const direction = order === 'asc' ? 'ASC' : 'DESC';
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
    const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);
    const minimumSize = nonNegativeInteger(minSize, 'minSize');
    const maximumSize = nonNegativeInteger(maxSize, 'maxSize');
    if (minimumSize !== null && maximumSize !== null && minimumSize > maximumSize)
      throw new HttpError(422, 'VALIDATION_ERROR', 'Intervalo de tamanho inválido.', {
        minSize: 'O tamanho mínimo não pode ser maior que o máximo.'
      });
    const fromDate = dateBoundary(from, 'from');
    const toDate = dateBoundary(to, 'to', true);
    if (fromDate && toDate && fromDate > toDate)
      throw new HttpError(422, 'VALIDATION_ERROR', 'Intervalo de data inválido.', {
        from: 'A data inicial não pode ser posterior à data final.'
      });

    const conditions = [];
    const params = [];
    if (normalizedScope === 'folder') {
      if (normalizedFolderId === null) conditions.push('files.folder_id IS NULL');
      else {
        conditions.push('files.folder_id = ?');
        params.push(normalizedFolderId);
      }
    }
    if (search) {
      conditions.push("files.original_name LIKE ? ESCAPE '\\' COLLATE NOCASE");
      params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (fromDate) {
      conditions.push('files.updated_at >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('files.updated_at <= ?');
      params.push(toDate);
    }
    if (minimumSize !== null) {
      conditions.push('files.size_bytes >= ?');
      params.push(minimumSize);
    }
    if (maximumSize !== null) {
      conditions.push('files.size_bytes <= ?');
      params.push(maximumSize);
    }
    const categoryCondition = typeCondition(type);
    if (categoryCondition) {
      conditions.push(categoryCondition);
      if (type === 'document' || type === 'other') params.push(...DOCUMENT_TYPES);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = this.database
      .prepare(`SELECT COUNT(*) AS total FROM files ${where}`)
      .get(...params).total;
    const rows = this.database
      .prepare(
        `${folderPathCte()}
         SELECT files.*, COALESCE(folder_paths.path, '') AS folder_path
         FROM files
         LEFT JOIN folder_paths ON folder_paths.id = files.folder_id
         ${where}
         ORDER BY ${sortColumn} ${direction}, files.id ${direction}
         LIMIT ? OFFSET ?`
      )
      .all(...params, safeLimit, safeOffset);
    return {
      files: rows.map(toFile),
      total,
      limit: safeLimit,
      offset: safeOffset,
      scope: normalizedScope,
      folderId: normalizedScope === 'folder' ? normalizedFolderId : null
    };
  }

  get(id) {
    const file = toFile(
      this.database
        .prepare(
          `${folderPathCte()}
           SELECT files.*, COALESCE(folder_paths.path, '') AS folder_path
           FROM files
           LEFT JOIN folder_paths ON folder_paths.id = files.folder_id
           WHERE files.id = ?`
        )
        .get(validateId(id))
    );
    if (!file) throw new HttpError(404, 'FILE_NOT_FOUND', 'Arquivo não encontrado.');
    return file;
  }

  update(id, changes = {}) {
    const file = this.get(id);
    const originalName = Object.hasOwn(changes, 'originalName')
      ? validateOriginalName(changes.originalName)
      : file.originalName;
    const folderId = Object.hasOwn(changes, 'folderId')
      ? validateFolderId(changes.folderId)
      : file.folderId;
    this.assertFolderExists(folderId);
    this.assertNameAvailable(originalName, folderId, file.id);
    this.database
      .prepare(
        `UPDATE files
         SET original_name = ?, folder_id = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(originalName, folderId, nowIso(), file.id);
    return this.get(file.id);
  }

  uploadPolicy() {
    return this.driveSettingsService?.status() ?? {
      maxUploadBytes: this.maxUploadBytes,
      effectiveFreeBytes: null
    };
  }

  diskHasSpace(bytes) {
    try {
      const stats = statfsSync(this.filesDir);
      return stats.bavail * stats.bsize >= bytes;
    } catch {
      return false;
    }
  }

  assertStorageAvailable(bytes, policy) {
    if (policy.effectiveFreeBytes !== null) {
      if (bytes > policy.effectiveFreeBytes)
        throw new HttpError(507, 'INSUFFICIENT_STORAGE', 'Espaço insuficiente para o upload.');
      return;
    }
    if (!this.diskHasSpace(bytes))
      throw new HttpError(507, 'INSUFFICIENT_STORAGE', 'Espaço insuficiente para o upload.');
  }

  async upload(stream, { originalName, mimeType, contentLength, folderId = null }) {
    const name = validateOriginalName(originalName);
    const normalizedFolderId = validateFolderId(folderId);
    this.assertFolderExists(normalizedFolderId);
    this.assertNameAvailable(name, normalizedFolderId);
    const policy = this.uploadPolicy();
    const declaredLength = Number.parseInt(contentLength, 10);
    if (Number.isSafeInteger(declaredLength) && declaredLength > policy.maxUploadBytes)
      throw new HttpError(
        413,
        'FILE_TOO_LARGE',
        'O arquivo excede o limite permitido.'
      );
    if (Number.isSafeInteger(declaredLength) && declaredLength > 0)
      this.assertStorageAvailable(declaredLength, policy);

    const storageName = randomUUID();
    const temporaryPath = join(this.tempDir, storageName);
    const destinationPath = join(this.filesDir, storageName);
    let sizeBytes = 0;
    const counter = new Transform({
      transform: (chunk, _encoding, callback) => {
        sizeBytes += chunk.length;
        if (sizeBytes > policy.maxUploadBytes) {
          callback(
            new HttpError(413, 'FILE_TOO_LARGE', 'O arquivo excede o limite permitido.')
          );
          return;
        }
        try {
          this.assertStorageAvailable(sizeBytes, policy);
          callback(null, chunk);
        } catch (error) {
          callback(error);
        }
      }
    });
    try {
      await pipeline(
        stream,
        counter,
        createWriteStream(temporaryPath, { flags: 'wx' })
      );
      this.assertFolderExists(normalizedFolderId);
      this.assertNameAvailable(name, normalizedFolderId);
      await fs.rename(temporaryPath, destinationPath);
      const timestamp = nowIso();
      const result = this.database
        .prepare(
          `INSERT INTO files
           (storage_name, original_name, mime_type, size_bytes, folder_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          storageName,
          name,
          contentType(mimeType),
          sizeBytes,
          normalizedFolderId,
          timestamp,
          timestamp
        );
      return this.get(result.lastInsertRowid);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      await fs.rm(destinationPath, { force: true }).catch(() => {});
      if (error.code === 'ENOSPC')
        throw new HttpError(
          507,
          'INSUFFICIENT_STORAGE',
          'Espaço insuficiente para o upload.'
        );
      throw error;
    }
  }

  assertFolderExists(folderId) {
    if (folderId === null) return;
    const folder = this.database.prepare('SELECT id FROM folders WHERE id = ?').get(folderId);
    if (!folder) throw new HttpError(404, 'FOLDER_NOT_FOUND', 'Pasta não encontrada.');
  }

  assertNameAvailable(name, folderId, excludedFileId = null) {
    const duplicateFile = folderId === null
      ? this.database
          .prepare(
            `SELECT id FROM files
             WHERE folder_id IS NULL AND original_name = ? COLLATE NOCASE
               AND (? IS NULL OR id <> ?)`
          )
          .get(name, excludedFileId, excludedFileId)
      : this.database
          .prepare(
            `SELECT id FROM files
             WHERE folder_id = ? AND original_name = ? COLLATE NOCASE
               AND (? IS NULL OR id <> ?)`
          )
          .get(folderId, name, excludedFileId, excludedFileId);
    const duplicateFolder = folderId === null
      ? this.database
          .prepare(
            `SELECT id FROM folders
             WHERE parent_id IS NULL AND name = ? COLLATE NOCASE`
          )
          .get(name)
      : this.database
          .prepare(
            `SELECT id FROM folders
             WHERE parent_id = ? AND name = ? COLLATE NOCASE`
          )
          .get(folderId, name);
    if (duplicateFile || duplicateFolder)
      throw new HttpError(
        409,
        'FILE_NAME_CONFLICT',
        'Já existe um item com este nome neste local.',
        { originalName: 'Escolha outro nome para o arquivo.' }
      );
  }

  async open(id, preview = false) {
    const file = this.get(id);
    if (preview && !file.previewAvailable)
      throw new HttpError(
        415,
        'PREVIEW_UNSUPPORTED',
        'Este tipo de arquivo não possui preview.'
      );
    const path = join(
      this.filesDir,
      this.database.prepare('SELECT storage_name FROM files WHERE id = ?').get(file.id)
        .storage_name
    );
    try {
      await fs.access(path);
      return { file, path };
    } catch {
      throw new HttpError(404, 'FILE_NOT_FOUND', 'Arquivo não encontrado.');
    }
  }

  async remove(id) {
    const file = this.get(id);
    const row = this.database
      .prepare('SELECT storage_name FROM files WHERE id = ?')
      .get(file.id);
    await fs.rm(join(this.filesDir, row.storage_name), { force: true });
    this.database.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  }
}
