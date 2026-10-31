// recipe-model.js — Rezept-Datenmodell: Grundgerüst, Normalisierung,
// Migration älterer Formate und Duplikaterkennung. Reine Logik, kein DOM,
// kein Datenbankzugriff.

function uuid() {
  return (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }));
}

/** Leeres Rezept-Grundgerüst — verbindliches einheitliches Format. */
export function blankRecipe() {
  return {
    id: uuid(),
    title: '',
    tags: [],             // [string] — ersetzt die frühere Einzel-Kategorie
    favorite: false,
    rating: 0,
    notes: '',
    servingsBase: 4,
    servingsKnown: false,
    ingredients: [],      // [{ name, amount, unit }]
    steps: [],            // [string]
    importWarnings: [],
    reviewRequired: false,
    image: null,          // dataURL oder null
    prepTime: null,       // Minuten oder null
    source: null,         // URL oder null
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Bewertung auf eine ganze Zahl-Spanne 0–5 begrenzen (ungültig -> 0). */
export function clampRating(value) {
  return Math.max(0, Math.min(5, Number(value) || 0));
}

/** Tags bereinigen: trimmen, Leerraum glätten, Duplikate (ohne Groß/Klein) entfernen. */
export function normalizeTags(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const t = String(raw).replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Aufteilen von Freitext ("a, b; c") in Tags. */
export function parseTagInput(text) {
  return normalizeTags(String(text || '').split(/[,;]/));
}

/** Entfernt nicht mehr verwendete Rezeptfelder aus importierten/gespeicherten Daten. */
export function stripLegacyFields(recipe) {
  delete recipe.lastCookedAt;
  delete recipe.category;
  delete recipe.description;
  delete recipe.cuisine;
  delete recipe.difficulty;
  delete recipe.nutrition;
  delete recipe.cookTime;
  delete recipe.totalTime;
}

/** Migration beim Lesen: ältere Rezepte haben `category` (String) statt `tags` (Array). */
export function migrateRecipe(recipe) {
  if (!recipe) return recipe;
  if (!Array.isArray(recipe.tags)) {
    recipe.tags = normalizeTags(recipe.category ? [recipe.category] : []);
  }
  recipe.favorite = Boolean(recipe.favorite);
  recipe.rating = clampRating(recipe.rating);
  recipe.notes = typeof recipe.notes === 'string' ? recipe.notes : '';
  stripLegacyFields(recipe);
  return recipe;
}

// ---------- Duplikaterkennung ----------

function normalizeTitle(title) {
  return String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeSource(url) {
  if (!url) return '';
  return String(url).trim().toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
}

/**
 * Sucht in `existing` ein Rezept mit gleichem Titel oder gleicher Quell-URL,
 * das nicht dasselbe Rezept (gleiche id) ist. Gibt das erste Treffer-Rezept
 * samt Grund zurück, sonst null.
 */
export function findDuplicate(recipe, existing) {
  const title = normalizeTitle(recipe.title);
  const source = normalizeSource(recipe.source);
  for (const other of existing) {
    if (other.id === recipe.id) continue;
    if (source && normalizeSource(other.source) === source) return { recipe: other, reason: 'source' };
    if (title && normalizeTitle(other.title) === title) return { recipe: other, reason: 'title' };
  }
  return null;
}
