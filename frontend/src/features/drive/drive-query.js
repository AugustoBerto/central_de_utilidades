export const DRIVE_PAGE_SIZE = 50;

function sizeInBytes(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 1024 * 1024);
}

export function buildDriveFilesPath({
  folderId = null,
  query = '',
  searchCurrentFolder = false,
  sort = 'updatedAt:desc',
  filters = {},
  page = 0
} = {}) {
  const params = new URLSearchParams();
  const normalizedQuery = String(query).trim();
  const [sortBy = 'updatedAt', order = 'desc'] = String(sort).split(':');

  if (folderId !== null && folderId !== undefined) params.set('folderId', String(folderId));
  if (normalizedQuery) params.set('q', normalizedQuery);
  params.set('scope', normalizedQuery && !searchCurrentFolder ? 'all' : 'folder');
  params.set('sort', sortBy);
  params.set('order', order === 'asc' ? 'asc' : 'desc');

  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);

  const minSize = sizeInBytes(filters.minSizeMb);
  const maxSize = sizeInBytes(filters.maxSizeMb);
  if (minSize !== null) params.set('minSize', String(minSize));
  if (maxSize !== null) params.set('maxSize', String(maxSize));

  params.set('limit', String(DRIVE_PAGE_SIZE));
  params.set('offset', String(Math.max(0, Number(page) || 0) * DRIVE_PAGE_SIZE));
  return `/api/files?${params.toString()}`;
}

export function activeDriveFilters(filters = {}) {
  const active = [];
  if (filters.from) active.push({ key: 'from', label: `A partir de ${filters.from}` });
  if (filters.to) active.push({ key: 'to', label: `Até ${filters.to}` });
  if (filters.minSizeMb !== '' && filters.minSizeMb !== null && filters.minSizeMb !== undefined)
    active.push({ key: 'minSizeMb', label: `Mínimo ${filters.minSizeMb} MB` });
  if (filters.maxSizeMb !== '' && filters.maxSizeMb !== null && filters.maxSizeMb !== undefined)
    active.push({ key: 'maxSizeMb', label: `Máximo ${filters.maxSizeMb} MB` });
  if (filters.type && filters.type !== 'all') {
    const labels = {
      image: 'Imagens',
      document: 'Documentos',
      audio: 'Áudios',
      video: 'Vídeos',
      other: 'Outros tipos'
    };
    active.push({ key: 'type', label: labels[filters.type] ?? filters.type });
  }
  return active;
}
