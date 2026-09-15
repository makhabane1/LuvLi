/* ==========================================================================
   Luvli ♡ — js/coach-config.js
   --------------------------------------------------------------------------
   How the AI life coach thinks. Load it *before* js/ai-coach.js on
   ai-coach.html.

   Two modes, and Luvli is honest about which one it is in:

   • 'local'  (the default) — the built-in understanding engine in
     js/ai-coach.js reads the message, your own data and replies warmly. No
     network, no key, works offline. This is real, just not a language model.

   • 'model' — every message is sent to a small serverless function that you
     control (netlify/functions/luvli-coach.js ships in this repo). That
     function holds your model API key and talks to the model; the browser never
     sees the key. Set a URL below to switch it on.

   Why a serverless function and not a direct call?
   ------------------------------------------------
   A key pasted into client-side JavaScript is a key given away — anyone can
   read it in devtools. So the key lives in an environment variable on your
   function (COACH_API_KEY), and the browser only ever calls your own endpoint.

   Nothing here is secret. The endpoint URL is public and safe to commit.
   ========================================================================== */
'use strict';

var LuvliCoachConfig = (function () {

  var coach = {
    /**
     * 'local' — the on-device brain (default, works offline).
     * 'model' — your serverless coach endpoint answers instead.
     */
    mode: 'local',

    /**
     * Your coach endpoint, e.g. '/api/luvli-coach' (Netlify) or
     * 'https://your-app.vercel.app/api/luvli-coach'. Only used in 'model' mode.
     */
    endpoint: '',

    /**
     * A single, honest sentence shown under the composer so the person knows
     * whether they are talking to a model or the on-device coach.
     */
    labelLocal: 'Luvli\'s on-device coach — private, and works without a connection.',
    labelModel: 'Luvli\'s AI coach — your message is answered by your own secure endpoint.'
  };

  /** Is a real model endpoint configured? */
  function hasModel() {
    return coach.mode === 'model' && /^(https?:\/\/|\/)/i.test(String(coach.endpoint || ''));
  }

  /** The public face of this config, for the page and tests. */
  function snapshot() {
    return {
      mode: coach.mode,
      endpoint: coach.endpoint || '',
      model: hasModel(),
      label: hasModel() ? coach.labelModel : coach.labelLocal
    };
  }

  return {
    coach: coach,
    hasModel: hasModel,
    snapshot: snapshot
  };
})();

if (typeof window !== 'undefined') window.LuvliCoachConfig = LuvliCoachConfig;
if (typeof module !== 'undefined' && module.exports) module.exports = LuvliCoachConfig;