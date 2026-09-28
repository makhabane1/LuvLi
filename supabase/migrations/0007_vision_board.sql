-- Luvli ♡ — Vision Board tables
--
-- Locally this lives at state.visionboard = { boards: [...], items: [...] }
-- (js/vision-board.js), a key storage.js's defaults() never declared — it's
-- attached ad hoc via Storage.get()/save(). ids are client-generated
-- (Utils.uid('vb') / 'vb-item'), same text-id story as tasks/subjects/etc.
-- user_id is denormalised onto items too (not just a board_id FK) so RLS
-- stays a plain auth.uid() = user_id check, consistent with every other
-- table, rather than an EXISTS-through-the-parent join.

create table public.vision_boards (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) > 0),
  emoji text not null default '✨',
  created_at timestamptz not null default now()
);
create index vision_boards_user_idx on public.vision_boards (user_id);

create table public.vision_board_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id text not null references public.vision_boards(id) on delete cascade,
  url text not null,
  note text not null default '',
  source text not null default 'manual',
  size text not null default '',
  created_at timestamptz not null default now()
);
create index vision_board_items_user_idx on public.vision_board_items (user_id);
create index vision_board_items_board_idx on public.vision_board_items (board_id);

alter table public.vision_boards enable row level security;
create policy "vision_boards_select_own" on public.vision_boards for select using (auth.uid() = user_id);
create policy "vision_boards_insert_own" on public.vision_boards for insert with check (auth.uid() = user_id);
create policy "vision_boards_update_own" on public.vision_boards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vision_boards_delete_own" on public.vision_boards for delete using (auth.uid() = user_id);

alter table public.vision_board_items enable row level security;
create policy "vision_board_items_select_own" on public.vision_board_items for select using (auth.uid() = user_id);
create policy "vision_board_items_insert_own" on public.vision_board_items for insert with check (auth.uid() = user_id);
create policy "vision_board_items_update_own" on public.vision_board_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vision_board_items_delete_own" on public.vision_board_items for delete using (auth.uid() = user_id);
