import { getAll } from './db.js';
import { todayString, addDays } from './streaks.js';
import { habitsOnDate } from './habits.js';
import { isDone } from './days.js';

// Walks through every day of a streak, from its start date to today,
// and works out each day's result plus the streak counters.
export async function loadStats(streak) {
  const habitsAll = (await getAll('habits')).filter((h) => h.streakId === streak.id);
  const entries = (await getAll('entries')).filter((e) => e.streakId === streak.id);
  const byDate = {};
  entries.forEach((e) => { byDate[e.date] = e; });

  const today = todayString();
  const days = {};
  const habitStats = {};
  habitsAll.forEach((h) => { habitStats[h.id] = { habit: h, visible: 0, done: 0 }; });

  let run = 0;
  let longest = 0;
  let totalCompleted = 0;

  for (let d = streak.startDate; d <= today; d = addDays(d, 1)) {
    const values = (byDate[d] && byDate[d].values) || {};
    const list = habitsOnDate(habitsAll, d, values);
    let done = 0;
    list.forEach((h) => {
      const ok = isDone(h, values[h.id]);
      if (ok) done++;
      habitStats[h.id].visible++;
      if (ok) habitStats[h.id].done++;
    });

    const total = list.length;
    const complete = total > 0 && done === total;
    days[d] = {
      total: total,
      done: done,
      percent: total ? Math.round((done / total) * 100) : 0,
      complete: complete
    };

    if (complete) {
      totalCompleted++;
      run++;
      if (run > longest) longest = run;
    } else if (d < today) {
      run = 0; // a finished day that was not completed breaks the streak
    }
  }

  return {
    days: days,
    current: run,
    longest: longest,
    totalCompleted: totalCompleted,
    habits: Object.values(habitStats).filter((hs) => hs.visible > 0)
  };
}
