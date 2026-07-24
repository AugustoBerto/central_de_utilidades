import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generate } from 'otplib';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthService } from '../src/auth-service.js';
import { openDatabase } from '../src/database.js';
import { FileService } from '../src/file-service.js';
import { NoteService } from '../src/note-service.js';
import { ShortcutService } from '../src/shortcut-service.js';
import { SystemMetricsService } from '../src/system-metrics-service.js';

const directories = [];
const sameOrigin = 'http://127.0.0.1';

function createTestApp() {
  const directory = mkdtempSync(join(tmpdir(), 'painel-shortcuts-'));
  const config = {
    databasePath: join(directory, 'app.sqlite'),
    filesDir: join(directory, 'files'),
    maxUploadBytes: 10,
    allowHttpShortcuts: false,
    bootstrapToken: 'bootstrap-test-token',
    encryptionKey: 'test-encryption-key',
    sessionCookieName: 'panel_session',
    sessionIdleDays: 180,
    sessionAbsoluteDays: 365,
    sessionRotationHours: 24,
    cookieSecure: false
  };
  directories.push(directory);
  const database = openDatabase(config.databasePath);
  const authService = new AuthService(database, config);
  return createApp({
    authService,
    fileService: new FileService(database, config),
    noteService: new NoteService(database),
    shortcutService: new ShortcutService(database, config),
    systemMetricsService: new SystemMetricsService({
      mode: 'disabled',
      filesDir: config.filesDir
    }),
    config,
    environment: 'test'
  });
}

async function login(app) {
  const setup = await request(app)
    .post('/api/setup/initialize')
    .set('Origin', sameOrigin)
    .send({
      bootstrapToken: 'bootstrap-test-token',
      username: 'admin',
      password: 'uma-senha-forte-de-teste'
    });
  const secret = new URL(setup.body.totpUri).searchParams.get('secret');
  const response = await request(app)
    .post('/api/auth/login')
    .set('Origin', sameOrigin)
    .send({
      username: 'admin',
      password: 'uma-senha-forte-de-teste',
      totpCode: await generate({ secret })
    });
  return {
    cookie: response.headers['set-cookie'][0],
    csrfToken: response.body.csrfToken
  };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('atalhos', () => {
  it('cria, reordena e exclui, rejeitando protocolo não permitido', async () => {
    const app = createTestApp();
    const session = await login(app);
    const headers = {
      Cookie: session.cookie,
      Origin: sameOrigin,
      'X-CSRF-Token': session.csrfToken
    };
    const invalid = await request(app).post('/api/shortcuts').set(headers).send({
      label: 'Inseguro',
      url: 'http://inseguro.test',
      groupName: '',
      iconKey: 'link',
      isPinned: false
    });
    expect(invalid.status).toBe(422);
    const first = await request(app).post('/api/shortcuts').set(headers).send({
      label: 'Docs',
      url: 'https://docs.example.test',
      groupName: 'Trabalho',
      iconKey: 'book-open',
      isPinned: true
    });
    const second = await request(app).post('/api/shortcuts').set(headers).send({
      label: 'Painel',
      url: 'https://panel.example.test',
      groupName: 'Trabalho',
      iconKey: 'server',
      isPinned: false
    });
    expect(first.status).toBe(201);
    const moved = await request(app)
      .patch(`/api/shortcuts/${second.body.shortcut.id}`)
      .set(headers)
      .send({ position: 0 });
    expect(moved.status).toBe(200);
    const listed = await request(app)
      .get('/api/shortcuts')
      .set('Cookie', session.cookie);
    expect(listed.body.shortcuts.map((shortcut) => shortcut.label)).toEqual([
      'Painel',
      'Docs'
    ]);
    const pinned = await request(app)
      .get('/api/shortcuts/pinned')
      .set('Cookie', session.cookie);
    expect(pinned.status).toBe(200);
    expect(pinned.body.shortcuts.map((shortcut) => shortcut.label)).toEqual(['Docs']);
    expect(
      (
        await request(app)
          .delete(`/api/shortcuts/${first.body.shortcut.id}`)
          .set(headers)
      ).status
    ).toBe(204);
  });
});
