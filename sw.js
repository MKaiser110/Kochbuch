// sw.js — cached die App-Shell, damit die App offline startet.
// Rezeptdaten liegen ohnehin lokal in IndexedDB, nicht im Cache.

const CACHE_NAME = 'kochbuch-shell-v43';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/base.css',
  './css/shell.css',
  './css/controls.css',
  './css/overview.css',
  './css/detail.css',
  './css/sheets.css',
  './css/form.css',
  './css/cook.css',
  './css/responsive.css',
  './js/app.js',
  './js/core/db.js',
  './js/core/recipe-model.js',
  './js/core/recipe-query.js',
  './js/core/sync-adapter.js',
  './js/router.js',
  './js/services/export-import.js',
  './js/services/image-utils.js',
  './js/services/ocr-import.js',
  './js/services/pdf-export.js',
  './js/services/recipe-import/html-extract.js',
  './js/services/recipe-import/html-semantic.js',
  './js/services/recipe-import/index.js',
  './js/services/recipe-import/ingredient-parser.js',
  './js/services/recipe-import/json-ld.js',
  './js/services/recipe-import/microdata.js',
  './js/services/recipe-import/normalize.js',
  './js/services/recipe-import/ranking.js',
  './js/services/recipe-import/reader-extract.js',
  './js/services/recipe-import/schema-helpers.js',
  './js/services/recipe-import/validation.js',
  './js/services/scaling.js',
  './js/services/wake-lock.js',
  './js/sheets/add-menu.js',
  './js/sheets/data-menu.js',
  './js/sheets/ingredient-filter.js',
  './js/sheets/scan-import.js',
  './js/sheets/sheet.js',
  './js/sheets/url-import.js',
  './js/state.js',
  './js/utils/dom.js',
  './js/utils/files.js',
  './js/vendor/jspdf.umd.min.js',
  './js/view-lifecycle.js',
  './js/views/cook-mode.js',
  './js/views/detail.js',
  './js/views/overview.js',
  './js/views/recipe-form.js',
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
