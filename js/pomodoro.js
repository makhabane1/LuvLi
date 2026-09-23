/* =============================================================================
 pomodoro.js — Focus mode (Pomodoro is one feature inside Luvli, not the app)
 -----------------------------------------------------------------------------
 • A real timer (pause / resume / +5 min / end) that keeps the tab title in sync
 • Logs finished sessions so Study, Progress and streaks all update
 • Rotating affirmations while you work, and a soft break offer when you finish
 • Remembers study apps / distractions as preferences (it never closes apps)

 UI helpers (UI.toast / UI.modal / UI.burst) live in app.js, which is loaded
 last — they are only ever used at runtime, never while this file loads.
 ========================================================================== */
'use strict';

const Pomodoro = (() => {
 const PRESETS = [
 { key: '25/5',  focus: 25, break: 5 },
 { key: '40/10', focus: 40, break: 10 },
 { key: '50/10', focus: 50, break: 10 }
 ];
 const RING_LENGTH = 616;  // circumference of the timer ring (r = 98)

 let session = null;  // the active session, or null
 let ticker = null;  // 1-second interval
 let affirmationTicker = null; // rotating affirmations
 let mounted = false;  // are the Focus page listeners bound yet?

 /* ------------------------------- helpers -------------------------------- */
 function formatSeconds(total) {
 const seconds = Math.max(0, Math.round(total));
 return Utils.pad(Math.floor(seconds / 60)) + ':' + Utils.pad(seconds % 60);
 }

 function cacheElements() {
 return {
 setup: document.getElementById('focusSetup'),
 run: document.getElementById('focusRun'),
 state: document.getElementById('focusState'),
 runSubject: document.getElementById('focusRunSubject'),
 runGoal: document.getElementById('focusRunGoal'),
 timer: document.getElementById('focusTimer'),
 timerSub: document.getElementById('focusTimerSub'),
 ring: document.getElementById('timerRingFill'),
 pause: document.getElementById('focusPauseBtn'),
 affirmation: document.getElementById('focusAffirmation'),
 dots: document.getElementById('focusDots'),
 breakControls: document.getElementById('breakControls'),
 todayChip: document.getElementById('focusTodayChip')
 };
 }

 /* ------------------------------ the session ----------------------------- */
 /**
 * Start a focus session.
 * @param {{ subjectId?:string, subjectName?:string, icon?:string, goal?:string,
 *  focusMinutes?:number, breakMinutes?:number, taskId?:string }} config
 */
 function start(config) {
 const cfg = config || {};
 const state = Storage.get();
 const focusMinutes = Utils.clamp(Number(cfg.focusMinutes) || state.pomodoro.focusLength || 25, 1, 180);
 const breakMinutes = Utils.clamp(Number(cfg.breakMinutes) || state.pomodoro.breakLength || 5, 1, 120);

 session = {
 mode: 'focus',
 subjectId: cfg.subjectId || '',
 subjectName: cfg.subjectName || 'Focus time',
 icon: cfg.icon || '',
 goal: cfg.goal || '',
 focusMinutes: focusMinutes,
 breakMinutes: breakMinutes,
 totalSeconds: focusMinutes * 60,
 remaining: focusMinutes * 60,
 running: true,
 rounds: 1,
 startedAt: Date.now(),
 taskId: cfg.taskId || null
 };

 Storage.update((draft) => {
 draft.pomodoro.subjectId = session.subjectId;
 draft.pomodoro.goal = session.goal;
 draft.pomodoro.preset = focusMinutes + '/' + breakMinutes;
 draft.pomodoro.focusLength = focusMinutes;
 draft.pomodoro.breakLength = breakMinutes;
 }, 'pomodoro-prefs');

 startTicker();
 startAffirmations();
 render();
 announce('luvli:focus-start', { subject: session.subjectName, minutes: focusMinutes });
 UI.burst(null, null, 6);
 UI.toast({
 icon: 'check-circle',
 title: 'Focus mode on',
 body: focusMinutes + ' minutes of ' + session.subjectName + '. Luvli will hold the time.'
 });
 }

 /** Start a session straight from a scheduled activity. */
 function startFromActivity(task, state) {
 if (!task) return;
 const subject = (state.subjects || []).find((s) =>
 task.name.toLowerCase().indexOf(s.name.toLowerCase()) > -1);
 start({
 subjectId: subject ? subject.id : '',
 subjectName: subject ? subject.name : task.name,
 icon: subject ? subject.emoji : Scheduler.iconFor(task),
 goal: task.notes || task.name,
 focusMinutes: Utils.clamp(Scheduler.durationOf(task) || state.settings.focusLength, 5, 90),
 breakMinutes: state.settings.breakLength,
 taskId: task.id
 });
 }

 function startBreak() {
 if (!session) return;
 session.mode = 'break';
 session.totalSeconds = session.breakMinutes * 60;
 session.remaining = session.totalSeconds;
 session.running = true;
 session.startedAt = Date.now();
 startTicker();
 stopAffirmations();
 render();
 }

 function startNextFocus() {
 if (!session) return;
 session.mode = 'focus';
 session.rounds = (session.rounds || 1) + 1;
 session.totalSeconds = session.focusMinutes * 60;
 session.remaining = session.totalSeconds;
 session.running = true;
 session.startedAt = Date.now();
 startTicker();
 startAffirmations();
 announce('luvli:focus-start', { subject: session.subjectName, minutes: session.focusMinutes });
 render();
 }

 function pause() {
 if (!session) return;
 session.running = false;
 stopTicker();
 render();
 }

 function resume() {
 if (!session) return;
 session.running = true;
 startTicker();
 render();
 }

 const togglePause = () => { if (session) { if (session.running) pause(); else resume(); } };

 /** Give yourself a little more time — no guilt, ever. */
 function addTime(minutes) {
 if (!session) return;
 const extra = (minutes || 5) * 60;
 session.totalSeconds += extra;
 session.remaining += extra;
 paintTimer();
 UI.toast({ icon: 'plus', title: '+' + (minutes || 5) + ' minutes', body: 'Take the time you need, luv.' });
 }

 /** Stop everything (the user chose to end). */
 function endSession(silent) {
 const hadProgress = Boolean(session && session.mode === 'focus' && session.remaining < session.totalSeconds);
 stopTicker();
 stopAffirmations();
 session = null;
 document.title = 'Luvli — Make every day feel luvli.';
 announce('luvli:focus-end', { hadProgress: hadProgress });
 render();
 if (!silent && hadProgress) {
 UI.toast({ icon: 'leaf', title: 'Session ended', body: 'That was still time well spent, luv.' });
 }
 }

 const currentSession = () => session;
 const isRunning = () => Boolean(session && session.running);
 const hasSession = () => Boolean(session);

 /** Let the rest of the app know the focus state changed. */
 function announce(type, extra) {
 const detail = Object.assign({ mode: session ? session.mode : null }, extra || {});
 document.dispatchEvent(new CustomEvent(type, { detail: detail }));
 }

 /* -------------------------------- ticking ------------------------------- */
 function startTicker() {
 stopTicker();
 ticker = setInterval(tick, 1000);
 }
 function stopTicker() {
 if (ticker) { clearInterval(ticker); ticker = null; }
 }

 function tick() {
 if (!session || !session.running) return;
 session.remaining = Math.max(0, session.remaining - 1);
 paintTimer();
 if (session.remaining === 0) complete();
 }

 /** Update the big number, the ring and the browser tab title. */
 function paintTimer() {
 if (!session) return;
 const el = cacheElements();
 const done = session.totalSeconds - session.remaining;
 const progress = session.totalSeconds ? done / session.totalSeconds : 0;

 if (el.timer) el.timer.textContent = formatSeconds(session.remaining);
 if (el.ring) el.ring.style.strokeDashoffset = String(RING_LENGTH * (1 - progress));
 document.title = formatSeconds(session.remaining) + ' · ' + (session.mode === 'focus' ? 'Focus' : 'Break') + ' · Luvli';
 }

 /* ------------------------ affirmations while focusing -------------------- */
 function setAffirmation() {
 const el = document.getElementById('focusAffirmation');
 if (!el) return;
 const data = Storage.get();
 if (!data.settings.affirmations.duringFocus) { el.textContent = 'You are doing beautifully.'; return; }
 // 💗 With a Luvli style chosen, the line while you focus is written for you
 // (goals, habits, the style) — otherwise the classic focus library.
 const prefs = (typeof LuvliStyle !== 'undefined') ? LuvliStyle.get(data) : null;
 if (prefs && prefs.chosen) {
 el.textContent = '“' + LuvliStyle.affirmation(data, { salt: 'focus' }).text + '”';
 return;
 }
 el.textContent = '“' + Affirmations.random(data, { focus: true }).text + '”';
 }
 function startAffirmations() {
 stopAffirmations();
 setAffirmation();
 affirmationTicker = setInterval(setAffirmation, 22000);
 }
 function stopAffirmations() {
 if (affirmationTicker) { clearInterval(affirmationTicker); affirmationTicker = null; }
 }

 /* ---------------------------- finishing up ------------------------------ */
 function complete() {
 if (!session) return;
 stopTicker();
 session.running = false;

 if (session.mode === 'focus') {
 const minutes = Math.round(session.totalSeconds / 60);
 logFocus(session);
 paintTimer();
 UI.burst(null, null, 12);
 UI.modal({
 title: 'You did it, luv!',
 sub: minutes + ' minutes of focused study completed.',
 bodyHtml: '<div class="rec-hero">' +
 '<span class="rec-icon">' + (session.icon && /^[a-z][a-z-]*$/.test(session.icon) ? ico(session.icon) : esc(session.icon || '')) + '</span>' +
 '<div class="rec-name">' + Utils.escapeHtml(session.subjectName) + '</div>' +
 (session.goal ? '<p class="rec-reason">' + Utils.escapeHtml(session.goal) + '</p>' : '') +
 '<span class="rec-window">Your goal moved forward</span>' +
 '</div>',
 actions: [
 { label: 'Take my break (' + session.breakMinutes + ' min)', action: 'focus-take-break', variant: 'primary' },
 { label: 'Start another focus', action: 'focus-again' },
 { label: "I'm done for now", action: 'focus-finish' }
 ]
 });
 render();
 return;
 }

 // The break is finished — keep the session so "another round" still works
 stopAffirmations();
 session.remaining = 0;
 render();
 UI.toast({ icon: 'coffee', title: 'Break is over, luv', body: 'Ready for another round whenever you are.' });
 UI.modal({
 title: 'Back to it, luv?',
 sub: 'Your break is done. No pressure — only start when you feel ready.',
 actions: [
 { label: 'Start another focus', action: 'focus-again', variant: 'primary' },
 { label: 'Done for now', action: 'focus-finish' }
 ]
 });
 }

 /** Save a finished focus session and let the rest of Luvli react to it. */
 function logFocus(finished) {
 const minutes = Math.round(finished.totalSeconds / 60);
 const day = Utils.todayKey();

 Storage.update((state) => {
 state.sessions.push({
 id: Utils.uid('ses'),
 subjectId: finished.subjectId || '',
 subjectName: finished.subjectName,
 goal: finished.goal || '',
 minutes: minutes,
 date: day,
 type: 'focus',
 endedAt: new Date().toISOString(),
 taskId: finished.taskId || null
 });

 if (!state.focusDays[day]) state.focusDays[day] = { minutes: 0, sessions: 0 };
 state.focusDays[day].minutes += minutes;
 state.focusDays[day].sessions += 1;

 // Nudge the subject's goal forward (about 5% for a 25 minute session)
 const subject = (state.subjects || []).find((s) => s.id === finished.subjectId);
 if (subject) {
 subject.progress = Math.min(100, Math.round((subject.progress || 0) + Math.max(2, minutes / 5)));
 subject.lastStudied = day;
 }

 // If the session was started from a scheduled activity, tick it off
 if (finished.taskId) {
 const task = state.tasks.find((t) => t.id === finished.taskId);
 if (task) { task.completed = true; task.completedAt = new Date().toISOString(); }
 }
 }, 'focus-complete');

 document.dispatchEvent(new CustomEvent('luvli:focus-complete', {
 detail: { minutes: minutes, subject: finished.subjectName, goal: finished.goal }
 }));
 }

 /** Skip the rest of the break. */
 function skipBreak() {
 if (!session) return;
 if (session.mode === 'break') {
 stopTicker();
 session.remaining = 0;
 session.running = false;
 render();
 UI.toast({ icon: 'heart', title: 'Break skipped', body: 'Back to it — gently.' });
 } else {
 endSession();
 }
 }

 /* --------------------------- app chips (prefs) -------------------------- */
 /** Study apps / distractions are saved preferences only — never blocked. */
 function appChipsHtml(list, type) {
 if (!list || !list.length) {
 return '<span class="live-empty">' + (type === 'study' ? 'Nothing here yet.' : 'Nothing here yet.') + '</span>';
 }
 return list.map((name, index) =>
 '<span class="chip-item' + (type === 'distraction' ? ' distraction' : '') + '">' +
 Utils.escapeHtml(name) +
 '<button class="chip-x" type="button" data-action="remove-app" data-type="' + type + '" data-index="' + index + '" ' +
 'aria-label="Remove ' + Utils.escapeHtml(name) + '">×</button></span>').join('');
 }

 function renderAppChips(state) {
 const study = document.getElementById('studyAppChips');
 const distractions = document.getElementById('distractionAppChips');
 if (study) study.innerHTML = appChipsHtml(state.studyApps || [], 'study');
 if (distractions) distractions.innerHTML = appChipsHtml(state.distractionApps || [], 'distraction');
 }

 /* ------------------------------- rendering ------------------------------ */
 /** Paint the whole Focus page (setup + running + saved app lists). */
 function render(stateIn) {
 const state = stateIn || Storage.get();
 renderTodayChip(state);
 renderSetup(state);
 renderRunPanel(state);
 renderAppChips(state);
 }

 function renderTodayChip(state) {
 const el = document.getElementById('focusTodayChip');
 if (!el) return;
 const today = Progress.focusMinutesOn(state, Utils.todayKey());
 el.textContent = (today ? Utils.formatMinutes(today) + ' focused today' : 'Nothing focused yet today');
 }

 function renderSetup(state) {
 const select = document.getElementById('focusSubject');
 if (!select) return;
 const subjects = state.subjects || [];
 const chosen = state.pomodoro.subjectId || (subjects[0] ? subjects[0].id : '');
 const options = ['<option value="">Freestyle focus</option>'];
 subjects.forEach((s) => {
 options.push('<option value="' + s.id + '"' + (s.id === chosen ? ' selected' : '') + '>' +
 s.emoji + ' ' + Utils.escapeHtml(s.name) + '</option>');
 });
 select.innerHTML = options.join('');

 setValue(document.getElementById('focusGoal'), state.pomodoro.goal || '');

 // Which length is selected?
 const current = (state.pomodoro.focusLength || 25) + '/' + (state.pomodoro.breakLength || 5);
 const match = PRESETS.find((preset) => preset.key === current);
 $$('#presetRow .preset').forEach((btn) => {
 const key = btn.getAttribute('data-preset');
 btn.classList.toggle('is-active', key === (match ? current : 'custom'));
 });

 const customRow = document.getElementById('customRow');
 if (customRow) customRow.hidden = Boolean(match);
 setValue(document.getElementById('customFocusLen'), state.pomodoro.focusLength || 45);
 setValue(document.getElementById('customBreakLen'), state.pomodoro.breakLength || 10);

 const hint = document.getElementById('focusReadyHint');
 if (hint) {
 const gap = Scheduler.freeTimeUntilNext(state, Utils.todayKey());
 const next = Scheduler.liveStatus(Utils.todayKey(), state).next;
 hint.textContent = next
 ? 'You have ' + Utils.formatMinutes(gap.minutes) + ' before ' + next.name + '.'
 : 'Nothing else is planned — this time is yours.';
 }
 }

 function renderRunPanel(state) {
 const el = cacheElements();
 if (!el.setup || !el.run) return;

 const active = Boolean(session);
 el.setup.hidden = active;
 el.run.hidden = !active;
 if (!active) return;

 const isBreak = session.mode === 'break';
 el.run.classList.toggle('is-paused', !session.running);
 el.run.classList.toggle('is-break', isBreak);

 if (el.state) {
 el.state.textContent = isBreak ? 'Break' : (session.running ? 'Focus' : 'Paused');
 el.state.className = 'chip ' + (isBreak ? 'chip-soft' : 'chip-rose');
 }
 if (el.runSubject) el.runSubject.textContent = (isBreak ? 'Break — ' : '') + session.subjectName;
 if (el.runGoal) {
 el.runGoal.textContent = isBreak
 ? 'Take a little break. You deserve it.'
 : (session.goal || 'Luvli is holding the time for you.');
 }
 if (el.timerSub) el.timerSub.textContent = isBreak ? 'Break time' : (session.running ? 'Focus time' : 'Paused');
 if (el.pause) el.pause.textContent = session.running ? 'Pause' : 'Resume';
 if (el.breakControls) el.breakControls.hidden = !isBreak;

 if (el.dots) {
 const rounds = Math.max(4, session.rounds || 1);
 let dots = '';
 for (let i = 0; i < rounds; i++) {
 dots += '<span class="focus-dot' + (i < (session.rounds || 1) - 1 ? ' is-filled' : '') + '"></span>';
 }
 el.dots.innerHTML = dots + '<span class="live-more">round ' + (session.rounds || 1) + '</span>';
 }

 paintTimer();
 }

 /* ------------------------------ wiring up ------------------------------- */
 function click(id, handler) {
 const el = document.getElementById(id);
 if (el) el.addEventListener('click', handler);
 }

 function startFromSetup() {
 const state = Storage.get();
 const select = document.getElementById('focusSubject');
 const goalInput = document.getElementById('focusGoal');
 const subject = (state.subjects || []).find((s) => s.id === (select ? select.value : '')) || null;
 const activeBtn = document.querySelector('#presetRow .preset.is-active');
 const preset = PRESETS.find((p) => p.key === (activeBtn ? activeBtn.getAttribute('data-preset') : ''));
 start({
 subjectId: subject ? subject.id : '',
 subjectName: subject ? subject.name : 'Freestyle focus',
 icon: subject ? subject.emoji : 'sparkles',
 goal: goalInput ? goalInput.value.trim() : '',
 focusMinutes: preset ? preset.focus : state.pomodoro.focusLength,
 breakMinutes: preset ? preset.break : state.pomodoro.breakLength
 });
 }

 function saveCustomLengths() {
 const focusInput = document.getElementById('customFocusLen');
 const breakInput = document.getElementById('customBreakLen');
 const focus = Utils.clamp(Number(focusInput && focusInput.value) || 45, 5, 180);
 const brk = Utils.clamp(Number(breakInput && breakInput.value) || 10, 1, 60);
 Storage.update((state) => {
 state.pomodoro.focusLength = focus;
 state.pomodoro.breakLength = brk;
 }, 'pomodoro-prefs');
 render();
 }

 /** Add-a-chip wiring used by both study apps and distractions. */
 function wireAppInput(inputId, buttonId, type) {
 const input = document.getElementById(inputId);
 const button = document.getElementById(buttonId);
 const add = () => {
 const value = input ? input.value.trim() : '';
 if (!value) return;
 const key = type === 'study' ? 'studyApps' : 'distractionApps';
 Storage.update((state) => {
 if (state[key].indexOf(value) === -1) state[key].push(value);
 }, 'apps');
 if (input) input.value = '';
 renderAppChips(Storage.get());
 };
 if (button) button.addEventListener('click', add);
 if (input) input.addEventListener('keydown', (event) => {
 if (event.key === 'Enter') { event.preventDefault(); add(); }
 });
 }

 function removeApp(type, index) {
 const key = type === 'study' ? 'studyApps' : 'distractionApps';
 Storage.update((state) => { state[key].splice(index, 1); }, 'apps');
 renderAppChips(Storage.get());
 }

 /** Click handling for HTML that gets rebuilt (chips + modal buttons).
 The buttons that always exist on the Focus page are bound by id in mount(). */
 function onActionClick(event) {
 const btn = event.target.closest ? event.target.closest('[data-action]') : null;
 if (!btn) return;
 switch (btn.getAttribute('data-action')) {
 case 'focus-take-break': UI.closeModal(); startBreak(); break;
 case 'focus-again':  UI.closeModal(); startNextFocus(); break;
 case 'focus-finish':  UI.closeModal(); endSession(true); break;
 case 'remove-app':  removeApp(btn.getAttribute('data-type'), Number(btn.getAttribute('data-index'))); break;
 default: break;
 }
 }

 function mount() {
 if (mounted) return;
 mounted = true;

 click('focusStartBtn', startFromSetup);
 click('focusPauseBtn', togglePause);
 click('focusEndBtn', () => endSession());
 click('focusAddTimeBtn', () => addTime(5));
 click('breakSkipBtn', skipBreak);
 click('breakNextBtn', startNextFocus);

 $$('#presetRow .preset').forEach((btn) => {
 btn.addEventListener('click', () => {
 const preset = PRESETS.find((p) => p.key === btn.getAttribute('data-preset'));
 const customRow = document.getElementById('customRow');
 if (customRow) customRow.hidden = Boolean(preset);
 if (preset) {
 Storage.update((state) => {
 state.pomodoro.focusLength = preset.focus;
 state.pomodoro.breakLength = preset.break;
 }, 'pomodoro-prefs');
 }
 render();
 });
 });

 const customFocus = document.getElementById('customFocusLen');
 const customBreak = document.getElementById('customBreakLen');
 if (customFocus) customFocus.addEventListener('change', saveCustomLengths);
 if (customBreak) customBreak.addEventListener('change', saveCustomLengths);

 const goalInput = document.getElementById('focusGoal');
 if (goalInput) goalInput.addEventListener('change', () => {
 Storage.update((state) => { state.pomodoro.goal = goalInput.value.trim(); }, 'pomodoro-prefs');
 });

 const subjectSelect = document.getElementById('focusSubject');
 if (subjectSelect) subjectSelect.addEventListener('change', () => {
 Storage.update((state) => { state.pomodoro.subjectId = subjectSelect.value; }, 'pomodoro-prefs');
 render();
 });

 wireAppInput('studyAppInput', 'addStudyAppBtn', 'study');
 wireAppInput('distractionAppInput', 'addDistractionAppBtn', 'distraction');

 document.addEventListener('click', onActionClick);
 }

 return {
 PRESETS, mount, render, start, startFromActivity,
 startBreak, startNextFocus, pause, resume, togglePause, addTime, endSession, skipBreak,
 currentSession, isRunning, hasSession, appChipsHtml
 };
})();
