import {
  items,
  normalizeShoppingName,
  products,
  saveShoppingState,
} from '../core/shopping-store.js';
import { activateShoppingStyles, createProductTile } from './shopping-components.js';
import { addShoppingProduct } from './shopping-actions.js';
import { showItemDetails, editItemDetails } from './shopping-item-dialogs.js';
import { getPendingItemId, setPendingItemId } from './shopping-state.js';

export { openProductCatalog } from './shopping-catalog.js';
export { chooseRecipeIngredients } from './shopping-ingredients.js';

export function renderShopping() {
  activateShoppingStyles();
  if (shoppingCleanup) shoppingCleanup();

  document.body.classList.add('shopping-active');
  document.querySelector('.topbar h1').textContent = 'Kochbuch';
  const root = document.getElementById('app');
  root.innerHTML = `
    <div class="shopping-page">
      <div id="shopping-items"></div>
      <div class="shopping-search-wrap">
        <div id="shopping-suggestions" class="shopping-suggestions"></div>
        <input id="shopping-search" type="search" placeholder="Produkt suchen oder hinzufügen…" autocomplete="off">
      </div>
    </div>
  `;

  const search = root.querySelector('#shopping-search');
  search.value = sessionStorage.getItem('shopping-query') || '';
  const searchWrap = root.querySelector('.shopping-search-wrap');
  document.body.append(searchWrap);
  search.addEventListener('input', () => {
    sessionStorage.setItem('shopping-query', search.value);
    render();
  });

  const onRouteChange = () => {
    if (location.hash !== '#shopping' && shoppingCleanup) {
      const cleanup = shoppingCleanup;
      shoppingCleanup = null;
      cleanup();
    }
  };
  window.addEventListener('hashchange', onRouteChange);
  shoppingCleanup = () => {
    window.removeEventListener('hashchange', onRouteChange);
    searchWrap.remove();
  };

  function render() {
    const wrap = root.querySelector('#shopping-items');
    wrap.replaceChildren();
    const activeItems = items.filter(item => !item.done);
    root.querySelector('.shopping-page').classList.toggle('has-items', activeItems.length > 0);

    if (!activeItems.length) {
      const empty = document.createElement('p');
      empty.className = 'shopping-empty';
      empty.textContent = 'Deine Einkaufsliste ist noch leer. Suche unten nach Produkten.';
      wrap.append(empty);
    }

    const categories = [...new Set(activeItems.map(item => item.category || 'Sonstiges'))];
    categories.forEach(category => {
      const section = document.createElement('section');
      section.className = 'shopping-section';
      const heading = document.createElement('h2');
      heading.textContent = category;
      section.append(heading);

      const grid = document.createElement('div');
      grid.className = 'shopping-grid';
      activeItems
        .filter(item => (item.category || 'Sonstiges') === category)
        .forEach(item => {
          const product = products.find(candidate => candidate.id === item.productId) || item;
          const card = document.createElement('div');
          card.className = 'shopping-item-wrap';
          card.append(createProductTile(
            { ...product, name: product.name || item.name },
            () => {
              item.done = true;
              saveShoppingState();
              render();
            },
            item.quantity || '',
            () => showItemDetails(item)
          ));

          const editButton = document.createElement('button');
          editButton.type = 'button';
          editButton.className = 'shopping-item-edit';
          editButton.setAttribute('aria-label', 'Menge oder Details bearbeiten');
          editButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4.8L8 20l11-11a2.1 2.1 0 0 0-3-3L5 17"></path><path d="m14.5 7.5 3 3"></path></svg>';
          editButton.addEventListener('click', () => editItemDetails(item));
          card.append(editButton);
          grid.append(card);
        });

      section.append(grid);
      wrap.append(section);
    });

    renderSuggestions(search.value.trim(), searchWrap.querySelector('#shopping-suggestions'));
  }

  function renderSuggestions(query, suggestions) {
    suggestions.replaceChildren();
    if (query) {
      setPendingItemId(null);
      const matches = products
        .filter(product => normalizeShoppingName(product.name).includes(normalizeShoppingName(query)))
        .slice(0, 8);
      const typedProduct = { id: `typed-${query}`, name: query, category: 'Sonstiges', icon: '' };
      suggestions.append(createProductTile(
        typedProduct,
        () => addShoppingProduct(typedProduct, '', true)
      ));
      matches
        .filter(product => product.name !== query)
        .forEach(product => suggestions.append(createProductTile(
          product,
          () => addShoppingProduct(product)
        )));
      return;
    }

    const pendingItemId = getPendingItemId();
    if (!pendingItemId) return;
    const pendingItem = items.find(item => item.id === pendingItemId);
    if (!pendingItem) return;

    ['1', '2', '3', '500 g', '1 kg', '1 l'].forEach(quantity => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quantity-suggestion';
      button.textContent = quantity;
      button.addEventListener('click', () => {
        pendingItem.quantity = quantity;
        setPendingItemId(null);
        saveShoppingState();
        render();
      });
      suggestions.append(button);
    });

    const detailsButton = document.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'quantity-suggestion details';
    detailsButton.textContent = 'Eigene Details hinzufügen';
    detailsButton.addEventListener('click', () => editItemDetails(pendingItem));
    suggestions.append(detailsButton);
  }

  render();
}

let shoppingCleanup = null;

export function focusShopping() {
  if (location.hash !== '#shopping') location.hash = 'shopping';
  setTimeout(() => document.getElementById('shopping-search')?.focus(), 80);
}
