// db.js — IndexedDB-Zugriff. Alle Schreibzugriffe laufen zusätzlich durch
// einen austauschbaren Sync-Adapter (siehe sync-adapter.js), damit später
// ein echter iCloud-Sync ergänzt werden kann, ohne diese Datei anzufassen.

import { syncAdapter } from './sync-adapter.js';

const DB_NAME = 'kochbuch';
const DB_VERSION = 1;
const STORE = 'recipes';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('title', 'title', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

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
    ingredients: [],      // [{ name, amount, unit }]
    steps: [],            // [string]
    image: null,          // dataURL oder null
    prepTime: null,       // Minuten oder null
    source: null,         // URL oder null
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastCookedAt: null,   // Zeitstempel oder null — für Sortierung "zuletzt gekocht"
  };
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

// Migration: ältere Rezepte haben `category` (String) statt `tags` (Array).
function migrate(recipe) {
  if (!recipe) return recipe;
  if (!Array.isArray(recipe.tags)) {
    recipe.tags = normalizeTags(recipe.category ? [recipe.category] : []);
  }
  recipe.favorite = Boolean(recipe.favorite);
  recipe.rating = Number(recipe.rating) || 0;
  if (recipe.rating < 0) recipe.rating = 0;
  if (recipe.rating > 5) recipe.rating = 5;
  recipe.notes = typeof recipe.notes === 'string' ? recipe.notes : '';
  delete recipe.category;
  return recipe;
}

export async function getAllRecipes() {
  const store = await tx(STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.map(migrate).sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function getRecipe(id) {
  const store = await tx(STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(migrate(req.result) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecipe(recipe) {
  recipe.updatedAt = Date.now();
  recipe.tags = normalizeTags(recipe.tags);
  delete recipe.category;
  const store = await tx(STORE, 'readwrite');
  await new Promise((resolve, reject) => {
    const req = store.put(recipe);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  syncAdapter.push(recipe); // no-op solange kein Sync-Layer aktiv ist
  return recipe;
}

export async function deleteRecipe(id) {
  const store = await tx(STORE, 'readwrite');
  await new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  syncAdapter.delete(id);
}

export async function getAllTags() {
  const all = await getAllRecipes();
  const byKey = new Map();
  for (const r of all) {
    for (const t of r.tags) {
      if (!byKey.has(t.toLowerCase())) byKey.set(t.toLowerCase(), t);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

// ---------- Duplikaterkennung ----------

function normTitle(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normSource(u) {
  if (!u) return '';
  return String(u).trim().toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
}

/**
 * Sucht in `existing` ein Rezept mit gleichem Titel oder gleicher Quell-URL,
 * das nicht dasselbe Rezept (gleiche id) ist. Gibt das erste Treffer-Rezept
 * samt Grund zurück, sonst null.
 */
export function findDuplicate(recipe, existing) {
  const title = normTitle(recipe.title);
  const source = normSource(recipe.source);
  for (const other of existing) {
    if (other.id === recipe.id) continue;
    if (source && normSource(other.source) === source) return { recipe: other, reason: 'source' };
    if (title && normTitle(other.title) === title) return { recipe: other, reason: 'title' };
  }
  return null;
}

/** Alle vorkommenden Zutatennamen über alle Rezepte, dedupliziert & sortiert. */
export async function getAllIngredientNames() {
  const all = await getAllRecipes();
  const names = new Set();
  for (const r of all) {
    for (const ing of r.ingredients) {
      if (ing.name) names.add(ing.name.trim());
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'de'));
}

export async function markCooked(id) {
  const recipe = await getRecipe(id);
  if (!recipe) return null;
  recipe.lastCookedAt = Date.now();
  return saveRecipe(recipe);
}
