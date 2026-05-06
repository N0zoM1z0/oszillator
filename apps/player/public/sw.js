/* global self, caches, URL, fetch */

const CACHE_NAME = 'oszillator-shell-v1';
const SHELL_ASSETS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached ?? caches.match('/'))
    )
  );
});
