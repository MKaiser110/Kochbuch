import { items, products, saveShoppingState } from '../core/shopping-store.js';
import { setPendingItemId } from './shopping-state.js';

export function addShoppingProduct(product, quantity = '', customName = false) {
  let existingProduct = customName
    ? products.find(item => item.name === product.name)
    : products.find(item => item.id === product.id);

  if (!existingProduct) {
    existingProduct = {
      ...product,
      id: crypto.randomUUID(),
      category: product.category || 'Sonstiges',
    };
    products.push(existingProduct);
  }

  let shoppingItem = items.find(item => item.productId === existingProduct.id && !item.done);
  if (shoppingItem) {
    if (quantity) {
      shoppingItem.quantity = shoppingItem.quantity
        ? `${shoppingItem.quantity}, ${quantity}`
        : quantity;
    }
  } else {
    shoppingItem = {
      id: crypto.randomUUID(),
      productId: existingProduct.id,
      name: existingProduct.name,
      category: existingProduct.category,
      icon: existingProduct.icon || '',
      quantity,
      details: '',
      done: false,
    };
    items.push(shoppingItem);
  }

  setPendingItemId(shoppingItem.id);
  saveShoppingState();

  const search = document.getElementById('shopping-search');
  if (search) {
    search.value = '';
    sessionStorage.removeItem('shopping-query');
    search.dispatchEvent(new Event('input'));
    search.focus();
  }
}
