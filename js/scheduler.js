/* =============================================================================
 scheduler.js — Luvli's time intelligence
 -----------------------------------------------------------------------------
 Everything that answers "what am I supposed to be doing right now?" lives
 here: time helpers, the live day, free-slot maths, Optimize My Day,
 Lighten My Day and the recommendations behind "What should I do now?".
 No DOM events are bound here — this module reads state and returns data
 or HTML strings, which app.js places on the page.
 ========================================================================== */
'use strict';

const Scheduler = (() => {

 /* ---------------------------- time helpers ------------------------------ */

 /** "13:45" -> 825 (minutes from midnight). */
 function timeToMinutes(hhmm) {
 const parts = String(hhmm || '00:00').split(':').map(Number);
 return (parts[0] || 0) * 60 + (parts[1] || 0);
 }

 /** 825 -> "13:45" */
 function minutesToTime(total) {
 const mins = ((Math.round(total) % 1440) + 1440) % 1440;
 return Utils.pad(Math.floor(mins / 60)) + ':' + Utils.pad(mins % 60);
 }

 /** Minutes since midnight right now. */
 function nowMinutes(date) {
 const d = date || new Date();
 return d.getHours() * 60 + d.getMinutes();
 }

 /** Show a time the way the user prefers (Settings → Time format). */
 function formatTime(hhmm, state) {
 const settings = (state && state.settings) || {};
 const mins = timeToMinutes(hhmm);
 if (settings.timeFormat === '12') {
 const h24 = Math.floor(mins / 60);
 const suffix = h24 >= 12 ? 'PM' : 'AM';
 return (h24 % 12 === 0 ? 12 : h24 % 12) + ':' + Utils.pad(mins % 60) + ' ' + suffix;
 }
 return minutesToTime(mins);
 }

 /** "13:00 — 13:50" */
 function formatRange(start, end, state) {
 return formatTime(start, state) + ' — ' + formatTime(end, state);
 }

 const durationBetween = (start, end) => Math.max(0, timeToMinutes(end) - timeToMinutes(start));

 /** How long an activity lasts, in minutes. */
 const durationOf = (task) => durationBetween(task.start, task.end);

 /** "in 12 min" / "in 1h 5m" / "right now" */
 function countdown(minutes) {
 if (minutes === null || minutes === undefined) return '';
 if (minutes <= 0) return 'right now';
 if (minutes < 60) return 'in ' + minutes + ' min';
 return 'in ' + Utils.formatMinutes(minutes);
 }

 /** "09:41" for the top bar clock. */
 function formatClock(date) {
 const d = date || new Date();
 return Utils.pad(d.getHours()) + ':' + Utils.pad(d.getMinutes());
 }

 /** Which part of the day are we in? */
 function dayPhase(state, date) {
 const now = nowMinutes(date);
 const settings = (state && state.settings) || {};
 const wake = timeToMinutes(settings.wakeTime || '07:00');
 const sleep = timeToMinutes(settings.sleepTime || '22:30');
 if (now < wake) return 'early';
 if (now >= sleep) return 'night';
 if (now >= sleep - 120) return 'evening';
 return 'day';
 }

 /** "Good morning, luv." — Luvli's voice, tuned to the hour. */
 function greeting(state, date) {
 const name = (state && state.profile && state.profile.name) ? ', ' + state.profile.name : ', luv';
 const hour = (date || new Date()).getHours();
 if (hour < 5) return 'Still awake' + name + '?';
 if (hour < 12) return 'Good morning' + name + '.';
 if (hour < 17) return 'Good afternoon' + name + '.';
 if (hour < 21) return 'Good evening' + name + '.';
 return 'Time to wind down' + name + '.';
 }

 /** Short description of where the day is, for the hero card. */
 function dayPhaseText(state, date) {
 const map = {
 early: 'Early start — gentle does it',
 day: 'Here for you all day',
 evening: 'Winding down soon',
 night: "Let's prepare for tomorrow"
 };
 return map[dayPhase(state, date)] || map.day;
 }

 /* ----------------------- categories & priorities ------------------------ */
 const CATEGORIES = {
 study:  { label: 'Study',  icon: 'book' },
 work:  { label: 'Work',  icon: 'briefcase' },
 class:  { label: 'Class',  icon: 'graduation' },
 project:  { label: 'Project',  icon: 'palette' },
 exercise:  { label: 'Exercise',  icon: 'activity' },
 food:  { label: 'Food',  icon: 'utensils', protect: true },
 selfcare:  { label: 'Self-care',  icon: 'droplet', protect: true },
 cleaning:  { label: 'Cleaning',  icon: 'spray' },
 errands:  { label: 'Errands',  icon: 'bag' },
 personal:  { label: 'Personal',  icon: 'heart', protect: true },
 appointment: { label: 'Appointment',  icon: 'calendar-check', protect: true },
 sleep:  { label: 'Sleep',  icon: 'moon', protect: true },
 break:  { label: 'Break',  icon: 'coffee', protect: true },
 wellness:  { label: 'Wellness',  icon: 'leaf', protect: true },
 custom:  { label: 'Something else', icon: 'sparkles' }
 };

 const PRIORITIES = {
 high:  { label: 'High', weight: 0 },
 medium: { label: 'Medium', weight: 1 },
 low:  { label: 'Low', weight: 2 }
 };

 /** Gentle ideas for when the user needs to look after themselves. */
 const WELLNESS_IDEAS = [
 { name: 'Drink some water', icon: 'droplet', category: 'wellness', minutes: 5 },
 { name: 'Take a little break', icon: 'leaf', category: 'wellness', minutes: 10 },
 { name: 'Move your body', icon: 'activity', category: 'exercise', minutes: 15 },
 { name: 'Eat something nice', icon: 'utensils', category: 'food', minutes: 20 },
 { name: 'Screen break', icon: 'eye-off', category: 'wellness', minutes: 10 },
 { name: 'Skincare moment', icon: 'droplet', category: 'selfcare', minutes: 15 }
 ];

 const category = (key) => CATEGORIES[key] || CATEGORIES.custom;
 const priority = (key) => PRIORITIES[key] || PRIORITIES.medium;
 const iconFor = (task) => ico(task.icon || category(task.category).icon);
 const isProtected = (task) => Boolean(category(task.category).protect);
 const isHeavy = (task) => ['study', 'work', 'class', 'project'].indexOf(task.category) > -1;

 /** <option> list for the category pickers. */
 function categoryOptions(selected) {
 return Object.keys(CATEGORIES).map((key) => {
 const c = CATEGORIES[key];
 return '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' +
 c.label + '</option>';
 }).join('');
 }

 /* --------------------------- tasks of one day --------------------------- */
 const byStart = (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start);

 function tasksFor(dateKey, state) {
 return (state.tasks || []).filter((t) => t.date === dateKey).sort(byStart);
 }

 /** Things that are not finished yet. */
 const pending = (tasks) => tasks.filter((t) => !t.completed);

 /** Total planned minutes for a day. */
 const plannedMinutes = (tasks) => tasks.reduce((sum, t) => sum + durationOf(t), 0);

 /** { total, completed, percent, minutesPlanned, minutesDone } */
 function dayProgress(dateKey, state) {
 const tasks = tasksFor(dateKey, state);
 const completed = tasks.filter((t) => t.completed);
 return {
 total: tasks.length,
 completed: completed.length,
 percent: Utils.percent(completed.length, tasks.length),
 minutesPlanned: plannedMinutes(tasks),
 minutesDone: plannedMinutes(completed)
 };
 }

 /**
 * The heart of Luvli: where are we in the day right now?
 * @returns {{ current, next, later, missed, done, upcoming, phase,
 *  minutesToNext, minutesLeft, progress, nowMin }}
 */
 function liveStatus(dateKey, state, nowMin) {
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const tasks = tasksFor(dateKey, state);
 const done = tasks.filter((t) => t.completed);
 const open = pending(tasks);

 const current = open.find((t) =>
 timeToMinutes(t.start) <= now && timeToMinutes(t.end) > now) || null;

 const missed = open.filter((t) => timeToMinutes(t.end) <= now);
 const upcoming = open.filter((t) => timeToMinutes(t.start) > now);
 const next = current ? (upcoming[0] || null) : (upcoming[0] || null);

 let phase = 'active';
 if (!tasks.length) phase = 'empty';
 else if (current) phase = 'active';
 else if (upcoming.length) phase = now < timeToMinutes(upcoming[0].start) ? 'free' : 'before';
 else if (missed.length) phase = 'behind';
 else phase = 'after';

 return {
 dateKey,
 nowMin: now,
 current,
 next,
 later: upcoming.slice(1),
 upcoming,
 missed,
 done,
 tasks,
 phase,
 minutesToNext: next ? Math.max(0, timeToMinutes(next.start) - now) : null,
 minutesLeft: current ? Math.max(0, timeToMinutes(current.end) - now) : null,
 progress: dayProgress(dateKey, state)
 };
 }

 /* ------------------------- free time & outlook -------------------------- */
 const bufferMinutes = (state) => Number((state.settings && state.settings.bufferMinutes) || 0);
 const sleepMinutes = (state) => timeToMinutes((state.settings && state.settings.sleepTime) || '22:30');
 const wakeMinutes = (state) => timeToMinutes((state.settings && state.settings.wakeTime) || '07:00');
 const maxPlannedMinutes = (state) => Number((state.settings && state.settings.maxPlannedHours) || 10) * 60;

 /**
 * Free stretches on a day, between `fromMin` and `untilMin`.
 * Anything already scheduled (and not finished) counts as busy.
 */
 function freeSlots(dateKey, state, options) {
 const opts = options || {};
 const from = opts.fromMin === undefined ? nowMinutes() : opts.fromMin;
 const until = opts.untilMin === undefined ? sleepMinutes(state) : opts.untilMin;
 const buffer = opts.buffer === undefined ? bufferMinutes(state) : opts.buffer;
 const ignoreId = opts.ignoreId || null;

 const busy = tasksFor(dateKey, state)
 .filter((t) => !t.completed && t.id !== ignoreId)
 .map((t) => [timeToMinutes(t.start), timeToMinutes(t.end)])
 .concat(opts.extraBusy || [])  // e.g. a slot being planned right now
 .sort((a, b) => a[0] - b[0]);

 const slots = [];
 let cursor = Math.max(0, from);
 busy.forEach((range) => {
 if (range[1] <= cursor) return;  // already in the past
 if (range[0] > cursor) slots.push({ start: cursor, end: Math.min(range[0], until) });
 cursor = Math.max(cursor, range[1]);
 });
 if (until > cursor) slots.push({ start: cursor, end: until });

 const minimum = Math.max(10, buffer + 5);  // don't offer tiny gaps
 return slots
 .map((s) => ({ start: s.start, end: s.end, minutes: s.end - s.start }))
 .filter((s) => s.minutes >= minimum);
 }

 /** How much free time is left today, and a kind way of saying it. */
 function freeTimeUntilNext(state, dateKey, nowMin) {
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const status = liveStatus(dateKey, state, now);
 const boundary = status.current
 ? timeToMinutes(status.current.end)
 : (status.next ? timeToMinutes(status.next.start) : sleepMinutes(state));
 const minutes = Math.max(0, boundary - now);

 let reason;
 if (status.current) {
 reason = 'You have ' + Utils.formatMinutes(minutes) + ' until your next thing.';
 } else if (status.next) {
 reason = 'You have ' + Utils.formatMinutes(minutes) + ' available before ' + status.next.name + '.';
 } else if (minutes > 20) {
 reason = 'Your evening is open — ' + Utils.formatMinutes(minutes) + ' of free time.';
 } else {
 reason = 'The day is winding down, luv.';
 }
 return { minutes, boundary, reason };
 }

 /**
 * A gentle read on how today is going: anything missed, overloaded,
 * or back-to-back with no room to breathe?
 */
 function dayOutlook(state, dateKey, nowMin) {
 const today = dateKey || Utils.todayKey();
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const status = liveStatus(today, state, now);
 const slots = freeSlots(today, state, { fromMin: Math.max(now, wakeMinutes(state)) });
 const freeMinutes = slots.reduce((sum, s) => sum + s.minutes, 0);
 const planned = plannedMinutes(status.tasks);
 const max = maxPlannedMinutes(state);

 const behind = status.missed.length > 0;
 const overloaded = planned > max;
 const noRoom = status.upcoming.length > 0 && freeMinutes < 20;

 let message = '';
 if (overloaded) message = "Today is quite full, luv. Let's move something gentle to tomorrow.";
 else if (behind) message = 'A couple of things slipped past. No stress — we can move them.';
 else if (noRoom) message = 'Back-to-back day. Luvli will protect your breaks.';

 return { freeMinutes, planned, max, behind, overloaded, noRoom, missed: status.missed.length, slots, message, status };
 }

 /* --------------------------- Optimize My Day ---------------------------- */
 const byPriorityThenLength = (a, b) =>
 priority(a.priority).weight - priority(b.priority).weight || durationOf(b) - durationOf(a);

 /**
 * Reorganise the rest of today: missed activities get a new home and the
 * things on the user's own list are placed into the time that is actually
 * free. Sleep, meals, breaks and appointments are never touched.
 */
 function optimizeDay(state, dateKey, nowMin) {
 const today = dateKey || Utils.todayKey();
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const buffer = bufferMinutes(state);
 const max = maxPlannedMinutes(state);

 const moved = [];
 const scheduled = [];
 const unscheduled = [];

 const insights = focusInsights(state);

 /** The earliest stretch that honestly fits `minutes` (+ breathing room). */
 function findSlot(minutes, preferPeak) {
 const slots = freeSlots(today, state, { fromMin: Math.max(now, wakeMinutes(state)) });
 const fits = slots.filter((option) => option.minutes >= minutes + buffer);
 if (!fits.length) return null;
 // Heavy work is nicer inside the hours this person actually focuses in
 if (preferPeak && insights.bestHour !== null && insights.hasEnoughData) {
 const peakStart = insights.bestHour * 60;
 const peak = fits.find((option) => Math.abs(option.start - peakStart) <= 150);
 if (peak) return peak;
 }
 return fits[0];
 }

 // 1) Missed activities — moved, never judged
 liveStatus(today, state, now).missed.slice().sort(byPriorityThenLength).forEach((task) => {
 const length = durationOf(task);
 const slot = findSlot(length);
 if (!slot) { unscheduled.push({ kind: 'task', id: task.id, name: task.name, priority: task.priority }); return; }
 task.start = minutesToTime(slot.start);
 task.end = minutesToTime(slot.start + length);
 task.rescheduled = true;
 moved.push({ id: task.id, name: task.name, start: task.start, end: task.end });
 });

 // 2) The user's own list — placed into what is left, without overloading
 const backlog = (state.backlog || [])
 .filter((b) => b.status === 'backlog')
 .sort((a, b) => priority(a.priority).weight - priority(b.priority).weight);

 backlog.forEach((item) => {
 const length = Number(item.duration) || 30;
 const planned = plannedMinutes(tasksFor(today, state));
 if (planned + length > max) {
 unscheduled.push({ kind: 'backlog', id: item.id, name: item.name, priority: item.priority, full: true });
 return;
 }
 const slot = findSlot(length, isHeavy(item));
 if (!slot) { unscheduled.push({ kind: 'backlog', id: item.id, name: item.name, priority: item.priority }); return; }

 state.tasks.push({
 id: Utils.uid('task'),
 date: today,
 name: item.name,
 category: item.category || 'custom',
 start: minutesToTime(slot.start),
 end: minutesToTime(slot.start + length),
 priority: item.priority || 'medium',
 notes: item.notes || '',
 completed: false,
 fromBacklog: item.id,
 createdAt: new Date().toISOString()
 });
 item.status = 'scheduled';
 scheduled.push({ id: item.id, name: item.name, start: minutesToTime(slot.start), end: minutesToTime(slot.start + length) });
 });

 return { moved, scheduled, unscheduled, buffer };
 }

 /* --------------------------- Lighten My Day ---------------------------- */
 /**
 * Move the gentlest things to tomorrow so today stops feeling heavy.
 * High-priority and protected activities (meals, rest, appointments) stay.
 */
 function lightenDay(state, dateKey, nowMin) {
 const today = dateKey || Utils.todayKey();
 const tomorrow = Utils.addDays(today, 1);

 const movable = pending(tasksFor(today, state))
 .filter((t) => !isProtected(t) && t.priority !== 'high')
 .sort((a, b) => priority(b.priority).weight - priority(a.priority).weight || durationOf(b) - durationOf(a));

 const movedTasks = [];
 let freed = 0;
 movable.slice(0, 3).forEach((task) => {
 freed += durationOf(task);
 movedTasks.push({ id: task.id, name: task.name, to: tomorrow, start: task.start, end: task.end });
 task.date = tomorrow;
 task.movedFrom = today;
 });

 if (!movedTasks.length) {
 return {
 movedTasks, freed, tomorrow,
 message: 'Your day is already gentle, luv. Nothing needs moving.'
 };
 }
 return {
 movedTasks, freed, tomorrow,
 message: 'I moved ' + movedTasks.length + ' thing' + (movedTasks.length > 1 ? 's' : '') +
 ' to tomorrow. Your day is lighter now.'
 };
 }

 /* ------------------- What should I do now? (recommend) ------------------ */
 /**
 * Every sensible answer to "what should I do now?", best first.
 * app.js shows suggestion[0] and lets the user cycle through the rest.
 */
 function suggestions(state, dateKey, nowMin) {
 const today = dateKey || Utils.todayKey();
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const status = liveStatus(today, state, now);
 const buffer = bufferMinutes(state);
 const list = [];

 // 1) Something is happening right now
 if (status.current) {
 list.push({
 kind: 'task', id: status.current.id, task: status.current,
 name: status.current.name, icon: iconFor(status.current),
 category: status.current.category, goal: status.current.notes,
 badge: 'Happening now', windowMinutes: status.minutesLeft,
 reason: "You're in the middle of this one, luv. Stay with it while it's flowing."
 });
 }

 // 2) Something starts very soon — a good moment to settle in
 if (status.next && status.minutesToNext !== null && status.minutesToNext <= 20) {
 list.push({
 kind: 'task', id: status.next.id, task: status.next,
 name: status.next.name, icon: iconFor(status.next),
 category: status.next.category, goal: status.next.notes,
 badge: 'Coming up', windowMinutes: status.minutesToNext,
 reason: 'This one starts ' + countdown(status.minutesToNext) + '. A good moment to settle in.'
 });
 }

 // 3) Something that slipped past — always gently, never shaming
 status.missed.slice().sort(byPriorityThenLength).forEach((task) => {
 list.push({
 kind: 'task', id: task.id, task,
 name: task.name, icon: iconFor(task), category: task.category,
 goal: task.notes, badge: 'This one slipped by',
 windowMinutes: null,
 reason: "You missed this one, luv. That's okay. Want to do it now?"
 });
 });

 // 4) Fit something from "my list" into the free stretch before the next plan
 const gap = freeTimeUntilNext(state, today, now);
 const insights = focusInsights(state);
 const inPeakWindow = isPeakHour(state, now);
 const fitting = (state.backlog || [])
 .filter((b) => b.status === 'backlog' && (Number(b.duration) || 30) + buffer <= gap.minutes)
 .sort((a, b) => priority(a.priority).weight - priority(b.priority).weight)
 .slice(0, 3);

 fitting.forEach((item) => {
 const heavy = isHeavy(item);
 const peakNote = (heavy && inPeakWindow && insights.bestHour !== null)
 ? ' You usually focus best around ' + formatTime(minutesToTime(insights.bestHour * 60), state) +
 ', so this is a lovely moment for it.'
 : '';
 list.push({
 kind: 'backlog', id: item.id, item,
 name: item.name, icon: iconFor(item), category: item.category,
 goal: item.notes, minutes: Number(item.duration) || 30,
 badge: heavy && inPeakWindow ? 'Strong focus window' : 'From your list',
 windowMinutes: gap.minutes,
 reason: gap.reason + peakNote
 });
 });

 // 5) Looking after the person, not just the plan
 const breakCheck = needsBreak(state, today, now);
 const workingLong = status.current && status.minutesLeft !== null &&
 (timeToMinutes(status.current.end) - timeToMinutes(status.current.start)) > 60;

 if (breakCheck.needed || workingLong || status.done.length >= 3 || gap.minutes < 25) {
 const doneNames = status.done.map((t) => t.name);
 const idea = WELLNESS_IDEAS.find((w) => doneNames.indexOf(w.name) === -1) || WELLNESS_IDEAS[0];
 list.push({
 kind: 'wellness', name: idea.name, icon: idea.icon, category: idea.category,
 minutes: idea.minutes,
 badge: breakCheck.needed ? 'You have earned this' : 'For you',
 windowMinutes: idea.minutes,
 reason: breakCheck.needed
 ? "You've been going for " + Utils.formatMinutes(breakCheck.minutesSince) + ' without a pause, luv. ' +
 'Take a little break. You deserve it.'
 : "You've been going for a while, luv. Take a little break. You deserve it."
 });
 }

 // 6) Nothing at all planned yet
 if (!list.length) {
 list.push({
 kind: 'empty', name: 'Plan your day with Luvli', icon: 'sparkles',
 category: 'custom', badge: "Let's begin", windowMinutes: null,
 reason: "Your day is still a blank page. Tell Luvli what you need to do and we'll shape it together."
 });
 }

 return list;
 }

 /** Just the best suggestion (or null). */
 function recommend(state, dateKey, nowMin) {
 const list = suggestions(state, dateKey, nowMin);
 return list.length ? list[0] : null;
 }

 /* ======================= PHASE 1: smarter planning ====================== */

 /* --------------------------- clash detection ----------------------------- */
 /**
 * Luvli's day functions take (dateKey, state). Passing them the other way
 * round is an easy mistake, so this quietly accepts both orders.
 */
 function bothWays(dateKey, state) {
 if (dateKey && typeof dateKey === 'object') return { day: state, data: dateKey };
 return { day: dateKey, data: state };
 }

 /** Everything that would overlap a proposed time. */
 function findConflicts(dateKey, state, candidate, ignoreId) {
 const args = bothWays(dateKey, state);
 const start = timeToMinutes(candidate.start);
 const end = timeToMinutes(candidate.end);
 return tasksFor(args.day, args.data).filter((task) => {
 if (ignoreId && task.id === ignoreId) return false;
 const from = timeToMinutes(task.start);
 const to = timeToMinutes(task.end);
 return from < end && start < to;
 });
 }

 /**
 * Nudge whatever would clash into the next free stretch, so the new activity
 * can keep the time the user asked for. Finished activities and protected
 * ones (meals, rest, appointments, sleep) are never moved.
 */
 function fitAround(dateKey, state, candidate, ignoreId) {
 const args = bothWays(dateKey, state);
 const day = args.day;
 const data = args.data;
 const conflicts = findConflicts(day, data, candidate, ignoreId);
 const locked = conflicts.filter((task) => task.completed || isProtected(task));
 const movable = conflicts.filter((task) => !task.completed && !isProtected(task)).sort(byStart);
 const moved = [];
 const candidateRange = [timeToMinutes(candidate.start), timeToMinutes(candidate.end)];

 movable.forEach((task) => {
 const length = durationOf(task);
 const slots = freeSlots(day, data, {
 fromMin: timeToMinutes(candidate.end),
 ignoreId: task.id,
 extraBusy: [candidateRange]
 });
 const slot = slots.find((option) => option.minutes >= length + bufferMinutes(data));
 if (!slot) return;  // nowhere sensible: leave it alone
 task.start = minutesToTime(slot.start);
 task.end = minutesToTime(slot.start + length);
 task.rescheduled = true;
 moved.push({ id: task.id, name: task.name, start: task.start, end: task.end });
 });

 return { conflicts, locked, moved };
 }

 /* --------------------- "will I actually finish today?" ------------------- */
 /**
 * Compares what is still open with the time that is honestly free.
 * @returns {{ needed, free, ratio, level:'ok'|'tight'|'over', overflow, open }}
 */
 function feasibility(state, dateKey, nowMin) {
 const args = bothWays(dateKey, state);
 const today = args.day || Utils.todayKey();
 const data = args.data;
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const open = pending(tasksFor(today, data));
 const needed = plannedMinutes(open);
 const slots = freeSlots(today, data, { fromMin: Math.max(now, wakeMinutes(data)) });
 const free = slots.reduce((sum, slot) => sum + slot.minutes, 0);

 let ratio = 0;
 if (free > 0) ratio = needed / free;
 else if (needed > 0) ratio = 99;

 let level = 'ok';
 if (needed > free) level = 'over';
 else if (ratio > 0.85) level = 'tight';

 // When it does not fit, the gentlest candidates to move are low priority and short
 const overflow = [];
 if (level === 'over') {
 let excess = needed - free;
 open.slice()
 .filter((task) => !isProtected(task) && task.priority !== 'high')
 .sort((a, b) => priority(b.priority).weight - priority(a.priority).weight || durationOf(a) - durationOf(b))
 .forEach((task) => {
 if (excess > 0) { overflow.push(task); excess -= durationOf(task); }
 });
 }

 return { needed, free, ratio, level, overflow, open: open.length,
 message: feasibilityMessage(level, needed, free) };
 }

 function feasibilityMessage(level, needed, free) {
 if (level === 'over') {
 return 'Today needs ' + Utils.formatMinutes(needed) + ' but only ' + Utils.formatMinutes(free) +
 ' are still free. Let\'s move something gentle to tomorrow.';
 }
 if (level === 'tight') {
 return 'Today is full but doable — ' + Utils.formatMinutes(needed) + ' of work, ' +
 Utils.formatMinutes(free) + ' free. I will protect your breaks.';
 }
 return 'Today fits comfortably: ' + Utils.formatMinutes(needed) + ' of work with ' +
 Utils.formatMinutes(free) + ' free.';
 }

 /** Move the extra, non-essential activities to tomorrow so today can breathe. */
 function trimDay(state, dateKey, nowMin) {
 const args = bothWays(dateKey, state);
 const today = args.day || Utils.todayKey();
 const data = args.data;
 const info = feasibility(today, data, nowMin);
 const tomorrow = Utils.addDays(today, 1);
 const moved = [];

 info.overflow.forEach((task) => {
 task.movedFrom = today;
 task.date = tomorrow;
 moved.push({ id: task.id, name: task.name, minutes: durationOf(task) });
 });

 const freed = moved.reduce((total, item) => total + item.minutes, 0);
 return { moved, freed, info, stillShort: Math.max(0, info.needed - info.free - freed) };
 }

 /* ---------------------- natural-language quick add ---------------------- */
 /**
 * Words that suggest a category. Longer phrases are matched first so that
 * "screen break" wins over "break" and "breakfast" over "break".
 */
 const QUICK_CATEGORY_WORDS = [
 { category: 'study',  words: ['python', 'javascript', 'java', 'maths', 'math', 'study', 'revise', 'revision', 'homework', 'assignment', 'essay', 'exam', 'flashcards', 'notes', 'textbook', 'course', 'learning'] },
 { category: 'class',  words: ['lecture', 'seminar', 'tutorial', 'class', 'lesson'] },
 { category: 'work',  words: ['work', 'client', 'emails', 'email', 'meeting', 'standup', 'report', 'invoice', 'shift'] },
 { category: 'project',  words: ['portfolio', 'project', 'design', 'build', 'code', 'coding', 'website', 'app', 'draft', 'figma', 'prototype'] },
 { category: 'exercise',  words: ['gym', 'workout', 'run', 'walk', 'yoga', 'pilates', 'stretch', 'swim', 'exercise', 'sport', 'dance'] },
 { category: 'food',  words: ['breakfast', 'lunch', 'dinner', 'supper', 'snack', 'cook', 'meal', 'eat', 'coffee', 'tea', 'groceries'] },
 { category: 'selfcare',  words: ['skincare', 'shower', 'hair', 'bath', 'self care', 'selfcare', 'journal', 'meditate', 'meditation', 'breathe', 'face mask'] },
 { category: 'cleaning',  words: ['clean', 'tidy', 'laundry', 'dishes', 'vacuum', 'organise', 'organize', 'declutter', 'bed sheets'] },
 { category: 'errands',  words: ['shopping', 'shop', 'errand', 'errands', 'post office', 'bank', 'pick up', 'collect', 'drop off'] },
 { category: 'personal',  words: ['call', 'message', 'text', 'friend', 'family', 'birthday', 'personal', 'date night'] },
 { category: 'appointment', words: ['appointment', 'dentist', 'doctor', 'interview', 'haircut', 'clinic'] },
 { category: 'sleep',  words: ['wind down', 'wind-down', 'bedtime', 'nap', 'sleep', 'bed'] },
 { category: 'wellness',  words: ['screen break', 'water', 'hydrate'] },
 { category: 'break',  words: ['break', 'rest', 'pause', 'unwind'] }
 ];

 /** Soft time phrases, longest first so "after lunch" beats "lunch". */
 const QUICK_TIME_WORDS = [
 { phrase: 'before bed', time: '21:30' },
 { phrase: 'after dinner', time: '20:00' },
 { phrase: 'after lunch', time: '13:30' },
 { phrase: 'after work', time: '18:00' },
 { phrase: 'first thing', time: '08:00' },
 { phrase: 'late morning', time: '11:00' },
 { phrase: 'lunchtime', time: '12:30' },
 { phrase: 'midday', time: '12:00' },
 { phrase: 'tonight', time: '19:00' },
 { phrase: 'evening', time: '18:30' },
 { phrase: 'afternoon', time: '14:00' },
 { phrase: 'morning', time: '09:00' }
 ];

 const QUICK_HIGH_WORDS = ['high priority', 'urgent', 'important', 'asap', 'critical', 'must do', 'high'];
 const QUICK_LOW_WORDS = ['low priority', 'someday', 'maybe', 'eventually', 'when i can', 'if i can', 'low'];
 const QUICK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

 const escapeForRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

 /** Does this text contain that word/phrase as a whole word? */
 function hasWord(text, word) {
 return new RegExp('(^|[^a-z])' + escapeForRegex(word) + '([^a-z]|$)', 'i').test(text);
 }

 /** Remove a word/phrase from the text (used to clean up the activity name). */
 function stripWord(text, word) {
 return String(text).replace(new RegExp('(^|[^a-z])' + escapeForRegex(word) + '([^a-z]|$)', 'gi'), ' ');
 }

 /**
 * Understand a sentence like "python 45m high tomorrow 10:00",
 * "clean my room 30 mins" or "every weekday gym 7:00 for 1h".
 * Nothing leaves the device — this is a small local parser.
 * @returns {{ name, minutes, priority, category, date, start, repeat,
 *  matched:string[], understood:boolean }}
 */
 function parseQuickAdd(text, state, baseDate) {
 const original = String(text || '').trim();
 const found = {
 name: original, minutes: null, priority: null, category: null,
 date: null, start: null, repeat: null, matched: []
 };
 if (!original) { found.understood = false; return found; }

 const today = baseDate || Utils.todayKey();
 let working = ' ' + original + ' ';

 /* ---- how long will it take? "45m", "1.5 h", "for 30", "25 minutes" --- */
 const durationMatch = working.match(/\b(?:for\s+)?(\d{1,3}(?:[.,]\d+)?)\s*(minutes|minute|mins|min|m|hours|hour|hrs|hr|h)\b/i)
 || working.match(/\bfor\s+(\d{1,3})\b/i);
 if (durationMatch) {
 const value = parseFloat(String(durationMatch[1]).replace(',', '.'));
 const unit = String(durationMatch[2] || 'min').toLowerCase();
 found.minutes = Utils.clamp(Math.round(unit.charAt(0) === 'h' ? value * 60 : value), 5, 480);
 found.matched.push(Utils.formatMinutes(found.minutes));
 working = working.replace(durationMatch[0], ' ');
 }

 /* ---- how important is it? (longest phrase wins) ---------------------- */
 const highHit = QUICK_HIGH_WORDS.slice().sort((a, b) => b.length - a.length)
 .filter((word) => hasWord(working, word))[0];
 const lowHit = QUICK_LOW_WORDS.slice().sort((a, b) => b.length - a.length)
 .filter((word) => hasWord(working, word))[0];
 if (highHit) {
 found.priority = 'high';
 found.matched.push('high priority');
 working = stripWord(working, highHit);
 } else if (lowHit) {
 found.priority = 'low';
 found.matched.push('low priority');
 working = stripWord(working, lowHit);
 }

 /* ---- does it repeat? ------------------------------------------------ */
 if (/\b(every|each)\s+weekdays?\b/i.test(working)) {
 found.repeat = 'weekdays';
 working = working.replace(/\b(every|each)\s+weekdays?\b/gi, ' ');
 } else if (/\b(every\s+day|each\s+day|daily)\b/i.test(working)) {
 found.repeat = 'daily';
 working = working.replace(/\b(every\s+day|each\s+day|daily)\b/gi, ' ');
 } else if (/\b(weekly|every\s+week)\b/i.test(working)) {
 found.repeat = 'weekly';
 working = working.replace(/\b(weekly|every\s+week)\b/gi, ' ');
 }
 if (found.repeat) found.matched.push('repeats ' + found.repeat);

 /* ---- which category does it sound like? (longest phrase first) ------- */
 // We detect it but keep the words in the name — "clean my room" should stay
 // "Clean my room", and the category simply gets pre-selected for the user.
 const candidates = [];
 QUICK_CATEGORY_WORDS.forEach((group) => {
 group.words.forEach((word) => candidates.push({ word: word, category: group.category, length: word.length }));
 });
 candidates.sort((a, b) => b.length - a.length);
 for (let i = 0; i < candidates.length; i++) {
 if (hasWord(working, candidates[i].word)) {
 found.category = candidates[i].category;
 break;
 }
 }

 /* ---- what time of day? explicit first -------------------------------- */
 // "10am" / "3 pm" ·  "10:00" / "at 14:30" ·  "at 3"
 const withSuffix = working.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
 const clockTime = working.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
 const atOnly = working.match(/\bat\s+(\d{1,2})\b/i);
 const timeMatch = withSuffix || clockTime || atOnly;

 if (timeMatch) {
 let hour = Number(timeMatch[1]);
 const minutes = Number(timeMatch[2] || 0);
 const suffix = String(timeMatch[3] || '').toLowerCase();
 if (suffix === 'pm' && hour < 12) hour += 12;
 if (suffix === 'am' && hour === 12) hour = 0;
 // A bare hour ("at 3") is usually the afternoon; "7:00" is left alone
 if (!suffix && timeMatch === atOnly && hour <= 7) hour += 12;
 if (hour >= 0 && hour <= 23) found.start = minutesToTime(hour * 60 + minutes);
 working = working.replace(timeMatch[0], ' ');
 }

 /* ---- soft times: "in the morning", "after lunch", "tonight" --------- */
 if (!found.start) {
 for (let i = 0; i < QUICK_TIME_WORDS.length; i++) {
 if (hasWord(working, QUICK_TIME_WORDS[i].phrase)) {
 found.start = QUICK_TIME_WORDS[i].time;
 working = stripWord(working, QUICK_TIME_WORDS[i].phrase);
 break;
 }
 }
 }

 /* ---- which day? "tomorrow", "friday", "next week" ------------------- */
 if (hasWord(working, 'day after tomorrow')) {
 found.date = Utils.addDays(today, 2);
 working = stripWord(working, 'day after tomorrow');
 } else if (hasWord(working, 'tomorrow') || hasWord(working, 'tmrw')) {
 found.date = Utils.addDays(today, 1);
 working = stripWord(stripWord(working, 'tomorrow'), 'tmrw');
 } else if (hasWord(working, 'next week')) {
 found.date = Utils.addDays(today, 7);
 working = stripWord(working, 'next week');
 } else {
 const todayIndex = Utils.parseDateKey(today).getDay();
 for (let i = 0; i < QUICK_DAYS.length; i++) {
 if (hasWord(working, QUICK_DAYS[i])) {
 found.date = Utils.addDays(today, (i - todayIndex + 7) % 7);
 working = stripWord(working, QUICK_DAYS[i]);
 break;
 }
 }
 }

 /* ---- whatever is left is the activity name --------------------------- */
 let name = working.replace(/\s+/g, ' ').replace(/^[\s\-–—,:.;]+|[\s\-–—,:.;]+$/g, '').trim();
 if (!name && found.categoryWord) name = found.categoryWord;  // e.g. "groceries saturday low"
 if (!name) name = original;
 found.name = name.charAt(0).toUpperCase() + name.slice(1);

 /* ---- sensible defaults ---------------------------------------------- */
 if (found.start && !found.date) {
 // A time on its own means the next time that happens
 found.date = timeToMinutes(found.start) <= nowMinutes() ? Utils.addDays(today, 1) : today;
 }
 if (!found.date && found.repeat) found.date = today;
 found.understood = found.matched.length > 0 || Boolean(found.start) || Boolean(found.date);
 return found;
 }

 /** A short "I read: 45m · high priority · Tomorrow at 10:00" summary. */
 function describeQuickAdd(parsed, state) {
 const bits = [];
 if (parsed.minutes) bits.push(Utils.formatMinutes(parsed.minutes));
 if (parsed.priority) bits.push(parsed.priority + ' priority');
 if (parsed.category) {
 const meta = category(parsed.category);
 bits.push(meta.icon + ' ' + meta.label);
 }
 if (parsed.date) bits.push(Utils.relativeDateLabel(parsed.date));
 if (parsed.start) bits.push('at ' + formatTime(parsed.start, state));
 if (parsed.repeat) bits.push('every ' + parsed.repeat);
 return bits.join(' · ');
 }


 /* ==================== PHASE 2: a brainier scheduler ==================== */

 /* ---------------------------- recurring work ---------------------------- */
 /** The next date for a repeating activity, or null when it does not repeat. */
 function nextRepeatDate(repeat, dateKey) {
 if (repeat === 'daily') return Utils.addDays(dateKey, 1);
 if (repeat === 'weekly') return Utils.addDays(dateKey, 7);
 if (repeat === 'weekdays') {
 let next = Utils.addDays(dateKey, 1);
 const day = Utils.parseDateKey(next).getDay();  // 0 = Sunday, 6 = Saturday
 if (day === 6) next = Utils.addDays(next, 2);
 else if (day === 0) next = Utils.addDays(next, 1);
 return next;
 }
 return null;
 }

 const repeatLabel = (repeat) => ({
 none: 'Just once',
 daily: 'Every day',
 weekdays: 'Weekdays',
 weekly: 'Every week'
 }[repeat] || 'Just once');

 /**
 * Fill in the next couple of weeks for anything that repeats, so the user
 * never has to type the same routine again.
 * @returns {string[]} the dates that were created
 */
 function materialiseRecurring(state, days) {
 const horizon = Utils.addDays(Utils.todayKey(), days || 7);
 const existing = [];
 (state.tasks || []).forEach((task) => {
 existing.push((task.seriesId || task.id) + '|' + task.date);
 });

 const created = [];
 (state.tasks || []).filter((task) => task.repeat && task.repeat !== 'none').forEach((source) => {
 const seriesId = source.seriesId || source.id;
 if (!source.seriesId) source.seriesId = seriesId;  // adopt older activities
 let cursor = source.date;
 for (let step = 0; step < 21; step++) {  // never more than three weeks ahead
 const next = nextRepeatDate(source.repeat, cursor);
 if (!next || next > horizon) break;
 cursor = next;
 const key = seriesId + '|' + next;
 if (existing.indexOf(key) > -1) continue;
 existing.push(key);
 state.tasks.push({
 id: Utils.uid('task'),
 seriesId: seriesId,
 repeat: source.repeat,
 date: next,
 name: source.name,
 start: source.start,
 end: source.end,
 category: source.category,
 priority: source.priority,
 notes: source.notes,
 completed: false,
 completedAt: null,
 createdAt: new Date().toISOString()
 });
 created.push(next);
 }
 });

 return created;
 }

 /** Stop a repeating activity from a chosen day onwards. */
 function stopSeries(state, seriesId, fromDate) {
 let stopped = 0;
 (state.tasks || []).forEach((task) => {
 if (task.seriesId === seriesId && task.date >= fromDate) {
 task.repeat = 'none';
 stopped += 1;
 }
 });
 return stopped;
 }

 /* ---------------------------- routine templates ------------------------- */
 const ROUTINES = [
 {
 key: 'morning', name: 'Morning routine', icon: 'sun',
 anchor: 'wake',
 blocks: [
 { name: 'Wash up & get ready', category: 'selfcare', minutes: 20 },
 { name: 'Breakfast & water', category: 'food', minutes: 20 },
 { name: 'Plan the day with Luvli', category: 'personal', minutes: 10 }
 ]
 },
 {
 key: 'study', name: 'Study block', icon: 'book',
 anchor: 'now',
 blocks: [
 { name: 'Warm up', category: 'study', minutes: 10 },
 { name: 'Deep focus', category: 'study', minutes: 50 },
 { name: 'Break', category: 'break', minutes: 10 },
 { name: 'Review notes', category: 'study', minutes: 15 }
 ]
 },
 {
 key: 'winddown', name: 'Wind down', icon: 'moon',
 anchor: 'sleep',
 blocks: [
 { name: 'Tidy up', category: 'cleaning', minutes: 15 },
 { name: 'Skincare', category: 'selfcare', minutes: 15 },
 { name: 'Journal & quiet time', category: 'personal', minutes: 10 }
 ]
 }
 ];

 const routine = (key) => ROUTINES.filter((item) => item.key === key)[0] || null;

 /** Where a routine should begin. */
 function routineStart(routineDef, state, dateKey, nowMin) {
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 if (routineDef.anchor === 'wake') return Math.max(wakeMinutes(state), Math.round(wakeMinutes(state) / 5) * 5);
 if (routineDef.anchor === 'sleep') return Math.max(wakeMinutes(state), sleepMinutes(state) - 100);
 if (dateKey !== Utils.todayKey()) return wakeMinutes(state);
 return Math.max(Math.ceil(now / 5) * 5, wakeMinutes(state));
 }

 /**
 * Drop a whole routine into the day, back to back, around what is already
 * planned. Nothing protected is ever moved.
 */
 function applyRoutine(state, key, dateKey, nowMin) {
 const def = routine(key);
 const day = dateKey || Utils.todayKey();
 if (!def) return { added: [], routine: null };

 let cursor = routineStart(def, state, day, nowMin);
 const added = [];

 def.blocks.forEach((block) => {
 const slots = freeSlots(day, state, { fromMin: cursor });
 const slot = slots.find((option) => option.minutes >= block.minutes + bufferMinutes(state));
 if (!slot) return;
 const start = slot.start;
 const end = start + block.minutes;
 state.tasks.push({
 id: Utils.uid('task'),
 date: day,
 name: block.name,
 start: minutesToTime(start),
 end: minutesToTime(end),
 category: block.category,
 priority: 'medium',
 notes: 'Part of your ' + def.name.toLowerCase(),
 repeat: 'none',
 completed: false,
 createdAt: new Date().toISOString()
 });
 added.push({ name: block.name, start: minutesToTime(start), end: minutesToTime(end) });
 cursor = end;
 });

 return { added, routine: def };
 }
 /* ------------------------- energy & estimates --------------------------- */
 /**
 * Which hours does this person actually get things done in?
 * Learned from finished focus sessions and completed activities — no server,
 * no model: just their own history.
 */
 function focusInsights(state, options) {
 const opts = options || {};
 const byHour = new Array(24).fill(0);
 const byCategoryHours = {};
 const categoryMinutes = {};

 (state.sessions || []).forEach((session) => {
 const stamp = session.endedAt ? new Date(session.endedAt) : null;
 const hour = stamp && !isNaN(stamp.getTime()) ? stamp.getHours() : null;
 if (hour !== null) byHour[hour] += session.minutes || 0;
 });

 (state.tasks || []).forEach((task) => {
 if (!task.completed) return;
 const stamp = task.completedAt ? new Date(task.completedAt) : null;
 const hour = stamp && !isNaN(stamp.getTime()) ? stamp.getHours() : null;
 if (hour !== null) {
 byHour[hour] += 1;
 if (!byCategoryHours[task.category]) byCategoryHours[task.category] = new Array(24).fill(0);
 byCategoryHours[task.category][hour] += 1;
 }
 const length = durationOf(task);
 if (length > 0) {
 if (!categoryMinutes[task.category]) categoryMinutes[task.category] = [];
 categoryMinutes[task.category].push(length);
 }
 });

 const totalSamples = (state.sessions || []).length +
 (state.tasks || []).filter((task) => task.completed).length;

 let bestHour = null;
 let bestScore = 0;
 byHour.forEach((score, hour) => {
 if (hour < 5 || hour > 22) return;  // ignore the middle of the night
 if (score > bestScore) { bestScore = score; bestHour = hour; }
 });

 const averages = {};
 Object.keys(categoryMinutes).forEach((key) => {
 const list = categoryMinutes[key];
 const sum = list.reduce((total, value) => total + value, 0);
 averages[key] = { average: Math.round(sum / list.length), samples: list.length };
 });

 return {
 bestHour,
 hasEnoughData: totalSamples >= (opts.minimum || 4),
 byHour,
 byCategoryHours,
 averages,
 samples: totalSamples
 };
 }

 /** Is this hour inside the person's strongest stretch? */
 function isPeakHour(state, minutes) {
 const insights = focusInsights(state);
 if (insights.bestHour === null || !insights.hasEnoughData) return false;
 return Math.abs(minutes - insights.bestHour * 60) <= 150;  // within 2.5 hours
 }

 /** How long do things like this usually take? */
 function typicalMinutes(state, category) {
 const insights = focusInsights(state);
 const entry = insights.averages[category];
 if (!entry || entry.samples < 3) return null;
 return entry.average;
 }

 /* ------------------------------ smart breaks ---------------------------- */
 /** How long has it been since the last break, meal or rest? */
 function needsBreak(state, dateKey, nowMin) {
 const day = dateKey || Utils.todayKey();
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const breaks = tasksFor(day, state)
 .filter((task) => ['break', 'food', 'wellness', 'selfcare', 'exercise'].indexOf(task.category) > -1)
 .filter((task) => timeToMinutes(task.end) <= now);
 const lastEnd = breaks.length
 ? Math.max.apply(null, breaks.map((task) => timeToMinutes(task.end)))
 : wakeMinutes(state);
 const since = Math.max(0, now - lastEnd);
 return {
 needed: since >= 90,
 minutesSince: since,
 lastBreakEnd: minutesToTime(lastEnd),
 suggestion: since >= 150 ? 'Take a proper pause' : 'Take a little break'
 };
 }

 /* ------------------------------- day grid ------------------------------- */
 /** Height of one hour in the day grid. */
 const GRID_HOUR_PX = 58;

 /**
 * A proportional timeline of the day. Same data as the list, just easier to
 * grab: blocks can be dragged to move them and stretched to change length.
 */
 function renderDayGrid(state, dateKey, nowMin) {
 const day = dateKey || Utils.todayKey();
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const tasks = tasksFor(day, state);

 if (!tasks.length) {
 return '<div class="empty-state"><span class="empty-ico"></span><strong>Nothing on the grid yet</strong>' +
 '<p>Add an activity and you can drag it around here.</p></div>';
 }

 const starts = tasks.map((task) => timeToMinutes(task.start));
 const ends = tasks.map((task) => timeToMinutes(task.end));
 let gridStart = Math.floor(Math.min.apply(null, starts.concat([wakeMinutes(state)])) / 60) * 60;
 let gridEnd = Math.ceil(Math.max.apply(null, ends.concat([sleepMinutes(state)])) / 60) * 60;
 gridStart = Math.max(0, gridStart);
 gridEnd = Math.min(1440, Math.max(gridEnd, gridStart + 120));

 const pxPerMinute = GRID_HOUR_PX / 60;
 const height = Math.round((gridEnd - gridStart) * pxPerMinute);
 const isToday = day === Utils.todayKey();

 let hours = '';
 for (let minutes = gridStart; minutes <= gridEnd; minutes += 60) {
 const top = Math.round((minutes - gridStart) * pxPerMinute);
 hours += '<div class="grid-hour" style="top:' + top + 'px">' +
 '<span class="grid-hour-label">' + formatTime(minutesToTime(minutes), state) + '</span></div>';
 }

 // Simple lane packing so two things at the same time stay visible
 const laneEnds = [];
 const laneOf = {};
 tasks.slice().sort(byStart).forEach((task) => {
 const start = timeToMinutes(task.start);
 let lane = laneEnds.findIndex((end) => end <= start);
 if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
 laneEnds[lane] = timeToMinutes(task.end);
 laneOf[task.id] = lane;
 });
 const laneCount = Math.max(1, laneEnds.length);

 const blocks = tasks.map((task) => {
 const start = timeToMinutes(task.start);
 const end = Math.max(start + 10, timeToMinutes(task.end));
 const top = Math.round((start - gridStart) * pxPerMinute);
 const blockHeight = Math.max(30, Math.round((end - start) * pxPerMinute));
 const lane = laneOf[task.id] || 0;
 const laneWidth = 100 / laneCount;

 const classes = ['grid-block'];
 if (!task.completed && start <= now && end > now) classes.push('is-now');
 if (task.completed) classes.push('is-done');
 if (!task.completed && end <= now) classes.push('is-missed');

 return '<div class="' + classes.join(' ') + '" data-id="' + task.id + '" ' +
 'data-cat="' + esc(task.category || 'custom') + '" ' +
 'style="top:' + top + 'px;height:' + blockHeight + 'px;' +
 'left:calc(' + (lane * laneWidth) + '% + 44px);width:calc(' + laneWidth + '% - 50px)" ' +
 'title="' + esc(task.name) + ' · ' + formatRange(task.start, task.end, state) + '">' +
 '<span class="gb-grip" aria-hidden="true">⋮⋮</span>' +
 '<span class="gb-name">' + iconFor(task) + ' ' + esc(task.name) + '</span>' +
 '<span class="gb-time">' + formatRange(task.start, task.end, state) + '</span>' +
 '<span class="gb-resize" title="Drag to change the end time"></span>' +
 '</div>';
 }).join('');

 const nowLine = (isToday && now >= gridStart && now <= gridEnd)
 ? '<div class="grid-now" style="top:' + Math.round((now - gridStart) * pxPerMinute) + 'px"></div>'
 : '';

 return '<div class="grid-wrap">' +
 '<div class="grid-canvas" data-grid-start="' + gridStart + '" style="height:' + height + 'px">' +
 hours + blocks + nowLine +
 '</div></div>' +
 '<p class="grid-hint">Drag a block to move it, or drag its bottom edge to change how long it takes. ' +
 'On a tablet use the ⋮⋮ handle. Tap a block to edit it.</p>';
 }

 /* ------------------------------ rendering ------------------------------- */
 const esc = Utils.escapeHtml;


 /** Little row used in the Live day card. */
 function liveRow(task, state) {
 return '<div class="live-row" data-cat="' + esc(task.category || 'custom') + '">' +
 '<span class="live-ico">' + iconFor(task) + '</span>' +
 '<span class="live-name">' + esc(task.name) + '</span>' +
 '<span class="live-time">' + formatRange(task.start, task.end, state) + '</span></div>';
 }

 /**
 * The "RIGHT NOW" card — the screen that always answers
 * "what am I supposed to be doing right now?"
 */
 function renderRightNow(state, dateKey, nowMin) {
 const today = dateKey || Utils.todayKey();
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const status = liveStatus(today, state, now);
 const progress = status.progress;

 const barRow = progress.total
 ? '<div class="rn-bar-row"><div class="bar"><div class="bar-fill" style="width:' + progress.percent + '%"></div></div>' +
 '<span>' + progress.completed + ' / ' + progress.total + ' done</span></div>'
 : '';

 /* 1. Something is happening right now */
 if (status.current) {
 const task = status.current;
 const left = status.minutesLeft;
 return '<div class="rn-card is-live">' +
 '<div class="rn-top"><span class="rn-label">Right now</span>' +
 '<span class="chip chip-now">' + (left <= 5 ? 'Almost done' : Utils.formatMinutes(left) + ' left') + '</span></div>' +
 '<div class="rn-body">' +
 '<div class="rn-icon">' + iconFor(task) + '</div>' +
 '<div class="rn-main">' +
 '<div class="rn-name">' + esc(task.name) + '</div>' +
 '<div class="rn-time">' + formatRange(task.start, task.end, state) + '</div>' +
 (task.notes ? '<div class="rn-goal">' + esc(task.notes) + '</div>' : '') +
 '</div>' +
 '<div class="rn-actions">' +
 '<button class="btn btn-primary btn-big" type="button" data-action="start-focus" data-id="' + task.id + '">Start focus</button>' +
 '<button class="btn btn-soft" type="button" data-action="task-toggle" data-id="' + task.id + '">Mark as done</button>' +
 '</div>' +
 '</div>' + barRow +
 '<p class="rn-note">It\'s time for your next thing, luv. You\'ve got this.</p>' +
 '</div>';
 }

 /* 2. Free right now, with something coming up */
 if (status.next) {
 const next = status.next;
 const soon = status.minutesToNext !== null && status.minutesToNext <= 15;
 return '<div class="rn-card">' +
 '<div class="rn-top"><span class="rn-label">Right now</span>' +
 '<span class="chip chip-soft">Next in ' + Utils.formatMinutes(status.minutesToNext) + '</span></div>' +
 '<div class="rn-body">' +
 '<div class="rn-icon">' + ico('heart') + '</div>' +
 '<div class="rn-main">' +
 '<div class="rn-name">Free time, luv</div>' +
 '<div class="rn-time">Next: ' + iconFor(next) + ' ' + esc(next.name) + ' · ' + formatTime(next.start, state) + '</div>' +
 '<div class="rn-goal">' + (soon
 ? 'This one starts ' + countdown(status.minutesToNext) + ' — settle in when you\'re ready.'
 : 'Nothing is scheduled for this moment. Want to use the space?') + '</div>' +
 '</div>' +
 '<div class="rn-actions">' +
 '<button class="btn btn-primary btn-big" type="button" data-action="what-now">What should I do now?</button>' +
 '<button class="btn btn-soft" type="button" data-action="start-focus" data-id="' + next.id + '">Start early</button>' +
 '</div>' +
 '</div>' + barRow +
 '</div>';
 }

 /* 3. Something slipped past — never shamed */
 if (status.missed.length) {
 const first = status.missed[0];
 return '<div class="rn-card">' +
 '<div class="rn-top"><span class="rn-label">Right now</span>' +
 '<span class="chip chip-missed">' + status.missed.length + ' to move</span></div>' +
 '<div class="rn-body">' +
 '<div class="rn-icon">' + ico('heart') + '</div>' +
 '<div class="rn-main">' +
 '<div class="rn-name">' + esc(first.name) + '</div>' +
 '<div class="rn-time">' + formatRange(first.start, first.end, state) + '</div>' +
 '<div class="rn-goal">You missed this one, luv. That\'s okay.</div>' +
 '</div>' +
 '<div class="rn-actions">' +
 '<button class="btn btn-primary btn-big" type="button" data-action="task-resched" data-id="' + first.id + '">Reschedule</button>' +
 '<button class="btn btn-soft" type="button" data-action="optimize-day">Fix my whole day</button>' +
 '</div>' +
 '</div>' + barRow +
 '</div>';
 }

 /* 4. The plan is finished */
 if (status.phase === 'after') {
 return '<div class="rn-card">' +
 '<div class="rn-top"><span class="rn-label">Right now</span>' +
 '<span class="chip chip-done">Day complete</span></div>' +
 '<div class="rn-body">' +
 '<div class="rn-icon">' + ico('check-circle') + '</div>' +
 '<div class="rn-main">' +
 '<div class="rn-name">You did it, luv!</div>' +
 '<div class="rn-time">' + progress.completed + ' of ' + progress.total + ' finished today</div>' +
 '<div class="rn-goal">You\'ve done enough today. Let\'s prepare for tomorrow.</div>' +
 '</div>' +
 '<div class="rn-actions">' +
 '<button class="btn btn-primary btn-big" type="button" data-action="night-reset">' + ico('moon') + ' Nightly reset</button>' +
 '<button class="btn btn-soft" type="button" data-action="add-activity">+ Add something</button>' +
 '</div>' +
 '</div>' + barRow +
 '</div>';
 }

 /* 5. A blank page */
 return '<div class="rn-card">' +
 '<div class="rn-top"><span class="rn-label">Right now</span>' +
 '<span class="chip chip-soft">Nothing planned</span></div>' +
 '<div class="rn-body">' +
 '<div class="rn-icon">' + ico('sparkles') + '</div>' +
 '<div class="rn-main">' +
 '<div class="rn-name">A blank page, luv</div>' +
 '<div class="rn-time">Tell Luvli what you need to do today</div>' +
 '<div class="rn-goal">Add a few things and Luvli will shape a day around them.</div>' +
 '</div>' +
 '<div class="rn-actions">' +
 '<button class="btn btn-primary btn-big" type="button" data-action="add-activity">+ Add activity</button>' +
 '<button class="btn btn-soft" type="button" data-action="what-now">What should I do now?</button>' +
 '</div>' +
 '</div>' + barRow +
 '</div>';
 }

 /** RIGHT NOW / NEXT / LATER / DONE — the Live day card. */
 function renderLiveDay(state, dateKey, nowMin) {
 const today = dateKey || Utils.todayKey();
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const status = liveStatus(today, state, now);

 if (!status.tasks.length) {
 return '<div class="live-group"><span class="live-group-label">Right now</span>' +
 '<p class="live-empty">Nothing planned yet, luv. Add something sweet to your day.</p></div>';
 }

 let html = '<div class="live-group is-now"><span class="live-group-label">Right now</span>';
 if (status.current) {
 html += liveRow(status.current, state);
 html += '<span class="live-more">' + Utils.formatMinutes(status.minutesLeft) + ' left in this one</span>';
 } else if (status.next) {
 html += '<p class="live-empty">Free time — next is ' + esc(status.next.name) + ' ' + countdown(status.minutesToNext) + '.</p>';
 } else if (status.missed.length) {
 html += '<p class="live-empty">Nothing scheduled right now — ' + status.missed.length +
 ' thing' + (status.missed.length > 1 ? 's' : '') + ' to move when you\'re ready.</p>';
 } else {
 html += '<p class="live-empty">You made it through the plan, luv.</p>';
 }
 html += '</div>';

 if (status.next) {
 html += '<div class="live-group"><span class="live-group-label">Next</span>' + liveRow(status.next, state) + '</div>';
 }

 const later = status.later.slice(0, 4);
 if (later.length) {
 html += '<div class="live-group"><span class="live-group-label">Later</span>' +
 later.map((t) => liveRow(t, state)).join('') +
 (status.later.length > later.length
 ? '<span class="live-more">+ ' + (status.later.length - later.length) + ' more</span>' : '') +
 '</div>';
 }

 if (status.done.length) {
 html += '<div class="live-group"><span class="live-group-label">Done today</span>' +
 status.done.map((t) => liveRow(t, state)).join('') + '</div>';
 }

 return html;
 }

 /* ------------------- My Day timeline (one row per activity) ------------- */
 /** One activity row with its complete / edit / reschedule / delete actions. */
 function renderTaskRow(task, state, nowMin) {
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const isDone = Boolean(task.completed);
 const isNow = !isDone && timeToMinutes(task.start) <= now && timeToMinutes(task.end) > now;
 const isMissed = !isDone && timeToMinutes(task.end) <= now;

 const classes = ['tl-item'];
 if (isNow) classes.push('is-now');
 if (isDone) classes.push('is-done');
 if (isMissed) classes.push('is-missed');

 let statusChip = '';
 if (isDone) statusChip = '<span class="chip chip-done">Done ✓</span>';
 else if (isNow) statusChip = '<span class="chip chip-now">Now</span>';
 else if (isMissed) statusChip = '<span class="chip chip-missed">Missed</span>';

 const cat = category(task.category);

 return '<article class="' + classes.join(' ') + '" data-id="' + task.id + '"' +
 ' data-cat="' + esc(task.category || 'custom') + '">' +
 '<button class="tl-check" type="button" data-action="task-toggle" data-id="' + task.id + '" ' +
 'aria-label="' + (isDone ? 'Mark as not done' : 'Mark as done') + '"></button>' +
 '<div class="tl-ico">' + iconFor(task) + '</div>' +
 '<div class="tl-main">' +
 '<div class="tl-name">' + esc(task.name) + '</div>' +
 '<div class="tl-time">' + formatRange(task.start, task.end, state) + ' · ' + Utils.formatMinutes(durationOf(task)) + '</div>' +
 (task.notes ? '<div class="tl-notes">' + esc(task.notes) + '</div>' : '') +
 '<div class="tl-meta">' +
 '<span class="chip chip-soft">' + cat.icon + ' ' + cat.label + '</span>' +
 '<span class="chip chip-soft"><span class="priority-dot priority-' + (task.priority || 'medium') + '"></span>' +
 priority(task.priority).label + '</span>' +
 statusChip +
 (task.rescheduled ? '<span class="chip chip-soft">Moved by Luvli</span>' : '') +
 (task.repeat && task.repeat !== 'none'
 ? '<span class="chip chip-soft">' + ico('repeat') + ' ' + repeatLabel(task.repeat) + '</span>' : '') +
 '</div>' +
 '</div>' +
 '<div class="tl-side"><div class="tl-actions">' +
 '<button class="btn btn-ghost btn-small" type="button" data-action="task-edit" data-id="' + task.id + '">Edit</button>' +
 '<button class="btn btn-ghost btn-small" type="button" data-action="task-resched" data-id="' + task.id + '">Reschedule</button>' +
 '<button class="btn btn-danger btn-small" type="button" data-action="task-delete" data-id="' + task.id + '">Delete</button>' +
 '</div></div>' +
 '</article>';
 }

 /** The whole plan for a day (or a friendly empty state). */
 function renderTimeline(state, dateKey, nowMin) {
 const now = (nowMin === undefined) ? nowMinutes() : nowMin;
 const tasks = tasksFor(dateKey, state);
 if (!tasks.length) {
 return '<div class="empty-state"><span class="empty-ico"></span>' +
 '<strong>Nothing planned yet, luv</strong>' +
 '<p>Add your first activity and Luvli will keep you gently on track.</p>' +
 '<button class="btn btn-primary" type="button" data-action="add-activity">+ Add activity</button></div>';
 }
 return tasks.map((t) => renderTaskRow(t, state, now)).join('');
 }

 /** The user's own "I need to get this done" list. */
 function renderBacklog(state) {
 const items = (state.backlog || []).filter((b) => b.status !== 'removed');
 if (!items.length) {
 return '<p class="card-note">Your list is empty — add anything you need to get done, luv.</p>';
 }
 return items.map((item) => {
 const placed = item.status === 'scheduled'
 ? (state.tasks || []).find((t) => t.fromBacklog === item.id)
 : null;
 const meta = placed
 ? 'placed at ' + formatTime(placed.start, state)
 : '<span class="priority-dot priority-' + (item.priority || 'medium') + '"></span> ' +
 Utils.formatMinutes(Number(item.duration) || 30);
 return '<div class="backlog-item' + (placed ? ' is-moved' : '') + '" data-id="' + item.id + '">' +
 '<span class="live-ico">' + iconFor(item) + '</span>' +
 '<span class="bl-name">' + esc(item.name) + '</span>' +
 '<span class="bl-meta">' + meta + '</span>' +
 '<button class="chip-x" type="button" data-action="backlog-remove" data-id="' + item.id + '" ' +
 'aria-label="Remove from my list">×</button>' +
 '</div>';
 }).join('');
 }

 return {
 CATEGORIES, PRIORITIES, WELLNESS_IDEAS, ROUTINES,
 timeToMinutes, minutesToTime, nowMinutes, formatTime, formatRange, durationBetween, durationOf,
 countdown, formatClock, dayPhase, dayPhaseText, greeting,
 category, priority, iconFor, isProtected, isHeavy, categoryOptions,
 tasksFor, pending, plannedMinutes, dayProgress, liveStatus,
 bufferMinutes, sleepMinutes, wakeMinutes, freeSlots, freeTimeUntilNext, dayOutlook,
 optimizeDay, lightenDay, suggestions, recommend,
 // Phase 1: clashes, feasibility and the natural-language parser
 findConflicts, fitAround, feasibility, trimDay, parseQuickAdd, describeQuickAdd,
 // Phase 2: repeating activities, routines, energy insights and breaks
 nextRepeatDate, repeatLabel, materialiseRecurring, stopSeries,
 routine, routineStart, applyRoutine, focusInsights, isPeakHour, typicalMinutes, needsBreak,
 // Phase 3: the draggable day grid
 GRID_HOUR_PX, renderDayGrid,
 renderRightNow, renderLiveDay, renderTaskRow, renderTimeline, renderBacklog
 };
})();
