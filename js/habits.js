import { getAll, get, put, newId } from './db.js';

// Turns the form values into a clean habit record.
function clean(data) {
  const isNumber = data.type === 'number';
  const target = Number(data.target);
  const step = Number(data.step);
  return {
    name: String(data.name).trim(),
    type: isNumber ? 'number' : 'checkbox',
    target: isNumber ? (target > 0 ? target : 1) : null,
    unit: isNumber ? String(data.unit || '').trim() : '',
    step: isNumber ? (step > 0 ? step : 1) : null
  };
}

// Habits of one streak, in the user's order. Deleted habits are hidden, not erased.
export async function listHabits(streakId) {
  const all = await getAll('habits');
  return all
    .filter((h) => h.streakId === streakId && !h.deletedAt)
    .sort((a, b) => a.order - b.order);
}

export async function addHabit(streakId, data) {
  const all = await getAll('habits');
  const mine = all.filter((h) => h.streakId === streakId);
  const maxOrder = mine.reduce((m, h) => Math.max(m, h.order), 0);
  const habit = Object.assign(
    { id: newId(), streakId: streakId, order: maxOrder + 1, createdAt: Date.now(), deletedAt: null },
    clean(data)
  );
  await put('habits', habit);
  return habit;
}

export async function updateHabit(id, data) {
  const habit = await get('habits', id);
  if (!habit) return;
  await put('habits', Object.assign({}, habit, clean(data)));
}

// "Delete" only hides the habit, so old days keep their history.
export async function deleteHabit(id) {
  const habit = await get('habits', id);
  if (!habit) return;
  habit.deletedAt = Date.now();
  await put('habits', habit);
}

// direction: -1 moves up, +1 moves down.
export async function moveHabit(streakId, id, direction) {
  const list = await listHabits(streakId);
  const i = list.findIndex((h) => h.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return;
  const a = list[i];
  const b = list[j];
  const temp = a.order;
  a.order = b.order;
  b.order = temp;
  await put('habits', a);
  await put('habits', b);
}

// ---------- Habits as they were on a given day (Phase 4) ----------
function toDateString(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

// A habit shows on a day if it existed then and was not yet deleted.
// Any habit that has a record on that day always shows, so history stays intact.
export async function listHabitsForDate(streakId, date, values) {
  const all = await getAll('habits');
  return all
    .filter((h) => {
      if (h.streakId !== streakId) return false;
      if (values && Object.prototype.hasOwnProperty.call(values, h.id)) return true;
      if (toDateString(h.createdAt) > date) return false;
      if (h.deletedAt && toDateString(h.deletedAt) <= date) return false;
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

// ---------- Same rule as above, for a list that is already loaded (Phase 5) ----------
export function habitsOnDate(allHabits, date, values) {
  return allHabits
    .filter((h) => {
      if (values && Object.prototype.hasOwnProperty.call(values, h.id)) return true;
      if (toDateString(h.createdAt) > date) return false;
      if (h.deletedAt && toDateString(h.deletedAt) <= date) return false;
      return true;
    })
    .sort((a, b) => a.order - b.order);
}
