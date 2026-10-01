// Luvli ♡ — Shared Accountability
// Friends, streaks, and collaborative focus sessions

const Accountability = (() => {
  const state = {
    friendships: [],
    streaks: {},
    focusRooms: [],
    settings: {
      sharing: false,
      shareMode: 'daily', // 'daily' | 'weekly' | 'never'
      reminders: true,
      minDailyFocus: 60
    }
  };

  // Generate a short, unique invite code (6 characters)
  function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // =========================================================================
  // FRIENDS MANAGEMENT (Phase 1 MVP)
  // =========================================================================

  function inviteFriendByEmail(friendEmail) {
    if (!Auth || !Auth.current()) {
      return { error: 'Not signed in' };
    }
    if (!friendEmail || !friendEmail.includes('@')) {
      return { error: 'Invalid email' };
    }

    const currentUser = Auth.current();
    const inviteCode = generateInviteCode();

    const friendship = {
      id: Utils.id(),
      user_id: currentUser.id,
      friend_email: friendEmail.toLowerCase(),
      invite_code: inviteCode,
      status: 'pending',
      invited_at: new Date().toISOString()
    };

    state.friendships.push(friendship);
    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      if (!s.accountability.friendships) s.accountability.friendships = [];
      s.accountability.friendships.push(friendship);
    }, 'Invited friend');

    // Sync to Supabase if available
    if (SupabaseSync && SupabaseSync.enabled()) {
      SupabaseSync.syncFriendship(friendship);
    }

    return { success: true, code: inviteCode, email: friendEmail };
  }

  function joinFriendByCode(inviteCode) {
    if (!Auth || !Auth.current()) {
      return { error: 'Not signed in' };
    }
    if (!inviteCode || inviteCode.length !== 6) {
      return { error: 'Invalid invite code' };
    }

    // Find the friendship by code
    const friendship = state.friendships.find(f => f.invite_code === inviteCode);
    if (!friendship) {
      return { error: 'Code not found or already used' };
    }
    if (friendship.status !== 'pending') {
      return { error: 'This friendship is already accepted' };
    }

    const currentUser = Auth.current();
    friendship.status = 'accepted';
    friendship.friend_user_id = currentUser.id;
    friendship.accepted_at = new Date().toISOString();

    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      const existing = s.accountability.friendships.find(f => f.id === friendship.id);
      if (existing) {
        Object.assign(existing, friendship);
      }
    }, 'Accepted friend invite');

    // Sync to Supabase
    if (SupabaseSync && SupabaseSync.enabled()) {
      SupabaseSync.syncFriendship(friendship);
    }

    return { success: true, friendEmail: friendship.friend_email };
  }

  function getFriends() {
    const current = Auth.current();
    if (!current) return [];

    return state.friendships.filter(f => f.status === 'accepted');
  }

  function getPendingInvites() {
    const current = Auth.current();
    if (!current) return [];

    return state.friendships.filter(f => f.status === 'pending' && f.user_id === current.id);
  }

  function blockFriend(friendEmail) {
    const friendship = state.friendships.find(f => f.friend_email === friendEmail);
    if (!friendship) return false;

    friendship.status = 'blocked';
    Storage.update(s => {
      const existing = s.accountability.friendships.find(f => f.id === friendship.id);
      if (existing) existing.status = 'blocked';
    }, 'Blocked friend');

    if (SupabaseSync && SupabaseSync.enabled()) {
      SupabaseSync.syncFriendship(friendship);
    }

    return true;
  }

  // =========================================================================
  // STREAK TRACKING (Phase 1 MVP)
  // =========================================================================

  function updateStreak(date = null) {
    if (!Auth || !Auth.current()) return;

    const targetDate = date ? new Date(date) : new Date();
    const dateStr = Utils.dateToString(targetDate);
    const currentUser = Auth.current();

    // Get today's data
    const storage = Storage.latest();
    const tasks = storage.tasks ? storage.tasks.filter(t => t.date === dateStr) : [];
    const sessions = storage.focus_sessions ? storage.focus_sessions.filter(s => {
      const sessionDate = s.start_time ? s.start_time.split('T')[0] : null;
      return sessionDate === dateStr;
    }) : [];

    const focusMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const tasksCompleted = tasks.filter(t => t.completed).length;
    const showed_up = focusMinutes > 0 || tasksCompleted > 0;

    const streak = {
      user_id: currentUser.id,
      date: dateStr,
      focus_minutes: focusMinutes,
      tasks_completed: tasksCompleted,
      showed_up: showed_up,
      updated_at: new Date().toISOString()
    };

    state.streaks[dateStr] = streak;

    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      if (!s.accountability.streaks) s.accountability.streaks = {};
      s.accountability.streaks[dateStr] = streak;
    }, 'Updated streak');

    // Sync to Supabase if sharing is enabled
    if (state.settings.sharing && SupabaseSync && SupabaseSync.enabled()) {
      SupabaseSync.syncStreak(streak);
    }
  }

  function getStreakData(days = 30) {
    const today = new Date();
    const streakData = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = Utils.dateToString(date);
      const streak = state.streaks[dateStr] || {
        date: dateStr,
        focus_minutes: 0,
        tasks_completed: 0,
        showed_up: false
      };
      streakData.push(streak);
    }

    return streakData;
  }

  function getCurrentStreak() {
    const streakData = getStreakData(365); // look back a year
    let current = 0;
    let best = 0;
    let tempStreak = 0;

    for (let i = streakData.length - 1; i >= 0; i--) {
      if (streakData[i].showed_up) {
        tempStreak++;
        current = i === streakData.length - 1 ? tempStreak : 0;
        best = Math.max(best, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    return { current, best };
  }

  function getFriendStreaks() {
    const friends = getFriends();
    if (!friends.length) return [];

    // In Phase 1, fetch from localStorage cache
    // In Phase 2, this will sync from Supabase
    return friends.map(f => ({
      email: f.friend_email,
      streakData: getStreakData(30) // placeholder: would be friend's real data
    }));
  }

  // =========================================================================
  // SETTINGS
  // =========================================================================

  function getSettings() {
    return { ...state.settings };
  }

  function updateSettings(updates) {
    Object.assign(state.settings, updates);
    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      s.accountability.settings = state.settings;
    }, 'Updated accountability settings');

    if (SupabaseSync && SupabaseSync.enabled()) {
      SupabaseSync.syncSettings(state.settings);
    }
  }

  function enableSharing(enabled = true) {
    updateSettings({ sharing: enabled });
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  function init() {
    const storage = Storage.latest();
    if (storage.accountability) {
      Object.assign(state, storage.accountability);
    }

    // Migrate from localStorage if needed
    if (!storage.accountability) {
      Storage.update(s => {
        s.accountability = state;
      }, 'Initialize accountability module');
    }
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    init,
    // Friends
    inviteFriendByEmail,
    joinFriendByCode,
    getFriends,
    getPendingInvites,
    blockFriend,
    generateInviteCode,
    // Streaks
    updateStreak,
    getStreakData,
    getCurrentStreak,
    getFriendStreaks,
    // Settings
    getSettings,
    updateSettings,
    enableSharing
  };
})();
