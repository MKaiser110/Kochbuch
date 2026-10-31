import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredientLine } from '../js/services/recipe-import/ingredient-parser.js';
import { validateRecipeUrl } from '../js/services/recipe-import/index.js';
import { parseIsoDuration, flattenInstructions } from '../js/services/recipe-import/schema-helpers.js';
import { isUsableRecipe } from '../js/services/recipe-import/validation.js';

test('parses common German ingredient quantities', () => {
  assert.deepEqual(parseIngredientLine('200 g Mehl'), { amount: 200, unit: 'g', name: 'Mehl' });
  assert.deepEqual(parseIngredientLine('1 1/2 EL Zucker'), { amount: 1.5, unit: 'EL', name: 'Zucker' });
  assert.deepEqual(parseIngredientLine('½ TL Salz'), { amount: 0.5, unit: 'TL', name: 'Salz' });
  assert.deepEqual(parseIngredientLine('2 große Zwiebeln'), { amount: 2, unit: null, name: 'große Zwiebeln' });
});

test('validates public HTTP(S) recipe URLs', () => {
  assert.equal(validateRecipeUrl('https://example.com/rezept'), 'https://example.com/rezept');
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://localhost/', 'http://192.168.1.2/', 'http://[fd00::1]/', 'https://user:pass@example.com/']) {
    assert.throws(() => validateRecipeUrl(url), /INVALID_URL/);
  }
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
});
