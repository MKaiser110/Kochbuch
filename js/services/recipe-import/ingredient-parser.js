// Zerlegt deutsche und internationale Zutatenmengen möglichst verlustarm.
const UNITS = new Set([
  'g','gr','gramm','kg','mg','ml','cl','dl','l','el','esslöffel','tl','teelöffel',
  'stk','stück','stücke','prise','prisen','bund','dose','dosen','pck','päckchen',
  'packung','packungen','zehe','zehen','scheibe','scheiben','blatt','blätter',
  'becher','tasse','tassen','glas','gläser','würfel','zweig','zweige','spritzer',
  'messerspitze','msp','cm','liter'
]);

export function parseIngredientLine(line) {
  const text = String(line ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { amount: null, unit: null, name: '' };

  const match = text.match(/^([≈~]?)((?:\d+\s+)?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|\d+\/\d+|[½⅓⅔¼¾⅛⅜⅝⅞])\s*([\p{L}.]+)?\s+(.+)$/u);
  if (!match) return { amount: null, unit: null, name: text };

  const amount = parseAmount(match[2]);
  const rawUnit = (match[3] || '').replace(/\.$/, '');
  const rest = match[4].trim();
  if (!rawUnit || UNITS.has(rawUnit.toLocaleLowerCase('de'))) {
    return { amount, unit: rawUnit || null, name: rest };
  }
  // Unbekanntes Wort nicht als Einheit interpretieren ("2 große Zwiebeln").
  return { amount, unit: null, name: `${rawUnit} ${rest}`.trim() };
}

function parseAmount(value) {
  const fractions = { '½': 0.5, '⅓': 1/3, '⅔': 2/3, '¼': 0.25, '¾': 0.75,
    '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
  if (fractions[value]) return fractions[value];
  const normalized = value.replace(',', '.').replace(/\s+/g, ' ').trim();
  const mixed = normalized.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + (Number(mixed[3]) ? Number(mixed[2]) / Number(mixed[3]) : 0);
  const fraction = normalized.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) return Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
