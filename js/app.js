// app.js — Einstiegspunkt: Router starten, Kopfzeilen-Buttons verdrahten,
// Service Worker registrieren.

import { initRouter } from './router.js';
import { openAddMenu } from './sheets/add-menu.js';
import { openDataMenu } from './sheets/data-menu.js';
import { renderOverview } from './views/overview.js';

disablePageZoom();
initRouter();

document.getElementById('btn-add').addEventListener('click', openAddMenu);
setupConnectionStatus();
setupSheetGuidance();

document.getElementById('btn-data-menu').addEventListener('click', () => {
  openDataMenu(() => {
    if (location.hash === '' || location.hash === '#') renderOverview();
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Fähigkeit optional */ });
  });
}


function setupConnectionStatus() {
  const status = document.createElement('p');
  status.id = 'connection-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'width:min(100%,980px);margin:0 auto;padding:6px 22px;background:var(--surface);color:var(--ink-soft);font-size:.8rem';
  const header = document.querySelector('.topbar');
  header.insertAdjacentElement('afterend', status);

  const update = () => {
    const connection = navigator.onLine ? 'Online' : 'Offline';
    status.textContent = navigator.onLine
      ? `${connection} · App-Inhalte sind für Offline-Nutzung eingerichtet`
      : `${connection} · OCR benötigt zuvor geladene Engine und Sprachdaten; Verfügbarkeit nicht prüfbar`;
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function setupSheetGuidance() {
  const overlay = document.getElementById('sheet-overlay');
  const enhance = () => {
    const dataMenu = overlay.querySelector('.menu-sheet');
    if (dataMenu && !dataMenu.querySelector('#backup-guidance')) {
      dataMenu.style.height = 'auto';
      const title = dataMenu.querySelector('h2');
      title.textContent = 'Sichern & wiederherstellen';
      const guidance = document.createElement('p');
      guidance.id = 'backup-guidance';
      guidance.className = 'hint';
      guidance.textContent = 'Der Export speichert eine JSON-Datei auf deinem Gerät. Beim Wiederherstellen werden neue Rezepte ergänzt und Rezepte mit gleicher ID aktualisiert; andere Rezepte bleiben erhalten.';
      title.after(guidance);
      dataMenu.querySelector('#data-export span').textContent = 'Sicherung exportieren';
      dataMenu.querySelector('#data-import span').textContent = 'Sicherung wiederherstellen';
      const last = document.createElement('p');
      last.id = 'backup-last';
      last.className = 'hint';
      const saved = localStorage.getItem('kochbuch-last-backup-started');
      last.textContent = saved ? `Letzter Export gestartet: ${new Date(saved).toLocaleString('de-DE')}` : 'Noch kein Export auf diesem Gerät gestartet.';
      guidance.after(last);
      dataMenu.querySelector('#data-status').addEventListener('DOMSubtreeModified', () => {
        const text = dataMenu.querySelector('#data-status').textContent;
        if (text.includes('exportiert.')) {
          const now = new Date().toISOString();
          localStorage.setItem('kochbuch-last-backup-started', now);
          last.textContent = `Letzter Export gestartet: ${new Date(now).toLocaleString('de-DE')}`;
        }
      });
    }

    const scanStatus = overlay.querySelector('#scan-status');
    if (scanStatus && !overlay.querySelector('#scan-ocr-availability')) {
      const info = document.createElement('p');
      info.id = 'scan-ocr-availability';
      info.className = 'hint';
      const update = () => {
        if (!navigator.onLine) {
          info.textContent = 'Offline: Ein Scan klappt nur, wenn Engine und deutsche Sprachdaten bereits verfügbar sind. Das lässt sich vorab nicht zuverlässig prüfen.';
        } else if (globalThis.Tesseract?.createWorker) {
          info.textContent = 'Online · OCR-Engine geladen. Die Sprachdaten werden beim Scan geprüft.';
        } else {
          info.textContent = 'Online · Beim ersten Scan werden OCR-Engine und Sprachdaten aus dem Internet geladen.';
        }
      };
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      scanStatus.before(info);
      update();
    }
  };
  new MutationObserver(enhance).observe(overlay, { childList: true, subtree: true, characterData: true });
  enhance();
}

function disablePageZoom() {
  let lastTap = null;
  let touchMoved = false;

  document.addEventListener('touchstart', event => {
    if (event.touches.length === 1) touchMoved = false;
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener('touchmove', event => {
    touchMoved = true;
    lastTap = null;
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener('touchend', event => {
    if (touchMoved) {
      lastTap = null;
      return;
    }
    if (event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const now = Date.now();
    if (lastTap && now - lastTap.time < 350
        && Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 32) {
      // Interaktive Ziele müssen ihren Click auch bei schnellen Tipps erhalten.
      if (event.target.closest('button, a, input, select, textarea, [role="button"]')) {
        lastTap = null;
        return;
      }
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
      lastTap = null;
      return;
    }
    lastTap = { time: now, x: touch.clientX, y: touch.clientY };
  }, { capture: true, passive: false });

  document.addEventListener('gesturestart', event => {
    if (event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener('gesturechange', event => {
    if (event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener('dblclick', event => event.preventDefault(), true);
}
