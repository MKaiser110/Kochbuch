// overview.js — Übersicht: Suche, Sortierung, Tag-Chips, Zutatenfilter, Rezept-Kacheln.

import { getAllRecipes } from '../core/db.js';
import { sortRecipes, filterRecipes } from '../core/recipe-query.js';
import { overviewState } from '../state.js';
import { appRoot, mountTemplate, setPageTitle, cloneTemplate, makeChip } from '../utils/dom.js';
import { currentNavigation, isStale, runViewCleanup, setViewCleanup } from '../view-lifecycle.js';
import { openIngredientFilter } from '../sheets/ingredient-filter.js';

export async function renderOverview() {
  runViewCleanup();
  setPageTitle('Kochbuch');
  mountTemplate('tpl-overview');

  const seq = currentNavigation();
  const recipes = await getAllRecipes();
  if (isStale(seq)) return;

  const tags = [...new Set(recipes.flatMap(recipe => recipe.tags))]
    .sort((a, b) => a.localeCompare(b, 'de'));
  let sortedRecipes = sortRecipes(recipes, overviewState.sort);
  const renderFiltered = () => renderGrid(sortedRecipes, recipes.length, seq);
  const cleanupSearch = setupSearch(renderFiltered);
  const cleanupSort = setupSortMenu(() => {
    sortedRecipes = sortRecipes(recipes, overviewState.sort);
    renderFiltered();
  });
  setViewCleanup(() => { cleanupSearch(); cleanupSort(); });
  renderTagChips(tags, renderFiltered);
  setupIngredientFilterButton();
  document.getElementById('empty-reset-filters').addEventListener('click', () => {
    overviewState.search = '';
    overviewState.tag = null;
    overviewState.ingredients = new Set();
    renderOverview();
  });
  renderFiltered();
}

function setupSearch(renderFiltered) {
  const searchInput = document.getElementById('search');
  searchInput.value = overviewState.search;
  let renderFrame = 0;
  const onSearchInput = e => {
    overviewState.search = e.target.value.toLowerCase();
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(renderFiltered);
  };
  searchInput.addEventListener('input', onSearchInput);
  return () => {
    cancelAnimationFrame(renderFrame);
    searchInput.removeEventListener('input', onSearchInput);
  };
}

/** Sortier-Dropdown mit Tastaturbedienung. Registriert die Aufräumfunktion der Ansicht. */
function setupSortMenu(onSortChanged) {
  const sortControl = appRoot.querySelector('.sort-control');
  const sortTrigger = document.getElementById('sort-select');
  const sortMenu = document.getElementById('sort-menu');
  const sortOptions = [...sortMenu.querySelectorAll('.sort-option')];

  function updateSortSelection() {
    const selected = sortOptions.find(option => option.dataset.value === overviewState.sort);
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
      sortOptions.find(option => option.dataset.value === overviewState.sort)?.focus();
    }
  }

  updateSortSelection();
  sortTrigger.addEventListener('click', () => setSortMenuOpen(sortMenu.hidden));
  sortOptions.forEach(option => {
    option.addEventListener('click', () => {
      overviewState.sort = option.dataset.value;
      updateSortSelection();
      setSortMenuOpen(false);
      sortTrigger.focus();
      onSortChanged();
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
  return () => document.removeEventListener('pointerdown', closeSortMenuOutside);
}

function renderTagChips(tags, renderFiltered) {
  // Gewählter Tag existiert evtl. nicht mehr (Rezept gelöscht/umbenannt) -> Filter zurücksetzen
  if (overviewState.tag && !tags.includes(overviewState.tag)) overviewState.tag = null;
  const chipWrap = document.getElementById('tag-filter');
  let pressedChip = null;
  let pressX = 0;
  let pressY = 0;
  chipWrap.addEventListener('pointerdown', event => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    pressedChip = chip;
    pressX = event.clientX;
    pressY = event.clientY;
    const currentScroll = chipWrap.scrollLeft;
    chipWrap.style.webkitOverflowScrolling = 'auto';
    chipWrap.scrollLeft = currentScroll;
    requestAnimationFrame(() => {
      chipWrap.style.webkitOverflowScrolling = 'touch';
      chipWrap.scrollLeft = currentScroll;
    });
  }, { passive: true });
  chipWrap.addEventListener('pointerup', event => {
    const chip = pressedChip;
    pressedChip = null;
    if (!chip || !chip.isConnected || !chip.contains(event.target)
        || Math.hypot(event.clientX - pressX, event.clientY - pressY) > 12) return;
    // Scroll-Container können den nativen Click beim Abbrechen des Nachlaufs
    // verwerfen. Löst den Click gezielt für den Tag unter dem Finger aus.
    chip.click();
  });
  chipWrap.addEventListener('pointercancel', () => { pressedChip = null; });
  chipWrap.innerHTML = '';
  const allChip = makeChip('Alle', overviewState.tag === null, () => selectTag(null, chipWrap, renderFiltered));
  allChip.dataset.all = 'true';
  chipWrap.appendChild(allChip);
  tags.forEach(tag => {
    const chip = makeChip(tag, overviewState.tag === tag, () => selectTag(tag, chipWrap, renderFiltered));
    chip.dataset.tagValue = tag;
    chipWrap.appendChild(chip);
  });
}

function selectTag(tag, chipWrap, renderFiltered) {
  if (overviewState.tag === tag) return;
  overviewState.tag = tag;
  chipWrap.querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.all === 'true'
      ? tag === null
      : chip.dataset.tagValue === tag);
  });
  renderFiltered();
}

function setupIngredientFilterButton() {
  const filterBtn = document.getElementById('btn-ingredient-filter');
  const activeCount = overviewState.ingredients.size;
  filterBtn.querySelector('span').textContent = activeCount
    ? `Zutatenfilter aktiv (${activeCount}) — ändern`
    : 'Nach Zutaten filtern';
  filterBtn.addEventListener('click', () => openIngredientFilter(renderOverview));
}

function renderGrid(sortedRecipes, totalRecipes, seq) {
  if (isStale(seq)) return;
  const filtered = filterRecipes(sortedRecipes, overviewState);

  const grid = document.getElementById('grid');
  const emptyState = document.getElementById('empty-state');
  const cards = document.createDocumentFragment();

  if (totalRecipes === 0 || filtered.length === 0) {
    grid.replaceChildren();
    const message = emptyState.querySelector('.empty-message');
    const summary = document.getElementById('empty-filter-summary');
    const resetButton = document.getElementById('empty-reset-filters');
    if (totalRecipes === 0) {
      message.textContent = 'Noch keine Rezepte. Tippe oben rechts auf „+“, um eines hinzuzufügen.';
      summary.hidden = true;
      resetButton.hidden = true;
    } else {
      message.textContent = 'Keine Rezepte passen zu deiner Suche und den Filtern.';
      summary.textContent = describeActiveFilters();
      summary.hidden = false;
      resetButton.hidden = false;
    }
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  filtered.forEach(recipe => cards.appendChild(createTile(recipe)));
  grid.replaceChildren(cards);
}

function describeActiveFilters() {
  const active = [];
  if (overviewState.search) active.push('Suche „' + overviewState.search + '“');
  if (overviewState.tag) active.push('Tag „' + overviewState.tag + '“');
  if (overviewState.ingredients.size) {
    active.push('Zutaten: ' + [...overviewState.ingredients].join(', '));
  }
  return active.join(' · ');
}

function createTile(recipe) {
  const node = cloneTemplate('tpl-tile');
  const tile = node.querySelector('.tile');
  const img = node.querySelector('.tile-img');
  if (recipe.image) img.style.backgroundImage = `url(${recipe.image})`;
  node.querySelector('.tile-cat').textContent = recipe.tags.length ? recipe.tags.slice(0, 2).join(' · ') : '—';
  node.querySelector('.tile-title').textContent = recipe.title;
  tile.addEventListener('click', () => { location.hash = `recipe/${recipe.id}`; });
  return node;
}
