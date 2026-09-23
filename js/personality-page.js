/* =============================================================================
   personality-page.js — 💗 My Luvli Style ♡ (the screens)
   -----------------------------------------------------------------------------
   Three little experiences on one page:

     • Onboarding   Welcome → choose a personality → make it yours
     • Dashboard    Today's Luvli, today's affirmation, what Luvli remembers
     • Switcher     "Today I need Coach Luvli" — a one-day change

   All the reading and writing goes through LuvliStyle (js/personality.js), so
   this file only ever deals with rendering and clicks. It defines its own tiny
   UI helpers, exactly like the Vision Board and the AI Coach do, so it never
   depends on app.js being loaded.
   ========================================================================== */
'use strict';

/* ------------------------------ DOM helpers ------------------------------ */
function lsId(id) { return document.getElementById(id); }
function lsAll(selector, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}
const GO = 'index.html';
const esc = LuvliStyle.esc;

/* ================================= UI =================================== */
const LsUI = (() => {

  /* ------------------------------- toasts -------------------------------- */
  function toast(options) {
    const opts = typeof options === 'string' ? { body: options } : (options || {});
    const stack = lsId('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML =
      '<span class="toast-ico">' + ico(opts.icon || 'heart') + '</span>' +
      '<div class="toast-text">' +
      '<div class="toast-title">' + esc(opts.title || 'Luvli') + '</div>' +
      (opts.body ? '<div class="toast-body">' + esc(opts.body) + '</div>' : '') +
      '</div>';
    stack.appendChild(el);
    while (stack.children.length > 4) stack.removeChild(stack.firstChild);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 320);
    }, opts.duration || 5200);
  }

  /* ------------------------------- modals -------------------------------- */
  let openBackdrop = null;
  let lastFocused = null;

  function actionButton(action) {
    const attrs = action.attrs ? ' ' + action.attrs : '';
    return '<button class="btn btn-' + (action.variant || 'soft') + '" type="button" ' +
      'data-action="' + action.action + '"' + attrs + '>' + action.label + '</button>';
  }

  function modal(options) {
    const opts = options || {};
    closeModal();
    const root = lsId('modalRoot');
    if (!root) return null;

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
    document.addEventListener('keydown', onEscape);
    return backdrop;
  }

  function onEscape(event) { if (event.key === 'Escape') closeModal(); }

  function closeModal() {
    if (!openBackdrop) return;
    openBackdrop.remove();
    openBackdrop = null;
    document.removeEventListener('keydown', onEscape);
    if (lastFocused && lastFocused.focus) {
      try { lastFocused.focus(); } catch (err) { /* the element has gone */ }
    }
    lastFocused = null;
  }

  /* --------------------- floating hearts & sparkles ---------------------- */
  const FX = ['♥', '♡', '✿', '·', '✦'];

  /** A quiet drift of soft marks rising from a point on the screen. */
  function burst(x, y, count) {
    if (document.documentElement.classList.contains('reduce-motion')) return;
    const layer = lsId('fxLayer');
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

  /** Burst from the middle of an element (used when a style is chosen). */
  function burstFrom(target, count) {
    if (!target || !target.getBoundingClientRect) { burst(null, null, count); return; }
    const rect = target.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top + rect.height / 2, count);
  }

  return { toast, modal, closeModal, burst, burstFrom };
})();

/* ============================ My Luvli Style ============================ */
const PersonalityPage = (() => {

  const state = () => Storage.get();

  /* Where on the page we are: welcome → choose → custom → home → switch */
  const view = { step: 'welcome', pending: '' };

  /* What each style means for the rest of Luvli. Kept here (not in the engine)
     because it is copy, not logic. */
  const CONNECTIONS = [
    { icon: 'bolt', name: 'AI Life Coach', note: 'The coach answers in your style — gentle, driven, focused or calm.' },
    { icon: 'bell', name: 'Notifications', note: 'Reminders use the words you picked, with your lead time.' },
    { icon: 'heart', name: 'Affirmations', note: 'Affirmations are written from your goals, mood and habits.' },
    { icon: 'calendar', name: 'Smart Scheduler', note: 'Celebrations match your style — quiet, or a real push.' },
    { icon: 'droplet', name: 'Mood Tracking', note: 'A low day softens everything, whatever your style.' },
    { icon: 'graduation', name: 'Student Mode', note: 'Study Luvli puts your subjects and deadlines first.' },
    { icon: 'sparkles', name: 'Focus Mode', note: 'Session length and the focus affirmation follow your style.' },
    { icon: 'note', name: 'Reflection Journal', note: 'Nightly words stay short or warm, as you asked.' }
  ];

  /* -------------------------- the four styles ---------------------------- */
  function styleCardHtml(meta, options) {
    const opts = options || {};
    const selected = opts.selectedKey === meta.key ? ' is-selected' : '';
    const active = opts.activeKey === meta.key ? ' is-active' : '';
    const pressed = (opts.selectedKey === meta.key || opts.activeKey === meta.key) ? 'true' : 'false';
    return '<button class="ls-style-card' + selected + active + '" type="button" data-style="' + meta.key + '" ' +
      'data-action="' + opts.action + '" data-key="' + meta.key + '" ' +
      'aria-pressed="' + pressed + '">' +
      '<span class="ls-style-pick" aria-hidden="true">✓</span>' +
      '<span class="ls-style-top">' +
      LuvliStyle.avatarHtml({
        name: meta.name,
        avatar: { color: meta.defaults.color, shape: meta.defaults.shape }
      }, { size: 'md', animate: false }) +
      '<span>' +
      '<span class="ls-style-name">' + esc(meta.name) + '</span><br>' +
      '<span class="ls-style-tagline">' + esc(meta.tagline) + '</span>' +
      '</span>' +
      '</span>' +
      '<span class="ls-style-blurb">' + esc(meta.blurb) + '</span>' +
      '<span class="ls-style-traits">' + meta.traits.map((trait) =>
        '<span class="chip chip-soft">' + esc(trait) + '</span>').join('') + '</span>' +
      '<span class="ls-style-examples">' + meta.examples.map((line) =>
        '<span class="ls-style-example">“' + esc(line) + '”</span>').join('') + '</span>' +
      '<span class="ls-style-bestfor">' + esc(meta.bestFor) + '</span>' +
      '</button>';
  }

  function renderStyleGrids() {
    const prefs = LuvliStyle.get(state());
    const choose = lsId('lsStyleGrid');
    if (choose) {
      choose.innerHTML = LuvliStyle.STYLES.map((meta) => styleCardHtml(meta, {
        selectedKey: view.pending || prefs.key,
        action: 'style-pick'
      })).join('');
    }

    const today = lsId('lsTodayGrid');
    if (today) {
      today.innerHTML = LuvliStyle.STYLES.map((meta) =>
        '<button class="ls-mini-card' + (prefs.key === meta.key ? ' is-active' : '') + '" type="button" ' +
        'data-action="style-today-set" data-key="' + meta.key + '" ' +
        'aria-pressed="' + (prefs.key === meta.key ? 'true' : 'false') + '">' +
        '<span class="ls-mini-top">' +
        LuvliStyle.avatarHtml({
          name: meta.name, avatar: { color: meta.defaults.color, shape: meta.defaults.shape }
        }, { size: 'sm', animate: false }) +
        '<span class="ls-mini-name">' + esc(meta.name.replace(' Luvli', '')) + '</span>' +
        '</span>' +
        '<span class="ls-mini-sub">' + esc(meta.tagline.split(',')[0]) + '</span>' +
        '</button>').join('');
    }

    const switcher = lsId('lsSwitchGrid');
    if (switcher) {
      switcher.innerHTML = LuvliStyle.STYLES.map((meta) => styleCardHtml(meta, {
        activeKey: prefs.key,
        action: 'style-switch-set'
      })).join('');
    }
  }

  /* ------------------------ custom settings screens ---------------------- */
  function optionHtml(item, selected, action, key) {
    const on = selected === key ? ' is-on' : '';
    return '<button class="ls-option' + on + '" type="button" role="radio" ' +
      'aria-checked="' + (selected === key ? 'true' : 'false') + '" ' +
      'data-action="' + action + '" data-key="' + key + '">' +
      '<span class="ls-option-mark" aria-hidden="true">✓</span>' +
      '<span class="ls-option-text">' +
      '<span class="ls-option-label">' + esc(item.label) + '</span>' +
      '<span class="ls-option-sub">' + esc(item.sub || item.example || '') + '</span>' +
      (item.example && item.sub ? '<span class="ls-option-example">“' + esc(item.example) + '”</span>' : '') +
      '</span>' +
      '</button>';
  }

  function renderCustom() {
    const prefs = LuvliStyle.get(state());

    const comms = lsId('lsCommsList');
    if (comms) {
      comms.innerHTML = LuvliStyle.COMMUNICATION.map((item) =>
        optionHtml(item, prefs.communication, 'style-communication', item.key)).join('');
    }

    const reminders = lsId('lsReminderList');
    if (reminders) {
      reminders.innerHTML = LuvliStyle.REMINDERS.map((item) =>
        optionHtml(item, prefs.reminderStyle, 'style-reminder', item.key)).join('');
    }

    const chips = lsId('lsAffirmationChips');
    if (chips) {
      chips.innerHTML = LuvliStyle.AFFIRMATION_STYLES.map((item) => {
        const on = prefs.affirmations.indexOf(item.key) > -1;
        return '<button class="chip-item' + (on ? ' is-on' : '') + '" type="button" ' +
          'aria-pressed="' + (on ? 'true' : 'false') + '" ' +
          'data-action="style-affirm-toggle" data-key="' + item.key + '">' +
          '<span>' + esc(item.label) + '</span>' +
          '<span class="chip-x" aria-hidden="true">' + (on ? '✓' : '+') + '</span>' +
          '</button>';
      }).join('');
    }

    const colors = lsId('lsColorRow');
    if (colors) {
      colors.innerHTML = LuvliStyle.AVATAR_COLORS.map((item) =>
        '<button class="ls-swatch' + (prefs.avatar.color === item.key ? ' is-on' : '') + '" type="button" ' +
        'role="radio" aria-checked="' + (prefs.avatar.color === item.key ? 'true' : 'false') + '" ' +
        'data-action="style-avatar-color" data-key="' + item.key + '" ' +
        'style="--swatch:' + item.swatch + '" aria-label="' + esc(item.label) + ' colour">' +
        '<span class="ls-swatch-label">' + esc(item.label) + '</span>' +
        '</button>').join('');
    }

    const shapes = lsId('lsShapeRow');
    if (shapes) {
      shapes.innerHTML = LuvliStyle.AVATAR_SHAPES.map((item) =>
        '<button class="ls-shape' + (prefs.avatar.shape === item.key ? ' is-on' : '') + '" type="button" ' +
        'role="radio" aria-checked="' + (prefs.avatar.shape === item.key ? 'true' : 'false') + '" ' +
        'data-action="style-avatar-shape" data-key="' + item.key + '">' +
        ico(item.art) + ' ' + esc(item.label) +
        '</button>').join('');
    }
  }

  /* ------------------------------- dashboard ----------------------------- */
  function renderAvatarStages() {
    const prefs = LuvliStyle.get(state());
    ['lsWelcomeAvatar', 'lsAvatarStage', 'lsHomeAvatar', 'lsTitleAvatar'].forEach((id) => {
      const el = lsId(id);
      if (!el) return;
      el.innerHTML = LuvliStyle.avatarHtml(prefs, { size: id === 'lsTitleAvatar' ? 'sm' : 'lg' });
    });
  }

  function renderHome() {
    const prefs = LuvliStyle.get(state());
    const data = state();

    setText('lsHomeName', prefs.name);
    setText('lsHomeTagline', prefs.tagline);
    setText('lsTopChip', prefs.name + (prefs.overriddenToday ? ' · today' : ''));
    setText('lsTitleSub', 'Your day. Your goals. Your Luvli.');

    // The morning message is written once per day and remembered
    const greeting = LuvliStyle.morningMessage(data);
    setText('lsMorning', greeting);

    setHtml('lsTraitChips', prefs.traits.map((trait) =>
      '<span class="chip chip-soft">' + esc(trait) + '</span>').join('') +
      '<span class="ls-chip">' + prefs.communicationLabel + ' · ' + prefs.reminderLabel + '</span>');

    renderAffirmation();
    renderMemory();

    const connections = lsId('lsConnections');
    if (connections) {
      connections.innerHTML = CONNECTIONS.map((item) =>
        '<div class="ls-connect">' +
        '<span class="ls-connect-ico">' + ico(item.icon) + '</span>' +
        '<span>' +
        '<span class="ls-connect-name">' + esc(item.name) + '</span>' +
        '<span class="ls-connect-note">' + esc(item.note) + '</span>' +
        '</span>' +
        '</div>').join('');
    }

    const hint = lsId('lsSwitchHint');
    if (hint) {
      hint.textContent = prefs.overriddenToday
        ? 'Today only — ' + prefs.name + ' is active'
        : 'Only for today';
    }
  }

  /** Today's personalised affirmation, with its tag for context. */
  function renderAffirmation(pick) {
    const data = state();
    const line = pick || LuvliStyle.affirmation(data);
    setText('lsAffirmTag', LuvliStyle.AFFIRMATION_LABEL(line.tag));
    setText('lsAffirmBig', '“' + line.text + '”');
    LuvliStyle.rememberAffirmation(data, line.text);
    view.phrase = line.text;
  }

  /** What Luvli is quietly remembering. */
  function renderMemory() {
    const box = lsId('lsMemory');
    if (!box) return;
    const prefs = LuvliStyle.get(state());
    const summary = LuvliStyle.memorySummary(state());

    const row = (icon, key, value) =>
      '<div class="ls-memory-row">' +
      '<span class="ls-memory-ico">' + ico(icon) + '</span>' +
      '<span><span class="ls-memory-key">' + esc(key) + '</span> ' + value + '</span>' +
      '</div>';

    const html = [
      row('heart', 'Style', esc(summary.styleName)),
      row('note', 'How to talk to you', esc(prefs.communicationLabel)),
      row('bell', 'Reminders', esc(prefs.reminderLabel)),
      row('sparkles', 'Affirmations', esc(summary.affirmations.join(', '))),
      row('palette', 'Character', esc(summary.avatarColor + ' · ' + summary.avatarShape))
    ];

    if (summary.switches.length) {
      html.push(row('chart', 'Reaches for',
        esc(summary.switches.map((item) => item.name + ' ×' + item.count).join(', '))));
    }
    if (summary.greeting) {
      html.push(row('sun', 'This morning', '<span class="ls-memory-quote">“' + esc(summary.greeting) + '”</span>'));
    }
    if (summary.shown.length) {
      html.push(row('star', 'Lines shown', esc(summary.shown.slice(0, 3).map((item) => '“' + item.text + '”').join(' '))));
    }

    box.innerHTML = html.join('') +
      '<p class="card-hint mt-12">' + esc(summary.summary) + '</p>';
  }

  /* ------------------------------ navigation ----------------------------- */
  const STEPS = ['welcome', 'choose', 'custom', 'home', 'switch'];
  const STEP_IDS = {
    welcome: 'lsStepWelcome',
    choose: 'lsStepChoose',
    custom: 'lsStepCustom',
    home: 'lsStepHome',
    switch: 'lsStepSwitch'
  };

  function go(step) {
    if (STEPS.indexOf(step) === -1) step = 'home';
    view.step = step;
    STEPS.forEach((name) => {
      const el = lsId(STEP_IDS[name]);
      if (el) el.hidden = name !== step;
    });

    const next = lsId('lsChooseNext');
    if (next) next.disabled = !view.pending && !LuvliStyle.get(state()).chosen;

    const chip = lsId('lsChooseChip');
    if (chip) chip.textContent = 'Step 1 of 2';
    const customChip = lsId('lsCustomChip');
    if (customChip) customChip.textContent = 'Step 2 of 2';

    if (step === 'choose') renderStyleGrids();
    if (step === 'custom') { renderCustom(); renderAvatarStages(); }
    if (step === 'home') { renderAvatarStages(); renderHome(); renderStyleGrids(); }
    if (step === 'switch') { renderStyleGrids(); renderAvatarStages(); }

    announce(step);
    window.scrollTo(0, 0);
  }

  function announce(step) {
    const lines = {
      welcome: 'Welcome to My Luvli Style.',
      choose: 'How would you like Luvli to support you? Four styles to choose from.',
      custom: 'Make Luvli sound like yours: communication, reminders, affirmations and your character.',
      home: 'Your Luvli style is saved. Luvli will follow it everywhere.',
      switch: 'Today I need — choose a style for today only.'
    };
    setText('lsAnnouncer', lines[step] || '');
  }

  function setText(id, text) {
    const el = lsId(id);
    if (el) el.textContent = text;
  }
  function setHtml(id, html) {
    const el = lsId(id);
    if (el) el.innerHTML = html;
  }

  /* ------------------------------ the actions ---------------------------- */
  /** Choose a personality during onboarding. */
  function pickStyle(key) {
    view.pending = key;
    renderStyleGrids();
    const card = document.querySelector('.ls-style-card[data-key="' + key + '"]');
    if (card) {
      card.classList.add('is-applying');
      LsUI.burstFrom(card, 7);
      setTimeout(() => card.classList.remove('is-applying'), 700);
    }
    const next = lsId('lsChooseNext');
    if (next) next.disabled = false;
  }

  /** Apply the chosen style for good. */
  function saveStyle() {
    const key = view.pending || LuvliStyle.get(state()).key;
    LuvliStyle.set(key, { remember: true });
    LuvliStyle.finishOnboarding();
    view.pending = '';
    LsUI.burst(null, null, 12);
    LsUI.toast({
      icon: 'heart',
      title: 'Saved — ' + LuvliStyle.get(state()).name,
      body: 'Luvli will support you this way everywhere.'
    });
    go('home');
  }

  /** A one-day switch: "Today I need Coach Luvli." */
  function setTodayStyle(key) {
    LuvliStyle.set(key, { remember: false });
    const prefs = LuvliStyle.get(state());
    LsUI.burst(null, null, 8);
    LsUI.toast({
      icon: 'sparkles',
      title: 'Today: ' + prefs.name,
      body: 'Tomorrow Luvli goes back to your usual style.'
    });
    if (view.step === 'switch') go('home');
    else renderHome();
    renderStyleGrids();
  }

  /** Make today's choice the usual one. */
  function keepTodayStyle() {
    const prefs = LuvliStyle.get(state());
    if (!prefs.overriddenToday) {
      LsUI.toast({ icon: 'heart', title: 'Already your usual style', body: prefs.name + ' is saved for every day.' });
      return;
    }
    LuvliStyle.set(prefs.key, { remember: true });
    LsUI.toast({ icon: 'check-circle', title: 'Made it usual', body: prefs.name + ' is now your everyday style.' });
    renderHome();
  }

  function forgetMemory() {
    LsUI.modal({
      title: 'Forget what Luvli learned?',
      sub: 'Your style stays exactly as it is.',
      bodyHtml: '<p class="card-note">Luvli will clear the lines it has shown you and which styles ' +
        'you reach for. It will keep your chosen style, your words and your character.</p>',
      actions: [
        { label: 'Never mind', action: 'modal-cancel', variant: 'ghost' },
        { label: 'Yes, forget it', action: 'style-forget-confirm', variant: 'primary' }
      ]
    });
  }

  function confirmForget() {
    LuvliStyle.forgetMemory();
    LsUI.closeModal();
    renderHome();
    LsUI.toast({ icon: 'sparkles', title: 'A fresh page', body: 'Luvli will learn how you like to be supported all over again.' });
  }

  /** Another personalised affirmation. */
  function shuffleAffirmation() {
    const line = LuvliStyle.affirmation(state(), { exclude: view.phrase, salt: String(Date.now()) });
    renderAffirmation(line);
    LsUI.burst(lsId('lsAffirmBig'), null, 5);
    announce('New affirmation: ' + line.text);
  }

  function saveAffirmation() {
    const text = view.phrase;
    if (!text) return;
    if (Affirmations.isFavorite(state(), text)) {
      LsUI.toast({ icon: 'heart', title: 'Already saved, luv', body: 'You can find it on your Affirmations page.' });
      return;
    }
    Storage.update((draft) => {
      draft.affirmations.favorites.unshift({ text: text, category: 'mine' });
    }, 'affirmations');
    LsUI.burst(null, null, 8);
    LsUI.toast({ icon: 'heart', title: 'Saved to your favourites', body: 'Your words, safe for the days you need them.' });
  }

  /* ---------------------------- the action switch ------------------------ */
  function onAction(event) {
    const button = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
    if (!button) return;
    const action = button.getAttribute('data-action');
    const key = button.getAttribute('data-key') || '';

    switch (action) {
      /* onboarding */
      case 'style-pick': pickStyle(key); break;
      case 'style-communication': LuvliStyle.setCommunication(key); renderCustom(); break;
      case 'style-reminder': LuvliStyle.setReminderStyle(key); renderCustom(); break;
      case 'style-affirm-toggle': LuvliStyle.toggleAffirmation(key); renderCustom(); break;
      case 'style-avatar-color': LuvliStyle.setAvatarColor(key); renderCustom(); renderAvatarStages(); break;
      case 'style-avatar-shape': LuvliStyle.setAvatarShape(key); renderCustom(); renderAvatarStages(); break;

      /* dashboard */
      case 'style-today': go('switch'); break;
      case 'style-today-set': setTodayStyle(key); break;
      case 'style-switch': go('switch'); break;
      case 'style-switch-set': setTodayStyle(key); break;
      case 'style-keep': keepTodayStyle(); break;
      case 'style-affirm': shuffleAffirmation(); break;
      case 'style-affirm-save': saveAffirmation(); break;
      case 'style-forget': forgetMemory(); break;
      case 'style-forget-confirm': confirmForget(); break;

      /* the shared modal close */
      case 'modal-cancel': LsUI.closeModal(); break;
      default: break;
    }
  }

  /* -------------------------------- wiring ------------------------------- */
  function wire() {
    on('lsStartBtn', () => go('choose'));
    on('lsBackToWelcome', () => go('welcome'));
    on('lsBackToChoose', () => go('choose'));
    on('lsChooseNext', () => go('custom'));
    on('lsFinishBtn', saveStyle);
    on('lsSwitchBack', () => go('home'));

    document.addEventListener('click', onAction);

    // Keep the whole page in step with your theme + reduce-motion settings
    Storage.subscribe(() => applySkin());
    applySkin();
  }

  function on(id, handler) {
    const el = lsId(id);
    if (el) el.addEventListener('click', handler);
  }

  /** Follow the Luvli theme and the reduce-motion preference. */
  function applySkin() {
    const settings = (state().settings) || {};
    document.documentElement.setAttribute('data-theme', settings.theme || 'rose');
    document.documentElement.classList.toggle('reduce-motion', Boolean(settings.reduceMotion));
  }

  /* --------------------------------- init -------------------------------- */
  let wired = false;
  function init() {
    if (!wired) { wire(); wired = true; }   // attach the buttons + the action listener once
    applySkin();

    // First visit ever: start at the welcome. Otherwise, straight to the day.
    const prefs = LuvliStyle.get(state());
    const firstRun = !prefs.chosen;
    view.pending = prefs.key;

    go(firstRun ? 'welcome' : 'home');

    if (firstRun) {
      setTimeout(() => LsUI.toast({
        icon: 'heart',
        title: 'Welcome to My Luvli Style',
        body: 'Two quick questions and Luvli will know how to support you.'
      }), 800);
    }
  }

  return { init, go, onAction, renderHome, setText };
})();

/* Boot — the scripts sit at the end of the page, so the DOM is ready. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', PersonalityPage.init);
} else {
  PersonalityPage.init();
}
