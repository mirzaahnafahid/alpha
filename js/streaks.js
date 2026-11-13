import { getAll, get, put, remove, newId } from './db.js';
import { canCreateStreak } from './plan.js';

// Today's date as YYYY-MM-DD in the user's own time zone.
export function todayString() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

// Day 1 is the start date. Day number = days since start, plus one.
export function dayNumber(startDate) {
  const parts = startDate.split('-').map(Number);
  const start = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - start) / 86400000) + 1;
}

export async function listStreaks() {
  const all = await getAll('streaks');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function createStreak(name, tagline) {
  const existing = await listStreaks();
  if (!(await canCreateStreak(existing.length))) {
    return { ok: false, reason: 'limit' };
  }
  const streak = {
    id: newId(),
    name: name.trim(),
    tagline: (tagline || '').trim(),
    startDate: todayString(),
    createdAt: Date.now()
  };
  await put('streaks', streak);
  return { ok: true, streak: streak };
}

export async function updateStreak(id, data) {
  const streak = await get('streaks', id);
  if (!streak) return null;
  streak.name = String(data.name).trim() || streak.name;
  streak.tagline = String(data.tagline || '').trim();
  await put('streaks', streak);
  return streak;
}

// Removes the streak and everything inside it (habits and daily records).
export async function deleteStreak(id) {
  const habits = (await getAll('habits')).filter((h) => h.streakId === id);
  for (const h of habits) await remove('habits', h.id);
  const entries = (await getAll('entries')).filter((e) => e.streakId === id);
  for (const e of entries) await remove('entries', e.id);
  await remove('streaks', id);
}

// ---------- Date helpers (Phase 4) ----------
export function parseDate(str) {
  const p = str.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

export function dateToString(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return dateToString(d);
}

// The Day number of any date inside a streak (Day 1 = start date).
export function dayNumberOn(startDate, dateStr) {
  return Math.round((parseDate(dateStr) - parseDate(startDate)) / 86400000) + 1;
}
