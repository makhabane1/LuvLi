/* ==========================================================================
   Luvli ♡ — netlify/functions/send-check-in-reminders.js
   --------------------------------------------------------------------------
   Buddy check-in reminders for focus room participants (Phase 3).

   Runs on a schedule (every 10 minutes — see netlify.toml). Finds pending
   check-in reminders where the scheduled time has passed, sends push
   notifications to recipients, and marks them as sent.

   Never twice: uses check_in_reminders.is_sent flag + sent_at timestamp.

   Environment variables (Netlify → Site configuration → Environment)
   -------------------------------------------------------------------
     SUPABASE_SERVICE_ROLE_KEY  required (same as send-reminders.js)
     VAPID_PRIVATE_KEY          required (same as send-reminders.js)
   Without either, it logs and does nothing — it never throws.
   ========================================================================== */
'use strict';

const webpush = require('web-push');

const SUPABASE_URL = 'https://eablejtazhyxbdjvfjmz.supabase.co';
const VAPID_PUBLIC_KEY = 'BJTytmVOgXV-3YKOvn3y6uY5PEx9EAzRG4vCEra2psPECUiKXm2M6AWH3mvf4z0XIe9V20vVG-UCN2xMkv6hj5k';
const VAPID_SUBJECT = 'https://luvli.netlify.app';

function rest(path, opts) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const options = opts || {};
  return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, options, {
    headers: Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, options.headers || {})
  }));
}

async function json(resPromise) {
  const res = await resPromise;
  return res.ok ? res.json() : [];
}

exports.handler = async () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!serviceRoleKey || !vapidPrivateKey) {
    console.error('[send-check-in-reminders] not configured (missing SUPABASE_SERVICE_ROLE_KEY or VAPID_PRIVATE_KEY) — skipping');
    return { statusCode: 200, body: JSON.stringify({ skipped: true }) };
  }

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivateKey);

    // Get pending check-in reminders (scheduled_for <= now, not yet sent)
    const now = new Date().toISOString();
    const pendingReminders = await json(rest(
      `check_in_reminders?is_sent=eq.false&scheduled_for=lte.${encodeURIComponent(now)}&select=*`,
      { method: 'GET' }
    ));

    console.log('[send-check-in-reminders] found', pendingReminders.length, 'pending reminders');

    let sent = 0;

    for (const reminder of pendingReminders) {
      try {
        // Get recipient's push subscriptions
        const subscriptions = await json(rest(
          `push_subscriptions?user_id=eq.${reminder.recipient_id}&select=*`,
          { method: 'GET' }
        ));

        if (!subscriptions.length) {
          // No subscriptions, mark as sent anyway
          await rest('check_in_reminders', {
            method: 'PATCH',
            body: JSON.stringify({
              is_sent: true,
              sent_at: new Date().toISOString()
            }),
            headers: { Prefer: 'return=minimal' }
          });
          continue;
        }

        // Prepare notification payload
        const notificationPayload = {
          title: '💫 Buddy Check-In',
          body: reminder.message || 'How\'s your focus going?',
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: 'check-in-' + reminder.id,
          data: {
            url: '/index.html#view-focus',
            checkInId: reminder.id
          }
        };

        // Send to all recipient subscriptions
        const pushPromises = subscriptions.map(sub => {
          const subscription = {
            endpoint: sub.endpoint,
            keys: {
              auth: sub.auth,
              p256dh: sub.p256dh
            }
          };

          return webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(err => {
              // Delete dead subscriptions (404/410)
              if (err.statusCode === 404 || err.statusCode === 410) {
                return rest(`push_subscriptions?id=eq.${sub.id}`, {
                  method: 'DELETE',
                  headers: { Prefer: 'return=minimal' }
                });
              }
              console.error('[send-check-in-reminders] push failed', err.statusCode, String(err.body || err.message).slice(0, 300));
            });
        });

        await Promise.all(pushPromises);

        // Mark reminder as sent
        await rest('check_in_reminders', {
          method: 'PATCH',
          body: JSON.stringify({
            is_sent: true,
            sent_at: new Date().toISOString()
          }),
          headers: { Prefer: 'return=minimal' }
        });

        sent++;
        console.log('[send-check-in-reminders] sent check-in to', reminder.recipient_id);
      } catch (err) {
        console.error('[send-check-in-reminders] error processing reminder', reminder.id, String(err).slice(0, 300));
      }
    }

    console.log('[send-check-in-reminders] sent', sent);
    return { statusCode: 200, body: JSON.stringify({ sent }) };
  } catch (err) {
    console.error('[send-check-in-reminders] fatal error', String(err).slice(0, 300));
    return { statusCode: 200, body: JSON.stringify({ error: String(err).slice(0, 300) }) };
  }
};
