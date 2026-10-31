// ocr-import.js — Texterkennung aus Foto über Tesseract.js (browserbasiert,
// läuft komplett lokal/offline nach erstem Laden, kein Server nötig).
// Tesseract.js wird erst beim ersten Scan nachgeladen.

import { blankRecipe } from '../core/recipe-model.js';
import { parseIngredientLine } from './recipe-import/ingredient-parser.js';
import { normalizeImportedRecipe } from './recipe-import/normalize.js';
import { loadImageFromFile, MAX_IMAGE_FILE_SIZE } from './image-utils.js';

const TESSERACT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const OCR_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0_best';
let tesseractPromise = null;
const MAX_IMAGE_DIMENSION = 2800;
const MIN_IMAGE_DIMENSION = 1600;


export async function recognizeImage(file, onProgress) {
  if (!file || (file.type && !file.type.startsWith('image/')) || file.size > MAX_IMAGE_FILE_SIZE) {
    throw new Error('INVALID_IMAGE');
  }
  const tesseract = await loadTesseract();
  const image = await prepareImage(file);
  const worker = await tesseract.createWorker('deu+eng', 1, {
    langPath: OCR_LANG_PATH,
    logger: m => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '1',
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}


/** Lädt Tesseract nur bei Bedarf; fehlgeschlagene Downloads können erneut versucht werden. */
function loadTesseract() {
  if (globalThis.Tesseract?.createWorker) return Promise.resolve(globalThis.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TESSERACT_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (globalThis.Tesseract?.createWorker) resolve(globalThis.Tesseract);
        else {
          script.remove();
          reject(new Error('OCR_UNAVAILABLE'));
        }
      };
      script.onerror = () => {
        script.remove();
        reject(new Error('OCR_UNAVAILABLE'));
      };
      document.head.appendChild(script);
    }).catch(error => {
      tesseractPromise = null;
      throw error;
    });
  }
  return tesseractPromise;
}

/** Skaliert das Foto und erhöht den Kontrast (Graustufen), damit Tesseract besser liest. */
async function prepareImage(file) {
  const image = await loadImageFromFile(file);

  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  const shortest = Math.min(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(
    MAX_IMAGE_DIMENSION / longest,
    MIN_IMAGE_DIMENSION / shortest,
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('OCR_CANVAS_UNAVAILABLE');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = 0.299 * pixels.data[i]
      + 0.587 * pixels.data[i + 1]
      + 0.114 * pixels.data[i + 2];
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.25 + 128));
    pixels.data[i] = contrasted;
    pixels.data[i + 1] = contrasted;
    pixels.data[i + 2] = contrasted;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/**
 * Sehr einfache Heuristik, um erkannten Fließtext in Titel / Zutaten /
 * Schritte zu gliedern. OCR-Text ist unzuverlässig — das Ergebnis ist
 * bewusst nur ein Entwurf, den der Nutzer vor dem Speichern in der
 * Rezept-Maske korrigiert.
 */
export function draftRecipeFromOcrText(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const recipe = blankRecipe();
  if (!lines.length) return normalizeImportedRecipe(recipe);

  const sections = { ingredients: [], steps: [], description: [] };
  let section = 'description';
  for (const original of lines) {
    const line = original.replace(/^[-*•]\s*/, '').trim();
    const heading = ocrSection(line);
    if (heading) { section = heading; continue; }
    const servings = line.match(/(?:für\s*|makes?\s*|serves?\s*)?(\d{1,3})\s*(?:portionen|personen|servings?|yield)/i)
      || line.match(/(?:portionen|personen|servings?|yield)\s*[:\-]?\s*(\d{1,3})/i);
    if (servings) { recipe.servingsBase = Number(servings[1]); recipe.servingsKnown = true; }
    const time = line.match(/(?:gesamtzeit|zubereitungszeit|prep(?:aration)?\s*time|total\s*time)\s*[:\-]?\s*(\d+)\s*(?:min(?:uten?)?|hours?|stunden?)?/i);
    if (time) {
      const minutes = Number(time[1]) * (/hour|stund/i.test(line) ? 60 : 1);
      if (/gesamt|total/i.test(line)) recipe.prepTime = minutes;
    }
    if (isMetadataLine(line)) continue;
    const item = line.replace(/^\d{1,2}[.)]\s*/, '').trim();
    if (!item) continue;
    if (section === 'ingredients') sections.ingredients.push(item);
    else if (section === 'steps') sections.steps.push(item);
    else sections.description.push(item);
  }

  recipe.title = sections.description.shift() || lines[0];
  recipe.ingredients = sections.ingredients.map(parseIngredientLine).filter(item => item.name);
  let inferred = { ingredients: [], steps: [] };
  if (!recipe.ingredients.length) {
    inferred = inferSteps(sections.description);
    recipe.ingredients = inferred.ingredients;
  }
  recipe.steps = sections.steps.length ? sections.steps : inferred.steps;
  recipe.importWarnings = [];
  if (!recipe.ingredients.length) recipe.importWarnings.push('Zutatenliste nicht eindeutig erkannt');
  if (!recipe.steps.length) recipe.importWarnings.push('Zubereitung nicht eindeutig erkannt');
  recipe.reviewRequired = true;
  return normalizeImportedRecipe(recipe);
}

function ocrSection(line) {
  const value = line.replace(/^#+\s*/, '').replace(/[:：]$/, '').toLocaleLowerCase('de');
  if (/^(zutaten|ingredients|was du brauchst|einkaufsliste)(\b|\s)/.test(value)) return 'ingredients';
  if (/^(zubereitung|anleitung|so geht'?s|schritte|instructions?|directions?|method|preparation)(\b|\s)/.test(value)) return 'steps';
  if (/^(notizen|tipps|nährwerte|naehrwerte|nutrition|variationen|aufbewahrung|quelle)(\b|\s)/.test(value)) return 'ignore';
  return null;
}

function isMetadataLine(line) {
  return /(?:gesamtzeit|zubereitungszeit|prep(?:aration)?\s*time|total\s*time|portionen|personen|servings|schwierigkeit|difficulty)\s*[:\-]?\s*\d+/i.test(line)
    || /(?:für\s*|makes?\s*|serves?\s*)\d{1,3}\s*(?:portionen|personen|servings?)/i.test(line);
}

function inferSteps(lines) {
  const ingredientPattern = /^(?:[≈~]?\s*)?(?:\d|½|¼|¾|⅓|⅔|⅛|⅜|⅝|⅞|eine?\s+prise|nach bedarf|etwas\b)/i;
  const ingredients = [];
  const steps = [];
  for (const line of lines) {
    if (ingredientPattern.test(line) && line.length < 100) ingredients.push(parseIngredientLine(line));
    else if (/\b(mischen|zugeben|hinzufügen|erhitzen|backen|kochen|schneiden|braten|rühren|servieren|mix|add|bake|cook|stir|serve)\b/i.test(line)) steps.push(line);
    else if (!ingredients.length) steps.push(line);
  }
  return {
    ingredients,
    steps: steps.map(line => line.replace(/^(?:zubereitung|anleitung)\s*[:\-]?\s*/i, '')).filter(Boolean),
  };
}
