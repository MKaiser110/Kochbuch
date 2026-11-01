import { getRecipe } from '../core/db.js';
import { chooseRecipeIngredients } from '../views/shopping.js';

export function setupRecipeShoppingAction() {
  const app = document.getElementById('app');
  const addButton = () => {
    if (!location.hash.startsWith('#recipe/')) return;
    const detail = app.querySelector('.detail');
    if (!detail || detail.querySelector('.shopping-recipe-action')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shopping-recipe-action';
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 4h2l2.2 11.1a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 1.9-1.4L22 8H6"></path><circle cx="10" cy="20" r="1"></circle><circle cx="18" cy="20" r="1"></circle></svg><span>Auf die Einkaufsliste</span>';
    button.addEventListener('click', () => {
      const recipeId = location.hash.slice('#recipe/'.length);
      getRecipe(recipeId).then(recipe => { if (recipe) chooseRecipeIngredients(recipe.ingredients); });
    });
    detail.querySelector('.ingredient-list')?.closest('section')?.prepend(button);
  };
  new MutationObserver(addButton).observe(app, { childList: true, subtree: true });
  addButton();
}
