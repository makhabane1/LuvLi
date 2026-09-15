/* =============================================================================
   personality.js — 💗 My Luvli Style ♡ (the shared engine)
   -----------------------------------------------------------------------------
   One small truth about how a person wants to be supported, stored once and
   read by every other part of Luvli:

     • Styles    — Soft, Coach, Study and Calm Luvli + Custom settings
     • Voice     — communication style, reminder style, celebration lines
     • Avatar    — colours and shapes for the little Luvli character
     • Words     — morning message + affirmations built from goals, mood,
                   habits, challenges and the chosen style
     • Memory    — what Luvli quietly remembers to personalise the next day

   Nothing here touches the DOM at load time and nothing needs app.js, so it can
   be loaded by index.html, personality.html and the coach page alike.

     LuvliStyle.get(state)        -> the resolved preferences (never null)
     LuvliStyle.set('coach')      -> switch style (saved, with history)
     LuvliStyle.voice(state)      -> { greeting, vibe, celebrate, nudge, ... }
     LuvliStyle.avatarHtml(...)   -> the little character as markup
   ========================================================================== */
'use strict';

const LuvliStyle = (() => {

  /* ============================ 1. THE STYLES ============================ */
  const STYLES = [
    {
      key: 'soft',
      name: 'Soft Luvli',
      tagline: 'Gentle, supportive, calm',
      blurb: 'Emotional support first. Encouragement, softness and zero pressure.',
      icon: 'heart',
      accent: 'blush',
      traits: ['Gentle', 'Supportive', 'Calm', 'Encouraging'],
      bestFor: 'Best when you want to feel held while you work.',
      examples: [
        'You are doing beautifully, luv. Let\'s take this one step at a time. ♡',
        'You don\'t need to rush. Progress is progress.'
      ],
      defaults: { communication: 'very-gentle', reminderStyle: 'soft', shape: 'heart', color: 'pink' }
    },
    {
      key: 'coach',
      name: 'Coach Luvli',
      tagline: 'Motivating, focused, accountable',
      blurb: 'A kind push. Goals, next steps and follow-through.',
      icon: 'bolt',
      accent: 'rose',
      traits: ['Motivating', 'Focused', 'Accountability-based'],
      bestFor: 'Best when you want momentum and someone in your corner.',
      examples: [
        'Let\'s get this done. Your future self will thank you.',
        'You have a goal. Let\'s take the next step.'
      ],
      defaults: { communication: 'direct', reminderStyle: 'motivational', shape: 'star', color: 'peach' }
    },
    {
      key: 'study',
      name: 'Study Luvli',
      tagline: 'Academic, organised, focused',
      blurb: 'Sessions, subjects and deadlines kept tidy and on time.',
      icon: 'book',
      accent: 'lilac',
      traits: ['Academic', 'Organized', 'Focused'],
      bestFor: 'Best for students who live in their study plan.',
      examples: [
        'Your next study session starts in 10 minutes. Let\'s prepare.',
        'Today we focus on your most important topic.'
      ],
      defaults: { communication: 'balanced', reminderStyle: 'minimal', shape: 'flower', color: 'lavender' }
    },
    {
      key: 'calm',
      name: 'Calm Luvli',
      tagline: 'Peaceful, balanced, mindful',
      blurb: 'Space to breathe. Balance between ambition and rest.',
      icon: 'leaf',
      accent: 'sage',
      traits: ['Peaceful', 'Balanced', 'Mindful'],
      bestFor: 'Best when the goal is a gentle, sustainable pace.',
      examples: [
        'Let\'s create a calm day that supports your energy.',
        'Remember to take care of yourself while chasing your goals.'
      ],
      defaults: { communication: 'balanced', reminderStyle: 'minimal', shape: 'minimal', color: 'cream' }
    }
  ];

  const KEYS = STYLES.map((style) => style.key);
  const byKey = (key) => STYLES.find((style) => style.key === key) || STYLES[0];
  const style = (key) => byKey(key);

  /* -------------------------- custom settings ---------------------------- */
  const COMMUNICATION = [
    { key: 'very-gentle', label: 'Very gentle', sub: 'Soft, warm, no pressure' },
    { key: 'balanced',  label: 'Balanced',  sub: 'Kind, but clear' },
    { key: 'direct',  label: 'Direct',  sub: 'Short and to the point' },
    { key: 'motivational', label: 'Motivational', sub: 'A push when you need it' }
  ];

  const REMINDERS = [
    { key: 'soft',  label: 'Soft reminders', example: 'Luv, your study session is coming soon. ♡' },
    { key: 'motivational', label: 'Motivational', example: 'Your focus session starts now. Let\'s go!' },
    { key: 'minimal',  label: 'Minimal',  example: 'Study session starting.' }
  ];

  /* The affirmation *style* the feature asks for, layered on top of the
     categories the rest of Luvli already uses (see js/affirmations.js). */
  const AFFIRMATION_STYLES = [
    { key: 'self-love',  label: 'Self-love',  where: 'rest' },
    { key: 'confidence', label: 'Confidence', where: 'confidence' },
    { key: 'career',  label: 'Career',  where: 'success' },
    { key: 'study-motivation', label: 'Study motivation', where: 'studying' },
    { key: 'discipline', label: 'Discipline', where: 'discipline' },
    { key: 'growth',  label: 'Growth',  where: 'growth' }
  ];
  const AFFIRMATION_LABEL = (key) => {
    const found = AFFIRMATION_STYLES.find((item) => item.key === key);
    return found ? found.label : key;
  };
  /** Which of Luvli's built-in categories a style maps onto. */
  const AFFIRMATION_WHERE = (key) => {
    const found = AFFIRMATION_STYLES.find((item) => item.key === key);
    return found ? found.where : key;
  };

  /* ------------------------------- avatar -------------------------------- */
  const AVATAR_COLORS = [
    { key: 'pink',  label: 'Pink',  swatch: '#F2A9C0' },
    { key: 'cream', label: 'Cream', swatch: '#F6DCC0' },
    { key: 'lavender', label: 'Lavender', swatch: '#C0ADEB' },
    { key: 'peach', label: 'Peach', swatch: '#F0A57E' }
  ];

  const AVATAR_SHAPES = [
    { key: 'icon',  label: 'Cute icon',  art: 'heart' },
    { key: 'minimal', label: 'Minimal character', art: 'user' },
    { key: 'flower', label: 'Flower design',  art: 'sprout' },
    { key: 'heart',  label: 'Heart design',  art: 'heart' },
    { key: 'star',  label: 'Star design',  art: 'star' }
  ];

  /* ============================ 2. READING STATE ========================= */
  const KEY = 'luvli.state.v1';   // the one save file the whole app shares

  /** The blank slice, so an older save is always safe to read. */
  function blank() {
    return {
      key: 'soft', chosen: false, onboarding: 0, customised: false,
      overrides: {}, history: [],
      communication: 'balanced', reminderStyle: 'soft',
      affirmations: ['self-love', 'confidence', 'growth'],
      avatar: { color: 'pink', shape: 'heart' },
      memory: {
        greeting: '',          // the morning message Luvli wrote today
        greetingDate: '',      // which day that was
        affirmations: [],      // the personalised lines already shown
        styles: {},            // { coach: 3 } — the styles this person reaches for
        moments: [],           // { text, at } — how the days have read
        promptDismissed: false, // "not now" on the gentle Home-page invitation
        updatedAt: null
      }
    };
  }

  /** Storage is loaded before this file, but read defensively all the same. */
  function store() {
    try {
      if (typeof Storage !== 'undefined' && Storage.get) return Storage.get();
    } catch (err) { /* fall through to an empty read */ }
    return null;
  }

  const slice = (state) => (state && state.personality) || (store() && store().personality) || blank();

  /** Today's style: the user's daily switch wins over their usual choice. */
  function currentKey(state) {
    const data = slice(state);
    const today = (typeof Utils !== 'undefined' && Utils.todayKey) ? Utils.todayKey() : '';
    const override = today ? data.overrides && data.overrides[today] : null;
    const key = override || data.key || 'soft';
    return KEYS.indexOf(key) > -1 ? key : 'soft';
  }

  const isOverridden = (state) => {
    const data = slice(state);
    const today = (typeof Utils !== 'undefined' && Utils.todayKey) ? Utils.todayKey() : '';
    return Boolean(today && data.overrides && data.overrides[today]);
  };

  /** Everything the rest of the app needs, already resolved. */
  function get(state) {
    const data = slice(state);
    const key = currentKey(state);
    const meta = byKey(key);
    const communication = data.communication || meta.defaults.communication;
    return {
      key: key,
      name: meta.name,
      short: meta.name.replace(' Luvli', ''),
      tagline: meta.tagline,
      blurb: meta.blurb,
      icon: meta.icon,
      accent: meta.accent,
      traits: meta.traits,
      examples: meta.examples,
      bestFor: meta.bestFor,
      chosen: Boolean(data.chosen || data.customised),
      onboarding: Number(data.onboarding) || 0,
      customised: Boolean(data.customised),
      overriddenToday: isOverridden(state),
      communication: communication,
      communicationLabel: labelOf(COMMUNICATION, communication),
      reminderStyle: data.reminderStyle || meta.defaults.reminderStyle,
      reminderLabel: labelOf(REMINDERS, data.reminderStyle || meta.defaults.reminderStyle),
      affirmations: (data.affirmations && data.affirmations.length) ? data.affirmations : blank().affirmations,
      // Only the two avatar fields, so nothing else can leak in from the defaults
      avatar: {
        color: (data.avatar && data.avatar.color) || meta.defaults.color,
        shape: (data.avatar && data.avatar.shape) || meta.defaults.shape
      },
      memory: Object.assign(blank().memory, data.memory || {}),
      favourites: topStyles(state, 1)
    };
  }

  function labelOf(list, key) {
    const found = list.find((item) => item.key === key);
    return found ? found.label : list[0].label;
  }

  const communicationLabel = (key) => labelOf(COMMUNICATION, key);
  const reminderLabel = (key) => labelOf(REMINDERS, key);

  /** Which style does this person reach for? Learned from the switches. */
  function topStyles(state, limit) {
    const counts = slice(state).memory && slice(state).memory.styles ? slice(state).memory.styles : {};
    const ranked = Object.keys(counts)
      .filter((key) => KEYS.indexOf(key) > -1)
      .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    if (!ranked.length) ranked.push(currentKey(state));
    return ranked.slice(0, limit || ranked.length);
  }

  /* ============================ 3. WRITING STATE ========================= */
  /**
   * Change the saved preferences through the one shared store, so undo,
   * persistence and every screen's repaint all keep working.
   * @param {(data:object, full:object) => void} mutator
   * @param {string} [reason] the repaint tag (defaults to 'style')
   * @param {{undo?:boolean}} [options] undo:false keeps it out of the undo history
   */
  function update(mutator, reason, options) {
    try {
      if (typeof Storage !== 'undefined' && Storage.update) {
        Storage.update((full) => {
          if (!full.personality) full.personality = blank();
          if (typeof mutator === 'function') mutator(full.personality, full);
        }, reason || 'style', options);
        return get();
      }
    } catch (err) { /* fall through to the plain-localStorage path */ }
    writeDirect(mutator);
    return get();
  }

  /** Used only when Storage is not available at all (an isolated page). */
  function writeDirect(mutator) {
    let full = null;
    try { full = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (err) { full = null; }
    if (!full || typeof full !== 'object') full = { personality: blank() };
    if (!full.personality) full.personality = blank();
    if (typeof mutator === 'function') mutator(full.personality, full);
    try { localStorage.setItem(KEY, JSON.stringify(full)); } catch (err) { /* private mode */ }
  }

  /* ---------------------------- choose a style --------------------------- */
  /**
   * Switch how Luvli supports you.
   * @param {string} key one of KEYS
   * @param {{ remember?:boolean, silent?:boolean }} [options]
   *   remember:true stores it as the usual style ("I'll stay as Coach Luvli").
   *   Default is a gentle one-day switch — "today I need Coach Luvli".
   */
  function set(key, options) {
    if (KEYS.indexOf(key) === -1) return get();
    const opts = options || {};
    const today = (typeof Utils !== 'undefined' && Utils.todayKey) ? Utils.todayKey() : '';
    const remember = Boolean(opts.remember || !today);

    update((data, full) => {
      // A one-day switch never touches the usual style: only the override moves.
      if (remember) {
        if (data.key && data.key !== key) {
          data.history = (data.history || []).slice(-11);
          data.history.push({ from: data.key, to: key, at: stamp() });
        }
        data.key = key;
        data.overrides = {};
        data.chosen = true;
      } else {
        data.overrides = data.overrides || {};
        if (today) data.overrides[today] = key;
      }
      data.memory.styles = data.memory.styles || {};
      data.memory.styles[key] = (data.memory.styles[key] || 0) + 1;
      data.memory.updatedAt = stamp();
      data.memory.greeting = '';           // a new style writes a new morning
      data.memory.greetingDate = '';
      // A first choice also fills in the custom settings it implies.
      const meta = byKey(key);
      if (!data.customised) {
        data.communication = meta.defaults.communication;
        data.reminderStyle = meta.defaults.reminderStyle;
        data.avatar = {
          color: meta.defaults.color,
          shape: meta.defaults.shape
        };
      }
      data.onboarding = Math.max(2, Number(data.onboarding) || 0);
      void full;
    }, 'style');

    return get();
  }

  /** Back to the usual style after a one-day switch. */
  function clearOverride() {
    const today = (typeof Utils !== 'undefined' && Utils.todayKey) ? Utils.todayKey() : '';
    update((data) => {
      if (today && data.overrides) delete data.overrides[today];
      data.memory.greeting = '';
      data.memory.greetingDate = '';
    }, 'style');
    return get();
  }

  function setCommunication(key) {
    update((data) => { data.communication = key; data.customised = true; data.chosen = true; }, 'style');
    return get();
  }
  function setReminderStyle(key) {
    update((data) => { data.reminderStyle = key; data.customised = true; data.chosen = true; }, 'style');
    return get();
  }
  const setAvatarColor = (key) => { update((data) => { data.avatar.color = key; data.customised = true; data.chosen = true; }, 'style'); return get(); };
  const setAvatarShape = (key) => { update((data) => { data.avatar.shape = key; data.customised = true; data.chosen = true; }, 'style'); return get(); };
  const setAvatar = (color, shape) => {
    update((data) => {
      if (color) data.avatar.color = color;
      if (shape) data.avatar.shape = shape;
      data.customised = true; data.chosen = true;
    }, 'style');
    return get();
  };

  /**
   * Toggle one affirmation style on or off. Returns the new list, kept in the
   * order AFFIRMATION_STYLES declares, so ticking something back on puts it
   * where it was rather than at the end.
   */
  function toggleAffirmation(key) {
    const declared = AFFIRMATION_STYLES.map((item) => item.key);
    let next = [];
    update((data) => {
      const list = (data.affirmations || []).slice();
      const at = list.indexOf(key);
      if (at > -1) list.splice(at, 1); else list.push(key);
      data.affirmations = (list.length ? list : ['self-love'])
        .slice()
        .sort((a, b) => declared.indexOf(a) - declared.indexOf(b));
      data.customised = true; data.chosen = true;
      next = data.affirmations.slice();
    }, 'style');
    return next;
  }

  function setOnboarding(step) {
    update((data) => {
      data.onboarding = Number(step) || 0;
      if (Number(step) >= 2) data.chosen = true;
    }, 'style');
  }

  /** Mark the onboarding as done (used by "Start my day"). */
  function finishOnboarding() {
    update((data) => { data.chosen = true; data.onboarding = 2; }, 'style');
    return get();
  }

  /** Forget what Luvli learned about the style (never the style itself). */
  function forgetMemory(state) {
    update((data) => {
      const styles = (data.memory && data.memory.styles) ? data.memory.styles : {};
      data.memory = Object.assign(blank().memory, { styles: styles });
    }, 'style');
    return get();
  }

  /** "Not now" on the gentle invitation on the Home page. */
  function dismissPrompt() {
    update((data) => { data.memory.promptDismissed = true; }, 'style');
    return get();
  }

  /* =============================== 4. VOICE ============================= */
  /**
   * How Luvli sounds for this person: a greeting, a vibe line, a nudge and the
   * words used when something is finished. Nothing here needs the DOM.
   */
  const VOICE = {
    soft: {
      morning: ['Good morning, luv. A new day is waiting for you. ♡', 'Morning, luv. You don\'t have to rush today.'],
      nudge: 'is coming up soon, luv. There is no rush — just a gentle heads-up. ♡',
      starting: 'is starting. You are doing beautifully, luv. ♡',
      celebrate: 'You did it, luv. Look at you.',
      gentleGeneric: 'You are doing beautifully, luv.'
    },
    coach: {
      morning: ['New day, new opportunity. Let\'s make progress.', 'Morning. One goal today — let\'s move it forward.'],
      nudge: 'is next. Your future self will thank you for starting on time.',
      starting: 'starts now. Let\'s go — you have a goal.',
      celebrate: 'Done. That is momentum, keep it.',
      gentleGeneric: 'Let\'s get this done.'
    },
    study: {
      morning: ['Good morning. Let\'s make today\'s learning count.', 'Morning. Today we focus on your most important topic.'],
      nudge: 'starts soon. Gather your notes and we will begin.',
      starting: 'is starting now. One topic at a time.',
      celebrate: 'Session complete. That is real progress on your goals.',
      gentleGeneric: 'Let\'s prepare for your next session.'
    },
    calm: {
      morning: ['Start slowly. Today is yours.', 'Good morning. Let\'s create a calm day that supports your energy.'],
      nudge: 'is coming up. Breathe first, then begin when you are ready.',
      starting: 'is beginning. Move at your own pace.',
      celebrate: 'That is done. Rest is part of it too.',
      gentleGeneric: 'Let\'s take this gently.'
    }
  };

  /** A stable pick per day, so the same morning always reads the same. */
  function seeded(list, salt) {
    if (!list || !list.length) return '';
    const key = String(salt || '') + list.length;
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 100000;
    return list[hash % list.length];
  }

  /** The voice object for the day, with the communication style applied. */
  function voice(state) {
    const prefs = get(state);
    const base = VOICE[prefs.key] || VOICE.soft;
    const today = (typeof Utils !== 'undefined' && Utils.todayKey) ? Utils.todayKey() : 'day';
    const style = prefs.communication;

    // Communication style fine-tunes the *length* and *warmth* of everything.
    const shorten = (text) => String(text).replace(/ ♡/g, '');
    const veryGentle = (text) => String(text).indexOf('luv') > -1 ? text : text + ' ♡';

    const shape = (text) => {
      if (!text) return text;
      // "Direct" and "Motivational" mainly trim the soft padding; the heart stays.
      if (style === 'direct') return text.replace(/\s{2,}/g, ' ').trim();
      if (style === 'motivational') return shorten(text);
      if (style === 'very-gentle') return veryGentle(text);
      return text;
    };

    return {
      key: prefs.key,
      name: prefs.name,
      communication: style,
      morning: shape(seeded(base.morning, today + prefs.key)),
      nudge: shape(base.nudge),
      starting: shape(base.starting),
      celebrate: shape(base.celebrate),
      gentleGeneric: style === 'direct' ? 'Keep going.' : shape(base.gentleGeneric),
      /** A reminder line in the user's chosen reminder style. */
      reminder: (what, minutes) => reminderLine(prefs, what, minutes)
    };
  }

  /** "Luv, your study session is coming soon. ♡" — in the chosen style. */
  function reminderLine(prefs, what, minutes) {
    const label = what || 'Your next thing';
    const away = minutes ? ' in ' + minutes + ' minute' + (minutes === 1 ? '' : 's') : '';
    if (prefs.reminderStyle === 'motivational') {
      return label + ' starts' + away + '. Let\'s go!';
    }
    if (prefs.reminderStyle === 'minimal') {
      return label + ' starting' + away + '.';
    }
    // Soft: the example from the brief — "Luv, your study session is coming soon. ♡"
    const when = minutes ? ' in ' + minutes + ' minute' + (minutes === 1 ? '' : 's') : '';
    return 'Luv, your ' + label.toLowerCase() + ' is coming soon' + when + '. ♡';
  }

  /* ======================= 5. AVATAR (the character) ==================== */
  const COLOR_VARS = {
    pink:  { bg: 'var(--baby-pink)', ring: 'var(--soft-rose)', ink: 'var(--deep-rose)' },
    cream: { bg: 'var(--cream)',  ring: 'var(--accent-peach)', ink: 'var(--deep-rose)' },
    lavender: { bg: 'var(--accent-lilac)', ring: 'var(--soft-rose)', ink: 'var(--ink)' },
    peach: { bg: 'var(--accent-peach)', ring: 'var(--dusty-rose)', ink: 'var(--deep-rose)' }
  };
  const color = (key) => COLOR_VARS[key] || COLOR_VARS.pink;
  const shapeArt = (key) => {
    const found = AVATAR_SHAPES.find((item) => item.key === key);
    return found ? found.art : 'heart';
  };

  /**
   * The little Luvli character.
   * @param {object} prefs the result of get()
   * @param {{ size?:'sm'|'md'|'lg', className?:string, animate?:boolean, title?:string }} [options]
   */
  function avatarHtml(prefs, options) {
    const data = prefs || get();
    const opts = options || {};
    const avatar = data.avatar || blank().avatar;
    const size = opts.size || 'md';
    const classes = ['ls-avatar', 'ls-avatar-' + size, 'ls-shape-' + avatar.shape];
    if (opts.animate !== false) classes.push('is-alive');
    if (opts.className) classes.push(opts.className);
    const label = opts.title || ('Luvli — ' + (data.name || 'Soft Luvli'));
    return '<span class="' + classes.join(' ') + '" data-color="' + avatar.color + '" ' +
      'data-shape="' + avatar.shape + '" role="img" aria-label="' + attr(label) + '">' +
      '<span class="ls-avatar-glow" aria-hidden="true"></span>' +
      // Sizes come from CSS, so pass the icon in without inline dimensions
      '<span class="ls-avatar-art" aria-hidden="true">' + iconMarkup(shapeArt(avatar.shape)) + '</span>' +
      '</span>';
  }

  const attr = (text) => String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const esc = attr;

  /** ico() when icons.js is loaded, otherwise an empty, harmless string. */
  function iconMarkup(name) {
    if (typeof ico === 'function') return ico(name);
    return '';
  }

  /** A wide banner version, for the top of a page. */
  const avatarBannerHtml = (prefs, options) => avatarHtml(prefs, Object.assign({ size: 'lg' }, options || {}));

  /** The style as a small chip: "Soft Luvli". */
  function chipHtml(prefs, options) {
    const data = prefs || get();
    const opts = options || {};
    const classes = 'ls-chip' + (opts.className ? ' + opts.className' : '');
    return '<span class="' + classes + '">' +
      '<span class="ls-chip-dot" data-color="' + (data.avatar ? data.avatar.color : 'pink') + '" aria-hidden="true"></span>' +
      esc(data.name) +
      (data.overriddenToday ? ' <span class="ls-chip-today">today</span>' : '') +
      '</span>';
  }

  /* ==================== 6. PERSONALISED AFFIRMATIONS ==================== */
  /**
   * Affirmations built from this person's real life: goals, mood, habits,
   * challenges and the style they chose. Deterministic per day, so the words
   * are steady rather than random noise.
   */
  const AFFIRMATIONS = {
    'career': [
      'You are building skills that will open new doors.',
      'The work you do today is quietly becoming your career.',
      'You are allowed to want more, and to build it slowly.'
    ],
    'study-motivation': [
      'Every study session brings you closer to your dreams.',
      'One page today is one page you will not have to cram later.',
      'You are learning how to learn — that never stops paying off.'
    ],
    'low-energy': [
      'Resting today helps you continue tomorrow.',
      'A slow day is still a day you showed up for.',
      'Your energy is information, not a flaw.'
    ],
    'confidence': [
      'You are becoming someone you can rely on.',
      'You do not have to feel ready to be capable.',
      'Trust the version of you that keeps trying.'
    ],
    'discipline': [
      'You keep the promises you make to yourself.',
      'Small consistent things are building a life you recognise.',
      'Doing it on an ordinary day is how it becomes who you are.'
    ],
    'growth': [
      'You are allowed to be a work in progress and proud of it.',
      'The person you are becoming is being built right now.',
      'Growing is uncomfortable. That is not the same as wrong.'
    ],
    'self-love': [
      'You are allowed to be gentle with yourself today.',
      'Be as kind to yourself as you are to the people you love.',
      'You are worthy on the days you get nothing done too.'
    ],
    'behind': [
      'Behind is a feeling, not a fact. Let\'s just do the next thing.',
      'A plan that slipped is still a plan. We can reshape it.',
      'Nothing about today is ruined — we can start from right here.'
    ],
    'ahead': [
      'You are ahead of where you were. That is the only comparison that counts.',
      'Look how far you have come quietly. I noticed.',
      'This consistency is becoming your superpower.'
    ]
  };

  /** What is going on for this person right now, in gentle words. */
  function challenges(state) {
    const tags = [];
    const total = (typeof Progress !== 'undefined' && Progress.totals) ? null : null;
    void total;
    const today = (typeof Utils !== 'undefined' && Utils.todayKey) ? Utils.todayKey() : '';
    const checkIn = state && state.checkIns ? state.checkIns[today] : null;
    const mood = checkIn ? checkIn.mood : '';

    if (mood === 'low' || mood === 'exhausted' || mood === 'difficult') tags.push('low-energy');
    if (state && state.student) {
      const assignments = (state.student.assignments || []).filter((item) => item.status !== 'done');
      const late = assignments.filter((item) => item.dueDate && item.dueDate < today);
      if (late.length) tags.push('behind');
      const next = (state.student.exams || []).filter((exam) => exam.examDate >= today)
        .sort((a, b) => (a.examDate < b.examDate ? -1 : 1))[0];
      if (next && (typeof Utils !== 'undefined' && Utils.dayDiff)) {
        const away = Utils.dayDiff(today, next.examDate);
        if (away >= 0 && away <= 14) tags.push('study-motivation');
      }
    }
    if (state && state.settings) {
      const wake = (state.settings.wakeTime || '07:00');
      const now = (typeof Scheduler !== 'undefined' && Scheduler.nowMinutes) ? Scheduler.nowMinutes() : null;
      if (now !== null) {
        const start = Number(String(wake).split(':')[0]) * 60;
        if (now < start) tags.push('discipline');
      }
    }
    return tags;
  }

  /** Career-style goals worth naming in the words Luvli uses. */
  function goalTags(state) {
    const tags = [];
    const subjects = (state && state.subjects) || [];
    subjects.forEach((subject) => {
      const text = (String(subject.name || '') + ' ' + String(subject.goal || '')).toLowerCase();
      if (/cv|portfolio|career|job|interview|work|business|brand|linkedin|freelance/.test(text)) tags.push('career');
      if (/exam|study|revision|course|module|degree|university|school|class|learn/.test(text)) tags.push('study-motivation');
    });
    return tags;
  }

  /** Which affirmation a style reaches for first. */
  const TAG_FOR_STYLE = {
    soft: 'self-love',
    coach: 'discipline',
    study: 'study-motivation',
    calm: 'growth'
  };

  /**
   * A few personalised lines for right now (most relevant first).
   * @returns {Array<{ text:string, tag:string, style:string }>}
   */
  function affirmationList(state, options) {
    const opts = options || {};
    const prefs = get(state);
    const tags = [];
    // One entry per tag, in the order it mattered to this person.
    const addTag = (tag) => { if (tags.indexOf(tag) === -1) tags.push(tag); };
    // An explicitly asked-for tag comes first, then what the day is actually
    // like (a low mood outranks the style's own flavour), then the style.
    if (opts.tag) addTag(opts.tag);
    challenges(state).forEach(addTag);
    if (prefs.key === 'coach') { addTag('career'); addTag('discipline'); }
    if (prefs.key === 'study') { addTag('study-motivation'); addTag('discipline'); }
    if (prefs.key === 'calm') { addTag('growth'); addTag('self-love'); }
    if (prefs.key === 'soft') { addTag('self-love'); addTag('growth'); }
    goalTags(state).forEach(addTag);
    prefs.affirmations.forEach(addTag);
    addTag(TAG_FOR_STYLE[prefs.key] || 'growth');

    // Each line is kept once, in the order it became relevant to this person.
    const out = [];
    const seen = {};
    tags.forEach((tag) => {
      (AFFIRMATIONS[tag] || []).forEach((text) => {
        if (seen[text]) return;
        seen[text] = true;
        out.push({ text: text, tag: tag, style: prefs.key });
      });
    });
    return out;
  }

  /**
   * One line for today — the same one all day unless a change is asked for.
   *
   * The list arrives in priority order (the most relevant things about this
   * person's day first), so the choice is made from the *head* of that list
   * rather than anywhere in it — a low mood will always be answered with a
   * gentle line, not with something about discipline.
   */
  function affirmation(state, options) {
    const opts = options || {};
    const list = affirmationList(state, { tag: opts.tag || '' });
    if (!list.length) return { text: 'Small progress is still progress.', tag: 'growth', style: 'soft' };

    // An explicit tag means "only that kind, please".
    let pool = opts.tag ? list.filter((item) => item.tag === opts.tag) : list;
    if (!pool.length) pool = list;

    if (opts.text) {
      const asked = list.find((item) => item.text === opts.text);
      if (asked) return asked;
    }

    if (opts.exclude && pool.length > 1) {
      const others = pool.filter((item) => item.text !== opts.exclude);
      if (others.length) pool = others;
    }

    // Choose from the most relevant few, so the words stay tied to the day but
    // are not the same sentence every single time.
    const today = (typeof Utils !== 'undefined' && Utils.todayKey) ? Utils.todayKey() : 'day';
    const head = pool.slice(0, Math.min(pool.length, 3));
    return seeded(head, today + (opts.salt || '')) || head[0];
  }

  /** Remember which lines have already been shown today (the AI memory). */
  function rememberAffirmation(state, text) {
    if (!text) return;
    update((data) => {
      const list = (data.memory.affirmations || []).filter((item) => item.text !== text);
      list.unshift({ text: text, at: stamp() });
      data.memory.affirmations = list.slice(0, 30);
      data.memory.updatedAt = stamp();
    }, 'style');
  }

  /* ======================= 7. THE MORNING MESSAGE ======================= */
  /**
   * Today's personalised greeting. Written once per day and remembered, so the
   * Home page does not flicker between sentences.
   */
  function morningMessage(state, options) {
    const opts = options || {};
    const prefs = get(state);
    const today = (typeof Utils !== 'undefined' && Utils.todayKey) ? Utils.todayKey() : '';
    const saved = prefs.memory.greeting && prefs.memory.greetingDate === today ? prefs.memory.greeting : '';
    if (saved && !opts.refresh) return saved;

    // A little of the user's real day goes into the greeting.
    const name = (state && state.profile && state.profile.name) ? state.profile.name : '';
    const hour = new Date().getHours();
    const partOfDay = hour < 12 ? 'morning' : (hour < 17 ? 'afternoon' : 'evening');
    const v = voice(state);
    const line = seeded(VOICE[prefs.key].morning, today + prefs.key + partOfDay);
    const tags = challenges(state).concat(goalTags(state));
    const extras = [];
    if (tags.indexOf('low-energy') > -1) extras.push('No pressure today — we\'ll keep things light.');
    else if (tags.indexOf('behind') > -1) extras.push('Whatever slipped is not a problem. We\'ll reshape the day.');
    else if (tags.indexOf('study-motivation') > -1) extras.push('One focused block is all we need to move your goals.');
    else if (tags.indexOf('career') > -1) extras.push('Let\'s put one small step towards your bigger goal today.');

    // The line already ends in its own punctuation, so the name follows gently.
    const base = String(line).replace(/\s+$/, '');
    const text = base
      + (name && opts.withName !== false ? ' ' + name + ' ♡' : ' ♡')
      + (extras.length ? ' ' + extras[0] : '');
    // "Direct" trims the wording, never the warmth — the little heart stays.
    const clean = v.communication === 'direct' ? text.replace(/\s{2,}/g, ' ') : text;
    // Housekeeping: writing today's greeting is not something the user chose,
    // so it must not take an undo slot (that would swallow the undo of a real
    // action, like a reset, that happened just before the first repaint).
    update((data) => {
      data.memory.greeting = clean;
      data.memory.greetingDate = today;
      data.memory.moments = (data.memory.moments || []).slice(-29);
      data.memory.moments.push({ text: clean, at: stamp() });
      data.memory.updatedAt = stamp();
    }, 'style', { undo: false });
    return clean;
  }

  /** The short line under the hero card, in this person's voice. */
  function heroTagline(state) {
    const prefs = get(state);
    const today = (typeof Utils !== 'undefined' && Utils.todayKey) ? Utils.todayKey() : 'day';
    const lines = {
      soft: '“You are doing beautifully, luv. One step at a time.”',
      coach: '“Your future self is watching. Let\'s move.”',
      study: '“Today we focus on your most important topic.”',
      calm: '“Let\'s create a calm day that supports your energy.”'
    };
    void today;
    return lines[prefs.key] || lines.soft;
  }

  /* ============================ 8. MEMORY =============================== */
  /** Everything Luvli is remembering about this person, ready to display. */
  function memorySummary(state) {
    const prefs = get(state);
    const memory = prefs.memory || blank().memory;
    const name = (state && state.profile && state.profile.name) || 'luv';
    const counts = memory.styles || {};
    const ranked = Object.keys(counts)
      .filter((key) => KEYS.indexOf(key) > -1)
      .sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
      .map((key) => ({ key: key, name: style(key).name, count: counts[key] }));
    const tag = (typeof Progress !== 'undefined' && Progress.totals) ? null : null;
    void tag;

    return {
      name: name,
      styleName: prefs.name,
      communication: prefs.communicationLabel,
      reminder: prefs.reminderLabel,
      affirmations: prefs.affirmations.map(AFFIRMATION_LABEL),
      avatarColor: (AVATAR_COLORS.find((item) => item.key === prefs.avatar.color) || AVATAR_COLORS[0]).label,
      avatarShape: (AVATAR_SHAPES.find((item) => item.key === prefs.avatar.shape) || AVATAR_SHAPES[0]).label,
      greeting: memory.greeting || '',
      greetingDate: memory.greetingDate || '',
      shown: (memory.affirmations || []).slice(0, 6),
      moments: (memory.moments || []).slice(-6).reverse(),
      switches: ranked,
      favourite: ranked.length ? ranked[0].name : prefs.name,
      summary: summaryLine(state, prefs, ranked)
    };
  }

  /** One honest sentence describing how Luvli has adapted. */
  function summaryLine(state, prefs, ranked) {
    const bits = [];
    bits.push('You are using ' + prefs.name + '.');
    if (ranked && ranked.length > 1) {
      bits.push('You reach for ' + ranked[0].name + ' most often' +
        (ranked[1] ? ', then ' + ranked[1].name : '') + '.');
    }
    bits.push('Luvli talks in a ' + prefs.communicationLabel.toLowerCase() +
      ' way and uses ' + prefs.reminderLabel.toLowerCase() + '.');
    if (state && state.student && state.student.enabled) {
      bits.push('Student Mode and Focus Mode will follow this style.');
    }
    return bits.join(' ');
  }

  /* ======================= 9. HOW THE APP ADAPTS ======================== */
  /**
   * Anything another feature should tune, all in one place, so nothing else
   * has to know how a style is built.
   */
  function adapters(state) {
    const prefs = get(state);
    const key = prefs.key;
    return {
      key: key,
      // Focus Mode: how long a session starts at, and how loud the celebration
      focusLength: key === 'study' ? 50 : (key === 'coach' ? 40 : prefs.key === 'calm' ? 25 : 25),
      celebrateLoudly: key === 'coach',
      // Student Mode: whether the study dashboard takes the lead
      studentFirst: key === 'study',
      // Notifications: the words, pulled from the chosen reminder style
      notificationLead: prefs.reminderStyle === 'minimal' ? 5 : (key === 'coach' ? 5 : 10),
      // Mood Tracking: a low mood always softens a coach-style day
      softenOnLowMood: true,
      // Reflection Journal & Progress: whether the words stay short
      keepShort: prefs.communication === 'direct',
      // Affirmation categories the rest of Luvli should draw from
      affirmationCategories: prefs.affirmations.map(AFFIRMATION_WHERE)
    };
  }

  /* A time-stamp helper that never throws in an odd environment. */
  function stamp() {
    try { return new Date().toISOString(); } catch (err) { return ''; }
  }

  /* ------------------------------- exports -------------------------------- */
  return {
    KEY, STYLES, KEYS, COMMUNICATION, REMINDERS, AFFIRMATION_STYLES, AVATAR_COLORS, AVATAR_SHAPES,
    style, byKey, blank,
    get, currentKey, isOverridden, topStyles, slice,
    set, clearOverride, setCommunication, setReminderStyle,
    setAvatarColor, setAvatarShape, setAvatar, toggleAffirmation,
    setOnboarding, finishOnboarding, forgetMemory, dismissPrompt,
    voice, reminderLine, reminderLabel, communicationLabel,
    avatarHtml, avatarBannerHtml, chipHtml, shapeArt, color,
    affirmation, affirmationList, rememberAffirmation, AFFIRMATION_LABEL, AFFIRMATION_WHERE,
    challenges, goalTags,
    morningMessage, heroTagline,
    memorySummary, adapters,
    esc
  };
})();
