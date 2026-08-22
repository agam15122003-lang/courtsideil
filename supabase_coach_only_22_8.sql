-- =====================================================================
-- CourtSide — השקת צד המאמן בלבד · 22.8.2026
-- =====================================================================
-- מה קרה: צד השחקן מוסתר (המתג PLAYER_SIDE=false ב-src/flags.js). אין
-- חשבונות שחקן — אבל המאמן ממשיך לרשום לכל שחקן בסגל: עומס אחרי אימון,
-- יעדים אישיים, משוב, «עמד ביעד», ומשימות.
--
-- הבעיה: עד היום כל אלה נשמרו על **חשבון** השחקן (player_id → profiles).
-- בלי חשבון — אין לאן לשמור.
--
-- הפתרון: כל טבלה מקבלת גם roster_id → team_players («שורת הסגל»), שקיימת
-- תמיד, עם חשבון או בלי. כשצד השחקן יחזור, יעדים/משוב/משימות של שחקן
-- מקושר יוכלו להחזיק את שני המזהים. ⚠ חריג: שורות **המאמן** ב-session_effort
-- וב-session_goal_marks נשארות עם player_id ריק לתמיד — שם יש עדיין
-- unique (session_id, player_id) / (session_id, goal_id, player_id) של הדירוג
-- העצמי, ושורת מאמן עם player_id הייתה מתנגשת בשורת השחקן ונכתבת דרך
-- המדיניות שלו. הפרונט (SessionDetail) כותב שם player_id = null.
--
-- בטוח להרצה חוזרת. לא מוחק כלום ולא משנה נתונים קיימים.
-- הרץ אחרי supabase_club_manage_19_8.sql (#40). לא תלוי ב-#41.
-- =====================================================================

-- ---------- 1. עומס אחרי אימון (session_effort) ----------
-- עד היום: השחקן דירג את עצמו. מעכשיו גם המאמן רושם — ושומרים מי רשם.
alter table public.session_effort add column if not exists roster_id uuid references public.team_players(id) on delete cascade;
alter table public.session_effort add column if not exists source text not null default 'player';
alter table public.session_effort alter column player_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'se_source_chk') then
    alter table public.session_effort add constraint se_source_chk
      check (source in ('player', 'coach')) not valid;
  end if;
  -- שורה חייבת להצביע על מישהו — חשבון או שורת סגל
  if not exists (select 1 from pg_constraint where conname = 'se_who_chk') then
    alter table public.session_effort add constraint se_who_chk
      check (player_id is not null or roster_id is not null) not valid;
  end if;
  -- רישום אחד של המאמן לכל שחקן לכל אימון. NULL-ים לא מתנגשים, ולכן
  -- שורות הדירוג העצמי (roster_id ריק) לא נפגעות.
  if not exists (select 1 from pg_constraint where conname = 'se_session_roster_uq') then
    alter table public.session_effort add constraint se_session_roster_uq unique (session_id, roster_id);
  end if;
end $$;

-- המאמן כותב/מעדכן/מוחק רק שורות שהוא עצמו רשם (source='coach') על
-- האימונים שלו. דירוג עצמי של שחקן נשאר של השחקן בלבד.
drop policy if exists "se_coach_write" on public.session_effort;
create policy "se_coach_write" on public.session_effort
  for all to authenticated
  using (coach_id = auth.uid() and source = 'coach')
  with check (
    coach_id = auth.uid() and source = 'coach' and roster_id is not null
    -- שורת הסגל חייבת להיות של המאמן הכותב (כמו בהקשחה 3.8 לצד השחקן)
    and exists (select 1 from public.team_players tp
                 where tp.id = session_effort.roster_id and tp.coach_id = auth.uid())
  );

create index if not exists session_effort_roster_idx on public.session_effort (roster_id, session_date desc);

-- ---------- 2. יעדים אישיים (player_goals) ----------
alter table public.player_goals add column if not exists roster_id uuid references public.team_players(id) on delete cascade;
create index if not exists player_goals_roster_idx on public.player_goals (coach_id, roster_id, period);

-- ⚠ מדיניות הקריאה של השחקנים: «player_id ריק + team מלא» היה הסימן
-- ליעד קבוצתי (המיקוד). יעד אישי שנרשם לשורת סגל הוא גם player_id ריק —
-- ובלי התיקון הזה כל שחקני הקבוצה היו רואים אותו כיעד קבוצתי ברגע שצד
-- השחקן יחזור. roster_id is null מבדיל ביניהם.
drop policy if exists "pg_player_read" on public.player_goals;
create policy "pg_player_read" on public.player_goals
  for select to authenticated using (
    player_id = auth.uid()
    or (player_id is null and roster_id is null and team is not null and public.is_team_member(coach_id, team))
  );

-- ---------- 3. משוב אישי (player_feedback) ----------
alter table public.player_feedback add column if not exists roster_id uuid references public.team_players(id) on delete cascade;
alter table public.player_feedback alter column player_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fb_who_chk') then
    alter table public.player_feedback add constraint fb_who_chk
      check (player_id is not null or roster_id is not null) not valid;
  end if;
end $$;

create index if not exists fb_roster_idx on public.player_feedback (roster_id, created_at desc);

-- ---------- 4. «עמד ביעד» באימון (session_goal_marks) ----------
-- עד היום: השחקן סימן בעצמו בסיכום האימון. מעכשיו המאמן מסמן בסקירה.
alter table public.session_goal_marks add column if not exists roster_id uuid references public.team_players(id) on delete cascade;
alter table public.session_goal_marks alter column player_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sgm_who_chk') then
    alter table public.session_goal_marks add constraint sgm_who_chk
      check (player_id is not null or roster_id is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sgm_session_goal_roster_uq') then
    alter table public.session_goal_marks add constraint sgm_session_goal_roster_uq unique (session_id, goal_id, roster_id);
  end if;
end $$;

drop policy if exists "sgm_coach_write" on public.session_goal_marks;
create policy "sgm_coach_write" on public.session_goal_marks
  for all to authenticated
  using (coach_id = auth.uid() and roster_id is not null)
  with check (
    coach_id = auth.uid() and roster_id is not null
    -- שורת הסגל והיעד חייבים להיות של המאמן הכותב
    and exists (select 1 from public.team_players tp
                 where tp.id = session_goal_marks.roster_id and tp.coach_id = auth.uid())
    and exists (select 1 from public.player_goals g
                 where g.id = session_goal_marks.goal_id and g.coach_id = auth.uid())
  );

-- ---------- 5. משימות (player_assignments) ----------
-- משימה אישית לשורת סגל. משימה קבוצתית (team מלא) נשארת כפי שהיא.
-- שורה עם roster_id בלבד (player_id ריק, team ריק) אינה נראית לאף שחקן —
-- assign_player_read דורש player_id=auth.uid() או team מלא.
alter table public.player_assignments add column if not exists roster_id uuid references public.team_players(id) on delete cascade;
create index if not exists assign_roster_idx on public.player_assignments (roster_id, created_at desc);

-- ⚠ מדיניות ה-insert מ-supabase_personal_training_4_8.sql (assign_coach_write)
-- מתירה רק «לכל הקבוצה» (team מלא) או «לשחקן עם חשבון». שורה של
-- שורת-סגל-בלבד (player_id ריק, team ריק, roster_id מלא) לא עברה בה —
-- וכל משימה לשחקן בודד נכשלה ב-42501. כאן מוסיפים את הסעיף השלישי.
-- מוגן: רץ רק אם המדיניות של 4.8 קיימת; במסד שלא הריץ אותה,
-- assign_coach_all הישנה (coach_id = auth.uid()) כבר מתירה את השורה.
do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'player_assignments'
                and policyname = 'assign_coach_write') then
    execute 'drop policy "assign_coach_write" on public.player_assignments';
    execute $p$
      create policy "assign_coach_write" on public.player_assignments
        for insert to authenticated
        with check (
          coach_id = auth.uid()
          and (
            -- שיגור לכל הקבוצה
            (player_id is null and team is not null)
            -- או לשחקן יחיד עם חשבון: בסגל שלי, או מתאמן אישי פעיל
            or (player_id is not null and (
                  exists (select 1 from public.team_players tp
                           where tp.coach_id = auth.uid() and tp.player_id = player_assignments.player_id)
                  or public.personal_bond_active(auth.uid(), player_assignments.player_id)
               ))
            -- 22.8 — משימה לשורת סגל שלי (צד המאמן בלבד, בלי חשבון)
            or (player_id is null and roster_id is not null
                and exists (select 1 from public.team_players tp
                             where tp.id = player_assignments.roster_id and tp.coach_id = auth.uid()))
          )
        )
    $p$;
  end if;
end $$;

-- ---------- 6. «ביצע» שהמאמן מסמן (assignment_coach_marks) ----------
-- טבלה חדשה ולא עמודה ב-assignment_completions: שם המפתח הראשי הוא
-- (assignment_id, player_id) עם player_id חובה — שינוי שלו בפרוד חי הוא
-- סיכון מיותר. כאן: סימון אחד של המאמן לכל משימה לכל שורת סגל.
-- done_at ריק + progress_value > 0 = בתהליך (יעד מספרי); done_at מלא = בוצע.
create table if not exists public.assignment_coach_marks (
  assignment_id  uuid not null references public.player_assignments(id) on delete cascade,
  roster_id      uuid not null references public.team_players(id) on delete cascade,
  coach_id       uuid not null references public.profiles(id) on delete cascade,
  done_at        timestamptz,
  progress_value numeric not null default 0 check (progress_value >= 0),
  updated_at     timestamptz not null default now(),
  primary key (assignment_id, roster_id)
);
alter table public.assignment_coach_marks enable row level security;

drop policy if exists "acm_coach_all" on public.assignment_coach_marks;
create policy "acm_coach_all" on public.assignment_coach_marks
  for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create index if not exists acm_roster_idx on public.assignment_coach_marks (roster_id, done_at desc);

-- ---------- רישום + רענון ----------
do $mig$ begin perform public.mark_migration('supabase_coach_only_22_8.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';

-- =====================================================================
-- ביטול (אם צריך): מיידי, ולא מוחק נתונים.
-- המאמן פשוט לא יוכל יותר לכתוב עומס/סימוני יעד, והטבלה החדשה תוסר.
-- העמודות roster_id נשארות (ריקות או מלאות) — הן לא מפריעות לאף מסך.
--
--   drop policy if exists "se_coach_write"  on public.session_effort;
--   drop policy if exists "sgm_coach_write" on public.session_goal_marks;
--   drop table  if exists public.assignment_coach_marks;
--   notify pgrst, 'reload schema';
-- (את assign_coach_write המקורית מחזירים בהרצה חוזרת של
--  supabase_personal_training_4_8.sql — גם הוא בטוח להרצה חוזרת.)
-- =====================================================================
