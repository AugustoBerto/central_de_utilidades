import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';

import argon2 from 'argon2';
import { generateSecret, generateURI, verify } from 'otplib';

import { HttpError } from './errors.js';

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

function nowIso() {
  return new Date().toISOString();
}
function plusDays(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
function plusSeconds(seconds) {
  return new Date(Date.now() + seconds * 1_000).toISOString();
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function token() {
  return randomBytes(32).toString('base64url');
}
function recoveryCode() {
  return `${randomBytes(5).toString('hex')}-${randomBytes(5).toString('hex')}`;
}

function browserFromUserAgent(userAgent = '') {
  const candidates = [
    ['Edge', /Edg(?:A|iOS)?\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Firefox', /Firefox\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+).+Safari/]
  ];
  for (const [name, pattern] of candidates) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  return 'Navegador não identificado';
}

function deviceFromUserAgent(userAgent = '') {
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? 'Android' : 'Tablet Android';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macOS';
  if (/CrOS/i.test(userAgent)) return 'ChromeOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Dispositivo não identificado';
}

function normalizeClientMetadata({ deviceLabel, ipAddress, userAgent } = {}) {
  const safeUserAgent = String(userAgent ?? '').slice(0, 512);
  const deviceName = deviceFromUserAgent(safeUserAgent);
  const browserName = browserFromUserAgent(safeUserAgent);
  const inferredLabel = `${deviceName} · ${browserName}`;
  const legacyLabel = String(deviceLabel ?? '').trim();
  return {
    deviceLabel:
      legacyLabel && legacyLabel.toLocaleLowerCase('pt-BR') !== 'navegador atual'
        ? legacyLabel.slice(0, 128)
        : inferredLabel.slice(0, 128),
    deviceName,
    browserName,
    ipAddress: String(ipAddress ?? '').replace(/^::ffff:/, '').slice(0, 64) || null,
    userAgent: safeUserAgent || null
  };
}

function assertUsername(username) {
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username ?? ''))
    throw new HttpError(422, 'VALIDATION_ERROR', 'Usuário inválido.', {
      username: 'Use de 3 a 64 caracteres seguros.'
    });
}
function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256)
    throw new HttpError(422, 'VALIDATION_ERROR', 'Senha inválida.', {
      password: 'Use de 12 a 256 caracteres.'
    });
}
function assertTotp(code) {
  if (!/^\d{6}$/.test(code ?? ''))
    throw new HttpError(422, 'VALIDATION_ERROR', 'Código TOTP inválido.', {
      totpCode: 'Informe seis dígitos.'
    });
}

export class AuthService {
  constructor(database, config) {
    this.database = database;
    this.config = config;
    this.key = createHash('sha256').update(config.encryptionKey).digest();
  }

  encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const content = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      content.toString('base64url')
    ].join('.');
  }

  decrypt(value) {
    const [iv, tag, content] = value
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8');
  }

  hasAdministrator() {
    return Boolean(this.database.prepare('SELECT 1 FROM users LIMIT 1').get());
  }

  getSetupStatus() {
    return { setupRequired: !this.hasAdministrator() };
  }

  async initialize({ bootstrapToken, username, password }) {
    if (this.hasAdministrator())
      throw new HttpError(
        409,
        'SETUP_COMPLETED',
        'A configuração inicial já foi concluída.'
      );
    if (
      !this.config.bootstrapToken ||
      !this.constantTimeMatch(bootstrapToken, this.config.bootstrapToken)
    )
      throw new HttpError(401, 'INVALID_BOOTSTRAP_TOKEN', 'Credenciais inválidas.');
    assertUsername(username);
    assertPassword(password);

    const timestamp = nowIso();
    const secret = generateSecret();
    const recoveryCodes = Array.from({ length: 10 }, recoveryCode);
    const passwordHash = await argon2.hash(password, HASH_OPTIONS);

    const transaction = this.database.transaction(() => {
      const result = this.database
        .prepare(
          'INSERT INTO users (username, password_hash, totp_secret_encrypted, password_changed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          username,
          passwordHash,
          this.encrypt(secret),
          timestamp,
          timestamp,
          timestamp
        );
      const insertCode = this.database.prepare(
        'INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)'
      );
      for (const code of recoveryCodes)
        insertCode.run(result.lastInsertRowid, sha256(code), timestamp);
      return result.lastInsertRowid;
    });
    transaction();

    return {
      totpUri: generateURI({ issuer: 'Painel de Utilidades', label: username, secret }),
      recoveryCodes
    };
  }

  async login(
    { username, password, totpCode, recoveryCode, deviceLabel },
    clientMetadata = {}
  ) {
    const user = this.database
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username);
    if (!user || !(await argon2.verify(user?.password_hash ?? '', password ?? '')))
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Credenciais inválidas.');

    let secondFactorValid = false;
    if (recoveryCode) {
      const result = this.database
        .prepare(
          'UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL'
        )
        .run(nowIso(), user.id, sha256(recoveryCode));
      secondFactorValid = result.changes === 1;
    } else {
      assertTotp(totpCode);
      secondFactorValid = (
        await verify({
          secret: this.decrypt(user.totp_secret_encrypted),
          token: totpCode,
          window: 1
        })
      ).valid;
    }
    if (!secondFactorValid)
      throw new HttpError(401, 'INVALID_SECOND_FACTOR', 'Credenciais inválidas.');
    return this.createSession(
      user,
      normalizeClientMetadata({ ...clientMetadata, deviceLabel })
    );
  }

  createSession(user, metadata = {}) {
    const rawToken = token();
    const csrfToken = token();
    const timestamp = nowIso();
    const session = {
      id: randomBytes(16).toString('hex'),
      rawToken,
      csrfToken,
      idleExpiresAt: plusDays(this.config.sessionIdleDays),
      absoluteExpiresAt: plusDays(this.config.sessionAbsoluteDays)
    };
    const normalized = normalizeClientMetadata(metadata);
    this.database
      .prepare(
        'INSERT INTO sessions (id, user_id, token_hash, csrf_hash, device_label, device_name, browser_name, ip_address, user_agent, created_at, last_used_at, idle_expires_at, absolute_expires_at, rotated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        session.id,
        user.id,
        sha256(rawToken),
        sha256(csrfToken),
        normalized.deviceLabel,
        normalized.deviceName,
        normalized.browserName,
        normalized.ipAddress,
        normalized.userAgent,
        timestamp,
        timestamp,
        session.idleExpiresAt,
        session.absoluteExpiresAt,
        timestamp
      );
    return { session, user: { id: user.id, username: user.username } };
  }

  authenticate(rawToken) {
    if (!rawToken) throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão necessária.');
    let session = this.database
      .prepare(
        'SELECT sessions.*, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND revoked_at IS NULL'
      )
      .get(sha256(rawToken));
    let usedPreviousToken = false;
    if (!session) {
      const previous = this.database
        .prepare(
          'SELECT sessions.*, users.username, session_token_history.expires_at AS previous_token_expires_at FROM session_token_history JOIN sessions ON sessions.id = session_token_history.session_id JOIN users ON users.id = sessions.user_id WHERE session_token_history.token_hash = ? AND sessions.revoked_at IS NULL'
        )
        .get(sha256(rawToken));
      if (previous) {
        if (new Date(previous.previous_token_expires_at) <= new Date()) {
          this.revokeSession(previous.id);
          throw new HttpError(401, 'SESSION_REUSED', 'Sessão inválida ou expirada.');
        }
        session = previous;
        usedPreviousToken = true;
      }
    }
    if (
      !session ||
      new Date(session.idle_expires_at) <= new Date() ||
      new Date(session.absolute_expires_at) <= new Date()
    )
      throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
    this.database
      .prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?')
      .run(nowIso(), session.id);
    const rotation =
      !usedPreviousToken && this.shouldRotate(session)
        ? this.rotateSession(session, rawToken)
        : null;
    return {
      session,
      user: { id: session.user_id, username: session.username },
      rotation,
      usedPreviousToken
    };
  }

  shouldRotate(session) {
    return (
      Date.now() - new Date(session.rotated_at).getTime() >=
      this.config.sessionRotationHours * 3_600_000
    );
  }

  rotateSession(session, rawToken) {
    const rawTokenNext = token();
    const timestamp = nowIso();
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          'INSERT INTO session_token_history (session_id, token_hash, issued_at, invalidated_at, expires_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(
          session.id,
          sha256(rawToken),
          session.rotated_at,
          timestamp,
          plusSeconds(30)
        );
      this.database
        .prepare('UPDATE sessions SET token_hash = ?, rotated_at = ? WHERE id = ?')
        .run(sha256(rawTokenNext), timestamp, session.id);
    });
    transaction();
    return { rawToken: rawTokenNext };
  }

  validateCsrf(session, csrfToken) {
    if (!csrfToken || !this.constantTimeMatch(sha256(csrfToken), session.csrf_hash))
      throw new HttpError(403, 'CSRF_INVALID', 'Solicitação não autorizada.');
  }

  issueCsrf(session) {
    const csrfToken = token();
    this.database
      .prepare('UPDATE sessions SET csrf_hash = ? WHERE id = ?')
      .run(sha256(csrfToken), session.id);
    return csrfToken;
  }

  revoke(rawToken) {
    if (rawToken)
      this.database
        .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?')
        .run(nowIso(), sha256(rawToken));
  }
  revokeSession(sessionId, userId) {
    const query = userId
      ? 'UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL'
      : 'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL';
    const values = userId ? [nowIso(), sessionId, userId] : [nowIso(), sessionId];
    return this.database.prepare(query).run(...values).changes === 1;
  }

  listSessions(userId, currentSessionId) {
    return this.database
      .prepare(
        'SELECT id, device_label AS deviceLabel, device_name AS deviceName, browser_name AS browserName, ip_address AS ipAddress, created_at AS createdAt, last_used_at AS lastUsedAt, idle_expires_at AS idleExpiresAt FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_used_at DESC'
      )
      .all(userId)
      .map((session) => ({
        ...session,
        deviceName: session.deviceName || 'Dispositivo não identificado',
        browserName: session.browserName || 'Navegador não identificado',
        current: session.id === currentSessionId
      }));
  }

  revokeOtherSessions(userId, currentSessionId) {
    return this.database
      .prepare(
        'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL'
      )
      .run(nowIso(), userId, currentSessionId).changes;
  }
  constantTimeMatch(left, right) {
    const a = Buffer.from(left ?? '');
    const b = Buffer.from(right ?? '');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
