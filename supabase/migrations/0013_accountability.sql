-- Luvli ♡ — Shared Accountability
-- Friends, focus rooms, streaks, and buddy check-ins for collaborative studying
-- Run after all previous migrations

-- ---------------------------------------------------------------------------
-- friendships — Two-way friend relationships with invite tracking
-- ---------------------------------------------------------------------------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  invite_code text unique not null, -- shareable code for invites
  invite_email text, -- email used to send invite (optional, for tracking)
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_not_same check (user_id != friend_user_id),
  constraint unique_friendship unique (least(user_id, friend_user_id), greatest(user_id, friend_user_id))
);
create index friendships_user_idx on public.friendships (user_id, status);
create index friendships_friend_idx on public.friendships (friend_user_id, status);
create index friendships_code_idx on public.friendships (invite_code);

-- ---------------------------------------------------------------------------
-- friend_streaks — Denormalized daily streaks for fast friend comparison
-- ---------------------------------------------------------------------------
create table public.friend_streaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  current_streak int not null default 0 check (current_streak >= 0),
  best_streak int not null default 0 check (best_streak >= 0),
  showed_up boolean not null default false, -- had focus or task activity today
  focus_minutes int not null default 0 check (focus_minutes >= 0),
  tasks_completed int not null default 0 check (tasks_completed >= 0),
  updated_at timestamptz not null default now(),
  constraint unique_user_date unique (user_id, date)
);
create index friend_streaks_user_date_idx on public.friend_streaks (user_id, date);
create index friend_streaks_updated_idx on public.friend_streaks (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- focus_rooms — Shared study sessions (Phase 2)
-- ---------------------------------------------------------------------------
create table public.focus_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) > 0),
  description text not null default '',
  room_code text unique not null, -- shareable join code (6 chars)
  max_members int not null default 5 check (max_members > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);
create index focus_rooms_owner_idx on public.focus_rooms (owner_id);
create index focus_rooms_code_idx on public.focus_rooms (room_code);
create index focus_rooms_active_idx on public.focus_rooms (is_active, ends_at);

-- ---------------------------------------------------------------------------
-- room_members — Live member status in focus rooms (Phase 2)
-- ---------------------------------------------------------------------------
create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.focus_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'focusing' check (status in ('focusing', 'on_break', 'idle', 'left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  current_session_id uuid, -- reference to active focus session (if applicable)
  minutes_focused int not null default 0 check (minutes_focused >= 0),
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_room_member unique (room_id, user_id)
);
create index room_members_room_idx on public.room_members (room_id, status);
create index room_members_user_idx on public.room_members (user_id);
create index room_members_activity_idx on public.room_members (room_id, last_activity_at);

-- ---------------------------------------------------------------------------
-- check_in_reminders — Scheduled buddy check-ins (Phase 3)
-- ---------------------------------------------------------------------------
create table public.check_in_reminders (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.focus_rooms(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  scheduled_for timestamptz not null,
  type text not null default 'buddy_check' check (type in ('buddy_check', 'progress_share', 'encouragement')),
  message text not null default '',
  is_sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint creator_not_recipient check (creator_id != recipient_id)
);
create index check_in_reminders_room_idx on public.check_in_reminders (room_id, scheduled_for);
create index check_in_reminders_recipient_idx on public.check_in_reminders (recipient_id, is_sent, scheduled_for);
create index check_in_reminders_scheduled_idx on public.check_in_reminders (scheduled_for) where is_sent = false;
