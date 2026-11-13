// Opens the browser's built-in database (IndexedDB) and gives simple helpers.
// Four "stores" (like drawers) are created now so we never need to rebuild later.
const DB_NAME = 'alpha-db';
const DB_VERSION = 1;
let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('streaks', { keyPath: 'id' });
        const habits = db.createObjectStore('habits', { keyPath: 'id' });
        habits.createIndex('streakId', 'streakId');
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('streakId', 'streakId');
        db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(storeName, mode, action) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export function getAll(storeName) { return run(storeName, 'readonly', (s) => s.getAll()); }
export function get(storeName, key) { return run(storeName, 'readonly', (s) => s.get(key)); }
export function put(storeName, value) { return run(storeName, 'readwrite', (s) => s.put(value)); }
export function remove(storeName, key) { return run(storeName, 'readwrite', (s) => s.delete(key)); }

export function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Restore everything in one safe step (Phase 6) ----------
// Clears streaks, habits and entries, then writes the new ones.
// All inside ONE transaction: if anything fails, nothing changes.
export function replaceAll(data) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const names = ['streaks', 'habits', 'entries'];
    const tx = db.transaction(names, 'readwrite');
    names.forEach((name) => {
      const store = tx.objectStore(name);
      store.clear();
      (data[name] || []).forEach((item) => store.put(item));
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}
