// sw.js — cached die App-Shell, damit die App offline startet.
// Rezeptdaten liegen ohnehin lokal in IndexedDB, nicht im Cache.

const CACHE_NAME = 'kochbuch-shell-v14';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/sync-adapter.js',
  './js/scaling.js',
  './js/recipe-import.js',
  './js/ocr-import.js',
  './js/export-import.js',
  './js/image-utils.js',
  './js/wake-lock.js',
  './js/pdf-export.js',
  './js/vendor/jspdf.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Externe Ressourcen (z.B. CDN, Rezeptseiten für Import) nicht cachen —
  // nur die eigene App-Shell (Cache-First mit Netzwerk-Fallback).
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
