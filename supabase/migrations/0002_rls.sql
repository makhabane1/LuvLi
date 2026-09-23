-- Luvli ♡ — Row Level Security
-- Every table is default-deny: RLS is enabled and the ONLY policies granted
-- are "the row belongs to the signed-in user" (auth.uid()). No table is ever
-- left with RLS disabled — that would let any anon-key holder read/write
-- everyone's data, since the anon/publishable key is public by design.

-- ---------------------------------------------------------------------------
-- profiles (id IS the user id)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- settings (user_id IS the user id)
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;

create policy "settings_select_own" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.settings
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- backlog
-- ---------------------------------------------------------------------------
alter table public.backlog enable row level security;

create policy "backlog_select_own" on public.backlog
  for select using (auth.uid() = user_id);
create policy "backlog_insert_own" on public.backlog
  for insert with check (auth.uid() = user_id);
create policy "backlog_update_own" on public.backlog
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "backlog_delete_own" on public.backlog
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------
alter table public.subjects enable row level security;

create policy "subjects_select_own" on public.subjects
  for select using (auth.uid() = user_id);
create policy "subjects_insert_own" on public.subjects
  for insert with check (auth.uid() = user_id);
create policy "subjects_update_own" on public.subjects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subjects_delete_own" on public.subjects
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- subject_schedule (no user_id column — ownership via parent subjects row)
-- ---------------------------------------------------------------------------
alter table public.subject_schedule enable row level security;

create policy "subject_schedule_select_own" on public.subject_schedule
  for select using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );
create policy "subject_schedule_insert_own" on public.subject_schedule
  for insert with check (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );
create policy "subject_schedule_update_own" on public.subject_schedule
  for update using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );
create policy "subject_schedule_delete_own" on public.subject_schedule
  for delete using (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- focus_sessions
-- ---------------------------------------------------------------------------
alter table public.focus_sessions enable row level security;

create policy "focus_sessions_select_own" on public.focus_sessions
  for select using (auth.uid() = user_id);
create policy "focus_sessions_insert_own" on public.focus_sessions
  for insert with check (auth.uid() = user_id);
create policy "focus_sessions_update_own" on public.focus_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "focus_sessions_delete_own" on public.focus_sessions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------------
alter table public.check_ins enable row level security;

create policy "check_ins_select_own" on public.check_ins
  for select using (auth.uid() = user_id);
create policy "check_ins_insert_own" on public.check_ins
  for insert with check (auth.uid() = user_id);
create policy "check_ins_update_own" on public.check_ins
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "check_ins_delete_own" on public.check_ins
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- night_reviews
-- ---------------------------------------------------------------------------
alter table public.night_reviews enable row level security;

create policy "night_reviews_select_own" on public.night_reviews
  for select using (auth.uid() = user_id);
create policy "night_reviews_insert_own" on public.night_reviews
  for insert with check (auth.uid() = user_id);
create policy "night_reviews_update_own" on public.night_reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "night_reviews_delete_own" on public.night_reviews
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
alter table public.assignments enable row level security;

create policy "assignments_select_own" on public.assignments
  for select using (auth.uid() = user_id);
create policy "assignments_insert_own" on public.assignments
  for insert with check (auth.uid() = user_id);
create policy "assignments_update_own" on public.assignments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assignments_delete_own" on public.assignments
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- exams
-- ---------------------------------------------------------------------------
alter table public.exams enable row level security;

create policy "exams_select_own" on public.exams
  for select using (auth.uid() = user_id);
create policy "exams_insert_own" on public.exams
  for insert with check (auth.uid() = user_id);
create policy "exams_update_own" on public.exams
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exams_delete_own" on public.exams
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- affirmations
-- ---------------------------------------------------------------------------
alter table public.affirmations enable row level security;

create policy "affirmations_select_own" on public.affirmations
  for select using (auth.uid() = user_id);
create policy "affirmations_insert_own" on public.affirmations
  for insert with check (auth.uid() = user_id);
create policy "affirmations_update_own" on public.affirmations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "affirmations_delete_own" on public.affirmations
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- personality (user_id IS the user id)
-- ---------------------------------------------------------------------------
alter table public.personality enable row level security;

create policy "personality_select_own" on public.personality
  for select using (auth.uid() = user_id);
create policy "personality_insert_own" on public.personality
  for insert with check (auth.uid() = user_id);
create policy "personality_update_own" on public.personality
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personality_delete_own" on public.personality
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
