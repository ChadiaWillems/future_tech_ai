-- Doodle Quest: tabel voor de scores
-- Plak dit in Supabase: SQL Editor > New query > Run

create table public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 20),
  score integer not null check (score between 0 and 2100), -- max 3 rondes x 700
  created_at timestamptz not null default now()
);

-- Row Level Security: iedereen mag scores lezen en toevoegen,
-- maar niemand mag scores aanpassen of verwijderen.
alter table public.scores enable row level security;

create policy "Iedereen mag scores lezen"
  on public.scores for select
  to anon
  using (true);

create policy "Iedereen mag een score toevoegen"
  on public.scores for insert
  to anon
  with check (true);
