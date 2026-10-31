// microdata.js — Rezepte aus schema.org-Microdata (itemprop) lesen.

import { blankRecipe } from '../../core/recipe-model.js';
import { parseIngredientLine } from './ingredient-parser.js';
import { isUsableRecipe, isLikelyIngredient, isLikelyStep } from './validation.js';
import { tagsFromSchema, parseServings, parseIsoDuration } from './schema-helpers.js';

// Viele ältere/kleinere Rezeptseiten nutzen schema.org-Microdata
// (itemprop-Attribute) statt JSON-LD. Zweite, unabhängige Extraktionsmethode.
export function extractMicrodata(doc, sourceUrl) {
  const scope = doc.querySelector('[itemtype*="schema.org/Recipe"]');
  if (!scope) return null;

  const getProp = (name) => scope.querySelector(`[itemprop="${name}"]`);
  const getAllProp = (name) => [...scope.querySelectorAll(`[itemprop="${name}"]`)];

  const title = getProp('name')?.getAttribute('content')
    || getProp('name')?.textContent.trim() || '';
  if (!title) return null;

  const r = blankRecipe();
  r.title = title;
  r.tags = tagsFromSchema(getProp('recipeCategory')?.textContent, getProp('recipeCuisine')?.textContent);
  r.servingsBase = parseServings(getProp('recipeYield')?.textContent
    || getProp('recipeYield')?.getAttribute('content')) ?? 4;
  r.prepTime = parseIsoDuration(
    getProp('totalTime')?.getAttribute('datetime') || getProp('cookTime')?.getAttribute('datetime')
  ) ?? null;
  r.source = sourceUrl || null;
  const imgEl = getProp('image');
  r.image = imgEl?.getAttribute('src') || imgEl?.getAttribute('content') || null;

  r.ingredients = getAllProp('recipeIngredient')
    .map(el => parseIngredientLine(el.textContent.trim()))
    .filter(ingredient => isLikelyIngredient(ingredient.name));
  r.steps = getAllProp('recipeInstructions')
    .filter(el => !el.querySelector('[itemprop="recipeInstructions"]'))
    .map(el => el.textContent.trim())
    .filter(isLikelyStep);

  if (!isUsableRecipe(r)) return null;
  return r;
}
