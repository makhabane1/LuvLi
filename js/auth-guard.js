/* ==========================================================================
   Luvli ♡ — js/auth-guard.js
   --------------------------------------------------------------------------
   A one-line guard for Luvli's companion pages (personality.html,
   ai-coach.html, vision-board.html). The main app guards itself in app.js;
   these pages only need to know "is anybody signed in?" and, if not, hand
   over to login.html.

   Load it *after* js/auth.js on any page that should be private:

     <script src="js/auth.js"></script>
     <script src="js/auth-guard.js"></script>

   It is deliberately tiny and does nothing else — no UI, no state.
   ========================================================================== */
'use strict';

(function () {
  if (typeof Auth === 'undefined') return;      // auth.js missing → stay quiet
  // Auth.ready() resolves instantly for the local provider, and after the
  // real backend's first session check for a provider like Supabase — see
  // js/auth.js's setProvider().
  Auth.ready().then(function () {
    if (Auth.isSignedIn()) return;               // signed in → nothing to do
    var here = (location.pathname.split('/').pop()) || 'index.html';
    location.replace('login.html?next=' + encodeURIComponent(here));
  });
})();
