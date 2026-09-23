/* ==========================================================================
   Luvli ♡ — js/signup.js
   --------------------------------------------------------------------------
   The create-account flow for signup.html, in two stages:

     1. the form    — name, email, password, confirm, terms
     2. onboarding  — focus areas, hours, style, reminders, goals

   Everything real (accounts, hashing, preferences) lives in js/auth.js; every
   shared form behaviour lives in js/auth-ui.js. This file only wires the two
   together for this page.
   ========================================================================== */
'use strict';

(() => {

  /* The onboarding choices, kept here because they are this page's copy. */
  const FOCUS_OPTIONS = [
    { key: 'study', icon: 'book', label: 'Studying' },
    { key: 'work', icon: 'briefcase', label: 'Work & projects' },
    { key: 'health', icon: 'activity', label: 'Health & fitness' },
    { key: 'mind', icon: 'brain', label: 'Calm & wellbeing' },
    { key: 'create', icon: 'palette', label: 'Creative work' },
    { key: 'balance', icon: 'scale', label: 'Balance & rest' }
  ];

  const STYLE_OPTIONS = [
    { key: 'focused', icon: 'target', label: 'Deep focus', hint: 'longer blocks' },
    { key: 'balanced', icon: 'compass', label: 'Balanced', hint: 'a steady mix' },
    { key: 'flexible', icon: 'shuffle', label: 'Flexible', hint: 'short, movable tasks' }
  ];

  const REMINDER_OPTIONS = [
    { key: 'off', icon: 'bell-off', label: 'Quiet' },
    { key: 'minimal', icon: 'bell', label: 'Just the essentials' },
    { key: 'gentle', icon: 'heart', label: 'Gentle nudges' },
    { key: 'eager', icon: 'megaphone', label: 'Keep me on it' }
  ];

  /* What the person has chosen so far. */
  const answers = {
    focus: [],
    wakeTime: '07:00',
    sleepTime: '22:30',
    style: 'balanced',
    reminders: 'gentle',
    goals: ''
  };

  let step = 0;
  const STEPS = 4;

  /* --------------------------------------------------------------- helpers */

  const $ = (id) => document.getElementById(id);
  function announce(message) {
    const el = $('authAnnouncer');
    if (el) el.textContent = message;
  }

  /** Build one row of choice chips and wire the toggling. */
  function choiceChips(hostId, options, opts) {
    const host = $(hostId);
    if (!host) return;
    const settings = opts || {};
    host.innerHTML = options.map((option) =>
      '<button class="onb-choice' + (isChosen(settings.key, option.key) ? ' is-on' : '') + '" ' +
      'type="button" role="' + (settings.multi ? 'checkbox' : 'radio') + '" ' +
      'aria-checked="' + (isChosen(settings.key, option.key) ? 'true' : 'false') + '" ' +
      'data-value="' + option.key + '">' +
      '<span data-ico="' + option.icon + '" aria-hidden="true"></span>' + option.label +
      (option.hint ? ' <span class="onb-hint">' + option.hint + '</span>' : '') +
      '</button>').join('');

    host.querySelectorAll('.onb-choice').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-value');
        if (settings.multi) {
          const index = answers[settings.key].indexOf(value);
          if (index > -1) answers[settings.key].splice(index, 1);
          else answers[settings.key].push(value);
        } else {
          answers[settings.key] = value;
        }
        paintChoices(hostId, options, settings);
      });
    });

    if (typeof hydrateIcons === 'function') hydrateIcons(host);
  }

  function isChosen(key, value) {
    const current = answers[key];
    return Array.isArray(current) ? current.indexOf(value) > -1 : current === value;
  }

  function paintChoices(hostId, options, settings) {
    const host = $(hostId);
    if (!host) return;
    host.querySelectorAll('.onb-choice').forEach((button) => {
      const on = isChosen(settings.key, button.getAttribute('data-value'));
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-checked', String(on));
    });
  }

  /* ---------------------------------------------------------- the form side */

  function initForm() {
    AuthUI.backdrop({ motes: 'authMotes', count: 14 });

    // The password field: the eye + the live strength meter.
    AuthUI.bindPassword({
      input: 'suPassword', eye: 'suPasswordEye',
      bars: 'suPwBars', label: 'suPwLabel', hints: 'suPwHints'
    });
    const confirmEye = $('suConfirmEye');
    if (confirmEye) confirmEye.addEventListener('click', () => AuthUI.peek('suConfirm', confirmEye));

    // Confirm-password feedback as they type, once it is long enough to judge.
    const confirm = $('suConfirm');
    if (confirm) {
      confirm.addEventListener('input', () => {
        const same = confirm.value === $('suPassword').value;
        AuthUI.setError('suConfirmError', confirm.value && !same ? 'These two passwords do not match yet.' : '');
      });
    }

    const form = $('signupForm');
    if (form) form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });

    // Continue with Google — creates the account in one tap, then onboarding.
    AuthUI.bindGoogle({
      button: 'googleSignupBtn',
      errorId: 'signupFormError',
      remember: AuthUI.checked('suRemember'),
      onSignedIn: (result) => showSuccess(result.account)
    });

    // A gentle note if they arrived here from login.
    AuthUI.takeNote('signupFormError');
  }

  function submit() {
    const button = $('signupBtn');
    AuthUI.clearErrors();

    const input = {
      name: ($('suName') || {}).value || '',
      email: ($('suEmail') || {}).value || '',
      password: ($('suPassword') || {}).value || '',
      confirm: ($('suConfirm') || {}).value || ''
    };

    // The terms checkbox is this page's own rule, so it is checked here.
    if (!$('suTerms') || !$('suTerms').checked) {
      AuthUI.setError('suTermsError', 'Please accept the Terms and Privacy Policy to continue.');
    }

    const check = Auth.validate(input);
    if (!check.ok) {
      AuthUI.showFieldErrors(check.errors, {
        name: 'suNameError', email: 'suEmailError',
        password: 'suPasswordError', confirm: 'suConfirmError'
      });
    }
    if (!check.ok || ($('suTerms') && !$('suTerms').checked)) {
      AuthUI.setFormError('signupFormError', 'Just a couple of things to fix ♡');
      announce('Please check the highlighted fields.');
      return;
    }

    AuthUI.loading(button, true);
    const remember = AuthUI.checked('suRemember');

    Auth.signUp(input, { remember }).then((result) => {
      AuthUI.loading(button, false);
      if (!result.ok) {
        AuthUI.showFieldErrors(result.errors, {
          name: 'suNameError', email: 'suEmailError',
          password: 'suPasswordError', confirm: 'suConfirmError'
        });
        AuthUI.setFormError('signupFormError', 'We could not create the account just yet.');
        return;
      }
      if (result.pendingConfirmation) {
        showConfirmEmail(result.account);
        return;
      }
      showSuccess(result.account);
    }).catch(() => {
      AuthUI.loading(button, false);
      AuthUI.setFormError('signupFormError', 'Something went wrong. Please try again.');
    });
  }

  /** The successful-account state, then into onboarding. */
  function showSuccess(account) {
    const form = $('signupForm');
    const success = $('signupSuccess');
    if (form) form.hidden = true;
    if (success) success.hidden = false;
    const name = (account && account.name ? account.name.split(' ')[0] : 'there');
    const text = $('signupSuccessText');
    if (text) text.textContent = 'Welcome, ' + name + '. Let\'s set up your day…';
    announce('Account created. Starting onboarding.');
    setTimeout(startOnboarding, 900);
  }

  /**
   * The account was created, but the backend (Supabase, with email
   * confirmation turned on) needs the person to click a link before they can
   * actually sign in. Onboarding has to wait — there is no session yet.
   */
  function showConfirmEmail(account) {
    const form = $('signupForm');
    const success = $('signupSuccess');
    if (form) form.hidden = true;
    if (success) success.hidden = false;
    const text = $('signupSuccessText');
    if (text) {
      text.textContent = 'Almost there — we sent a confirmation link to ' +
        (account && account.email ? account.email : 'your email') +
        '. Open it, then sign in to finish setting up your day.';
    }
    announce('Check your email to confirm your account.');
  }

  /* ---------------------------------------------------- the onboarding side */

  function initOnboarding() {
    choiceChips('onbFocus', FOCUS_OPTIONS, { key: 'focus', multi: true });
    choiceChips('onbStyle', STYLE_OPTIONS, { key: 'style' });
    choiceChips('onbReminders', REMINDER_OPTIONS, { key: 'reminders' });
    paintProgress();

    const wake = $('onbWake');
    const sleep = $('onbSleep');
    if (wake) wake.value = answers.wakeTime;
    if (sleep) sleep.value = answers.sleepTime;

    const next = $('onbNext');
    const back = $('onbBack');
    if (next) next.addEventListener('click', () => advance());
    if (back) back.addEventListener('click', () => retreat());
  }

  function paintProgress() {
    const host = $('onbProgress');
    if (!host) return;
    let html = '';
    for (let i = 0; i < STEPS; i++) html += '<span class="onb-dot' + (i <= step ? ' is-on' : '') + '"></span>';
    host.innerHTML = html;
  }

  function showStep(next) {
    step = Math.max(0, Math.min(STEPS - 1, next));
    for (let i = 0; i < STEPS; i++) {
      const panel = $('onbStep' + i);
      if (panel) panel.hidden = i !== step;
    }
    const back = $('onbBack');
    if (back) back.hidden = step === 0;
    const next2 = $('onbNext');
    if (next2) {
      next2.innerHTML = step === STEPS - 1
        ? 'Enter Luvli <span data-ico="arrow-right" aria-hidden="true"></span>'
        : 'Continue <span data-ico="arrow-right" aria-hidden="true"></span>';
      if (typeof hydrateIcons === 'function') hydrateIcons(next2);
    }
    paintProgress();
    announce('Step ' + (step + 1) + ' of ' + STEPS);
    if (step === STEPS - 1) paintSummary();
  }

  /** Carry the step-2 time pickers into the answers before moving on. */
  function captureStep() {
    if (step === 1) {
      const wake = $('onbWake');
      const sleep = $('onbSleep');
      if (wake) answers.wakeTime = wake.value || '07:00';
      if (sleep) answers.sleepTime = sleep.value || '22:30';
    }
    if (step === STEPS - 1) {
      const goals = $('onbGoals');
      if (goals) answers.goals = goals.value;
    }
  }

  function advance() {
    captureStep();
    if (step === STEPS - 1) { finish(); return; }
    showStep(step + 1);
  }

  function retreat() { showStep(step - 1); }

  /** The little recap shown on the final step. */
  function paintSummary() {
    const host = $('onbSummary');
    if (!host) return;
    const focusLabels = FOCUS_OPTIONS
      .filter((option) => answers.focus.indexOf(option.key) > -1)
      .map((option) => option.label);
    const styleLabel = (STYLE_OPTIONS.find((o) => o.key === answers.style) || {}).label || 'Balanced';
    const reminderLabel = (REMINDER_OPTIONS.find((o) => o.key === answers.reminders) || {}).label || 'Gentle';
    const row = (k, v) => '<div class="onb-summary-row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
    host.innerHTML =
      row('Focus', focusLabels.length ? focusLabels.join(', ') : 'Not set yet') +
      row('Your day', answers.wakeTime + ' → ' + answers.sleepTime) +
      row('Style', styleLabel) +
      row('Reminders', reminderLabel);
  }

  /** Save the preferences and hand over to the app. */
  function finish() {
    Auth.savePreferences({
      focus: answers.focus,
      wakeTime: answers.wakeTime,
      sleepTime: answers.sleepTime,
      productivity: answers.style,
      reminders: answers.reminders,
      goals: answers.goals
    });
    const next = $('onbNext');
    AuthUI.loading(next, true);
    announce('Preferences saved. Opening Luvli.');
    setTimeout(() => AuthUI.goApp(), 650);
  }

  function startOnboarding() {
    const card = $('signupCard');
    const onb = $('onboarding');
    if (card) card.hidden = true;
    if (onb) onb.hidden = false;
    initOnboarding();
    showStep(0);
    const topbar = document.querySelector('.auth-topbar');
    if (topbar) topbar.style.visibility = 'hidden';
  }

  /* ------------------------------------------------------------------ boot */

  function init() {
    // Auth.ready() resolves instantly for the local provider, and after the
    // real backend's first session check for a provider like Supabase.
    Auth.ready().then(() => {
      if (!Auth.isSignedIn()) {
        initForm();
        return;
      }
      // Signed in: pull settings first (a real backend only) so a
      // returning, already-onboarded user isn't sent through onboarding
      // again just because this device hasn't seen their cloud settings
      // yet — Auth.hasPreferences() only ever reads local state.
      Promise.resolve(typeof SupabaseSync !== 'undefined' ? SupabaseSync.pull() : null).catch(() => {}).then(() => {
        // Already signed in with preferences? There is nothing to do here.
        if (Auth.hasPreferences()) { AuthUI.goApp(); return; }
        // Signed in but not onboarded (e.g. they refreshed mid-flow) → onboarding.
        initOnboarding();
        startOnboarding();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
