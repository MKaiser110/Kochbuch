// microdata.js — Rezepte aus schema.org-Microdata (itemprop) lesen.

import { blankRecipe } from '../../core/recipe-model.js';
import { parseIngredientLine } from './ingredient-parser.js';
import { isUsableRecipe, isLikelyIngredient, isLikelyStep } from './validation.js';
import { tagsFromSchema, parseServings, parseIsoDuration } from './schema-helpers.js';
import { normalizeImportedRecipe } from './normalize.js';

// Viele ältere/kleinere Rezeptseiten nutzen schema.org-Microdata
// (itemprop-Attribute) statt JSON-LD. Zweite, unabhängige Extraktionsmethode.
export function extractMicrodata(doc, sourceUrl) {
  const scopes = [...doc.querySelectorAll('[itemtype*="schema.org/Recipe"], [itemtype$="/Recipe"]')];
  const candidates = scopes.map(scope => extractScope(scope, sourceUrl)).filter(Boolean);
  return candidates.sort((a, b) => recipeCompleteness(b) - recipeCompleteness(a))[0] || null;
}

function extractScope(scope, sourceUrl) {
  const belongsToScope = element => element.closest('[itemtype*="schema.org/Recipe"], [itemtype$="/Recipe"]') === scope;
  const getAllProp = name => [...scope.querySelectorAll(`[itemprop="${name}"]`)].filter(belongsToScope);
  const getProp = name => getAllProp(name)[0] || null;
  const valueOf = element => element?.getAttribute('content') || element?.getAttribute('datetime')
    || element?.getAttribute('src') || element?.textContent?.trim() || '';

  const title = valueOf(getProp('name'));
  if (!title) return null;

  const r = blankRecipe();
  r.title = title;
  r.tags = tagsFromSchema(getProp('recipeCategory')?.textContent);
  const servings = parseServings(valueOf(getProp('recipeYield')));
  r.servingsBase = servings ?? 4;
  r.servingsKnown = servings !== null;
  r.prepTime = parseIsoDuration(valueOf(getProp('totalTime')));
  r.source = sourceUrl || null;
  const imgEl = getProp('image');
  r.image = valueOf(imgEl) || null;

  r.ingredients = getAllProp('recipeIngredient')
    .map(el => parseIngredientLine(valueOf(el)))
    .filter(ingredient => isLikelyIngredient(ingredient.name));
  r.steps = getAllProp('recipeInstructions')
    .filter(el => !el.querySelector('[itemprop="recipeInstructions"]'))
    .map(el => valueOf(el))
    .filter(isLikelyStep);

  const normalized = normalizeImportedRecipe(r);
  if (!isUsableRecipe(normalized)) return null;
  return normalized;
}

function recipeCompleteness(recipe) {
  return recipe.ingredients.length * 2 + recipe.steps.length * 3
    + (recipe.prepTime !== null ? 1 : 0) + (recipe.image ? 1 : 0);
}
