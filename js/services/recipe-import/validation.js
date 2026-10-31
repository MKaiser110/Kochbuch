// Plausibilitätsprüfungen für importierte Rezeptdaten.
const NOISE = /^(home|startseite|rezepte?|recipes?|search|suche|login|anmelden|404|not found|über uns|kontakt|impressum|datenschutz|privacy|menu|menü|share|teilen|print|drucken|save recipe|jump to|skip to|werbung|jetzt kaufen|mehr erfahren|zum rezept|rezept drucken|rezept speichern)$/i;

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
    && !/^https?:\/\//i.test(value) && !/[<>]/.test(value);
}
export function isLikelyStep(step) {
  const value = String(step || '').trim();
  return value.length >= 12 && value.length <= 1200
    && !/^(prep time|cook time|total time|servings|nutrition|calories|source|navigation|startseite|über uns|kontakt|impressum|share|print|save recipe)\s*[:.]?$/i.test(value)
    && !/^https?:\/\//i.test(value);
}
