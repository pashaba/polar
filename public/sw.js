const CACHE_NAME = 'polar-web-id-v1';
const STATIC_ASSETS = [
  '/style.css',
  '/dashboard.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Jangan cache API sama sekali — data harus selalu fresh
  if (url.pathname.startsWith('/api/')) return;

  // Static asset: cache-first
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Halaman (/dashboard, /login): network-first, fallback ke cache kalau offline
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
