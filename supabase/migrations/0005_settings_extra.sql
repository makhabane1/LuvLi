-- Luvli ♡ — settings columns 0001_schema.sql missed
--
-- state.settings.onboarding (the short sign-up questionnaire's answers) and
-- notifications.promptDismissed exist locally but have no column yet.
-- onboarding is stored as-is (jsonb) rather than expanded into more
-- columns: it's a one-time record read as a whole, never queried by field.

alter table public.settings add column onboarding jsonb not null default '{}'::jsonb;
alter table public.settings add column notifications_prompt_dismissed boolean not null default false;
