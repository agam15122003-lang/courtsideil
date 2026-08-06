-- =====================================================================
-- CourtSide — לוח הלו"ז השבועי (מסך מחשב)  ·  4.8.2026
--
-- שלושה דברים, ואף טבלה חדשה:
--
--  1. ⚠ סגירת ערוץ מבוגר→קטין. «זימון לפגישה» נועד למאמן אחר, אבל
--     המדיניות בדקה רק `auth.uid() = from_coach and to_coach <> from_coach`
--     (supabase_launch_migration.sql:80) — כלומר שום דבר לא מנע לשלוח
--     זימון ל**שחקן**. מדיניות הקריאה של profiles מחזירה למאמן גם את
--     השחקנים שלו (supabase_rls_hardening_3_8.sql:262 — `shares_team_with`),
--     ולכן בורר הנמענים במסך הציג קטינים כנמענים אפשריים, והזימון היה
--     נוחת ביומן של הילד. זה בדיוק סוג הערוץ שנסגר בהודעות הפרטיות.
--     הלקוח מסנן `role = 'coach'` מעכשיו, אבל **הלקוח אינו הגנה** — מי
--     שפונה לשרת ישירות עוקף אותו. השער האמיתי הוא כאן.
--
--  2. עמודת `location` ל-schedule_entries ול-coach_meetings. היא כבר
--     נקראת בקוד (Schedule.jsx:153, 808) ותמיד חוזרת undefined, כי היא
--     מעולם לא נוצרה. team_practice_slots ו-team_games כן מחזיקות מקום.
--
--  3. אינדקס ל-schedule_entries. לא היה בה אף אחד, וכל טעינת שבוע
--     סורקת את הטבלה כולה.
--
-- אידמפוטנטי — בטוח להרצה חוזרת.
-- דורש: supabase_launch_migration.sql, supabase_rls_hardening_3_8.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) is_coach_id — «האם המזהה הזה שייך למאמן»
--
-- קיימת public.is_coach() בלי פרמטר (על המשתמש הנוכחי); כאן צריך לשאול
-- על **מישהו אחר**, ולכן פונקציה נפרדת.
--
-- SECURITY DEFINER במכוון: המדיניות צריכה לקרוא את שורת ה-profiles של
-- הנמען כדי לאכוף, וקריאה רגילה הייתה כפופה ל-RLS של profiles ונכנסת
-- לרקורסיה. ⚠ היא חושפת בוליאני אחד בלבד («מאמן / לא מאמן») ואינה
-- מחזירה שום נתון אישי.
-- ---------------------------------------------------------------------
create or replace function public.is_coach_id(_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = _id and p.role = 'coach'
  );
$$;

revoke all on function public.is_coach_id(uuid) from public, anon;
grant execute on function public.is_coach_id(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2) השער: זימון לפגישה רק בין מאמנים
-- ---------------------------------------------------------------------
drop policy if exists "coach_meetings_insert_from" on public.coach_meetings;
create policy "coach_meetings_insert_from" on public.coach_meetings for insert
  to authenticated
  with check (
    auth.uid() = from_coach
    and to_coach <> from_coach
    -- הנמען חייב להיות מאמן. בלי זה אפשר לזמן קטין.
    and public.is_coach_id(to_coach)
    -- והשולח חייב להיות מאמן בעצמו.
    and public.is_coach_id(auth.uid())
  );

-- ---------------------------------------------------------------------
-- 3) location — נקראת בקוד מזה זמן, מעולם לא נוצרה
-- ---------------------------------------------------------------------
alter table public.schedule_entries add column if not exists location text;
alter table public.coach_meetings   add column if not exists location text;

-- ---------------------------------------------------------------------
-- 4) אינדקס — טעינת השבוע סורקת לפי יוצר+תאריך
-- ---------------------------------------------------------------------
create index if not exists schedule_entries_creator_date_idx
  on public.schedule_entries (created_by, date);

-- ---------------------------------------------------------------------
-- רישום
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_schedule_board_4_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';

-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) העמודות קיימות:
--       select column_name from information_schema.columns
--        where table_schema='public' and table_name='schedule_entries'
--          and column_name='location';
--
--  2) השער עובד — מחשבון מאמן, מול מזהה של שחקן שלו:
--       insert into public.coach_meetings (from_coach, to_coach, date, topic)
--       values (auth.uid(), '<player-uuid>', current_date, 'בדיקה');
--     חייב להיכשל על new row violates row-level security policy.
--     אותה פקודה מול מזהה של מאמן אחר — חייבת לעבור.
--
--  3) האפליקציה עובדת גם בלי הקובץ הזה: הקוד בודק את קיום העמודה
--     ומסתיר את שדה המקום כשהיא חסרה, ומנקה אותה בכתיבה אם השרת מסרב.
-- =====================================================================
