-- ============================================================
-- CourtSide — מטרות אישיות לשחקן (FE4)
-- המאמן מגדיר לכל שחקן מטרות שבועיות/חודשיות/עונתיות; השחקן צופה בהתקדמות.
-- הרץ אחרי supabase_players.sql / supabase_player_v2.sql.
-- ============================================================

create table if not exists public.player_goals (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references public.profiles(id) on delete cascade,
  player_id      uuid references public.profiles(id) on delete cascade,  -- null = מטרה לכל הקבוצה
  team           text,
  period         text not null check (period in ('week', 'month', 'year', 'session')),
  title          text not null,
  description    text,
  metric_type    text not null default 'checkbox' check (metric_type in ('checkbox', 'count')),
  target_value   numeric,
  progress_value numeric not null default 0,
  unit           text,
  status         text not null default 'active' check (status in ('active', 'done')),
  due_date       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.player_goals enable row level security;

-- המאמן: שליטה מלאה במטרות שהוא יצר
drop policy if exists "pg_coach_all" on public.player_goals;
create policy "pg_coach_all" on public.player_goals
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- השחקן: קורא את המטרות האישיות שלו + מטרות לכל הקבוצה שהוא חבר בה
drop policy if exists "pg_player_read" on public.player_goals;
create policy "pg_player_read" on public.player_goals
  for select to authenticated using (
    player_id = auth.uid()
    or (player_id is null and team is not null and public.is_team_member(coach_id, team))
  );

create index if not exists player_goals_idx on public.player_goals (coach_id, player_id, period);

do $$
begin
  begin alter publication supabase_realtime add table public.player_goals; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
