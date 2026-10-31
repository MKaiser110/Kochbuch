// reader-extract.js — Rezept-Extraktion aus reinem Text (Reader-Dienst oder
// manuell eingefügter Seitentext), wenn kein strukturiertes Markup vorliegt.

import { blankRecipe } from '../../core/recipe-model.js';
import { parseIngredientLine } from './ingredient-parser.js';
import { isUsableRecipe, isLikelyIngredient, isLikelyStep } from './validation.js';

// Der Reader-Fallback verwendet ausschließlich erkannte Zutaten- und
// Zubereitungsabschnitte. Seitentext außerhalb dieser Abschnitte wird ignoriert.
export function extractFromReaderText(text, sourceUrl) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const titleLine = lines.find(l => /^title:\s*/i.test(l))
    || lines.find(l => /^#\s+/.test(l));
  const r = blankRecipe();
  if (titleLine) {
    r.title = titleLine.replace(/^title:\s*/i, '').replace(/^#+\s*/, '').trim();
  }
  if (!r.title || !/^[\wÄÖÜäöü\s&()\-/:,.'"/]{3,120}$/.test(r.title) || /^(home|startseite|search|suche|about|kontakt|impressum|datenschutz|privacy|page|homepage|category|tags?)$/i.test(r.title)) {
    return null;
  }
  r.source = sourceUrl || null;

  const ingredients = [];
  const steps = [];
  let section = null;
  let sawRecipeStructure = false;

  for (const line of lines) {
    if (line === titleLine || /^(url source|markdown content|title):/i.test(line)) continue;
    const heading = sectionHeading(line);
    if (heading !== null) {
      section = heading;
      if (heading === 'ingredients' || heading === 'steps') sawRecipeStructure = true;
      continue;
    }

    const item = line.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
    if (!item || /^https?:\/\//i.test(item)) continue;

    if (section === 'ingredients') {
      const ingredient = parseIngredientLine(item);
      if (isLikelyIngredient(ingredient.name)) ingredients.push(ingredient);
    } else if (section === 'steps') {
      if (isLikelyStep(item)) steps.push(item);
    }
  }

  if (!sawRecipeStructure) return null;
  r.ingredients = ingredients;
  r.steps = steps;

  return isUsableRecipe(r) ? r : null;
}

function sectionHeading(line) {
  const heading = line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').replace(/:$/, '').trim().toLocaleLowerCase('de');
  if (/^(zutaten|ingredients?)(\b| für\b)/.test(heading)) return 'ingredients';
  if (/^(zubereitung|zubereitungsweise|anleitung|kochschritte|schritte|instructions?|directions?|method|preparation)(\b|:)/.test(heading)) {
    return 'steps';
  }
  if (/^(nährwerte|naehrwerte|nutrition|notizen|notes|tipps|tips|bewertung|reviews?|comments?|related|ähnliche rezepte|ähnliche artikel|quelle|source|equipment|ausrüstung|hinweise|variationen|aufbewahrung|werbung|mehr|produkte|produkte empfehlen)(\b|:)/.test(heading)) {
    return 'ignore';
  }
  if (/^#{1,6}\s/.test(line)) return 'ignore';
  return null;
}
