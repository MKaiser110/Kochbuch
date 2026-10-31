// Heuristische Extraktion aus sichtbaren HTML-Abschnitten, wenn kein Recipe-Schema vorliegt.
import { blankRecipe } from '../../core/recipe-model.js';
import { parseIngredientLine } from './ingredient-parser.js';
import { isUsableRecipe } from './validation.js';
import { normalizeImportedRecipe } from './normalize.js';

const INGREDIENTS = /^(zutaten|ingredients?|was du brauchst|du brauchst)\b/i;
const INSTRUCTIONS = /^(zubereitung|anleitung|schritte|instructions?|directions?|method|preparation)\b/i;
const OTHER = /^(nährwerte|naehrwerte|nutrition|tipps|notes|notizen|bewertung|reviews?|ähnliche rezepte|related)\b/i;

export function extractSemanticHtml(doc, sourceUrl) {
  const title = doc.querySelector('h1')?.textContent?.trim()
    || doc.querySelector('meta[property="og:title"]')?.content?.trim()
    || '';
  if (!title) return null;
  const groups = { ingredients: [], steps: [] };
  let section = null;
  for (const node of doc.querySelectorAll('h2,h3,h4,li,p')) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim();
    if (!text || text.length > 1200) continue;
    if (/^H[2-4]$/.test(node.tagName)) {
      section = INGREDIENTS.test(text) ? 'ingredients' : INSTRUCTIONS.test(text) ? 'steps' : null;
      continue;
    }
    if (section === 'ingredients' && text.length < 220 && !groups.ingredients.includes(text)) groups.ingredients.push(text);
    if (section === 'steps' && text.length >= 12 && !groups.steps.includes(text)) groups.steps.push(text);
  }
  const recipe = normalizeImportedRecipe({
    ...blankRecipe(), title, source: sourceUrl || null,
    ingredients: groups.ingredients.map(parseIngredientLine), steps: groups.steps,
    reviewRequired: true,
    importWarnings: ['Rezeptdaten aus Seitenabschnitten heuristisch erkannt; bitte vollständig prüfen'],
  });
  return isUsableRecipe(recipe) ? recipe : null;
}
