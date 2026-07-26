import { describe, expect, it } from 'vitest';

import { activeDriveFilters, buildDriveFilesPath } from './drive-query';

describe('drive query', () => {
  it('mantém a navegação normal limitada à pasta atual', () => {
    const path = buildDriveFilesPath({ folderId: 12, page: 2 });
    const url = new URL(path, 'http://localhost');

    expect(url.searchParams.get('folderId')).toBe('12');
    expect(url.searchParams.get('scope')).toBe('folder');
    expect(url.searchParams.get('offset')).toBe('100');
  });

  it('faz busca global e converte filtros de megabytes para bytes', () => {
    const path = buildDriveFilesPath({
      folderId: 12,
      query: 'relatório',
      filters: {
        from: '2026-01-01',
        minSizeMb: 2.5,
        maxSizeMb: 10,
        type: 'document'
      }
    });
    const url = new URL(path, 'http://localhost');

    expect(url.searchParams.get('scope')).toBe('all');
    expect(url.searchParams.get('q')).toBe('relatório');
    expect(url.searchParams.get('minSize')).toBe(String(2.5 * 1024 * 1024));
    expect(url.searchParams.get('maxSize')).toBe(String(10 * 1024 * 1024));
    expect(url.searchParams.get('type')).toBe('document');
  });

  it('descreve somente os filtros ativos', () => {
    expect(
      activeDriveFilters({
        from: '2026-01-01',
        to: '',
        minSizeMb: '',
        maxSizeMb: 20,
        type: 'image'
      }).map((item) => item.key)
    ).toEqual(['from', 'maxSizeMb', 'type']);
  });
});
