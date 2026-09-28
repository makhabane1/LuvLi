-- Luvli ♡ — Flashcards (Student mode, stage 3)
--
-- state.student.cards locally: { id, subjectId, question, answer,
-- confidence, seen, right, lastSeen }. confidence is 0-5, adjusted +1/-1
-- (clamped) each time a card is reviewed as "Got it" / "Still learning" —
-- same scale as exams.confidence for consistency.

create table public.flashcards (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.subjects(id) on delete set null,
  question text not null check (char_length(question) > 0),
  answer text not null default '',
  confidence int not null default 0 check (confidence between 0 and 5),
  seen int not null default 0,
  "right" int not null default 0,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);
create index flashcards_user_idx on public.flashcards (user_id);

alter table public.flashcards enable row level security;
create policy "flashcards_select_own" on public.flashcards for select using (auth.uid() = user_id);
create policy "flashcards_insert_own" on public.flashcards for insert with check (auth.uid() = user_id);
create policy "flashcards_update_own" on public.flashcards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "flashcards_delete_own" on public.flashcards for delete using (auth.uid() = user_id);
