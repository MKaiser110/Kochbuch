// json-ld.js — Rezepte aus <script type="application/ld+json"> lesen.

import { blankRecipe } from '../../core/recipe-model.js';
import { parseIngredientLine } from './ingredient-parser.js';
import { isLikelyIngredient, isLikelyStep } from './validation.js';
import { tagsFromSchema, firstOf, imageUrl, parseServings, parseIsoDuration, flattenInstructions } from './schema-helpers.js';
import { normalizeImportedRecipe } from './normalize.js';

export function findLdJsonRecipes(doc) {
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  const recipes = [];
  for (const s of scripts) {
    let data;
    try { data = JSON.parse(s.textContent); } catch { continue; }
    recipes.push(...searchForRecipes(data));
  }
  return recipes;
}

function searchForRecipes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) {
    return node.flatMap(searchForRecipes);
  }
  const type = node['@type'];
  const types = (Array.isArray(type) ? type : [type]).map(value => String(value || '').split(/[\/#]/).pop());
  const recipes = types.includes('Recipe') ? [node] : [];
  for (const [key, value] of Object.entries(node)) {
    if (key !== '@type' && value && typeof value === 'object') {
      recipes.push(...searchForRecipes(value));
    }
  }
  return recipes;
}

export function mapSchemaOrgToRecipe(data, sourceUrl) {
  const recipe = blankRecipe();
  recipe.title = typeof data.name === 'string' ? data.name.trim() : '';
  recipe.tags = tagsFromSchema(data.recipeCategory, data.recipeCuisine);
  const servings = parseServings(data.recipeYield);
  recipe.servingsBase = servings ?? 4;
  recipe.servingsKnown = servings !== null;
  recipe.prepTime = parseIsoDuration(data.prepTime);
  recipe.cookTime = parseIsoDuration(data.cookTime);
  recipe.totalTime = parseIsoDuration(data.totalTime);
  recipe.description = typeof data.description === 'string' ? data.description : '';
  recipe.cuisine = Array.isArray(data.recipeCuisine) ? data.recipeCuisine.join(', ') : (data.recipeCuisine || '');
  recipe.difficulty = data.difficulty || data.educationalLevel || '';
  recipe.nutrition = data.nutrition && typeof data.nutrition === 'object' ? data.nutrition : null;
  recipe.source = sourceUrl || null;
  recipe.image = resolveImageUrl(firstOf(imageUrl(data.image)), sourceUrl);

  const rawIngredients = data.recipeIngredient || data.ingredients || [];
  recipe.ingredients = (Array.isArray(rawIngredients) ? rawIngredients : [rawIngredients])
    .map(item => typeof item === 'string' ? item : item?.name || item?.text || '')
    .filter(item => typeof item === 'string' && item.trim())
    .map(parseIngredientLine)
    .filter(ingredient => isLikelyIngredient(ingredient.name));

  const instructions = data.recipeInstructions || data.instructions;
  recipe.steps = flattenInstructions(instructions).map(step => String(step).trim()).filter(isLikelyStep);

  return normalizeImportedRecipe(recipe);
}

function resolveImageUrl(value, sourceUrl) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value, sourceUrl || document.baseURI);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
