import { ApiError, log } from '@/server/http';

// Outbound calls to third-party providers: a timeout, an identifying
// User-Agent (required by OSM/Wikimedia usage policies), edge caching where
// the platform offers it, and failures surfaced as `provider_error` rather
// than crashing the request.

const DEFAULT_TIMEOUT_MS = 8000;

function userAgent(contact?: string): string {
  return `TripCanvas/1.0 (${contact || 'https://github.com/maninka123/tripcanvas'})`;
}

type CacheStorageWithDefault = CacheStorage & { default?: Cache };

function edgeCache(): Cache | null {
  const storage = (globalThis as { caches?: CacheStorageWithDefault }).caches;
  return storage?.default ?? null;
}

export async function fetchProviderJson<T>(provider: string, url: string, options: { init?: RequestInit; ttlSeconds?: number; contact?: string; timeoutMs?: number } = {}): Promise<T> {
  const method = options.init?.method ?? 'GET';
  const cache = method === 'GET' && options.ttlSeconds ? edgeCache() : null;
  const cacheKey = new Request(url);
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) return hit.json() as Promise<T>;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      ...options.init,
      headers: { 'user-agent': userAgent(options.contact), accept: 'application/json', ...(options.init?.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (error) {
    log('warn', 'provider_unreachable', { provider, ms: Date.now() - started, message: error instanceof Error ? error.message : String(error) });
    throw new ApiError(502, 'provider_error', `${provider} is not responding right now. Try again in a moment.`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    log('warn', 'provider_failed', { provider, status: response.status, ms: Date.now() - started });
    if (response.status === 429) throw new ApiError(503, 'rate_limited', `${provider} is busy. Try again shortly.`);
    throw new ApiError(502, 'provider_error', `${provider} could not answer that request.`);
  }
  const body = await response.text();
  if (cache) {
    const stored = new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${options.ttlSeconds}` } });
    await cache.put(cacheKey, stored).catch(() => undefined);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiError(502, 'provider_error', `${provider} returned an unexpected response.`);
  }
}

// Best-effort per-isolate rate limiting. It protects shared free providers
// from runaway clients; a production deployment with heavy traffic should
// use a Workers Rate Limiting binding or a paid provider (docs/OPERATIONS.md).
const buckets = new Map<string, { tokens: number; at: number }>();

export function rateLimit(key: string, perMinute: number): void {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: perMinute, at: now };
  bucket.tokens = Math.min(perMinute, bucket.tokens + ((now - bucket.at) / 60_000) * perMinute);
  bucket.at = now;
  if (bucket.tokens < 1) throw new ApiError(429, 'rate_limited', 'Too many requests. Please slow down for a moment.');
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  if (buckets.size > 5000) buckets.clear();
}
