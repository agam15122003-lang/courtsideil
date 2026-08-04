-- =====================================================================
--  CourtSide — תזמון הניקוי (retention) והוכחה שהוא באמת רץ
--  נכתב 4.8.2026 · הרץ **אחרי** supabase_audit_retention.sql · אידמפוטנטי
--
--  ---------------------------------------------------------------
--  הפער שהקובץ הזה סוגר
--  ---------------------------------------------------------------
--  supabase_audit_retention.sql הגדיר את purge_expired_data(p_dry_run)
--  ואת טבלת retention_policy — כלומר את *המנגנון* ואת *החלונות*. מה
--  שלא היה שם: מישהו שקורא לפונקציה. הקובץ ההוא כתב את זה במפורש
--  (סעיף 5): «אין pg_cron בפרויקט. אל תניח שזה רץ מעצמו».
--
--  התוצאה בפועל היא הפער שהאודיט מכנה «הבטחה מול מנגנון»: מדיניות
--  הפרטיות מבטיחה מחיקה, בקוד יושבת פונקציה שיודעת למחוק, ובין השתיים
--  אין שום דבר שמתקתק. פונקציה שאיש לא קורא לה שווה, מבחינת נושא
--  המידע, בדיוק כמו פונקציה שלא נכתבה.
--
--  ---------------------------------------------------------------
--  מה נוצר כאן
--  ---------------------------------------------------------------
--   1) public.retention_schedule   — שורה אחת: האם הניקוי «דרוך», באיזו
--                                    תדירות, ומתי עורך דין אישר את החלונות.
--   2) public.retention_run_scheduled() — נקודת הכניסה שה-cron קורא לה.
--   3) הפעלת pg_cron ותזמון — אם הפרויקט מרשה. אם לא: הודעה בעברית
--                              עם בדיוק מה לעשות בדשבורד ומה להדביק אחרי.
--   4) public.admin_retention_status() — «מתי הניקוי רץ לאחרונה» לפאנל
--                                    האדמין, כדי ש«יש לנו retention» יהיה
--                                    דבר שבודקים ולא דבר שמניחים.
--
--  ---------------------------------------------------------------
--  ⚠ הקובץ הזה **אינו קובע ולא משנה שום תקופת שמירה**
--  ---------------------------------------------------------------
--  כל המספרים של הימים ממשיכים לחיות אך ורק בטבלת retention_policy
--  שנוצרה ב-supabase_audit_retention.sql. כאן לא נכתב ולא מתעדכן אף
--  ערך days. המספר היחיד שמופיע כאן הוא **תדירות הרצה** (מתי בודקים),
--  וזה דבר אחר לגמרי מ**תקופת שמירה** (כמה זמן שומרים).
--
--  ⚠ האזהרה מהקובץ הקודם נשארת בתוקפה במלואה: הערכים ב-retention_policy
--    הם מצייני מקום הנדסיים, **עורך דין חייב לאשר אותם**, ומחיקה היא
--    פעולה שאין ממנה חזרה. לכן ברירת המחדל כאן היא שהתזמון רץ **יבש**
--    (סופר ולא מוחק) עד שמישהו חותם — ראו סעיף 1.
--
--  המסמך הזה הוא תיעוד הנדסי ואינו ייעוץ משפטי.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) בדיקת תלות — ליפול בקול רם, בלי לשבור את ההרצה
--
--    אם purge_expired_data חסרה, הקובץ עדיין ייווצר במלואו (plpgsql מאתר
--    פונקציה חסרה רק בזמן ריצה, לא ביצירה) — אבל עדיף שהמריץ ידע מיד
--    ולא יגלה את זה בעוד חודש מלוג של cron.
-- ---------------------------------------------------------------------
do $dep$
begin
  if to_regprocedure('public.purge_expired_data(boolean)') is null then
    raise notice '';
    raise notice '===================================================================';
    raise notice '  ✋ עצור: public.purge_expired_data לא קיימת.';
    raise notice '  הרץ קודם את supabase_audit_retention.sql, ורק אז את הקובץ הזה.';
    raise notice '===================================================================';
    raise notice '';
  end if;
  if to_regclass('public.retention_policy') is null then
    raise notice 'retention_schedule: retention_policy לא קיימת — התזמון ייווצר, אבל אין לו מה לנקות.';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- 1) retention_schedule — המתג, ולמה הוא קיים
--
--    armed = false (ברירת המחדל): התזמון רץ, אבל **יבש**. הוא סופר כמה
--    שורות היו נמחקות, כותב את המספר ליומן, ולא נוגע בכלום. זה נותן
--    שני דברים לפני שנוגעים בנתונים אמיתיים:
--      · הוכחה שהמנגנון מתוזמן ופועל (יש חותמת זמן אחרונה);
--      · המספרים האמיתיים לעיון לפני שמוחקים.
--
--    armed = true: אותו תזמון מוחק בפועל.
--
--    ה-CHECK מקשר בין השניים: **אי אפשר לדרוך בלי לרשום מתי החלונות
--    אושרו**. זו לא בדיקה משפטית — המסד לא יודע מי חתם ואינו יכול לדעת.
--    זו מכשלה מכוונת: מי שדורך חייב לעצור לרגע ולמלא שדה שמתעד שהאישור
--    התקבל. בלי זה הדריכה נכשלת ברמת המסד.
--
--    למה טבלה ולא קבוע בקוד: כמו ב-retention_policy — הדריכה היא שורת
--    UPDATE אחת, בלי מיגרציה חדשה, ובלי לגעת בקובץ שכבר רץ בייצור.
-- ---------------------------------------------------------------------
create table if not exists public.retention_schedule (
  id            boolean primary key default true check (id),   -- שורה אחת בלבד
  armed         boolean     not null default false,
  cadence       text        not null default '25 3 * * *',     -- ⚠ UTC, לא שעון ישראל
  job_name      text        not null default 'courtside-retention-purge',
  lawyer_ok_at  timestamptz,                 -- מתי התקבל אישור לחלונות שב-retention_policy
  lawyer_note   text,                        -- מי אישר / מה בדיוק אושר
  updated_at    timestamptz not null default now(),
  constraint retention_schedule_armed_needs_signoff
    check (not armed or lawyer_ok_at is not null)
);

alter table public.retention_schedule enable row level security;

drop policy if exists "retention_schedule_admin_read" on public.retention_schedule;
create policy "retention_schedule_admin_read" on public.retention_schedule
  for select to authenticated using (public.is_admin());

-- אין policy של insert/update/delete בכוונה: הדריכה נעשית מה-SQL Editor
-- בלבד. משתמש — גם אדמין — לא ידרוך מחיקה אוטומטית דרך הדפדפן.
revoke all on public.retention_schedule from anon, authenticated;
grant select on public.retention_schedule to authenticated;

-- on conflict do nothing — הרצה חוזרת לא מבטלת דריכה קיימת ולא דורסת
-- תדירות שהבעלים שינה. זו אותה הקפדה שיש ב-retention_policy.
insert into public.retention_schedule (id) values (true)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 2) retention_run_scheduled — מה שה-cron מריץ
--
--    שכבה דקה מעל purge_expired_data שעושה שלושה דברים שהפונקציה
--    המקורית לא עושה, ובכוונה לא נגענו בה (הכלל: לא עורכים מיגרציה שרצה):
--      א) בוחרת יבש/אמיתי לפי המתג, במקום לקבוע את זה בטקסט של ה-cron;
--      ב) מסכמת את הספירות לאובייקט אחד;
--      ג) **כותבת שורת יומן גם בהרצה יבשה** — purge_expired_data כותבת
--         רק כשהיא מוחקת בפועל, ולכן בלי זה לא הייתה שום ראיה שהתזמון
--         בכלל התעורר. בדיוק את הראיה הזו סעיף 4 מדווח.
--
--    SECURITY DEFINER עם אותו שער בדיוק כמו ב-purge_expired_data:
--    auth.uid() is null (cron / SQL Editor / service_role) או אדמין.
--    זה נדרש כאן במיוחד: supabase_hardening_medium_3_8.sql מריץ לולאה
--    שמעניקה EXECUTE ל-authenticated לכל פונקציית DEFINER ב-public,
--    ולכן ההגנה חייבת להיות בגוף הפונקציה ולא בהרשאה בלבד.
-- ---------------------------------------------------------------------
create or replace function public.retention_run_scheduled(p_force_dry boolean default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_armed  boolean;
  v_dry    boolean;
  v_rows   jsonb  := '{}'::jsonb;
  v_total  bigint := 0;
begin
  if not (auth.uid() is null or coalesce(public.is_admin(), false)) then
    raise exception 'ניקוי נתונים מותר למנהלים בלבד';
  end if;

  select s.armed into v_armed from public.retention_schedule s where s.id;
  v_armed := coalesce(v_armed, false);

  -- p_force_dry מנצח תמיד. הוא קיים כדי שאדמין יוכל לבקש הרצה יבשה
  -- אפילו כשהמערכת דרוכה, בלי לשנות את המתג הלוך ושוב.
  v_dry := coalesce(p_force_dry, not v_armed);

  select coalesce(jsonb_object_agg(d.table_name, d.rows_affected), '{}'::jsonb),
         coalesce(sum(d.rows_affected), 0)
    into v_rows, v_total
    from public.purge_expired_data(v_dry) d;

  -- הראיה שהתזמון רץ. action נפרד ליבש ולאמיתי כדי שאפשר יהיה להבדיל
  -- ביניהם בדיעבד; 'purge' (בלי סיומת) נשארת השורה שמייצרת
  -- purge_expired_data עצמה בהרצה ידנית מה-SQL Editor.
  if to_regclass('public.audit_log') is not null then
    insert into public.audit_log (actor, action, entity, details)
    values (auth.uid(),
            case when v_dry then 'purge_dry' else 'purge_run' end,
            'retention_policy',
            jsonb_build_object('ran_at',  now(),
                               'dry_run', v_dry,
                               'armed',   v_armed,
                               'source',  case when auth.uid() is null then 'schedule' else 'admin' end,
                               'rows',    v_rows,
                               'total',   v_total));
  end if;

  return jsonb_build_object('ok', true, 'dry_run', v_dry, 'armed', v_armed,
                            'total', v_total, 'rows', v_rows, 'ran_at', now());
end;
$$;

revoke all on function public.retention_run_scheduled(boolean) from public, anon;
grant execute on function public.retention_run_scheduled(boolean) to authenticated;
do $rsr$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.retention_run_scheduled(boolean) to service_role;
  end if;
end $rsr$;


-- ---------------------------------------------------------------------
-- 3) ההפעלה והתזמון עצמם
--
--    שלושה שלבים, וכל אחד מהם עלול להיכשל בפרויקט Supabase רגיל בלי
--    שזו תקלה: הפעלת הרחבה דורשת הרשאות שה-SQL Editor לא תמיד מקבל.
--    לכן הכול עטוף ב-exception, והכישלון מסתיים בהוראות ולא בשגיאה
--    אדומה שמפילה את שאר הקובץ.
--
--    למה לא מחפשים סכימה קבועה בשם cron: pg_cron יכול להיות מותקן
--    בסכימות שונות (תלוי איך הופעל — דשבורד או SQL). לכן הסכימה נשלפת
--    מ-pg_depend לפי הפונקציה schedule ששייכת להרחבה, ולא מנוחשת.
-- ---------------------------------------------------------------------
do $cron$
declare
  v_schema  text;
  v_job     text;
  v_cadence text;
  v_armed   boolean;
  v_min     int;
begin
  select s.job_name, s.cadence, s.armed
    into v_job, v_cadence, v_armed
    from public.retention_schedule s where s.id;

  v_job     := coalesce(v_job, 'courtside-retention-purge');
  v_cadence := coalesce(v_cadence, '25 3 * * *');
  v_armed   := coalesce(v_armed, false);

  -- 3א) ניסיון להפעיל את ההרחבה. אם היא כבר מופעלת — לא קורה כלום.
  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise notice 'retention_schedule: לא ניתן היה להפעיל את pg_cron מכאן (%). ממשיכים לבדוק אם היא כבר מופעלת.', sqlerrm;
  end;

  -- 3ב) איתור הסכימה שבה יושבת cron.schedule
  select n.nspname into v_schema
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_depend  d  on d.objid = p.oid and d.deptype = 'e'
    join pg_extension e on e.oid = d.refobjid and e.extname = 'pg_cron'
   where p.proname = 'schedule'
   limit 1;

  if v_schema is null then
    -- ------------------------------------------------------------
    -- אין pg_cron. זה לא כישלון של הקובץ — זו הגדרה של הפרויקט.
    -- מדפיסים בדיוק מה לעשות, ומה להדביק אחרי.
    -- ------------------------------------------------------------
    raise notice '';
    raise notice '=====================================================================';
    raise notice '  ⚠ התזמון האוטומטי לא הופעל — ההרחבה pg_cron אינה זמינה בפרויקט.';
    raise notice '  כל השאר בקובץ הזה נוצר בהצלחה. חסר רק מי שילחץ על הכפתור.';
    raise notice '';
    raise notice '  מה לעשות (פעם אחת, בדשבורד של Supabase):';
    raise notice '    1. Database → Extensions';
    raise notice '    2. חפש pg_cron';
    raise notice '    3. הפעל (Enable)';
    raise notice '    4. חזור ל-SQL Editor והדבק את השורה הבאה:';
    raise notice '';
    -- ⚠ ב-RAISE אין %I/%L — יש רק %. לכן הגרשיים כתובים ידנית (כפולים).
    raise notice '       select cron.schedule(''%'', ''%'', $q$ select public.retention_run_scheduled(); $q$);',
                 v_job, v_cadence;
    raise notice '';
    raise notice '  לבדיקה שהתזמון נקלט:';
    raise notice '       select jobname, schedule, active from cron.job;';
    raise notice '';
    raise notice '  אם pg_cron לא זמינה בתוכנית שלך — יש שתי חלופות תקפות:';
    raise notice '    א) ידנית פעם בחודש מה-SQL Editor:';
    raise notice '         select public.retention_run_scheduled();';
    raise notice '    ב) Edge Function מתוזמן שקורא ל-RPC הזה עם service_role.';
    raise notice '';
    raise notice '  ⇦ עד שאחת מהשלוש פועלת, ההבטחה שבמדיניות הפרטיות אינה מגובה';
    raise notice '    במנגנון רץ. admin_retention_status() יראה זאת במפורש.';
    raise notice '=====================================================================';
    raise notice '';
    return;
  end if;

  -- 3ג) תזמון. מסירים קודם משימה קיימת באותו שם, כדי שהרצה חוזרת של
  --     הקובץ לא תיצור שתי משימות מקבילות שמנקות אותו דבר פעמיים.
  begin
    execute format('select %I.unschedule(%L)', v_schema, v_job);
  exception when others then
    null;   -- אין משימה קודמת בשם הזה — תקין לחלוטין בהרצה ראשונה
  end;

  begin
    execute format('select %I.schedule(%L, %L, %L)',
                   v_schema, v_job, v_cadence,
                   'select public.retention_run_scheduled();');

    raise notice 'retention_schedule: המשימה «%» תוזמנה (% · שעון UTC).', v_job, v_cadence;

    if v_armed then
      raise notice 'retention_schedule: המערכת **דרוכה** — ההרצה המתוזמנת מוחקת בפועל.';
    else
      raise notice 'retention_schedule: המערכת אינה דרוכה — ההרצה המתוזמנת רק סופרת ומתעדת, ולא מוחקת כלום.';
      raise notice 'retention_schedule: לדריכה (רק אחרי אישור החלונות ואחרי גיבוי):';
      raise notice '    update public.retention_schedule';
      raise notice '       set armed = true, lawyer_ok_at = now(),';
      raise notice '           lawyer_note = ''מי אישר ומה אושר'', updated_at = now()';
      raise notice '     where id;';
    end if;

    -- השוואת שכל ישר בין תדירות ההרצה לחלון הקצר ביותר. אם מנקים פעם
    -- בחודש וההבטחה היא 30 יום — הנתון עלול לחיות כמעט חודשיים.
    if to_regclass('public.retention_policy') is not null then
      select min(r.days) into v_min from public.retention_policy r;
      if v_min is not null then
        raise notice 'retention_schedule: החלון הקצר ביותר שמוגדר היום הוא % ימים, והתזמון הוא «%». התזמון חייב להיות תכוף יותר מהחלון, אחרת נתון ממשיך לחיות אחרי שהתקופה חלפה.', v_min, v_cadence;
      end if;
    end if;

  exception when others then
    raise notice '';
    raise notice '=====================================================================';
    raise notice '  ⚠ pg_cron קיימת, אבל התזמון נכשל: %', sqlerrm;
    raise notice '  לרוב זו הרשאה. נסה להדביק ידנית ב-SQL Editor:';
    raise notice '       select %.schedule(''%'', ''%'', $q$ select public.retention_run_scheduled(); $q$);',
                 v_schema, v_job, v_cadence;
    raise notice '=====================================================================';
    raise notice '';
  end;
end $cron$;


-- ---------------------------------------------------------------------
-- 4) admin_retention_status — «מתי זה רץ לאחרונה», לפאנל האדמין
--
--    בלי הפונקציה הזו, «יש לנו retention» היא הנחה. איתה זו שאלה שאפשר
--    לענות עליה במסך אחד: האם יש משימה מתוזמנת, האם היא פעילה, מתי היא
--    רצה בפועל, כמה שורות נגעו, ומה החלונות שלפיהם היא פועלת.
--
--    שדה state הוא הסיכום שה-UI מציג:
--      'not_scheduled' — אין משימה. שום דבר לא רץ.
--      'never_ran'     — יש משימה, מעולם לא רצה.
--      'dry_only'      — רץ, אבל רק יבש: סופר ולא מוחק (המצב עד לדריכה).
--      'running'       — רץ ומוחק, והריצה האחרונה טרייה.
--      'stale'         — דרוך, אבל הריצה האחרונה ישנה. משהו נשבר.
--
--    ⚠ הסף של 7 ימים ל-'stale' הוא **סף תפעולי** ליחס לתזמון יומי —
--      «לא רץ שבוע = ללכת לבדוק». הוא אינו תקופת שמירה ואין לו שום
--      משמעות משפטית. תקופות השמירה יושבות אך ורק ב-retention_policy,
--      והן מוחזרות כאן כמו שהן, בלי לגעת בהן.
--
--    ⚠ מה הפונקציה **לא** אומרת: היא לא מעידה שהחלונות עצמם נכונים או
--      אושרו. lawyer_ok_at הוא מה שמישהו הקליד, לא אימות. השדה קיים כדי
--      שיהיה אפשר לראות שהשאלה נשאלה — לא כדי לענות עליה.
-- ---------------------------------------------------------------------
create or replace function public.admin_retention_status()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_schema   text;
  -- משתנים נפרדים ולא record: אם השורה היחידה בטבלה חסרה (מסד שבו ה-insert
  -- נכשל), גישה לשדה של record ריק עלולה להתפוצץ — וזו פונקציית *דיווח*,
  -- היא חייבת להחזיר תשובה גם כשהמצב לא תקין.
  v_armed    boolean;
  v_cadence  text;
  v_job_name text;
  v_ok_at    timestamptz;
  v_ok_note  text;
  v_job      jsonb  := null;
  v_last_run timestamptz;
  v_last_dry timestamptz;
  v_last     jsonb   := '{}'::jsonb;
  v_policy   jsonb   := '[]'::jsonb;
  v_state    text;
  v_days     numeric;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'למנהלים בלבד';
  end if;

  select s.armed, s.cadence, s.job_name, s.lawyer_ok_at, s.lawyer_note
    into v_armed, v_cadence, v_job_name, v_ok_at, v_ok_note
    from public.retention_schedule s where s.id;

  -- 4א) מצב המשימה ב-pg_cron. דרך execute דינמי, כי הסכימה עשויה לא
  --     להתקיים כלל — ואז השאילתה הזו לא הייתה נקמפלת.
  select n.nspname into v_schema
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_depend  d  on d.objid = p.oid and d.deptype = 'e'
    join pg_extension e on e.oid = d.refobjid and e.extname = 'pg_cron'
   where p.proname = 'schedule'
   limit 1;

  if v_schema is not null and v_job_name is not null then
    begin
      execute format(
        'select jsonb_build_object(''jobname'', j.jobname, ''schedule'', j.schedule, ''active'', j.active)
           from %I.job j where j.jobname = $1 limit 1', v_schema)
      into v_job using v_job_name;
    exception when others then
      v_job := null;   -- אין הרשאת קריאה ל-cron.job — לא שגיאה, פשוט לא ידוע
    end;
  end if;

  -- 4ב) הריצות בפועל, מתוך יומן התיעוד.
  --     'purge'      — הרצה ידנית של purge_expired_data(false) מה-SQL Editor
  --     'purge_run'  — הרצה אמיתית דרך התזמון או דרך אדמין
  --     'purge_dry'  — הרצה יבשה
  if to_regclass('public.audit_log') is not null then
    select max(a.created_at) into v_last_run
      from public.audit_log a
     where a.entity = 'retention_policy' and a.action in ('purge', 'purge_run');

    select max(a.created_at) into v_last_dry
      from public.audit_log a
     where a.entity = 'retention_policy' and a.action = 'purge_dry';

    select coalesce(a.details, '{}'::jsonb) into v_last
      from public.audit_log a
     where a.entity = 'retention_policy'
       and a.action in ('purge', 'purge_run', 'purge_dry')
     order by a.created_at desc
     limit 1;
  end if;

  -- 4ג) החלונות עצמם — מוחזרים כמות שהם מ-retention_policy, ללא שינוי.
  if to_regclass('public.retention_policy') is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', r.key, 'days', r.days, 'method', r.method, 'what', r.what)
             order by r.key), '[]'::jsonb)
      into v_policy
      from public.retention_policy r;
  end if;

  -- 4ד) הסיכום
  v_days := case when v_last_run is null then null
                 else extract(epoch from (now() - v_last_run)) / 86400 end;

  if v_job is null then
    v_state := 'not_scheduled';
  elsif not coalesce(v_armed, false) then
    v_state := case when v_last_dry is null then 'never_ran' else 'dry_only' end;
  elsif v_last_run is null then
    v_state := 'never_ran';
  elsif v_days > 7 then
    v_state := 'stale';
  else
    v_state := 'running';
  end if;

  return jsonb_build_object(
    'state',              v_state,
    'armed',              coalesce(v_armed, false),
    'cadence',            v_cadence,
    'cadence_timezone',   'UTC',
    'job',                v_job,
    'cron_available',     v_schema is not null,
    'last_real_run_at',   v_last_run,
    'last_dry_run_at',    v_last_dry,
    'days_since_real_run', case when v_days is null then null else round(v_days, 1) end,
    'last_run_details',   v_last,
    'lawyer_ok_at',       v_ok_at,
    'lawyer_note',        v_ok_note,
    'policy',             v_policy,
    'checked_at',         now());
end;
$$;

revoke all on function public.admin_retention_status() from public, anon;
grant execute on function public.admin_retention_status() to authenticated;


-- ---------------------------------------------------------------------
-- 5) רענון סכימת ה-API + רישום בלדג'ר
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_retention_schedule.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקת עשן אחרי ההרצה
--
--  1) המתג נוצר, ואינו דרוך:
--       select armed, cadence, job_name, lawyer_ok_at from public.retention_schedule;
--     → armed = false. זו ברירת המחדל הנכונה.
--
--  2) המשימה מתוזמנת (רק אם pg_cron זמינה):
--       select jobname, schedule, active from cron.job
--        where jobname = 'courtside-retention-purge';
--     אם חוזר ריק — קרא את ה-NOTICE שסעיף 3 הדפיס. הוא מכיל את השורה
--     המדויקת להדבקה אחרי הפעלת ההרחבה בדשבורד.
--
--  3) הרצה ידנית של מה שה-cron יריץ (בטוח — לא דרוך, ולכן יבש):
--       select public.retention_run_scheduled();
--     → {"ok":true,"dry_run":true,"armed":false,"total":N,"rows":{...}}
--     שום שורה לא נמחקה. total הוא מה שהיה נמחק אילו הייתה דריכה.
--
--  4) הראיה נרשמה (מחשבון אדמין):
--       select action, details->>'total', created_at from public.audit_log
--        where entity = 'retention_policy' order by created_at desc limit 3;
--     → שורת 'purge_dry'. אם אין שורה — הניקוי לא באמת רץ.
--
--  5) הדוח לפאנל (מחשבון אדמין):
--       select public.admin_retention_status();
--     → state = 'dry_only' אחרי בדיקה 3. מחשבון מאמן רגיל הקריאה
--       חייבת ליפול על «למנהלים בלבד».
--
--  6) הדריכה חסומה בלי חתימה — זו הבדיקה החשובה כאן:
--       update public.retention_schedule set armed = true where id;
--     → חייב להיכשל על retention_schedule_armed_needs_signoff.
--
--  7) הרצה חוזרת של הקובץ אינה מכפילה משימות ואינה מבטלת דריכה:
--       -- הרץ את הקובץ שוב --
--       select count(*) from cron.job where jobname = 'courtside-retention-purge';  -- 1
--       select armed from public.retention_schedule;                                -- לא השתנה
--
--  ---------------------------------------------------------------
--  איך דורכים באמת, כשמגיע הרגע
--  ---------------------------------------------------------------
--   א) לוודא שהערכים ב-retention_policy אושרו על ידי עורך דין.
--      ⚠ נדרשת בדיקת עורך דין — הקובץ הזה אינו מספק אותה ואינו מחליף אותה.
--   ב) גיבוי: Supabase → Database → Backups.
--   ג) להסתכל במספרים היבשים:  select * from public.admin_purge_report();
--   ד) ורק אז:
--        update public.retention_schedule
--           set armed = true, lawyer_ok_at = now(),
--               lawyer_note = 'מי אישר, מתי, ואילו סעיפים', updated_at = now()
--         where id;
--   ה) למחרת:  select public.admin_retention_status();  → state = 'running'.
--
--  לביטול הדריכה בכל רגע (ההרצה חוזרת להיות יבשה, התזמון ממשיך):
--        update public.retention_schedule set armed = false, updated_at = now() where id;
--
--  להסרת התזמון לגמרי:
--        select cron.unschedule('courtside-retention-purge');
-- =====================================================================
