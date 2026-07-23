-- ============================================================
-- CourtSide — יומן התקדמות למטרה (גרף התקדמות למטרה ספציפית)
-- כל רשומה היא "צילום מצב" של ההתקדמות במטרה בתאריך מסוים,
-- כדי לצייר גרף התקדמות לאורך זמן. הרץ אחרי supabase_player_goals.sql.
-- ============================================================

create table if not exists public.player_goal_logs (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.player_goals(id) on delete cascade,
  player_id  uuid not null references public.profiles(id) on delete cascade,
  value      numeric not null,                 -- ההתקדמות המצטברת אחרי העדכון
  log_date   date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.player_goal_logs enable row level security;

-- השחקן: שליטה מלאה ביומן שלו
drop policy if exists "pgl_player_all" on public.player_goal_logs;
create policy "pgl_player_all" on public.player_goal_logs
  for all to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

-- המאמן: קורא את היומן של המטרות שהוא הגדיר
drop policy if exists "pgl_coach_read" on public.player_goal_logs;
create policy "pgl_coach_read" on public.player_goal_logs
  for select to authenticated
  using (exists (select 1 from public.player_goals g where g.id = goal_id and g.coach_id = auth.uid()));

create index if not exists player_goal_logs_idx on public.player_goal_logs (goal_id, created_at);

notify pgrst, 'reload schema';
