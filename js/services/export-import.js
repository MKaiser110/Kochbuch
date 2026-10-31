// export-import.js — Rezepte als einzelne JSON-Datei sichern/wiederherstellen.
// Dient als einfaches manuelles "Backup & Übertragen", solange kein
// automatischer Sync-Layer existiert (siehe core/sync-adapter.js).

import { getAllRecipes, saveRecipe } from '../core/db.js';
import { normalizeTags, findDuplicate, clampRating } from '../core/recipe-model.js';
import { downloadJson, readJsonFile } from '../utils/files.js';

const FORMAT_VERSION = 3; // 3: favorites, rating, notes

export async function exportRecipesToFile() {
  const recipes = await getAllRecipes();
  const payload = {
    format: 'kochbuch-export',
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
  };
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(payload, `kochbuch-export-${date}.json`);
  return recipes.length;
}

export async function exportRecipeToFile(recipe) {
  const payload = {
    format: 'kochbuch-recipe-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    recipe,
  };
  const safeTitle = String(recipe.title || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim().slice(0, 100) || 'rezept';
  downloadJson(payload, `rezept-${safeTitle}.json`);
}

/**
 * Importiert Rezepte aus einer zuvor exportierten JSON-Datei.
 * Rezepte mit bereits vorhandener id werden überschrieben (Update),
 * neue ids werden hinzugefügt.
 *
 * Duplikat-Schutz: Rezepte mit anderer id, aber gleichem Titel oder gleicher
 * Quelle wie ein bereits vorhandenes, gelten als mögliche Duplikate. Gibt es
 * welche, wird `askAboutDuplicates(anzahl)` aufgerufen (async, liefert true =
 * trotzdem importieren, false = überspringen). Ohne Callback werden sie
 * importiert.
 */
export async function importRecipesFromFile(file, askAboutDuplicates) {
  const data = await readJsonFile(file);
  const recipes = Array.isArray(data) ? data : data.recipes;
  if (!Array.isArray(recipes)) throw new Error('INVALID_FORMAT');
  return importRecipes(recipes, askAboutDuplicates);
}

export async function importRecipeFromFile(file, askAboutDuplicates) {
  const data = await readJsonFile(file);
  if (data?.format !== 'kochbuch-recipe-export' || !data.recipe || typeof data.recipe !== 'object') {
    throw new Error('INVALID_FORMAT');
  }
  return importRecipes([data.recipe], askAboutDuplicates);
}

/** Übernimmt nur bekannte Felder und migriert category -> tags. Gibt null für ungültige Einträge zurück. */
function normalizeImportedRecipe(r) {
  if (!r || typeof r !== 'object' || !r.title || !r.id) return null;
  const tags = Array.isArray(r.tags) ? r.tags : (r.category ? [r.category] : []);
  return {
    id: r.id,
    title: r.title,
    tags: normalizeTags(tags),
    favorite: Boolean(r.favorite),
    rating: clampRating(r.rating),
    notes: typeof r.notes === 'string' ? r.notes : '',
    servingsBase: Number.isFinite(r.servingsBase) ? r.servingsBase : 4,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    image: r.image || null,
    prepTime: r.prepTime ?? null,
    source: r.source ?? null,
    createdAt: r.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

async function importRecipes(recipes, askAboutDuplicates) {
  const valid = [];
  let invalid = 0;
  for (const r of recipes) {
    const normalized = normalizeImportedRecipe(r);
    if (normalized) valid.push(normalized);
    else invalid++;
  }

  // Mögliche Duplikate gegen den bestehenden Bestand ermitteln.
  const existing = await getAllRecipes();
  const existingIds = new Set(existing.map(r => r.id));
  const dupIds = new Set(
    valid.filter(r => !existingIds.has(r.id) && findDuplicate(r, existing)).map(r => r.id)
  );

  let includeDuplicates = true;
  if (dupIds.size > 0 && askAboutDuplicates) {
    includeDuplicates = await askAboutDuplicates(dupIds.size);
  }

  let imported = 0;
  let duplicatesSkipped = 0;
  for (const r of valid) {
    if (!includeDuplicates && dupIds.has(r.id)) { duplicatesSkipped++; continue; }
    await saveRecipe(r);
    imported++;
  }
  return { imported, skipped: invalid, duplicatesSkipped, total: recipes.length };
}
