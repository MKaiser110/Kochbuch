import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredientLine } from '../js/services/recipe-import/ingredient-parser.js';
import { validateRecipeUrl } from '../js/services/recipe-import/index.js';
import { parseIsoDuration, flattenInstructions } from '../js/services/recipe-import/schema-helpers.js';
import { isUsableRecipe } from '../js/services/recipe-import/validation.js';
import { normalizeIngredients, normalizeSteps, normalizeImportedRecipe } from '../js/services/recipe-import/normalize.js';
import { draftRecipeFromOcrText } from '../js/services/ocr-import.js';
import { extractFromReaderText } from '../js/services/recipe-import/reader-extract.js';

test('parses common German ingredient quantities', () => {
  assert.deepEqual(parseIngredientLine('200 g Mehl'), { amount: 200, unit: 'g', name: 'Mehl' });
  assert.deepEqual(parseIngredientLine('1 1/2 EL Zucker'), { amount: 1.5, unit: 'EL', name: 'Zucker' });
  assert.deepEqual(parseIngredientLine('½ TL Salz'), { amount: 0.5, unit: 'TL', name: 'Salz' });
  assert.deepEqual(parseIngredientLine('2 große Zwiebeln'), { amount: 2, unit: null, name: 'große Zwiebeln' });
});

test('validates public HTTP(S) recipe URLs', () => {
  assert.equal(validateRecipeUrl('https://example.com/rezept'), 'https://example.com/rezept');
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://localhost/', 'http://192.168.1.2/', 'http://2130706433/', 'http://[fd00::1]/', 'http://printer/', 'https://user:pass@example.com/']) {
    assert.throws(() => validateRecipeUrl(url), /INVALID_URL/);
  }
});

test('normalizes imported ingredients and removes exact duplicates only', () => {
  assert.deepEqual(normalizeIngredients([' 200  g Mehl ', '200 g Mehl', '1 Ei', '1 Ei']), [
    { amount: 200, unit: 'g', name: 'Mehl' }, { amount: 1, unit: null, name: 'Ei' },
  ]);
  assert.deepEqual(normalizeSteps(['Teig gut verrühren. ', 'Teig gut verrühren.', 'Bei 180 Grad goldbraun backen.', 'I made it']), ['Teig gut verrühren.', 'Bei 180 Grad goldbraun backen.']);
  assert.deepEqual(normalizeSteps(['Soße abschmecken. ![![Image 72](https://example.com/pixel.png)](javascript:;)']), ['Soße abschmecken.']);
  const normalized = normalizeImportedRecipe({ description: 'unwanted', cuisine: 'unwanted', cookTime: 20, totalTime: 30 });
  assert.equal('description' in normalized, false);
  assert.equal('cuisine' in normalized, false);
  assert.equal('cookTime' in normalized, false);
  assert.equal('totalTime' in normalized, false);
});

test('drafts a structured OCR recipe from headed sections without inventing steps', () => {
  const draft = draftRecipeFromOcrText('Kartoffelsuppe\nZutaten\n500 g Kartoffeln\n1 Zwiebel\nZubereitung\nZwiebel schneiden und in Öl anbraten.\n20 Minuten köcheln lassen.');
  assert.equal(draft.title, 'Kartoffelsuppe');
  assert.deepEqual(draft.ingredients.map(i => i.name), ['Kartoffeln', 'Zwiebel']);
  assert.deepEqual(draft.steps, ['Zwiebel schneiden und in Öl anbraten.', '20 Minuten köcheln lassen.']);
  assert.equal(draft.reviewRequired, true);
});

test('OCR recognizes servings and total time stated inline', () => {
  const draft = draftRecipeFromOcrText('Kartoffelsuppe\nFür 4 Portionen · Gesamtzeit 35 Min.\nZutaten\n500 g Kartoffeln\n1 Zwiebel\nZubereitung\nZwiebel würfeln und anbraten.\nKartoffeln kochen und pürieren.');
  assert.equal(draft.servingsBase, 4);
  assert.equal(draft.servingsKnown, true);
  assert.equal(draft.prepTime, 35);
});

test('retains unquantified ingredient wording from OCR', () => {
  assert.deepEqual(parseIngredientLine('eine Prise Salz'), { amount: 1, unit: 'prise', name: 'Salz' });
  assert.deepEqual(parseIngredientLine('nach Bedarf Pfeffer'), { amount: null, unit: 'nach bedarf', name: 'Pfeffer' });
});

test('reader fallback keeps servings, drops UI noise, and requires review', () => {
  const recipe = extractFromReaderText(`# Wraps mit Hackfleisch\n\nPublished Time: Thu, 15 Oct 2026\n\n## Zutaten\n- 250 g Rinderhackfleisch\n- 4 Tortilla-Wraps\nPortionen\n1\n## Zubereitung\n1. Hackfleisch anbraten und würzen.\n2. Die Füllung in Wraps verteilen und einrollen.\n## Kochmodus\n- **Kochmodus anschalten** (Display bleibt an)`, 'https://example.com/rezept');
  assert.equal(recipe.servingsBase, 4);
  assert.equal(recipe.servingsKnown, false);
  assert.equal(recipe.ingredients.length, 2);
  assert.equal(recipe.steps.length, 2);
  assert.equal(recipe.reviewRequired, true);
  assert.equal('description' in recipe, false);
});

test('reader fallback drops ingredient navigation and cleans checkbox and image markup', () => {
  const recipe = extractFromReaderText(`# Fettuccine Alfredo\n## Ingredients\n- [Chicken](https://example.com/chicken)\n- [Pasta](https://example.com/pasta)\n- [x] 1 pound fettuccine\n- [x] 1 1/2 cups heavy cream\n## Instructions\n1. Cook pasta until tender and drain. ![ad](https://example.com/ad.png)\n2. Whisk cream and butter together until smooth.`, 'https://example.com/alfredo');
  assert.deepEqual(recipe.ingredients.map(i => i.name), ['fettuccine', 'heavy cream']);
  assert.deepEqual(recipe.steps, ['Cook pasta until tender and drain.', 'Whisk cream and butter together until smooth.']);
});

test('reader fallback cleans editorial recipe pages with bold quantities and step labels', () => {
  const recipe = extractFromReaderText(`# We've Tried Countless Chicken Soups, But This Is Hands-Down The Best One\n\n"Total soup for the soul! Tender chicken, slight crunch on the veg, and very aromatic and flavorful." — pastagofer\n## Ingredients\n- **2 Tbsp.** vegetable oil\n- **2 lb.** bone-in chicken pieces\n## Directions\nStep 1 In a large pot, heat oil and brown the chicken on both sides.\nStep 2 Add stock and simmer until the chicken is fully cooked.\nStep 3 Divide soup among bowls and garnish with parsley.\nI made it\nPHOTO: RACHEL VANNI; FOOD STYLING: MAKINZE GORE`, 'https://www.delish.com/cooking/recipe-ideas/a44475588/best-chicken-soup-recipe/');
  assert.equal(recipe.title, 'Best chicken soup recipe');
  assert.deepEqual(recipe.ingredients.map(i => [i.amount, i.unit, i.name]), [[2, 'Tbsp', 'vegetable oil'], [2, 'lb', 'bone-in chicken pieces']]);
  assert.equal(recipe.steps.length, 3);
  assert.equal(recipe.steps[0].startsWith('In a large pot'), true);
  assert.equal(recipe.steps.some(step => /I made it|PHOTO:/i.test(step)), false);
  assert.equal('description' in recipe, false);
});

test('parses ISO durations with hours and days', () => {
  assert.equal(parseIsoDuration('PT1H30M'), 90);
  assert.equal(parseIsoDuration('P1DT2H'), 1560);
  assert.equal(parseIsoDuration('invalid'), null);
});

test('flattens HowToSection instruction groups', () => {
  assert.deepEqual(flattenInstructions([{ '@type': 'HowToSection', itemListElement: [{ text: 'Schritt eins' }, { text: 'Schritt zwei' }] }]), ['Schritt eins', 'Schritt zwei']);
});

test('rejects incomplete or navigation-like recipe data', () => {
  assert.equal(isUsableRecipe({ title: 'Startseite', ingredients: [], steps: [] }), false);
  assert.equal(isUsableRecipe({ title: 'Gemüsesuppe', ingredients: [{ name: 'Karotten' }, { name: 'Kartoffeln' }], steps: ['Das Gemüse klein schneiden und garen.'] }), true);
  assert.equal(isUsableRecipe({ title: 'Chili', ingredients: [{ name: 'Hackfleisch' }, { name: 'Pro Portion' }], steps: ['Bohnen und Fleisch garen und anschließend servieren.'] }), false);
  assert.equal(isUsableRecipe({ title: 'Wraps', ingredients: [{ name: 'Tortilla' }, { name: 'Portionen' }], steps: ['Die Füllung in Wraps verteilen und einrollen.'] }), false);
  assert.equal(isUsableRecipe({ title: 'Chili', ingredients: [{ name: 'Hackfleisch' }, { name: 'Bohnen' }], steps: ['Koch-/Backzeit'] }), false);
  assert.equal(isUsableRecipe({ title: 'Wraps', ingredients: [{ name: 'Tortilla' }, { name: 'Mais' }], steps: ['**Kochmodus anschalten** (Display bleibt an)'] }), false);
});
