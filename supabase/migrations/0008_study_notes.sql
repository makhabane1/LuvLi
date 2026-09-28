-- Luvli ♡ — Study notes (Student mode, stage 2)
--
-- state.student.notes locally: { id, subjectId, title, body, kind, url,
-- pinned, createdAt, updatedAt }. kind ('note' | 'link') is derived from
-- whether url is set rather than stored as its own column — the UI never
-- asks for it directly, it just shows a link icon when url is present.

create table public.study_notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.subjects(id) on delete set null,
  title text not null check (char_length(title) > 0),
  body text not null default '',
  url text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_notes_user_idx on public.study_notes (user_id);

alter table public.study_notes enable row level security;
create policy "study_notes_select_own" on public.study_notes for select using (auth.uid() = user_id);
create policy "study_notes_insert_own" on public.study_notes for insert with check (auth.uid() = user_id);
create policy "study_notes_update_own" on public.study_notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "study_notes_delete_own" on public.study_notes for delete using (auth.uid() = user_id);

create trigger set_updated_at before update on public.study_notes
  for each row execute function public.set_updated_at();
