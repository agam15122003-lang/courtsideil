-- ============================================================
-- CourtSide — אישורי הגעה לאימון (RSVP)
-- הרץ את הקובץ הזה ב-Supabase → SQL Editor → New query → Run
-- בטוח להרצה חוזרת (IF NOT EXISTS / drop policy if exists בכל מקום)
--
-- למה טבלה חדשה ולא practice_attendance:
--   practice_attendance היא סימון של המאמן בדיעבד ("היה / איחר / נעדר"),
--   ואין בה מצב "טרם ענה" — שחקן שלא ענה נראה בה בדיוק כמו שחקן שנעדר.
--   כאן ההצהרה היא של השחקן ומראש, ולכן היעדר שורה = "טרם ענה".
--
-- session_id:
--   מזהה המופע. לאימון מלוח קבוע אין שורת DB, ולכן הוא מקבל UUIDv5
--   דטרמיניסטי מ-src/sessionId.js  (occurrenceId(slotId, 'YYYY-MM-DD')).
--   לאימון מ-schedule_entries זהו פשוט ה-id של השורה. כך שני המקורות
--   מדברים באותו מפתח בלי ליצור רשומות מראש.
-- ============================================================

create table if not exists public.practice_rsvp (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references auth.users(id) on delete cascade,
  team         text not null,
  session_id   uuid not null,
  session_date date not null,
  -- כאן profiles ולא team_players: מי שמאשר הוא המשתמש עצמו, ולכן
  -- auth.uid() חייב להשוות ישירות מול העמודה הזו במדיניות ה-RLS.
  player_id    uuid not null references public.profiles(id) on delete cascade,
  response     text not null check (response in ('yes', 'no', 'maybe')),
  responded_at timestamptz not null default now(),
  unique (session_id, player_id)
);

-- שליפת כל התשובות למופע אחד (המונה בכרטיס ה-hero)
create index if not exists practice_rsvp_session_idx
  on public.practice_rsvp (session_id);

-- שליפת התשובות של קבוצה בטווח תאריכים
create index if not exists practice_rsvp_coach_team_date_idx
  on public.practice_rsvp (coach_id, team, session_date);

alter table public.practice_rsvp enable row level security;

-- ---------- קריאה ----------
-- המאמן רואה את כל התשובות של הקבוצות שלו; השחקן רואה את שלו בלבד.
drop policy if exists rsvp_select_coach on public.practice_rsvp;
create policy rsvp_select_coach on public.practice_rsvp
  for select to authenticated using (auth.uid() = coach_id);

drop policy if exists rsvp_select_own on public.practice_rsvp;
create policy rsvp_select_own on public.practice_rsvp
  for select to authenticated using (auth.uid() = player_id);

-- ---------- כתיבה ----------
-- רק השחקן עצמו מצהיר, ורק אם הוא באמת בסגל של אותו מאמן.
-- הבדיקה נגד team_players מונעת הצפת שורות ע"י משתמש שאינו בקבוצה.
create or replace function public.is_on_coach_roster(_coach_id uuid, _team text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_players tp
    where tp.player_id = auth.uid()
      and tp.coach_id = _coach_id
      and tp.team = _team
  );
$$;

drop policy if exists rsvp_insert_own on public.practice_rsvp;
create policy rsvp_insert_own on public.practice_rsvp
  for insert to authenticated
  with check (auth.uid() = player_id and public.is_on_coach_roster(coach_id, team));

drop policy if exists rsvp_update_own on public.practice_rsvp;
create policy rsvp_update_own on public.practice_rsvp
  for update to authenticated
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

drop policy if exists rsvp_delete_own on public.practice_rsvp;
create policy rsvp_delete_own on public.practice_rsvp
  for delete to authenticated using (auth.uid() = player_id);

comment on table public.practice_rsvp is
  'אישורי הגעה מראש של שחקנים לאימון. היעדר שורה = טרם ענה.';

-- רישום ביומן המיגרציות (אם הוא כבר קיים)
do $mig$ begin
  perform public.mark_migration('supabase_practice_rsvp.sql');
exception when undefined_function then null; end $mig$;

-- רענון סכימת ה-API
notify pgrst, 'reload schema';
