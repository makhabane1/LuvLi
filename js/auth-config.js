/* ==========================================================================
   Luvli — js/auth-config.js
   --------------------------------------------------------------------------
   The one place real sign-in is configured. Load it *before* js/auth-ui.js on
   login.html and signup.html.

   Luvli ships local-first: with nothing configured here, sign-in is the honest
   on-device account (js/auth.js) and the Google button falls back to a clearly
   labelled local stand-in. Fill in a Google OAuth client ID below and the very
   same buttons become a real Google Identity Services flow — no other file
   changes.

   Where the values come from
   --------------------------
   - clientId: Google Cloud Console -> APIs & Services -> Credentials ->
     Create credentials -> OAuth client ID -> Web application.
     Add your site under "Authorised JavaScript origins"
     (e.g. http://localhost:8080, https://your-domain).
     It is safe to ship: a client ID is public, not a secret.

   Nothing here is a password, a token or a secret. Secrets that must stay
   server-side (an AI provider key) never belong in this file — they live in the
   coach's serverless function instead (see netlify/functions/luvli-coach.js).
   ========================================================================== */
'use strict';

var LuvliAuthConfig = (function () {

  /**
   * Real Google sign-in. Leave clientId empty to keep the local stand-in.
   */
  var google = {
    // Paste your OAuth client ID here, e.g.
    // clientId: '1234567890-abc123.apps.googleusercontent.com',
    clientId: '',
    // The Google Identity Services library (loaded lazily, only when needed).
    gisSrc: 'https://accounts.google.com/gsi/client'
  };

  /** Is a real Google client configured? (Drives every branch below.) */
  function hasGoogle() {
    return typeof google.clientId === 'string' && /\.apps\.googleusercontent\.com$/.test(google.clientId);
  }

  /** The public face of this config, for the pages and tests. */
  function snapshot() {
    return {
      google: { enabled: hasGoogle(), clientId: google.clientId || '' }
    };
  }

  return {
    google: google,
    hasGoogle: hasGoogle,
    snapshot: snapshot
  };
})();

if (typeof window !== 'undefined') window.LuvliAuthConfig = LuvliAuthConfig;
if (typeof module !== 'undefined' && module.exports) module.exports = LuvliAuthConfig;
