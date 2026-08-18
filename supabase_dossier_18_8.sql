-- =====================================================================
-- CourtSide — «תיק שחקן»: התיק שעובר עם השחקן משנה לשנה  ·  18.8.2026
-- =====================================================================
-- הבעיה שהקובץ הזה פותר, בשפה של מסך:
--   היום «שחקן» הוא שורה בתוך קבוצה של מאמן (team_players). יוסי עולה
--   מקטסל א' לילדים ב' — נוצרת שורה חדשה, וכל ההיסטוריה נשארת מאחור.
--   לכן אין ואי אפשר שיהיה גרף התקדמות של שלוש שנים.
--
-- מה נוסף כאן:
--   1. dossier_people — **אדם אחד** לכל שחקן במועדון, שנשאר איתו לנצח.
--      team_players.person_id תולה כל שורת־קבוצה־של־שנה על אותו אדם.
--   2. dossier_metrics — קטלוג הקטגוריות. ברירת המחדל גלובלית (club is
--      null), וכל מועדון יכול להוסיף שלו, לשנות שם או לכבות קטגוריה.
--   3. dossier_entries — הערכים: דירוג 1–5 או מדידה (גובה/משקל/זינוק),
--      עם תאריך. זה מה שהגרף מצייר.
--   4. dossier_notes — רקע, שיחות, פציעות: טקסט חופשי עם תאריך וסוג.
--   5. dossier_access — גישה שמאמן נתן במפורש למאמן אחר.
--   6. club_roles — המבנה: מנהל מועדון / מנהל מקצועי / מאמן.
--      **מנהל מועדון מוגדר רק בידי אדמין** (is_admin). הוא ממנה את
--      המנהל המקצועי ומצרף מאמנים.
--   7. dossier_can_see / dossier_can_edit — **בדיקת ההרשאה במקום אחד**.
--      כל המדיניות קוראת להן, ולכן הוספת תפקיד בעתיד היא שינוי בפונקציה
--      אחת ולא בעשרים מדיניות.
--
-- הכלל שהבעלים קבע, כפי שהוא מיושם כאן:
--   · מאמן רואה את התיקים של השחקנים בקבוצות שלו.
--   · מנהל מועדון / מנהל מקצועי רואים תיקים של מאמנים **שצורפו לעץ**
--     המועדון. מאמן שלא צורף — התיקים שלו פרטיים לגמרי, גם אם הוא
--     כתב את שם המועדון בפרופיל.
--   · מאמן אחר רואה רק אם קיבל גישה במפורש.
--   · שחקנים והורים לא רואים כלום. אין שום מדיניות שמאפשרת זאת.
--   · אדמין המערכת **אינו** רואה תיקים (רק ממנה מנהל מועדון).
--
-- אידמפוטנטי. דורש: supabase_setup.sql (profiles), supabase_teams_admin
-- או supabase_players.sql (team_players), supabase_security3/rls (is_admin).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) האדם — זהות אחת לכל שחקן במועדון
-- ---------------------------------------------------------------------
create table if not exists public.dossier_people (
  id          uuid primary key default gen_random_uuid(),
  -- המועדון הוא כרגע מחרוזת (profiles.club). כשיהיה ישות מועדון אמיתית
  -- אפשר להוסיף club_id בלי לשבור כלום.
  club        text not null,
  full_name   text not null check (char_length(trim(full_name)) between 2 and 80),
  birth_year  int check (birth_year is null or birth_year between 1950 and 2035),
  birth_date  date,
  -- אם לשחקן יש חשבון באפליקציה — קישור אליו (לא חובה; רוב הילדים בלי)
  player_id   uuid references public.profiles(id) on delete set null,
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists dossier_people_club_idx on public.dossier_people (club, full_name);
create index if not exists dossier_people_player_idx on public.dossier_people (player_id);

-- שורת הסגל של כל שנה נתלית על אותו אדם
alter table public.team_players
  add column if not exists person_id uuid references public.dossier_people(id) on delete set null;
create index if not exists team_players_person_idx on public.team_players (person_id);


-- ---------------------------------------------------------------------
-- 2) קטלוג הקטגוריות
--    club is null  = ברירת המחדל שמגיעה מהמערכת.
--    club = '...'   = שורה של מועדון: או קטגוריה חדשה, או דריסה של
--                     ברירת מחדל (אותו key) — כולל כיבוי (active=false).
-- ---------------------------------------------------------------------
create table if not exists public.dossier_metrics (
  id              uuid primary key default gen_random_uuid(),
  club            text,
  key             text not null check (key ~ '^[a-z0-9_]{2,32}$'),
  label           text not null,
  cat             text not null,          -- מזהה תחום: fund / def / mind / body / measure
  cat_label       text not null,          -- שם התחום למסך
  kind            text not null default 'rating' check (kind in ('rating', 'number')),
  unit            text,                   -- למדידות: ס"מ, ק"ג, שנ׳
  lower_is_better boolean not null default false,  -- ריצת 20 מ׳: פחות = טוב יותר
  sort            int not null default 100,
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
-- מפתח ייחודי: אחד גלובלי לכל key, ואחד לכל מועדון
create unique index if not exists dossier_metrics_global_key on public.dossier_metrics (key) where club is null;
create unique index if not exists dossier_metrics_club_key   on public.dossier_metrics (club, key) where club is not null;

-- ברירת המחדל (ההצעה שאושרה): 16 דירוגים ב-4 תחומים + 4 מדידות
insert into public.dossier_metrics (club, key, label, cat, cat_label, kind, unit, lower_is_better, sort)
values
  (null, 'ball',   'שליטה בכדור',   'fund', 'יסודות',          'rating', null, false, 10),
  (null, 'pass',   'מסירה',          'fund', 'יסודות',          'rating', null, false, 20),
  (null, 'fin',    'סיומות',         'fund', 'יסודות',          'rating', null, false, 30),
  (null, 'shot',   'זריקה מבחוץ',    'fund', 'יסודות',          'rating', null, false, 40),
  (null, 'ft',     'זריקות חופשיות', 'fund', 'יסודות',          'rating', null, false, 50),
  (null, 'dman',   'הגנה 1 על 1',    'def',  'הגנה',            'rating', null, false, 60),
  (null, 'dhelp',  'הגנת עזרה',      'def',  'הגנה',            'rating', null, false, 70),
  (null, 'reb',    'ריבאונד',        'def',  'הגנה',            'rating', null, false, 80),
  (null, 'iq',     'הבנת משחק',      'mind', 'ראש ומחויבות',    'rating', null, false, 90),
  (null, 'commit', 'מחויבות',        'mind', 'ראש ומחויבות',    'rating', null, false, 100),
  (null, 'coach',  'קשב להדרכה',     'mind', 'ראש ומחויבות',    'rating', null, false, 110),
  (null, 'lead',   'מנהיגות',        'mind', 'ראש ומחויבות',    'rating', null, false, 120),
  (null, 'ath',    'אתלטיות',        'body', 'גוף ואתלטיות',    'rating', null, false, 130),
  (null, 'speed',  'מהירות',         'body', 'גוף ואתלטיות',    'rating', null, false, 140),
  (null, 'endur',  'סבולת',          'body', 'גוף ואתלטיות',    'rating', null, false, 150),
  (null, 'coord',  'קואורדינציה',    'body', 'גוף ואתלטיות',    'rating', null, false, 160),
  (null, 'height', 'גובה',           'measure', 'מדידות',       'number', 'ס"מ', false, 200),
  (null, 'weight', 'משקל',           'measure', 'מדידות',       'number', 'ק"ג', false, 210),
  (null, 'jump',   'זינוק',          'measure', 'מדידות',       'number', 'ס"מ', false, 220),
  (null, 'sprint', 'ריצת 20 מ׳',     'measure', 'מדידות',       'number', 'שנ׳', true,  230)
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 3) הערכים — דירוג או מדידה, עם תאריך
--    upsert לפי (אדם, מדד, תאריך, מאמן): תיקון באותו יום דורס, ולא
--    מייצר נקודה שנייה על אותו תאריך בגרף.
-- ---------------------------------------------------------------------
create table if not exists public.dossier_entries (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.dossier_people(id) on delete cascade,
  metric_key  text not null,
  value       numeric(6, 2) not null,
  measured_on date not null default current_date,
  note        text check (note is null or char_length(note) <= 500),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (person_id, metric_key, measured_on, coach_id)
);
create index if not exists dossier_entries_person_idx on public.dossier_entries (person_id, metric_key, measured_on);


-- ---------------------------------------------------------------------
-- 4) רקע ושיחות
-- ---------------------------------------------------------------------
create table if not exists public.dossier_notes (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.dossier_people(id) on delete cascade,
  kind       text not null default 'רקע',
  content    text not null check (char_length(content) between 1 and 4000),
  on_date    date not null default current_date,
  coach_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists dossier_notes_person_idx on public.dossier_notes (person_id, on_date desc);


-- ---------------------------------------------------------------------
-- 5) גישה שמאמן נתן במפורש למאמן אחר
-- ---------------------------------------------------------------------
create table if not exists public.dossier_access (
  person_id  uuid not null references public.dossier_people(id) on delete cascade,
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  level      text not null default 'view' check (level in ('view', 'edit')),
  granted_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person_id, coach_id)
);
create index if not exists dossier_access_coach_idx on public.dossier_access (coach_id);


-- ---------------------------------------------------------------------
-- 6) המבנה במועדון
-- ---------------------------------------------------------------------
create table if not exists public.club_roles (
  id          uuid primary key default gen_random_uuid(),
  club        text not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('club_manager', 'technical_director', 'coach')),
  approved_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (club, user_id, role)
);
create index if not exists club_roles_club_idx on public.club_roles (club, role);
create index if not exists club_roles_user_idx on public.club_roles (user_id);


-- ---------------------------------------------------------------------
-- 7) ההרשאה — במקום אחד
-- ---------------------------------------------------------------------
-- «האם אני מנהל המועדון הזה» — security definer **בכוונה**: מדיניות על
-- club_roles שקוראת ל-club_roles ישירות מפילה את Postgres בשגיאת
-- «infinite recursion detected in policy». הפונקציה עוקפת את ה-RLS.
create or replace function public.is_club_manager(p_club text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_roles r
     where r.club = p_club and r.user_id = auth.uid() and r.role = 'club_manager'
  );
$$;
revoke all on function public.is_club_manager(text) from public;
grant execute on function public.is_club_manager(text) to authenticated;

-- «מי מאמן את האדם הזה»: כל מאמן שהאדם נמצא בסגל שלו (בכל שנה)
create or replace function public.dossier_is_owner(p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_players tp
     where tp.person_id = p_person and tp.coach_id = auth.uid()
  );
$$;

-- מנהל (מועדון או מקצועי) רואה תיק **רק** אם המאמן שמחזיק אותו צורף
-- לעץ המועדון. מאמן שלא צורף — התיקים שלו פרטיים לחלוטין.
create or replace function public.dossier_manager_sees(p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.dossier_people p
      join public.club_roles mgr
        on mgr.club = p.club
       and mgr.user_id = auth.uid()
       and mgr.role in ('club_manager', 'technical_director')
      join public.team_players tp on tp.person_id = p.id
      join public.club_roles crd
        on crd.club = p.club
       and crd.user_id = tp.coach_id
       and crd.role = 'coach'
     where p.id = p_person
  );
$$;

create or replace function public.dossier_can_see(p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.dossier_is_owner(p_person)
    or exists (select 1 from public.dossier_access a
                where a.person_id = p_person and a.coach_id = auth.uid())
    or public.dossier_manager_sees(p_person)
  );
$$;

-- כתיבה: המאמן שהשחקן בסגל שלו, או מי שקיבל גישת «עריכה».
-- מנהלים רואים אבל לא כותבים — הדירוג הוא של מי שמאמן.
-- חיבור תיקים («זה אותו שחקן») הוא פעולה של בעל התיק, או של מנהל
-- המועדון — שהוא היחיד שרואה את כל השנים ויכול לאשר שזה אותו ילד.
create or replace function public.dossier_may_link(p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.dossier_is_owner(p_person)
      or public.is_club_manager((select club from public.dossier_people where id = p_person));
$$;
revoke all on function public.dossier_may_link(uuid) from public;
grant execute on function public.dossier_may_link(uuid) to authenticated;

create or replace function public.dossier_can_edit(p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.dossier_is_owner(p_person)
    or exists (select 1 from public.dossier_access a
                where a.person_id = p_person and a.coach_id = auth.uid() and a.level = 'edit')
  );
$$;

revoke all on function public.dossier_is_owner(uuid)     from public;
revoke all on function public.dossier_manager_sees(uuid) from public;
revoke all on function public.dossier_can_see(uuid)      from public;
revoke all on function public.dossier_can_edit(uuid)     from public;
grant execute on function public.dossier_is_owner(uuid)     to authenticated;
grant execute on function public.dossier_manager_sees(uuid) to authenticated;
grant execute on function public.dossier_can_see(uuid)      to authenticated;
grant execute on function public.dossier_can_edit(uuid)     to authenticated;


-- ---------------------------------------------------------------------
-- 8) אבטחה (RLS)
-- ---------------------------------------------------------------------
alter table public.dossier_people  enable row level security;
alter table public.dossier_metrics enable row level security;
alter table public.dossier_entries enable row level security;
alter table public.dossier_notes   enable row level security;
alter table public.dossier_access  enable row level security;
alter table public.club_roles      enable row level security;

-- --- אנשים ---
drop policy if exists dossier_people_select on public.dossier_people;
create policy dossier_people_select on public.dossier_people
  for select to authenticated using (public.dossier_can_see(id));

-- יצירה: מאמן יוצר אדם במועדון שרשום בפרופיל שלו
drop policy if exists dossier_people_insert on public.dossier_people;
create policy dossier_people_insert on public.dossier_people
  for insert to authenticated with check (
    created_by = auth.uid()
    and club = (select club from public.profiles where id = auth.uid())
  );

drop policy if exists dossier_people_update on public.dossier_people;
create policy dossier_people_update on public.dossier_people
  for update to authenticated
  using (public.dossier_can_edit(id)) with check (public.dossier_can_edit(id));

-- מחיקה: רק מי שיצר, ורק כל עוד אין לאדם היסטוריה (הגנה מפני מחיקת
-- תיק של שחקן שעבר בין מאמנים)
drop policy if exists dossier_people_delete on public.dossier_people;
create policy dossier_people_delete on public.dossier_people
  for delete to authenticated using (
    created_by = auth.uid()
    and not exists (select 1 from public.dossier_entries e where e.person_id = id)
    and not exists (select 1 from public.dossier_notes n where n.person_id = id)
  );

-- --- קטלוג ---
-- ברירות המחדל קריאות לכל מאמן מחובר; שורות מועדון — רק לבני המועדון
drop policy if exists dossier_metrics_select on public.dossier_metrics;
create policy dossier_metrics_select on public.dossier_metrics
  for select to authenticated using (
    club is null or club = (select club from public.profiles where id = auth.uid())
  );

-- עריכת הקטלוג של המועדון: מנהל מועדון בלבד (אחרת כל מאמן היה משנה
-- לכולם את הסולם שמשווים בו בין שנים)
drop policy if exists dossier_metrics_write on public.dossier_metrics;
create policy dossier_metrics_write on public.dossier_metrics
  for all to authenticated
  using (club is not null and public.is_club_manager(club))
  with check (club is not null and public.is_club_manager(club));

-- --- ערכים ---
drop policy if exists dossier_entries_select on public.dossier_entries;
create policy dossier_entries_select on public.dossier_entries
  for select to authenticated using (public.dossier_can_see(person_id));

drop policy if exists dossier_entries_write on public.dossier_entries;
create policy dossier_entries_write on public.dossier_entries
  for all to authenticated
  using (public.dossier_can_edit(person_id) and coach_id = auth.uid())
  with check (public.dossier_can_edit(person_id) and coach_id = auth.uid());

-- --- הערות ---
drop policy if exists dossier_notes_select on public.dossier_notes;
create policy dossier_notes_select on public.dossier_notes
  for select to authenticated using (public.dossier_can_see(person_id));

drop policy if exists dossier_notes_write on public.dossier_notes;
create policy dossier_notes_write on public.dossier_notes
  for all to authenticated
  using (public.dossier_can_edit(person_id) and coach_id = auth.uid())
  with check (public.dossier_can_edit(person_id) and coach_id = auth.uid());

-- --- גישות ---
-- רואים את הגישות של תיק שאני רשאי לראות; נותן/מסיר — רק מי שמאמן
drop policy if exists dossier_access_select on public.dossier_access;
create policy dossier_access_select on public.dossier_access
  for select to authenticated using (
    coach_id = auth.uid() or public.dossier_can_see(person_id)
  );

drop policy if exists dossier_access_write on public.dossier_access;
create policy dossier_access_write on public.dossier_access
  for all to authenticated
  using (public.dossier_is_owner(person_id))
  with check (public.dossier_is_owner(person_id) and granted_by = auth.uid());

-- --- תפקידים במועדון ---
-- כל מאמן רואה את המבנה של המועדון שלו (הוא צריך לדעת מי רואה אותו)
drop policy if exists club_roles_select on public.club_roles;
create policy club_roles_select on public.club_roles
  for select to authenticated using (
    user_id = auth.uid()
    or club = (select club from public.profiles where id = auth.uid())
  );

-- מנהל מועדון נקבע **רק** בידי אדמין המערכת
drop policy if exists club_roles_admin on public.club_roles;
create policy club_roles_admin on public.club_roles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- מנהל מועדון ממנה מנהל מקצועי ומצרף מאמנים (ולא מנהלי מועדון נוספים)
drop policy if exists club_roles_manager on public.club_roles;
create policy club_roles_manager on public.club_roles
  for all to authenticated
  using (role in ('technical_director', 'coach') and public.is_club_manager(club))
  with check (role in ('technical_director', 'coach') and approved_by = auth.uid() and public.is_club_manager(club));


-- ---------------------------------------------------------------------
-- 9) פתיחת תיק לשורת סגל — יוצר אדם אם עוד אין, ומחזיר את המזהה
--    security definer: הבדיקה היא שהשורה באמת של המאמן המחובר.
-- ---------------------------------------------------------------------
create or replace function public.dossier_open(p_roster uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.team_players%rowtype;
  v_club  text;
  v_id    uuid;
begin
  select * into v_row from public.team_players where id = p_roster;
  if not found or v_row.coach_id <> auth.uid() then
    raise exception 'not your player';
  end if;

  if v_row.person_id is not null then
    return v_row.person_id;
  end if;

  select club into v_club from public.profiles where id = auth.uid();
  if v_club is null or trim(v_club) = '' then
    raise exception 'no club on profile';
  end if;

  insert into public.dossier_people (club, full_name, birth_year, player_id, created_by)
  values (v_club, v_row.name,
          (case when to_jsonb(v_row) ? 'birth_year' then (to_jsonb(v_row) ->> 'birth_year')::int else null end),
          v_row.player_id, auth.uid())
  returning id into v_id;

  update public.team_players set person_id = v_id where id = p_roster;
  return v_id;
end;
$$;
revoke all on function public.dossier_open(uuid) from public;
grant execute on function public.dossier_open(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 10) «זה אותו שחקן?» — מועמדים לחיבור בתוך אותו מועדון
--     מוחזר רק מה שהמאמן רשאי לראות ממילא (שם ושנת לידה), ובלי תיקים
--     של מאמנים שלא צורפו לעץ.
-- ---------------------------------------------------------------------
create or replace function public.dossier_duplicates(p_person uuid)
returns table (id uuid, full_name text, birth_year int, coaches text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select * from public.dossier_people where id = p_person)
  select p.id, p.full_name, p.birth_year,
         (select string_agg(distinct trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ', ')
            from public.team_players tp
            join public.profiles pr on pr.id = tp.coach_id
           where tp.person_id = p.id) as coaches
    from public.dossier_people p, me
   where p.club = me.club
     and p.id <> me.id
     and public.dossier_may_link(p_person)              -- מבקש ההצעות
     and public.dossier_may_link(p.id)                  -- והמועמד — שלי או שאני מנהל המועדון
     and lower(trim(p.full_name)) = lower(trim(me.full_name))
     and (p.birth_year is null or me.birth_year is null or p.birth_year = me.birth_year)
   limit 5;
$$;
revoke all on function public.dossier_duplicates(uuid) from public;
grant execute on function public.dossier_duplicates(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 11) חיבור שני תיקים לאדם אחד («זה אותו שחקן»)
--     כל ההיסטוריה עוברת לאדם היעד, ושורות הסגל מוצבעות אליו.
-- ---------------------------------------------------------------------
create or replace function public.dossier_merge(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_from = p_into then
    return;
  end if;
  -- שני התיקים חייבים להיות של המאמן המחובר — אחרת אפשר היה «למשוך»
  -- תיק של מאמן אחר אל עצמך
  if not (public.dossier_may_link(p_from) and public.dossier_may_link(p_into)) then
    raise exception 'both dossiers must be yours (or you must be the club manager)';
  end if;
  if (select club from public.dossier_people where id = p_from)
     is distinct from (select club from public.dossier_people where id = p_into) then
    raise exception 'different clubs';
  end if;

  update public.team_players   set person_id = p_into where person_id = p_from;
  -- ערך שכבר קיים באותו יום/מדד/מאמן ביעד — לא נדרוס אותו
  update public.dossier_entries e set person_id = p_into
   where e.person_id = p_from
     and not exists (
       select 1 from public.dossier_entries x
        where x.person_id = p_into and x.metric_key = e.metric_key
          and x.measured_on = e.measured_on and x.coach_id = e.coach_id);
  delete from public.dossier_entries where person_id = p_from;
  update public.dossier_notes  set person_id = p_into where person_id = p_from;
  update public.dossier_access set person_id = p_into where person_id = p_from
     and not exists (select 1 from public.dossier_access y
                      where y.person_id = p_into and y.coach_id = dossier_access.coach_id);
  delete from public.dossier_access where person_id = p_from;
  delete from public.dossier_people where id = p_from;
end;
$$;
revoke all on function public.dossier_merge(uuid, uuid) from public;
grant execute on function public.dossier_merge(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 12) רישום בלדג'ר + רענון סכימת ה-API
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.mark_migration('supabase_dossier_18_8.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
--  אימות אחרי ההרצה:
--    select count(*) from public.dossier_metrics where club is null;   -- 20
--    select public.dossier_can_see('00000000-0000-0000-0000-000000000000'); -- false
--    select * from public.club_roles;                                   -- ריק בהתחלה
--
--  מינוי מנהל מועדון (רק אדמין; החלף מייל):
--    insert into public.club_roles (club, user_id, role, approved_by)
--    select p.club, p.id, 'club_manager', p.id from public.profiles p
--     where p.id = (select id from auth.users where email = 'המייל-של-המנהל')
--    on conflict do nothing;
-- =====================================================================
