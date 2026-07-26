import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const resources = [];
const sameOrigin = 'http://127.0.0.1';

function createTestApp() {
  const directory = mkdtempSync(join(tmpdir(), 'painel-drive-items-api-'));
  const filesDir = join(directory, 'files');
  const config = {
    databasePath: join(directory, 'app.sqlite'),
    filesDir,
    maxUploadBytes: 1024,
    driveReservedBytes: 4096,
    driveUploadHardLimitBytes: 4096,
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
    defaultMaxUploadBytes: config.maxUploadBytes,
    uploadHardLimitBytes: config.driveUploadHardLimitBytes
  });
  const folderService = new FolderService(database);
  const fileService = new FileService(database, { ...config, driveSettingsService });
  const app = createApp({
    authService,
    driveSettingsService,
    fileService,
    folderService,
    noteService: new NoteService(database),
    systemMetricsService: new SystemMetricsService({ mode: 'disabled', filesDir }),
    config,
    environment: 'test'
  });
  resources.push({ database, directory });
  return app;
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
  const response = await request(app)
    .post('/api/auth/login')
    .set('Origin', sameOrigin)
    .send({
      username: 'admin',
      password: 'uma-senha-forte-de-teste',
      recoveryCode: setup.body.recoveryCodes[0]
    });
  expect(response.status).toBe(200);
  return {
    cookie: response.headers['set-cookie'][0],
    csrfToken: response.body.csrfToken
  };
}

function writeHeaders(session) {
  return {
    Cookie: session.cookie,
    Origin: sameOrigin,
    'X-CSRF-Token': session.csrfToken
  };
}

async function createFolder(app, write, name, parentId = null) {
  const response = await request(app)
    .post('/api/folders')
    .set(write)
    .send({ name, parentId });
  expect(response.status).toBe(201);
  return response.body.folder;
}

async function upload(app, write, name, folderId, content) {
  const headers = {
    ...write,
    'X-File-Name': name,
    'Content-Type': 'text/plain'
  };
  if (folderId !== null) headers['X-Folder-Id'] = String(folderId);
  const response = await request(app).post('/api/files').set(headers).send(content);
  expect(response.status).toBe(201);
  return response.body.file;
}

afterEach(() => {
  for (const { database, directory } of resources.splice(0)) {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('API unificada de itens do Drive', () => {
  it('lista, ordena e move uma seleção mista', async () => {
    const app = createTestApp();
    const session = await login(app);
    const write = writeHeaders(session);
    const source = await createFolder(app, write, 'Origem');
    const destination = await createFolder(app, write, 'Destino');
    const child = await createFolder(app, write, 'Subpasta', source.id);
    const small = await upload(app, write, 'pequeno.txt', source.id, 'ab');
    const large = await upload(app, write, 'grande.txt', source.id, 'abcdefgh');

    const listed = await request(app)
      .get(`/api/drive/items?folderId=${source.id}&sort=size&order=desc`)
      .set('Cookie', session.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item) => `${item.kind}:${item.name}`)).toEqual([
      'folder:Subpasta',
      'file:grande.txt',
      'file:pequeno.txt'
    ]);

    const moved = await request(app)
      .post('/api/drive/items/move')
      .set(write)
      .send({
        items: [
          { kind: 'folder', id: child.id },
          { kind: 'file', id: large.id },
          { kind: 'file', id: small.id }
        ],
        destinationFolderId: destination.id
      });
    expect(moved.status).toBe(200);
    expect(moved.body).toEqual({ moved: 3, destinationFolderId: destination.id });

    const destinationItems = await request(app)
      .get(`/api/drive/items?folderId=${destination.id}`)
      .set('Cookie', session.cookie);
    expect(destinationItems.body.items.map((item) => item.name)).toEqual([
      'Subpasta',
      'grande.txt',
      'pequeno.txt'
    ]);
  });

  it('não move parcialmente quando existe conflito no destino', async () => {
    const app = createTestApp();
    const session = await login(app);
    const write = writeHeaders(session);
    const source = await createFolder(app, write, 'Origem');
    const destination = await createFolder(app, write, 'Destino');
    const selected = await upload(app, write, 'duplicado.txt', source.id, 'origem');
    await upload(app, write, 'duplicado.txt', destination.id, 'destino');

    const response = await request(app)
      .post('/api/drive/items/move')
      .set(write)
      .send({
        items: [{ kind: 'file', id: selected.id }],
        destinationFolderId: destination.id
      });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ITEM_NAME_CONFLICT');

    const sourceItems = await request(app)
      .get(`/api/drive/items?folderId=${source.id}`)
      .set('Cookie', session.cookie);
    expect(sourceItems.body.items.map((item) => item.name)).toEqual(['duplicado.txt']);
  });

  it('exclui em lote e recusa seleção com pasta não vazia', async () => {
    const app = createTestApp();
    const session = await login(app);
    const write = writeHeaders(session);
    const empty = await createFolder(app, write, 'Vazia');
    const nonEmpty = await createFolder(app, write, 'Com conteúdo');
    const rootFile = await upload(app, write, 'raiz.txt', null, 'abc');
    const childFile = await upload(app, write, 'filho.txt', nonEmpty.id, 'abc');

    const refused = await request(app)
      .post('/api/drive/items/delete')
      .set(write)
      .send({
        items: [
          { kind: 'folder', id: nonEmpty.id },
          { kind: 'file', id: childFile.id }
        ]
      });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('FOLDER_NOT_EMPTY');

    const removed = await request(app)
      .post('/api/drive/items/delete')
      .set(write)
      .send({
        items: [
          { kind: 'folder', id: empty.id },
          { kind: 'file', id: rootFile.id }
        ]
      });
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ deleted: 2 });

    const root = await request(app)
      .get('/api/drive/items')
      .set('Cookie', session.cookie);
    expect(root.body.items.map((item) => item.name)).toEqual(['Com conteúdo']);
  });
});
