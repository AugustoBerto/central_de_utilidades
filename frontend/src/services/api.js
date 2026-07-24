export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message ?? 'Não foi possível concluir a solicitação.');
    this.status = status;
    this.code = payload?.error?.code ?? 'REQUEST_FAILED';
    this.fields = payload?.error?.fields ?? {};
    this.requestId = payload?.error?.requestId ?? null;
  }
}

let unauthorizedHandler;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export async function api(path, options = {}) {
  const { body, headers: customHeaders, ...requestOptions } = options;
  const response = await fetch(path, {
    credentials: 'include',
    ...requestOptions,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...customHeaders
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new ApiError(response.status, payload);
    if (error.status === 401) unauthorizedHandler?.();
    throw error;
  }
  return payload;
}
