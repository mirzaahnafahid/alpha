import {
  listStreaks, createStreak, updateStreak, deleteStreak,
  dayNumber, dayNumberOn, todayString, parseDate, addDays
} from './streaks.js';
import { getLimits } from './plan.js';
import {
  listHabits, listHabitsForDate, addHabit, updateHabit, deleteHabit, moveHabit
} from './habits.js';
import { getEntry, setValue, setReflection, isDone } from './days.js';
import { loadStats } from './stats.js';
import { get } from './db.js';
import { downloadBackup, validateBackup, restoreBackup } from './backup.js';

// Ask the browser to protect our saved data from being cleaned up.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}

// ---------- Small helpers ----------
function pad(n) { return String(n).padStart(2, '0'); }
function formatNum(n) { return String(Math.round(Number(n) * 100) / 100); }
function longDate() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function weekdayDate(dateStr) {
  return parseDate(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

// ---------- State ----------
const home = document.getElementById('home');
const streakScreen = document.getElementById('streak');
const settingsScreen = document.getElementById('settings');
let currentStreak = null;   // the streak that is open
let viewDate = todayString(); // the day being viewed (YYYY-MM-DD)

function showScreen(name) {
  home.hidden = name !== 'home';
  streakScreen.hidden = name !== 'streak';
  settingsScreen.hidden = name !== 'settings';
  window.scrollTo(0, 0);
}

// ---------- Reflection saving ----------
const reflection = document.getElementById('reflection');
let pendingReflection = null;
let reflectionTimer = null;

async function flushReflection() {
  clearTimeout(reflectionTimer);
  reflectionTimer = null;
  if (!pendingReflection) return;
  const p = pendingReflection;
  pendingReflection = null;
  await setReflection(p.streakId, p.date, p.text);
}

reflection.addEventListener('input', () => {
  if (!currentStreak) return;
  pendingReflection = { streakId: currentStreak.id, date: viewDate, text: reflection.value };
  clearTimeout(reflectionTimer);
  reflectionTimer = setTimeout(flushReflection, 300);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushReflection();
});

document.getElementById('back').addEventListener('click', async () => {
  await flushReflection();
  showScreen('home');
  refreshHome();
});

// ---------- Home: list of streaks ----------
const list = document.getElementById('streak-list');
const newBtn = document.getElementById('new-btn');
const limitNote = document.getElementById('limit-note');
const planLabel = document.getElementById('plan-label');

async function todayPercent(streakId) {
  const date = todayString();
  const entry = await getEntry(streakId, date);
  const habits = await listHabitsForDate(streakId, date, entry.values);
  if (habits.length === 0) return 0;
  const done = habits.filter((h) => isDone(h, entry.values[h.id])).length;
  return Math.round((done / habits.length) * 100);
}

function buildCard(s, percent, current, longest) {
  const card = document.createElement('article');
  card.className = 'card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const title = document.createElement('h2');
  title.textContent = s.name;
  card.appendChild(title);

  if (s.tagline) {
    const tag = document.createElement('p');
    tag.className = 'muted tag';
    tag.textContent = s.tagline;
    card.appendChild(tag);
  }

  const dayLine = document.createElement('p');
  dayLine.className = 'muted';
  dayLine.textContent = 'Day ' + pad(dayNumber(s.startDate)) + ' \u00b7 ' + longDate();
  card.appendChild(dayLine);

  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.innerHTML =
    '<div><strong>' + current + '</strong><span class="muted">Current streak</span></div>' +
    '<div><strong>' + longest + '</strong><span class="muted">Longest</span></div>' +
    '<div><strong>' + percent + '%</strong><span class="muted">Today</span></div>';
  card.appendChild(stats);

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = '<i style="width:' + percent + '%"></i>';
  card.appendChild(bar);

  card.addEventListener('click', () => openStreak(s));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openStreak(s);
    }
  });
  return card;
}

async function refreshHome() {
  const streaks = await listStreaks();
  const limits = await getLimits();

  list.replaceChildren();
  if (streaks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted empty';
    empty.textContent = 'No streaks yet. Tap "+ New streak" to start your first journey.';
    list.appendChild(empty);
  } else {
    for (const s of streaks) {
      const stats = await loadStats(s);
      const todayInfo = stats.days[todayString()];
      const percent = todayInfo ? todayInfo.percent : 0;
      list.appendChild(buildCard(s, percent, stats.current, stats.longest));
    }
  }

  if (limits.maxStreaks === Infinity) {
    planLabel.textContent = streaks.length + (streaks.length === 1 ? ' streak' : ' streaks');
  } else {
    planLabel.textContent = streaks.length + ' of ' + limits.maxStreaks + ' on Free';
  }

  const atLimit = streaks.length >= limits.maxStreaks;
  newBtn.setAttribute('aria-disabled', String(atLimit));
  newBtn.classList.toggle('disabled', atLimit);
  limitNote.hidden = !atLimit;
}

// ---------- New streak form ----------
const dialog = document.getElementById('new-dialog');
const form = document.getElementById('new-form');
const nameInput = document.getElementById('streak-name');
const tagInput = document.getElementById('streak-tagline');
const formError = document.getElementById('form-error');

newBtn.addEventListener('click', () => {
  if (newBtn.getAttribute('aria-disabled') === 'true') return;
  form.reset();
  formError.hidden = true;
  dialog.showModal();
  nameInput.focus();
});

document.getElementById('cancel-new').addEventListener('click', () => dialog.close());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  try {
    const result = await createStreak(name, tagInput.value);
    if (!result.ok) {
      formError.textContent = 'The free plan includes 1 streak.';
      formError.hidden = false;
      return;
    }
    dialog.close();
    await refreshHome();
  } catch (err) {
    formError.textContent = 'Could not save. Please try again.';
    formError.hidden = false;
    console.error(err);
  }
});

// ---------- Tabs: Today, History, Stats ----------
const tabButtons = document.querySelectorAll('.tabs button');
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    if (btn.dataset.tab === 'history') renderHistory(true);
    if (btn.dataset.tab === 'stats') renderStats();
    ['today', 'history', 'stats'].forEach((name) => {
      document.getElementById('tab-' + name).hidden = name !== btn.dataset.tab;
    });
  });
});

// ---------- Open one streak ----------
function openStreak(s) {
  currentStreak = s;
  viewDate = todayString();
  document.getElementById('streak-title').textContent = s.name;
  document.querySelector('.tabs button[data-tab="today"]').click();
  showScreen('streak');
  updateDayHeader();
  renderToday(true);
}

// ---------- Day header and Previous / Next ----------
const prevBtn = document.getElementById('prev-day');
const nextBtn = document.getElementById('next-day');
const goTodayBtn = document.getElementById('go-today');
const addHabitBtn = document.getElementById('add-habit');

function updateDayHeader() {
  const today = todayString();
  document.getElementById('daynum').textContent =
    'Day ' + pad(dayNumberOn(currentStreak.startDate, viewDate));
  document.getElementById('daydate').textContent = weekdayDate(viewDate);
  prevBtn.disabled = viewDate <= currentStreak.startDate;
  nextBtn.disabled = viewDate >= today;
  goTodayBtn.hidden = viewDate === today;
  addHabitBtn.hidden = viewDate !== today;
  reflection.placeholder = viewDate === today ? 'How did today go?' : 'What happened this day?';
}

async function goToDate(date) {
  await flushReflection();
  viewDate = date;
  updateDayHeader();
  await renderToday(true);
}

prevBtn.addEventListener('click', () => {
  if (viewDate > currentStreak.startDate) goToDate(addDays(viewDate, -1));
});
nextBtn.addEventListener('click', () => {
  if (viewDate < todayString()) goToDate(addDays(viewDate, 1));
});
goTodayBtn.addEventListener('click', () => goToDate(todayString()));

// ---------- The habit checklist for the viewed day ----------
const habitList = document.getElementById('habits');

function buildHabitRow(h, value, complete) {
  const row = document.createElement('div');
  row.className = 'habit' + (complete ? ' done' : '');

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'hmain';

  const check = document.createElement('span');
  check.className = 'check';
  const name = document.createElement('span');
  name.className = 'hname';
  name.textContent = h.deletedAt ? h.name + ' (removed)' : h.name;
  main.append(check, name);

  if (h.type === 'number') {
    const v = Number(value) || 0;
    const val = document.createElement('span');
    val.className = 'muted small';
    val.textContent = formatNum(v) + ' / ' + formatNum(h.target) + (h.unit ? ' ' + h.unit : '');
    main.appendChild(val);

    const mini = document.createElement('span');
    mini.className = 'mini';
    mini.innerHTML = '<i></i>';
    mini.firstChild.style.width = Math.min(100, (v / h.target) * 100) + '%';
    main.appendChild(mini);

    main.addEventListener('click', () => openProgress(h, v));
  } else {
    main.setAttribute('aria-pressed', String(complete));
    main.addEventListener('click', async () => {
      await setValue(currentStreak.id, viewDate, h.id, !complete);
      renderToday(false);
    });
  }

  row.appendChild(main);

  if (!h.deletedAt) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'hedit';
    edit.setAttribute('aria-label', 'Edit ' + h.name);
    edit.textContent = '\u22ee';
    edit.addEventListener('click', () => openHabitDialog(h));
    row.appendChild(edit);
  }
  return row;
}

async function renderToday(loadReflection) {
  if (!currentStreak) return;
  const date = viewDate;
  const entry = await getEntry(currentStreak.id, date);
  const habits = await listHabitsForDate(currentStreak.id, date, entry.values);

  habitList.replaceChildren();
  if (habits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted empty';
    empty.textContent = date === todayString()
      ? 'No habits yet. Tap "+ Add habit" to create your first one.'
      : 'No habits were set for this day.';
    habitList.appendChild(empty);
  }

  let done = 0;
  habits.forEach((h) => {
    const value = entry.values[h.id];
    const complete = isDone(h, value);
    if (complete) done++;
    habitList.appendChild(buildHabitRow(h, value, complete));
  });

  const total = habits.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('pct').textContent = percent + '%';
  document.getElementById('count').textContent = total ? done + ' of ' + total + ' done' : 'No habits';
  document.getElementById('pct-bar').style.width = percent + '%';

  if (loadReflection) reflection.value = entry.reflection || '';
}

// ---------- Add / edit habit form ----------
const habitDialog = document.getElementById('habit-dialog');
const habitForm = document.getElementById('habit-form');
const habitName = document.getElementById('habit-name');
const habitType = document.getElementById('habit-type');
const numFields = document.getElementById('num-fields');
const habitTarget = document.getElementById('habit-target');
const habitUnit = document.getElementById('habit-unit');
const habitStep = document.getElementById('habit-step');
const habitError = document.getElementById('habit-error');
const editTools = document.getElementById('edit-tools');
let editingHabit = null;

function syncType() { numFields.hidden = habitType.value !== 'number'; }
habitType.addEventListener('change', syncType);

function openHabitDialog(h) {
  editingHabit = h || null;
  habitForm.reset();
  habitError.hidden = true;
  document.getElementById('habit-title').textContent = h ? 'Edit habit' : 'New habit';
  editTools.hidden = !h;
  if (h) {
    habitName.value = h.name;
    habitType.value = h.type;
    habitTarget.value = h.target || '';
    habitUnit.value = h.unit || '';
    habitStep.value = h.step || '';
  }
  syncType();
  habitDialog.showModal();
  habitName.focus();
}

addHabitBtn.addEventListener('click', () => openHabitDialog(null));
document.getElementById('cancel-habit').addEventListener('click', () => habitDialog.close());

habitForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = habitName.value.trim();
  if (!name) return;
  const data = {
    name: name,
    type: habitType.value,
    target: habitTarget.value,
    unit: habitUnit.value,
    step: habitStep.value
  };
  if (data.type === 'number' && !(Number(data.target) > 0)) {
    habitError.textContent = 'Enter a daily target above 0.';
    habitError.hidden = false;
    return;
  }
  try {
    if (editingHabit) await updateHabit(editingHabit.id, data);
    else await addHabit(currentStreak.id, data);
    habitDialog.close();
    await renderToday(false);
  } catch (err) {
    habitError.textContent = 'Could not save. Please try again.';
    habitError.hidden = false;
    console.error(err);
  }
});

document.getElementById('habit-up').addEventListener('click', async () => {
  await moveHabit(currentStreak.id, editingHabit.id, -1);
  await renderToday(false);
});
document.getElementById('habit-down').addEventListener('click', async () => {
  await moveHabit(currentStreak.id, editingHabit.id, 1);
  await renderToday(false);
});
document.getElementById('habit-delete').addEventListener('click', async () => {
  if (!confirm('Delete this habit? Your past days keep their records.')) return;
  await deleteHabit(editingHabit.id);
  habitDialog.close();
  await renderToday(false);
});

// ---------- Number progress panel ----------
const progressDialog = document.getElementById('progress-dialog');
const progressForm = document.getElementById('progress-form');
const progressInput = document.getElementById('progress-input');
const progressError = document.getElementById('progress-error');
let progressHabit = null;

function openProgress(h, current) {
  progressHabit = h;
  progressError.hidden = true;
  document.getElementById('progress-title').textContent = h.name;
  document.getElementById('progress-target').textContent =
    'Target: ' + formatNum(h.target) + (h.unit ? ' ' + h.unit : '');
  progressInput.value = formatNum(current);
  const step = h.step || 1;
  document.getElementById('progress-minus').textContent = '\u2212' + formatNum(step);
  document.getElementById('progress-plus').textContent = '+' + formatNum(step);
  progressDialog.showModal();
  progressInput.select();
}

document.getElementById('progress-minus').addEventListener('click', () => {
  const step = progressHabit.step || 1;
  progressInput.value = formatNum(Math.max(0, (Number(progressInput.value) || 0) - step));
});
document.getElementById('progress-plus').addEventListener('click', () => {
  const step = progressHabit.step || 1;
  progressInput.value = formatNum((Number(progressInput.value) || 0) + step);
});
document.getElementById('progress-full').addEventListener('click', () => {
  progressInput.value = formatNum(progressHabit.target);
});
document.getElementById('cancel-progress').addEventListener('click', () => progressDialog.close());

progressForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = Number(progressInput.value);
  if (isNaN(value) || value < 0) {
    progressError.textContent = 'Enter a number, 0 or higher.';
    progressError.hidden = false;
    return;
  }
  await setValue(currentStreak.id, viewDate, progressHabit.id, value);
  progressDialog.close();
  await renderToday(false);
});

// ---------- History: calendar ----------
const calGrid = document.getElementById('cal-grid');
const calTitle = document.getElementById('cal-title');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
let calYear = 0;
let calMonth = 0; // 0 = January

calPrev.addEventListener('click', () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderHistory(false);
});
calNext.addEventListener('click', () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderHistory(false);
});

async function renderHistory(resetMonth) {
  if (!currentStreak) return;
  const stats = await loadStats(currentStreak);
  const today = todayString();

  if (resetMonth) {
    const t = parseDate(today);
    calYear = t.getFullYear();
    calMonth = t.getMonth();
  }

  // Keep the calendar between the month the streak started and the current month.
  const start = parseDate(currentStreak.startDate);
  const now = parseDate(today);
  const minIndex = start.getFullYear() * 12 + start.getMonth();
  const maxIndex = now.getFullYear() * 12 + now.getMonth();
  let index = calYear * 12 + calMonth;
  index = Math.max(minIndex, Math.min(maxIndex, index));
  calYear = Math.floor(index / 12);
  calMonth = index % 12;
  calPrev.disabled = index <= minIndex;
  calNext.disabled = index >= maxIndex;

  calTitle.textContent = new Date(calYear, calMonth, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  calGrid.replaceChildren();
  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  for (let i = 0; i < firstWeekday; i++) {
    calGrid.appendChild(document.createElement('span'));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calYear + '-' + pad(calMonth + 1) + '-' + pad(d);
    const info = stats.days[dateStr];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day';
    cell.textContent = String(d);

    let label = parseDate(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    if (!info) {
      cell.disabled = true;
      cell.classList.add('off');
    } else if (info.complete) {
      cell.classList.add('ok');
      label += ', all habits done';
    } else if (dateStr < today) {
      cell.classList.add('miss');
      label += ', missed, ' + info.percent + ' percent done';
    } else {
      label += ', today, ' + info.percent + ' percent done';
    }
    if (dateStr === today) cell.classList.add('today');
    cell.setAttribute('aria-label', label);

    if (info) {
      cell.addEventListener('click', async () => {
        await goToDate(dateStr);
        document.querySelector('.tabs button[data-tab="today"]').click();
      });
    }
    calGrid.appendChild(cell);
  }
}

// ---------- Stats tab ----------
async function renderStats() {
  if (!currentStreak) return;
  const stats = await loadStats(currentStreak);
  document.getElementById('st-current').textContent = stats.current;
  document.getElementById('st-longest').textContent = stats.longest;
  document.getElementById('st-total').textContent = stats.totalCompleted;

  const box = document.getElementById('st-habits');
  box.replaceChildren();
  if (stats.habits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted empty';
    empty.textContent = 'Habit progress appears once you add habits.';
    box.appendChild(empty);
    return;
  }

  stats.habits.forEach((hs) => {
    const pct = Math.round((hs.done / hs.visible) * 100);
    const row = document.createElement('div');
    row.className = 'hp';

    const top = document.createElement('div');
    top.className = 'hp-top';
    const name = document.createElement('span');
    name.textContent = hs.habit.name + (hs.habit.deletedAt ? ' (removed)' : '');
    const info = document.createElement('span');
    info.className = 'muted small';
    info.textContent = hs.done + ' of ' + hs.visible + (hs.visible === 1 ? ' day' : ' days') + ' \u00b7 ' + pct + '%';
    top.append(name, info);

    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = pct + '%';
    bar.appendChild(fill);

    row.append(top, bar);
    box.appendChild(row);
  });
}

// ---------- Settings, backup and restore ----------
const openSettingsBtn = document.getElementById('open-settings');
const lastBackupNote = document.getElementById('last-backup');
const backupMsg = document.getElementById('backup-msg');
const importFile = document.getElementById('import-file');

function showBackupMessage(text, isError) {
  backupMsg.textContent = text;
  backupMsg.className = 'small ' + (isError ? 'err' : 'muted');
  backupMsg.hidden = false;
}

async function updateLastBackup() {
  const record = await get('settings', 'lastBackup');
  lastBackupNote.textContent = record
    ? 'Last backup: ' + new Date(record.value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Last backup: never';
}

async function renderSettings() {
  backupMsg.hidden = true;
  await updateLastBackup();
  const note = document.getElementById('storage-note');
  if (navigator.storage && navigator.storage.persisted) {
    const protectedData = await navigator.storage.persisted();
    note.textContent = protectedData
      ? 'Your browser has marked this data as protected from automatic cleanup.'
      : 'Your browser may clear this data if the device runs very low on space. Regular backups keep you safe.';
  } else {
    note.textContent = 'Regular backups keep your data safe.';
  }
}

openSettingsBtn.addEventListener('click', () => {
  showScreen('settings');
  renderSettings();
});
document.getElementById('settings-back').addEventListener('click', () => showScreen('home'));

document.getElementById('export-btn').addEventListener('click', async () => {
  try {
    const data = await downloadBackup();
    await updateLastBackup();
    showBackupMessage(
      'Backup saved: ' + data.streaks.length + ' streak(s), ' + data.habits.length +
      ' habit(s), ' + data.entries.length + ' day record(s). Check your Downloads folder.', false);
  } catch (err) {
    showBackupMessage('Could not create the backup. Please try again.', true);
    console.error(err);
  }
});

document.getElementById('import-btn').addEventListener('click', () => {
  importFile.value = '';
  importFile.click();
});

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showBackupMessage('That file is too large to be an Alpha backup.', true);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (err) {
    showBackupMessage('That file could not be read. Is it an Alpha backup?', true);
    return;
  }

  const check = validateBackup(parsed);
  if (!check.ok) {
    showBackupMessage(check.error, true);
    return;
  }

  const c = check.counts;
  const ok = confirm(
    'Restore this backup?\n\nIt contains ' + c.streaks + ' streak(s), ' + c.habits +
    ' habit(s) and ' + c.entries + ' day record(s).\n\nEverything currently on this device will be replaced. ' +
    'Tip: export a backup of your current data first if you might want it.');
  if (!ok) return;

  try {
    pendingReflection = null;
    clearTimeout(reflectionTimer);
    await restoreBackup(parsed);
    currentStreak = null;
    await refreshHome();
    showBackupMessage('Backup restored. Your streaks are back on the Home screen.', false);
  } catch (err) {
    showBackupMessage('The restore failed and nothing was changed. Please try again.', true);
    console.error(err);
  }
});

// ---------- Edit or delete the open streak ----------
const streakDialog = document.getElementById('streak-dialog');
const streakForm = document.getElementById('streak-form');
const editName = document.getElementById('edit-streak-name');
const editTagline = document.getElementById('edit-streak-tagline');
const streakError = document.getElementById('streak-error');

document.getElementById('streak-menu').addEventListener('click', () => {
  if (!currentStreak) return;
  streakError.hidden = true;
  editName.value = currentStreak.name;
  editTagline.value = currentStreak.tagline || '';
  streakDialog.showModal();
  editName.focus();
});

document.getElementById('cancel-streak').addEventListener('click', () => streakDialog.close());

streakForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = editName.value.trim();
  if (!name) return;
  try {
    const updated = await updateStreak(currentStreak.id, { name: name, tagline: editTagline.value });
    if (updated) {
      currentStreak = updated;
      document.getElementById('streak-title').textContent = updated.name;
    }
    streakDialog.close();
  } catch (err) {
    streakError.textContent = 'Could not save. Please try again.';
    streakError.hidden = false;
    console.error(err);
  }
});

document.getElementById('streak-delete').addEventListener('click', async () => {
  const ok = confirm('Delete "' + currentStreak.name + '" with ALL its habits, days and reflections? This cannot be undone.');
  if (!ok) return;
  try {
    // Drop any unsaved reflection so it cannot bring the deleted streak back.
    pendingReflection = null;
    clearTimeout(reflectionTimer);
    await deleteStreak(currentStreak.id);
    streakDialog.close();
    currentStreak = null;
    showScreen('home');
    await refreshHome();
  } catch (err) {
    streakError.textContent = 'Could not delete. Please try again.';
    streakError.hidden = false;
    console.error(err);
  }
});

// ---------- Offline support ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => console.error(err));
  });
}

// ---------- Start ----------
refreshHome().catch((err) => {
  list.replaceChildren();
  const msg = document.createElement('p');
  msg.className = 'muted empty';
  msg.textContent = 'Could not open storage in this browser window.';
  list.appendChild(msg);
  console.error(err);
});
