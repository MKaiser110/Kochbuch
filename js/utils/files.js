// files.js — Datei-Hilfen: Download auslösen, JSON-Dateien lesen, Bilder als DataURL.

/** Löst den Browser-Download eines Blobs aus. */
export function downloadBlob(blob, filename, { revokeDelayMs = 0 } = {}) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revokeDelayMs > 0) setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs);
  else URL.revokeObjectURL(url);
}

/** Lädt ein Objekt als formatierte JSON-Datei herunter. */
export function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

/** Liest eine JSON-Datei. Wirft 'INVALID_JSON', wenn der Inhalt nicht parsebar ist. */
export async function readJsonFile(file) {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
