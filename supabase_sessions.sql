-- ============================================================
-- CourtSide — סקירת אימון/משחק (FE1)
-- משוב מוצמד לאימון + סולם מאמץ + סקירת מאמן + MVP, עם היסטוריה לשחקן.
-- הרץ אחרי supabase_players.sql ו-supabase_player_v2.sql.
-- ============================================================

-- ---------- הרחבת player_feedback: קישור לאימון + מאמץ ----------
alter table public.player_feedback alter column content drop not null;
alter table public.player_feedback add column if not exists session_type text;   -- 'practice' | 'game' | 'general'
alter table public.player_feedback add column if not exists session_id   uuid;
alter table public.player_feedback add column if not exists session_date  date;
alter table public.player_feedback add column if not exists effort        int;    -- 1..5 (סולם מאמץ)
alter table public.player_feedback add column if not exists opponent      text;

create index if not exists pf_session_idx on public.player_feedback (session_id);
create index if not exists pf_player_created_idx on public.player_feedback (player_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pf_effort_range') then
    alter table public.player_feedback
      add constraint pf_effort_range check (effort is null or (effort between 1 and 5)) not valid;
  end if;
end $$;

-- ---------- סקירת מאמן לאימון (שורה אחת לכל אימון) ----------
create table if not exists public.session_reviews (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.profiles(id) on delete cascade,
  team          text not null,
  session_type  text not null,          -- 'practice' | 'game'
  session_id    uuid not null,          -- schedule_entries.id או team_games.id
  session_date  date,
  overall_note  text,
  mood          text,                   -- 'tough' | 'good' | 'great'
  mvp_name      text,                   -- שם ה-MVP (לתצוגה)
  mvp_player_id uuid,                   -- מזהה חשבון ה-MVP (אם מחובר) — לזיהוי "אתה ה-MVP"
  updated_at    timestamptz not null default now(),
  unique (coach_id, session_type, session_id)
);

alter table public.session_reviews enable row level security;

drop policy if exists "sr_coach_all" on public.session_reviews;
create policy "sr_coach_all" on public.session_reviews
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- חברי קבוצה מאושרים רואים את סקירת האימון של הקבוצה שלהם
drop policy if exists "sr_member_read" on public.session_reviews;
create policy "sr_member_read" on public.session_reviews
  for select to authenticated using (public.is_team_member(coach_id, team));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sr_note_len') then
    alter table public.session_reviews
      add constraint sr_note_len check (overall_note is null or char_length(overall_note) <= 2000) not valid;
  end if;
end $$;

-- ---------- משחקים: שחקנים מאושרים רואים את המשחקים של הקבוצה ----------
do $$
begin
  if to_regclass('public.team_games') is not null then
    execute 'alter table public.team_games enable row level security';
    execute 'drop policy if exists "games_member_read" on public.team_games';
    execute 'create policy "games_member_read" on public.team_games
      for select to authenticated using (public.is_team_member(coach_id, team))';
  end if;
end $$;

-- ---------- realtime ----------
do $$
begin
  begin alter publication supabase_realtime add table public.session_reviews; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
