// image-utils.js — verkleinert/komprimiert Fotos vor dem Speichern in
// IndexedDB. Ohne das würden Originalfotos (oft mehrere MB) die Datenbank
// schnell aufblähen; als DataURL skaliert auf vernünftige Anzeigegröße
// bleibt jedes Bild im Bereich weniger hundert KB.

const MAX_DIMENSION = 1600; // px, längste Kante
const JPEG_QUALITY = 0.8;

/**
 * @param {File|Blob} file
 * @returns {Promise<string>} komprimierte DataURL (JPEG)
 */
export function compressImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('IMAGE_DECODE_FAILED'));
    };
    img.src = objectUrl;
  });
}
