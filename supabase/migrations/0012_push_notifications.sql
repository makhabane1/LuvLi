-- Luvli ♡ — real push notifications
--
-- push_subscriptions already exists (0001_schema.sql) with per-user RLS.
-- This adds what the scheduled sender (netlify/functions/send-reminders.js)
-- needs:
--   • settings.timezone — task dates/times are the user's local wall-clock
--     time, so the server must know what "now" is for each person.
--   • push_log — one row per reminder actually sent, so a reminder is never
--     sent twice even though the sender runs every 5 minutes.
--
-- push_log has RLS enabled and deliberately NO policies: no signed-in user
-- can read or write it. Only the server (service-role key, which bypasses
-- RLS) touches it.

alter table public.settings add column timezone text not null default 'UTC';

create table public.push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, task_id, date)
);

alter table public.push_log enable row level security;
