import { normalizeShoppingName, products } from '../core/shopping-store.js';
import { addShoppingProduct } from './shopping-actions.js';
import {
  activateShoppingStyles,
  createProductTile,
  showShoppingDialog,
} from './shopping-components.js';

export function chooseRecipeIngredients(ingredients) {
  activateShoppingStyles();
  const recipeIngredients = ingredients || [];
  const dialog = document.createElement('dialog');
  dialog.className = 'shopping-dialog ingredient-choice-dialog';
  dialog.innerHTML = `
    <header class="ingredient-choice-header">
      <h2>Zutaten übernehmen</h2>
      <p>Wähle aus, was du einkaufen möchtest. Alle Zutaten sind vorausgewählt.</p>
      <span class="ingredient-choice-count" aria-live="polite"></span>
    </header>
    <div class="ingredient-choice-grid shopping-grid" role="group" aria-label="Rezeptzutaten"></div>
    <div class="shopping-dialog-actions">
      <button data-cancel>Abbrechen</button>
      <button class="primary" data-add>Auswahl hinzufügen</button>
    </div>
  `;

  const choices = dialog.querySelector('.ingredient-choice-grid');
  const count = dialog.querySelector('.ingredient-choice-count');
  const addButton = dialog.querySelector('[data-add]');
  const validIngredients = recipeIngredients
    .map((ingredient, index) => ({ ingredient, index }))
    .filter(({ ingredient }) => ingredient.name?.trim());

  const updateSelection = () => {
    const selected = choices.querySelectorAll('.ingredient-choice-tile.selected').length;
    count.textContent = `${selected} von ${validIngredients.length} Zutaten ausgewählt`;
    addButton.disabled = selected === 0;
  };

  validIngredients.forEach(({ ingredient, index }) => {
    const product = {
      name: ingredient.name,
      icon: products.find(item =>
        normalizeShoppingName(item.name) === normalizeShoppingName(ingredient.name))?.icon || '',
    };
    const button = createProductTile(
      product,
      () => {
        button.classList.toggle('selected');
        button.setAttribute('aria-pressed', String(button.classList.contains('selected')));
        updateSelection();
      },
      [ingredient.amount, ingredient.unit].filter(Boolean).join(' ')
    );
    button.classList.add('ingredient-choice-tile', 'selected');
    button.setAttribute('aria-pressed', 'true');
    button.dataset.index = String(index);

    const indicator = document.createElement('span');
    indicator.className = 'ingredient-choice-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6"></path></svg>';
    button.append(indicator);
    choices.append(button);
  });

  if (!validIngredients.length) {
    const empty = document.createElement('p');
    empty.className = 'ingredient-choice-empty';
    empty.textContent = 'Dieses Rezept enthält keine Zutaten, die übernommen werden können.';
    choices.append(empty);
  }

  updateSelection();
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  addButton.addEventListener('click', () => {
    choices.querySelectorAll('.ingredient-choice-tile.selected').forEach(button => {
      const ingredient = recipeIngredients[Number(button.dataset.index)];
      const product = {
        id: `new-${normalizeShoppingName(ingredient.name)}`,
        name: ingredient.name.trim(),
        category: 'Sonstiges',
        icon: products.find(item =>
          normalizeShoppingName(item.name) === normalizeShoppingName(ingredient.name))?.icon || '',
      };
      addShoppingProduct(
        product,
        [ingredient.amount, ingredient.unit].filter(Boolean).join(' '),
        true
      );
    });
    dialog.close();
    alert('Ausgewählte Zutaten wurden zur Einkaufsliste hinzugefügt.');
  });

  showShoppingDialog(dialog);
}
