// html-extract.js — Rezept-Extraktion aus HTML: erst JSON-LD, dann Microdata.

import { findLdJsonRecipes, mapSchemaOrgToRecipe } from './json-ld.js';
import { extractMicrodata } from './microdata.js';
import { isUsableRecipe } from './validation.js';
import { recipeQuality } from './ranking.js';
import { extractSemanticHtml } from './html-semantic.js';

/** Extraktion aus bereits vorliegendem HTML (Paste-Fallback nutzt das auch). */
export function extractFromHtml(html, sourceUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pageTitle = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
  const ldRecipes = findLdJsonRecipes(doc)
    .map(data => mapSchemaOrgToRecipe(data, sourceUrl))
    .map(recipe => preferVisibleTitle(recipe, pageTitle))
    .filter(isUsableRecipe)
    .sort((a, b) => recipeQuality(b, doc, sourceUrl) - recipeQuality(a, doc, sourceUrl));
  if (ldRecipes.length) return ldRecipes[0];
  const microdata = extractMicrodata(doc, sourceUrl);
  if (microdata && isUsableRecipe(microdata)) return microdata;
  return extractSemanticHtml(doc, sourceUrl);
}

function preferVisibleTitle(recipe, pageTitle) {
  if (!recipe.title || !pageTitle) return recipe;
  const words = value => String(value).toLocaleLowerCase('de').match(/[\p{L}\p{N}]{3,}/gu) || [];
  const titleWords = new Set(words(recipe.title));
  const visibleWords = words(pageTitle);
  const overlap = visibleWords.filter(word => titleWords.has(word)).length / Math.max(visibleWords.length, titleWords.size, 1);
  if (overlap >= 0.55) recipe.title = pageTitle;
  return recipe;
}
