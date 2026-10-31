// scan-import.js — Sheet "Buchseite scannen": Foto -> OCR -> Rezept-Entwurf.

import { openSheet, closeSheet } from './sheet.js';
import { recognizeImage, draftRecipeFromOcrText } from '../services/ocr-import.js';
import { imageFileToDataUrl } from '../services/image-utils.js';
import { openFormWithDraft } from '../state.js';

export function openScanImport() {
  openSheet('tpl-scan-import', node => {
    const fileInput = node.querySelector('#scan-file');
    const preview = node.querySelector('#scan-preview');
    const status = node.querySelector('#scan-status');

    node.querySelector('#scan-trigger').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      preview.appendChild(img);

      status.textContent = 'Texterkennung läuft … 0%';
      try {
        const text = await recognizeImage(file, pct => { status.textContent = `Texterkennung läuft … ${pct}%`; });
        status.textContent = 'Fertig — bitte Ergebnis prüfen.';
        const recipe = draftRecipeFromOcrText(text);
        recipe.image = await imageFileToDataUrl(file);
        closeSheet();
        openFormWithDraft(recipe);
      } catch (error) {
        if (error?.message === 'INVALID_IMAGE') {
          status.textContent = 'Bitte ein Bild bis maximal 20 MB auswählen.';
        } else if (error?.message === 'OCR_UNAVAILABLE') {
          status.textContent = 'Texterkennung ist nicht verfügbar. Prüfe die Internetverbindung und versuche es erneut.';
        } else {
          status.textContent = 'Texterkennung fehlgeschlagen. Bitte erneut versuchen oder manuell eingeben.';
        }
      }
    });
  });
}
