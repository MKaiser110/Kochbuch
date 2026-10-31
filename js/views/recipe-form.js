// recipe-form.js — Formular zum Anlegen und Bearbeiten eines Rezepts.

import { getAllRecipes, getRecipe, saveRecipe, getAllTags } from '../core/db.js';
import { blankRecipe, parseTagInput, findDuplicate } from '../core/recipe-model.js';
import { imageFileToDataUrl } from '../services/image-utils.js';
import { confirmSheet } from '../sheets/sheet.js';
import { takeFormDraft } from '../state.js';
import { appRoot, mountTemplate, setPageTitle, makeChip, escapeHtml } from '../utils/dom.js';

/** @param {string|null} id  id eines bestehenden Rezepts, null für ein neues (ggf. mit Import-Entwurf) */
export async function renderEditForm(id) {
  let recipe;
  if (id) {
    recipe = await getRecipe(id);
    if (!recipe) { location.hash = ''; return; }
  } else {
    recipe = takeFormDraft() || blankRecipe();
  }

  setPageTitle(id ? 'Rezept bearbeiten' : 'Neues Rezept');
  mountTemplate('tpl-recipe-form');
  window.scrollTo(0, 0);

  const form = appRoot.querySelector('#recipe-form');
  form.scrollTop = 0;
  const reviewNotice = form.querySelector('#import-review-notice');
  if (recipe.reviewRequired) {
    reviewNotice.hidden = false;
    reviewNotice.textContent = (recipe.importWarnings || []).join('. ') || 'Bitte prüfe alle importierten Angaben anhand der Quelle.';
  }
  fillBasicFields(form, recipe);
  await setupTagSuggestions(form.elements.tags);
  const image = setupImageField(form, recipe);
  const rows = setupRows(recipe);

  document.getElementById('form-cancel').addEventListener('click', () => history.back());
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const updated = buildUpdatedRecipe(form, recipe, image.get(), rows);
    if (!(await confirmDuplicate(updated, recipe, id))) return;
    await saveRecipe(updated);
    location.hash = `recipe/${updated.id}`;
  });
}

function fillBasicFields(form, recipe) {
  form.title.value = recipe.title || '';
  form.elements.tags.value = (recipe.tags || []).join(', ');
  form.servings.value = recipe.servingsBase || 4;
  form.prepTime.value = recipe.prepTime || '';
  form.source.value = recipe.source || '';
  form.notes.value = recipe.notes || '';
}

/** Vorhandene Tags als antippbare Vorschläge (an/aus), zusätzlich zur Texteingabe. */
async function setupTagSuggestions(tagsInput) {
  const knownTags = await getAllTags();
  const suggestionWrap = document.getElementById('tag-suggestions');
  function renderTagSuggestions() {
    const current = parseTagInput(tagsInput.value).map(t => t.toLowerCase());
    suggestionWrap.innerHTML = '';
    knownTags.forEach(tag => {
      suggestionWrap.appendChild(makeChip(tag, current.includes(tag.toLowerCase()), () => {
        const list = parseTagInput(tagsInput.value);
        const idx = list.findIndex(t => t.toLowerCase() === tag.toLowerCase());
        if (idx >= 0) list.splice(idx, 1); else list.push(tag);
        tagsInput.value = list.join(', ');
        renderTagSuggestions();
      }));
    });
  }
  renderTagSuggestions();
  tagsInput.addEventListener('input', renderTagSuggestions);
}

/** Bildauswahl mit Vorschau. Gibt einen Getter für die aktuelle DataURL zurück. */
function setupImageField(form, recipe) {
  let imageDataUrl = recipe.image || null;
  const imagePreview = document.getElementById('image-preview');
  const imageStatus = document.getElementById('image-status');
  function renderImagePreview() {
    imagePreview.replaceChildren();
    if (!imageDataUrl) return;
    const image = document.createElement('img');
    image.src = imageDataUrl;
    image.alt = 'Rezeptbild';
    imagePreview.appendChild(image);
  }
  renderImagePreview();
  form.elements.image.addEventListener('change', async () => {
    const file = form.elements.image.files[0];
    if (!file) return;
    imageStatus.textContent = 'Bild wird verarbeitet …';
    try {
      imageDataUrl = await imageFileToDataUrl(file);
      renderImagePreview();
      imageStatus.textContent = 'Bild hinzugefügt.';
    } catch (error) {
      imageStatus.textContent = error?.message === 'IMAGE_TOO_LARGE'
        ? 'Das Bild ist größer als 15 MB. Bitte wähle ein kleineres Bild.'
        : 'Das Bild konnte nicht verarbeitet werden. Bitte wähle ein anderes Bild.';
    }
  });
  return { get: () => imageDataUrl };
}

/**
 * Zutaten- und Schrittzeilen. Jede Zeile bekommt einen eindeutigen Feldnamen
 * + autocomplete="off". Ohne das verwechselt iOS Safari gleichartige,
 * namenlose Felder beim Nachladen neuer Zeilen und schlägt den zuletzt
 * eingegebenen Wert vor.
 */
function setupRows(recipe) {
  const ingredientRows = document.getElementById('ingredient-rows');
  const stepRows = document.getElementById('step-rows');
  let rowCounter = 0;

  function addIngredientRow(ing = { amount: '', unit: '', name: '' }) {
    const n = rowCounter++;
    const row = document.createElement('div');
    row.className = 'ing-row';
    row.innerHTML = `
      <input class="ing-amount" type="text" inputmode="decimal" name="ing-amount-${n}" autocomplete="off" placeholder="Menge" value="${escapeHtml(String(ing.amount ?? ''))}">
      <input class="ing-unit" type="text" name="ing-unit-${n}" autocomplete="off" placeholder="Einheit" value="${escapeHtml(ing.unit ?? '')}">
      <input class="ing-name" type="text" name="ing-name-${n}" autocomplete="off" placeholder="Zutat" value="${escapeHtml(ing.name ?? '')}">
      <button type="button" class="row-remove" aria-label="Entfernen">×</button>
    `;
    row.querySelector('.row-remove').addEventListener('click', () => row.remove());
    ingredientRows.appendChild(row);
  }

  function addStepRow(text = '') {
    const n = rowCounter++;
    const row = document.createElement('div');
    row.className = 'step-row';
    row.innerHTML = `
      <textarea rows="2" name="step-${n}" autocomplete="off" placeholder="Schritt beschreiben…">${escapeHtml(text)}</textarea>
      <button type="button" class="row-remove" aria-label="Entfernen">×</button>
    `;
    const textarea = row.querySelector('textarea');
    textarea.addEventListener('input', () => resizeStepField(textarea));
    row.querySelector('.row-remove').addEventListener('click', () => row.remove());
    stepRows.appendChild(row);
    resizeStepField(textarea);
  }

  (recipe.ingredients.length ? recipe.ingredients : [{ amount: '', unit: '', name: '' }]).forEach(addIngredientRow);
  (recipe.steps.length ? recipe.steps : ['']).forEach(addStepRow);

  document.getElementById('add-ingredient-row').addEventListener('click', () => addIngredientRow());
  document.getElementById('add-step-row').addEventListener('click', () => addStepRow());

  return { ingredientRows, stepRows };
}

function resizeStepField(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(textarea.scrollHeight, 72) + 'px';
}

function readIngredients(ingredientRows) {
  return [...ingredientRows.querySelectorAll('.ing-row')].map(row => {
    const amountRaw = row.querySelector('.ing-amount').value.trim();
    const unit = row.querySelector('.ing-unit').value.trim() || null;
    const name = row.querySelector('.ing-name').value.trim();
    const amount = amountRaw === '' ? null : parseFloat(amountRaw.replace(',', '.'));
    return { amount: Number.isNaN(amount) ? null : amount, unit, name };
  }).filter(i => i.name);
}

function readSteps(stepRows) {
  return [...stepRows.querySelectorAll('textarea')].map(t => t.value.trim()).filter(Boolean);
}

function buildUpdatedRecipe(form, recipe, imageDataUrl, { ingredientRows, stepRows }) {
  const fd = new FormData(form);
  return {
    ...recipe,
    title: fd.get('title').trim(),
    tags: parseTagInput(fd.get('tags')),
    notes: String(fd.get('notes') || '').trim(),
    servingsBase: parseInt(fd.get('servings'), 10) || 1,
    prepTime: fd.get('prepTime') ? parseInt(fd.get('prepTime'), 10) : null,
    servingsKnown: true,
    source: fd.get('source').trim() || null,
    image: imageDataUrl,
    ingredients: readIngredients(ingredientRows),
    steps: readSteps(stepRows),
  };
}

/**
 * Duplikat-Warnung: nur bei neuem Rezept oder geändertem Titel/Quelle,
 * sonst würde jedes Bearbeiten eines bereits doppelten Rezepts erneut warnen.
 * @returns {Promise<boolean>} true = speichern, false = abbrechen
 */
async function confirmDuplicate(updated, original, id) {
  const titleOrSourceChanged = !id
    || updated.title.trim().toLowerCase() !== (original.title || '').trim().toLowerCase()
    || (updated.source || '') !== (original.source || '');
  if (!titleOrSourceChanged) return true;

  const dup = findDuplicate(updated, await getAllRecipes());
  if (!dup) return true;

  const why = dup.reason === 'source'
    ? `Dieses Rezept hat dieselbe Quelle wie „${dup.recipe.title}“.`
    : `Ein Rezept mit dem Titel „${dup.recipe.title}“ gibt es schon.`;
  return confirmSheet({
    title: 'Mögliches Duplikat',
    message: why,
    confirmLabel: 'Trotzdem speichern',
  });
}
