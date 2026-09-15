/* =============================================================================
 notifications.js — Luvli's gentle nudges
 -----------------------------------------------------------------------------
 • Asks for browser permission only when the user taps the button
 • Turns the schedule into soft reminders (before / when it starts / after)
 • Always shows an in-app toast as well, so reminders still work when the
 browser permission is not given (app.js listens for 'luvli:toast')
 ========================================================================== */
'use strict';

const Notifier = (() => {
 const CHECK_EVERY = 30000;  // look at the schedule twice a minute
 let loop = null;
 let registration = null;  // the service worker registration, when there is one
 let snoozeTimer = null;

 const supported = () => typeof window.Notification !== 'undefined';
 const permission = () => (supported() ? Notification.permission : 'unsupported');

 /** app.js hands us the service worker registration once it exists. */
 function setRegistration(reg) { registration = reg || null; }
 const hasWorker = () => Boolean(registration && registration.showNotification);

 /** Ask for permission. Only ever called from a user click. */
 function requestPermission() {
 if (!supported()) return Promise.resolve('unsupported');
 return Notification.requestPermission();
 }

 function statusText() {
 if (!supported()) return 'Notifications: not supported in this browser';
 if (Notification.permission === 'granted') return 'Notifications: on';
 if (Notification.permission === 'denied') return 'Notifications: blocked in your browser settings';
 return 'Notifications: not allowed yet';
 }

 /**
 * Show a gentle nudge: always as an in-app toast, and as a real browser
 * notification when the user has allowed them. When a service worker is
 * available the reminder also carries "Snooze" and "Start now" buttons.
 */
 function push(options) {
 const opts = options || {};
 document.dispatchEvent(new CustomEvent('luvli:toast', {
 detail: { icon: opts.icon, title: opts.title, body: opts.body }
 }));

 const settings = Storage.get().settings.notifications;
 if (!supported() || Notification.permission !== 'granted' || !settings.enabled) return;

 const payload = {
 body: opts.body || '',
 tag: opts.tag || 'luvli',
 icon: 'assets/icon-192.png',
 badge: 'assets/icon-192.png',
 data: { id: opts.taskId || '', name: opts.taskName || '' }
 };

 try {
 if (hasWorker()) {
 if (opts.actions) {
 payload.actions = [
 { action: 'snooze', title: 'Snooze 10 min' },
 { action: 'start', title: 'Start now' }
 ];
 }
 registration.showNotification(opts.title || 'Luvli', payload);
 } else {
 const note = new Notification(opts.title || 'Luvli', payload);
 setTimeout(() => note.close(), 12000);
 }
 } catch (err) {
 // Some browsers only allow notifications from a service worker.
 // The in-app toast above still keeps the user informed.
 }
 }

 /** Put a reminder back on the clock for later. */
 function snooze(minutes, key) {
 if (snoozeTimer) clearTimeout(snoozeTimer);
 const wait = Math.max(1, Number(minutes) || 10) * 60000;
 // Forget that we already sent it, so the next check can send it again
 if (key) {
 Storage.update((state) => { delete state.notified[key]; }, 'notified-snooze');
 }
 snoozeTimer = setTimeout(() => { checkSchedule(); }, wait);
 push({ icon: 'clock', title: 'Snoozed', body: 'I will remind you again in ' + (minutes || 10) + ' minutes.' });
 }

 /* --------------------------- "already sent?" ---------------------------- */
 const alreadySent = (key) => Boolean(Storage.get().notified[key]);

 function markSent(key, icon, title, body, extra) {
 Storage.update((state) => { state.notified[key] = Date.now(); }, 'notified');
 const options = { icon: icon, title: title, body: body, tag: key };
 if (extra) Object.keys(extra).forEach((name) => { options[name] = extra[name]; });
 push(options);
 }

 /* ---------------------------- the schedule ------------------------------ */
 /** One pass over today's plan. Called every 30 seconds. */
 function checkSchedule() {
 const state = Storage.get();
 const settings = state.settings.notifications;
 if (!settings.enabled) return;

 const today = Utils.todayKey();
 const now = Scheduler.nowMinutes();
 // 💗 Your Luvli style can adjust the lead time (a minimal style asks later).
 const stylePrefs = (typeof LuvliStyle !== 'undefined') ? LuvliStyle.get(state) : null;
 const lead = stylePrefs
 ? Math.max(Number(settings.leadMinutes) || 10, stylePrefs.reminderStyle === 'minimal' ? 5 : 0)
 : (Number(settings.leadMinutes) || 10);
 const voice = (typeof LuvliStyle !== 'undefined') ? LuvliStyle.voice(state) : null;
 const status = Scheduler.liveStatus(today, state, now);

 // 1. Something is starting soon — worded in the user's own reminder style
 status.upcoming.forEach((task) => {
 const minutesUntil = Scheduler.timeToMinutes(task.start) - now;
 if (minutesUntil > 0 && minutesUntil <= lead) {
 const key = 'soon:' + today + ':' + task.id;
 if (!alreadySent(key)) {
 const body = stylePrefs
 ? LuvliStyle.reminderLine(stylePrefs, task.name, minutesUntil)
 : task.name + ' starts in ' + minutesUntil + ' minute' + (minutesUntil === 1 ? '' : 's') + '.';
 const title = stylePrefs ? stylePrefs.name : 'Coming up, luv';
 markSent(key, '', title, body,
 { taskId: task.id, taskName: task.name, actions: true });
 }
 }
 });

 // 2. Something just started — announced in the Luvli voice you chose
 if (status.current) {
 const key = 'start:' + today + ':' + status.current.id;
 if (!alreadySent(key)) {
 const studying = ['study', 'class', 'work', 'project'].indexOf(status.current.category) > -1;
 const body = voice
      ? status.current.name + ' ' + voice.starting
 : "It's time for " + status.current.name + ". Let's begin.";
 markSent(key, Scheduler.iconFor(status.current),
 studying ? 'Study time' : 'Your next thing', body);
 }
 }

 // 3. Something finished without being ticked off — never scolding
 status.tasks.forEach((task) => {
 if (task.completed) return;
 const minutesSinceEnd = now - Scheduler.timeToMinutes(task.end);
 if (minutesSinceEnd >= 2 && minutesSinceEnd <= 25) {
 const key = 'end:' + today + ':' + task.id;
 if (!alreadySent(key)) {
 markSent(key, '', 'That one slipped by',
 task.name + ' has finished. Want to move it, luv?');
 }
 }
 });

 // 4. Evening wind-down (two hours before the user's sleep time)
 if (settings.evening) {
 const windDown = Scheduler.timeToMinutes(state.settings.sleepTime || '22:30') - 120;
 if (now >= windDown && now < windDown + 20) {
 const key = 'evening:' + today;
 if (!alreadySent(key)) {
 markSent(key, 'moon', 'Your day is winding down',
 voice && voice.key === 'coach'
 ? 'You did the work today. Rest, so tomorrow is just as strong.'
 : "You've done enough today. Let's prepare for tomorrow.");
 }
 }
 }

 // Keep the "already sent" list from growing forever
 if (Object.keys(state.notified).length > 150) {
 Storage.update((draft) => {
 Object.keys(draft.notified).forEach((key) => {
 if (key.indexOf(today) === -1) delete draft.notified[key];
 });
 }, 'notified-prune');
 }
 }

 /* ------------------------------- life cycle ----------------------------- */
 function start() {
 if (loop) return;
 setTimeout(checkSchedule, 5000);  // catch up shortly after opening
 loop = setInterval(checkSchedule, CHECK_EVERY);
 }

 function stop() {
 if (loop) { clearInterval(loop); loop = null; }
 }

 /** Celebrate finished focus sessions and completed tasks. */
 function init() {
 document.addEventListener('luvli:focus-complete', (event) => {
 if (!Storage.get().settings.notifications.celebrate) return;
 const detail = event.detail || {};
 push({
 icon: 'check-circle',
 title: 'You did it, luv!',
 body: (detail.minutes || 0) + ' minutes of ' + (detail.subject || 'focus') +
 ' completed. Take a little break.',
 tag: 'celebrate-focus'
 });
 });

 document.addEventListener('luvli:task-complete', (event) => {
 if (!Storage.get().settings.notifications.celebrate) return;
 const detail = event.detail || {};
 push({
 icon: 'check-circle',
 title: 'You did it!',
 body: (detail.name || 'That') + ' is done. Take a little break.',
 tag: 'celebrate-task'
 });
 });

 // Coming back to the tab is a good moment to catch up on reminders
 document.addEventListener('visibilitychange', () => {
 if (!document.hidden) checkSchedule();
 });

 start();
 }

 return {
 supported, permission, requestPermission, statusText,
 push, checkSchedule, start, stop, init,
 setRegistration, hasWorker, snooze
 };
})();
