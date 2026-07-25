import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      totp_secret_encrypted TEXT NOT NULL,
      totp_enabled INTEGER NOT NULL DEFAULT 1,
      password_changed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recovery_codes (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL UNIQUE,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_hash TEXT NOT NULL,
      device_label TEXT NOT NULL,
      device_name TEXT,
      browser_name TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      idle_expires_at TEXT NOT NULL,
      absolute_expires_at TEXT NOT NULL,
      rotated_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS session_token_history (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL,
      invalidated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      storage_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shortcuts (
      id INTEGER PRIMARY KEY,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      group_name TEXT NOT NULL DEFAULT '',
      icon_key TEXT NOT NULL DEFAULT 'link',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      output TEXT NOT NULL DEFAULT '',
      exit_code INTEGER,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS metric_samples (
      id INTEGER PRIMARY KEY,
      collected_at TEXT NOT NULL,
      source_type TEXT NOT NULL,
      status TEXT NOT NULL,
      metrics_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS session_token_history_token_hash_idx ON session_token_history(token_hash);
    CREATE INDEX IF NOT EXISTS recovery_codes_user_id_idx ON recovery_codes(user_id);
    CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS files_updated_at_idx ON files(updated_at DESC);
    CREATE INDEX IF NOT EXISTS shortcuts_group_position_idx ON shortcuts(group_name, position);
    CREATE INDEX IF NOT EXISTS automation_runs_automation_idx ON automation_runs(automation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS metric_samples_collected_at_idx ON metric_samples(collected_at DESC);
  `);

  // Bancos criados antes destes campos recebem uma migração aditiva e segura.
  ensureColumn(database, 'sessions', 'device_name', 'TEXT');
  ensureColumn(database, 'sessions', 'browser_name', 'TEXT');
  ensureColumn(database, 'sessions', 'ip_address', 'TEXT');
  ensureColumn(database, 'sessions', 'user_agent', 'TEXT');

  return database;
}
