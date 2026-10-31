// data-menu.js — Sheet für Export und Import von Rezepten (JSON-Dateien).

import { openSheet, closeSheet } from './sheet.js';
import {
  exportRecipesToFile,
  importRecipeFromFile,
  importRecipesFromFile,
} from '../services/export-import.js';

/** @param {() => void} onImported  wird nach erfolgreichem Import aufgerufen */
export function openDataMenu(onImported) {
  openSheet('tpl-data-menu', node => {
    const status = node.querySelector('#data-status');

    node.querySelector('#data-export').addEventListener('click', async () => {
      status.textContent = 'Exportiere …';
      try {
        const count = await exportRecipesToFile();
        status.textContent = `${count} Rezept(e) exportiert.`;
      } catch {
        status.textContent = 'Export fehlgeschlagen.';
      }
    });

    async function importFile(input, importer) {
      const file = input.files[0];
      if (!file) return;
      status.textContent = 'Importiere …';
      try {
        const { imported, skipped, duplicatesSkipped, total } = await importer(
          file,
          async count => confirm(
            `${count} Rezept(e) in der Datei scheinen bereits vorhanden zu sein (gleicher Titel oder gleiche Quelle).\n\n` +
            'OK = trotzdem importieren\nAbbrechen = diese überspringen'
          )
        );
        const notes = [];
        if (duplicatesSkipped) notes.push(`${duplicatesSkipped} Duplikat(e) übersprungen`);
        if (skipped) notes.push(`${skipped} ungültig`);
        status.textContent = notes.length
          ? `${imported} von ${total} importiert (${notes.join(', ')}).`
          : `${imported} Rezept(e) importiert.`;
        onImported();
      } catch (err) {
        status.textContent = err.message === 'INVALID_JSON' || err.message === 'INVALID_FORMAT'
          ? 'Datei hat kein gültiges Kochbuch-Format.'
          : 'Import fehlgeschlagen.';
      } finally {
        input.value = '';
      }
    }

    const allRecipesInput = node.querySelector('#data-import-file');
    const singleRecipeInput = node.querySelector('#data-import-single-file');
    node.querySelector('#data-import').addEventListener('click', () => allRecipesInput.click());
    node.querySelector('#data-import-single').addEventListener('click', () => singleRecipeInput.click());
    allRecipesInput.addEventListener('change', () => importFile(allRecipesInput, importRecipesFromFile));
    singleRecipeInput.addEventListener('change', () => importFile(singleRecipeInput, importRecipeFromFile));

    node.querySelector('#data-cancel').addEventListener('click', closeSheet);
  });
}
