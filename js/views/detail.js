// detail.js — Detailseite eines Rezepts: Anzeige, Portionen, Bewertung,
// Notizen, Export (Datei/PDF), Kochmodus-Start, Bearbeiten, Löschen.

import { getRecipe, saveRecipe, deleteRecipe } from '../core/db.js';
import { scaleIngredients } from '../services/scaling.js';
import { exportRecipeToFile } from '../services/export-import.js';
import { preparePdfAssets, exportRecipePdf } from '../services/pdf-export.js';
import { enableWakeLock, disableWakeLock, isSupported as wakeLockSupported } from '../services/wake-lock.js';
import { appRoot, mountTemplate, setPageTitle, fillIngredientList } from '../utils/dom.js';
import { currentNavigation, isStale } from '../view-lifecycle.js';

export async function renderDetail(id) {
  const seq = currentNavigation();
  const recipe = await getRecipe(id);
  if (isStale(seq)) return;
  if (!recipe) { location.hash = ''; return; }

  setPageTitle(recipe.title);
  mountTemplate('tpl-detail');
  const root = appRoot.querySelector('.detail');

  renderHeader(root, recipe);
  setupFavorite(root, recipe);
  setupRating(root, recipe);
  setupNotes(root, recipe);
  const servings = setupServings(root, recipe);
  renderSteps(root, recipe);
  setupRecipeFileExport(root, recipe);
  setupCookModeButton(root, id, servings);
  setupPdfExport(root, recipe, servings);
  setupWakeLockToggle(root);
  setupEditAndDelete(root, id, recipe);
}

function renderHeader(root, recipe) {
  const img = root.querySelector('.detail-img');
  if (recipe.image) img.style.backgroundImage = `url(${recipe.image})`; else img.style.display = 'none';

  root.querySelector('.d-title').textContent = recipe.title;
  const metaParts = [...recipe.tags];
  if (recipe.prepTime) metaParts.push(`${recipe.prepTime} Min.`);
  root.querySelector('.d-meta').textContent = metaParts.join(' · ');
  const extra = root.querySelector('.d-extra');
  const facts = [
    recipe.description && ['Beschreibung', recipe.description],
    recipe.cuisine && ['Küche', recipe.cuisine],
    recipe.difficulty && ['Schwierigkeit', recipe.difficulty],
    recipe.cookTime && ['Koch-/Backzeit', `${recipe.cookTime} Min.`],
    recipe.totalTime && ['Gesamtzeit', `${recipe.totalTime} Min.`],
    recipe.nutrition && ['Nährwerte', typeof recipe.nutrition === 'string' ? recipe.nutrition : JSON.stringify(recipe.nutrition)],
    recipe.reviewRequired && ['Import prüfen', (recipe.importWarnings || []).join('; ') || 'Bitte Zutaten und Zubereitung mit der Quelle vergleichen.'],
  ].filter(Boolean);
  for (const [label, value] of facts) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.append(strong, document.createTextNode(value));
    extra.appendChild(p);
  }
  extra.hidden = !facts.length;
}

function setupFavorite(root, recipe) {
  const favoriteBtn = root.querySelector('.btn-favorite');
  function updateFavoriteState() {
    favoriteBtn.classList.toggle('active', Boolean(recipe.favorite));
    favoriteBtn.textContent = recipe.favorite ? '★ Favorit' : '☆ Favorit';
  }
  updateFavoriteState();
  favoriteBtn.addEventListener('click', async () => {
    recipe.favorite = !recipe.favorite;
    await saveRecipe(recipe);
    updateFavoriteState();
  });
}

function setupRating(root, recipe) {
  const starButtons = [...root.querySelectorAll('.star')];
  function updateRatingState() {
    const value = Number(recipe.rating) || 0;
    starButtons.forEach(btn => {
      const active = Number(btn.dataset.value) <= value;
      btn.classList.toggle('active', active);
    });
  }
  updateRatingState();
  starButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      recipe.rating = Number(btn.dataset.value) || 0;
      await saveRecipe(recipe);
      updateRatingState();
    });
  });
}

function setupNotes(root, recipe) {
  const notesField = root.querySelector('.recipe-notes');
  notesField.value = recipe.notes || '';
  notesField.addEventListener('change', async () => {
    recipe.notes = notesField.value.trim();
    await saveRecipe(recipe);
  });
}

/** Portionen +/- mit skalierter Zutatenliste. Gibt einen Getter für die aktuelle Portionenzahl zurück. */
function setupServings(root, recipe) {
  let servings = recipe.servingsBase;
  const servCount = root.querySelector('.serv-count');
  const ingredientList = root.querySelector('.ingredient-list');

  function renderIngredients() {
    servCount.textContent = servings;
    fillIngredientList(ingredientList, scaleIngredients(recipe.ingredients, recipe.servingsBase, servings));
  }
  renderIngredients();

  root.querySelectorAll('.serv-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta, 10);
      const next = servings + delta;
      if (next >= 1) { servings = next; renderIngredients(); }
    });
  });

  return () => servings;
}

function renderSteps(root, recipe) {
  const stepList = root.querySelector('.step-list');
  recipe.steps.forEach(step => {
    const li = document.createElement('li');
    li.textContent = step;
    stepList.appendChild(li);
  });
}

function setupRecipeFileExport(root, recipe) {
  root.querySelector('.btn-recipe-export').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Exportiere …';
    try {
      await exportRecipeToFile(recipe);
      button.textContent = 'Exportiert';
    } catch {
      alert('Rezeptdatei konnte nicht erstellt werden.');
      button.textContent = 'Als Datei exportieren';
    } finally {
      button.disabled = false;
    }
  });
}

/** Kochmodus: gewählte Portionenzahl wird per Hash-Parameter mitgegeben. */
function setupCookModeButton(root, id, getServings) {
  root.querySelector('.btn-cook-mode').addEventListener('click', () => {
    location.hash = `cook/${id}?s=${getServings()}`;
  });
}

function setupPdfExport(root, recipe, getServings) {
  // Bibliothek und Bildgröße schon beim Öffnen vorladen, damit der Klick
  // direkt ins Share-Sheet führt (Safari verlangt eine zeitnahe Tipp-Geste).
  const pdfAssets = preparePdfAssets(recipe);
  pdfAssets.catch(() => { /* Fehler wird beim Klick behandelt */ });
  const pdfBtn = root.querySelector('.btn-pdf');
  pdfBtn.addEventListener('click', async () => {
    pdfBtn.disabled = true;
    pdfBtn.textContent = 'Erstelle PDF …';
    try {
      await exportRecipePdf(recipe, getServings(), pdfAssets);
    } catch {
      alert('PDF konnte nicht erstellt werden.');
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.textContent = 'PDF';
    }
  });
}

function setupWakeLockToggle(root) {
  const wakeCheckbox = root.querySelector('.wake-lock-checkbox');
  if (!wakeLockSupported()) {
    wakeCheckbox.closest('.wake-lock-toggle').hidden = true;
    return;
  }
  wakeCheckbox.addEventListener('change', async () => {
    if (wakeCheckbox.checked) {
      const ok = await enableWakeLock();
      if (!ok) wakeCheckbox.checked = false;
    } else {
      await disableWakeLock();
    }
  });
}

function setupEditAndDelete(root, id, recipe) {
  root.querySelector('.btn-edit').addEventListener('click', () => { location.hash = `edit/${id}`; });
  root.querySelector('.btn-delete').addEventListener('click', async () => {
    if (confirm(`„${recipe.title}“ wirklich löschen?`)) {
      await deleteRecipe(id);
      location.hash = '';
    }
  });
}
