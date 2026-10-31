// ingredient-parser.js — zerlegt eine Zutatenzeile ("200 g Mehl") in Menge, Einheit und Name.

const UNITS = ['g', 'kg', 'ml', 'l', 'el', 'tl', 'stk', 'stück', 'prise', 'bund', 'dose', 'pck', 'zehe', 'zehen'];

export function parseIngredientLine(line) {
  const text = String(line).trim();
  const match = text.match(/^([\d.,\/]+)\s*([a-zA-ZÄÖÜäöü]*)\s+(.*)$/);
  if (!match) return { amount: null, unit: null, name: text };
  let [, amountStr, unitStr, rest] = match;
  const amount = parseAmount(amountStr);
  const unitLower = unitStr.toLowerCase();
  if (UNITS.includes(unitLower)) {
    return { amount, unit: unitStr, name: rest.trim() };
  }
  // keine erkannte Einheit -> Wort gehört zum Namen
  return { amount, unit: null, name: (unitStr + ' ' + rest).trim() };
}

function parseAmount(str) {
  if (str.includes('/')) {
    const [a, b] = str.split('/').map(Number);
    return b ? a / b : null;
  }
  const n = parseFloat(str.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}
