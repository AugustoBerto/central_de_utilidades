import { defineStore } from 'pinia';

import { api, ApiError } from '@/services/api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    csrfToken: null,
    setupRequired: null,
    restored: false,
    error: null
  }),
  getters: { authenticated: (state) => Boolean(state.user) },
  actions: {
    async restore() {
      if (this.restored) return;
      this.error = null;
      try {
        const setup = await api('/api/setup/status');
        this.setupRequired = setup.setupRequired;
        if (!setup.setupRequired) {
          const session = await api('/api/auth/me');
          this.user = session.user;
          this.csrfToken = (await api('/api/auth/csrf')).csrfToken;
        }
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401)
          this.error = error.message;
        this.user = null;
        this.csrfToken = null;
      } finally {
        this.restored = true;
      }
    },
    async initialize(payload) {
      const result = await api('/api/setup/initialize', {
        method: 'POST',
        body: payload
      });
      this.setupRequired = false;
      return result;
    },
    async login(payload) {
      const result = await api('/api/auth/login', { method: 'POST', body: payload });
      this.user = result.user;
      this.csrfToken = result.csrfToken;
      this.setupRequired = false;
    },
    async logout() {
      if (this.csrfToken)
        await api('/api/auth/logout', {
          method: 'POST',
          headers: { 'X-CSRF-Token': this.csrfToken }
        });
      this.user = null;
      this.csrfToken = null;
    },
    async getSessions() {
      return (await api('/api/auth/sessions')).sessions;
    },
    async revokeSession(sessionId) {
      await api(`/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': this.csrfToken }
      });
    },
    async revokeOtherSessions() {
      return await api('/api/auth/sessions/revoke-others', {
        method: 'POST',
        headers: { 'X-CSRF-Token': this.csrfToken }
      });
    }
  }
});
