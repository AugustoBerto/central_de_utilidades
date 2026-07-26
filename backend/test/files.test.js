import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthService } from '../src/auth-service.js';
import { openDatabase } from '../src/database.js';
import { FileService } from '../src/file-service.js';
import { NoteService } from '../src/note-service.js';
import { SystemMetricsService } from '../src/system-metrics-service.js';

const directories = [];
const sameOrigin = 'http://127.0.0.1';

function createTestApp() {
  const directory = mkdtempSync(join(tmpdir(), 'painel-files-'));
  const filesDir = join(directory, 'files');
  directories.push(directory);
  const config = {
    databasePath: join(directory, 'app.sqlite'),
    filesDir,
    maxUploadBytes: 4,
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
  return {
    app: createApp({
      authService,
      fileService: new FileService(database, config),
      noteService: new NoteService(database),
      systemMetricsService: new SystemMetricsService({ mode: 'disabled', filesDir }),
      config,
      environment: 'test'
    }),
    filesDir
  };
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

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('arquivos', () => {
  it('transmite, lista, baixa, faz preview permitido e remove o arquivo', async () => {
    const { app } = createTestApp();
    const session = await login(app);
    const headers = {
      Cookie: session.cookie,
      Origin: sameOrigin,
      'X-CSRF-Token': session.csrfToken,
      'X-File-Name': 'status.txt',
      'Content-Type': 'text/plain'
    };
    const upload = await request(app).post('/api/files').set(headers).send('abc');
    expect(upload.status).toBe(201);
    expect(upload.body.file).toMatchObject({
      originalName: 'status.txt',
      sizeBytes: 3,
      previewAvailable: true
    });

    const listed = await request(app)
      .get('/api/files?q=status')
      .set('Cookie', session.cookie);
    expect(listed.body.files).toHaveLength(1);
    const id = upload.body.file.id;
    expect(
      (await request(app).get(`/api/files/${id}/preview`).set('Cookie', session.cookie))
        .status
    ).toBe(200);
    expect(
      (
        await request(app)
          .get(`/api/files/${id}/download`)
          .set('Cookie', session.cookie)
      ).headers['content-disposition']
    ).toContain('attachment');

    const jsonFile = await request(app)
      .post('/api/files')
      .set({
        ...headers,
        'X-File-Name': 'dados.json',
        'Content-Type': 'application/json'
      })
      .send('{}');
    expect(jsonFile.status).toBe(201);
    expect(jsonFile.body.file.sizeBytes).toBe(2);

    const removed = await request(app).delete(`/api/files/${id}`).set({
      Cookie: session.cookie,
      Origin: sameOrigin,
      'X-CSRF-Token': session.csrfToken
    });
    expect(removed.status).toBe(204);
  });

  it('rejeita traversal e excesso sem deixar parte utilizável', async () => {
    const { app, filesDir } = createTestApp();
    const session = await login(app);
    const headers = {
      Cookie: session.cookie,
      Origin: sameOrigin,
      'X-CSRF-Token': session.csrfToken,
      'Content-Type': 'text/plain'
    };
    const invalid = await request(app)
      .post('/api/files')
      .set({ ...headers, 'X-File-Name': '../segredo' })
      .send('abc');
    expect(invalid.status).toBe(422);
    const tooLarge = await request(app)
      .post('/api/files')
      .set({ ...headers, 'X-File-Name': 'grande.txt' })
      .send('12345');
    expect(tooLarge.status).toBe(413);
    expect(
      (await request(app).get('/api/files').set('Cookie', session.cookie)).body.files
    ).toEqual([]);
    expect(readdirSync(join(filesDir, '.tmp'))).toEqual([]);
  });
});
