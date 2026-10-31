// json-ld.js — Rezepte aus <script type="application/ld+json"> lesen.

import { blankRecipe } from '../../core/recipe-model.js';
import { parseIngredientLine } from './ingredient-parser.js';
import { isLikelyIngredient, isLikelyStep } from './validation.js';
import { tagsFromSchema, firstOf, imageUrl, parseServings, parseIsoDuration, flattenInstructions } from './schema-helpers.js';

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
  const r = blankRecipe();
  r.title = typeof data.name === 'string' ? data.name.trim() : '';
  r.tags = tagsFromSchema(data.recipeCategory, data.recipeCuisine);
  r.servingsBase = parseServings(data.recipeYield) ?? 4;
  r.prepTime = parseIsoDuration(data.totalTime || data.cookTime) ?? null;
  r.source = sourceUrl || null;
  r.image = resolveImageUrl(firstOf(imageUrl(data.image)), sourceUrl);

  const rawIngredients = data.recipeIngredient || data.ingredients || [];
  r.ingredients = (Array.isArray(rawIngredients) ? rawIngredients : [rawIngredients])
    .map(item => typeof item === 'string' ? item : item?.name || item?.text || '')
    .filter(item => typeof item === 'string' && item.trim())
    .map(parseIngredientLine)
    .filter(ingredient => isLikelyIngredient(ingredient.name));

  const instructions = data.recipeInstructions || data.instructions;
  r.steps = flattenInstructions(instructions).map(step => String(step).trim()).filter(isLikelyStep);

  return r;
}

function resolveImageUrl(value, sourceUrl) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value, sourceUrl || document.baseURI);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
