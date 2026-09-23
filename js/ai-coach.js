/* =============================================================================
 ai-coach.js — the Luvli AI life coach
 -----------------------------------------------------------------------------
 Loaded after storage.js, scheduler.js and affirmations.js, so it can read the
 real Luvli data and reuse the same day logic. Three parts:
 • CoachUI  — toasts, modals and floating hearts (same look as Luvli)
 • CoachMemory  — this conversation, saved advice and preferences (local)
 • Coach  — the screen: the chat, the little screens, and the brain
 Everything stays on the device. There is no model here — just careful,
 keyword-led understanding, the person's own data, and warmth.
 ========================================================================== */
'use strict';

/* ------------------------------ DOM helpers ------------------------------ */
function $(id) { return document.getElementById(id); }
function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
function setHtml(id, html) { const el = $(id); if (el) el.innerHTML = html; return el; }
function setText(id, text) { const el = $(id); if (el) el.textContent = text; return el; }

const esc = (value) => Utils.escapeHtml(value);
const nowIso = () => new Date().toISOString();
/* A single space, built safely so it can never be trimmed away in transit. */
const SP = String.fromCharCode(32);

/* -----------------------------------------------------------------------------
 The coach's emoji set — one calm, modern language, chosen on purpose so the
 whole page reads as a single, grown-up voice (no clutter, no cartoon noise).
 -------------------------------------------------------------------------- */
const ICON = {
 brand:  ico('heart'),
 coach:  ico('sparkles'),
 fresh:  ico('sparkles'),
 spark:  ico('sparkles'),
 bloom:  ico('heart'),
 growth: ico('sprout'),
 rest:  ico('leaf'),
 night:  ico('moon'),
 focus:  ico('headphones'),
 guide:  ico('compass'),
 now:  ico('bolt'),
 done:  ico('check'),
 clock:  ico('clock')
};

/** How are you feeling? — calmer, more modern faces than the usual set. */
const MOODS = [
 { key: 'great',  label: 'Calm' },
 { key: 'good',  label: 'Good' },
 { key: 'okay',  label: 'Okay' },
 { key: 'low',  label: 'Low' },
 { key: 'exhausted', label: 'Drained' }
];
const moodMeta = (key) => MOODS.filter((m) => m.key === key)[0] || null;

/* ============================== CoachUI ===============================
 Toasts, modals and hearts, built to feel identical to the rest of Luvli.
 ======================================================================= */
const CoachUI = (() => {

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
 '<span class="toast-ico">' + (opts.icon || ICON.brand) + '</span>' +
 '<div class="toast-text">' +
 '<div class="toast-title">' + esc(opts.title || 'Luvli') + '</div>' +
 (opts.body ? '<div class="toast-body">' + esc(opts.body) + '</div>' : '') +
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
 if (action.href) {
 return '<a class="btn btn-' + (action.variant || 'soft') + '" href="' + action.href + '">' +
 action.label + '</a>';
 }
 const attrs = action.attrs ? String.fromCharCode(32) + action.attrs : '';
 return '<button class="btn btn-' + (action.variant || 'soft') + '" type="button" ' +
 'data-action="' + action.action + '"' + attrs + '>' +
 action.label + '</button>';
 }

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
 'aria-label="' + esc(opts.title || 'Luvli') + '">' +
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
 return backdrop;
 }

 function onEscape(event) { if (event.key === 'Escape') closeModal(); }

 function onModalKeydown(event) {
 if (event.key !== 'Tab' || !openBackdrop) return;
 const focusable = $$('button, input, select, textarea, [href]', openBackdrop)
 .filter((el) => !el.disabled && el.offsetParent !== null);
 if (!focusable.length) return;
 const first = focusable[0];
 const last = focusable[focusable.length - 1];
 if (event.shiftKey && document.activeElement === first) {
 event.preventDefault(); last.focus();
 } else if (!event.shiftKey && document.activeElement === last) {
 event.preventDefault(); first.focus();
 }
 }

 function closeModal() {
 if (!openBackdrop) return;
 openBackdrop.removeEventListener('keydown', onModalKeydown);
 openBackdrop.remove();
 openBackdrop = null;
 document.removeEventListener('keydown', onEscape);
 if (lastFocused && lastFocused.focus) {
 try { lastFocused.focus(); } catch (err) { /* element is gone */ }
 }
 lastFocused = null;
 }

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

 /* ------------------------- soft particle bursts ------------------------ */
 const FX_COLORS = ['rgba(239,168,191,.8)', 'rgba(216,198,245,.75)', 'rgba(247,198,166,.75)'];

 function burst(x, y, count) {
 if (document.documentElement.classList.contains('reduce-motion')) return;
 const layer = $('fxLayer');
 if (!layer) return;
 const cx = (x === null || x === undefined) ? window.innerWidth / 2 : x;
 const cy = (y === null || y === undefined) ? window.innerHeight / 2 : y;

 for (let i = 0; i < (count || 8); i++) {
 const el = document.createElement('span');
 el.className = 'fx-item fx-dot';
 el.style.background = FX_COLORS[i % FX_COLORS.length];
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

 function burstFrom(target, count) {
 if (!target || !target.getBoundingClientRect) { burst(null, null, count); return; }
 const rect = target.getBoundingClientRect();
 burst(rect.left + rect.width / 2, rect.top + rect.height / 2, count);
 }

 return { toast, modal, closeModal, confirm, burst, burstFrom };
})();

/* ============================= CoachMemory ============================
 The coach's own little notebook, kept on this device under its own key so the
 conversation never bloats the main Luvli save (or its undo history).
 • messages — the transcript you see
 • advice  — the gentle lines you chose to keep
 • prefs  — how you like the coach to talk to you
 ======================================================================= */
const CoachMemory = (() => {
 const KEY = 'luvli.coach.v1';
 const LIMIT = 140;  // keep the notebook small and quick

 let data = null;

 const blank = () => ({
 messages: [],
 advice: [],
 prefs: { gentle: true, celebrate: true, keepShort: false },
 greeted: false,
 updatedAt: null
 });

 function load() {
 try {
 const raw = localStorage.getItem(KEY);
 const parsed = raw ? JSON.parse(raw) : null;
 data = Object.assign(blank(), parsed || {});
 if (!data.prefs) data.prefs = blank().prefs;
 if (!Array.isArray(data.messages)) data.messages = [];
 if (!Array.isArray(data.advice)) data.advice = [];
 } catch (err) {
 data = blank();
 }
 return data;
 }

 const get = () => (data || load());
 function save() {
 try { localStorage.setItem(KEY, JSON.stringify(get())); } catch (err) { /* private mode: keep going */ }
 }
 function update(mutator) {
 const current = get();
 if (typeof mutator === 'function') mutator(current);
 current.updatedAt = nowIso();
 save();
 return current;
 }

 /* ------------------------------ messages ------------------------------- */
 function push(message) {
 return update((d) => {
 d.messages.push(message);
 if (d.messages.length > LIMIT) d.messages = d.messages.slice(-LIMIT);
 });
 }
 const messages = () => get().messages;
 function clearMessages() { return update((d) => { d.messages = []; }); }

 /* ------------------------------- advice -------------------------------- */
 function addAdvice(text, tag) {
 const clean = String(text || '').trim();
 if (!clean) return false;
 let added = false;
 update((d) => {
 if (d.advice.some((a) => a.text === clean)) return;
 d.advice.unshift({ id: Utils.uid('advice'), text: clean, tag: tag || ICON.bloom, at: nowIso() });
 added = true;
 });
 return added;
 }
 function removeAdvice(id) { return update((d) => { d.advice = d.advice.filter((a) => a.id !== id); }); }
 const advice = () => get().advice;

 /* ---------------------------- preferences ------------------------------ */
 function togglePref(key) {
 return update((d) => { d.prefs[key] = !d.prefs[key]; });
 }
 const prefs = () => get().prefs;

 /* ------------------------------ fresh start ---------------------------- */
 function markGreeted() { return update((d) => { d.greeted = true; }); }
 const greeted = () => get().greeted;
 function reset() {
 return update((d) => { d.messages = []; d.greeted = false; });
 }

 return {
 KEY, get, save, update, messages, push, clearMessages,
 addAdvice, removeAdvice, advice, togglePref, prefs,
 markGreeted, greeted, reset
 };
})();

/* ============================== CoachBrain ============================
 A small, honest "understanding" engine. No model, no server — just careful
 keyword reading, the person's own data and a warm voice. Every reply is
 { text, tools[], mood?, celebrate? } and Coach decides how to show it.
 ======================================================================= */
const CoachBrain = (() => {

 const rx = (word) => new RegExp('(^|[^a-z])' + String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)', 'i');
 const hasWord = (text, word) => rx(word).test(text);
 const hasAny = (text, list) => list.some((word) => hasWord(text, word));
 const countWords = (text) => String(text).trim().split(/\s+/).filter(Boolean).length;

 const nameOf = (state) => (state && state.profile && state.profile.name) ? state.profile.name : 'luv';

 /* A single gentle line right after a greeting, e.g. "Good morning, luv." */
 const GREETINGS = ['good morning', 'good afternoon', 'good evening', 'morning', 'afternoon', 'evening'];

 /* -------------------------------------------------------------------------
 Feelings. Ordered so the strongest signal wins ("tired" beats "okay").
 ---------------------------------------------------------------------- */
 const FEELINGS = [
 { key: 'exhausted', words: ['exhausted', 'drained', 'burnt out', 'burned out', 'burnout', 'no energy', 'knackered', 'wiped', 'shattered', 'tired', 'sleepy', 'flat'] },
 { key: 'low',  words: ['overwhelmed', 'anxious', 'anxiety', 'stressed', 'stress', 'worried', 'nervous', 'scared', 'panic', 'sad', 'down', 'unhappy', 'lonely', 'alone', 'hurt', 'crying', 'hopeless', 'heavy', 'low'] },
 { key: 'great',  words: ['amazing', 'wonderful', 'fantastic', 'brilliant', 'excited', 'proud', 'happy', 'great', 'calm', 'peaceful', 'grateful', 'good'] },
 { key: 'okay',  words: ['okay', 'alright', 'fine', 'meh', 'average', 'so so', 'so-so'] }
 ];

 /** Did they tell us how they feel? (ignores "good morning" and the like) */
 function detectMood(raw) {
 let text = SP + String(raw).toLowerCase() + ' ';
 GREETINGS.forEach((g) => { text = text.replace(g, SP); });
 if (/\bnot\b|\bdon'?t\b|\bun\b/.test(text) && hasAny(text, ['good', 'great', 'okay', 'fine', 'alright'])) {
 return 'low';
 }
 const aboutSelf = hasAny(text, ['i', 'i\'m', 'im', 'feel', 'feeling', 'today', 'lately', 'right now']) || countWords(raw) <= 3;
 if (!aboutSelf) return null;
 for (let i = 0; i < FEELINGS.length; i++) {
 if (hasAny(text, FEELINGS[i].words)) return FEELINGS[i].key;
 }
 return null;
 }

 function moodReply(key, state) {
 const name = nameOf(state);
 const lines = {
 great: 'That is lovely to hear, ' + name + '. Days like this are worth noticing too — not only the hard ones.',
 good: 'Good is a perfectly good place to be. Let\'s keep the day kind and steady. ',
 okay: 'Okay is honest, and that is more than enough to work with. One small thing at a time today.',
 low: 'I\'m sorry it feels heavy right now, ' + name + '. You don\'t have to fix everything today — let me make it a little lighter.',
 exhausted: 'You sound tired, and that matters. Rest isn\'t something you have to earn — let\'s protect your energy today.'
 };
 const tools = [];
 if (key === 'low' || key === 'exhausted') {
 tools.push({ label: ICON.rest + ' Lighten my day', action: 'coach-lighten', variant: 'soft' });
 tools.push({ label: ICON.guide + ' What should I do?', action: 'coach-now', variant: 'ghost' });
 } else if (key === 'great') {
 tools.push({ label: ICON.now + ' Use the momentum', action: 'coach-now', variant: 'soft' });
 } else {
 tools.push({ label: ICON.guide + ' What should I do now?', action: 'coach-now', variant: 'soft' });
 }
 return { text: lines[key], mood: key, tools, celebrate: key === 'great' };
 }

 /* ------------------------------- helpers ------------------------------- */
 const tool = (label, action, attrs, variant) => ({ label: label, action: action, attrs: attrs || '', variant: variant || 'soft' });
 const openDay = (label, variant) => ({ label: label || 'Open my day', href: 'index.html', variant: variant || 'ghost' });

 /** The best single suggestion, described warmly, with its own buttons. */
 function nowReply(state) {
 const today = Utils.todayKey();
 const rec = Scheduler.recommend(state, today);
 if (!rec) {
 return { text: 'Your day is still a blank page, ' + nameOf(state) + '. Tell me something you need to do and I\'ll help you shape it. ' + ICON.spark,
 tools: [tool(ICON.bloom + ' Add something', 'coach-add-activity', '', 'primary'), openDay()] };
 }
 const reason = String(rec.reason || '').trim();
 const short = reason.length > 160 ? reason.slice(0, 157).trim() + '…' : reason;
 return {
 text: ICON.spark + SP + rec.name + '\n' + short,
 tools: [tool(ICON.done + ' Done', 'coach-done-now', 'data-id="' + rec.id + '"', 'soft'), openDay()],
 celebrate: false
 };
 }
 return { detectMood, moodReply, nowReply, tool, openDay, nameOf, hasAny, hasWord, countWords };
})();

/* ============================= CoachReplies ===========================
 The coach's other answers — planning, motivation, goals, decisions and the
 gentle art of turning a sentence into something on your day. Each returns
 { text, tools[], celebrate? } and may quietly update the real Luvli data.
 ======================================================================= */
const CoachReplies = (() => {
 const T = (label, action, attrs, variant) => CoachBrain.tool(label, action, attrs, variant);
 const day = (label, variant) => CoachBrain.openDay(label, variant);
 const nameOf = (state) => CoachBrain.nameOf(state);

 /* ------------------------------- help ---------------------------------- */
 function help(state) {
 return {
 text: ICON.spark + SP + 'Here is what I can do with you, ' + nameOf(state) + ':\n' +
 '• Plan or tidy your day — say "plan my day" or "fix my day"\n' +
 '• Add anything — "add gym tomorrow 7am for 45m"\n' +
 '• Tell me how you feel — "I\'m exhausted today"\n' +
 '• Find the next right thing — "what should I do now?"\n' +
 '• Steady a hard moment, or make a decision with you\n' +
 '• Keep the lines that helped — tap Save on any reply',
 tools: [T(ICON.guide + ' What should I do now?', 'coach-now', '', 'soft'), day()]
 };
 }

 /* ----------------------------- greeting -------------------------------- */
 function greeting(state) {
 return {
 text: Scheduler.greeting(state) + SP + 'I\'m here whenever you\'re ready — we can plan, untangle, or just talk.',
 tools: [T(ICON.guide + ' What should I do now?', 'coach-now', '', 'soft'), T(ICON.spark + ' Plan my day', 'coach-quick', 'data-text="plan my day"', 'ghost')]
 };
 }

 /* ----------------------------- feelings -------------------------------- */
 function overwhelm(state) {
 return {
 text: 'That sounds like a lot to hold at once, ' + nameOf(state) + '. You don\'t have to carry all of it at once — let\'s set most of it down and keep one thing.',
 tools: [T(ICON.rest + ' Lighten my day', 'coach-lighten', '', 'primary'), T(ICON.guide + ' Just the next step', 'coach-now', '', 'soft')]
 };
 }

 function stuck(state) {
 return {
 text: 'Getting started is the hardest part — that\'s not a flaw in you, it\'s just how brains work. ' + ICON.spark + '\nTry this: give it ten honest minutes, and you\'re allowed to stop after. Momentum usually takes over.',
 tools: [T(ICON.focus + ' Start a focus session', 'coach-add-activity', '', 'primary'), T(ICON.guide + ' Pick one thing for me', 'coach-now', '', 'soft')]
 };
 }

 /* ------------------------------ planning ------------------------------- */
 function plan(state) {
 const today = Utils.todayKey();
 const outlook = Scheduler.dayOutlook(state, today);
 const status = outlook.status;
 const bits = [];
 bits.push('You have ' + Utils.formatMinutes(outlook.planned) + ' planned and about ' + Utils.formatMinutes(outlook.freeMinutes) + ' still free.');
 if (status.next) bits.push('Next up is ' + status.next.name + ' at ' + Scheduler.formatTime(status.next.start, state) + '.');
 const closing = outlook.message || 'It looks like a day you can be proud of.';
 return {
 text: ICON.spark + SP + 'Here\'s your day, ' + nameOf(state) + ':\n' + bits.join('\n') + '\n' + closing,
 tools: [T(ICON.spark + ' Tidy my day', 'coach-optimize', '', 'primary'), day()]
 };
 }

 function optimize(state) {
 let result = null;
 Storage.update((d) => { result = Scheduler.optimizeDay(d, Utils.todayKey(), Scheduler.nowMinutes()); }, 'coach-optimize');
 const parts = [];
 if (result.moved.length) parts.push('moved ' + result.moved.length + ' slipped ' + (result.moved.length > 1 ? 'things' : 'thing'));
 if (result.scheduled.length) parts.push('placed ' + result.scheduled.length + ' from your list');
 if (!parts.length) {
 return { text: 'Your day already fits beautifully — nothing needed moving.', tools: [day()] };
 }
 const note = result.unscheduled.length
 ? '\nThere\'s still ' + result.unscheduled.length + ' that won\'t fit comfortably — we can move those to tomorrow another time.'
 : '';
 return {
 text: ICON.spark + SP + 'I tidied the rest of today: ' + parts.join(' and ') + '.' + note,
 tools: [day('✓ Open my day', 'primary')],
 celebrate: true
 };
 }

 function lighten(state) {
 let result = null;
 Storage.update((d) => { result = Scheduler.lightenDay(d, Utils.todayKey(), Scheduler.nowMinutes()); }, 'coach-lighten');
 return {
 text: ICON.rest + SP + result.message,
 tools: [day('✓ Open my day', 'primary')],
 celebrate: result.movedTasks.length > 0
 };
 }

 /* ----------------------------- motivation ------------------------------ */
 function motivate(state) {
 const line = Affirmations.random(state);
 return {
 text: ICON.spark + SP + (line && line.text ? line.text : 'You are doing better than you think.'),
 tools: [T(ICON.now + ' Turn it into action', 'coach-now', '', 'soft'), day()],
 celebrate: true
 };
 }

 /* ------------------------------- goals --------------------------------- */
 function goals(state) {
 const subjects = state.subjects || [];
 if (!subjects.length) {
 return {
 text: 'You haven\'t set a goal yet, ' + nameOf(state) + '. Tell me one thing you\'re working towards and we\'ll keep it in sight together.',
 tools: [T(ICON.growth + ' New goal', 'coach-goal-add', '', 'primary'), day()]
 };
 }
 const lines = subjects.slice(0, 5).map((s) =>
 '• ' + s.name + ' — ' + (s.goal || 'in progress') + ' (' + (Number(s.progress) || 0) + '%)');
 return {
 text: 'Here\'s where you\'re growing, ' + nameOf(state) + ':\n' + lines.join('\n') + '\n\nEvery small step is real progress.',
 tools: [T(ICON.growth + ' New goal', 'coach-goal-add', '', 'soft'), day()]
 };
 }

 /* ------------------------------- study --------------------------------- */
 function study(state) {
 const student = state.student || {};
 const exams = (student.exams || []).slice().sort((a, b) => String(a.examDate).localeCompare(String(b.examDate)));
 const next = exams[0];
 if (next) {
 const away = Utils.dayDiff(Utils.todayKey(), next.examDate);
 const when = away <= 0 ? 'today' : (away === 1 ? 'tomorrow' : 'in ' + away + ' days');
 return {
 text: ICON.focus + SP + 'Your next exam is ' + next.name + SP + when + '. One focused block today is how it gets done, ' + nameOf(state) + '.',
 tools: [T(ICON.focus + ' Start a study block', 'coach-routine', 'data-key="study"', 'primary'), day()]
 };
 }
 return {
 text: ICON.focus + SP + 'Confusion is just the start of understanding — every page you read is a vote for who you\'re becoming. Shall we begin with one small block?',
 tools: [T(ICON.focus + ' Start a study block', 'coach-routine', 'data-key="study"', 'primary'), day()]
 };
 }

 /* ----------------------------- decisions ------------------------------- */
 function decision(state) {
 return {
 text: ICON.guide + SP + 'Let\'s hold this together. Three quiet questions usually show the way:\n' +
 '• Which choice would your future self thank you for?\n' +
 '• Which one protects your peace and your energy?\n' +
 '• If they still feel close, which is the smallest brave step you could try this week?',
 tools: [T(ICON.now + ' Choose one thing for today', 'coach-now', '', 'soft'), day()]
 };
 }

 /* ------------------------------- sleep --------------------------------- */
 function sleep(state) {
 return {
 text: ICON.night + SP + 'Let\'s help your mind slow down. Dim the lights, set the phone aside, and let today be finished — it\'s allowed to be enough. ',
 tools: [T(ICON.night + ' Add my wind-down', 'coach-routine', 'data-key="winddown"', 'primary'), day()]
 };
 }

 /* ------------------------------- thanks -------------------------------- */
 function thanks(state) {
 return {
 text: 'Anytime, ' + nameOf(state) + '. I\'m not going anywhere.',
 tools: [T(ICON.guide + ' What should I do now?', 'coach-now', '', 'soft')]
 };
 }

 /* -------------------------------- bye ---------------------------------- */
 function bye(state) {
 return {
 text: 'Go gently, ' + nameOf(state) + '. I\'ll be right here when you come back.',
 tools: []
 };
 }

 /* ----------------------------- remember -------------------------------- */
 function remember(text, state) {
 let note = String(text).replace(/^(please\s+)?(remember|note|keep in mind|don'?t forget)(\s+that)?\s*/i, '').trim();
 if (!note) return null;
 note = note.charAt(0).toUpperCase() + note.slice(1);
 const added = CoachMemory.addAdvice(note, ICON.spark);
 return {
 text: ICON.bloom + SP + (added ? 'Kept. I\'ll hold that close — "' : 'I already had that one — "') + note + '"',
 tools: [T(ICON.bloom + ' See what I\'ve saved', 'coach-advice-focus', '', 'ghost')],
 celebrate: added
 };
 }

 /* --------------------- turn a sentence into an entry ------------------- */
 function add(text, state) {
 const parsed = Scheduler.parseQuickAdd(text, state);
 if (!parsed.name) return null;
 const date = parsed.date || Utils.todayKey();
 const minutes = parsed.minutes || 30;

 if (parsed.start) {
 const end = Scheduler.minutesToTime(Scheduler.timeToMinutes(parsed.start) + minutes);
 Storage.update((d) => {
 d.tasks.push({
 id: Utils.uid('task'), date: date, name: parsed.name, category: parsed.category || 'custom',
 start: parsed.start, end: end, priority: parsed.priority || 'medium', notes: '',
 repeat: parsed.repeat || 'none', completed: false, createdAt: nowIso()
 });
 if (parsed.repeat && parsed.repeat !== 'none') Scheduler.materialiseRecurring(d, 7);
 }, 'coach-add');
 const label = Utils.relativeDateLabel(date);
 const when = label === 'Today' ? '' : label + ', ';
 return {
 text: ICON.spark + SP + 'Added ' + ICON.done + '\n' + parsed.name + '\n' + when + Scheduler.formatTime(parsed.start, state) + ' · ' + Utils.formatMinutes(minutes),
 tools: [T(ico('undo') + ' Undo', 'undo', '', 'ghost'), day('Open my day', 'primary')],
 celebrate: true
 };
 }

 Storage.update((d) => {
 d.backlog.push({
 id: Utils.uid('bl'), name: parsed.name, category: parsed.category || 'custom',
 priority: parsed.priority || 'medium', duration: minutes, status: 'backlog', addedAt: nowIso()
 });
 }, 'coach-add');
 return {
 text: ICON.spark + SP + 'I put "' + parsed.name + '" on your list for ' + Utils.formatMinutes(minutes) + '.\nWhen you\'re ready, I can place it into your day.',
 tools: [T(ICON.spark + ' Place it in my day', 'coach-optimize', '', 'primary'), day()],
 celebrate: true
 };
 }

 /* ------------------------------ fallback ------------------------------- */
 function fallback(state) {
 return {
 text: 'I\'m here, and I\'m listening, ' + nameOf(state) + '. ' + ICON.spark + '\nTell me a little more — or pick a direction and we\'ll take it together.',
 tools: [
 T(ICON.guide + ' What should I do now?', 'coach-now', '', 'soft'),
 T(ICON.spark + ' Plan my day', 'coach-quick', 'data-text="plan my day"', 'ghost'),
 T(ICON.rest + ' I just need to talk', 'coach-quick', 'data-text="I need to talk something through"', 'ghost')
 ]
 };
 }

 return {
 help, greeting, overwhelm, stuck, plan, optimize, lighten, motivate,
 goals, study, decision, sleep, thanks, bye, remember, add, fallback
 };
})();

/* ============================ brainReply ==============================
 Picks the right answer for a sentence. Order matters: the specific, helpful
 intents come first and the broad "how are you feeling" listening comes after,
 so a clear request is never swallowed by a vibe check.
 ======================================================================= */
function brainReply(raw, state) {
 const text = String(raw || '').trim();
 const lower = SP + text.toLowerCase() + SP;
 const B = CoachBrain;
 const CR = CoachReplies;

 if (!text) {
 return CR.fallback(state);
 }

 /* what the coach can do */
 if (B.hasAny(lower, ['help', 'what can you do', 'what can you help', 'how do i use', 'commands', 'what do you do'])) {
 return CR.help(state);
 }

 /* a plain hello */
 const greets = ['hi', 'hey', 'hello', 'yo', 'good morning', 'good afternoon', 'good evening', 'how are you', 'you there', 'you around'];
 if (B.hasAny(lower, greets) && B.countWords(text) <= 4) {
 return CR.greeting(state);
 }

 /* "remember that…" */
 if (/^(please\s+)?(remember|note down|note that|keep in mind|don'?t forget|save that)\b/i.test(text.toLowerCase())) {
 const kept = CR.remember(text, state);
 if (kept) return kept;
 }

 /* tidy up or lighten the day */
 if (B.hasAny(lower, ['fix my day', 'fix the day', 'optimize', 'optimise', 'tidy my day', 'tidy up my day', 'reorganise', 'reorganize', 'sort my day', 'rearrange my day'])) {
 return CR.optimize(state);
 }
 if (B.hasAny(lower, ['lighten', 'too full', 'too much on', 'ease my day', 'make it lighter', 'overloaded', 'too busy', 'packed day', 'reduce my day'])) {
 return CR.lighten(state);
 }

 /* what should I do now */
 if (B.hasAny(lower, ['what should i do', 'what now', 'what next', 'next thing', 'where do i start', 'what do i do now', 'help me start', 'what should i focus on', 'what first'])) {
 return B.nowReply(state);
 }

 /* plan the day */
 if (B.hasAny(lower, ['plan my day', 'plan the day', 'help me plan', 'organise my day', 'organize my day', 'make a plan', 'plan out my day', 'plan my week'])) {
 return CR.plan(state);
 }

 /* hard feelings first, so they are not mistaken for a mood check */
 if (B.hasAny(lower, ['overwhelmed', 'can\'t cope', 'cant cope', 'spiralling', 'spiraling', 'breaking down', 'freaking out', 'stressed out', 'panic attack'])) {
 return CR.overwhelm(state);
 }
 if (B.hasAny(lower, ['procrastinat', 'can\'t start', 'cant start', 'keep putting off', 'don\'t want to start', 'no motivation', 'stuck', 'lazy', 'can\'t focus', 'cant focus', 'distracted', 'keep avoiding'])) {
 return CR.stuck(state);
 }

 /* how are you feeling */
 const mood = B.detectMood(text);
 if (mood) {
 Storage.update((d) => {
 const key = Utils.todayKey();
 d.checkIns[key] = Object.assign({}, d.checkIns[key] || {}, { mood: mood });
 }, 'coach-mood');
 return B.moodReply(mood, state);
 }

 /* everyday feelings that are not moods but still want care */
 if (B.hasAny(lower, ['lonely', 'alone', 'sad about', 'feel rubbish', 'feel awful', 'feel stupid', 'not good enough', 'want to give up'])) {
 return CR.overwhelm(state);
 }

 /* motivation */
 if (B.hasAny(lower, ['motivate me', 'motivation', 'encourage me', 'pump me up', 'inspire me', 'cheer me up', 'give me a push', 'i need encouragement'])) {
 return CR.motivate(state);
 }

 /* goals + progress */
 if (B.hasAny(lower, ['my goals', 'goal', 'goals', 'how am i doing', 'am i on track', 'my progress'])) {
 return CR.goals(state);
 }

 /* study */
 if (B.hasAny(lower, ['study', 'exam', 'revision', 'revise', 'assignment', 'homework', 'lecture', 'flashcards', 'coursework'])) {
 return CR.study(state);
 }

 /* decisions */
 if (B.hasAny(lower, ['should i', 'can\'t decide', 'cant decide', 'decide between', 'torn between', 'which one', 'what do i choose', 'a decision', 'help me decide'])) {
 return CR.decision(state);
 }

 /* winding down */
 if (B.hasAny(lower, ['can\'t sleep', 'cant sleep', 'insomnia', 'wind down', 'wind-down', 'go to bed', 'bedtime', 'keep me up', 'racing thoughts'])) {
 return CR.sleep(state);
 }

 /* thanks */
 if (B.hasAny(lower, ['thank you', 'thanks', 'thankyou', 'appreciate it', 'that helped', 'you helped'])) {
 return CR.thanks(state);
 }

 /* goodbye */
 if (B.hasAny(lower, ['bye', 'goodnight', 'good night', 'goodbye', 'see you', 'talk later', 'gotta go'])) {
 return CR.bye(state);
 }

 /* something to add */
 const parsed = Scheduler.parseQuickAdd(text, state);
 const addVerbs = ['add', 'remind me to', 'remind me', 'schedule', 'block out', 'block time for', 'make time for', 'new task', 'create a task', 'put in my day', 'put on my list', 'put it in my day'];
 const looksAdd = B.hasAny(lower, addVerbs);
 const hasWhen = parsed.understood && (parsed.minutes || parsed.start);
 if (looksAdd || (hasWhen && !/\?\s*$/.test(text))) {
 const added = CR.add(text, state);
 if (added) return added;
 }

 return CR.fallback(state);
}

/* ============================== CoachModel =============================
 The optional real-AI path. When js/coach-config.js points at a model
 endpoint, every message goes there instead of the keyword brain. The endpoint
 is a small serverless function you control (netlify/functions/luvli-coach.js)
 which holds the model API key — the browser never sees it.

 It is deliberately fail-soft: any error, timeout or missing config returns
 null, and the caller falls straight back to the on-device brain. The coach can
 never go dead because a network call failed.
 ====================================================================== */
const CoachModel = (() => {

 const TIMEOUT = 20000;   // a slow reply is fine; a hung one is not
 /** The live config, or null when nothing is wired up. */
 function config() {
 const cfg = (typeof window !== 'undefined') ? window.LuvliCoachConfig : null;
 if (!cfg || typeof cfg.hasModel !== 'function' || !cfg.hasModel()) return null;
 return cfg.snapshot();
 }

 const available = () => Boolean(config());

 /** A short, honest description of who is answering. */
 function label() {
 const cfg = (typeof window !== 'undefined') ? window.LuvliCoachConfig : null;
 return cfg && typeof cfg.snapshot === 'function' ? cfg.snapshot().label : '';
 }

 /**
 * A compact snapshot of the person's day, so the model has real context
 * without us shipping their whole Luvli to the endpoint.
 */
 function context(state) {
 const today = Utils.todayKey();
 const live = (typeof Scheduler !== 'undefined' && Scheduler.liveStatus)
 ? Scheduler.liveStatus(today, state) : null;
 const activities = (state.activities || []).filter((a) => a.date === today && !a.done)
 .slice(0, 12)
 .map((a) => ({ name: a.name, start: a.start || null, minutes: a.minutes || null, priority: a.priority || 'medium' }));
 return {
 name: (state.profile && state.profile.name) || 'luv',
 now: Utils.nowMinutes ? Utils.nowMinutes() : null,
 current: live && live.current ? live.current.name : null,
 next: live && live.next ? live.next.name : null,
 planned: activities
 };
 }

 /** The last few turns, so the model keeps the thread of the conversation. */
 function history() {
 const messages = (typeof CoachMemory !== 'undefined' && CoachMemory.messages) ? CoachMemory.messages() : [];
 return messages.slice(-8).map((m) => ({
 role: m.role === 'coach' ? 'assistant' : 'user',
 content: m.text
 }));
 }

 /**
 * Ask the model endpoint for a reply.
 * @returns {Promise<{text:string, tools:Array}|null>} null means "use the
 * on-device brain instead".
 */
 function reply(text, state) {
 const cfg = config();
 if (!cfg) return Promise.resolve(null);

 const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
 const timer = window.setTimeout(() => { if (controller) controller.abort(); }, TIMEOUT);

 const body = {
 message: text,
 history: history(),
 context: context(state),
 preferences: (typeof CoachMemory !== 'undefined' && CoachMemory.prefs) ? CoachMemory.prefs() : {}
 };

 return fetch(cfg.endpoint, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body),
 signal: controller ? controller.signal : undefined
 })
 .then((res) => { window.clearTimeout(timer); if (!res.ok) throw new Error('coach ' + res.status); return res.json(); })
 .then((data) => {
 const replyText = data && typeof data.reply === 'string' ? data.reply.trim() : '';
 if (!replyText) return null;
 return { text: replyText, tools: Array.isArray(data.tools) ? data.tools : [] };
 })
 .catch(() => { window.clearTimeout(timer); return null; });
 }

 return { available, reply, label, context };
})();

/* ================================ Coach ================================
 The screen itself: reading your real Luvli day into the little cards, showing
 the conversation, wiring the composer and the buttons, and keeping it all in
 step when Luvli changes underneath.
 ====================================================================== */
const Coach = (() => {

 const state = () => Storage.get();

 /* quick prompts under the composer */
 const QUICK = [
 { label: ICON.guide + ' What now?',  text: 'What should I do now?' },
 { label: ICON.spark + ' Plan my day',  text: 'Plan my day' },
 { label: ICON.now + ' Motivate me',  text: 'Motivate me' },
 { label: ICON.focus + ' I feel stuck', text: 'I feel stuck and can\'t start' },
 { label: ICON.rest + ' I feel drained', text: 'I feel drained today' },
 { label: ICON.growth + ' My goals',  text: 'How are my goals going?' }
 ];

 /* the little preference switches in the rail */
 const PREFS = [
 { key: 'gentle',  name: 'Gentle nudges',  sub: 'Soft reminders, never pushy' },
 { key: 'celebrate', name: 'Celebrate my wins',  sub: 'A few hearts when I do well' },
 { key: 'keepShort', name: 'Keep answers short', sub: 'Just the essentials' }
 ];
 const PREF_KEYS = PREFS.map((p) => p.key);

 const MOOD_NOTES = {
 great:  'A calm, good day. Let\'s use it gently. ' + ICON.spark,
 good:  'Good is a lovely place to be. Steady as we go.',
 okay:  'Okay days are still worth having. One small step at a time.',
 low:  'I\'m right here with you. We\'ll keep today light. ',
 exhausted: 'Rest first, luv. I\'ll protect your energy today. ' + ICON.night
 };

 /* ------------------------------ helpers -------------------------------- */
 function timeLabel(iso) {
 const when = new Date(iso);
 return isNaN(when.getTime()) ? '' : Scheduler.formatClock(when);
 }

 function announce(text) { setText('coachAnnouncer', text); }

 function setStatus(text) { setText('coachStatus', text); }

 function showTyping(on) {
 const el = $('coachTyping');
 if (el) el.hidden = !on;
 }

 function autosize(el) {
 if (!el) return;
 el.style.height = 'auto';
 el.style.height = Math.min(el.scrollHeight || 48, 160) + 'px';
 }

 function scrollChatToEnd() {
 const box = $('coachMessages');
 if (!box) return;
 box.scrollTop = box.scrollHeight;
 }

 function applyTheme() {
 const settings = state().settings || {};
 document.documentElement.setAttribute('data-theme', settings.theme || 'rose');
 document.documentElement.classList.toggle('reduce-motion', Boolean(settings.reduceMotion));
 }

 /* ------------------------------ chat render ---------------------------- */
 function toolButton(tool) {
 if (tool.href) {
 return '<a class="btn btn-' + (tool.variant || 'soft') + ' btn-small" href="' + tool.href + '">' + esc(tool.label) + '</a>';
 }
 return '<button class="btn btn-' + (tool.variant || 'soft') + ' btn-small" type="button" ' +
 'data-action="' + tool.action + '"' + (tool.attrs ? SP + tool.attrs : '') + '>' + esc(tool.label) + '</button>';
 }

 function messageHtml(message, index) {
 const isUser = message.role === 'user';
 const tools = [];
 if (!isUser) {
 (message.tools || []).forEach((t) => tools.push(toolButton(t)));
 tools.push('<button class="btn btn-ghost btn-small" type="button" data-action="coach-save-advice" ' +
 'data-index="' + index + '">' + ICON.bloom + ' Save</button>');
 }
 const stamp = message.at ? '<div class="coach-msg-time">' + esc(timeLabel(message.at)) + '</div>' : '';
 return '<div class="coach-msg' + (isUser ? ' is-user' : '') + '">' +
 '<span class="coach-msg-avatar" aria-hidden="true">' + (isUser ? ICON.brand : ICON.coach) + '</span>' +
 '<div class="coach-msg-body">' +
 '<div class="coach-bubble">' + esc(message.text) + '</div>' +
 (tools.length ? '<div class="coach-bubble-tools">' + tools.join('') + '</div>' : '') +
 stamp +
 '</div>' +
 '</div>';
 }

 function renderChat() {
 const box = $('coachMessages');
 if (!box) return;
 const messages = CoachMemory.messages();
 box.innerHTML = messages.map((m, i) => messageHtml(m, i)).join('');
 setTimeout(scrollChatToEnd, 30);
 }

 function buildQuick() {
 setHtml('coachQuick', QUICK.map((q) =>
 '<button class="chip-item" type="button" data-action="coach-quick" data-text="' + esc(q.text) + '">' + esc(q.label) + '</button>'
 ).join(''));
 }

 /* ------------------------------ rail render ---------------------------- */
 function glanceRow(task, data, mod, ico) {
 return '<div class="coach-glance-row' + (mod ? SP + mod : '') + '" data-cat="' + esc(task.category || 'custom') + '">' +
 '<span class="coach-glance-ico">' + (ico || Scheduler.iconFor(task)) + '</span>' +
 '<div class="coach-glance-main">' +
 '<div class="coach-glance-name">' + esc(task.name) + '</div>' +
 '<div class="coach-glance-time">' + Scheduler.formatRange(task.start, task.end, data) + '</div>' +
 '</div>' +
 '</div>';
 }

 function renderGlance() {
 const data = state();
 const today = Utils.todayKey();
 const status = Scheduler.liveStatus(today, data);
 const progress = status.progress;
 setText('coachGlanceChip', progress.total ? (progress.completed + ' / ' + progress.total + SP + ICON.done) : '—');

 const rows = [];
 if (status.current) {
 rows.push(glanceRow(status.current, data, 'is-now', ICON.now));
 } else if (status.next) {
 rows.push('<div class="coach-glance-row"><span class="coach-glance-ico">' + ICON.rest + '</span>' +
 '<div class="coach-glance-main"><div class="coach-glance-name">Free time</div>' +
 '<div class="coach-glance-time">Next: ' + esc(status.next.name) + ' · ' + Scheduler.formatTime(status.next.start, data) + '</div></div></div>');
 }
 status.later.slice(0, 2).forEach((task) => rows.push(glanceRow(task, data, '', '')));
 if (status.done.length) rows.push(glanceRow(status.done[status.done.length - 1], data, 'is-done', ICON.done));
 if (!rows.length) {
 rows.push('<div class="coach-empty"><span class="coach-empty-ico">' + ICON.bloom + '</span>Nothing planned yet. Tell me what you need to do and we\'ll shape the day together.</div>');
 }
 setHtml('coachGlance', '<div class="coach-glance">' + rows.join('') + '</div>');

 setHtml('coachGlanceActions',
 '<button class="btn btn-soft btn-small" type="button" data-action="coach-now">' + ICON.guide + ' What now?</button>' +
 '<button class="btn btn-soft btn-small" type="button" data-action="coach-optimize">' + ICON.spark + ' Tidy my day</button>' +
 '<a class="btn btn-ghost btn-small" href="index.html">Open my day</a>');
 }

 function renderGoals() {
 const subjects = state().subjects || [];
 if (!subjects.length) {
 setHtml('coachGoals', '<div class="coach-empty"><span class="coach-empty-ico">' + ICON.growth + '</span>No goals yet. Tell me one thing you\'re working towards.</div>');
 return;
 }
 setHtml('coachGoals', subjects.map((sub) => {
 const pct = Utils.clamp(Number(sub.progress) || 0, 0, 100);
 return '<div class="coach-goal" data-id="' + sub.id + '">' +
 '<div class="coach-goal-top">' +
 '<span class="coach-goal-emoji">' + esc(sub.emoji || ICON.growth) + '</span>' +
 '<span class="coach-goal-name">' + esc(sub.name) + '</span>' +
 '<button class="coach-goal-x" type="button" data-action="coach-goal-remove" data-id="' + sub.id + '" aria-label="Remove goal">×</button>' +
 '</div>' +
 '<div class="coach-goal-text">' + esc(sub.goal || 'Keep going, luv.') + '</div>' +
 '<div class="coach-goal-bar"><span style="width:' + pct + '%"></span></div>' +
 '<div class="coach-goal-foot"><span>' + pct + '%</span><span>' +
 '<button class="coach-goal-step" type="button" data-action="coach-goal-step" data-id="' + sub.id + '" data-delta="-10" aria-label="Less progress">−</button>' +
 '<button class="coach-goal-step" type="button" data-action="coach-goal-step" data-id="' + sub.id + '" data-delta="10" aria-label="More progress">＋</button>' +
 '</span></div>' +
 '</div>';
 }).join(''));
 }

 function renderMood() {
 const current = (state().checkIns[Utils.todayKey()] || {}).mood || '';
 setHtml('coachMood', MOODS.map((m) =>
 '<button class="coach-mood' + (m.key === current ? ' is-on' : '') + '" type="button" ' +
 'data-action="coach-mood" data-mood="' + m.key + '" aria-pressed="' + (m.key === current ? 'true' : 'false') + '">' +
 
 '<span class="coach-mood-label">' + m.label + '</span>' +
 '</button>').join(''));
 setText('coachMoodNote', MOOD_NOTES[current] || 'Tell me how you feel and I\'ll shape the day around you.');
 }

 function renderPrefs() {
 const prefs = CoachMemory.prefs();
 setHtml('coachPrefs', PREFS.map((p) =>
 '<div class="coach-pref" role="button" tabindex="0" data-action="coach-pref" data-key="' + p.key + '" ' +
 'aria-pressed="' + (prefs[p.key] ? 'true' : 'false') + '">' +
 '<span class="coach-pref-text">' +
 '<span class="coach-pref-name">' + p.name + '</span>' +
 '<span class="coach-pref-sub">' + p.sub + '</span>' +
 '</span>' +
 '<span class="coach-switch' + (prefs[p.key] ? ' is-on' : '') + '"></span>' +
 '</div>').join(''));
 }

 function renderAdvice() {
 const list = CoachMemory.advice();
 setText('coachAdviceCount', list.length ? (list.length + ' kept') : '—');
 if (!list.length) {
 setHtml('coachAdvice', '<div class="coach-empty"><span class="coach-empty-ico">' + ICON.bloom + '</span>Nothing saved yet. Tap Save on a reply that helped.</div>');
 return;
 }
 setHtml('coachAdvice', list.map((a) =>
 '<div class="coach-advice-item">' +
 '<span class="coach-advice-ico">' + (a.tag || ICON.bloom) + '</span>' +
 '<span class="coach-advice-text">' + esc(a.text) + '</span>' +
 '<span class="coach-advice-actions">' +
 '<button class="coach-advice-btn" type="button" data-action="coach-advice-copy" data-id="' + a.id + '" aria-label="Copy">' + ico('copy') + '</button>' +
 '<button class="coach-advice-btn" type="button" data-action="coach-advice-remove" data-id="' + a.id + '" aria-label="Remove">×</button>' +
 '</span>' +
 '</div>').join(''));
 }

 function renderTopChip() {
 const mood = (state().checkIns[Utils.todayKey()] || {}).mood;
 const meta = moodMeta(mood);
 setText('coachTopChip', meta ? meta.label : 'Here with you');
 }

 function renderRail() {
 renderGlance();
 renderGoals();
 renderMood();
 renderPrefs();
 renderAdvice();
 renderTopChip();
 }

 return {
 state, QUICK, PREFS, PREF_KEYS, MOOD_NOTES,
 announce, setStatus, showTyping, autosize, scrollChatToEnd, applyTheme,
 renderChat, buildQuick, renderRail, renderGlance, renderGoals, renderMood, renderPrefs, renderAdvice, renderTopChip
 };
})();

/* ============================== CoachApp ==============================
 Everything that listens and acts: the composer, the buttons, the little
 screens and the moment the reply arrives. Coach owns how things look; this
 owns what they do.
 ====================================================================== */
const CoachApp = (() => {

 const state = () => Storage.get();

 /* --------------------------- sending & replying ------------------------ */
 function pushUser(text) {
 CoachMemory.push({ id: Utils.uid('msg'), role: 'user', text: text, at: nowIso(), tools: [] });
 Coach.renderChat();
 }

 function pushCoach(reply) {
 CoachMemory.push({ id: Utils.uid('msg'), role: 'coach', text: reply.text, at: nowIso(), tools: reply.tools || [] });
 Coach.renderChat();
 Coach.renderRail();
 Coach.announce(reply.text);
 if (reply.celebrate && CoachMemory.prefs().celebrate) CoachUI.burst(null, null, 10);
 }

 function send(text) {
 const value = String(text === null || text === undefined ? '' : text).trim();
 if (!value) return;
 pushUser(value);
 Coach.setStatus('Thinking…');
 Coach.showTyping(true);

 const settle = (reply) => {
 Coach.showTyping(false);
 Coach.setStatus('Here with you, always');
 pushCoach(reply);
 };

 // A real model, when one is configured — otherwise the on-device brain.
 // Either way the reply lands after the same gentle beat.
 if (CoachModel.available()) {
 const delay = 420 + Math.min(900, value.length * 14);
 const started = Date.now();
 CoachModel.reply(value, state()).then((modelReply) => {
 const wait = Math.max(0, delay - (Date.now() - started));
 window.setTimeout(() => settle(modelReply || brainReply(value, state())), wait);
 });
 return;
 }

 const reply = brainReply(value, state());
 const delay = 420 + Math.min(900, value.length * 14);
 window.setTimeout(() => settle(reply), delay);
 }

 function submitFromInput() {
 const input = $('coachInput');
 const value = input ? input.value : '';
 send(value);
 if (input) { input.value = ''; Coach.autosize(input); }
 }

 /* ------------------------------ welcome -------------------------------- */
 function greet() {
 const reply = CoachReplies.greeting(state());
 CoachMemory.push({ id: Utils.uid('msg'), role: 'coach', text: reply.text, at: nowIso(), tools: reply.tools || [] });
 CoachMemory.markGreeted();
 }

 function ensureGreeting() {
 if (!CoachMemory.messages().length) greet();
 }

 function newChat() {
 CoachMemory.reset();
 greet();
 Coach.renderChat();
 CoachUI.toast({ title: 'A fresh page', body: 'Let\'s begin again.', icon: ICON.fresh });
 }

 function clearChat() {
 if (!CoachMemory.messages().length) { CoachUI.toast('Nothing to clear yet, luv.'); return; }
 CoachUI.confirm({
 title: 'Clear this conversation?',
 sub: 'Your day, your goals and your saved advice stay exactly as they are.',
 confirmLabel: 'Clear it',
 confirmAction: 'coach-clear-yes'
 });
 }

 /* -------------------------------- goals -------------------------------- */
 function openGoalModal() {
 CoachUI.modal({
 title: 'A new goal',
 sub: 'Something you\'re quietly working towards.',
 bodyHtml:
 '<label class="field"><span class="field-label">What is it?</span>' +
 '<input class="input" id="goalName" type="text" placeholder="Finish my portfolio" /></label>' +
 '<label class="field"><span class="field-label">One line about it</span>' +
 '<input class="input" id="goalText" type="text" placeholder="Why it matters to you" /></label>' +
 '<label class="field"><span class="field-label">An emoji, if you like</span>' +
 '<input class="input" id="goalEmoji" type="text" maxlength="4" placeholder="Optional" /></label>',
 actions: [
 { label: 'Never mind', action: 'modal-cancel', variant: 'ghost' },
 { label: 'Add goal', action: 'coach-goal-save', variant: 'primary' }
 ]
 });
 }

 function saveGoal() {
 const nameEl = $('goalName');
 const name = nameEl && nameEl.value ? nameEl.value.trim() : '';
 if (!name) { CoachUI.toast('Give it a name first, luv.'); return; }
 const textEl = $('goalText');
 const emojiEl = $('goalEmoji');
 const goal = textEl && textEl.value ? textEl.value.trim() : '';
 const emoji = (emojiEl && emojiEl.value ? emojiEl.value.trim() : '');

 Storage.update((d) => {
 d.subjects.push({ id: Utils.uid('sub'), name: name, emoji: emoji, goal: goal, progress: 0,
 teacher: '', notes: '', schedule: [], createdAt: nowIso() });
 }, 'coach-goal');

 CoachUI.closeModal();
 Coach.renderGoals();
 CoachUI.toast({ title: 'Goal added', body: name, icon: ICON.growth });
 pushCoach({
 text: 'I love that. "' + name + '" is on your board now — we\'ll move it forward one calm step at a time.',
 tools: [{ label: ICON.guide + ' What should I do now?', action: 'coach-now', attrs: '', variant: 'soft' }]
 });
 }

 function removeGoal(id) {
 Storage.update((d) => { d.subjects = d.subjects.filter((s) => s.id !== id); }, 'coach-goal');
 Coach.renderGoals();
 }

 function stepGoal(id, delta) {
 Storage.update((d) => {
 const subject = d.subjects.filter((s) => s.id === id)[0];
 if (subject) subject.progress = Utils.clamp((Number(subject.progress) || 0) + delta, 0, 100);
 }, 'coach-goal');
 Coach.renderGoals();
 }

 /* -------------------------------- mood --------------------------------- */
 function pickMood(key) {
 Storage.update((d) => {
 const today = Utils.todayKey();
 d.checkIns[today] = Object.assign({}, d.checkIns[today] || {}, { mood: key });
 }, 'coach-mood');
 Coach.renderMood();
 Coach.renderTopChip();
 pushCoach(CoachBrain.moodReply(key, state()));
 }

 /* ------------------------------ routines ------------------------------- */
 function addRoutine(key) {
 let result = null;
 Storage.update((d) => { result = Scheduler.applyRoutine(d, key, Utils.todayKey(), Scheduler.nowMinutes()); }, 'coach-routine');
 Coach.renderRail();
 if (result && result.added.length) {
 CoachUI.toast({ title: result.routine.name, body: result.added.length + ' steps added to today', icon: ICON.spark });
 } else {
 CoachUI.toast('There wasn\'t room for that just now, luv.');
 }
 }

 /* ------------------------------- tasks --------------------------------- */
 function completeNow(id) {
 if (!id) return;
 Storage.update((d) => {
 const task = d.tasks.filter((t) => t.id === id)[0];
 if (task) { task.completed = !task.completed; task.completedAt = task.completed ? nowIso() : null; }
 }, 'coach-task');
 Coach.renderRail();
 CoachUI.burst(null, null, 8);
 CoachUI.toast({ title: 'Marked done', icon: ICON.done });
 }

 function undo() {
 if (Storage.undo()) {
 Coach.renderRail();
 CoachUI.toast({ title: 'Undone', icon: ICON.done });
 } else {
 CoachUI.toast('There\'s nothing to undo, luv.');
 }
 }

 /* ------------------------------- advice -------------------------------- */
 function saveAdviceFromMessage(index) {
 const message = CoachMemory.messages()[index];
 if (!message) return;
 const added = CoachMemory.addAdvice(message.text, ICON.spark);
 Coach.renderAdvice();
 CoachUI.toast({ title: added ? 'Saved to your advice' : 'Already saved', icon: ICON.bloom });
 }

 function copyAdvice(id) {
 const entry = CoachMemory.advice().filter((a) => a.id === id)[0];
 if (!entry) return;
 if (navigator.clipboard && navigator.clipboard.writeText) {
 navigator.clipboard.writeText(entry.text).then(
 () => CoachUI.toast({ title: 'Copied', icon: ICON.bloom }),
 () => CoachUI.toast('Couldn\'t copy just now.')
 );
 } else {
 CoachUI.toast('Copying isn\'t available here.');
 }
 }

 function scrollToAdvice() {
 const el = $('coachAdvice');
 if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
 }

 function focusComposer(placeholder) {
 const input = $('coachInput');
 if (!input) return;
 if (placeholder) input.placeholder = placeholder;
 input.focus();
 }

 /* ------------------------------ preferences ---------------------------- */
 function togglePref(key) {
 if (Coach.PREF_KEYS.indexOf(key) === -1) return;
 CoachMemory.togglePref(key);
 Coach.renderPrefs();
 }

 /* ------------------------------- actions ------------------------------- */
 function onAction(event) {
 const button = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
 if (!button) return;
 const action = button.getAttribute('data-action');

 switch (action) {
 case 'modal-cancel': CoachUI.closeModal(); break;
 case 'coach-clear-yes':
 CoachMemory.clearMessages();
 CoachUI.closeModal();
 Coach.renderChat();
 CoachUI.toast({ title: 'Fresh page', icon: ICON.fresh });
 break;
 case 'coach-quick': send(button.getAttribute('data-text') || ''); break;
 case 'coach-now': pushCoach(CoachBrain.nowReply(state())); break;
 case 'coach-optimize': pushCoach(CoachReplies.optimize(state())); break;
 case 'coach-lighten': pushCoach(CoachReplies.lighten(state())); break;
 case 'coach-add-activity': focusComposer('What do you need to do? Try "gym tomorrow 7am for 45m"'); break;
 case 'coach-routine': addRoutine(button.getAttribute('data-key')); break;
 case 'coach-goal-add': openGoalModal(); break;
 case 'coach-goal-save': saveGoal(); break;
 case 'coach-goal-remove': removeGoal(button.getAttribute('data-id')); break;
 case 'coach-goal-step': stepGoal(button.getAttribute('data-id'), Number(button.getAttribute('data-delta')) || 0); break;
 case 'coach-mood': pickMood(button.getAttribute('data-mood')); break;
 case 'coach-pref': togglePref(button.getAttribute('data-key')); break;
 case 'coach-save-advice': saveAdviceFromMessage(Number(button.getAttribute('data-index'))); break;
 case 'coach-advice-remove': CoachMemory.removeAdvice(button.getAttribute('data-id')); Coach.renderAdvice(); break;
 case 'coach-advice-copy': copyAdvice(button.getAttribute('data-id')); break;
 case 'coach-advice-focus': scrollToAdvice(); break;
 case 'coach-done-now': completeNow(button.getAttribute('data-id')); break;
 case 'undo': undo(); break;
 default: break;
 }
 }

 /* -------------------------------- wiring ------------------------------- */
 function wire() {
 const form = $('coachForm');
 if (form) form.addEventListener('submit', (event) => { event.preventDefault(); submitFromInput(); });

 const input = $('coachInput');
 if (input) {
 input.addEventListener('input', () => Coach.autosize(input));
 input.addEventListener('keydown', (event) => {
 if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitFromInput(); }
 });
 }

 const newBtn = $('coachNewChatBtn');
 if (newBtn) newBtn.addEventListener('click', newChat);
 const clearBtn = $('coachClearBtn');
 if (clearBtn) clearBtn.addEventListener('click', clearChat);
 const goalBtn = $('coachAddGoalBtn');
 if (goalBtn) goalBtn.addEventListener('click', openGoalModal);

 document.addEventListener('click', onAction);

 /* let the switch-style rows respond to the keyboard too */
 document.addEventListener('keydown', (event) => {
 if (event.key !== 'Enter' && event.key !== ' ') return;
 const el = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
 if (!el) return;
 const tag = el.tagName;
 if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
 event.preventDefault();
 el.click();
 });
 }

 /* ------------------------------- who answers ---------------------------
    Say plainly whether the on-device coach or a real model is replying, so
    nobody has to guess. Filled from js/coach-config.js. */
 function paintEngine() {
 const el = $('coachEngine');
 if (!el) return;
 const label = CoachModel.label();
 if (!label) return;
 el.textContent = label;
 el.setAttribute('data-engine', CoachModel.available() ? 'model' : 'local');
 }

 /* --------------------------------- init -------------------------------- */
 function init() {
 Coach.applyTheme();
 Coach.buildQuick();
 ensureGreeting();
 Coach.renderChat();
 Coach.renderRail();
 paintEngine();
 wire();
 if (Storage.subscribe) Storage.subscribe(() => Coach.renderRail());
 window.setInterval(() => Coach.renderGlance(), 30000);
 }

 return { init, send, pushCoach, onAction };
})();

/* Boot — the scripts are at the end of the page, so the DOM is ready. */
if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', CoachApp.init);
} else {
 CoachApp.init();
}
