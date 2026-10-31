// image-utils.js — Bilder laden und vor dem Speichern in IndexedDB
// verkleinern/komprimieren. Ohne das würden Originalfotos (oft mehrere MB)
// die Datenbank schnell aufblähen; als DataURL skaliert auf vernünftige
// Anzeigegröße bleibt jedes Bild im Bereich weniger hundert KB.

export const MAX_IMAGE_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
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
  if (!file || file.size > MAX_IMAGE_FILE_SIZE) throw new Error('IMAGE_TOO_LARGE');
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
  const context = canvas.getContext('2d');
  if (!context) throw new Error('IMAGE_PROCESSING_FAILED');
  context.drawImage(img, 0, 0, width, height);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('IMAGE_PROCESSING_FAILED');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('IMAGE_PROCESSING_FAILED'));
    reader.readAsDataURL(blob);
  });
}

/** Komprimiert ein Bild; bei Fehlern wird kein unkomprimiertes Original gespeichert. */
export async function imageFileToDataUrl(file) {
  try {
    return await compressImageToDataUrl(file);
  } catch (error) {
    if (error?.message === 'IMAGE_TOO_LARGE') throw error;
    throw new Error('IMAGE_PROCESSING_FAILED');
  }
}
