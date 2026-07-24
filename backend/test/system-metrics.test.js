import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SystemMetricsService } from '../src/system-metrics-service.js';

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('SystemMetricsService', () => {
  it('retorna envelope local com unidades e sem preencher campos ausentes com zero', () => {
    const directory = mkdtempSync(join(tmpdir(), 'painel-metrics-'));
    directories.push(directory);
    const service = new SystemMetricsService({ mode: 'local', filesDir: directory });

    const first = service.collect();
    const second = service.collect();

    expect(first).toMatchObject({ version: 1, source: { type: 'host' } });
    expect(first.collectedAt).toEqual(expect.any(String));
    expect(first.metrics.memory.totalBytes).toBeGreaterThan(0);
    expect(first.metrics.disk.totalBytes).toBeGreaterThan(0);
    expect(
      second.metrics.cpu.usagePercent === null || second.metrics.cpu.usagePercent >= 0
    ).toBe(true);
    expect(
      second.metrics.network === null ||
        second.metrics.network.receivedBytesPerSecond >= 0
    ).toBe(true);
  });
});
