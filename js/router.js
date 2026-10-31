// router.js — Mini-Router (hash-basiert, jedes Rezept eine eigene Route).
//
//   ''                        Übersicht
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

const btnBack = document.getElementById('btn-back');
let currentHash = null;
let overviewScrollY = 0;

export function initRouter() {
  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', route);
  btnBack.addEventListener('click', goBack);
}

/**
 * Beim Bearbeiten eines bestehenden Rezepts: zurück zur Detailseite dieses
 * Rezepts. Überall sonst: zur Übersicht.
 */
function goBack() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('edit/')) {
    location.hash = `recipe/${hash.slice('edit/'.length)}`;
  } else {
    location.hash = '';
  }
}

function route() {
  const hash = location.hash.slice(1);
  const previousHash = currentHash;
  const restoreOverview = !hash && previousHash?.startsWith('recipe/');
  if (previousHash === '' && hash.startsWith('recipe/')) {
    overviewScrollY = window.scrollY;
  }
  currentHash = hash;
  window.scrollTo(0, 0);
  closeSheet();
  startNavigation();
  // Im Kochmodus Header-Aktionen ausblenden (kein versehentliches Tippen beim Kochen)
  document.body.classList.toggle('cook-mode', hash.startsWith('cook/'));
  // Beim Seitenwechsel immer Wake Lock freigeben und Ansicht aufräumen;
  // Kochmodus und Detailseite fordern ihn bei Bedarf neu an.
  disableWakeLock();
  runViewCleanup();

  if (hash.startsWith('cook/')) {
    const [id, query] = hash.slice('cook/'.length).split('?');
    const servings = parseInt(new URLSearchParams(query || '').get('s'), 10) || null;
    btnBack.hidden = false;
    renderCook(id, servings);
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
    renderOverview().then(() => {
      requestAnimationFrame(() => window.scrollTo(0, restoreOverview ? overviewScrollY : 0));
    });
  }
}
