-- Luvli ♡ — local seed data
--
-- Only run this against a LOCAL Supabase instance (`supabase start`), never
-- against the real project (eablejtazhyxbdjvfjmz) — it creates a fake test
-- account with a known password, which would be a real account on prod.
--
-- Usage: supabase db reset   (runs migrations, then this file, automatically)
--     or: psql <local-db-url> -f supabase/seed.sql

-- A fixed, memorable UUID so the rest of this file can reference it directly.
do $$
declare
  test_user_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- Insert straight into auth.users (only works because local Supabase runs
  -- the full auth schema too). Password is 'luvli-test-password'.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    test_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'test@luvli.local', crypt('luvli-test-password', gen_salt('bf')),
    now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"name":"Test User"}'
  )
  on conflict (id) do nothing;

  -- profiles/settings/personality are created automatically by the
  -- on_auth_user_created trigger above — nothing to insert for those.

  insert into public.tasks (user_id, date, name, category, start_time, end_time, priority, notes)
  values
    (test_user_id, current_date, 'Morning walk', 'wellness', '07:00', '07:30', 'low', ''),
    (test_user_id, current_date, 'Deep work: project plan', 'study', '09:00', '10:30', 'high', 'Focus block'),
    (test_user_id, current_date, 'Lunch', 'meal', '12:30', '13:15', 'medium', '');

  insert into public.backlog (user_id, name, category, priority, duration_minutes)
  values (test_user_id, 'Read one chapter', 'study', 'low', 30);

  insert into public.subjects (user_id, name, emoji, goal, progress)
  values (test_user_id, 'Mathematics', '📐', 'Finish chapter 4', 40);

  insert into public.focus_sessions (user_id, minutes, date, type)
  values (test_user_id, 25, current_date, 'focus');

  insert into public.check_ins (user_id, date, mood, note)
  values (test_user_id, current_date, 'good', 'Feeling steady today.')
  on conflict (user_id, date) do nothing;

  insert into public.affirmations (user_id, text, is_custom, is_favorite)
  values (test_user_id, 'You are doing enough.', false, true);
end $$;
