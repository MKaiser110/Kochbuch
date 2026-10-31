// overview.js — Übersicht: Suche, Sortierung, Tag-Chips, Zutatenfilter, Rezept-Kacheln.

import { getAllRecipes, getAllTags } from '../core/db.js';
import { sortRecipes, filterRecipes } from '../core/recipe-query.js';
import { overviewState } from '../state.js';
import { appRoot, mountTemplate, setPageTitle, cloneTemplate, makeChip } from '../utils/dom.js';
import { currentNavigation, isStale, runViewCleanup, setViewCleanup } from '../view-lifecycle.js';
import { openIngredientFilter } from '../sheets/ingredient-filter.js';

export async function renderOverview() {
  runViewCleanup();
  setPageTitle('Kochbuch');
  mountTemplate('tpl-overview');

  setupSearch();
  setupSortMenu();

  const seq = currentNavigation();
  const tags = await getAllTags();
  if (isStale(seq)) return;

  renderTagChips(tags);
  setupIngredientFilterButton();
  await renderGrid();
}

function setupSearch() {
  const searchInput = document.getElementById('search');
  searchInput.value = overviewState.search;
  searchInput.addEventListener('input', e => {
    overviewState.search = e.target.value.toLowerCase();
    renderGrid();
  });
}

/** Sortier-Dropdown mit Tastaturbedienung. Registriert die Aufräumfunktion der Ansicht. */
function setupSortMenu() {
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
  setViewCleanup(() => document.removeEventListener('pointerdown', closeSortMenuOutside));
}

function renderTagChips(tags) {
  // Gewählter Tag existiert evtl. nicht mehr (Rezept gelöscht/umbenannt) -> Filter zurücksetzen
  if (overviewState.tag && !tags.includes(overviewState.tag)) overviewState.tag = null;
  const chipWrap = document.getElementById('tag-filter');
  chipWrap.innerHTML = '';
  chipWrap.appendChild(makeChip('Alle', overviewState.tag === null, () => {
    overviewState.tag = null;
    renderOverview();
  }));
  tags.forEach(tag => {
    chipWrap.appendChild(makeChip(tag, overviewState.tag === tag, () => {
      overviewState.tag = tag;
      renderOverview();
    }));
  });
}

function setupIngredientFilterButton() {
  const filterBtn = document.getElementById('btn-ingredient-filter');
  const activeCount = overviewState.ingredients.size;
  filterBtn.querySelector('span').textContent = activeCount
    ? `Zutatenfilter aktiv (${activeCount}) — ändern`
    : 'Nach Zutaten filtern';
  filterBtn.addEventListener('click', () => openIngredientFilter(renderOverview));
}

async function renderGrid() {
  const all = await getAllRecipes();
  const filtered = filterRecipes(sortRecipes(all, overviewState.sort), overviewState);

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

  filtered.forEach(recipe => grid.appendChild(createTile(recipe)));
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
