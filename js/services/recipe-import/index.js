// Robuster Rezeptimport: JSON-LD/Microdata zuerst, Reader-Text als Fallback.
// Ohne eigenen Backend-Proxy bleiben CORS- und Drittanbieter-Verfügbarkeit externe Grenzen.

import { extractFromHtml } from './html-extract.js';
import { extractFromReaderText } from './reader-extract.js';

export { extractFromHtml, extractFromReaderText };
export { parseIngredientLine } from './ingredient-parser.js';
export { normalizeImportedRecipe, normalizeIngredients, normalizeSteps } from './normalize.js';

const REQUEST_TIMEOUT_MS = 12000;
const MAX_RESPONSE_CHARS = 5_000_000;
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];
const READER_PREFIX = 'https://r.jina.ai/';

export async function importFromUrl(input) {
  const url = validateRecipeUrl(input);
  let partialText = '';

  // Fetch direct zuerst: vermeidet unnötige Weitergabe der URL an Drittanbieter.
  const direct = await fetchText(url);
  if (direct) {
    const recipe = safeExtractHtml(direct, url);
    if (recipe) return recipe;
  }

  // CORS-Proxys sind nur ein Best-Effort-Fallback.
  for (const makeProxyUrl of CORS_PROXIES) {
    const html = await fetchText(makeProxyUrl(url));
    if (!html) continue;
    const recipe = safeExtractHtml(html, url);
    if (recipe) return recipe;
  }

  // Reader-Fallback liefert normalerweise Markdown/Text statt HTML.
  partialText = await fetchText(READER_PREFIX + url) || '';
  if (partialText) {
    const recipe = safeExtractText(partialText, url);
    if (recipe) return recipe;
  }

  const error = new Error('IMPORT_FAILED');
  error.partialText = partialText.slice(0, 250000) || null;
  throw error;
}

export function validateRecipeUrl(input) {
  let parsed;
  try { parsed = new URL(String(input || '').trim()); }
  catch { throw new Error('INVALID_URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)
      || !parsed.hostname || parsed.username || parsed.password
      || isLocalHostname(parsed.hostname) || isIpLiteral(parsed.hostname)) {
    throw new Error('INVALID_URL');
  }
  return parsed.href;
}

function isLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || /\.(local|lan|home|internal|arpa)$/.test(host)) return true;
  if (!host.includes('.')) return true;
  if (host === '::1' || host === '::' || /^(fc|fd|fe[89ab]|ff)/i.test(host)) return true;
  const parts = host.split('.');
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
    const [a,b] = parts.map(Number);
    if (parts.some(p => Number(p) > 255)) return true;
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

function isIpLiteral(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

function safeExtractHtml(html, sourceUrl) {
  try { return extractFromHtml(html, sourceUrl); } catch { return null; }
}
function safeExtractText(text, sourceUrl) {
  try { return extractFromReaderText(text, sourceUrl); } catch { return null; }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (type && !/(text\/|application\/(xhtml\+xml|json))/i.test(type)) return null;
    const text = await response.text();
    return text.length <= MAX_RESPONSE_CHARS ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
