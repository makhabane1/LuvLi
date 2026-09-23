-- Luvli ♡ — switch client-generated-id tables from uuid to text
--
-- Luvli's app has always generated its own ids client-side (Utils.uid(),
-- e.g. "task_l8x2_9f3a1"), never real UUIDs. 0001_schema.sql assumed
-- Postgres-generated UUIDs instead. Safe to change now: these tables have
-- no real rows yet (confirmed against the live project before writing this).
-- profiles/settings/personality are untouched — their id IS auth.users.id,
-- a real UUID from Supabase Auth, not a client-generated one.

-- Drop the FKs that reference subjects.id / would block the type change.
alter table public.subject_schedule drop constraint subject_schedule_subject_id_fkey;
alter table public.focus_sessions drop constraint focus_sessions_subject_id_fkey;
alter table public.assignments drop constraint assignments_subject_id_fkey;
alter table public.exams drop constraint exams_subject_id_fkey;

-- subject_schedule's RLS policies reference subjects.id inside their EXISTS
-- clause, which Postgres counts as a dependency that blocks retyping the
-- column. Drop them here, recreate them (identical to 0002_rls.sql) below.
drop policy "subject_schedule_select_own" on public.subject_schedule;
drop policy "subject_schedule_insert_own" on public.subject_schedule;
drop policy "subject_schedule_update_own" on public.subject_schedule;
drop policy "subject_schedule_delete_own" on public.subject_schedule;

-- subjects.id and everything that points at it.
alter table public.subjects alter column id drop default;
alter table public.subjects alter column id type text;
alter table public.subject_schedule alter column subject_id type text;
alter table public.focus_sessions alter column subject_id type text;
alter table public.assignments alter column subject_id type text;
alter table public.exams alter column subject_id type text;

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

-- Re-add the FKs now that both sides are text.
alter table public.subject_schedule
  add constraint subject_schedule_subject_id_fkey
  foreign key (subject_id) references public.subjects(id) on delete cascade;
alter table public.focus_sessions
  add constraint focus_sessions_subject_id_fkey
  foreign key (subject_id) references public.subjects(id) on delete set null;
alter table public.assignments
  add constraint assignments_subject_id_fkey
  foreign key (subject_id) references public.subjects(id) on delete set null;
alter table public.exams
  add constraint exams_subject_id_fkey
  foreign key (subject_id) references public.subjects(id) on delete set null;

-- tasks.id and its self-referencing series_id (repeat series are grouped by
-- the first task's own id — see js/scheduler.js).
alter table public.tasks alter column id drop default;
alter table public.tasks alter column id type text;
alter table public.tasks alter column series_id type text;

-- backlog.id, plus two corrections against how js/app.js actually shapes a
-- backlog item (a 'repeat' field this table was missing, and the real
-- status vocabulary Luvli uses: 'backlog' -> 'scheduled' | 'removed', not
-- the 'pending'/'placed'/'dismissed' 0001_schema.sql guessed at).
alter table public.backlog alter column id drop default;
alter table public.backlog alter column id type text;
alter table public.backlog add column repeat text not null default 'none';
alter table public.backlog drop constraint backlog_status_check;
alter table public.backlog alter column status set default 'backlog';
alter table public.backlog add constraint backlog_status_check
  check (status in ('backlog', 'scheduled', 'removed'));
update public.backlog set status = 'backlog' where status = 'pending';

-- focus_sessions.id, assignments.id, exams.id
alter table public.focus_sessions alter column id drop default;
alter table public.focus_sessions alter column id type text;
alter table public.assignments alter column id drop default;
alter table public.assignments alter column id type text;
alter table public.exams alter column id drop default;
alter table public.exams alter column id type text;

-- check_ins, night_reviews, affirmations, subject_schedule, push_subscriptions
-- keep server-generated uuid ids: Luvli has no client-side id concept for
-- any of them today (check_ins/night_reviews are keyed by date, affirmations
-- favorites are plain strings, subject_schedule/push_subscriptions are new
-- tables with no local equivalent at all).
