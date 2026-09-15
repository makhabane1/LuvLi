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
    const next = AuthUI.afterAuth(account);
    setTimeout(() => { location.href = next; }, 800);
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
      resetToken = result.token;
      // No mail server here, so Luvli shows the link instead of pretending to
      // send it. With a real backend this whole block becomes "check your inbox".
      const link = location.origin + location.pathname + '?reset=' + encodeURIComponent(result.token) +
        '&email=' + encodeURIComponent(result.email);
      const linkEl = $('resetLinkText');
      if (linkEl) linkEl.textContent = link;
      const copy = $('resetCopyBtn');
      if (copy) copy.addEventListener('click', () => copyText(link));
      const go = $('resetGoBtn');
      if (go) go.addEventListener('click', () => { show('panelReset'); const p = $('rsPassword'); if (p) p.focus(); });
      const panel = $('forgotDone');
      const form = $('forgotForm');
      if (form) form.hidden = true;
      if (panel) panel.hidden = false;
      announce('Reset link ready.');
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
    const token = AuthUI.param('reset');
    const email = AuthUI.param('email');
    if (token && email) {
      resetToken = token; resetEmail = email;
      const field = $('rsEmail');
      if (field) field.textContent = email;
      show('panelReset');
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

    // Already signed in? Go straight through — unless they are resetting.
    if (Auth.isSignedIn() && !AuthUI.param('reset')) {
      location.replace(AuthUI.afterAuth(Auth.current()));
      return;
    }
    if (!AuthUI.param('reset')) show('panelSignIn');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
