/* ==========================================================================
   Luvli ♡ — js/auth-ui.js
   --------------------------------------------------------------------------
   The shared behaviour behind every account screen (login.html, signup.html
   and the app's own welcome gate). It is deliberately small and dependency-
   free, like the rest of Luvli.

   What it does:

     AuthUI.guard()             → send signed-out people to login.html
     AuthUI.backdrop()          → the layered blobs + ambient light motes
     AuthUI.bindPassword(...)   → show/hide eye + the strength meter
     AuthUI.bindPeek(...)       → just the eye, for login
     AuthUI.setError / clearErrors / showFieldErrors
     AuthUI.loading(button, on) → the loading state on a submit button
     AuthUI.afterAuth(account)  → where to go next (onboarding or the app)
   AuthUI.bindGoogle(...)     → "Continue with Google" (real GIS when configured)

   It talks to Auth (js/auth.js) for everything real, so swapping in a hosted
   backend never touches this file. Real Google sign-in is driven by
   js/auth-config.js: set a client ID there and these buttons use Google
   Identity Services; leave it empty and they fall back to a labelled local
   account so the flow still works offline and in tests.
   ========================================================================== */
'use strict';

const AuthUI = (() => {

  /* The pages, in one place, so they always agree. */
  const PAGES = {
    login: 'login.html',
    signup: 'signup.html',
    app: 'index.html',
    onboarding: 'signup.html?step=onboarding'
  };

  /* ------------------------------------------------------------- the guard */

  /**
   * Keep signed-out people out. Redirects to login (keeping where they meant
   * to go) and returns false, so a page can simply `if (!AuthUI.guard()) return;`
   */
  function guard(options) {
    const opts = options || {};
    if (Auth.isSignedIn()) return true;
    if (opts.redirect !== false) {
      const next = opts.next || currentFile();
      const target = PAGES.login + (next && next !== PAGES.login ? '?next=' + encodeURIComponent(next) : '');
      location.replace(target);
    }
    return false;
  }

  /** The file name of the page we are on, e.g. "index.html". */
  function currentFile() {
    const path = (location && location.pathname) || '';
    const file = path.substring(path.lastIndexOf('/') + 1);
    return file || 'index.html';
  }

  /** A query parameter from the address bar. */
  function param(name) {
    const search = (location && location.search) || '';
    const match = new RegExp('[?&]' + name + '=([^&]+)').exec(search);
    if (!match) return '';
    return decodeURIComponent(match[1].split('+').join(String.fromCharCode(32)));
  }

  /** Where to send someone after a successful sign-in / sign-up. */
  function afterAuth(account) {
    if (!account) return PAGES.app;
    // A brand-new account, or one that skipped onboarding, goes through it first.
    if (!Auth.hasPreferences()) return PAGES.onboarding;
    const next = param('next');
    if (next && next !== PAGES.login && next !== PAGES.signup) return next;
    return PAGES.app;
  }

  /* ---------------------------------------------------------- the backdrop */

  /**
   * Paint the layered background (blobs are in the markup; the motes are made
   * here) unless the person asked for less motion.
   */
  function backdrop(options) {
    const opts = options || {};
    const host = document.getElementById(opts.motes || 'authMotes');
    if (!host) return;
    if (prefersReduced()) { host.innerHTML = ''; return; }
    const count = opts.count || 16;
    let html = '';
    for (let i = 0; i < count; i++) {
      const left = Math.round(Math.random() * 100);
      const top = Math.round(50 + Math.random() * 55);
      const dur = (9 + Math.random() * 10).toFixed(1);
      const delay = (Math.random() * 12).toFixed(1);
      const size = (2 + Math.random() * 4).toFixed(1);
      const drift = Math.round(-40 + Math.random() * 80);
      html += '<span class="auth-mote" style="left:' + left + '%;top:' + top + '%;' +
        'width:' + size + 'px;height:' + size + 'px;' +
        '--dur:' + dur + 's;--delay:' + delay + 's;--mx:' + drift + 'px"></span>';
    }
    host.innerHTML = html;
  }

  function prefersReduced() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ------------------------------------------------------ password controls */

  /** Show / hide the password in a field, swapping the eye icon. */
  function peek(inputId, button) {
    const field = document.getElementById(inputId);
    if (!field) return;
    const showing = field.type === 'password';
    field.type = showing ? 'text' : 'password';
    if (button) {
      button.setAttribute('aria-pressed', String(showing));
      button.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
      button.innerHTML = ico(showing ? 'eye-off' : 'eye');
    }
  }

  /**
   * Wire a field: the eye button + a live strength meter.
   * @param {object} opts { input, eye, meter, bars, label, hints }
   */
  function bindPassword(opts) {
    const input = document.getElementById(opts.input);
    const eye = opts.eye ? document.getElementById(opts.eye) : null;
    if (eye) {
      eye.addEventListener('click', () => peek(opts.input, eye));
    }
    if (!input) return;

    const barsHost = opts.bars ? document.getElementById(opts.bars) : null;
    const bars = barsHost ? Array.from(barsHost.querySelectorAll('.pw-bar')) : [];
    const label = opts.label ? document.getElementById(opts.label) : null;
    const hints = opts.hints ? document.getElementById(opts.hints) : null;

    const paint = () => {
      const result = Auth.strength(input.value);
      bars.forEach((bar, index) => {
        const on = index < result.score;
        bar.classList.toggle('is-on', on);
        if (on) bar.setAttribute('data-level', String(result.score));
      });
      if (label) {
        label.textContent = result.label || 'Password strength';
        if (result.score) label.setAttribute('data-level', String(result.score));
        else label.removeAttribute('data-level');
      }
      if (hints) {
        hints.textContent = input.value ? (result.hints[0] || 'Looking good') : '';
      }
    };

    input.addEventListener('input', paint);
    paint();
  }

  /* -------------------------------------------------------------- errors */

  function setError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    if (message) { el.textContent = message; el.hidden = false; }
    else { el.textContent = ''; el.hidden = true; }
  }

  /** Text inputs read data-field so we know which error element to fill. */
  function clearErrors(scope) {
    const root = scope || document;
    root.querySelectorAll('.auth-error').forEach((el) => { el.textContent = ''; el.hidden = true; });
    root.querySelectorAll('.field.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    root.querySelectorAll('.auth-form-error').forEach((el) => { el.textContent = ''; el.hidden = true; });
  }

  /** Map an Auth error object (field -> message) onto the visible fields. */
  function showFieldErrors(errors, map) {
    Object.keys(errors || {}).forEach((key) => {
      const id = (map && map[key]) || (key + 'Error');
      setError(id, errors[key]);
      const el = document.getElementById(id);
      const field = el && el.closest ? el.closest('.field') : null;
      if (field) field.classList.add('is-invalid');
    });
  }

  function setFormError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    if (message) { el.textContent = message; el.hidden = false; }
    else { el.textContent = ''; el.hidden = true; }
  }

  /** Announce to screen readers through the page's polite live region. */
  function announce(message) {
    if (!message) return;
    const el = document.getElementById('authAnnouncer');
    if (el) el.textContent = message;
  }

  /* ------------------------------------------------------------- loading */

  /** Put a submit button into (or out of) its loading state. */
  function loading(button, on) {
    const el = typeof button === 'string' ? document.getElementById(button) : button;
    if (!el) return;
    el.classList.toggle('is-loading', Boolean(on));
    el.setAttribute('aria-busy', on ? 'true' : 'false');
    if (on) el.setAttribute('disabled', 'disabled'); else el.removeAttribute('disabled');
  }

  /** Read a few fields into an object in one go. */
  function readFields(ids) {
    const out = {};
    Object.keys(ids).forEach((key) => {
      const el = document.getElementById(ids[key]);
      out[key] = el ? el.value : '';
    });
    return out;
  }

  function checked(id) {
    const el = document.getElementById(id);
    return el ? Boolean(el.checked) : false;
  }

  /* ------------------------------------------------------- Google sign-in */

  /**
   * Wire a "Continue with Google" button. The button id is passed in the page,
   * so login.html and signup.html share exactly one implementation.
   *
   * Real Google sign-in: when js/auth-config.js carries a client ID, this runs
   * the genuine Google Identity Services flow — Google shows its own account
   * chooser and returns a signed ID token (a JWT) which we decode for the
   * profile. With no client ID configured, it falls back to a clearly-labelled
   * local stand-in so the flow still works and stays testable.
   */
  function bindGoogle(options) {
    const opts = options || {};
    const button = typeof opts.button === 'string' ? document.getElementById(opts.button) : opts.button;
    if (!button) return;

    button.addEventListener('click', () => {
      clearErrors();
      setFormError(opts.errorId, '');
      loading(button, true);
      announce('Opening Google…');

      resolveGoogleIdentity(opts).then((identity) => {
        if (!identity) {
          loading(button, false);
          setFormError(opts.errorId, 'Google sign-in was closed before it finished.');
          announce('Google sign-in cancelled.');
          return;
        }
        return Auth.signInWithGoogle(identity, { remember: opts.remember !== false })
          .then((result) => {
            loading(button, false);
            if (!result.ok) {
              setFormError(opts.errorId, (result.errors && result.errors.email) ||
                'We could not sign you in with Google just now.');
              return;
            }
            if (typeof opts.onSignedIn === 'function') opts.onSignedIn(result);
          });
      }).catch((err) => {
        loading(button, false);
        setFormError(opts.errorId, err && err.message === 'google-not-configured'
          ? 'Google sign-in isn’t set up yet — please use email and password for now.'
          : 'Google sign-in met a hiccup. Please try again.');
      });
    });
  }

  /**
   * The identity to sign in with, in order of preference:
   *   1. A provider that answers for itself (Auth.setProvider).
   *   2. The real Google Identity Services flow, when a client ID is configured.
   *   3. The honest local stand-in — but ONLY while the local provider is
   *      active. A real backend (e.g. Supabase) that has no Google support
   *      wired up must say so plainly instead of quietly creating a
   *      local-only account that backend will never recognise as signed in.
   */
  function resolveGoogleIdentity(opts) {
    // A real provider can answer for itself.
    const provider = Auth.activeProvider && Auth.activeProvider();
    if (provider && typeof provider.getGoogleIdentity === 'function') {
      return Promise.resolve(provider.getGoogleIdentity(opts));
    }
    // Real Google, when auth-config.js carries a client ID.
    if (googleConfigured()) {
      return googleIdentity(opts);
    }
    if (provider && provider.isLocal === false) {
      return Promise.reject(new Error('google-not-configured'));
    }
    return Promise.resolve(prototypeGoogleIdentity());
  }

  /** Is a real Google client ID configured on this page? */
  function googleConfigured() {
    const cfg = (typeof window !== 'undefined') ? window.LuvliAuthConfig : null;
    return Boolean(cfg && typeof cfg.hasGoogle === 'function' && cfg.hasGoogle());
  }

  /**
   * The real Google Identity Services flow. Loads the GIS library on demand,
   * initialises it with our client ID and hands back the credential Google
   * returns. The credential is a signed JWT; we decode its payload for the
   * profile (no network call needed for that part).
   */
  function googleIdentity(opts) {
    const cfg = window.LuvliAuthConfig;
    const clientId = cfg.google.clientId;

    return loadGis(cfg.google.gisSrc).then(() => new Promise((resolve) => {
      const gis = window.google && window.google.accounts && window.google.accounts.id;
      if (!gis) { resolve(null); return; }

      let settled = false;
      let timer = null;
      const done = (identity) => {
        if (settled) return;
        settled = true;
        if (timer) window.clearTimeout(timer);
        resolve(identity);
      };

      // A safety net: Google's One Tap can stay silent (blocked cookies, an
      // unauthorised origin, a fake client id). Without this the button would
      // spin forever. If nothing arrives in a few seconds, fall back honestly.
      timer = window.setTimeout(() => fallbackToLocal(opts, done), 4000);

      try {
        gis.initialize({
          client_id: clientId,
          callback: (response) => {
            const profile = decodeIdToken(response && response.credential);
            done(profile ? Object.assign(profile, { provider: 'google' }) : null);
          },
          // Render Google's own button into a hidden host; we drive it ourselves.
          ux_mode: 'popup'
        });

        // One Tap / the account chooser. If Google declines to display it, we
        // say so rather than hanging.
        gis.prompt((notification) => {
          if (notification && typeof notification.isNotDisplayed === 'function' &&
              notification.isNotDisplayed()) {
            fallbackToLocal(opts, done);
          } else if (notification && typeof notification.isSkippedMoment === 'function' &&
                     notification.isSkippedMoment()) {
            done(null);
          }
        });
      } catch (err) {
        fallbackToLocal(opts, done);
      }
    }));
  }

  /**
   * When real Google cannot be shown (no third-party cookies, script blocked,
   * origin not authorised yet), keep the person moving with the local stand-in
   * instead of stranding them on an error.
   */
  function fallbackToLocal(opts, done) {
    done(prototypeGoogleIdentity(true));
  }

  /** Load the Google Identity Services script once. */
  function loadGis(src) {
    if (typeof document === 'undefined') return Promise.resolve();
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    const existing = document.querySelector('script[data-luvli-gis]');
    if (existing) {
      return existing.dataset.luvliGisReady === '1'
        ? Promise.resolve()
        : new Promise((resolve) => { existing.addEventListener('load', resolve); existing.addEventListener('error', resolve); });
    }
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src || 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.setAttribute('data-luvli-gis', '1');
      script.addEventListener('load', () => { script.dataset.luvliGisReady = '1'; resolve(); });
      script.addEventListener('error', resolve);   // resolve anyway → graceful fallback
      document.head.appendChild(script);
    });
  }

  /**
   * Read the payload of a Google ID token (a JWT). We only ever read public
   * profile claims from it for the local account record; when a backend is put
   * behind this, it re-verifies the token signature server-side.
   */
  function decodeIdToken(credential) {
    if (!credential || typeof credential !== 'string') return null;
    const parts = credential.split('.');
    if (parts.length < 2) return null;
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '==='.slice((base64.length + 3) % 4);
      const json = decodeURIComponent(Array.prototype.map.call(atob(padded), (c) =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      const claims = JSON.parse(json);
      if (!claims || !claims.email) return null;
      return {
        email: claims.email,
        name: claims.name || claims.given_name || claims.email.split('@')[0],
        picture: claims.picture || '',
        emailVerified: Boolean(claims.email_verified),
        avatar: { color: 'pink', shape: 'heart' }
      };
    } catch (err) {
      return null;
    }
  }

  /**
   * The local stand-in used only when real Google is not configured or cannot
   * be shown. `notice` makes it say plainly that it is local, so nobody is ever
   * led to believe a real Google sign-in happened.
   */
  function prototypeGoogleIdentity(notice) {
    if (typeof window === 'undefined' || !window.prompt) return null;
    const heading = notice
      ? 'Google sign-in is not set up on this copy of Luvli.\n\n' +
        'Add your OAuth client ID in js/auth-config.js for real Google sign-in.\n' +
        'For now, continue with your email to use a local account:'
      : 'Google sign-in (local account)\n\nEnter the email to continue with:';
    const email = window.prompt(heading, sessionStorage.getItem('luvli.google.email') || '');
    if (!email) return null;
    try { sessionStorage.setItem('luvli.google.email', email); } catch (err) { /* private mode */ }
    const localPart = email.split('@')[0];
    const words = localPart.split(/[._-]+/).filter(Boolean);
    const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || localPart;
    return { email, name, avatar: { color: 'pink', shape: 'heart' }, provider: 'google', local: true };
  }

  /* ------------------------------------------------------------ redirects */

  function goLogin(message) {
    remember(message);
    location.href = PAGES.login;
  }

  function goSignup(message) {
    remember(message);
    location.href = PAGES.signup;
  }

  function goApp() { location.href = PAGES.app; }

  /** Carry a one-line note across a page change (shows as a banner). */
  function remember(message) {
    if (!message) return;
    try { sessionStorage.setItem('luvli.auth.note', message); } catch (err) { /* private mode */ }
  }

  /** Show (and clear) any note the last page left for this one. */
  function takeNote(targetId) {
    let note = '';
    try {
      note = sessionStorage.getItem('luvli.auth.note') || '';
      sessionStorage.removeItem('luvli.auth.note');
    } catch (err) { note = ''; }
    if (note && targetId) setFormError(targetId, note);
    return note;
  }

  /* ------------------------------------------------------------- nav links */

  /**
   * Wire the small in-page links. Real destinations navigate normally; the
   * legal ones (Terms, Privacy) open their own pages if they exist, and fall
   * back to an honest inline note otherwise.
   */
  const LEGAL_PAGES = { terms: 'terms.html', privacy: 'privacy.html' };

  function initLinks() {
    document.querySelectorAll('[data-inline-nav]').forEach((link) => {
      const kind = link.getAttribute('data-inline-nav');
      if (kind === 'login' || kind === 'signup') {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          location.href = PAGES[kind];
        });
        return;
      }
      if (kind === 'terms' || kind === 'privacy') {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          const which = kind === 'terms' ? 'Terms' : 'Privacy Policy';
          if (hasLegalPage(LEGAL_PAGES[kind])) { location.href = LEGAL_PAGES[kind]; return; }
          showNote(which + ': Luvli keeps everything on your device — nothing is sent anywhere. ' +
            'Write your own terms here, or point this link at your legal page.');
        });
      }
    });
  }

  /**
   * Is there a real legal page to link to? We cannot probe synchronously, so we
   * link when the page has declared one via <body data-legal-pages="1"> or the
   * file was shipped with the app. Absent that, the inline note stands in.
   */
  function hasLegalPage(file) {
    if (!file) return false;
    const body = document.body;
    return Boolean(body && body.getAttribute('data-legal-pages') === '1');
  }

  /** A quiet note (reuses the form-error slot so every page shows it the same). */
  function showNote(message) {
    const targets = ['signupFormError', 'loginFormError', 'resetFormError'];
    for (let i = 0; i < targets.length; i++) {
      const el = document.getElementById(targets[i]);
      if (el) { el.textContent = message; el.hidden = false; return; }
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLinks);
    } else {
      initLinks();
    }
  }

  return {
    PAGES,
    guard, afterAuth, currentFile, param,
    backdrop, prefersReduced,
    peek, bindPassword, bindGoogle, resolveGoogleIdentity,
    setError, clearErrors, showFieldErrors, setFormError, showNote, announce,
    loading, readFields, checked,
    goLogin, goSignup, goApp, remember, takeNote,
    initLinks
  };
})();
