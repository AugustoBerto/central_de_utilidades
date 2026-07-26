import { mkdirSync, statfsSync } from 'node:fs';
import { resolve } from 'node:path';

import { HttpError } from './errors.js';

const DEFAULT_RESERVED_BYTES = 50 * 1024 ** 3;
const DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 ** 3;

function nowIso() {
  return new Date().toISOString();
}

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new HttpError(422, 'VALIDATION_ERROR', 'Configuração do Drive inválida.', {
      [field]: 'Informe um valor inteiro maior que zero.'
    });
  return parsed;
}

function nonNegativeInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new TypeError(`${field} deve ser um inteiro não negativo.`);
  return parsed;
}

function toSettings(row) {
  return {
    reservedBytes: row.reserved_bytes,
    maxUploadBytes: row.max_upload_bytes,
    updatedAt: row.updated_at
  };
}

export class DriveSettingsService {
  constructor(
    database,
    {
      filesDir = '.',
      defaultReservedBytes = DEFAULT_RESERVED_BYTES,
      defaultMaxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES
    } = {}
  ) {
    this.database = database;
    this.filesDir = resolve(filesDir);
    this.defaultReservedBytes = positiveInteger(defaultReservedBytes, 'reservedBytes');
    this.defaultMaxUploadBytes = positiveInteger(defaultMaxUploadBytes, 'maxUploadBytes');
    mkdirSync(this.filesDir, { recursive: true });
    this.initialize();
  }

  initialize() {
    const usedBytes = this.usedBytes();
    const reservedBytes = Math.max(
      this.defaultReservedBytes,
      this.defaultMaxUploadBytes,
      usedBytes
    );
    const maxUploadBytes = Math.min(this.defaultMaxUploadBytes, reservedBytes);
    this.database
      .prepare(
        `INSERT OR IGNORE INTO drive_settings
         (id, reserved_bytes, max_upload_bytes, updated_at)
         VALUES (1, ?, ?, ?)`
      )
      .run(reservedBytes, maxUploadBytes, nowIso());
  }

  get() {
    const row = this.database.prepare('SELECT * FROM drive_settings WHERE id = 1').get();
    if (!row)
      throw new HttpError(
        500,
        'DRIVE_SETTINGS_MISSING',
        'As configurações do Drive não foram inicializadas.'
      );
    return toSettings(row);
  }

  update(changes = {}, { pendingBytes = 0 } = {}) {
    const current = this.get();
    const reservedBytes = Object.hasOwn(changes, 'reservedBytes')
      ? positiveInteger(changes.reservedBytes, 'reservedBytes')
      : current.reservedBytes;
    const maxUploadBytes = Object.hasOwn(changes, 'maxUploadBytes')
      ? positiveInteger(changes.maxUploadBytes, 'maxUploadBytes')
      : current.maxUploadBytes;
    const usedBytes = this.usedBytes();
    const pending = nonNegativeInteger(pendingBytes, 'pendingBytes');
    const committedBytes = usedBytes + pending;

    if (reservedBytes < committedBytes)
      throw new HttpError(
        422,
        'DRIVE_QUOTA_BELOW_USAGE',
        'O espaço reservado não pode ser menor que o uso atual e os uploads em andamento.',
        { reservedBytes: `O Drive já possui ${committedBytes} bytes comprometidos.` }
      );
    if (maxUploadBytes > reservedBytes)
      throw new HttpError(
        422,
        'MAX_UPLOAD_EXCEEDS_QUOTA',
        'O tamanho máximo de upload não pode exceder o espaço reservado.',
        { maxUploadBytes: 'Reduza o limite por arquivo ou aumente o espaço reservado.' }
      );

    const updatedAt = nowIso();
    this.database
      .prepare(
        `UPDATE drive_settings
         SET reserved_bytes = ?, max_upload_bytes = ?, updated_at = ?
         WHERE id = 1`
      )
      .run(reservedBytes, maxUploadBytes, updatedAt);
    return this.get();
  }

  usedBytes() {
    return this.database.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files').get()
      .total;
  }

  physicalFreeBytes() {
    try {
      const stats = statfsSync(this.filesDir);
      return Math.max(0, stats.bavail * stats.bsize);
    } catch {
      return null;
    }
  }

  status() {
    const settings = this.get();
    const usedBytes = this.usedBytes();
    const quotaFreeBytes = Math.max(0, settings.reservedBytes - usedBytes);
    const physicalFreeBytes = this.physicalFreeBytes();
    const effectiveFreeBytes = physicalFreeBytes === null
      ? 0
      : Math.max(0, Math.min(quotaFreeBytes, physicalFreeBytes));
    return {
      ...settings,
      usedBytes,
      quotaFreeBytes,
      physicalFreeBytes,
      effectiveFreeBytes,
      usedPercent: settings.reservedBytes
        ? Math.min(100, (usedBytes / settings.reservedBytes) * 100)
        : 0
    };
  }

  assertUploadAllowed(bytes, { pendingBytes = 0 } = {}) {
    const uploadBytes = positiveInteger(bytes, 'sizeBytes');
    const pending = nonNegativeInteger(pendingBytes, 'pendingBytes');
    const status = this.status();
    if (uploadBytes > status.maxUploadBytes)
      throw new HttpError(413, 'FILE_TOO_LARGE', 'O arquivo excede o limite permitido.');
    if (uploadBytes + pending > status.effectiveFreeBytes)
      throw new HttpError(507, 'INSUFFICIENT_STORAGE', 'Espaço insuficiente para o upload.');
    return status;
  }
}
