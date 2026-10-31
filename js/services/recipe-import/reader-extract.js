// reader-extract.js — Rezept-Extraktion aus reinem Text (Reader-Dienst oder
// manuell eingefügter Seitentext), wenn kein strukturiertes Markup vorliegt.

import { blankRecipe } from '../../core/recipe-model.js';
import { parseIngredientLine } from './ingredient-parser.js';
import { isUsableRecipe, isLikelyIngredient, isLikelyStep } from './validation.js';
import { normalizeImportedRecipe } from './normalize.js';

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
  if (!r.title || !/^[\wÄÖÜäöü\s&()\-/:,.'"/]{3,140}$/.test(r.title) || /^(home|startseite|search|suche|about|kontakt|impressum|datenschutz|privacy|page|homepage|category|tags?)$/i.test(r.title)) {
    return null;
  }
  if (isEditorialHeadline(r.title)) r.title = titleFromSourceUrl(sourceUrl) || r.title;
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

    const servings = line.match(/(?:für\s*)?(\d{1,3})\s*(?:portionen|personen|servings?)/i)
      || line.match(/(?:portionen|personen|servings?)\s*[:\-]?\s*(\d{1,3})/i);
    if (servings) { r.servingsBase = Number(servings[1]); r.servingsKnown = true; }
    const time = line.match(/(?:total|gesamt(?:zeit)?)[^\d]{0,16}(\d{1,3})\s*(?:min(?:uten?)?|hours?|stunden?)/i);
    if (time) r.prepTime = Number(time[1]) * (/hour|stund/i.test(line) ? 60 : 1);

    const item = line.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').replace(/^\[x\]\s*/i, '')
      .replace(/^step\s+\d+\s*/i, '').replace(/\*{1,2}/g, '').trim();
    if (!item || /^https?:\/\//i.test(item) || /^(?:published(?: time)?|updated(?: time)?|author|image|source|copyright|teilen|bewerten|kommentare)\s*:/i.test(item)) continue;

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
  r.reviewRequired = true;
  r.importWarnings = ['Rezept aus Seitentext heuristisch erkannt; bitte Zutaten und Schritte mit der Quelle vergleichen'];

  const normalized = normalizeImportedRecipe(r);
  return isUsableRecipe(normalized) ? normalized : null;
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

function isEditorialHeadline(title) {
  return title.length > 75 || /\b(?:we(?:'|’)ve tried|hands[- ]down|you(?:'|’)ll never|this is the best)\b/i.test(title);
}

function titleFromSourceUrl(sourceUrl) {
  try {
    const slug = new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1)?.replace(/\.[a-z0-9]+$/i, '');
    if (!slug) return '';
    const title = slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return title.length >= 3 && title.length <= 90 ? title[0].toLocaleUpperCase() + title.slice(1) : '';
  } catch {
    return '';
  }
}
