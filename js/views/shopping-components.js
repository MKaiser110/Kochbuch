import { escapeHtml } from '../utils/dom.js';

export function activateShoppingStyles() {
  document.body.classList.add('shopping-styles-ready');
}

export function showShoppingDialog(dialog) {
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
}

export function showShoppingToast(count) {
  document.querySelector('.shopping-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'shopping-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <span class="shopping-toast-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6"></path></svg>
    </span>
    <span class="shopping-toast-text">
      <strong>${count === 1 ? 'Zutat hinzugefügt' : count + ' Zutaten hinzugefügt'}</strong>
      <span>Zur Einkaufsliste</span>
    </span>
    <button type="button" class="shopping-toast-action">Ansehen</button>
  `;

  document.body.append(toast);
  toast.querySelector('.shopping-toast-action').addEventListener('click', () => {
    location.hash = 'shopping';
  });

  requestAnimationFrame(() => toast.classList.add('visible'));
  window.setTimeout(() => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
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
