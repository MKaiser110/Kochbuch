// ranking.js — Bewertung mehrerer gefundener Rezepte einer Seite
// (Vollständigkeit und Titel-Passung), um das beste auszuwählen.

export function recipeQuality(recipe, doc, sourceUrl) {
  const measuredIngredients = recipe.ingredients.filter(ingredient =>
    ingredient.amount !== null || ingredient.unit
  ).length;
  return titleRelevance(recipe.title, doc, sourceUrl) * 100
    + Math.min(recipe.ingredients.length, 30)
    + Math.min(recipe.steps.length, 20) * 2
    + measuredIngredients * 2;
}

function titleRelevance(title, doc, sourceUrl) {
  let pathTitle = '';
  if (sourceUrl) {
    try {
      pathTitle = new URL(sourceUrl).pathname.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ') || '';
    } catch {
      // Eingefügter Fallback-Text wird evtl. geparst, bevor die optionale Quell-URL geprüft wurde.
    }
  }
  const candidates = [
    doc.querySelector('meta[property="og:title"]')?.content,
    doc.querySelector('meta[name="twitter:title"]')?.content,
    doc.title,
    pathTitle,
  ].filter(Boolean);
  const words = value => String(value).toLocaleLowerCase('de')
    .replace(/[^a-z0-9äöüß]+/gi, ' ').trim().split(/\s+/)
    .filter(word => word.length > 2 && !['der', 'die', 'das', 'und', 'mit', 'für', 'the', 'and', 'with', 'recipe', 'rezept'].includes(word));
  const recipeWords = new Set(words(title));
  let best = 0;
  for (const candidate of candidates) {
    const candidateWords = words(candidate.split(/\s+[|–—-]\s+/)[0]);
    if (!candidateWords.length || !recipeWords.size) continue;
    const overlap = candidateWords.filter(word => recipeWords.has(word)).length / Math.max(candidateWords.length, recipeWords.size);
    if (overlap >= 0.7) best = Math.max(best, 2);
    else if (overlap >= 0.4) best = Math.max(best, 1);
  }
  return best;
}
