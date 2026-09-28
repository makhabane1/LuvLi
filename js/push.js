/* ==========================================================================
   Luvli ♡ — js/push.js
   --------------------------------------------------------------------------
   Real push notifications: reminders that arrive even when Luvli is closed.

   Once notification permission is granted, this registers the device with
   the browser's push service and saves that subscription to the user's
   push_subscriptions row (RLS: only their own). It also records their time
   zone in settings, because task times are local wall-clock times and the
   sender (netlify/functions/send-reminders.js, every 5 minutes) needs to
   know what "now" means for each person.

   The VAPID key below is the PUBLIC half — safe to commit. The private half
   lives only in Netlify's environment (VAPID_PRIVATE_KEY).

   Needs: js/auth.js + a real provider, window.supabaseClient, and the
   service worker registered by app.js (sw.js handles the 'push' event).
   ========================================================================== */
'use strict';

const LuvliPush = (() => {
  const VAPID_PUBLIC_KEY = 'BJTytmVOgXV-3YKOvn3y6uY5PEx9EAzRG4vCEra2psPECUiKXm2M6AWH3mvf4z0XIe9V20vVG-UCN2xMkv6hj5k';

  function supported() {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator &&
      'PushManager' in window && typeof Notification !== 'undefined';
  }

  function cloudReady() {
    const provider = typeof Auth !== 'undefined' && Auth.activeProvider && Auth.activeProvider();
    return Boolean(provider && provider.isLocal === false && window.supabaseClient && Auth.current());
  }

  function keyToBytes(base64url) {
    const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
    const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  function timezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (err) { return 'UTC'; }
  }

  /** Subscribe this device (or reuse its existing subscription) and save it to the account. */
  function subscribe() {
    if (!supported() || !cloudReady() || Notification.permission !== 'granted') return Promise.resolve(false);
    const uid = Auth.current().id;
    return navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription().then((existing) => existing ||
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) })))
      .then((sub) => {
        const json = sub.toJSON();
        return Promise.all([
          window.supabaseClient.from('push_subscriptions').upsert([{
            user_id: uid, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth
          }], { onConflict: 'user_id,endpoint' }),
          window.supabaseClient.from('settings').update({ timezone: timezone() }).eq('user_id', uid)
        ]);
      })
      .then(([subRes, tzRes]) => {
        if (subRes.error) throw subRes.error;
        if (tzRes.error) throw tzRes.error;
        return true;
      });
  }

  /** On every app start: if permission was already granted, keep this device's subscription (and time zone) current. */
  function syncIfGranted() {
    return subscribe().catch((err) => { console.warn('Luvli: could not register for push notifications', err); return false; });
  }

  return { supported, subscribe, syncIfGranted };
})();
