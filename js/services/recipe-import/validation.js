// validation.js — Plausibilitätsprüfungen für extrahierte Rezepte.

export function isUsableRecipe(recipe) {
  const title = String(recipe.title || '').trim();
  const ingredients = recipe.ingredients.filter(ingredient => isLikelyIngredient(ingredient.name));
  const steps = recipe.steps.filter(isLikelyStep);
  if (title.length < 3 || title.length > 140 || ingredients.length < 2 || steps.length === 0) {
    return false;
  }
  return !/^(home|startseite|rezepte?|recipes?|search|suche|login|anmelden|404|not found)$/i.test(title);
}

export function isLikelyIngredient(name) {
  const value = String(name || '').trim();
  return value.length >= 2 && value.length <= 160
    && !/^(home|startseite|rezepte?|recipes?|search|suche|login|anmelden|über uns|kontakt|impressum|datenschutz|privacy|menu|menü|share|teilen|print|drucken|save recipe|jump to|skip to|werbung|jetzt kaufen|mehr erfahren|zum rezept|rezept drucken|rezept speichern)$/i.test(value)
    && !/^https?:\/\//i.test(value);
}

export function isLikelyStep(step) {
  const value = String(step || '').trim();
  return value.length >= 12 && value.length <= 1200
    && !/^(prep time|cook time|total time|servings|nutrition|calories|source|navigation|startseite|über uns|kontakt|impressum|share|print|save recipe)\s*[:.]?$/i.test(value);
}
