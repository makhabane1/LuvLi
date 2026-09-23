-- Luvli ♡ — initial production schema
-- Normalizes the old single localStorage blob (see README's "How the day
-- logic works") into per-user tables keyed off Supabase's built-in
-- auth.users. Run in order: 0001_schema.sql -> 0002_rls.sql -> 0003_triggers.sql.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  avatar_color text not null default 'rose',
  avatar_shape text not null default 'circle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- settings — 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wake_time time not null default '07:00',
  sleep_time time not null default '22:30',
  time_format text not null default '24' check (time_format in ('12', '24')),
  focus_length int not null default 25 check (focus_length > 0),
  break_length int not null default 5 check (break_length > 0),
  long_break_length int not null default 15 check (long_break_length > 0),
  auto_break boolean not null default true,
  focus_fullscreen boolean not null default false,
  focus_sound boolean not null default true,
  buffer_minutes int not null default 10 check (buffer_minutes >= 0),
  max_planned_hours int not null default 12 check (max_planned_hours > 0),
  protect_breaks boolean not null default true,
  auto_optimize boolean not null default false,
  theme text not null default 'rose',
  reduce_motion boolean not null default false,
  notifications_enabled boolean not null default true,
  notifications_lead_minutes int not null default 10 check (notifications_lead_minutes >= 0),
  notifications_evening boolean not null default true,
  notifications_celebrate boolean not null default true,
  affirmations_during_focus boolean not null default true,
  affirmation_categories text[] not null default '{}',
  study_apps text[] not null default '{}',
  distraction_apps text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks — the core scheduled-activity table
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  name text not null check (char_length(name) > 0),
  category text not null default 'other',
  start_time time not null,
  end_time time not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  notes text not null default '',
  completed boolean not null default false,
  completed_at timestamptz,
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekdays', 'weekly')),
  series_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_time_order check (end_time > start_time)
);
create index tasks_user_date_idx on public.tasks (user_id, date);
create index tasks_series_idx on public.tasks (series_id) where series_id is not null;

-- ---------------------------------------------------------------------------
-- backlog — unscheduled task ideas
-- ---------------------------------------------------------------------------
create table public.backlog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) > 0),
  category text not null default 'other',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  duration_minutes int not null default 30 check (duration_minutes > 0),
  status text not null default 'pending' check (status in ('pending', 'placed', 'dismissed')),
  added_at timestamptz not null default now()
);
create index backlog_user_idx on public.backlog (user_id);

-- ---------------------------------------------------------------------------
-- subjects — study subjects
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) > 0),
  emoji text not null default '📚',
  goal text not null default '',
  progress numeric not null default 0 check (progress >= 0 and progress <= 100),
  teacher text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subjects_user_idx on public.subjects (user_id);

create table public.subject_schedule (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  room text not null default '',
  constraint subject_schedule_time_order check (end_time > start_time)
);
create index subject_schedule_subject_idx on public.subject_schedule (subject_id);

-- ---------------------------------------------------------------------------
-- focus_sessions — Pomodoro / study session log
-- ---------------------------------------------------------------------------
create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  subject_name text not null default '',
  goal text not null default '',
  minutes int not null check (minutes > 0),
  date date not null,
  type text not null default 'focus' check (type in ('focus', 'study', 'break')),
  ended_at timestamptz not null default now()
);
create index focus_sessions_user_date_idx on public.focus_sessions (user_id, date);

-- ---------------------------------------------------------------------------
-- check_ins — daily mood
-- ---------------------------------------------------------------------------
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  mood text not null check (mood in ('great', 'good', 'okay', 'low', 'difficult', 'exhausted')),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- night_reviews — end-of-day rating
-- ---------------------------------------------------------------------------
create table public.night_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- assignments — Student-mode-lite
-- ---------------------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  name text not null check (char_length(name) > 0),
  due_date date,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  estimate_minutes int check (estimate_minutes > 0),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index assignments_user_idx on public.assignments (user_id);

-- ---------------------------------------------------------------------------
-- exams — Student-mode-lite
-- ---------------------------------------------------------------------------
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  name text not null check (char_length(name) > 0),
  exam_date date,
  topics text[] not null default '{}',
  confidence int check (confidence between 1 and 5),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index exams_user_idx on public.exams (user_id);

-- ---------------------------------------------------------------------------
-- affirmations — favorites + custom
-- ---------------------------------------------------------------------------
create table public.affirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) > 0),
  is_custom boolean not null default false,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);
create index affirmations_user_idx on public.affirmations (user_id);

-- ---------------------------------------------------------------------------
-- personality — coach customization, 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table public.personality (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key text not null default 'gentle',
  communication text not null default 'warm',
  reminder_style text not null default 'gentle',
  avatar_color text not null default 'rose',
  avatar_shape text not null default 'circle',
  affirmation_categories text[] not null default '{}',
  customised boolean not null default false,
  overrides jsonb not null default '{}'::jsonb,
  memory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- push_subscriptions — Later: real push notifications
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
