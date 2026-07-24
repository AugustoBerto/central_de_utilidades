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

const temporaryDirectories = [];
const sameOrigin = 'http://127.0.0.1';

function createTestApp() {
  const directory = mkdtempSync(join(tmpdir(), 'painel-auth-'));
  temporaryDirectories.push(directory);
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
  const service = new AuthService(database, config);
  return {
    app: createApp({
      authService: service,
      config,
      noteService: new NoteService(database),
      systemMetricsService: new SystemMetricsService({
        mode: 'disabled',
        filesDir: directory
      }),
      environment: 'test'
    }),
    service
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('autenticação', () => {
  it('faz bootstrap, login com TOTP, consulta sessão e logout com CSRF', async () => {
    const { app } = createTestApp();
    const setup = await request(app)
      .post('/api/setup/initialize')
      .set('Origin', sameOrigin)
      .send({
        bootstrapToken: 'bootstrap-test-token',
        username: 'admin',
        password: 'uma-senha-forte-de-teste'
      });

    expect(setup.status).toBe(201);
    expect(setup.body.recoveryCodes).toHaveLength(10);
    const secret = new URL(setup.body.totpUri).searchParams.get('secret');
    const totpCode = await generate({ secret });

    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', sameOrigin)
      .send({
        username: 'admin',
        password: 'uma-senha-forte-de-teste',
        totpCode,
        deviceLabel: 'Teste'
      });

    expect(login.status).toBe(200);
    expect(login.body.user).toEqual({ id: 1, username: 'admin' });
    expect(login.body.csrfToken).toEqual(expect.any(String));
    const cookie = login.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('admin');

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', sameOrigin)
      .set('X-CSRF-Token', login.body.csrfToken);
    expect(logout.status).toBe(204);

    const expired = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(expired.status).toBe(401);
  });

  it('lista e revoga outro dispositivo com CSRF e mesma origem', async () => {
    const { app } = createTestApp();
    const setup = await request(app)
      .post('/api/setup/initialize')
      .set('Origin', sameOrigin)
      .send({
        bootstrapToken: 'bootstrap-test-token',
        username: 'admin',
        password: 'uma-senha-forte-de-teste'
      });
    const secret = new URL(setup.body.totpUri).searchParams.get('secret');
    const totpCode = await generate({ secret });
    const firstLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', sameOrigin)
      .send({
        username: 'admin',
        password: 'uma-senha-forte-de-teste',
        totpCode,
        deviceLabel: 'Navegador principal'
      });
    const secondLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', sameOrigin)
      .send({
        username: 'admin',
        password: 'uma-senha-forte-de-teste',
        totpCode,
        deviceLabel: 'Navegador secundário'
      });
    const firstCookie = firstLogin.headers['set-cookie'][0];
    const secondCookie = secondLogin.headers['set-cookie'][0];

    const sessions = await request(app)
      .get('/api/auth/sessions')
      .set('Cookie', firstCookie);
    expect(sessions.status).toBe(200);
    expect(sessions.body.sessions).toHaveLength(2);
    const other = sessions.body.sessions.find((session) => !session.current);

    const revoke = await request(app)
      .delete(`/api/auth/sessions/${other.id}`)
      .set('Cookie', firstCookie)
      .set('Origin', sameOrigin)
      .set('X-CSRF-Token', firstLogin.body.csrfToken);
    expect(revoke.status).toBe(204);

    const revoked = await request(app).get('/api/auth/me').set('Cookie', secondCookie);
    expect(revoked.status).toBe(401);
  });

  it('rejeita mutação sem origem confiável', async () => {
    const { app } = createTestApp();
    const response = await request(app).post('/api/setup/initialize').send({
      bootstrapToken: 'bootstrap-test-token',
      username: 'admin',
      password: 'uma-senha-forte-de-teste'
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_INVALID');
  });

  it('rotaciona o token e revoga a sessão após reutilização fora da janela curta', async () => {
    const { service } = createTestApp();
    await service.initialize({
      bootstrapToken: 'bootstrap-test-token',
      username: 'admin',
      password: 'uma-senha-forte-de-teste'
    });
    const user = service.database
      .prepare('SELECT * FROM users WHERE username = ?')
      .get('admin');
    const secret = service.decrypt(user.totp_secret_encrypted);
    const result = await service.login({
      username: 'admin',
      password: 'uma-senha-forte-de-teste',
      totpCode: await generate({ secret })
    });
    service.database
      .prepare('UPDATE sessions SET rotated_at = ? WHERE id = ?')
      .run('2020-01-01T00:00:00.000Z', result.session.id);

    const rotated = service.authenticate(result.session.rawToken);
    expect(rotated.rotation.rawToken).toEqual(expect.any(String));
    expect(rotated.rotation.rawToken).not.toBe(result.session.rawToken);
    expect(service.authenticate(result.session.rawToken).usedPreviousToken).toBe(true);

    service.database
      .prepare('UPDATE session_token_history SET expires_at = ? WHERE session_id = ?')
      .run('2020-01-01T00:00:00.000Z', result.session.id);
    expect(() => service.authenticate(result.session.rawToken)).toThrow(
      'Sessão inválida'
    );
    expect(() => service.authenticate(rotated.rotation.rawToken)).toThrow(
      'Sessão inválida'
    );
  });

  it('expõe métricas autenticadas sem inventar valores quando a origem está desabilitada', async () => {
    const { app } = createTestApp();
    expect((await request(app).get('/api/system/metrics')).status).toBe(401);

    const setup = await request(app)
      .post('/api/setup/initialize')
      .set('Origin', sameOrigin)
      .send({
        bootstrapToken: 'bootstrap-test-token',
        username: 'admin',
        password: 'uma-senha-forte-de-teste'
      });
    const secret = new URL(setup.body.totpUri).searchParams.get('secret');
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', sameOrigin)
      .send({
        username: 'admin',
        password: 'uma-senha-forte-de-teste',
        totpCode: await generate({ secret })
      });
    const metrics = await request(app)
      .get('/api/system/metrics')
      .set('Cookie', login.headers['set-cookie'][0]);

    expect(metrics.status).toBe(200);
    expect(metrics.body).toMatchObject({
      version: 1,
      source: { type: 'disabled' },
      status: 'disabled',
      metrics: null
    });
  });
});
