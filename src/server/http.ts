import { z } from 'zod';

// Shared conventions for route handlers: one error shape, a request id on
// every response, structured logs without personal data, and a size cap on
// JSON bodies.

export type ApiErrorCode = 'unauthenticated' | 'forbidden' | 'not_found' | 'invalid_request' | 'conflict' | 'too_large' | 'rate_limited' | 'unavailable' | 'provider_error' | 'internal';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: ApiErrorCode, message: string, readonly fields?: Record<string, string[] | undefined>) {
    super(message);
    this.name = 'ApiError';
  }
}

export const unauthenticated = () => new ApiError(401, 'unauthenticated', 'Please sign in again.');
export const forbidden = (message = 'You do not have permission to do that.') => new ApiError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new ApiError(404, 'not_found', message);
export const badRequest = (message: string, fields?: Record<string, string[] | undefined>) => new ApiError(400, 'invalid_request', message, fields);

const MAX_JSON_BYTES = 1_000_000;

export async function readJson<T>(request: Request, schema: z.ZodType<T>, maxBytes = MAX_JSON_BYTES): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new ApiError(413, 'too_large', 'That request is too large.');
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, 'too_large', 'That request is too large.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw badRequest('The request body must be JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const first = parsed.error.issues[0];
    throw badRequest(first ? `${first.path.join('.') || 'Request'}: ${first.message}` : 'Please check the details and try again.', fields);
  }
  return parsed.data;
}

export function json(data: unknown, init: ResponseInit & { requestId?: string } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', headers.get('cache-control') ?? 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  if (init.requestId) headers.set('x-request-id', init.requestId);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  // One JSON object per line so Workers Logs / Logpush can index fields.
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

type Handler<C> = (request: Request, context: C & { requestId: string }) => Promise<Response>;

/** Wraps a route handler with request ids, error mapping and logging. */
export function route<C = object>(name: string, handler: Handler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID();
    const started = Date.now();
    try {
      const response = await handler(request, { ...(context ?? ({} as C)), requestId });
      response.headers.set('x-request-id', requestId);
      log('info', 'request', { route: name, method: request.method, status: response.status, ms: Date.now() - started, requestId });
      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        log(error.status >= 500 ? 'error' : 'warn', 'request_failed', { route: name, method: request.method, status: error.status, code: error.code, requestId });
        return json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status, requestId });
      }
      log('error', 'unhandled_error', { route: name, method: request.method, requestId, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : undefined });
      return json({ error: { code: 'internal', message: 'Something went wrong on our side. Your change was not saved — please try again.' } }, { status: 500, requestId });
    }
  };
}

/** Next/Vinext passes dynamic params as a promise. */
export type RouteParams<T extends Record<string, string>> = { params: Promise<T> };
