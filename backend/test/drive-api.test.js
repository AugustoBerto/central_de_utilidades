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
  const directory = mkdtempSync(join(tmpdir(), 'painel-drive-api-'));
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

function writeHeaders(session) {
  return {
    Cookie: session.cookie,
    Origin: sameOrigin,
    'X-CSRF-Token': session.csrfToken
  };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('API do Drive', () => {
  it('navega, pesquisa, filtra e reorganiza arquivos e pastas', async () => {
    const app = createTestApp();
    const session = await login(app);
    const write = writeHeaders(session);

    const projects = await request(app)
      .post('/api/folders')
      .set(write)
      .send({ name: 'Projetos' });
    expect(projects.status).toBe(201);

    const reports = await request(app)
      .post('/api/folders')
      .set(write)
      .send({ name: 'Relatórios', parentId: projects.body.folder.id });
    expect(reports.status).toBe(201);

    const path = await request(app)
      .get(`/api/folders/${reports.body.folder.id}`)
      .set('Cookie', session.cookie);
    expect(path.body.path.map((folder) => folder.name)).toEqual(['Projetos', 'Relatórios']);

    const upload = await request(app)
      .post('/api/files')
      .set({
        ...write,
        'X-File-Name': 'resultado.txt',
        'X-Folder-Id': String(reports.body.folder.id),
        'Content-Type': 'text/plain'
      })
      .send('abcde');
    expect(upload.status).toBe(201);
    expect(upload.body.file).toMatchObject({
      originalName: 'resultado.txt',
      folderId: reports.body.folder.id,
      folderPath: 'Projetos / Relatórios'
    });

    await request(app)
      .post('/api/files')
      .set({
        ...write,
        'X-File-Name': 'raiz.txt',
        'Content-Type': 'text/plain'
      })
      .send('abc');

    const currentFolder = await request(app)
      .get(`/api/files?folderId=${reports.body.folder.id}`)
      .set('Cookie', session.cookie);
    expect(currentFolder.body.files.map((file) => file.originalName)).toEqual([
      'resultado.txt'
    ]);

    const search = await request(app)
      .get('/api/files?q=resultado')
      .set('Cookie', session.cookie);
    expect(search.body.scope).toBe('all');
    expect(search.body.files[0].folderPath).toBe('Projetos / Relatórios');

    const filtered = await request(app)
      .get(
        '/api/files?q=resultado&type=document&minSize=5&maxSize=5&from=2000-01-01&to=2100-01-01'
      )
      .set('Cookie', session.cookie);
    expect(filtered.body.files).toHaveLength(1);

    const moved = await request(app)
      .patch(`/api/files/${upload.body.file.id}`)
      .set(write)
      .send({ originalName: 'movido.txt', folderId: null });
    expect(moved.body.file).toMatchObject({
      originalName: 'movido.txt',
      folderId: null,
      folderPath: ''
    });

    const conflict = await request(app)
      .post('/api/folders')
      .set(write)
      .send({ name: 'movido.txt' });
    expect(conflict.status).toBe(409);

    const cycle = await request(app)
      .patch(`/api/folders/${projects.body.folder.id}`)
      .set(write)
      .send({ parentId: reports.body.folder.id });
    expect(cycle.status).toBe(422);
    expect(cycle.body.error.code).toBe('FOLDER_CYCLE');

    const nonEmpty = await request(app)
      .delete(`/api/folders/${projects.body.folder.id}`)
      .set(write);
    expect(nonEmpty.status).toBe(409);

    expect(
      (
        await request(app)
          .delete(`/api/folders/${reports.body.folder.id}`)
          .set(write)
      ).status
    ).toBe(204);
    expect(
      (
        await request(app)
          .delete(`/api/folders/${projects.body.folder.id}`)
          .set(write)
      ).status
    ).toBe(204);
  });

  it('protege e atualiza as configurações de armazenamento', async () => {
    const app = createTestApp();
    const session = await login(app);
    const write = writeHeaders(session);

    const initial = await request(app)
      .get('/api/drive/status')
      .set('Cookie', session.cookie);
    expect(initial.body).toMatchObject({
      reservedBytes: 1024,
      maxUploadBytes: 64,
      usedBytes: 0
    });

    const forbidden = await request(app)
      .patch('/api/drive/settings')
      .set({ Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken })
      .send({ reservedBytes: 100, maxUploadBytes: 10 });
    expect(forbidden.status).toBe(403);

    await request(app)
      .post('/api/files')
      .set({
        ...write,
        'X-File-Name': 'dois.txt',
        'Content-Type': 'text/plain'
      })
      .send('ab');

    const belowUsage = await request(app)
      .patch('/api/drive/settings')
      .set(write)
      .send({ reservedBytes: 1 });
    expect(belowUsage.status).toBe(422);
    expect(belowUsage.body.error.code).toBe('DRIVE_QUOTA_BELOW_USAGE');

    const updated = await request(app)
      .patch('/api/drive/settings')
      .set(write)
      .send({ reservedBytes: 10, maxUploadBytes: 3 });
    expect(updated.body.settings).toMatchObject({
      reservedBytes: 10,
      maxUploadBytes: 3
    });
    expect(updated.body.status.usedBytes).toBe(2);

    const tooLarge = await request(app)
      .post('/api/files')
      .set({
        ...write,
        'X-File-Name': 'quatro.txt',
        'Content-Type': 'text/plain'
      })
      .send('abcd');
    expect(tooLarge.status).toBe(413);
  });
});
