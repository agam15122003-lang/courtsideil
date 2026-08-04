-- =====================================================================
--  CourtSide — ערוץ פנייה לאדמין + החלפת אפוטרופוס בידי אדמין
--  נכתב 4.8.2026 · הרץ אחרי supabase_parent_consent.sql · אידמפוטנטי
--
--  הבעיה שהקובץ הזה סוגר:
--  מודל ההסכמה שנבנה ב-supabase_parent_consent.sql נועל את פרטי ההורה
--  ברגע שנרשמה הכרעה כלשהי (granted / revoked), ואת נתוני הגיל ברגע
--  שהשער נסגר. הנעילות האלה נכונות — בלעדיהן קטין היה מסיט את הפיקוח
--  למייל שבשליטתו ומאשר לעצמו. אבל הן משאירות משפחות אמיתיות תקועות
--  בלי שום מוצא בתוך האפליקציה:
--    · ההורה שאישר איבד את המייל / החליף כתובת;
--    · הורים פרודים, וההסכמה נרשמה על ההורה הלא נכון;
--    · תאריך לידה שהוקלד שגוי והשער נסגר על בגיר.
--  לאדמין כבר יש כלים לתקן מצב הסכמה (admin_set_consent,
--  admin_set_approval, admin_revoke_consent) — מה שחסר הוא (א) ערוץ
--  שדרכו המשתמש התקוע בכלל מגיע אליו, ו-(ב) יכולת להחליף את ההורה
--  הרשום, שהיום שום פונקציה במסד לא יודעת לעשות.
--
--  מה נוצר כאן:
--   1) public.admin_requests — פניות משתמש לאדמין. RLS מלא, הגבלת קצב
--      של 5 פניות פתוחות למשתמש, ובמכוון **מחוץ** לשער החשבון-הפעיל.
--   2) public.admin_requests_list()      — רשימה לאדמין, עם ההקשר.
--   3) public.admin_mark_request_done()  — סגירת פנייה.
--   4) public.admin_set_guardian()       — החלפת ההורה הרשום.
--
--  ⚠ תלות: public.is_admin() (supabase_teams_admin.sql).
--    public.guardians / public.consents / public.latest_consent()
--    (supabase_parent_consent.sql) — נדרשות רק ל-admin_set_guardian.
--    בלי is_admin() הקובץ לא יוצר כלום, רק מדפיס NOTICE ומסתיים בהצלחה.
-- =====================================================================


-- ---------------------------------------------------------------------
--  0) בדיקת תלות — לכשול בקול רם, בלי לשבור את ההרצה
-- ---------------------------------------------------------------------
do $dep$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise notice '';
    raise notice '===================================================================';
    raise notice '  ✋ עצור: public.is_admin() לא קיימת.';
    raise notice '  הרץ קודם את supabase_teams_admin.sql, ורק אז את הקובץ הזה.';
    raise notice '===================================================================';
  end if;
  if to_regclass('public.guardians') is null then
    raise notice '';
    raise notice '  ℹ public.guardians חסרה — admin_set_guardian() לא תיווצר.';
    raise notice '    (טבלת הפניות והפונקציות שסביבה כן ייווצרו.)';
    raise notice '    הרץ את supabase_parent_consent.sql וחזור לכאן.';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
--  1) admin_requests — ערוץ הפנייה
--
--  message מוגבל ל-1000 תווים ברמת ה-check ולא רק ב-UI: הפנייה נכתבת
--  בכתיבה ישירה מהלקוח (PostgREST), ולכן הגבול חייב להיות במסד.
--  kind ברירת מחדל 'other' כדי שגם לקוח ישן שלא מכיר את השדה יעבוד.
-- ---------------------------------------------------------------------
create table if not exists public.admin_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'other'
             check (kind in ('guardian_change', 'consent_change', 'age_correction', 'other')),
  message    text check (message is null or char_length(message) <= 1000),
  status     text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);

-- הפניות הפתוחות קודם, והחדשות בראש — בדיוק סדר התצוגה בפאנל.
create index if not exists admin_requests_status_idx
  on public.admin_requests (status, created_at desc);

-- לשליפת «הפניות שלי» ולספירת ההגבלה בטריגר.
create index if not exists admin_requests_user_idx
  on public.admin_requests (user_id, created_at desc);

comment on table public.admin_requests is
  'פניות משתמש לאדמין. ⚠ אסור להוסיף את הטבלה הזו למערך הטבלאות של '
  'supabase_consent_enforcement.sql — היא ערוץ ההצלה של משתמש חסום/מושעה.';


-- ---------------------------------------------------------------------
--  2) RLS
--
--  insert: רק על עצמך. select: שלך או של אדמין. update: אדמין בלבד
--  (שינוי הסטטוס). delete: אין policy בכלל וגם אין grant — פנייה
--  שנפתחה לא נמחקת בידי מי שפתח אותה, אחרת אפשר למחוק ראיה לפנייה
--  שנשלחה ולא טופלה. מחיקת החשבון כן מנקה אותן, דרך ה-cascade.
-- ---------------------------------------------------------------------
alter table public.admin_requests enable row level security;

drop policy if exists "admin_requests_insert_own" on public.admin_requests;
create policy "admin_requests_insert_own" on public.admin_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "admin_requests_select_own" on public.admin_requests;
create policy "admin_requests_select_own" on public.admin_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "admin_requests_update_admin" on public.admin_requests;
create policy "admin_requests_update_admin" on public.admin_requests
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.admin_requests from anon, authenticated;
grant select, insert, update on public.admin_requests to authenticated;


-- ---------------------------------------------------------------------
--  3) ⚑ הטבלה הזו חייבת להישאר מחוץ לשער החשבון-הפעיל
--
--  supabase_consent_enforcement.sql מייצר מדיניות RESTRICTIVE על INSERT
--  לכל טבלה במערך קשיח שבתוכו, בשם '<table>_active_gate', עם התנאי
--  is_active_user() and not is_banned(). admin_requests אינה במערך —
--  נבדק בקריאת הקובץ, שורות 89-121 — ולכן כרגע שום שער לא חל עליה.
--
--  ומדוע היא חייבת להישאר בחוץ: זה הערוץ **היחיד** שדרכו קטין שממתין
--  להסכמת הורה, חשבון מושעה אחרי ביטול הסכמה, או משתמש שנחסם, מגיעים
--  לבן אדם. שער שחוסם אותו הופך את המצב התקוע למצב סופי — בדיוק כמו
--  ההחרגה של account_deletion_requests שם, ומאותו היגיון.
--
--  ההגנה בפועל: מדיניות restrictive אי אפשר לנטרל במדיניות permissive
--  (הן מתאחדות ב-AND), ולכן «carve-out מתירני» הוא חסר משמעות טכנית —
--  הדרך היחידה היא להסיר את השער אם מישהו יצר אותו. השורה שלמטה עושה
--  בדיוק את זה, והיא no-op בכל הרצה שבה השער לא קיים. אם מתישהו
--  תתווסף הטבלה למערך שם, הרצה חוזרת של הקובץ הזה מחזירה את המצב
--  לתקין — והתיעוד ב-comment on table שלמעלה נועד למנוע את זה מראש.
-- ---------------------------------------------------------------------
drop policy if exists "admin_requests_active_gate" on public.admin_requests;


-- ---------------------------------------------------------------------
--  4) הגבלת קצב — עד 5 פניות פתוחות למשתמש
--
--  בטריגר ולא ב-check constraint, כי הבדיקה היא על שורות אחרות בטבלה.
--  security definer + search_path: הספירה חייבת לראות את כל השורות של
--  אותו משתמש גם כשה-RLS של הקורא היה מסתיר אותן.
--
--  «פתוחות» ולא «ב-24 שעות»: אדמין שסוגר פנייה משחרר מיד מכסה. משתמש
--  שכתב 5 פעמים ואיש לא ענה לו — הפנייה השישית לא תוסיף מידע, והמכסה
--  היא ההגנה על תיבת האדמין. הודעת השגיאה עברית ומיועדת להיות מוצגת.
--  errcode 54000 (program_limit_exceeded) נבחר כדי שהפרונט יזהה את
--  המצב הזה בוודאות ולא ינחש לפי טקסט.
--
--  בנוסף הטריגר מקבע status ו-created_at: שניהם נכתבים מהלקוח בכתיבה
--  ישירה, ואסור שמשתמש יפתח פנייה שכבר מסומנת 'done' (כלומר בלתי
--  נראית בפועל בראש הרשימה) או יזייף תאריך.
-- ---------------------------------------------------------------------
create or replace function public.admin_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open int;
begin
  new.status     := 'open';
  new.created_at := now();
  new.message    := nullif(btrim(coalesce(new.message, '')), '');

  select count(*) into v_open
    from public.admin_requests ar
   where ar.user_id = new.user_id and ar.status = 'open';

  if v_open >= 5 then
    raise exception 'יש כבר 5 פניות פתוחות בשמך. המתן שנטפל בהן לפני שליחת פנייה נוספת.'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_admin_requests_guard on public.admin_requests;
create trigger trg_admin_requests_guard
  before insert on public.admin_requests
  for each row execute function public.admin_requests_guard();

-- פונקציית טריגר — אין שום סיבה שתהיה קריאה ישירות. לא שוללים
-- מ-authenticated דווקא: הרשאת ה-EXECUTE נבדקת ביצירת הטריגר, ואין
-- טעם לסמוך על התנהגות שעלולה להשתנות בגרסת שרת אחרת. קריאה ישירה
-- ממילא נופלת על "can only be called as a trigger".
revoke all on function public.admin_requests_guard() from public, anon;


-- ---------------------------------------------------------------------
--  5) admin_requests_list() — הרשימה לאדמין, עם ההקשר לפעולה
--
--  ה-join על profiles ו-guardians אינו נוחות: פנייה מסוג
--  guardian_change בלי לדעת מה ה-approval_status של הפונה ומי ההורה
--  הרשום עליו כרגע מחייבת שתי שליפות נוספות לפני כל החלטה, ובפאנל
--  אדמין זה בדיוק המקום שבו טועים. guardian_email נלקח מ-guardians
--  ובנפילה חוזרת מהעמודה הישנה בפרופיל, כמו ב-admin_pending_minors.
--
--  drop לפני create: שינוי בעמודות ה-returns table מחייב זאת, ובלעדיו
--  הרצה חוזרת אחרי עדכון תיפול על 42P13.
-- ---------------------------------------------------------------------
drop function if exists public.admin_requests_list();
create or replace function public.admin_requests_list()
returns table (
  id              uuid,
  user_id         uuid,
  first_name      text,
  last_name       text,
  kind            text,
  message         text,
  status          text,
  created_at      timestamptz,
  approval_status text,
  guardian_email  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;
  return query
    select ar.id, ar.user_id, p.first_name, p.last_name,
           ar.kind, ar.message, ar.status, ar.created_at,
           p.approval_status,
           coalesce(
             (select g.email from public.guardians g where g.minor_id = ar.user_id),
             p.guardian_email
           )
      from public.admin_requests ar
      left join public.profiles p on p.id = ar.user_id
     order by (ar.status = 'open') desc, ar.created_at desc;
end;
$$;

revoke all on function public.admin_requests_list() from public, anon;
grant execute on function public.admin_requests_list() to authenticated;


-- ---------------------------------------------------------------------
--  6) admin_mark_request_done(p_id) — סגירת פנייה
-- ---------------------------------------------------------------------
create or replace function public.admin_mark_request_done(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;
  update public.admin_requests set status = 'done' where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_mark_request_done(uuid) from public, anon;
grant execute on function public.admin_mark_request_done(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  7) admin_set_guardian() — החלפת ההורה הרשום, בידי אדמין בלבד
--
--  ── למה מסלול אדמין לגיטימי כאן, בזמן שהמסלול של הקטין נשאר נעול ──
--  הנעילה ב-enforce_minor_consent (parent_consent סעיף 7) והנעילה
--  ב-create_consent_request ('email_locked') מגנות מפני תרחיש אחד
--  ומדויק: הקטין עצמו מסיט את הפיקוח למייל שבשליטתו. ההגנה היא על
--  *זהות הכותב*, לא על השדה. אדמין אינו הצד שההגנה מגנה מפניו — הוא
--  הצד שמפעיל אותה, הוא מזוהה בשם, והפעולה שלו מתועדת. בלי מסלול
--  כזה משפחה שאיבדה גישה למייל של ההורה נשארת נעולה לצמיתות, ונעילה
--  לצמיתות בלי מסלול תיקון אנושי היא בדיוק מה שרגולציית קטינים באה
--  למנוע: זכות ההורה לפקח מחייבת שההורה *הנכון* יהיה רשום.
--
--  לכן: אותה כתיבה בדיוק, שני שערים שונים — הקטין דרך
--  create_consent_request (נחסמת מרגע ההכרעה), האדמין דרך כאן.
--
--  שים לב למה הפונקציה **לא** עושה: היא לא נוגעת ב-approval_status
--  ולא ביומן ההכרעות. החלפת ההורה הרשום אינה הסכמה חדשה. אחרי
--  ההחלפה האדמין (או הקטין) ייצר קישור חדש, וההורה החדש יאשר בעצמו —
--  או שהאדמין יקבע ידנית דרך admin_set_consent. הפרדת התפקידים הזו
--  היא מה שמונע מהפונקציה הזו להיות «אישור עצמי בדלת האחורית».
-- ---------------------------------------------------------------------
do $guardian_fn$
begin
  -- בלי guardians אין מה ליצור. הפונקציה פשוט לא תיווצר, והפרונט
  -- יקבל PGRST202 ויתנהג כ«לא נפרס עדיין» — בדיוק כמו בשאר הקובץ.
  if to_regclass('public.guardians') is null then
    raise notice 'admin_set_guardian: דילוג — public.guardians חסרה.';
    return;
  end if;

  execute $fn$
create or replace function public.admin_set_guardian(
  p_minor    uuid,
  p_name     text default null,
  p_email    text default null,
  p_phone    text default null,
  p_relation text default 'parent'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_relation text := case when p_relation in ('parent', 'guardian', 'other')
                          then p_relation else 'parent' end;
  v_old      public.guardians%rowtype;
  v_g        public.guardians%rowtype;
  v_exists   boolean;
  v_basic    text;
  v_prev     record;
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;

  -- אימות מינימלי בלבד: כתובת שאין בה @ תשלח את קישור ההסכמה לשומקום,
  -- וזו הטעות היחידה שאפשר לתפוס כאן בוודאות. אימות "חכם" יותר היה
  -- פוסל כתובות תקינות ומחזיר אותנו למצב התקוע.
  if v_email = '' or position('@' in v_email) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;

  select true into v_exists from public.profiles where id = p_minor;
  if not coalesce(v_exists, false) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_old from public.guardians g where g.minor_id = p_minor;

  -- הסימון שהטריגר על profiles מחפש. is_admin() לבדה כבר מספיקה שם,
  -- אבל כל ה-RPCs של ההסכמה מסמנים את עצמם ולכן גם כאן — ומאותה סיבה
  -- האיפוס חייב לרוץ גם בנתיב השגיאה, אחרת הסימון נשאר דלוק להמשך
  -- הטרנזקציה וכתיבה אחרת בה הייתה עוברת כאילו היא מורשית.
  perform set_config('app.consent_writer', 'on', true);
  begin
    if v_old.id is null then
      insert into public.guardians (minor_id, full_name, email, phone, relation)
      values (p_minor, nullif(btrim(coalesce(p_name, '')), ''), v_email,
              nullif(btrim(coalesce(p_phone, '')), ''), v_relation)
      returning * into v_g;
    else
      -- שם וטלפון ריקים לא מוחקים ערך קיים (כמו ב-create_consent_request),
      -- אבל המייל כן מוחלף — הוא כל מטרת הקריאה.
      update public.guardians g
         set full_name  = coalesce(nullif(btrim(coalesce(p_name, '')), ''), g.full_name),
             email      = v_email,
             phone      = coalesce(nullif(btrim(coalesce(p_phone, '')), ''), g.phone),
             relation   = v_relation,
             updated_at = now()
       where g.minor_id = p_minor
      returning * into v_g;
    end if;

    -- מראה בעמודות הישנות — הפרונט שבפרוד קורא מהן, ו-admin_pending_minors
    -- נופלת אליהן. אי-סנכרון כאן היה מציג לאדמין את ההורה הישן.
    update public.profiles
       set guardian_name  = v_g.full_name,
           guardian_email = v_g.email,
           guardian_phone = v_g.phone,
           updated_at     = now()
     where id = p_minor;
  exception when others then
    perform set_config('app.consent_writer', 'off', true);
    raise;
  end;
  perform set_config('app.consent_writer', 'off', true);

  -- ---- שובל הביקורת ----
  -- רק כשכבר נרשמה הכרעת הסכמה. זה בדיוק המקרה שבו הנעילה הייתה
  -- פעילה, כלומר המקרה שבו האדמין עקף שער — ולכן המקרה שחייב להופיע
  -- ביומן הראיות. לפני הכרעה ראשונה הקטין עצמו רשאי לערוך את פרטי
  -- ההורה, האדמין לא עקף כלום, ורישום ההחלפה הוא guardians.updated_at.
  --
  -- הערך והגרסאות מועתקים מהרשומה הקודמת ולא מומצאים: הרשומה מתעדת
  -- **החלפת הורה**, לא הכרעה חדשה. לכן latest_consent, has_consent
  -- ובדיקת needs_reconsent מחזירות בדיוק אותו דבר אחריה — אין שום
  -- שינוי מצב, רק שורת ראיה. השדה note הוא שמסביר מה קרה, בדיוק
  -- כפי ש-admin_set_consent כותבת 'admin_set_consent · type=value'.
  v_basic := public.latest_consent(p_minor, 'basic');
  if v_basic is not null then
    select c.terms_version, c.privacy_version, c.doc_version
      into v_prev
      from public.consents c
     where c.minor_id = p_minor and c.consent_type = 'basic'
     order by c.created_at desc, c.id desc
     limit 1;

    insert into public.consents (minor_id, guardian_id, consent_type, value,
                                 terms_version, privacy_version, doc_version,
                                 source, note)
    values (p_minor, v_g.id, 'basic', v_basic,
            v_prev.terms_version, v_prev.privacy_version, v_prev.doc_version,
            'admin',
            format('admin_set_guardian · %s → %s',
                   coalesce(nullif(v_old.email, ''), '—'), v_email));
  end if;

  return jsonb_build_object('ok', true,
                            'guardian_email', v_g.email,
                            'guardian_name',  v_g.full_name,
                            'previous_email', v_old.email,
                            'logged',         (v_basic is not null));
end;
$body$;
  $fn$;

  execute 'revoke all on function public.admin_set_guardian(uuid, text, text, text, text) from public, anon';
  execute 'grant execute on function public.admin_set_guardian(uuid, text, text, text, text) to authenticated';
end $guardian_fn$;


-- ---------------------------------------------------------------------
--  8) רישום בלדג'ר + רענון סכימת ה-API
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_admin_requests.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקת עשן אחרי ההרצה
--
--  1) האובייקטים נוצרו:
--       select count(*) from public.admin_requests;             -- 0
--       select proname from pg_proc
--        where pronamespace = 'public'::regnamespace
--          and proname in ('admin_requests_list',
--                          'admin_mark_request_done',
--                          'admin_set_guardian');               -- 3 שורות
--
--  2) המדיניות (צריכות להיות שלוש, כולן PERMISSIVE — אין שער restrictive):
--       select policyname, permissive, cmd from pg_policies
--        where schemaname = 'public' and tablename = 'admin_requests';
--
--  2ב) *הבדיקה החשובה בקובץ* — הערוץ פתוח למי שנעול.
--      מקונסולת הדפדפן, מחשבון של קטין ב-pending_parent (וגם מחשבון
--      מושעה, וגם מחשבון עם banned = true):
--        const uid = (await supabase.auth.getUser()).data.user.id
--        await supabase.from('admin_requests')
--          .insert({ user_id: uid, kind: 'guardian_change',
--                    message: 'אבא החליף מייל' })
--      → חייב לחזור { error: null }. כל שגיאת RLS כאן פירושה שהשער
--        של supabase_consent_enforcement.sql נתפס על הטבלה — הרץ את
--        הקובץ הזה שוב, והסר את admin_requests מהמערך שם.
--      ומיד אחריה, מאותו חשבון:
--        await supabase.from('admin_requests').select('*')
--      → רק הפניות שלו.
--
--  3) הגבלת הקצב (מאותו חשבון, אחרי 5 פניות פתוחות):
--      הפנייה השישית → שגיאה עם code '54000' וההודעה
--      «יש כבר 5 פניות פתוחות בשמך…». סגירת אחת מהן בידי אדמין
--      (admin_mark_request_done) משחררת מקום מיד.
--
--  4) זיוף שדות בפנייה (מחשבון רגיל):
--        .insert({ user_id: uid, kind: 'other', status: 'done',
--                  created_at: '2020-01-01' })
--      → נשמר, אבל השורה חוזרת עם status='open' ו-created_at של עכשיו.
--      ניסיון לפתוח פנייה בשם מישהו אחר:
--        .insert({ user_id: '<uuid אחר>' })  → שגיאת RLS.
--      ניסיון לסגור פנייה של עצמך:
--        .update({ status:'done' })          → 0 שורות (policy אדמין).
--      ניסיון מחיקה:
--        .delete().eq('id', '<id>')          → שגיאת הרשאה.
--
--  5) אדמין (מחשבון אדמין):
--       select * from public.admin_requests_list();
--       select public.admin_mark_request_done('<id>');
--     מחשבון רגיל שתיהן חייבות ליפול על «למנהלים בלבד».
--
--  6) החלפת הורה — התרחיש המלא, על קטין שההורה שלו כבר אישר:
--       select public.latest_consent('<uid>', 'basic');          -- granted
--       select public.admin_set_guardian('<uid>', 'אמא', 'mom@example.com',
--                                        '0500000000', 'parent');
--       -- {ok:true, previous_email:'<הישן>', logged:true}
--       select guardian_email from public.profiles where id = '<uid>';
--       select email from public.guardians where minor_id = '<uid>';
--       -- שתיהן mom@example.com
--       select value, source, note from public.consents
--        where minor_id = '<uid>' order by created_at desc limit 1;
--       -- granted · admin · 'admin_set_guardian · <ישן> → mom@example.com'
--     ומיד אחריה — לוודא ששום מצב לא זז:
--       select public.latest_consent('<uid>', 'basic');          -- עדיין granted
--       select approval_status from public.profiles where id = '<uid>';
--       -- ללא שינוי. החלפת הורה אינה הסכמה.
--
--  6ב) מייל פסול, ומשתמש לא קיים:
--       select public.admin_set_guardian('<uid>', null, 'לא-מייל', null, null);
--       -- {ok:false, reason:'bad_email'}
--       select public.admin_set_guardian(gen_random_uuid(), null, 'a@b.c', null, null);
--       -- {ok:false, reason:'not_found'}
--     ומחשבון רגיל — «למנהלים בלבד».
--
--  7) הקטין עדיין לא יכול להחליף הורה בעצמו אחרי הכרעה. מקונסולת
--     הדפדפן, מחשבון הקטין:
--       await supabase.rpc('create_consent_request',
--         { p_name:'x', p_email:'kid@example.com', p_phone:null,
--           p_relation:'parent', p_purpose:'initial' })
--     → {ok:false, reason:'email_locked'} — הנעילה שלו לא נפרצה.
-- =====================================================================
