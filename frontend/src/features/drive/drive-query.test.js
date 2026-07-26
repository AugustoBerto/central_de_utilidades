import { describe, expect, it } from 'vitest';

import { activeDriveFilters, buildDriveItemsPath } from './drive-query';

describe('drive query', () => {
  it('mantém a navegação normal limitada à pasta atual', () => {
    const path = buildDriveItemsPath({ folderId: 12, page: 2 });
    const url = new URL(path, 'http://localhost');

    expect(url.pathname).toBe('/api/drive/items');
    expect(url.searchParams.get('folderId')).toBe('12');
    expect(url.searchParams.get('scope')).toBe('folder');
    expect(url.searchParams.get('sort')).toBe('name');
    expect(url.searchParams.get('order')).toBe('asc');
    expect(url.searchParams.get('offset')).toBe('100');
  });

  it('faz busca global e converte filtros de megabytes para bytes', () => {
    const path = buildDriveItemsPath({
      folderId: 12,
      query: 'relatório',
      sort: 'size:desc',
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
    expect(url.searchParams.get('sort')).toBe('size');
    expect(url.searchParams.get('order')).toBe('desc');
    expect(url.searchParams.get('minSize')).toBe(String(2.5 * 1024 * 1024));
    expect(url.searchParams.get('maxSize')).toBe(String(10 * 1024 * 1024));
    expect(url.searchParams.get('type')).toBe('document');
  });

  it('descreve somente os filtros ativos, incluindo pastas', () => {
    expect(
      activeDriveFilters({
        from: '2026-01-01',
        to: '',
        minSizeMb: '',
        maxSizeMb: 20,
        type: 'folder'
      }).map((item) => item.label)
    ).toEqual(['A partir de 2026-01-01', 'Máximo 20 MB', 'Pastas']);
  });
});
