-- =====================================================================
-- CourtSide — עולם המשחק: הליבה  ·  12.8.2026
--
-- מה זה נותן: התשתית המשותפת לאתגר השבועי ולניחושים — **פנקס נקודות אחד**,
-- טבלאות דירוג, שם תצוגה בטוח לקטין, ושער כניסה יחיד לכל כתיבה תחרותית.
-- הקובץ הזה לבדו אינו מציג כלום למשתמש; הוא הבסיס ש-40 ו-42 נשענים עליו.
--
-- ⚠ שלוש הכרעות שחשוב להבין לפני שנוגעים כאן:
--
--   1) **אין נתיב כתיבה ללקוח אל הפנקס.** game_points_ledger מקבלת
--      grant select בלבד. רק game_score_challenge() ו-game_score_round()
--      (קבצים 40 ו-42) כותבות אליה, ותמיד בדפוס «מחק בטווח וכתוב מחדש».
--      זו ההגנה החזקה ביותר מפני חישוב כפול — חזקה מכל בדיקה בקוד.
--
--   2) **game_can_play() ולא is_active_user().** האחרונה מחזירה true
--      כשאין שורת פרופיל (supabase_parent_consent.sql:337, ה-coalesce
--      מכוון ומתועד שם) — כלומר מי שנרשם ולא מילא פרופיל, ואולי קטין,
--      היה עובר ומופיע בטבלה בשורה בלי שם. כאן ההכרעה הפוכה: fail-closed.
--
--   3) **קטין לעולם אינו בוחר שם תצוגה.** game_display_name גוזרת
--      «דני כ.» ומתעלמת מ-display_name לגמרי מתחת לגיל 18. שדה טקסט
--      חופשי בלי מודרציה מבטל את ההגנה בעצמו — ילד יכתוב את שם המועדון
--      ושנת הלידה שלו, ואנחנו נפרסם את זה בטבלה ארצית.
--
-- אידמפוטנטי.
-- דורש: supabase_teams_admin.sql (is_admin) · supabase_parent_consent.sql
--       (minor_age, consents, consent_documents, approval_status) ·
--       supabase_rls_hardening_3_8.sql (is_banned) · supabase_migrations_ledger.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) בדיקת תלות — לכשול בקול רם, בלי לשבור את ההרצה
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
  if to_regprocedure('public.minor_age(date,int)') is null then
    raise notice '  ✋ עצור: public.minor_age() לא קיימת — הרץ supabase_parent_consent.sql.';
  end if;
  if to_regprocedure('public.is_banned()') is null then
    raise notice '  ✋ עצור: public.is_banned() לא קיימת — הרץ supabase_rls_hardening_3_8.sql.';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- 1) game_settings — שורה אחת, כל הכיוונונים של עולם המשחק
--
--     ה-CHECK בסוף הוא **שער עורך הדין כאילוץ במסד**, בתקדים
--     retention_schedule_armed_needs_signoff (supabase_retention_schedule.sql:97).
--     הבעלים בחר להשיק פתוח לכולם *ועם פרס* — הצירוף הזה מחייב תקנון
--     פומבי וחוות דעת. מכאן: אתגר עם פרס פשוט לא ייפתח בלי חתימה וקישור.
--     זה לא נוהל שאפשר לשכוח בשבוע השישי.
-- ---------------------------------------------------------------------
create table if not exists public.game_settings (
  id                boolean primary key default true check (id),

  tz                text        not null default 'Asia/Jerusalem',
  season_start_month int        not null default 9 check (season_start_month between 1 and 12),

  -- פרסים: הניחושים לעולם אינם ברשימה. ראה comment בהמשך.
  prize_scopes      text[]      not null default '{challenge}',
  prizes_enabled    boolean     not null default false,

  legal_ok_at       timestamptz,
  legal_ok_by       text,
  rules_url         text,

  -- חומת ההפרדה: ברירת המחדל **דלוקה** — הבעלים הכריע «שחקנים בלבד».
  wall_enabled      boolean     not null default true,

  challenge_rules   text        not null default
    'טייק אחד רצוף · הטיימר נראה בפריים · הסל והקולע בפריים · בפריים רק אתה · עד 60 שניות',
  video_max_seconds int         not null default 65,
  video_max_mb      int         not null default 50,

  updated_at        timestamptz not null default now(),

  constraint game_settings_prizes_need_signoff
    check (not prizes_enabled or (legal_ok_at is not null and rules_url is not null))
);

insert into public.game_settings (id) values (true) on conflict (id) do nothing;

comment on table public.game_settings is
  'כיוונוני עולם המשחק — שורה אחת. prize_scopes אינו כולל predictions: '
  'נקודות ניחושים לעולם אינן מזכות בטובת הנאה בעלת ערך, אחרת מדובר בהגרלה. '
  'שינוי הכלל מחייב חוות דעת משפטית מחודשת.';

alter table public.game_settings enable row level security;

drop policy if exists "game_settings_read"  on public.game_settings;
drop policy if exists "game_settings_admin" on public.game_settings;

create policy "game_settings_read" on public.game_settings
  for select to authenticated using (true);
create policy "game_settings_admin" on public.game_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 2) game_scoring_rules — הניקוד כנתון, לא כקוד
--
--     ⚠ הכיול **אינו רטרואקטיבי**: הפנקס שומר את מספר הנקודות שהיה
--     בתוקף ברגע החישוב. שינוי כאן משפיע קדימה בלבד.
--
--     min_entries: מספר ההגשות המאושרות שמהן החוק מתחיל לחול. הוא קיים
--     בגלל מקרה אמיתי — בארבע הגשות *כולם* בטופ-5, והטופ-5 מאבד משמעות.
-- ---------------------------------------------------------------------
create table if not exists public.game_scoring_rules (
  key         text primary key,
  points      int  not null,
  min_entries int  not null default 0,
  what        text not null,
  note        text,
  updated_at  timestamptz not null default now()
);

insert into public.game_scoring_rules (key, points, min_entries, what, note) values
  ('pred_direction',     3,  0, 'ניחוש כיוון נכון',            null),
  ('pred_exact',         5,  0, 'בונוס תוצאה מדויקת',          'נוסף על הכיוון — סה"כ 8'),
  ('pred_perfect_round', 10, 3, 'מחזור מושלם',                 'דורש לפחות 3 משחקים שנספרו'),
  ('chal_participate',   15, 0, 'הגשה מאושרת באתגר',           null),
  ('chal_top5',          15, 8, 'מקום בטופ-5 השבועי',          'רק מ-8 הגשות מאושרות ומעלה'),
  ('chal_win',           40, 0, 'ניצחון באתגר',                null),
  ('chal_streak3',       15, 0, 'שלושה אתגרים ברצף עם הגשה',   null)
on conflict (key) do nothing;

alter table public.game_scoring_rules enable row level security;

drop policy if exists "game_rules_read"  on public.game_scoring_rules;
drop policy if exists "game_rules_admin" on public.game_scoring_rules;

create policy "game_rules_read" on public.game_scoring_rules
  for select to authenticated using (true);
create policy "game_rules_admin" on public.game_scoring_rules
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 3) game_points_ledger — הלב
--
--     unique (user_id, scope, source_key) הוא מנגנון האנטי-כפילות
--     האמיתי. source_key הוא מפתח טבעי: 'fx:<uuid>' לניחוש על משחק,
--     'perfect:<round>', 'part:<challenge>', 'top5:<challenge>',
--     'win:<challenge>', 'streak:<seq>'. אותה עובדה = אותו מפתח = שורה אחת.
--
--     period_month נגזר מ**המחזור** ולא מזמן המשחק ולא מזמן התיקון —
--     משחק שנדחה מ-29.8 ל-8.9 נשאר בטבלה של אוגוסט, כי הוא חלק ממחזור
--     אוגוסט. אחרת הטבלה החודשית משתנה למפרע אחרי שהוכרז מנצח.
-- ---------------------------------------------------------------------
create table if not exists public.game_points_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  scope         text not null check (scope in ('predictions', 'challenge')),
  source_key    text not null,
  rule_key      text,
  points        int  not null,
  reason        text,

  occurred_at   timestamptz not null,
  occurred_on   date        not null,
  period_month  text        not null check (period_month  ~ '^\d{4}-\d{2}$'),
  period_season text        not null check (period_season ~ '^\d{4}/\d{4}$'),

  league_key    text,
  ref_round     uuid,
  ref_challenge uuid,

  created_at    timestamptz not null default now(),
  computed_at   timestamptz not null default now(),

  unique (user_id, scope, source_key)
);

create index if not exists game_ledger_month_idx  on public.game_points_ledger (scope, period_month,  user_id);
create index if not exists game_ledger_season_idx on public.game_points_ledger (scope, period_season, user_id);
create index if not exists game_ledger_round_idx  on public.game_points_ledger (ref_round)     where ref_round     is not null;
create index if not exists game_ledger_chal_idx   on public.game_points_ledger (ref_challenge) where ref_challenge is not null;
create index if not exists game_ledger_user_idx   on public.game_points_ledger (user_id, occurred_on desc);

comment on table public.game_points_ledger is
  'פנקס הנקודות. אין ללקוח נתיב כתיבה — רק game_score_round/game_score_challenge '
  'כותבות, בדפוס מחק-בטווח-וכתוב-מחדש. הפנקס שומר את הניקוד שהיה בתוקף בעת החישוב, '
  'ולכן שינוי ב-game_scoring_rules אינו רטרואקטיבי.';

alter table public.game_points_ledger enable row level security;

drop policy if exists "game_ledger_select_own" on public.game_points_ledger;
create policy "game_ledger_select_own" on public.game_points_ledger
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));


-- ---------------------------------------------------------------------
-- 4) game_month_locks — חודש שנסגר
-- ---------------------------------------------------------------------
create table if not exists public.game_month_locks (
  month      text primary key check (month ~ '^\d{4}-\d{2}$'),
  closed_at  timestamptz not null default now(),
  closed_by  uuid references public.profiles(id) on delete set null
);

alter table public.game_month_locks enable row level security;

drop policy if exists "game_locks_read"  on public.game_month_locks;
drop policy if exists "game_locks_admin" on public.game_month_locks;

create policy "game_locks_read" on public.game_month_locks
  for select to authenticated using (true);
create policy "game_locks_admin" on public.game_month_locks
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 5) game_participants — «אני בפנים»
--
--     ⚠ בלי הטבלה הזו הכפתור דקורטיבי: כל שידור היה הולך לכל שחקן
--     במערכת — כולל שחקנים של מאמנים אחרים שלא ביקשו כלום — ולא היה
--     שום מדד «נרשם → הצטרף → פעל».
-- ---------------------------------------------------------------------
create table if not exists public.game_participants (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  source    text
);

alter table public.game_participants enable row level security;

drop policy if exists "game_part_select_own" on public.game_participants;
drop policy if exists "game_part_insert_own" on public.game_participants;
drop policy if exists "game_part_delete_own" on public.game_participants;
drop policy if exists "game_part_admin"      on public.game_participants;

create policy "game_part_select_own" on public.game_participants
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "game_part_insert_own" on public.game_participants
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "game_part_delete_own" on public.game_participants
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "game_part_admin" on public.game_participants
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 6) game_awards — תארים ותגים
-- ---------------------------------------------------------------------
create table if not exists public.game_awards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  award_kind text not null check (award_kind in ('title', 'badge')),
  award_key  text not null,
  period_key text not null,
  scope      text check (scope in ('predictions', 'challenge')),
  ref_id     uuid,
  granted_at timestamptz not null default now(),
  meta       jsonb,
  unique (user_id, award_key, period_key)
);

create index if not exists game_awards_period_idx on public.game_awards (period_key, award_key);

alter table public.game_awards enable row level security;

-- ⚠ select **לא** פתוח לכולם: תארים של קטינים מזוהים לפי user_id.
--   החשיפה לאחרים עוברת אך ורק דרך game_board, שמחזירה שם תצוגה ומספר.
drop policy if exists "game_awards_select_own" on public.game_awards;
create policy "game_awards_select_own" on public.game_awards
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));


-- ---------------------------------------------------------------------
-- 7) זהות וחשיפה — עמודות על profiles
--
--     ⚠ **בכוונה בלי grant select על העמודות האלה.**
--     supabase_privacy4.sql מריץ revoke select on profiles ואז grant
--     לרשימה קשיחה; עמודה חדשה שנוסיף לרשימה תיעלם בהרצה חוזרת שלו.
--     לכן הקריאה עוברת דרך game_me() בלבד — ראה סעיף 9.
--
--     ⚠ ובלי unique על display_name: ייחודיות הופכת הרשמה לכישלון
--     («השם תפוס») בדיוק ברגע הרגיש ביותר במשפך.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists display_name       text;
alter table public.profiles add column if not exists display_name_at    timestamptz;
alter table public.profiles add column if not exists media_public_self  boolean not null default false;
alter table public.profiles add column if not exists ref_source         text;

do $cc$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass
                    and conname  = 'profiles_display_name_len') then
    alter table public.profiles add constraint profiles_display_name_len
      check (display_name is null or char_length(btrim(display_name)) between 2 and 20);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass
                    and conname  = 'profiles_ref_source_len') then
    alter table public.profiles add constraint profiles_ref_source_len
      check (ref_source is null or char_length(ref_source) <= 40);
  end if;
end $cc$;


-- ---------------------------------------------------------------------
-- 8) הפונקציות
-- ---------------------------------------------------------------------

-- 8.1 שעון השרת — כדי שלא יהיה ויכוח «השעון שלי מקדים בשלוש דקות»
create or replace function public.server_now()
returns timestamptz
language sql
stable
set search_path = public
as $$ select now(); $$;

-- 8.2 מפתחות התקופה — **המימוש היחיד** של שעון ישראל בכל המערכת.
--     עונה מתחילה בספטמבר: 9.2026 → '2026/2027', 3.2027 → '2026/2027'.
create or replace function public.game_period_keys(p_at timestamptz default now())
returns table (d date, month text, season text)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select coalesce((select g.tz from public.game_settings g where g.id), 'Asia/Jerusalem') as tz,
           coalesce((select g.season_start_month from public.game_settings g where g.id), 9)  as m0
  ),
  l as (select (p_at at time zone s.tz)::date as d, s.m0 from s)
  select l.d,
         to_char(l.d, 'YYYY-MM'),
         case when extract(month from l.d)::int >= l.m0
              then extract(year from l.d)::int     || '/' || (extract(year from l.d)::int + 1)
              else (extract(year from l.d)::int - 1) || '/' || extract(year from l.d)::int
         end
    from l;
$$;

-- 8.3 ניקוד לפי מפתח, עם ברירת מחדל אם החוק נמחק
create or replace function public.game_points(p_key text, p_fallback int default 0)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.points from public.game_scoring_rules r where r.key = p_key), p_fallback);
$$;

-- 8.4 שם התצוגה — שם משפחה מלא לא יוצא מכאן לעולם.
--
--     ⚠ ה-nullif-ים אינם קישוט: btrim('' || ' ' || '') מחזיר מחרוזת
--     ריקה ולא NULL, ובלעדיהם ה-coalesce ל'שחקן' היה קוד מת ובטבלה
--     הייתה מופיעה שורה עם שם ריק.
--     ⚠ קטין מקבל תמיד שם נגזר — display_name שלו לא נקרא בכלל.
create or replace function public.game_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
       when public.minor_age(p.birth_date, p.birth_year) is null
         or public.minor_age(p.birth_date, p.birth_year) < 18
       then nullif(btrim(coalesce(p.first_name, '') || ' ' ||
                         left(coalesce(p.last_name, ''), 1) ||
                         case when coalesce(p.last_name, '') <> '' then '.' else '' end), '')
       else coalesce(
              nullif(btrim(p.display_name), ''),
              nullif(btrim(coalesce(p.first_name, '') || ' ' ||
                           left(coalesce(p.last_name, ''), 1) ||
                           case when coalesce(p.last_name, '') <> '' then '.' else '' end), '')
            )
     end
       from public.profiles p where p.id = p_user),
    'שחקן');
$$;

-- 8.5 שער הכניסה לכל כתיבה תחרותית — fail-closed, ו**שחקנים בלבד**
--     (הכרעת הבעלים 12.8: מאמנים אינם מנחשים ואינם מגישים).
create or replace function public.game_can_play()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.approval_status = 'active'
        and coalesce(p.banned, false) = false
        and p.role = 'player'
        and p.first_name is not null
        and p.birth_date is not null
       from public.profiles p where p.id = auth.uid()),
    false);
$$;

comment on function public.game_can_play() is
  'שער יחיד לכתיבה תחרותית. במכוון fail-closed — בניגוד ל-is_active_user() '
  'שמחזירה true כשאין שורת פרופיל. דורש גם role=player: הבעלים הכריע שהמגרש '
  'המשחקי הוא של שחקנים בלבד.';

-- 8.6 האם המשתמש מופיע בטבלאות
create or replace function public.game_is_listed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.approval_status = 'active'
        and coalesce(p.banned, false) = false
        and p.role = 'player'
        and p.first_name is not null
       from public.profiles p where p.id = p_user),
    false);
$$;

-- 8.7 חומת ההפרדה — בעל תפקיד מקצועי אינו רואה את עולם המשחק.
--     האדמין פטור, אחרת אי אפשר לתפעל.
create or replace function public.game_wall_blocks()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select public.is_admin()) then false
    when not coalesce((select g.wall_enabled from public.game_settings g where g.id), true) then false
    else coalesce((select p.role <> 'player' from public.profiles p where p.id = auth.uid()), true)
  end;
$$;

-- 8.8 שער הפרסום — ארבעה תנאים, כולם חובה.
--
--     ⚠ doc_version: הורה שסימן «מדיה» בגרסה ישנה של נוסח ההסכמה אישר
--       תמונת קבוצה באתר — לא ריל של 45 שניות עם פני ילדו ועם ספונסר.
--     ⚠ note <> 'self_submitted': ילד שאישר מהמכשיר של עצמו **יכול
--       לשחק, אבל לא להתפרסם**. הנתון כבר נרשם היום ב-submit_parent_consent
--       ואיש לא צרך אותו. זו ההגנה הטובה ביותר שיש נגד אישור עצמי.
create or replace function public.game_publish_ok(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((select public.minor_age(p.birth_date, p.birth_year) >= 18
                     from public.profiles p where p.id = p_user), false)
      then coalesce((select p.media_public_self from public.profiles p where p.id = p_user), false)
    else coalesce((
      select c.value = 'granted'
         and c.source = 'parent_link'
         and c.note is distinct from 'self_submitted'
         and c.doc_version = (select d.version from public.consent_documents d where d.id = 'doc_a')
        from public.consents c
       where c.minor_id = p_user and c.consent_type = 'media_public'
       order by c.created_at desc, c.id desc
       limit 1), false)
  end;
$$;

-- 8.9 הסיבה שאין אישור פרסום — לתצוגה במסך האדמין
create or replace function public.game_publish_reason(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_age int; v_row record; v_doc text;
begin
  select public.minor_age(p.birth_date, p.birth_year) into v_age
    from public.profiles p where p.id = p_user;

  if v_age is not null and v_age >= 18 then
    if coalesce((select p.media_public_self from public.profiles p where p.id = p_user), false)
      then return 'ok'; else return 'adult_not_opted_in'; end if;
  end if;

  select d.version into v_doc from public.consent_documents d where d.id = 'doc_a';
  select c.* into v_row from public.consents c
   where c.minor_id = p_user and c.consent_type = 'media_public'
   order by c.created_at desc, c.id desc limit 1;

  if v_row is null                          then return 'minor_no_media_public'; end if;
  if v_row.value <> 'granted'               then return 'minor_no_media_public'; end if;
  if v_row.note is not distinct from 'self_submitted' then return 'self_submitted'; end if;
  if v_row.source <> 'parent_link'          then return 'self_submitted'; end if;
  if v_row.doc_version is distinct from v_doc then return 'consent_predates_doc'; end if;
  return 'ok';
end;
$$;


-- ---------------------------------------------------------------------
-- 9) game_me — הקריאה היחידה של הלקוח על עצמו
--     (עוקפת את בעיית ה-grant מסעיף 7)
-- ---------------------------------------------------------------------
create or replace function public.game_me()
returns table (
  display_name      text,
  media_public_self boolean,
  ref_source        text,
  listed            boolean,
  can_play          boolean,
  participant       boolean,
  publish_ok        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select public.game_display_name(auth.uid()),
         coalesce((select p.media_public_self from public.profiles p where p.id = auth.uid()), false),
         (select p.ref_source from public.profiles p where p.id = auth.uid()),
         public.game_is_listed(auth.uid()),
         public.game_can_play(),
         exists (select 1 from public.game_participants gp where gp.user_id = auth.uid()),
         public.game_publish_ok(auth.uid());
$$;


-- ---------------------------------------------------------------------
-- 10) game_board — כל שש הטבלאות הן הקריאה הזו עם פרמטרים
--
--     ⚑ **בלי user_id בפלט.** profiles_select_related מתירה לכל משתמש
--       מחובר לקרוא פרופיל של מי שרשום כ«מאמן» — כלומר user_id היה
--       מאפשר הצלבה לשם משפחה מלא ולמועדון בשאילתה אחת. is_me מספיק
--       לכל מה שהמסך צריך.
--     ⚑ p_limit נחתך ל-100 כדי שלא יימשך מאגר שלם של ילדים בקריאה אחת.
-- ---------------------------------------------------------------------
create or replace function public.game_board(
  p_scope  text default 'challenge',
  p_period text default 'month',
  p_key    text default null,
  p_league text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  rank         int,
  display_name text,
  points       int,
  awards       int,
  is_me        boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_key text; v_lim int; v_off int;
begin
  if public.game_wall_blocks() then return; end if;

  v_lim := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_off := greatest(coalesce(p_offset, 0), 0);

  -- ברירת מחדל: התקופה הנוכחית
  v_key := nullif(btrim(coalesce(p_key, '')), '');
  if v_key is null then
    if p_period = 'month'  then select k.month  into v_key from public.game_period_keys() k; end if;
    if p_period = 'season' then select k.season into v_key from public.game_period_keys() k; end if;
  end if;
  if v_key is null then return; end if;

  return query
  with base as (
    select l.user_id, sum(l.points)::int as pts, min(l.occurred_at) as first_at
      from public.game_points_ledger l
     where l.scope = p_scope
       and (p_league is null or l.league_key = p_league)
       and case p_period
             when 'month'  then l.period_month  = v_key
             when 'season' then l.period_season = v_key
             when 'round'  then (l.ref_round = v_key::uuid or l.ref_challenge = v_key::uuid)
             else false
           end
       and public.game_is_listed(l.user_id)
     group by l.user_id
  ),
  ranked as (
    select b.user_id, b.pts,
           rank() over (order by b.pts desc, b.first_at asc)::int as rnk
      from base b
  )
  select r.rnk,
         public.game_display_name(r.user_id),
         r.pts,
         (select count(*)::int from public.game_awards a
           where a.user_id = r.user_id and a.period_key = v_key),
         r.user_id = auth.uid()
    from ranked r
   order by r.rnk
   limit v_lim offset v_off;
end;
$$;

-- 10.1 המיקום שלי — **מחזירה תשובה גם למי שאינו listed**, עם listed=false
--      והסבר, כדי שקטין שממתין לאישור הורה לא יראה מסך ריק בלי סיבה.
create or replace function public.game_my_standing(
  p_scope  text default 'challenge',
  p_period text default 'month',
  p_key    text default null,
  p_league text default null
)
returns table (
  rank      int,
  points    int,
  total     int,
  listed    boolean,
  behind_by int,
  ahead_of  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_key text; v_me uuid := auth.uid();
begin
  if v_me is null then return; end if;

  v_key := nullif(btrim(coalesce(p_key, '')), '');
  if v_key is null then
    if p_period = 'month'  then select k.month  into v_key from public.game_period_keys() k; end if;
    if p_period = 'season' then select k.season into v_key from public.game_period_keys() k; end if;
  end if;
  if v_key is null then return; end if;

  return query
  with base as (
    select l.user_id, sum(l.points)::int as pts, min(l.occurred_at) as first_at
      from public.game_points_ledger l
     where l.scope = p_scope
       and (p_league is null or l.league_key = p_league)
       and case p_period
             when 'month'  then l.period_month  = v_key
             when 'season' then l.period_season = v_key
             when 'round'  then (l.ref_round = v_key::uuid or l.ref_challenge = v_key::uuid)
             else false
           end
     group by l.user_id
  ),
  ranked as (
    select b.user_id, b.pts, rank() over (order by b.pts desc, b.first_at asc)::int as rnk
      from base b
  ),
  me as (select * from ranked where user_id = v_me)
  select coalesce((select rnk from me), 0),
         coalesce((select pts from me), 0),
         (select count(*)::int from ranked),
         public.game_is_listed(v_me),
         coalesce((select r.pts from ranked r where r.rnk < (select rnk from me)
                    order by r.rnk desc limit 1) - (select pts from me), 0),
         (select public.game_display_name(r.user_id) from ranked r
           where r.rnk < (select rnk from me) order by r.rnk desc limit 1);
end;
$$;

-- 10.2 «מאיפה הנקודות שלי»
create or replace function public.game_my_points(
  p_scope text default 'challenge', p_period text default 'month', p_key text default null
)
returns table (occurred_on date, points int, reason text, rule_key text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_key text;
begin
  if auth.uid() is null then return; end if;
  v_key := nullif(btrim(coalesce(p_key, '')), '');
  if v_key is null then
    if p_period = 'month'  then select k.month  into v_key from public.game_period_keys() k; end if;
    if p_period = 'season' then select k.season into v_key from public.game_period_keys() k; end if;
  end if;
  if v_key is null then return; end if;

  return query
  select l.occurred_on, l.points, l.reason, l.rule_key
    from public.game_points_ledger l
   where l.user_id = auth.uid() and l.scope = p_scope
     and case p_period when 'month'  then l.period_month  = v_key
                       when 'season' then l.period_season = v_key
                       else false end
   order by l.occurred_on desc, l.created_at desc
   limit 200;
end;
$$;


-- ---------------------------------------------------------------------
-- 11) game_kpis — מדדי הפיילוט, לאדמין
--
--     ⚠ נכנס כאן ולא «בסוף, בשלב המדידה»: המספר שמכריע אם יוצאים
--       מהפיילוט חייב להיות זמין מהשבוע הראשון, לא אחרי ההחלטה.
--     ⚠ הטבלאות של 40 ו-42 עוד לא קיימות כשהקובץ הזה רץ — לכן
--       to_regclass + SQL דינמי, והפונקציה מחזירה 0 במקום ליפול.
-- ---------------------------------------------------------------------
create or replace function public.game_kpis()
returns table (
  registered      int,
  joined          int,
  predicted_week  int,
  submitted_week  int,
  back_2_weeks    int,
  back_3_weeks    int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_pred int := 0; v_sub int := 0; v_b2 int := 0; v_b3 int := 0; v_week date;
begin
  if not public.is_admin() then return; end if;
  select k.d - (extract(dow from k.d)::int) into v_week from public.game_period_keys() k;

  if to_regclass('public.game_predictions') is not null then
    execute 'select count(distinct user_id)::int from public.game_predictions where created_at >= $1'
       into v_pred using v_week;
  end if;

  if to_regclass('public.game_challenge_submissions') is not null then
    execute 'select count(distinct user_id)::int from public.game_challenge_submissions where created_at >= $1'
       into v_sub using v_week;
    execute $q$
      with acts as (
        select user_id, date_trunc('week', created_at) as wk
          from public.game_challenge_submissions
         union
        select user_id, date_trunc('week', created_at)
          from public.game_points_ledger
      ), c as (select user_id, count(distinct wk) as n from acts group by user_id)
      select coalesce(sum(case when n >= 2 then 1 else 0 end), 0)::int,
             coalesce(sum(case when n >= 3 then 1 else 0 end), 0)::int from c
    $q$ into v_b2, v_b3;
  end if;

  return query select
    (select count(*)::int from public.profiles p where p.role = 'player'),
    (select count(*)::int from public.game_participants),
    v_pred, v_sub, v_b2, v_b3;
end;
$$;


-- ---------------------------------------------------------------------
-- 12) הרשאות — revoke גורף ואז grant מפורש
-- ---------------------------------------------------------------------
revoke all on function public.server_now()                          from public, anon;
revoke all on function public.game_period_keys(timestamptz)         from public, anon;
revoke all on function public.game_points(text, int)                from public, anon;
revoke all on function public.game_display_name(uuid)               from public, anon;
revoke all on function public.game_can_play()                       from public, anon;
revoke all on function public.game_is_listed(uuid)                  from public, anon;
revoke all on function public.game_wall_blocks()                    from public, anon;
revoke all on function public.game_publish_ok(uuid)                 from public, anon;
revoke all on function public.game_publish_reason(uuid)             from public, anon;
revoke all on function public.game_me()                             from public, anon;
revoke all on function public.game_board(text,text,text,text,int,int) from public, anon;
revoke all on function public.game_my_standing(text,text,text,text)  from public, anon;
revoke all on function public.game_my_points(text,text,text)         from public, anon;
revoke all on function public.game_kpis()                            from public, anon;

grant execute on function public.server_now()                          to authenticated;
grant execute on function public.game_period_keys(timestamptz)         to authenticated;
grant execute on function public.game_points(text, int)                to authenticated;
grant execute on function public.game_display_name(uuid)               to authenticated;
grant execute on function public.game_can_play()                       to authenticated;
grant execute on function public.game_is_listed(uuid)                  to authenticated;
grant execute on function public.game_wall_blocks()                    to authenticated;
grant execute on function public.game_publish_ok(uuid)                 to authenticated;
grant execute on function public.game_publish_reason(uuid)             to authenticated;
grant execute on function public.game_me()                             to authenticated;
grant execute on function public.game_board(text,text,text,text,int,int) to authenticated;
grant execute on function public.game_my_standing(text,text,text,text)  to authenticated;
grant execute on function public.game_my_points(text,text,text)         to authenticated;
grant execute on function public.game_kpis()                            to authenticated;

-- הפנקס: קריאה בלבד. אין ללקוח שום דרך לכתוב נקודות.
revoke insert, update, delete on public.game_points_ledger from anon, authenticated;
revoke insert, update, delete on public.game_awards         from anon, authenticated;
grant  select on public.game_points_ledger to authenticated;
grant  select on public.game_awards        to authenticated;


-- ---------------------------------------------------------------------
-- רישום
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_game_core_12_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) כל הפונקציות מוגנות (חייב לחזור ריק):
--       select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.prokind='f' and p.proconfig is null;
--
--  2) שער הפרס עובד — הניסיון הבא **חייב להיכשל**:
--       update public.game_settings set prizes_enabled = true where id;
--     השגיאה הצפויה: game_settings_prizes_need_signoff.
--     אחרי חתימת עורך הדין:
--       update public.game_settings
--          set legal_ok_at = now(), legal_ok_by = 'עו"ד ...', rules_url = '/rules.html';
--       update public.game_settings set prizes_enabled = true where id;   -- עכשיו יעבור
--
--  3) שם התצוגה לא מדליף שם משפחה — מחשבון של קטין:
--       select public.game_display_name('<uid של קטין>');
--     חייב להחזיר «דני כ.» ולא שם מלא, גם אם נכתב לו display_name.
--
--  4) מפתחות התקופה:
--       select * from public.game_period_keys();
--     באוגוסט 2026 חייב להחזיר month='2026-08' ו-season='2025/2026'.
--
--  5) חומת ההפרדה — התחבר כמאמן (לא אדמין) והרץ:
--       select * from public.game_board('challenge','month');
--     חייב לחזור ריק.
--
--  6) הרצה חוזרת של הקובץ כולו — חייבת לעבור נקי.
-- =====================================================================
