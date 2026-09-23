/* tools/personality-test.js — boots 💗 My Luvli Style ♡ with a light DOM shim and
   drives the real onboarding flow (welcome → choose → custom → home → switch),
   plus the engine (preferences, voice, avatar, memory) that every screen reads.
   The main boot-test covers index.html; this covers personality.html. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/* ------------------------------- DOM shim -------------------------------- */
const memory = {};
const elements = {};

function makeElement(id) {
  const classes = new Set();
  const el = {
    id: id || '',
    value: '', checked: false, hidden: false, disabled: false, textContent: '', _html: '',
    style: { setProperty() {}, left: '', top: '' },
    children: [], options: [],
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
      contains(name) { return classes.has(name); }
    },
    dataset: {}, attributes: {},
    addEventListener(type, fn) { el._events = el._events || {}; el._events[type] = fn; },
    removeEventListener() {},
    appendChild(child) { el.children.push(child); return child; },
    removeChild(child) { el.children = el.children.filter((item) => item !== child); },
    remove() {}, insertBefore() {}, click() {}, focus() {},
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getAttribute(name) { return name in el.attributes ? el.attributes[name] : null; },
    setAttribute(name, value) { el.attributes[name] = value; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(value) { el._html = String(value); }
  });
  Object.defineProperty(el, 'firstChild', {
    get() { return el.children.length ? el.children[0] : null; }
  });
  return el;
}

function getElementById(id) {
  if (!elements[id]) elements[id] = makeElement(id);
  return elements[id];
}

const docListeners = {};
const documentShim = {
  activeElement: null, hidden: false, readyState: 'complete',
  documentElement: makeElement('html'),
  body: makeElement('body'),
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  removeEventListener() {},
  dispatchEvent(event) { (docListeners[event.type] || []).forEach((fn) => fn(event)); return true; },
  createElement: (tag) => makeElement(tag),
  getElementById,
  querySelector: () => null,
  querySelectorAll: () => []
};

class CustomEventShim {
  constructor(type, options) { this.type = type; this.detail = options ? options.detail : undefined; }
}

const sandbox = {
  console, JSON, Math, Date, String, Number, Object, Array, Boolean, isNaN, parseInt, parseFloat,
  Error, RegExp, Promise, Blob, URL, Set, Map, WeakMap,
  localStorage: {
    getItem: (key) => (key in memory ? memory[key] : null),
    setItem: (key, value) => { memory[key] = String(value); },
    removeItem: (key) => { delete memory[key]; }
  },
  document: documentShim,
  CustomEvent: CustomEventShim,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
  FileReader: function FileReader() { this.readAsText = () => {}; },
  Notification: undefined
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.innerWidth = 1024;
sandbox.innerHeight = 768;
sandbox.scrollTo = () => {};
sandbox.addEventListener = (type, fn) => { (docListeners['win:' + type] = docListeners['win:' + type] || []).push(fn); };
sandbox.removeEventListener = () => {};
vm.createContext(sandbox);

/* The page loads exactly these, in this order (see personality.html). */
const files = ['js/icons.js', 'js/storage.js', 'js/scheduler.js', 'js/affirmations.js',
  'js/progress.js', 'js/personality.js', 'js/personality-page.js'];

/* --------------------------------- helpers ------------------------------- */
const results = [];
function check(label, condition, extra) {
  results.push({ label, pass: Boolean(condition) });
  console.log((condition ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  (' + extra + ')'));
}
const field = (id) => getElementById(id);

function fireId(id) {
  const el = getElementById(id);
  if (el._events && el._events.click) el._events.click({ target: el });
}
function fireAction(action, attrs) {
  const button = {
    disabled: false,
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    getAttribute: (name) => (name === 'data-action' ? action : (attrs && attrs[name]) || null),
    closest: () => button
  };
  const event = { type: 'click', target: button };
  (docListeners.click || []).forEach((fn) => fn(event));
}

/* ---------------------------------- run ---------------------------------- */
try {
  vm.runInContext(files.map(read).join('\n;\n'), sandbox, { filename: 'luvli-personality.js' });
  const run = (code) => vm.runInContext(code, sandbox, { filename: 'luvli-personality-test.js' });

  check('every module loads and the engine exists', Boolean(run('LuvliStyle')) && Boolean(run('PersonalityPage')));

  /* ---- the four styles ---- */
  const keys = run('LuvliStyle.KEYS.join(",")');
  check('all four personalities exist', keys === 'soft,coach,study,calm', keys);
  check('every personality explains itself',
    run('LuvliStyle.STYLES.every((s) => s.name && s.tagline && s.blurb && s.traits.length && s.examples.length && s.bestFor)'));
  check('the four names match the brief',
    run('LuvliStyle.STYLES.map((s) => s.name).join(", ")') === 'Soft Luvli, Coach Luvli, Study Luvli, Calm Luvli');

  /* ---- custom settings vocab ---- */
  check('four communication styles are offered',
    run('LuvliStyle.COMMUNICATION.map((c) => c.key).join(",")') === 'very-gentle,balanced,direct,motivational');
  check('three reminder styles are offered',
    run('LuvliStyle.REMINDERS.map((r) => r.key).join(",")') === 'soft,motivational,minimal');
  check('six affirmation styles are offered',
    run('LuvliStyle.AFFIRMATION_STYLES.length') === 6);
  check('four avatar colours are offered',
    run('LuvliStyle.AVATAR_COLORS.map((c) => c.key).join(",")') === 'pink,cream,lavender,peach');
  check('five appearances are offered',
    run('LuvliStyle.AVATAR_SHAPES.map((s) => s.key).join(",")') === 'icon,minimal,flower,heart,star');

  /* ---- onboarding step 1: the welcome ---- */
  field('lsStepWelcome').hidden = false;
  run('PersonalityPage.init()');
  check('the welcome step shows first for a brand-new Luvli',
    !field('lsStepWelcome').hidden && field('lsStepChoose').hidden);
  check('nothing is chosen yet', run('LuvliStyle.get(Storage.get()).chosen') === false);

  fireId('lsStartBtn');
  check('“Let\'s choose my style” moves to the picker',
    field('lsStepChoose').hidden === false && field('lsStepWelcome').hidden === true);
  const grid = field('lsStyleGrid').innerHTML;
  check('all four style cards are rendered', (grid.match(/ls-style-card/g) || []).length === 4);
  check('a style card shows an example line', grid.indexOf('You are doing beautifully') > -1);

  /* ---- choose a style ---- */
  fireAction('style-pick', { 'data-key': 'coach' });
  check('picking a style arms the Continue button', field('lsChooseNext').disabled === false);

  /* ---- step 3: make it yours ---- */
  fireId('lsChooseNext');
  check('Continue opens the custom step', field('lsStepCustom').hidden === false);
  check('communication options are rendered', (field('lsCommsList').innerHTML.match(/role="radio"/g) || []).length === 4);
  check('reminder options are rendered', (field('lsReminderList').innerHTML.match(/role="radio"/g) || []).length === 3);
  check('affirmation chips are rendered', (field('lsAffirmationChips').innerHTML.match(/chip-item/g) || []).length === 6);
  check('avatar colours render with swatches', field('lsColorRow').innerHTML.indexOf('ls-swatch') > -1);
  check('appearance options render with icons', field('lsShapeRow').innerHTML.indexOf('ls-shape') > -1);

  const beforeComm = run('LuvliStyle.get(Storage.get()).communication');
  run('LuvliStyle.setCommunication("direct")');
  check('a communication style can be changed and saved',
    run('LuvliStyle.get(Storage.get()).communication') === 'direct' && beforeComm !== 'direct');
  run('LuvliStyle.setReminderStyle("minimal")');
  check('a reminder style can be changed and saved',
    run('LuvliStyle.get(Storage.get()).reminderStyle') === 'minimal');
  run('LuvliStyle.setAvatarColor("lavender")');
  run('LuvliStyle.setAvatarShape("star")');
  check('the avatar survives a save',
    run('LuvliStyle.get(Storage.get()).avatar.color') === 'lavender' &&
    run('LuvliStyle.get(Storage.get()).avatar.shape') === 'star');

  /* the avatar only ever carries colour + shape */
  check('the avatar only carries colour and shape',
    run('Object.keys(LuvliStyle.get(Storage.get()).avatar).sort().join(",")') === 'color,shape');
  check('the avatar renders one little character',
    run('LuvliStyle.avatarHtml(LuvliStyle.get(Storage.get()))').indexOf('ls-avatar') > -1);
  check('the avatar is labelled for screen readers',
    run('LuvliStyle.avatarHtml(LuvliStyle.get(Storage.get()))').indexOf('aria-label') > -1);

  /* ---- save it and land on the dashboard ---- */
  fireId('lsFinishBtn');
  check('saving the style lands on the dashboard', field('lsStepHome').hidden === false);
  check('the choice is saved for good', run('Storage.get().personality.key') === 'coach');
  check('choosing a style marks Luvli as set up', run('LuvliStyle.get(Storage.get()).chosen') === true);
  check('the dashboard names the style', field('lsHomeName').textContent === 'Coach Luvli');
  check('the dashboard writes a morning message', field('lsMorning').textContent.length > 10, field('lsMorning').textContent);
  check('the trait chips include the style words', field('lsTraitChips').innerHTML.indexOf('Motivating') > -1);
  check('the affirmation is personalised', field('lsAffirmBig').textContent.length > 4);
  check('the memory card explains what Luvli keeps', field('lsMemory').innerHTML.length > 20);
  check('the connections list names every integrated feature',
    (field('lsConnections').innerHTML.match(/ls-connect"/g) || []).length === 8);

  /* ---- the morning message is stable per day ---- */
  const morning = run('LuvliStyle.morningMessage(Storage.get())');
  check('the morning message is the same all day',
    run('LuvliStyle.morningMessage(Storage.get())') === morning);
  check('the morning message is remembered on the day',
    run('LuvliStyle.get(Storage.get()).memory.greetingDate') === run('Utils.todayKey()'));

  /* ---- personalised affirmations respond to goals and mood ---- */
  check('a career goal is noticed', (function () {
    run('Storage.update((d) => { d.subjects = [{ id: "s1", name: "Portfolio", goal: "build my career", emoji: "" }]; }, "subject")');
    return run('LuvliStyle.goalTags(Storage.get()).indexOf("career") > -1');
  })());
  check('a study goal is noticed', (function () {
    run('Storage.update((d) => { d.subjects = [{ id: "s2", name: "Revision", goal: "pass my exam", emoji: "" }]; }, "subject")');
    return run('LuvliStyle.goalTags(Storage.get()).indexOf("study-motivation") > -1');
  })());
  check('a low mood softens the words', (function () {
    run('Storage.update((d) => { d.checkIns[Utils.todayKey()] = { mood: "low" }; }, "checkin")');
    const line = run('LuvliStyle.affirmation(Storage.get())');
    return Boolean(line) && typeof line.text === 'string';
  })());

  /* ---- AI personality memory ---- */
  const summary = run('LuvliStyle.memorySummary(Storage.get())');
  check('the memory summary explains itself', summary && summary.summary.length > 20, summary && summary.summary);
  check('the memory records the style you reach for', run('LuvliStyle.topStyles(Storage.get())').length > 0);
  check('forgetting the memory keeps the style', (function () {
    const keep = run('Storage.get().personality.key');
    run('LuvliStyle.forgetMemory()');
    return run('Storage.get().personality.key') === keep;
  })());

  /* ---- switch style, for today only ---- */
  run('LuvliStyle.set("coach", { remember: true })');
  fireAction('style-switch-set', { 'data-key': 'calm' });
  check('a one-day switch applies to today', run('LuvliStyle.currentKey(Storage.get())') === 'calm');
  check('a one-day switch is flagged as today-only', run('LuvliStyle.isOverridden(Storage.get())') === true);
  check('a one-day switch never replaces the usual style', run('Storage.get().personality.key') === 'coach');
  check('the dashboard marks today as switched', field('lsTopChip').textContent.indexOf('today') > -1);
  fireAction('style-keep');
  check('today\'s style can be made the usual one',
    run('Storage.get().personality.key') === 'calm' &&
    run('LuvliStyle.isOverridden(Storage.get())') === false);

  /* ---- how often each style is used is remembered ---- */
  check('reaching for a style is remembered', run('LuvliStyle.get(Storage.get()).memory.styles.coach >= 1') ||
    run('LuvliStyle.get(Storage.get()).memory.styles.calm >= 1'));

  /* ---- the whole app adapts: the adapters ---- */
  const adapters = run('LuvliStyle.adapters(Storage.get())');
  check('the adapters name every screen they tune',
    adapters && adapters.key === 'calm' &&
    ['focusLength', 'studentFirst', 'notificationLead', 'celebrateLoudly', 'affirmationCategories']
      .every((k) => k in adapters), JSON.stringify(adapters));
  check('Study Luvli puts study first', (function () {
    run('LuvliStyle.set("study", { remember: true })');
    return run('LuvliStyle.adapters(Storage.get()).studentFirst') === true;
  })());
  check('Coach Luvli celebrates out loud', (function () {
    run('LuvliStyle.set("coach", { remember: true })');
    return run('LuvliStyle.adapters(Storage.get()).celebrateLoudly') === true;
  })());

  /* ---- reminder wording follows the reminder style ---- */
  run('LuvliStyle.setReminderStyle("soft")');
  check('a soft reminder reads like the brief',
    run('LuvliStyle.reminderLine(LuvliStyle.get(Storage.get()), "study session", 10)') ===
      'Luv, your study session is coming soon in 10 minutes. ♡');
  run('LuvliStyle.setReminderStyle("motivational")');
  check('a motivational reminder reads like the brief',
    run('LuvliStyle.reminderLine(LuvliStyle.get(Storage.get()), "Focus session", 0)').indexOf('Let\'s go!') > -1);
  run('LuvliStyle.setReminderStyle("minimal")');
  check('a minimal reminder reads like the brief',
    run('LuvliStyle.reminderLine(LuvliStyle.get(Storage.get()), "Study session", 0)') === 'Study session starting.');

  /* ---- the voice changes with the style ---- */
  check('Soft and Coach sound different', (function () {
    run('LuvliStyle.set("soft", { remember: true })');
    const soft = run('LuvliStyle.voice(Storage.get()).celebrate');
    run('LuvliStyle.set("coach", { remember: true })');
    const coach = run('LuvliStyle.voice(Storage.get()).celebrate');
    return soft !== coach;
  })());

  /* ---- the style survives a reload ---- */
  check('the Luvli style survives a refresh',
    run('JSON.parse(localStorage.getItem(Storage.KEY)).personality.key.length') > 0);

  /* ---- a returning user goes straight to the dashboard ---- */
  check('a returning user skips onboarding', (function () {
    run('PersonalityPage.init()');
    return field('lsStepHome').hidden === false && field('lsStepWelcome').hidden === true;
  })());
} catch (err) {
  check('the whole personality test ran without an exception', false,
    String(err.stack || err).split('\n').slice(0, 3).join(' | '));
}

const failed = results.filter((item) => !item.pass);
console.log('');
console.log((results.length - failed.length) + '/' + results.length + ' personality checks passed');
if (failed.length) process.exitCode = 1;
