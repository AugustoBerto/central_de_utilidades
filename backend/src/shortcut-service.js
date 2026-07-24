import { HttpError } from './errors.js';

const ICON_KEYS = new Set([
  'book-open',
  'folder',
  'globe',
  'link',
  'server',
  'shield',
  'terminal',
  'zap'
]);

function nowIso() {
  return new Date().toISOString();
}

function toShortcut(row) {
  return (
    row && {
      id: row.id,
      label: row.label,
      url: row.url,
      groupName: row.group_name,
      iconKey: row.icon_key,
      isPinned: Boolean(row.is_pinned),
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  );
}

function validate(input, { partial = false, allowHttp = false } = {}) {
  const shortcut = {};
  if (!partial || Object.hasOwn(input, 'label')) {
    if (
      typeof input.label !== 'string' ||
      !input.label.trim() ||
      input.label.trim().length > 80
    )
      throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos indicados.', {
        label: 'Use de 1 a 80 caracteres.'
      });
    shortcut.label = input.label.trim();
  }
  if (!partial || Object.hasOwn(input, 'url')) {
    try {
      const url = new URL(input.url);
      if (
        !['https:', ...(allowHttp ? ['http:'] : [])].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password
      )
        throw new Error();
      shortcut.url = url.toString();
    } catch {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos indicados.', {
        url: 'Use uma URL HTTPS válida.'
      });
    }
  }
  if (!partial || Object.hasOwn(input, 'groupName')) {
    const groupName = input.groupName ?? '';
    if (typeof groupName !== 'string' || groupName.trim().length > 80)
      throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos indicados.', {
        groupName: 'Use até 80 caracteres.'
      });
    shortcut.groupName = groupName.trim();
  }
  if (!partial || Object.hasOwn(input, 'iconKey')) {
    const iconKey = input.iconKey ?? 'link';
    if (!ICON_KEYS.has(iconKey))
      throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos indicados.', {
        iconKey: 'Ícone inválido.'
      });
    shortcut.iconKey = iconKey;
  }
  if (!partial || Object.hasOwn(input, 'isPinned')) {
    if (typeof input.isPinned !== 'boolean')
      throw new HttpError(422, 'VALIDATION_ERROR', 'Revise os campos indicados.', {
        isPinned: 'Informe verdadeiro ou falso.'
      });
    shortcut.isPinned = input.isPinned;
  }
  return shortcut;
}

export class ShortcutService {
  constructor(database, { allowHttpShortcuts }) {
    this.database = database;
    this.allowHttpShortcuts = allowHttpShortcuts;
  }

  list() {
    return this.database
      .prepare(
        'SELECT * FROM shortcuts ORDER BY group_name COLLATE NOCASE, position, label COLLATE NOCASE'
      )
      .all()
      .map(toShortcut);
  }

  pinned(limit = 3) {
    return this.database
      .prepare(
        'SELECT * FROM shortcuts WHERE is_pinned = 1 ORDER BY position, updated_at DESC, id DESC LIMIT ?'
      )
      .all(Math.min(Math.max(Number(limit) || 3, 1), 3))
      .map(toShortcut);
  }

  get(id) {
    const shortcut = toShortcut(
      this.database.prepare('SELECT * FROM shortcuts WHERE id = ?').get(id)
    );
    if (!shortcut)
      throw new HttpError(404, 'SHORTCUT_NOT_FOUND', 'Atalho não encontrado.');
    return shortcut;
  }

  create(input) {
    const shortcut = validate(input, { allowHttp: this.allowHttpShortcuts });
    const timestamp = nowIso();
    const position =
      this.database
        .prepare(
          'SELECT COALESCE(MAX(position), -1) AS position FROM shortcuts WHERE group_name = ?'
        )
        .get(shortcut.groupName).position + 1;
    const result = this.database
      .prepare(
        'INSERT INTO shortcuts (label, url, group_name, icon_key, is_pinned, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        shortcut.label,
        shortcut.url,
        shortcut.groupName,
        shortcut.iconKey,
        Number(shortcut.isPinned),
        position,
        timestamp,
        timestamp
      );
    return this.get(result.lastInsertRowid);
  }

  update(id, input) {
    const existing = this.get(id);
    const next = {
      ...existing,
      ...validate(input, { partial: true, allowHttp: this.allowHttpShortcuts })
    };
    const timestamp = nowIso();
    this.database
      .prepare(
        'UPDATE shortcuts SET label = ?, url = ?, group_name = ?, icon_key = ?, is_pinned = ?, updated_at = ? WHERE id = ?'
      )
      .run(
        next.label,
        next.url,
        next.groupName,
        next.iconKey,
        Number(next.isPinned),
        timestamp,
        id
      );
    if (Number.isInteger(input.position)) this.move(id, input.position, next.groupName);
    return this.get(id);
  }

  move(id, targetPosition, groupName) {
    const items = this.database
      .prepare('SELECT id FROM shortcuts WHERE group_name = ? ORDER BY position, id')
      .all(groupName)
      .map((item) => item.id);
    const currentIndex = items.indexOf(Number(id));
    if (currentIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(targetPosition, items.length - 1));
    items.splice(currentIndex, 1);
    items.splice(targetIndex, 0, Number(id));
    const update = this.database.prepare(
      'UPDATE shortcuts SET position = ?, updated_at = ? WHERE id = ?'
    );
    const timestamp = nowIso();
    this.database.transaction(() =>
      items.forEach((itemId, position) => update.run(position, timestamp, itemId))
    )();
  }

  remove(id) {
    if (
      this.database.prepare('DELETE FROM shortcuts WHERE id = ?').run(id).changes !== 1
    )
      throw new HttpError(404, 'SHORTCUT_NOT_FOUND', 'Atalho não encontrado.');
  }
}
