/* =============================================================================
 app.js — navigation, the screens, and everything the user touches
 -----------------------------------------------------------------------------
 Loaded last, so it can use Utils, Storage, Scheduler, Affirmations, Progress,
 Pomodoro and Notifier. It defines two shared globals used by the other files
 at runtime (never at load time):
 • UI  — toasts, modals and floating hearts
 • App  — the application itself (go, renderAll, init)
 ========================================================================== */
'use strict';

/* ------------------------------ DOM helpers ------------------------------ */
function $(id) { return document.getElementById(id); }
function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
function setHtml(id, html) { const el = $(id); if (el) el.innerHTML = html; return el; }
function setText(id, text) { const el = $(id); if (el) el.textContent = text; return el; }
/** Only fill an input when the user is not typing in it right now. */
function setValue(el, value) { if (el && document.activeElement !== el) el.value = value; return el; }

/* =================================== UI ================================== */
const UI = (() => {

 /* ------------------------------- toasts -------------------------------- */
 function toast(options) {
 const opts = typeof options === 'string' ? { body: options } : (options || {});
 const stack = $('toastStack');
 if (!stack) return;

 const undoButton = opts.undo
 ? '<button class="toast-undo" type="button" data-action="undo">' + ico('undo') + ' Undo</button>'
 : '';

 const el = document.createElement('div');
 el.className = 'toast';
 el.innerHTML =
 '<span class="toast-ico">' + ico(opts.icon || 'heart') + '</span>' +
 '<div class="toast-text">' +
 '<div class="toast-title">' + Utils.escapeHtml(opts.title || 'Luvli') + '</div>' +
 (opts.body ? '<div class="toast-body">' + Utils.escapeHtml(opts.body) + '</div>' : '') +
 undoButton +
 '</div>';
 stack.appendChild(el);

 while (stack.children.length > 4) stack.removeChild(stack.firstChild);

 const life = opts.duration || (opts.undo ? 9000 : 6000);
 setTimeout(() => {
 el.classList.add('is-out');
 setTimeout(() => el.remove(), 320);
 }, life);
 }

 /* ------------------------------- modals -------------------------------- */
 let openBackdrop = null;
 let lastFocused = null;

 function actionButton(action) {
 return '<button class="btn btn-' + (action.variant || 'soft') + '" type="button" ' +
 'data-action="' + action.action + '"' + (action.attrs ? ' ' + action.attrs : '') + '>' +
 action.label + '</button>';
 }

 /**
 * Open a modal.
 * @param {{ title?:string, sub?:string, bodyHtml?:string, wide?:boolean,
 *  actions?:Array<{label:string, action:string, variant?:string, attrs?:string}> }} options
 */
 function modal(options) {
 const opts = options || {};
 closeModal();
 const root = $('modalRoot');
 if (!root) return;

 lastFocused = document.activeElement;

 const backdrop = document.createElement('div');
 backdrop.className = 'modal-backdrop';
 backdrop.innerHTML =
 '<div class="modal' + (opts.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" ' +
 'aria-label="' + Utils.escapeHtml(opts.title || 'Luvli') + '">' +
 '<div class="modal-head"><div>' +
 '<h2 class="modal-title">' + (opts.title || '') + '</h2>' +
 (opts.sub ? '<p class="modal-sub">' + opts.sub + '</p>' : '') +
 '</div><button class="modal-close" type="button" data-close="1" aria-label="Close">' + ico('x') + '</button></div>' +
 '<div class="modal-body">' + (opts.bodyHtml || '') + '</div>' +
 ((opts.actions && opts.actions.length)
 ? '<div class="modal-foot">' + opts.actions.map(actionButton).join('') + '</div>' : '') +
 '</div>';

 root.appendChild(backdrop);
 openBackdrop = backdrop;

 backdrop.addEventListener('click', (event) => {
 if (event.target === backdrop || event.target.getAttribute('data-close')) closeModal();
 });
 backdrop.addEventListener('keydown', onModalKeydown);
 document.addEventListener('keydown', onEscape);

 const firstField = backdrop.querySelector('input, select, textarea');
 if (firstField) setTimeout(() => firstField.focus(), 80);
 }

 function onEscape(event) { if (event.key === 'Escape') closeModal(); }

 /** Keep Tab inside the dialog while it is open. */
 function onModalKeydown(event) {
 if (event.key !== 'Tab' || !openBackdrop) return;
 const focusable = $$('button, input, select, textarea, [href]', openBackdrop)
 .filter((el) => !el.disabled && el.offsetParent !== null);
 if (!focusable.length) return;
 const first = focusable[0];
 const last = focusable[focusable.length - 1];
 if (event.shiftKey && document.activeElement === first) {
 event.preventDefault();
 last.focus();
 } else if (!event.shiftKey && document.activeElement === last) {
 event.preventDefault();
 first.focus();
 }
 }

 function closeModal() {
 if (!openBackdrop) return;
 openBackdrop.removeEventListener('keydown', onModalKeydown);
 openBackdrop.remove();
 openBackdrop = null;
 document.removeEventListener('keydown', onEscape);
 // Put the user back where they were
 if (lastFocused && lastFocused.focus) {
 try { lastFocused.focus(); } catch (err) { /* element is gone */ }
 }
 lastFocused = null;
 }

 /** A friendly yes/no modal. */
 function confirm(options) {
 const opts = options || {};
 modal({
 title: opts.title || 'Are you sure?',
 sub: opts.sub || '',
 bodyHtml: opts.bodyHtml || '',
 actions: [
 { label: opts.cancelLabel || 'Never mind', action: 'modal-cancel', variant: 'ghost' },
 { label: opts.confirmLabel || 'Yes, please', action: opts.confirmAction, variant: opts.variant || 'primary' }
 ]
 });
 }

 /* --------------------- floating hearts & sparkles ---------------------- */
 const FX = ['', '', '', '', ''];

 /** A quiet drift of soft dots rising from a point on the screen. */
 function burst(x, y, count) {
 if (document.documentElement.classList.contains('reduce-motion')) return;
 const layer = $('fxLayer');
 if (!layer) return;

 const cx = (x === null || x === undefined) ? window.innerWidth / 2 : x;
 const cy = (y === null || y === undefined) ? window.innerHeight / 2 : y;

 for (let i = 0; i < (count || 8); i++) {
 const el = document.createElement('span');
 el.className = 'fx-item';
 el.textContent = Utils.pickRandom(FX);
 el.style.left = (cx + (Math.random() * 140 - 70)) + 'px';
 el.style.top = (cy + (Math.random() * 60 - 30)) + 'px';
 el.style.setProperty('--fx-x', (Math.random() * 140 - 70) + 'px');
 el.style.setProperty('--fx-y', (-100 - Math.random() * 130) + 'px');
 el.style.width = el.style.height = (6 + Math.random() * 7) + 'px';
 el.style.animationDelay = (i * 45) + 'ms';
 layer.appendChild(el);
 setTimeout(() => el.remove(), 2100);
 }
 }

 /** Burst from the middle of an element (used when a task is completed). */
 function burstFrom(target, count) {
 if (!target || !target.getBoundingClientRect) { burst(null, null, count); return; }
 const rect = target.getBoundingClientRect();
 burst(rect.left + rect.width / 2, rect.top + rect.height / 2, count);
 }

 return { toast, modal, closeModal, confirm, burst, burstFrom };
})();

/* ================================ the app ================================ */
const App = (() => {

 const NAV = [
 { page: 'home',  icon: 'home', label: 'Home' },
 { page: 'day',  icon: 'calendar', label: 'My Day' },
 { page: 'study',  icon: 'book', label: 'Study' },
 { page: 'focus',  icon: 'sparkles', label: 'Focus' },
 { page: 'progress',  icon: 'chart', label: 'Progress' },
 { page: 'affirmations', icon: 'heart', label: 'Affirm.' },
 { page: 'settings',  icon: 'settings', label: 'Settings' }
 ];

 /* External links rendered after the main nav items in the bottom bar. */
 const NAV_EXTRA = [
 { href: 'personality.html', icon: 'heart', label: 'My Luvli' },
 { href: 'vision-board.html', icon: 'image', label: 'Vision' }
 ];

 /** Mood buttons (check-in) and how the day went (nightly reset). */
 const CHECK_IN_MOODS = [
 { key: 'great',  label: 'Great' },
 { key: 'good',  label: 'Good' },
 { key: 'okay',  label: 'Okay' },
 { key: 'low',  label: 'Low' },
 { key: 'exhausted', icon: '', label: 'Exhausted' }
 ];
 const REVIEW_MOODS = [
 { key: 'great',  label: 'Great' },
 { key: 'good',  label: 'Good' },
 { key: 'okay',  label: 'Okay' },
 { key: 'difficult', label: 'Difficult' },
 { key: 'exhausted', icon: '', label: 'Exhausted' }
 ];

 const THEMES = [
 { key: 'rose',  label: 'Rose',  colors: ['#FCE7F0', '#EFA8BF', '#9E536F'] },
 { key: 'lavender', label: 'Lavender', colors: ['#EFE9FF', '#B9A6E8', '#634F8C'] },
 { key: 'peach',  label: 'Peach',  colors: ['#FFEADC', '#F0A57E', '#934F31'] },
 { key: 'sage',  label: 'Sage',  colors: ['#E5F3EB', '#8FC9AC', '#38664D'] },
 { key: 'dusk',  label: 'Cozy dusk', colors: ['#35262F', '#E79FB8', '#FBD9E4'] }
 ];

 const view = { page: 'home', date: Utils.todayKey() };
 let homeQuote = null;  // the affirmation on the Home card
 let pageQuote = null;  // the big affirmation on the Affirmations page
 let suggestions = [];  // cached "what should I do now?" answers
 let suggestionIndex = 0;
 let confirmTarget = null;  // what a "yes, delete it" modal is about
 let logSubjectDefault = '';  // which subject the log-session modal was opened for

 const state = () => Storage.get();

 /* -------------------------- chrome & navigation ------------------------- */
 /** Matches <meta name="theme-color"> to the theme, so the browser chrome blends. */
 const THEME_BG = {
 rose: '#FFF5F8', lavender: '#F9F7FF', peach: '#FFF8F3', sage: '#F6FBF8', dusk: '#1A1418'
 };

 function applyTheme() {
 const settings = state().settings;
 const name = settings.theme || 'rose';
 document.documentElement.setAttribute('data-theme', name);
 document.documentElement.classList.toggle('reduce-motion', Boolean(settings.reduceMotion));
 const meta = document.querySelector('meta[name="theme-color"]');
 if (meta) meta.setAttribute('content', THEME_BG[name] || THEME_BG.rose);
 }

 function buildNav() {
 const nav = $('bottomNav');
 if (nav) {
  const main = NAV.map((item) =>
  '<button class="bn-item" data-page="' + item.page + '" type="button">' +
  '<span class="bn-ico">' + ico(item.icon) + '</span>' + item.label + '</button>').join('');
  const extra = NAV_EXTRA.map((item) =>
  '<a class="bn-item bn-extra" href="' + item.href + '">' +
  '<span class="bn-ico">' + ico(item.icon) + '</span>' + item.label + '</a>').join('');
  nav.innerHTML = main + extra;
 }
 }

 /** The streak chips, the little quote and your Luvli style. */
 function renderChrome() {
 const streak = Progress.totals(state()).streaks.current;
 const label = streak + ' day' + (streak === 1 ? '' : 's');
 setText('topStreakCount', label);
 setText('sideStreakCount', label + ' streak');
 renderStyleChrome();
 }

 /**
  * 💗 My Luvli Style ♡ — the little reminders of how Luvli is supporting you:
  * your character in the sidebar, your style in the top bar and the Settings
  * card. Every value comes from LuvliStyle, so personality.html is the only
  * place these can be changed.
  */
 function renderStyleChrome() {
 const data = state();
 const prefs = LuvliStyle.get(data);

 // Sidebar
 const avatar = $('sideStyleAvatar');
 if (avatar) avatar.innerHTML = LuvliStyle.avatarHtml(prefs, { size: 'sm' });
 setText('sideStyleName', prefs.name);

 // Top bar chip
 const top = $('topStyle');
 if (top) {
 top.innerHTML = LuvliStyle.chipHtml(prefs);
 top.setAttribute('aria-label', 'My Luvli Style — ' + prefs.name);
 }

 // Settings card
 const settingsAvatar = $('settingsStyleAvatar');
 if (settingsAvatar) settingsAvatar.innerHTML = LuvliStyle.avatarHtml(prefs, { size: 'md' });
 setText('settingsStyleName', prefs.name);
 setText('settingsStyleSummary', prefs.tagline + ' · ' + prefs.communicationLabel);

 const todayChips = $('settingsStyleToday');
 if (todayChips) {
 todayChips.innerHTML = LuvliStyle.STYLES.map((meta) =>
 '<button class="chip-item' + (meta.key === prefs.key ? ' is-on' : '') + '" type="button" ' +
 'aria-pressed="' + (meta.key === prefs.key ? 'true' : 'false') + '" ' +
 'data-action="style-set" data-key="' + meta.key + '">' +
 '<span>' + esc(meta.name.replace(' Luvli', ' Luvli')) + '</span>' +
 '<span class="chip-x" aria-hidden="true">' + (meta.key === prefs.key ? '✓' : '→') + '</span>' +
 '</button>').join('');
 }
 }

 /** The invitation on Home — shown only until a style is chosen. */
 function renderStylePrompt(s) {
 const prompt = $('stylePrompt');
 if (!prompt) return;
 const prefs = LuvliStyle.get(s);
 const answered = prefs.chosen || prefs.memory.promptDismissed;
 prompt.hidden = answered;
 if (answered) return;

 const avatar = $('stylePromptAvatar');
 if (avatar) avatar.innerHTML = LuvliStyle.avatarHtml(prefs, { size: 'md' });
 setText('stylePromptTitle', 'How would you like Luvli to support you?');
 setText('stylePromptText', prefs.morning || 'Choose a style and Luvli will speak to you that way everywhere.');
 }

 /** Today's saved mood, if there is one. */
 function moodOfToday() {
 const checkIn = state().checkIns[Utils.todayKey()];
 return checkIn ? checkIn.mood : '';
 }

 /* --------------------------------- clock -------------------------------- */
 function startClock() {
 const paint = () => {
 const now = new Date();
 setText('topClock', Scheduler.formatClock(now));
 setText('heroClock', Scheduler.formatClock(now));
 };
 paint();
 setInterval(paint, 15000);
 }

 /** Every 20 seconds, check whether the day has moved on. */
 let lastMinuteSeen = null;
 function startMinuteWatcher() {
 lastMinuteSeen = Scheduler.nowMinutes();
 setInterval(() => {
 const nowMin = Scheduler.nowMinutes();
 if (nowMin === lastMinuteSeen) return;
 lastMinuteSeen = nowMin;
 if (view.page === 'home') renderHome();
 if (view.page === 'day') renderMyDay();
 }, 20000);
 }

 /* ------------------------------- navigation ----------------------------- */
 function go(page) {
 if (!NAV.some((item) => item.page === page)) page = 'home';
 withTransition(() => {
 view.page = page;
 $$('.view').forEach((el) => el.classList.toggle('is-active', el.getAttribute('data-view') === page));
 $$('.nav-item, .bn-item').forEach((el) => el.classList.toggle('is-active', el.getAttribute('data-page') === page));
 renderPage(page);
 });
 if (document.documentElement.classList.contains('reduce-motion')) window.scrollTo(0, 0);
 else window.scrollTo({ top: 0, behavior: 'smooth' });
 }

 function renderPage(page) {
 switch (page) {
 case 'home': renderHome(); break;
 case 'day': renderMyDay(); break;
 case 'study': renderStudy(); break;
 case 'focus': Pomodoro.render(state()); break;
 case 'progress': renderProgressPage(); break;
 case 'affirmations': renderAffirmations(); break;
 case 'settings': renderSettings(); break;
 default: renderHome();
 }
 }

 /* ---------------------------- platform bits ----------------------------- */
 // Service worker, install prompt, offline badge, wake lock, haptics and sound.
 let deferredInstall = null;
 let swRegistration = null;
 let wakeLock = null;

 function startPlatform() {
 // 1. Service worker: offline support + notification buttons (http/https only)
 if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
 (location.protocol === 'http:' || location.protocol === 'https:')) {
 navigator.serviceWorker.register('sw.js').then((reg) => {
 swRegistration = reg;
 Notifier.setRegistration(reg);
 if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
 }).catch((err) => console.warn('Luvli could not register its service worker', err));

 navigator.serviceWorker.addEventListener('message', (event) => {
 const data = event.data || {};
 if (data.type === 'luvli:start-focus') { startFocusForTask(data.id); return; }
 if (data.type === 'luvli:snooze') { Notifier.snooze(data.minutes || 10, data.tag || ''); }
 });
 }

 // 2. "Add Luvli to your home screen"
 window.addEventListener('beforeinstallprompt', (event) => {
 event.preventDefault();
 deferredInstall = event;
 renderInstallCard();
 });
 window.addEventListener('appinstalled', () => {
 deferredInstall = null;
 renderInstallCard();
 UI.toast({ icon: 'check-circle', title: 'Luvli is on your home screen', body: 'Open it any time — even offline.' });
 });

 // 3. Offline badge
 window.addEventListener('online', renderNetStatus);
 window.addEventListener('offline', renderNetStatus);
 renderNetStatus();

 // 4. Focus mode: keep the screen awake, buzz and chime at the right moments
 document.addEventListener('luvli:focus-start', () => {
 if (state().settings.focusFullscreen) document.body.classList.add('focus-mode');
 requestWakeLock();
 });
 document.addEventListener('luvli:focus-end', () => {
 document.body.classList.remove('focus-mode');
 releaseWakeLock();
 });
 document.addEventListener('luvli:focus-complete', () => {
 buzz([180, 90, 180]);
 chime();
 });
 document.addEventListener('visibilitychange', () => {
 if (document.hidden) releaseWakeLock();
 else if (Pomodoro.isRunning()) requestWakeLock();
 });
 }

 function renderInstallCard() {
 const card = $('installCard');
 if (!card) return;
 const standalone = typeof window.matchMedia === 'function' &&
 window.matchMedia('(display-mode: standalone)').matches;
 card.hidden = !(deferredInstall && !standalone);
 }

 function renderNetStatus() {
 const chip = $('netStatus');
 if (!chip) return;
 const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
 chip.hidden = !offline;
 }

 function installApp() {
 if (!deferredInstall) {
 UI.modal({
 title: 'Add Luvli to your home screen',
 sub: 'One tiny step, luv.',
 bodyHtml: '<p class="card-note">Open your browser menu and choose <strong>“Add to Home screen”</strong> ' +
 '(or “Install app”). Luvli will then open full-screen and work offline.</p>',
 actions: [{ label: 'Got it', action: 'modal-cancel', variant: 'primary' }]
 });
 return;
 }
 deferredInstall.prompt();
 deferredInstall.userChoice.then((choice) => {
 deferredInstall = null;
 renderInstallCard();
 if (choice && choice.outcome === 'accepted') {
 UI.toast({ icon: 'check-circle', title: 'Yay', body: 'Luvli is being added to your home screen.' });
 }
 });
 }

 /** View Transitions where the browser supports them, a plain swap otherwise. */
 function withTransition(action) {
 const reduce = document.documentElement.classList.contains('reduce-motion');
 if (!reduce && typeof document.startViewTransition === 'function') {
 try { document.startViewTransition(action); return; } catch (err) { /* fall through */ }
 }
 action();
 }

 async function requestWakeLock() {
 if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || wakeLock) return;
 try {
 wakeLock = await navigator.wakeLock.request('screen');
 wakeLock.addEventListener('release', () => { wakeLock = null; });
 } catch (err) {
 wakeLock = null;  // not allowed (battery saver, http, etc.) — fine
 }
 }

 function releaseWakeLock() {
 if (wakeLock && wakeLock.release) {
 try { wakeLock.release(); } catch (err) { /* already released */ }
 }
 wakeLock = null;
 }

 /** A soft buzz on the device, when it has one. */
 function buzz(pattern) {
 if (typeof navigator === 'undefined' || !navigator.vibrate) return;
 try { navigator.vibrate(pattern || 40); } catch (err) { /* not important */ }
 }

 /** A gentle three-note chime — only when the user asked for sound. */
 function chime() {
 if (!state().settings.focusSound) return;
 try {
 const Ctx = window.AudioContext || window.webkitAudioContext;
 if (!Ctx) return;
 const ctx = new Ctx();
 [523.25, 659.25, 783.99].forEach((frequency, index) => {
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 const at = ctx.currentTime + index * 0.18;
 osc.type = 'sine';
 osc.frequency.value = frequency;
 osc.connect(gain);
 gain.connect(ctx.destination);
 gain.gain.setValueAtTime(0.0001, at);
 gain.gain.linearRampToValueAtTime(0.16, at + 0.04);
 gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
 osc.start(at);
 osc.stop(at + 0.7);
 });
 setTimeout(() => { try { ctx.close(); } catch (err) { /* done */ } }, 2200);
 } catch (err) {
 // Sound is a bonus, never a requirement
 }
 }

 /* --------------------- rendering (batched per frame) ------------------- */
 // Every screen has a small renderer, and each kind of change only repaints
 // the screens it can affect — then everything happens once per animation
 // frame instead of on every single state change.
 const RENDER_KEYS = ['chrome', 'home', 'day', 'study', 'focus', 'progress', 'affirmations', 'settings'];

 /* 💗 My Luvli Style ♡ — changing it can touch every screen, because the whole
    app speaks in the user's voice: the greeting, the quotes, the reminders. */
 const STYLE_SCREENS = ['chrome', 'home', 'settings'];

 const RENDERERS = {
 chrome: renderChrome,
 home: renderHome,
 day: renderMyDay,
 study: renderStudy,
 focus: () => Pomodoro.render(state()),
 progress: renderProgressPage,
 affirmations: renderAffirmations,
 settings: renderSettings
 };

 /** reason -> screens to repaint (null/unknown means "all of them") */
 const REASON_SCREENS = {
 task:  ['chrome', 'home', 'day', 'study', 'progress'],
 backlog:  ['home', 'day'],
 optimize:  ['chrome', 'home', 'day', 'study', 'progress'],
 lighten:  ['chrome', 'home', 'day', 'study', 'progress'],
 trim:  ['chrome', 'home', 'day', 'study', 'progress'],
 checkin:  ['home', 'day'],
 'night-review':  ['home', 'progress'],
 settings:  ['chrome', 'home', 'day', 'focus', 'settings'],
 'pomodoro-prefs': ['focus'],
 subject:  ['home', 'study', 'progress'],
 session:  ['chrome', 'home', 'study', 'progress'],
 'focus-complete': ['chrome', 'home', 'day', 'study', 'progress', 'focus'],
 affirmations:  ['home', 'affirmations'],
 apps:  ['focus', 'settings'],
 style:  ['chrome', 'home', 'settings']
 };

 const renderQueue = [];
 let renderFrame = null;

 /** Queue a repaint. Pass no keys (or an unknown reason) to repaint everything. */
 function scheduleRender(keys) {
 const list = (keys && keys.length) ? keys : RENDER_KEYS;
 list.forEach((key) => { if (renderQueue.indexOf(key) === -1) renderQueue.push(key); });
 if (renderFrame === null) renderFrame = nextFrame(flushRenders);
 }

 /** requestAnimationFrame when available, otherwise render straight away. */
 function nextFrame(callback) {
 if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
 return window.requestAnimationFrame(callback);
 }
 callback();
 return null;
 }

 /** Repaint everything that was queued (once per frame). */
 function flushRenders() {
 renderFrame = null;
 if (!renderQueue.length) return;
 applyTheme();
 const pending = renderQueue.slice();
 renderQueue.length = 0;
 pending.forEach((key) => {
 const paint = RENDERERS[key];
 if (paint) {
 try { paint(); } catch (err) { console.error('Luvli could not paint ' + key, err); }
 }
 });
 }

 /** Repaint every screen now. */
 function renderAll() {
 scheduleRender(null);
 flushRenders();
 }

 /** Called whenever the stored data changes. */
 function refresh(reason) {
 if (reason === 'notified' || reason === 'notified-prune' || reason === 'notified-snooze') return;
 scheduleRender(REASON_SCREENS[reason] || null);
 }

 /* --------------------------------- HOME --------------------------------- */
 function renderHome() {
 const s = state();
 const today = Utils.todayKey();
 const status = Scheduler.liveStatus(today, s);
 const progress = status.progress;

 // 💗 The voice follows the user's Luvli style (see js/personality.js):
 //    the side quote and the affirmation underneath also adapt.
 setText('greetingText', styleGreeting(s));
 setText('dateText', Utils.formatLongDate(today));
 setText('heroDayState', Scheduler.dayPhaseText(s));
 setText('heroTagline', LuvliStyle.heroTagline(s));

 // The progress ring (r = 52, so the circumference is about 327)
 const ring = $('ringFill');
 if (ring) ring.style.strokeDashoffset = String(327 * (1 - progress.percent / 100));
 setText('progressPercent', progress.percent + '%');
 setText('progressBig', progress.percent + '%');
 setText('progressCount', progress.completed + ' / ' + progress.total + ' completed');
 setText('progressNote', progressNote(progress));

 setHtml('rightNowCard', Scheduler.renderRightNow(s, today));
 setHtml('liveDay', Scheduler.renderLiveDay(s, today));
 announceCurrent(status);

 renderMoodStrip(s);
 renderAiCard(s, status);
 renderHomeQuote(s);
 renderNotifyPrompt(s);
 renderStylePrompt(s);
 }

 /* ============================== ♡ LUVLI AI ===============================
    The assistant's read on the day, built from what Luvli already knows — no
    network, no model, just honest arithmetic over the real schedule. It is
    deliberately the most considered card on Home: a glass surface over a
    pink→lavender wash, a gradient heading and modern action buttons.
    Swap the message builder for a real model call and nothing else changes. */
 function aiMessage(s, status) {
   const today = Utils.todayKey();
   const tasks = Scheduler.tasksFor(today, s);
   const open = tasks.filter((t) => !t.completed);
   const missed = open.filter((t) => Scheduler.timeToMinutes(t.end) <= Scheduler.nowMinutes());
   const focus = open.filter((t) => t.category === 'study' || t.category === 'work' || t.category === 'project');
   const plannedMinutes = open.reduce((total, t) =>
     total + Math.max(0, Scheduler.timeToMinutes(t.end) - Scheduler.timeToMinutes(t.start)), 0);
   const freeSlots = Scheduler.freeSlots(today, s, { fromMin: Scheduler.nowMinutes() });
   const freeMinutes = freeSlots.reduce((total, slot) => total + (slot.end - slot.start), 0);
   const { current, next } = status || Scheduler.liveStatus(today, s);

   // 1. Something is happening right now — say so, and stay out of the way.
   if (current) {
     return 'You are in ' + current.name + ' until ' +
       Scheduler.formatTime(current.end, s) + '. I will keep the rest of the day quiet until then.';
   }

   // 2. The day is over-full — the brief's own example, said kindly.
   if (open.length >= 3 && plannedMinutes > freeMinutes + 45) {
     return 'Your day is looking full — about ' + Math.round(plannedMinutes / 60) +
       'h of work with roughly ' + Math.round(freeMinutes / 60) +
       'h of real space left. I would move one lower-priority task to tomorrow so you have room to focus.';
   }

   // 3. Things slipped — offer to place them, never scold.
   if (missed.length) {
     const first = missed[0];
     return missed.length + ' thing' + (missed.length === 1 ? '' : 's') + ' slipped today — starting with ' +
       first.name + '. I can fit ' + (missed.length === 1 ? 'it' : 'them') +
       ' into your free time, or move ' + (missed.length === 1 ? 'it' : 'them') + ' to tomorrow.';
   }

   // 4. A clear window and something worth doing in it.
   if (freeMinutes >= 30) {
     const nextThing = focus[0] || open[0];
     if (nextThing) {
       return 'You have about ' + Math.round(freeMinutes / 60 * 10) / 10 +
         'h of clear time coming up. A good moment for ' + nextThing.name + ' — I have kept the space protected.';
     }
     return 'You have ' + Math.round(freeMinutes / 60 * 10) / 10 +
       'h genuinely free. Nothing needs you — a pause would serve you well.';
   }

   // 5. Next thing, when the window is short.
   if (next) {
     return 'Next up is ' + next.name + ' at ' + Scheduler.formatTime(next.start, s) +
       '. You are on top of the day so far.';
   }

   // 6. A blank page.
   return 'Your day is a blank page. Tell me what matters today and I will build the shape of it around you.';
 }

 /** The action buttons under the AI message — real things, one tap away. */
 function aiActions(s, status) {
   const today = Utils.todayKey();
   const open = Scheduler.tasksFor(today, s).filter((t) => !t.completed);
   const missed = open.filter((t) => Scheduler.timeToMinutes(t.end) <= Scheduler.nowMinutes());
   const freeMinutes = Scheduler.freeSlots(today, s, { fromMin: Scheduler.nowMinutes() })
     .reduce((total, slot) => total + (slot.end - slot.start), 0);
   const planned = open.reduce((total, t) =>
     total + Math.max(0, Scheduler.timeToMinutes(t.end) - Scheduler.timeToMinutes(t.start)), 0);
   const actions = [];

   actions.push({ label: 'Ask Luvli', icon: 'cpu', href: 'ai-coach.html' });
   if (missed.length) actions.push({ label: 'Fit them in', icon: 'wand', action: 'optimize-day' });
   if (open.length >= 3 && planned > freeMinutes + 45) {
     actions.push({ label: 'Move one to tomorrow', icon: 'calendar', action: 'lighten-day' });
   }
   if (freeMinutes >= 30 && !status.current) actions.push({ label: 'What now?', icon: 'compass', action: 'what-now' });
   if (!actions.length) actions.push({ label: 'Plan my day', icon: 'target', action: 'add-activity' });

   return actions.slice(0, 3).map((item) =>
     item.href
       ? '<a class="btn btn-soft btn-small" href="' + item.href + '">' + ico(item.icon) + item.label + '</a>'
       : '<button class="btn btn-soft btn-small" type="button" data-action="' + item.action + '">' +
         ico(item.icon) + item.label + '</button>').join('');
 }

 /** Paint the Luvli AI card. */
 function renderAiCard(s, status) {
   const card = $('aiCard');
   if (!card) return;
   setText('aiMessage', aiMessage(s, status));
   setHtml('aiActions', aiActions(s, status));
 }

 /**
  * Luvli's greeting, in the user's chosen style. The morning message is written
  * once per day by LuvliStyle, so it is the same warm line all day long.
  */
 function styleGreeting(s) {
  const prefs = LuvliStyle.get(s);
  const timeLine = Scheduler.greeting(s);
  const message = LuvliStyle.morningMessage(s);
  // Before a style is chosen we keep the original, familiar Luvli greeting.
  if (!prefs.chosen) return timeLine;
  // The personalised morning line already opens the day, so lead with it.
  return message || timeLine;
 }

 /** A kind one-liner under the progress ring. */
 function progressNote(progress) {
 if (!progress.total) return "Let's add a few things to your day first, luv.";
 if (progress.percent === 100) return 'Everything is done. You did it, luv!';
 if (progress.percent >= 60) return 'More than half way — so proud of you.';
 if (progress.percent > 0) return 'Small progress is still progress.';
 return 'A fresh start. One thing at a time, luv.';
  }

  /* ------------------------------ check-in -------------------------------- */
  function renderMoodStrip(s) {
    const saved = s.checkIns[Utils.todayKey()];
    const current = saved ? saved.mood : '';

    setHtml('moodStrip', CHECK_IN_MOODS.map((mood) =>
      '<button class="mood-btn' + (mood.key === current ? ' is-active' : '') + '" type="button" ' +
      'aria-pressed="' + (mood.key === current ? 'true' : 'false') + '" ' +
      'data-action="checkin-mood" data-mood="' + mood.key + '">' +
      mood.label + '</button>').join(''));

    const message = $('moodMessage');
    if (!message) return;
    if (!current) {
      message.textContent = 'Tap how you feel and Luvli will adjust the day with you.';
    } else if (current === 'low' || current === 'exhausted') {
 message.innerHTML = 'Thank you for telling me. <strong>Let\'s make today a little gentler.</strong> ' +
 'Tap “Lighten my day” and I will move what I can.';
 } else if (current === 'okay') {
 message.textContent = 'Okay is completely fine. We will take it one thing at a time.';
 } else {
 message.textContent = Progress.moodLabel(current) + ' — lovely. Let\'s make today feel luvli.';
 }
 }

 /**
  * The quote card on Home. A personalised affirmation (built from goals, mood,
  * habits and the chosen style) when a style has been chosen, otherwise the
  * classic affirmation library.
  */
 function renderHomeQuote(s) {
 const prefs = LuvliStyle.get(s);
 if (!homeQuote) {
 homeQuote = prefs.chosen
 ? personalisedQuote(s)
 : Affirmations.random(s, { mood: moodOfToday() });
 }
 setText('homeQuote', '“' + homeQuote.text + '”');
 }

 /**
  * A personalised affirmation, shaped like the ones Affirmations returns.
  *
  * Deliberately doesn't write anything: this runs inside the render pass, and a
  * render must never change the saved state (it would push an undo snapshot and
  * make "undo" step through paintings instead of real changes). The moments
  * Luvli remembers are recorded in the click handlers below.
  */
 function personalisedQuote(s) {
 const line = moodOfToday() === 'low' || moodOfToday() === 'exhausted'
 ? LuvliStyle.affirmation(s, { tag: 'low-energy' })
 : LuvliStyle.affirmation(s);
 return { text: line.text, category: line.tag };
 }

 /** Only ask for notification permission when the browser has not been asked yet. */
 function renderNotifyPrompt(s) {
 const prompt = $('notifyPrompt');
 if (!prompt) return;
 const settings = s.settings.notifications;
 const canAsk = Notifier.supported() && Notifier.permission() === 'default';
 prompt.hidden = !(canAsk && !settings.promptDismissed);
 }

 /* -------------------------------- MY DAY -------------------------------- */
 function renderMyDay() {
 const s = state();
 const tasks = Scheduler.tasksFor(view.date, s);
 const progress = Scheduler.dayProgress(view.date, s);

 setText('dayDateLabel', Utils.relativeDateLabel(view.date) + ' · ' + Utils.formatShortDate(view.date));
 setText('dayPlanSummary', tasks.length
 ? tasks.length + ' thing' + (tasks.length === 1 ? '' : 's') + ' · ' + progress.completed + ' done · ' +
 Utils.formatMinutes(progress.minutesPlanned) + ' planned'
 : 'Nothing planned yet');

 setHtml('timeline', Scheduler.renderTimeline(s, view.date));
 setHtml('dayGrid', Scheduler.renderDayGrid(s, view.date));
 setHtml('backlogList', Scheduler.renderBacklog(s));
 setHtml('routineChips', Scheduler.ROUTINES.map((item) =>
 '<button class="chip-item" type="button" data-action="add-routine" data-key="' + item.key + '">' +
 '<span>' + ico(item.icon) + ' ' + esc(item.name) + '</span>' +
 '<span class="chip-x" aria-hidden="true">+</span></button>').join(''));

 const hint = $('dayTimelineHint');
 if (hint) {
 hint.textContent = tasks.length
 ? Utils.formatMinutes(progress.minutesDone) + ' of ' + Utils.formatMinutes(progress.minutesPlanned) + ' done'
 : '';
 }

 renderDayAlert(s);
 }

 /** The soft notice above the plan: overload, missed things, gentle moods. */
 function renderDayAlert(s) {
 const box = $('dayAlert');
 if (!box) return;

 const isToday = view.date === Utils.todayKey();
 const outlook = Scheduler.dayOutlook(s, view.date);
 const forecast = Scheduler.feasibility(s, view.date);
 const mood = moodOfToday();
 const gentle = mood === 'low' || mood === 'exhausted';

 let html = '';
 let warn = false;

 if (isToday && gentle) {
 html = '<span class="alert-ico"></span><div><strong>' +
 "Let's make today a little gentler, luv.</strong> I can move the lighter things to tomorrow so today feels softer." +
 '</div><div class="row-gap"><button class="btn btn-soft btn-small" type="button" data-action="lighten-day">Lighten my day</button></div>';
 } else if (isToday && forecast.level === 'over') {
 warn = true;
 html = '<span class="alert-ico"></span><div><strong>' + esc(forecast.message) + '</strong> ' +
 'I would move ' + forecast.overflow.length + ' gentle thing' + (forecast.overflow.length === 1 ? '' : 's') +
 ' — about ' + Utils.formatMinutes(Math.min(forecast.needed - forecast.free, Math.round(forecast.needed))) +
 ' of pressure — so everything else fits.' +
 '</div><div class="row-gap">' +
 '<button class="btn btn-soft btn-small" type="button" data-action="trim-day">Move the extra to tomorrow</button>' +
 '<button class="btn btn-ghost btn-small" type="button" data-action="lighten-day">Lighten instead</button>' +
 '</div>';
 } else if (isToday && forecast.level === 'tight') {
 html = '<span class="alert-ico"></span><div><strong>' + esc(forecast.message) + '</strong></div>';
 } else if (isToday && outlook.behind) {
 html = '<span class="alert-ico"></span><div><strong>' +
 outlook.missed + ' thing' + (outlook.missed === 1 ? '' : 's') + ' slipped past — that is completely okay.' +
 '</strong> Want me to fit them into the rest of today?</div>' +
 '<div class="row-gap"><button class="btn btn-soft btn-small" type="button" data-action="optimize-day">Reschedule them</button></div>';
 } else if (isToday && outlook.overloaded) {
 warn = true;
 html = '<span class="alert-ico"></span><div><strong>' + outlook.message +
 '</strong> You have ' + Utils.formatMinutes(outlook.freeMinutes) + ' of breathing room left today.' +
 '</div><div class="row-gap"><button class="btn btn-soft btn-small" type="button" data-action="optimize-day">Optimize my day</button></div>';
 } else if (isToday && outlook.noRoom) {
 html = '<span class="alert-ico"></span><div><strong>Back-to-back day, luv.</strong> ' +
 'I will protect your breaks — but come talk to me if it gets too much.</div>';
 }

 box.hidden = !html;
 box.classList.toggle('is-warn', warn);
 box.innerHTML = html;
 }

 /** The category picker on the Smart Scheduler row. */
 function fillCategorySelects() {
 const backlogCategory = $('backlogCategory');
 if (backlogCategory && backlogCategory.options.length === 0) {
 backlogCategory.innerHTML = Scheduler.categoryOptions('study');
 }
 }

 /* --------------------------------- STUDY -------------------------------- */
 const esc = Utils.escapeHtml;

 function renderStudy() {
 const s = state();
 setHtml('studyStats', Progress.renderStudyStats(s));
 renderSubjects(s);
 renderStudyHistory(s);
 }

 function renderSubjects(s) {
 const subjects = s.subjects || [];

 if (!subjects.length) {
 setHtml('subjectList',
 '<div class="empty-state"><span class="empty-ico">' + ico('user') + '</span><strong>No subjects yet</strong>' +
 '<p>Add what you are learning and Luvli will keep your goals and sessions together.</p>' +
 '<button class="btn btn-primary" type="button" data-action="add-subject">+ New subject</button></div>');
 return;
 }

 setHtml('subjectList', subjects.map((subject) => {
 const progress = Utils.clamp(Number(subject.progress) || 0, 0, 100);
 const next = nextSessionFor(s, subject);
 return '<div class="subject-card" data-id="' + subject.id + '">' +
 '<div class="subject-top">' +
 '<span class="subject-emoji">' + subject.emoji + '</span>' +
 '<span class="subject-name">' + esc(subject.name) + '</span>' +
 (progress >= 100 ? '<span class="chip chip-done">Goal complete</span>' : '') +
 '</div>' +
 '<div class="subject-goal">' +
 (subject.goal ? 'Current goal: <strong>' + esc(subject.goal) + '</strong>' : 'No goal set yet — add one when you are ready.') +
 '</div>' +
 '<div class="progress-line"><span>Progress</span><span>' + progress + '%</span></div>' +
 '<div class="bar"><div class="bar-fill" style="width:' + progress + '%"></div></div>' +
 '<div class="subject-next mt-12">' +
 (next ? 'Next session: ' + esc(next) : 'No session planned — want to add one?') +
 '</div>' +
 '<div class="subject-actions">' +
 '<button class="btn btn-primary btn-small" type="button" data-action="subject-study" data-id="' + subject.id + '">Focus now</button>' +
 '<button class="btn btn-soft btn-small" type="button" data-action="subject-log" data-id="' + subject.id + '">Log a session</button>' +
 '<button class="btn btn-ghost btn-small" type="button" data-action="subject-edit" data-id="' + subject.id + '">Edit</button>' +
 '<button class="btn btn-danger btn-small" type="button" data-action="subject-delete" data-id="' + subject.id + '">Delete</button>' +
 '</div>' +
 '</div>';
 }).join(''));
 }

 /** "Today at 13:00" / "Tomorrow at 09:00" / null for a subject. */
 function nextSessionFor(s, subject) {
 const name = String(subject.name).toLowerCase();
 const upcoming = (s.tasks || [])
 .filter((t) => !t.completed && t.name.toLowerCase().indexOf(name) > -1)
 .filter((t) => Utils.dayDiff(Utils.todayKey(), t.date) >= 0)
 .sort((a, b) => (a.date === b.date ? Scheduler.timeToMinutes(a.start) - Scheduler.timeToMinutes(b.start) : (a.date < b.date ? -1 : 1)));

 if (!upcoming.length) return null;
 const task = upcoming[0];
 return Utils.relativeDateLabel(task.date) + ' at ' + Scheduler.formatTime(task.start, s);
 }

 function renderStudyHistory(s) {
 const sessions = (s.sessions || []).slice().sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1));
 const summary = $('historySummary');
 if (summary) {
 summary.textContent = sessions.length
 ? sessions.length + ' session' + (sessions.length === 1 ? '' : 's') + ' · ' +
 Utils.formatMinutes(Progress.totals(s).allTime.minutes) + ' total'
 : 'Nothing logged yet';
 }

 if (!sessions.length) {
 setHtml('studyHistory',
 '<div class="empty-state"><span class="empty-ico">' + ico('timer') + '</span><strong>No focus sessions yet</strong>' +
 '<p>Finish a Focus session (or log one) and it will show up here.</p></div>');
 return;
 }

 setHtml('studyHistory', sessions.slice(0, 25).map((session) => {
 const subject = (s.subjects || []).find((item) => item.id === session.subjectId);
 return '<div class="history-item">' +
 '<span class="history-ico">' + (subject && subject.emoji ? esc(subject.emoji) : ico('timer')) + '</span>' +
 '<span class="history-main">' +
 '<span class="history-title">' + esc(session.goal || session.subjectName || 'Focus session') + '</span>' +
 '<span class="history-sub">' + esc(session.subjectName || 'Focus') + ' · ' +
 esc(Utils.relativeDateLabel(session.date)) + '</span>' +
 '</span>' +
 '<span class="history-mins">' + (session.minutes || 0) + 'm</span>' +
 '<button class="chip-x" type="button" data-action="session-delete" data-id="' + session.id + '" ' +
 'aria-label="Delete session">×</button>' +
 '</div>';
 }).join(''));
 }

 /* ------------------------------- PROGRESS ------------------------------- */
 function renderProgressPage() {
 const s = state();
 const totals = Progress.totals(s);

 setHtml('progressStats', Progress.renderStatCards(s));
 setHtml('weekChart', Progress.renderWeekChart(s));
 setHtml('moodHistory', Progress.renderMoodHistory(s));
 setHtml('insightCard', renderInsights(s));
 setText('consistencyNote', Progress.consistencyNote(s));
 setText('progressWeekChip', totals.week.daysShownUp + ' of 7 days this week');
 setText('weekTotalHint', Utils.formatMinutes(totals.week.minutes) + ' · ' +
 totals.week.sessions + ' session' + (totals.week.sessions === 1 ? '' : 's'));
 }

 /* ------------------------------ AFFIRMATIONS ---------------------------- */
 /**
  * 💗 The personalised half of the Affirmations page: which kinds of
  * affirmation Luvli should write, and a peek at a real one for today.
  */
 function renderStyleAffirmations(s) {
 const prefs = LuvliStyle.get(s);
 setText('afStyleName', prefs.name);

 const chips = $('afStyleChips');
 if (chips) {
 chips.innerHTML = LuvliStyle.AFFIRMATION_STYLES.map((item) => {
 const on = prefs.affirmations.indexOf(item.key) > -1;
 return '<button class="chip-item' + (on ? ' is-on' : '') + '" type="button" ' +
 'aria-pressed="' + (on ? 'true' : 'false') + '" ' +
 'data-action="toggle-affirmation-style" data-key="' + item.key + '">' +
 '<span>' + esc(item.label) + '</span>' +
 '<span class="chip-x" aria-hidden="true">' + (on ? '✓' : '+') + '</span>' +
 '</button>';
 }).join('');
 }

 // Show one real, personalised line so the promise is visible, not just words.
 const preview = $('afStylePreview');
 if (preview) {
 const line = LuvliStyle.affirmation(s, { salt: Utils.todayKey() });
 preview.innerHTML = '“' + esc(line.text) + '”' +
 '<span class="card-hint">' + esc(LuvliStyle.AFFIRMATION_LABEL(line.tag)) + '</span>';
 }
 }

 function renderAffirmations() {
 const s = state();
 if (!pageQuote) pageQuote = Affirmations.random(s, {});

 setText('afCategoryLabel', Affirmations.label(pageQuote.category));

 const big = $('afBig');
 if (big && big.textContent !== pageQuote.text) {
 big.textContent = pageQuote.text;
 big.style.animation = 'none';
 void big.offsetWidth;  // restart the fade animation
 big.style.animation = '';
 }

 setHtml('afCategoryChips', Affirmations.categoryChips(s));
 setHtml('favList', Affirmations.renderFavorites(s));
 setHtml('customAffList', Affirmations.renderCustom(s));
 setText('favCount', (s.affirmations.favorites || []).length + ' saved');
 renderStyleAffirmations(s);

 const favBtn = $('afFavBtn');
 if (favBtn) {
 const saved = Affirmations.isFavorite(s, pageQuote.text);
 favBtn.textContent = saved ? 'Saved' : 'Save this';
 favBtn.className = 'btn ' + (saved ? 'btn-primary' : 'btn-soft');
 }
 }

 /** Show a different affirmation (Home card or the Affirmations page). */
 function shuffleAffirmation(event) {
 const s = state();
 const prefs = LuvliStyle.get(s);
 const forHome = event && event.currentTarget && event.currentTarget.getAttribute('data-action') === 'new-quote';

 if (forHome) {
 // With a Luvli style chosen, Home shows a *personalised* line built from
 // goals, mood, habits and the style — otherwise the classic library.
 homeQuote = prefs.chosen
 ? personalisedQuote(s)
 : Affirmations.random(s, { mood: moodOfToday(), exclude: homeQuote ? homeQuote.text : '' });
 if (homeQuote) setText('homeQuote', '“' + homeQuote.text + '”');
 if (prefs.chosen) LuvliStyle.rememberAffirmation(s, homeQuote.text);
 return;
 }

 pageQuote = prefs.chosen
 ? personalisedQuote(s)
 : Affirmations.random(s, { mood: moodOfToday(), exclude: pageQuote ? pageQuote.text : '' });
 renderAffirmations();
 UI.burstFrom(event ? event.currentTarget : null, 6);
 }

 /* -------------------------------- SETTINGS ------------------------------ */
 function checked(id, value) {
 const el = $(id);
 if (el) el.checked = Boolean(value);
 }

 function renderSettings() {
 const s = state();
 const settings = s.settings;
 const notifications = settings.notifications;

 setValue($('setName'), s.profile.name || '');
 setValue($('setWake'), settings.wakeTime);
 setValue($('setSleep'), settings.sleepTime);
 setValue($('setTimeFormat'), settings.timeFormat);
 setValue($('setFocus'), settings.focusLength);
 setValue($('setBreak'), settings.breakLength);
 setValue($('setLongBreak'), settings.longBreakLength);
 setValue($('setNotifLead'), String(notifications.leadMinutes));
 setValue($('setBuffer'), String(settings.bufferMinutes));
 setValue($('setMaxHours'), String(settings.maxPlannedHours));

 checked('setAutoBreak', settings.autoBreak);
 checked('setNotifEnabled', notifications.enabled);
 checked('setNotifEvening', notifications.evening);
 checked('setNotifCelebrate', notifications.celebrate);
 checked('setProtectBreaks', settings.protectBreaks);
 checked('setAutoOptimize', settings.autoOptimize);
 checked('setAffFocus', settings.affirmations.duringFocus);
 checked('setReduceMotion', settings.reduceMotion);
 checked('setFocusFullscreen', settings.focusFullscreen);
 checked('setFocusSound', settings.focusSound);

 setValue($('setSyncEndpoint'), (settings.sync && settings.sync.endpoint) || '');
 checked('setSyncAuto', Boolean(settings.sync && settings.sync.endpoint && settings.sync.autoPush));
 setText('syncStatus', Sync.statusText());

 setHtml('setAffCategories', Affirmations.categoryChips(s));
 setHtml('setStudyAppChips', Pomodoro.appChipsHtml(s.studyApps || [], 'study'));
 setHtml('setDistractionAppChips', Pomodoro.appChipsHtml(s.distractionApps || [], 'distraction'));

 setHtml('themePicker', THEMES.map((theme) =>
 '<button class="theme-swatch' + (theme.key === settings.theme ? ' is-active' : '') + '" type="button" ' +
 'aria-pressed="' + (theme.key === settings.theme ? 'true' : 'false') + '" ' +
 'data-action="set-theme" data-theme="' + theme.key + '">' +
 '<span class="theme-dots">' + theme.colors.map((color) =>
 '<span style="background:' + color + '"></span>').join('') + '</span>' + theme.label + '</button>').join(''));

 renderAccountCard();

 setText('notifStatus', Notifier.statusText());
 const notifBtn = $('notifPermissionBtn');
 if (notifBtn) {
 if (!Notifier.supported()) { notifBtn.disabled = true; notifBtn.textContent = 'Not supported here'; }
 else if (Notifier.permission() === 'granted') { notifBtn.disabled = false; notifBtn.textContent = 'Send a test reminder'; }
 else { notifBtn.disabled = false; notifBtn.textContent = 'Allow browser notifications'; }
 }

 const stats = Storage.stats();
 const archived = Storage.archivedTotals();
 setText('storageInfo', stats.tasks + ' activities · ' + stats.subjects + ' subjects · ' +
 stats.sessions + ' focus sessions · ' + stats.checkIns + ' check-ins · ' + stats.sizeKb + ' KB saved' +
 (archived.months ? ' · ' + archived.months + ' older month' + (archived.months === 1 ? '' : 's') + ' summarised' : ''));
 }

 /* ------------------------------ ACTIVITIES ------------------------------ */
 /** A sensible start time: the next free moment on that day. */
 function suggestStartTime(s, date) {
 const isToday = date === Utils.todayKey();
 const from = isToday ? Math.max(Scheduler.nowMinutes(), Scheduler.wakeMinutes(s)) : Scheduler.wakeMinutes(s);
 const rounded = Math.ceil(from / 15) * 15;
 const slots = Scheduler.freeSlots(date, s, { fromMin: rounded });
 return Scheduler.minutesToTime(slots.length ? slots[0].start : rounded + 60);
 }

 /**
 * Add or edit an activity.
 * @param {string} [taskId]  the activity being edited
 * @param {string} [presetDate] which day to add it to
 * @param {object} [draft]  values to pre-fill (used by the clash flow)
 */
 function openTaskModal(taskId, presetDate, draft) {
 const s = state();
 const task = taskId ? (s.tasks || []).find((t) => t.id === taskId) : null;
 const source = task || draft || null;

 const date = source ? source.date : (presetDate || view.date || Utils.todayKey());
 const start = source ? source.start : suggestStartTime(s, date);
 const end = source ? source.end : Scheduler.minutesToTime(Scheduler.timeToMinutes(start) + 60);
 const priority = source ? source.priority : 'medium';
 const category = source ? source.category : 'study';

 UI.modal({
 title: task ? 'Edit activity' : 'Add to your day',
 sub: Utils.relativeDateLabel(date) + ' · ' + Utils.formatLongDate(date),
 wide: true,
 bodyHtml:
 '<label class="field"><span class="field-label">What is it?</span>' +
 '<input class="input" id="taskName" type="text" placeholder="e.g. Python study" value="' +
 esc(source ? source.name : '') + '" /></label>' +
 '<div class="field-row">' +
 '<label class="field"><span class="field-label">Category</span>' +
 '<select class="input" id="taskCategory">' + Scheduler.categoryOptions(category) + '</select></label>' +
 '<label class="field"><span class="field-label">Priority</span>' +
 '<select class="input" id="taskPriority">' +
 ['high', 'medium', 'low'].map((key) =>
 '<option value="' + key + '"' + (priority === key ? ' selected' : '') + '>' +
 Scheduler.PRIORITIES[key].label + '</option>').join('') +
 '</select></label>' +
 '</div>' +
 '<div class="field-row">' +
 '<label class="field"><span class="field-label">Starts</span>' +
 '<input class="input" id="taskStart" type="time" value="' + start + '" /></label>' +
 '<label class="field"><span class="field-label">Ends</span>' +
 '<input class="input" id="taskEnd" type="time" value="' + end + '" /></label>' +
 '</div>' +
 '<label class="field"><span class="field-label">Date</span>' +
 '<input class="input" id="taskDate" type="date" value="' + date + '" /></label>' +
 '<label class="field"><span class="field-label">Repeat' +
 ((task && task.seriesId) ? ' <span class="field-hint">— changing this stops the series from this day</span>' : '') +
 '</span>' +
 '<select class="input" id="taskRepeat">' +
 ['none', 'daily', 'weekdays', 'weekly'].map((key) =>
 '<option value="' + key + '"' +
 ((source && source.repeat ? source.repeat : 'none') === key ? ' selected' : '') + '>' +
 Scheduler.repeatLabel(key) + '</option>').join('') +
 '</select></label>' +
 '<label class="field"><span class="field-label">Notes (optional)</span>' +
 '<textarea class="input" id="taskNotes" placeholder="The goal for this session, or anything you want to remember…">' +
 esc(source ? source.notes : '') + '</textarea></label>',
 actions: (task ? [
 { label: 'Delete', action: 'task-delete', variant: 'danger', attrs: 'data-id="' + task.id + '"' }
 ] : []).concat([
 { label: 'Cancel', action: 'modal-cancel', variant: 'ghost' },
 { label: task ? 'Save changes' : 'Add to my day', action: 'task-save', variant: 'primary',
 attrs: 'data-id="' + (task ? task.id : '') + '"' }
 ])
 });

 // Keep the end time sensible when the start time changes
 const startInput = $('taskStart');
 const endInput = $('taskEnd');
 if (startInput && endInput) {
 startInput.addEventListener('change', () => {
 const from = Scheduler.timeToMinutes(startInput.value || '09:00');
 if (Scheduler.timeToMinutes(endInput.value || '00:00') <= from) {
 endInput.value = Scheduler.minutesToTime(from + 60);
 }
 });
 }
 }

 /** The values the user just filled in, held while we decide about clashes. */
 let pendingTask = null;

 /** Write a payload into the state (add it, or update the existing one). */
 function applyTaskPayload(draft, payload) {
 const existing = payload.id ? draft.tasks.find((t) => t.id === payload.id) : null;
 const repeat = payload.repeat || 'none';

 if (existing) {
 existing.name = payload.name;
 existing.date = payload.date;
 existing.start = payload.start;
 existing.end = payload.end;
 existing.category = payload.category;
 existing.priority = payload.priority;
 existing.notes = payload.notes;
 existing.repeat = repeat;

 // "Just once" on an activity that used to repeat stops the series here
 if (existing.seriesId && repeat === 'none') {
 Scheduler.stopSeries(draft, existing.seriesId, existing.date);
 }
 } else {
 const task = {
 id: Utils.uid('task'),
 date: payload.date,
 name: payload.name,
 start: payload.start,
 end: payload.end,
 category: payload.category,
 priority: payload.priority,
 notes: payload.notes,
 repeat: repeat,
 completed: false,
 createdAt: new Date().toISOString()
 };
 if (repeat !== 'none') task.seriesId = task.id;
 draft.tasks.push(task);
 // Repeating activities quietly fill in the rest of the week
 if (repeat !== 'none') Scheduler.materialiseRecurring(draft, 7);
 }
 }

 /** Keep repeating activities topped up (called once at start-up). */
 function ensureRecurring() {
 const draft = state();
 const created = Scheduler.materialiseRecurring(draft, 7);
 if (created.length) Storage.save();
 return created.length;
 }

 function saveTaskFromModal(id) {
 const nameInput = $('taskName');
 const name = nameInput ? nameInput.value.trim() : '';
 if (!name) {
 UI.toast({ icon: '', title: 'Give it a name first, luv', body: 'Even a few words is enough.' });
 if (nameInput) nameInput.focus();
 return;
 }

 const date = ($('taskDate') || {}).value || Utils.todayKey();
 const start = ($('taskStart') || {}).value || '09:00';
 let end = ($('taskEnd') || {}).value || Scheduler.minutesToTime(Scheduler.timeToMinutes(start) + 60);
 if (Scheduler.timeToMinutes(end) <= Scheduler.timeToMinutes(start)) {
 end = Scheduler.minutesToTime(Scheduler.timeToMinutes(start) + 60);
 }

 pendingTask = {
 id: id || '',
 date: date,
 name: name,
 start: start,
 end: end,
 category: ($('taskCategory') || {}).value || 'custom',
 priority: ($('taskPriority') || {}).value || 'medium',
 repeat: ($('taskRepeat') || {}).value || 'none',
 notes: ($('taskNotes') || {}).value.trim()
 };

 // Is that time already taken? Ask before quietly double-booking the day.
 const conflicts = Scheduler.findConflicts(date, state(), pendingTask, id || null);
 if (conflicts.length) {
 openClashModal(conflicts);
 return;
 }
 commitPendingTask();
 }

 /** "That time is already taken" — with a one-tap way out. */
 function openClashModal(conflicts) {
 if (!pendingTask) return;
 const s = state();
 const movable = conflicts.filter((task) => !task.completed && !Scheduler.isProtected(task));
 const actions = [];

 if (movable.length) actions.push({ label: 'Fit it in for me', action: 'task-fit', variant: 'primary' });
 actions.push({ label: 'Keep both anyway', action: 'task-force', variant: movable.length ? 'soft' : 'primary' });
 actions.push({ label: 'Change the time', action: 'task-adjust', variant: 'ghost' });

 UI.modal({
 title: 'That time is already taken',
 sub: esc(pendingTask.name) + ' · ' + Scheduler.formatRange(pendingTask.start, pendingTask.end, s),
 bodyHtml:
 '<p class="card-note">It overlaps:</p>' +
 '<ul class="af-list">' + conflicts.map((task) =>
 '<li>' + Scheduler.iconFor(task) + ' <strong>' + esc(task.name) + '</strong> · ' +
 Scheduler.formatRange(task.start, task.end, s) +
 (Scheduler.isProtected(task) || task.completed ? ' <span class="chip chip-soft">kept in place</span>' : '') +
 '</li>').join('') + '</ul>' +
 (movable.length
 ? '<p class="card-note">I can nudge the movable one' + (movable.length === 1 ? '' : 's') +
 ' later — I never move meals, rest, appointments or finished things.</p>'
 : '<p class="card-note">These are all protected, so I will keep them exactly where they are.</p>'),
 actions: actions
 });
 }

 /** Save it at the time the user asked for, and shift what was in the way. */
 function fitPendingTask() {
 if (!pendingTask) return;
 const payload = pendingTask;
 pendingTask = null;
 let moved = [];
 let locked = 0;

 Storage.update((draft) => {
 const result = Scheduler.fitAround(payload.date, draft, payload, payload.id || null);
 moved = result.moved;
 locked = result.locked.length;
 applyTaskPayload(draft, payload);
 }, 'task');

 UI.closeModal();
 view.date = payload.date;
 UI.toast({
 icon: 'wand',
 title: 'Fitted in, luv',
 body: moved.length
 ? moved.map((item) => item.name + ' → ' + Scheduler.formatTime(item.start, state())).join(' · ')
 : 'I found a spot without moving anything' + (locked ? ' (kept ' + locked + ' protected)' : '.'),
 undo: true
 });
 UI.burst(null, null, 6);
 }

 /** Save it exactly as asked, even if that means two things at once. */
 function forcePendingTask() {
 if (!pendingTask) return;
 const payload = pendingTask;
 pendingTask = null;
 Storage.update((draft) => applyTaskPayload(draft, payload), 'task');
 UI.closeModal();
 view.date = payload.date;
 UI.toast({
 icon: '',
 title: payload.id ? 'Activity updated' : 'Added to your day',
 body: payload.name + ' · ' + Scheduler.formatRange(payload.start, payload.end, state()),
 undo: true
 });
 UI.burst(null, null, 6);
 }

 /** Go back to the form with everything still filled in. */
 function adjustPendingTask() {
 if (!pendingTask) return;
 const payload = pendingTask;
 pendingTask = null;
 UI.closeModal();
 openTaskModal(payload.id || null, payload.date, payload);
 }

 /** Save straight away — used when nothing clashes. */
 function commitPendingTask() {
 if (!pendingTask) return;
 const payload = pendingTask;
 pendingTask = null;
 Storage.update((draft) => applyTaskPayload(draft, payload), 'task');
 UI.closeModal();
 view.date = payload.date;
 UI.toast({
 icon: '',
 title: payload.id ? 'Activity updated' : 'Added to your day',
 body: payload.name + ' · ' + Scheduler.formatRange(payload.start, payload.end, state()),
 undo: true
 });
 UI.burst(null, null, 6);
 }

 /** Tick something off — or put it back, with zero judgement. */
 function toggleTask(id, element) {
 const s = state();
 const task = (s.tasks || []).find((t) => t.id === id);
 if (!task) return;
 const nowDone = !task.completed;

 // Remember where the button was before the list repaints
 const rect = (element && element.getBoundingClientRect) ? element.getBoundingClientRect() : null;

 Storage.update((draft) => {
 const draftTask = draft.tasks.find((t) => t.id === id);
 if (!draftTask) return;
 draftTask.completed = nowDone;
 draftTask.completedAt = nowDone ? new Date().toISOString() : null;
 }, 'task');

 if (nowDone) {
 if (rect) UI.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 10);
 else UI.burst(null, null, 10);

 // A soft bump on the freshly completed row (see .pop in the stylesheet)
 const row = document.querySelector('.tl-item[data-id="' + id + '"]');
 if (row) row.classList.add('pop');

 document.dispatchEvent(new CustomEvent('luvli:task-complete', { detail: { name: task.name, id: task.id } }));
 const celebrateLine = (typeof LuvliStyle !== 'undefined') ? LuvliStyle.voice(s).celebrate : 'That is one more thing done.';
 UI.toast({ icon: 'check-circle', title: 'You did it, luv!', body: celebrateLine });
 } else {
 UI.toast({ icon: 'heart', title: 'Moved back to your list', body: task.name + ' is not finished — no problem at all.' });
 }
 }

 function deleteTask(id) {
 const task = (state().tasks || []).find((t) => t.id === id);
 if (!task) return;
 confirmTarget = { kind: 'task', id: task.id };
 UI.confirm({
 title: 'Delete this activity?',
 sub: '"' + task.name + '" will be removed from ' + Utils.relativeDateLabel(task.date) + '.',
 confirmLabel: 'Delete it',
 confirmAction: 'task-delete-confirm',
 variant: 'danger',
 bodyHtml: '<p class="card-note">You can always add it again later.</p>'
 });
 }

 /** The little "move it" menu for something that slipped past. */
 function openRescheduleModal(id) {
 const s = state();
 const task = (s.tasks || []).find((t) => t.id === id);
 if (!task) return;

 UI.modal({
 title: 'Move it — no stress',
 sub: '"' + task.name + '" · ' + Scheduler.formatRange(task.start, task.end, s),
 bodyHtml:
 '<p class="card-note">You missed this one, luv. That\'s okay. Where would you like it to go?</p>' +
 '<div class="row-gap row-wrap">' +
 [15, 30, 60].map((mins) =>
 '<button class="btn btn-soft btn-small" type="button" data-action="resched-quick" ' +
 'data-id="' + task.id + '" data-minutes="' + mins + '">+' + mins + ' min</button>').join('') +
 '<button class="btn btn-soft btn-small" type="button" data-action="resched-tomorrow" ' +
 'data-id="' + task.id + '">Move to tomorrow</button>' +
 '</div>',
 actions: [
 { label: 'Pick a time myself', action: 'task-edit', variant: 'primary', attrs: 'data-id="' + task.id + '"' },
 { label: 'Close', action: 'modal-cancel', variant: 'ghost' }
 ]
 });
 }

 /** Shift an activity by a number of minutes. */
 function quickReschedule(id, minutes) {
 let newRange = '';
 Storage.update((draft) => {
 const task = draft.tasks.find((t) => t.id === id);
 if (!task) return;
 const shift = Number(minutes) || 30;
 task.start = Scheduler.minutesToTime(Scheduler.timeToMinutes(task.start) + shift);
 task.end = Scheduler.minutesToTime(Scheduler.timeToMinutes(task.end) + shift);
 task.rescheduled = true;
 newRange = Scheduler.formatRange(task.start, task.end, draft);
 }, 'task');

 UI.closeModal();
 if (newRange) UI.toast({ icon: 'wand', title: 'Moved, luv', body: 'New time: ' + newRange });
 }

 function moveTaskToTomorrow(id) {
 Storage.update((draft) => {
 const task = draft.tasks.find((t) => t.id === id);
 if (!task) return;
 task.movedFrom = task.date;
 task.date = Utils.addDays(task.date, 1);
 task.rescheduled = true;
 }, 'task');
 UI.closeModal();
 UI.toast({ icon: 'moon', title: 'Moved to tomorrow', body: 'Today stays light — that is allowed.' });
 }

 /* --------------------------- smart scheduler ---------------------------- */
 function addBacklogItem() {
 const input = $('backlogName');
 const raw = input ? input.value.trim() : '';
 if (!raw) {
 UI.toast({ icon: '', title: 'What do you need to do, luv?', body: 'Type it in and I will find the time.' });
 if (input) input.focus();
 return;
 }

 // Read the sentence: "python 45m high tomorrow 10:00"
 const parsed = Scheduler.parseQuickAdd(raw, state(), view.date);
 const category = parsed.category || ($('backlogCategory') || {}).value || 'custom';
 const priority = parsed.priority || ($('backlogPriority') || {}).value || 'medium';
 const minutes = parsed.minutes || Number(($('backlogDuration') || {}).value) || 30;

 if (input) input.value = '';
 updateQuickHint();

 // If they told us when it happens, put it straight into the day
 if (parsed.start && parsed.date) {
 openTaskModal(null, parsed.date, {
 date: parsed.date,
 name: parsed.name,
 start: parsed.start,
 end: Scheduler.minutesToTime(Scheduler.timeToMinutes(parsed.start) + minutes),
 category: category,
 priority: priority,
 notes: '',
 repeat: parsed.repeat || 'none'
 });
 UI.toast({
 icon: 'sparkles',
 title: 'I understood that',
 body: Scheduler.describeQuickAdd(parsed, state()) + ' — check it over and save.'
 });
 return;
 }

 Storage.update((draft) => {
 draft.backlog.push({
 id: Utils.uid('bl'),
 name: parsed.name,
 category: category,
 priority: priority,
 duration: minutes,
 repeat: parsed.repeat || 'none',
 status: 'backlog',
 addedAt: new Date().toISOString()
 });
 }, 'backlog');

 UI.toast({
 icon: 'sparkles',
 title: 'Added to your list',
 body: parsed.understood
 ? parsed.name + ' · ' + Scheduler.describeQuickAdd(parsed, state())
 : 'Tap “Optimize my day” and I will fit it in.'
 });
 }

 /** The little "I read: …" line under the Smart Scheduler input. */
 function updateQuickHint() {
 const hint = $('backlogHint');
 if (!hint) return;
 const input = $('backlogName');
 const raw = input ? input.value.trim() : '';

 if (!raw) {
 hint.textContent = 'Tip: write it naturally — “python 45m high tomorrow 10:00”.';
 hint.classList.remove('is-on');
 return;
 }

 const parsed = Scheduler.parseQuickAdd(raw, state(), view.date);
 const typical = Scheduler.typicalMinutes(state(), parsed.category || ($('backlogCategory') || {}).value);

 if (!parsed.understood) {
 hint.textContent = typical
 ? 'Work like this usually takes you about ' + Utils.formatMinutes(typical) + ' — I will plan for that.'
 : 'Tip: add a length or a time, like “clean my room 30m”.';
 hint.classList.remove('is-on');
 return;
 }

 hint.textContent = 'I read: ' + Scheduler.describeQuickAdd(parsed, state()) +
 (!parsed.minutes && typical ? ' · usually ~' + Utils.formatMinutes(typical) + ' for you' : '');
 hint.classList.add('is-on');
 }

 function removeBacklogItem(id) {
 Storage.update((draft) => {
 const item = draft.backlog.find((b) => b.id === id);
 if (item) item.status = 'removed';
 draft.tasks = draft.tasks.filter((t) => !(t.fromBacklog === id && !t.completed));
 }, 'backlog');
 }

 /* ------------------------- Optimize My Day ------------------------------ */
 function runOptimize() {
 // Rearrange once, straight onto the live state, and keep the summary
 let result = null;
 Storage.update((draft) => { result = Scheduler.optimizeDay(draft, Utils.todayKey()); }, 'optimize');
 if (!result) return;

 if (!result.moved.length && !result.scheduled.length && !result.unscheduled.length) {
 UI.modal({
 title: 'Nothing to move, luv',
 sub: 'Everything already has a place today.',
 bodyHtml: '<p class="card-note">Add anything else you need to do on the My Day page, ' +
 'and I will fit it in around your plans.</p>'
 });
 return;
 }

 const s = state();
 const lines = [];
 result.moved.forEach((item) => {
 lines.push('<li><strong>' + esc(item.name) + '</strong> moved to ' + Scheduler.formatTime(item.start, s) +
 ' — you missed this one, luv. That\'s okay.</li>');
 });
 result.scheduled.forEach((item) => {
 lines.push('<li><strong>' + esc(item.name) + '</strong> planned for ' + Scheduler.formatTime(item.start, s) + '</li>');
 });

 const stuck = result.unscheduled.filter((item, index, all) =>
 all.findIndex((other) => other.name === item.name) === index);
 stuck.forEach((item) => {
 lines.push('<li><strong>' + esc(item.name) + '</strong> could not fit today — your day is already ' +
 'full, so let\'s move it to tomorrow.</li>');
 });

 UI.modal({
 title: 'Your day, rearranged',
 sub: 'Your meals, breaks and sleep stayed exactly where they were.',
 bodyHtml: '<ul class="af-list">' + lines.join('') + '</ul>' +
 (stuck.length ? '<p class="card-note">Nothing is lost — it is waiting for you in your list.</p>' : ''),
 actions: stuck.length
 ? [{ label: 'Move those to tomorrow', action: 'optimize-postpone', variant: 'primary' },
 { label: 'Close', action: 'modal-cancel', variant: 'ghost' }]
 : [{ label: 'Lovely, thanks', action: 'modal-cancel', variant: 'primary' }]
 });

 UI.toast({
 icon: 'wand',
 title: 'Day optimized',
 body: result.moved.length + ' moved · ' + result.scheduled.length + ' planned · ' +
 stuck.length + ' left for tomorrow.',
 undo: true
 });
 }

 /** Whatever would not fit stays safely on the list for tomorrow. */
 function postponeUnscheduled() {
 UI.closeModal();
 Notifier.push({
 icon: 'moon',
 title: 'Saved for tomorrow',
 body: 'Your day is already full, luv. We will find a home for it tomorrow.'
 });
 }

 /* ------------------------- Lighten My Day ------------------------------- */
 function runLighten() {
 // Move the gentlest things in one pass and keep the summary
 let result = null;
 Storage.update((draft) => { result = Scheduler.lightenDay(draft, Utils.todayKey()); }, 'lighten');
 if (!result) return;

 if (!result.movedTasks.length) {
 UI.modal({
 title: 'Your day is already gentle',
 sub: result.message,
 bodyHtml: '<p class="card-note">Nothing needs moving. Rest when you need to — that is part of the plan too.</p>',
 actions: [{ label: 'Okay, thank you', action: 'modal-cancel', variant: 'primary' }]
 });
 return;
 }

 UI.modal({
 title: 'Made it gentler',
 sub: result.message,
 bodyHtml: '<ul class="af-list">' + result.movedTasks.map((task) =>
 '<li><strong>' + esc(task.name) + '</strong> moved to tomorrow</li>').join('') + '</ul>' +
 '<p class="card-note">You did not fail — you protected your energy. That counts.</p>',
 actions: [{ label: 'Thank you, Luvli', action: 'modal-cancel', variant: 'primary' }]
 });

 UI.toast({ icon: 'heart', title: 'Today is lighter now', body: Utils.formatMinutes(result.freed) + ' of pressure moved away.', undo: true });
 }

 /** Drop a whole routine into the day. */
 function runRoutine(key) {
 let result = null;
 Storage.update((draft) => { result = Scheduler.applyRoutine(draft, key, view.date); }, 'task');

 if (!result || !result.added.length) {
 UI.modal({
 title: 'No clear space for that yet',
 sub: 'Everything is a little tight right now.',
 bodyHtml: '<p class="card-note">Try “Optimize my day” first, or move something gentle to tomorrow, ' +
 'and then add the routine again.</p>',
 actions: [{ label: 'Optimize my day', action: 'optimize-day', variant: 'primary' },
 { label: 'Close', action: 'modal-cancel', variant: 'ghost' }]
 });
 return;
 }

 UI.modal({
 title: result.routine.icon + ' ' + result.routine.name + ' added',
 sub: result.added.length + ' step' + (result.added.length === 1 ? '' : 's') + ' placed in your day',
 bodyHtml: '<ul class="af-list">' + result.added.map((block) =>
 '<li>' + esc(block.name) + ' · ' + Scheduler.formatRange(block.start, block.end, state()) + '</li>').join('') + '</ul>' +
 '<p class="card-note">Nothing that was already planned was moved.</p>',
 actions: [{ label: 'Lovely', action: 'modal-cancel', variant: 'primary' }]
 });

 UI.toast({
 icon: result.routine.icon,
 title: result.routine.name + ' is in',
 body: 'Everything still fits around your plans.',
 undo: true
 });
 }

 /** The gentle "I am struggling" menu. */
 function openRescueModal() {
 const s = state();
 const forecast = Scheduler.feasibility(s, Utils.todayKey());
 const breakCheck = Scheduler.needsBreak(s, Utils.todayKey());

 UI.modal({
 title: 'Rescue me',
 sub: 'Tell me what is happening and I will rearrange things kindly.',
 bodyHtml:
 '<p class="card-note">' + esc(forecast.message) + '</p>' +
 (breakCheck.needed
 ? '<p class="card-note">You have been going ' + Utils.formatMinutes(breakCheck.minutesSince) +
 ' without a pause, luv.</p>' : ''),
 actions: [
 { label: 'I am behind', action: 'rescue-behind', variant: 'primary' },
 { label: 'I am tired', action: 'rescue-tired', variant: 'soft' },
 { label: 'I have less time than I thought', action: 'rescue-short', variant: 'soft' },
 { label: 'Never mind', action: 'modal-cancel', variant: 'ghost' }
 ]
 });
 }

 /** Put a short pause in the day, right now. */
 function addPauseNow(name) {
 let placed = null;
 Storage.update((draft) => {
 const start = Scheduler.minutesToTime(Math.ceil(Scheduler.nowMinutes() / 5) * 5);
 const end = Scheduler.minutesToTime(Scheduler.timeToMinutes(start) + 10);
 draft.tasks.push({
 id: Utils.uid('task'), date: Utils.todayKey(),
 name: name || 'Take a proper pause', category: 'break',
 start: start, end: end, priority: 'medium',
 notes: 'Luvli suggested this one.', repeat: 'none',
 completed: false, createdAt: new Date().toISOString()
 });
 placed = Scheduler.formatRange(start, end, draft);
 }, 'task');
 if (placed) UI.toast({ icon: 'coffee', title: 'Pause added', body: 'Ten quiet minutes at ' + placed + '.' });
 }

 /* --------------------------- what Luvli learned ------------------------- */
 function renderInsights(s) {
 const insights = Scheduler.focusInsights(s);
 const heavyCats = ['study', 'work', 'project', 'class'];
 const typical = heavyCats
 .map((key) => ({ key: key, minutes: Scheduler.typicalMinutes(s, key) }))
 .filter((entry) => entry.minutes);

 if (!insights.hasEnoughData) {
 return '<h2 class="card-title">What Luvli is learning</h2>' +
 '<p class="card-note">Finish a few focus sessions and complete a few activities, and I will start ' +
 'telling you which hours you work best in — and how long your work usually takes you.</p>';
 }

 const best = insights.bestHour !== null
 ? Scheduler.formatTime(Scheduler.minutesToTime(insights.bestHour * 60), s) : null;
 const peakNow = Scheduler.isPeakHour(s, Scheduler.nowMinutes());
 const breakCheck = Scheduler.needsBreak(s, Utils.todayKey());
 const lines = [];

 if (best) {
 lines.push('You get the most done around <strong>' + best + '</strong>' +
 (peakNow ? ' — and that is right about now.' : '. I will put heavy work there when I can.'));
 }
 if (typical.length) {
 lines.push(typical.map((entry) =>
 Scheduler.category(entry.key).label + ' usually takes you about <strong>' +
 Utils.formatMinutes(entry.minutes) + '</strong>').join(' · ') + '.');
 }
 if (breakCheck.needed) {
 lines.push('You have been going ' + Utils.formatMinutes(breakCheck.minutesSince) + ' without a break.');
 }

 return '<h2 class="card-title">What Luvli has learned</h2>' +
 '<p class="card-note">' + lines.join(' ') + '</p>' +
 '<p class="card-hint mt-12">Learned from ' + insights.samples +
 ' finished things on this device — it keeps changing as you go.</p>';
 }
 /* --------------------------- dragging the grid -------------------------- */
 // Pointer events cover mouse, pen and touch, so the day grid feels the same
 // everywhere. Touch users drag with the ⋮⋮ handle so the page still scrolls.
 let gridDrag = null;

 function bindGridDrag() {
 const root = $('dayGrid');
 if (!root || !root.addEventListener) return;
 root.addEventListener('pointerdown', onGridPointerDown);
 root.addEventListener('pointermove', onGridPointerMove);
 root.addEventListener('pointerup', onGridPointerUp);
 root.addEventListener('pointercancel', onGridPointerUp);
 }

 function onGridPointerDown(event) {
 const block = event.target.closest ? event.target.closest('.grid-block') : null;
 if (!block) return;
 const canvas = block.parentElement;
 if (!canvas || !canvas.getAttribute) return;

 const classes = event.target.classList || { contains: () => false };
 const isHandle = classes.contains('gb-grip') || classes.contains('gb-resize');
 if (event.pointerType === 'touch' && !isHandle) return;  // let the page scroll

 gridDrag = {
 id: block.getAttribute('data-id'),
 block: block,
 mode: classes.contains('gb-resize') ? 'resize' : 'move',
 startY: event.clientY,
 startTop: parseFloat(block.style.top) || 0,
 startHeight: parseFloat(block.style.height) || 40,
 gridStart: Number(canvas.getAttribute('data-grid-start')) || 0,
 timeEl: block.querySelector ? block.querySelector('.gb-time') : null,
 moved: false
 };

 block.classList.add('is-dragging');
 if (block.setPointerCapture && event.pointerId !== undefined) {
 try { block.setPointerCapture(event.pointerId); } catch (err) { /* fine */ }
 }
 if (event.preventDefault) event.preventDefault();
 }

 function onGridPointerMove(event) {
 if (!gridDrag) return;
 const perMinute = Scheduler.GRID_HOUR_PX / 60;
 const deltaPx = event.clientY - gridDrag.startY;
 if (Math.abs(deltaPx) > 3) gridDrag.moved = true;
 const step = Math.round((deltaPx / perMinute) / 5) * 5;  // five-minute steps

 if (gridDrag.mode === 'move') {
 const top = Math.max(0, gridDrag.startTop + step * perMinute);
 gridDrag.block.style.top = top + 'px';
 paintDragLabel(top);
 } else {
 const height = Math.max(25, gridDrag.startHeight + step * perMinute);
 gridDrag.block.style.height = height + 'px';
 paintDragLabel(gridDrag.startTop, height);
 }
 if (event.preventDefault) event.preventDefault();
 }

 /** Show the times while dragging so the change is never a surprise. */
 function paintDragLabel(top, height) {
 if (!gridDrag || !gridDrag.timeEl) return;
 const perMinute = Scheduler.GRID_HOUR_PX / 60;
 const startMinutes = Math.round((gridDrag.gridStart + top / perMinute) / 5) * 5;
 const length = height === undefined ? (parseFloat(gridDrag.block.style.height) || 40) : height;
 const lengthMinutes = Math.max(10, Math.round((length / perMinute) / 5) * 5);
 gridDrag.timeEl.textContent = Scheduler.formatRange(
 Scheduler.minutesToTime(startMinutes),
 Scheduler.minutesToTime(startMinutes + lengthMinutes),
 state()
 );
 }

 function onGridPointerUp() {
 if (!gridDrag) return;
 const drag = gridDrag;
 gridDrag = null;
 drag.block.classList.remove('is-dragging');

 if (!drag.moved) { openTaskModal(drag.id); return; }  // a tap opens the editor

 const perMinute = Scheduler.GRID_HOUR_PX / 60;
 const top = parseFloat(drag.block.style.top) || drag.startTop;
 const height = parseFloat(drag.block.style.height) || drag.startHeight;
 const startMinutes = Math.max(0, Math.round((drag.gridStart + top / perMinute) / 5) * 5);
 const lengthMinutes = Math.max(10, Math.round((height / perMinute) / 5) * 5);

 commitGridMove({
 id: drag.id,
 start: Scheduler.minutesToTime(startMinutes),
 end: Scheduler.minutesToTime(Math.min(1440, startMinutes + lengthMinutes))
 });
 }

 /** Save a dragged block — asking about clashes exactly like the form does. */
 function commitGridMove(move) {
 const task = (state().tasks || []).find((t) => t.id === move.id);
 if (!task) return;
 if (!move.start || !move.end ||
 Scheduler.timeToMinutes(move.end) <= Scheduler.timeToMinutes(move.start)) return;

 pendingTask = {
 id: task.id,
 date: task.date,
 name: task.name,
 start: move.start,
 end: move.end,
 category: task.category,
 priority: task.priority,
 notes: task.notes || '',
 repeat: task.repeat || 'none'
 };

 const conflicts = Scheduler.findConflicts(task.date, state(), pendingTask, task.id);
 if (conflicts.length) { openClashModal(conflicts); return; }
 commitPendingTask();
 }

 /* ---------------------- Move the extra to tomorrow ----------------------- */
 /** When today genuinely does not fit, move the gentlest extras away. */
 function runTrim() {
 let result = null;
 Storage.update((draft) => { result = Scheduler.trimDay(draft, Utils.todayKey()); }, 'trim');
 if (!result) return;

 if (!result.moved.length) {
 UI.modal({
 title: 'Nothing needs to move',
 sub: 'Today already fits.',
 bodyHtml: '<p class="card-note">' + esc(result.info.message) +
 (result.info.overflow.length ? ' The only extras left are protected or high priority, so I left them alone.' : '') +
 '</p>',
 actions: [{ label: 'Lovely', action: 'modal-cancel', variant: 'primary' }]
 });
 return;
 }

 UI.modal({
 title: 'Made room for what matters',
 sub: Utils.formatMinutes(result.freed) + ' of extras moved to tomorrow',
 bodyHtml:
 '<ul class="af-list">' + result.moved.map((item) =>
 '<li><strong>' + esc(item.name) + '</strong> · ' + Utils.formatMinutes(item.minutes) + '</li>').join('') + '</ul>' +
 (result.stillShort
 ? '<p class="card-note">Still about ' + Utils.formatMinutes(result.stillShort) +
 ' short. Want me to lighten things further?</p>'
 : '<p class="card-note">Today fits now. Your meals, breaks and sleep never moved.</p>'),
 actions: result.stillShort
 ? [{ label: 'Lighten further', action: 'lighten-day', variant: 'primary' },
 { label: 'Close', action: 'modal-cancel', variant: 'ghost' }]
 : [{ label: 'Thank you', action: 'modal-cancel', variant: 'primary' }]
 });

 UI.toast({
 icon: 'leaf',
 title: 'Room made',
 body: result.moved.length + ' moved · ' + Utils.formatMinutes(result.freed) + ' freed.',
 undo: true
 });
 }

 /* --------------------- What should I do now? ---------------------------- */
 function openWhatNow(resetIndex) {
 suggestions = Scheduler.suggestions(state(), Utils.todayKey());
 if (resetIndex !== false) suggestionIndex = 0;
 if (suggestionIndex >= suggestions.length) suggestionIndex = 0;
 renderSuggestion();
 }

 function renderSuggestion() {
 const rec = suggestions[suggestionIndex];
 if (!rec) return;

 const actions = [];
 if (rec.kind === 'task' || rec.kind === 'backlog') {
 actions.push({ label: 'Start focus', action: 'rec-start', variant: 'primary', attrs: 'data-index="' + suggestionIndex + '"' });
 }
 if (rec.kind === 'task') {
 actions.push({ label: 'Mark as done', action: 'rec-done', variant: 'soft', attrs: 'data-id="' + rec.id + '"' });
 }
 if (rec.kind === 'backlog') {
 actions.push({ label: 'Add it to my day', action: 'rec-place', variant: 'soft', attrs: 'data-index="' + suggestionIndex + '"' });
 }
 if (rec.kind === 'wellness') {
 actions.push({ label: 'Add it to my day', action: 'rec-add-wellness', variant: 'primary', attrs: 'data-index="' + suggestionIndex + '"' });
 }
 if (rec.kind === 'empty') {
 actions.push({ label: '+ Add activity', action: 'add-activity', variant: 'primary' });
 }
 if (suggestions.length > 1) {
 actions.push({ label: 'Show me something else', action: 'rec-next', variant: 'ghost' });
 }

 UI.modal({
 title: "Right now I'd recommend:",
 sub: 'Based on your plan, your energy and the time you have.',
 bodyHtml:
 '<div class="rec-hero">' +
 '<span class="rec-icon">' + ico(rec.icon) + '</span>' +
 '<div class="rec-name">' + esc(rec.name) + '</div>' +
 (rec.goal ? '<p class="rec-reason">Goal: ' + esc(rec.goal) + '</p>' : '') +
 '<p class="rec-reason">' + esc(rec.reason) + '</p>' +
 (rec.windowMinutes ? '<span class="rec-window">' + ico('hourglass') + ' ' + Utils.formatMinutes(rec.windowMinutes) + ' available</span>' : '') +
 '<div class="mt-12"><span class="chip chip-soft">' + esc(rec.badge) + '</span></div>' +
 '</div>',
 actions: actions
 });
 }

 /** Start the recommended thing. */
 function startRecommendation(index) {
 const s = state();
 const rec = suggestions[index];
 if (!rec) return;

 if (rec.kind === 'task') { startFocusForTask(rec.id); return; }

 UI.closeModal();
 go('focus');
 Pomodoro.start({
 subjectId: '',
 subjectName: rec.name,
 icon: rec.icon,
 goal: rec.goal || rec.name,
 focusMinutes: Utils.clamp(rec.minutes || s.settings.focusLength, 5, 120),
 breakMinutes: s.settings.breakLength
 });
 }

 /** Jump into Focus mode for one activity. */
 function startFocusForTask(taskId) {
 const s = state();
 const task = (s.tasks || []).find((t) => t.id === taskId);
 if (!task) return;
 UI.closeModal();
 go('focus');
 Pomodoro.startFromActivity(task, s);
 }

 /** Put a recommended list item straight into the next free moment. */
 function placeBacklogNow(index) {
 const rec = suggestions[index];
 if (!rec || !rec.item) return;

 let placed = null;
 Storage.update((draft) => {
 const item = draft.backlog.find((b) => b.id === rec.id);
 if (!item) return;
 const length = Number(item.duration) || 30;
 const slots = Scheduler.freeSlots(Utils.todayKey(), draft, {
 fromMin: Math.max(Scheduler.nowMinutes(), Scheduler.wakeMinutes(draft))
 });
 const slot = slots.find((candidate) => candidate.minutes >= length);
 if (!slot) return;

 draft.tasks.push({
 id: Utils.uid('task'), date: Utils.todayKey(), name: item.name,
 category: item.category || 'custom',
 start: Scheduler.minutesToTime(slot.start),
 end: Scheduler.minutesToTime(slot.start + length),
 priority: item.priority || 'medium', notes: item.notes || '',
 completed: false, fromBacklog: item.id, createdAt: new Date().toISOString()
 });
 item.status = 'scheduled';
 placed = { name: item.name, start: Scheduler.minutesToTime(slot.start) };
 }, 'backlog');

 UI.closeModal();
 if (placed) {
 UI.toast({ icon: 'sparkles', title: 'Placed in your day', body: placed.name + ' at ' + placed.start + '.' });
 } else {
 UI.toast({ icon: 'heart', title: 'No room right now, luv', body: 'Let\'s keep it on your list — we will fit it in soon.' });
 }
 }

 /** Add a Luvli-suggested wellness moment to the day. */
 function addWellnessNow(index) {
 const rec = suggestions[index];
 if (!rec) return;

 let placed = null;
 Storage.update((draft) => {
 const start = Scheduler.minutesToTime(Math.ceil(Scheduler.nowMinutes() / 5) * 5);
 const end = Scheduler.minutesToTime(Scheduler.timeToMinutes(start) + (rec.minutes || 10));
 draft.tasks.push({
 id: Utils.uid('task'), date: Utils.todayKey(), name: rec.name,
 category: rec.category || 'wellness', start: start, end: end,
 priority: 'medium', notes: 'Luvli suggested this one.',
 completed: false, createdAt: new Date().toISOString()
 });
 placed = { name: rec.name, range: Scheduler.formatRange(start, end, draft) };
 }, 'task');

 UI.closeModal();
 if (placed) UI.toast({ icon: 'heart', title: 'Added for you', body: placed.name + ' · ' + placed.range });
 }

 /* ------------------------------- CHECK-IN ------------------------------- */
 /** "How are you feeling today?" */
 function checkIn(mood) {
 const today = Utils.todayKey();
 Storage.update((draft) => {
 draft.checkIns[today] = { mood: mood, checkedAt: new Date().toISOString() };
 }, 'checkin');

 // A low mood gets softer words everywhere
 homeQuote = Affirmations.random(state(), { mood: mood });
 renderHome();

 const chip = $('moodStrip') ? $('moodStrip').querySelector('.mood-btn.is-active') : null;
 if (chip) UI.burstFrom(chip, 6);

 if (mood === 'low' || mood === 'exhausted') {
 UI.modal({
 title: "Let's make today a little gentler",
 sub: 'Thank you for being honest with me.',
 bodyHtml: '<p class="card-note">I can move the low-priority things to tomorrow and keep your meals, ' +
 'your rest and the things that truly matter today. Nothing is lost, and you are not behind.</p>',
 actions: [
 { label: 'Lighten my day', action: 'lighten-day', variant: 'primary' },
 { label: 'I am okay, keep my plan', action: 'modal-cancel', variant: 'ghost' }
 ]
 });
 return;
 }

 const messages = {
 great: "Lovely! Let's make today feel luvli.",
 good: 'Good is more than enough, luv.',
 okay: 'Okay is completely fine. One thing at a time.'
 };
 UI.toast({ icon: 'heart', title: 'Thanks for checking in', body: messages[mood] || 'I am here with you today.' });
 }

 /* ----------------------------- NIGHTLY RESET ---------------------------- */
 function openNightReset() {
 const s = state();
 const today = Utils.todayKey();
 const tomorrow = Utils.addDays(today, 1);
 const done = Scheduler.tasksFor(today, s).filter((t) => t.completed);
 const unfinished = Scheduler.pending(Scheduler.tasksFor(today, s));
 const focusMinutes = Progress.focusMinutesOn(s, today);
 const tomorrowTasks = Scheduler.tasksFor(tomorrow, s);

 const wins = done.length
 ? '<ul class="af-list">' + done.slice(0, 8).map((task) => '<li>✓ ' + esc(task.name) + '</li>').join('') + '</ul>'
 : '<p class="card-note">Today was a quiet one — that is allowed too.</p>';

 const tomorrowHtml = tomorrowTasks.length
 ? '<div class="live-day">' + tomorrowTasks.map((task) => Scheduler.renderTaskRow(task, s)).join('') + '</div>'
 : '<p class="card-note">Nothing planned for tomorrow yet, luv. Want to give it a gentle shape?</p>';

 const actions = [];
 if (unfinished.length) {
 actions.push({
 label: 'Move ' + unfinished.length + ' unfinished to tomorrow',
 action: 'night-move', variant: 'soft'
 });
 }
 if (!tomorrowTasks.length) {
 actions.push({ label: 'Plan tomorrow', action: 'night-plan', variant: 'soft' });
 }
 actions.push({ label: 'Goodnight, Luvli', action: 'night-close', variant: 'primary' });

 UI.modal({
 title: 'You made it through today, luv.',
 sub: (focusMinutes ? Utils.formatMinutes(focusMinutes) + ' focused · ' : '') +
 done.length + ' thing' + (done.length === 1 ? '' : 's') + ' completed',
 wide: true,
 bodyHtml:
 '<h4 class="mini-title">Today\'s wins</h4>' + wins +
 '<h4 class="mini-title mt-16">Tomorrow</h4>' + tomorrowHtml +
 '<h4 class="mini-title mt-16">How was your day?</h4>' +
 '<div class="mood-strip" id="reviewStrip">' + REVIEW_MOODS.map((mood) =>
 '<button class="mood-btn" type="button" data-action="review-mood" data-rating="' + mood.key + '">' +
 mood.label + '</button>').join('') + '</div>',
 actions: actions
 });
 }

 /** "How was your day?" — saved for the Progress page. */
 function reviewMood(rating) {
 const today = Utils.todayKey();
 Storage.update((draft) => {
 draft.nightReviews[today] = { rating: rating, at: new Date().toISOString() };
 }, 'night-review');

 const strip = $('reviewStrip');
 if (strip) {
 $$('.mood-btn', strip).forEach((btn) =>
 btn.classList.toggle('is-active', btn.getAttribute('data-rating') === rating));
 }

 const soft = rating === 'difficult' || rating === 'exhausted';
 UI.toast(soft
 ? { icon: 'users', title: 'Thank you for telling me', body: 'Tomorrow is a fresh page. Rest well, luv.' }
 : { icon: 'moon', title: 'Saved', body: 'Sleep well — Luvli will be here tomorrow.' });
 }

 function nightMoveUnfinished() {
 let moved = 0;
 Storage.update((draft) => {
 const today = Utils.todayKey();
 const tomorrow = Utils.addDays(today, 1);
 draft.tasks.forEach((task) => {
 if (task.date === today && !task.completed) {
 task.movedFrom = today;
 task.date = tomorrow;
 moved += 1;
 }
 });
 }, 'task');

 UI.closeModal();
 UI.toast({ icon: 'moon', title: moved + ' moved to tomorrow', body: 'A fresh start in the morning, luv.', undo: true });
 }

 function nightPlanTomorrow() {
 const tomorrow = Utils.addDays(Utils.todayKey(), 1);
 UI.closeModal();
 view.date = tomorrow;
 go('day');
 openTaskModal(null, tomorrow);
 }

 function closeNightReset() {
 UI.closeModal();
 // Small hearts before the day ends
 if (!document.documentElement.classList.contains('reduce-motion')) {
 UI.burst(window.innerWidth - 80, window.innerHeight - 120, 10);
 }
 UI.toast({ icon: 'moon', title: 'Goodnight, luv', body: 'You showed up today. That is enough.' });
 }

 /* -------------------------- SUBJECTS & SESSIONS ------------------------- */
 const SUBJECT_EMOJIS = ['🐍', '📐', '🧪', '🎧', '📖', '🎨', '💻', '🌍', '🧠', '🎹', '🗣️', '🧬', '📊'];

 function openSubjectModal(subjectId) {
 const s = state();
 const subject = subjectId ? (s.subjects || []).find((item) => item.id === subjectId) : null;
 const emoji = subject ? subject.emoji : '';
 const progress = subject ? (subject.progress || 0) : 0;

 UI.modal({
 title: subject ? 'Edit subject' : 'New subject',
 sub: 'Luvli keeps your goals, sessions and progress together.',
 bodyHtml:
 '<div class="field-row">' +
 '<label class="field"><span class="field-label">Subject</span>' +
 '<input class="input" id="subjectName" type="text" placeholder="e.g. Python" value="' + esc(subject ? subject.name : '') + '" /></label>' +
 '<label class="field"><span class="field-label">Icon</span>' +
 '<select class="input" id="subjectEmoji">' + SUBJECT_EMOJIS.map((option) =>
 '<option value="' + option + '"' + (option === emoji ? ' selected' : '') + '>' + option + '</option>').join('') +
 '</select></label>' +
 '</div>' +
 '<label class="field"><span class="field-label">Current goal</span>' +
 '<input class="input" id="subjectGoal" type="text" placeholder="e.g. Learn Functions" value="' +
 esc(subject ? subject.goal : '') + '" /></label>' +
 '<label class="field"><span class="field-label">Progress: <span id="subjectProgressValue">' + progress + '</span>%</span>' +
 '<input type="range" id="subjectProgress" min="0" max="100" step="5" value="' + progress + '" /></label>',
 actions: (subject ? [
 { label: 'Delete', action: 'subject-delete', variant: 'danger', attrs: 'data-id="' + subject.id + '"' }
 ] : []).concat([
 { label: 'Cancel', action: 'modal-cancel', variant: 'ghost' },
 { label: subject ? 'Save' : 'Add subject', action: 'subject-save', variant: 'primary',
 attrs: 'data-id="' + (subject ? subject.id : '') + '"' }
 ])
 });

 const range = $('subjectProgress');
 if (range) range.addEventListener('input', () => setText('subjectProgressValue', range.value));
 }

 function saveSubject(id) {
 const nameInput = $('subjectName');
 const name = nameInput ? nameInput.value.trim() : '';
 if (!name) {
 UI.toast({ icon: 'book', title: 'What are you studying, luv?', body: 'A name is all we need to start.' });
 if (nameInput) nameInput.focus();
 return;
 }

 Storage.update((draft) => {
 const existing = id ? draft.subjects.find((item) => item.id === id) : null;
 const emoji = ($('subjectEmoji') || {}).value || '';
 const goal = (($('subjectGoal') || {}).value || '').trim();
 const progress = Utils.clamp(Number(($('subjectProgress') || {}).value) || 0, 0, 100);

 if (existing) {
 existing.name = name;
 existing.emoji = emoji;
 existing.goal = goal;
 existing.progress = progress;
 } else {
 draft.subjects.push({
 id: Utils.uid('sub'), name: name, emoji: emoji, goal: goal,
 progress: progress, createdAt: new Date().toISOString()
 });
 }
 }, 'subject');

 UI.closeModal();
 UI.toast({ icon: 'book', title: id ? 'Subject updated' : 'Subject added', body: name + ' is ready when you are.' });
 }

 function deleteSubject(id) {
 const subject = (state().subjects || []).find((item) => item.id === id);
 if (!subject) return;
 confirmTarget = { kind: 'subject', id: subject.id };
 UI.confirm({
 title: 'Delete this subject?',
 sub: '"' + subject.name + '" and its goal will be removed. Your past sessions stay in your history.',
 confirmLabel: 'Delete it',
 confirmAction: 'subject-delete-confirm',
 variant: 'danger',
 bodyHtml: '<p class="card-note">Everything else stays exactly as it is.</p>'
 });
 }

 /** Log study you did away from Luvli. */
 function openLogSessionModal(subjectId) {
 const s = state();
 const subjects = s.subjects || [];
 logSubjectDefault = subjectId || (subjects[0] ? subjects[0].id : '');

 UI.modal({
 title: 'Log a study session',
 sub: 'Studied somewhere else? Add it here so your progress stays true.',
 bodyHtml:
 '<label class="field"><span class="field-label">Subject</span><select class="input" id="logSubject">' +
 (subjects.length
 ? subjects.map((item) =>
 '<option value="' + item.id + '"' + (item.id === subjectId ? ' selected' : '') + '>' +
 item.emoji + ' ' + esc(item.name) + '</option>').join('')
 : '<option value="">General study</option>') +
 '</select></label>' +
 '<div class="field-row">' +
 '<label class="field"><span class="field-label">Minutes</span>' +
 '<input class="input" id="logMinutes" type="number" min="5" max="300" value="25" /></label>' +
 '<label class="field"><span class="field-label">Date</span>' +
 '<input class="input" id="logDate" type="date" value="' + Utils.todayKey() + '" /></label>' +
 '</div>' +
 '<label class="field"><span class="field-label">What did you do?</span>' +
 '<input class="input" id="logGoal" type="text" placeholder="e.g. Finished 3 exercises" /></label>',
 actions: [
 { label: 'Cancel', action: 'modal-cancel', variant: 'ghost' },
 { label: 'Save session', action: 'log-save', variant: 'primary' }
 ]
 });
 }

 function saveLoggedSession() {
 const s = state();
 // Fall back to the subject this modal was opened for (the <select> may be empty)
 const subjectId = ($('logSubject') || {}).value || logSubjectDefault || '';
 const subject = (s.subjects || []).find((item) => item.id === subjectId);
 const minutes = Utils.clamp(Number(($('logMinutes') || {}).value) || 25, 1, 600);
 const date = ($('logDate') || {}).value || Utils.todayKey();
 const goal = (($('logGoal') || {}).value || '').trim() || (subject ? subject.goal : 'Study session');

 Storage.update((draft) => {
 draft.sessions.push({
 id: Utils.uid('ses'), subjectId: subjectId,
 subjectName: subject ? subject.name : 'Study', goal: goal,
 minutes: minutes, date: date, type: 'focus',
 endedAt: new Date().toISOString(), manual: true
 });
 if (!draft.focusDays[date]) draft.focusDays[date] = { minutes: 0, sessions: 0 };
 draft.focusDays[date].minutes += minutes;
 draft.focusDays[date].sessions += 1;

 const target = draft.subjects.find((item) => item.id === subjectId);
 if (target) target.progress = Math.min(100, Math.round((target.progress || 0) + Math.max(1, minutes / 5)));
 }, 'session');

 UI.closeModal();
 UI.toast({ icon: 'timer', title: 'Session saved', body: minutes + ' minutes added. Every bit counts, luv.' });
 }

 function deleteSession(id) {
 Storage.update((draft) => {
 const session = draft.sessions.find((item) => item.id === id);
 if (!session) return;
 draft.sessions = draft.sessions.filter((item) => item.id !== id);
 const day = draft.focusDays[session.date];
 if (day) {
 day.minutes = Math.max(0, day.minutes - (session.minutes || 0));
 day.sessions = Math.max(0, day.sessions - 1);
 }
 }, 'session');
 UI.toast({ icon: 'heart', title: 'Session removed', body: 'Your history is updated.' });
 }

 /* ------------------------------ AFFIRMATIONS ---------------------------- */
 /** 💗 Tick or untick one of the personalised affirmation styles. */
 function toggleAffirmationStyle(key) {
 LuvliStyle.toggleAffirmation(key);
 renderAffirmations();
 UI.toast({
 icon: 'heart',
 title: 'Luvli will write these for you',
 body: LuvliStyle.AFFIRMATION_LABEL(key) + ' — added to your affirmations.'
 });
 }

 function toggleAffCategory(key) {
 Storage.update((draft) => {
 const list = draft.settings.affirmations.categories || [];
 const index = list.indexOf(key);
 if (index > -1) list.splice(index, 1);
 else list.push(key);
 draft.settings.affirmations.categories = list;
 }, 'affirmations');
 pageQuote = Affirmations.random(state(), {});
 renderAffirmations();
 }

 function saveCurrentAffirmation() {
 if (!pageQuote) return;
 const already = Affirmations.isFavorite(state(), pageQuote.text);
 if (already) {
 UI.toast({ icon: 'heart', title: 'Already saved, luv', body: 'You can find it in your favourites below.' });
 return;
 }
 Storage.update((draft) => {
 draft.affirmations.favorites.unshift({ text: pageQuote.text, category: pageQuote.category });
 }, 'affirmations');
 UI.toast({ icon: 'heart', title: 'Saved to your favourites', body: 'Your words, safe for the days you need them.' });
 UI.burst(null, null, 8);
 }

 function removeFavorite(index) {
 Storage.update((draft) => { draft.affirmations.favorites.splice(index, 1); }, 'affirmations');
 }

 function addCustomAffirmation() {
 const input = $('customAffInput');
 const text = input ? input.value.trim() : '';
 if (!text) {
 if (input) input.focus();
 return;
 }
 Storage.update((draft) => { draft.affirmations.custom.unshift(text); }, 'affirmations');
 if (input) input.value = '';
 UI.toast({ icon: 'note', title: 'Saved your words', body: 'Luvli will show them back to you.' });
 }

 function removeCustomAffirmation(index) {
 Storage.update((draft) => { draft.affirmations.custom.splice(index, 1); }, 'affirmations');
 }

 /* ==================== ♡ Accounts (sign in / out) ========================
    The account screens themselves live on their own pages — login.html and
    signup.html — so the app stays fast and the auth UI has room to breathe.
    This block is only what the app itself needs: the guard that keeps
    signed-out people out, and the small pieces the Settings card uses. */

 /**
  * The route guard. If nobody is signed in, hand over to login.html (keeping
  * where they meant to go). Returns true when it is safe to carry on.
  */
 function requireAuth() {
   if (Auth.isSignedIn()) return true;
   if (typeof location !== 'undefined' && location.replace) {
     location.replace('login.html?next=' + encodeURIComponent('index.html'));
   }
   return false;
 }

 /** The account card on the Settings page. */
 function renderAccountCard() {
   const account = Auth.current();
   const avatar = $('authAccountAvatar');
   if (avatar) avatar.innerHTML = account ? Auth.avatarHtml(account, { size: 'md' }) : '';
   setText('authAccountName', account ? account.name : 'Not signed in');
   setText('authAccountEmail', account ? account.email : '');
   const prefs = Auth.preferences();
   setText('authAccountNote', prefs.completed
     ? 'Your account and your day live in this browser — no server, nothing sent anywhere.'
     : 'Your account lives in this browser. Finish onboarding to personalise Luvli.');
 }

 /** Sign out gently, with a way back in. */
 function signOut() {
   UI.confirm({
     title: 'Sign out of Luvli?',
     sub: 'Your day and your data stay right here on this device.',
     bodyHtml: '<p class="card-note">You can sign back in any time — or create a fresh account. Nothing is deleted.</p>',
     confirmLabel: 'Sign out',
     confirmAction: 'auth-signout-confirm',
     variant: 'danger'
   });
 }

 function confirmSignOut() {
   const account = Auth.current();
   UI.closeModal();
   const note = 'Signed out of ' + (account ? account.email : 'your account') + '. Sign back in whenever you like.';
   // Wait for sign-out to actually finish (a real provider makes a network
   // call) before navigating away, so it is not cut off mid-flight.
   Promise.resolve(Auth.signOut()).then(() => {
     try { sessionStorage.setItem('luvli.auth.note', note); } catch (err) { /* private mode */ }
     location.href = 'login.html';
   });
 }

 /** Let the signed-in person rename themselves. */
 function editAccountName() {
   const account = Auth.current();
   if (!account) return;
   UI.modal({
     title: 'What should Luvli call you?',
     sub: 'This is the name Luvli greets you with.',
     bodyHtml: '<label class="field"><span class="field-label">Your name</span>' +
       '<input class="input" id="authEditNameInput" type="text" value="' + esc(account.name) + '" placeholder="luv" /></label>',
     actions: [
       { label: 'Never mind', action: 'modal-cancel', variant: 'ghost' },
       { label: 'Save', action: 'auth-name-save', variant: 'primary' }
     ]
   });
 }

 function saveAccountName() {
   const input = $('authEditNameInput');
   const value = input ? input.value.trim() : '';
   if (!value) return;
   // Auth.update() is synchronous for the local provider, a Promise for a
   // real one (e.g. Supabase) — Promise.resolve() handles either.
   Promise.resolve(Auth.update({ name: value })).then(() => {
     UI.closeModal();
     renderAccountCard();
     renderChrome();
     renderAll();
     UI.toast({ icon: 'pencil', title: 'Saved ♡', body: 'Luvli will call you ' + value + ' from now on.' });
   });
 }

 /* -------------------------------- SETTINGS ------------------------------ */
 function setSetting(key, value) {
   Storage.update((draft) => { draft.settings[key] = value; }, 'settings');
 }
 function setNestedSetting(group, key, value) {
 Storage.update((draft) => { draft.settings[group][key] = value; }, 'settings');
 }
 function setProfile(key, value) {
 Storage.update((draft) => { draft.profile[key] = value; }, 'settings');
 }

 function setTheme(theme) {
 Storage.update((draft) => { draft.settings.theme = theme; }, 'settings');
 applyTheme();
 UI.toast({ icon: 'palette', title: 'Looking lovely', body: 'Luvli will remember that theme for you.' });
 }

 /* -------------------- 💗 My Luvli Style ♡ (Settings) -------------------- */
 // The full onboarding lives on personality.html; these are the quick switches
 // available from Settings, so a style can be changed without leaving the app.

 /** "I'll stay as Coach Luvli" — switch for good. */
 function setLuvliStyle(key) {
 const before = LuvliStyle.currentKey(state());
 const prefs = LuvliStyle.set(key, { remember: true });
 refreshQuotesForStyle();
 renderAll();
 if (before === key) return;
 UI.burst(null, null, 8);
 UI.toast({
 icon: 'heart',
 title: prefs.name + ' from now on',
 body: prefs.morning || ('Luvli will support you in a ' + prefs.communicationLabel.toLowerCase() + ' way.')
 });
 }

 /** The next style along — used when "something different today" is tapped
  *  without choosing which style. Wraps round to the first one. */
 function nextStyleAfter(key) {
 const at = LuvliStyle.KEYS.indexOf(key);
 return LuvliStyle.KEYS[(at + 1) % LuvliStyle.KEYS.length] || LuvliStyle.KEYS[0];
 }

 /** "Today I need Coach Luvli" — a one-day switch, undone tomorrow. */
 function setTodayLuvliStyle(key) {
 const prefs = LuvliStyle.set(key, { remember: false });
 refreshQuotesForStyle();
 renderAll();
 UI.toast({
 icon: 'sparkles',
 title: 'Today: ' + prefs.name,
 body: 'Tomorrow Luvli returns to your usual style.'
 });
 }

 /** Make today's one-day choice the usual one. */
 function keepTodayStyle() {
 const prefs = LuvliStyle.get(state());
 if (!prefs.overriddenToday) {
 UI.toast({ icon: 'heart', title: 'Already your usual style', body: prefs.name + ' is saved for every day.' });
 return;
 }
 LuvliStyle.clearOverride();
 LuvliStyle.set(prefs.key, { remember: true });
 refreshQuotesForStyle();
 renderAll();
 UI.toast({ icon: 'check-circle', title: 'Saved for every day', body: prefs.name + ' is now your usual style.' });
 }

 /** "Not now" on the Home-page invitation. */
 function dismissStylePrompt() {
 LuvliStyle.dismissPrompt();
 renderStylePrompt(state());
 }

 /** A new style deserves new words everywhere, so both quotes are re-picked. */
 function refreshQuotesForStyle() {
 const s = state();
 const chosen = LuvliStyle.get(s).chosen;
 homeQuote = chosen
 ? personalisedQuote(s)
 : Affirmations.random(s, { mood: moodOfToday() });
 pageQuote = Affirmations.random(s, {});
 if (chosen && homeQuote) LuvliStyle.rememberAffirmation(s, homeQuote.text);
 setText('sideQuote', '“' + homeQuote.text + '”');
 }

 /* ---------------------------- notifications ----------------------------- */
 function enableNotifications() {
 if (!Notifier.supported()) {
 UI.toast({
 icon: 'heart',
 title: 'Not available in this browser',
 body: 'Gentle reminders still show up inside Luvli.'
 });
 return;
 }

 Notifier.requestPermission().then((result) => {
 dismissNotificationPrompt();
 renderSettings();
 if (result === 'granted') {
 Notifier.push({ icon: 'bell', title: 'Reminders are on', body: 'I will softly let you know what is coming up.' });
 } else {
 UI.toast({ icon: 'heart', title: 'That is completely okay', body: 'You will still see reminders inside Luvli.' });
 }
 });
 }

 function dismissNotificationPrompt() {
 Storage.update((draft) => { draft.settings.notifications.promptDismissed = true; }, 'settings');
 }

 function testNotification() {
 Notifier.push({
 icon: 'bell',
 title: 'Just checking in, luv',
 body: 'This is how your reminders will look.'
 });
 }

 /* --------------------------------- SYNC --------------------------------- */
 /** A friendly wrapper so every sync answer ends up as a toast. */
 function runSync(kind) {
 const actions = {
 test: () => Sync.test().then(() => 'Your endpoint answered — we are connected.'),
 push: () => Sync.push().then(() => 'Sent your Luvli to your endpoint.'),
 pull: () => Sync.pull().then(() => 'Brought your Luvli back from the endpoint.')
 };
 if (!Sync.isConfigured()) {
 UI.toast({
 icon: 'heart',
 title: 'No endpoint yet',
 body: 'Luvli works perfectly without sync. Add an https:// endpoint above to use it.'
 });
 return;
 }
 UI.toast({ icon: 'cloud-off', title: 'Talking to your endpoint…', body: 'This only takes a moment.', duration: 3000 });
 actions[kind]().then((message) => {
 renderSettings();
 UI.toast({ icon: 'cloud-off', title: 'Sync', body: message });
 }).catch((err) => {
 renderSettings();
 UI.toast({
 icon: 'heart',
 title: 'That did not work',
 body: (err && err.message ? err.message : 'The endpoint could not be reached') +
 ' — your data is still safe on this device.'
 });
 });
 }

 /* --------------------------------- DATA --------------------------------- */
 function exportData() {
 const blob = new Blob([Storage.exportJSON()], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = 'luvli-backup-' + Utils.todayKey() + '.json';
 document.body.appendChild(link);
 link.click();
 link.remove();
 URL.revokeObjectURL(url);
 UI.toast({ icon: 'download', title: 'Backup saved', body: 'Keep it somewhere safe, luv.' });
 }

 function importData(file) {
 if (!file) return;
 const reader = new FileReader();
 reader.onload = () => {
 const ok = Storage.importJSON(String(reader.result));
 UI.toast(ok
 ? { icon: 'upload', title: 'Welcome back', body: 'Your Luvli data has been restored.' }
 : { icon: 'heart', title: 'That file did not look right', body: 'Try one of your Luvli backup files.' });
 const input = $('importInput');
 if (input) input.value = '';
 };
 reader.readAsText(file);
 }

 function resetEverything() {
 UI.confirm({
 title: 'Start fresh?',
 sub: 'This clears every activity, subject, session and setting on this device.',
 confirmLabel: 'Yes, clear it all',
 confirmAction: 'reset-confirm',
 variant: 'danger',
 bodyHtml: '<p class="card-note">A fresh Luvli is a lovely thing. You can always load the sample day again afterwards.</p>'
 });
 }

 function loadSampleDay() {
 const didSeed = Storage.seedSampleDay(true);
 if (didSeed) Storage.emit('seed');
 UI.closeModal();
 UI.toast({
 icon: '',
 title: didSeed ? 'Sample day loaded' : 'Nothing to change',
 body: didSeed ? 'Today has a plan again — change anything you like.' : 'Today already has a plan.'
 });
 }

 /* ------------------------------ confirmation ---------------------------- */
 function confirmDeleteTask() {
 const target = confirmTarget && confirmTarget.kind === 'task' ? confirmTarget.id : '';
 confirmTarget = null;
 UI.closeModal();
 if (!target) return;
 Storage.update((draft) => { draft.tasks = draft.tasks.filter((t) => t.id !== target); }, 'task');
 UI.toast({ icon: 'leaf', title: 'Removed', body: 'That activity is gone — no guilt here.', undo: true });
 }

 function confirmDeleteSubject() {
 const target = confirmTarget && confirmTarget.kind === 'subject' ? confirmTarget.id : '';
 confirmTarget = null;
 UI.closeModal();
 if (!target) return;
 Storage.update((draft) => { draft.subjects = draft.subjects.filter((item) => item.id !== target); }, 'subject');
 UI.toast({ icon: 'book', title: 'Subject removed', body: 'Your session history is still safe.', undo: true });
 }

 function confirmReset() {
 Storage.reset();
 UI.closeModal();
 homeQuote = Affirmations.random(state(), {});
 pageQuote = Affirmations.random(state(), {});
 renderAll();
 UI.toast({
 icon: '',
 title: 'A fresh start',
 body: 'Everything is clear. Let\'s begin again, luv.',
 undo: true
 });
 }

 /** "Focus now" straight from a subject card. */
 function openSubjectFocus(subjectId) {
 const s = state();
 const subject = (s.subjects || []).find((item) => item.id === subjectId);
 if (!subject) return;
 go('focus');
 Pomodoro.start({
 subjectId: subject.id,
 subjectName: subject.name,
 icon: subject.emoji,
 goal: subject.goal || '',
 focusMinutes: s.pomodoro.focusLength || s.settings.focusLength,
 breakMinutes: s.pomodoro.breakLength || s.settings.breakLength
 });
 }

 /* --------------------------- the action switch -------------------------- */
 /** One click handler for every button that carries a data-action attribute. */
 function onAction(event) {
 const target = event.target.closest ? event.target.closest('[data-action]') : null;
 if (!target) return;

 const action = target.getAttribute('data-action');
 const id = target.getAttribute('data-id') || '';
 const key = target.getAttribute('data-key') || '';
 const index = Number(target.getAttribute('data-index'));
 const minutes = Number(target.getAttribute('data-minutes'));

 switch (action) {
 /* --- ♡ the account (Settings card) --- */
 case 'auth-signout':  signOut(); break;
 case 'auth-signout-confirm':  confirmSignOut(); break;
 case 'auth-name-edit':  editAccountName(); break;
 case 'auth-name-save':  saveAccountName(); break;

 /* --- everywhere --- */
 case 'add-activity':  UI.closeModal(); view.date = view.date || Utils.todayKey(); go('day'); openTaskModal(null, view.date); break;
 case 'add-subject':  UI.closeModal(); openSubjectModal(null); break;
 case 'modal-cancel':  UI.closeModal(); break;
 case 'set-theme':  setTheme(target.getAttribute('data-theme')); break;

 /* --- undo (offered on destructive toasts) --- */
 case 'undo':  actionUndo(); break;

 /* --- home helpers --- */
 case 'what-now':  openWhatNow(); break;
 case 'optimize-day':  UI.closeModal(); runOptimize(); break;
 case 'optimize-postpone':  postponeUnscheduled(); break;
 case 'lighten-day':  UI.closeModal(); runLighten(); break;
 case 'trim-day':  UI.closeModal(); runTrim(); break;
 case 'night-reset':  openNightReset(); break;
 case 'new-quote':  shuffleAffirmation(event); break;
 case 'enable-notifications': enableNotifications(); break;
 case 'dismiss-notifications': dismissNotificationPrompt(); break;
 case 'install-app':  installApp(); break;

 /* --- the gentle rescue menu --- */
 case 'rescue-me':  openRescueModal(); break;
 case 'rescue-behind':  UI.closeModal(); runOptimize(); break;
 case 'rescue-tired':  UI.closeModal(); addPauseNow(); runLighten(); break;
 case 'rescue-short':  UI.closeModal(); runTrim(); break;
 case 'add-routine':  runRoutine(key); break;

 /* --- activities --- */
 case 'task-toggle':  toggleTask(id, target); break;
 case 'task-edit':  UI.closeModal(); openTaskModal(id); break;
 case 'task-save':  saveTaskFromModal(id); break;
 case 'task-fit':  fitPendingTask(); break;
 case 'task-force':  forcePendingTask(); break;
 case 'task-adjust':  adjustPendingTask(); break;
 case 'task-delete':  deleteTask(id); break;
 case 'task-delete-confirm': confirmDeleteTask(); break;
 case 'task-resched':  openRescheduleModal(id); break;
 case 'resched-quick':  quickReschedule(id, minutes); break;
 case 'resched-tomorrow':  moveTaskToTomorrow(id); break;
 case 'start-focus':  startFocusForTask(id); break;
 case 'backlog-remove':  removeBacklogItem(id); break;

 /* --- what should I do now --- */
 case 'rec-start':  startRecommendation(index); break;
 case 'rec-done':  UI.closeModal(); toggleTask(id, target); break;
 case 'rec-next':  suggestionIndex = (suggestionIndex + 1) % Math.max(1, suggestions.length); renderSuggestion(); break;
 case 'rec-place':  placeBacklogNow(index); break;
 case 'rec-add-wellness':  addWellnessNow(index); break;

 /* --- check-in + nightly reset --- */
 case 'checkin-mood':  checkIn(target.getAttribute('data-mood')); break;
 case 'review-mood':  reviewMood(target.getAttribute('data-rating')); break;
 case 'night-move':  nightMoveUnfinished(); break;
 case 'night-plan':  nightPlanTomorrow(); break;
 case 'night-close':  closeNightReset(); break;

 /* --- study --- */
 case 'subject-study':  openSubjectFocus(id); break;
 case 'subject-log':  openLogSessionModal(id); break;
 case 'subject-edit':  openSubjectModal(id); break;
 case 'subject-save':  saveSubject(id); break;
 case 'subject-delete':  deleteSubject(id); break;
 case 'subject-delete-confirm': confirmDeleteSubject(); break;
 case 'session-delete':  deleteSession(id); break;
 case 'log-save':  saveLoggedSession(); break;

 /* --- 💗 My Luvli Style ♡ --- */
 case 'style-set':  setLuvliStyle(key); break;
 case 'style-today':  setTodayLuvliStyle(key || nextStyleAfter(LuvliStyle.currentKey(state()))); break;
 case 'style-keep':  keepTodayStyle(); break;
 case 'style-prompt-dismiss':  dismissStylePrompt(); break;
 case 'style-affirm':  shuffleAffirmation(event); break;
 case 'toggle-affirmation-style': toggleAffirmationStyle(key); break;

 /* --- affirmations --- */
 case 'toggle-aff-category': toggleAffCategory(key); break;
 case 'remove-favorite':  removeFavorite(index); break;
 case 'remove-custom-affirmation': removeCustomAffirmation(index); break;

 /* --- settings / data --- */
 case 'reset-confirm':  confirmReset(); break;

 default: break;
 }
 }

 /* ----------------------------- accessibility ---------------------------- */
 /** Speak the "right now" activity to screen readers when it changes. */
 let lastAnnounced = '';
 function announceCurrent(status) {
 const label = status.current
 ? 'Right now: ' + status.current.name + ', until ' + Scheduler.formatTime(status.current.end, state())
 : (status.next
 ? 'Free time. Next: ' + status.next.name + ' at ' + Scheduler.formatTime(status.next.start, state())
 : 'Nothing scheduled right now.');
 if (label === lastAnnounced) return;
 lastAnnounced = label;
 const el = $('liveAnnouncer');
 if (el) el.textContent = label;
 }

 /** Keyboard shortcuts — a nudge for people using a keyboard with Luvli. */
 const SHORTCUTS = [
 { keys: '1 … 7', what: 'Jump to Home, My Day, Study, Focus, Progress, Affirmations, Settings' },
 { keys: 'N', what: 'New activity' },
 { keys: 'F', what: 'Go to Focus' },
 { keys: 'W', what: 'What should I do now?' },
 { keys: 'O', what: 'Optimize my day' },
 { keys: 'L', what: 'Lighten my day' },
 { keys: 'R', what: 'Rescue me' },
 { keys: 'U', what: 'Undo the last change' },
 { keys: 'Space', what: 'Pause or resume a focus session' },
 { keys: '?', what: 'Show this list' },
 { keys: 'Esc', what: 'Close a window' }
 ];

 function onShortcut(event) {
 if (event.metaKey || event.ctrlKey || event.altKey) return;
 const tag = (event.target && event.target.tagName) ? event.target.tagName.toLowerCase() : '';
 const typing = tag === 'input' || tag === 'select' || tag === 'textarea' ||
 (event.target && event.target.isContentEditable);
 if (typing) return;

 const modalOpen = field_hasModal();

 if (event.key === 'Escape') return;  // UI handles this
 if (event.key === '?' || (event.shiftKey && event.key === '/')) {
 event.preventDefault();
 openShortcuts();
 return;
 }
 if (modalOpen) return;

 const key = event.key.toLowerCase();
 const pageByNumber = NAV[Number(event.key) - 1];
 if (pageByNumber) { event.preventDefault(); go(pageByNumber.page); return; }

 switch (key) {
 case 'n': event.preventDefault(); openTaskModal(null, view.date); break;
 case 'f': event.preventDefault(); go('focus'); break;
 case 'w': event.preventDefault(); openWhatNow(); break;
 case 'o': event.preventDefault(); runOptimize(); break;
 case 'l': event.preventDefault(); runLighten(); break;
 case 'r': event.preventDefault(); openRescueModal(); break;
 case 'u': event.preventDefault(); actionUndo(); break;
 case ' ':
 if (Pomodoro.hasSession()) { event.preventDefault(); Pomodoro.togglePause(); }
 break;
 default: break;
 }
 }

 function field_hasModal() {
 const root = $('modalRoot');
 return Boolean(root && root.children && root.children.length);
 }

 function actionUndo() {
 if (Storage.undo()) UI.toast({ icon: 'undo', title: 'Brought it back, luv', body: 'That change has been undone.' });
 else UI.toast({ icon: 'heart', title: 'Nothing to undo', body: 'Everything is already as you left it.' });
 }

 function openShortcuts() {
 UI.modal({
 title: 'Little shortcuts',
 sub: 'Everything works with touch too — these are just for speed.',
 bodyHtml: '<ul class="af-list">' + SHORTCUTS.map((item) =>
 '<li><span class="kbd">' + esc(item.keys) + '</span> ' + esc(item.what) + '</li>').join('') + '</ul>',
 actions: [{ label: 'Lovely', action: 'modal-cancel', variant: 'primary' }]
 });
 }

 /* ------------------------------ event wiring ---------------------------- */
 function on(id, handler) {
 const el = $(id);
 if (el) el.addEventListener('click', handler);
 }

 function onEnter(id, handler) {
 const el = $(id);
 if (el) el.addEventListener('keydown', (event) => {
 if (event.key === 'Enter') { event.preventDefault(); handler(); }
 });
 }

 function bindSettings() {
 const bindValue = (id, handler) => {
 const el = $(id);
 if (el) el.addEventListener('change', () => handler(el.value));
 };
 const bindCheck = (id, handler) => {
 const el = $(id);
 if (el) el.addEventListener('change', () => handler(el.checked));
 };

 bindValue('setName', (value) => setProfile('name', value.trim()));
 bindValue('setWake', (value) => setSetting('wakeTime', value || '07:00'));
 bindValue('setSleep', (value) => setSetting('sleepTime', value || '22:30'));
 bindValue('setTimeFormat', (value) => setSetting('timeFormat', value));
 bindValue('setFocus', (value) => setSetting('focusLength', Utils.clamp(Number(value) || 25, 1, 180)));
 bindValue('setBreak', (value) => setSetting('breakLength', Utils.clamp(Number(value) || 5, 1, 60)));
 bindValue('setLongBreak', (value) => setSetting('longBreakLength', Utils.clamp(Number(value) || 15, 1, 90)));
 bindValue('setNotifLead', (value) => setNestedSetting('notifications', 'leadMinutes', Number(value) || 10));
 bindValue('setBuffer', (value) => setSetting('bufferMinutes', Number(value) || 0));
 bindValue('setMaxHours', (value) => setSetting('maxPlannedHours', Number(value) || 10));

 bindCheck('setAutoBreak', (value) => setSetting('autoBreak', value));
 bindCheck('setNotifEnabled', (value) => setNestedSetting('notifications', 'enabled', value));
 bindCheck('setNotifEvening', (value) => setNestedSetting('notifications', 'evening', value));
 bindCheck('setNotifCelebrate', (value) => setNestedSetting('notifications', 'celebrate', value));
 bindCheck('setProtectBreaks', (value) => setSetting('protectBreaks', value));
 bindCheck('setAutoOptimize', (value) => setSetting('autoOptimize', value));
 bindCheck('setAffFocus', (value) => setNestedSetting('affirmations', 'duringFocus', value));
 bindCheck('setReduceMotion', (value) => { setSetting('reduceMotion', value); applyTheme(); });
 bindCheck('setFocusFullscreen', (value) => {
 setSetting('focusFullscreen', value);
 if (!value) document.body.classList.remove('focus-mode');
 else if (Pomodoro.hasSession()) document.body.classList.add('focus-mode');
 });
 bindCheck('setFocusSound', (value) => setSetting('focusSound', value));
 bindValue('setSyncEndpoint', (value) => {
 Storage.update((draft) => {
 draft.settings.sync.endpoint = value.trim();
 if (!value.trim()) draft.settings.sync.autoPush = false;
 }, 'settings');
 renderSettings();
 });
 bindCheck('setSyncAuto', (value) => {
 Storage.update((draft) => { draft.settings.sync.autoPush = value; }, 'settings');
 if (value) UI.toast({ icon: 'cloud-off', title: 'Auto-sync on', body: 'A copy goes out a few seconds after each change.' });
 });

 wireSettingsApps('setStudyAppInput', 'setAddStudyAppBtn', 'studyApps');
 wireSettingsApps('setDistractionAppInput', 'setAddDistractionAppBtn', 'distractionApps');
 }

 /** Add-a-chip wiring for the study apps / distractions on the Settings page. */
 function wireSettingsApps(inputId, buttonId, listKey) {
 const input = $(inputId);
 const button = $(buttonId);
 const add = () => {
 const value = input ? input.value.trim() : '';
 if (!value) return;
 Storage.update((draft) => {
 if (draft[listKey].indexOf(value) === -1) draft[listKey].push(value);
 }, 'apps');
 if (input) input.value = '';
 };
 if (button) button.addEventListener('click', add);
 if (input) input.addEventListener('keydown', (event) => {
 if (event.key === 'Enter') { event.preventDefault(); add(); }
 });
 }

 function bindEvents() {
 // Sidebar + bottom navigation
 document.addEventListener('click', (event) => {
 const button = event.target.closest ? event.target.closest('[data-page]') : null;
 if (!button) return;
 if (button.classList.contains('nav-item') || button.classList.contains('bn-item')) {
 go(button.getAttribute('data-page'));
 }
 });

 // My Day
 on('dayPrev', () => { view.date = Utils.addDays(view.date, -1); renderMyDay(); });
 on('dayNext', () => { view.date = Utils.addDays(view.date, 1); renderMyDay(); });
 on('dayTodayBtn', () => { view.date = Utils.todayKey(); renderMyDay(); });
 on('addActivityBtn', () => openTaskModal(null, view.date));
 on('backlogAddBtn', addBacklogItem);
 onEnter('backlogName', addBacklogItem);

 // Live "I read: …" feedback while typing a sentence
 const backlogInput = $('backlogName');
 if (backlogInput) backlogInput.addEventListener('input', updateQuickHint);

 // Study
 on('addSubjectBtn', () => openSubjectModal(null));

 // Affirmations
 on('afShuffleBtn', (event) => shuffleAffirmation(event));
 on('afFavBtn', saveCurrentAffirmation);
 on('addAffBtn', addCustomAffirmation);
 onEnter('customAffInput', addCustomAffirmation);

 // Settings + data
 bindSettings();
 bindGridDrag();
 on('exportBtn', exportData);
 on('resetBtn', resetEverything);
 on('seedBtn', loadSampleDay);
 on('syncTestBtn', () => runSync('test'));
 on('syncPushBtn', () => runSync('push'));
 on('syncPullBtn', () => runSync('pull'));
 on('notifPermissionBtn', () => {
 if (Notifier.permission() === 'granted') testNotification();
 else enableNotifications();
 });
 const importInput = $('importInput');
 if (importInput) importInput.addEventListener('change', () => importData(importInput.files[0]));

 // Toasts requested by other modules (notifications.js, pomodoro.js)
 document.addEventListener('luvli:toast', (event) => UI.toast(event.detail || {}));

 // Every button that carries a data-action attribute
 document.addEventListener('click', onAction);

 // Keyboard shortcuts (and '?' for the list)
 document.addEventListener('keydown', onShortcut);
 }

 /* --------------------------------- start -------------------------------- */
 function init() {
 // A brand-new visitor gets a gentle sample day, so nothing feels empty
 const firstEverVisit = localStorage.getItem(Storage.KEY) === null;
 if (firstEverVisit) Storage.seedSampleDay(false);

 applyTheme();
 buildNav();
 fillCategorySelects();
 updateQuickHint();
 ensureRecurring();
 Storage.compactHistory(90);
 Pomodoro.mount();
 bindEvents();

 homeQuote = Affirmations.random(state(), { mood: moodOfToday() });
 pageQuote = Affirmations.random(state(), {});
 setText('sideQuote', '“' + Affirmations.random(state(), {}).text + '”');

 renderAll();
 startClock();
 startMinuteWatcher();
 startPlatform();
 Notifier.init();
 Sync.init();
 Storage.subscribe((snapshot, reason) => refresh(reason));

 // A fresh quote in the sidebar every few minutes
 setInterval(() => setText('sideQuote', '“' + Affirmations.random(state(), {}).text + '”'), 300000);

 /* ♡ The route guard. Nobody uses Luvli until they have signed in — and a
    returning person with a remembered session goes straight through. The
    account screens themselves are login.html and signup.html.

    Auth.ready() resolves instantly for the local provider (so this behaves
    exactly as before) and after the real backend's first session check for
    a provider like Supabase — everything above this point (nav, renderAll,
    event bindings) does not need to wait on it. */
 Auth.ready().then(() => {
 if (!requireAuth()) return;
 renderAccountCard();
 if (typeof SupabaseSync !== 'undefined') SupabaseSync.init();

 if (firstEverVisit) {
 setTimeout(() => UI.toast({
 icon: '',
 title: 'Welcome to Luvli',
 body: 'I filled in a sample day so you can see how we work together. Change anything you like.'
 }), 900);
 }
 });
 }

 init();

 return { init, go, renderAll, refresh };
})();
