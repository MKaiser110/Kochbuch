// app.js — Einstiegspunkt: Router starten, Kopfzeilen-Buttons verdrahten,
// Service Worker registrieren.

import { initRouter } from './router.js';
import { openAddMenu } from './sheets/add-menu.js';
import { openDataMenu } from './sheets/data-menu.js';
import { renderOverview } from './views/overview.js';
import { getRecipe } from './core/db.js';
import { focusShopping, openProductCatalog, chooseRecipeIngredients } from './views/shopping.js';

disablePageZoom();
initRouter();

setupBottomNavigation();
document.getElementById('btn-add').addEventListener('click', () => {
  if (location.hash === '#shopping') focusShopping(); else openAddMenu();
});
updateHeaderForTab();
window.addEventListener('hashchange', updateHeaderForTab);
setupRecipeShoppingAction();
setupConnectionStatus();
setupSheetGuidance();

document.getElementById('btn-data-menu').addEventListener('click', () => {
  if (location.hash === '#shopping') { openProductCatalog(); return; }
  openDataMenu(() => {
    if (location.hash === '' || location.hash === '#') renderOverview();
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Fähigkeit optional */ });
  });
}


function setupBottomNavigation() {
  const nav = document.createElement('nav');
  nav.className = 'shopping-nav';
  nav.setAttribute('aria-label', 'Hauptnavigation');
  nav.innerHTML = '<button type="button" data-tab="recipes">Rezepte</button><button type="button" data-tab="shopping">Einkaufsliste</button>';
  nav.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (tab) location.hash = tab === 'shopping' ? 'shopping' : '';
  });
  document.body.append(nav);
}

function updateHeaderForTab() {
  const shopping = location.hash === '#shopping';
  document.querySelector('.topbar h1').textContent = shopping ? 'Einkaufsliste' : 'Kochbuch';
  document.getElementById('btn-add').setAttribute('aria-label', shopping ? 'Produkt hinzufügen' : 'Rezept hinzufügen');
  document.getElementById('btn-data-menu').setAttribute('aria-label', shopping ? 'Produktkatalog verwalten' : 'Rezepte sichern und wiederherstellen');
  const nav = document.querySelector('.shopping-nav');
  nav?.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === (shopping ? 'shopping' : 'recipes');
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (nav) nav.hidden = location.hash.startsWith('#recipe/') || location.hash.startsWith('#edit/') || location.hash.startsWith('#cook/') || location.hash === '#new';
  document.body.classList.toggle('shopping-active', shopping);
}

function setupRecipeShoppingAction() {
  const app = document.getElementById('app');
  const addButton = () => {
    if (!location.hash.startsWith('#recipe/')) return;
    const detail = app.querySelector('.detail');
    if (!detail || detail.querySelector('.btn-shopping-ingredients')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-secondary btn-shopping-ingredients';
    button.textContent = 'Zutaten zur Einkaufsliste';
    button.addEventListener('click', () => {
      const recipeId = location.hash.slice('#recipe/'.length);
      getRecipe(recipeId).then(recipe => { if (recipe) chooseRecipeIngredients(recipe.ingredients); });
    });
    detail.querySelector('.ingredient-list')?.closest('section')?.prepend(button);
  };
  new MutationObserver(addButton).observe(app, {childList:true,subtree:true});
  addButton();
}

function setupConnectionStatus() {
  const status = document.createElement('p');
  status.id = 'connection-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'width:min(100%,980px);margin:0 auto;padding:6px 22px;background:var(--surface);color:var(--ink-soft);font-size:.8rem';
  const header = document.querySelector('.topbar');
  header.insertAdjacentElement('afterend', status);

  const update = () => {
    const onStartScreen = !location.hash || location.hash === '#';
    status.hidden = navigator.onLine || !onStartScreen;
    if (!status.hidden) {
      const ocrUsable = Boolean(globalThis.Tesseract?.createWorker);
      status.textContent = ocrUsable
        ? 'Offline · Buchseiten scannen ist verfügbar'
        : 'Offline · Buchseiten scannen ist nicht verfügbar';
    }
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  window.addEventListener('hashchange', update);
  update();
}

function setupSheetGuidance() {
  const overlay = document.getElementById('sheet-overlay');
  const enhance = () => {
    const dataMenu = overlay.querySelector('#data-export')?.closest('.menu-sheet');
    if (dataMenu && !dataMenu.querySelector('#backup-guidance')) {
      dataMenu.style.height = 'auto';
      const title = dataMenu.querySelector('h2');
      title.textContent = 'Sichern & wiederherstellen';
      const guidance = document.createElement('p');
      guidance.id = 'backup-guidance';
      guidance.className = 'hint';
      guidance.textContent = 'Der Export speichert eine JSON-Datei auf deinem Gerät. Beim Wiederherstellen werden neue Rezepte ergänzt und Rezepte mit gleicher ID aktualisiert; andere Rezepte bleiben erhalten.';
      title.after(guidance);
      dataMenu.querySelector('#data-export span').textContent = 'Sicherung exportieren';
      dataMenu.querySelector('#data-import span').textContent = 'Sicherung wiederherstellen';
      const last = document.createElement('p');
      last.id = 'backup-last';
      last.className = 'hint';
      const saved = localStorage.getItem('kochbuch-last-backup-started');
      last.textContent = saved ? `Letzter Export gestartet: ${new Date(saved).toLocaleString('de-DE')}` : 'Noch kein Export auf diesem Gerät gestartet.';
      guidance.after(last);
      const exportStatus = dataMenu.querySelector('#data-status');
      new MutationObserver(() => {
        if (!exportStatus.textContent.includes('exportiert.')) return;
        const now = new Date().toISOString();
        localStorage.setItem('kochbuch-last-backup-started', now);
        last.textContent = `Letzter Export gestartet: ${new Date(now).toLocaleString('de-DE')}`;
      }).observe(exportStatus, { childList: true, characterData: true, subtree: true });
    }

  };
  new MutationObserver(enhance).observe(overlay, { childList: true, subtree: true, characterData: true });
  enhance();
}

function disablePageZoom() {
  let lastTap = null;
  let touchMoved = false;

  document.addEventListener('touchstart', event => {
    if (event.touches.length === 1) touchMoved = false;
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener('touchmove', event => {
    touchMoved = true;
    lastTap = null;
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener('touchend', event => {
    if (touchMoved) {
      lastTap = null;
      return;
    }
    if (event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const now = Date.now();
    if (lastTap && now - lastTap.time < 350
        && Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 32) {
      // Interaktive Ziele müssen ihren Click auch bei schnellen Tipps erhalten.
      if (event.target.closest('button, a, input, select, textarea, [role="button"]')) {
        lastTap = null;
        return;
      }
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
      lastTap = null;
      return;
    }
    lastTap = { time: now, x: touch.clientX, y: touch.clientY };
  }, { capture: true, passive: false });

  document.addEventListener('gesturestart', event => {
    if (event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener('gesturechange', event => {
    if (event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener('dblclick', event => event.preventDefault(), true);
}
