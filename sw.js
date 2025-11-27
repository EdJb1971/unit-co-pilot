const CACHE_NAME = 'unit-copilot-cache-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.css',
  '/index.tsx'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE).catch(() => {/* ignore failures */});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map(k => {
      if (k !== CACHE_NAME) return caches.delete(k);
      return Promise.resolve();
    })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Basic cache-first strategy
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});
