// Service worker for Travel Mode. Served from a route (not a static file) so
// it can live at /sw.js with site-wide scope. Strategy:
// - Travel Mode pages and the trip JSON they use: network first, falling back
//   to the last copy when offline.
// - Hashed build assets: cache first (they never change for a URL).
// Nothing else is cached. Signing out clears the caches (see UserMenu).

const SCRIPT = `
const VERSION = 'tripcanvas-v1';
const PAGES = 'tc-pages-' + VERSION;
const ASSETS = 'tc-assets-' + VERSION;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('tc-') && !key.endsWith(VERSION)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

const isTravelPage = (url) => /^\\/trips\\/[^/]+\\/travel\\/?$/.test(url.pathname);
const isTripData = (url) => /^\\/api\\/trips\\/[^/]+$/.test(url.pathname);
const isAsset = (url) => url.pathname.startsWith('/assets/') || url.pathname.startsWith('/_next/static/');

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isTravelPage(url) || isTripData(url)) event.respondWith(networkFirst(request, PAGES));
  else if (isAsset(url)) event.respondWith(cacheFirst(request));
});

self.addEventListener('message', (event) => {
  // The open Travel Mode page sends the URLs it already loaded, so it works
  // offline after the very first visit.
  if (event.data && event.data.type === 'precache' && Array.isArray(event.data.urls)) {
    event.waitUntil(Promise.all(event.data.urls.map(async (raw) => {
      try {
        const url = new URL(raw, self.location.origin);
        if (url.origin !== self.location.origin) return;
        const cacheName = isAsset(url) ? ASSETS : (isTravelPage(url) || isTripData(url)) ? PAGES : null;
        if (!cacheName) return;
        const response = await fetch(url, { credentials: 'same-origin' });
        if (response.ok && !response.redirected) await (await caches.open(cacheName)).put(url, response);
      } catch {}
    })));
  }
  if (event.data === 'clear') event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('tc-')).map((key) => caches.delete(key)))));
});
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
    },
  });
}
