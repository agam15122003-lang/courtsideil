-- =====================================================================
-- CourtSide — עולם המשחק: השכבה המשפטית  ·  12.8.2026
--
-- מה זה נותן: שלוש הגנות שבלעדיהן אסור לתת לקטין אמיתי להיכנס לאתגר.
--
--   1) **קטגוריית הסכמה חמישית: competition** — «השתתפות בתחרויות
--      מיומנות ובקבלת פרסים, לרבות מגורם ממומן». הבעלים בחר להשיק עם
--      פרס כבר באתגר הראשון, ופרס לקטין הוא בדיוק מה שההורה צריך לאשר
--      בשמו — בנפרד מהסכמה לשימוש בשירות ובנפרד מהסכמה לפרסום.
--
--   2) **חסימת «מאמן קטין»** — הפרצה החמורה ביותר שנמצאה בקוד הקיים.
--      כל שער הגיל יושב בתוך `if new.role = 'player'`
--      (supabase_parent_consent.sql:528). למשתמש role='coach' אין חובת
--      תאריך לידה, אין pending_parent, ו-is_active_user() מחזירה true.
--      ילד בן 14 שמגיע מאינסטגרם, ורואה מסך שבו «מאמן» מסומן מראש
--      ו«שחקן» מתויג «צריך קוד מהמאמן» (RolePicker.jsx:14) — עובר את
--      **כל** מנגנון ההגנה על קטינים, ובנוסף profiles_select_related
--      חושפת את שמו המלא ואת מועדונו לכל משתמש רשום.
--
--      ⚠ למה טריגר חדש ולא עריכה של enforce_minor_consent: עריכה של
--      פונקציה ממיגרציה קודמת נמחקת בהרצה חוזרת שלה — בשקט, בלי שאיש
--      ישים לב. התקדים הנכון הוא supabase_retention_schedule.sql:119.
--
--   3) **מרשם פרסומים** — בלי רישום של מה פורסם ואיפה, «מחק הכל» של
--      הורה אינו יכול להצביע על הפוסט. מחיקה שאינה יכולה להצביע אינה מחיקה.
--
-- אידמפוטנטי.
-- דורש: supabase_game_core_12_8.sql (38) · supabase_parent_consent.sql ·
--       supabase_admin_requests.sql · supabase_teams_admin.sql (is_admin)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) בדיקת תלות
-- ---------------------------------------------------------------------
do $dep$
begin
  if to_regclass('public.game_settings') is null then
    raise notice '';
    raise notice '===================================================================';
    raise notice '  ✋ עצור: public.game_settings לא קיימת.';
    raise notice '  הרץ קודם את supabase_game_core_12_8.sql (קובץ 38).';
    raise notice '===================================================================';
  end if;
  if to_regclass('public.consents') is null then
    raise notice '  ✋ עצור: public.consents חסרה — הרץ supabase_parent_consent.sql.';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- 1) קטגוריית ההסכמה החמישית
--
--     ⚠ הוספת ערך ל-CHECK מחייבת להפיל ולבנות מחדש את האילוץ — אין
--     `alter constraint add value`. התקדים המדויק לחיקוי:
--     supabase_personal_training_4_8.sql:60-83. הלולאה מוצאת את האילוץ
--     לפי שמו האמיתי, כי השם שנוצר אוטומטית שונה בין סביבות.
--     ⚠ הרשימה חייבת לכלול את **כל** הערכים הקיימים, אחרת שורות ותיקות
--     יפרו את האילוץ החדש וההרצה תיכשל.
-- ---------------------------------------------------------------------
do $ck$
declare r record;
begin
  if to_regclass('public.consents') is null then return; end if;

  for r in
    select conname from pg_constraint
     where conrelid = 'public.consents'::regclass
       and contype  = 'c'
       and pg_get_constraintdef(oid) ilike '%consent_type%'
  loop
    execute format('alter table public.consents drop constraint %I', r.conname);
  end loop;

  alter table public.consents add constraint consents_consent_type_check
    check (consent_type in ('basic', 'media_team', 'media_public',
                            'marketing', 'personal_training', 'competition'));
end $ck$;


-- ---------------------------------------------------------------------
-- 2) חסימת «מאמן קטין»
--
--     שתי בדיקות, ובכוונה בעוצמה שונה:
--
--       א. **גיל שהוצהר ומעיד על קטין ⇒ חסימה תמיד.** אין מצב שבו
--          מישהו שהצהיר על גיל 14 מקבל חשבון מאמן.
--       ב. **דרישה למלא תאריך לידה ⇒ מאחורי מתג, כבוי כברירת מחדל.**
--          אם נדרוש את זה לפני שמסך ההרשמה יודע לאסוף תאריך לידה
--          ממאמן, **כל הרשמת מאמן חדשה בפרוד תישבר**. זה בדיוק הדפוס
--          של v_frontend_ready ב-supabase_hardening_medium_3_8.sql.
--          מדליקים את המתג אחרי שהפרונט עלה:
--             update public.game_settings set require_coach_birthdate = true;
--
--     ⚠ הטריגר פועל רק כשהפרופיל **מושלם עכשיו** — פרופילי מאמן קיימים
--     בלי תאריך לידה אינם נוגעים ואינם נשברים בעריכה.
-- ---------------------------------------------------------------------
-- עטוף: אם 38 טרם רץ, ALTER על טבלה שאינה קיימת מפיל את **כל** הקובץ.
do $rq$
begin
  if to_regclass('public.game_settings') is not null then
    alter table public.game_settings
      add column if not exists require_coach_birthdate boolean not null default false;
  end if;
end $rq$;

create or replace function public.game_block_minor_coach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_completing boolean; v_age int; v_require boolean;
begin
  -- «הפרופיל מושלם עכשיו»: יצירה, או המעבר הראשון משם ריק לשם מלא.
  --
  -- ⚠ חייב להיות IF ולא ביטוי אחד עם OR: ב-INSERT הרשומה OLD אינה
  -- מוקצית כלל, ו-plpgsql מעריך את הביטוי **כולו** כשאילתה אחת — כלומר
  -- `tg_op='INSERT' or old.first_name...` היה זורק «record old is not
  -- assigned yet» ומפיל כל יצירת פרופיל במערכת. אין קיצור מסלול ב-OR.
  if tg_op = 'INSERT' then
    v_completing := true;
  else
    v_completing := coalesce(old.first_name, '') = ''
                and coalesce(new.first_name, '') <> '';
  end if;

  if not v_completing or new.role is distinct from 'coach' then
    return new;
  end if;

  v_age := public.minor_age(new.birth_date, new.birth_year);

  -- א. הצהיר על גיל, והגיל מעיד על קטין — חסימה מוחלטת.
  if v_age is not null and v_age < 18 then
    raise exception 'חשבון מאמן מיועד לבגירים (18+). אם אתה שחקן — חזור אחורה ובחר «שחקן».'
      using errcode = '55000';
  end if;

  -- ב. לא הצהיר בכלל — נדרש רק כשהמתג דלוק.
  select coalesce(g.require_coach_birthdate, false) into v_require
    from public.game_settings g where g.id;

  if coalesce(v_require, false) and v_age is null then
    raise exception 'חובה למלא תאריך לידה.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists game_block_minor_coach_trg on public.profiles;
create trigger game_block_minor_coach_trg
  before insert or update on public.profiles
  for each row execute function public.game_block_minor_coach();

comment on function public.game_block_minor_coach() is
  'סוגר את הפרצה שבה קטין נרשם כ«מאמן» ועוקף את כל שער הקטינים, שיושב '
  'כולו בתוך if new.role = ''player'' ב-enforce_minor_consent. טריגר נפרד ולא '
  'עריכה של הפונקציה ההיא — עריכה נמחקת בהרצה חוזרת של המיגרציה שיצרה אותה.';


-- ---------------------------------------------------------------------
-- 3) game_publications — מה פורסם, איפה, ומתי הוסר
--
--     ⚠ בלי מפתחות זרים אל game_challenge_submissions: הקובץ הזה (39)
--     רץ **לפני** 40 שיוצר אותה. ההצמדה נאכפת בקוד שכותב את השורה.
-- ---------------------------------------------------------------------
create table if not exists public.game_publications (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid,
  challenge_id  uuid,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  platform      text not null default 'instagram',
  external_url  text,
  posted_at     timestamptz not null default now(),
  posted_by     uuid references public.profiles(id) on delete set null,
  removed_at    timestamptz,
  removed_by    uuid references public.profiles(id) on delete set null,
  note          text
);

create index if not exists game_pubs_user_idx on public.game_publications (user_id, posted_at desc);
create index if not exists game_pubs_open_idx on public.game_publications (user_id) where removed_at is null;

comment on table public.game_publications is
  'מרשם הפרסומים החיצוניים. נכתב **בעת הייצוא, חובה** — מסך האדמין אינו '
  'מאפשר להוריד קליפ בלי לרשום שורה. בלי המרשם, בקשת הורה למחוק הכל אינה '
  'יכולה להצביע על הפוסט שכבר עלה.';

alter table public.game_publications enable row level security;

drop policy if exists "game_pubs_admin" on public.game_publications;
create policy "game_pubs_admin" on public.game_publications
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.game_publications from anon, authenticated;
grant select, insert, update on public.game_publications to authenticated;


-- ---------------------------------------------------------------------
-- 4) ביטול הסכמת פרסום ⇒ משימת אדמין «הסר פרסומים»
--
--     ⚠ **כל הגוף עטוף ב-exception.** משימת מעקב היא רשת ביטחון, ואסור
--     שרשת ביטחון תפיל את הפעולה שהיא מגנה עליה: אם הטריגר ייכשל (מגבלת
--     הקצב של admin_requests, למשל), ביטול ההסכמה של ההורה היה מתגלגל
--     אחורה — כלומר ההורה לוחץ «אני מבטל» ושום דבר לא קורה.
-- ---------------------------------------------------------------------
create or replace function public.game_consent_revoked_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_open int;
begin
  begin
    if new.consent_type <> 'media_public' or new.value not in ('revoked', 'denied') then
      return new;
    end if;

    select count(*) into v_open
      from public.game_publications
     where user_id = new.minor_id and removed_at is null;

    if coalesce(v_open, 0) = 0 then
      return new;
    end if;

    insert into public.admin_requests (user_id, kind, message)
    values (new.minor_id, 'consent_change',
            'הורה ביטל הסכמת פרסום. יש ' || v_open ||
            ' פרסומים פתוחים שדורשים הסרה — ראה game_publications.');
  exception when others then
    -- לא מפילים את ביטול ההסכמה בשום מצב.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists game_consent_revoked_trg on public.consents;
create trigger game_consent_revoked_trg
  after insert on public.consents
  for each row execute function public.game_consent_revoked_alert();


-- ---------------------------------------------------------------------
-- 5) הרשאות
-- ---------------------------------------------------------------------
revoke all on function public.game_block_minor_coach()     from public, anon, authenticated;
revoke all on function public.game_consent_revoked_alert() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- רישום
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_game_legal_12_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) הקטגוריה החמישית נוספה:
--       select pg_get_constraintdef(oid) from pg_constraint
--        where conrelid='public.consents'::regclass and contype='c'
--          and pg_get_constraintdef(oid) ilike '%consent_type%';
--     חייב להכיל 'competition'.
--
--  2) **הבדיקה החשובה** — קטין לא יכול להיות מאמן.
--     מחשבון בדיקה חדש, במסך ההרשמה: בחר «מאמן», מלא שם ותאריך לידה
--     של בן 15, ושמור. חייבת לחזור השגיאה בעברית.
--     מה-SQL Editor אפשר לבדוק כך:
--       insert into public.profiles (id, first_name, role, birth_date)
--       values (gen_random_uuid(), 'בדיקה', 'coach', '2011-01-01');
--     חייב להיכשל. (מזהה שאינו קיים ב-auth.users ייכשל ממילא על מפתח
--     זר — לכן עדיף לבדוק דרך המסך.)
--
--  3) מאמן קיים לא נשבר: פתח פרופיל של מאמן ותיק בלי תאריך לידה,
--     שנה שדה כלשהו ושמור. חייב לעבור.
--
--  4) המתג עדיין כבוי (נכון — מדליקים רק אחרי שהפרונט אוסף תאריך לידה):
--       select require_coach_birthdate from public.game_settings;
--     חייב להחזיר false.
--
--  5) ביטול הסכמה לא נשבר בגלל רשת הביטחון: בטל הסכמת media_public
--     לקטין שיש לו פרסום פתוח, וּודא שהביטול נרשם ב-consents **וגם**
--     שנוצרה שורה ב-admin_requests.
--
--  6) הרצה חוזרת של הקובץ כולו — חייבת לעבור נקי.
-- =====================================================================
