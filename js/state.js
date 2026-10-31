// state.js — Zustand, der Navigationen überdauert.

/** Filter und Sortierung der Übersicht (bleiben beim Wechsel Detail -> Übersicht erhalten). */
export const overviewState = {
  search: '',               // Suchtext, bereits kleingeschrieben
  tag: null,                // aktiver Tag oder null
  sort: 'added',            // 'added' | 'alpha' | 'favorites'
  ingredients: new Set(),   // aktiver Zutatenfilter (leer = aus)
};

// Vorbefülltes Rezept aus einem Import, das das Formular beim Öffnen übernimmt.
let formDraft = null;

/** Öffnet das "Neues Rezept"-Formular, vorbefüllt mit einem importierten Entwurf. */
export function openFormWithDraft(recipe) {
  formDraft = recipe;
  location.hash = 'new';
}

/** Liefert den Entwurf genau einmal (danach null). */
export function takeFormDraft() {
  const draft = formDraft;
  formDraft = null;
  return draft;
}
