-- ============================================================
-- CourtSide — כרטיס שחקן מלא, מסמך ההשקה 1.7
--
-- 1) team_players: birth_date / height / availability_since.
--    הזמינות ממשיכה לשבת על status (active=כשיר / injured / sick)
--    ו-injury_note — בלי לשכפל מצב לעמודות חדשות.
-- 2) פרטיות הסגל: עד היום כל חבר קבוצה מאושר קרא את *כל* השורה
--    (טלפון, הערות, פציעות). המדיניות roster_member_read מוחלפת
--    ב-RPC שמחזיר פרטים יבשים בלבד (שם, מספר, עמדה).
--    השחקן עצמו קורא את השורה שלו במלואה, והמאמן — הכול (כרגיל).
-- 3) coach_notes: הערות מאמן פרטיות על שחקן — למאמן בלבד, אף
--    מדיניות אחרת לא נוגעת בהן.
-- 4) set_my_availability: השחקן מעדכן פציעה/מחלה על השורה שלו
--    בלבד, בלי יכולת לגעת בשם/מספר (משמש גם את 1.13).
--
-- אידמפוטנטי. הרץ אחרי supabase_players.sql + supabase_teams_admin.sql.
-- ============================================================

-- 1) עמודות חדשות
alter table public.team_players add column if not exists birth_date date;
alter table public.team_players add column if not exists height int check (height is null or (height between 100 and 230));
alter table public.team_players add column if not exists availability_since date;

-- 2) פרטיות הסגל: חברי קבוצה רואים פרטים יבשים בלבד, דרך RPC
drop policy if exists "roster_member_read" on public.team_players;

-- השחקן עצמו קורא את השורה שלו במלואה (סטטוס, זמינות — לא של אחרים)
drop policy if exists "roster_self_read" on public.team_players;
create policy "roster_self_read" on public.team_players
  for select to authenticated using (player_id = auth.uid());

-- הסגל לחברי הקבוצה — יבש בלבד: שם, מספר, עמדה
create or replace function public.team_roster(_coach uuid, _team text)
returns table (id uuid, name text, number text, "position" text)
language sql security definer set search_path = public as $$
  select tp.id, tp.name, tp.number, tp.position
  from public.team_players tp
  where tp.coach_id = _coach and tp.team = _team
    and public.is_team_member(_coach, _team)
  order by tp.number nulls last, tp.name
$$;
grant execute on function public.team_roster(uuid, text) to authenticated;

-- 3) הערות מאמן פרטיות — למאמן בלבד
create table if not exists public.coach_notes (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  roster_id  uuid not null references public.team_players(id) on delete cascade,
  content    text not null check (char_length(content) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.coach_notes enable row level security;
drop policy if exists "coach_notes_owner" on public.coach_notes;
create policy "coach_notes_owner" on public.coach_notes
  for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create index if not exists coach_notes_idx on public.coach_notes (coach_id, roster_id, created_at desc);

-- 4) עדכון זמינות עצמי — רק שדות הזמינות, רק על השורה של השחקן
create or replace function public.set_my_availability(_status text, _note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if _status not in ('active', 'injured', 'sick') then
    raise exception 'invalid status';
  end if;
  update public.team_players
     set status = _status,
         injury_note = nullif(trim(coalesce(_note, '')), ''),
         availability_since = current_date
   where player_id = auth.uid();
end $$;
grant execute on function public.set_my_availability(text, text) to authenticated;

-- רישום בטבלת המיגרציות (אם הלדג'ר קיים)
do $$
begin
  begin
    perform public.mark_migration('supabase_player_card.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
