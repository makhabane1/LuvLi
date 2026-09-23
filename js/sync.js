/* =============================================================================
   sync.js — optional sync across devices
   -----------------------------------------------------------------------------
   Luvli is local-first: everything lives in localStorage and works offline.
   This module is deliberately small and adapter-shaped. Give it an endpoint —
   any little JSON store you control (your own server, a serverless function,
   Supabase, JSONBin, even a Raspberry Pi in a drawer) — and it will push and
   pull exactly the same JSON that "Export my data" produces.

   It is off by default and does nothing at all until an endpoint is entered.
   ========================================================================== */
'use strict';

const Sync = (() => {
  const TIMEOUT = 12000;          // never let a dead endpoint hang the app

  function config() {
    const settings = Storage.get().settings;
    if (!settings.sync) {
      settings.sync = { enabled: false, endpoint: '', lastSync: null, autoPush: false };
    }
    return settings.sync;
  }

  const isConfigured = () => /^https?:\/\/\S+$/i.test(String(config().endpoint || ''));

  function statusText() {
    const sync = config();
    if (!isConfigured()) return 'Not set up yet — Luvli is happily local-first.';
    const when = sync.lastSync ? new Date(sync.lastSync).toLocaleString() : 'never';
    return 'Endpoint saved · last sync: ' + when;
  }

  /** fetch with a timeout, so a dead endpoint cannot freeze the interface. */
  function request(method, body) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('This browser cannot reach the network'));
    }
    const controller = (typeof AbortController === 'function') ? new AbortController() : null;
    const timer = setTimeout(() => { if (controller) controller.abort(); }, TIMEOUT);
    const endpoint = config().endpoint;

    return fetch(endpoint, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: (body === undefined) ? undefined : JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    }).then((response) => {
      clearTimeout(timer);
      if (!response.ok) throw new Error('The endpoint replied ' + response.status);
      return response.json().catch(() => ({}));
    }).catch((err) => {
      clearTimeout(timer);
      throw err;
    });
  }

  function mark() {
    Storage.update((draft) => { draft.settings.sync.lastSync = Date.now(); }, 'settings-sync');
  }

  /** Send this device's Luvli to the endpoint. */
  function push() {
    if (!isConfigured()) return Promise.reject(new Error('Add a sync endpoint first.'));
    return request('POST', { app: 'luvli', version: Storage.get().version, savedAt: Date.now(), state: Storage.get() })
      .then((result) => { mark(); return result; });
  }

  /** Bring the endpoint's copy back onto this device. */
  function pull() {
    if (!isConfigured()) return Promise.reject(new Error('Add a sync endpoint first.'));
    return request('GET').then((payload) => {
      const incoming = payload && (payload.state || payload);
      if (!incoming || typeof incoming !== 'object') {
        throw new Error('That endpoint did not return Luvli data.');
      }
      Storage.replaceState(incoming, 'import');
      mark();
      return incoming;
    });
  }

  /** A tiny hello, so the user knows the endpoint answers. */
  function test() {
    if (!isConfigured()) return Promise.reject(new Error('Add a sync endpoint first.'));
    return request('GET').then(() => true);
  }

  /** Keep the endpoint in step with changes — only when the user asked. */
  function init() {
    Storage.subscribe((snapshot, reason) => {
      const sync = config();
      if (!sync.enabled || !sync.autoPush) return;
      if (['notified', 'notified-prune', 'notified-snooze', 'settings-sync'].indexOf(reason) > -1) return;
      push().catch(() => { /* offline or endpoint asleep: the next change tries again */ });
    });
  }

  return { isConfigured, statusText, push, pull, test, init, config };
})();
