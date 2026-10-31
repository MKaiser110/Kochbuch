// Offline cache for the app shell. First-party modules and stylesheets are
// discovered from index.html and their imports, so new files need no list entry.
const CACHE_NAME = 'kochbuch-shell';

async function collectAppFiles() {
  const root = new URL('./', self.location.href);
  const urls = new Map();
  const pending = [];
  const add = (reference, base) => {
    let url;
    try {
      url = new URL(reference, base);
    } catch {
      return;
    }
    if (url.origin !== self.location.origin || url.protocol !== 'http:' && url.protocol !== 'https:') return;
    url.hash = '';
    if (urls.has(url.href)) return;
    urls.set(url.href, url);
    if (/\.m?js$/.test(url.pathname)) pending.push({ url, type: 'js' });
    else if (/\.css$/.test(url.pathname)) pending.push({ url, type: 'css' });
    else if (/\.json$/.test(url.pathname)) pending.push({ url, type: 'json' });
  };

  const indexUrl = new URL('index.html', root);
  add('./', root);
  add(indexUrl.href, root);
  add('manifest.json', root);

  const indexResponse = await fetch(indexUrl);
  if (!indexResponse.ok) throw new Error('Could not read app entry point');
  const html = await indexResponse.text();
  for (const match of html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)=["']([^"']+)["'][^>]*>/gi)) {
    add(match[1], indexUrl);
  }

  const inspected = new Set();
  while (pending.length) {
    const { url, type } = pending.shift();
    if (inspected.has(url.href)) continue;
    inspected.add(url.href);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not read app resource: ${url.pathname}`);
    const source = await response.text();

    if (type === 'js') {
      const imports = /\bimport\s*(?:\(\s*)?["']([^"']+)["']|\bfrom\s*["']([^"']+)["']/g;
      for (const match of source.matchAll(imports)) add(match[1] || match[2], url);
      const localUrls = /\bnew\s+URL\(\s*["']([^"']+)["']/g;
      for (const match of source.matchAll(localUrls)) add(match[1], url);
    } else if (type === 'css') {
      const assets = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
      for (const match of source.matchAll(assets)) add(match[1].trim(), url);
    } else if (type === 'json') {
      try {
        const manifest = JSON.parse(source);
        for (const icon of manifest.icons || []) add(icon.src, url);
      } catch {
        throw new Error('Could not read app manifest');
      }
    }
  }

  return [...urls.values()];
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const files = await collectAppFiles();
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(files);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('kochbuch-shell-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // External resources, such as OCR downloads and recipe sites, are not cached.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        return (await caches.match('./index.html')) || Response.error();
      }
      return Response.error();
    }
  })());
});
