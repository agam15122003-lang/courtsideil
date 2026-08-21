-- =====================================================================
-- CourtSide — סגירת האתגר השבועי והעלאות הווידאו  ·  19.8.2026
-- =====================================================================
-- ההחלטה, בשפה של מסך:
--   האתגר השבועי היה המקום **היחיד** במוצר שבו ילד מצלם את עצמו, מעלה
--   קליפ, והקליפ מוצג לשחקנים אחרים ואף מיוצא לפרסום חיצוני. הבעלים
--   החליט להסיר אותו. המסכים נמחקו מהקוד (BwChallenge / ChallengeCard /
--   ChallengeFeed / שלוש לשוניות הניהול), והקובץ הזה סוגר את הדלתות
--   בשרת: הכתיבה לטבלה, ההעלאה לאחסון, והצפייה בקליפים הקיימים.
--
-- למה צריך גם מסד: אפליקציית אנדרואיד מותקנת ארוזה עם הקוד בתוך המכשיר
--   וממשיכה להריץ את המסך הישן. בלי הקובץ הזה אפשר להמשיך להגיש.
--
-- מה הקובץ עושה:
--   1. שולל הרשאת INSERT ו-UPDATE על game_challenge_submissions.
--   2. סוגר את **ההעלאה** לתיקיית challenges/ באחסון.
--   3. סוגר את **הצפייה** בקליפים הקיימים, ואת שתי פונקציות הקריאה
--      (הפיד והטופ-5) — ראו §0.
--
-- §0 למה גם צפייה, וזה תיקון לגרסה הראשונה של הקובץ:
--   הגרסה הראשונה סגרה כתיבה בלבד והשאירה במפורש את הקריאה. זו הייתה
--   טעות: המטרה של ההסרה היא שקליפים של ילדים לא יהיו חשופים, ובלי
--   סגירת הקריאה כל משתמש מחובר יכול היה להמשיך למנות את ההגשות דרך
--   game_challenge_feed ולמשוך קישור חתום לכל קליפ — גם בלי מסך, עם
--   קריאה ישירה ל-API. המסכים ירדו; החשיפה נשארה. מהיום שניהם סגורים.
--   **הקבצים עצמם לא נמחקו** — הם באחסון ונגישים לך מלוח הבקרה.
--
-- ⚠ על הטבלה — שלילת הרשאה ולא מדיניות RESTRICTIVE:
--   מדיניות restrictive עם `for all` הייתה חוסמת גם SELECT ו-DELETE
--   ושוברת את game_delete_my_submission ואת הקריאה של האדמין. שלילת
--   INSERT/UPDATE בלבד מדויקת יותר.
--
-- ⚠ על האחסון — גם מחיקה וגם חסימה, ובכוונה:
--   מחיקה לבדה אינה מחזיקה, כי supabase_game_media_12_8.sql יוצר את
--   המדיניות מחדש בכל הרצה. חסימה לבדה אינה מחזיקה, כי לולאת הניקוי
--   ב-supabase_rls_hardening_3_8.sql מוחקת מדיניות **כתיבה** שמזכירה
--   media ואינה מזכירה auth.uid(). לכן: מוחקים את המקורית, ומוסיפים
--   חוסמת שהביטוי שלה מכיל auth.uid() — ושורדת את שתי הלולאות.
--
-- מה הקובץ **לא** עושה:
--   · לא מוחק שום אתגר, שום הגשה ושום קליפ. הקבצים נשארים באחסון.
--   · לא מוחק את מדיניות הקריאה הקיימת ולא את game_clip_visible — הוא
--     מוסיף מעליהן מדיניות חוסמת, כדי שהביטול יהיה שורה אחת.
--   · לא נוגע בחידונים, בדו-קרבות, בטבלת הנקודות או בפנקס — כולם
--     יושבים ב-supabase_game_core_12_8.sql ולא נגעתי בו.
--   · לא מוחק נקודות שנצברו באתגר. הן נשארות בפנקס.
--
-- ⚠ סדר הפעולות — ארבעה שלבים, ושניים מהם לפני שהאתר עולה:
--   1. **לפני הפריסה**, בעוד מסך הניהול קיים: להכריז על אתגר פתוח.
--      (בגרסה הראשונה של הקובץ הסדר הזה סתר את עצמו — הוא ביקש להכריז
--       «מהמסך» אחרי פריסה שמוחקת את המסך.)
--   2. **לפני הפריסה**: לבדוק משימות מתוזמנות שקוראות לפונקציות האתגר —
--        select jobname, schedule, command from cron.job;
--      ולבטל מה שרלוונטי ב-select cron.unschedule('<שם>');
--      (אם cron.job לא קיים — אין משימות מתוזמנות, אפשר להמשיך.)
--   3. לפרוס את האתר החדש.
--   4. ואז להריץ את הקובץ הזה.
--
-- בטוח להרצה חוזרת. הרצה: Supabase → SQL Editor → הדבקה → Run.
--
-- ביטול מלא (מחזיר את השרת; המסכים חוזרים ב-revert של הקומיט):
--    grant insert, update on public.game_challenge_submissions to authenticated;
--    grant execute on function public.game_challenge_feed(uuid)  to authenticated;
--    grant execute on function public.game_challenge_top5(uuid)  to authenticated;
--    drop policy if exists "media_challenges_no_upload" on storage.objects;
--    drop policy if exists "media_challenges_no_read"   on storage.objects;
--    ואז להריץ שוב את supabase_game_media_12_8.sql (מחזיר את מדיניות ההעלאה).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) הטבלה: אין יותר הגשות חדשות ואין עדכון הגשה קיימת
-- ---------------------------------------------------------------------
do $rq$
begin
  if to_regclass('public.game_challenge_submissions') is not null then
    -- שני התפקידים, כמו בכל שאר גל עולם המשחק — כדי שהרשאה לא תתחבא
    -- מאחורי anon.
    revoke insert, update on public.game_challenge_submissions from anon, authenticated;
  end if;
end $rq$;


-- ---------------------------------------------------------------------
-- 2) האחסון: אין יותר העלאת קליפים לתיקיית challenges/
--    עטוף ב-exception: על storage.objects נדרשת בעלות, ובחלק
--    מהפרויקטים ההרצה מהעורך אינה מורשית. כישלון כאן לא יפיל את הקובץ
--    ולא יבטל את סעיף 1 — אבל **הוא כן משאיר את דלת ההעלאה פתוחה**,
--    ולכן חובה לאמת בבדיקה 2 שלמטה ולא להניח שזה עבד.
-- ---------------------------------------------------------------------
do $st$
begin
  execute 'drop policy if exists "media_insert_challenges" on storage.objects';

  -- ⚠ מחיקה לבדה אינה מחזיקה: supabase_game_media_12_8.sql יוצר את
  --   המדיניות הזו מחדש בכל הרצה. לכן מוסיפים גם חוסמת שתשרוד גם הרצה
  --   חוזרת שלו וגם את לולאת הניקוי ב-hardening_3_8 — הלולאה מוחקת
  --   מדיניות כתיבה שמזכירה media **ואינה מזכירה** auth.uid(), ולכן
  --   הביטוי כאן מכיל auth.uid() בכוונה ולא כקישוט.
  execute 'drop policy if exists "media_challenges_no_upload" on storage.objects';
  execute $pol$
    create policy "media_challenges_no_upload" on storage.objects
      as restrictive for insert to authenticated
      with check (
        bucket_id <> 'media'
        or (storage.foldername(name))[1] <> 'challenges'
        or auth.uid() is null
      )
  $pol$;

  -- הצפייה בקליפים הקיימים. מדיניות SELECT — לולאת הניקוי מסננת
  -- cmd in ('INSERT','UPDATE','DELETE','ALL') ולכן לעולם לא נוגעת בה.
  execute 'drop policy if exists "media_challenges_no_read" on storage.objects';
  execute $pol$
    create policy "media_challenges_no_read" on storage.objects
      as restrictive for select to authenticated
      using (
        bucket_id <> 'media'
        or (storage.foldername(name))[1] <> 'challenges'
      )
  $pol$;
exception when others then
  raise notice 'מדיניות האחסון לא עודכנה: %', sqlerrm;
end $st$;


-- ---------------------------------------------------------------------
-- 2ב) שתי פונקציות הקריאה של האתגר — אין יותר מסך שקורא להן, והן היו
--     הדרך למנות הגשות של ילדים ולהגיע מהן לקליפ.
-- ---------------------------------------------------------------------
do $fn$
begin
  if to_regprocedure('public.game_challenge_feed(uuid)') is not null then
    revoke execute on function public.game_challenge_feed(uuid) from anon, authenticated;
  end if;
  if to_regprocedure('public.game_challenge_top5(uuid)') is not null then
    revoke execute on function public.game_challenge_top5(uuid) from anon, authenticated;
  end if;
end $fn$;


-- ---------------------------------------------------------------------
-- 3) רישום ביומן ההרצות + רענון הסכימה
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.mark_migration('supabase_game_challenge_off_19_8.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
--  אימות אחרי ההרצה — שלוש בדיקות, אף אחת לא משנה נתונים:
--
--  1. אין יותר הרשאת כתיבה על ההגשות:
--       select grantee, privilege_type
--         from information_schema.role_table_grants
--        where table_schema = 'public'
--          and table_name = 'game_challenge_submissions'
--          and grantee in ('anon', 'authenticated');
--       -- אמור לחזור **SELECT בלבד**. (DELETE כבר נשלל ב-12.8 בכוונה,
--       --  כדי שמחיקה תעבור רק דרך game_delete_my_submission — אל תצפה
--       --  לראות אותו.) אם מופיע INSERT או UPDATE — סעיף 1 לא עבר.
--
--  2. שלוש מדיניות האחסון — **הבדיקה החשובה ביותר**, כי סעיף 2 עטוף
--     ב-exception ויכול להיכשל בשקט:
--       select policyname, cmd, permissive from pg_policies
--        where schemaname = 'storage' and tablename = 'objects'
--          and policyname like '%challenges%' order by 1;
--       -- אמורות להופיע media_challenges_no_upload ו-media_challenges_no_read
--       --   (שתיהן RESTRICTIVE), ו-media_insert_challenges **לא אמורה**.
--       -- אם משהו חסר — למחוק/להוסיף ידנית ב-Storage → Policies.
--
--  3. בזמן שאתה שם — בדיקה של תקלה ותיקה שאינה קשורה לקובץ הזה:
--       select policyname from pg_policies
--        where schemaname = 'storage' and tablename = 'objects'
--          and policyname = 'media_no_player_avatars';
--       -- אם חזר ריק: לולאת הניקוי ב-hardening_3_8 מחקה אותה בשקט
--       --   (הביטוי שלה מזכיר media ואינו מזכיר auth.uid()). התיקון:
--       --   להריץ שוב את supabase_no_player_avatars.sql.
--
--  4. שום נתון לא נמחק (הרץ לפני ואחרי — אותם מספרים):
--       select count(*) from public.game_challenges;
--       select count(*) from public.game_challenge_submissions;
-- =====================================================================
