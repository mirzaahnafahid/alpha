import { getAll, put, replaceAll } from './db.js';
import { todayString } from './streaks.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isObj(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

// Collects everything the user created into one plain object.
export async function buildBackup() {
  return {
    app: 'alpha',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      streaks: await getAll('streaks'),
      habits: await getAll('habits'),
      entries: await getAll('entries')
    }
  };
}

// Saves the backup as a file the user can keep.
export async function downloadBackup() {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'alpha-backup-' + todayString() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  await put('settings', { key: 'lastBackup', value: Date.now() });
  return backup.data;
}

// Checks that a file really is an Alpha backup before anything is touched.
export function validateBackup(obj) {
  const bad = (error) => ({ ok: false, error: error });

  if (!isObj(obj) || obj.app !== 'alpha') return bad('This is not an Alpha backup file.');
  if (typeof obj.version !== 'number' || obj.version > 1) {
    return bad('This backup was made by a newer version of Alpha.');
  }
  const d = obj.data;
  if (!isObj(d) || !Array.isArray(d.streaks) || !Array.isArray(d.habits) || !Array.isArray(d.entries)) {
    return bad('The backup file is incomplete.');
  }

  const streakIds = new Set();
  for (const s of d.streaks) {
    if (!isObj(s) || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' ||
        typeof s.startDate !== 'string' || !DATE_RE.test(s.startDate) || typeof s.createdAt !== 'number') {
      return bad('A streak in the file is damaged.');
    }
    streakIds.add(s.id);
  }
  for (const h of d.habits) {
    if (!isObj(h) || typeof h.id !== 'string' || !h.id || !streakIds.has(h.streakId) ||
        typeof h.name !== 'string' || (h.type !== 'checkbox' && h.type !== 'number') ||
        typeof h.order !== 'number' || typeof h.createdAt !== 'number') {
      return bad('A habit in the file is damaged.');
    }
  }
  for (const e of d.entries) {
    if (!isObj(e) || typeof e.id !== 'string' || !e.id || !streakIds.has(e.streakId) ||
        typeof e.date !== 'string' || !DATE_RE.test(e.date) || !isObj(e.values)) {
      return bad('A day record in the file is damaged.');
    }
  }

  return {
    ok: true,
    counts: { streaks: d.streaks.length, habits: d.habits.length, entries: d.entries.length }
  };
}

// Replaces everything on this device with the backup (call validateBackup first).
export async function restoreBackup(obj) {
  await replaceAll({
    streaks: obj.data.streaks,
    habits: obj.data.habits,
    entries: obj.data.entries
  });
}
