-- =====================================================================
--  CourtSide — הפיכת ה-bucket 'media' לפרטי (AUDIT_3.8, ממצא קריטי)
--
--  הממצא: supabase_launch_migration.sql:144 + src/storage.js:45.
--  ה-bucket 'media' מוגדר Public, ואף אחת מ-48 המיגרציות לא יוצרת
--  ולו מדיניות אחת על storage.objects — ההגדרות קיימות רק כהערה.
--  התוצאה: תמונת הפנים של קטין (כולל סלפי, capture="user" ב-ProfileForm)
--  יושבת בכתובת ציבורית קבועה וניחושה, בלי אימות, בלי תפוגה, ניתנת
--  לאינדוקס ולהורדה — וממשיכה להיות נגישה גם אחרי מחיקת החשבון,
--  כי מחיקת פרופיל לא נוגעת ב-Storage.
--
--  הקובץ הזה כותב את מדיניות ה-SELECT על storage.objects ומכין את
--  המעבר ל-bucket פרטי + Signed URLs.
--
--  ⚠ הקובץ יוצר SELECT בלבד. מדיניות INSERT / UPDATE / DELETE
--    (הצמדת הכתיבה לנתיב הבעלים — הממצא הנפרד ב-launch_migration:146)
--    נכתבת בקובץ אחר. אל תוסיף אותן כאן, הן ידרסו זו את זו.
--
-- =====================================================================
--  🚨 סדר פריסה קריטי — קרא לפני שאתה מריץ 🚨
--
--  חתימת URL עובדת מצוין גם על bucket ציבורי. לכן אין שום רגע של
--  "חלון שבור" אם עושים את זה בסדר הנכון:
--
--    שלב 1 — הרץ את כל הקובץ הזה *עד* לבאנר הרועש שבסוף (המדיניות,
--            פונקציות העזר, הרישום בלדג'ר). ה-bucket עדיין ציבורי,
--            שום דבר באפליקציה לא נשבר.
--    שלב 2 — פרוס (deploy) את הפרונטאנד שמייצר Signed URLs
--            (createSignedUrl במקום getPublicUrl). ודא בייצור שתמונות
--            אווטאר, פיד ותרגילים באמת נטענות.
--    שלב 3 — ורק אז הרץ ידנית את שורת ההיפוך שמתחת לבאנר הרועש.
--            מאותו רגע כתובות ה-public הישנות מפסיקות לעבוד.
--
--  ההיפוך הפיך לחלוטין. אם משהו נשבר בייצור:
--      update storage.buckets set public = true where id = 'media';
--  והכל חוזר להתנהגות הקודמת תוך שניות.
--
--  ⚠ סיכון ידוע: בחלק מפרויקטי Supabase, DDL על storage.objects
--    נכשל מתוך ה-SQL Editor עם "must be owner of table objects".
--    לכן כל יצירת מדיניות עטופה ב-DO/EXCEPTION שמדפיס NOTICE עם
--    ההגדרות המדויקות ליצירה ידנית ב-Dashboard → Storage → Policies.
--    אם ראית NOTICE כזה — הקובץ הצליח, אבל המדיניות *לא* נוצרה,
--    ואסור להריץ את ההיפוך עד שתיצור אותה ידנית.
--
--  אידמפוטנטי. אפשר להריץ שוב בלי נזק.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1) פונקציות עזר — פענוח בעלות מהנתיב
--
--  src/storage.js:45 מעלה תמיד לנתיב  <folder>/<userId>/<timestamp>.<ext>
--  ולכן (storage.foldername(name))[1] הוא התיקייה
--  ('avatars' | 'drills' | 'community') ו-[2] הוא ה-uuid של הבעלים.
--
--  כל הפונקציות כאן הן security definer בכוונה: ביטוי של מדיניות RLS
--  רץ בהרשאות הקורא, ולכן בדיקת role/approval_status מול public.profiles
--  הייתה מסוננת בעצמה ע"י ה-RLS של profiles (ובשביל anon — ריקה תמיד).
-- ---------------------------------------------------------------------

-- בעלים מתוך הנתיב. נתיב שלא תואם את התבנית מחזיר null (ואז הקריאה
-- תיחסם) — עדיף fail-closed מאשר להתרסק על ::uuid בקובץ ישן/חריג.
create or replace function public.media_path_owner(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := (storage.foldername(p_name))[2];
  if v is null or v = '' then
    return null;
  end if;
  return v::uuid;
exception when others then
  return null;
end;
$$;

-- האם הבעלים הוא מאמן. שאילתה דינמית כדי שהפונקציה תיווצר גם על
-- סכימה שבה profiles.role עוד לא קיימת (ברירת המחדל ההיסטורית
-- הייתה 'coach', ולכן זו גם ברירת המחדל של ה-fallback).
create or replace function public.media_owner_is_coach(p_owner uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v boolean;
begin
  if p_owner is null then
    return false;
  end if;
  begin
    execute 'select (role = ''coach'') from public.profiles where id = $1'
      into v using p_owner;
  exception when undefined_column then
    return true;  -- לפני supabase_players.sql כל משתמש היה מאמן
  end;
  return coalesce(v, false);
end;
$$;

-- האם חשבון הבעלים פעיל: לא חסום, ולא ממתין להסכמת הורה / מושהה.
-- approval_status נוצרת השבוע ב-supabase_parent_consent.sql, ולכן
-- הגישה אליה דינמית — הקובץ חייב לעבוד גם על ייצור שעוד לא הריץ אותה.
create or replace function public.media_owner_active(p_owner uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v boolean;
begin
  if p_owner is null then
    return false;
  end if;
  begin
    execute 'select (coalesce(approval_status, ''active'') = ''active'' '
         || '        and coalesce(banned, false) = false) '
         || 'from public.profiles where id = $1'
      into v using p_owner;
  exception when undefined_column then
    -- אין עדיין approval_status — נופלים לבדיקת החסימה בלבד
    begin
      execute 'select (coalesce(banned, false) = false) from public.profiles where id = $1'
        into v using p_owner;
    exception when undefined_column then
      return true;
    end;
  end;
  return coalesce(v, false);
end;
$$;

-- עטיפה ל-public.has_consent(owner, type) מ-supabase_parent_consent.sql.
-- p_default הוא מה שמוחזר כשהפונקציה עוד לא קיימת בכלל:
--   • 'media_team'   → true  : לא מחמירים מעבר להתנהגות הייצור הנוכחית
--                              (היום הכל ציבורי), כדי שהפריסה לא תשבור
--                              תמונות קיימות לפני שקובץ ההסכמות רץ.
--   • 'media_public' → false : גישת anon היא fail-closed תמיד. בלי
--                              רשומת הסכמה מפורשת — אין חשיפה לאינטרנט.
create or replace function public.media_consent_ok(p_owner uuid, p_type text, p_default boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v boolean;
begin
  if p_owner is null then
    return false;
  end if;
  begin
    execute 'select public.has_consent($1, $2)' into v using p_owner, p_type;
  exception when undefined_function then
    return p_default;   -- supabase_parent_consent.sql עוד לא הורץ
  end;
  return coalesce(v, false);
end;
$$;

grant execute on function public.media_path_owner(text)                 to anon, authenticated;
grant execute on function public.media_owner_is_coach(uuid)             to anon, authenticated;
grant execute on function public.media_owner_active(uuid)               to anon, authenticated;
grant execute on function public.media_consent_ok(uuid, text, boolean)  to anon, authenticated;


-- ---------------------------------------------------------------------
--  2) מדיניות SELECT למשתמש מחובר
--
--  מותר לקרוא אובייקט ב-'media' אם מתקיים אחד מ:
--    א) הוא שלי — תמיד, גם אם החשבון שלי ממתין או מושהה.
--    ב) הבעלים הוא מאמן — תוכן מקצועי (תרגילים, פיד המאמנים, אווטאר
--       מאמן). זו בדיוק ההתנהגות הקיימת היום בתוך האפליקציה.
--    ג) הבעלים הוא שחקן — רק אם החשבון שלו פעיל *וגם* יש לו הסכמת
--       'media_team'. זו הנקודה שסוגרת את הממצא: תמונת פנים של קטין
--       נחשפת לחברי המערכת רק אחרי שההורה סימן «כן» מפורש.
-- ---------------------------------------------------------------------
do $$
begin
  execute 'drop policy if exists "media_select_authenticated" on storage.objects';
  execute $pol$
    create policy "media_select_authenticated"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'media'
        and (
          public.media_path_owner(name) = auth.uid()
          or public.media_owner_is_coach(public.media_path_owner(name))
          or (
            public.media_owner_active(public.media_path_owner(name))
            and public.media_consent_ok(public.media_path_owner(name), 'media_team', true)
          )
        )
      )
  $pol$;
  raise notice '✔ media_select_authenticated נוצרה.';
exception when insufficient_privilege then
  raise notice '';
  raise notice '===================================================================';
  raise notice '⚠ אין הרשאה ל-DDL על storage.objects ("must be owner of table objects").';
  raise notice '  צור ידנית: Dashboard → Storage → Policies → bucket media → New policy';
  raise notice '    Policy name : media_select_authenticated';
  raise notice '    Allowed op  : SELECT';
  raise notice '    Target roles: authenticated';
  raise notice '    USING expression:';
  raise notice '      bucket_id = ''media'' and (';
  raise notice '        public.media_path_owner(name) = auth.uid()';
  raise notice '        or public.media_owner_is_coach(public.media_path_owner(name))';
  raise notice '        or (public.media_owner_active(public.media_path_owner(name))';
  raise notice '            and public.media_consent_ok(public.media_path_owner(name), ''media_team'', true))';
  raise notice '      )';
  raise notice '===================================================================';
when others then
  raise notice '⚠ media_select_authenticated נכשלה: %', sqlerrm;
end $$;


-- ---------------------------------------------------------------------
--  3) מדיניות SELECT לגולש לא מחובר (anon)
--
--  src/PublicDrill.jsx הוא דף שיתוף שמוגש למי שלא מחובר, וחייב
--  להמשיך להציג את תמונת התרגיל. לכן — ורק לכן — anon מקבל:
--    א) קבצים בתיקיית 'drills' שהבעלים שלהם הוא מאמן.
--    ב) כל אובייקט שיש לבעליו הסכמת 'media_public' מפורשת (הורה
--       שסימן במפורש «מותר לפרסם את דמות הילד»).
--  אווטארים של שחקנים, תוכן קהילה ותמונות של קטינים בלי הסכמה
--  ציבורית — חסומים לחלוטין לאנונימי. fail-closed.
-- ---------------------------------------------------------------------
do $$
begin
  execute 'drop policy if exists "media_select_anon" on storage.objects';
  execute $pol$
    create policy "media_select_anon"
      on storage.objects for select
      to anon
      using (
        bucket_id = 'media'
        and (
          (
            (storage.foldername(name))[1] = 'drills'
            and public.media_owner_is_coach(public.media_path_owner(name))
          )
          or public.media_consent_ok(public.media_path_owner(name), 'media_public', false)
        )
      )
  $pol$;
  raise notice '✔ media_select_anon נוצרה.';
exception when insufficient_privilege then
  raise notice '';
  raise notice '===================================================================';
  raise notice '⚠ אין הרשאה ל-DDL על storage.objects ("must be owner of table objects").';
  raise notice '  צור ידנית: Dashboard → Storage → Policies → bucket media → New policy';
  raise notice '    Policy name : media_select_anon';
  raise notice '    Allowed op  : SELECT';
  raise notice '    Target roles: anon';
  raise notice '    USING expression:';
  raise notice '      bucket_id = ''media'' and (';
  raise notice '        ((storage.foldername(name))[1] = ''drills''';
  raise notice '         and public.media_owner_is_coach(public.media_path_owner(name)))';
  raise notice '        or public.media_consent_ok(public.media_path_owner(name), ''media_public'', false)';
  raise notice '      )';
  raise notice '===================================================================';
when others then
  raise notice '⚠ media_select_anon נכשלה: %', sqlerrm;
end $$;


-- ---------------------------------------------------------------------
--  4) OPTIONAL — נרמול כתובות שמורות (בטוח לדלג)
--
--  היום בבסיס הנתונים שמורות כתובות public מלאות
--  (https://<ref>.supabase.co/storage/v1/object/public/media/<path>).
--  ה-resolver החדש בפרונטאנד מקבל *גם* כתובת מלאה וגם נתיב חשוף,
--  ולכן הנרמול הזה אינו חובה — הוא רק מנקה את הנתונים ומקצר את
--  הדרך לחתימה.
--
--  הפונקציה נוצרת אבל *לא* מורצת. כשתרצה — הרץ ידנית:
--      select public.media_normalize_urls();
--  התוצאה: jsonb עם מספר השורות שעודכנו בכל טבלה (‎-1 = הטבלה או
--  העמודה לא קיימות אצלך). אידמפוטנטי — הרצה שנייה תעדכן 0 שורות.
-- ---------------------------------------------------------------------

create or replace function public.media_strip_url(p_url text)
returns text
language sql
immutable
as $$
  select case
    when p_url is null then null
    when p_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/media/'
      then split_part(
             regexp_replace(p_url, '^https?://[^/]+/storage/v1/object/(public|sign)/media/', ''),
             '?', 1)
    else p_url
  end;
$$;

create or replace function public.media_normalize_urls()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_avatars int := -1;
  n_drills  int := -1;
  n_posts   int := -1;
  v_admin   boolean := true;
begin
  -- מתוך ה-SQL Editor אין auth.uid() ולכן מריצים; דרך ה-API — אדמין בלבד.
  if auth.uid() is not null then
    begin
      v_admin := public.is_admin();
    exception when undefined_function then
      v_admin := false;
    end;
    if not v_admin then
      raise exception 'media_normalize_urls: אדמין בלבד';
    end if;
  end if;

  -- profiles.avatar_url
  begin
    execute $q$
      update public.profiles
         set avatar_url = public.media_strip_url(avatar_url)
       where avatar_url is not null
         and avatar_url is distinct from public.media_strip_url(avatar_url)
    $q$;
    get diagnostics n_avatars = row_count;
  exception when undefined_column or undefined_table then
    n_avatars := -1;
  end;

  -- drills.image_url (שם העמודה האמיתי לפי supabase_launch_migration.sql:29)
  begin
    execute $q$
      update public.drills
         set image_url = public.media_strip_url(image_url)
       where image_url is not null
         and image_url is distinct from public.media_strip_url(image_url)
    $q$;
    get diagnostics n_drills = row_count;
  exception when undefined_column or undefined_table then
    n_drills := -1;
  end;

  -- community_posts.image_urls — text[], כתיבה מחדש של המערך תוך שמירת סדר
  begin
    execute $q$
      update public.community_posts p
         set image_urls = (
               select array_agg(public.media_strip_url(u) order by ord)
                 from unnest(p.image_urls) with ordinality as t(u, ord)
             )
       where p.image_urls is not null
         and p.image_urls is distinct from (
               select array_agg(public.media_strip_url(u) order by ord)
                 from unnest(p.image_urls) with ordinality as t(u, ord)
             )
    $q$;
    get diagnostics n_posts = row_count;
  exception when undefined_column or undefined_table then
    n_posts := -1;
  end;

  return jsonb_build_object(
    'profiles_avatar_url',      n_avatars,
    'drills_image_url',         n_drills,
    'community_posts_image_urls', n_posts
  );
end;
$$;

revoke execute on function public.media_normalize_urls() from public;
revoke execute on function public.media_normalize_urls() from anon;
grant  execute on function public.media_strip_url(text) to anon, authenticated;


-- ---------------------------------------------------------------------
--  5) רישום בלדג'ר + רענון סכימת ה-API
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.mark_migration('supabase_private_media.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקת עשן — הרץ *לפני* ההיפוך
--
--  א) המדיניות קיימות?
--       select policyname, cmd, roles
--       from pg_policies
--       where schemaname = 'storage' and tablename = 'objects'
--       order by policyname;
--     צריך לראות media_select_authenticated ו-media_select_anon.
--
--  ב) ⚠ החשוב מכל — יש מדיניות SELECT *ישנה* ורחבה על storage.objects?
--     מדיניות permissive מתאחדות ב-OR, ולכן מדיניות ישנה בסגנון
--     "Public Access" עם התנאי היחיד bucket_id = 'media' תבטל את כל
--     הקובץ הזה. אם קיימת כזו — מחק אותה ב-Dashboard לפני ההיפוך.
--
--  ג) נתיבים שלא נפרסים (יאבדו גישה אחרי ההיפוך — אמור להחזיר 0):
--       select name from storage.objects
--       where bucket_id = 'media' and public.media_path_owner(name) is null
--       limit 20;
--
--  ד) מה בעצם ייחשף לאנונימי אחרי ההיפוך:
--       select count(*) from storage.objects
--       where bucket_id = 'media'
--         and (storage.foldername(name))[1] = 'drills'
--         and public.media_owner_is_coach(public.media_path_owner(name));
--
--  ה) אחרי ההיפוך — הכתובת הישנה חייבת להחזיר 400/404:
--       curl -I "https://<ref>.supabase.co/storage/v1/object/public/media/avatars/<uuid>/<file>.jpg"
--     ובמקביל האפליקציה (עם Signed URL) חייבת להציג את אותה תמונה.
-- =====================================================================


-- #####################################################################
-- #####################################################################
-- ###                                                               ###
-- ###   🚨🚨🚨   ה  ה  י  פ  ו  ך   —   א ל   ת ר י ץ   ע ד י י ן   ###
-- ###                                                               ###
-- ###   השורה הבאה מנתקת את כל כתובות ה-public הקיימות בבת אחת.     ###
-- ###                                                               ###
-- ###   הרץ אותה רק אחרי ששלושת התנאים מתקיימים:                    ###
-- ###     1. כל מה שמעל הבאנר הזה הורץ בהצלחה, בלי NOTICE של        ###
-- ###        "אין הרשאה" (ואם היה — המדיניות נוצרו ידנית).           ###
-- ###     2. אין מדיניות SELECT ישנה ורחבה (בדיקת עשן ב').           ###
-- ###     3. הפרונטאנד עם Signed URLs כבר פרוס בייצור ונבדק.        ###
-- ###                                                               ###
-- ###   היא מושארת כהערה בכוונה, כדי שהרצת הקובץ כולו לא תהפוך      ###
-- ###   את ה-bucket בטעות. הסר את שני מקפי ההערה והרץ את השורה      ###
-- ###   לבדה ב-SQL Editor:                                          ###
-- ###                                                               ###
-- ###      update storage.buckets set public = false where id = 'media';
-- ###                                                               ###
-- ###   ביטול מיידי אם משהו נשבר (הפיך לחלוטין, תוך שניות):         ###
-- ###      update storage.buckets set public = true  where id = 'media';
-- ###                                                               ###
-- #####################################################################
-- #####################################################################

-- update storage.buckets set public = false where id = 'media';
