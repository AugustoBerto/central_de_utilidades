/* eslint-disable vue/one-component-per-file */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('returns public service health without internal details', async () => {
    const response = await request(createApp({ environment: 'test' })).get(
      '/api/health'
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'backend' });
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  });

  it('correlaciona respostas de erro sem expor detalhes internos', async () => {
    const response = await request(createApp({ environment: 'test' })).get(
      '/api/inexistente'
    );

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });
});
