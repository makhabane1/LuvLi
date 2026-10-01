// Luvli ♡ — Accountability Sync with Supabase
// Handles syncing friends, streaks, and focus rooms

const AccountabilitySync = (() => {
  let supabase = null;
  let pollInterval = null;
  let lastSyncTime = null;

  function init(supabaseClient) {
    supabase = supabaseClient;
  }

  function enabled() {
    return !!supabase && Auth && Auth.current();
  }

  async function syncFriendship(friendship) {
    if (!enabled()) return false;

    try {
      const current = Auth.current();
      const { data, error } = await supabase
        .from('friendships')
        .upsert({
          id: friendship.id,
          user_id: friendship.user_id,
          friend_user_id: friendship.friend_user_id || null,
          status: friendship.status,
          invite_code: friendship.invite_code,
          invite_email: friendship.friend_email || null,
          invited_at: friendship.invited_at,
          accepted_at: friendship.accepted_at
        }, { onConflict: 'id' });

      if (error) console.error('Friendship sync error:', error);
      return !error;
    } catch (e) {
      console.error('Friendship sync failed:', e);
      return false;
    }
  }

  async function syncStreak(streak) {
    if (!enabled()) return false;

    try {
      const { data, error } = await supabase
        .from('friend_streaks')
        .upsert({
          user_id: streak.user_id,
          date: streak.date,
          focus_minutes: streak.focus_minutes,
          tasks_completed: streak.tasks_completed,
          showed_up: streak.showed_up,
          updated_at: streak.updated_at
        }, { onConflict: 'user_id,date' });

      if (error) console.error('Streak sync error:', error);
      return !error;
    } catch (e) {
      console.error('Streak sync failed:', e);
      return false;
    }
  }

  async function syncSettings(settings) {
    if (!enabled()) return false;

    try {
      const current = Auth.current();
      // Store settings as JSON in user profile or separate settings table
      const { error } = await supabase
        .from('profiles')
        .update({
          accountability_settings: settings
        })
        .eq('id', current.id);

      if (error) console.error('Settings sync error:', error);
      return !error;
    } catch (e) {
      console.error('Settings sync failed:', e);
      return false;
    }
  }

  async function syncFocusRoom(room) {
    if (!enabled()) return false;

    try {
      const { data, error } = await supabase
        .from('focus_rooms')
        .upsert({
          id: room.id,
          owner_id: room.owner_id,
          name: room.name,
          description: room.description || '',
          room_code: room.room_code,
          max_members: room.max_members,
          is_active: room.is_active,
          created_at: room.created_at,
          ends_at: room.ends_at
        }, { onConflict: 'id' });

      if (error) console.error('Focus room sync error:', error);
      return !error;
    } catch (e) {
      console.error('Focus room sync failed:', e);
      return false;
    }
  }

  async function syncRoomMember(roomId, member) {
    if (!enabled()) return false;

    try {
      const { data, error } = await supabase
        .from('room_members')
        .upsert({
          id: member.id,
          room_id: roomId,
          user_id: member.user_id,
          status: member.status,
          joined_at: member.joined_at,
          left_at: member.left_at,
          minutes_focused: member.minutes_focused || 0,
          last_activity_at: member.last_activity_at || new Date().toISOString()
        }, { onConflict: 'room_id,user_id' });

      if (error) console.error('Room member sync error:', error);
      return !error;
    } catch (e) {
      console.error('Room member sync failed:', e);
      return false;
    }
  }

  async function syncCheckIn(checkIn) {
    if (!enabled()) return false;

    try {
      const { error } = await supabase
        .from('check_in_reminders')
        .upsert({
          id: checkIn.id,
          room_id: checkIn.room_code,
          creator_id: checkIn.creator_id,
          recipient_id: checkIn.recipient_email, // placeholder: would be actual user_id
          scheduled_for: checkIn.scheduled_for,
          type: checkIn.type,
          message: checkIn.message || '',
          is_sent: checkIn.is_sent,
          sent_at: checkIn.sent_at || null
        }, { onConflict: 'id' });

      if (error) console.error('Check-in sync error:', error);
      return !error;
    } catch (e) {
      console.error('Check-in sync failed:', e);
      return false;
    }
  }

  // =========================================================================
  // FETCH FROM SUPABASE
  // =========================================================================

  async function fetchFriends() {
    if (!enabled()) return [];

    try {
      const current = Auth.current();
      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`user_id.eq.${current.id},friend_user_id.eq.${current.id}`);

      if (error) {
        console.error('Fetch friends error:', error);
        return [];
      }

      return friendships || [];
    } catch (e) {
      console.error('Fetch friends failed:', e);
      return [];
    }
  }

  async function fetchFriendStreaks(friendId) {
    if (!enabled()) return [];

    try {
      // Only fetch if there's an accepted friendship
      const { data: streaks, error } = await supabase
        .from('friend_streaks')
        .select('*')
        .eq('user_id', friendId)
        .order('date', { ascending: false })
        .limit(30);

      if (error) {
        console.error('Fetch friend streaks error:', error);
        return [];
      }

      return streaks || [];
    } catch (e) {
      console.error('Fetch friend streaks failed:', e);
      return [];
    }
  }

  async function fetchPendingInvites() {
    if (!enabled()) return [];

    try {
      const current = Auth.current();
      const { data: invites, error } = await supabase
        .from('friendships')
        .select('*')
        .eq('user_id', current.id)
        .eq('status', 'pending');

      if (error) {
        console.error('Fetch pending invites error:', error);
        return [];
      }

      return invites || [];
    } catch (e) {
      console.error('Fetch pending invites failed:', e);
      return [];
    }
  }

  async function findUserByEmail(email) {
    if (!enabled()) return null;

    try {
      // Query profiles by email (assuming profiles have email field or it's in auth.users)
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name')
        .ilike('email', email)
        .limit(1);

      if (error) {
        console.error('Find user error:', error);
        return null;
      }

      return profiles && profiles.length > 0 ? profiles[0] : null;
    } catch (e) {
      console.error('Find user failed:', e);
      return null;
    }
  }

  // =========================================================================
  // POLLING (Phase 2+)
  // =========================================================================

  function startPolling(intervalMs = 60000) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(() => {
      if (!enabled()) return;

      // Poll friends activity every minute
      fetchFriends().then(friends => {
        friends.forEach(f => {
          const friendId = f.user_id === Auth.current().id ? f.friend_user_id : f.user_id;
          fetchFriendStreaks(friendId);
        });
      });

      lastSyncTime = new Date();
    }, intervalMs);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function getLastSyncTime() {
    return lastSyncTime;
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    init,
    enabled,
    syncFriendship,
    syncStreak,
    syncSettings,
    syncFocusRoom,
    syncRoomMember,
    syncCheckIn,
    fetchFriends,
    fetchFriendStreaks,
    fetchPendingInvites,
    findUserByEmail,
    startPolling,
    stopPolling,
    getLastSyncTime
  };
})();
