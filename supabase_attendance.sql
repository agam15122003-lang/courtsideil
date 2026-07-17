-- ============================================================
-- CourtSide — נוכחות באימונים (Attendance)
-- הרץ את הקובץ הזה ב-Supabase → SQL Editor → New query → Run
-- בטוח להרצה חוזרת (IF NOT EXISTS בכל מקום)
-- ============================================================

-- טבלת נוכחות: רשומה אחת לכל שחקן, לכל תאריך אימון, לכל קבוצה
create table if not exists public.practice_attendance (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  team text not null,
  session_date date not null,
  player_id uuid not null references public.team_players(id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent')),
  created_at timestamptz not null default now(),
  unique (coach_id, team, session_date, player_id)
);

-- אינדקס לשליפה מהירה של כל העונה לקבוצה
create index if not exists practice_attendance_coach_team_idx
  on public.practice_attendance (coach_id, team, session_date);

-- אבטחה: כל מאמן רואה ומנהל רק את הנוכחות של עצמו
alter table public.practice_attendance enable row level security;

drop policy if exists attendance_select_own on public.practice_attendance;
create policy attendance_select_own on public.practice_attendance
  for select using (auth.uid() = coach_id);

drop policy if exists attendance_insert_own on public.practice_attendance;
create policy attendance_insert_own on public.practice_attendance
  for insert with check (auth.uid() = coach_id);

drop policy if exists attendance_update_own on public.practice_attendance;
create policy attendance_update_own on public.practice_attendance
  for update using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

drop policy if exists attendance_delete_own on public.practice_attendance;
create policy attendance_delete_own on public.practice_attendance
  for delete using (auth.uid() = coach_id);

-- רענון סכימת ה-API
notify pgrst, 'reload schema';
