-- ============================================================
-- CourtSide — לו"ז קבוע לכל קבוצה (ימי אימון + שעות)
-- המאמן מגדיר ימי אימון קבועים לכל קבוצה; הם מופיעים אוטומטית ומיד
-- אצל כל שחקני הקבוצה. אין יצירת שורות למופע — המופעים נגזרים בצד הלקוח
-- עם session_id דטרמיניסטי (UUIDv5).
-- הרץ אחרי supabase_players.sql / supabase_player_v2.sql / supabase_sessions.sql.
-- ============================================================

create table if not exists public.team_practice_slots (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  team        text not null,
  weekday     int  not null check (weekday between 0 and 6),  -- 0=ראשון .. 6=שבת
  start_time  time not null,
  end_time    time,
  location    text,
  created_at  timestamptz not null default now()
);

alter table public.team_practice_slots enable row level security;

-- המאמן מנהל את המשבצות של עצמו
drop policy if exists "tps_coach_all" on public.team_practice_slots;
create policy "tps_coach_all" on public.team_practice_slots
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- שחקנים מאושרים בקבוצה רואים את הלו"ז הקבוע שלה
drop policy if exists "tps_member_read" on public.team_practice_slots;
create policy "tps_member_read" on public.team_practice_slots
  for select to authenticated using (public.is_team_member(coach_id, team));

create index if not exists tps_coach_team_idx on public.team_practice_slots (coach_id, team);

-- ---------- הערת השחקן על האימון (משהו שהוא רוצה לרשום למאמן בסוף האימון) ----------
alter table public.session_effort add column if not exists note text;

-- ---------- סימון עמידה במטרות לאימון (לכל אימון בנפרד; לא משנה את הגדרת המטרה) ----------
create table if not exists public.session_goal_marks (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles(id) on delete cascade,
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  session_id  uuid not null,
  goal_id     uuid not null references public.player_goals(id) on delete cascade,
  met         boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (session_id, goal_id, player_id)
);

alter table public.session_goal_marks enable row level security;

-- השחקן מסמן/קורא/מעדכן את הסימונים של עצמו
drop policy if exists "sgm_player_all" on public.session_goal_marks;
create policy "sgm_player_all" on public.session_goal_marks
  for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());

-- המאמן קורא את הסימונים של האימונים שלו
drop policy if exists "sgm_coach_read" on public.session_goal_marks;
create policy "sgm_coach_read" on public.session_goal_marks
  for select to authenticated using (coach_id = auth.uid());

create index if not exists sgm_session_idx on public.session_goal_marks (session_id, player_id);

do $$
begin
  begin alter publication supabase_realtime add table public.team_practice_slots; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.session_goal_marks; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
