// ingredient-filter.js — Sheet "Nach Zutaten filtern" (Mehrfachauswahl).

import { openSheet, closeSheet } from './sheet.js';
import { getAllIngredientNames } from '../core/db.js';
import { overviewState } from '../state.js';

/** @param {() => void} onChange  wird nach "Anwenden" bzw. "Zurücksetzen" aufgerufen */
export async function openIngredientFilter(onChange) {
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
        checkbox.checked = overviewState.ingredients.has(name);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) overviewState.ingredients.add(name);
          else overviewState.ingredients.delete(name);
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
      onChange();
    });
    node.querySelector('#ingredient-filter-reset').addEventListener('click', () => {
      overviewState.ingredients = new Set();
      closeSheet();
      onChange();
    });
  });
}
