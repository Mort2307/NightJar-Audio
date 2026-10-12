// Push routes are data supplied by notification senders. Restrict them to
// same-origin app paths to prevent a tampered notification opening a third-party
// destination or changing the registered PWA's browsing origin.
const safePushRoute = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/discover';
  try {
    const target = new URL(value, self.location.origin);
    return target.origin === self.location.origin
      ? target.pathname + target.search + target.hash
      : '/discover';
  } catch {
    return '/discover';
  }
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = safePushRoute(event.notification?.data?.route);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing) {
        try {
          existing.postMessage({ type: 'NIGHTJAR_PUSH_OPEN', route });
        } catch {}
        return existing.focus();
      }
      return self.clients.openWindow(route);
    })
  );
});

try {
  importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyBHgKqK9SRYJoWWrKH0DeMX4I35AVIoMJs',
    authDomain: 'nightjar-audio.firebaseapp.com',
    projectId: 'nightjar-audio',
    storageBucket: 'nightjar-audio.firebasestorage.app',
    messagingSenderId: '981039114349',
    appId: '1:981039114349:web:80defbb59c7a56889af764',
  });

  const nightjarMessaging = firebase.messaging();
  nightjarMessaging.onBackgroundMessage((payload) => {
    const data = payload?.data ?? {};
    const title = data.title || 'Nightjar update';
    const body = data.body || 'Open Nightjar to view this update.';
    const route = data.route || '/discover';

    return self.registration.showNotification(title, {
      body,
      icon: '/nightjar-home-192.png',
      badge: '/nightjar-home-192.png',
      tag: data.notificationId ? 'nightjar:' + data.notificationId : undefined,
      renotify: false,
      data: { route, notificationId: data.notificationId || null },
    });
  });
} catch (error) {
  // Core PWA behaviour remains available even if messaging SDK loading fails.
}

const CACHE = 'nightjar-shell-v12';
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

  // The recovery page must bypass the cached app shell even when the app fails to boot.
  if (url.pathname === '/recover.html' || url.pathname === '/version.json' || url.pathname === '/service-worker.js') {
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
