-- =====================================================================
-- CourtSide — מסך מנהל המועדון: לראות את הסגל של המאמנים בעץ · 19.8.2026
-- =====================================================================
-- הבעיה שהקובץ הזה פותר, בשפה של מסך:
--   מ-18.8 מנהל מועדון כבר רשאי לראות **תיקים** של מאמנים שצורפו לעץ
--   (dossier_can_see → dossier_manager_sees). אבל המסך מגיע לתיק דרך
--   הסגל: קבוצה → שחקן → תיק. ועל team_players אין מדיניות שמתירה
--   למנהל לראות את הסגל של מאמן אחר — ולכן המסך שלו יצא ריק.
--
-- מה נוסף כאן, ורק זה:
--   1. club_manager_sees_coach(uuid) — «האם אני מנהל של המועדון שהמאמן
--      הזה צורף אליו». אותו היגיון בדיוק של dossier_manager_sees, אבל
--      על מאמן ולא על תיק.
--   2. מדיניות select נוספת על team_players. מדיניות **נוספת** — היא
--      מתווספת ב-OR לקיימות ולא מחליפה אותן.
--
-- הכלל של הבעלים נשמר מילה במילה:
--   · המנהל רואה **רק** מאמנים שצורפו לעץ (club_roles.role='coach').
--     מאמן שלא צורף — הסגל והתיקים שלו פרטיים לחלוטין.
--   · קריאה בלבד. הדירוג הוא של מי שמאמן: dossier_can_edit לא נגעתי בו,
--     והמנהל לא יכול לכתוב ערך, מדידה או רשומה בתיק של מאמן אחר.
--   · שחקנים והורים — לא רואים דבר; אדמין המערכת — גם לא.
--
-- בטוח להרצה חוזרת. הרצה: Supabase → SQL Editor → הדבקה → Run.
-- ביטול: drop policy roster_club_manager_read on public.team_players;
--        (המסך יחזור להיות ריק למנהל, ושום נתון לא נפגע)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) «האם אני מנהל של המועדון שהמאמן הזה צורף אליו»
--    security definer: המדיניות על team_players לא יכולה לקרוא את
--    club_roles ישירות בלי להסתבך בהרשאות, ובטבלאות תפקידים קריאה
--    ישירה כזו היא גם המקור לרקורסיה («infinite recursion in policy»).
-- ---------------------------------------------------------------------
create or replace function public.club_manager_sees_coach(p_coach uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and p_coach is not null and exists (
    select 1
      from public.club_roles mgr
      join public.club_roles crd
        on crd.club = mgr.club
       and crd.role = 'coach'
       and crd.user_id = p_coach
     where mgr.user_id = auth.uid()
       and mgr.role in ('club_manager', 'technical_director')
  );
$$;
revoke all on function public.club_manager_sees_coach(uuid) from public;
grant execute on function public.club_manager_sees_coach(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 2) הסגל של מאמן בעץ — למנהל המועדון, לקריאה בלבד
--    שם מפורש ונפרד, כדי שאפשר יהיה להסיר אותו בלי לגעת במדיניות
--    הקיימות של המאמן והשחקן.
-- ---------------------------------------------------------------------
drop policy if exists roster_club_manager_read on public.team_players;
create policy roster_club_manager_read on public.team_players
  for select to authenticated
  using (public.club_manager_sees_coach(coach_id));


-- ---------------------------------------------------------------------
-- 3) רישום בֵּיומן ההרצות + רענון הסכימה
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.mark_migration('supabase_club_manage_19_8.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
--  אימות אחרי ההרצה:
--    select public.club_manager_sees_coach(auth.uid());   -- false (לא מנהל של עצמך)
--    select policyname from pg_policies where tablename = 'team_players';
--      -- אמורה להופיע roster_club_manager_read לצד הקיימות
--
--  מה זה נותן במסך: טאב «המועדון» → בחירת מאמן → הקבוצות והשחקנים שלו
--  → התיק, בקריאה בלבד. בלי הקובץ הזה הרשימה פשוט ריקה, והמסך אומר
--  «המסד עוד לא עודכן» במקום להיראות שבור.
-- =====================================================================
