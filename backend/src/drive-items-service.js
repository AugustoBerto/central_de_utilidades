import { randomUUID } from 'node:crypto';
import { mkdirSync, promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import { HttpError } from './errors.js';

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
const MAX_BATCH_ITEMS = 100;

function nowIso() {
  return new Date().toISOString();
}

function validateId(id, kind) {
  const parsed = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new HttpError(422, 'VALIDATION_ERROR', 'Item inválido.', {
      items: `Informe um identificador válido para ${kind === 'folder' ? 'a pasta' : 'o arquivo'}.`
    });
  return parsed;
}

function validateFolderId(folderId) {
  if (folderId === null || folderId === undefined || folderId === '') return null;
  const parsed = Number.parseInt(folderId, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new HttpError(422, 'VALIDATION_ERROR', 'Pasta de destino inválida.', {
      destinationFolderId: 'Informe uma pasta válida.'
    });
  return parsed;
}

function validateBatchItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BATCH_ITEMS)
    throw new HttpError(422, 'VALIDATION_ERROR', 'Seleção de itens inválida.', {
      items: `Selecione entre 1 e ${MAX_BATCH_ITEMS} itens.`
    });

  const seen = new Set();
  return items.map((item) => {
    const kind = item?.kind;
    if (!['file', 'folder'].includes(kind))
      throw new HttpError(422, 'VALIDATION_ERROR', 'Tipo de item inválido.', {
        items: 'Use file ou folder.'
      });
    const id = validateId(item.id, kind);
    const key = `${kind}:${id}`;
    if (seen.has(key))
      throw new HttpError(422, 'VALIDATION_ERROR', 'A seleção contém itens duplicados.', {
        items: 'Remova itens duplicados da seleção.'
      });
    seen.add(key);
    return { kind, id };
  });
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

function categoryCondition(type) {
  if (type === null || type === undefined || type === '' || type === 'all') return null;
  if (type === 'folder') return { sql: "kind = 'folder'", params: [] };
  if (type === 'image') return { sql: "kind = 'file' AND mime_type LIKE 'image/%'", params: [] };
  if (type === 'audio') return { sql: "kind = 'file' AND mime_type LIKE 'audio/%'", params: [] };
  if (type === 'video') return { sql: "kind = 'file' AND mime_type LIKE 'video/%'", params: [] };
  const placeholders = DOCUMENT_TYPES.map(() => '?').join(', ');
  const document = `(mime_type LIKE 'text/%' OR mime_type IN (${placeholders}))`;
  if (type === 'document')
    return { sql: `kind = 'file' AND ${document}`, params: DOCUMENT_TYPES };
  if (type === 'other')
    return {
      sql: `kind = 'file' AND mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'audio/%' AND mime_type NOT LIKE 'video/%' AND NOT ${document}`,
      params: DOCUMENT_TYPES
    };
  throw new HttpError(422, 'VALIDATION_ERROR', 'Tipo de item inválido.', {
    type: 'Use folder, image, audio, video, document, other ou all.'
  });
}

function toItem(row) {
  return {
    kind: row.kind,
    id: row.id,
    name: row.name,
    folderId: row.folder_id ?? null,
    folderPath: row.folder_path ?? '',
    itemPath: row.item_path,
    mimeType: row.mime_type,
    typeLabel: row.type_label,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    previewAvailable: Boolean(row.preview_available)
  };
}

function itemCte() {
  return `WITH RECURSIVE folder_paths(id, path) AS (
    SELECT id, name FROM folders WHERE parent_id IS NULL
    UNION ALL
    SELECT folders.id, folder_paths.path || ' / ' || folders.name
    FROM folders
    JOIN folder_paths ON folders.parent_id = folder_paths.id
  ), drive_items AS (
    SELECT
      'folder' AS kind,
      folders.id,
      folders.name,
      folders.parent_id AS folder_id,
      COALESCE(parent_paths.path, '') AS folder_path,
      CASE
        WHEN parent_paths.path IS NULL THEN folders.name
        ELSE parent_paths.path || ' / ' || folders.name
      END AS item_path,
      NULL AS mime_type,
      'Pasta' AS type_label,
      NULL AS size_bytes,
      folders.created_at,
      folders.updated_at,
      0 AS preview_available,
      0 AS kind_order
    FROM folders
    LEFT JOIN folder_paths AS parent_paths ON parent_paths.id = folders.parent_id

    UNION ALL

    SELECT
      'file' AS kind,
      files.id,
      files.original_name AS name,
      files.folder_id,
      COALESCE(folder_paths.path, '') AS folder_path,
      CASE
        WHEN folder_paths.path IS NULL THEN files.original_name
        ELSE folder_paths.path || ' / ' || files.original_name
      END AS item_path,
      files.mime_type,
      CASE
        WHEN files.mime_type = 'application/pdf' THEN 'PDF'
        WHEN files.mime_type LIKE 'image/%' THEN 'Imagem'
        WHEN files.mime_type LIKE 'audio/%' THEN 'Áudio'
        WHEN files.mime_type LIKE 'video/%' THEN 'Vídeo'
        WHEN files.mime_type LIKE 'text/%' THEN 'Texto'
        ELSE 'Arquivo'
      END AS type_label,
      files.size_bytes,
      files.created_at,
      files.updated_at,
      CASE
        WHEN files.mime_type IN (
          'application/pdf', 'image/gif', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'
        ) THEN 1
        ELSE 0
      END AS preview_available,
      1 AS kind_order
    FROM files
    LEFT JOIN folder_paths ON folder_paths.id = files.folder_id
  )`;
}

export class DriveItemsService {
  constructor(database, { filesDir, fileService, folderService }) {
    this.database = database;
    this.filesDir = resolve(filesDir);
    this.fileService = fileService;
    this.folderService = folderService;
    this.trashDir = join(this.filesDir, '.trash');
    mkdirSync(this.trashDir, { recursive: true });
  }

  list({
    folderId = null,
    query = '',
    scope,
    sort = 'name',
    order = 'asc',
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

    const direction = order === 'desc' ? 'DESC' : 'ASC';
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
      if (normalizedFolderId === null) conditions.push('folder_id IS NULL');
      else {
        conditions.push('folder_id = ?');
        params.push(normalizedFolderId);
      }
    }
    if (search) {
      conditions.push("name LIKE ? ESCAPE '\\' COLLATE NOCASE");
      params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (fromDate) {
      conditions.push('updated_at >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('updated_at <= ?');
      params.push(toDate);
    }
    if (minimumSize !== null) {
      conditions.push("kind = 'file' AND size_bytes >= ?");
      params.push(minimumSize);
    }
    if (maximumSize !== null) {
      conditions.push("kind = 'file' AND size_bytes <= ?");
      params.push(maximumSize);
    }
    const category = categoryCondition(type);
    if (category) {
      conditions.push(category.sql);
      params.push(...category.params);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderExpression = {
      name: `name COLLATE NOCASE ${direction}`,
      type: `type_label COLLATE NOCASE ${direction}, name COLLATE NOCASE ASC`,
      createdAt: `created_at ${direction}, name COLLATE NOCASE ASC`,
      updatedAt: `updated_at ${direction}, name COLLATE NOCASE ASC`,
      size: `CASE WHEN kind = 'folder' THEN name END COLLATE NOCASE ASC, size_bytes ${direction}, name COLLATE NOCASE ASC`
    }[sort] ?? `name COLLATE NOCASE ${direction}`;

    const total = this.database
      .prepare(`${itemCte()} SELECT COUNT(*) AS total FROM drive_items ${where}`)
      .get(...params).total;
    const rows = this.database
      .prepare(
        `${itemCte()}
         SELECT * FROM drive_items
         ${where}
         ORDER BY kind_order ASC, ${orderExpression}, id ASC
         LIMIT ? OFFSET ?`
      )
      .all(...params, safeLimit, safeOffset);
    return {
      items: rows.map(toItem),
      total,
      limit: safeLimit,
      offset: safeOffset,
      scope: normalizedScope,
      folderId: normalizedScope === 'folder' ? normalizedFolderId : null,
      sort,
      order: direction.toLowerCase()
    };
  }

  move({ items, destinationFolderId = null } = {}) {
    const selection = validateBatchItems(items);
    const destination = validateFolderId(destinationFolderId);
    this.assertFolderExists(destination);
    const hydrated = selection.map((item) => this.hydrate(item));
    this.assertNoNestedFolders(hydrated);
    this.assertMoveNamesAvailable(hydrated, destination);
    for (const item of hydrated) {
      if (item.kind === 'folder') this.folderService.assertMoveAllowed(item.id, destination);
    }

    const timestamp = nowIso();
    const apply = this.database.transaction(() => {
      for (const item of hydrated) {
        if (item.kind === 'folder')
          this.database
            .prepare('UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?')
            .run(destination, timestamp, item.id);
        else
          this.database
            .prepare('UPDATE files SET folder_id = ?, updated_at = ? WHERE id = ?')
            .run(destination, timestamp, item.id);
      }
    });
    apply();
    return { moved: hydrated.length, destinationFolderId: destination };
  }

  async remove({ items } = {}) {
    const selection = validateBatchItems(items);
    const hydrated = selection.map((item) => this.hydrate(item, true));
    for (const item of hydrated.filter((candidate) => candidate.kind === 'folder'))
      this.assertFolderEmpty(item.id);

    const staged = [];
    try {
      for (const item of hydrated.filter((candidate) => candidate.kind === 'file')) {
        const source = join(this.filesDir, item.storageName);
        const temporary = join(this.trashDir, randomUUID());
        try {
          await fs.rename(source, temporary);
          staged.push({ source, temporary });
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }

      const apply = this.database.transaction(() => {
        for (const item of hydrated.filter((candidate) => candidate.kind === 'file'))
          this.database.prepare('DELETE FROM files WHERE id = ?').run(item.id);
        for (const item of hydrated.filter((candidate) => candidate.kind === 'folder'))
          this.database.prepare('DELETE FROM folders WHERE id = ?').run(item.id);
      });
      apply();
    } catch (error) {
      for (const item of staged.reverse())
        await fs.rename(item.temporary, item.source).catch(() => {});
      throw error;
    }

    await Promise.all(staged.map((item) => fs.rm(item.temporary, { force: true }).catch(() => {})));
    return { deleted: hydrated.length };
  }

  hydrate(item, includeStorageName = false) {
    if (item.kind === 'folder') {
      const row = this.database
        .prepare('SELECT id, name, parent_id FROM folders WHERE id = ?')
        .get(item.id);
      if (!row) throw new HttpError(404, 'FOLDER_NOT_FOUND', 'Pasta não encontrada.');
      return { kind: 'folder', id: row.id, name: row.name, folderId: row.parent_id };
    }
    const columns = includeStorageName
      ? 'id, original_name, folder_id, storage_name'
      : 'id, original_name, folder_id';
    const row = this.database.prepare(`SELECT ${columns} FROM files WHERE id = ?`).get(item.id);
    if (!row) throw new HttpError(404, 'FILE_NOT_FOUND', 'Arquivo não encontrado.');
    return {
      kind: 'file',
      id: row.id,
      name: row.original_name,
      folderId: row.folder_id,
      ...(includeStorageName ? { storageName: row.storage_name } : {})
    };
  }

  assertFolderExists(folderId) {
    if (folderId === null) return;
    if (!this.database.prepare('SELECT id FROM folders WHERE id = ?').get(folderId))
      throw new HttpError(404, 'FOLDER_NOT_FOUND', 'Pasta não encontrada.');
  }

  assertNoNestedFolders(items) {
    const selectedFolders = new Set(
      items.filter((item) => item.kind === 'folder').map((item) => item.id)
    );
    for (const folderId of selectedFolders) {
      const path = this.folderService.path(folderId);
      if (path.slice(0, -1).some((folder) => selectedFolders.has(folder.id)))
        throw new HttpError(
          422,
          'NESTED_FOLDER_SELECTION',
          'Não selecione uma pasta e uma subpasta ao mesmo tempo para mover.'
        );
    }
  }

  assertMoveNamesAvailable(items, destinationFolderId) {
    const names = new Set();
    for (const item of items) {
      const normalized = item.name.toLocaleLowerCase('pt-BR');
      if (names.has(normalized))
        throw new HttpError(
          409,
          'ITEM_NAME_CONFLICT',
          'A seleção contém itens com o mesmo nome.'
        );
      names.add(normalized);
    }

    const selectedFiles = new Set(items.filter((item) => item.kind === 'file').map((item) => item.id));
    const selectedFolders = new Set(
      items.filter((item) => item.kind === 'folder').map((item) => item.id)
    );
    for (const item of items) {
      const duplicateFile = destinationFolderId === null
        ? this.database
            .prepare(
              'SELECT id FROM files WHERE folder_id IS NULL AND original_name = ? COLLATE NOCASE'
            )
            .get(item.name)
        : this.database
            .prepare(
              'SELECT id FROM files WHERE folder_id = ? AND original_name = ? COLLATE NOCASE'
            )
            .get(destinationFolderId, item.name);
      const duplicateFolder = destinationFolderId === null
        ? this.database
            .prepare('SELECT id FROM folders WHERE parent_id IS NULL AND name = ? COLLATE NOCASE')
            .get(item.name)
        : this.database
            .prepare('SELECT id FROM folders WHERE parent_id = ? AND name = ? COLLATE NOCASE')
            .get(destinationFolderId, item.name);
      const fileConflict = duplicateFile && !selectedFiles.has(duplicateFile.id);
      const folderConflict = duplicateFolder && !selectedFolders.has(duplicateFolder.id);
      if (fileConflict || folderConflict)
        throw new HttpError(
          409,
          'ITEM_NAME_CONFLICT',
          'Já existe um item com este nome no destino.'
        );
    }
  }

  assertFolderEmpty(folderId) {
    const childFolders = this.database
      .prepare('SELECT COUNT(*) AS total FROM folders WHERE parent_id = ?')
      .get(folderId).total;
    const childFiles = this.database
      .prepare('SELECT COUNT(*) AS total FROM files WHERE folder_id = ?')
      .get(folderId).total;
    if (childFolders || childFiles)
      throw new HttpError(
        409,
        'FOLDER_NOT_EMPTY',
        'Remova ou mova o conteúdo antes de excluir esta pasta.'
      );
  }
}
