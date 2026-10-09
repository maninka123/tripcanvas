// Browser-side fetch helper. Every API error has the same JSON shape
// ({ error: { code, message } }); this turns it into an `ApiRequestError`
// and distinguishes "could not reach the server" from "the server said no".

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly retryable: boolean) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiRequestError('You appear to be offline. Changes will be saved when the connection returns.', 0, 'network', true);
  }
  if (response.status === 401) {
    throw new ApiRequestError('Your session has ended. Please sign in again.', 401, 'unauthenticated', false);
  }
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    const retryable = response.status >= 500 || response.status === 429;
    throw new ApiRequestError(error?.message ?? `Request failed (${response.status}).`, response.status, error?.code ?? 'unknown', retryable);
  }
  return body as T;
}

export function signInUrl(returnTo: string): string {
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`;
}
