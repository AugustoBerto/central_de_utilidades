import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from './api';

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserva content-type ao combinar o header de CSRF com um corpo JSON', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ shortcut: { id: 1 } })
    });
    vi.stubGlobal('fetch', fetch);

    await api('/api/shortcuts', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'csrf-de-teste' },
      body: { label: 'Documentação' }
    });

    expect(fetch).toHaveBeenCalledWith('/api/shortcuts', {
      credentials: 'include',
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-de-teste'
      },
      body: JSON.stringify({ label: 'Documentação' })
    });
  });
});
