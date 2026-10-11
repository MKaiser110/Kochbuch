// pdf-export.js — erzeugt aus einem Rezept ein PDF (A4) und bietet es über
// das System-Share-Sheet (iOS: "In Dateien sichern", Drucken, AirDrop …) oder
// als Download (Desktop) an. jsPDF liegt lokal unter js/vendor/ und wird vom
// Service Worker gecacht, der Export funktioniert also auch offline.

import { scaleIngredients, formatAmount } from './scaling.js';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const FOOTER_SPACE = 12;

let jsPdfPromise = null;

function loadJsPdf() {
  if (globalThis.jspdf && globalThis.jspdf.jsPDF) return Promise.resolve(globalThis.jspdf.jsPDF);
  if (jsPdfPromise) return jsPdfPromise;
  jsPdfPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'js/vendor/jspdf.umd.min.js';
    script.onload = () => resolve(globalThis.jspdf.jsPDF);
    script.onerror = () => { jsPdfPromise = null; reject(new Error('JSPDF_LOAD_FAILED')); };
    document.head.appendChild(script);
  });
  return jsPdfPromise;
}

function loadImageSize(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Lädt alles, was für den Export asynchron nötig ist (Bibliothek, Bildgröße).
 * Wird schon beim Öffnen der Detailseite angestoßen, damit der Klick auf
 * "PDF" danach ohne Wartezeit ins Share-Sheet führt — Safari verlangt, dass
 * navigator.share() zeitnah nach der Tipp-Geste aufgerufen wird.
 */
export async function preparePdfAssets(recipe) {
  const JsPDF = await loadJsPdf();
  let image = null;
  // Nur eingebettete Bilder (DataURL, JPEG/PNG). Externe Bild-URLs lassen sich
  // wegen CORS nicht zuverlässig einbetten und werden weggelassen.
  const m = /^data:image\/(jpeg|jpg|png);/i.exec(recipe.image || '');
  if (m) {
    const size = await loadImageSize(recipe.image);
    if (size) image = { dataUrl: recipe.image, format: m[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG', ...size };
  }
  return { JsPDF, image };
}

// Die eingebauten PDF-Schriften (Helvetica) decken Latin-1 + einige Windows-
// Zeichen ab (Umlaute, ß, ½ …). Alles andere (Emoji, Pfeile …) wird entfernt,
// sonst erscheinen im PDF Zeichensalat-Platzhalter.
const EXTRA_OK = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function sanitize(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u202F\u2009]/g, ' ')
    .split('')
    .filter(ch => ch.charCodeAt(0) <= 0xFF || EXTRA_OK.includes(ch))
    .join('');
}

/**
 * Baut das PDF-Dokument. Reine Funktion ohne DOM-Zugriff (testbar).
 * @param JsPDF  jsPDF-Konstruktor
 * @param recipe Rezept im einheitlichen Format
 * @param opts   { servings, image }  image = { dataUrl, format, width, height } | null
 */
export function buildRecipePdf(JsPDF, recipe, opts = {}) {
  const servings = opts.servings || recipe.servingsBase;
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  let y = MARGIN;

  const ensureSpace = needed => {
    if (y + needed > PAGE_H - MARGIN - FOOTER_SPACE + 8) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const writeWrapped = (text, x, width, lineHeight) => {
    const lines = doc.splitTextToSize(sanitize(text), width);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, x, y);
      y += lineHeight;
    }
    return lines.length;
  };

  // Titel
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(43, 43, 43);
  y += 7;
  writeWrapped(recipe.title, MARGIN, CONTENT_W, 9);

  // Meta-Zeile: Tags · Zeit · Portionen
  const meta = [];
  if (recipe.tags && recipe.tags.length) meta.push(recipe.tags.join(', '));
  if (recipe.prepTime) meta.push(`${recipe.prepTime} Min.`);
  meta.push(`${servings} ${servings === 1 ? 'Portion' : 'Portionen'}`);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  y += 1;
  writeWrapped(meta.join('  ·  '), MARGIN, CONTENT_W, 5);

  if (recipe.source) {
    doc.setFontSize(8.5);
    y += 0.5;
    writeWrapped(`Quelle: ${recipe.source}`, MARGIN, CONTENT_W, 4.2);
  }
  y += 4;

  // Bild (optional), Höhe auf 70 mm begrenzt, Seitenverhältnis bleibt erhalten
  if (opts.image) {
    const { dataUrl, format, width, height } = opts.image;
    let w = CONTENT_W;
    let h = (height / width) * w;
    const maxH = 70;
    if (h > maxH) { h = maxH; w = (width / height) * h; }
    ensureSpace(h + 6);
    try {
      doc.addImage(dataUrl, format, MARGIN, y, w, h);
      y += h + 6;
    } catch {
      // Bild nicht einbettbar -> ohne Bild weiter
    }
  }

  const sectionHeader = label => {
    ensureSpace(14);
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(43, 43, 43);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 2;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;
  };

  // Zutaten (mit der gewählten Portionenzahl skaliert)
  sectionHeader('Zutaten');
  const AMOUNT_COL = 34;
  const scaled = scaleIngredients(recipe.ingredients, recipe.servingsBase, servings);
  doc.setFontSize(10.5);
  for (const ing of scaled) {
    const amount = sanitize(formatAmount(ing.amount, ing.unit));
    const nameLines = doc.splitTextToSize(sanitize(ing.name), CONTENT_W - AMOUNT_COL);
    const rowH = nameLines.length * 5.2;
    ensureSpace(rowH + 2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(43, 43, 43);
    doc.text(amount, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    nameLines.forEach((line, i) => doc.text(line, MARGIN + AMOUNT_COL, y + i * 5.2));
    y += rowH + 0.8;
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y - 3.6, PAGE_W - MARGIN, y - 3.6);
    y += 1.2;
  }
  if (scaled.length === 0) {
    doc.setTextColor(140, 140, 140);
    doc.text('Keine Zutaten angegeben.', MARGIN, y);
    y += 6;
  }

  // Zubereitung
  y += 3;
  sectionHeader('Zubereitung');
  doc.setFontSize(10.5);
  recipe.steps.forEach((step, i) => {
    const lines = doc.splitTextToSize(sanitize(step), CONTENT_W - 9);
    ensureSpace(Math.min(lines.length, 2) * 5.4 + 2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(43, 43, 43);
    doc.text(`${i + 1}.`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    for (const line of lines) {
      ensureSpace(5.4);
      doc.text(line, MARGIN + 9, y);
      y += 5.4;
    }
    y += 2.4;
  });
  if (recipe.steps.length === 0) {
    doc.setTextColor(140, 140, 140);
    doc.text('Keine Zubereitungsschritte angegeben.', MARGIN, y);
  }

  // Fußzeile auf jeder Seite
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(sanitize(recipe.title).slice(0, 70), MARGIN, PAGE_H - 12);
    doc.text(`Seite ${p} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 12, { align: 'right' });
  }

  return doc;
}

function fileSlug(title) {
  const base = String(title || 'rezept')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'rezept';
}

/**
 * Erzeugt das PDF und gibt es aus.
 * @returns {'shared'|'downloaded'|'cancelled'}
 */
export async function exportRecipePdf(recipe, servings, preparedPromise) {
  const { JsPDF, image } = await (preparedPromise || preparePdfAssets(recipe));
  const doc = buildRecipePdf(JsPDF, recipe, { servings, image });
  const blob = doc.output('blob');
  const filename = `rezept-${fileSlug(recipe.title)}.pdf`;
  const file = new File([blob], filename, { type: 'application/pdf' });

  // Mobil: Share-Sheet mit Datei (iOS: "In Dateien sichern", Drucken, Mail …)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: recipe.title });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // anderer Fehler (z.B. Geste abgelaufen) -> Download-Fallback
    }
  }

  // Desktop / Fallback: normaler Download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
