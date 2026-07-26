import cors from 'cors';
import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';

import { HttpError } from './errors.js';

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('=').map(decodeURIComponent))
      .filter(([key]) => key)
  );
}

function serializeCookie(name, value, options = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (options.maxAge) attributes.push(`Max-Age=${options.maxAge}`);
  if (options.clear) attributes.push('Max-Age=0');
  if (options.secure) attributes.push('Secure');
  return attributes.join('; ');
}

function createRateLimiter({ limit = 8, windowMs = 60_000 } = {}) {
  const attempts = new Map();
  return (request, response, next) => {
    const key = `${request.ip}:${request.path}`;
    const current = attempts.get(key) ?? { count: 0, resetAt: Date.now() + windowMs };
    if (current.resetAt <= Date.now()) {
      current.count = 0;
      current.resetAt = Date.now() + windowMs;
    }
    current.count += 1;
    attempts.set(key, current);
    if (current.count > limit)
      return next(new HttpError(429, 'RATE_LIMITED', 'Tente novamente mais tarde.'));
    return next();
  };
}

export function createApp({
  authService,
  automationService,
  config,
  fileService,
  noteService,
  shortcutService,
  systemMetricsService,
  environment = process.env.NODE_ENV ?? 'development'
} = {}) {
  const app = express();
  const authRateLimit = createRateLimiter();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(
    helmet({ contentSecurityPolicy: environment === 'production' ? undefined : false })
  );
  app.use(cors({ origin: false, credentials: false }));
  app.use((request, response, next) => {
    const supplied = request.get('x-request-id');
    request.requestId = /^[a-zA-Z0-9_-]{8,64}$/.test(supplied ?? '')
      ? supplied
      : randomUUID();
    response.set('X-Request-Id', request.requestId);
    next();
  });
  app.use(
    express.json({
      limit: '1mb',
      type: (request) => request.path !== '/api/files' && request.is('application/json')
    })
  );

  const requireAuth = (request, _response, next) => {
    try {
      const token = parseCookies(request.headers.cookie)[config.sessionCookieName];
      request.auth = authService.authenticate(token);
      request.sessionToken = token;
      next();
    } catch (error) {
      next(error);
    }
  };
  const requireCsrf = (request, _response, next) => {
    try {
      authService.validateCsrf(request.auth.session, request.get('x-csrf-token'));
      next();
    } catch (error) {
      next(error);
    }
  };
  const requireSameOrigin = (request, _response, next) => {
    const source = request.get('origin') || request.get('referer');
    try {
      if (!source || new URL(source).hostname !== request.hostname)
        throw new HttpError(403, 'ORIGIN_INVALID', 'Solicitação não autorizada.');
      next();
    } catch (error) {
      next(
        error instanceof HttpError
          ? error
          : new HttpError(403, 'ORIGIN_INVALID', 'Solicitação não autorizada.')
      );
    }
  };
  const sessionCookie = (response, session) =>
    response.set(
      'Set-Cookie',
      serializeCookie(config.sessionCookieName, session.rawToken, {
        maxAge: config.sessionIdleDays * 86_400,
        secure: config.cookieSecure
      })
    );
  const refreshRotatedCookie = (request, response) => {
    if (request.auth.rotation) sessionCookie(response, request.auth.rotation);
  };

  app.get('/api/health', (_request, response) =>
    response
      .status(200)
      .json({ status: 'ok', service: 'backend', timestamp: new Date().toISOString() })
  );
  app.get('/api/setup/status', (_request, response) =>
    response.json(authService.getSetupStatus())
  );
  app.post(
    '/api/setup/initialize',
    authRateLimit,
    requireSameOrigin,
    async (request, response, next) => {
      try {
        response.status(201).json(await authService.initialize(request.body ?? {}));
      } catch (error) {
        next(error);
      }
    }
  );
  app.post(
    '/api/auth/login',
    authRateLimit,
    requireSameOrigin,
    async (request, response, next) => {
      try {
        const result = await authService.login(request.body ?? {}, {
          userAgent: request.get('user-agent'),
          ipAddress: request.ip
        });
        sessionCookie(response, result.session);
        response
          .status(200)
          .json({
            user: result.user,
            csrfToken: result.session.csrfToken,
            features: { automationsEnabled: config.automationsEnabled }
          });
      } catch (error) {
        next(error);
      }
    }
  );
  app.get('/api/auth/me', requireAuth, (request, response) => {
    refreshRotatedCookie(request, response);
    response.json({
      user: request.auth.user,
      features: { automationsEnabled: config.automationsEnabled }
    });
  });
  app.get('/api/system/metrics', requireAuth, (request, response) => {
    refreshRotatedCookie(request, response);
    response.json(systemMetricsService.snapshot(request.query.range));
  });
  app.get('/api/notes', requireAuth, (request, response, next) => {
    try {
      response.json({
        notes: noteService.list({
          query: request.query.q,
          sort: request.query.sort,
          from: request.query.from,
          to: request.query.to
        })
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/files', requireAuth, (request, response, next) => {
    try {
      response.json(
        fileService.list({
          query: request.query.q,
          sort: request.query.sort,
          order: request.query.order,
          limit: request.query.limit,
          offset: request.query.offset
        })
      );
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/shortcuts', requireAuth, (_request, response, next) => {
    try {
      response.json({ shortcuts: shortcutService.list() });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/shortcuts/pinned', requireAuth, (_request, response, next) => {
    try {
      response.json({ shortcuts: shortcutService.pinned(3) });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/automations', requireAuth, (_request, response, next) => {
    try {
      response.json({ automations: automationService.list() });
    } catch (error) {
      next(error);
    }
  });
  app.post(
    '/api/automations/:automationId/runs',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response.status(202).json({
          run: automationService.start(
            request.params.automationId,
            request.body?.parameters,
            request.auth.user.id
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );
  app.get('/api/automation-runs/:runId', requireAuth, (request, response, next) => {
    try {
      response.json({ run: automationService.getRun(request.params.runId) });
    } catch (error) {
      next(error);
    }
  });
  app.get(
    '/api/automation-runs/:runId/events',
    requireAuth,
    (request, response, next) => {
      try {
        const run = automationService.getRun(request.params.runId);
        response.set({
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'Content-Type': 'text/event-stream'
        });
        response.flushHeaders();
        const send = (event) =>
          response.write(`event: update\ndata: ${JSON.stringify(event)}\n\n`);
        const terminal = new Set(['cancelled', 'failed', 'succeeded', 'timed_out']);
        const listener = (event) => {
          send(event);
          if (terminal.has(event.status)) {
            automationService.events.off(run.id, listener);
            response.end();
          }
        };
        send(run);
        if (terminal.has(run.status)) return response.end();
        automationService.events.on(run.id, listener);
        request.on('close', () => automationService.events.off(run.id, listener));
      } catch (error) {
        next(error);
      }
    }
  );
  app.post(
    '/api/automation-runs/:runId/cancel',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response.json({ run: automationService.cancel(request.params.runId) });
      } catch (error) {
        next(error);
      }
    }
  );
  app.post(
    '/api/shortcuts',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response
          .status(201)
          .json({ shortcut: shortcutService.create(request.body ?? {}) });
      } catch (error) {
        next(error);
      }
    }
  );
  app.patch(
    '/api/shortcuts/:shortcutId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response.json({
          shortcut: shortcutService.update(
            request.params.shortcutId,
            request.body ?? {}
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );
  app.delete(
    '/api/shortcuts/:shortcutId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        shortcutService.remove(request.params.shortcutId);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );
  app.post(
    '/api/files',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const file = await fileService.upload(request, {
          originalName: request.get('x-file-name'),
          mimeType: request.get('content-type'),
          contentLength: request.get('content-length')
        });
        response.status(201).json({ file });
      } catch (error) {
        next(error);
      }
    }
  );
  const sendFile = (preview) => async (request, response, next) => {
    try {
      const { file, path } = await fileService.open(request.params.fileId, preview);
      const disposition = preview ? 'inline' : 'attachment';
      response
        .type(file.mimeType)
        .set('X-Content-Type-Options', 'nosniff')
        .set(
          'Content-Disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
        )
        .sendFile(path, (error) => error && next(error));
    } catch (error) {
      next(error);
    }
  };
  app.get('/api/files/:fileId/download', requireAuth, sendFile(false));
  app.get('/api/files/:fileId/preview', requireAuth, sendFile(true));
  app.delete(
    '/api/files/:fileId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        await fileService.remove(request.params.fileId);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );
  app.get('/api/notes/:noteId', requireAuth, (request, response, next) => {
    try {
      response.json({ note: noteService.get(request.params.noteId) });
    } catch (error) {
      next(error);
    }
  });
  app.post(
    '/api/notes',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response.status(201).json({ note: noteService.create(request.body ?? {}) });
      } catch (error) {
        next(error);
      }
    }
  );
  app.patch(
    '/api/notes/:noteId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response.json({
          note: noteService.update(request.params.noteId, request.body ?? {})
        });
      } catch (error) {
        next(error);
      }
    }
  );
  app.delete(
    '/api/notes/:noteId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        noteService.remove(request.params.noteId);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );
  app.get('/api/auth/csrf', requireAuth, (request, response) => {
    refreshRotatedCookie(request, response);
    response.json({ csrfToken: authService.issueCsrf(request.auth.session) });
  });
  app.get('/api/auth/sessions', requireAuth, (request, response) => {
    refreshRotatedCookie(request, response);
    response.json({
      sessions: authService.listSessions(request.auth.user.id, request.auth.session.id)
    });
  });
  app.delete(
    '/api/auth/sessions/:sessionId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      if (request.params.sessionId === request.auth.session.id)
        return next(
          new HttpError(422, 'CURRENT_SESSION', 'Use sair para encerrar esta sessão.')
        );
      if (!authService.revokeSession(request.params.sessionId, request.auth.user.id))
        return next(new HttpError(404, 'SESSION_NOT_FOUND', 'Sessão não encontrada.'));
      return response.status(204).end();
    }
  );
  app.post(
    '/api/auth/sessions/revoke-others',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response) => {
      const revoked = authService.revokeOtherSessions(
        request.auth.user.id,
        request.auth.session.id
      );
      response.json({ revoked });
    }
  );
  app.post(
    '/api/auth/logout',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response) => {
      authService.revoke(request.sessionToken);
      response.set(
        'Set-Cookie',
        serializeCookie(config.sessionCookieName, '', {
          clear: true,
          secure: config.cookieSecure
        })
      );
      response.status(204).end();
    }
  );

  app.use((_request, response) =>
    response.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Rota não encontrada.',
        requestId: _request.requestId
      }
    })
  );
  app.use((error, request, response, _next) => {
    void _next;
    if (!(error instanceof HttpError) && environment !== 'test')
      console.error('Unhandled request error', { name: error.name });
    response.status(error instanceof HttpError ? error.status : 500).json({
      error: {
        code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR',
        message:
          error instanceof HttpError ? error.message : 'Ocorreu um erro interno.',
        requestId: request.requestId,
        ...(error.fields ? { fields: error.fields } : {})
      }
    });
  });
  return app;
}
