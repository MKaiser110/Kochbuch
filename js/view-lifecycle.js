// view-lifecycle.js — Lebenszyklus der aktuellen Ansicht.
//
// - Navigationszähler: asynchrone Render-Funktionen prüfen nach jedem await,
//   ob inzwischen woandershin navigiert wurde, und brechen dann ab.
// - Aufräumfunktion der aktuellen Ansicht (z.B. Tastatur-Listener im Kochmodus).

let navigationSeq = 0;
let cleanupView = null;

export function startNavigation() {
  navigationSeq++;
}

export function currentNavigation() {
  return navigationSeq;
}

export function isStale(seq) {
  return seq !== navigationSeq;
}

export function setViewCleanup(fn) {
  cleanupView = fn;
}

export function runViewCleanup() {
  if (cleanupView) {
    cleanupView();
    cleanupView = null;
  }
}
