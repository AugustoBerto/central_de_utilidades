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
      fileName: 'Informe um nome de arquivo válido com até 255 caracteres.'
    });
  return name.trim();
}

function contentType(value) {
  return typeof value === 'string' && value
    ? value.split(';')[0].trim().toLowerCase()
    : 'application/octet-stream';
}

export class FileService {
  constructor(database, { filesDir, maxUploadBytes, driveSettingsService = null }) {
    this.database = database;
    this.filesDir = resolve(filesDir);
    this.tempDir = join(filesDir, '.tmp');
    this.maxUploadBytes = maxUploadBytes;
    this.driveSettingsService = driveSettingsService;
    mkdirSync(this.tempDir, { recursive: true });
  }

  list({
    query = '',
    sort = 'updatedAt',
    order = 'desc',
    limit = 50,
    offset = 0
  } = {}) {
    const search = String(query).trim();
    const sortColumn =
      { name: 'original_name', size: 'size_bytes', updatedAt: 'updated_at' }[sort] ??
      'updated_at';
    const direction = order === 'asc' ? 'ASC' : 'DESC';
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
    const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);
    const condition = search ? "WHERE original_name LIKE ? ESCAPE '\\'" : '';
    const params = search ? [`%${search.replace(/[\\%_]/g, '\\$&')}%`] : [];
    const total = this.database
      .prepare(`SELECT COUNT(*) AS total FROM files ${condition}`)
      .get(...params).total;
    const rows = this.database
      .prepare(
        `SELECT * FROM files ${condition} ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`
      )
      .all(...params, safeLimit, safeOffset);
    return { files: rows.map(toFile), total, limit: safeLimit, offset: safeOffset };
  }

  get(id) {
    const file = toFile(
      this.database.prepare('SELECT * FROM files WHERE id = ?').get(validateId(id))
    );
    if (!file) throw new HttpError(404, 'FILE_NOT_FOUND', 'Arquivo não encontrado.');
    return file;
  }

  uploadLimit() {
    return this.driveSettingsService?.get().maxUploadBytes ?? this.maxUploadBytes;
  }

  diskHasSpace(bytes) {
    try {
      const stats = statfsSync(this.filesDir);
      return stats.bavail * stats.bsize >= bytes;
    } catch {
      return false;
    }
  }

  assertStorageAvailable(bytes) {
    if (this.driveSettingsService) {
      this.driveSettingsService.assertUploadAllowed(bytes);
      return;
    }
    if (!this.diskHasSpace(bytes))
      throw new HttpError(507, 'INSUFFICIENT_STORAGE', 'Espaço insuficiente para o upload.');
  }

  async upload(stream, { originalName, mimeType, contentLength }) {
    const name = validateOriginalName(originalName);
    const declaredLength = Number.parseInt(contentLength, 10);
    if (Number.isSafeInteger(declaredLength) && declaredLength > this.uploadLimit())
      throw new HttpError(
        413,
        'FILE_TOO_LARGE',
        'O arquivo excede o limite permitido.'
      );
    if (Number.isSafeInteger(declaredLength) && declaredLength > 0)
      this.assertStorageAvailable(declaredLength);

    const storageName = randomUUID();
    const temporaryPath = join(this.tempDir, storageName);
    const destinationPath = join(this.filesDir, storageName);
    let sizeBytes = 0;
    const counter = new Transform({
      transform: (chunk, _encoding, callback) => {
        sizeBytes += chunk.length;
        if (sizeBytes > this.uploadLimit()) {
          callback(
            new HttpError(413, 'FILE_TOO_LARGE', 'O arquivo excede o limite permitido.')
          );
          return;
        }
        try {
          this.assertStorageAvailable(sizeBytes);
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
      await fs.rename(temporaryPath, destinationPath);
      const timestamp = nowIso();
      const result = this.database
        .prepare(
          `INSERT INTO files
           (storage_name, original_name, mime_type, size_bytes, folder_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`
        )
        .run(storageName, name, contentType(mimeType), sizeBytes, timestamp, timestamp);
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
