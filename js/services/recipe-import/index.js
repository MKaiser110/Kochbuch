// recipe-import/index.js
//
// Import aus einer Rezept-URL. Die meisten Rezeptseiten betten strukturierte
// Daten nach schema.org/Recipe als <script type="application/ld+json"> ein —
// das ist der zuverlässigste, seitenunabhängige Weg und wird hier genutzt.
//
// Wichtige Einschränkung (technisch unumgänglich ohne eigenen Server):
// Ein Fetch direkt aus dem Browser scheitert bei den meisten Seiten an CORS,
// weil die Website keine Cross-Origin-Anfragen erlaubt. Deshalb: erst
// direkter Versuch, dann automatisch über einen öffentlichen CORS-Proxy
// (der die Seite serverseitig abruft und mit CORS-Headern zurückgibt) —
// das deckt die große Mehrheit der Fälle ab. Nur wenn auch das fehlschlägt,
// Fallback auf eingefügten Seitentext/HTML (Nutzer kopiert manuell hinein).
//
// Der Proxy ist ein Drittanbieter-Dienst ohne Verfügbarkeitsgarantie. Für
// einen produktiven Einsatz wäre ein eigener kleiner Proxy (z.B. eine
// Cloudflare Worker-Funktion) robuster, aber dann ist "keine Serveranbindung
// nötig" aus den Vorgaben nicht mehr erfüllt — daher hier bewusst so gelöst.

import { extractFromHtml } from './html-extract.js';
import { extractFromReaderText } from './reader-extract.js';

export { extractFromHtml, extractFromReaderText };
export { parseIngredientLine } from './ingredient-parser.js';

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

// Letzter automatischer Versuch, bevor auf manuelles Einfügen zurückgefallen
// wird: ein Reader-Dienst, der die Seite serverseitig lädt und als
// lesbaren Text zurückgibt (kein HTML/JSON-LD mehr, aber CORS-offen und in
// der Praxis deutlich zuverlässiger erreichbar als die generischen Proxies).
const READER_PREFIX = 'https://r.jina.ai/';

export async function importFromUrl(url) {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('INVALID_URL');
  }

  // 1) direkter Fetch — funktioniert nur, wenn die Zielseite CORS erlaubt
  const direct = await tryDirectFetch(url);
  if (direct) {
    const r = extractFromHtml(direct, url);
    if (r) return r;
  }

  // 2) über CORS-Proxys — liefert echtes HTML, gleiche Extraktion
  for (const buildProxyUrl of CORS_PROXIES) {
    const html = await tryFetchText(buildProxyUrl(url));
    if (!html || html.length < 200) continue;
    const r = extractFromHtml(html, url);
    if (r) return r;
  }

  // 3) Reader-Fallback — liefert nur Text, dafür sehr zuverlässig erreichbar
  const readerText = await tryFetchText(READER_PREFIX + url);
  if (readerText && readerText.length > 100) {
    const r = extractFromReaderText(readerText, url);
    if (r) return r;
  }

  const e = new Error('IMPORT_FAILED');
  e.partialText = readerText || null; // falls vorhanden: für manuellen Fallback vorbefüllen
  throw e;
}

async function tryDirectFetch(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function tryFetchText(fetchUrl) {
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
