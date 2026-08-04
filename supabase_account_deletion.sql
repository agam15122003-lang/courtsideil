-- =====================================================================
--  CourtSide — מחיקת חשבון בפועל
--  supabase_account_deletion.sql
--
--  הבעיה (ביקורת 3.8, סעיף 11 ברשימה המשפטית — «חסר»):
--  public/privacy.html מבטיח מחיקה תוך 30 יום. היום המשתמש מגיש שורה
--  ב-account_deletion_requests, האדמין רואה אותה ב-admin_deletion_requests
--  ולוחץ admin_mark_deletion_done — והפונקציה הזו מעדכנת עמודת status
--  ולא מוחקת **כלום**. זו הבטחה עם קופסה ריקה מאחוריה, וזה בדיוק הסוג
--  של פער שרגולטור מוצא בחמש דקות.
--
--  הקובץ הזה בונה את המנגנון האמיתי: admin_execute_deletion.
--
--  ---------------------------------------------------------------------
--  עקרון-על: הרצה יבשה כברירת מחדל
--
--    select public.admin_execute_deletion('<uuid>');          -- דוח בלבד
--    select public.admin_execute_deletion('<uuid>', false);   -- מוחק
--
--  אין ל-DELETE כפתור «ביטול». לכן ברירת המחדל של הפונקציה היא לספור
--  ולדווח, ורק ארגומנט שני מפורש (false) מבצע. אותה גישה בדיוק כמו
--  ב-purge_expired_data שבקובץ ה-retention, ומאותה סיבה.
--
--  ⚠ ההרצה היבשה **אינה** מבצעת DELETE ומגלגלת אותו לאחור. שקלתי את זה:
--    זו הדרך היחידה לקבל ספירה מדויקת ב-100% של שרשור עמוק. פסלתי אותה.
--    דוח בטיחות שמבצע בעצמו את הפעולה ההרסנית ומסתמך על גלגול-לאחור
--    כדי לא להשמיד נתונים הוא לא מנגנון בטיחות — הוא עוד נקודת כשל,
--    והוא נועל את השורות של כל המערכת לאורך הבדיקה. במקום זה הספירה
--    כאן נגזרת מגרף המפתחות הזרים עצמו (סעיף 1), והיא מדויקת עד עומק 4
--    בלי לגעת בשורה אחת.
--
--  ---------------------------------------------------------------------
--  ההחלטות, אחת-אחת. כל אחת מהן משמידה מידע אמיתי אם היא שגויה.
--
--  1) profiles — הלב. profiles.id references auth.users on delete cascade,
--     וכמעט כל טבלה במערכת תלויה ב-profiles. לא הנחתי כלום: הפונקציה
--     קוראת את גרף ה-FK מ-pg_constraint בזמן ריצה ומדווחת טבלה-טבלה מה
--     ימחק, מה רק ינותק (SET NULL), וכמה שורות בכל אחת. אם מישהו יוסיף
--     מחר טבלה חדשה עם FK ל-profiles — היא תופיע בדוח מעצמה. רשימה
--     קשיחה שהייתי מקליד כאן הייתה מתיישנת בקומיט הבא.
--
--     ⚠ מאמן: מחיקת מאמן מוחקת בשרשור את **הקבוצות שלו** ואיתן את שורות
--     הסגל, האימונים, הנוכחות והמשחקים — כלומר גם רשומות של קטינים
--     אחרים. זה נכון משפטית (זה המידע שלו, הוא הבעלים), אבל זו לא
--     «מחיקת חשבון» רגילה. הדוח מסמן את זה במפורש כ-blast_radius.
--
--  2) storage.objects — הקבצים עצמם, לא רק שורות במסד. ניתוק העמודה
--     בפרופיל משאיר את הקובץ בכתובתו. מוסר כאן כל אובייקט בדלי 'media'
--     שהתיקייה השנייה בנתיב שלו היא ה-uuid (הקונבנציה של
--     media_path_owner), או ש-owner שלו הוא המשתמש. עטוף ב-exception:
--     ב-SQL Editor אין תמיד בעלות על storage.objects, ואז מוחזר שלב
--     ידני במקום כישלון שקט. (אותו סיפור כמו supabase_no_player_avatars.)
--
--  3) team_players — **אנונימיזציה, לא מחיקה**, וזו החלטה מודעת:
--     ה-FK הוא player_id ... on delete set null, כלומר השורה שורדת
--     ממילא. היא רשומה של **המאמן**: practice_attendance, game_attendance
--     ו-player_stats תלויים ב-team_players.id עם cascade, ומחיקה קשיחה
--     הייתה מוחקת למאמן עונה שלמה של נוכחות וסטטיסטיקה על קבוצה שלמה.
--     לכן מאפסים שם/טלפון/הערות/הערת פציעה/נתוני לידה, מנתקים את
--     player_id ומסמנים anonymised_at — בדיוק אותו SET שעושה
--     purge_expired_data, כדי ששני המסלולים ישאירו את אותו שלד.
--     הדוח אומר את זה בקול ('anonymise'), ולא מבליע.
--
--     ⚠ ובנוסף — coach_notes. הטבלה תלויה ב-team_players.id עם cascade,
--     אבל אנחנו לא מוחקים את שורת הסגל, ולכן ההערות **שורדות** —
--     טקסט חופשי שמאמן כתב על קטין שביקש להימחק. הן נמחקות כאן
--     במפורש. זה בדיוק סוג הדליפה ש«אנונימיזציה במקום מחיקה» מייצרת
--     כשלא בודקים מי תלוי במה.
--
--  4) consents — **לא נגענו, וזו התשובה הנכונה.**
--     הטיעון: consents הוא יומן הראיות שהורה אישר. מחיקתו משמידה את
--     ההוכחה היחידה שהמפעיל פעל כדין — כלומר בקשת מחיקה של משתמש אחד
--     הייתה מוחקת את ההגנה המשפטית על הטיפול בו עצמו. GDPR סעיף
--     17(3)(e) מכיר בשמירה לצורך הגנה מפני תביעות בדיוק למקרה הזה.
--     מנגד, אסור להשאיר מידע מזהה.
--
--     הפתרון כבר בנוי בסכימה, ובכוונה: supabase_parent_consent.sql נתן
--     ל-consents **אפס מפתחות זרים** ("היומן שורד את מחיקת החשבון, כפי
--     שראיה צריכה"), בעוד guardians ו-consent_requests — שבהן יושבים
--     השם, המייל והטלפון של ההורה — כן תלויות ב-profiles עם cascade.
--     כלומר עצם מחיקת הפרופיל **מנתקת את הזהות** ומשאירה את ההכרעה:
--     אחריה minor_id ו-guardian_id הם uuid תלושים שאין להם טבלת חיפוש.
--     זה בדיוק pseudonymisation, וזה מה שנדרש.
--     לא ניסיתי לעדכן את השורות: יש טריגר trg_consents_immutable
--     שמפיל כל UPDATE/DELETE על הטבלה, וזו הגנה שאין שום סיבה שפונקציית
--     מחיקה תעקוף. מי שיעקוף אותה פעם אחת יעקוף אותה תמיד.
--
--  5) audit_log — כן נוגעים, אבל בזהירות ובאבחנה:
--     · שורות שבהן subject = הנמחק → תוכן details נמחק ומוחלף בסימון
--       redaction ששומר רק את **שמות** השדות שהשתנו. הערך העסקי של
--       היומן ("מי נגע במה ומתי") שורד; תאריך הלידה של מי שביקש
--       להימחק — לא. הוא כן נשמר שם היום, ב-plain, ע"י audit_sensitive_change.
--     · שורות שבהן actor = הנמחק אבל subject הוא **אדם אחר** → נשארות
--       שלמות. זו הראיה שמאמן פלוני נגע בשורת קטין; מחיקתה הייתה
--       פוגעת בהגנה על קטין שלישי שלא ביקש כלום. actor הופך ל-uuid תלוש
--       וזה מספיק.
--     ההבחנה הזו היא כל העניין. «מחק כל שורה שנוגעת לו» היה נשמע
--     קפדני יותר ומזיק יותר.
--
--  6) auth.users — הכניסה עצמה. חשבון «שנמחק» שעדיין אפשר להתחבר אליו
--     גרוע מכלום, כי הוא נראה טופל. הניסיון עטוף ב-exception נפרד,
--     ואם הוא נכשל מוחזר manual_steps עם הנתיב המדויק בדשבורד. בלי
--     בליעה שקטה.
--
--  7) הראיה שהבקשה כובדה. שימו לב לפח:
--     account_deletion_requests.user_id references profiles on delete
--     cascade — כלומר שורת הבקשה עצמה **נמחקת יחד עם החשבון**. סימון
--     status='done' לפני המחיקה נכון לוגית אבל נעלם שנייה אחריו. לכן
--     ההוכחה שההבטחה כובדה תוך 30 יום נכתבת ל-audit_log (שאין לו FK),
--     כולל מזהה הבקשה ומועד הגשתה. שם, ולא בטבלת הבקשות, זה מקום
--     האחסון האמיתי של הראיה.
--     ה-audit_log מקבל email_hint ממוסך בלבד ולא את המייל המלא: יומן
--     שנועד להוכיח מחיקה ושומר בתוכו את המייל שנמחק הוא חוזר-על-עצמו.
--
--  8) בטיחות מפני uuid שהוקלד לא נכון (סעיף 2 במשימה):
--     · ההרצה היבשה מחזירה שם פרטי, שם משפחה, מייל מלא, תפקיד ומועד
--       הצטרפות — האדמין מזהה את האדם לפני שהוא לוחץ.
--     · סירוב למחוק את עצמך (refuse_self).
--     · סירוב למחוק חשבון אדמין (refuse_admin) — צריך להוריד הרשאה קודם.
--     · uuid שאינו קיים לא מחזיר «בוצע» אלא user_not_found.
--     · FK מסוג NO ACTION/RESTRICT עם שורות קיימות עוצר את הריצה
--       האמיתית (fk_blocker) במקום ליפול באמצע ולהשאיר מחיקה חלקית.
--     · אין בקשת מחיקה בתיק? לא חוסם (יש מחיקות בצו או ביוזמת הורה),
--       אבל מוחזרת אזהרה no_request_on_file שה-UI מציג.
--
--  תלוי ב: supabase_legal_launch.sql, supabase_parent_consent.sql,
--           supabase_audit_retention.sql, supabase_migrations_ledger.sql
--  אידמפוטנטי — אפשר להריץ שוב.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1) _deletion_targets — גרף המחיקה, נגזר מהמסד ולא מהזיכרון שלי
--
--     הולכת על pg_constraint, מאתרת כל FK של עמודה בודדת שמצביע על
--     public.profiles או על auth.users, וממשיכה משם פנימה **רק דרך
--     קשתות CASCADE** (קשת SET NULL עוצרת: השורה שורדת, ולכן הילדים
--     שלה לא נוגעים). לכל צומת נבנה תנאי WHERE מקונן:
--
--       עומק 1:  player_id = $1
--       עומק 2:  team_id in (select id from teams where coach_id = $1)
--       עומק 3:  session_id in (select id from sessions where team_id
--                  in (select id from teams where coach_id = $1))
--
--     ואז נספרות השורות בפועל. כך הדוח מדויק גם עבור מחיקת מאמן,
--     שבה רוב הנזק יושב בעומק 2-3 ולא בעומק 1.
--
--     ⚠ SECURITY INVOKER, ובכוונה גדולה.
--     supabase_hardening_medium_3_8.sql מריץ לולאת DO שמעניקה EXECUTE
--     ל-authenticated על **כל** פונקציית prosecdef בסכימה public. עוזר
--     שאסור שיהיה קריא למשתמש חייב להיות INVOKER, אחרת ההקשחה בעצמה
--     תפתח אותו. כאן זה קריטי: הפונקציה מריצה COUNT דינמי על כל טבלה
--     במערכת, ובידי משתמש רגיל היא הייתה אורקל למיפוי המסד.
--     כשהיא נקראת מתוך admin_execute_deletion (שהיא DEFINER) היא רצה
--     ממילא בהרשאות הבעלים — כלומר הספירה מלאה ועוקפת RLS, כפי שנדרש.
-- ---------------------------------------------------------------------
drop function if exists public._deletion_targets(uuid);
create or replace function public._deletion_targets(p_user uuid)
returns table (
  lvl      int,
  tbl      text,
  col_name text,
  del_rule text,
  rows_n   bigint,
  -- via_tbl ולא via: שם פרמטר פלט שזהה לשם עמודה בשאילתה שבתוך הפונקציה
  -- הופך כל אזכור לא-מוסמך שלו ל«ambiguous» בזמן ריצה.
  via_tbl  text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_roots oid[];
  r       record;
  v_n     bigint;
begin
  -- to_regclass ולא ::regclass — פריסה בלי אחת מהטבלאות לא תפיל את הקובץ.
  -- בנייה מפורשת ולא array_remove(..., null): הסמנטיקה של array_remove מול
  -- NULL עדינה מדי מכדי לתלות בה את השורש של גרף המחיקה.
  v_roots := '{}'::oid[];
  if to_regclass('public.profiles') is not null then
    v_roots := v_roots || to_regclass('public.profiles')::oid;
  end if;
  if to_regclass('auth.users') is not null then
    v_roots := v_roots || to_regclass('auth.users')::oid;
  end if;
  if array_length(v_roots, 1) is null then
    return;                                   -- אין על מה ללכת
  end if;

  for r in
    with recursive edge as (
      select con.conrelid                    as child_oid,
             con.confrelid                   as parent_oid,
             con.confdeltype                 as del,
             (select a.attname from pg_attribute a
               where a.attrelid = con.conrelid  and a.attnum = con.conkey[1])  as child_col,
             (select a.attname from pg_attribute a
               where a.attrelid = con.confrelid and a.attnum = con.confkey[1]) as parent_col
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
       where con.contype = 'f'
         and c.relkind = 'r'
         -- FK מרובה-עמודות אינו קיים היום בסכימה. אם ייווצר אחד, עדיף
         -- שלא יופיע בדוח מאשר שיופיע עם תנאי חלקי ושגוי.
         and array_length(con.conkey, 1) = 1
    ),
    walk as (
      select 1 as depth, e.child_oid, e.child_col, e.del,
             format('%I = $1', e.child_col) as pred,
             array[e.child_oid]             as path,
             null::text                     as via
        from edge e
       where e.parent_oid = any(v_roots)
         and e.child_oid <> all(v_roots)      -- profiles עצמה היא השורש, לא צומת
      union all
      select w.depth + 1, e.child_oid, e.child_col, e.del,
             format('%I in (select %I from %s where %s)',
                    e.child_col, e.parent_col, w.child_oid::regclass::text, w.pred),
             w.path || e.child_oid,
             w.child_oid::regclass::text
        from walk w
        join edge e on e.parent_oid = w.child_oid
       where w.depth < 4                      -- תקרה: עומק 4 מכסה את כל הסכימה היום
         and w.del = 'c'                      -- ממשיכים רק דרך שרשור אמיתי
         and e.child_oid <> all(v_roots)
         and not (e.child_oid = any(w.path))  -- מניעת מעגלים
    )
    -- אותה טבלה יכולה להיות מושגת בכמה מסלולים; מציגים את הרדוד ביותר,
    -- כי הוא זה שמסביר בצורה הקצרה ביותר למה השורות ימחקו.
    -- ⚠ כל עמודה מוסמכת ב-w2. בלי זה "via" היה מתנגש בפרמטר הפלט בעל אותו
    -- שם, ו-plpgsql היה נופל על «column reference is ambiguous».
    select distinct on (w2.child_oid, w2.child_col)
           w2.depth, w2.child_oid::regclass::text as rel,
           w2.child_col, w2.del, w2.pred, w2.via
      from walk w2
     order by w2.child_oid, w2.child_col, w2.depth
  loop
    begin
      execute format('select count(*) from %s where %s', r.rel, r.pred)
        into v_n using p_user;
    exception when others then
      -- טבלה שנעלמה, עמודה שהוסרה, או חוסר הרשאה — null אומר «לא נספר»,
      -- וזה שונה מ-0. הדוח לא ישקר ויציג «אין שורות».
      v_n := null;
    end;

    lvl      := r.depth;
    tbl      := r.rel;
    col_name := r.child_col;
    del_rule := case r.del
                  when 'c' then 'CASCADE'
                  when 'n' then 'SET NULL'
                  when 'd' then 'SET DEFAULT'
                  when 'r' then 'RESTRICT'
                  else          'NO ACTION'
                end;
    rows_n   := v_n;
    via_tbl  := r.via;
    return next;
  end loop;
end;
$$;

-- לא ניתנת לקריאה מהאפליקציה. אין grant ל-authenticated בכוונה:
-- היא נקראת אך ורק מתוך admin_execute_deletion, שרצה כבעלים.
revoke all on function public._deletion_targets(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  2) admin_execute_deletion — הפעולה עצמה
--
--       select public.admin_execute_deletion('<uuid>');         -- דוח
--       select public.admin_execute_deletion('<uuid>', false);  -- ביצוע
--
--     מחזירה תמיד jsonb, ולעולם לא זורקת על תרחיש צפוי — הפרונט צריך
--     להציג הודעה, לא מסך שבור. החריג היחיד: מי שאינו אדמין.
-- ---------------------------------------------------------------------
drop function if exists public.admin_execute_deletion(uuid, boolean);
create or replace function public.admin_execute_deletion(
  p_user    uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_dry        boolean := coalesce(p_dry_run, true);
  v_has_prof   boolean := false;
  v_has_auth   boolean := false;
  v_first      text;
  v_last       text;
  v_role       text;
  v_status     text;
  v_is_admin   boolean := false;
  v_created    timestamptz;
  v_email      text;
  v_hint       text;
  v_auth_read  boolean := true;

  v_plan       jsonb := '[]'::jsonb;
  v_blockers   jsonb := '[]'::jsonb;
  v_warnings   jsonb := '[]'::jsonb;
  v_manual     jsonb := '[]'::jsonb;
  v_done       jsonb := '{}'::jsonb;

  r            record;
  v_kind       text;
  v_total      bigint := 0;

  v_roster     bigint := 0;
  v_cnotes     bigint := 0;
  v_store_n    bigint := 0;
  v_store_ok   boolean := true;
  v_paths      text[] := '{}';

  v_consents   bigint := 0;
  v_audit_n    bigint := 0;
  v_audit_red  bigint := 0;

  v_req_id     uuid;
  v_req_at     timestamptz;
  v_req_state  text;

  v_auth_gone  boolean := false;
  v_prof_gone  bigint  := 0;
  v_set        text;
  v_sql        text;
  v_ids        uuid[];
begin
  -- ---- שער -----------------------------------------------------------
  -- אדמין בלבד, בלי דלת אחורית ל-«הרצה בלי JWT». purge_expired_data
  -- כן מאפשרת את זה כי היא מיועדת ל-cron; זו לא. פעולה בלתי הפיכה על
  -- אדם מסוים חייבת זהות של מי שביצע אותה, אחרת ה-audit_log חסר ערך.
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;

  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  -- ---- מי זה בכלל --------------------------------------------------
  select p.first_name, p.last_name, p.role, p.approval_status,
         coalesce(p.is_admin, false), p.created_at
    into v_first, v_last, v_role, v_status, v_is_admin, v_created
    from public.profiles p
   where p.id = p_user;
  v_has_prof := found;

  begin
    select u.email into v_email from auth.users u where u.id = p_user;
    v_has_auth := found;
  exception when others then
    -- אין הרשאת קריאה ל-auth.users. לא מפילים את הדוח בגלל זה.
    v_auth_read := false;
  end;

  v_hint := case
    when coalesce(v_email, '') = '' then null
    else left(v_email, 2) || '***@' || split_part(v_email, '@', 2)
  end;

  -- ---- שלוש הסירובים -------------------------------------------------
  if not v_has_prof and not v_has_auth then
    -- uuid שהוקלד לא נכון לא יקבל «בוצע בהצלחה, 0 שורות».
    return jsonb_build_object(
      'ok', false, 'reason', 'user_not_found', 'user', p_user,
      'message', 'לא נמצא חשבון עם המזהה הזה — לא בפרופילים ולא במשתמשי ההזדהות.');
  end if;

  if p_user = auth.uid() then
    return jsonb_build_object(
      'ok', false, 'reason', 'refuse_self', 'user', p_user,
      'message', 'זה החשבון שאיתו אתם מחוברים. מחיקה עצמית דרך המסך הזה '
              || 'הייתה מנתקת אתכם באמצע הפעולה ומשאירה אותה חצי-גמורה.');
  end if;

  if v_is_admin then
    return jsonb_build_object(
      'ok', false, 'reason', 'refuse_admin', 'user', p_user,
      'message', 'החשבון הזה הוא חשבון מנהל. הסירו ממנו את הרשאת הניהול '
              || '(profiles.is_admin = false) ורק אז מחקו — כדי שמחיקה '
              || 'בטעות לא תוריד ניהול מהמערכת.');
  end if;

  -- ---- הדוח: מה יימחק, טבלה-טבלה ------------------------------------
  --
  -- קודם שתי השורות שהן השורש של הגרף ולכן לא מופיעות בו: הפרופיל עצמו
  -- ומשתמש ההזדהות. בלי שהן בדוח, האדמין קורא רשימה של טבלאות לוואי
  -- ולא רואה את השורה שממנה כל השאר משתרשר.
  if v_has_prof then
    v_plan := v_plan || jsonb_build_object(
      'table', 'profiles', 'column', 'id', 'depth', 0, 'rule', 'ROOT',
      'action', 'delete', 'rows', 1,
      'via', 'שורש השרשור — כל מה שמתחת נמחק בעקבותיה');
    v_total := v_total + 1;
  end if;
  if v_has_auth then
    v_plan := v_plan || jsonb_build_object(
      'table', 'auth.users', 'column', 'id', 'depth', 0, 'rule', 'ROOT',
      'action', 'delete', 'rows', 1,
      'via', 'ההתחברות עצמה — נמחקת בשלב נפרד, ראו auth_user_deleted בתוצאה');
    v_total := v_total + 1;
  end if;

  for r in select * from public._deletion_targets(p_user) loop
    v_kind := case
      -- ⚠ החריג המכוון היחיד. ראה סעיף 3 בראש הקובץ.
      when r.tbl in ('team_players', 'public.team_players')
       and r.col_name = 'player_id'                      then 'anonymise'
      when r.del_rule = 'CASCADE'                        then 'delete'
      when r.del_rule in ('SET NULL', 'SET DEFAULT')     then 'unlink'
      else                                                    'blocker'
    end;

    -- טבלאות בלי שורות רלוונטיות לא מרעישות את הדוח, אבל blocker כן —
    -- שם דווקא 0 שורות הוא המידע המעניין ("לא יעצור").
    if coalesce(r.rows_n, 0) > 0 or r.rows_n is null then
      v_plan := v_plan || jsonb_build_object(
        'table',  r.tbl,
        'column', r.col_name,
        'depth',  r.lvl,
        'rule',   r.del_rule,
        'action', v_kind,
        'rows',   r.rows_n,
        'via',    r.via_tbl);
    end if;

    if v_kind = 'delete' then
      v_total := v_total + coalesce(r.rows_n, 0);
    end if;

    if v_kind = 'blocker' and coalesce(r.rows_n, 0) > 0 then
      v_blockers := v_blockers || jsonb_build_object(
        'table', r.tbl, 'column', r.col_name, 'rows', r.rows_n, 'rule', r.del_rule);
    end if;

    if v_kind = 'anonymise' then
      v_roster := coalesce(r.rows_n, 0);
    end if;
  end loop;

  -- הערות המאמן על שורות הסגל האלה — שורדות את האנונימיזציה אם לא
  -- נוגעים בהן במפורש (ראה סעיף 3 בראש הקובץ).
  if to_regclass('public.coach_notes') is not null and v_roster > 0 then
    begin
      select count(*) into v_cnotes
        from public.coach_notes cn
        join public.team_players tp on tp.id = cn.roster_id
       where tp.player_id = p_user;
    exception when others then
      v_cnotes := 0;
    end;
  end if;

  -- ---- הקבצים ב-Storage ----------------------------------------------
  -- הקונבנציה: <סוג>/<uuid>/<קובץ>, כמו ב-media_path_owner. בנוסף
  -- נבדק owner, כדי לתפוס קבצים שהועלו מחוץ לקונבנציה. הגישה דרך
  -- to_jsonb(o) ולא o.owner בכוונה: הגרסאות החדשות של Supabase החליפו
  -- את העמודה ל-owner_id, ו-o.owner היה מפיל את כל הדוח ב-42703.
  if to_regclass('storage.objects') is not null then
    begin
      select count(*) into v_store_n
        from storage.objects o
       where o.bucket_id = 'media'
         and ((storage.foldername(o.name))[2] = p_user::text
              or (to_jsonb(o) ->> 'owner') = p_user::text);

      select coalesce(array_agg(s.n order by s.n), '{}'::text[]) into v_paths
        from (select o.name as n
                from storage.objects o
               where o.bucket_id = 'media'
                 and ((storage.foldername(o.name))[2] = p_user::text
                      or (to_jsonb(o) ->> 'owner') = p_user::text)
               order by o.name
               limit 20) s;
    exception when others then
      v_store_ok := false;
    end;
  else
    v_store_ok := false;
  end if;

  -- ---- מה **נשמר** בכוונה --------------------------------------------
  if to_regclass('public.consents') is not null then
    begin
      select count(*) into v_consents from public.consents c where c.minor_id = p_user;
    exception when others then v_consents := 0;
    end;
  end if;

  if to_regclass('public.audit_log') is not null then
    begin
      select count(*) into v_audit_n from public.audit_log a
       where a.subject = p_user or a.actor = p_user;
    exception when others then v_audit_n := 0;
    end;
  end if;

  -- ---- בקשת המחיקה שעל השולחן ----------------------------------------
  if to_regclass('public.account_deletion_requests') is not null then
    select adr.id, adr.created_at, adr.status
      into v_req_id, v_req_at, v_req_state
      from public.account_deletion_requests adr
     where adr.user_id = p_user
     order by (adr.status = 'pending') desc, adr.created_at desc
     limit 1;
  end if;

  -- ---- אזהרות ---------------------------------------------------------
  if v_req_id is null then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'no_request_on_file',
      'message', 'אין בקשת מחיקה רשומה על החשבון הזה. זה לא חוסם — יש '
              || 'מחיקות ביוזמת הורה, בצו, או אחרי פנייה טלפונית — אבל '
              || 'ודאו שיש לכם תיעוד חיצוני לבקשה.');
  elsif v_req_state = 'cancelled' then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'request_cancelled',
      'message', 'הבקשה האחרונה על החשבון הזה בוטלה (ההורה אישר מחדש). '
              || 'מחיקה עכשיו תסתור את הרצון האחרון שנרשם.');
  end if;

  if v_status = 'active' and v_req_state = 'pending' then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'active_account',
      'message', 'החשבון פעיל, ולא מושעה. ודאו שהבקשה אכן של בעל החשבון.');
  end if;

  if v_role = 'coach' then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'blast_radius_coach',
      'message', 'זה חשבון מאמן. המחיקה מוחקת בשרשור את הקבוצות שלו ואיתן '
              || 'את שורות הסגל, האימונים, הנוכחות והמשחקים — כולל רשומות '
              || 'של שחקנים אחרים. עברו על טבלת הפירוט לפני האישור.');
  end if;

  if not v_auth_read then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'auth_unreadable',
      'message', 'אין הרשאת קריאה ל-auth.users מההקשר הזה — אי אפשר להציג '
              || 'את המייל לאימות זהות, וגם המחיקה של המשתמש עצמו כנראה '
              || 'תיכשל ותדרוש שלב ידני.');
  end if;

  if not v_store_ok then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'storage_unreadable',
      'message', 'לא ניתן לקרוא את storage.objects מההקשר הזה. הקבצים לא '
              || 'ייספרו ולא יימחקו אוטומטית.');
  end if;

  -- ---- הדוח היבש: עוצרים כאן -----------------------------------------
  if v_dry then
    return jsonb_build_object(
      'ok', true,
      'dry_run', true,
      'user', p_user,
      -- הזהות המלאה — זה מה שמונע מחיקה של האדם הלא נכון
      'identity', jsonb_build_object(
        'first_name', v_first, 'last_name', v_last,
        'email', v_email, 'role', v_role,
        'approval_status', v_status, 'created_at', v_created,
        'has_profile', v_has_prof, 'has_auth_user', v_has_auth),
      'request', case when v_req_id is null then null else jsonb_build_object(
        'id', v_req_id, 'created_at', v_req_at, 'status', v_req_state) end,
      'plan', v_plan,
      'rows_to_delete', v_total,
      'roster_to_anonymise', v_roster,
      'coach_notes_to_delete', v_cnotes,
      'storage', jsonb_build_object(
        'readable', v_store_ok, 'bucket', 'media',
        'objects', case when v_store_ok then v_store_n else null end,
        'sample_paths', to_jsonb(v_paths)),
      'preserved', jsonb_build_object(
        'consents', jsonb_build_object(
          'rows', v_consents,
          'why', 'יומן ההסכמות הוא הראיה שהורה אישר, והוא נשמר בכוונה. '
              || 'אחרי מחיקת הפרופיל, guardians ו-consent_requests נמחקים '
              || 'בשרשור ואיתם השם, המייל והטלפון של ההורה — ולכן מה שנשאר '
              || 'הוא הכרעה בלי זהות (minor_id הופך ל-uuid תלוש). הטבלה '
              || 'מוגנת גם בטריגר שמונע כל שינוי בה.'),
        'audit_log', jsonb_build_object(
          'rows', v_audit_n,
          'why', 'שורות שבהן הוא נושא המידע — התוכן שלהן ימחק ויישאר שלד '
              || '(מי, מתי, אילו שדות). שורות שבהן הוא היה מי שפעל על אדם '
              || 'אחר נשארות שלמות: הן ההגנה של אותו אדם אחר.')),
      'blockers', v_blockers,
      'warnings', v_warnings,
      'next_step', 'select public.admin_execute_deletion(''' || p_user::text || ''', false);'
    );
  end if;

  -- ====================================================================
  --  מכאן והלאה — ביצוע. אין חזרה.
  -- ====================================================================

  -- FK חוסם עם שורות קיימות היה מפיל את ה-DELETE באמצע ומשאיר חשבון
  -- חצי-מחוק. עדיף לעצור לפני שנגענו במשהו.
  if jsonb_array_length(v_blockers) > 0 then
    return jsonb_build_object(
      'ok', false, 'reason', 'fk_blocker', 'user', p_user,
      'blockers', v_blockers,
      'message', 'יש מפתחות זרים שאינם מוגדרים לשרשור, ויש להם שורות. '
              || 'המחיקה הייתה נכשלת באמצע. טפלו בשורות האלה תחילה.');
  end if;

  -- 1) הערות המאמן על שורות הסגל — לפני האנונימיזציה, כי אחריה
  --    player_id כבר null ואי אפשר למצוא אותן.
  if to_regclass('public.coach_notes') is not null then
    begin
      delete from public.coach_notes cn
       using public.team_players tp
       where tp.id = cn.roster_id and tp.player_id = p_user;
      get diagnostics v_cnotes = row_count;
    exception when others then
      v_cnotes := -1;                          -- -1 = ניסינו ונכשלנו, לא «0 שורות»
    end;
  end if;

  -- 2) שורות הסגל — אנונימיזציה. ה-SET נבנה מהעמודות שקיימות בפועל,
  --    כדי שפריסה בלי supabase_player_card.sql לא תיפול על 42703.
  --    זהה ל-SET של purge_expired_data — שני המסלולים חייבים להשאיר
  --    את אותו שלד, אחרת יש שני סוגי «שחקן לשעבר» במערכת.
  if to_regclass('public.team_players') is not null and v_roster > 0 then
    select array_agg(tp.id) into v_ids
      from public.team_players tp where tp.player_id = p_user;

    select string_agg(format('%I = null', a.attname), ', ')
      into v_set
      from unnest(array['phone', 'notes', 'injury_note', 'birth_date',
                        'birth_year', 'height', 'availability_since']) as u(col)
      join pg_attribute a
        on a.attrelid = 'public.team_players'::regclass
       and a.attname  = u.col
       and a.attnum   > 0
       and not a.attisdropped;

    -- anonymised_at נוספה רק ב-supabase_audit_retention.sql. פריסה שטרם
    -- הריצה אותו עדיין צריכה להצליח למחוק חשבון — הסימון הוא נחמד לרטנשן,
    -- לא תנאי לכיבוד בקשת מחיקה.
    v_sql := format(
      'update public.team_players set %sname = %L, player_id = null%s '
      'where id = any($1)',
      case when v_set is null then '' else v_set || ', ' end,
      'שחקן לשעבר',
      case when exists (
             select 1 from pg_attribute a
              where a.attrelid = 'public.team_players'::regclass
                and a.attname = 'anonymised_at'
                and a.attnum > 0 and not a.attisdropped)
           then ', anonymised_at = now()' else '' end);
    execute v_sql using v_ids;
    get diagnostics v_roster = row_count;
  end if;

  -- 3) הקבצים
  if v_store_ok then
    begin
      delete from storage.objects o
       where o.bucket_id = 'media'
         and ((storage.foldername(o.name))[2] = p_user::text
              or (to_jsonb(o) ->> 'owner') = p_user::text);
      get diagnostics v_store_n = row_count;
    exception when others then
      v_store_ok := false;
      v_manual := v_manual || jsonb_build_object(
        'code', 'storage_manual',
        'message', 'מחיקת הקבצים נכשלה (אין בעלות על storage.objects '
                || 'מההקשר הזה). מחקו ידנית: Dashboard → Storage → media, '
                || 'ומחקו את התיקיות שמכילות את המזהה ' || p_user::text || '.');
    end;
  elsif v_store_n > 0 or to_regclass('storage.objects') is not null then
    v_manual := v_manual || jsonb_build_object(
      'code', 'storage_manual',
      'message', 'לא ניתן היה לגשת ל-storage.objects. בדקו ידנית ב-'
              || 'Dashboard → Storage → media אם נשארו קבצים של '
              || p_user::text || '.');
  end if;

  -- 4) הבקשה מסומנת כטופלה **לפני** המחיקה — היא עצמה תלויה ב-profiles
  --    עם cascade ותיעלם רגע אחרי. הראיה נשמרת ב-audit_log בסוף.
  if v_req_id is not null then
    update public.account_deletion_requests
       set status = 'done'
     where id = v_req_id and status <> 'done';
  end if;

  -- 5) הפרופיל — כאן קורה השרשור כולו
  if v_has_prof then
    delete from public.profiles where id = p_user;
    get diagnostics v_prof_gone = row_count;
  end if;

  -- 6) טשטוש היומן — **אחרי** מחיקת הפרופיל, ובכוונה:
  --    trg_audit_sensitive רושם את ה-DELETE של הפרופיל, והשורה הזו
  --    מכילה את תאריך הלידה ב-plain. טשטוש לפני המחיקה היה מפספס
  --    בדיוק את השורה הכי טרייה והכי חושפת.
  if to_regclass('public.audit_log') is not null then
    begin
      update public.audit_log a
         set details = jsonb_build_object(
               'redacted', 'account_deleted',
               'at', to_jsonb(now()),
               -- שמות השדות נשמרים, הערכים לא: «מה סוג השינוי» שורד,
               -- «מה היה הערך» נעלם.
               'fields', coalesce(
                 (select jsonb_agg(t.k order by t.k)
                    from jsonb_object_keys(a.details) as t(k)), '[]'::jsonb))
       where (a.subject = p_user
              -- שורות team_players נרשמות עם subject = player_id **החדש**,
              -- כלומר null אחרי הניתוק. נתפסות לפי הערך הישן שביומן.
              or (a.entity = 'team_players'
                  and a.details #>> '{player_id,from}' = p_user::text))
         and a.details -> 'redacted' is null;   -- אידמפוטנטי
      get diagnostics v_audit_red = row_count;
    exception when others then
      v_audit_red := -1;
    end;
  end if;

  -- 7) המשתמש עצמו. חשבון «מחוק» שאפשר להתחבר אליו גרוע מכלום.
  if v_has_auth then
    begin
      delete from auth.users where id = p_user;
      v_auth_gone := true;
    exception when others then
      v_auth_gone := false;
      v_manual := v_manual || jsonb_build_object(
        'code', 'auth_user_manual',
        'severity', 'critical',
        'message', '⚠ משתמש ההזדהות **לא נמחק** — כל המידע הוסר, אבל '
                || 'החשבון עדיין יכול להתחבר וייצור פרופיל חדש בכניסה '
                || 'הבאה. מחקו אותו ידנית עכשיו: Dashboard → Authentication '
                || '→ Users → חיפוש ' || coalesce(v_email, p_user::text)
                || ' → Delete user.');
    end;
  end if;

  -- 8) הראיה שההבטחה כובדה. audit_log חסר FK ולכן שורד את המחיקה —
  --    זה המקום היחיד שבו נשארת ההוכחה, כי שורת הבקשה נמחקה בסעיף 5.
  if to_regclass('public.audit_log') is not null then
    begin
      insert into public.audit_log (actor, action, entity, entity_id, subject, details)
      values (auth.uid(), 'delete', 'account', p_user, p_user,
              jsonb_build_object(
                'reason', 'account_deletion_request',
                'request_id', v_req_id,
                'request_created_at', v_req_at,
                -- ממוסך בכוונה: יומן שנועד להוכיח מחיקת מייל ושומר את
                -- המייל המלא מבטל את עצמו. מספיק לקשור תלונה עתידית.
                'email_hint', v_hint,
                'role', v_role,
                'rows_deleted', v_total,
                'roster_anonymised', v_roster,
                'coach_notes_deleted', v_cnotes,
                'storage_objects_deleted', case when v_store_ok then v_store_n else null end,
                'audit_rows_redacted', v_audit_red,
                'consents_preserved', v_consents,
                'auth_user_deleted', v_auth_gone,
                'profile_deleted', v_prof_gone > 0));
    exception when others then
      -- כישלון תיעוד לא הופך מחיקה שבוצעה ל«נכשלה».
      v_manual := v_manual || jsonb_build_object(
        'code', 'audit_write_failed',
        'message', 'המחיקה בוצעה אך רישום היומן נכשל. תעדו ידנית: מזהה '
                || p_user::text || ', בקשה ' || coalesce(v_req_id::text, '—') || '.');
    end;
  end if;

  v_done := jsonb_build_object(
    'profile_deleted',        v_prof_gone > 0,
    'rows_deleted',           v_total,
    'roster_anonymised',      v_roster,
    'coach_notes_deleted',    v_cnotes,
    'storage_objects_deleted', case when v_store_ok then v_store_n else null end,
    'audit_rows_redacted',    v_audit_red,
    'consents_preserved',     v_consents,
    'auth_user_deleted',      v_auth_gone,
    'request_marked_done',    v_req_id is not null);

  return jsonb_build_object(
    'ok', true,
    'dry_run', false,
    'user', p_user,
    'identity', jsonb_build_object(
      'first_name', v_first, 'last_name', v_last, 'email', v_email, 'role', v_role),
    'result', v_done,
    'manual_steps', v_manual,
    'warnings', v_warnings,
    'note', case
      when v_auth_gone or not v_has_auth
        then 'המחיקה הושלמה. שורת הבקשה עצמה נמחקה יחד עם החשבון — '
          || 'ההוכחה שהיא כובדה נשמרה ב-audit_log.'
      else '⚠ המחיקה בוצעה חלקית: המידע הוסר אך משתמש ההזדהות נשאר. '
        || 'ראו manual_steps — עד שתשלימו אותו, החשבון עדיין יכול להתחבר.'
    end);
end;
$$;

revoke all on function public.admin_execute_deletion(uuid, boolean) from public, anon;
grant execute on function public.admin_execute_deletion(uuid, boolean) to authenticated;


-- ---------------------------------------------------------------------
--  3) רענון סכימת ה-API + רישום בלדג'ר
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_account_deletion.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקת עשן אחרי ההרצה
--
--  ⚠ הפונקציה פתוחה לאדמין בלבד ונשענת על auth.uid(). מה-SQL Editor
--    אין JWT, ולכן is_admin() מחזירה false והכול ייפול על «למנהלים
--    בלבד». שתי דרכים לבדוק:
--
--    א) הדרך הנכונה — מהאפליקציה, מחובר כאדמין, מסך «הסכמות ומחיקות».
--       שם גם נבדק ה-UI, וזה מה שבאמת ירוץ בייצור.
--
--    ב) מה-SQL Editor — מתחזים ל-JWT של האדמין, בתוך טרנזקציה אחת:
--
--         begin;
--         select set_config('request.jwt.claims',
--                json_build_object('sub', '<ADMIN-UUID>')::text, true);
--         select public.is_admin();      -- חייב true, אחרת עצרו כאן
--         select jsonb_pretty(public.admin_execute_deletion('<TARGET-UUID>'));
--         rollback;                      -- הרצה יבשה ממילא לא משנה כלום
--
--  ---------------------------------------------------------------------
--  1) הרצה יבשה על חשבון לזרוק (פתחו חשבון שחקן חדש, שייכו אותו למאמן,
--     העלו לו קובץ, ובקשו מחיקה מהמסך «המידע שלי»):
--
--       select jsonb_pretty(public.admin_execute_deletion('<TARGET>'));
--
--     מה חייב לחזור:
--       · "dry_run": true
--       · identity עם השם והמייל **של האדם הנכון**. אם לא הוא — עצרו.
--       · plan — מערך של טבלאות עם depth / rule / action / rows.
--         ודאו שיש שם לפחות שורה אחת עם "action": "delete".
--       · שורת team_players חייבת להופיע עם "action": "anonymise"
--         ולא "delete". זו ההחלטה מסעיף 3, והיא צריכה להיראות בעין.
--       · storage.objects > 0 אם העליתם קובץ.
--       · preserved.consents — מספר, עם ההסבר למה הוא נשמר.
--       · request — מזהה הבקשה שהוגשה.
--     ובעיקר: **אף שורה במסד לא השתנתה**. ודאו:
--       select count(*) from public.profiles where id = '<TARGET>';   -- 1
--
--  2) שלושת הסירובים (כולם חייבים לחזור ok:false ולא לגעת בכלום):
--       select public.admin_execute_deletion('00000000-0000-0000-0000-000000000000');
--         → 'user_not_found'
--       select public.admin_execute_deletion('<ה-UUID שלכם עצמכם>');
--         → 'refuse_self'
--       select public.admin_execute_deletion('<UUID של אדמין אחר>');
--         → 'refuse_admin'
--     ומחשבון לא-אדמין, דרך REST:
--       await supabase.rpc('admin_execute_deletion', { p_user: '<uuid>' })
--         → שגיאה «למנהלים בלבד»
--
--  3) ההרצה האמיתית:
--
--       select jsonb_pretty(public.admin_execute_deletion('<TARGET>', false));
--
--     מה חייב לחזור:
--       · "dry_run": false, "ok": true
--       · result.profile_deleted: true
--       · result.auth_user_deleted: true  ← אם false, קראו manual_steps
--         ובצעו את השלב הידני **עכשיו**, לפני שממשיכים.
--       · result.roster_anonymised — מספר שורות הסגל שטופלו.
--
--  4) אימות שהמחיקה אמיתית (הריצו את כל השורות):
--
--       select count(*) from public.profiles where id = '<TARGET>';        -- 0
--       select count(*) from auth.users where id = '<TARGET>';             -- 0
--       select count(*) from public.guardians where minor_id = '<TARGET>'; -- 0
--       select count(*) from public.consent_requests
--        where minor_id = '<TARGET>';                                      -- 0
--       select count(*) from storage.objects
--        where bucket_id = 'media'
--          and (storage.foldername(name))[2] = '<TARGET>';                 -- 0
--
--     ומה ש**חייב** לשרוד:
--       select count(*) from public.consents where minor_id = '<TARGET>';
--         -- > 0 אם ההורה אישר. זו הראיה, והיא לא נמחקת.
--       select details from public.audit_log
--        where entity = 'account' and subject = '<TARGET>';
--         -- שורה אחת עם request_id, email_hint ממוסך וכל הספירות.
--
--     ומה שחייב להיות מטושטש:
--       select details from public.audit_log where subject = '<TARGET>'
--         and entity = 'profiles';
--         -- כל שורה כזו חייבת להיראות
--         --   {"at":..., "fields":["birth_date",...], "redacted":"account_deleted"}
--         -- ובשום מקרה לא ערך תאריך לידה אמיתי.
--
--     ושורת הסגל אצל המאמן:
--       select name, player_id, phone, notes, injury_note, anonymised_at
--         from public.team_players where anonymised_at is not null
--        order by anonymised_at desc limit 1;
--         -- name = 'שחקן לשעבר', player_id = null, השאר null.
--         -- מספר החולצה, הקבוצה והתפקיד — נשארו. זו הנקודה.
--       select count(*) from public.coach_notes cn
--         join public.team_players tp on tp.id = cn.roster_id
--        where tp.anonymised_at is not null;    -- 0 עבור השורה הזו
--
--  5) הבדיקה שאי אפשר לוותר עליה — ההתחברות:
--
--     נסו להתחבר לאפליקציה עם המייל והסיסמה של החשבון שנמחק.
--     התוצאה חייבת להיות «Invalid login credentials».
--     ואז נסו «שכחתי סיסמה» עם אותו מייל — גם זה לא אמור לשחזר חשבון.
--
--     ⚠ אם ההתחברות **עובדת**, המחיקה נכשלה בסעיף 7 בלי שקראתם את
--       manual_steps. לכו ל-Dashboard → Authentication → Users, חפשו את
--       המייל ומחקו. חשבון שנמחק ועדיין נכנס הוא הכשל הגרוע מכולם:
--       הוא ייצור פרופיל ריק חדש בכניסה הבאה, והמשתמש יראה מערכת
--       שהתעלמה מהבקשה שלו.
--
--  6) אידמפוטנטיות — הרצה שנייה על אותו מזהה:
--       select public.admin_execute_deletion('<TARGET>', false);
--         → 'user_not_found'. לא שגיאה, לא «נמחקו 0 שורות בהצלחה».
-- =====================================================================
