-- =====================================================================
-- CourtSide — סגירת חדר השחקנים הארצי  ·  19.8.2026
-- =====================================================================
-- ההחלטה, בשפה של מסך:
--   היה במוצר חדר אחד משותף לכל השחקנים בארץ — ילדים ממועדונים שונים
--   שאין ביניהם מאמן משותף, בטקסט חופשי, בלי מבוגר שמפקח. הבעלים החליט
--   להסיר אותו. המסך נמחק מהקוד (src/PlayerCommunity.jsx), והקובץ הזה
--   סוגר את הדלת בשרת.
--
-- למה צריך גם מסד ולא מספיק להסיר את המסך:
--   אפליקציית האנדרואיד ארוזה עם הקוד **בתוך המכשיר** (Capacitor, בלי
--   server.url). מי שהתקין אותה ימשיך להריץ את החדר הישן גם אחרי
--   שהאתר יתעדכן — ולשלוח הודעות. חסימה אמיתית חייבת להיות בשרת.
--
-- מה הקובץ עושה, ורק זה:
--   מדיניות RESTRICTIVE אחת שחוסמת **הוספת הודעות חדשות** לטבלה.
--
-- מה הוא **לא** עושה:
--   · לא מוחק אף הודעה קיימת ולא מוחק את הטבלה.
--   · לא נוגע בקריאה, במחיקה, ולא במדיניות הקיימות — RESTRICTIVE
--     מתווספת ב-AND למה שיש, ולכן היא לא דורסת כלום.
--   · לא נוגע בצ'אט הקבוצה (team_messages) ולא בהודעות הפרטיות מול
--     המאמן (messages) — שניהם נשארים, וזו הייתה החלטה מפורשת.
--
-- בטוח להרצה חוזרת. הרצה: Supabase → SQL Editor → הדבקה → Run.
-- ⚠ סדר: קודם שהאתר החדש יעלה, ואז הקובץ. אם תריץ קודם, שחקן שנמצא
--    באמצע שיחה יראה «שליחת ההודעה נכשלה» באדום.
--
-- ביטול מלא (מחזיר את החדר לשרת; המסך עצמו חוזר ב-revert של הקומיט):
--    drop policy if exists "pmsg_room_closed" on public.player_messages;
-- =====================================================================

do $rq$
begin
  if to_regclass('public.player_messages') is not null then
    execute 'drop policy if exists "pmsg_room_closed" on public.player_messages';
    -- RESTRICTIVE: מתווספת ב-AND לכל מדיניות ההוספה הקיימות. גם אם
    -- pmsg_insert_own_player עדיין מתירה — הכתיבה נחסמת כאן.
    execute 'create policy "pmsg_room_closed" on public.player_messages
               as restrictive for insert to authenticated
               with check (false)';
  end if;
end $rq$;


-- רישום ביומן ההרצות + רענון הסכימה
do $$
begin
  begin
    perform public.mark_migration('supabase_player_room_off_19_8.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
--  אימות אחרי ההרצה — שתי בדיקות שלא משנות כלום:
--
--  1. המדיניות קיימת:
--       select policyname, permissive, cmd
--         from pg_policies
--        where tablename = 'player_messages' and policyname = 'pmsg_room_closed';
--       -- שורה אחת, permissive = 'RESTRICTIVE', cmd = 'INSERT'
--
--  2. שום הודעה לא נמחקה (הרץ לפני ואחרי — אותו מספר):
--       select count(*) from public.player_messages;
-- =====================================================================
