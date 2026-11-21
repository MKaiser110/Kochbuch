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
    const block = document.createElement('div');
    block.className = 'ingredient-editor-block';
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'drag-handle';
    handle.setAttribute('aria-label', 'Zutat verschieben');
    const row = document.createElement('div');
    row.className = 'ing-row';
    row.innerHTML = `
      <input class="ing-amount" type="text" inputmode="decimal" name="ing-amount-${n}" autocomplete="off" placeholder="Menge" value="${escapeHtml(String(ing.amount ?? ''))}">
      <input class="ing-unit" type="text" name="ing-unit-${n}" autocomplete="off" placeholder="Einheit" value="${escapeHtml(ing.unit ?? '')}">
      <input class="ing-name" type="text" name="ing-name-${n}" autocomplete="off" placeholder="Zutat" value="${escapeHtml(ing.name ?? '')}">
      <button type="button" class="row-remove" aria-label="Entfernen">×</button>
    `;
    row.querySelector('.row-remove').addEventListener('click', () => block.remove());
    block.append(handle, row);
    ingredientRows.appendChild(block);
    setupBlockDrag(block, ingredientRows);
  }

  function addCategoryRow(name = '') {
    const n = rowCounter++;
    const block = document.createElement('div');
    block.className = 'ingredient-editor-block ingredient-category-editor';
    block.innerHTML = `
      <button type="button" class="drag-handle" aria-label="Kategorie verschieben"></button>
      <div class="ingredient-category-row">
        <input class="ing-category" type="text" name="ing-category-${n}" autocomplete="off" placeholder="Kategorie, z. B. Für die Sauce" value="${escapeHtml(name)}">
        <button type="button" class="row-remove" aria-label="Kategorie entfernen">×</button>
      </div>
    `;
    block.querySelector('.row-remove').addEventListener('click', () => block.remove());
    ingredientRows.appendChild(block);
    setupBlockDrag(block, ingredientRows);
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

  if (recipe.ingredients.length) {
    let currentCategory = null;
    recipe.ingredients.forEach(ing => {
      const category = ing.category?.trim() || null;
      if (category !== currentCategory) {
        if (category) addCategoryRow(category);
        currentCategory = category;
      }
      addIngredientRow(ing);
    });
  } else {
    addIngredientRow();
  }
  (recipe.steps.length ? recipe.steps : ['']).forEach(addStepRow);

  document.getElementById('add-ingredient-row').addEventListener('click', () => addIngredientRow());
  document.getElementById('add-ingredient-category').addEventListener('click', () => addCategoryRow());
  document.getElementById('add-step-row').addEventListener('click', () => addStepRow());

  return { ingredientRows, stepRows };
}

function setupBlockDrag(block, container) {
  const handle = block.querySelector('.drag-handle');
  let dragged = null;
  let pointerStart = null;
  let ghost = null;

  handle.draggable = true;
  handle.addEventListener('dragstart', event => {
    dragged = block;
    block.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'ingredient-block');
  });
  handle.addEventListener('dragend', () => {
    dragged = null;
    block.classList.remove('dragging');
    clearDragMarkers(container);
  });

  container.addEventListener('dragover', event => {
    if (!dragged) return;
    event.preventDefault();
    const target = event.target.closest('.ingredient-editor-block');
    if (!target || target === dragged) return;
    clearDragMarkers(container);
    const rect = target.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;
    target.classList.add(insertAfter ? 'drag-over-after' : 'drag-over-before');
  });
  container.addEventListener('drop', event => {
    if (!dragged) return;
    event.preventDefault();
    const target = event.target.closest('.ingredient-editor-block');
    if (target && target !== dragged) {
      const rect = target.getBoundingClientRect();
      moveBlock(dragged, target, event.clientY > rect.top + rect.height / 2);
    }
    clearDragMarkers(container);
    dragged.classList.remove('dragging');
    dragged = null;
  });

  handle.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    if (!ghost && distance < 6) return;
    event.preventDefault();
    if (!ghost) {
      block.classList.add('dragging');
      ghost = block.cloneNode(true);
      ghost.classList.add('dragging');
      ghost.style.position = 'fixed';
      ghost.style.zIndex = '1000';
      ghost.style.width = `${block.offsetWidth}px`;
      ghost.style.pointerEvents = 'none';
      ghost.style.opacity = '.85';
      document.body.appendChild(ghost);
    }
    ghost.style.left = `${event.clientX - ghost.offsetWidth / 2}px`;
    ghost.style.top = `${event.clientY - 20}px`;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.ingredient-editor-block');
    if (!target || target === block) return;
    clearDragMarkers(container);
    const rect = target.getBoundingClientRect();
    target.classList.add(event.clientY > rect.top + rect.height / 2 ? 'drag-over-after' : 'drag-over-before');
  });
  handle.addEventListener('pointerup', event => {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    if (ghost) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.ingredient-editor-block');
      if (target && target !== block) {
        const rect = target.getBoundingClientRect();
        moveBlock(block, target, event.clientY > rect.top + rect.height / 2);
      }
      ghost.remove();
      ghost = null;
      block.classList.remove('dragging');
      clearDragMarkers(container);
    }
    pointerStart = null;
  });
  handle.addEventListener('pointercancel', () => {
    ghost?.remove();
    ghost = null;
    pointerStart = null;
    block.classList.remove('dragging');
    clearDragMarkers(container);
  });
}

function moveBlock(dragged, target, insertAfter) {
  if (insertAfter) target.after(dragged);
  else target.before(dragged);
}

function clearDragMarkers(container) {
  container.querySelectorAll('.ingredient-editor-block').forEach(block => {
    block.classList.remove('drag-over-before', 'drag-over-after');
  });
}

function resizeStepField(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(textarea.scrollHeight, 72) + 'px';
}

function readIngredients(ingredientRows) {
  let category = null;
  const ingredients = [];
  ingredientRows.querySelectorAll('.ingredient-editor-block').forEach(block => {
    const categoryInput = block.querySelector('.ing-category');
    if (categoryInput) {
      category = categoryInput.value.trim() || null;
      return;
    }
    const row = block.querySelector('.ing-row');
    if (!row) return;
    const amountRaw = row.querySelector('.ing-amount').value.trim();
    const unit = row.querySelector('.ing-unit').value.trim() || null;
    const name = row.querySelector('.ing-name').value.trim();
    const amount = amountRaw === '' ? null : parseFloat(amountRaw.replace(',', '.'));
    if (name) ingredients.push({ amount: Number.isNaN(amount) ? null : amount, unit, name, category });
  });
  return ingredients;
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
