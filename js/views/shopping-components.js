import { escapeHtml } from '../utils/dom.js';

export function activateShoppingStyles() {
  document.body.classList.add('shopping-styles-ready');
}

export function showShoppingDialog(dialog) {
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
}

export function productIconMarkup(product) {
  if (!product.icon) {
    const initial = (product.name || '?').trim().charAt(0).toUpperCase();
    return `<span>${escapeHtml(initial)}</span>`;
  }
  if (product.icon.startsWith('data:') || product.icon.startsWith('http')) {
    return `<img src="${escapeHtml(product.icon)}" alt="">`;
  }
  return escapeHtml(product.icon);
}

export function createProductTile(product, onClick, quantity = '', onLongPress = null) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'product-tile';
  button.innerHTML = '<span class="product-icon">' + productIconMarkup(product) + '</span>'
    + '<span class="product-name">' + escapeHtml(product.name) + '</span>'
    + (quantity ? '<span class="product-quantity">' + escapeHtml(quantity) + '</span>' : '');

  let timer = null;
  let held = false;
  const triggerLongPress = () => {
    if (held || !onLongPress) return;
    held = true;
    onLongPress();
    setTimeout(() => { held = false; }, 700);
  };
  const cancelLongPress = () => clearTimeout(timer);

  button.addEventListener('pointerdown', () => {
    if (onLongPress) timer = setTimeout(triggerLongPress, 550);
  });
  button.addEventListener('pointerup', cancelLongPress);
  button.addEventListener('pointerleave', cancelLongPress);
  button.addEventListener('pointercancel', cancelLongPress);
  button.addEventListener('contextmenu', event => {
    if (!onLongPress) return;
    event.preventDefault();
    triggerLongPress();
  });
  button.addEventListener('click', event => {
    if (held) {
      event.preventDefault();
      event.stopImmediatePropagation();
      held = false;
      return;
    }
    onClick();
  });
  return button;
}
