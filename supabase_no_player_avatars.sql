-- =====================================================================
--  CourtSide — לשחקנים אין תמונת פרופיל (4.8.2026)
--
--  החלטת הבעלים: רוב השחקנים באפליקציה הם קטינים, ותמונת פנים של ילד
--  היא הפריט הרגיש ביותר במערכת כולה. במקום לבנות סביבה שכבות הגנה —
--  הסכמת הורה, bucket פרטי, קישורים חתומים — פשוט לא אוספים אותה.
--  מה שלא קיים אי אפשר לדלוף.
--
--  הקובץ עושה שלושה דברים:
--    1. מוחק את כתובות התמונה הקיימות של שחקנים
--    2. חוסם בשרת העלאה לתיקיית avatars/ מחשבון שחקן
--    3. מוחק בפועל את הקבצים הישנים מה-Storage
--
--  בממשק: הטופס כבר לא מציג העלאת תמונה לשחקן, והשמירה מאפסת את השדה.
--  בכל מקום שמוצג אווטאר יופיעו ראשי התיבות של השם — זו כבר התנהגות
--  ברירת המחדל של Avatar.jsx כשאין כתובת.
--
--  ⚠ מה זה **לא** פותר: תמונות שמאמן מעלה מהאימונים (community/ ו-drills/)
--  עדיין עלולות להראות פנים של קטינים. עליהן ממשיכות לחול הסכמות המדיה
--  (media_team / media_public) ומדיניות ה-Storage. השינוי הזה מסיר את
--  התמונה שהילד מעלה על עצמו, לא כל תמונה שבה הוא מופיע.
--
--  אידמפוטנטי — אפשר להריץ שוב בלי נזק.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) איפוס כתובות התמונה של שחקנים
--     מסמנים את הנתיבים לפני האיפוס כדי שסעיף 3 יוכל למחוק את הקבצים.
--     app.consent_writer נדרש כי הטריגר על profiles חוסם כתיבות שאינן
--     של המשתמש עצמו; כאן זו פעולת מערכת מכוונת.
-- ---------------------------------------------------------------------
create temp table if not exists _player_avatar_paths (path text) on commit drop;

do $ava$
declare v_count int;
begin
  perform set_config('app.consent_writer', 'on', true);

  insert into _player_avatar_paths (path)
  select regexp_replace(avatar_url, '^.*/object/(public|sign)/media/', '')
    from public.profiles
   where role = 'player' and avatar_url is not null and avatar_url <> '';

  update public.profiles
     set avatar_url = null,
         updated_at = now()
   where role = 'player' and avatar_url is not null and avatar_url <> '';

  get diagnostics v_count = row_count;
  perform set_config('app.consent_writer', 'off', true);

  raise notice 'אופסו % תמונות פרופיל של שחקנים', v_count;
exception when others then
  perform set_config('app.consent_writer', 'off', true);
  raise;
end $ava$;


-- ---------------------------------------------------------------------
-- 2) חסימה בשרת — שחקן לא יכול להעלות לתיקיית avatars/
--     הממשק כבר לא מציע את זה, אבל ממשק אינו אכיפה: קריאת API ישירה
--     עוקפת אותו. המדיניות היא מה שבאמת מונע.
--     RESTRICTIVE ולא PERMISSIVE — היא מתאחדת ב-AND עם מדיניות ההעלאה
--     הקיימת (supabase_rls_hardening_3_8.sql), ולכן אינה מרחיבה כלום
--     ואינה תלויה בשמה של המדיניות ההיא.
-- ---------------------------------------------------------------------
do $pol$
begin
  begin
    drop policy if exists "media_no_player_avatars" on storage.objects;
    create policy "media_no_player_avatars" on storage.objects
      as restrictive for insert to authenticated
      with check (
        bucket_id <> 'media'
        or (storage.foldername(name))[1] <> 'avatars'
        or not public.is_player()
      );
    raise notice 'נוצרה מדיניות media_no_player_avatars';
  exception when insufficient_privilege then
    raise warning 'אין הרשאה ליצור מדיניות על storage.objects מה-SQL Editor.';
    raise warning 'צור ידנית ב-Dashboard → Storage → Policies:';
    raise warning '  שם: media_no_player_avatars | פעולה: INSERT | תפקיד: authenticated';
    raise warning '  סוג: RESTRICTIVE';
    raise warning '  WITH CHECK: bucket_id <> ''media'' or (storage.foldername(name))[1] <> ''avatars'' or not public.is_player()';
  end;
end $pol$;


-- ---------------------------------------------------------------------
-- 3) מחיקת הקבצים עצמם
--     איפוס העמודה בסעיף 1 מנתק את הקישור, אבל הקובץ נשאר בכתובת
--     שלו — וכל עוד ה-bucket ציבורי, הוא נגיש לכל האינטרנט. מחיקת
--     השורה מ-storage.objects היא מה שמוחק את הקובץ בפועל.
--     נמחקת גם כל תיקיית avatars/<uid> של שחקן, גם אם לא הופיעה
--     ב-profiles (קבצים ישנים שנדרסו והכתובת שלהם כבר לא נשמרה).
-- ---------------------------------------------------------------------
do $del$
declare v_count int := 0;
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects לא נגישה — דלג';
    return;
  end if;

  begin
    delete from storage.objects o
     where o.bucket_id = 'media'
       and (storage.foldername(o.name))[1] = 'avatars'
       and exists (
         select 1 from public.profiles p
          where p.role = 'player'
            and p.id::text = (storage.foldername(o.name))[2]
       );
    get diagnostics v_count = row_count;
    raise notice 'נמחקו % קבצי תמונת פרופיל של שחקנים מה-Storage', v_count;
  exception when insufficient_privilege then
    raise warning 'אין הרשאה למחוק מ-storage.objects מה-SQL Editor.';
    raise warning 'מחק ידנית ב-Dashboard → Storage → media → avatars/, את התיקיות של השחקנים.';
    raise warning 'רשימת המזהים:';
    declare r record;
    begin
      for r in select id from public.profiles where role = 'player' loop
        raise warning '  avatars/%', r.id;
      end loop;
    end;
  end;
end $del$;


-- ---------------------------------------------------------------------
-- 4) רישום בלדג'ר + רענון סכימה
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_no_player_avatars.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקות עשן
--
--  1) לא נשארה אף תמונת שחקן במסד — אמור להחזיר 0:
--       select count(*) from public.profiles
--        where role = 'player' and avatar_url is not null and avatar_url <> '';
--
--  2) לא נשאר אף קובץ — אמור להחזיר 0:
--       select count(*) from storage.objects o
--        where o.bucket_id = 'media'
--          and (storage.foldername(o.name))[1] = 'avatars'
--          and exists (select 1 from public.profiles p
--                       where p.role = 'player'
--                         and p.id::text = (storage.foldername(o.name))[2]);
--
--  3) החסימה קיימת:
--       select policyname, permissive from pg_policies
--        where tablename = 'objects' and policyname = 'media_no_player_avatars';
--     צפוי: שורה אחת עם permissive = 'RESTRICTIVE'.
--
--  4) בדיקה חיה — התחבר בחשבון שחקן:
--     · בטופס הפרופיל אין כפתור העלאת תמונה, ומופיע הסבר קצר
--     · בכל מקום שהוצגה תמונה מופיעות ראשי התיבות
--     · אי-רגרסיה: בחשבון מאמן העלאת תמונה ממשיכה לעבוד כרגיל
--
--  5) בדיקת העקיפה (מחשבון שחקן, קריאת API ישירה):
--       curl -X POST -H "Authorization: Bearer <PLAYER_JWT>" \
--         -H "apikey: <ANON>" -F file=@x.jpg \
--         "<URL>/storage/v1/object/media/avatars/<PLAYER_ID>/1.jpg"
--     צפוי: 403. זו הבדיקה שמוכיחה שהחסימה אינה בממשק בלבד.
-- =====================================================================
