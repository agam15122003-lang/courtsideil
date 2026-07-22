-- ============================================================
-- CourtSide — סקירת משחקים + נוכחות משחק (FE1b)
-- הרץ אחרי supabase_sessions.sql.
-- ============================================================

-- סולם מאמץ 1..10 (עדכון מ-1..5)
do $$
begin
  alter table public.player_feedback drop constraint if exists pf_effort_range;
  alter table public.player_feedback
    add constraint pf_effort_range check (effort is null or (effort between 1 and 10)) not valid;
end $$;

-- נוכחות למשחק (נפרד מ-practice_attendance כדי לא להתנגש בתאריך)
create table if not exists public.game_attendance (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  team       text not null,
  game_id    uuid not null references public.team_games(id) on delete cascade,
  player_id  uuid not null references public.team_players(id) on delete cascade,
  status     text not null check (status in ('present', 'late', 'absent')),
  updated_at timestamptz not null default now(),
  unique (game_id, player_id)
);

alter table public.game_attendance enable row level security;

drop policy if exists "ga_coach_all" on public.game_attendance;
create policy "ga_coach_all" on public.game_attendance
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists "ga_player_self_read" on public.game_attendance;
create policy "ga_player_self_read" on public.game_attendance
  for select to authenticated using (public.is_my_roster(player_id));

create index if not exists game_attendance_idx on public.game_attendance (coach_id, team, game_id);

do $$
begin
  begin alter publication supabase_realtime add table public.game_attendance; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
