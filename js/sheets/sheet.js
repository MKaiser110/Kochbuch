// sheet.js — Overlay/Bottom-Sheet: öffnen, schließen, an die sichtbare
// Fläche anpassen (iOS-Tastatur verkleinert den Visual Viewport).

import { cloneTemplate } from '../utils/dom.js';

const overlay = document.getElementById('sheet-overlay');
let visualViewportCleanup = null;

/**
 * Öffnet ein Sheet aus einem <template>.
 * @param {string} templateId
 * @param {(overlayEl: HTMLElement) => void} wire  verdrahtet die Bedienelemente
 */
export function openSheet(templateId, wire) {
  overlay.innerHTML = '';
  overlay.appendChild(cloneTemplate(templateId));
  overlay.hidden = false;
  trackVisualViewport();
  overlay.addEventListener('click', onOverlayClick);
  wire(overlay);
}

export function closeSheet() {
  releaseVisualViewport();
  overlay.hidden = true;
  overlay.innerHTML = '';
  overlay.removeEventListener('click', onOverlayClick);
}

function onOverlayClick(e) {
  if (e.target === overlay) closeSheet();
}

function releaseVisualViewport() {
  if (visualViewportCleanup) {
    visualViewportCleanup();
    visualViewportCleanup = null;
  }
}

function trackVisualViewport() {
  releaseVisualViewport();
  const viewport = window.visualViewport;
  if (!viewport) return;

  const update = () => {
    overlay.style.top = `${viewport.offsetTop}px`;
    overlay.style.height = `${viewport.height}px`;
    overlay.style.bottom = 'auto';
    overlay.style.setProperty(
      '--overlay-content-max-height',
      `${Math.min(viewport.height * 0.88, 820)}px`
    );
  };

  update();
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  visualViewportCleanup = () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    overlay.style.removeProperty('top');
    overlay.style.removeProperty('height');
    overlay.style.removeProperty('bottom');
    overlay.style.removeProperty('--overlay-content-max-height');
  };
}
