import {
  items,
  catalogCategories,
  collapsedCatalogCategories,
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

export function openProductCatalog() {
  activateShoppingStyles();
  const dialog = document.createElement('dialog');
  dialog.className = 'shopping-dialog catalog-dialog';
  dialog.innerHTML = `
    <h2 tabindex="-1">Produktkatalog</h2>
    <p>Produkte verwalten, hinzufügen oder als Datei sichern.</p>
    <div class="shopping-catalog-list"></div>
    <div class="shopping-dialog-actions">
      <button class="primary" data-add>+ Produkt</button>
      <button data-add-category>+ Kategorie</button>
      <button data-export>Exportieren</button>
      <button data-import>Importieren</button>
      <button data-close>Schließen</button>
    </div>
    <input type="file" accept="application/json,.json" hidden>
  `;

  const list = dialog.querySelector('.shopping-catalog-list');

  function ensureCategories() {
    for (const product of products) {
      const category = product.category || 'Sonstiges';
      if (!catalogCategories.includes(category)) catalogCategories.push(category);
    }
  }

  function renderCatalog() {
    ensureCategories();
    list.replaceChildren();
    catalogCategories.forEach(category => {
      const section = document.createElement('section');
      section.className = 'catalog-section';
      section.dataset.category = category;
      const heading = document.createElement('div');
      heading.className = 'catalog-category-heading';
      heading.innerHTML = `
        <button type="button" class="catalog-category-toggle" aria-label="Kategorie einklappen" aria-expanded="true"></button>
        <h3>${escapeHtml(category)}</h3>
        <button type="button" class="catalog-category-remove" aria-label="Kategorie entfernen" title="Kategorie entfernen">×</button>
      `;
      heading.querySelector('.catalog-category-remove').addEventListener('click', () => removeCatalogCategory(category));
      const grid = document.createElement('div');
      grid.className = 'catalog-grid';
      const toggle = heading.querySelector('.catalog-category-toggle');
      const collapsed = collapsedCatalogCategories.includes(category);
      setCategoryCollapsed(toggle, grid, collapsed);
      toggle.addEventListener('click', () => {
        const nextCollapsed = !collapsedCatalogCategories.includes(category);
        setCategoryCollapsed(toggle, grid, nextCollapsed);
        if (nextCollapsed) {
          if (!collapsedCatalogCategories.includes(category)) collapsedCatalogCategories.push(category);
        } else {
          const index = collapsedCatalogCategories.indexOf(category);
          if (index >= 0) collapsedCatalogCategories.splice(index, 1);
        }
        saveShoppingState();
      });

      products
        .filter(product => (product.category || 'Sonstiges') === category)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
        .forEach(product => grid.append(createCatalogRow(product, dialog, renderCatalog)));

      section.append(heading, grid);
      list.append(section);
    });
  }

  renderCatalog();
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-add-category]').addEventListener('click', () => {
    let index = 1;
    let name = 'Neue Kategorie';
    while (catalogCategories.includes(name)) name = `Neue Kategorie ${++index}`;
    catalogCategories.push(name);
    saveShoppingState();
    renderCatalog();
    const section = [...list.querySelectorAll('.catalog-section')].find(item => item.dataset.category === name);
    const input = document.createElement('input');
    input.className = 'catalog-category-name-input';
    input.value = name;
    input.setAttribute('aria-label', 'Kategorie Name');
    const heading = section.querySelector('.catalog-category-heading');
    const title = heading.querySelector('h3');
    title.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const nextName = input.value.trim();
      if (!nextName) {
        catalogCategories.pop();
        saveShoppingState();
        renderCatalog();
        return;
      }
      renameCatalogCategory(name, nextName);
      saveShoppingState();
      renderCatalog();
    };
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
  });
  dialog.querySelector('[data-add]').addEventListener('click', () => {
    dialog.close();
    openProductForm();
  });
  dialog.querySelector('[data-export]').addEventListener('click', () => {
    downloadJson({ version: 1, categories: catalogCategories, products }, 'produktkatalog.json');
  });

  const fileInput = dialog.querySelector('input[type=file]');
  dialog.querySelector('[data-import]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    try {
      const data = JSON.parse(await fileInput.files[0].text());
      if (!Array.isArray(data.products)) throw new Error('INVALID_CATALOG');
      if (Array.isArray(data.categories)) {
        const importedCategories = [...new Set(data.categories
          .map(category => String(category || '').trim())
          .filter(Boolean))];
        catalogCategories.splice(
          0,
          catalogCategories.length,
          ...importedCategories,
          ...catalogCategories.filter(category => !importedCategories.includes(category)),
        );
      }
      for (const product of data.products) {
        if (product.name && !products.some(item =>
          normalizeShoppingName(item.name) === normalizeShoppingName(product.name))) {
          const category = String(product.category || 'Sonstiges').trim() || 'Sonstiges';
          if (!catalogCategories.includes(category)) catalogCategories.push(category);
          products.push({
            id: crypto.randomUUID(),
            name: String(product.name),
            category,
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
  dialog.querySelector('h2').focus({ preventScroll: true });
}

function createCatalogRow(product, parentDialog, renderCatalog) {
  const row = document.createElement('div');
  row.className = 'shopping-catalog-row';
  row.dataset.productId = product.id;
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
      <select name="category">${catalogCategories.map(category => `<option>${escapeHtml(category)}</option>`).join('')}</select>
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

function renameCatalogCategory(oldName, newName) {
  if (!newName || oldName === newName) return;
  const existingIndex = catalogCategories.indexOf(newName);
  if (existingIndex >= 0) {
    catalogCategories.splice(catalogCategories.indexOf(oldName), 1);
  } else {
    catalogCategories[catalogCategories.indexOf(oldName)] = newName;
  }
  products.forEach(product => {
    if ((product.category || 'Sonstiges') === oldName) product.category = newName;
  });
  const collapsedIndex = collapsedCatalogCategories.indexOf(oldName);
  if (collapsedIndex >= 0) collapsedCatalogCategories[collapsedIndex] = newName;
  items.forEach(item => {
    if ((item.category || 'Sonstiges') === oldName) item.category = newName;
  });
}

function removeCatalogCategory(category) {
  if (category === 'Sonstiges') return;
  if (!confirm(`Kategorie „${category}“ entfernen? Die Produkte werden nach „Sonstiges“ verschoben.`)) return;
  if (!catalogCategories.includes('Sonstiges')) catalogCategories.push('Sonstiges');
  catalogCategories.splice(catalogCategories.indexOf(category), 1);
  const collapsedIndex = collapsedCatalogCategories.indexOf(category);
  if (collapsedIndex >= 0) collapsedCatalogCategories.splice(collapsedIndex, 1);
  products.forEach(product => {
    if ((product.category || 'Sonstiges') === category) product.category = 'Sonstiges';
  });
  items.forEach(item => {
    if ((item.category || 'Sonstiges') === category) item.category = 'Sonstiges';
  });
  saveShoppingState();
  document.querySelector('.catalog-dialog')?.dispatchEvent(new CustomEvent('catalog-change'));
  const dialog = document.querySelector('.catalog-dialog');
  if (dialog) {
    dialog.close();
    openProductCatalog();
  }
}

function setCategoryCollapsed(toggle, grid, collapsed) {
  grid.hidden = collapsed;
  toggle.classList.toggle('collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Kategorie aufklappen' : 'Kategorie einklappen');
}
