// The ONLY place that knows about Free and Premium limits.
// Later, Premium just sets the plan in the 'settings' store. Nothing else changes.
import { get } from './db.js';

const PLANS = {
  free: { maxStreaks: 1 },
  premium: { maxStreaks: Infinity }
};

export async function getPlanName() {
  const record = await get('settings', 'plan');
  if (!record || !record.value || record.value.name !== 'premium') return 'free';
  const expires = record.value.expiresAt;
  if (expires && Date.parse(expires) < Date.now()) return 'free'; // expired: behaves like Free
  return 'premium';
}

export async function getLimits() {
  const name = await getPlanName();
  return { name: name, maxStreaks: PLANS[name].maxStreaks };
}

export async function canCreateStreak(currentCount) {
  const limits = await getLimits();
  return currentCount < limits.maxStreaks;
}
