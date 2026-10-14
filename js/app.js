import { getAllRecipes, getRecipe, saveRecipe, deleteRecipe, getAllTags, getAllIngredientNames, blankRecipe, parseTagInput, findDuplicate, getAllShoppingLists, saveShoppingList, deleteShoppingList, blankShoppingList } from './db.js';
import { scaleIngredients, formatAmount } from './scaling.js';
import { importFromUrl, extractFromHtml, extractFromReaderText, parseIngredientLine } from './recipe-import.js';
import { recognizeImage, draftRecipeFromOcrText } from './ocr-import.js';
import { exportRecipesToFile, importRecipesFromFile } from './export-import.js';
import { compressImageToDataUrl } from './image-utils.js';
import { enableWakeLock, disableWakeLock, isSupported as wakeLockSupported } from './wake-lock.js';
import { preparePdfAssets, exportRecipePdf } from './pdf-export.js';
import { encodeSharedRecipe, decodeSharedRecipe } from './recipe-share.js';

const app = document.getElementById('app');
const pageTitle = document.getElementById('page-title');
const btnBack = document.getElementById('btn-back');
const btnAdd = document.getElementById('btn-add');
const overlay = document.getElementById('sheet-overlay');

// ---------- Mini-Router (Hash-basiert, jedes Rezept eine eigene Route) ----------

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
btnAdd.addEventListener('click', openAddMenu);
btnBack.addEventListener('click', () => history.back());
document.getElementById('btn-data-menu').addEventListener('click', openDataMenu);

// ---------- Export / Import (Rezepte als Datei) ----------

function openDataMenu() {
  openSheet('tpl-data-menu', node => {
    const status = node.querySelector('#data-status');
    const fileInput = node.querySelector('#data-import-file');

    node.querySelector('#data-export').addEventListener('click', async () => {
      status.textContent = 'Exportiere …';
      try {
        const count = await exportRecipesToFile();
        status.textContent = `${count} Rezept(e) exportiert.`;
      } catch {
        status.textContent = 'Export fehlgeschlagen.';
      }
    });

    node.querySelector('#data-sync-link').addEventListener('click', async () => {
      status.textContent = 'Erzeuge Backup-Link …';
      try {
        const recipes = await getAllRecipes();
        const omittedImages = recipes.filter(recipe => typeof recipe.image === 'string' && recipe.image.startsWith('data:')).length;
        const linkRecipes = recipes.map(recipe => ({
          ...recipe,
          image: typeof recipe.image === 'string' && recipe.image.startsWith('data:') ? null : recipe.image,
        }));
        const payload = { type: 'kochbuch-backup', version: 3, exportedAt: new Date().toISOString(), recipes: linkRecipes };
        const encoded = await encodeBackupPayload(payload);
        const url = `${location.origin}${location.pathname}#backup=${encoded}`;
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          status.textContent = omittedImages
            ? `Kompakter Backup-Link kopiert. ${omittedImages} eingebettete(s) Bild(er) sind nur im Datei-Export enthalten.`
            : 'Kompakter Backup-Link in die Zwischenablage kopiert.';
        } else {
          prompt('Backup-Link:', url);
          status.textContent = omittedImages
            ? `Backup-Link bereit. ${omittedImages} eingebettete(s) Bild(er) sind nur im Datei-Export enthalten.`
            : 'Backup-Link bereit – bitte kopieren.';
        }
      } catch {
        status.textContent = 'Backup-Link konnte nicht erstellt werden.';
      }
    });

    node.querySelector('#data-import').addEventListener('click', () => fileInput.click());
    node.querySelector('#data-import-link').addEventListener('click', async () => {
      const shareUrl = prompt('Füge hier den Backup-Link ein:', '');
      if (!shareUrl) return;
      const match = /#backup=([^&]+)/.exec(shareUrl);
      if (!match) {
        status.textContent = 'Das ist kein gültiger Backup-Link.';
        return;
      }
      status.textContent = 'Importiere Backup …';
      try {
        const imported = await importBackupFromHash(match[0].slice(1));
        status.textContent = imported ? 'Backup erfolgreich importiert.' : 'Backup konnte nicht importiert werden.';
      } catch {
        status.textContent = 'Backup-Link fehlerhaft.';
      }
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      status.textContent = 'Importiere …';
      try {
        const { imported, skipped, duplicatesSkipped, total } = await importRecipesFromFile(
          file,
          async count => confirm(
            `${count} Rezept(e) in der Datei scheinen bereits vorhanden zu sein (gleicher Titel oder gleiche Quelle).\n\n` +
            'OK = trotzdem importieren\nAbbrechen = diese überspringen'
          )
        );
        const notes = [];
        if (duplicatesSkipped) notes.push(`${duplicatesSkipped} Duplikat(e) übersprungen`);
        if (skipped) notes.push(`${skipped} ungültig`);
        status.textContent = notes.length
          ? `${imported} von ${total} importiert (${notes.join(', ')}).`
          : `${imported} Rezept(e) importiert.`;
        if (location.hash === '' || location.hash === '#') renderOverview();
      } catch (err) {
        status.textContent = err.message === 'INVALID_JSON' || err.message === 'INVALID_FORMAT'
          ? 'Datei ist kein gültiger Kochbuch-Export.'
          : 'Import fehlgeschlagen.';
      }
    });

    node.querySelector('#data-cancel').addEventListener('click', closeSheet);
  });
}

// Aufräumfunktion der aktuellen Ansicht (z.B. Tastatur-Listener im Kochmodus)
let cleanupView = null;
// Zähler pro Navigation: asynchrone Render-Funktionen prüfen nach jedem await,
// ob inzwischen woandershin navigiert wurde, und brechen dann ab.
let routeSeq = 0;
let visualViewportCleanup = null;

function decodePayload(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function encodeBackupPayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'function' && typeof DecompressionStream === 'function') {
    const compressed = await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer();
    return `gzip.${bytesToBase64Url(new Uint8Array(compressed))}`;
  }
  return `plain.${bytesToBase64Url(bytes)}`;
}

async function decodeBackupPayload(value) {
  if (value.startsWith('gzip.')) {
    const bytes = base64UrlToBytes(value.slice('gzip.'.length));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  if (value.startsWith('plain.')) {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value.slice('plain.'.length))));
  }
  return decodePayload(value);
}

async function createRecipeShareLink(recipe) {
  const payload = await encodeSharedRecipe(recipe);
  return `${location.origin}${location.pathname}#share=${payload}`;
}

async function importSharedRecipeFromHash(hash) {
  if (!hash) return false;
  const match = /^share=(.+)$/.exec(hash);
  if (!match) { return false; }
  try {
    const sharedRecipe = await decodeSharedRecipe(match[1]);
    if (!sharedRecipe) return false;
    const recipe = { ...sharedRecipe, id: sharedRecipe.id || crypto.randomUUID?.() || `${Date.now()}` };
    const existing = await getAllRecipes();
    const duplicate = findDuplicate(recipe, existing);
    if (duplicate && !confirm(`Dieses geteilte Rezept ist schon ähnlich zu „${duplicate.recipe.title}“ vorhanden. Trotzdem importieren?`)) {
      return true;
    }
    await saveRecipe({ ...recipe, createdAt: recipe.createdAt || Date.now(), updatedAt: Date.now() });
    location.hash = `recipe/${recipe.id}`;
    return true;
  } catch {
    return false;
  }
}

async function importBackupFromHash(hash) {
  if (!hash) return false;
  const match = /^backup=(.+)$/.exec(hash);
  if (!match) return false;
  try {
    const payload = await decodeBackupPayload(match[1]);
    if (!payload || payload.type !== 'kochbuch-backup' || !Array.isArray(payload.recipes)) return false;
    let imported = 0;
    for (const recipe of payload.recipes) {
      const candidate = { ...recipe, id: recipe.id || crypto.randomUUID?.() || `${Date.now()}-${imported}` };
      const existing = await getAllRecipes();
      const duplicate = findDuplicate(candidate, existing);
      if (duplicate && !confirm(`Ein Backup-Rezept ähnelt „${duplicate.recipe.title}“. Trotzdem importieren?`)) continue;
      await saveRecipe({ ...candidate, updatedAt: Date.now() });
      imported++;
    }
    if (imported > 0) {
      location.hash = '';
      renderOverview();
    }
    return true;
  } catch {
    return false;
  }
}

async function route() {
  const hash = location.hash.slice(1); // '' | 'recipe/<id>' | 'edit/<id>' | 'new' | 'cook/<id>?s=<portionen>' | 'share=...' | 'backup=...'
  closeSheet();
  if (hash.startsWith('share=')) {
    const imported = await importSharedRecipeFromHash(hash);
    if (imported) return;
  }
  if (hash.startsWith('backup=')) {
    const imported = await importBackupFromHash(hash);
    if (imported) return;
  }
  routeSeq++;
  // Im Kochmodus Header-Aktionen ausblenden (kein versehentliches Tippen beim Kochen)
  document.body.classList.toggle('cook-mode', hash.startsWith('cook/'));
  // Beim Seitenwechsel immer Wake Lock freigeben und Ansicht aufräumen;
  // Kochmodus und Detailseite fordern ihn bei Bedarf neu an.
  disableWakeLock();
  if (cleanupView) { cleanupView(); cleanupView = null; }
  if (hash.startsWith('cook/')) {
    const [id, query] = hash.slice('cook/'.length).split('?');
    const servings = parseInt(new URLSearchParams(query || '').get('s'), 10) || null;
    btnBack.hidden = false;
    renderCook(id, servings);
  } else if (hash.startsWith('recipe/')) {
    const id = hash.slice('recipe/'.length);
    btnBack.hidden = false;
    renderDetail(id);
  } else if (hash.startsWith('edit/')) {
    const id = hash.slice('edit/'.length);
    btnBack.hidden = false;
    renderEditForm(id);
  } else if (hash === 'new') {
    btnBack.hidden = false;
    renderEditForm(null);
  } else if (hash === 'shopping') {
    btnBack.hidden = true;
    renderShopping();
  } else {
    btnBack.hidden = true;
    renderOverview();
  }
  const shoppingActive = hash === 'shopping';
  document.body.classList.toggle('shopping-mode', shoppingActive);
  document.getElementById('btn-add').hidden = shoppingActive;
  document.getElementById('btn-data-menu').hidden = shoppingActive;
  document.querySelectorAll('.tab-link').forEach(tab => {
    const active = tab.dataset.tab === (shoppingActive ? 'shopping' : 'cookbook');
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

// ---------- Übersicht ----------

let currentSearch = '';
let currentTag = null;
let currentSort = 'added'; // 'added' | 'alpha' | 'cooked' | 'favorites'
let selectedIngredients = new Set(); // aktiver Zutatenfilter (leer = aus)

async function renderOverview() {
  if (cleanupView) { cleanupView(); cleanupView = null; }
  pageTitle.textContent = 'Kochbuch';
  const tpl = document.getElementById('tpl-overview').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  const searchInput = document.getElementById('search');
  searchInput.value = currentSearch;
  searchInput.addEventListener('input', e => {
    currentSearch = e.target.value.toLowerCase();
    renderGrid();
  });

  const sortControl = app.querySelector('.sort-control');
  const sortTrigger = document.getElementById('sort-select');
  const sortMenu = document.getElementById('sort-menu');
  const sortOptions = [...sortMenu.querySelectorAll('.sort-option')];

  function updateSortSelection() {
    const selected = sortOptions.find(option => option.dataset.value === currentSort);
    document.getElementById('sort-label').textContent = selected.textContent;
    sortOptions.forEach(option => {
      const isSelected = option === selected;
      option.setAttribute('aria-selected', String(isSelected));
      option.classList.toggle('selected', isSelected);
    });
  }

  function setSortMenuOpen(open) {
    sortMenu.hidden = !open;
    sortTrigger.setAttribute('aria-expanded', String(open));
    if (open) {
      sortOptions.find(option => option.dataset.value === currentSort)?.focus();
    }
  }

  updateSortSelection();
  sortTrigger.addEventListener('click', () => setSortMenuOpen(sortMenu.hidden));
  sortOptions.forEach(option => {
    option.addEventListener('click', () => {
      currentSort = option.dataset.value;
      updateSortSelection();
      setSortMenuOpen(false);
      sortTrigger.focus();
      renderGrid();
    });
    option.addEventListener('keydown', event => {
      const index = sortOptions.indexOf(option);
      if (event.key === 'Escape') {
        setSortMenuOpen(false);
        sortTrigger.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        sortOptions[(index + direction + sortOptions.length) % sortOptions.length].focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        sortOptions[event.key === 'Home' ? 0 : sortOptions.length - 1].focus();
      }
    });
  });
  sortTrigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSortMenuOpen(true);
      if (event.key === 'ArrowUp') sortOptions[sortOptions.length - 1].focus();
    }
  });
  const closeSortMenuOutside = event => {
    if (!sortControl.contains(event.target)) setSortMenuOpen(false);
  };
  sortControl.addEventListener('focusout', event => {
    if (event.relatedTarget && !sortControl.contains(event.relatedTarget)) setSortMenuOpen(false);
  });
  document.addEventListener('pointerdown', closeSortMenuOutside);
  cleanupView = () => document.removeEventListener('pointerdown', closeSortMenuOutside);

  const seq = routeSeq;
  const tags = await getAllTags();
  if (seq !== routeSeq) return;
  // Gewählter Tag existiert evtl. nicht mehr (Rezept gelöscht/umbenannt) -> Filter zurücksetzen
  if (currentTag && !tags.includes(currentTag)) currentTag = null;
  const chipWrap = document.getElementById('tag-filter');
  chipWrap.innerHTML = '';
  chipWrap.appendChild(makeChip('Alle', currentTag === null, () => { currentTag = null; renderOverview(); }));
  tags.forEach(tag => {
    chipWrap.appendChild(makeChip(tag, currentTag === tag, () => { currentTag = tag; renderOverview(); }));
  });

  const filterBtn = document.getElementById('btn-ingredient-filter');
  updateFilterBtnLabel(filterBtn);
  filterBtn.addEventListener('click', openIngredientFilter);

  await renderGrid();
}

function updateFilterBtnLabel(btn) {
  btn.querySelector('span').textContent = selectedIngredients.size
    ? `Zutatenfilter aktiv (${selectedIngredients.size}) — ändern`
    : 'Nach Zutaten filtern';
}

async function openIngredientFilter() {
  const allNames = await getAllIngredientNames();
  openSheet('tpl-ingredient-filter', node => {
    const list = node.querySelector('#ingredient-checklist');
    const searchInput = node.querySelector('#ingredient-filter-search');

    function renderList(filterText) {
      list.innerHTML = '';
      const filtered = filterText
        ? allNames.filter(n => n.toLowerCase().includes(filterText.toLowerCase()))
        : allNames;
      if (filtered.length === 0) {
        list.innerHTML = '<p class="hint">Keine Zutaten gefunden.</p>';
        return;
      }
      filtered.forEach(name => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedIngredients.has(name);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedIngredients.add(name);
          else selectedIngredients.delete(name);
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(name));
        list.appendChild(label);
      });
    }
    renderList('');
    searchInput.addEventListener('input', () => renderList(searchInput.value));

    node.querySelector('#ingredient-filter-apply').addEventListener('click', () => {
      closeSheet();
      renderOverview();
    });
    node.querySelector('#ingredient-filter-reset').addEventListener('click', () => {
      selectedIngredients = new Set();
      closeSheet();
      renderOverview();
    });
  });
}

function makeChip(label, active, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button'; // verhindert Formular-Submit, wenn Chips im Formular genutzt werden
  btn.className = 'chip' + (active ? ' active' : '');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function sortRecipes(list, sort) {
  const sorted = [...list];
  if (sort === 'alpha') {
    sorted.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  } else if (sort === 'cooked') {
    // Nie gekochte Rezepte ans Ende, sonst zuletzt gekocht zuerst.
    sorted.sort((a, b) => (b.lastCookedAt || 0) - (a.lastCookedAt || 0));
  } else if (sort === 'favorites') {
    sorted.sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastCookedAt || 0) - (a.lastCookedAt || 0) || b.createdAt - a.createdAt);
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

function normalizeIngredientName(name) {
  return String(name || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de');
}

const shoppingCatalog = [
  ['Apfel', '🍎', 'Obst & Gemüse'], ['Banane', '🍌', 'Obst & Gemüse'], ['Zitrone', '🍋', 'Obst & Gemüse'],
  ['Tomate', '🍅', 'Obst & Gemüse'], ['Kartoffel', '🥔', 'Obst & Gemüse'], ['Zwiebel', '🧅', 'Obst & Gemüse'],
  ['Knoblauch', '🧄', 'Obst & Gemüse'], ['Karotte', '🥕', 'Obst & Gemüse'], ['Paprika', '🫑', 'Obst & Gemüse'],
  ['Salat', '🥬', 'Obst & Gemüse'], ['Gurke', '🥒', 'Obst & Gemüse'], ['Brokkoli', '🥦', 'Obst & Gemüse'],
  ['Pilze', '🍄', 'Obst & Gemüse'], ['Avocado', '🥑', 'Obst & Gemüse'], ['Erdbeeren', '🍓', 'Obst & Gemüse'],
  ['Brot', '🍞', 'Backwaren'], ['Brötchen', '🥖', 'Backwaren'], ['Mehl', '🌾', 'Backwaren'],
  ['Milch', '🥛', 'Milchprodukte'], ['Butter', '🧈', 'Milchprodukte'], ['Käse', '🧀', 'Milchprodukte'],
  ['Joghurt', '🥣', 'Milchprodukte'], ['Sahne', '🥛', 'Milchprodukte'], ['Eier', '🥚', 'Milchprodukte'],
  ['Hähnchen', '🍗', 'Fleisch & Fisch'], ['Hackfleisch', '🥩', 'Fleisch & Fisch'], ['Lachs', '🐟', 'Fleisch & Fisch'],
  ['Tofu', '', 'Fleisch & Fisch'], ['Reis', '🍚', 'Vorrat'], ['Nudeln', '🍝', 'Vorrat'],
  ['Haferflocken', '🌾', 'Vorrat'], ['Linsen', '🫘', 'Vorrat'], ['Bohnen', '🫘', 'Vorrat'],
  ['Tomaten (Dose)', '🥫', 'Vorrat'], ['Olivenöl', '🫒', 'Vorrat'], ['Essig', '🍶', 'Vorrat'],
  ['Salz', '🧂', 'Gewürze'], ['Pfeffer', '🫙', 'Gewürze'], ['Paprikapulver', '🌶️', 'Gewürze'],
  ['Basilikum', '🌿', 'Gewürze'], ['Petersilie', '🌿', 'Gewürze'], ['Zucker', '🍬', 'Backwaren'],
];

let selectedShoppingListId = null;

function catalogEntry(name) {
  const normalized = normalizeIngredientName(name);
  return shoppingCatalog.find(([item]) => normalizeIngredientName(item) === normalized) || null;
}

function renderShoppingIcon(name, emoji) {
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  if (emoji) {
    span.className = 'shopping-emoji';
    span.textContent = emoji;
  } else {
    span.className = 'shopping-letter';
    span.textContent = String(name || '?').trim().charAt(0).toLocaleUpperCase('de') || '?';
  }
  return span;
}

function mergeShoppingQuantities(existing, incoming) {
  const merged = [...(existing || [])].map(quantity => ({ ...quantity }));
  (incoming || []).forEach(quantity => {
    const unit = String(quantity.unit || '').trim();
    const match = merged.find(entry =>
      String(entry.unit || '').trim().toLocaleLowerCase('de') === unit.toLocaleLowerCase('de')
      && entry.amount != null && quantity.amount != null
    );
    if (match) match.amount = Math.round((Number(match.amount) + Number(quantity.amount)) * 100) / 100;
    else if (quantity.amount != null || unit) merged.push({ amount: quantity.amount, unit });
  });
  return merged;
}

async function addShoppingItem(list, name, quantities = []) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  if (!cleanName) return list;
  const items = [...list.items];
  const existing = items.find(item => normalizeIngredientName(item.name) === normalizeIngredientName(cleanName));
  if (existing) {
    existing.quantities = mergeShoppingQuantities(existing.quantities, quantities);
  } else {
    const catalog = catalogEntry(cleanName);
    items.push({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: cleanName,
      category: catalog?.[2] || 'Weitere Artikel',
      emoji: catalog?.[1] || '',
      quantities: mergeShoppingQuantities([], quantities),
      createdAt: Date.now(),
    });
  }
  return saveShoppingList({ ...list, items });
}

async function ensureShoppingList() {
  const lists = await getAllShoppingLists();
  if (lists.length) return lists;
  const created = await saveShoppingList(blankShoppingList());
  selectedShoppingListId = created.id;
  return [created];
}

async function renderShopping() {
  const seq = routeSeq;
  if (cleanupView) { cleanupView(); cleanupView = null; }
  pageTitle.textContent = 'Einkaufslisten';
  const tpl = document.getElementById('tpl-shopping').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);
  const root = app.querySelector('.shopping-view');
  const listPicker = root.querySelector('.shopping-list-picker');
  const createBtn = root.querySelector('.shopping-list-create');
  const renameBtn = root.querySelector('.shopping-list-rename');
  const deleteBtn = root.querySelector('.shopping-list-delete');
  const searchInput = root.querySelector('.shopping-search');
  const suggestions = root.querySelector('.shopping-suggestions');
  const itemsGrid = root.querySelector('.shopping-items-grid');
  const emptyMessage = root.querySelector('.shopping-empty');
  let lists = await ensureShoppingList();
  if (seq !== routeSeq) return;

  function currentList() {
    return lists.find(list => list.id === selectedShoppingListId) || lists[0];
  }

  function renderListPicker() {
    listPicker.innerHTML = '';
    lists.forEach(list => {
      const option = document.createElement('option');
      option.value = list.id;
      option.textContent = list.name;
      option.selected = list.id === currentList().id;
      listPicker.appendChild(option);
    });
    selectedShoppingListId = currentList().id;
    listPicker.disabled = lists.length < 2;
  }

  function drawItems() {
    itemsGrid.innerHTML = '';
    const list = currentList();
    list.items.forEach(item => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'shopping-item';
      tile.setAttribute('aria-label', `${item.name}${item.quantities?.length ? `, ${item.quantities.map(q => formatAmount(q.amount, q.unit)).filter(Boolean).join(', ')}` : ''} entfernen`);
      const catalog = catalogEntry(item.name);
      tile.appendChild(renderShoppingIcon(item.name, item.emoji || catalog?.[1]));
      const name = document.createElement('span');
      name.className = 'shopping-item-name';
      name.textContent = item.name;
      tile.appendChild(name);
      const quantities = (item.quantities || []).map(q => formatAmount(q.amount, q.unit)).filter(Boolean);
      if (quantities.length) {
        const amount = document.createElement('span');
        amount.className = 'shopping-item-quantity';
        amount.textContent = quantities.join(' · ');
        tile.appendChild(amount);
      }
      const remove = document.createElement('span');
      remove.className = 'shopping-item-remove';
      remove.textContent = '×';
      tile.appendChild(remove);
      tile.addEventListener('click', async () => {
        try {
          const updated = await saveShoppingList({
            ...currentList(),
            items: currentList().items.filter(entry => entry.id !== item.id),
          });
          lists = lists.map(entry => entry.id === updated.id ? updated : entry);
          drawItems();
        } catch (error) {
          reportShoppingError(error, 'Der Artikel konnte nicht entfernt werden.');
        }
      });
      itemsGrid.appendChild(tile);
    });
    emptyMessage.hidden = list.items.length > 0;
  }

  function drawSuggestions(query) {
    suggestions.innerHTML = '';
    const normalizedQuery = normalizeIngredientName(query);
    const matches = normalizedQuery
      ? shoppingCatalog.filter(([name]) => normalizeIngredientName(name).includes(normalizedQuery))
      : shoppingCatalog.slice(0, 12);
    const groups = new Map();
    matches.forEach(entry => {
      if (!groups.has(entry[2])) groups.set(entry[2], []);
      groups.get(entry[2]).push(entry);
    });
    groups.forEach((entries, category) => {
      const heading = document.createElement('h3');
      heading.className = 'shopping-suggestion-category';
      heading.textContent = category;
      suggestions.appendChild(heading);
      const grid = document.createElement('div');
      grid.className = 'shopping-suggestion-grid';
      entries.forEach(([name, emoji]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'shopping-suggestion';
        button.appendChild(renderShoppingIcon(name, emoji));
        const label = document.createElement('span');
        label.className = 'shopping-suggestion-name';
        label.textContent = name;
        button.appendChild(label);
        button.addEventListener('click', async () => {
          try {
            const updated = await addShoppingItem(currentList(), name);
            lists = lists.map(list => list.id === updated.id ? updated : list);
            drawItems();
            searchInput.value = '';
            drawSuggestions('');
          } catch (error) {
            reportShoppingError(error, 'Der Artikel konnte nicht hinzugefügt werden.');
          }
        });
        grid.appendChild(button);
      });
      suggestions.appendChild(grid);
    });
    if (normalizedQuery && !shoppingCatalog.some(([name]) => normalizeIngredientName(name) === normalizedQuery)) {
      const addCustom = document.createElement('button');
      addCustom.type = 'button';
      addCustom.className = 'shopping-suggestion shopping-custom-suggestion';
      addCustom.appendChild(renderShoppingIcon(query.trim()));
      const label = document.createElement('span');
      label.className = 'shopping-suggestion-name';
      label.textContent = `„${query.trim()}“ hinzufügen`;
      addCustom.appendChild(label);
      addCustom.addEventListener('click', async () => {
        try {
          const updated = await addShoppingItem(currentList(), query.trim());
          lists = lists.map(list => list.id === updated.id ? updated : list);
          drawItems();
          searchInput.value = '';
          drawSuggestions('');
        } catch (error) {
          reportShoppingError(error, 'Der Artikel konnte nicht hinzugefügt werden.');
        }
      });
      suggestions.appendChild(addCustom);
    }
  }

  listPicker.value = currentList().id;
  listPicker.addEventListener('change', () => {
    selectedShoppingListId = listPicker.value;
    drawItems();
  });
  searchInput.addEventListener('input', () => drawSuggestions(searchInput.value));
  createBtn.addEventListener('click', () => {
    openShoppingListNameSheet('Neue Einkaufsliste', '', 'Erstellen', async name => {
      const created = await saveShoppingList(blankShoppingList(name));
      lists = [created, ...lists];
      selectedShoppingListId = created.id;
      renderListPicker();
      drawItems();
    });
  });
  renameBtn.addEventListener('click', () => {
    const list = currentList();
    openShoppingListNameSheet('Einkaufsliste umbenennen', list.name, 'Speichern', async name => {
      if (name === list.name) return;
      const updated = await saveShoppingList({ ...list, name });
      lists = lists.map(entry => entry.id === updated.id ? updated : entry);
      renderListPicker();
    });
  });
  deleteBtn.addEventListener('click', async () => {
    const list = currentList();
    if (!confirm(`„${list.name}“ und alle Artikel wirklich löschen?`)) return;
    try {
      await deleteShoppingList(list.id);
      lists = lists.filter(entry => entry.id !== list.id);
      if (!lists.length) {
        const replacement = await saveShoppingList(blankShoppingList());
        lists = [replacement];
      }
      selectedShoppingListId = lists[0].id;
      renderListPicker();
      drawItems();
    } catch (error) {
      reportShoppingError(error, 'Die Einkaufsliste konnte nicht gelöscht werden.');
    }
  });

  renderListPicker();
  drawSuggestions('');
  drawItems();
}

function reportShoppingError(error, message) {
  console.error(message, error);
  alert(message);
}

function openShoppingListNameSheet(title, initialName, submitText, saveName) {
  openSheet('tpl-shopping-list-name', node => {
    const form = node.querySelector('.shopping-list-name-form');
    const input = node.querySelector('.shopping-list-name-input');
    const submit = node.querySelector('.shopping-list-name-submit');
    node.querySelector('.shopping-list-name-title').textContent = title;
    node.querySelector('.shopping-list-name-cancel').addEventListener('click', closeSheet);
    input.value = initialName;
    submit.textContent = submitText;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const name = input.value.replace(/\s+/g, ' ').trim();
      if (!name) {
        input.focus();
        return;
      }
      submit.disabled = true;
      try {
        await saveName(name);
        closeSheet();
      } catch (error) {
        submit.disabled = false;
        reportShoppingError(error, 'Die Einkaufsliste konnte nicht gespeichert werden.');
      }
    });
    input.focus();
  });
}

async function renderGrid() {
  const all = await getAllRecipes();
  const selectedIngredientNames = new Set([...selectedIngredients].map(normalizeIngredientName));
  const filtered = sortRecipes(all, currentSort).filter(r => {
    if (currentTag && !r.tags.includes(currentTag)) return false;
    if (currentSearch) {
      const inTitle = r.title.toLowerCase().includes(currentSearch);
      const inIngredients = r.ingredients.some(i => (i.name || '').toLowerCase().includes(currentSearch));
      if (!inTitle && !inIngredients) return false;
    }
    if (selectedIngredients.size > 0) {
      const recipeIngredients = new Set(r.ingredients.map(ing => normalizeIngredientName(ing.name)));
      const includesSelectedIngredients = [...selectedIngredientNames].every(selected =>
        recipeIngredients.has(selected)
      );
      if (!includesSelectedIngredients) return false;
    }
    return true;
  });

  const grid = document.getElementById('grid');
  const emptyState = document.getElementById('empty-state');
  grid.innerHTML = '';

  if (all.length === 0 || filtered.length === 0) {
    emptyState.querySelector('.empty-message').textContent = all.length === 0
      ? 'Noch keine Rezepte. Tippe oben rechts auf „+“, um eines hinzuzufügen.'
      : 'Keine Rezepte mit den ausgewählten Filtern gefunden.';
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  const tileTpl = document.getElementById('tpl-tile');
  filtered.forEach(r => {
    const node = tileTpl.content.cloneNode(true);
    const tile = node.querySelector('.tile');
    const img = node.querySelector('.tile-img');
    if (r.image) img.style.backgroundImage = `url(${r.image})`;
    node.querySelector('.tile-cat').textContent = r.tags.length ? r.tags.slice(0, 2).join(' · ') : '—';
    node.querySelector('.tile-title').textContent = r.title;
    tile.addEventListener('click', () => { location.hash = `recipe/${r.id}`; });
    grid.appendChild(node);
  });
}

async function openRecipeShopping(recipe, servings) {
  const seq = routeSeq;
  try {
    const lists = await ensureShoppingList();
    if (seq !== routeSeq) return;
    const targetId = lists.some(list => list.id === selectedShoppingListId)
      ? selectedShoppingListId
      : lists[0].id;
    selectedShoppingListId = targetId;
    openSheet('tpl-shopping-recipe', node => {
      const picker = node.querySelector('.shopping-target-list');
      const ingredientContainer = node.querySelector('.shopping-recipe-ingredients');
      const scaledIngredients = scaleIngredients(recipe.ingredients, recipe.servingsBase, servings);
      lists.forEach(list => {
        const option = document.createElement('option');
        option.value = list.id;
        option.textContent = list.name;
        option.selected = list.id === targetId;
        picker.appendChild(option);
      });
      scaledIngredients.forEach((ingredient, index) => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.value = String(index);
        const text = document.createElement('span');
        text.textContent = [formatAmount(ingredient.amount, ingredient.unit), ingredient.name]
          .filter(Boolean).join(' ');
        label.append(checkbox, text);
        ingredientContainer.appendChild(label);
      });
      node.querySelector('.shopping-recipe-cancel').addEventListener('click', closeSheet);
      node.querySelector('.shopping-recipe-confirm').addEventListener('click', async event => {
        const selected = [...ingredientContainer.querySelectorAll('input:checked')]
          .map(input => scaledIngredients[Number(input.value)])
          .filter(ingredient => ingredient?.name?.trim());
        if (!selected.length) {
          alert('Wähle mindestens eine Zutat aus.');
          return;
        }
        const destination = lists.find(list => list.id === picker.value);
        if (!destination) {
          alert('Die ausgewählte Einkaufsliste ist nicht verfügbar.');
          return;
        }
        const grouped = new Map();
        selected.forEach(ingredient => {
          const key = normalizeIngredientName(ingredient.name);
          const current = grouped.get(key) || { name: ingredient.name.trim(), quantities: [] };
          current.quantities = mergeShoppingQuantities(current.quantities, [{
            amount: ingredient.amount,
            unit: ingredient.unit || '',
          }]);
          grouped.set(key, current);
        });
        let items = [...destination.items];
        grouped.forEach(ingredient => {
          const existing = items.find(item => normalizeIngredientName(item.name) === normalizeIngredientName(ingredient.name));
          if (existing) existing.quantities = mergeShoppingQuantities(existing.quantities, ingredient.quantities);
          else {
            const catalog = catalogEntry(ingredient.name);
            items.push({
              id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
              name: ingredient.name,
              category: catalog?.[2] || 'Weitere Artikel',
              emoji: catalog?.[1] || '',
              quantities: ingredient.quantities,
              createdAt: Date.now(),
            });
          }
        });
        const confirmButton = event.currentTarget;
        confirmButton.disabled = true;
        try {
          await saveShoppingList({ ...destination, items });
          selectedShoppingListId = destination.id;
          closeSheet();
          alert(`${selected.length} Zutat(en) zur Liste „${destination.name}“ hinzugefügt.`);
        } catch (error) {
          confirmButton.disabled = false;
          reportShoppingError(error, 'Die Zutaten konnten nicht hinzugefügt werden.');
        }
      });
    });
  } catch (error) {
    reportShoppingError(error, 'Die Einkaufsliste konnte nicht geladen werden.');
  }
}

// ---------- Detailseite ----------

async function renderDetail(id) {
  const seq = routeSeq;
  const recipe = await getRecipe(id);
  if (seq !== routeSeq) return;
  if (!recipe) { location.hash = ''; return; }

  pageTitle.textContent = recipe.title;
  const tpl = document.getElementById('tpl-detail').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  const root = app.querySelector('.detail');
  const img = root.querySelector('.detail-img');
  if (recipe.image) img.style.backgroundImage = `url(${recipe.image})`; else img.style.display = 'none';

  root.querySelector('.d-title').textContent = recipe.title;
  const metaParts = [...recipe.tags];
  if (recipe.prepTime) metaParts.push(`${recipe.prepTime} Min.`);
  root.querySelector('.d-meta').textContent = metaParts.join(' · ');

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

  const notesField = root.querySelector('.recipe-notes');
  notesField.value = recipe.notes || '';
  notesField.addEventListener('change', async () => {
    recipe.notes = notesField.value.trim();
    await saveRecipe(recipe);
  });

  let servings = recipe.servingsBase;
  const servCount = root.querySelector('.serv-count');
  const ingredientList = root.querySelector('.ingredient-list');

  function renderIngredients() {
    servCount.textContent = servings;
    const scaled = scaleIngredients(recipe.ingredients, recipe.servingsBase, servings);
    ingredientList.innerHTML = '';
    scaled.forEach(ing => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = ing.name;
      const amt = document.createElement('span');
      amt.className = 'amt';
      amt.textContent = formatAmount(ing.amount, ing.unit);
      li.appendChild(name);
      li.appendChild(amt);
      ingredientList.appendChild(li);
    });
  }
  renderIngredients();

  root.querySelectorAll('.serv-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta, 10);
      const next = servings + delta;
      if (next >= 1) { servings = next; renderIngredients(); }
    });
  });

  const stepList = root.querySelector('.step-list');
  recipe.steps.forEach(step => {
    const li = document.createElement('li');
    li.textContent = step;
    stepList.appendChild(li);
  });

  root.querySelector('.btn-share').addEventListener('click', () => shareRecipe(recipe));
  root.querySelector('.btn-shopping-add').addEventListener('click', () => openRecipeShopping(recipe, servings));

  // Kochmodus: gewählte Portionenzahl wird per Hash-Parameter mitgegeben.
  root.querySelector('.btn-cook-mode').addEventListener('click', () => {
    location.hash = `cook/${id}?s=${servings}`;
  });

  // PDF: Bibliothek und Bildgröße schon beim Öffnen vorladen, damit der Klick
  // direkt ins Share-Sheet führt (Safari verlangt eine zeitnahe Tipp-Geste).
  const pdfAssets = preparePdfAssets(recipe);
  pdfAssets.catch(() => { /* Fehler wird beim Klick behandelt */ });
  const pdfBtn = root.querySelector('.btn-pdf');
  pdfBtn.addEventListener('click', async () => {
    pdfBtn.disabled = true;
    pdfBtn.textContent = 'Erstelle PDF …';
    try {
      await exportRecipePdf(recipe, servings, pdfAssets);
    } catch {
      alert('PDF konnte nicht erstellt werden.');
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.textContent = 'PDF';
    }
  });

  const cookedBtn = root.querySelector('.btn-cooked');
  function updateCookedLabel() {
    if (recipe.lastCookedAt) {
      const d = new Date(recipe.lastCookedAt);
      cookedBtn.textContent = `Zuletzt gekocht: ${d.toLocaleDateString('de-DE')}`;
      cookedBtn.classList.add('done');
    } else {
      cookedBtn.textContent = 'Heute gekocht';
      cookedBtn.classList.remove('done');
    }
  }
  updateCookedLabel();
  cookedBtn.addEventListener('click', async () => {
    recipe.lastCookedAt = Date.now();
    await saveRecipe(recipe);
    updateCookedLabel();
  });

  const wakeCheckbox = root.querySelector('.wake-lock-checkbox');
  if (!wakeLockSupported()) {
    wakeCheckbox.closest('.wake-lock-toggle').hidden = true;
  } else {
    wakeCheckbox.addEventListener('change', async () => {
      if (wakeCheckbox.checked) {
        const ok = await enableWakeLock();
        if (!ok) wakeCheckbox.checked = false;
      } else {
        await disableWakeLock();
      }
    });
  }

  root.querySelector('.btn-edit').addEventListener('click', () => { location.hash = `edit/${id}`; });
  root.querySelector('.btn-delete').addEventListener('click', async () => {
    if (confirm(`„${recipe.title}“ wirklich löschen?`)) {
      await deleteRecipe(id);
      location.hash = '';
    }
  });
}

// ---------- Kochmodus ----------
// Ein Schritt pro Seite, große Schrift, Wischen/Pfeiltasten zum Blättern,
// Bildschirm bleibt wach (sofern unterstützt). Beim Start wird zuerst die
// Zutatenliste (für die gewählte Portionenzahl) eingeblendet.

async function renderCook(id, servingsFromUrl) {
  const seq = routeSeq;
  const recipe = await getRecipe(id);
  if (seq !== routeSeq) return;
  if (!recipe) { location.hash = ''; return; }

  const servings = servingsFromUrl && servingsFromUrl > 0 ? servingsFromUrl : recipe.servingsBase;
  pageTitle.textContent = 'Kochmodus';
  const tpl = document.getElementById('tpl-cook').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  const root = app.querySelector('.cook');
  const stepEl = root.querySelector('.cook-step');
  const counterEl = root.querySelector('.cook-counter');
  const barEl = root.querySelector('.cook-progress-bar');
  const prevBtn = root.querySelector('.cook-prev');
  const nextBtn = root.querySelector('.cook-next');
  const panel = root.querySelector('.cook-ingredients');

  // Zutatenpanel
  root.querySelector('.cook-ingredients-title').textContent =
    `Zutaten für ${servings} ${servings === 1 ? 'Portion' : 'Portionen'}`;
  const list = panel.querySelector('.ingredient-list');
  scaleIngredients(recipe.ingredients, recipe.servingsBase, servings).forEach(ing => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = ing.name;
    const amt = document.createElement('span');
    amt.className = 'amt';
    amt.textContent = formatAmount(ing.amount, ing.unit);
    li.append(name, amt);
    list.appendChild(li);
  });
  const showPanel = show => { panel.hidden = !show; };
  showPanel(true);
  root.querySelector('.cook-ingredients-btn').addEventListener('click', () => showPanel(true));
  root.querySelector('.cook-ingredients-close').addEventListener('click', () => showPanel(false));

  const steps = recipe.steps;
  let index = 0;

  const timerMinutesInput = root.querySelector('.cook-timer-minutes');
  const timerDisplay = root.querySelector('.cook-timer-display');
  const timerStartBtn = root.querySelector('.cook-timer-start');
  const timerPauseBtn = root.querySelector('.cook-timer-pause');
  const timerResetBtn = root.querySelector('.cook-timer-reset');

  let timerRemainingMs = Math.max(0, (parseInt(timerMinutesInput.value, 10) || 0) * 60 * 1000);
  let timerHandle = null;

  function updateTimerDisplay() {
    const totalSeconds = Math.max(0, Math.ceil(timerRemainingMs / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    timerDisplay.textContent = `${minutes}:${seconds}`;
  }

  function setTimerFromInput() {
    const minutes = Math.max(0, Math.min(180, parseInt(timerMinutesInput.value, 10) || 0));
    timerMinutesInput.value = minutes;
    timerRemainingMs = minutes * 60 * 1000;
    updateTimerDisplay();
  }

  function stopTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function startTimer() {
    if (timerRemainingMs <= 0) setTimerFromInput();
    if (timerHandle) return;
    timerHandle = setInterval(() => {
      timerRemainingMs = Math.max(0, timerRemainingMs - 1000);
      updateTimerDisplay();
      if (timerRemainingMs === 0) {
        stopTimer();
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        alert('Timer abgelaufen!');
      }
    }, 1000);
  }

  timerMinutesInput.addEventListener('change', () => setTimerFromInput());
  timerStartBtn.addEventListener('click', startTimer);
  timerPauseBtn.addEventListener('click', stopTimer);
  timerResetBtn.addEventListener('click', () => { stopTimer(); setTimerFromInput(); });
  updateTimerDisplay();

  async function finish() {
    recipe.lastCookedAt = Date.now();
    await saveRecipe(recipe);
    location.replace(`#recipe/${id}`);
  }

  function renderStep() {
    if (steps.length === 0) {
      stepEl.textContent = 'Dieses Rezept hat keine Zubereitungsschritte.';
      counterEl.textContent = '';
      barEl.style.width = '0%';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }
    stepEl.textContent = steps[index];
    counterEl.textContent = `Schritt ${index + 1} von ${steps.length}`;
    barEl.style.width = `${((index + 1) / steps.length) * 100}%`;
    prevBtn.disabled = index === 0;
    nextBtn.textContent = index === steps.length - 1 ? 'Fertig ✓' : 'Weiter ›';
  }

  function go(delta) {
    if (steps.length === 0) return;
    const next = index + delta;
    if (next >= steps.length) { finish(); return; }
    if (next < 0) return;
    index = next;
    renderStep();
  }

  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));

  // Wischen (horizontal) zum Blättern
  let touchStart = null;
  stepEl.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  stepEl.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  // Pfeiltasten (Desktop) — Listener beim Verlassen der Ansicht entfernen
  const onKey = e => {
    if (!panel.hidden) return;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  document.addEventListener('keydown', onKey);
  cleanupView = () => {
    stopTimer();
    document.removeEventListener('keydown', onKey);
  };

  renderStep();
  if (wakeLockSupported()) enableWakeLock();
}

function buildShareText(recipe) {
  const lines = [recipe.title, ''];
  if (recipe.tags.length) lines.push(`Tags: ${recipe.tags.join(', ')}`);
  lines.push(`Portionen: ${recipe.servingsBase}`, '', 'Zutaten:');
  recipe.ingredients.forEach(ing => {
    lines.push(`- ${formatAmount(ing.amount, ing.unit)} ${ing.name}`.trim());
  });
  lines.push('', 'Zubereitung:');
  recipe.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  return lines.join('\n');
}

async function shareRecipe(recipe) {
  const shareUrl = await createRecipeShareLink(recipe);
  const shareText = buildShareText(recipe);

  openSheet('tpl-share-choice', node => {
    node.querySelector('#share-link').addEventListener('click', async () => {
      closeSheet();
      if (navigator.share) {
        try {
          await navigator.share({ title: recipe.title, url: shareUrl });
          return;
        } catch {
          // Nutzer hat Teilen-Dialog abgebrochen — kein Fehler.
        }
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        alert('Der Rezept-Link wurde in die Zwischenablage kopiert.');
        return;
      }
      alert('Teilen wird in diesem Browser nicht unterstützt.');
    });

    node.querySelector('#share-text').addEventListener('click', async () => {
      closeSheet();
      const payload = `${shareText}\n\nLink: ${shareUrl}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: recipe.title, text: payload });
          return;
        } catch {
          // Nutzer hat Teilen-Dialog abgebrochen — kein Fehler.
        }
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(payload);
        alert('Rezepttext und Link wurden in die Zwischenablage kopiert.');
        return;
      }
      alert('Teilen wird in diesem Browser nicht unterstützt.');
    });

    node.querySelector('#share-cancel').addEventListener('click', closeSheet);
  });
}

// ---------- Rezept hinzufügen: Auswahl-Sheet ----------

function openAddMenu() {
  openSheet('tpl-add-menu', node => {
    node.querySelector('#add-via-url').addEventListener('click', () => openUrlImport());
    node.querySelector('#add-via-scan').addEventListener('click', () => openScanImport());
    node.querySelector('#add-via-manual').addEventListener('click', () => {
      closeSheet();
      location.hash = 'new';
    });
    node.querySelector('#add-cancel').addEventListener('click', closeSheet);
  });
}

function openSheet(templateId, wire) {
  const tpl = document.getElementById(templateId).content.cloneNode(true);
  overlay.innerHTML = '';
  overlay.appendChild(tpl);
  overlay.hidden = false;
  trackVisualViewport();
  overlay.addEventListener('click', onOverlayClick);
  wire(overlay);
}

function trackVisualViewport() {
  if (visualViewportCleanup) {
    visualViewportCleanup();
    visualViewportCleanup = null;
  }
  const viewport = window.visualViewport;
  if (!viewport) return;

  const update = () => {
    overlay.style.top = `${viewport.offsetTop}px`;
    overlay.style.height = `${viewport.height}px`;
    overlay.style.bottom = 'auto';
    overlay.style.setProperty(
      '--overlay-content-max-height',
      `${Math.min(viewport.height * 0.88, 820)}px`
    );
  };

  update();
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  visualViewportCleanup = () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    overlay.style.removeProperty('top');
    overlay.style.removeProperty('height');
    overlay.style.removeProperty('bottom');
    overlay.style.removeProperty('--overlay-content-max-height');
  };
}

function onOverlayClick(e) {
  if (e.target === overlay) closeSheet();
}

function closeSheet() {
  if (visualViewportCleanup) {
    visualViewportCleanup();
    visualViewportCleanup = null;
  }
  overlay.hidden = true;
  overlay.innerHTML = '';
  overlay.removeEventListener('click', onOverlayClick);
}

// ---------- URL-Import ----------

function openUrlImport() {
  openSheet('tpl-url-import', node => {
    const input = node.querySelector('#url-input');
    const status = node.querySelector('#url-status');
    const fallback = node.querySelector('#url-fallback');
    const fallbackText = node.querySelector('#url-fallback-text');

    node.querySelector('#url-fetch-btn').addEventListener('click', async () => {
      const url = input.value.trim();
      if (!url) return;
      status.textContent = 'Importiere … (versuche mehrere Wege, kann 10–20 Sek. dauern)';
      fallback.hidden = true;
      try {
        const recipe = await importFromUrl(url);
        status.textContent = 'Gefunden — bitte prüfen und speichern.';
        closeSheet();
        openEditFormForRecipe(recipe);
      } catch (err) {
        if (err && err.message === 'INVALID_URL') {
          status.textContent = 'Bitte eine gültige Rezeptadresse mit http oder https eingeben.';
          return;
        }
        if (err && err.message === 'INVALID_SHARED_RECIPE') {
          status.textContent = 'Der Rezept-Link ist unvollständig oder beschädigt. Bitte kopiere ihn erneut.';
          return;
        }
        status.textContent = 'Kein vollständiges Rezept erkannt — bitte Seiteninhalt einfügen und prüfen.';
        fallback.hidden = false;
        fallback.open = true;
        // Falls wenigstens über den Reader-Fallback Text geholt werden konnte,
        // direkt vorausfüllen — erspart erneutes Kopieren.
        if (err && err.partialText) {
          fallbackText.value = err.partialText;
        }
      }
    });

    node.querySelector('#url-fallback-parse').addEventListener('click', () => {
      const text = fallbackText.value;
      const sourceUrl = input.value.trim();
      // Eingefügter Inhalt kann HTML (Seitenquelltext) oder reiner Text sein
      // (z.B. per "Alles auswählen" kopiert, oder vom Reader-Fallback vorbefüllt).
      // Erst als HTML versuchen, dann als Fließtext.
      const recipe = extractFromHtml(text, sourceUrl) || extractFromReaderText(text, sourceUrl);
      if (recipe) {
        closeSheet();
        openEditFormForRecipe(recipe);
      } else {
        // Kein strukturiertes Recipe-Schema im eingefügten Inhalt gefunden ->
        // leeres Formular öffnen, Nutzer trägt es manuell ein.
        alert('Konnte keine strukturierten Rezeptdaten finden. Bitte manuell eingeben.');
        closeSheet();
        location.hash = 'new';
      }
    });
  });
}

// ---------- Scan-Import (OCR) ----------

function openScanImport() {
  openSheet('tpl-scan-import', node => {
    const fileInput = node.querySelector('#scan-file');
    const preview = node.querySelector('#scan-preview');
    const status = node.querySelector('#scan-status');

    node.querySelector('#scan-trigger').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      preview.appendChild(img);

      status.textContent = 'Texterkennung läuft … 0%';
      try {
        const text = await recognizeImage(file, pct => { status.textContent = `Texterkennung läuft … ${pct}%`; });
        status.textContent = 'Fertig — bitte Ergebnis prüfen.';
        const recipe = draftRecipeFromOcrText(text);
        recipe.image = await compressImageToDataUrl(file).catch(() => fileToDataUrl(file));
        closeSheet();
        openEditFormForRecipe(recipe);
      } catch (err) {
        status.textContent = 'Texterkennung fehlgeschlagen. Bitte erneut versuchen oder manuell eingeben.';
      }
    });
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Formular (Neu / Bearbeiten) ----------

let draftForForm = null; // vorbefülltes Rezept aus Import, falls vorhanden

function openEditFormForRecipe(recipe) {
  draftForForm = recipe;
  location.hash = 'new';
}

async function renderEditForm(id) {
  let recipe;
  if (id) {
    recipe = await getRecipe(id);
    if (!recipe) { location.hash = ''; return; }
  } else if (draftForForm) {
    recipe = draftForForm;
    draftForForm = null;
  } else {
    recipe = blankRecipe();
  }

  pageTitle.textContent = id ? 'Rezept bearbeiten' : 'Neues Rezept';
  const tpl = document.getElementById('tpl-recipe-form').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  const form = app.querySelector('#recipe-form');
  form.title.value = recipe.title || '';
  const tagsInput = form.elements.tags;
  tagsInput.value = (recipe.tags || []).join(', ');
  form.servings.value = recipe.servingsBase || 4;
  form.prepTime.value = recipe.prepTime || '';
  form.source.value = recipe.source || '';
  form.favorite.checked = Boolean(recipe.favorite);
  form.rating.value = String(Number(recipe.rating) || 0);
  form.notes.value = recipe.notes || '';

  // Vorhandene Tags als antippbare Vorschläge (an/aus), zusätzlich zur Texteingabe.
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

  let imageDataUrl = recipe.image || null;
  const imagePreview = document.getElementById('image-preview');
  renderImagePreview();
  form.image.addEventListener('change', async () => {
    const file = form.image.files[0];
    if (file) {
      imageDataUrl = await compressImageToDataUrl(file).catch(() => fileToDataUrl(file));
      renderImagePreview();
    }
  });
  function renderImagePreview() {
    imagePreview.innerHTML = imageDataUrl ? `<img src="${imageDataUrl}">` : '';
  }

  const ingredientRows = document.getElementById('ingredient-rows');
  const stepRows = document.getElementById('step-rows');

  // Jede Zeile bekommt einen eindeutigen Feldnamen + autocomplete="off".
  // Ohne das verwechselt iOS Safari gleichartige, namenlose Felder beim
  // Nachladen neuer Zeilen und schlägt den zuletzt eingegebenen Wert vor.
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
    row.querySelector('.row-remove').addEventListener('click', () => row.remove());
    stepRows.appendChild(row);
  }

  (recipe.ingredients.length ? recipe.ingredients : [{ amount: '', unit: '', name: '' }]).forEach(addIngredientRow);
  (recipe.steps.length ? recipe.steps : ['']).forEach(addStepRow);

  document.getElementById('add-ingredient-row').addEventListener('click', () => addIngredientRow());
  document.getElementById('add-step-row').addEventListener('click', () => addStepRow());
  document.getElementById('form-cancel').addEventListener('click', () => history.back());

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);

    const ingredients = [...ingredientRows.querySelectorAll('.ing-row')].map(row => {
      const amountRaw = row.querySelector('.ing-amount').value.trim();
      const unit = row.querySelector('.ing-unit').value.trim() || null;
      const name = row.querySelector('.ing-name').value.trim();
      const amount = amountRaw === '' ? null : parseFloat(amountRaw.replace(',', '.'));
      return { amount: Number.isNaN(amount) ? null : amount, unit, name };
    }).filter(i => i.name);

    const steps = [...stepRows.querySelectorAll('textarea')].map(t => t.value.trim()).filter(Boolean);

    const updated = {
      ...recipe,
      title: fd.get('title').trim(),
      tags: parseTagInput(fd.get('tags')),
      favorite: Boolean(fd.get('favorite')),
      rating: Math.max(0, Math.min(5, Number(fd.get('rating')) || 0)),
      notes: String(fd.get('notes') || '').trim(),
      servingsBase: parseInt(fd.get('servings'), 10) || 1,
      prepTime: fd.get('prepTime') ? parseInt(fd.get('prepTime'), 10) : null,
      source: fd.get('source').trim() || null,
      image: imageDataUrl,
      ingredients,
      steps,
    };

    // Duplikat-Warnung: nur bei neuem Rezept oder geändertem Titel/Quelle,
    // sonst würde jedes Bearbeiten eines bereits doppelten Rezepts erneut warnen.
    const titleOrSourceChanged = !id
      || updated.title.trim().toLowerCase() !== (recipe.title || '').trim().toLowerCase()
      || (updated.source || '') !== (recipe.source || '');
    if (titleOrSourceChanged) {
      const dup = findDuplicate(updated, await getAllRecipes());
      if (dup) {
        const why = dup.reason === 'source'
          ? `Dieses Rezept hat dieselbe Quelle wie „${dup.recipe.title}“.`
          : `Ein Rezept mit dem Titel „${dup.recipe.title}“ gibt es schon.`;
        if (!confirm(`${why}\n\nTrotzdem speichern?`)) return;
      }
    }

    await saveRecipe(updated);
    location.hash = `recipe/${updated.id}`;
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Service Worker registrieren ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Fähigkeit optional */ });
  });
}
