-- =====================================================================
-- CourtSide — חיבור חשבון שחקן לשורת הסגל: מיזוג אוטומטי · 3.9.2026
-- =====================================================================
-- מה קרה: צד השחקן נפתח לפיילוט (PLAYER_SIDE=true), אבל המאמן ממשיך
-- לרשום על **שורת הסגל** (team_players.id → roster_id) — עם חשבון לשחקן
-- או בלי (ראו COACH_LOGS ב-src/flags.js). כשילד מתחבר בקוד, האפליקציה
-- מחברת את החשבון שלו לשורה שכבר קיימת בסגל (team_players.player_id).
--
-- הבעיה: היעדים והמשימות שהמאמן כבר רשם על השורה (roster_id בלבד) לא
-- נראים לשחקן — הוא קורא לפי player_id.
--
-- הפתרון: טריגר קטן על team_players. ברגע ש-player_id מתמלא, כל יעד
-- (player_goals) וכל משימה אישית (player_assignments, לא קבוצתית) שיושבים
-- על השורה בלי player_id — מקבלים אותו. אם המאמן מנתק (player_id חוזר
-- להיות ריק) — מחזירים לאחור. בנוסף: השלמה חד-פעמית לשורות שכבר
-- מקושרות היום.
--
-- ⚠ מה **לא** נוגעים בו, בכוונה:
--   • session_effort / session_goal_marks — שורות המאמן שם נשארות עם
--     player_id ריק לתמיד (unique של הדירוג העצמי; ראו 22.8).
--   • player_feedback — לא ממזגים קדימה: ההערות בסקירת האימון הן פרטיות
--     למאמן («רק אתה רואה»). משוב מפורש לשחקן נכתב ממילא עם player_id.
--     חריג אחד (סעיף 4): הערות סקירה שנכתבו 22.8–3.9 נשמרו בטעות **גם** עם
--     player_id — מנקים אותו כדי שההערה תהיה פרטית באמת, כמו שהתווית מבטיחה.
--
-- 3.9 — חיבור מחדש לחשבון אחר: הענף הראשון תופס גם roster שהוחלף לו החשבון
-- (old.player_id ≠ new.player_id) — שורות שהוצמדו לחשבון הישן עוברות לחדש,
-- כדי שהיעדים/המשימות לא יישארו גלויים לחשבון הקודם.
--
-- בטוח להרצה חוזרת. לא מוחק כלום. הרץ אחרי supabase_coach_only_22_8.sql (#44).
-- האפליקציה עובדת גם בלי הקובץ הזה — השחקן פשוט לא יראה יעדים/משימות
-- שנרשמו על השורה לפני שהתחבר.
-- =====================================================================

-- ---------- 1. הפונקציה ----------
-- security definer: רצה בהרשאות הבעלים, כי המאמן שמעדכן את הסגל אינו
-- בהכרח רשאי לעדכן player_goals/player_assignments דרך המדיניות (RLS).
create or replace function public.roster_link_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- חובר חשבון (ריק → מלא, או הוחלף לחשבון אחר): שורות בלי player_id — וגם
  -- שורות שעוד מצביעות על החשבון הישן (3.9) — מקבלות את החדש
  if new.player_id is not null and (old.player_id is null or old.player_id is distinct from new.player_id) then
    begin
      update public.player_goals
         set player_id = new.player_id
       where roster_id = new.id and (player_id is null or player_id = old.player_id);
    exception when undefined_column or undefined_table then null; end;
    begin
      update public.player_assignments
         set player_id = new.player_id
       where roster_id = new.id and (player_id is null or player_id = old.player_id) and team is null;
    exception when undefined_column or undefined_table then null; end;
  -- נותק (מלא → ריק): מחזירים לאחור רק את מה שהצביע על אותו חשבון
  elsif new.player_id is null and old.player_id is not null then
    begin
      update public.player_goals
         set player_id = null
       where roster_id = new.id and player_id = old.player_id;
    exception when undefined_column or undefined_table then null; end;
    begin
      update public.player_assignments
         set player_id = null
       where roster_id = new.id and player_id = old.player_id and team is null;
    exception when undefined_column or undefined_table then null; end;
  end if;
  return new;
end
$$;

revoke all on function public.roster_link_merge() from public;
revoke all on function public.roster_link_merge() from anon;

-- ---------- 2. הטריגר ----------
-- נוצר רק אם העמודה player_id קיימת (מסד ישן בלי המיגרציה של השחקנים — דילוג בשקט)
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'team_players' and column_name = 'player_id') then
    execute 'drop trigger if exists roster_link_merge_trg on public.team_players';
    execute 'create trigger roster_link_merge_trg
               after update of player_id on public.team_players
               for each row execute function public.roster_link_merge()';
  else
    raise notice 'CourtSide: team_players.player_id לא קיימת — הטריגר לא נוצר.';
  end if;
end $$;

-- ---------- 3. השלמה חד-פעמית לשורות שכבר מקושרות היום ----------
-- אותו כלל בדיוק, על כל השורות שכבר יש להן player_id.
do $$
begin
  update public.player_goals g
     set player_id = tp.player_id
    from public.team_players tp
   where g.roster_id = tp.id and g.player_id is null and tp.player_id is not null;
  update public.player_assignments a
     set player_id = tp.player_id
    from public.team_players tp
   where a.roster_id = tp.id and a.player_id is null and a.team is null and tp.player_id is not null;
exception when undefined_column or undefined_table then
  raise notice 'CourtSide: roster_id/player_id חסרות — ההשלמה דולגה (הרץ קודם את supabase_coach_only_22_8.sql).';
end $$;

-- ---------- 4. חד-פעמי: הערות הסקירה 22.8–3.9 חוזרות להיות פרטיות ----------
-- 3.9 — בתקופה שבה צד השחקן היה סגור (22.8–3.9), הערת הסקירה של שחקן מקושר
-- נשמרה **גם** עם player_id — ומהיום, כשצד השחקן פתוח, הוא קורא אותה
-- (fb_player_read) למרות שהתווית מבטיחה «רק אתה רואה». מנקים את player_id
-- רק בשורות האלה: הערת סקירה תמיד נושאת session_id, ומשוב מפורש
-- (Teams / PlayerCard) — אף פעם לא, ולכן משוב שנשלח בכוונה לא נפגע.
-- הקוד עושה את זה מעכשיו בכל עריכה; הבלוק סוגר את מה שכבר נכתב.
do $$
begin
  update public.player_feedback
     set player_id = null
   where session_id is not null and roster_id is not null and player_id is not null
     and created_at >= '2026-08-22';
exception when undefined_column or undefined_table then
  raise notice 'CourtSide: player_feedback בלי roster_id/session_id — הניקוי דולג.';
end $$;

-- ---------- רישום + רענון ----------
do $mig$ begin perform public.mark_migration('supabase_roster_link_merge_3_9.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';

-- =====================================================================
-- ביטול (אם צריך): מיידי, ולא מוחק נתונים. מה שכבר מוזג נשאר ממוזג —
-- וזה בסדר: יעד עם שני המזהים נקרא גם על ידי המאמן (roster_id) וגם על
-- ידי השחקן (player_id).
--
--   drop trigger if exists roster_link_merge_trg on public.team_players;
--   drop function if exists public.roster_link_merge();
--   notify pgrst, 'reload schema';
-- =====================================================================
