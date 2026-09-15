/* =============================================================================
 progress.js — how things are going (consistency, never competition)
 -----------------------------------------------------------------------------
 Pure numbers about focus time, finished tasks, check-ins and streaks, plus
 the small HTML builders used by the Progress page and the Study page.
 ========================================================================== */
'use strict';

const Progress = (() => {

 /** Mood keys used by both the daily check-in and the nightly review. */
 const MOODS = {
 great:  { icon: '', label: 'Great' },
 good:  { icon: '', label: 'Good' },
 okay:  { icon: '', label: 'Okay' },
 low:  { icon: '', label: 'Low' },
 difficult: { icon: '', label: 'Difficult' },
 exhausted: { icon: '', label: 'Exhausted' }
 };
 const moodIcon = (key) => (MOODS[key] ? MOODS[key].icon : 'heart');
 const moodLabel = (key) => (MOODS[key] ? MOODS[key].label : 'Checked in');

 /* ------------------------------ raw numbers ----------------------------- */
 const focusMinutesOn = (state, key) => (state.focusDays[key] ? (state.focusDays[key].minutes || 0) : 0);
 const sessionsOn = (state, key) => (state.sessions || []).filter((s) => s.date === key);
 const tasksOn = (state, key) => (state.tasks || []).filter((t) => t.date === key);
 const tasksDoneOn = (state, key) => tasksOn(state, key).filter((t) => t.completed);

 /** Did the user show up on this day at all? (gentle definition of "doing well") */
 function showedUp(state, key) {
 return focusMinutesOn(state, key) > 0 ||
 tasksDoneOn(state, key).length > 0 ||
 Boolean(state.checkIns[key]);
 }

 /** Every day with something recorded, sorted oldest first. */
 function activeDays(state) {
 const days = [];
 const push = (key) => { if (days.indexOf(key) === -1) days.push(key); };
 Object.keys(state.focusDays || {}).forEach((key) => {
 if ((state.focusDays[key].minutes || 0) > 0) push(key);
 });
 (state.tasks || []).forEach((t) => { if (t.completed) push(t.date); });
 Object.keys(state.checkIns || {}).forEach(push);
 return days.sort();
 }

 /** Current + best streak in days. Today still counts as "in progress". */
 function streaks(state) {
 let current = 0;
 let cursor = Utils.todayKey();
 if (!showedUp(state, cursor)) cursor = Utils.addDays(cursor, -1);
 while (showedUp(state, cursor)) {
 current += 1;
 cursor = Utils.addDays(cursor, -1);
 }

 let best = 0;
 let run = 0;
 let previous = null;
 activeDays(state).forEach((day) => {
 run = (previous && Utils.dayDiff(previous, day) === 1) ? run + 1 : 1;
 if (run > best) best = run;
 previous = day;
 });

 return { current, best: Math.max(best, current), activeDays: activeDays(state).length };
 }

 /** The seven days of the current week (week starts on Monday). */
 function weekDays(state, referenceKey) {
 const refKey = referenceKey || Utils.todayKey();
 const offsetFromMonday = (Utils.parseDateKey(refKey).getDay() + 6) % 7;
 const startKey = Utils.addDays(refKey, -offsetFromMonday);
 const today = Utils.todayKey();
 const days = [];

 for (let i = 0; i < 7; i++) {
 const key = Utils.addDays(startKey, i);
 const tasks = tasksOn(state, key);
 const done = tasksDoneOn(state, key);
 days.push({
 key,
 label: Utils.weekdayShort(key),
 minutes: focusMinutesOn(state, key),
 sessions: sessionsOn(state, key).length,
 tasksDone: done.length,
 tasksTotal: tasks.length,
 percent: Utils.percent(done.length, tasks.length),
 checkIn: state.checkIns[key] || null,
 review: state.nightReviews[key] || null,
 isToday: key === today,
 isFuture: Utils.dayDiff(today, key) > 0,
 showedUp: showedUp(state, key)
 });
 }
 return days;
 }

 /** Everything the Progress, Study and Home screens need in one object. */
 function totals(state, referenceKey) {
 const days = weekDays(state, referenceKey);
 const today = Utils.todayKey();
 const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0);
 // Months that were folded away still count in the all-time numbers
 const archived = Object.keys(state.history || {}).reduce((acc, month) => {
 acc.minutes += state.history[month].minutes || 0;
 acc.sessions += state.history[month].sessions || 0;
 acc.months += 1;
 return acc;
 }, { minutes: 0, sessions: 0, months: 0 });

 return {
 days,
 week: {
 minutes: sum(days, (d) => d.minutes),
 sessions: sum(days, (d) => d.sessions),
 tasksDone: sum(days, (d) => d.tasksDone),
 tasksTotal: sum(days, (d) => d.tasksTotal),
 daysShownUp: days.filter((d) => d.showedUp).length
 },
 today: {
 minutes: focusMinutesOn(state, today),
 sessions: sessionsOn(state, today).length,
 tasksDone: tasksDoneOn(state, today).length,
 tasksTotal: tasksOn(state, today).length,
 percent: Utils.percent(tasksDoneOn(state, today).length, tasksOn(state, today).length)
 },
 allTime: {
 minutes: sum(state.sessions || [], (s) => s.minutes || 0) + archived.minutes,
 sessions: (state.sessions || []).length + archived.sessions,
 tasksDone: (state.tasks || []).filter((t) => t.completed).length,
 goalsCompleted: (state.subjects || []).filter((s) => (s.progress || 0) >= 100).length,
 subjects: (state.subjects || []).length,
 archivedMonths: archived.months
 },
 streaks: streaks(state)
 };
 }

 /* ------------------------------- rendering ------------------------------ */
 const esc = Utils.escapeHtml;
 const focusText = (minutes) => (minutes ? Utils.formatMinutes(minutes) : '0m');

 function statCard(icon, value, label) {
 return '<div class="stat-card"><span class="stat-ico">' + ico(icon) + '</span>' +
 '<div class="stat-value">' + esc(value) + '</div>' +
 '<div class="stat-label">' + esc(label) + '</div></div>';
 }

 /** The four numbers at the top of the Progress page. */
 function renderStatCards(state) {
 const t = totals(state);
 return [
 statCard('target', focusText(t.today.minutes), "Today's focus"),
 statCard('calendar', focusText(t.week.minutes), 'Focus this week'),
 statCard('check-circle', t.week.tasksDone + ' task' + (t.week.tasksDone === 1 ? '' : 's'), 'Completed this week'),
 statCard('flame', t.streaks.current + ' day' + (t.streaks.current === 1 ? '' : 's'), 'Current streak')
 ].join('');
 }

 /** The four numbers at the top of the Study page. */
 function renderStudyStats(state) {
 const t = totals(state);
 return [
 statCard('calendar', focusText(t.week.minutes), 'Studied this week'),
 statCard('timer', t.week.sessions + ' session' + (t.week.sessions === 1 ? '' : 's'), 'Focus sessions'),
 statCard('flame', t.streaks.current + ' day' + (t.streaks.current === 1 ? '' : 's'), 'Current streak'),
 statCard('star', t.streaks.best + ' day' + (t.streaks.best === 1 ? '' : 's'), 'Best streak')
 ].join('');
 }

 /** The little bar chart of focus minutes for the week. */
 function renderWeekChart(state) {
 const days = weekDays(state);
 const max = Math.max(30, days.reduce((m, d) => Math.max(m, d.minutes), 0));
 return days.map((day) => {
 const height = day.minutes ? Math.max(6, Math.round((day.minutes / max) * 100)) : 0;
 const title = day.key + ' — ' + (day.minutes ? day.minutes + ' minutes focused' : 'no focus time yet');
 return '<div class="week-bar' + (day.isToday ? ' is-today' : '') + '" title="' + esc(title) + '">' +
 '<span class="week-bar-value">' + (day.minutes ? day.minutes + 'm' : '') + '</span>' +
 '<div class="week-bar-track"><div class="week-bar-fill" style="height:' + height + '%"></div></div>' +
 '<span class="week-bar-label">' + esc(day.label) + '</span></div>';
 }).join('');
 }

 /** Recent check-ins (most recent first). */
 function renderMoodHistory(state, limit) {
 const keys = Object.keys(state.checkIns || {})
 .concat(Object.keys(state.nightReviews || {}))
 .filter((key, index, all) => all.indexOf(key) === index)
 .sort()
 .reverse()
 .slice(0, limit || 7);

 if (!keys.length) {
 return '<div class="empty-state"><span class="empty-ico"></span><strong>No check-ins yet</strong>' +
 '<p>Tap how you feel on the Home page and Luvli will keep note.</p></div>';
 }

 return keys.map((key) => {
 const review = state.nightReviews[key];
 const checkIn = state.checkIns[key];
 const mood = (review && review.rating) || (checkIn && checkIn.mood);
 const when = review ? 'evening' : 'check-in';
 return '<div class="mood-row"><span class="mood-row-ico">' + ico(moodIcon(mood)) + '</span>' +
 '<span class="mood-row-day">' + esc(Utils.relativeDateLabel(key)) + ' — ' + esc(moodLabel(mood)) + '</span>' +
 '<span class="mood-row-date">' + esc(when) + ' · ' + esc(Utils.formatShortDate(key)) + '</span></div>';
 }).join('');
 }

 /** A kind summary sentence (or three) for the bottom of the Progress page. */
 function consistencyNote(state) {
 const t = totals(state);
 const shown = t.week.daysShownUp;
 const lines = [];

 if (shown === 0) lines.push('This week is a blank page, luv. One small thing today is enough.');
 else if (shown === 7) lines.push('You showed up every single day this week. That is beautiful.');
 else lines.push('You showed up ' + shown + ' day' + (shown === 1 ? '' : 's') + ' this week.');

 if (t.streaks.current >= 3) lines.push("That's a " + t.streaks.current + '-day streak — quietly impressive.');
 if (t.today.minutes) lines.push("You've focused " + Utils.formatMinutes(t.today.minutes) + ' today.');
 if (t.allTime.goalsCompleted) {
 lines.push(t.allTime.goalsCompleted + ' goal' + (t.allTime.goalsCompleted === 1 ? '' : 's') + ' completed so far.');
 }
 if (t.week.tasksTotal && t.week.tasksDone < t.week.tasksTotal) {
 lines.push('Whatever is unfinished is completely fine. Tomorrow is a fresh page.');
 }
 return lines.join(' ');
 }

 return {
 MOODS, moodIcon, moodLabel,
 focusMinutesOn, sessionsOn, tasksOn, tasksDoneOn, showedUp, streaks, weekDays, totals,
 renderStatCards, renderStudyStats, renderWeekChart, renderMoodHistory, consistencyNote
 };
})();
