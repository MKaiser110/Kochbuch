// App-Einstiegspunkt: Oberflächen initialisieren und Service Worker registrieren.

import { initRouter } from './router.js';
import { openAddMenu } from './sheets/add-menu.js';
import { openDataMenu } from './sheets/data-menu.js';
import { renderOverview } from './views/overview.js';
import { focusShopping, openProductCatalog } from './views/shopping.js';
import { setupConnectionStatus } from './app/connection-status.js';
import { setupNavigation } from './app/navigation.js';
import { setupRecipeShoppingAction } from './app/recipe-shopping-action.js';
import { setupSheetGuidance } from './app/sheet-guidance.js';
import { disablePageZoom } from './app/touch-behavior.js';

disablePageZoom();
initRouter();
setupNavigation();

document.getElementById('btn-add').addEventListener('click', () => {
  if (location.hash === '#shopping') focusShopping();
  else openAddMenu();
});

document.getElementById('btn-data-menu').addEventListener('click', () => {
  if (location.hash === '#shopping') {
    openProductCatalog();
    return;
  }
  openDataMenu(() => {
    if (location.hash === '' || location.hash === '#') renderOverview();
  });
});

setupRecipeShoppingAction();
setupConnectionStatus();
setupSheetGuidance();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Fähigkeit optional */ });
  });
}
