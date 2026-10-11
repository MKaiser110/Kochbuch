// export-import.js — Rezepte als einzelne JSON-Datei sichern/wiederherstellen.
// Dient als einfaches manuelles "Backup & Übertragen", solange kein
// automatischer Sync-Layer existiert (siehe sync-adapter.js).

import { getAllRecipes, saveRecipe, normalizeTags, findDuplicate } from './db.js';

const FORMAT_VERSION = 3; // 3: favorites, rating, notes

export async function exportRecipesToFile() {
  const recipes = await getAllRecipes();
  const payload = {
    format: 'kochbuch-export',
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `kochbuch-export-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return recipes.length;
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
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }

  const recipes = Array.isArray(data) ? data : data.recipes;
  if (!Array.isArray(recipes)) throw new Error('INVALID_FORMAT');

  // Gültige Rezepte normalisieren (inkl. Migration category -> tags).
  const valid = [];
  let invalid = 0;
  for (const r of recipes) {
    if (!r || typeof r !== 'object' || !r.title || !r.id) { invalid++; continue; }
    const tags = Array.isArray(r.tags) ? r.tags : (r.category ? [r.category] : []);
    valid.push({
      id: r.id,
      title: r.title,
      tags: normalizeTags(tags),
      favorite: Boolean(r.favorite),
      rating: Math.max(0, Math.min(5, Number(r.rating) || 0)),
      notes: typeof r.notes === 'string' ? r.notes : '',
      servingsBase: Number.isFinite(r.servingsBase) ? r.servingsBase : 4,
      ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      steps: Array.isArray(r.steps) ? r.steps : [],
      image: r.image || null,
      prepTime: r.prepTime ?? null,
      source: r.source ?? null,
      createdAt: r.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastCookedAt: r.lastCookedAt ?? null,
    });
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
