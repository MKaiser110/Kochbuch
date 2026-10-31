// url-import.js — Sheet "Rezept von Webseite importieren" inkl. manuellem Fallback.

import { openSheet, closeSheet } from './sheet.js';
import { importFromUrl, extractFromHtml, extractFromReaderText } from '../services/recipe-import/index.js';
import { openFormWithDraft } from '../state.js';

export function openUrlImport() {
  openSheet('tpl-url-import', node => {
    const input = node.querySelector('#url-input');
    const status = node.querySelector('#url-status');
    const fallback = node.querySelector('#url-fallback');
    const fallbackText = node.querySelector('#url-fallback-text');

    const fetchButton = node.querySelector('#url-fetch-btn');
    fetchButton.addEventListener('click', async () => {
      const url = input.value.trim();
      if (!url) {
        status.textContent = 'Bitte zuerst eine Rezept-URL eingeben.';
        input.focus();
        return;
      }
      fetchButton.disabled = true;
      status.textContent = 'Importiere Rezept …';
      fallback.hidden = true;
      try {
        const recipe = await importFromUrl(url);
        closeSheet();
        openFormWithDraft(recipe);
      } catch (err) {
        if (err?.message === 'INVALID_URL') {
          status.textContent = 'Bitte eine gültige öffentliche http- oder https-Adresse eingeben.';
          return;
        }
        status.textContent = 'Kein vollständiges Rezept erkannt. Du kannst den Seiteninhalt unten einfügen.';
        fallback.hidden = false;
        fallback.open = true;
        if (err?.partialText) fallbackText.value = err.partialText;
      } finally {
        fetchButton.disabled = false;
      }
    });

    node.querySelector('#url-fallback-parse').addEventListener('click', () => {
      const text = fallbackText.value;
      const sourceUrl = input.value.trim();
      // Eingefügter Inhalt kann HTML (Seitenquelltext) oder reiner Text sein
      // (z.B. per "Alles auswählen" kopiert, oder vom Reader-Fallback vorbefüllt).
      // Erst als HTML versuchen, dann als Fließtext.
      const recipe = (/<[a-z][\\s\\S]*>/i.test(text) ? extractFromHtml(text, sourceUrl) : null)
        || extractFromReaderText(text, sourceUrl)
        || extractFromHtml(text, sourceUrl);
      if (recipe) {
        closeSheet();
        openFormWithDraft(recipe);
      } else {
        // Kein strukturiertes Recipe-Schema im eingefügten Inhalt gefunden ->
        // leeres Formular öffnen, Nutzer trägt es manuell ein.
        alert('Konnte keine strukturierten Rezeptdaten finden. Bitte manuell eingeben.');
        closeSheet();
        location.hash = 'new';
      }
    });
  });
}
