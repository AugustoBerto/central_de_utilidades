import { randomBytes } from 'node:crypto';

function integer(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(environment = process.env) {
  const isProduction = environment.NODE_ENV === 'production';
  const encryptionKey =
    environment.APP_ENCRYPTION_KEY ||
    (isProduction ? '' : randomBytes(32).toString('hex'));

  if (!encryptionKey) {
    throw new Error('APP_ENCRYPTION_KEY é obrigatório em produção.');
  }

  return {
    environment: environment.NODE_ENV ?? 'development',
    port: integer(environment.PORT, 3000),
    databasePath: environment.DATABASE_PATH ?? './data/app.sqlite',
    filesDir: environment.FILES_DIR ?? './data/files',
    maxUploadBytes: integer(environment.MAX_UPLOAD_BYTES, 2_147_483_648),
    allowHttpShortcuts: environment.ALLOW_HTTP_SHORTCUTS === 'true',
    automationsEnabled: environment.AUTOMATIONS_ENABLED === 'true',
    bootstrapToken: environment.BOOTSTRAP_TOKEN ?? '',
    encryptionKey,
    sessionCookieName: environment.SESSION_COOKIE_NAME ?? 'panel_session',
    sessionIdleDays: integer(environment.SESSION_IDLE_DAYS, 180),
    sessionAbsoluteDays: integer(environment.SESSION_ABSOLUTE_DAYS, 365),
    sessionRotationHours: integer(environment.SESSION_ROTATION_HOURS, 24),
    cookieSecure: environment.COOKIE_SECURE === 'true',
    trustProxyHops: integer(environment.TRUST_PROXY_HOPS, 1),
    systemMetricsMode: environment.SYSTEM_METRICS_MODE ?? 'local'
  };
}
