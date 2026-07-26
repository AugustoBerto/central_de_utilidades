import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/database.js';

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('migração do esquema do Drive', () => {
  it('mantém arquivos de bancos antigos na raiz e adiciona as novas estruturas', () => {
    const directory = mkdtempSync(join(tmpdir(), 'painel-drive-schema-'));
    directories.push(directory);
    const path = join(directory, 'app.sqlite');
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE files (
        id INTEGER PRIMARY KEY,
        storage_name TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO files
        (storage_name, original_name, mime_type, size_bytes, created_at, updated_at)
      VALUES
        ('legacy-storage', 'legado.txt', 'text/plain', 6, '2026-01-01', '2026-01-01');
    `);
    legacy.close();

    const database = openDatabase(path);
    try {
      expect(database.prepare('PRAGMA table_info(files)').all().map((column) => column.name))
        .toContain('folder_id');
      expect(database.prepare('SELECT folder_id FROM files WHERE id = 1').get()).toEqual({
        folder_id: null
      });
      expect(
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('folders', 'drive_settings') ORDER BY name")
          .all()
          .map((row) => row.name)
      ).toEqual(['drive_settings', 'folders']);
      expect(database.prepare('PRAGMA foreign_key_list(files)').all()).toEqual(
        expect.arrayContaining([expect.objectContaining({ table: 'folders', from: 'folder_id' })])
      );
    } finally {
      database.close();
    }
  });
});
