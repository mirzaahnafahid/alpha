import { get, put } from './db.js';

// One record per streak per day: the habit values and the reflection.
export async function getEntry(streakId, date) {
  const found = await get('entries', streakId + '_' + date);
  return found || {
    id: streakId + '_' + date,
    streakId: streakId,
    date: date,
    values: {},
    reflection: ''
  };
}

export async function setValue(streakId, date, habitId, value) {
  const entry = await getEntry(streakId, date);
  entry.values[habitId] = value;
  entry.updatedAt = Date.now();
  await put('entries', entry);
  return entry;
}

export async function setReflection(streakId, date, text) {
  const entry = await getEntry(streakId, date);
  entry.reflection = text;
  entry.updatedAt = Date.now();
  await put('entries', entry);
}

// A checkbox habit is done when ticked. A number habit is done when it reaches the target.
export function isDone(habit, value) {
  if (habit.type === 'number') return Number(value || 0) >= habit.target;
  return value === true;
}
