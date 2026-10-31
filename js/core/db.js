// db.js — IndexedDB-Zugriff. Alle Schreibzugriffe laufen zusätzlich durch
// einen austauschbaren Sync-Adapter (siehe sync-adapter.js), damit später
// ein echter iCloud-Sync ergänzt werden kann, ohne diese Datei anzufassen.

import { syncAdapter } from './sync-adapter.js';
import { migrateRecipe, normalizeTags, stripLegacyFields } from './recipe-model.js';

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

async function getStore(mode) {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllRecipes() {
  const store = await getStore('readonly');
  const recipes = await promisify(store.getAll());
  return recipes.map(migrateRecipe).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getRecipe(id) {
  const store = await getStore('readonly');
  return migrateRecipe(await promisify(store.get(id))) || null;
}

export async function saveRecipe(recipe) {
  recipe.updatedAt = Date.now();
  recipe.tags = normalizeTags(recipe.tags);
  stripLegacyFields(recipe);
  const store = await getStore('readwrite');
  await promisify(store.put(recipe));
  syncAdapter.push(recipe); // no-op solange kein Sync-Layer aktiv ist
  return recipe;
}

export async function deleteRecipe(id) {
  const store = await getStore('readwrite');
  await promisify(store.delete(id));
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
