/* =============================================================================
   storage.js — persistence + small helpers shared by every other module
   -----------------------------------------------------------------------------
   • Utils    : tiny pure helpers (ids, dates, escaping text, formatting)
   • Storage  : reads/writes the whole app state in localStorage
   Nothing here touches the DOM, so it is safe to read top-to-bottom.
   ========================================================================== */
'use strict';

/* ------------------------------- Utils ---------------------------------- */
const Utils = (() => {
  /** Short unique id, e.g. "task_l8x2_9f3a1" */
  function uid(prefix = 'id') {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /** Escape text before putting it inside an HTML template string. */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const pad = (n) => String(n).padStart(2, '0');

  /** "2026-09-10" for a Date (defaults to now). */
  function dateKey(date = new Date()) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  const todayKey = () => dateKey(new Date());

  /** "2026-09-10" -> Date at local midnight. */
  function parseDateKey(key) {
    const parts = String(key).split('-').map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }

  /** Move a date key by a number of days (can be negative). */
  function addDays(key, days) {
    const d = parseDateKey(key);
    d.setDate(d.getDate() + days);
    return dateKey(d);
  }

  /** Whole days between two date keys (b - a). */
  function dayDiff(a, b) {
    return Math.round((parseDateKey(b) - parseDateKey(a)) / 86400000);
  }

  /** "Thursday, September 10" */
  function formatLongDate(key) {
    return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  /** "Sep 10" */
  function formatShortDate(key) {
    return parseDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** "Thu" */
  function weekdayShort(key) {
    return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'short' });
  }

  /** Yesterday / Today / Tomorrow / "Thursday, September 10" */
  function relativeDateLabel(key) {
    const diff = dayDiff(todayKey(), key);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return formatLongDate(key);
  }

  /** 95 -> "1h 35m" */
  function formatMinutes(total) {
    const mins = Math.max(0, Math.round(total));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return h + 'h ' + m + 'm';
    if (h) return h + 'h';
    return m + 'm';
  }

  /** Round to a whole percentage, clamped 0–100. */
  const percent = (part, total) => (total > 0 ? clamp(Math.round((part / total) * 100), 0, 100) : 0);

  /** Pick a random item from an array. */
  const pickRandom = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

  /** Shuffle a copy of an array (Fisher–Yates). */
  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** First 1–2 letters of a word, for little avatars. */
  const initials = (text) => String(text || '').trim().slice(0, 2).toUpperCase();

  return {
    uid, escapeHtml, clamp, pad, dateKey, todayKey, parseDateKey, addDays, dayDiff,
    formatLongDate, formatShortDate, weekdayShort, relativeDateLabel, formatMinutes,
    percent, pickRandom, shuffle, initials
  };
})();
/* ------------------------------- Storage -------------------------------- */
/**
 * The whole app state lives in one object that is JSON-stringified into
 * localStorage under a single key. Every screen reads from it through
 * Storage.get() and changes it through Storage.update().
 */
const Storage = (() => {
  const KEY = 'luvli.state.v1';

  let state = null;
  const listeners = [];

  /** A brand new, empty Luvli. */
  function defaults() {
    return {
      version: 3,
      seeded: false,
      profile: {
        name: ''
      },
      settings: {
        wakeTime: '07:00',
        sleepTime: '22:30',
        timeFormat: '24',          // '24' or '12'
        focusLength: 25,
        breakLength: 5,
        longBreakLength: 15,
        autoBreak: true,
        focusFullscreen: true,     // dim everything but the timer while focusing
        focusSound: false,         // a soft chime when a session ends
        bufferMinutes: 10,         // gap Luvli leaves between activities
        maxPlannedHours: 10,       // never plan more than this per day
        protectBreaks: true,
        autoOptimize: true,
        theme: 'rose',
        reduceMotion: false,
        notifications: {
          enabled: true,
          leadMinutes: 10,
          evening: true,
          celebrate: true,
          promptDismissed: false
        },
        affirmations: {
          categories: ['self-love', 'studying', 'motivation'],
          duringFocus: true
        },
        /* Filled in by the short onboarding every new account goes through
           (see Auth.savePreferences). Empty here so an existing save — or a
           brand-new one — simply has "not answered yet". */
        onboarding: {
          focus: [], wakeTime: '07:00', sleepTime: '22:30',
          productivity: 'balanced', reminders: 'gentle', goals: '', completed: false
        }
      },
      tasks: [],                   // every activity, all days
      backlog: [],                 // "I need to get this done" items
      subjects: [],                // study subjects + goals
      sessions: [],                // completed focus / study sessions
      checkIns: {},                // dateKey -> { mood, note }
      nightReviews: {},            // dateKey -> { rating }
      focusDays: {},               // dateKey -> { minutes, sessions }
      history: {},                 // 'YYYY-MM' -> { minutes, sessions } (older months)
      studyApps: ['ChatGPT', 'YouTube', 'VS Code', 'Google', 'Notion'],
      distractionApps: ['TikTok', 'Instagram', 'Netflix', 'Games'],
      affirmations: { favorites: [], custom: [] },
      notified: {},                // notificationKey -> timestamp (avoids repeats)
      pomodoro: { subjectId: '', goal: '', preset: '25/5', focusLength: 25, breakLength: 5 },

      /* ---- Accounts ♡ (see js/auth.js) ---------------------------------
         Luvli has no server, so an account is a local record: your name and
         email, a salted password hash (never the password itself) and which
         account is currently signed in. */
      auth: {
        accounts: [],   // { id, name, email, salt, hash, avatar, createdAt, lastSeenAt }
        session: null,  // { userId, since, remember } once someone is signed in
        reset: null     // { email, token, requestedAt, used } while a reset is open
      },

      /* ---- Phase 5: Student Space ♡ (see js/student-mode.js) --------------
         Subjects are shared with the Study page (state.subjects) so sessions,
         Focus mode and Progress all light up on their own. Everything below is
         student-specific. */
      student: {
        enabled: true,
        school: '',
        assignments: [],   // { id, subjectId, name, dueDate, difficulty, estimateMinutes, status, notes }
        exams: [],         // { id, subjectId, name, examDate, topics, confidence, notes }
        notes: [],         // { id, subjectId, title, body, kind, url, pinned, createdAt, updatedAt }
        cards: [],         // { id, subjectId, question, answer, confidence, seen, right, lastSeen }
        plans: [],         // revision plans built by Build My Revision Plan
        weeklyGoalMinutes: 600,
        dailyGoalMinutes: 120,
        protectRoutine: true,   // keep meals, sleep and breaks when planning study
        dismissed: {}      // deadline nudges already shown ("asg_x:7")
      },

      /* ---- Phase 6: My Luvli Style ♡ (see js/personality.js) --------------
         How the user wants Luvli to talk to them. One small object that every
         screen reads through LuvliStyle.* so the whole app adapts at once. */
      personality: {
        key: 'soft',            // soft | coach | study | calm
        chosen: false,          // has the user been through the onboarding?
        onboarding: 0,          // which step of "My Luvli Style" they reached
        customised: false,      // did they open Custom settings at least once?
        overrides: {},          // 'YYYY-MM-DD' -> personality key ("today I need Coach Luvli")
        history: [],            // { key, at } — the styles they have lived in
        communication: 'balanced', // very-gentle | balanced | direct | motivational
        reminderStyle: 'soft',     // soft | motivational | minimal
        affirmations: ['self-love', 'confidence', 'growth'],
        avatar: {
          color: 'pink',       // pink | cream | lavender | peach
          shape: 'heart'       // icon | minimal | flower | heart | star
        },
        memory: {
          greeting: '',        // the morning message Luvli wrote today
          greetingDate: '',    // which day that was ("2026-09-10")
          affirmations: [],    // the personalised lines already shown
          styles: {},          // { coach: 3, calm: 1 } — favourites, learned quietly
          moments: [],         // { text, at } — how the user has been doing
          updatedAt: null
        }
      }
    };
  }

  /**
   * Merge saved data over the defaults, so a new Luvli version that adds a
   * setting never breaks an older save.
   */
  function mergeDeep(base, saved) {
    if (Array.isArray(base)) return Array.isArray(saved) ? saved : base;
    if (base && typeof base === 'object') {
      const out = {};
      Object.keys(base).forEach((key) => { out[key] = mergeDeep(base[key], saved ? saved[key] : undefined); });
      if (saved && typeof saved === 'object') {
        Object.keys(saved).forEach((key) => { if (!(key in out)) out[key] = saved[key]; });
      }
      return out;
    }
    return (saved === undefined || saved === null) ? base : saved;
  }

  /**
   * Bring an older save up to date. Version 2 added repeating activities,
   * focus-mode preferences, the monthly history summary and the sync settings.
   * Version 3 adds Student Space (assignments, exams, notes, flashcards,
   * revision plans) and the extra fields a subject needs for school life —
   * anything saved before that simply gets sensible, empty defaults.
   */
  function migrate(saved) {
    if (!saved || typeof saved !== 'object') return saved;
    saved.version = 3;
    saved.history = saved.history || {};
    saved.sessions = saved.sessions || [];
    saved.settings = saved.settings || {};

    /* --- Accounts: older saves simply have none yet. -------------------- */
    const auth = saved.auth || {};
    saved.auth = {
      accounts: Array.isArray(auth.accounts) ? auth.accounts : [],
      session: auth.session && auth.session.userId ? auth.session : null,
      reset: auth.reset || null
    };
    if (!saved.profile) saved.profile = { name: '' };

    /* --- Onboarding preferences (from the sign-up flow) ------------------ */
    const onboarding = saved.settings.onboarding || {};
    saved.settings.onboarding = {
      focus: Array.isArray(onboarding.focus) ? onboarding.focus : [],
      wakeTime: onboarding.wakeTime || saved.settings.wakeTime || '07:00',
      sleepTime: onboarding.sleepTime || saved.settings.sleepTime || '22:30',
      productivity: onboarding.productivity || 'balanced',
      reminders: onboarding.reminders || 'gentle',
      goals: String(onboarding.goals || ''),
      completed: Boolean(onboarding.completed),
      at: onboarding.at || null
    };

    (saved.tasks || []).forEach((task) => {
      if (!task.repeat) task.repeat = 'none';
      if (task.repeat !== 'none' && !task.seriesId) task.seriesId = task.id;
    });
    saved.backlog = (saved.backlog || []).map((item) => {
      if (!item.repeat) item.repeat = 'none';
      return item;
    });

    if (saved.settings.focusFullscreen === undefined) saved.settings.focusFullscreen = true;
    if (saved.settings.focusSound === undefined) saved.settings.focusSound = false;
    if (!saved.settings.sync) {
      saved.settings.sync = { enabled: false, endpoint: '', lastSync: null, autoPush: false };
    }

    /* --- version 3: My Luvli Style (how Luvli talks to you) -------------- */
    const personality = saved.personality || {};
    saved.personality = {
      key: personality.key || 'soft',
      chosen: Boolean(personality.chosen),
      onboarding: Number(personality.onboarding) || 0,
      customised: Boolean(personality.customised),
      overrides: personality.overrides || {},
      history: personality.history || [],
      communication: personality.communication || 'balanced',
      reminderStyle: personality.reminderStyle || 'soft',
      affirmations: (personality.affirmations && personality.affirmations.length)
        ? personality.affirmations
        : ['self-love', 'confidence', 'growth'],
      avatar: Object.assign({ color: 'pink', shape: 'heart' }, personality.avatar || {}),
      memory: Object.assign(
        {
          greeting: '', greetingDate: '', affirmations: [], styles: {}, moments: [],
          promptDismissed: false, updatedAt: null
        },
        personality.memory || {}
      )
    };

    /* --- version 3: Student Space --------------------------------------- */
    const student = saved.student || {};
    saved.student = {
      enabled: student.enabled === undefined ? true : student.enabled,
      school: student.school || '',
      assignments: student.assignments || [],
      exams: student.exams || [],
      notes: student.notes || [],
      cards: student.cards || [],
      plans: student.plans || [],
      weeklyGoalMinutes: Number(student.weeklyGoalMinutes) || 600,
      dailyGoalMinutes: Number(student.dailyGoalMinutes) || 120,
      protectRoutine: student.protectRoutine === undefined ? true : student.protectRoutine,
      dismissed: student.dismissed || {}
    };
    // A subject now also carries the school-life details.
    saved.subjects = (saved.subjects || []).map((subject) => {
      if (subject.teacher === undefined) subject.teacher = '';
      if (subject.schedule === undefined) subject.schedule = [];
      if (subject.notes === undefined) subject.notes = '';
      return subject;
    });
    return saved;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? mergeDeep(defaults(), migrate(JSON.parse(raw))) : defaults();
    } catch (err) {
      console.warn('Luvli could not read your saved data, starting fresh.', err);
      state = defaults();
    }
    return state;
  }

  function get() {
    if (!state) load();
    return state;
  }

  /* ------------------------------- undo ---------------------------------- */
  // Luvli keeps a few in-memory snapshots so any change can be taken back.
  // (In memory on purpose: an undo after a page refresh would be surprising.)
  const undoStack = [];
  const UNDO_LIMIT = 20;

  function pushUndo() {
    try {
      undoStack.push(JSON.stringify(get()));
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    } catch (err) {
      // If the state cannot be serialised we simply skip this undo step
    }
  }

  const canUndo = () => undoStack.length > 0;
  const undoDepth = () => undoStack.length;

  /** Take the last change back. Returns true when something was restored. */
  function undo() {
    const snapshot = undoStack.pop();
    if (!snapshot) return false;
    state = mergeDeep(defaults(), JSON.parse(snapshot));
    save();
    emit('undo');
    return true;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      queueDeviceMirror();
      return true;
    } catch (err) {
      console.warn('Luvli could not save your data.', err);
      return false;
    }
  }

  /* --------------------- long-term storage housekeeping ------------------- */
  /**
   * Focus sessions older than `days` are folded into a monthly summary, so a
   * year of Luvli stays small while the numbers stay right.
   * @returns {number} how many sessions were folded away
   */
  function compactHistory(days) {
    const current = get();
    const cutoff = Utils.addDays(Utils.todayKey(), -(days || 90));
    const old = current.sessions.filter((session) => session.date < cutoff);
    if (old.length < 20) return 0;                       // not worth it yet

    old.forEach((session) => {
      const month = String(session.date).slice(0, 7);
      if (!current.history[month]) current.history[month] = { minutes: 0, sessions: 0 };
      current.history[month].minutes += session.minutes || 0;
      current.history[month].sessions += 1;
    });
    current.sessions = current.sessions.filter((session) => session.date >= cutoff);
    save();
    return old.length;
  }

  /** Everything that has been folded away, for the Progress page. */
  function archivedTotals() {
    const months = Object.keys(get().history || {});
    return {
      months: months.length,
      minutes: months.reduce((total, month) => total + (get().history[month].minutes || 0), 0),
      sessions: months.reduce((total, month) => total + (get().history[month].sessions || 0), 0)
    };
  }

  /* -------------------- device backup (IndexedDB mirror) ------------------- */
  // A quiet copy of the state on the device itself: if the browser cache is
  // ever cleared, Settings can bring everything back.
  const DB_NAME = 'luvli-archive';
  const DB_STORE = 'snapshots';
  let mirrorTimer = null;

  function openArchive() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available')); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Write a mirror a few seconds after the last change (never on every keystroke). */
  function queueDeviceMirror() {
    if (typeof indexedDB === 'undefined' || mirrorTimer) return;
    mirrorTimer = setTimeout(() => {
      mirrorTimer = null;
      openArchive().then((db) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put({ id: 'latest', savedAt: Date.now(), state: get() });
        tx.oncomplete = () => db.close();
      }).catch(() => { /* no IndexedDB: localStorage is still doing its job */ });
    }, 5000);
  }

  /** Read the device mirror back. Resolves with null when there is none. */
  function restoreFromDevice() {
    return openArchive().then((db) => new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get('latest');
      request.onsuccess = () => {
        db.close();
        const record = request.result;
        if (!record || !record.state) { resolve(null); return; }
        replaceState(record.state, 'import');
        resolve(record);
      };
      request.onerror = () => { db.close(); reject(request.error); };
    }));
  }

  /**
   * Change state and persist it.
   * @param {(state:object) => void} mutator
   * @param {string} reason short tag used by the UI to decide what to re-render
   * @param {{undo?:boolean}} [options] undo:false marks a background/housekeeping
   *   write (like remembering today's greeting) that must not consume an undo
   *   slot — only deliberate user changes belong in the undo history.
   */
  function update(mutator, reason, options) {
    const current = get();
    const opts = options || {};
    if (reason !== 'undo' && opts.undo !== false) pushUndo();
    if (typeof mutator === 'function') mutator(current);
    save();
    emit(reason || 'update');
    return current;
  }

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  }

  function emit(reason) {
    listeners.slice().forEach((fn) => {
      try { fn(state, reason); } catch (err) { console.error('Luvli listener failed', err); }
    });
    document.dispatchEvent(new CustomEvent('luvli:change', { detail: { reason: reason || 'update', state } }));
  }

  /** Replace everything (used by import + reset). */
  function replaceState(next, reason) {
    pushUndo();                       // so a mistaken import can be undone
    state = mergeDeep(defaults(), next);
    save();
    emit(reason || 'replace');
    return state;
  }

  function reset() {
    pushUndo();                       // so an accidental reset can be undone
    localStorage.removeItem(KEY);
    state = defaults();
    save();
    emit('reset');
    return state;
  }

  function exportJSON() {
    return JSON.stringify(get(), null, 2);
  }

  /** Returns true when the text looked like valid Luvli data. */
  function importJSON(text) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') return false;
      replaceState(parsed, 'import');
      return true;
    } catch (err) {
      console.warn('Luvli could not read that file.', err);
      return false;
    }
  }

  /** Quick counts used on the Settings page. */
  function stats() {
    const s = get();
    const bytes = (localStorage.getItem(KEY) || '').length;
    const student = s.student || {};
    return {
      tasks: s.tasks.length,
      backlog: s.backlog.length,
      subjects: s.subjects.length,
      sessions: s.sessions.length,
      checkIns: Object.keys(s.checkIns).length,
      assignments: (student.assignments || []).length,
      exams: (student.exams || []).length,
      notes: (student.notes || []).length,
      cards: (student.cards || []).length,
      sizeKb: Math.max(1, Math.round(bytes / 1024))
    };
  }

  /**
   * Fill today with a realistic sample day — and a little history, so the
   * Progress page has something to show. Used on first run and from Settings.
   * @param {boolean} force replace today's plan even if one already exists
   */
  function seedSampleDay(force) {
    // Load the state first (this shadows the module variable with the very
    // same object, so save() below still persists correctly).
    const state = get();
    const today = Utils.todayKey();
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const toMin = (hhmm) => {
      const parts = String(hhmm).split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    // A gentle, realistic day (straight from the examples in the brief).
    const plan = [
      { name: 'Python study',     category: 'study',    start: '13:00', end: '13:50', priority: 'high',   notes: 'Complete Functions exercises' },
      { name: 'Coffee break',     category: 'break',    start: '13:50', end: '14:00', priority: 'low',    notes: 'Water, stretch, breathe.' },
      { name: 'Portfolio project', category: 'project', start: '14:00', end: '15:00', priority: 'medium', notes: 'Design the case study hero' },
      { name: 'Exercise',         category: 'exercise', start: '16:00', end: '16:30', priority: 'medium', notes: '20 minute workout' },
      { name: 'Dinner',           category: 'food',     start: '19:00', end: '20:00', priority: 'medium', notes: '' },
      { name: 'Wind down',        category: 'selfcare', start: '21:30', end: '22:15', priority: 'low',    notes: 'No screens, skincare, quiet music' }
    ];

    if (force) {
      state.tasks = state.tasks.filter((t) => t.date !== today);
      state.subjects = [];
    } else if (state.seeded && state.tasks.some((t) => t.date === today)) {
      return false; // today is already planned
    }

    plan.forEach((item) => {
      const alreadyFinished = toMin(item.end) <= nowMin;
      state.tasks.push({
        id: Utils.uid('task'),
        date: today,
        name: item.name,
        category: item.category,
        start: item.start,
        end: item.end,
        priority: item.priority,
        notes: item.notes,
        completed: alreadyFinished,
        completedAt: alreadyFinished ? new Date().toISOString() : null,
        createdAt: new Date().toISOString()
      });
    });

    // Study subjects + goals (shared with Student Space, so the school-life
    // details live on the very same object the Study page already uses).
    const stamp = new Date().toISOString();
    const lesson = (day, start, end, room) => ({ day: day, start: start, end: end, room: room || '' });
    const pythonId = Utils.uid('sub');
    state.subjects = [
      { id: pythonId, name: 'Python', emoji: '🐍', goal: 'Learn Functions', progress: 65,
        teacher: 'Dr Ndlovu', notes: 'Weekly quiz on Mondays — bring the laptop.',
        schedule: [lesson('Mon', '09:00', '10:30', 'Lab 2'), lesson('Wed', '11:00', '12:00', 'Lab 2')],
        createdAt: stamp },
      { id: Utils.uid('sub'), name: 'Portfolio', emoji: '🎨', goal: 'Design a case study', progress: 30,
        teacher: 'Ms Adams', notes: 'Studio brief due at the end of term.',
        schedule: [lesson('Tue', '13:00', '15:00', 'Studio')], createdAt: stamp },
      { id: Utils.uid('sub'), name: 'Spanish', emoji: '🎧', goal: '100 new words', progress: 45,
        teacher: 'Señora Ruiz', notes: 'Speaking practice with Ana on Thursdays.',
        schedule: [lesson('Thu', '15:00', '16:00', 'Room 12')], createdAt: stamp }
    ];

    // Student Space: a realistic week, so the dashboard is never a blank page.
    const student = state.student;
    if (force || !student.assignments.length) {
      student.school = student.school || 'University';
      student.assignments = [
        { id: Utils.uid('asg'), subjectId: pythonId, name: 'Functions worksheet', dueDate: today,
          difficulty: 'medium', estimateMinutes: 90, status: 'in-progress',
          notes: 'Questions 1–8', createdAt: stamp, completedAt: null },
        { id: Utils.uid('asg'), subjectId: pythonId, name: 'Data structures report', dueDate: Utils.addDays(today, 3),
          difficulty: 'hard', estimateMinutes: 180, status: 'not-started',
          notes: 'Compare arrays and linked lists with diagrams.', createdAt: stamp, completedAt: null },
        { id: Utils.uid('asg'), subjectId: state.subjects[2].id, name: 'Spanish oral preparation', dueDate: Utils.addDays(today, 7),
          difficulty: 'easy', estimateMinutes: 60, status: 'not-started',
          notes: 'Ten minutes of speaking out loud each day.', createdAt: stamp, completedAt: null }
      ];
      student.exams = [
        { id: Utils.uid('exam'), subjectId: pythonId, name: 'Python exam',
          examDate: Utils.addDays(today, 14), topics: ['Functions', 'Arrays', 'Loops', 'Classes'],
          confidence: 3, notes: 'Past papers available in the library.', createdAt: stamp }
      ];
      student.notes = [
        { id: Utils.uid('note'), subjectId: pythonId, title: 'Functions — the basics',
          body: 'A function is a reusable block of code.\n\n' +
            '• def name(parameters): \n• returns a value with return\n• keep one job per function',
          kind: 'concept', url: '', pinned: true, createdAt: stamp, updatedAt: stamp }
      ];
      student.cards = [
        { id: Utils.uid('card'), subjectId: pythonId, question: 'What is a JavaScript function?',
          answer: 'A reusable block of code that performs a task and can return a value.',
          confidence: 1, seen: 0, right: 0, lastSeen: null, createdAt: stamp },
        { id: Utils.uid('card'), subjectId: pythonId, question: 'What does a Python list do?',
          answer: 'Stores an ordered, changeable collection of items.',
          confidence: 0, seen: 0, right: 0, lastSeen: null, createdAt: stamp }
      ];
    }

    // A few past days with focus time, so streaks and charts look alive
    const pastDays = [
      { offset: -1, minutes: [50, 25], mood: 'good' },
      { offset: -2, minutes: [25], mood: 'okay' },
      { offset: -3, minutes: [50, 50], mood: 'great' },
      { offset: -4, minutes: [25], mood: '' },
      { offset: -5, minutes: [40], mood: '' }
    ];
    pastDays.forEach((day) => {
      const key = Utils.addDays(today, day.offset);
      let total = 0;
      day.minutes.forEach((mins) => {
        total += mins;
        state.sessions.push({
          id: Utils.uid('ses'), subjectId: pythonId, subjectName: 'Python',
          goal: 'Learn Functions', minutes: mins, date: key, type: 'focus',
          endedAt: key + 'T18:00:00.000Z'
        });
      });
      state.focusDays[key] = { minutes: total, sessions: day.minutes.length };
      if (day.mood) state.checkIns[key] = { mood: day.mood, note: '' };
    });

    // Things the user wants to get done (Smart Scheduler / Optimize My Day)
    if (!state.backlog.length) {
      state.backlog = [
        { id: Utils.uid('bl'), name: 'Clean my room', category: 'cleaning', priority: 'medium', duration: 30, status: 'backlog', addedAt: new Date().toISOString() },
        { id: Utils.uid('bl'), name: 'Work on my portfolio', category: 'project', priority: 'high', duration: 60, status: 'backlog', addedAt: new Date().toISOString() },
        { id: Utils.uid('bl'), name: 'Prepare for tomorrow', category: 'personal', priority: 'low', duration: 20, status: 'backlog', addedAt: new Date().toISOString() }
      ];
    }

    if (!state.affirmations.favorites.length) {
      state.affirmations.favorites = ['Small progress is still progress.'];
    }

    state.seeded = true;
    save();
    return true;
  }


  return {
    KEY, defaults, get, save, update, subscribe, emit,
    replaceState, reset, exportJSON, importJSON, stats, seedSampleDay,
    undo, canUndo, undoDepth,
    compactHistory, archivedTotals, restoreFromDevice, migrate
  };
})();
