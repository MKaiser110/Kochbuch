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

    node.querySelector('#url-fetch-btn').addEventListener('click', async () => {
      const url = input.value.trim();
      if (!url) return;
      status.textContent = 'Importiere … (versuche mehrere Wege, kann 10–20 Sek. dauern)';
      fallback.hidden = true;
      try {
        const recipe = await importFromUrl(url);
        status.textContent = 'Gefunden — bitte prüfen und speichern.';
        closeSheet();
        openFormWithDraft(recipe);
      } catch (err) {
        if (err && err.message === 'INVALID_URL') {
          status.textContent = 'Bitte eine gültige Rezeptadresse mit http oder https eingeben.';
          return;
        }
        status.textContent = 'Kein vollständiges Rezept erkannt — bitte Seiteninhalt einfügen und prüfen.';
        fallback.hidden = false;
        fallback.open = true;
        // Falls wenigstens über den Reader-Fallback Text geholt werden konnte,
        // direkt vorausfüllen — erspart erneutes Kopieren.
        if (err && err.partialText) {
          fallbackText.value = err.partialText;
        }
      }
    });

    node.querySelector('#url-fallback-parse').addEventListener('click', () => {
      const text = fallbackText.value;
      const sourceUrl = input.value.trim();
      // Eingefügter Inhalt kann HTML (Seitenquelltext) oder reiner Text sein
      // (z.B. per "Alles auswählen" kopiert, oder vom Reader-Fallback vorbefüllt).
      // Erst als HTML versuchen, dann als Fließtext.
      const recipe = extractFromHtml(text, sourceUrl) || extractFromReaderText(text, sourceUrl);
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
