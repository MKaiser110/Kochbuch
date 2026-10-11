// sync-adapter.js
//
// Architektur-Ansatzpunkt für einen späteren Sync-Layer (z.B. iCloud via
// CloudKit JS, oder ein eigener Server). db.js ruft bei jeder Änderung
// push()/delete() auf diesem Adapter auf, unabhängig davon, ob ein
// echter Sync aktiv ist. Solange nichts anderes gesetzt ist, ist der
// Adapter ein No-Op — reines Local-First-Verhalten.
//
// Um später Sync zu ergänzen: eine Klasse mit derselben Schnittstelle
// implementieren (push, delete, pull, onRemoteChange) und über
// setSyncAdapter() aktivieren. db.js und die UI müssen dafür nicht
// geändert werden.

class NullSyncAdapter {
  async push(_recipe) { /* no-op */ }
  async delete(_id) { /* no-op */ }
  async pull() { return []; }
  onRemoteChange(_callback) { /* no-op: nie aufgerufen ohne echten Adapter */ }
  get status() { return 'local-only'; }
}

export let syncAdapter = new NullSyncAdapter();

export function setSyncAdapter(adapter) {
  syncAdapter = adapter;
}
