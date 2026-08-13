-- =====================================================================
-- CourtSide — עולם המשחק: מחסן הסרטונים  ·  12.8.2026
--
-- מה זה נותן: תיקיית challenges/ ב-bucket 'media' — מי מעלה, מי צופה,
-- ומה נעול. **קובץ נפרד מ-40 בכוונה**: ה-SQL Editor מריץ קובץ כטרנזקציה
-- אחת, ו-DDL על storage.objects נכשל ב-insufficient_privilege בחלק
-- מהפרויקטים — כישלון כאן לא יגלגל אחורה את טבלאות האתגר.
--
-- ⚠ שלוש הכרעות שנגזרות ממה שנבדק בפרוד (12.8):
--
--   1) **מדיניות INSERT חדשה ונפרדת, לא עריכה של הקיימת.**
--      supabase_rls_hardening_3_8.sql:780 בונה מחדש את
--      media_insert_own_folder עם שלוש תיקיות בכל הרצה — עריכה שלה
--      הייתה נמחקת בהרצה החוזרת הבאה וההעלאות היו מתות ב-403.
--      מדיניות permissive מתאחדות ב-OR, ולכן תוספת היא הדרך העמידה.
--      והמחרוזת auth.uid() חייבת להופיע בגוף — לולאת הניקוי שם מוחקת
--      כל מדיניות כתיבה על media שאינה מכילה אותה.
--
--   2) **פיצול anon/authenticated.** נבדק בפרוד: is_admin() אינה
--      חשופה ל-anon. מדיניות אחת שקוראת לה עבור anon הייתה מפילה כל
--      קריאה אנונימית — והתמונות בדף התרגיל הציבורי היו נעלמות.
--
--   3) **סגירת שני חורים במדיניות הקיימת** (media_select_authenticated
--      מ-supabase_private_media.sql): המסלול השלישי שלה מתיר לכל מחובר
--      לקרוא קובץ של בעלים פעיל עם הסכמת media_team — כלומר כל שחקן
--      היה יכול לחתום קישור לקליפ אתגר של אחר **לפני אישור**; ובמקביל
--      אדמין אינו עובר בה עבור קליפ של קטין בלי הסכמה — כלומר תור
--      האישור היה שבור בדיוק עבור הקליפים שהכי חשוב לבדוק.
--
-- אידמפוטנטי.
-- דורש: supabase_game_challenges_12_8.sql (40 — game_media_locked) ·
--       supabase_private_media.sql (media_path_owner) ·
--       supabase_rls_hardening_3_8.sql (is_banned)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) בדיקת תלות
-- ---------------------------------------------------------------------
do $dep$
begin
  if to_regprocedure('public.game_media_locked(text,uuid)') is null then
    raise notice '';
    raise notice '===================================================================';
    raise notice '  ✋ עצור: game_media_locked() לא קיימת.';
    raise notice '  הרץ קודם את supabase_game_challenges_12_8.sql (קובץ 40).';
    raise notice '===================================================================';
  end if;
  if to_regprocedure('public.media_path_owner(text)') is null then
    raise notice '  ✋ עצור: media_path_owner() לא קיימת — הרץ supabase_private_media.sql.';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- 1) העלאה — מדיניות permissive *נוספת* לתיקיית challenges
-- ---------------------------------------------------------------------
do $ins$
begin
  execute 'drop policy if exists "media_insert_challenges" on storage.objects';
  execute $pol$
    create policy "media_insert_challenges" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'media'
        and (storage.foldername(name))[1] = 'challenges'
        and (storage.foldername(name))[2] = (select auth.uid())::text
        and not (select public.is_banned())
        and (select public.game_can_play())
      )
  $pol$;
  raise notice '✔ media_insert_challenges נוצרה.';
exception when insufficient_privilege then
  raise notice '';
  raise notice '===================================================================';
  raise notice '⚠ אין הרשאה ל-DDL על storage.objects. צור ידנית:';
  raise notice '  Dashboard → Storage → Policies → media → New policy';
  raise notice '    Name: media_insert_challenges · Op: INSERT · Roles: authenticated';
  raise notice '    WITH CHECK:';
  raise notice '      bucket_id = ''media''';
  raise notice '      and (storage.foldername(name))[1] = ''challenges''';
  raise notice '      and (storage.foldername(name))[2] = (select auth.uid())::text';
  raise notice '      and not (select public.is_banned())';
  raise notice '      and (select public.game_can_play())';
  raise notice '===================================================================';
when others then
  raise notice '⚠ media_insert_challenges נכשלה: %', sqlerrm;
end $ins$;


-- ---------------------------------------------------------------------
-- 2) קריאה — שלוש מדיניות שמשלימות זו את זו:
--    permissive לבעלים ולאדמין (פותחת את תור האישור),
--    restrictive ל-authenticated (סוגרת את חור ה-media_team),
--    restrictive ל-anon (קליפ אתגר לעולם אינו אנונימי).
-- ---------------------------------------------------------------------
do $sel$
begin
  execute 'drop policy if exists "media_select_challenges" on storage.objects';
  execute $pol$
    create policy "media_select_challenges" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'media'
        and (storage.foldername(name))[1] = 'challenges'
        and (public.media_path_owner(name) = (select auth.uid())
             or (select public.is_admin()))
      )
  $pol$;
  raise notice '✔ media_select_challenges נוצרה.';

  execute 'drop policy if exists "media_challenges_private" on storage.objects';
  execute $pol$
    create policy "media_challenges_private" on storage.objects
      as restrictive for select to authenticated
      using (
        bucket_id <> 'media'
        or (storage.foldername(name))[1] <> 'challenges'
        or public.media_path_owner(name) = (select auth.uid())
        or (select public.is_admin())
      )
  $pol$;
  raise notice '✔ media_challenges_private נוצרה.';

  execute 'drop policy if exists "media_challenges_no_anon" on storage.objects';
  execute $pol$
    create policy "media_challenges_no_anon" on storage.objects
      as restrictive for select to anon
      using (
        bucket_id <> 'media'
        or (storage.foldername(name))[1] <> 'challenges'
      )
  $pol$;
  raise notice '✔ media_challenges_no_anon נוצרה.';
exception when insufficient_privilege then
  raise notice '';
  raise notice '===================================================================';
  raise notice '⚠ אין הרשאה ל-DDL על storage.objects. צור ידנית שלוש מדיניות SELECT:';
  raise notice '  1) media_select_challenges · SELECT · authenticated (permissive):';
  raise notice '     bucket_id=''media'' and (storage.foldername(name))[1]=''challenges''';
  raise notice '     and (public.media_path_owner(name)=(select auth.uid()) or (select public.is_admin()))';
  raise notice '  2) media_challenges_private · SELECT · authenticated · AS RESTRICTIVE:';
  raise notice '     bucket_id<>''media'' or (storage.foldername(name))[1]<>''challenges''';
  raise notice '     or public.media_path_owner(name)=(select auth.uid()) or (select public.is_admin())';
  raise notice '  3) media_challenges_no_anon · SELECT · anon · AS RESTRICTIVE:';
  raise notice '     bucket_id<>''media'' or (storage.foldername(name))[1]<>''challenges''';
  raise notice '===================================================================';
when others then
  raise notice '⚠ מדיניות ה-SELECT נכשלו: %', sqlerrm;
end $sel$;


-- ---------------------------------------------------------------------
-- 3) נעילה אחרי אישור — restrictive על UPDATE ועל DELETE
--
--    המדיניות הקיימת מתירה לבעלים לדרוס כל קובץ בתיקייה שלו — כולל
--    קליפ שאושר ונכנס לטופ-5. upsert:false בלקוח אינו הגנה: קריאת
--    Storage ישירה עם מפתח ה-anon שב-bundle עוקפת אותו.
-- ---------------------------------------------------------------------
do $lock$
begin
  execute 'drop policy if exists "media_challenges_lock_upd" on storage.objects';
  execute $pol$
    create policy "media_challenges_lock_upd" on storage.objects
      as restrictive for update to authenticated
      using (
        bucket_id <> 'media'
        or (storage.foldername(name))[1] <> 'challenges'
        or (select public.is_admin())
        or not public.game_media_locked(name, (select auth.uid()))
      )
  $pol$;
  execute 'drop policy if exists "media_challenges_lock_del" on storage.objects';
  execute $pol$
    create policy "media_challenges_lock_del" on storage.objects
      as restrictive for delete to authenticated
      using (
        bucket_id <> 'media'
        or (storage.foldername(name))[1] <> 'challenges'
        or (select public.is_admin())
        or not public.game_media_locked(name, (select auth.uid()))
      )
  $pol$;
  raise notice '✔ נעילת קבצים מאושרים נוצרה (UPDATE + DELETE).';
exception when insufficient_privilege then
  raise notice '⚠ אין הרשאה — צור ידנית שתי מדיניות RESTRICTIVE (UPDATE ו-DELETE) לפי סעיף 3 בקובץ.';
when others then
  raise notice '⚠ נעילת הקבצים נכשלה: %', sqlerrm;
end $lock$;


-- ---------------------------------------------------------------------
-- 4) מגבלות ה-bucket — גודל וסוגי קבצים
--
--    50MB בלקוח / 60MB בשרת: אייפון ב-1080p מייצר ~130MB לדקה, ולכן
--    ההנחיה במסך היא «צלמו ב-720p». המגבלה כאן היא הרשת האחרונה.
-- ---------------------------------------------------------------------
do $bkt$
begin
  update storage.buckets
     set file_size_limit = 60000000,
         allowed_mime_types = array[
           'image/jpeg','image/png','image/webp','image/gif',
           'video/mp4','video/quicktime','video/webm'
         ]
   where id = 'media';
  raise notice '✔ מגבלות ה-bucket עודכנו (60MB, תמונות + וידאו).';
exception when insufficient_privilege then
  raise notice '⚠ אין הרשאה לעדכן את storage.buckets — קבע ידנית: Storage → media → Edit:';
  raise notice '    File size limit: 60MB · Allowed MIME: image/jpeg,png,webp,gif + video/mp4,quicktime,webm';
when others then
  raise notice '⚠ עדכון ה-bucket נכשל: %', sqlerrm;
end $bkt$;


-- ---------------------------------------------------------------------
-- 5) רטנשן — פונקציה חדשה, לא עריכה של purge_expired_data
--
--    עריכת פונקציה של מיגרציה קודמת נמחקת בהרצה חוזרת שלה — בשקט.
--    הפונקציה כאן עצמאית, יבשה כברירת מחדל, ומופעלת ידנית עד שעורך
--    הדין מאשר את תקופות השמירה (אותו שער כמו כל retention_schedule).
-- ---------------------------------------------------------------------
create or replace function public.game_purge_videos(p_dry boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth.uid() is not null and not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  -- הגיל נמדד מ-coalesce(reviewed_at, submitted_at): הגשה שנדחתה או
  -- אתגר שלא הוכרע — אין decided_at, ובלי ה-coalesce לא היו נמחקים לעולם.
  with old_subs as (
    select s.media_path
      from public.game_challenge_submissions s
     where s.media_path is not null
       and coalesce(s.reviewed_at, s.submitted_at) < now() - interval '180 days'
  )
  select count(*) into v_n from old_subs;

  if p_dry then
    return jsonb_build_object('ok', true, 'dry', true, 'would_delete', v_n);
  end if;

  delete from storage.objects o
   where o.bucket_id = 'media'
     and o.name in (select s.media_path from public.game_challenge_submissions s
                     where s.media_path is not null
                       and coalesce(s.reviewed_at, s.submitted_at) < now() - interval '180 days');

  update public.game_challenge_submissions
     set media_path = null
   where media_path is not null
     and coalesce(reviewed_at, submitted_at) < now() - interval '180 days';

  return jsonb_build_object('ok', true, 'dry', false, 'deleted', v_n);
end;
$$;

revoke all on function public.game_purge_videos(boolean) from public, anon;
grant execute on function public.game_purge_videos(boolean) to authenticated;

do $ret$
begin
  if to_regclass('public.retention_policy') is not null then
    insert into public.retention_policy (key, days, method, what, note)
    values ('challenge_videos', 180, 'delete',
            'קבצי וידאו של הגשות אתגר (challenges/) וניקוי media_path',
            'מופעל ידנית דרך game_purge_videos(false). יבש כברירת מחדל עד אישור עו"ד.')
    on conflict (key) do nothing;
  end if;
exception when others then
  raise notice 'ℹ רישום מפתח הרטנשן דולג: %', sqlerrm;
end $ret$;


-- ---------------------------------------------------------------------
-- רישום
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_game_media_12_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) כל המדיניות במקום:
--       select policyname, permissive, cmd, roles from pg_policies
--        where schemaname='storage' and tablename='objects'
--          and policyname like 'media_%challenges%' order by policyname;
--     שש שורות: insert · select · private (restrictive) · no_anon
--     (restrictive) · lock_upd · lock_del.
--
--  2) מגבלות ה-bucket:
--       select id, public, file_size_limit, allowed_mime_types
--         from storage.buckets where id='media';
--
--  3) **מדפדפן, אחרי הפריסה**: העלאת קליפ מחשבון שחקן עוברת;
--     דף תרגיל ציבורי (בלי התחברות) עדיין מציג תמונות;
--     וקריאת קליפ של שחקן אחר מחזירה 403.
--
--  4) הרצה חוזרת של הקובץ כולו — חייבת לעבור נקי.
-- =====================================================================
