/* ==========================================================================
   Luvli ♡ — netlify/functions/delete-account.js
   --------------------------------------------------------------------------
   Deletes the signed-in user's Supabase Auth account (and, via every
   table's `references auth.users(id) on delete cascade`, every row of
   their data — tasks, settings, sessions, subjects, everything).

   This exists because Supabase's browser SDK has no self-delete call: only
   the Admin API can delete a user, and that needs the service-role key,
   which must never reach the browser. So the browser calls this function
   with its own session token, and this function — holding the service-role
   key as a server-side environment variable only — does the deletion.

   Security: the caller's identity comes from verifying their own access
   token against Supabase's /auth/v1/user endpoint, never from a client-
   supplied id. A request can only ever delete the account it is
   authenticated as.

   Deploy
   ------
   Netlify: this file is served at /.netlify/functions/delete-account
            (or /api/delete-account with a redirect — see netlify.toml).

   Environment variables (Netlify → Site settings → Environment)
   ---------------------------------------------------------------
     SUPABASE_SERVICE_ROLE_KEY  required  from Supabase → Project Settings →
                                          API → service_role key. NEVER put
                                          this anywhere in the repo or the
                                          browser — Netlify env vars only.
     LUVLI_ALLOWED_ORIGIN       optional  lock CORS to your site
   ========================================================================== */
'use strict';

// The project URL and anon key are public by design (same ones already
// committed in supabase.js) — only the service-role key below is secret.
const SUPABASE_URL = 'https://eablejtazhyxbdjvfjmz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xVHqVz-QJICcto3PFWEVeA_yCCy-j6q';

const json = (status, body, headers) => ({
  statusCode: status,
  headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers || {}),
  body: JSON.stringify(body)
});

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.LUVLI_ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

exports.handler = async (event) => {
  const cors = corsHeaders();

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' }, cors);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json(500, { error: 'Account deletion is not configured on this server yet.' }, cors);

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'Missing session.' }, cors);

  try {
    // Who is this, really? Resolve the user id from their own token —
    // never trust anything the client claims about which account to delete.
    const whoami = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
    });
    if (!whoami.ok) return json(401, { error: 'Invalid or expired session.' }, cors);
    const user = await whoami.json();
    if (!user || !user.id) return json(401, { error: 'Invalid session.' }, cors);

    // Storage files aren't covered by the database's "on delete cascade" —
    // remove this user's Vision Board photos first. Best effort: a failure
    // here is logged but never blocks deleting the account itself.
    try {
      const adminHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
      const listRes = await fetch(SUPABASE_URL + '/storage/v1/object/list/vision-board', {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({ prefix: user.id + '/', limit: 1000, offset: 0 })
      });
      const files = listRes.ok ? await listRes.json() : [];
      const paths = (Array.isArray(files) ? files : []).map((f) => user.id + '/' + f.name);
      if (paths.length) {
        await fetch(SUPABASE_URL + '/storage/v1/object/vision-board', {
          method: 'DELETE', headers: adminHeaders, body: JSON.stringify({ prefixes: paths })
        });
      }
    } catch (err) {
      console.error('[delete-account] storage cleanup failed', err && err.message);
    }

    const deleteRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + user.id, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
    });
    if (!deleteRes.ok) {
      const detail = await deleteRes.text().catch(() => '');
      console.error('[delete-account] admin delete failed', deleteRes.status, detail.slice(0, 500));
      return json(500, { error: 'Could not delete the account. Please try again.' }, cors);
    }

    return json(200, { ok: true }, cors);
  } catch (err) {
    console.error('[delete-account] request failed', err && err.message);
    return json(500, { error: 'Something went wrong. Please try again.' }, cors);
  }
};
