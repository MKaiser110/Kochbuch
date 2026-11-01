import { saveShoppingState } from '../core/shopping-store.js';
import { escapeHtml } from '../utils/dom.js';
import { setPendingItemId } from './shopping-state.js';
import { activateShoppingStyles, showShoppingDialog } from './shopping-components.js';

export function showItemDetails(item) {
  const dialog = document.createElement('dialog');
  dialog.className = 'shopping-dialog';
  dialog.innerHTML = `
    <h2>${escapeHtml(item.name)}</h2>
    <p><strong>Menge:</strong> ${escapeHtml(item.quantity || 'Keine Menge angegeben')}</p>
    <p><strong>Details:</strong> ${escapeHtml(item.details || 'Keine weiteren Details')}</p>
    <div class="shopping-dialog-actions">
      <button data-close>Schließen</button>
      <button class="primary" data-edit>Bearbeiten</button>
    </div>
  `;
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-edit]').addEventListener('click', () => {
    dialog.close();
    editItemDetails(item);
  });
  showShoppingDialog(dialog);
}

export function editItemDetails(item) {
  activateShoppingStyles();
  const dialog = document.createElement('dialog');
  dialog.className = 'shopping-dialog';
  dialog.innerHTML = `
    <h2>${escapeHtml(item.name)}</h2>
    <label>Menge
      <input name="quantity" value="${escapeHtml(item.quantity || '')}" placeholder="z. B. 2 Stück oder 500 g">
    </label>
    <label>Eigene Details
      <textarea name="details" rows="3" placeholder="Marke, Sorte oder weitere Notizen">${escapeHtml(item.details || '')}</textarea>
    </label>
    <div class="shopping-dialog-actions">
      <button data-cancel>Abbrechen</button>
      <button class="primary" data-save>Speichern</button>
    </div>
  `;
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-save]').addEventListener('click', () => {
    item.quantity = dialog.querySelector('[name=quantity]').value.trim();
    item.details = dialog.querySelector('[name=details]').value.trim();
    setPendingItemId(null);
    saveShoppingState();
    dialog.close();
    document.getElementById('shopping-search')?.dispatchEvent(new Event('input'));
  });
  showShoppingDialog(dialog);
}
