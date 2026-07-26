import { HttpError } from './errors.js';

function nowIso() {
  return new Date().toISOString();
}

function toFolder(row) {
  return (
    row && {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  );
}

function validateId(id) {
  const parsed = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new HttpError(404, 'FOLDER_NOT_FOUND', 'Pasta não encontrada.');
  return parsed;
}

function validateParentId(parentId) {
  return parentId === null || parentId === undefined ? null : validateId(parentId);
}

function validateName(name) {
  if (typeof name !== 'string')
    throw new HttpError(422, 'VALIDATION_ERROR', 'Nome de pasta inválido.', {
      name: 'Informe um nome de pasta válido.'
    });
  const normalized = name.trim();
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.length > 255 ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    Array.from(normalized).some((character) => character.charCodeAt(0) < 32)
  )
    throw new HttpError(422, 'VALIDATION_ERROR', 'Nome de pasta inválido.', {
      name: 'Use até 255 caracteres, sem barras ou caracteres de controle.'
    });
  return normalized;
}

export class FolderService {
  constructor(database) {
    this.database = database;
  }

  get(id) {
    const folder = toFolder(
      this.database.prepare('SELECT * FROM folders WHERE id = ?').get(validateId(id))
    );
    if (!folder) throw new HttpError(404, 'FOLDER_NOT_FOUND', 'Pasta não encontrada.');
    return folder;
  }

  list(parentId = null) {
    const normalizedParentId = validateParentId(parentId);
    const rows = normalizedParentId === null
      ? this.database
          .prepare(
            'SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name COLLATE NOCASE, id'
          )
          .all()
      : this.database
          .prepare(
            'SELECT * FROM folders WHERE parent_id = ? ORDER BY name COLLATE NOCASE, id'
          )
          .all(normalizedParentId);
    return rows.map(toFolder);
  }

  path(id) {
    const path = [];
    const visited = new Set();
    let current = this.get(id);
    while (current) {
      if (visited.has(current.id))
        throw new HttpError(500, 'FOLDER_CYCLE', 'A hierarquia de pastas está inconsistente.');
      visited.add(current.id);
      path.unshift(current);
      current = current.parentId === null ? null : this.get(current.parentId);
    }
    return path;
  }

  create({ name, parentId = null } = {}) {
    const normalizedName = validateName(name);
    const normalizedParentId = validateParentId(parentId);
    this.assertParentExists(normalizedParentId);
    this.assertNameAvailable(normalizedName, normalizedParentId);
    const timestamp = nowIso();
    const result = this.database
      .prepare(
        'INSERT INTO folders (parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(normalizedParentId, normalizedName, timestamp, timestamp);
    return this.get(result.lastInsertRowid);
  }

  update(id, changes = {}) {
    const folder = this.get(id);
    const name = Object.hasOwn(changes, 'name') ? validateName(changes.name) : folder.name;
    const parentId = Object.hasOwn(changes, 'parentId')
      ? validateParentId(changes.parentId)
      : folder.parentId;
    this.assertParentExists(parentId);
    this.assertMoveAllowed(folder.id, parentId);
    this.assertNameAvailable(name, parentId, folder.id);
    this.database
      .prepare('UPDATE folders SET parent_id = ?, name = ?, updated_at = ? WHERE id = ?')
      .run(parentId, name, nowIso(), folder.id);
    return this.get(folder.id);
  }

  remove(id) {
    const folder = this.get(id);
    const children = this.database
      .prepare('SELECT COUNT(*) AS total FROM folders WHERE parent_id = ?')
      .get(folder.id).total;
    const files = this.database
      .prepare('SELECT COUNT(*) AS total FROM files WHERE folder_id = ?')
      .get(folder.id).total;
    if (children || files)
      throw new HttpError(
        409,
        'FOLDER_NOT_EMPTY',
        'Remova ou mova o conteúdo antes de excluir esta pasta.'
      );
    this.database.prepare('DELETE FROM folders WHERE id = ?').run(folder.id);
  }

  assertParentExists(parentId) {
    if (parentId === null) return;
    this.get(parentId);
  }

  assertMoveAllowed(folderId, parentId) {
    if (parentId === null) return;
    const invalid = this.database
      .prepare(
        `WITH RECURSIVE subtree(id) AS (
           SELECT id FROM folders WHERE id = ?
           UNION ALL
           SELECT folders.id
           FROM folders
           JOIN subtree ON folders.parent_id = subtree.id
         )
         SELECT id FROM subtree WHERE id = ?`
      )
      .get(folderId, parentId);
    if (invalid)
      throw new HttpError(
        422,
        'FOLDER_CYCLE',
        'Uma pasta não pode ser movida para dentro dela mesma ou de suas subpastas.'
      );
  }

  assertNameAvailable(name, parentId, excludedId = null) {
    const duplicate = parentId === null
      ? this.database
          .prepare(
            `SELECT id FROM folders
             WHERE parent_id IS NULL AND name = ? COLLATE NOCASE
               AND (? IS NULL OR id <> ?)`
          )
          .get(name, excludedId, excludedId)
      : this.database
          .prepare(
            `SELECT id FROM folders
             WHERE parent_id = ? AND name = ? COLLATE NOCASE
               AND (? IS NULL OR id <> ?)`
          )
          .get(parentId, name, excludedId, excludedId);
    if (duplicate)
      throw new HttpError(
        409,
        'FOLDER_NAME_CONFLICT',
        'Já existe uma pasta com este nome neste local.',
        { name: 'Escolha outro nome para a pasta.' }
      );
  }
}
