// Bump this on any change to the caching strategy — activating a new version
// deletes every older cache (including the poisoned v1 cache that served stale
// HTML cache-first and pinned users to an old deployment).
const CACHE_NAME = 'unoverse-cache-v2';

// Static, rarely-changing assets that are safe to precache.
// NOTE: '/' (the app HTML) is deliberately NOT precached — HTML must always be
// network-first, otherwise every deploy leaves returning users on a stale UI.
const PRECACHE_ASSETS = [
  '/favicon.ico',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  // Activate immediately instead of waiting for every old tab to close, so a
  // deploy propagates on the next load rather than "whenever".
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cache) => (cache !== CACHE_NAME ? caches.delete(cache) : undefined))
        )
      )
      // Control already-open pages right away so the fixed fetch strategy (and
      // the one-time refresh in PWARegistration) applies without a manual reload.
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept: cross-origin traffic (the game backend), sockets, APIs,
  // dev hot-reload, and Next.js RSC navigation payloads (?_rsc=...) — all of
  // these must always reflect the live server, never a cache.
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('/_next/webpack-hmr') ||
    url.searchParams.has('_rsc')
  ) {
    return;
  }

  // Page navigations (HTML): NETWORK-FIRST. The freshly deployed document (and
  // the new hashed chunk URLs it references) always wins; the cache is only an
  // offline fallback. This is the fix for "old UI until I clear my cache".
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Keep an offline copy of the landing page only.
          if (response && response.ok && url.pathname === '/') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Everything else same-origin (hashed /_next/static chunks, icons, sounds):
  // CACHE-FIRST. Build assets are content-hashed, so a cached copy can never go
  // stale — a new deploy references new URLs, which miss the cache and are
  // fetched from the network.
  event.respondWith(
    caches
      .match(request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return response;
        });
      })
      .catch(() => undefined)
  );
});
