// schema-helpers.js — Hilfsfunktionen zum Auslesen von schema.org/Recipe-Daten
// (JSON-LD und Microdata).

import { normalizeTags } from '../../core/recipe-model.js';

// recipeCategory/recipeCuisine können String, kommaseparierter String oder
// Array sein. Ergebnis: bereinigte Tag-Liste (max. 5).
export function tagsFromSchema(...values) {
  const parts = [];
  for (const v of values) {
    if (!v) continue;
    const list = Array.isArray(v) ? v : [v];
    for (const item of list) parts.push(...String(item).split(/[,;]/));
  }
  return normalizeTags(parts).slice(0, 5);
}

export function firstOf(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

export function imageUrl(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return imageUrl(img[0]);
  if (img.url) return img.url;
  return null;
}

export function parseServings(y) {
  if (!y) return null;
  const str = Array.isArray(y) ? y[0] : y;
  const match = String(str).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// z.B. "PT30M" -> 30
export function parseIsoDuration(iso) {
  if (!iso) return null;
  const match = String(iso).match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const minutes = parseInt(match[3] || '0', 10);
  return days * 1440 + hours * 60 + minutes || null;
}

export function flattenInstructions(instructions) {
  if (!instructions) return [];
  if (typeof instructions === 'string') {
    return instructions.split(/\n+/).map(s => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(instructions)) return [];
  const steps = [];
  for (const item of instructions) {
    if (typeof item === 'string') { steps.push(item); continue; }
    if (!item || typeof item !== 'object') continue;
    const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
    if (types.includes('HowToSection') && Array.isArray(item.itemListElement)) {
      steps.push(...flattenInstructions(item.itemListElement));
      continue;
    }
    if (typeof item.text === 'string') steps.push(item.text);
  }
  return steps.map(step => step.trim()).filter(Boolean);
}
