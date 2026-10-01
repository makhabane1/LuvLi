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
  // FOCUS ROOMS (Phase 2)
  // =========================================================================

  function createFocusRoom(name, durationMinutes = 60) {
    if (!Auth || !Auth.current()) {
      return { error: 'Not signed in' };
    }

    const roomCode = generateInviteCode();
    const currentUser = Auth.current();
    const now = new Date();
    const endTime = new Date(now.getTime() + durationMinutes * 60000);

    const room = {
      id: Utils.id(),
      owner_id: currentUser.id,
      name: name || 'Focus Room',
      description: '',
      room_code: roomCode,
      max_members: 5,
      is_active: true,
      created_at: now.toISOString(),
      ends_at: endTime.toISOString(),
      members: []
    };

    state.focusRooms.push(room);
    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      if (!s.accountability.focusRooms) s.accountability.focusRooms = [];
      s.accountability.focusRooms.push(room);
    }, 'Created focus room');

    // Sync to Supabase
    if (AccountabilitySync && AccountabilitySync.enabled()) {
      AccountabilitySync.syncFocusRoom(room);
    }

    return { success: true, room: room, code: roomCode };
  }

  function joinFocusRoom(roomCode) {
    if (!Auth || !Auth.current()) {
      return { error: 'Not signed in' };
    }

    const room = state.focusRooms.find(r => r.room_code === roomCode.toUpperCase());
    if (!room) {
      return { error: 'Room not found' };
    }
    if (!room.is_active) {
      return { error: 'This room is no longer active' };
    }

    const currentUser = Auth.current();
    const existing = room.members.find(m => m.user_id === currentUser.id);
    if (existing) {
      return { success: true, room: room, joined: false, reason: 'Already in room' };
    }

    if (room.members.length >= room.max_members) {
      return { error: 'Room is full' };
    }

    const member = {
      id: Utils.id(),
      user_id: currentUser.id,
      status: 'idle', // 'focusing' | 'on_break' | 'idle' | 'left'
      joined_at: new Date().toISOString(),
      minutes_focused: 0
    };

    room.members.push(member);
    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      const existing = s.accountability.focusRooms.find(r => r.id === room.id);
      if (existing) {
        existing.members = room.members;
      }
    }, 'Joined focus room');

    // Sync to Supabase
    if (AccountabilitySync && AccountabilitySync.enabled()) {
      AccountabilitySync.syncRoomMember(room.id, member);
    }

    return { success: true, room: room, joined: true };
  }

  function getFocusRooms() {
    return state.focusRooms.filter(r => r.is_active);
  }

  function getFocusRoom(roomCode) {
    return state.focusRooms.find(r => r.room_code === roomCode.toUpperCase());
  }

  function updateRoomMemberStatus(roomCode, newStatus) {
    if (!Auth || !Auth.current()) return false;

    const room = getFocusRoom(roomCode);
    if (!room) return false;

    const currentUser = Auth.current();
    const member = room.members.find(m => m.user_id === currentUser.id);
    if (!member) return false;

    member.status = newStatus;
    member.last_activity_at = new Date().toISOString();

    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      const existing = s.accountability.focusRooms.find(r => r.id === room.id);
      if (existing) {
        existing.members = room.members;
      }
    }, 'Updated room member status');

    if (AccountabilitySync && AccountabilitySync.enabled()) {
      AccountabilitySync.syncRoomMember(room.id, member);
    }

    return true;
  }

  function leaveFocusRoom(roomCode) {
    const room = getFocusRoom(roomCode);
    if (!room) return false;

    const currentUser = Auth.current();
    const memberIndex = room.members.findIndex(m => m.user_id === currentUser.id);
    if (memberIndex === -1) return false;

    room.members[memberIndex].status = 'left';
    room.members[memberIndex].left_at = new Date().toISOString();

    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      const existing = s.accountability.focusRooms.find(r => r.id === room.id);
      if (existing) {
        existing.members = room.members;
      }
    }, 'Left focus room');

    if (AccountabilitySync && AccountabilitySync.enabled()) {
      AccountabilitySync.syncRoomMember(room.id, room.members[memberIndex]);
    }

    return true;
  }

  function getRoomMembers(roomCode) {
    const room = getFocusRoom(roomCode);
    if (!room) return [];
    return room.members.filter(m => m.status !== 'left');
  }

  function getRoomMemberStatus(roomCode) {
    const room = getFocusRoom(roomCode);
    if (!room) return {};

    const stats = {
      total: room.members.filter(m => m.status !== 'left').length,
      focusing: room.members.filter(m => m.status === 'focusing').length,
      on_break: room.members.filter(m => m.status === 'on_break').length,
      idle: room.members.filter(m => m.status === 'idle').length
    };

    return stats;
  }

  function endFocusRoom(roomCode) {
    const room = getFocusRoom(roomCode);
    if (!room) return false;

    room.is_active = false;
    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      const existing = s.accountability.focusRooms.find(r => r.id === room.id);
      if (existing) {
        existing.is_active = false;
      }
    }, 'Ended focus room');

    if (AccountabilitySync && AccountabilitySync.enabled()) {
      AccountabilitySync.syncFocusRoom(room);
    }

    return true;
  }

  // =========================================================================
  // CHECK-INS & ACHIEVEMENTS (Phase 3)
  // =========================================================================

  function scheduleCheckIn(roomCode, recipientEmail, scheduledFor, type = 'buddy_check') {
    if (!Auth || !Auth.current()) {
      return { error: 'Not signed in' };
    }

    const room = getFocusRoom(roomCode);
    if (!room) {
      return { error: 'Room not found' };
    }

    const checkIn = {
      id: Utils.id(),
      room_code: roomCode,
      creator_id: Auth.current().id,
      recipient_email: recipientEmail.toLowerCase(),
      scheduled_for: scheduledFor,
      type: type, // 'buddy_check' | 'progress_share' | 'encouragement'
      message: '',
      is_sent: false,
      created_at: new Date().toISOString()
    };

    if (!state.checkIns) state.checkIns = [];
    state.checkIns.push(checkIn);

    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      if (!s.accountability.checkIns) s.accountability.checkIns = [];
      s.accountability.checkIns.push(checkIn);
    }, 'Scheduled check-in');

    if (AccountabilitySync && AccountabilitySync.enabled()) {
      AccountabilitySync.syncCheckIn(checkIn);
    }

    return { success: true, checkIn: checkIn };
  }

  function getPendingCheckIns(roomCode) {
    if (!state.checkIns) return [];
    const now = new Date();
    return state.checkIns.filter(c =>
      c.room_code === roomCode &&
      !c.is_sent &&
      new Date(c.scheduled_for) <= now
    );
  }

  function markCheckInSent(checkInId) {
    if (!state.checkIns) return false;
    const checkIn = state.checkIns.find(c => c.id === checkInId);
    if (!checkIn) return false;

    checkIn.is_sent = true;
    checkIn.sent_at = new Date().toISOString();

    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      if (!s.accountability.checkIns) s.accountability.checkIns = [];
      const existing = s.accountability.checkIns.find(c => c.id === checkInId);
      if (existing) {
        existing.is_sent = true;
        existing.sent_at = checkIn.sent_at;
      }
    }, 'Marked check-in as sent');

    if (AccountabilitySync && AccountabilitySync.enabled()) {
      AccountabilitySync.syncCheckIn(checkIn);
    }

    return true;
  }

  function createAchievement(roomCode, type, recipientEmail, message) {
    if (!Auth || !Auth.current()) {
      return { error: 'Not signed in' };
    }

    const achievement = {
      id: Utils.id(),
      room_code: roomCode,
      type: type, // 'session_complete' | 'focus_streak' | 'group_win'
      creator_id: Auth.current().id,
      recipient_email: recipientEmail.toLowerCase(),
      message: message || '',
      emoji: getAchievementEmoji(type),
      created_at: new Date().toISOString()
    };

    if (!state.achievements) state.achievements = [];
    state.achievements.push(achievement);

    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      if (!s.accountability.achievements) s.accountability.achievements = [];
      s.accountability.achievements.push(achievement);
    }, 'Achievement unlocked');

    return { success: true, achievement: achievement };
  }

  function getAchievementEmoji(type) {
    const emojis = {
      'session_complete': '🎉',
      'focus_streak': '🔥',
      'group_win': '🏆',
      'breakthrough': '💡',
      'consistency': '⭐'
    };
    return emojis[type] || '✨';
  }

  function celebrateRoomMember(roomCode, memberEmail) {
    return createAchievement(roomCode, 'session_complete', memberEmail,
      'Just completed a focus session! 🎉');
  }

  function getRecentAchievements(roomCode, limit = 5) {
    if (!state.achievements) return [];
    return state.achievements
      .filter(a => a.room_code === roomCode)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  function sendRoomMessage(roomCode, text) {
    if (!Auth || !Auth.current()) return false;

    const room = getFocusRoom(roomCode);
    if (!room) return false;

    const message = {
      id: Utils.id(),
      room_code: roomCode,
      sender_id: Auth.current().id,
      text: text,
      emoji_reaction: null,
      created_at: new Date().toISOString()
    };

    if (!state.roomMessages) state.roomMessages = [];
    state.roomMessages.push(message);

    // Only keep recent messages to save space
    if (state.roomMessages.length > 100) {
      state.roomMessages = state.roomMessages.slice(-100);
    }

    Storage.update(s => {
      if (!s.accountability) s.accountability = {};
      if (!s.accountability.roomMessages) s.accountability.roomMessages = [];
      s.accountability.roomMessages = state.roomMessages;
    }, 'Room message');

    return true;
  }

  function getRoomMessages(roomCode) {
    if (!state.roomMessages) return [];
    return state.roomMessages
      .filter(m => m.room_code === roomCode)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  function addEmojiReaction(roomCode, text) {
    if (!Auth || !Auth.current()) return false;

    const reaction = {
      id: Utils.id(),
      room_code: roomCode,
      user_id: Auth.current().id,
      emoji: text,
      created_at: new Date().toISOString()
    };

    if (!state.reactions) state.reactions = [];
    state.reactions.push(reaction);

    // Keep only recent reactions (last 60 seconds)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    state.reactions = state.reactions.filter(r =>
      r.room_code !== roomCode || new Date(r.created_at) > oneMinuteAgo
    );

    return true;
  }

  function getRoomReactions(roomCode) {
    if (!state.reactions) return [];
    const oneMinuteAgo = new Date(Date.now() - 60000);
    return state.reactions
      .filter(r => r.room_code === roomCode && new Date(r.created_at) > oneMinuteAgo)
      .slice(-10); // Show last 10
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
    // Focus Rooms (Phase 2)
    createFocusRoom,
    joinFocusRoom,
    getFocusRooms,
    getFocusRoom,
    updateRoomMemberStatus,
    leaveFocusRoom,
    getRoomMembers,
    getRoomMemberStatus,
    endFocusRoom,
    // Check-Ins & Achievements (Phase 3)
    scheduleCheckIn,
    getPendingCheckIns,
    markCheckInSent,
    createAchievement,
    celebrateRoomMember,
    getRecentAchievements,
    sendRoomMessage,
    getRoomMessages,
    addEmojiReaction,
    getRoomReactions,
    // Settings
    getSettings,
    updateSettings,
    enableSharing
  };
})();
