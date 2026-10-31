// router.js — Mini-Router (hash-basiert, jedes Rezept eine eigene Route).
//
//   ''                        Übersicht
//   'shopping'                Einkaufsliste
//   'recipe/<id>'             Detailseite
//   'edit/<id>'               Rezept bearbeiten
//   'new'                     Neues Rezept
//   'cook/<id>?s=<portionen>' Kochmodus

import { disableWakeLock } from './services/wake-lock.js';
import { closeSheet } from './sheets/sheet.js';
import { runViewCleanup, startNavigation } from './view-lifecycle.js';
import { renderOverview } from './views/overview.js';
import { renderDetail } from './views/detail.js';
import { renderCook } from './views/cook-mode.js';
import { renderEditForm } from './views/recipe-form.js';
import { renderShopping } from './views/shopping.js';

const btnBack = document.getElementById('btn-back');
let currentHash = null;
let overviewScrollY = 0;

export function initRouter() {
  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', route);
  btnBack.addEventListener('click', goBack);
}

function goBack() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('edit/')) location.hash = `recipe/${hash.slice('edit/'.length)}`;
  else location.hash = '';
}

function route() {
  const hash = location.hash.slice(1);
  const previousHash = currentHash;
  const restoreOverview = !hash && previousHash?.startsWith('recipe/');
  const app = document.getElementById('app');
  if (previousHash === '' && hash.startsWith('recipe/')) overviewScrollY = app.scrollTop;
  currentHash = hash;
  app.scrollTop = 0;
  closeSheet();
  startNavigation();
  document.body.classList.toggle('cook-mode', hash.startsWith('cook/'));
  disableWakeLock();
  runViewCleanup();

  if (hash.startsWith('cook/')) {
    const [id, query] = hash.slice('cook/'.length).split('?');
    const servings = parseInt(new URLSearchParams(query || '').get('s'), 10) || null;
    btnBack.hidden = false;
    renderCook(id, servings);
  } else if (hash === 'shopping') {
    btnBack.hidden = true;
    renderShopping();
  } else if (hash.startsWith('recipe/')) {
    btnBack.hidden = false;
    renderDetail(hash.slice('recipe/'.length));
  } else if (hash.startsWith('edit/')) {
    btnBack.hidden = false;
    renderEditForm(hash.slice('edit/'.length));
  } else if (hash === 'new') {
    btnBack.hidden = false;
    renderEditForm(null);
  } else {
    btnBack.hidden = true;
    renderOverview().then(() => requestAnimationFrame(() => { app.scrollTop = restoreOverview ? overviewScrollY : 0; }));
  }
}
