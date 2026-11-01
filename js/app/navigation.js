export function setupNavigation() {
  const nav = document.createElement('nav');
  nav.className = 'shopping-nav';
  nav.setAttribute('aria-label', 'Hauptnavigation');
  nav.innerHTML = '<button type="button" data-tab="recipes">Rezepte</button><button type="button" data-tab="shopping">Einkaufsliste</button>';
  nav.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (tab) location.hash = tab === 'shopping' ? 'shopping' : '';
  });
  document.body.append(nav);

  const syncVisibility = () => {
    const hash = location.hash;
    const overview = !hash || hash === '#' || hash === '#shopping';
    const sheetOpen = Boolean(document.querySelector('#sheet-overlay:not([hidden])'));
    const dialogOpen = Boolean(document.querySelector('dialog[open]'));
    const shouldHide = !(overview && !sheetOpen && !dialogOpen);
    if (nav.hidden !== shouldHide) nav.hidden = shouldHide;
  };
  const observer = new MutationObserver(syncVisibility);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'open'],
  });
  window.addEventListener('hashchange', syncVisibility);
  window.addEventListener('hashchange', updateHeaderForTab);
  updateHeaderForTab();
  syncVisibility();
}

function updateHeaderForTab() {
  const shopping = location.hash === '#shopping';
  if (shopping) document.querySelector('.topbar h1').textContent = 'Einkaufsliste';
  else if (!location.hash || location.hash === '#') document.querySelector('.topbar h1').textContent = 'Kochbuch';
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
