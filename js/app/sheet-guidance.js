export function setupSheetGuidance() {
  const overlay = document.getElementById('sheet-overlay');
  const enhance = () => {
    const dataMenu = overlay.querySelector('#data-export')?.closest('.menu-sheet');
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
      const exportStatus = dataMenu.querySelector('#data-status');
      new MutationObserver(() => {
        if (!exportStatus.textContent.includes('exportiert.')) return;
        const now = new Date().toISOString();
        localStorage.setItem('kochbuch-last-backup-started', now);
        last.textContent = `Letzter Export gestartet: ${new Date(now).toLocaleString('de-DE')}`;
      }).observe(exportStatus, { childList: true, characterData: true, subtree: true });
    }
  };
  new MutationObserver(enhance).observe(overlay, { childList: true, subtree: true, characterData: true });
  enhance();
}
