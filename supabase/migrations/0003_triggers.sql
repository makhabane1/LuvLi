-- Luvli ♡ — functions & triggers

-- ---------------------------------------------------------------------------
-- Auto-create profile/settings/personality rows the moment someone signs up.
-- security definer: needed because this runs as part of the auth.users
-- insert, before the new user's own session/RLS context exists.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));

  insert into public.settings (user_id)
    values (new.id);

  insert into public.personality (user_id)
    values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Generic updated_at maintenance, applied to every table that has the column.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subjects
  for each row execute function public.set_updated_at();

-- personality has its own updated_at (no other columns need it) — reuse the
-- same generic function.
create trigger set_updated_at before update on public.personality
  for each row execute function public.set_updated_at();
