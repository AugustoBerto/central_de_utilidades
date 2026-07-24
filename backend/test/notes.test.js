import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generate } from 'otplib';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthService } from '../src/auth-service.js';
import { openDatabase } from '../src/database.js';
import { NoteService } from '../src/note-service.js';
import { SystemMetricsService } from '../src/system-metrics-service.js';

const directories = [];
const sameOrigin = 'http://127.0.0.1';

function createTestApp() {
  const directory = mkdtempSync(join(tmpdir(), 'painel-notes-'));
  directories.push(directory);
  const config = {
    databasePath: join(directory, 'app.sqlite'),
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
  return createApp({
    authService,
    noteService: new NoteService(database),
    systemMetricsService: new SystemMetricsService({
      mode: 'disabled',
      filesDir: directory
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

describe('notas', () => {
  it('cria, busca, atualiza e exclui sem sobrescrita silenciosa', async () => {
    const app = createTestApp();
    const session = await login(app);
    const headers = {
      Cookie: session.cookie,
      Origin: sameOrigin,
      'X-CSRF-Token': session.csrfToken
    };

    const created = await request(app)
      .post('/api/notes')
      .set(headers)
      .send({ content: 'Verificar backup antes da atualização.' });
    expect(created.status).toBe(201);
    expect(created.body.note.title).toBe('');

    const listed = await request(app)
      .get('/api/notes?q=backup')
      .set('Cookie', session.cookie);
    expect(listed.body.notes).toHaveLength(1);

    const alphabetic = await request(app)
      .get('/api/notes?sort=title:asc&from=2000-01-01&to=2100-01-01')
      .set('Cookie', session.cookie);
    expect(alphabetic.status).toBe(200);
    expect(alphabetic.body.notes[0].id).toBe(created.body.note.id);

    const updated = await request(app)
      .patch(`/api/notes/${created.body.note.id}`)
      .set(headers)
      .send({
        title: 'Deploy',
        content: 'Backup conferido antes da atualização.',
        updatedAt: created.body.note.updatedAt
      });
    expect(updated.status).toBe(200);
    expect(updated.body.note.title).toBe('Deploy');

    const conflict = await request(app)
      .patch(`/api/notes/${created.body.note.id}`)
      .set(headers)
      .send({ content: 'Alteração atrasada.', updatedAt: created.body.note.updatedAt });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('NOTE_CONFLICT');

    const removed = await request(app)
      .delete(`/api/notes/${created.body.note.id}`)
      .set(headers);
    expect(removed.status).toBe(204);
    expect(
      (await request(app).get('/api/notes').set('Cookie', session.cookie)).body.notes
    ).toEqual([]);
  });
});
