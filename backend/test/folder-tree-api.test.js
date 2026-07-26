import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generate } from 'otplib';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthService } from '../src/auth-service.js';
import { openDatabase } from '../src/database.js';
import { DriveSettingsService } from '../src/drive-settings-service.js';
import { FileService } from '../src/file-service.js';
import { FolderService } from '../src/folder-service.js';
import { NoteService } from '../src/note-service.js';
import { SystemMetricsService } from '../src/system-metrics-service.js';

const directories = [];
const sameOrigin = 'http://127.0.0.1';

function createTestApp() {
  const directory = mkdtempSync(join(tmpdir(), 'painel-folder-tree-api-'));
  const filesDir = join(directory, 'files');
  directories.push(directory);
  const config = {
    databasePath: join(directory, 'app.sqlite'),
    filesDir,
    maxUploadBytes: 64,
    driveReservedBytes: 1024,
    bootstrapToken: 'bootstrap-test-token',
    encryptionKey: 'test-encryption-key',
    sessionCookieName: 'panel_session',
    sessionIdleDays: 180,
    sessionAbsoluteDays: 365,
    sessionRotationHours: 24,
    cookieSecure: false
  };
  const database = openDatabase(config.databasePath);
  const authService = new AuthService(database, config);
  const driveSettingsService = new DriveSettingsService(database, {
    filesDir,
    defaultReservedBytes: config.driveReservedBytes,
    defaultMaxUploadBytes: config.maxUploadBytes
  });
  const folderService = new FolderService(database);
  const fileService = new FileService(database, { ...config, driveSettingsService });
  return createApp({
    authService,
    driveSettingsService,
    fileService,
    folderService,
    noteService: new NoteService(database),
    systemMetricsService: new SystemMetricsService({ mode: 'disabled', filesDir }),
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

describe('GET /api/folders/tree', () => {
  it('retorna a hierarquia autenticada antes da rota dinâmica de detalhe', async () => {
    const app = createTestApp();
    const session = await login(app);
    const headers = {
      Cookie: session.cookie,
      Origin: sameOrigin,
      'X-CSRF-Token': session.csrfToken
    };

    const root = await request(app)
      .post('/api/folders')
      .set(headers)
      .send({ name: 'Projetos' });
    await request(app)
      .post('/api/folders')
      .set(headers)
      .send({ name: '2026', parentId: root.body.folder.id });

    const response = await request(app)
      .get('/api/folders/tree')
      .set('Cookie', session.cookie);

    expect(response.status).toBe(200);
    expect(response.body.folders).toEqual([
      expect.objectContaining({ path: 'Projetos', depth: 0 }),
      expect.objectContaining({ path: 'Projetos / 2026', depth: 1 })
    ]);
  });
});
