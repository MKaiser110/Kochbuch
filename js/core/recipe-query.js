// recipe-query.js — Sortieren und Filtern der Rezeptliste (reine Logik).

function normalizeIngredientName(name) {
  return String(name || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de');
}

/** @param {'added'|'alpha'|'favorites'} sort */
export function sortRecipes(list, sort) {
  const sorted = [...list];
  if (sort === 'alpha') {
    sorted.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  } else if (sort === 'favorites') {
    sorted.sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.createdAt - a.createdAt);
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

/**
 * @param {object} filter
 * @param {string|null} filter.tag          aktiver Tag oder null
 * @param {string} filter.search            Suchtext (bereits kleingeschrieben)
 * @param {Set<string>} filter.ingredients  gewählte Zutaten (alle müssen enthalten sein)
 */
export function filterRecipes(recipes, { tag, search, ingredients }) {
  const selectedNames = new Set([...ingredients].map(normalizeIngredientName));
  return recipes.filter(r => {
    if (tag && !r.tags.includes(tag)) return false;
    if (search) {
      const inTitle = r.title.toLowerCase().includes(search);
      const inIngredients = r.ingredients.some(i => (i.name || '').toLowerCase().includes(search));
      if (!inTitle && !inIngredients) return false;
    }
    if (ingredients.size > 0) {
      const recipeNames = new Set(r.ingredients.map(ing => normalizeIngredientName(ing.name)));
      const hasAllSelected = [...selectedNames].every(selected => recipeNames.has(selected));
      if (!hasAllSelected) return false;
    }
    return true;
  });
}
