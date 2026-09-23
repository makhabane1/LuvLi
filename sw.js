/* =============================================================================
   sw.js — Luvli's service worker
   -----------------------------------------------------------------------------
   Two jobs only:
     1. keep the app working offline (cache the shell, serve from cache first)
     2. let reminders carry buttons ("Snooze 10 min" / "Start now")
   Registered by app.js — and only over http(s), because file:// has no worker.
   ========================================================================== */
'use strict';

const CACHE = 'luvli-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/storage.js',
  './js/scheduler.js',
  './js/affirmations.js',
  './js/progress.js',
  './js/pomodoro.js',
  './js/notifications.js',
  './js/icons.js',
  './js/app.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

/* ------------------------------- install --------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('Luvli could not pre-cache everything', err))
  );
});

/* -------------------------------- activate -------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => (key === CACHE ? null : caches.delete(key)))))
      .then(() => self.clients.claim())
  );
});

/* --------------------------------- fetch ---------------------------------- */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;          // never touch other origins

  // Cache first (the app shell), and quietly refresh the cache in the background
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);                                 // offline: fall back to the cache
      return cached || network;
    })
  );
});

/* --------------------------- notification buttons ------------------------- */
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const data = event.notification.data || {};
  const tag = event.notification.tag || '';
  event.notification.close();

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clientList[0];

    if (action === 'snooze') {
      if (client) client.postMessage({ type: 'luvli:snooze', minutes: 10, id: data.id || '', tag: tag });
      return;
    }

    if (client) {
      client.postMessage({ type: 'luvli:start-focus', id: data.id || '', name: data.name || '' });
      if ('focus' in client) await client.focus();
      return;
    }

    // No open window: bring Luvli back
    if (self.clients.openWindow) await self.clients.openWindow('./');
  })());
});

/* ------------------------------- messages --------------------------------- */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
});
