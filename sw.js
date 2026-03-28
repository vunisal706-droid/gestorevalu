// ╔══════════════════════════════════════════════╗
// ║  Service Worker – Capitulaciones PWA         ║
// ╚══════════════════════════════════════════════╝
const CACHE_NAME = 'capitulaciones-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html'
];

// ── Install: pre-cache app shell ─────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve icons from cache, network-first for rest ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const filename = url.pathname.split('/').pop();

  // Serve PWA icons directly (they are real files in the repo)
  if (filename.startsWith('icon-') && filename.endsWith('.png')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Network-first, fallback to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful GET responses
        if (e.request.method === 'GET' && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
