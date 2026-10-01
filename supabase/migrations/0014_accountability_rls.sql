-- Luvli ♡ — Accountability Row Level Security
-- Privacy-first policies: users can only see data they're explicitly connected to

-- ---------------------------------------------------------------------------
-- friendships — can see your own invites and your accepted friendships
-- ---------------------------------------------------------------------------
alter table public.friendships enable row level security;

create policy "friendships_read_own" on public.friendships
  for select using (
    auth.uid() = user_id or auth.uid() = friend_user_id
  );

create policy "friendships_create_own" on public.friendships
  for insert with check (auth.uid() = user_id);

create policy "friendships_update_own" on public.friendships
  for update using (
    auth.uid() = user_id or auth.uid() = friend_user_id
  ) with check (
    auth.uid() = user_id or auth.uid() = friend_user_id
  );

create policy "friendships_delete_own" on public.friendships
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- friend_streaks — can see only friends' streaks (if they have accepted friendship)
-- ---------------------------------------------------------------------------
alter table public.friend_streaks enable row level security;

create policy "streaks_read_own" on public.friend_streaks
  for select using (auth.uid() = user_id);

create policy "streaks_read_friend" on public.friend_streaks
  for select using (
    exists (
      select 1 from public.friendships f
      where (
        (f.user_id = auth.uid() and f.friend_user_id = user_id and f.status = 'accepted') or
        (f.friend_user_id = auth.uid() and f.user_id = user_id and f.status = 'accepted')
      )
    )
  );

create policy "streaks_insert_own" on public.friend_streaks
  for insert with check (auth.uid() = user_id);

create policy "streaks_update_own" on public.friend_streaks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "streaks_delete_own" on public.friend_streaks
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- focus_rooms — room owner can CRUD, members can read (Phase 2)
-- ---------------------------------------------------------------------------
alter table public.focus_rooms enable row level security;

create policy "rooms_read_own" on public.focus_rooms
  for select using (auth.uid() = owner_id);

create policy "rooms_read_as_member" on public.focus_rooms
  for select using (
    exists (
      select 1 from public.room_members rm
      where rm.room_id = id and rm.user_id = auth.uid() and rm.status != 'left'
    )
  );

create policy "rooms_create_own" on public.focus_rooms
  for insert with check (auth.uid() = owner_id);

create policy "rooms_update_own" on public.focus_rooms
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "rooms_delete_own" on public.focus_rooms
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- room_members — can see and modify your own status in rooms you're in
-- ---------------------------------------------------------------------------
alter table public.room_members enable row level security;

create policy "room_members_read_in_room" on public.room_members
  for select using (
    exists (
      select 1 from public.room_members rm
      where rm.room_id = room_id and rm.user_id = auth.uid() and rm.status != 'left'
    )
  );

create policy "room_members_insert_own" on public.room_members
  for insert with check (auth.uid() = user_id);

create policy "room_members_update_own" on public.room_members
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- check_in_reminders — creator can read/write, recipient can read (Phase 3)
-- ---------------------------------------------------------------------------
alter table public.check_in_reminders enable row level security;

create policy "check_ins_read_as_creator" on public.check_in_reminders
  for select using (auth.uid() = creator_id);

create policy "check_ins_read_as_recipient" on public.check_in_reminders
  for select using (auth.uid() = recipient_id);

create policy "check_ins_insert_own" on public.check_in_reminders
  for insert with check (auth.uid() = creator_id);

create policy "check_ins_update_creator" on public.check_in_reminders
  for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

create policy "check_ins_update_recipient" on public.check_in_reminders
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
