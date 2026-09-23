/* ==========================================================================
   Luvli ♡ — js/auth.js
   --------------------------------------------------------------------------
   Accounts for Luvli — create one, sign in, stay signed in.

   Luvli is local-first: there is no server and nothing leaves the device. So
   an "account" here is a real, honest thing: a record kept in this browser,
   with your password turned into a salted hash (never stored as plain text)
   and a session that remembers who is signed in.

   It is deliberately small and framework-free, like the rest of Luvli:

     • Auth.signUp({ name, email, password })  create an account + sign in
     • Auth.signIn(email, password)            sign back in
     • Auth.signOut()                          leave (data stays on the device)
     • Auth.current()                          the signed-in account, or null
     • Auth.accounts()                         how many accounts live here
     • Auth.validate(...)                      the friendly form checks

   Storage layout (all inside the one Luvli localStorage blob):
     state.auth = {
       accounts: [{ id, name, email, salt, hash, createdAt, lastSeenAt,
                    avatar: { color, shape }, remember }],
       session:  { userId, since, remember } | null
     }

   The password hash uses Web Crypto (SHA-256 + a per-account random salt).
   When crypto is unavailable (older browsers, the Node test shim) it falls
   back to a light, clearly-labelled obfuscation so nothing ever breaks.

   Swapping in a real backend later
   --------------------------------
   Every persistence call goes through Auth.provider. The default is the local
   one that reads and writes the Luvli state blob, so nothing changes today.
   To move to Firebase / Supabase / your own API, set a provider once (from the
   auth pages) and the whole UI keeps working:

     Auth.setProvider({
       name: 'supabase',
       init:    () => ...,                 // optional: async first-session check
       signUp:  (input, options) => ...,   // -> { ok, account } | { ok:false, errors }
       signIn:  (input, options) => ...,
       signOut: () => ...,
       current: () => ...,                 // MUST be synchronous — see init()
       requestReset: (email) => ...,
       resetPassword: (email, token, password, confirm) => ...,
       update: (patch) => ...
     });

   Every call here is dispatched to the active provider if it defines that
   method, and falls back to the local implementation otherwise (see
   dispatch() near the bottom of this file) — so a provider only needs to
   implement what it actually changes. current() must stay synchronous
   because the rest of the app calls Auth.current()/isSignedIn() as a plain
   function call, not a promise; a provider whose session check is async
   (like Supabase's) should keep a small in-memory cache updated via init()
   and its own change-event listener, and expose current() as a sync read of
   that cache. See js/auth-provider-supabase.js for a worked example.
   ========================================================================== */
'use strict';

const Auth = (() => {

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MIN_PASSWORD = 6;

  /* Avatar options offered on the sign-up screen, matching My Luvli Style. */
  const COLORS = ['pink', 'lavender', 'peach', 'cream'];
  const SHAPES = ['heart', 'star', 'flower', 'minimal'];

  /* ------------------------------- helpers -------------------------------- */

  const nowISO = () => new Date().toISOString();

  /** Lower-case and trim an email so "A@B.com" and "a@b.com" are one account. */
  const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

  /** Read the auth slice, growing it into place if an older save lacks it. */
  function data() {
    const state = Storage.get();
    if (!state.auth || typeof state.auth !== 'object') {
      state.auth = { accounts: [], session: null };
    }
    if (!Array.isArray(state.auth.accounts)) state.auth.accounts = [];
    if (!('session' in state.auth)) state.auth.session = null;
    return state.auth;
  }

  function findById(id) {
    return data().accounts.find((account) => account.id === id) || null;
  }

  function findByEmail(email) {
    const wanted = normaliseEmail(email);
    return data().accounts.find((account) => account.email === wanted) || null;
  }

  /* --------------------------- password hashing --------------------------- */

  /** A random salt, hex-encoded. */
  function makeSalt() {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Turn a password + salt into a stored hash.
   * Prefers SHA-256 via Web Crypto; falls back to a stable, non-secret scramble
   * when SubtleCrypto is not around (kept honest by the `hashAlgo` field).
   */
  function hashPassword(password, salt) {
    const text = salt + '::' + String(password);
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const bytes = new TextEncoder().encode(text);
      return crypto.subtle.digest('SHA-256', bytes).then((buffer) =>
        Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join(''));
    }
    return Promise.resolve(fallbackHash(text));
  }

  /** A light, dependency-free hash used only when crypto is missing. */
  function fallbackHash(text) {
    let h1 = 0x811c9dc5;
    let h2 = 0x1000193;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      h1 = (h1 ^ code) >>> 0;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (h2 + Math.imul(code + i, 2654435761)) >>> 0;
    }
    return 'fb' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  /** Constant-ish comparison so we do not leak length by timing. */
  function sameHash(a, b) {
    const x = String(a || '');
    const y = String(b || '');
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return diff === 0;
  }

  /* ------------------------------ validation ------------------------------ */

  /**
   * Check a sign-up form. Returns { ok, errors, values } where errors is a map
   * of field -> friendly sentence, so the UI can mark exactly what to fix.
   */
  function validate(input, options) {
    const opts = options || {};
    const values = {
      name: String((input && input.name) || '').trim(),
      email: normaliseEmail(input && input.email),
      password: String((input && input.password) || ''),
      confirm: String((input && input.confirm) || (input && input.password) || '')
    };
    const errors = {};

    if (!values.name) errors.name = 'Luvli would love a name to call you ♡';
    if (!values.email) errors.email = 'An email keeps your account findable.';
    else if (!EMAIL_RE.test(values.email)) errors.email = 'That email does not look quite right.';
    else if (opts.checkExists !== false && findByEmail(values.email)) {
      errors.email = 'You already have an account with this email. Try signing in.';
    }

    if (!values.password) errors.password = 'Choose a password.';
    else if (values.password.length < MIN_PASSWORD) {
      errors.password = 'A little longer, please — at least ' + MIN_PASSWORD + ' characters.';
    }
    if (input && 'confirm' in input && values.confirm !== values.password) {
      errors.confirm = 'These two passwords do not match yet.';
    }

    return { ok: Object.keys(errors).length === 0, errors, values };
  }

  /** The checks used on the sign-in form. */
  function validateSignIn(input) {
    const values = {
      email: normaliseEmail(input && input.email),
      password: String((input && input.password) || '')
    };
    const errors = {};
    if (!values.email) errors.email = 'Your email, please.';
    else if (!EMAIL_RE.test(values.email)) errors.email = 'That email does not look quite right.';
    if (!values.password) errors.password = 'Your password, please.';
    return { ok: Object.keys(errors).length === 0, errors, values };
  }

  /* ------------------------------- accounts ------------------------------- */

  /** How many people share this Luvli (usually just one ♡). */
  function accounts() {
    return data().accounts.slice();
  }

  function hasAccounts() {
    return data().accounts.length > 0;
  }

  /** The account currently signed in, or null. */
  function current() {
    const slice = data();
    if (!slice.session) return null;
    return findById(slice.session.userId);
  }

  function isSignedIn() {
    return Boolean(current());
  }

  /** A public view of an account — never exposes the salt or hash. */
  function publicView(account) {
    if (!account) return null;
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      initials: initialsFor(account.name),
      avatar: Object.assign({ color: 'pink', shape: 'heart' }, account.avatar || {}),
      createdAt: account.createdAt,
      lastSeenAt: account.lastSeenAt
    };
  }

  function initialsFor(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '♡';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ------------------------------ the session ----------------------------- */

  function startSession(account, remember) {
    const slice = data();
    slice.session = {
      userId: account.id,
      since: nowISO(),
      remember: remember !== false
    };
    account.lastSeenAt = nowISO();
    Storage.save();
  }

  /**
   * Create an account and sign in.
   * @returns {Promise<{ok:boolean, errors?:object, account?:object}>}
   */
  function signUp(input, options) {
    const opts = options || {};
    const result = validate(input, opts);
    if (!result.ok) return Promise.resolve({ ok: false, errors: result.errors, values: result.values });

    const salt = makeSalt();
    return hashPassword(result.values.password, salt).then((hash) => {
      const record = {
        id: (Utils.uid ? Utils.uid('user') : 'user_' + Date.now()),
        name: result.values.name,
        email: result.values.email,
        salt,
        hash,
        hashAlgo: salt && hash.indexOf('fb') === 0 ? 'fallback' : 'sha256',
        avatar: {
          color: COLORS.indexOf(opts.color) > -1 ? opts.color : 'pink',
          shape: SHAPES.indexOf(opts.shape) > -1 ? opts.shape : 'heart'
        },
        createdAt: nowISO(),
        lastSeenAt: nowISO()
      };
      const slice = data();
      slice.accounts.push(record);
      // Adopt the name they signed up with as Luvli's name for them.
      Storage.update((state) => {
        if (state.profile && !state.profile.name) state.profile.name = record.name;
      }, 'auth', { undo: false });
      startSession(record, opts.remember);
      Storage.emit('auth');
      return { ok: true, account: publicView(record) };
    });
  }

  /**
   * Sign in with an email + password.
   * @returns {Promise<{ok:boolean, reason?:string, errors?:object, account?:object}>}
   */
  function signIn(input, options) {
    const opts = options || {};
    const result = validateSignIn(input);
    if (!result.ok) return Promise.resolve({ ok: false, errors: result.errors });

    const account = findByEmail(result.values.email);
    if (!account) {
      return Promise.resolve({
        ok: false,
        reason: 'no-account',
        errors: { email: 'No Luvli account uses that email yet.' }
      });
    }

    return hashPassword(result.values.password, account.salt).then((hash) => {
      if (!sameHash(hash, account.hash)) {
        return { ok: false, reason: 'bad-password', errors: { password: 'That password is not quite it.' } };
      }
      startSession(account, opts.remember !== false);
      Storage.emit('auth');
      if (opts.onSignIn) opts.onSignIn(publicView(account));
      return { ok: true, account: publicView(account) };
    });
  }

  /* ------------------------------ Google sign-in ---------------------------
     Luvli has no server, so there is no real OAuth handshake here. This is the
     honest local stand-in: it creates (or finds) an account for a Google
     identity and signs it in, and it is shaped exactly like the call a real
     provider would make.

     Swapping in a real backend later — set a provider once from the auth page:

       Auth.setProvider({
         name: 'google',
         signInWithGoogle: () => google.accounts.id.prompt() // or Firebase popup
       });

     The page only ever calls Auth.signInWithGoogle(), so nothing else changes. */

  /** A stable, non-secret id for a Google identity (never a password). */
  function googleId(email) {
    return 'google:' + normaliseEmail(email);
  }

  /**
   * Sign in with a Google identity.
   * @param {object} identity { email, name, avatar? } — as returned by Google.
   * @param {object} options { remember }
   * @returns {Promise<{ok:boolean, account?:object, created?:boolean, errors?:object}>}
   */
  function signInWithGoogle(identity, options) {
    const opts = options || {};
    const email = normaliseEmail(identity && identity.email);
    const name = String((identity && identity.name) || '').trim() || (email ? email.split('@')[0] : '');

    if (!email || !EMAIL_RE.test(email)) {
      return Promise.resolve({
        ok: false,
        errors: { email: 'Google did not share a usable email — please try again.' }
      });
    }

    const slice = data();
    let account = findByEmail(email);
    let created = false;

    if (!account) {
      // First time here: create the account straight from the Google identity.
      account = {
        id: Utils.uid ? Utils.uid('user') : 'user_' + Date.now(),
        name: name || 'Luvli friend',
        email,
        salt: '',
        hash: '',
        hashAlgo: 'google',       // no local password — Google holds the credential
        provider: 'google',
        avatar: { color: 'pink', shape: 'heart' },
        createdAt: nowISO(),
        lastSeenAt: nowISO()
      };
      slice.accounts.push(account);
      created = true;
    } else {
      // Returning: remember that this account is now linked to Google too.
      account.provider = account.provider || 'google';
      account.lastSeenAt = nowISO();
    }

    Storage.update((state) => {
      if (state.profile && !state.profile.name) state.profile.name = account.name;
    }, 'auth', { undo: false });
    startSession(account, opts.remember !== false);
    Storage.emit('auth');
    return Promise.resolve({ ok: true, created, account: publicView(account) });
  }

  /** Sign out. The account and every bit of your data stay on the device. */
  function signOut() {
    const slice = data();
    slice.session = null;
    Storage.save();
    Storage.emit('auth');
  }

  /** Does a given email already belong to an account here? */
  function exists(email) {
    return Boolean(findByEmail(email));
  }

  /** Update the signed-in account's name or avatar. */
  function update(patch) {
    const account = current();
    if (!account) return null;
    if (patch && typeof patch.name === 'string' && patch.name.trim()) {
      account.name = patch.name.trim();
      Storage.update((state) => {
        if (state.profile) state.profile.name = account.name;
      }, 'auth', { undo: false });
    }
    if (patch && patch.avatar) {
      account.avatar = Object.assign({}, account.avatar,
        COLORS.indexOf(patch.avatar.color) > -1 ? { color: patch.avatar.color } : {},
        SHAPES.indexOf(patch.avatar.shape) > -1 ? { shape: patch.avatar.shape } : {});
      Storage.save();
    }
    Storage.emit('auth');
    return publicView(account);
  }

  /* --------------------------- password strength --------------------------- */

  /**
   * Score a password from 0 to 4 and describe it in words, so the sign-up form
   * can show an honest strength meter. Length, variety and a couple of mild
   * penalties for the obvious patterns — nothing punitive, only useful.
   * @returns {{score:number, label:string, hints:string[]}}
   */
  function strength(password) {
    const value = String(password || '');
    const hints = [];
    let score = 0;

    if (value.length >= MIN_PASSWORD) score++;
    if (value.length >= 10) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    // Gentle rules of thumb, only shown while they are still true.
    if (value.length && value.length < MIN_PASSWORD) hints.push('At least ' + MIN_PASSWORD + ' characters');
    if (value.length && !/[A-Z]/.test(value)) hints.push('Add an uppercase letter');
    if (value.length && !/\d/.test(value)) hints.push('Add a number');
    if (value.length && !/[^A-Za-z0-9]/.test(value)) hints.push('Add a symbol');

    // Anything very common is weak however long it is.
    if (/^(password|passw0rd|123456|qwerty|letmein|iloveyou)/i.test(value)) {
      score = Math.min(score, 1);
      hints.unshift('Too easy to guess');
    }

    score = Math.max(0, Math.min(4, score));
    const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'];
    return { score, label: value ? labels[score] : '', hints: value ? hints : [] };
  }

  /* ---------------------------- password reset ---------------------------- */

  /**
   * Begin a reset. There is no mail server, so Luvli hands the reset link back
   * to the page (which shows it) instead of pretending to email it. With a real
   * provider this is where the "send reset email" call goes.
   * @returns {{ok:boolean, token?:string, email?:string, errors?:object}}
   */
  function requestReset(email) {
    const wanted = normaliseEmail(email);
    if (!EMAIL_RE.test(wanted)) {
      return { ok: false, errors: { email: 'That email does not look quite right.' } };
    }
    const account = findByEmail(wanted);
    if (!account) {
      return { ok: false, reason: 'no-account', errors: { email: 'No Luvli account uses that email yet.' } };
    }
    const token = makeSalt();

    const slice = data();
    slice.reset = { email: wanted, token, requestedAt: nowISO(), used: false };
    Storage.save();
    return { ok: true, token, email: wanted };
  }

  /** Is a reset token the live one for that email? */
  function checkResetToken(email, token) {
    const reset = data().reset;
    if (!reset || reset.used) return false;
    if (normaliseEmail(email) !== reset.email) return false;
    return sameHash(reset.token, String(token || ''));
  }

  /**
   * Finish a reset: set the new password and sign the person straight back in.
   * @returns {Promise<{ok:boolean, errors?:object, account?:object}>}
   */
  function resetPassword(email, token, password, confirm) {
    const fail = (errors) => Promise.resolve({ ok: false, errors });
    const account = findByEmail(email);
    const checks = [];
    if (!account) checks.push({ email: 'No Luvli account uses that email yet.' });
    if (!checkResetToken(email, token)) checks.push({ token: 'That reset link has expired — ask for a new one.' });
    if (!password || password.length < MIN_PASSWORD) {
      checks.push({ password: 'A little longer, please — at least ' + MIN_PASSWORD + ' characters.' });
    } else if (confirm !== undefined && confirm !== password) {
      checks.push({ confirm: 'These two passwords do not match yet.' });
    }
    if (checks.length) {
      return fail(checks.reduce((all, one) => Object.assign(all, one), {}));
    }

    const salt = makeSalt();
    return hashPassword(password, salt).then((hash) => {
      account.salt = salt;
      account.hash = hash;
      account.hashAlgo = hash.indexOf('fb') === 0 ? 'fallback' : 'sha256';
      data().reset = null;
      startSession(account, true);
      Storage.emit('auth');
      return { ok: true, account: publicView(account) };
    });
  }

  /* ------------------------ personalisation (onboarding) ------------------ */

  /**
   * The short onboarding a brand-new account goes through. It is stored beside
   * the app's own settings (state.settings.onboarding) so every screen — the
   * planner, Focus, reminders — can read it without knowing about the form.
   * @returns {object} the preferences as saved
   */
  function savePreferences(prefs, reason) {
    const clean = {
      focus: Array.isArray(prefs && prefs.focus) ? prefs.focus.slice(0, 8) : [],
      wakeTime: (prefs && prefs.wakeTime) || '07:00',
      sleepTime: (prefs && prefs.sleepTime) || '22:30',
      productivity: (prefs && prefs.productivity) || 'balanced',
      reminders: (prefs && prefs.reminders) || 'gentle',
      goals: String((prefs && prefs.goals) || '').trim().slice(0, 600),
      completed: true,
      at: nowISO()
    };
    Storage.update((state) => {
      state.settings.onboarding = clean;
      // Wake / sleep feed the real planner, so they take effect immediately.
      if (clean.wakeTime) state.settings.wakeTime = clean.wakeTime;
      if (clean.sleepTime) state.settings.sleepTime = clean.sleepTime;
      // A reminder preference maps onto the existing notification settings.
      if (state.settings.notifications) {
        state.settings.notifications.enabled = clean.reminders !== 'off';
        state.settings.notifications.leadMinutes =
          clean.reminders === 'eager' ? 15 : (clean.reminders === 'minimal' ? 5 : 10);
      }
    }, reason || 'onboarding');
    return clean;
  }

  /** Has this account finished onboarding? */
  function hasPreferences() {
    const prefs = Storage.get().settings && Storage.get().settings.onboarding;
    return Boolean(prefs && prefs.completed);
  }

  /** The saved onboarding preferences, or sensible defaults. */
  function preferences() {
    const prefs = (Storage.get().settings && Storage.get().settings.onboarding) || {};
    return Object.assign({
      focus: [], wakeTime: '07:00', sleepTime: '22:30',
      productivity: 'balanced', reminders: 'gentle', goals: '', completed: false
    }, prefs);
  }

  /* ------------------------------ the provider ----------------------------- */

  /**
   * The local provider: a thin wrapper over the functions above. A real backend
   * replaces this object and nothing else has to change.
   */
  const localProvider = {
    name: 'local',
    signUp: (input, options) => signUp(input, options),
    signIn: (input, options) => signIn(input, options),
    signInWithGoogle: (identity, options) => signInWithGoogle(identity, options),
    signOut: () => { signOut(); return { ok: true }; },
    current: () => publicView(current()),
    requestReset,
    resetPassword,
    update: (patch) => update(patch),
    isLocal: true
  };

  let provider = localProvider;
  let readyPromise = Promise.resolve();

  /**
   * Point Luvli at a real auth service. See the header for the contract.
   * If the provider exposes init(), that promise becomes Auth.ready() — so a
   * real backend (which has to check a session asynchronously) can hold off
   * every page's guard/render until its first session check has resolved.
   */
  function setProvider(next) {
    provider = next && typeof next === 'object' ? next : localProvider;
    readyPromise = Promise.resolve(provider.init ? provider.init() : undefined).catch(() => {});
    return provider;
  }

  /** The active provider (handy for the pages and for tests). */
  function activeProvider() {
    return provider;
  }

  /** Resolves once the active provider's first session check has finished. */
  function ready() {
    return readyPromise;
  }

  /**
   * Call the active provider's version of a method, falling back to the
   * local implementation if the provider does not define it. This is what
   * actually makes Auth.setProvider() take effect for the calls every page
   * already makes (Auth.signIn(), Auth.current(), ...) instead of only the
   * Google button noticing it.
   */
  function dispatch(method) {
    return function () {
      const target = provider && typeof provider[method] === 'function' ? provider : localProvider;
      return target[method].apply(target, arguments);
    };
  }

  /* --------------------------- avatar rendering --------------------------- */

  /**
   * A small, self-contained avatar bubble for an account. Mirrors the feel of
   * LuvliStyle.avatarHtml but stays independent so auth never depends on it.
   */
  function avatarHtml(account, options) {
    const opts = options || {};
    const view = account && account.avatar ? account.avatar : { color: 'pink', shape: 'heart' };
    const size = opts.size || 'md';
    const mark = { heart: '♡', star: '✶', flower: '✿', minimal: '·' }[view.shape] || '♡';
    return '<span class="auth-avatar auth-avatar-' + size + ' auth-avatar-' + view.color +
      '" aria-hidden="true">' + mark + '</span>';
  }

  return {
    COLORS, SHAPES, MIN_PASSWORD,
    // These go through the active provider (local by default, a real backend
    // once Auth.setProvider() is called) — see dispatch() above.
    signUp: dispatch('signUp'),
    signIn: dispatch('signIn'),
    signInWithGoogle: dispatch('signInWithGoogle'),
    signOut: dispatch('signOut'),
    current: dispatch('current'),
    isSignedIn: () => Boolean(dispatch('current')()),
    requestReset: dispatch('requestReset'),
    resetPassword: dispatch('resetPassword'),
    update: dispatch('update'),
    // Local-only helpers: form validation/strength meter never touch a
    // backend, and hasAccounts/accounts/exists only make sense for the local
    // provider's own account list (a real backend has no such listing here).
    hasAccounts, accounts, exists, validate, validateSignIn, strength,
    publicView, avatarHtml, normaliseEmail, initialsFor, checkResetToken,
    savePreferences, hasPreferences, preferences,
    setProvider, activeProvider, ready
  };
})();
