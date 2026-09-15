/* tools/smoke-test.js — runs the logic modules in Node with a small shim and
   checks that the scheduling intelligence really behaves. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const memory = {};
const docListeners = {};

const sandbox = {
  console, JSON, Math, Date, String, Number, Object, Array, Boolean, isNaN, parseInt, parseFloat,
  Error, RegExp, Promise, Set, Map,
  localStorage: {
    getItem: (key) => (key in memory ? memory[key] : null),
    setItem: (key, value) => { memory[key] = String(value); },
    removeItem: (key) => { delete memory[key]; }
  },
  document: {
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener: () => {},
    dispatchEvent: (event) => { (docListeners[event.type] || []).forEach((fn) => fn(event)); return true; },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  },
  CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options && options.detail; },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// icons.js comes first: scheduler.js, affirmations.js and progress.js all call
// ico() when they build markup, so the shim needs it just like the browser.
const sources = ['js/icons.js', 'js/storage.js', 'js/scheduler.js', 'js/affirmations.js',
  'js/progress.js', 'js/personality.js']
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n;\n');

const test = `
  const results = [];
  function check(label, condition, extra) {
    const pass = Boolean(condition);
    results.push({ label, pass });
    console.log((pass ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  (' + extra + ')'));
  }

  const today = Utils.todayKey();
  const tomorrow = Utils.addDays(today, 1);
  const at = (hhmm) => Scheduler.timeToMinutes(hhmm);

  /* ---- sample day ------------------------------------------------------ */
  // seedSampleDay marks anything that already ended today as done, which
  // depends on the wall clock. These checks are about the day's *shape*, so
  // clear that flag to keep the run identical whatever time it is run at.
  Storage.seedSampleDay(true);
  const state = Storage.get();
  state.tasks.forEach((task) => { task.completed = false; task.completedAt = null; });
  check('sample day seeds 6 activities', Scheduler.tasksFor(today, state).length === 6);
  check('sample day seeds subjects + history', state.subjects.length === 3 && state.sessions.length === 7);

  /* ---- live day -------------------------------------------------------- */
  const during = Scheduler.liveStatus(today, state, at('13:20'));
  check('13:20 -> Python study is happening now', during.current && during.current.name === 'Python study');
  check('13:20 -> the coffee break is next', during.next && during.next.name === 'Coffee break');
  const free = Scheduler.liveStatus(today, state, at('15:30'));
  check('15:30 -> free right now, exercise next', !free.current && free.next.name === 'Exercise');
  check('Right Now card renders a live card',
    Scheduler.renderRightNow(state, today, at('13:20')).indexOf('rn-card') > -1);
  check('Live day shows Right now / Next / Later',
    Scheduler.renderLiveDay(state, today, at('13:20')).indexOf('Later') > -1);

  /* ---- what should I do now ------------------------------------------- */
  const ideas = Scheduler.suggestions(state, today, at('15:30'));
  check('suggestions come back explained',
    ideas.length > 0 && ideas.every((i) => i.name && i.reason && i.badge));

  /* ---- free slots + optimize ------------------------------------------ */
  const slots = Scheduler.freeSlots(today, state, { fromMin: at('09:00') });
  const busy = Scheduler.tasksFor(today, state).map((t) => [at(t.start), at(t.end)]);
  check('free slots never overlap a plan',
    slots.every((s) => busy.every((r) => s.end <= r[0] || s.start >= r[1])));

  const plan = Scheduler.optimizeDay(state, today, at('15:30'));
  check('optimize reports + places work', plan.moved.length + plan.scheduled.length > 0,
    plan.moved.length + ' moved, ' + plan.scheduled.length + ' planned');
  Storage.update((draft) => { Scheduler.optimizeDay(draft, today, at('15:30')); }, 'test');
  const open = Scheduler.pending(Scheduler.tasksFor(today, Storage.get()));
  let overlaps = 0;
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      if (at(open[i].start) < at(open[j].end) && at(open[j].start) < at(open[i].end)) overlaps++;
    }
  }
  check('optimize never double-books the day', overlaps === 0, overlaps + ' overlaps');
  const dinner = Scheduler.tasksFor(today, Storage.get()).find((t) => t.name === 'Dinner');
  check('optimize protects meals', dinner && dinner.start === '19:00' && dinner.end === '20:00');
  check('nothing lands after sleep time',
    Scheduler.tasksFor(today, Storage.get()).filter((t) => !t.completed)
      .every((t) => at(t.end) <= Scheduler.sleepMinutes(Storage.get())));

  /* ---- PHASE 1: clashes (on a small, controlled day) ------------------- */
  Storage.update((draft) => {
    draft.tasks = [
      { id: 'c1', date: Utils.todayKey(), name: 'Dinner', category: 'food', start: '19:00', end: '20:00',
        priority: 'medium', notes: '', completed: false },
      { id: 'c2', date: Utils.todayKey(), name: 'Gym', category: 'exercise', start: '16:00', end: '16:30',
        priority: 'medium', notes: '', completed: false },
      { id: 'c3', date: Utils.todayKey(), name: 'Reading', category: 'study', start: '16:30', end: '17:00',
        priority: 'low', notes: '', completed: false }
    ];
  }, 'test');

  const clash = Scheduler.findConflicts(today, Storage.get(), { start: '16:10', end: '16:40' });
  check('a clash is detected', clash.length === 2 && clash.some((t) => t.id === 'c2'), clash.length);
  check('a free time reports no clash',
    Scheduler.findConflicts(today, Storage.get(), { start: '04:00', end: '04:30' }).length === 0);
  check('the same call works with the arguments swapped',
    Scheduler.findConflicts(Storage.get(), today, { start: '16:10', end: '16:40' }).length === 2);

  let fit = null;
  Storage.update((draft) => { fit = Scheduler.fitAround(today, draft, { start: '16:10', end: '16:40' }); }, 'test');
  check('fitAround nudges the movable clashes aside', fit.moved.length === 2, fit.moved.length);
  const gym = Storage.get().tasks.find((t) => t.id === 'c2');
  const reading = Storage.get().tasks.find((t) => t.id === 'c3');
  check('the nudged activities no longer overlap the new slot',
    at(gym.end) <= at('16:10') || at(gym.start) >= at('16:40') &&
    (at(reading.end) <= at('16:10') || at(reading.start) >= at('16:40')),
    gym.start + '-' + gym.end + ' / ' + reading.start + '-' + reading.end);
  check('the nudged activities do not overlap each other',
    at(gym.end) <= at(reading.start) || at(reading.end) <= at(gym.start));
  check('protected activities are never nudged',
    Scheduler.fitAround(today, Storage.get(), { start: '19:10', end: '19:40' }).locked.length === 1);

  /* ---- PHASE 1: feasibility + trim ----------------------------------- */
  const forecast = Scheduler.feasibility(today, Storage.get(), at('15:30'));
  check('feasibility adds up',
    typeof forecast.needed === 'number' && typeof forecast.free === 'number' &&
    ['ok', 'tight', 'over'].indexOf(forecast.level) > -1, forecast.level);

  Storage.update((draft) => {
    for (let i = 0; i < 8; i++) {                     // pile on far too much work
      draft.tasks.push({ id: 'extra_' + i, date: Utils.todayKey(), name: 'Extra ' + i, category: 'project',
        start: '09:00', end: '10:00', priority: 'low', notes: '', completed: false });
    }
  }, 'test');
  const heavy = Scheduler.feasibility(Storage.get(), today, at('15:30'));   // state-first also works
  check('an overloaded day is flagged as over', heavy.level === 'over', heavy.level);
  check('the overflow list stays gentle',
    heavy.overflow.every((t) => t.priority !== 'high' && !Scheduler.isProtected(t)));
  const trimmed = Scheduler.trimDay(Storage.get(), today, at('15:30'));
  Storage.update((draft) => { Scheduler.trimDay(draft, today, at('15:30')); }, 'test');
  check('trim moves the extras to tomorrow', trimmed.moved.length > 0, trimmed.moved.length);
  check('trimmed activities really land on tomorrow',
    Scheduler.tasksFor(tomorrow, Storage.get()).length >= trimmed.moved.length);

  /* ---- PHASE 1: natural language -------------------------------------- */
  const p1 = Scheduler.parseQuickAdd('python 45m high tomorrow 10:00', null);
  check('NL: name, length, priority, date and time',
    p1.name === 'Python' && p1.minutes === 45 && p1.priority === 'high' &&
    p1.date === tomorrow && p1.start === '10:00' && p1.category === 'study',
    [p1.name, p1.minutes, p1.priority, p1.date, p1.start].join(' | '));
  const p2 = Scheduler.parseQuickAdd('clean my room 30 mins', null);
  check('NL: keeps a natural name + length',
    p2.name === 'Clean my room' && p2.minutes === 30 && p2.category === 'cleaning', p2.name);
  const p3 = Scheduler.parseQuickAdd('every weekday gym 7:00 for 1h', null);
  check('NL: repeat + duration + clock time',
    p3.repeat === 'weekdays' && p3.minutes === 60 && p3.start === '07:00' && p3.category === 'exercise');
  const p4 = Scheduler.parseQuickAdd('dentist appointment tomorrow at 3pm', null);
  check('NL: pm times and dates',
    p4.start === '15:00' && p4.date === tomorrow && p4.category === 'appointment');
  const p5 = Scheduler.parseQuickAdd('water', null);
  check('NL: a single word still lands sensibly', p5.name === 'Water' && p5.category === 'wellness');
  check('NL: it can describe what it read', Scheduler.describeQuickAdd(p1, null).indexOf('45m') > -1);

  /* ---- PHASE 1: undo --------------------------------------------------- */
  const beforeUndo = Storage.get().tasks.length;
  Storage.update((draft) => {
    draft.tasks.push({ id: 'undo_me', date: today, name: 'Oops', category: 'custom',
      start: '08:00', end: '08:30', priority: 'low', notes: '', completed: false });
  }, 'task');
  check('a change is undoable', Storage.canUndo() && Storage.get().tasks.length === beforeUndo + 1);
  Storage.undo();
  check('undo restores the previous state',
    Storage.get().tasks.length === beforeUndo && !Storage.get().tasks.some((t) => t.id === 'undo_me'));

  /* ---- progress + persistence ----------------------------------------- */
  const totals = Progress.totals(Storage.get());
  check('the week has seven days', totals.days.length === 7);
  check('streaks see the history',
    totals.streaks.current >= 1 && totals.streaks.best >= totals.streaks.current, totals.streaks.current);
  check('the week chart renders 7 bars',
    (Progress.renderWeekChart(Storage.get()).match(/week-bar-track/g) || []).length === 7);

  const backup = Storage.exportJSON();
  check('state is saved in localStorage', (localStorage.getItem(Storage.KEY) || '').length > 100);
  Storage.reset();
  check('reset clears everything', Storage.get().tasks.length === 0);
  Storage.undo();
  check('reset itself can be undone', Storage.get().tasks.length > 0);
  check('import restores a backup', Storage.importJSON(backup) && Storage.get().tasks.length > 0);
  check('12/24 hour formatting works',
    Scheduler.formatTime('13:05', { settings: { timeFormat: '12' } }) === '1:05 PM' &&
    Scheduler.formatTime('13:05', { settings: { timeFormat: '24' } }) === '13:05');


  /* ---- PHASE 2: recurring activities ----------------------------------- */
  Storage.update((draft) => {
    draft.tasks = [{
      id: 'rec_1', date: Utils.todayKey(), name: 'Morning walk', category: 'exercise',
      start: '07:00', end: '07:30', priority: 'low', notes: '', repeat: 'daily',
      completed: false, seriesId: 'rec_1'
    }];
  }, 'test');
  const created = Scheduler.materialiseRecurring(Storage.get(), 7);
  check('a daily activity fills in the week', created.length === 7, created.length);
  check('recurring instances are never duplicated', (function () {
    Scheduler.materialiseRecurring(Storage.get(), 7);
    return Storage.get().tasks.filter((t) => t.name === 'Morning walk').length === 8;
  })(), Storage.get().tasks.filter((t) => t.name === 'Morning walk').length);
  check('recurring activities sit on different days', (function () {
    const days = Storage.get().tasks.filter((t) => t.name === 'Morning walk').map((t) => t.date);
    return new Set(days).size === days.length;
  })());
  check('weekday repeats skip the weekend', (function () {
    const todayDate = Utils.parseDateKey(Utils.todayKey()).getDay();
    const saturday = Utils.addDays(Utils.todayKey(), (6 - todayDate + 7) % 7);
    return Scheduler.nextRepeatDate('weekdays', saturday) === Utils.addDays(saturday, 2);
  })());
  check('stopping a series stops the future ones',
    Scheduler.stopSeries(Storage.get(), 'rec_1', Utils.addDays(Utils.todayKey(), 3)) >= 1 &&
    Storage.get().tasks.filter((t) => t.seriesId === 'rec_1' && t.repeat === 'daily').length <= 3);
  check('the repeat label reads well', Scheduler.repeatLabel('weekdays') === 'Weekdays');

  /* ---- PHASE 2: routines ------------------------------------------------ */
  Storage.reset();
  Storage.seedSampleDay(false);
  const routineResult = Scheduler.applyRoutine(Storage.get(), 'study', Utils.todayKey(), at('20:00'));
  check('a routine adds its steps where they fit',
    routineResult.added.length >= 3, routineResult.added.length);
  check('routine steps are placed back to back', (function () {
    for (let i = 1; i < routineResult.added.length; i++) {
      if (routineResult.added[i].start !== routineResult.added[i - 1].end) return false;
    }
    return true;
  })());
  check('routine steps come from the template', routineResult.routine.name === 'Study block');

  /* ---- PHASE 2: energy insights ---------------------------------------- */
  const insights = Scheduler.focusInsights(Storage.get());
  check('insights learn from history', insights.samples > 0 && Array.isArray(insights.byHour));
  check('insights can suggest a good hour',
    insights.bestHour === null || (insights.bestHour >= 5 && insights.bestHour <= 22), insights.bestHour);

  Storage.update((draft) => {
    for (let i = 0; i < 4; i++) {
      draft.tasks.push({ id: 'avg_' + i, date: Utils.todayKey(), name: 'Timed ' + i, category: 'study',
        start: '10:00', end: '11:00', priority: 'medium', notes: '', completed: true,
        completedAt: new Date().toISOString() });
    }
  }, 'test');
  const typical = Scheduler.typicalMinutes(Storage.get(), 'study');
  check('typical durations are learned from finished work',
    typeof typical === 'number' && typical >= 50 && typical <= 60, typical);
  check('peak hours can be tested', typeof Scheduler.isPeakHour(Storage.get(), at('10:00')) === 'boolean');

  /* ---- PHASE 2: smart breaks ------------------------------------------- */
  // In the sample day the last pause is the coffee break (ends 14:00) then exercise (ends 16:30)
  check('a long stretch without a pause is noticed',
    Scheduler.needsBreak(Storage.get(), Utils.todayKey(), at('19:00')).needed === true);
  check('straight after a break it is not needed',
    Scheduler.needsBreak(Storage.get(), Utils.todayKey(), at('15:00')).needed === false);
  check('the break report knows how long it has been',
    Scheduler.needsBreak(Storage.get(), Utils.todayKey(), at('19:00')).minutesSince === 150,
    Scheduler.needsBreak(Storage.get(), Utils.todayKey(), at('19:00')).minutesSince);


  /* ---- PHASE 3: the day grid ------------------------------------------- */
  // The earlier phases replaced the day with a couple of controlled activities,
  // so put the sample day back before checking the grid's rendering.
  Storage.seedSampleDay(true);
  Storage.get().tasks.forEach((task) => { task.completed = false; });
  const grid = Scheduler.renderDayGrid(Storage.get(), Utils.todayKey(), at('13:20'));
  check('the day grid renders a block per activity',
    (grid.match(/class="grid-block/g) || []).length >= 6,
    (grid.match(/class="grid-block/g) || []).length + ' blocks');
  check('the day grid places blocks proportionally',
    grid.indexOf('top:348px;height:48px') > -1,
    'expected the 13:00-13:50 block at 348px / 48px');
  check('the day grid marks the current activity', grid.indexOf('is-now') > -1);
  check('the day grid draws the now line', grid.indexOf('grid-now') > -1);
  check('the day grid offers drag handles',
    grid.indexOf('gb-grip') > -1 && grid.indexOf('gb-resize') > -1);
  check('the day grid knows where it starts',
    grid.indexOf('data-grid-start="420"') > -1);
  check('the day grid has lane offsets for overlaps', grid.indexOf('left:calc(') > -1);
  check('the day grid colour-codes blocks by category',
    grid.indexOf('data-cat="study"') > -1 && grid.indexOf('data-cat="food"') > -1);
  check('the timeline colour-codes rows by category',
    Scheduler.renderTimeline(Storage.get(), Utils.todayKey(), at('13:20')).indexOf('data-cat="') > -1);
  check('the live day list colour-codes its rows',
    Scheduler.renderLiveDay(Storage.get(), Utils.todayKey(), at('13:20')).indexOf('data-cat="') > -1);
  check('an empty day shows the grid empty state',
    Scheduler.renderDayGrid(Storage.get(), Utils.addDays(Utils.todayKey(), 5)).indexOf('empty-state') > -1);


  /* ---- PHASE 4: migrations and long-term storage ----------------------- */
  const oldSave = Storage.migrate({
    version: 1,
    tasks: [{ id: 'old_1', date: Utils.todayKey(), name: 'Old thing', start: '09:00', end: '10:00' }],
    sessions: [], settings: {}
  });
  check('an older save gains the repeat field', oldSave.tasks[0].repeat === 'none');
  check('an older save gains the focus preferences',
    oldSave.settings.focusFullscreen === true && oldSave.settings.focusSound === false);
  check('an older save gains sync settings', oldSave.settings.sync.endpoint === '');
  // Version 3 added Student Space; the Luvli Style preferences ride along in the
  // same migration, so an old save comes out fully up to date.
  check('an older save is marked as up to date', oldSave.version === 3);
  check('an older save gains the Luvli Style preferences',
    Boolean(oldSave.personality) && oldSave.personality.key === 'soft' &&
    oldSave.personality.avatar.color === 'pink');

  Storage.update((draft) => {
    for (let i = 0; i < 25; i++) {
      draft.sessions.push({ id: 'old_ses_' + i, subjectName: 'History', goal: 'Long ago', minutes: 25,
        date: Utils.addDays(Utils.todayKey(), -200), type: 'focus' });
    }
  }, 'test');
  const folded = Storage.compactHistory(90);
  check('very old sessions are summarised away',
    folded >= 20 && Storage.get().sessions.every((s) => s.date >= Utils.addDays(Utils.todayKey(), -90)),
    folded + ' folded');
  check('the folded minutes are still counted',
    Storage.archivedTotals().minutes >= 500, Storage.archivedTotals().minutes);
  check('all-time numbers include the archived months',
    Progress.totals(Storage.get()).allTime.minutes >= 500);

  /* ---- PHASE 6: 💗 My Luvli Style ♡ ----------------------------------- */
  // A style is chosen, remembered, drawn from, and it must reach the rest of
  // the app without anything else having to know how a style is built.
  const styleKeys = LuvliStyle.STYLES.map((s) => s.key).join(',');
  check('all four personalities exist', styleKeys === 'soft,coach,study,calm', styleKeys);
  check('every personality explains itself',
    LuvliStyle.STYLES.every((s) => s.name && s.tagline && s.traits.length && s.examples.length));
  check('every personality names what it is best for',
    LuvliStyle.STYLES.every((s) => s.bestFor && s.bestFor.indexOf('Best') === 0));

  Storage.reset();
  check('a fresh Luvli starts as Soft Luvli', LuvliStyle.get(Storage.get()).name === 'Soft Luvli');
  check('nothing is saved until the user chooses', LuvliStyle.get(Storage.get()).chosen === false);

  LuvliStyle.set('coach', { remember: true });
  check('choosing a style saves it',
    LuvliStyle.currentKey(Storage.get()) === 'coach' &&
    Storage.get().personality.key === 'coach');
  check('choosing a style marks Luvli as set up', LuvliStyle.get(Storage.get()).chosen === true);
  check('the choice survives a reload',
    LuvliStyle.get(JSON.parse(localStorage.getItem(Storage.KEY))).name === 'Coach Luvli');

  LuvliStyle.set('calm', { remember: false });
  check('a one-day switch applies to today', LuvliStyle.currentKey(Storage.get()) === 'calm');
  check('a one-day switch is flagged as today-only', LuvliStyle.isOverridden(Storage.get()) === true);
  check('a one-day switch does not replace the usual style',
    Storage.get().personality.key === 'coach');
  LuvliStyle.clearOverride();
  check('tomorrow it goes back to the usual style',
    LuvliStyle.currentKey(Storage.get()) === 'coach' && !LuvliStyle.isOverridden(Storage.get()));

  check('how often each style is used is remembered',
    LuvliStyle.get(Storage.get()).memory.styles.coach >= 1 &&
    LuvliStyle.topStyles(Storage.get())[0] === 'coach');

  /* communication, reminders, affirmations, avatar */
  LuvliStyle.setCommunication('very-gentle');
  check('the communication style saves', LuvliStyle.get(Storage.get()).communication === 'very-gentle');
  check('the communication style has a readable label',
    LuvliStyle.communicationLabel('very-gentle') === 'Very gentle');

  LuvliStyle.setReminderStyle('soft');
  check('a soft reminder reads like the brief',
    LuvliStyle.reminderLine(LuvliStyle.get(Storage.get()), 'Study session', 10) ===
    'Luv, your study session is coming soon in 10 minutes. ♡',
    LuvliStyle.reminderLine(LuvliStyle.get(Storage.get()), 'Study session', 10));
  LuvliStyle.setReminderStyle('motivational');
  check('a motivational reminder reads like the brief',
    LuvliStyle.reminderLine(LuvliStyle.get(Storage.get()), 'Study session', 10) ===
    'Study session starts in 10 minutes. Let\\'s go!');
  LuvliStyle.setReminderStyle('minimal');
  check('a minimal reminder reads like the brief',
    LuvliStyle.reminderLine(LuvliStyle.get(Storage.get()), 'Study session', 10) ===
    'Study session starting in 10 minutes.');

  check('every affirmation style is offered',
    LuvliStyle.AFFIRMATION_STYLES.map((a) => a.key).join(',') ===
    'self-love,confidence,career,study-motivation,discipline,growth');
  const beforeToggle = LuvliStyle.get(Storage.get()).affirmations.slice();
  check('toggling an affirmation style removes it',
    LuvliStyle.toggleAffirmation('self-love').indexOf('self-love') === -1);
  check('toggling it again brings it back',
    LuvliStyle.toggleAffirmation('self-love').indexOf('self-love') > -1 &&
    LuvliStyle.get(Storage.get()).affirmations.join(',') === beforeToggle.join(','));

  check('the avatar offers four colours',
    LuvliStyle.AVATAR_COLORS.map((c) => c.key).join(',') === 'pink,cream,lavender,peach');
  check('the avatar offers five designs',
    LuvliStyle.AVATAR_SHAPES.map((s) => s.key).join(',') === 'icon,minimal,flower,heart,star');
  LuvliStyle.setAvatar('lavender', 'flower');
  const avatar = LuvliStyle.get(Storage.get()).avatar;
  check('the avatar choice saves', avatar.color === 'lavender' && avatar.shape === 'flower');
  check('the avatar only carries colour and shape',
    Object.keys(avatar).sort().join(',') === 'color,shape', Object.keys(avatar).join(','));
  const avatarHtml = LuvliStyle.avatarHtml();
  check('the avatar renders one little character',
    avatarHtml.indexOf('ls-avatar') > -1 && avatarHtml.indexOf('data-color="lavender"') > -1);
  check('the avatar is labelled for screen readers',
    avatarHtml.indexOf('aria-label="Luvli — ') > -1);

  /* the morning message + personalised affirmations */
  const morning = LuvliStyle.morningMessage(Storage.get());
  check('a morning message is written', typeof morning === 'string' && morning.length > 10, morning);
  check('the morning message is the same all day',
    LuvliStyle.morningMessage(Storage.get()) === morning);
  check('the morning message is remembered on the day',
    LuvliStyle.get(Storage.get()).memory.greetingDate === Utils.todayKey());

  const lines = LuvliStyle.affirmationList(Storage.get());
  check('personalised affirmations are generated', lines.length >= 6, lines.length + ' lines');
  check('every personalised line is a real sentence',
    lines.every((l) => l.text.length > 20 && /\.$/.test(l.text)));
  check('the same affirmation holds for the whole day',
    LuvliStyle.affirmation(Storage.get()).text === LuvliStyle.affirmation(Storage.get()).text);
  check('another one can always be asked for',
    LuvliStyle.affirmation(Storage.get(), { exclude: lines[0].text, salt: 'x' }).text !== lines[0].text);

  const lowMood = LuvliStyle.affirmation(Storage.get(), { tag: 'low-energy' });
  check('a low day gets the gentler words',
    lowMood.tag === 'low-energy', lowMood.tag);
  check('a career goal is noticed', (function () {
    Storage.update((d) => {
      d.subjects = [{ id: 'sub_1', name: 'Portfolio', goal: 'Build a case study' }];
    }, 'test');
    return LuvliStyle.goalTags(Storage.get()).indexOf('career') > -1;
  })());
  check('a study goal is noticed',
    LuvliStyle.goalTags(Storage.get()).indexOf('study-motivation') > -1 ||
    (function () {
      Storage.update((d) => { d.subjects.push({ id: 'sub_2', name: 'Python', goal: 'Pass the exam' }); }, 'test');
      return LuvliStyle.goalTags(Storage.get()).indexOf('study-motivation') > -1;
    })());

  /* what the rest of the app reads */
  const adapters = LuvliStyle.adapters(Storage.get());
  check('the adapters name every screen they tune',
    typeof adapters.focusLength === 'number' && typeof adapters.keepShort === 'boolean' &&
    Array.isArray(adapters.affirmationCategories) && adapters.key === 'coach',
    JSON.stringify(adapters));
  check('a direct style keeps things short',
    (function () {
      LuvliStyle.setCommunication('direct');
      return LuvliStyle.adapters(Storage.get()).keepShort === true;
    })());
  check('Study Luvli put study first',
    (function () {
      LuvliStyle.set('study', { remember: true });
      return LuvliStyle.adapters(Storage.get()).studentFirst === true;
    })());
  check('the voice changes with the style', (function () {
    const coach = LuvliStyle.voice(Storage.get());
    LuvliStyle.set('soft', { remember: true });
    const soft = LuvliStyle.voice(Storage.get());
    return coach.morning !== soft.morning && coach.celebrate !== soft.celebrate;
  })());
  check('the memory summary explains itself',
    LuvliStyle.memorySummary(Storage.get()).summary.indexOf('Luvli') > -1,
    LuvliStyle.memorySummary(Storage.get()).summary);

  const failed = results.filter((item) => !item.pass);
  console.log('');
  console.log(results.length - failed.length + '/' + results.length + ' logic checks passed');
  if (failed.length) throw new Error(failed.length + ' checks failed');
`;

try {
  vm.runInContext(sources + '\n' + test, sandbox, { filename: 'luvli-smoke-test.js' });
} catch (err) {
  console.error('\nSMOKE TEST ERROR:', err.message);
  process.exitCode = 1;
}
