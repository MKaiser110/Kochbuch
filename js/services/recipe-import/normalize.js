// Gemeinsame Normalisierung für URL- und Bildimporte.
import { blankRecipe, normalizeTags } from '../../core/recipe-model.js';
import { parseIngredientLine } from './ingredient-parser.js';
import { isLikelyStep } from './validation.js';

export function normalizeImportedRecipe(input = {}) {
  const recipe = { ...blankRecipe(), ...input };
  recipe.title = cleanText(input.title);
  recipe.description = cleanText(input.description)
    .replace(/!?\[[^\]]*\]\([^)]+\)/g, '').trim()
    .replace(/^[*_~\s]+|[*_~\s]+$/g, '')
    .replace(/\s+Über\s+\d+\s+Bewertungen?.*$/i, '')
    .replace(/\s+Mit\s+(?:►|Portionsrechner|Kochbuch|Video-Tipps).*/i, '').trim();
  recipe.tags = normalizeTags(Array.isArray(input.tags) ? input.tags : []);
  recipe.cuisine = cleanText(input.cuisine);
  recipe.difficulty = cleanText(input.difficulty);
  recipe.nutrition = input.nutrition && typeof input.nutrition === 'object' ? input.nutrition : null;
  recipe.prepTime = finiteOrNull(input.prepTime);
  recipe.cookTime = finiteOrNull(input.cookTime);
  recipe.totalTime = finiteOrNull(input.totalTime);
  recipe.servingsKnown = Boolean(input.servingsKnown);
  recipe.servingsBase = finiteOrNull(input.servingsBase) || 4;
  recipe.ingredients = normalizeIngredients(input.ingredients);
  recipe.steps = normalizeSteps(input.steps);
  recipe.importWarnings = Array.isArray(input.importWarnings) ? [...new Set(input.importWarnings)] : [];
  if (!recipe.servingsKnown && (input.reviewRequired || input.source) && !recipe.importWarnings.includes('Portionen nicht erkannt')) {
    recipe.importWarnings.push('Portionen nicht erkannt');
  }
  recipe.reviewRequired = Boolean(input.reviewRequired || recipe.importWarnings.length);
  return recipe;
}

export function normalizeIngredients(items) {
  const result = [];
  const seen = new Set();
  for (const raw of Array.isArray(items) ? items : []) {
    const values = typeof raw === 'string' ? [raw] : [raw?.text || raw?.name || ''];
    for (const value of values) {
      const line = cleanText(value);
      if (!line) continue;
      const parsed = parseIngredientLine(line);
      const item = typeof raw === 'object' && raw !== null && raw.name
        ? { amount: finiteOrNull(raw.amount), unit: cleanText(raw.unit) || null, name: cleanText(raw.name) }
        : parsed;
      if (!item.name) continue;
      const key = `${item.amount ?? ''}|${(item.unit || '').toLocaleLowerCase()}|${item.name.toLocaleLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function normalizeSteps(items) {
  const source = Array.isArray(items) ? items : (items ? [items] : []);
  const result = [];
  for (const raw of source) {
    const text = cleanText(typeof raw === 'string' ? raw : raw?.text || '')
      .replace(/!?\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/!?\[[^\]]*\]\((?:javascript:|https?:)[^)]*\)/gi, '')
      .replace(/\]\((?:javascript:|https?:)[^)]*\)/gi, '')
      .replace(/:\s*/g, ': ')
      .replace(/\s+/g, ' ').trim();
    if (!isLikelyStep(text)) continue;
    const key = text.toLocaleLowerCase();
    if (result.length && result.at(-1).toLocaleLowerCase() === key) continue;
    result.push(text);
  }
  return result;
}

function cleanText(value) {
  return String(value ?? '').replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/&nbsp;/gi, ' ').replace(/^\[x\]\s*/i, '')
    .replace(/\s+/g, ' ').trim();
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
