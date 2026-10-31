// Plausibilitätsprüfungen für importierte Rezeptdaten.
const NOISE = /^(home|startseite|rezepte?|recipes?|search|suche|login|anmelden|404|not found|über uns|kontakt|impressum|datenschutz|privacy|menu|menü|share|teilen|print|drucken|save recipe|jump to|skip to|werbung|jetzt kaufen|mehr erfahren|zum rezept|rezept drucken|rezept speichern|schließen|pro portion|pro 100 g|weniger|mehr|zutaten|zubereitung|nährwerte|nutrition|portionen|arbeitszeit|kochzeit|koch-\/?backzeit|zubereitungszeit|vorbereitungszeit|total time|prep time|cook time|servings?|guten appetit|deselect all|get ingredients|cook mode(?:\b|\s)|see all(?:\b|\s)|chicken|turkey|beef|pork|fish|shellfish|rice|pasta|vegetables)$/i;

export function isUsableRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') return false;
  const title = String(recipe.title || '').trim();
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  return title.length >= 3 && title.length <= 140 && !NOISE.test(title)
    && ingredients.filter(item => item && isLikelyIngredient(item.name)).length >= 2
    && steps.filter(isLikelyStep).length > 0;
}

export function isLikelyIngredient(name) {
  const value = String(name || '').trim();
  return value.length >= 2 && value.length <= 160 && !NOISE.test(value)
    && !/^\[[^\]]+\]\(https?:\/\//i.test(value)
    && !/^(?:[_\W]*)(?:pro portion|pro 100 ?g|schließen|weniger|mehr|für \d+ portionen|\[x\]|deselect all|get ingredients|cook mode|see all)\b/i.test(value)
    && !/^https?:\/\//i.test(value) && !/[<>]/.test(value);
}
export function isLikelyStep(step) {
  const value = String(step || '').trim();
  return value.length >= 12 && value.length <= 1200 && !/^(?:tipp|note|guten appetit|jetzt kaufen|bewerte|kommentare|rezept speichern|koch-\/?backzeit|arbeitszeit|zubereitungszeit|kochmodus\b|\*+kochmodus\b|heart_|calendar_|\[_(?:print|email|whatsapp)|eure lieblingsgerichte von chefkoch|unsere lieblingsrezepte|subscribe to)/i.test(value)
    && !/^(?:i made it|photo\s*:|food styling\s*:|photo\s+by\b)/i.test(value)
    && !/^\[(?:calendar|print|email|whatsapp)/i.test(value)
    && !/^(prep time|cook time|total time|servings|nutrition|calories|source|navigation|startseite|über uns|kontakt|impressum|share|print|save recipe)\s*[:.]?$/i.test(value)
    && !/^https?:\/\//i.test(value);
}
