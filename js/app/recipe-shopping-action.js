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
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path><path d="M4 4h16v16H4z" opacity=".35"></path></svg><span>Auf die Einkaufsliste</span>';
    button.addEventListener('click', () => {
      const recipeId = location.hash.slice('#recipe/'.length);
      getRecipe(recipeId).then(recipe => { if (recipe) chooseRecipeIngredients(recipe.ingredients); });
    });
    detail.querySelector('.ingredient-list')?.closest('section')?.prepend(button);
  };
  new MutationObserver(addButton).observe(app, { childList: true, subtree: true });
  addButton();
}
