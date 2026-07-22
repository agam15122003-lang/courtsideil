-- ============================================================
-- CourtSide — דירוג מאמץ עצמי של השחקן (בסוף אימון/משחק)
-- השחקן מדרג את המאמץ שלו 1..10; המאמן רואה דוח + ממוצע קבוצתי.
-- הרץ אחרי supabase_sessions.sql.
-- ============================================================

create table if not exists public.session_effort (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.profiles(id) on delete cascade,  -- חשבון השחקן
  coach_id     uuid not null references public.profiles(id) on delete cascade,
  team         text not null,
  session_type text not null,          -- 'practice' | 'game'
  session_id   uuid not null,
  session_date date,
  effort       int not null check (effort between 1 and 10),
  created_at   timestamptz not null default now(),
  unique (session_id, player_id)
);

alter table public.session_effort enable row level security;

-- השחקן כותב/קורא/מעדכן את הדירוג של עצמו
drop policy if exists "se_player_all" on public.session_effort;
create policy "se_player_all" on public.session_effort
  for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());

-- המאמן קורא את הדירוגים של האימונים שלו (דוח + ממוצע)
drop policy if exists "se_coach_read" on public.session_effort;
create policy "se_coach_read" on public.session_effort
  for select to authenticated using (coach_id = auth.uid());

create index if not exists session_effort_idx on public.session_effort (coach_id, session_id);

do $$
begin
  begin alter publication supabase_realtime add table public.session_effort; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
