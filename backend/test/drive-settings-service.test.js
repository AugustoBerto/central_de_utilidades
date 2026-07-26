import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/database.js';
import { DriveSettingsService } from '../src/drive-settings-service.js';

const resources = [];

function setup({ usedBytes = 0, reservedBytes = 1_000, maxUploadBytes = 100 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'painel-drive-settings-'));
  const filesDir = join(directory, 'files');
  const database = openDatabase(join(directory, 'app.sqlite'));
  resources.push({ database, directory });
  if (usedBytes > 0) {
    database
      .prepare(
        `INSERT INTO files
         (storage_name, original_name, mime_type, size_bytes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run('existing-file', 'existente.bin', 'application/octet-stream', usedBytes, '2026-01-01', '2026-01-01');
  }
  const service = new DriveSettingsService(database, {
    filesDir,
    defaultReservedBytes: reservedBytes,
    defaultMaxUploadBytes: maxUploadBytes
  });
  return { database, service };
}

function caught(action) {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  for (const { database, directory } of resources.splice(0)) {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('DriveSettingsService', () => {
  it('inicializa a configuração e separa cota lógica do espaço físico', () => {
    const { service } = setup({ usedBytes: 250 });
    const status = service.status();

    expect(status).toMatchObject({
      reservedBytes: 1_000,
      maxUploadBytes: 100,
      usedBytes: 250,
      quotaFreeBytes: 750,
      usedPercent: 25
    });
    expect(status.physicalFreeBytes).toBeGreaterThan(0);
    expect(status.effectiveFreeBytes).toBe(
      Math.min(status.quotaFreeBytes, status.physicalFreeBytes)
    );
  });

  it('preserva instalações cujo uso já supera a cota padrão', () => {
    const { service } = setup({ usedBytes: 1_200 });
    expect(service.get()).toMatchObject({
      reservedBytes: 1_200,
      maxUploadBytes: 100
    });
  });

  it('valida alterações de cota, uploads pendentes e limite por arquivo', () => {
    const { service } = setup({ usedBytes: 250 });

    expect(service.update({ reservedBytes: 800, maxUploadBytes: 200 })).toMatchObject({
      reservedBytes: 800,
      maxUploadBytes: 200
    });
    expect(caught(() => service.update({ reservedBytes: 200 }))).toMatchObject({
      status: 422,
      code: 'DRIVE_QUOTA_BELOW_USAGE'
    });
    expect(
      caught(() => service.update({ reservedBytes: 300 }, { pendingBytes: 100 }))
    ).toMatchObject({
      status: 422,
      code: 'DRIVE_QUOTA_BELOW_USAGE'
    });
    expect(caught(() => service.update({ maxUploadBytes: 900 }))).toMatchObject({
      status: 422,
      code: 'MAX_UPLOAD_EXCEEDS_QUOTA'
    });
  });

  it('recusa uploads acima do limite ou do espaço efetivo disponível', () => {
    const { service } = setup({ usedBytes: 250, reservedBytes: 300, maxUploadBytes: 100 });

    expect(caught(() => service.assertUploadAllowed(101))).toMatchObject({
      status: 413,
      code: 'FILE_TOO_LARGE'
    });
    expect(caught(() => service.assertUploadAllowed(51))).toMatchObject({
      status: 507,
      code: 'INSUFFICIENT_STORAGE'
    });
    expect(() => service.assertUploadAllowed(50)).not.toThrow();
  });
});
