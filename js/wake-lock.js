// wake-lock.js — hält den Bildschirm wach (Kochmodus). Browser können den
// Lock bei Tab-Wechsel/Sperren automatisch freigeben; bei Rückkehr auf die
// Seite wird er hier automatisch erneut angefragt, solange aktiv geschaltet.

let wakeLock = null;
let wantActive = false;

export function isSupported() {
  return 'wakeLock' in navigator;
}

export async function enableWakeLock() {
  wantActive = true;
  if (!isSupported()) return false;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
    return true;
  } catch {
    return false;
  }
}

export async function disableWakeLock() {
  wantActive = false;
  if (wakeLock) {
    try { await wakeLock.release(); } catch { /* bereits freigegeben */ }
    wakeLock = null;
  }
}

export function isActive() {
  return !!wakeLock;
}

document.addEventListener('visibilitychange', async () => {
  if (wantActive && document.visibilityState === 'visible' && !wakeLock) {
    await enableWakeLock();
  }
});
