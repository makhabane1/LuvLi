/* ==========================================================================
   Luvli ♡ — js/auth-provider-supabase.js
   --------------------------------------------------------------------------
   A real Auth.setProvider() implementation backed by Supabase Auth (GoTrue).
   Load order matters:

     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="supabase.js"></script>            (creates window.supabaseClient)
     <script src="js/auth.js"></script>
     <script src="js/auth-provider-supabase.js"></script>
     <script>Auth.setProvider(SupabaseAuthProvider);</script>

   Supabase's own session check is asynchronous, but the rest of Luvli calls
   Auth.current()/isSignedIn() as a plain synchronous function. This file
   bridges that gap the standard way: init() resolves the first session check
   once and caches it, onAuthStateChange keeps the cache current after that,
   and current() just reads the cache. Every page that guards itself
   (auth-guard.js, app.js, login.js, signup.js) already awaits Auth.ready()
   before checking Auth.isSignedIn(), so the cache is always populated by the
   time anything asks.
   ========================================================================== */
'use strict';

const SupabaseAuthProvider = (() => {

  let cachedAccount = null;
  const recoveryListeners = [];

  function client() {
    if (!window.supabaseClient) {
      throw new Error('window.supabaseClient is missing — check that supabase.js loaded before this file.');
    }
    return window.supabaseClient;
  }

  /** Map a Supabase auth user onto the { id, name, email, ... } shape the rest of Luvli expects. */
  function mapUser(user) {
    if (!user) return null;
    const name = (user.user_metadata && user.user_metadata.name) || '';
    const avatar = (user.user_metadata && user.user_metadata.avatar) || { color: 'pink', shape: 'heart' };
    return {
      id: user.id,
      name,
      email: user.email || '',
      initials: Auth.initialsFor(name || user.email),
      avatar,
      createdAt: user.created_at,
      lastSeenAt: user.last_sign_in_at || user.updated_at
    };
  }

  /** Supabase's error messages are plain strings; map the common ones to friendly, field-shaped errors. */
  function mapAuthError(error, fallbackField) {
    const message = (error && error.message) || '';
    const friendly = /invalid login credentials/i.test(message)
      ? 'That email or password is not quite right.'
      : /email not confirmed/i.test(message)
        ? 'Please confirm your email first — check your inbox for the link we sent.'
        : /rate limit/i.test(message)
          ? 'Too many attempts — please wait a moment and try again.'
          : message || 'Something went wrong. Please try again.';
    return { [fallbackField || 'email']: friendly };
  }

  /* -------------------------------------------------------------- init --- */

  /**
   * Resolves the first session check, then keeps `cachedAccount` current for
   * the lifetime of the page via onAuthStateChange. Called once by
   * Auth.setProvider() (see the bottom of auth.js).
   */
  function init() {
    return client().auth.getSession().then(({ data }) => {
      cachedAccount = mapUser(data && data.session && data.session.user);
      client().auth.onAuthStateChange((event, session) => {
        cachedAccount = mapUser(session && session.user);
        if (event === 'PASSWORD_RECOVERY') recoveryListeners.forEach((fn) => fn());
      });
    });
  }

  /** Called by login.js when it wants to know a password-recovery link just landed. */
  function onPasswordRecovery(callback) {
    if (typeof callback === 'function') recoveryListeners.push(callback);
  }

  /* ------------------------------------------------------------ signUp --- */

  function signUp(input, options) {
    const check = Auth.validate(input, { checkExists: false });
    if (!check.ok) return Promise.resolve({ ok: false, errors: check.errors });

    return client().auth.signUp({
      email: check.values.email,
      password: check.values.password,
      options: { data: { name: check.values.name } }
    }).then(({ data, error }) => {
      if (error) return { ok: false, errors: mapAuthError(error) };
      // Supabase's anti-enumeration behaviour: signing up with an email that
      // already has a confirmed account succeeds with an empty identities
      // array instead of a clear error.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return {
          ok: false,
          errors: { email: 'You already have an account with this email. Try signing in.' }
        };
      }
      if (!data.session) {
        // Email confirmation is required (Supabase project setting). No
        // session yet — the caller must show a "check your email" state
        // instead of treating this as a normal signed-in success.
        return { ok: true, pendingConfirmation: true, account: mapUser(data.user) };
      }
      cachedAccount = mapUser(data.user);
      return { ok: true, account: cachedAccount };
    });
  }

  /* ------------------------------------------------------------ signIn --- */

  function signIn(input) {
    const check = Auth.validateSignIn(input);
    if (!check.ok) return Promise.resolve({ ok: false, errors: check.errors });

    return client().auth.signInWithPassword({
      email: check.values.email,
      password: check.values.password
    }).then(({ data, error }) => {
      if (error) return { ok: false, reason: 'bad-credentials', errors: mapAuthError(error, 'password') };
      cachedAccount = mapUser(data.user);
      return { ok: true, account: cachedAccount };
    });
  }

  /* ----------------------------------------------------------- signOut --- */

  function signOut() {
    return client().auth.signOut().then(() => {
      cachedAccount = null;
      return { ok: true };
    });
  }

  /* ----------------------------------------------------------- current --- */

  /** MUST be synchronous — see the header comment. */
  function current() {
    return cachedAccount;
  }

  /* ------------------------------------------------------ password reset - */

  function requestReset(email) {
    const wanted = Auth.normaliseEmail(email);
    return client().auth.resetPasswordForEmail(wanted, {
      redirectTo: location.origin + location.pathname
    }).then(({ error }) => {
      if (error) return { ok: false, errors: mapAuthError(error) };
      // No token comes back to the client by design — Supabase emails the
      // real link. login.js shows "check your inbox" when result.token is
      // absent but result.mailed is true.
      return { ok: true, email: wanted, mailed: true };
    });
  }

  /**
   * Finishes a reset. email/token are ignored here — clicking the emailed
   * link already establishes a temporary "recovery" session (that's what
   * onPasswordRecovery() above is watching for), so this just updates the
   * password on that session.
   */
  function resetPassword(email, token, password, confirm) {
    if (!password || password.length < Auth.MIN_PASSWORD) {
      return Promise.resolve({
        ok: false,
        errors: { password: 'A little longer, please — at least ' + Auth.MIN_PASSWORD + ' characters.' }
      });
    }
    if (confirm !== undefined && confirm !== password) {
      return Promise.resolve({ ok: false, errors: { confirm: 'These two passwords do not match yet.' } });
    }
    return client().auth.updateUser({ password }).then(({ data, error }) => {
      if (error) return { ok: false, errors: mapAuthError(error, 'password') };
      cachedAccount = mapUser(data.user);
      return { ok: true, account: cachedAccount };
    });
  }

  /* --------------------------------------------------------- update ------ */

  /**
   * Rename / restyle the signed-in account. Stored in Supabase's own
   * user_metadata for now — Phase 5 moves this onto the `profiles` table
   * instead, once the rest of the app's data lives there too.
   */
  function update(patch) {
    const account = current();
    if (!account) return Promise.resolve(null);
    const data = {};
    if (patch && typeof patch.name === 'string' && patch.name.trim()) data.name = patch.name.trim();
    if (patch && patch.avatar) data.avatar = Object.assign({}, account.avatar, patch.avatar);
    if (!Object.keys(data).length) return Promise.resolve(account);

    return client().auth.updateUser({ data }).then(({ data: result, error }) => {
      if (error) return account;
      cachedAccount = mapUser(result.user);
      return cachedAccount;
    });
  }

  /* --------------------------------------------------- Google OAuth ------
     Supabase's real Google sign-in is a full-page redirect, not a popup with
     an identity object handed back synchronously: the browser navigates to
     Google, then back to `redirectTo` with the session already established.
     auth-ui.js calls this directly (see bindGoogle) instead of going through
     the identity-resolution path used by the local stand-in, and the page's
     own Auth.ready().then(...) boot logic (already in login.js/signup.js)
     picks up the new session once the browser lands back here. */
  function signInWithOAuthRedirect(providerName, options) {
    const opts = options || {};
    return client().auth.signInWithOAuth({
      provider: providerName,
      options: { redirectTo: opts.redirectTo || (location.origin + location.pathname) }
    }).then(({ error }) => {
      if (error) throw error;
      // No return value on purpose: the browser is navigating away now.
    });
  }

  return {
    name: 'supabase',
    isLocal: false,
    init,
    signUp,
    signIn,
    signOut,
    current,
    requestReset,
    resetPassword,
    update,
    onPasswordRecovery,
    signInWithOAuthRedirect
  };
})();
