-- Luvli ♡ — fix infinite recursion in focus room policies
--
-- room_members' read policy looked up room_members again, and inside that
-- subquery "room_id" resolved to the inner table's column, so Postgres kept
-- re-checking the same policy. focus_rooms' read policy hit the same loop.
-- A security definer function reads room_members without re-applying RLS.

create or replace function public.is_room_member(rid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = rid and user_id = auth.uid() and status <> 'left'
  );
$$;

drop policy if exists "room_members_read_in_room" on public.room_members;
create policy "room_members_read_in_room" on public.room_members
  for select using (public.is_room_member(room_id));

drop policy if exists "rooms_read_as_member" on public.focus_rooms;
create policy "rooms_read_as_member" on public.focus_rooms
  for select using (public.is_room_member(id));
