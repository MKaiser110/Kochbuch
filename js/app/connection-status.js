export function setupConnectionStatus() {
  const status = document.createElement('p');
  status.id = 'connection-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  document.querySelector('.topbar').insertAdjacentElement('afterend', status);

  const update = () => {
    const onStartScreen = !location.hash || location.hash === '#';
    status.hidden = navigator.onLine || !onStartScreen;
    if (!status.hidden) {
      const ocrUsable = Boolean(globalThis.Tesseract?.createWorker);
      status.textContent = ocrUsable
        ? 'Offline · Buchseiten scannen ist verfügbar'
        : 'Offline · Buchseiten scannen ist nicht verfügbar';
    }
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  window.addEventListener('hashchange', update);
  update();
}
