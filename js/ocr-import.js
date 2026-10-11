// ocr-import.js — Texterkennung aus Foto über Tesseract.js (browserbasiert,
// läuft komplett lokal/offline nach erstem Laden, kein Server nötig).
// Tesseract.js wird als globales Script in index.html eingebunden.

import { blankRecipe } from './db.js';
import { parseIngredientLine } from './recipe-import.js';

const OCR_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0_best';
const MAX_IMAGE_DIMENSION = 2800;
const MIN_IMAGE_DIMENSION = 1600;

export async function recognizeImage(file, onProgress) {
  const image = await prepareImage(file);
  const worker = await Tesseract.createWorker('deu', 1, {
    langPath: OCR_LANG_PATH,
    logger: m => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '3',
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
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
      if (!context) {
        reject(new Error('OCR_CANVAS_UNAVAILABLE'));
        return;
      }
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
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('IMAGE_DECODE_FAILED'));
    };
    image.src = objectUrl;
  });
}

/**
 * Sehr einfache Heuristik, um erkannten Fließtext in Titel / Zutaten /
 * Schritte zu gliedern. OCR-Text ist unzuverlässig — das Ergebnis ist
 * bewusst nur ein Entwurf, den der Nutzer vor dem Speichern in der
 * Rezept-Maske korrigiert.
 */
export function draftRecipeFromOcrText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const r = blankRecipe();
  if (lines.length === 0) return r;

  r.title = lines[0];

  const ingredientLineRe = /^[\d½¼¾]/;
  const ingredients = [];
  const stepLines = [];

  for (const line of lines.slice(1)) {
    if (ingredientLineRe.test(line) && line.length < 60) {
      ingredients.push(parseIngredientLine(line));
    } else {
      stepLines.push(line);
    }
  }

  r.ingredients = ingredients;
  // Zubereitungstext zu Schritten zusammenfassen (an Satzenden trennen)
  const joined = stepLines.join(' ');
  r.steps = joined.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/).map(s => s.trim()).filter(Boolean);
  if (r.steps.length === 0 && stepLines.length) r.steps = stepLines;

  return r;
}
