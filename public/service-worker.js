const CACHE = 'nightjar-shell-v10';
const SHELL = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/version.json' || url.pathname === '/service-worker.js') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            void caches.open(CACHE).then((cache) => cache.put('/', clone));
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
  }
});
