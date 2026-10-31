// image-utils.js — Bilder laden und vor dem Speichern in IndexedDB
// verkleinern/komprimieren. Ohne das würden Originalfotos (oft mehrere MB)
// die Datenbank schnell aufblähen; als DataURL skaliert auf vernünftige
// Anzeigegröße bleibt jedes Bild im Bereich weniger hundert KB.

import { fileToDataUrl } from '../utils/files.js';

const MAX_DIMENSION = 1600; // px, längste Kante
const JPEG_QUALITY = 0.8;

/**
 * Dekodiert eine Bilddatei zu einem <img>-Element.
 * Wirft 'IMAGE_DECODE_FAILED', wenn das Bild nicht lesbar ist.
 * @param {File|Blob} file
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('IMAGE_DECODE_FAILED'));
    };
    img.src = objectUrl;
  });
}

/**
 * @param {File|Blob} file
 * @returns {Promise<string>} komprimierte DataURL (JPEG)
 */
async function compressImageToDataUrl(file) {
  const img = await loadImageFromFile(file);

  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/** Komprimiert ein Bild; falls das scheitert, wird die Originaldatei als DataURL übernommen. */
export function imageFileToDataUrl(file) {
  return compressImageToDataUrl(file).catch(() => fileToDataUrl(file));
}
