/* ==========================================================================
   Luvli ♡ — js/auth-boot.js
   --------------------------------------------------------------------------
   Switches Auth over to the real Supabase-backed provider, on every page
   that loads it. One file so every page agrees, instead of repeating the
   same setProvider() call six times.

   Load order (see index.html / login.html / signup.html / auth-guard.js
   pages): supabase-js SDK → supabase.js → auth.js → auth-provider-supabase.js
   → auth-boot.js → (auth-guard.js, if this page has one) → the page's own
   script → app.js, if this is index.html.
   ========================================================================== */
'use strict';

(function () {
  if (typeof Auth === 'undefined' || typeof SupabaseAuthProvider === 'undefined') return;
  Auth.setProvider(SupabaseAuthProvider);
})();
