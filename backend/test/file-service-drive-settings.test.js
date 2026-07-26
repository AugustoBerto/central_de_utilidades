import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/database.js';
import { DriveSettingsService } from '../src/drive-settings-service.js';
import { FileService } from '../src/file-service.js';

const resources = [];

function caught(promise) {
  return promise.then(
    () => null,
    (error) => error
  );
}

function upload(service, content, name = 'arquivo.txt') {
  return service.upload(Readable.from([content]), {
    originalName: name,
    mimeType: 'text/plain',
    contentLength: Buffer.byteLength(content)
  });
}

afterEach(() => {
  for (const { database, directory } of resources.splice(0)) {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('FileService com configurações do Drive', () => {
  it('aplica alterações de limite e cota entre uploads sem consultar a política por bloco', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'painel-drive-upload-'));
    const filesDir = join(directory, 'files');
    const database = openDatabase(join(directory, 'app.sqlite'));
    resources.push({ database, directory });
    const settings = new DriveSettingsService(database, {
      filesDir,
      defaultReservedBytes: 5,
      defaultMaxUploadBytes: 4
    });
    const files = new FileService(database, {
      filesDir,
      maxUploadBytes: 4,
      driveSettingsService: settings
    });

    await expect(upload(files, '1234', 'primeiro.txt')).resolves.toMatchObject({
      sizeBytes: 4,
      folderId: null
    });
    settings.update({ maxUploadBytes: 3 });

    expect(await caught(upload(files, '1234', 'grande.txt'))).toMatchObject({
      status: 413,
      code: 'FILE_TOO_LARGE'
    });
    expect(await caught(upload(files, '12', 'sem-espaco.txt'))).toMatchObject({
      status: 507,
      code: 'INSUFFICIENT_STORAGE'
    });
    await expect(upload(files, '1', 'ultimo.txt')).resolves.toMatchObject({ sizeBytes: 1 });
    expect(settings.status()).toMatchObject({
      usedBytes: 5,
      quotaFreeBytes: 0,
      effectiveFreeBytes: 0
    });
  });
});
