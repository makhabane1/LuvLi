-- Luvli ♡ — Revision plans (Student mode, stage 4, last piece)
--
-- The only trace of this feature anywhere in the codebase was a comment
-- ("revision plans built by Build My Revision Plan") — no UI, no shape
-- beyond state.student.plans: []. Designed from scratch: pick an upcoming
-- exam, Luvli generates a checklist of revision sessions (one per topic if
-- the exam has any, otherwise a few generic spaced reviews) leading up to
-- it. Sessions are a small nested list, always read/written with their
-- parent plan — jsonb here instead of a 6th table + join.

create table public.revision_plans (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id text references public.exams(id) on delete set null,
  subject_id text references public.subjects(id) on delete set null,
  name text not null check (char_length(name) > 0),
  sessions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index revision_plans_user_idx on public.revision_plans (user_id);

alter table public.revision_plans enable row level security;
create policy "revision_plans_select_own" on public.revision_plans for select using (auth.uid() = user_id);
create policy "revision_plans_insert_own" on public.revision_plans for insert with check (auth.uid() = user_id);
create policy "revision_plans_update_own" on public.revision_plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "revision_plans_delete_own" on public.revision_plans for delete using (auth.uid() = user_id);
