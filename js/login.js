/* =========================================================================
   LUVLI ♡ — js/login.js
   --------------------------------------------------------------------------
   The sign-in flow for login.html. Three small panels that swap in place:

     • sign in        — email, password, remember me, forgot password
     • forgot password — ask for the email, hand back a reset link
     • set a new password — the reset itself, then straight into Luvli

   All the real work is in js/auth.js; the shared behaviour is in js/auth-ui.js.
   ========================================================================== */
'use strict';

(() => {

  const PANELS = ['panelSignIn', 'panelForgot', 'panelReset'];
  let resetEmail = '';
  let resetToken = '';

  const $ = (id) => document.getElementById(id);

  function show(panelId) {
    PANELS.forEach((id) => { const el = $(id); if (el) el.hidden = id !== panelId; });
    announce(panelId === 'panelSignIn' ? 'Sign in' :
      (panelId === 'panelForgot' ? 'Reset your password' : 'Choose a new password'));
  }

  function announce(message) {
    const el = $('authAnnouncer');
    if (el) el.textContent = message;
  }

  /* ------------------------------------------------------------- sign in */

  function initSignIn() {
    const form = $('loginForm');
    if (form) form.addEventListener('submit', (event) => { event.preventDefault(); submitSignIn(); });

    const eye = $('liPasswordEye');
    if (eye) eye.addEventListener('click', () => AuthUI.peek('liPassword', eye));

    const forgot = $('forgotBtn');
    if (forgot) forgot.addEventListener('click', () => {
      AuthUI.clearErrors();
      const email = $('liEmail');
      const input = $('fgEmail');
      if (email && input && email.value) input.value = email.value;
      show('panelForgot');
    });

    // Continue with Google — shared behaviour, this page's own follow-up.
    AuthUI.bindGoogle({
      button: 'googleLoginBtn',
      errorId: 'loginFormError',
      remember: AuthUI.checked('liRemember'),
      onSignedIn: (result) => onSignedIn(result.account)
    });

    // A note carried over from signing out, or from the app's guard.
    AuthUI.takeNote('loginFormError');
  }

  function submitSignIn() {
    const button = $('loginBtn');
    AuthUI.clearErrors();
    const input = { email: ($('liEmail') || {}).value || '', password: ($('liPassword') || {}).value || '' };

    const check = Auth.validateSignIn(input);
    if (!check.ok) {
      AuthUI.showFieldErrors(check.errors, { email: 'liEmailError', password: 'liPasswordError' });
      return;
    }

    AuthUI.loading(button, true);
    Auth.signIn(input, { remember: AuthUI.checked('liRemember') }).then((result) => {
      AuthUI.loading(button, false);
      if (!result.ok) {
        AuthUI.showFieldErrors(result.errors || {}, { email: 'liEmailError', password: 'liPasswordError' });
        AuthUI.setFormError('loginFormError',
          result.reason === 'no-account'
            ? 'No account with that email here yet.'
            : (result.reason === 'bad-password' ? 'That password is not quite it.' : 'Please check the form.'));
        return;
      }
      onSignedIn(result.account);
    }).catch(() => {
      AuthUI.loading(button, false);
      AuthUI.setFormError('loginFormError', 'Something went wrong. Please try again.');
    });
  }

  /** The successful sign-in state, then into the app. */
  function onSignedIn(account) {
    const form = $('loginForm');
    const success = $('loginSuccess');
    if (form) form.hidden = true;
    if (success) success.hidden = false;
    const text = $('loginSuccessText');
    const name = account && account.name ? account.name.split(' ')[0] : 'you';
    if (text) text.textContent = 'Welcome back, ' + name + '. Opening your day…';
    announce('Signed in. Opening Luvli.');
    // Pull settings first (a real backend only — this resolves instantly
    // and does nothing for the local provider) so a returning,
    // already-onboarded user isn't sent through onboarding again just
    // because this device hasn't seen their cloud settings yet.
    Promise.resolve(typeof SupabaseSync !== 'undefined' ? SupabaseSync.pull() : null).catch(() => {}).then(() => {
      const next = AuthUI.afterAuth(account);
      setTimeout(() => { location.href = next; }, 800);
    });
  }

  /* ----------------------------------------------------- forgot password */

  function initForgot() {
    const form = $('forgotForm');
    if (form) form.addEventListener('submit', (event) => { event.preventDefault(); submitForgot(); });
    const back = $('forgotBack');
    if (back) back.addEventListener('click', () => { AuthUI.clearErrors(); show('panelSignIn'); });
  }

  function submitForgot() {
    AuthUI.clearErrors();
    const button = $('forgotBtnSubmit');
    const email = ($('fgEmail') || {}).value || '';

    AuthUI.loading(button, true);
    // requestReset is synchronous locally; wrap it so a real provider (which
    // returns a promise) drops in without changing this file.
    Promise.resolve(Auth.requestReset(email)).then((result) => {
      AuthUI.loading(button, false);
      if (!result.ok) {
        AuthUI.showFieldErrors(result.errors || {}, { email: 'fgEmailError' });
        return;
      }
      resetEmail = result.email;
      resetToken = result.token || '';
      const panel = $('forgotDone');
      const form = $('forgotForm');
      const linkRow = $('resetLinkRow');

      if (result.token) {
        // The local provider has no mail server, so it hands back a token and
        // Luvli shows the link directly instead of pretending to send it.
        const link = location.origin + location.pathname + '?reset=' + encodeURIComponent(result.token) +
          '&email=' + encodeURIComponent(result.email);
        const linkEl = $('resetLinkText');
        if (linkEl) linkEl.textContent = link;
        const copy = $('resetCopyBtn');
        if (copy) copy.addEventListener('click', () => copyText(link));
        const go = $('resetGoBtn');
        if (go) go.addEventListener('click', () => { show('panelReset'); const p = $('rsPassword'); if (p) p.focus(); });
        if (linkRow) linkRow.hidden = false;
      } else {
        // A real provider (Supabase) sent an actual email and deliberately
        // does not hand the token back to the browser — there is nothing to
        // click here; the emailed link brings them straight back to this
        // page, which reopens the reset panel via onPasswordRecovery() below.
        if (linkRow) linkRow.hidden = true;
        const title = $('resetDoneTitle');
        const note = $('resetDoneNote');
        if (title) title.textContent = 'Check your email';
        if (note) note.textContent = 'We sent a reset link to ' + result.email + '. Open it on this device to choose a new password.';
      }

      if (form) form.hidden = true;
      if (panel) panel.hidden = false;
      announce(result.token ? 'Reset link ready.' : 'Check your email for a reset link.');
    });
  }

  function copyText(text) {
    const done = () => {
      const copy = $('resetCopyBtn');
      if (copy) { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy link'; }, 1600); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => { });
    } else {
      const area = document.createElement('textarea');
      area.value = text; document.body.appendChild(area); area.select();
      try { document.execCommand('copy'); done(); } catch (err) { /* nothing we can do */ }
      area.remove();
    }
  }

  /* ---------------------------------------------------- set new password */

  function initReset() {
    // A reset link carries ?reset=…&email=… — open that panel straight away.
    // This is the local provider's own scheme (see js/auth.js).
    const token = AuthUI.param('reset');
    const email = AuthUI.param('email');
    if (token && email) {
      resetToken = token; resetEmail = email;
      const field = $('rsEmail');
      if (field) field.textContent = email;
      show('panelReset');
    }

    // A real provider's emailed link (Supabase) carries its own token in the
    // URL and establishes a temporary session automatically; it tells us via
    // this event instead of a query param we control.
    const provider = Auth.activeProvider && Auth.activeProvider();
    if (provider && typeof provider.onPasswordRecovery === 'function') {
      provider.onPasswordRecovery(() => {
        resetToken = ''; resetEmail = '';
        const field = $('rsEmail');
        if (field) field.textContent = '';
        show('panelReset');
        const p = $('rsPassword');
        if (p) p.focus();
      });
    }

    AuthUI.bindPassword({
      input: 'rsPassword', eye: 'rsPasswordEye',
      bars: 'rsPwBars', label: 'rsPwLabel', hints: 'rsPwHints'
    });
    const confirmEye = $('rsConfirmEye');
    if (confirmEye) confirmEye.addEventListener('click', () => AuthUI.peek('rsConfirm', confirmEye));

    const form = $('resetForm');
    if (form) form.addEventListener('submit', (event) => { event.preventDefault(); submitReset(); });
    const back = $('resetBack');
    if (back) back.addEventListener('click', () => { AuthUI.clearErrors(); show('panelSignIn'); });
  }

  function submitReset() {
    AuthUI.clearErrors();
    const button = $('resetBtn');
    const input = {
      password: ($('rsPassword') || {}).value || '',
      confirm: ($('rsConfirm') || {}).value || ''
    };

    AuthUI.loading(button, true);
    Auth.resetPassword(resetEmail, resetToken, input.password, input.confirm).then((result) => {
      AuthUI.loading(button, false);
      if (!result.ok) {
        AuthUI.showFieldErrors(result.errors || {}, {
          password: 'rsPasswordError', confirm: 'rsConfirmError', token: 'resetFormError'
        });
        return;
      }
      onSignedIn(result.account);
    }).catch(() => {
      AuthUI.loading(button, false);
      AuthUI.setFormError('resetFormError', 'Something went wrong. Please try again.');
    });
  }

  /* ------------------------------------------------------------------ boot */

  function init() {
    AuthUI.backdrop({ motes: 'authMotes', count: 14 });
    initSignIn();
    initForgot();
    initReset();

    // Auth.ready() resolves instantly for the local provider, and after the
    // real backend's first session check for a provider like Supabase.
    Auth.ready().then(() => {
      // Already signed in? Go straight through — unless they are resetting.
      if (Auth.isSignedIn() && !AuthUI.param('reset')) {
        Promise.resolve(typeof SupabaseSync !== 'undefined' ? SupabaseSync.pull() : null).catch(() => {}).then(() => {
          location.replace(AuthUI.afterAuth(Auth.current()));
        });
        return;
      }
      if (!AuthUI.param('reset')) show('panelSignIn');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
