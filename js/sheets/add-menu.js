// add-menu.js — Auswahl-Sheet "Rezept hinzufügen" (URL, Scan, manuell).

import { openSheet, closeSheet } from './sheet.js';
import { openUrlImport } from './url-import.js';
import { openScanImport } from './scan-import.js';

export function openAddMenu() {
  openSheet('tpl-add-menu', node => {
    node.querySelector('#add-via-url').addEventListener('click', () => openUrlImport());
    node.querySelector('#add-via-scan').addEventListener('click', () => openScanImport());
    node.querySelector('#add-via-manual').addEventListener('click', () => {
      closeSheet();
      location.hash = 'new';
    });
    node.querySelector('#add-cancel').addEventListener('click', closeSheet);
  });
}
