import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/database.js';
import { FileService } from '../src/file-service.js';

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('reservas de upload', () => {
  it('impede que uploads simultâneos reservem o mesmo espaço', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'painel-upload-reservation-'));
    directories.push(directory);
    const database = openDatabase(join(directory, 'app.sqlite'));
    const driveSettingsService = {
      status: () => ({ maxUploadBytes: 10, effectiveFreeBytes: 6 })
    };
    const service = new FileService(database, {
      filesDir: join(directory, 'files'),
      maxUploadBytes: 10,
      driveSettingsService
    });

    const firstStream = new PassThrough();
    const firstUpload = service.upload(firstStream, {
      originalName: 'primeiro.txt',
      mimeType: 'text/plain',
      contentLength: '4'
    });
    expect(service.pendingBytes()).toBe(4);

    const secondStream = new PassThrough();
    secondStream.end('abc');
    await expect(
      service.upload(secondStream, {
        originalName: 'segundo.txt',
        mimeType: 'text/plain',
        contentLength: '3'
      })
    ).rejects.toMatchObject({ status: 507, code: 'INSUFFICIENT_STORAGE' });
    expect(service.pendingBytes()).toBe(4);

    firstStream.end('abcd');
    await expect(firstUpload).resolves.toMatchObject({
      originalName: 'primeiro.txt',
      sizeBytes: 4
    });
    expect(service.pendingBytes()).toBe(0);
  });
});
