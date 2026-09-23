/* ==========================================================================
   Luvli ♡ — js/data-sync-supabase.js
   --------------------------------------------------------------------------
   Phase 5, stage 1: keeps state.tasks and state.backlog mirrored to
   Supabase for a signed-in real-provider user. Local state stays the single
   source of truth for rendering (Storage.get() is still synchronous and
   every screen still reads it exactly as before) — this module only mirrors
   changes out to the cloud and pulls them back in on load.

   Deliberately NOT keyed off Storage.update()'s "reason" string: tasks and
   backlog are touched by a dozen+ different reasons across app.js,
   scheduler.js and ai-coach.js (task/backlog/optimize/lighten/trim/coach-*),
   and hand-maintaining that list would silently drift out of date. Instead
   every state change is checked by diffing state.tasks/state.backlog
   against the last-synced snapshot — simple, and correct regardless of
   which feature made the change.

   Load order: after js/storage.js, js/auth.js, js/auth-boot.js (so
   Auth.activeProvider() is already the real one by the time this runs), and
   call SupabaseSync.init() from app.js's boot, once a user is confirmed
   signed in.
   ========================================================================== */
'use strict';

const SupabaseSync = (() => {
  let lastTasksJSON = null;
  let lastBacklogJSON = null;
  let syncing = false;
  let pendingAgain = false;

  function client() { return window.supabaseClient; }

  function userId() {
    const account = Auth.current();
    return account ? account.id : null;
  }

  /** Only mirror to the cloud for a real backend, never the local provider. */
  function isRealProvider() {
    const provider = Auth.activeProvider && Auth.activeProvider();
    return Boolean(provider && provider.isLocal === false);
  }

  /* ------------------------------------------------------------ mapping -- */

  function taskToRow(task, uid) {
    return {
      id: task.id,
      user_id: uid,
      date: task.date,
      name: task.name,
      category: task.category || 'other',
      start_time: task.start,
      end_time: task.end,
      priority: task.priority || 'medium',
      notes: task.notes || '',
      completed: Boolean(task.completed),
      completed_at: task.completedAt || null,
      repeat: task.repeat || 'none',
      series_id: task.seriesId || null
    };
  }

  function rowToTask(row) {
    const task = {
      id: row.id,
      date: row.date,
      name: row.name,
      category: row.category,
      start: (row.start_time || '').slice(0, 5),
      end: (row.end_time || '').slice(0, 5),
      priority: row.priority,
      notes: row.notes || '',
      completed: Boolean(row.completed),
      completedAt: row.completed_at,
      createdAt: row.created_at,
      repeat: row.repeat
    };
    if (row.series_id) task.seriesId = row.series_id;
    return task;
  }

  function backlogToRow(item, uid) {
    return {
      id: item.id,
      user_id: uid,
      name: item.name,
      category: item.category || 'other',
      priority: item.priority || 'medium',
      duration_minutes: item.duration || 30,
      status: item.status || 'backlog',
      repeat: item.repeat || 'none'
    };
  }

  function rowToBacklog(row) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      priority: row.priority,
      duration: row.duration_minutes,
      status: row.status,
      repeat: row.repeat,
      addedAt: row.added_at
    };
  }

  /* -------------------------------------------------------------- push --- */

  /** Upsert every current row, then delete whatever is no longer local. */
  function syncTable(table, rows, uid) {
    const ids = rows.map((r) => r.id);
    const upsert = rows.length
      ? client().from(table).upsert(rows, { onConflict: 'id' })
      : Promise.resolve({ error: null });
    return Promise.resolve(upsert).then(({ error }) => {
      if (error) throw error;
      let del = client().from(table).delete().eq('user_id', uid);
      if (ids.length) del = del.not('id', 'in', '(' + ids.join(',') + ')');
      return del;
    }).then(({ error }) => { if (error) throw error; });
  }

  function pushTasks(tasks, uid) { return syncTable('tasks', tasks.map((t) => taskToRow(t, uid)), uid); }
  function pushBacklog(items, uid) { return syncTable('backlog', items.map((b) => backlogToRow(b, uid)), uid); }

  function notifySyncFailed() {
    if (window.UI && typeof UI.toast === 'function') {
      UI.toast({
        icon: 'cloud-off',
        title: 'Could not save to the cloud',
        body: 'Your change is kept on this device — Luvli will try again on the next change.'
      });
    }
  }

  /** Diff state.tasks/state.backlog against the last-synced snapshot and push what changed. */
  function maybeSync() {
    if (!isRealProvider()) return;
    const uid = userId();
    if (!uid) return;

    const state = Storage.get();
    const tasksJSON = JSON.stringify(state.tasks);
    const backlogJSON = JSON.stringify(state.backlog);
    const tasksChanged = tasksJSON !== lastTasksJSON;
    const backlogChanged = backlogJSON !== lastBacklogJSON;
    if (!tasksChanged && !backlogChanged) return;

    if (syncing) { pendingAgain = true; return; }
    syncing = true;

    const jobs = [];
    if (tasksChanged) jobs.push(pushTasks(state.tasks, uid).then(() => { lastTasksJSON = tasksJSON; }));
    if (backlogChanged) jobs.push(pushBacklog(state.backlog, uid).then(() => { lastBacklogJSON = backlogJSON; }));

    Promise.all(jobs).catch((err) => {
      console.error('Luvli: could not sync to Supabase', err);
      notifySyncFailed();
    }).finally(() => {
      syncing = false;
      if (pendingAgain) { pendingAgain = false; maybeSync(); }
    });
  }

  /* -------------------------------------------------------------- pull --- */

  /**
   * Loads this user's tasks/backlog from Supabase into local state. The one
   * exception: if the cloud is empty but the device already has real data
   * (a returning local-first user's first time signing in for real), that
   * local data is treated as the source of truth and pushed up instead of
   * being silently wiped by an empty cloud read.
   */
  function pull() {
    const uid = userId();
    if (!uid) return Promise.resolve();

    return Promise.all([
      client().from('tasks').select('*').eq('user_id', uid),
      client().from('backlog').select('*').eq('user_id', uid)
    ]).then(([tasksRes, backlogRes]) => {
      if (tasksRes.error) throw tasksRes.error;
      if (backlogRes.error) throw backlogRes.error;

      const cloudTasks = tasksRes.data.map(rowToTask);
      const cloudBacklog = backlogRes.data.map(rowToBacklog);
      const state = Storage.get();
      const localHasData = (state.tasks && state.tasks.length) || (state.backlog && state.backlog.length);
      const cloudIsEmpty = !cloudTasks.length && !cloudBacklog.length;

      if (cloudIsEmpty && localHasData) {
        lastTasksJSON = JSON.stringify([]);
        lastBacklogJSON = JSON.stringify([]);
        return Promise.all([
          pushTasks(state.tasks, uid).then(() => { lastTasksJSON = JSON.stringify(state.tasks); }),
          pushBacklog(state.backlog, uid).then(() => { lastBacklogJSON = JSON.stringify(state.backlog); })
        ]).then(() => {});
      }

      Storage.update((draft) => {
        draft.tasks = cloudTasks;
        draft.backlog = cloudBacklog;
      }, 'supabase-pull', { undo: false });
      lastTasksJSON = JSON.stringify(cloudTasks);
      lastBacklogJSON = JSON.stringify(cloudBacklog);
    });
  }

  /* -------------------------------------------------------------- boot --- */

  let started = false;

  function init() {
    if (started || !isRealProvider() || !userId()) return;
    started = true;

    pull().then(() => {
      Storage.subscribe((state, reason) => {
        if (reason === 'supabase-pull') return; // don't push what we just pulled
        maybeSync();
      });
    }).catch((err) => {
      console.error('Luvli: could not load your data from Supabase', err);
      if (window.UI && typeof UI.toast === 'function') {
        UI.toast({
          icon: 'cloud-off',
          title: 'Could not load your cloud data',
          body: 'Showing what is saved on this device instead.'
        });
      }
    });
  }

  return { init, pull };
})();
