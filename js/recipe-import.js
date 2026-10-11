// recipe-import.js
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

import { blankRecipe, normalizeTags } from './db.js';

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

// Letzter automatischer Versuch, bevor auf manuelles Einfügen zurückgefallen
// wird: ein Reader-Dienst, der die Seite serverseitig lädt und als
// lesbaren Text zurückgibt (kein HTML/JSON-LD mehr, aber CORS-offen und in
// der Praxis deutlich zuverlässiger erreichbar als die generischen Proxies).
const READER_PREFIX = 'https://r.jina.ai/';

function tryDecodeSharedRecipeUrl(parsedUrl) {
  const hash = parsedUrl.hash.slice(1);
  if (!hash.startsWith('share=')) return null;
  try {
    const value = hash.slice('share='.length);
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || payload.type !== 'kochbuch-recipe' || !payload.recipe) return null;
    const recipe = { ...payload.recipe };
    if (!recipe.title || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) return null;
    return recipe;
  } catch {
    return null;
  }
}

export async function importFromUrl(url) {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('INVALID_URL');
  }

  const sharedRecipe = tryDecodeSharedRecipeUrl(parsedUrl);
  if (sharedRecipe) return sharedRecipe;

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

/** Extraktion aus bereits vorliegendem HTML (Paste-Fallback nutzt das auch). */
export function extractFromHtml(html, sourceUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ldRecipes = findLdJsonRecipes(doc)
    .map(data => mapSchemaOrgToRecipe(data, sourceUrl))
    .filter(isUsableRecipe)
    .sort((a, b) => recipeQuality(b) - recipeQuality(a));
  if (ldRecipes.length) return ldRecipes[0];
  const microdata = extractMicrodata(doc, sourceUrl);
  if (microdata && isUsableRecipe(microdata)) return microdata;
  return null;
}

// Viele ältere/kleinere Rezeptseiten nutzen schema.org-Microdata
// (itemprop-Attribute) statt JSON-LD. Zweite, unabhängige Extraktionsmethode.
function extractMicrodata(doc, sourceUrl) {
  const scope = doc.querySelector('[itemtype*="schema.org/Recipe"]');
  if (!scope) return null;

  const getProp = (name) => scope.querySelector(`[itemprop="${name}"]`);
  const getAllProp = (name) => [...scope.querySelectorAll(`[itemprop="${name}"]`)];

  const title = getProp('name')?.textContent.trim()
    || getProp('name')?.getAttribute('content') || '';
  if (!title) return null;

  const r = blankRecipe();
  r.title = title;
  r.tags = tagsFromSchema(getProp('recipeCategory')?.textContent, getProp('recipeCuisine')?.textContent);
  r.servingsBase = parseServings(getProp('recipeYield')?.textContent
    || getProp('recipeYield')?.getAttribute('content')) ?? 4;
  r.prepTime = parseIsoDuration(
    getProp('totalTime')?.getAttribute('datetime') || getProp('cookTime')?.getAttribute('datetime')
  ) ?? null;
  r.source = sourceUrl || null;
  const imgEl = getProp('image');
  r.image = imgEl?.getAttribute('src') || imgEl?.getAttribute('content') || null;

  r.ingredients = getAllProp('recipeIngredient')
    .map(el => parseIngredientLine(el.textContent.trim()))
    .filter(ingredient => isLikelyIngredient(ingredient.name));
  r.steps = getAllProp('recipeInstructions')
    .map(el => el.textContent.trim())
    .filter(isLikelyStep);

  if (!isUsableRecipe(r)) return null;
  return r;
}

// Der Reader-Fallback verwendet ausschließlich erkannte Zutaten- und
// Zubereitungsabschnitte. Seitentext außerhalb dieser Abschnitte wird ignoriert.
export function extractFromReaderText(text, sourceUrl) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const titleLine = lines.find(l => /^title:\s*/i.test(l))
    || lines.find(l => /^#\s+/.test(l))
    || lines.find(l => /^[A-ZÄÖÜ][\wÄÖÜäöü\s&()\-/:,.'"]{2,80}$/.test(l));
  const r = blankRecipe();
  if (titleLine) {
    r.title = titleLine.replace(/^title:\s*/i, '').replace(/^#+\s*/, '').trim();
  }
  if (!r.title || !/^[\wÄÖÜäöü\s&()\-/:,.'"/]{3,120}$/.test(r.title) || /^(home|startseite|search|suche|about|kontakt|impressum|datenschutz|privacy|page|homepage|category|tags?)$/i.test(r.title)) {
    return null;
  }
  r.source = sourceUrl || null;

  const ingredients = [];
  const steps = [];
  let section = null;
  let sawRecipeStructure = false;

  for (const line of lines) {
    if (line === titleLine || /^(url source|markdown content|title):/i.test(line)) continue;
    const heading = sectionHeading(line);
    if (heading) {
      if (heading === 'ignore') continue;
      section = heading;
      sawRecipeStructure = true;
      continue;
    }

    const item = line.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
    if (!item || /^https?:\/\//i.test(item)) continue;

    if (section === 'ingredients') {
      const ingredient = parseIngredientLine(item);
      if (isLikelyIngredient(ingredient.name)) ingredients.push(ingredient);
    } else if (section === 'steps') {
      if (isLikelyStep(item)) steps.push(item);
    }
  }

  if (!sawRecipeStructure) return null;
  r.ingredients = ingredients;
  r.steps = steps;

  return isUsableRecipe(r) ? r : null;
}

function findLdJsonRecipes(doc) {
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  const recipes = [];
  for (const s of scripts) {
    let data;
    try { data = JSON.parse(s.textContent); } catch { continue; }
    recipes.push(...searchForRecipes(data));
  }
  return recipes;
}

function searchForRecipes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) {
    return node.flatMap(searchForRecipes);
  }
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  const recipes = types.includes('Recipe') ? [node] : [];
  for (const [key, value] of Object.entries(node)) {
    if (key !== '@type' && value && typeof value === 'object') {
      recipes.push(...searchForRecipes(value));
    }
  }
  return recipes;
}

function mapSchemaOrgToRecipe(data, sourceUrl) {
  const r = blankRecipe();
  r.title = typeof data.name === 'string' ? data.name.trim() : '';
  r.tags = tagsFromSchema(data.recipeCategory, data.recipeCuisine);
  r.servingsBase = parseServings(data.recipeYield) ?? 4;
  r.prepTime = parseIsoDuration(data.totalTime || data.cookTime) ?? null;
  r.source = sourceUrl || null;
  r.image = firstOf(imageUrl(data.image)) || null;

  const rawIngredients = data.recipeIngredient || data.ingredients || [];
  r.ingredients = (Array.isArray(rawIngredients) ? rawIngredients : [rawIngredients])
    .filter(item => typeof item === 'string' && item.trim())
    .map(parseIngredientLine)
    .filter(ingredient => isLikelyIngredient(ingredient.name));

  const instructions = data.recipeInstructions;
  r.steps = flattenInstructions(instructions);

  return r;
}

// recipeCategory/recipeCuisine können String, kommaseparierter String oder
// Array sein. Ergebnis: bereinigte Tag-Liste (max. 5).
function tagsFromSchema(...values) {
  const parts = [];
  for (const v of values) {
    if (!v) continue;
    const list = Array.isArray(v) ? v : [v];
    for (const item of list) parts.push(...String(item).split(/[,;]/));
  }
  return normalizeTags(parts).slice(0, 5);
}

function firstOf(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

function imageUrl(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return imageUrl(img[0]);
  if (img.url) return img.url;
  return null;
}

function parseServings(y) {
  if (!y) return null;
  const str = Array.isArray(y) ? y[0] : y;
  const match = String(str).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// z.B. "PT30M" -> 30
function parseIsoDuration(iso) {
  if (!iso) return null;
  const match = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  return h * 60 + m || null;
}

function flattenInstructions(instructions) {
  if (!instructions) return [];
  if (typeof instructions === 'string') {
    return instructions.split(/\n+/).map(s => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(instructions)) return [];
  const steps = [];
  for (const item of instructions) {
    if (typeof item === 'string') { steps.push(item); continue; }
    if (!item || typeof item !== 'object') continue;
    if (item['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) {
      steps.push(...flattenInstructions(item.itemListElement));
      continue;
    }
    if (typeof item.text === 'string') steps.push(item.text);
  }
  return steps.map(step => step.trim()).filter(Boolean);
}

function sectionHeading(line) {
  const heading = line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').replace(/:$/, '').trim().toLocaleLowerCase('de');
  if (/^(zutaten|ingredients?)(\b| für\b)/.test(heading)) return 'ingredients';
  if (/^(zubereitung|zubereitungsweise|anleitung|kochschritte|schritte|instructions?|directions?|method|preparation)(\b|:)/.test(heading)) {
    return 'steps';
  }
  if (/^(nährwerte|naehrwerte|nutrition|notizen|notes|tipps|tips|bewertung|reviews?|comments?|related|ähnliche rezepte|ähnliche artikel|quelle|source|equipment|ausrüstung)(\b|:)/.test(heading)) {
    return 'ignore';
  }
  if (/^#{1,6}\s/.test(line)) return 'ignore';
  return null;
}

function isUsableRecipe(recipe) {
  const title = String(recipe.title || '').trim();
  const ingredients = recipe.ingredients.filter(ingredient => isLikelyIngredient(ingredient.name));
  const steps = recipe.steps.filter(isLikelyStep);
  if (title.length < 3 || title.length > 140 || ingredients.length < 2 || steps.length === 0) {
    return false;
  }
  return !/^(home|startseite|rezepte?|recipes?|search|suche|login|anmelden|404|not found)$/i.test(title);
}

function isLikelyIngredient(name) {
  const value = String(name || '').trim();
  return value.length >= 2 && value.length <= 160
    && !/^(home|startseite|rezepte?|recipes?|search|suche|login|anmelden|über uns|kontakt|impressum|datenschutz|privacy|menu|menü|share|teilen|print|drucken|save recipe|jump to|skip to)$/i.test(value);
}

function isLikelyStep(step) {
  const value = String(step || '').trim();
  return value.length >= 12 && value.length <= 1200
    && !/^(prep time|cook time|total time|servings|nutrition|calories|source|navigation|startseite|über uns|kontakt|impressum|share|print|save recipe)\s*[:.]?$/i.test(value);
}

function recipeQuality(recipe) {
  const measuredIngredients = recipe.ingredients.filter(ingredient =>
    ingredient.amount !== null || ingredient.unit
  ).length;
  return Math.min(recipe.ingredients.length, 30)
    + Math.min(recipe.steps.length, 20) * 2
    + measuredIngredients * 2;
}

// Zerlegt eine freie Zutatenzeile ("200 g Mehl") in { amount, unit, name }.
// Best-effort — Nutzer kann das Ergebnis vor dem Speichern korrigieren.
const UNITS = ['g', 'kg', 'ml', 'l', 'el', 'tl', 'stk', 'stück', 'prise', 'bund', 'dose', 'pck', 'zehe', 'zehen'];

export function parseIngredientLine(line) {
  const text = String(line).trim();
  const match = text.match(/^([\d.,\/]+)\s*([a-zA-ZÄÖÜäöü]*)\s+(.*)$/);
  if (!match) return { amount: null, unit: null, name: text };
  let [, amountStr, unitStr, rest] = match;
  const amount = parseAmount(amountStr);
  const unitLower = unitStr.toLowerCase();
  if (UNITS.includes(unitLower)) {
    return { amount, unit: unitStr, name: rest.trim() };
  }
  // keine erkannte Einheit -> Wort gehört zum Namen
  return { amount, unit: null, name: (unitStr + ' ' + rest).trim() };
}

function parseAmount(str) {
  if (str.includes('/')) {
    const [a, b] = str.split('/').map(Number);
    return b ? a / b : null;
  }
  const n = parseFloat(str.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}
