-- =====================================================================
--  CourtSide — הסכמת הורים אמיתית לקטינים (מסמך א')
--  נכתב 3.8.2026 · הרץ אחרי supabase_legal_launch.sql · אידמפוטנטי
--
--  מה הקובץ הזה מתקן (מתוך AUDIT_3.8.md):
--   · src/ProfileForm.jsx:119 [קריטי] — ההסכמה נכתבה בידי הקטין עצמו.
--     מהיום ההסכמה נרשמת אך ורק בשרת, מתוך קישור שההורה פותח.
--   · src/ProfileForm.jsx:120 [גבוה] — הרשומה לא הייתה ראיה. מהיום:
--     טבלת consents append-only, חתומה בזמן שרת, עם גרסת הנוסח
--     שנקראת מהמסד (הלקוח לא יכול לזייף גרסה), IP ו-user agent.
--   · supabase_legal_launch.sql:25 [גבוה] — חישוב גיל קלנדרי. מהיום
--     minor_age() מדויק מתאריך לידה, ושמרני כשיש רק שנת לידה.
--   · supabase_privacy4.sql:122 [בינוני] — חסר set search_path, ועקיפה
--     דרך first_name is null. שניהם נסגרו.
--   · src/Auth.jsx:339 [בינוני] — הסכמת התנאים בהרשמה לא נרשמה. מהיום
--     accepted_terms_at + terms_version נחתמים בשרת בהשלמת הפרופיל.
--   · src/ProfileForm.jsx:37 [בינוני] — במלאות 18 לא קרה כלום. מהיום
--     confirm_adult() מאשרר עצמאית ומוחקת את פרטי ההורה.
--
--  שינוי התנהגות מרכזי: הטריגר כבר לא זורק חריגה על קטין בלי הסכמה —
--  הוא מסמן approval_status = 'pending_parent'. האכיפה בפועל תגיע
--  ב-supabase_consent_enforcement.sql, רק אחרי שמסך ה-pending פרוס.
--
--  תאימות לאחור: הקובץ הזה עצמאי. לקוח ישן (הפרונט שבפרוד עכשיו)
--  ממשיך לעבוד אחריו — שמירת פרופיל לא נכשלת, ההסכמה שהקטין "סימן"
--  פשוט מתעלמים ממנה בשקט והחשבון עובר ל-pending_parent.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) עמודות חדשות על profiles
--    birth_date נשאר מחוץ ל-whitelist הקריאה של privacy4 — הוא נחשף
--    למשתמש רק דרך my_profile(). approval_status כן נחשף, כי מסכים
--    של מאמן/אדמין צריכים לדעת שחשבון ממתין לאישור הורה.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists birth_date        date;
alter table public.profiles add column if not exists approval_status   text not null default 'active';
alter table public.profiles add column if not exists adult_confirmed_at timestamptz;
alter table public.profiles add column if not exists accepted_terms_at  timestamptz;
alter table public.profiles add column if not exists terms_version      text;

do $ck$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass and conname = 'profiles_approval_status_chk'
  ) then
    alter table public.profiles
      add constraint profiles_approval_status_chk
      check (approval_status in ('active', 'pending_parent', 'suspended'));
  end if;
end $ck$;

grant select (approval_status) on public.profiles to authenticated;


-- ---------------------------------------------------------------------
-- 2) consent_documents — הנוסחים המשפטיים, גרסה אחת פר מסמך
--    הלקוח קורא מכאן את מסמך א' (גם anon, כי דף ההורה אינו מחובר),
--    והשרת קורא מכאן את הגרסאות שנרשמות ביומן ההסכמות.
--    גרסון עתידי = UPDATE מפורש במיגרציה חדשה, לא עריכה של הקובץ הזה.
-- ---------------------------------------------------------------------
create table if not exists public.consent_documents (
  id         text primary key,
  version    text not null,
  title      text not null,
  body_html  text not null,
  updated_at timestamptz not null default now()
);

alter table public.consent_documents enable row level security;

drop policy if exists "consent_docs_read_all" on public.consent_documents;
create policy "consent_docs_read_all" on public.consent_documents
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.consent_documents from anon, authenticated;
grant select on public.consent_documents to anon, authenticated;

-- מסמך א' — הנוסח המלא. HTML סמנטי נקי: כותרות, פסקאות ורשימות בלבד,
-- בלי style ובלי script (דף ההורה מזריק אותו, ולכן הוא חייב להיות תמים).
insert into public.consent_documents (id, version, title, body_html) values (
  'doc_a',
  'v1 · 3.8.2026',
  $t$מסמך א' — אישור והסכמת הורה / אפוטרופוס לרישום קטין$t$,
  $doc$
<h2>מסמך א' — אישור והסכמת הורה / אפוטרופוס לרישום קטין</h2>
<p>אני החתום/ה מטה, הורה או אפוטרופוס חוקי של הקטין/ה ששמו/ה מופיע בראש טופס זה, מאשר/ת בזאת כי קראתי מסמך זה, הבנתי את תוכנו, ואני נותן/ת את הסכמתי לפתיחת חשבון שחקן עבורו/ה בשירות CourtSide ולעיבוד המידע כמפורט להלן.</p>

<h3>1. השירות</h3>
<p>CourtSide הוא שירות מקוון לניהול אימוני כדורסל, המחבר בין מאמן לשחקניו: תרגילים ותוכניות אימון, לוח אימונים ואישורי הגעה, משימות ויעדים אישיים, סיכומי אימון ומשוב מהמאמן, והודעות בין השחקן למאמן שלו. חשבון שחקן פתוח גם לקטינים, והפעלתו לקטין מתחת לגיל 18 מחייבת את הסכמת ההורה או האפוטרופוס.</p>

<h3>2. מה אני מאשר/ת</h3>
<ul>
  <li>אני ההורה או האפוטרופוס החוקי של הקטין/ה, ואני מוסמך/ת לתת הסכמה זו בשמו/ה.</li>
  <li>הפרטים שמסרתי — שם, כתובת אימייל ומספר טלפון — נכונים ושייכים לי, והם ישמשו את השירות לפניות בנוגע לחשבון הקטין/ה.</li>
  <li>ההסכמה ניתנת על ידי, ולא על ידי הקטין/ה. ידוע לי שהקטין/ה אינו/ה רשאי/ת לאשר מסמך זה בעצמו/ה.</li>
  <li>קראתי ואני מאשר/ת גם את <a href="/terms.html" target="_blank" rel="noopener noreferrer">תנאי השימוש</a> ואת <a href="/privacy.html" target="_blank" rel="noopener noreferrer">מדיניות הפרטיות</a> של השירות, לרבות בשם הקטין/ה.</li>
</ul>

<h3>3. איזה מידע ייאסף על הקטין/ה</h3>
<ul>
  <li><b>פרטי חשבון:</b> כתובת אימייל וסיסמה (מוצפנת) — לצורך התחברות.</li>
  <li><b>פרטי פרופיל:</b> שם פרטי ושם משפחה, שנת לידה או תאריך לידה, מועדון, עמדה, תמונת פרופיל (רשות) ומספר טלפון (רשות). טלפון של שחקן אינו מוצג לאף משתמש.</li>
  <li><b>פרטים שהמאמן מנהל בסגל:</b> מספר גופייה, גובה, סטטוס זמינות (כשיר / פצוע / חולה) לרבות פירוט שהשחקן או המאמן מזינים, והערות מאמן.</li>
  <li><b>נתוני פעילות:</b> נוכחות באימונים, דיווחי מאמץ ומצב רוח, סיכומי אימון, יעדים אישיים והתקדמות במשימות, ומשוב מהמאמן.</li>
  <li><b>תוכן שהקטין/ה יוצר/ת:</b> אישורי הגעה, סיכומי אימון, והודעות למאמן הקבוצה שלו/ה.</li>
  <li><b>פרטי ההורה:</b> שם, כתובת אימייל וטלפון — לצורך הסכמה זו, לתיעודה, ולפניות בעניין החשבון.</li>
</ul>

<h3>4. למה ישמש המידע</h3>
<ul>
  <li>להפעלת השירות עבור הקטין/ה — שמירת האימונים, המשימות, היעדים והמשובים.</li>
  <li>לאפשר את הקשר בין הקטין/ה לבין המאמן שאישר אותו/ה לקבוצה.</li>
  <li>לתמיכה במשתמשים ולשיפור השירות.</li>
</ul>
<p>המידע אינו נמכר ואינו מועבר לצדדים שלישיים, ואין בשירות פרסומות מבוססות מעקב.</p>

<h3>5. מי רואה את המידע</h3>
<p>המאמן שאישר את הקטין/ה לקבוצה שלו, ואני כהורה — לפי בקשה. חברי קבוצה אחרים רואים פרטים יבשים בלבד (שם, מספר גופייה, עמדה): לא טלפון, לא סטטוס בריאות ולא נתוני פעילות. הערות פרטיות של המאמן אינן נחשפות לשחקנים אחרים.</p>

<h3>6. ההסכמות שאני נותן/ת</h3>
<ul>
  <li><b>הסכמה בסיסית (חובה):</b> פתיחת חשבון שחקן לקטין/ה, איסוף המידע שבסעיף 3 והשימוש בו למטרות שבסעיף 4. בלי הסכמה זו החשבון אינו מופעל.</li>
  <li><b>תמונות בתוך הקבוצה (רשות):</b> הצגת תמונת הפרופיל ותמונות מאימונים שבהן מופיע/ה הקטין/ה בפני המאמן וחברי הקבוצה בלבד.</li>
  <li><b>תמונות מחוץ לקבוצה (רשות):</b> הצגת תמונות שבהן מופיע/ה הקטין/ה במרחבים פתוחים של השירות או בחומרי הסברה שלו.</li>
  <li><b>עדכונים ודיוור (רשות):</b> משלוח עדכונים על השירות אליי בדוא"ל.</li>
</ul>
<p>כל אחת מהסכמות הרשות ניתנת בנפרד, וסירוב להן אינו פוגע בהפעלת החשבון.</p>

<h3>7. אחסון, אבטחה ומשך שמירה</h3>
<p>המידע נשמר בשירותי הענן של Supabase, המאחסנת נתונים על שרתים מחוץ לישראל, ומוגן באמצעים מקובלים: הצפנת תעבורה, בקרת גישה ברמת שורה במסד הנתונים והגבלת הרשאות. המידע נשמר כל עוד החשבון פעיל; עם מחיקת החשבון המידע האישי נמחק מהמערכות הפעילות בתוך 30 יום, למעט מידע שחובה לשמרו לפי דין — ובכלל זה רשומת הסכמה זו, הנשמרת כראיה לכך שההסכמה ניתנה.</p>

<h3>8. זכויותיי כהורה</h3>
<ul>
  <li>לעיין במידע שנאסף על הקטין/ה, לבקש את תיקונו או את מחיקתו.</li>
  <li>לבטל כל אחת מההסכמות בכל עת, לרבות ההסכמה הבסיסית.</li>
  <li>לקבל עותק של מסמך זה ושל רישום ההסכמה שנתתי.</li>
</ul>

<h3>9. ביטול ההסכמה</h3>
<p>בסיום האישור יימסר לי קישור ניהול קבוע. בכל עת אוכל לפתוח אותו ולשנות או לבטל כל הסכמה. ביטול ההסכמה הבסיסית משעה את חשבון הקטין/ה ומגיש בקשת מחיקה של החשבון. אפשר גם לפנות ישירות לכתובת שבסעיף 11.</p>

<h3>10. הצהרה</h3>
<p>אישור זה נרשם ביומן ההסכמות של השירות יחד עם מועד האישור, גרסת הנוסח שהוצג לי, וכתובת ה-IP שממנה בוצע — כרשומה שאינה ניתנת לשינוי או למחיקה.</p>

<h3>11. יצירת קשר</h3>
<p>לכל שאלה או בקשה: <a href="mailto:agam15122003@gmail.com">agam15122003@gmail.com</a></p>
  $doc$
) on conflict (id) do nothing;

-- גרסאות התנאים והמדיניות — נרשמות ביומן ההסכמות כדי שיהיה תיעוד
-- איזה נוסח בדיוק הוצג. הגוף כאן הוא הפניה; הנוסח המלא ב-public/.
insert into public.consent_documents (id, version, title, body_html) values
  ('terms',   'v1 · 3.8.2026', 'תנאי השימוש',       '<p>הנוסח המלא: <a href="/terms.html" target="_blank" rel="noopener noreferrer">תנאי השימוש</a></p>'),
  ('privacy', 'v1 · 3.8.2026', 'מדיניות הפרטיות',   '<p>הנוסח המלא: <a href="/privacy.html" target="_blank" rel="noopener noreferrer">מדיניות הפרטיות</a></p>')
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 3) guardians — ההורה כישות במודל (עד היום הוא היה שדות טקסט חופשי)
--    אין policy כתיבה: הכתיבה היחידה היא דרך create_consent_request.
-- ---------------------------------------------------------------------
create table if not exists public.guardians (
  id         uuid primary key default gen_random_uuid(),
  minor_id   uuid not null unique references public.profiles(id) on delete cascade,
  full_name  text,
  email      text not null,
  phone      text,
  relation   text not null default 'parent' check (relation in ('parent', 'guardian', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guardians enable row level security;

drop policy if exists "guardians_select_own" on public.guardians;
create policy "guardians_select_own" on public.guardians
  for select to authenticated using (minor_id = auth.uid() or public.is_admin());

revoke all on public.guardians from anon, authenticated;
grant select on public.guardians to authenticated;


-- ---------------------------------------------------------------------
-- 4) consent_requests — טוקנים
--    הטוקן הגולמי לעולם לא נשמר: רק sha256 שלו. מי שמחזיק את הקישור
--    מחזיק את הסוד; דליפה של המסד לא מאפשרת להתחזות להורה.
--    initial — 72 שעות, חד-פעמי. manage — 365 יום, רב-פעמי.
--    טוקן manage נוצר אך ורק בתוך submit_parent_consent, בסיום אישור
--    הורה, ונמסר להורה בלבד; create_consent_request דוחה בקשת manage.
-- ---------------------------------------------------------------------
create table if not exists public.consent_requests (
  id          uuid primary key default gen_random_uuid(),
  minor_id    uuid not null references public.profiles(id) on delete cascade,
  guardian_id uuid references public.guardians(id) on delete cascade,
  token_hash  text not null unique,
  purpose     text not null default 'initial' check (purpose in ('initial', 'manage')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists consent_requests_minor_idx
  on public.consent_requests (minor_id, created_at desc);

alter table public.consent_requests enable row level security;

drop policy if exists "consent_requests_select_own" on public.consent_requests;
create policy "consent_requests_select_own" on public.consent_requests
  for select to authenticated using (minor_id = auth.uid() or public.is_admin());

revoke all on public.consent_requests from anon, authenticated;
grant select on public.consent_requests to authenticated;


-- ---------------------------------------------------------------------
-- 5) consents — יומן ההסכמות. append-only. זו הראיה.
--
--    שים לב: אין כאן שום foreign key, וזו החלטה מכוונת. FK עם
--    on delete cascade היה גורם למחיקת חשבון להפעיל DELETE על הטבלה —
--    והטריגר שלמטה חוסם DELETE, כלומר מחיקת חשבון הייתה נכשלת. FK עם
--    set null היה מפעיל UPDATE — שגם הוא חסום. לכן המזהים נשמרים
--    כ-uuid חופשי: היומן שורד את מחיקת החשבון, כפי שראיה צריכה.
-- ---------------------------------------------------------------------
create table if not exists public.consents (
  id               uuid primary key default gen_random_uuid(),
  minor_id         uuid not null,
  guardian_id      uuid,
  request_id       uuid,
  consent_type     text not null check (consent_type in ('basic', 'media_team', 'media_public', 'marketing')),
  value            text not null check (value in ('granted', 'denied', 'revoked')),
  terms_version    text,
  privacy_version  text,
  doc_version      text,
  ip               text,
  user_agent       text,
  source           text not null default 'parent_link'
                   check (source in ('parent_link', 'admin', 'system', 'legacy_profile', 'self_adult')),
  created_at       timestamptz not null default now()
);

-- הערת ראיה חופשית (nullable, בלי check בכוונה — ערכים חדשים לא ידרשו
-- מיגרציה). נוספה אחרי ביקורת 3.8: יומן שמתעד "אישור הורה" בלי לציין
-- שהשליחה הגיעה מהמכשיר של הקטין עצמו הוא ראיה מטעה, ורשומת self_adult
-- בלי נתוני הלידה שעליהם הסתמכה אינה ניתנת לבדיקה בדיעבד.
alter table public.consents add column if not exists note text;

create index if not exists consents_minor_type_idx
  on public.consents (minor_id, consent_type, created_at desc);

alter table public.consents enable row level security;

drop policy if exists "consents_select_own" on public.consents;
create policy "consents_select_own" on public.consents
  for select to authenticated using (minor_id = auth.uid() or public.is_admin());

-- אין ולא תהיה policy ל-insert/update/delete. הכתיבה היחידה היא דרך
-- ה-RPCs (security definer). בנוסף שוללים במפורש ברמת ה-grant.
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;
revoke update, delete on public.consents from anon, authenticated;

-- חגורה ושלייקס: גם בעל הטבלה לא יעדכן או ימחק שורת הסכמה בטעות.
create or replace function public.consents_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'יומן ההסכמות הוא ראיה ואינו ניתן לשינוי או למחיקה (%)', tg_op;
end;
$$;

drop trigger if exists trg_consents_immutable on public.consents;
create trigger trg_consents_immutable
  before update or delete on public.consents
  for each row execute function public.consents_immutable();


-- ---------------------------------------------------------------------
-- 6) עזרים
-- ---------------------------------------------------------------------

-- הערך האחרון שנרשם לסוג הסכמה מסוים (null = מעולם לא הוכרע)
create or replace function public.latest_consent(p_minor uuid, p_type text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.value
    from public.consents c
   where c.minor_id = p_minor and c.consent_type = p_type
   order by c.created_at desc, c.id desc
   limit 1;
$$;

-- האם קיימת הסכמה בתוקף? הרשומה האחרונה קובעת — granted אחרי revoked
-- מחזירה תוקף, revoked אחרי granted מבטלת.
create or replace function public.has_consent(p_minor uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.latest_consent(p_minor, p_type) = 'granted', false);
$$;

-- תמונת מצב של ארבע ההסכמות, לשימוש ה-RPCs וה-UI
create or replace function public.consent_state(p_minor uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'basic',        public.latest_consent(p_minor, 'basic'),
    'media_team',   public.latest_consent(p_minor, 'media_team'),
    'media_public', public.latest_consent(p_minor, 'media_public'),
    'marketing',    public.latest_consent(p_minor, 'marketing')
  );
$$;

-- האם החשבון פעיל? coalesce ל-true בכוונה: פרופיל שעדיין לא נוצר,
-- הרשמה באמצע, או מאמן — לעולם לא ננעלים בגלל הפיצ'ר הזה.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.approval_status = 'active' from public.profiles p where p.id = auth.uid()),
    true
  );
$$;

-- גיל. תיקון הממצא supabase_legal_launch.sql:25 — שם חושב הפרש שנים
-- קלנדרי, כך שמי שימלאו לו 18 בדצמבר נחשב בגיר כבר ב-1 בינואר.
--  · יש תאריך לידה  → גיל מדויק.
--  · יש רק שנת לידה → הגיל שבוודאות כבר מלאו: current_year - year - 1.
--    כלומר קטין נשאר קטין עד השנה שבה בוודאות מלאו לו 18.
create or replace function public.minor_age(p_birth_date date, p_birth_year int)
returns int
language sql
stable
set search_path = public
as $$
  select case
    when p_birth_date is not null
      then extract(year from age(current_date, p_birth_date))::int
    when p_birth_year is not null and p_birth_year > 1900
      then greatest(extract(year from current_date)::int - p_birth_year - 1, 0)
    else null
  end;
$$;

-- טוקן: 24 בתים אקראיים ב-base64url. gen_random_bytes מגיע מ-pgcrypto,
-- שב-Supabase יושב ב-schema extensions; אם הוא חסר נופלים לשני UUID
-- אקראיים (256 ביט) שהם פונקציית ליבה.
create or replace function public.new_consent_token()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  begin
    v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  exception when undefined_function then
    v_token := translate(
      encode(
        decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'),
        'base64'),
      '+/=', '-_');
  end;
  return v_token;
end;
$$;

create or replace function public.consent_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
$$;

revoke all on function public.latest_consent(uuid, text)  from public, anon;
revoke all on function public.consent_state(uuid)         from public, anon;
revoke all on function public.has_consent(uuid, text)     from public, anon;
revoke all on function public.is_active_user()            from public, anon;
revoke all on function public.minor_age(date, int)        from public, anon;
revoke all on function public.new_consent_token()         from public, anon, authenticated;
revoke all on function public.consent_token_hash(text)    from public, anon, authenticated;
grant execute on function public.has_consent(uuid, text)  to authenticated;
grant execute on function public.is_active_user()         to authenticated;
grant execute on function public.minor_age(date, int)     to authenticated;
grant execute on function public.consent_state(uuid)      to authenticated;
grant execute on function public.latest_consent(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 7) הטריגר v3 — enforce_minor_consent
--
--    שלוש התנהגויות חדשות:
--    (א) לא זורק חריגה על קטין בלי הסכמה. במקום זה pending_parent.
--        חריגה הייתה חוסמת את שמירת הפרופיל — ואז אי אפשר בכלל להגיע
--        למסך שממנו שולחים קישור להורה.
--    (ב) set search_path = public (ממצא privacy4:122).
--    (ג) העקיפה דרך first_name is null נסגרה משני כיוונים: בדיקת הגיל
--        וההסכמה רצה על כל שורת role='player' בלי קשר ל-first_name,
--        ואי אפשר לאפס first_name קיים.
--
--    בנוסף הטריגר הוא קו ההגנה שמונע מהקטין לזייף הסכמה: כל עמודה
--    שקשורה להסכמה מוחזרת בשקט לערכה הקודם בכל UPDATE שאינו של אדמין
--    או של ה-RPCs. "בשקט" ולא בחריגה — כי הפרונט שולח את פרטי ההורה
--    ותאריך הלידה בכל שמירת פרופיל, ואסור שהוא ייפול על זה. ראה סעיף 10.
-- ---------------------------------------------------------------------
create or replace function public.enforce_minor_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age        int;
  v_privileged boolean;
  v_locked     boolean := false;  -- הוכרעה הסכמה — פרטי ההורה ננעלים
  v_age_locked boolean := false;  -- נתוני הגיל ננעלים (רחב יותר מ-v_locked)
  v_decided    boolean := false;  -- הסטטוס נקבע מפורשות, אין מה לחשב מחדש
  v_stamp      boolean := false;
begin
  -- כותב מורשה: המסד עצמו (מיגרציה / service role — אין auth.uid),
  -- אדמין, או אחד מ-RPCs ההסכמה שמסמן את עצמו ב-GUC מקומי לטרנזקציה.
  v_privileged := (auth.uid() is null)
                  or public.is_admin()
                  or coalesce(current_setting('app.consent_writer', true), 'off') = 'on';

  -- ---- הגנת עמודות (חלה על כל התפקידים, לא רק שחקנים) ----
  if tg_op = 'UPDATE' and not v_privileged then
    -- אי אפשר למחוק שם קיים. זו הייתה הדלת האחורית: PATCH first_name=null
    -- ואז PATCH role/הסכמה בלי שאף בדיקה תרוץ.
    if old.first_name is not null and new.first_name is null then
      raise exception 'לא ניתן למחוק את השם מהפרופיל';
    end if;

    -- ראיות ההסכמה — נכתבות אך ורק בשרת
    new.guardian_consent_at      := old.guardian_consent_at;
    new.guardian_consent_version := old.guardian_consent_version;
    new.adult_confirmed_at       := old.adult_confirmed_at;
    new.approval_status          := old.approval_status;

    -- אישור התנאים — כתיבה חד-פעמית, ורק בשרת
    if old.accepted_terms_at is not null then
      new.accepted_terms_at := old.accepted_terms_at;
      new.terms_version     := old.terms_version;
    end if;

    -- פרטי ההורה ניתנים לעריכה רק כל עוד לא הוכרעה הסכמה. אחרי שהורה
    -- אישר אי אפשר להסיט את הפיקוח למייל אחר. לפני שהוכרעה הסכמה הם
    -- פתוחים לעריכה — "שינוי הפרטים של ההורה" הוא מסלול ההתאוששות
    -- היחיד שהמוצר מציע לקטין שתקוע (Dashboard.jsx → ProfileForm).
    --
    -- has_consent() היא הבדיקה הלא נכונה כאן, וזה היה חור אמיתי: היא
    -- חוזרת ל-false ברגע שההורה *מבטל* — כלומר הנעילה נפתחה בדיוק ברגע
    -- שבו היא הכי נחוצה, והקטין יכול היה להחליף את מייל ההורה במייל
    -- שלו ולהתחיל את התהליך מחדש. לכן latest_consent, והשוואה לערך
    -- עצמו. 'denied' בכוונה אינו נועל: סירוב שנבע מהקלדת מייל שגוי היה
    -- נועל את החשבון לנצח בלי שום מסלול תיקון.
    -- coalesce: latest_consent מחזירה null כשמעולם לא הוכרעה הסכמה,
    -- ואז ה-in מחזיר null ולא false. כאן זה מתנהג נכון, אבל v_locked
    -- מוזרם הלאה ל-v_age_locked ואסור שיישאר תלת-ערכי.
    v_locked := coalesce(public.latest_consent(new.id, 'basic') in ('granted', 'revoked'), false)
                or (old.adult_confirmed_at is not null);
    if v_locked then
      new.guardian_name  := old.guardian_name;
      new.guardian_email := old.guardian_email;
      new.guardian_phone := old.guardian_phone;
    end if;

    -- נתוני הגיל ננעלים רחב יותר מפרטי ההורה: גם בלי שום הכרעת הסכמה,
    -- ברגע שהשער כבר נסגר (pending_parent / suspended) אסור לערוך את
    -- הגיל *כלפי מעלה*. זו הייתה הדלת הראשית: הקטין נכנס ל-ProfileForm
    -- מתוך מסך ההמתנה, שינה את תאריך הלידה ל-2000, ושער הקטינים שלמטה
    -- חישב מחדש מהנתון שהוא עצמו שלח והגיע ל-'active'.
    -- תיקון תאריך שגוי שנשאר בתחום הקטינות עדיין מותר, כדי שמי שהקליד
    -- שנה לא נכונה לא ייתקע. בגיר שהקליד שנה שגויה ונחת ב-pending_parent
    -- ישוחרר ידנית דרך admin_set_approval — אין דרך להבדיל בינו לבין
    -- קטין שמשקר, ולכן ההכרעה היא לטובת השער.
    -- confirm_adult() נשענת על הנעילה הזו: היא קוראת את birth_* מהפרופיל.
    v_age_locked := v_locked
                    or (old.approval_status in ('pending_parent', 'suspended')
                        and coalesce(public.minor_age(new.birth_date, new.birth_year), -1) >= 18);
    if v_age_locked then
      new.birth_date := old.birth_date;
      new.birth_year := old.birth_year;
    end if;
  end if;

  -- ---- חתימת אישור התנאים בהרשמה (ממצא Auth.jsx:339) ----
  -- הצ'קבוקס במסך ההרשמה חוסם את הכפתור, אבל לא נרשם בשום מקום.
  -- חותמים ברגע שבו הפרופיל מושלם — זהו רגע ההרשמה בפועל. לא חותמים
  -- למפרע על חשבונות ותיקים: אצלם הערך יישאר null עד קריאה מפורשת
  -- ל-accept_terms(), כדי שלא ייווצר תיעוד שמראה תאריך שלא היה.
  if new.first_name is not null and new.accepted_terms_at is null then
    if tg_op = 'INSERT' then
      v_stamp := true;
    else
      v_stamp := (old.first_name is null);
    end if;
    if v_stamp then
      new.accepted_terms_at := now();
      new.terms_version     := (select version from public.consent_documents where id = 'terms');
    end if;
  end if;

  -- ---- שער הקטינים ----
  if new.role = 'player' then
    -- תאריך לידה מלא גובר, ומזין את birth_year כדי שכל הפיצ'רים
    -- הקיימים שעובדים על שנה ימשיכו לעבוד בלי שינוי.
    if new.birth_date is not null then
      new.birth_year := extract(year from new.birth_date)::int;
    end if;

    -- שחקן לא חושף טלפון, בשום מצב
    new.phone_public := false;

    v_age := public.minor_age(new.birth_date, new.birth_year);

    -- שני מקרים שבהם לא מחשבים את הסטטוס מחדש (המקרה השני חייב לרוץ
    -- ב-if נפרד ולא ב-and, כי ב-INSERT אין old בכלל)
    if tg_op = 'UPDATE' then
      if v_privileged and new.approval_status is distinct from old.approval_status then
        -- שינוי מפורש של אדמין או של RPC הסכמה — מכובד כמו שהוא
        v_decided := true;
      elsif old.approval_status in ('pending_parent', 'suspended') then
        -- שער סגור נשאר סגור. קודם היה כאן 'suspended' בלבד, ולכן קטין
        -- ב-pending_parent שערך את הפרופיל נפל ל-else שלמטה וקיבל
        -- 'active' — כלומר אישר את עצמו בלי שאף הורה נגע במערכת.
        -- העלאה מ-pending_parent/suspended מותרת אך ורק דרך
        -- submit_parent_consent / confirm_adult / admin_set_approval,
        -- שכולן privileged וכולן משנות את הסטטוס מפורשות (הענף הראשון).
        new.approval_status := old.approval_status;
        v_decided := true;
      end if;
    end if;

    if v_decided then
      null;
    elsif v_age is null then
      -- אין נתוני לידה. חובה למלא — אבל רק כשהפרופיל באמת מולא,
      -- אחרת שורת ה-handle_new_user הריקה הייתה נחסמת.
      if new.first_name is not null then
        raise exception 'חובה למלא שנת לידה בפרופיל שחקן';
      end if;
    elsif public.latest_consent(new.id, 'basic') = 'revoked' then
      -- ביטול ההורה גובר על חישוב הגיל. בלי הענף הזה שורה שנוצרה מחדש
      -- (יומן ההסכמות שורד מחיקת פרופיל — זו החלטה מכוונת בסעיף 5)
      -- הייתה נולדת 'active' והביטול היה נמחק. חזרה לפעילות היא רק דרך
      -- קישור הניהול של ההורה או דרך admin_set_approval.
      new.approval_status := 'suspended';
    elsif v_age < 18 and not public.has_consent(new.id, 'basic') then
      new.approval_status := 'pending_parent';
    else
      new.approval_status := 'active';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_minor_consent on public.profiles;
create trigger trg_minor_consent
  before insert or update on public.profiles
  for each row execute function public.enforce_minor_consent();


-- ---------------------------------------------------------------------
-- 8) Backfill — הקטינים שכבר "הסכימו" בזרימה הישנה
--    הם נשארים active. הבקשה לאישור מחדש תגיע כבאנר רך ב-UI כשגרסת
--    המסמך תעלה, לא כנעילה. העמודות guardian_* הישנות נשארות במקומן:
--    הפרונט הישן קורא מהן, וה-RPCs ממשיכים לסנכרן אותן.
-- ---------------------------------------------------------------------
do $backfill$
declare
  r     record;
  v_gid uuid;
begin
  for r in
    select id, guardian_name, guardian_email, guardian_phone,
           guardian_consent_at, guardian_consent_version
      from public.profiles
     where guardian_email is not null
       and guardian_consent_at is not null
  loop
    insert into public.guardians (minor_id, full_name, email, phone, relation)
    values (r.id, nullif(btrim(coalesce(r.guardian_name, '')), ''),
            lower(btrim(r.guardian_email)),
            nullif(btrim(coalesce(r.guardian_phone, '')), ''), 'parent')
    on conflict (minor_id) do nothing;

    select g.id into v_gid from public.guardians g where g.minor_id = r.id;

    if not exists (
      select 1 from public.consents c
       where c.minor_id = r.id and c.consent_type = 'basic' and c.source = 'legacy_profile'
    ) then
      insert into public.consents (minor_id, guardian_id, consent_type, value,
                                   terms_version, source, created_at)
      values (r.id, v_gid, 'basic', 'granted',
              r.guardian_consent_version, 'legacy_profile', r.guardian_consent_at);
    end if;
  end loop;
end $backfill$;


-- ---------------------------------------------------------------------
-- 8ב) בקשות מחיקה — סטטוס שלישי 'cancelled'
--     ביטול ההסכמה הבסיסית מגיש אוטומטית בקשת מחיקת חשבון (סעיף 9
--     במסמך א'). כשההורה מאשר מחדש, submit_parent_consent סוגר את
--     הבקשה — ובלי הסטטוס הזה ה-UPDATE היה נופל על ה-check של
--     supabase_legal_launch.sql:50 ומפיל איתו את כל האישור מחדש.
--     'done' אינו תחליף: הכיתוב באדמין מצהיר ש«טופל» = המחיקה בוצעה
--     בפועל, וסימון כזה היה יוצר רישום ציות שקרי.
--     אידמפוטנטי, ולא תלוי בסדר: legal_launch יוצר את הטבלה עם
--     create table if not exists, ולכן הרצה חוזרת שלו לא מחזירה את
--     ה-check הישן.
-- ---------------------------------------------------------------------
do $adr$
begin
  if to_regclass('public.account_deletion_requests') is not null then
    alter table public.account_deletion_requests
      drop constraint if exists account_deletion_requests_status_check;
    alter table public.account_deletion_requests
      add constraint account_deletion_requests_status_check
      check (status in ('pending', 'done', 'cancelled'));
  end if;
end $adr$;


-- ---------------------------------------------------------------------
-- 9) RPCs
--    כולן security definer + set search_path, כולן מחזירות jsonb,
--    וכולן נכשלות בעדינות ({ok:false, reason}) כדי שהפרונט יוכל להציג
--    הודעה במקום לקרוס.
-- ---------------------------------------------------------------------

-- 9.1 יצירת בקשת אישור — נקראת בידי הקטין המחובר
--
--     חוזה התשובות מול הפרונט (src/consent.js → consentRequestError):
--       {ok:true, token}      — נוצרה בקשת initial חדשה.
--       'already_consented'   — כבר יש הסכמה בסיסית בתוקף על הנוסח
--                               הנוכחי, ואין שום צורך בקישור נוסף.
--                               זה **לא כשל**: ProfileForm.jsx קורא
--                               לפונקציה בכל שמירת פרופיל של קטין,
--                               ועליו לבלוע את התשובה הזו בשקט — בלי
--                               טוסט אדום — ולהמשיך כרגיל.
--       'suspended'           — ההורה ביטל את ההסכמה. מהחשבון של הקטין
--                               אי אפשר לייצר קישור חדש; ההחזרה
--                               לפעילות היא דרך קישור הניהול שביד
--                               ההורה או דרך admin_set_approval.
--       'manage_not_allowed'  — קישור ניהול לא נוצר לבקשת הקטין.
--       'email_locked' · 'rate_limited' · 'not_a_player' ·
--       'guardian_email_required' · 'not_authenticated' — כבעבר.
create or replace function public.create_consent_request(
  p_name     text,
  p_email    text,
  p_phone    text,
  p_relation text,
  p_purpose  text default 'initial'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_role     text;
  v_status   text;
  v_basic    text;
  v_doc      text;
  v_last     text;
  v_g        public.guardians%rowtype;
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_relation text := case when p_relation in ('parent', 'guardian', 'other') then p_relation else 'parent' end;
  v_open     int;
  v_token    text;
  v_exp      timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_purpose is null or p_purpose not in ('initial', 'manage') then
    return jsonb_build_object('ok', false, 'reason', 'bad_purpose');
  end if;

  -- קישור הניהול (365 יום, ורק בו מותר 'revoked' ומותר לשנות הכרעה
  -- קיימת) נוצר אך ורק בתוך submit_parent_consent בסיום אישור ההורה,
  -- ונמסר להורה בלבד. הפרונט מעולם לא ביקש 'manage' כאן — אבל ה-RPC
  -- פתוח ל-authenticated, כלומר הקטין יכול היה לבקש לעצמו טוקן שעוקף
  -- את כל ההגנות שנוספו ב-submit_parent_consent.
  if p_purpose = 'manage' then
    return jsonb_build_object('ok', false, 'reason', 'manage_not_allowed');
  end if;

  select p.role, p.approval_status into v_role, v_status
    from public.profiles p where p.id = v_uid;
  if coalesce(v_role, '') <> 'player' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_player');
  end if;

  v_basic := public.latest_consent(v_uid, 'basic');

  -- ההורה ביטל → החשבון מושעה, והקטין לא מייצר לעצמו קישור חדש.
  -- has_consent() כאן הייתה מחזירה false אחרי ביטול, כלומר "מותר" —
  -- ולכן בודקים את הערך עצמו. בלי זה הבלם המשפטי היחיד של ההורה היה
  -- נמחק בכמה קליקים: קישור חדש → הקטין פותח אותו בעצמו → 'active'.
  if v_basic = 'revoked' or coalesce(v_status, 'active') = 'suspended' then
    return jsonb_build_object('ok', false, 'reason', 'suspended');
  end if;

  -- כבר יש הסכמה בתוקף → אין צורך בקישור, ואסור לייצר אותו: טוקן
  -- initial חדש היה מאפשר לקטין לשדרג הסכמות שההורה סירב להן.
  -- חריג יחיד: נוסח המסמך התעדכן מאז ההסכמה האחרונה — זה בדיוק
  -- needs_reconsent שב-9.6, וגם מצבם של כל הקטינים שעברו ב-backfill
  -- (אצלם doc_version ריק). גרסת הנוסח נכתבת בשרת בלבד, ולכן הקטין
  -- לא יכול לייצר לעצמו את החריג הזה.
  if v_basic = 'granted' then
    select version into v_doc from public.consent_documents where id = 'doc_a';
    select c.doc_version into v_last
      from public.consents c
     where c.minor_id = v_uid and c.consent_type = 'basic'
     order by c.created_at desc, c.id desc
     limit 1;
    if coalesce(v_last, '') is not distinct from coalesce(v_doc, '') then
      return jsonb_build_object('ok', false, 'reason', 'already_consented');
    end if;
  end if;

  -- הגבלת קצב: לא יותר מ-5 בקשות ב-24 שעות (הקישור נשלח בוואטסאפ,
  -- אין סיבה לגיטימית לייצר יותר).
  select count(*) into v_open
    from public.consent_requests cr
   where cr.minor_id = v_uid and cr.created_at > now() - interval '24 hours';
  if v_open >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select * into v_g from public.guardians g where g.minor_id = v_uid;

  -- מייל ההורה ננעל ברגע שנרשמה הכרעה כלשהי של הורה — granted, denied
  -- או revoked. בלי זה קטין היה מייצר בקשה חדשה למייל שבשליטתו ומאשר
  -- לעצמו. הבדיקה היא latest_consent is not null ולא has_consent:
  -- אחרי ביטול has_consent חוזרת false, והנעילה הישנה נפתחה בדיוק
  -- ברגע שבו ההורה הכי צריך אותה.
  if v_g.id is not null
     and v_basic is not null
     and v_email <> '' and v_email <> lower(v_g.email) then
    return jsonb_build_object('ok', false, 'reason', 'email_locked');
  end if;

  if v_g.id is null and v_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'guardian_email_required');
  end if;

  perform set_config('app.consent_writer', 'on', true);

  if v_g.id is null then
    insert into public.guardians (minor_id, full_name, email, phone, relation)
    values (v_uid, nullif(btrim(coalesce(p_name, '')), ''), v_email,
            nullif(btrim(coalesce(p_phone, '')), ''), v_relation)
    returning * into v_g;
  else
    update public.guardians g
       set full_name  = coalesce(nullif(btrim(coalesce(p_name, '')), ''), g.full_name),
           email      = case when v_email = '' then g.email else v_email end,
           phone      = coalesce(nullif(btrim(coalesce(p_phone, '')), ''), g.phone),
           relation   = v_relation,
           updated_at = now()
     where g.minor_id = v_uid
    returning * into v_g;
  end if;

  -- שמירת מראה בעמודות הישנות — הפרונט שבפרוד קורא מהן
  update public.profiles
     set guardian_name  = v_g.full_name,
         guardian_email = v_g.email,
         guardian_phone = v_g.phone,
         updated_at     = now()
   where id = v_uid;

  -- בקשה חדשה מבטלת בקשות initial פתוחות קודמות. purpose הוא תמיד
  -- 'initial' כאן — 'manage' נדחה בראש הפונקציה.
  update public.consent_requests
     set expires_at = now()
   where minor_id = v_uid and purpose = 'initial'
     and used_at is null and expires_at > now();
  v_exp := now() + interval '72 hours';

  v_token := public.new_consent_token();

  insert into public.consent_requests (minor_id, guardian_id, token_hash, purpose, expires_at)
  values (v_uid, v_g.id, public.consent_token_hash(v_token), 'initial', v_exp);

  perform set_config('app.consent_writer', 'off', true);

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_exp);
end;
$$;

revoke all on function public.create_consent_request(text, text, text, text, text) from public, anon;
grant execute on function public.create_consent_request(text, text, text, text, text) to authenticated;


-- 9.2 קריאת הבקשה בידי ההורה (anon — ההורה אינו משתמש רשום)
--     מחזיר שם פרטי + אות ראשונה של שם המשפחה בלבד: מזעור מידע, ומי
--     שמנחש טוקנים לא מקבל מאגר שמות.
create or replace function public.get_consent_request(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.consent_requests%rowtype;
  g public.guardians%rowtype;
  p public.profiles%rowtype;
  d public.consent_documents%rowtype;
begin
  select * into r from public.consent_requests cr
   where cr.token_hash = public.consent_token_hash(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if r.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if r.purpose = 'initial' and r.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  select * into g from public.guardians where id = r.guardian_id;
  select * into p from public.profiles  where id = r.minor_id;
  select * into d from public.consent_documents where id = 'doc_a';

  return jsonb_build_object(
    'ok',      true,
    'purpose', r.purpose,
    'minor_name', btrim(coalesce(p.first_name, '') || ' ' ||
                        case when coalesce(p.last_name, '') <> ''
                             then left(p.last_name, 1) || '.' else '' end),
    'guardian_name',  g.full_name,
    'guardian_email', g.email,
    'doc', jsonb_build_object('id', d.id, 'version', d.version,
                              'title', d.title, 'body_html', d.body_html),
    'terms_version',   (select version from public.consent_documents where id = 'terms'),
    'privacy_version', (select version from public.consent_documents where id = 'privacy'),
    'state',      public.consent_state(r.minor_id),
    'expires_at', r.expires_at
  );
end;
$$;

revoke all on function public.get_consent_request(text) from public;
grant execute on function public.get_consent_request(text) to anon, authenticated;


-- 9.3 שליחת ההחלטות בידי ההורה (anon)
create or replace function public.submit_parent_consent(p_token text, p_decisions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          public.consent_requests%rowtype;
  v_key      text;
  v_val      text;
  v_prev     text;
  v_self     boolean := false;
  v_basic    text;
  v_doc      text;
  v_terms    text;
  v_privacy  text;
  v_ip       text;
  v_ua       text;
  v_hdrs     json;
  v_mtoken   text;
  v_allowed  text[] := array['basic', 'media_team', 'media_public', 'marketing'];
begin
  if p_decisions is null or jsonb_typeof(p_decisions) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'bad_decisions');
  end if;

  select * into r from public.consent_requests cr
   where cr.token_hash = public.consent_token_hash(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if r.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if r.purpose = 'initial' and r.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  -- האם השליחה הגיעה מהחשבון של הקטין עצמו. אין בפרויקט שום ערוץ
  -- מסירה בצד שרת (לא מייל ולא SMS), ולכן הטוקן מגיע להורה בידי הקטין
  -- ואי אפשר לאמת טכנית מי לחץ. את מה שאי אפשר למנוע — מתעדים: יומן
  -- ההסכמות הוא ראיה, ואסור שרשומה שנוצרה מהמכשיר של הקטין תיראה בו
  -- כאישור הורה נקי.
  v_self := (auth.uid() is not null and auth.uid() = r.minor_id);

  -- ולידציה של כל המפתחות לפני שכותבים ולו שורה אחת
  for v_key, v_val in select key, value from jsonb_each_text(p_decisions) loop
    if not (v_key = any(v_allowed)) then
      return jsonb_build_object('ok', false, 'reason', 'bad_type');
    end if;
    if v_val is null or v_val not in ('granted', 'denied', 'revoked') then
      return jsonb_build_object('ok', false, 'reason', 'bad_value');
    end if;
    -- ביטול הוא פעולה של קישור הניהול בלבד
    if v_val = 'revoked' and r.purpose <> 'manage' then
      return jsonb_build_object('ok', false, 'reason', 'revoke_not_allowed');
    end if;
    -- הפיכת הכרעה קיימת דרך קישור ראשוני — חסום. קישור initial נועד
    -- לאישור הראשון בלבד; שינוי החלטה שההורה כבר קיבל מחייב את קישור
    -- הניהול, שמוצג פעם אחת ורק על המכשיר של ההורה מיד אחרי האישור.
    -- זו ההגנה היחידה כאן שלא ניתן לעקוף בלי גישה למכשיר ההורה, והיא
    -- שסוגרת את התרחיש "ההורה סירב ל-media_public, והקטין מייצר טוקן
    -- initial טרי ומאשר לעצמו".
    -- החריג המכוון: 'basic' אחרי 'denied'. סירוב בסיסי מחזיר את החשבון
    -- ל-pending_parent, כלומר המערכת עצמה משאירה את הדלת פתוחה להורה
    -- שיחזור בו — חסימה כאן הייתה נועלת את החשבון לנצח בלי מסלול תיקון.
    -- 'revoked' נחסם תמיד, גם על basic: הוא הבלם המשפטי של ההורה.
    if r.purpose = 'initial' and v_val = 'granted' then
      v_prev := public.latest_consent(r.minor_id, v_key);
      if v_prev = 'revoked' or (v_prev = 'denied' and v_key <> 'basic') then
        return jsonb_build_object('ok', false, 'reason', 'upgrade_requires_manage');
      end if;
    end if;
  end loop;

  v_basic := p_decisions ->> 'basic';
  if r.purpose = 'initial' and coalesce(v_basic, '') not in ('granted', 'denied') then
    return jsonb_build_object('ok', false, 'reason', 'basic_required');
  end if;

  -- הגרסאות נקראות בצד שרת. הלקוח לא יכול לטעון שהוצג לו נוסח אחר.
  select version into v_doc     from public.consent_documents where id = 'doc_a';
  select version into v_terms   from public.consent_documents where id = 'terms';
  select version into v_privacy from public.consent_documents where id = 'privacy';

  -- request.headers לא תמיד מוגדר (SQL Editor, קריאה פנימית) — ולכן
  -- העטיפה. כישלון כאן לא יפיל אישור הורה תקף.
  begin
    v_hdrs := current_setting('request.headers', true)::json;
    v_ip   := split_part(coalesce(v_hdrs ->> 'x-forwarded-for', ''), ',', 1);
    v_ua   := left(coalesce(v_hdrs ->> 'user-agent', ''), 400);
  exception when others then
    v_ip := null;
    v_ua := null;
  end;
  v_ip := nullif(btrim(coalesce(v_ip, '')), '');
  v_ua := nullif(btrim(coalesce(v_ua, '')), '');

  for v_key, v_val in select key, value from jsonb_each_text(p_decisions) loop
    insert into public.consents (minor_id, guardian_id, request_id, consent_type, value,
                                 terms_version, privacy_version, doc_version,
                                 ip, user_agent, source, note)
    values (r.minor_id, r.guardian_id, r.id, v_key, v_val,
            v_terms, v_privacy, v_doc, v_ip, v_ua, 'parent_link',
            case when v_self then 'self_submitted' end);
  end loop;

  perform set_config('app.consent_writer', 'on', true);

  if v_basic = 'granted' then
    update public.profiles
       set approval_status          = 'active',
           guardian_consent_at      = now(),
           guardian_consent_version = v_doc,
           updated_at               = now()
     where id = r.minor_id;

    -- אישור מחדש מבטל את בקשת המחיקה שנוצרה בביטול הקודם. בלי זה
    -- הבקשה נשארת 'pending' בלשונית «בקשות מחיקת חשבון» באדמין, מתחת
    -- לכיתוב שמנחה למחוק בפועל תוך 30 יום — כלומר חשבון פעיל ומאושר
    -- עלול להימחק. השוואת שוויון מדויקת ל-reason ולא LIKE: בקשת מחיקה
    -- שהקטין הגיש בעצמו (reason ריק, PlayerDashboard) לעולם לא תבוטל
    -- מאחורי גבו — זכות המחיקה שלו נשמרת. הטקסט חייב להישאר זהה לזה
    -- שבענף ה-'revoked' שלמטה.
    update public.account_deletion_requests
       set status = 'cancelled'
     where user_id = r.minor_id
       and status  = 'pending'
       and reason  = 'ביטול הסכמת הורה דרך קישור הניהול';
  elsif v_basic = 'revoked' then
    update public.profiles
       set approval_status = 'suspended',
           updated_at      = now()
     where id = r.minor_id;
    -- ביטול ההסכמה הבסיסית = בקשת מחיקת חשבון, לפי סעיף 9 במסמך א'
    insert into public.account_deletion_requests (user_id, reason)
    select r.minor_id, 'ביטול הסכמת הורה דרך קישור הניהול'
     where not exists (
       select 1 from public.account_deletion_requests adr
        where adr.user_id = r.minor_id and adr.status = 'pending'
     );
  elsif v_basic = 'denied' then
    update public.profiles
       set approval_status = 'pending_parent',
           updated_at      = now()
     where id = r.minor_id;
  end if;

  if r.purpose = 'initial' then
    update public.consent_requests set used_at = now() where id = r.id;

    -- אישור ראשוני שהתקבל → מייצרים להורה קישור ניהול קבוע לשמירה.
    -- לא כשהשליחה הגיעה מהחשבון של הקטין: אישור-עצמי לא יזכה אותו גם
    -- בטוקן ניהול תקף לשנה, שבו מותר לשנות כל הכרעה ולבטל. זה חיכוך,
    -- לא בקרה — גלישה בסתר או התנתקות עוקפות אותו — ולכן אסור להציג
    -- אותו כהגנה. ההגנה האמיתית היא upgrade_requires_manage שלמעלה.
    if v_basic = 'granted' and not v_self then
      v_mtoken := public.new_consent_token();
      insert into public.consent_requests (minor_id, guardian_id, token_hash, purpose, expires_at)
      values (r.minor_id, r.guardian_id, public.consent_token_hash(v_mtoken),
              'manage', now() + interval '365 days');
    end if;
  end if;

  perform set_config('app.consent_writer', 'off', true);

  return jsonb_build_object('ok', true,
                            'state', public.consent_state(r.minor_id),
                            'manage_token', v_mtoken);
end;
$$;

revoke all on function public.submit_parent_consent(text, jsonb) from public;
grant execute on function public.submit_parent_consent(text, jsonb) to anon, authenticated;


-- 9.4 אישור עצמי בהגיע לגיל 18 (ממצא ProfileForm.jsx:37)
create or replace function public.confirm_adult()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  p       public.profiles%rowtype;
  v_age   int;
  v_doc   text;
  v_terms text;
  v_privacy text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into p from public.profiles where id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  -- הגנת עומק — הדלת השנייה. הפונקציה סומכת על birth_date/birth_year
  -- שבפרופיל, ולכן מי שיכול לערוך אותם יכול לאשר את עצמו: עורכים תאריך,
  -- קוראים ל-RPC, ומקבלים 'active' + שורת consent חתומה. הנעילה שבטריגר
  -- (v_age_locked) חוסמת את העריכה עצמה; כאן חוסמים את מה שנשאר —
  -- חשבון שההורה ביטל בו את ההסכמה לא ישוחרר בידי המשתמש עצמו, גם אם
  -- הגיל הרשום אומר שהוא בגיר. החזרה לפעילות היא דרך קישור הניהול של
  -- ההורה או דרך admin_set_approval.
  if coalesce(p.approval_status, 'active') = 'suspended'
     or public.latest_consent(v_uid, 'basic') = 'revoked' then
    return jsonb_build_object('ok', false, 'reason', 'suspended');
  end if;

  v_age := public.minor_age(p.birth_date, p.birth_year);
  if v_age is null or v_age < 18 then
    return jsonb_build_object('ok', false, 'reason', 'not_adult');
  end if;

  select version into v_doc     from public.consent_documents where id = 'doc_a';
  select version into v_terms   from public.consent_documents where id = 'terms';
  select version into v_privacy from public.consent_documents where id = 'privacy';

  -- הנתונים שעליהם ההכרעה הסתמכה נכנסים ליומן. בלי זה רשומת self_adult
  -- אינה ניתנת לבדיקה בדיעבד: היא מצהירה "בגיר" בלי לומר לפי מה.
  insert into public.consents (minor_id, consent_type, value,
                               terms_version, privacy_version, doc_version, source, note)
  values (v_uid, 'basic', 'granted', v_terms, v_privacy, v_doc, 'self_adult',
          format('self_adult · birth_date=%s · birth_year=%s · age=%s',
                 coalesce(p.birth_date::text, '—'),
                 coalesce(p.birth_year::text, '—'),
                 v_age));

  perform set_config('app.consent_writer', 'on', true);

  -- מזעור מידע: פרטי ההורה איבדו את מטרתם ברגע שהמשתמש בגיר
  update public.profiles
     set adult_confirmed_at      = now(),
         approval_status         = 'active',
         guardian_name           = null,
         guardian_email          = null,
         guardian_phone          = null,
         guardian_consent_at     = null,
         guardian_consent_version = null,
         accepted_terms_at       = coalesce(accepted_terms_at, now()),
         terms_version           = coalesce(terms_version, v_terms),
         updated_at              = now()
   where id = v_uid;

  delete from public.guardians where minor_id = v_uid;
  update public.consent_requests set expires_at = now()
   where minor_id = v_uid and expires_at > now();

  perform set_config('app.consent_writer', 'off', true);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.confirm_adult() from public, anon;
grant execute on function public.confirm_adult() to authenticated;


-- 9.5 רישום אישור התנאים בהרשמה — גיבוי מפורש לחתימה שבטריגר
--     (הפרונט יכול לקרוא לזה מיד אחרי signUp; אם לא קרא, הטריגר חותם
--      בהשלמת הפרופיל. בשני המקרים החתימה היא של השרת.)
create or replace function public.accept_terms()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_terms text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select version into v_terms from public.consent_documents where id = 'terms';

  perform set_config('app.consent_writer', 'on', true);
  update public.profiles
     set accepted_terms_at = coalesce(accepted_terms_at, now()),
         terms_version     = coalesce(terms_version, v_terms)
   where id = v_uid;
  perform set_config('app.consent_writer', 'off', true);

  return jsonb_build_object('ok', true, 'terms_version', v_terms);
end;
$$;

revoke all on function public.accept_terms() from public, anon;
grant execute on function public.accept_terms() to authenticated;


-- 9.6 מצב ההסכמות של המשתמש עצמו — כל מה שמסך הפרופיל צריך
create or replace function public.my_consent_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  p         public.profiles%rowtype;
  g         public.guardians%rowtype;
  v_age     int;
  v_doc     text;
  v_last    text;
  v_minor   boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into p from public.profiles where id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  select * into g from public.guardians where minor_id = v_uid;

  v_age   := public.minor_age(p.birth_date, p.birth_year);
  v_minor := (coalesce(p.role, '') = 'player' and v_age is not null and v_age < 18);

  select version into v_doc from public.consent_documents where id = 'doc_a';
  select c.doc_version into v_last
    from public.consents c
   where c.minor_id = v_uid and c.consent_type = 'basic'
   order by c.created_at desc, c.id desc
   limit 1;

  return jsonb_build_object(
    'ok',              true,
    'approval_status', coalesce(p.approval_status, 'active'),
    'guardian_email',  coalesce(g.email, p.guardian_email),
    'guardian_name',   coalesce(g.full_name, p.guardian_name),
    'doc_version',     v_doc,
    'needs_reconsent', (v_minor
                        and public.has_consent(v_uid, 'basic')
                        and coalesce(v_last, '') is distinct from coalesce(v_doc, '')),
    'is_minor',        v_minor,
    'age',             v_age,
    'state',           public.consent_state(v_uid)
  );
end;
$$;

revoke all on function public.my_consent_state() from public, anon;
grant execute on function public.my_consent_state() to authenticated;


-- 9.7 אדמין — לוג ההסכמות של קטין
drop function if exists public.admin_consent_log(uuid);
create or replace function public.admin_consent_log(p_minor uuid)
returns setof public.consents
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
    select * from public.consents c
     where c.minor_id = p_minor
     order by c.created_at desc;
end;
$$;

revoke all on function public.admin_consent_log(uuid) from public, anon;
grant execute on function public.admin_consent_log(uuid) to authenticated;


-- 9.8 אדמין — ביטול הסכמה (למשל בעקבות פניית הורה בטלפון)
create or replace function public.admin_revoke_consent(p_minor uuid, p_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc text;
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;
  if p_type not in ('basic', 'media_team', 'media_public', 'marketing') then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;

  select version into v_doc from public.consent_documents where id = 'doc_a';

  insert into public.consents (minor_id, consent_type, value, doc_version, source)
  values (p_minor, p_type, 'revoked', v_doc, 'admin');

  if p_type = 'basic' then
    perform set_config('app.consent_writer', 'on', true);
    update public.profiles
       set approval_status = 'suspended', updated_at = now()
     where id = p_minor;
    perform set_config('app.consent_writer', 'off', true);
  end if;

  return jsonb_build_object('ok', true, 'state', public.consent_state(p_minor));
end;
$$;

revoke all on function public.admin_revoke_consent(uuid, text) from public, anon;
grant execute on function public.admin_revoke_consent(uuid, text) to authenticated;


-- 9.8ב אדמין — קביעת מצב חשבון ידנית.
--      נחוץ כי סעיף 10 שולל UPDATE על approval_status מכל המשתמשים,
--      ואדמין הוא בסופו של דבר authenticated גם הוא. זה הנתיב היחיד
--      להחזיר חשבון מושעה לפעילות (למשל אחרי בירור טלפוני עם ההורה).
create or replace function public.admin_set_approval(p_user uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hit boolean;
  v_doc text;
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;
  if p_status not in ('active', 'pending_parent', 'suspended') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;

  -- החזרה לפעילות של חשבון שההסכמה בו בוטלה חייבת להשאיר עקבות ביומן,
  -- אחרת היא לא מחזיקה מעמד: הטריגר מחזיר ל-'suspended' כל שורה
  -- שההכרעה האחרונה שלה היא 'revoked', ולכן העדכון הידני היה נמחק
  -- בשמירת הפרופיל הבאה של השחקן. הרשומה כאן היא בדיוק מה שקרה —
  -- אדמין רשם שההסכמה חודשה (למשל אחרי בירור טלפוני עם ההורה),
  -- והיא מסומנת source='admin' כדי שלא תיראה כאישור שההורה עשה בעצמו.
  if p_status = 'active' and public.latest_consent(p_user, 'basic') = 'revoked' then
    select version into v_doc from public.consent_documents where id = 'doc_a';
    insert into public.consents (minor_id, consent_type, value, doc_version, source, note)
    values (p_user, 'basic', 'granted', v_doc, 'admin', 'admin_set_approval · reinstated');
  end if;

  perform set_config('app.consent_writer', 'on', true);
  update public.profiles set approval_status = p_status, updated_at = now() where id = p_user;
  -- שים לב: perform מאפס את found, ולכן בודקים אותו מיד אחרי ה-UPDATE
  v_hit := found;
  perform set_config('app.consent_writer', 'off', true);

  if not v_hit then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'approval_status', p_status);
end;
$$;

revoke all on function public.admin_set_approval(uuid, text) from public, anon;
grant execute on function public.admin_set_approval(uuid, text) to authenticated;


-- 9.9 אדמין — קטינים שממתינים לאישור הורה
drop function if exists public.admin_pending_minors();
create or replace function public.admin_pending_minors()
returns table (
  id             uuid,
  first_name     text,
  last_name      text,
  approval_status text,
  guardian_email text,
  guardian_name  text,
  created_at     timestamptz
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
    select p.id, p.first_name, p.last_name, p.approval_status,
           coalesce(g.email, p.guardian_email),
           coalesce(g.full_name, p.guardian_name),
           p.created_at
      from public.profiles p
      left join public.guardians g on g.minor_id = p.id
     where p.approval_status in ('pending_parent', 'suspended')
     order by p.created_at desc;
end;
$$;

revoke all on function public.admin_pending_minors() from public, anon;
grant execute on function public.admin_pending_minors() to authenticated;


-- 9.10 אדמין — בקשות מחיקת חשבון (ה-UI שחסר לגמרי לפי הביקורת).
--      email_hint ממוסך: אדמין צריך לזהות פנייה, לא לקבל מאגר מיילים.
--      approval_status מוחזר כדי שה-UI יסמן באזהרה בקשה ממתינה על חשבון
--      *פעיל* — בקשה שנוצרה בביטול הסכמה ולא בוטלה משום סיבה לא תוביל
--      למחיקת חשבון חי. status יכול להיות גם 'cancelled' (סעיף 8ב).
drop function if exists public.admin_deletion_requests();
create or replace function public.admin_deletion_requests()
returns table (
  id              uuid,
  user_id         uuid,
  first_name      text,
  last_name       text,
  email_hint      text,
  reason          text,
  status          text,
  created_at      timestamptz,
  approval_status text
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
    select adr.id, adr.user_id, p.first_name, p.last_name,
           case when coalesce(u.email, '') = '' then null
                else left(u.email, 2) || '***@' || split_part(u.email, '@', 2) end,
           adr.reason, adr.status, adr.created_at, p.approval_status
      from public.account_deletion_requests adr
      left join public.profiles p on p.id = adr.user_id
      left join auth.users     u on u.id = adr.user_id
     order by (adr.status = 'pending') desc, adr.created_at desc;
end;
$$;

revoke all on function public.admin_deletion_requests() from public, anon;
grant execute on function public.admin_deletion_requests() to authenticated;


-- 9.11 אדמין — סימון בקשת מחיקה כטופלה
create or replace function public.admin_mark_deletion_done(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;
  update public.account_deletion_requests set status = 'done' where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_mark_deletion_done(uuid) from public, anon;
grant execute on function public.admin_mark_deletion_done(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 10) נעילת עמודות ההסכמה ברמת ההרשאות
--
--     ההחלטה, ולמה היא לא זהה למה שנכתב בביקורת:
--
--     (א) המלכודת של privacy4 חלה גם כאן — הרשאות ב-Postgres מצטברות,
--         ו-"revoke update (col)" לא עושה כלום כל עוד קיימת הרשאת
--         UPDATE על כל הטבלה (וזו ברירת המחדל של Supabase). לכן שוללים
--         קודם את ההרשאה הרוחבית, ואז מעניקים בחזרה עמודה-עמודה.
--
--     (ב) מה נכנס לרשימה השחורה עכשיו — עמודות רשומת ההסכמה עצמה:
--         guardian_consent_at, guardian_consent_version, approval_status,
--         adult_confirmed_at, accepted_terms_at, terms_version. אלה
--         נכתבות מהיום אך ורק בשרת (RPC או טריגר). מכאן ואילך אין דרך
--         שבה קטין מייצר לעצמו הסכמה — גם לא בקריאת REST ישירה.
--
--     (ג) מה נשאר מותר בכוונה: guardian_name / guardian_email /
--         guardian_phone / birth_year / birth_date, וכן id (PostgREST
--         מכניס את מפתח ה-upsert גם ל-SET, ובלעדיו כל שמירת פרופיל
--         נופלת על 42501). את חמש העמודות הראשונות שולח הפרונט בכל
--         שמירת פרופיל של קטין — גם זה שבפרוד עכשיו וגם החדש (הן פרטי
--         קשר, לא הסכמה). ההגנה עליהן היא בטריגר שבסעיף 7: כל עוד לא
--         הוכרעה הסכמה הן פתוחות לעריכה, ומרגע שהורה אישר הן מוחזרות
--         בשקט לערכן הקודם — כך שאי אפשר להסיט את מייל ההורה ואי אפשר
--         "להזדקן" בדיעבד, בלי לשבור שום לקוח.
--
--     (ד) אם וכאשר כתיבת guardian_* תעבור כולה ל-create_consent_request
--         והפרונט יפסיק לשלוח אותן ב-upsert — הרץ את הבלוק «שלב 2»
--         למטה, והנעילה תיסגר גם ברמת ההרשאה.
--
--     (ה) סדר פריסה: הפרונט של הגל הזה כבר לא שולח guardian_consent_at
--         (הוא שולח אותו רק במסלול ה-legacy, שנכנס לפעולה אך ורק כשהמסד
--         *לא* הריץ את הקובץ הזה). לכן הרץ את המיגרציה ופרוס את הבנייה
--         באותו חלון זמן. לשונית ישנה שנשארה פתוחה בדפדפן של קטין
--         תקבל 42501 על שמירת פרופיל עד רענון — זו העלות היחידה.
--         אם צריך לפתוח את זה זמנית:
--           grant update (guardian_consent_at, guardian_consent_version)
--             on public.profiles to authenticated;
--         (ההגנה עדיין עומדת: הטריגר שבסעיף 7 מחזיר את הערכים בשקט.)
-- ---------------------------------------------------------------------
do $upd$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'profiles'
     and column_name not in (
       'created_at',
       'approval_status', 'adult_confirmed_at',
       'accepted_terms_at', 'terms_version',
       'guardian_consent_at', 'guardian_consent_version'
     );

  revoke update on public.profiles from anon, authenticated;
  if v_cols is not null then
    execute format('grant update (%s) on public.profiles to authenticated', v_cols);
  end if;
end $upd$;

-- ------------------------- שלב 2 (אחרי פריסת הפרונט) -------------------
-- הסר את סימני ההערה והרץ מחדש רק את הבלוק הזה:
--
-- do $upd2$
-- declare v_cols text;
-- begin
--   select string_agg(quote_ident(column_name), ', ' order by column_name)
--     into v_cols
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name not in (
--        'created_at',
--        'approval_status', 'adult_confirmed_at',
--        'accepted_terms_at', 'terms_version',
--        'guardian_consent_at', 'guardian_consent_version',
--        'guardian_name', 'guardian_email', 'guardian_phone',
--        'birth_year', 'birth_date'
--      );
--   revoke update on public.profiles from anon, authenticated;
--   execute format('grant update (%s) on public.profiles to authenticated', v_cols);
-- end $upd2$;
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 10ג) החלת השער למפרע על שחקנים קיימים
--
--  התגלה בהרצה בפרודקשן (3.8.2026): העמודה approval_status נוספת עם
--  default 'active', והטריגר trg_minor_consent רץ רק ב-INSERT/UPDATE —
--  ולכן על שורות שכבר קיימות הוא לא רץ מעולם. התוצאה: **כל קטין שכבר
--  רשום נשאר active** עד הפעם הבאה שהפרופיל שלו יישמר במקרה. המכונה
--  נכונה אבל לא מוחלת למפרע, וזה מרוקן את השער מתוכן בהתקנה על מסד קיים.
--
--  UPDATE ריק מפעיל את הטריגר, והוא מחשב את הסטטוס מחדש לכל שחקן:
--    קטין בלי הסכמה  → pending_parent
--    קטין עם הסכמה שה-backfill (10ב) הכיר בה → נשאר active
--    בגיר → נשאר active
--  suspended שנקבע בידי אדמין שורד — הטריגר מכבד שער סגור.
--
--  התנאי על תאריך הלידה הכרחי: שורת שחקן בלי גיל כלל תזרוק
--  'חובה למלא שנת לידה בפרופיל שחקן' ותפיל את כל הקובץ.
-- ---------------------------------------------------------------------
do $gate$
declare v_pending int; v_skipped int;
begin
  select count(*) into v_skipped
    from public.profiles
   where role = 'player' and birth_year is null and birth_date is null;

  update public.profiles
     set updated_at = now()
   where role = 'player'
     and (birth_year is not null or birth_date is not null);

  select count(*) into v_pending
    from public.profiles where approval_status = 'pending_parent';

  raise notice 'שער הקטינים הוחל למפרע: % שחקנים ממתינים כעת לאישור הורה', v_pending;
  if v_skipped > 0 then
    raise warning 'דולגו % שורות שחקן בלי שנת/תאריך לידה — הן יישארו active עד שיושלם הגיל', v_skipped;
  end if;
end $gate$;


-- ---------------------------------------------------------------------
-- 11) רענון סכימת ה-API + רישום בלדג'ר
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_parent_consent.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקת עשן אחרי ההרצה
--
--  1) הנוסח נטען:
--       select id, version, length(body_html) from public.consent_documents;
--     שלוש שורות: doc_a (ארוך), terms, privacy — כולן 'v1 · 3.8.2026'.
--
--  2) הגיל שמרני (הממצא של legal_launch:25). בשנת 2026:
--       select public.minor_age(null, 2008);          -- 17  → עדיין קטין
--       select public.minor_age('2008-01-05', null);  -- 18  → בגיר
--
--  3) יומן ההסכמות באמת חסין. שתי השורות האלה חייבות להיכשל:
--       update public.consents set value = 'granted';
--       delete from public.consents;
--
--  4) Backfill: כל מי שהסכים בזרימה הישנה קיבל שורה וגם ישות הורה:
--       select count(*) from public.consents where source = 'legacy_profile';
--       select count(*) from public.guardians;
--     שני המספרים אמורים להיות זהים למספר:
--       select count(*) from public.profiles
--        where guardian_email is not null and guardian_consent_at is not null;
--
--  5) הזרימה המלאה (מחשבון שחקן קטין מחובר, בקונסולת הדפדפן):
--       await supabase.rpc('create_consent_request',
--         { p_name:'הורה בדיקה', p_email:'parent@example.com',
--           p_phone:'0500000000', p_relation:'parent', p_purpose:'initial' })
--     → {ok:true, token}. הקישור להורה: #/consent/<token>
--       await supabase.rpc('get_consent_request', { p_token: '<token>' })
--     → {ok:true, doc:{...}} — עובד גם בלי התחברות (anon).
--       await supabase.rpc('submit_parent_consent',
--         { p_token:'<token>',
--           p_decisions:{ basic:'granted', media_team:'granted',
--                         media_public:'denied', marketing:'denied' } })
--     → {ok:true, manage_token}. עכשיו:
--       select approval_status from public.profiles where id = '<uid>';  -- active
--
--  6) חד-פעמיות ואי-אפשרות ביטול בקישור הראשוני:
--       submit_parent_consent על אותו טוקן שוב        → {ok:false, reason:'used'}
--       submit_parent_consent עם basic:'revoked' על initial
--                                                      → {ok:false, reason:'revoke_not_allowed'}
--       get_consent_request עם טוקן אקראי             → {ok:false, reason:'not_found'}
--
--  7) הקטין לא יכול לזייף (מחשבון השחקן):
--       await supabase.from('profiles')
--         .update({ guardian_consent_at:new Date(), approval_status:'active' })
--         .eq('id', uid)
--     → 42501 (ההרשאה נשללה בסעיף 10). ואם ההרשאה כן קיימת אצלך —
--       השורה תישמר בלי שהערכים ישתנו (הטריגר מחזיר אותם).
--       ניסיון להסיט את מייל ההורה אחרי אישור:
--       create_consent_request(..., p_email:'kid@example.com', 'initial')
--     → {ok:false, reason:'email_locked'}
--
--  7ב) *הבדיקה החשובה בקובץ* — הקטין לא משחרר את עצמו מ-pending_parent.
--      חובה להריץ מחשבון של קטין שממתין להורה, בקונסולת הדפדפן, כדי
--      שהכתיבה תהיה בהקשר שלו. הרצה ב-SQL Editor בתפקיד הבעלים היא
--      כתיבה privileged (auth.uid() is null) ולכן אינה בודקת את השער:
--
--        const uid = (await supabase.auth.getUser()).data.user.id
--        await supabase.from('profiles').update({ birth_date: '2000-01-01' }).eq('id', uid)
--        await supabase.rpc('my_consent_state')
--
--      → approval_status חייב להישאר 'pending_parent'. גם birth_date
--        עצמו חוזר לערכו הקודם — הטריגר נועל עריכת גיל שהופכת לבגיר.
--        (עריכה שנשארת בתחום הקטינות כן תיקלט, בכוונה.)
--
--      ומיד אחריה, מאותו חשבון:
--        await supabase.rpc('confirm_adult')
--      → {ok:false, reason:'not_adult'} — הדלת השנייה סגורה גם היא.
--
--      לפני התיקון שתי השורות האלה הפכו את החשבון ל-'active' בלי שאף
--      הורה נגע במערכת.
--
--  7ג) ההגנות סביב הטוקן:
--        create_consent_request(..., p_purpose:'manage')  → 'manage_not_allowed'
--        create_consent_request אחרי אישור הורה תקף       → 'already_consented'
--        create_consent_request מחשבון מושעה              → 'suspended'
--        submit_parent_consent בטוקן initial על סעיף
--          שההורה סירב לו ({media_public:'granted'})      → 'upgrade_requires_manage'
--        submit_parent_consent מחשבון הקטין עצמו          → {ok:true} אבל
--          manage_token ריק, ובשורות ה-consents note='self_submitted'
--
--  7ד) ביטול ואישור מחדש לא משאירים בקשת מחיקה פתוחה (סעיף 8ב):
--        -- מקישור הניהול: {basic:'revoked'}
--        select status, reason from public.account_deletion_requests where user_id = '<uid>';
--        -- pending · 'ביטול הסכמת הורה דרך קישור הניהול'
--        -- ואז מאותו קישור ניהול: {basic:'granted'}
--        -- אותה שורה חייבת להיות 'cancelled', ו-approval_status חוזר ל-'active'
--
--  8) המעבר לגיל 18:
--       await supabase.rpc('confirm_adult')   -- מקטין → {ok:false,'not_adult'}
--                                             -- מבגיר → {ok:true} + guardian_* מתאפסים
--                                             -- ממושעה → {ok:false,'suspended'}
--
--  9) מאמן לא ננעל בטעות:
--       select public.is_active_user();       -- true גם בלי שורת פרופיל
--
-- 10) אדמין (מחשבון אדמין):
--       select * from public.admin_pending_minors();
--       select * from public.admin_deletion_requests();
--       select public.admin_revoke_consent('<uid>', 'basic');   -- משעה
--       select public.admin_set_approval('<uid>', 'active');    -- מחזיר לפעילות
--     מחשבון רגיל כל אחת מהן חייבת ליפול על «למנהלים בלבד».
-- =====================================================================
