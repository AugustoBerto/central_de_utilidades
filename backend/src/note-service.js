import { HttpError } from './errors.js';

const TITLE_MAX_LENGTH = 160;
const CONTENT_MAX_LENGTH = 100_000;

function nowIso() {
  return new Date().toISOString();
}

function toNote(row) {
  return (
    row && {
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  );
}

function validate(input, partial = false) {
  const note = {};
  if (!partial || Object.hasOwn(input, 'title')) {
    const title = input.title ?? '';
    if (typeof title !== 'string' || title.trim().length > TITLE_MAX_LENGTH)
      throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos indicados.', {
        title: `Use até ${TITLE_MAX_LENGTH} caracteres.`
      });
    note.title = title.trim();
  }
  if (!partial || Object.hasOwn(input, 'content')) {
    if (
      typeof input.content !== 'string' ||
      !input.content.trim() ||
      input.content.length > CONTENT_MAX_LENGTH
    )
      throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos indicados.', {
        content: `Use de 1 a ${CONTENT_MAX_LENGTH} caracteres.`
      });
    note.content = input.content;
  }
  return note;
}

export class NoteService {
  constructor(database) {
    this.database = database;
  }

  list(query = '') {
    const search = String(query).trim();
    const rows = search
      ? this.database
          .prepare(
            "SELECT * FROM notes WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' ORDER BY updated_at DESC"
          )
          .all(...Array(2).fill(`%${search.replace(/[\\%_]/g, '\\$&')}%`))
      : this.database.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all();
    return rows.map(toNote);
  }

  get(id) {
    const note = toNote(
      this.database.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    );
    if (!note) throw new HttpError(404, 'NOTE_NOT_FOUND', 'Nota não encontrada.');
    return note;
  }

  create(input) {
    const note = validate(input);
    const timestamp = nowIso();
    const result = this.database
      .prepare(
        'INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(note.title, note.content, timestamp, timestamp);
    return this.get(result.lastInsertRowid);
  }

  update(id, input) {
    if (!input.updatedAt)
      throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos indicados.', {
        updatedAt: 'Informe a versão da nota que está sendo editada.'
      });
    const existing = this.get(id);
    if (existing.updatedAt !== input.updatedAt)
      throw new HttpError(
        409,
        'NOTE_CONFLICT',
        'A nota foi alterada em outro contexto.'
      );
    const next = { ...existing, ...validate(input, true) };
    const timestamp = nowIso();
    this.database
      .prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?')
      .run(next.title, next.content, timestamp, id);
    return this.get(id);
  }

  remove(id) {
    if (this.database.prepare('DELETE FROM notes WHERE id = ?').run(id).changes !== 1)
      throw new HttpError(404, 'NOTE_NOT_FOUND', 'Nota não encontrada.');
  }
}
