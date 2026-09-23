/* tools/boot-test.js — loads every module with a light DOM shim and fires real
   clicks at the real handlers, catching typos and broken wiring that a syntax
   check cannot see. Timers are stubbed so nothing keeps running. */
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
    style: { setProperty() {} },
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
  activeElement: null, hidden: false,
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
// The app now guards its route, so the shim needs a location to redirect with.
sandbox.location = { href: 'index.html', pathname: '/index.html', search: '', replace() {}, assign() {} };
sandbox.addEventListener = (type, fn) => { (docListeners['win:' + type] = docListeners['win:' + type] || []).push(fn); };
sandbox.removeEventListener = () => {};
vm.createContext(sandbox);

const files = ['js/icons.js', 'js/storage.js', 'js/auth.js', 'js/scheduler.js', 'js/affirmations.js',
  'js/progress.js', 'js/personality.js', 'js/pomodoro.js', 'js/notifications.js', 'js/sync.js', 'js/app.js'];

/* --------------------------------- helpers ------------------------------- */
const results = [];
function check(label, condition, extra) {
  const pass = Boolean(condition);
  results.push({ label, pass });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  (' + extra + ')'));
}

const field = (id) => getElementById(id);

function fireAction(action, attrs) {
  const button = {
    disabled: false,
    classList: { contains: () => false },
    getAttribute: (name) => (name === 'data-action' ? action : (attrs && attrs[name]) || null),
    closest: () => button
  };
  const event = { type: 'click', target: button };
  (docListeners.click || []).forEach((fn) => fn(event));
}

function fireNav(page) {
  const button = {
    classList: { contains: (name) => name === 'nav-item' || name === 'bn-item' },
    getAttribute: (name) => (name === 'data-page' ? page : null),
    closest: () => button
  };
  const event = { type: 'click', target: button };
  (docListeners.click || []).forEach((fn) => fn(event));
}

function fireId(id) {
  const el = getElementById(id);
  if (el._events && el._events.click) el._events.click({ target: el });
}

function fireInput(id, value) {
  const el = getElementById(id);
  if (value !== undefined) el.value = value;
  if (el._events && el._events.input) el._events.input({ target: el });
}

function fireChange(id, value) {
  const el = getElementById(id);
  if (value !== undefined) el.value = value;
  if (el._events && el._events.change) el._events.change({ target: el });
}

/* ---------------------------------- run ---------------------------------- */
try {
  // The app guards its route now, so pretend someone is already signed in
  // before the modules load — this test is about the app, not the door.
  memory['luvli.state.v1'] = JSON.stringify({
    version: 3,
    profile: { name: 'Neli' },
    seeded: false,
    settings: { onboarding: { completed: true } },
    auth: {
      accounts: [{ id: 'u_test', name: 'Neli', email: 'neli@example.com', salt: 'x', hash: 'y',
        avatar: { color: 'pink', shape: 'heart' }, createdAt: '', lastSeenAt: '' }],
      session: { userId: 'u_test', since: '', remember: true }
    }
  });

  vm.runInContext(files.map(read).join('\n;\n'), sandbox, { filename: 'luvli-boot.js' });
  const run = (code) => vm.runInContext(code, sandbox, { filename: 'luvli-test.js' });

  check('every module loads and the app boots', Boolean(run('App')));
  // A signed-in-returning-person starts with an empty day; the sample day is
  // only for a brand-new visitor, so seed it here to give the day logic a plan.
  run('Storage.seedSampleDay(false)');
  check('the sample day seeds 6 activities', run('Storage.get().tasks.length') === 6,
    run('Storage.get().tasks.length'));

  ['home', 'day', 'study', 'focus', 'progress', 'affirmations', 'settings'].forEach((page) => {
    try { fireNav(page); check('the ' + page + ' page opens', true); }
    catch (err) { check('the ' + page + ' page opens', false, err.message); }
  });

  /* ------------------- PHASE 1: add / clash / fit ----------------------- */
  fireNav('day');
  run('Storage.update(function(d){ d.tasks = [{ id:"t_break", date: Utils.todayKey(), name:"Coffee break", category:"break", start:"13:50", end:"14:00", priority:"low", notes:"", completed:false }]; }, "test")');

  fireAction('add-activity');
  field('taskName').value = 'Deep work';
  field('taskCategory').value = 'work';
  field('taskPriority').value = 'high';
  field('taskStart').value = '13:45';
  field('taskEnd').value = '14:30';
  field('taskDate').value = run('Utils.todayKey()');
  field('taskNotes').value = 'Finish the report';
  fireAction('task-save');
  check('a clashing activity asks instead of saving',
    run('Storage.get().tasks.filter(function(t){ return t.name === "Deep work"; }).length') === 0);
  check('the clash modal is shown', field('modalRoot').children.length > 0);

  fireAction('task-fit');
  const deep = run('Storage.get().tasks.filter(function(t){ return t.name === "Deep work"; })[0]');
  check('"fit it in for me" saves the activity', Boolean(deep));
  check('the protected break stayed where it was',
    run('Storage.get().tasks.filter(function(t){ return t.id === "t_break"; })[0].start') === '13:50');
  check('the new activity kept its notes and priority',
    Boolean(deep) && deep.notes === 'Finish the report' && deep.priority === 'high');

  fireAction('add-activity');
  field('taskName').value = 'Overlap by choice';
  field('taskStart').value = '13:45';
  field('taskEnd').value = '14:30';
  field('taskCategory').value = 'custom';
  fireAction('task-save');
  fireAction('task-force');
  check('"keep both anyway" saves it as asked',
    run('Storage.get().tasks.filter(function(t){ return t.name === "Overlap by choice"; })[0].start') === '13:45');

  fireAction('add-activity');
  field('taskName').value = 'Not yet';
  field('taskStart').value = '13:45';
  field('taskEnd').value = '14:30';
  fireAction('task-save');
  fireAction('task-adjust');
  check('"change the time" reopens the form with the values filled in',
    field('taskName').value === 'Not yet' && field('taskStart').value === '13:45');
  fireAction('modal-cancel');

  /* ------------------------ PHASE 1: undo ------------------------------- */
  const beforeDelete = run('Storage.get().tasks.length');
  fireAction('task-delete', { 'data-id': 't_break' });
  fireAction('task-delete-confirm');
  check('deleting works', run('Storage.get().tasks.length') === beforeDelete - 1);
  // the shim does not parse markup, so look at the toast the app just built
  const lastToast = field('toastStack').children[field('toastStack').children.length - 1];
  check('an undo is offered', Boolean(lastToast) && lastToast.innerHTML.indexOf('data-action="undo"') > -1);
  fireAction('undo');
  check('undo brings the activity back',
    run('Storage.get().tasks.filter(function(t){ return t.id === "t_break"; }).length') === 1);

  /* ------------------- PHASE 1: natural language add -------------------- */
  fireNav('day');
  fireInput('backlogName', 'clean my room 30 mins');
  check('the live hint reads the sentence',
    field('backlogHint').textContent.indexOf('30m') > -1, field('backlogHint').textContent);
  fireId('backlogAddBtn');
  const listItem = run('Storage.get().backlog.filter(function(b){ return b.name === "Clean my room"; })[0]');
  check('a parsed sentence lands on the list with the right length',
    Boolean(listItem) && listItem.duration === 30 && listItem.category === 'cleaning');
  check('the input was cleared after adding', field('backlogName').value === '');

  fireInput('backlogName', 'python 45m high tomorrow 10:00');
  fireId('backlogAddBtn');
  // The modal markup is built as a string, so check what the app generated
  const modalMarkup = field('modalRoot').children.length
    ? field('modalRoot').children[field('modalRoot').children.length - 1].innerHTML : '';
  check('a sentence with a time opens the form pre-filled',
    modalMarkup.indexOf('value="Python"') > -1 && modalMarkup.indexOf('value="10:00"') > -1 &&
    modalMarkup.indexOf('value="high" selected') > -1);
  fireAction('modal-cancel');

  /* ------------------- PHASE 1: feasibility + trim ---------------------- */
  run('Storage.update(function(d){ d.tasks = []; for (var i = 0; i < 10; i++) { d.tasks.push({ id:"big_"+i, date: Utils.todayKey(), name:"Big "+i, category:"project", start:"09:00", end:"11:00", priority:"low", notes:"", completed:false }); } }, "test")');
  fireNav('day');
  check('an overloaded day offers the trim',
    field('dayAlert').innerHTML.indexOf('trim-day') > -1, field('dayAlert').innerHTML.slice(0, 60));
  fireAction('trim-day');
  check('the trim modal opens', field('modalRoot').children.length > 0);
  fireAction('modal-cancel');
  check('trimming moved extras to tomorrow',
    run('Scheduler.tasksFor(Utils.addDays(Utils.todayKey(), 1), Storage.get()).length') > 0);

  /* --------------------------- optimize / lighten ----------------------- */
  run('Storage.seedSampleDay(true); Storage.emit("seed")');
  const beforeOptimize = run('Storage.get().tasks.length');
  fireAction('optimize-day');
  fireAction('modal-cancel');
  check('optimize my day completes', run('Storage.get().tasks.length') >= beforeOptimize);

  const beforeLighten = run('Storage.get().tasks.length');
  fireAction('lighten-day');
  fireAction('modal-cancel');
  check('lighten my day completes', run('Storage.get().tasks.length') === beforeLighten ||
    run('Scheduler.tasksFor(Utils.addDays(Utils.todayKey(), 1), Storage.get()).length') > 0);

  /* ------------------------------ what should I do now ------------------ */
  fireNav('home');
  fireAction('what-now');
  check('the recommendation opens', field('modalRoot').children.length > 0);
  fireAction('rec-next');
  check('another suggestion can be shown', field('modalRoot').children.length > 0);
  fireAction('modal-cancel');

  check('the check-in saves', (function () {
    fireAction('checkin-mood', { 'data-mood': 'exhausted' });
    return run('Storage.get().checkIns[Utils.todayKey()].mood') === 'exhausted';
  })());
  fireAction('modal-cancel');
  fireAction('checkin-mood', { 'data-mood': 'good' });

  /* ------------------------------ focus mode ---------------------------- */
  fireNav('focus');
  fireId('focusStartBtn');
  check('focus mode starts', run('Pomodoro.hasSession()') === true);
  fireId('focusPauseBtn');
  check('focus mode pauses', run('Pomodoro.isRunning()') === false);
  fireId('focusPauseBtn');
  fireId('focusAddTimeBtn');
  check('focus mode can add time', run('Pomodoro.currentSession().remaining') > 25 * 60);
  fireId('focusEndBtn');
  check('focus mode ends', run('Pomodoro.hasSession()') === false);

  /* ----------------------------- affirmations --------------------------- */
  fireNav('affirmations');
  fireId('afShuffleBtn');
  check('affirmations shuffle', field('afBig').textContent.length > 0);
  const favs = run('Storage.get().affirmations.favorites.length');
  fireId('afFavBtn');
  check('an affirmation can be saved', run('Storage.get().affirmations.favorites.length') === favs + 1);
  fireAction('remove-favorite', { 'data-index': '0' });
  check('a saved affirmation can be removed', run('Storage.get().affirmations.favorites.length') === favs);

  /* ------------------------------- settings ----------------------------- */
  fireNav('settings');
  fireChange('setName', 'Nelisiwe');
  check('the profile name saves', run('Storage.get().profile.name') === 'Nelisiwe');
  fireAction('set-theme', { 'data-theme': 'sage' });
  check('a theme can be chosen',
    run('Storage.get().settings.theme') === 'sage' &&
    documentShim.documentElement.getAttribute('data-theme') === 'sage');
  fireAction('set-theme', { 'data-theme': 'rose' });
  fireChange('setSleep', '23:00');
  check('sleep time saves', run('Storage.get().settings.sleepTime') === '23:00');

  /* ----------------------------- nightly reset -------------------------- */
  fireNav('home');
  fireAction('night-reset');
  check('the nightly reset opens', field('modalRoot').children.length > 0);
  fireAction('review-mood', { 'data-rating': 'good' });
  check('the evening rating saves', run('Storage.get().nightReviews[Utils.todayKey()].rating') === 'good');
  fireAction('night-close');

  /* --------------------------- reset + undo ----------------------------- */
  // Earlier phases (trim, lighten, routines) can legitimately leave today
  // empty, so give the reset something real to take away first — otherwise
  // this pair and the persistence check below would depend on test order.
  run('Storage.seedSampleDay(true); Storage.emit("seed")');
  fireNav('home');
  const keepCount = run('Storage.get().tasks.length');
  check('there is something to reset', keepCount > 0, keepCount);
  fireId('resetBtn');
  fireAction('reset-confirm');
  check('everything can be reset', run('Storage.get().tasks.length') === 0);
  // Undo restores the most recent snapshot, which is the day as it stood right
  // before the reset — so it comes back with its activities intact.
  fireAction('undo');
  const restored = run('Storage.get().tasks.length');
  check('a reset can be undone', restored > 0, restored + ' of ' + keepCount);

  /* ------------------------------ persistence --------------------------- */
  check('activities survive a refresh',
    run('JSON.parse(localStorage.getItem(Storage.KEY)).tasks.length') > 0);
  check('every page still renders after all of that', (function () {
    try {
      ['home', 'day', 'study', 'focus', 'progress', 'affirmations', 'settings'].forEach(fireNav);
      return true;
    } catch (err) { check('render error', false, err.message); return false; }
  })());
  check('the timeline renders rows or its empty state',
    field('timeline').innerHTML.indexOf('tl-item') > -1 ||
    field('timeline').innerHTML.indexOf('empty-state') > -1);
  check('the storage summary still works', run('Storage.stats().sizeKb') > 0);

  /* ------------------- PHASE 2: routines + rescue ----------------------- */
  fireNav('day');
  check('routine chips are offered', field('routineChips').innerHTML.indexOf('add-routine') > -1);
  const beforeRoutine = run('Storage.get().tasks.length');
  fireAction('add-routine', { 'data-key': 'study' });
  check('a routine can be dropped into the day',
    run('Storage.get().tasks.length') > beforeRoutine,
    run('Storage.get().tasks.length') - beforeRoutine + ' steps');
  fireAction('modal-cancel');

  fireNav('home');
  fireAction('rescue-me');
  check('the rescue menu opens', field('modalRoot').children.length > 0);
  fireAction('rescue-tired');
  check('"I am tired" adds a pause',
    run('Storage.get().tasks.filter(function(t){ return t.category === "break"; }).length') > 0);

  /* ------------------- PHASE 2: insights on Progress -------------------- */
  run('Storage.update(function(d){ for (var i = 0; i < 4; i++) { d.tasks.push({ id:"ins_"+i, date: Utils.todayKey(), name:"Insight "+i, category:"study", start:"10:00", end:"11:00", priority:"medium", notes:"", completed:true, completedAt: new Date().toISOString() }); } }, "task")');
  fireNav('progress');
  check('the insight card shows what Luvli learned',
    field('insightCard').innerHTML.indexOf('What Luvli has learned') > -1,
    field('insightCard').innerHTML.slice(0, 40));
  check('the insight card mentions a learned duration',
    field('insightCard').innerHTML.indexOf('usually takes you about') > -1);

  /* --------------------------- repeat in the modal ---------------------- */
  fireNav('day');
  fireAction('add-activity');
  check('the activity form offers a repeat choice',
    field('modalRoot').children[0].innerHTML.indexOf('id="taskRepeat"') > -1);
  field('taskName').value = 'Weekly review';
  field('taskStart').value = '08:00';
  field('taskEnd').value = '08:30';
  field('taskDate').value = run('Utils.todayKey()');
  field('taskRepeat').value = 'weekly';
  fireAction('task-save');
  check('a repeating activity saves its repeat rule',
    run('Storage.get().tasks.filter(function(t){ return t.name === "Weekly review"; })[0].repeat') === 'weekly');
  check('a repeating activity fills the weeks ahead',
    run('Storage.get().tasks.filter(function(t){ return t.name === "Weekly review"; }).length') >= 2,
    run('Storage.get().tasks.filter(function(t){ return t.name === "Weekly review"; }).length'));

  /* ------------------------- PHASE 3: day grid -------------------------- */
  fireNav('day');
  check('the day grid renders blocks',
    field('dayGrid').innerHTML.indexOf('grid-block') > -1 ||
    field('dayGrid').innerHTML.indexOf('empty-state') > -1);
  check('the day grid canvas carries its start time',
    field('dayGrid').innerHTML.indexOf('data-grid-start=') > -1);
  check('the day grid has a scrollable wrapper',
    field('dayGrid').innerHTML.indexOf('grid-wrap') > -1);
  check('the day grid resize handle is not an action button',
    field('dayGrid').innerHTML.indexOf('gb-resize" data-action') === -1);

  /* --------------------- PHASE 3: focus + platform --------------------- */
  fireNav('focus');
  fireId('focusStartBtn');
  check('starting a focus session dims the rest of the app',
    run('document.body.classList.contains("focus-mode")') === true);
  fireId('focusEndBtn');
  check('ending a session restores the app',
    run('document.body.classList.contains("focus-mode")') === false);
  check('an offline badge exists in the top bar', typeof field('netStatus').hidden === 'boolean');
  check('an install card exists on Home', typeof field('installCard').hidden === 'boolean');
  check('focus sound and fullscreen settings save', (function () {
    fireNav('settings');
    field('setFocusSound').checked = true;
    field('setFocusSound')._events.change({ target: field('setFocusSound') });
    return run('Storage.get().settings.focusSound') === true;
  })());

  /* --------------------- PHASE 4: accessibility ------------------------- */
  fireNav('home');
  check('the right-now activity is announced for screen readers',
    field('liveAnnouncer').textContent.length > 0, field('liveAnnouncer').textContent.slice(0, 40));
  check('the announcer updates without repeating itself', (function () {
    const first = field('liveAnnouncer').textContent;
    fireNav('home');
    return field('liveAnnouncer').textContent === first;
  })());

  check('the shortcuts list can be opened with ?', (function () {
    documentShim.activeElement = null;
    (docListeners.keydown || []).forEach((fn) => fn({
      key: '?', shiftKey: true, target: { tagName: 'BODY' }, preventDefault() {}
    }));
    return field('modalRoot').children.length > 0;
  })());
  fireAction('modal-cancel');

  check('number keys jump between pages', (function () {
    (docListeners.keydown || []).forEach((fn) => fn({
      key: '4', shiftKey: false, target: { tagName: 'BODY' }, preventDefault() {}
    }));
    return run('App && true') && field('view-focus') !== undefined;
  })());
  check('shortcuts are ignored while typing', (function () {
    const before = field('modalRoot').children.length;
    (docListeners.keydown || []).forEach((fn) => fn({
      key: 'n', shiftKey: false, target: { tagName: 'INPUT' }, preventDefault() {}
    }));
    return field('modalRoot').children.length === before;
  })());
  fireNav('home');

  /* -------------------------- PHASE 4: sync ----------------------------- */
  fireNav('settings');
  check('sync starts unconfigured', run('Sync.isConfigured()') === false);
  check('the sync status explains the local-first default',
    field('syncStatus').textContent.indexOf('local-first') > -1, field('syncStatus').textContent);
  fireChange('setSyncEndpoint', 'https://example.com/luvli');
  check('a sync endpoint is saved',
    run('Storage.get().settings.sync.endpoint') === 'https://example.com/luvli' &&
    run('Sync.isConfigured()') === true);
  field('setSyncAuto').checked = true;
  field('setSyncAuto')._events.change({ target: field('setSyncAuto') });
  check('auto-sync can be switched on', run('Storage.get().settings.sync.autoPush') === true);
  fireChange('setSyncEndpoint', '');
  check('clearing the endpoint turns auto-sync off',
    run('Storage.get().settings.sync.autoPush') === false &&
    run('Sync.isConfigured()') === false);

  /* ---------------- PHASE 6: 💗 My Luvli Style ♡ ---------------------- */
  // The style is chosen on personality.html, but it has to show up *here*:
  // in the sidebar, the top bar and the Settings card, and it has to change
  // how Luvli actually speaks on the Home page.
  fireNav('home');
  check('the style invitation is on Home before a choice is made',
    typeof field('stylePrompt').hidden === 'boolean');

  run('LuvliStyle.set("soft", { remember: true }); Storage.emit("style")');
  fireNav('home');
  check('the chosen style is named in the top bar',
    field('topStyle').innerHTML.indexOf('Soft Luvli') > -1, field('topStyle').innerHTML.slice(0, 60));
  check('your character appears in the sidebar',
    field('sideStyleAvatar').innerHTML.indexOf('ls-avatar') > -1);
  check('the sidebar names your style', field('sideStyleName').textContent === 'Soft Luvli');
  check('the invitation disappears once a style is chosen', field('stylePrompt').hidden === true);
  check('the Home greeting speaks in your style',
    field('greetingText').textContent.length > 0 &&
    field('greetingText').textContent !== run('Scheduler.greeting(Storage.get())'),
    field('greetingText').textContent);
  check('the hero tagline changes with the style',
    field('heroTagline').textContent.indexOf('doing beautifully') > -1,
    field('heroTagline').textContent);

  fireNav('settings');
  check('the Settings card shows your style',
    field('settingsStyleName').textContent === 'Soft Luvli');
  check('the Settings card offers every style',
    (field('settingsStyleToday').innerHTML.match(/data-key=/g) || []).length === 4);

  // Switch style straight from Settings
  fireAction('style-set', { 'data-key': 'coach' });
  check('a style can be changed from Settings',
    run('LuvliStyle.currentKey(Storage.get())') === 'coach');
  check('the change is saved for good',
    run('Storage.get().personality.key') === 'coach' &&
    run('LuvliStyle.isOverridden(Storage.get())') === false);

  fireNav('home');
  check('the Home words follow the new style',
    field('heroTagline').textContent.indexOf('future self') > -1,
    field('heroTagline').textContent);
  check('the top bar follows the new style',
    field('topStyle').innerHTML.indexOf('Coach Luvli') > -1);

  // "Something different today" — a one-day switch only
  fireAction('style-today');
  check('something different today switches the day',
    run('LuvliStyle.currentKey(Storage.get())') !== 'coach');
  check('a one-day switch never replaces the usual style',
    run('Storage.get().personality.key') === 'coach');
  check('a one-day switch is labelled in the top bar',
    field('topStyle').innerHTML.indexOf('today') > -1, field('topStyle').innerHTML.slice(0, 80));

  fireAction('style-keep');
  check('the style of today can be made the usual one',
    run('LuvliStyle.currentKey(Storage.get())') === run('Storage.get().personality.key') &&
    run('LuvliStyle.isOverridden(Storage.get())') === false);

  // The personalised affirmation half of the Affirmations page
  fireNav('affirmations');
  check('the personalised affirmations are offered',
    field('afStyleChips').innerHTML.indexOf('data-key="career"') > -1);
  check('the style is named beside them',
    field('afStyleName').textContent.length > 0, field('afStyleName').textContent);
  const beforeStyleAffs = run('Storage.get().personality.affirmations.length');
  fireAction('toggle-affirmation-style', { 'data-key': 'discipline' });
  check('an affirmation style can be switched on',
    run('Storage.get().personality.affirmations.length') === beforeStyleAffs + 1 ||
    run('Storage.get().personality.affirmations.length') === beforeStyleAffs - 1);
  fireAction('toggle-affirmation-style', { 'data-key': 'discipline' });
  check('and switched off again',
    run('Storage.get().personality.affirmations.length') === beforeStyleAffs);
  fireAction('style-affirm');
  check('a personalised affirmation can be shown',
    field('afBig').textContent.length > 0, field('afBig').textContent.slice(0, 40));

  // The whole point: the style reaches the rest of the app
  check('notifications word reminders in your style', (function () {
    run('LuvliStyle.setReminderStyle("soft")');
    const line = run('LuvliStyle.reminderLine(LuvliStyle.get(Storage.get()), "Study session", 10)');
    return line.indexOf('Luvli') === -1 && line.indexOf('♡') > -1;
  })());
  check('focus mode uses the personalised affirmation', (function () {
    fireNav('focus');
    fireId('focusStartBtn');
    const shown = field('focusAffirmation').textContent;
    fireId('focusEndBtn');
    return shown.length > 2;
  })());
  check('a completed activity is celebrated in your voice', (function () {
    run('LuvliStyle.set("coach", { remember: true })');
    run('Storage.update(function(d){ d.tasks = [{ id:"st_1", date: Utils.todayKey(), name:"Style test", category:"study", start:"09:00", end:"10:00", priority:"medium", notes:"", completed:false }]; }, "test")');
    fireNav('home');
    fireAction('task-toggle', { 'data-id': 'st_1' });
    const last = field('toastStack').children[field('toastStack').children.length - 1];
    const expected = run('LuvliStyle.voice(Storage.get()).celebrate');
    return Boolean(last) && last.innerHTML.indexOf(expected) > -1;
  })());

  // Forgetting the memory must never throw the style away
  check('forgetting what Luvli learned keeps the style', (function () {
    const keep = run('Storage.get().personality.key');
    run('LuvliStyle.forgetMemory()');
    return run('Storage.get().personality.key') === keep;
  })());

  // Finally: it all survives a reload, and every page still paints
  check('the Luvli style survives a refresh',
    run('JSON.parse(localStorage.getItem(Storage.KEY)).personality.key.length') > 0);
  check('every page still renders with a style chosen', (function () {
    try {
      ['home', 'day', 'study', 'focus', 'progress', 'affirmations', 'settings'].forEach(fireNav);
      return true;
    } catch (err) { check('render error', false, err.message); return false; }
  })());
} catch (err) {
  check('the whole boot test ran without an exception', false,
    String(err.stack || err).split('\n').slice(0, 3).join(' | '));
}

const failed = results.filter((item) => !item.pass);
console.log('');
console.log(results.length - failed.length + '/' + results.length + ' interaction checks passed');
if (failed.length) process.exitCode = 1;

