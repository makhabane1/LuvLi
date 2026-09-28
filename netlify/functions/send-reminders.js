/* ==========================================================================
   Luvli ♡ — netlify/functions/send-reminders.js
   --------------------------------------------------------------------------
   Real push reminders, delivered even when Luvli is closed.

   Runs on a schedule (every 5 minutes — see netlify.toml). For each person
   with a push subscription and reminders switched on, it works out "now" in
   their own time zone (task times are local wall-clock times), finds
   today's unfinished activities starting within their chosen lead time,
   and pushes one reminder per activity to each of their devices.

   Never twice: before sending, it claims the reminder in push_log (primary
   key user_id+task_id+date). If the row already exists, it was already sent
   by an earlier run, and this run skips it. Dead device subscriptions
   (404/410 from the push service) are deleted.

   Environment variables (Netlify → Site configuration → Environment)
   -------------------------------------------------------------------
     SUPABASE_SERVICE_ROLE_KEY  required (already set, for delete-account)
     VAPID_PRIVATE_KEY          required — from your local .env.vapid.local
   Without either, it logs and does nothing — it never throws.
   ========================================================================== */
'use strict';

const webpush = require('web-push');

// Public values — safe to commit. Only the two env vars above are secret.
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

/** Today's date ('YYYY-MM-DD') and minutes since midnight, in an IANA time zone. */
function localNow(timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
  } catch (err) {
    if (timeZone !== 'UTC') return localNow('UTC');
    throw err;
  }
  const part = (type) => (parts.find((p) => p.type === type) || {}).value;
  return { date: part('year') + '-' + part('month') + '-' + part('day'), minutes: Number(part('hour')) * 60 + Number(part('minute')) };
}

function toMinutes(time) {
  const [h, m] = String(time || '0:0').split(':').map(Number);
  return h * 60 + m;
}

function formatTime(time, format) {
  const [h, m] = String(time).split(':').map(Number);
  const mm = String(m).padStart(2, '0');
  if (format === '12') return ((h % 12) || 12) + ':' + mm + (h < 12 ? ' am' : ' pm');
  return String(h).padStart(2, '0') + ':' + mm;
}

exports.handler = async () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log('[send-reminders] not configured (missing SUPABASE_SERVICE_ROLE_KEY or VAPID_PRIVATE_KEY) — skipping');
    return { statusCode: 200, body: 'not configured' };
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const subs = await json(rest('push_subscriptions?select=id,user_id,endpoint,p256dh,auth'));
  if (!subs.length) return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };

  const byUser = {};
  subs.forEach((s) => { (byUser[s.user_id] = byUser[s.user_id] || []).push(s); });

  const settings = await json(rest('settings?select=user_id,timezone,time_format,notifications_enabled,notifications_lead_minutes' +
    '&user_id=in.(' + Object.keys(byUser).join(',') + ')'));

  let sent = 0;
  for (const s of settings) {
    if (!s.notifications_enabled) continue;
    const lead = Math.max(1, Number(s.notifications_lead_minutes) || 10);
    const now = localNow(s.timezone || 'UTC');

    const tasks = await json(rest('tasks?select=id,name,start_time&user_id=eq.' + s.user_id +
      '&date=eq.' + now.date + '&completed=eq.false'));

    for (const task of tasks) {
      const until = toMinutes(task.start_time) - now.minutes;
      if (until <= 0 || until > lead) continue;

      // Claim this reminder; an empty result means an earlier run already sent it.
      const claimed = await json(rest('push_log?on_conflict=user_id,task_id,date', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify([{ user_id: s.user_id, task_id: task.id, date: now.date }])
      }));
      if (!claimed.length) continue;

      const payload = JSON.stringify({
        title: task.name,
        body: 'Starts at ' + formatTime(task.start_time, s.time_format) + ' — in ' + until + ' min',
        tag: 'task-' + task.id, id: task.id, name: task.name, url: './index.html'
      });

      for (const sub of byUser[s.user_id]) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 600 });
          sent += 1;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await rest('push_subscriptions?id=eq.' + sub.id, { method: 'DELETE' });
          } else {
            console.error('[send-reminders] push failed', err.statusCode, String(err.body || err.message).slice(0, 300));
          }
        }
      }
    }
  }

  console.log('[send-reminders] sent', sent);
  return { statusCode: 200, body: JSON.stringify({ sent }) };
};
