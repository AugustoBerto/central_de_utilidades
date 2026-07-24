import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('@/services/api', () => ({
  api,
  ApiError: class ApiError extends Error {
    constructor(status, payload = {}) {
      super(payload.error?.message ?? 'Erro');
      this.status = status;
    }
  }
}));

import { useAuthStore } from './auth';

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.mockReset();
  });

  it('restaura uma sessão persistida e obtém o CSRF em memória', async () => {
    api
      .mockResolvedValueOnce({ setupRequired: false })
      .mockResolvedValueOnce({ user: { id: 1, username: 'admin' } })
      .mockResolvedValueOnce({ csrfToken: 'csrf-token' });

    const store = useAuthStore();
    await store.restore();

    expect(store.authenticated).toBe(true);
    expect(store.user).toEqual({ id: 1, username: 'admin' });
    expect(store.csrfToken).toBe('csrf-token');
    expect(api).toHaveBeenCalledWith('/api/auth/me');
  });

  it('mantém o painel anônimo quando não existe sessão', async () => {
    const { ApiError } = await import('@/services/api');
    api
      .mockResolvedValueOnce({ setupRequired: false })
      .mockRejectedValueOnce(new ApiError(401));

    const store = useAuthStore();
    await store.restore();

    expect(store.authenticated).toBe(false);
    expect(store.error).toBeNull();
    expect(store.restored).toBe(true);
  });
});
