// dom.js — gemeinsame DOM-Helfer für alle Ansichten und Sheets.

import { formatAmount } from '../services/scaling.js';

export const appRoot = document.getElementById('app');
const pageTitleEl = document.getElementById('page-title');

export function setPageTitle(text) {
  pageTitleEl.textContent = text;
}

/** Klont ein <template> aus index.html. */
export function cloneTemplate(templateId) {
  return document.getElementById(templateId).content.cloneNode(true);
}

/** Ersetzt den Inhalt von #app durch das geklonte Template. */
export function mountTemplate(templateId) {
  const fragment = cloneTemplate(templateId);
  appRoot.innerHTML = '';
  appRoot.appendChild(fragment);
}

export function makeChip(label, active, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button'; // verhindert Formular-Submit, wenn Chips im Formular genutzt werden
  btn.className = 'chip' + (active ? ' active' : '');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Füllt eine <ul class="ingredient-list"> mit bereits skalierten Zutaten (Name + Menge). */
export function fillIngredientList(listEl, ingredients) {
  listEl.innerHTML = '';
  let currentCategory = null;
  let currentGroup = null;

  ingredients.forEach(ing => {
    const category = ing.category?.trim() || null;
    if (category !== currentCategory) {
      if (category) {
        const heading = document.createElement('li');
        heading.className = 'ingredient-category';
        heading.textContent = category;
        listEl.appendChild(heading);
        currentGroup = heading;
      } else if (currentCategory) {
        currentGroup = null;
      }
      currentCategory = category;
    }

    const li = document.createElement('li');
    li.className = 'ingredient-item';
    const name = document.createElement('span');
    name.textContent = ing.name;
    const amount = document.createElement('span');
    amount.className = 'amt';
    amount.textContent = formatAmount(ing.amount, ing.unit);
    li.append(name, amount);
    listEl.appendChild(li);
  });
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
