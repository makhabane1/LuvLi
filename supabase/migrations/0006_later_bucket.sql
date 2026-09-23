-- Luvli ♡ — columns needed for the "Later" bucket (affirmations, personality, subjects)
--
-- subject_schedule is deliberately left alone here: there is no UI anywhere
-- in the app that lets a user create a schedule entry (js/app.js has no
-- add/edit handler for it) — only Storage.seedSampleDay() ever populates
-- it. Not worth syncing a sub-feature nothing can generate in real use.

alter table public.personality add column chosen boolean not null default false;
alter table public.personality add column onboarding_step int not null default 0;
alter table public.personality add column history jsonb not null default '[]'::jsonb;

-- Local favourites are { text, category } with no stable id of their own
-- (js/app.js removes them by array index) — category only applies to
-- favourites, not custom affirmations, so it's nullable.
alter table public.affirmations add column category text;
