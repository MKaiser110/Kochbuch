import {
  items,
  normalizeShoppingName,
  products,
  removeShoppingProduct,
  saveShoppingState,
} from '../core/shopping-store.js';
import { downloadJson } from '../utils/files.js';
import { escapeHtml } from '../utils/dom.js';
import {
  activateShoppingStyles,
  productIconMarkup,
  showShoppingDialog,
} from './shopping-components.js';

const PRODUCT_CATEGORIES = [
  'Obst & Gemüse',
  'Milchprodukte & Eier',
  'Brot & Backwaren',
  'Fleisch & Fisch',
  'Vorrat & Gewürze',
  'Getränke',
  'Sonstiges',
];

export function openProductCatalog() {
  activateShoppingStyles();
  const dialog = document.createElement('dialog');
  dialog.className = 'shopping-dialog catalog-dialog';
  dialog.innerHTML = `
    <h2>Produktkatalog</h2>
    <p>Produkte verwalten, hinzufügen oder als Datei sichern.</p>
    <div class="shopping-catalog-list"></div>
    <div class="shopping-dialog-actions">
      <button class="primary" data-add>+ Produkt</button>
      <button data-export>Exportieren</button>
      <button data-import>Importieren</button>
      <button data-close>Schließen</button>
    </div>
    <input type="file" accept="application/json,.json" hidden>
  `;

  const list = dialog.querySelector('.shopping-catalog-list');
  function renderCatalog() {
    list.replaceChildren();
    const categories = [...new Set(products.map(product => product.category || 'Sonstiges'))]
      .sort((a, b) => a.localeCompare(b, 'de'));

    categories.forEach(category => {
      const section = document.createElement('section');
      section.className = 'catalog-section';
      const heading = document.createElement('h3');
      heading.textContent = category;
      const grid = document.createElement('div');
      grid.className = 'catalog-grid';

      products
        .filter(product => (product.category || 'Sonstiges') === category)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .forEach(product => grid.append(createCatalogRow(product, dialog, renderCatalog)));

      section.append(heading, grid);
      list.append(section);
    });
  }

  renderCatalog();
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-add]').addEventListener('click', () => {
    dialog.close();
    openProductForm();
  });
  dialog.querySelector('[data-export]').addEventListener('click', () => {
    downloadJson({ version: 1, products }, 'produktkatalog.json');
  });

  const fileInput = dialog.querySelector('input[type=file]');
  dialog.querySelector('[data-import]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    try {
      const data = JSON.parse(await fileInput.files[0].text());
      if (!Array.isArray(data.products)) throw new Error('INVALID_CATALOG');
      for (const product of data.products) {
        if (product.name && !products.some(item =>
          normalizeShoppingName(item.name) === normalizeShoppingName(product.name))) {
          products.push({
            id: crypto.randomUUID(),
            name: String(product.name),
            category: String(product.category || 'Sonstiges'),
            icon: String(product.icon || ''),
          });
        }
      }
      saveShoppingState();
      renderCatalog();
    } catch {
      alert('Die Katalogdatei ist ungültig.');
    }
  });

  showShoppingDialog(dialog);
}

function createCatalogRow(product, parentDialog, renderCatalog) {
  const row = document.createElement('div');
  row.className = 'shopping-catalog-row';
  row.innerHTML = `
    <span class="catalog-icon">${productIconMarkup(product)}</span>
    <span class="catalog-product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span>
    <span class="catalog-actions">
      <button type="button" aria-label="Bearbeiten ${escapeHtml(product.name)}" class="catalog-edit">Bearbeiten</button>
      <button type="button" aria-label="Entfernen ${escapeHtml(product.name)}" class="catalog-remove">×</button>
    </span>
  `;
  row.querySelector('.catalog-edit').addEventListener('click', () => {
    parentDialog.close();
    openProductForm(product);
  });
  row.querySelector('.catalog-remove').addEventListener('click', () => {
    removeShoppingProduct(product.id);
    saveShoppingState();
    renderCatalog();
  });
  return row;
}

function openProductForm(existing = null) {
  const dialog = document.createElement('dialog');
  dialog.className = 'shopping-dialog';
  dialog.innerHTML = `
    <h2>${existing ? 'Produkt bearbeiten' : 'Produkt hinzufügen'}</h2>
    <label>Produktname<input name="name" required></label>
    <label>Kategorie
      <select name="category">${PRODUCT_CATEGORIES.map(category => `<option>${category}</option>`).join('')}</select>
    </label>
    <label>Icon (Emoji, optional)<input name="icon" placeholder="z. B. 🥭"></label>
    <label>Eigenes Bild (optional)<input name="image" type="file" accept="image/*"></label>
    <div class="shopping-dialog-actions">
      <button data-cancel>Abbrechen</button>
      <button class="primary" data-save>Speichern</button>
    </div>
  `;

  const nameInput = dialog.querySelector('[name=name]');
  const categoryInput = dialog.querySelector('[name=category]');
  const iconInput = dialog.querySelector('[name=icon]');
  if (existing) {
    nameInput.value = existing.name;
    categoryInput.value = existing.category || 'Sonstiges';
    iconInput.value = existing.icon?.startsWith('data:') ? '' : existing.icon || '';
  }

  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-save]').addEventListener('click', async () => {
    const productName = nameInput.value.trim();
    if (!productName) {
      nameInput.focus();
      return;
    }

    let icon = iconInput.value.trim() || existing?.icon || '';
    const file = dialog.querySelector('[name=image]').files[0];
    if (file) icon = await readImage(file);

    if (existing) {
      existing.name = productName;
      existing.category = categoryInput.value;
      existing.icon = icon;
      items.filter(item => item.productId === existing.id).forEach(item => {
        item.name = productName;
        item.category = categoryInput.value;
        item.icon = icon;
      });
    } else {
      products.push({
        id: crypto.randomUUID(),
        name: productName,
        category: categoryInput.value,
        icon,
      });
    }

    saveShoppingState();
    dialog.close();
    openProductCatalog();
  });

  showShoppingDialog(dialog);
}

function readImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
