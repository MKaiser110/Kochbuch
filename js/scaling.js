// scaling.js — skaliert Zutatenmengen proportional zur Portionenzahl.

/**
 * @param {Array<{name:string, amount:number|null, unit:string|null}>} ingredients
 * @param {number} baseServings
 * @param {number} targetServings
 */
export function scaleIngredients(ingredients, baseServings, targetServings) {
  const factor = baseServings > 0 ? targetServings / baseServings : 1;
  return ingredients.map(ing => ({
    ...ing,
    amount: ing.amount == null ? null : roundNicely(ing.amount * factor),
  }));
}

// Rundet auf sinnvolle Kochmaße statt lange Dezimalzahlen.
function roundNicely(n) {
  if (n === 0) return 0;
  if (n < 1) return Math.round(n * 100) / 100;   // z.B. 0,33
  if (n < 10) return Math.round(n * 10) / 10;    // z.B. 2,5
  return Math.round(n);
}

export function formatAmount(amount, unit) {
  if (amount == null) return unit || '';
  const num = Number.isInteger(amount) ? amount : amount.toString().replace('.', ',');
  return unit ? `${num} ${unit}` : `${num}`;
}
