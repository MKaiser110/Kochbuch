// html-extract.js — Rezept-Extraktion aus HTML: erst JSON-LD, dann Microdata.

import { findLdJsonRecipes, mapSchemaOrgToRecipe } from './json-ld.js';
import { extractMicrodata } from './microdata.js';
import { isUsableRecipe } from './validation.js';
import { recipeQuality } from './ranking.js';

/** Extraktion aus bereits vorliegendem HTML (Paste-Fallback nutzt das auch). */
export function extractFromHtml(html, sourceUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ldRecipes = findLdJsonRecipes(doc)
    .map(data => mapSchemaOrgToRecipe(data, sourceUrl))
    .filter(isUsableRecipe)
    .sort((a, b) => recipeQuality(b, doc, sourceUrl) - recipeQuality(a, doc, sourceUrl));
  if (ldRecipes.length) return ldRecipes[0];
  const microdata = extractMicrodata(doc, sourceUrl);
  if (microdata && isUsableRecipe(microdata)) return microdata;
  return null;
}
