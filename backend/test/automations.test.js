import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AutomationService } from '../src/automation-service.js';
import { openDatabase } from '../src/database.js';

const directories = [];

function createService(enabled) {
  const directory = mkdtempSync(join(tmpdir(), 'painel-automations-'));
  directories.push(directory);
  const database = openDatabase(join(directory, 'app.sqlite'));
  database
    .prepare(
      'INSERT INTO users (username, password_hash, totp_secret_encrypted, password_changed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      'admin',
      'hash',
      'secret',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z'
    );
  return new AutomationService(database, { enabled });
}

async function waitFor(service, id) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const run = service.getRun(id);
    if (['succeeded', 'failed', 'timed_out', 'cancelled'].includes(run.status))
      return run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Automação não terminou a tempo.');
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('automações controladas', () => {
  it('mantém o catálogo desabilitado por padrão', () => {
    const service = createService(false);
    expect(service.list()[0].available).toBe(false);
    expect(() => service.start('runner-diagnostic', {}, 1)).toThrow('desabilitadas');
  });

  it('aceita somente parâmetros tipados do catálogo e executa sem shell', async () => {
    const service = createService(true);
    expect(() => service.start('runner-diagnostic', { command: 'id' }, 1)).toThrow(
      'Parâmetros inválidos'
    );
    const queued = service.start('runner-diagnostic', { repeat: 2 }, 1);
    const completed = await waitFor(service, queued.id);
    expect(completed.status).toBe('succeeded');
    expect(completed.output).toContain('runner diagnostic 1/2');
    expect(completed.output).not.toContain('command');
  });
});
