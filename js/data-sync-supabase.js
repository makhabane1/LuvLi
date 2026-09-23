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
  let lastSettingsJSON = null;
  let lastProfileName = null;
  let lastSessionsJSON = null;
  let lastCheckInsJSON = null;
  let lastNightReviewsJSON = null;
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

  function settingsToRow(state, uid) {
    const s = state.settings;
    return {
      user_id: uid,
      wake_time: s.wakeTime,
      sleep_time: s.sleepTime,
      time_format: s.timeFormat,
      focus_length: s.focusLength,
      break_length: s.breakLength,
      long_break_length: s.longBreakLength,
      auto_break: s.autoBreak,
      focus_fullscreen: s.focusFullscreen,
      focus_sound: s.focusSound,
      buffer_minutes: s.bufferMinutes,
      max_planned_hours: s.maxPlannedHours,
      protect_breaks: s.protectBreaks,
      auto_optimize: s.autoOptimize,
      theme: s.theme,
      reduce_motion: s.reduceMotion,
      notifications_enabled: s.notifications.enabled,
      notifications_lead_minutes: s.notifications.leadMinutes,
      notifications_evening: s.notifications.evening,
      notifications_celebrate: s.notifications.celebrate,
      notifications_prompt_dismissed: s.notifications.promptDismissed,
      affirmations_during_focus: s.affirmations.duringFocus,
      affirmation_categories: s.affirmations.categories,
      study_apps: state.studyApps,
      distraction_apps: state.distractionApps,
      onboarding: s.onboarding
    };
  }

  /** Applies a settings row onto a Storage draft (used by both pull and the initial merge). */
  function applySettingsRow(draft, row) {
    Object.assign(draft.settings, {
      wakeTime: (row.wake_time || '').slice(0, 5),
      sleepTime: (row.sleep_time || '').slice(0, 5),
      timeFormat: row.time_format,
      focusLength: row.focus_length,
      breakLength: row.break_length,
      longBreakLength: row.long_break_length,
      autoBreak: row.auto_break,
      focusFullscreen: row.focus_fullscreen,
      focusSound: row.focus_sound,
      bufferMinutes: row.buffer_minutes,
      maxPlannedHours: row.max_planned_hours,
      protectBreaks: row.protect_breaks,
      autoOptimize: row.auto_optimize,
      theme: row.theme,
      reduceMotion: row.reduce_motion
    });
    draft.settings.notifications = {
      enabled: row.notifications_enabled,
      leadMinutes: row.notifications_lead_minutes,
      evening: row.notifications_evening,
      celebrate: row.notifications_celebrate,
      promptDismissed: row.notifications_prompt_dismissed
    };
    draft.settings.affirmations = {
      duringFocus: row.affirmations_during_focus,
      categories: row.affirmation_categories && row.affirmation_categories.length
        ? row.affirmation_categories : draft.settings.affirmations.categories
    };
    if (row.onboarding && row.onboarding.completed) draft.settings.onboarding = row.onboarding;
    if (row.study_apps && row.study_apps.length) draft.studyApps = row.study_apps;
    if (row.distraction_apps && row.distraction_apps.length) draft.distractionApps = row.distraction_apps;
  }

  // Not synced yet: subjects (Phase 2's "Later" bucket) haven't got a table
  // pull/push implemented, so focus_sessions.subject_id — a real FK to
  // subjects — is left null here rather than sent and rejected. Revisit
  // once subjects sync exists: link it up here too.
  function sessionToRow(session, uid) {
    return {
      id: session.id,
      user_id: uid,
      subject_id: null,
      subject_name: session.subjectName || '',
      goal: session.goal || '',
      minutes: session.minutes,
      date: session.date,
      type: session.type || 'focus',
      ended_at: session.endedAt || new Date().toISOString()
    };
  }

  function rowToSession(row) {
    return {
      id: row.id,
      subjectId: '',
      subjectName: row.subject_name || '',
      goal: row.goal || '',
      minutes: row.minutes,
      date: row.date,
      type: row.type,
      endedAt: row.ended_at
    };
  }

  const MOODS = ['great', 'good', 'okay', 'low', 'difficult', 'exhausted'];

  function checkInsToRows(checkIns, uid) {
    return Object.keys(checkIns)
      .filter((date) => checkIns[date] && MOODS.indexOf(checkIns[date].mood) > -1)
      .map((date) => ({ user_id: uid, date, mood: checkIns[date].mood, note: checkIns[date].note || '' }));
  }

  function nightReviewsToRows(nightReviews, uid) {
    return Object.keys(nightReviews)
      .filter((date) => nightReviews[date] && Number(nightReviews[date].rating) >= 1)
      .map((date) => ({ user_id: uid, date, rating: Number(nightReviews[date].rating) }));
  }

  /** Recompute state.focusDays from state.sessions — the same shape the app already maintains incrementally. */
  function recomputeFocusDays(draft) {
    const days = {};
    draft.sessions.forEach((s) => {
      if (!days[s.date]) days[s.date] = { minutes: 0, sessions: 0 };
      days[s.date].minutes += s.minutes || 0;
      days[s.date].sessions += 1;
    });
    draft.focusDays = days;
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

  function pushSettings(state, uid) {
    return client().from('settings').upsert([settingsToRow(state, uid)], { onConflict: 'user_id' })
      .then(({ error }) => { if (error) throw error; });
  }

  function pushProfileName(name, uid) {
    return client().from('profiles').upsert([{ id: uid, name }], { onConflict: 'id' })
      .then(({ error }) => { if (error) throw error; });
  }

  function pushSessions(sessions, uid) { return syncTable('focus_sessions', sessions.map((s) => sessionToRow(s, uid)), uid); }

  /** check_ins/night_reviews are only ever added to locally, never removed — plain upsert, no delete-missing step. */
  function pushCheckIns(checkIns, uid) {
    const rows = checkInsToRows(checkIns, uid);
    if (!rows.length) return Promise.resolve();
    return client().from('check_ins').upsert(rows, { onConflict: 'user_id,date' }).then(({ error }) => { if (error) throw error; });
  }

  function pushNightReviews(nightReviews, uid) {
    const rows = nightReviewsToRows(nightReviews, uid);
    if (!rows.length) return Promise.resolve();
    return client().from('night_reviews').upsert(rows, { onConflict: 'user_id,date' }).then(({ error }) => { if (error) throw error; });
  }

  function notifySyncFailed() {
    // UI is declared with `const` in app.js — that never attaches to
    // `window` in a classic script (unlike `var`), so `window.UI` is always
    // undefined here even once app.js has run. Check the bare identifier.
    if (typeof UI !== 'undefined' && typeof UI.toast === 'function') {
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
    const settingsJSON = JSON.stringify(settingsToRow(state, uid));
    const profileName = state.profile.name;
    const sessionsJSON = JSON.stringify(state.sessions);
    const checkInsJSON = JSON.stringify(state.checkIns);
    const nightReviewsJSON = JSON.stringify(state.nightReviews);
    const tasksChanged = tasksJSON !== lastTasksJSON;
    const backlogChanged = backlogJSON !== lastBacklogJSON;
    const settingsChanged = settingsJSON !== lastSettingsJSON;
    const profileChanged = profileName !== lastProfileName;
    const sessionsChanged = sessionsJSON !== lastSessionsJSON;
    const checkInsChanged = checkInsJSON !== lastCheckInsJSON;
    const nightReviewsChanged = nightReviewsJSON !== lastNightReviewsJSON;
    if (!tasksChanged && !backlogChanged && !settingsChanged && !profileChanged
      && !sessionsChanged && !checkInsChanged && !nightReviewsChanged) return;

    if (syncing) { pendingAgain = true; return; }
    syncing = true;

    const jobs = [];
    if (tasksChanged) jobs.push(pushTasks(state.tasks, uid).then(() => { lastTasksJSON = tasksJSON; }));
    if (backlogChanged) jobs.push(pushBacklog(state.backlog, uid).then(() => { lastBacklogJSON = backlogJSON; }));
    if (settingsChanged) jobs.push(pushSettings(state, uid).then(() => { lastSettingsJSON = settingsJSON; }));
    if (profileChanged) jobs.push(pushProfileName(profileName, uid).then(() => { lastProfileName = profileName; }));
    if (sessionsChanged) jobs.push(pushSessions(state.sessions, uid).then(() => { lastSessionsJSON = sessionsJSON; }));
    if (checkInsChanged) jobs.push(pushCheckIns(state.checkIns, uid).then(() => { lastCheckInsJSON = checkInsJSON; }));
    if (nightReviewsChanged) jobs.push(pushNightReviews(state.nightReviews, uid).then(() => { lastNightReviewsJSON = nightReviewsJSON; }));

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
      client().from('backlog').select('*').eq('user_id', uid),
      client().from('settings').select('*').eq('user_id', uid).maybeSingle(),
      client().from('profiles').select('*').eq('id', uid).maybeSingle(),
      client().from('focus_sessions').select('*').eq('user_id', uid),
      client().from('check_ins').select('*').eq('user_id', uid),
      client().from('night_reviews').select('*').eq('user_id', uid)
    ]).then(([tasksRes, backlogRes, settingsRes, profileRes, sessionsRes, checkInsRes, nightReviewsRes]) => {
      if (tasksRes.error) throw tasksRes.error;
      if (backlogRes.error) throw backlogRes.error;
      if (settingsRes.error) throw settingsRes.error;
      if (profileRes.error) throw profileRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (checkInsRes.error) throw checkInsRes.error;
      if (nightReviewsRes.error) throw nightReviewsRes.error;

      const cloudTasks = tasksRes.data.map(rowToTask);
      const cloudBacklog = backlogRes.data.map(rowToBacklog);
      const state = Storage.get();
      const localHasData = (state.tasks && state.tasks.length) || (state.backlog && state.backlog.length);
      const cloudIsEmpty = !cloudTasks.length && !cloudBacklog.length;
      const pushJobs = [];

      if (cloudIsEmpty && localHasData) {
        lastTasksJSON = JSON.stringify([]);
        lastBacklogJSON = JSON.stringify([]);
        pushJobs.push(
          pushTasks(state.tasks, uid).then(() => { lastTasksJSON = JSON.stringify(state.tasks); }),
          pushBacklog(state.backlog, uid).then(() => { lastBacklogJSON = JSON.stringify(state.backlog); })
        );
      } else {
        Storage.update((draft) => {
          draft.tasks = cloudTasks;
          draft.backlog = cloudBacklog;
        }, 'supabase-pull', { undo: false });
        lastTasksJSON = JSON.stringify(cloudTasks);
        lastBacklogJSON = JSON.stringify(cloudBacklog);
      }

      // Settings: the cloud row always exists (the sign-up trigger creates
      // it), so "empty" isn't a useful signal the way it is for
      // tasks/backlog. Instead: has this account actually finished
      // onboarding in the cloud yet? If not, but this device has, the
      // device's settings are the real ones — push them up. Otherwise pull.
      const cloudOnboarded = Boolean(settingsRes.data && settingsRes.data.onboarding && settingsRes.data.onboarding.completed);
      const localOnboarded = Boolean(state.settings.onboarding && state.settings.onboarding.completed);

      if (settingsRes.data && (cloudOnboarded || !localOnboarded)) {
        Storage.update((draft) => applySettingsRow(draft, settingsRes.data), 'supabase-pull', { undo: false });
        lastSettingsJSON = JSON.stringify(settingsToRow(Storage.get(), uid));
      } else {
        pushJobs.push(pushSettings(state, uid).then(() => { lastSettingsJSON = JSON.stringify(settingsToRow(state, uid)); }));
      }

      if (profileRes.data && profileRes.data.name) {
        Storage.update((draft) => { draft.profile.name = profileRes.data.name; }, 'supabase-pull', { undo: false });
        lastProfileName = profileRes.data.name;
      } else if (state.profile.name) {
        pushJobs.push(pushProfileName(state.profile.name, uid).then(() => { lastProfileName = state.profile.name; }));
      } else {
        lastProfileName = state.profile.name;
      }

      // Sessions: same array-diff approach as tasks/backlog (compaction
      // removes old ones locally after 90 days, which should delete them
      // from the cloud too — see Storage.compactHistory).
      const cloudSessions = sessionsRes.data.map(rowToSession);
      const localHasSessions = state.sessions && state.sessions.length;
      const cloudSessionsEmpty = !cloudSessions.length;
      if (cloudSessionsEmpty && localHasSessions) {
        lastSessionsJSON = JSON.stringify([]);
        pushJobs.push(pushSessions(state.sessions, uid).then(() => { lastSessionsJSON = JSON.stringify(state.sessions); }));
      } else {
        Storage.update((draft) => {
          draft.sessions = cloudSessions;
          recomputeFocusDays(draft);
        }, 'supabase-pull', { undo: false });
        lastSessionsJSON = JSON.stringify(cloudSessions);
      }

      // check_ins/night_reviews: only ever added to, never removed, on
      // either side — merge both into a union rather than picking a
      // direction, so a mood logged on one device never disappears when
      // another device (that hasn't seen it yet) pulls. Local wins for any
      // date present on both sides, since it's what's actively being edited.
      const cloudCheckIns = {};
      checkInsRes.data.forEach((row) => { cloudCheckIns[row.date] = { mood: row.mood, note: row.note || '' }; });
      const mergedCheckIns = Object.assign({}, cloudCheckIns, state.checkIns);

      const cloudNightReviews = {};
      nightReviewsRes.data.forEach((row) => { cloudNightReviews[row.date] = { rating: row.rating }; });
      const mergedNightReviews = Object.assign({}, cloudNightReviews, state.nightReviews);

      Storage.update((draft) => {
        draft.checkIns = mergedCheckIns;
        draft.nightReviews = mergedNightReviews;
      }, 'supabase-pull', { undo: false });
      lastCheckInsJSON = JSON.stringify(mergedCheckIns);
      lastNightReviewsJSON = JSON.stringify(mergedNightReviews);
      // Push straight away if the merge added anything the cloud didn't have yet.
      pushJobs.push(pushCheckIns(mergedCheckIns, uid), pushNightReviews(mergedNightReviews, uid));

      return Promise.all(pushJobs).then(() => {});
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
      if (typeof UI !== 'undefined' && typeof UI.toast === 'function') {
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
