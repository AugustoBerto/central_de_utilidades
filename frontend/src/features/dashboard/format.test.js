import { describe, expect, it } from 'vitest';

import { formatBytes, formatPercent, formatUptime } from './format';

describe('formatação de métricas', () => {
  it('não apresenta dados ausentes como zero', () => {
    expect(formatBytes(null)).toBe('Indisponível');
    expect(formatPercent(undefined)).toBe('Indisponível');
  });

  it('formata unidades operacionais', () => {
    expect(formatBytes(1_572_864)).toBe('1,5 MB');
    expect(formatPercent(25.12)).toBe('25,1%');
    expect(formatUptime(93_600)).toBe('1d 2h');
  });
});
