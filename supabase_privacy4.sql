-- ============================================================
-- CourtSide — פרטיות 4: סגירת חשיפת ה-PII, הסכמת הורים, אישור סרטונים,
--                        ורישום שגיאות צד-לקוח
-- נכתב 24.7.2026. הרץ אחרי supabase_security3.sql. בטוח להרצה חוזרת.
--
-- הבעיה המרכזית שזה מתקן:
-- המדיניות "profiles_select_authenticated" (supabase_stage2.sql) היא
-- using (true) — כלומר כל משתמש מחובר יכול לשלוף את כל טבלת הפרופילים,
-- כולל טלפון ושנת לידה של שחקנים שהם קטינים.
-- RLS עובד על שורות, לא על עמודות, ולכן הפתרון הוא:
--   1) להעניק הרשאת קריאה רק לעמודות הלא-רגישות (phone נשאר בחוץ),
--   2) לתת למשתמש את השורה המלאה של עצמו דרך פונקציה,
--   3) לתת לחיפוש המאמנים VIEW שמסתיר טלפון שלא סומן כציבורי,
--   4) לתת לאדמין נתיב נפרד ומפורש.
-- ============================================================

-- ------------------------------------------------------------
-- 1) שלילת קריאה ישירה של העמודות הרגישות
--
-- שתי מלכודות שחייבות טיפול כאן:
-- (א) הרשאות ב-Postgres מצטברות: "revoke select (phone)" לא עושה כלום כל עוד
--     קיימת הרשאת select על כל הטבלה (וזו ברירת המחדל של Supabase). לכן
--     מסירים קודם את ההרשאה הרוחבית, ואז מעניקים רק את העמודות הלא-רגישות.
-- (ב) העמודה email כבר נמחקה מהטבלה ב-supabase_security_hardening.sql, ולכן
--     אסור להזכיר אותה בשם — היא תפיל את כל הסקריפט. הרשימה נבנית דינמית
--     מתוך העמודות שקיימות בפועל, כך שהקובץ עובד בכל מצב סכמה.
-- ------------------------------------------------------------
do $cols$
declare
  allowed text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into allowed
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'profiles'
     and column_name in (
       -- מה שמסכי האפליקציה באמת קוראים על משתמשים אחרים:
       'id', 'first_name', 'last_name', 'club', 'age_groups', 'avatar_url',
       'verified', 'banned', 'role', 'position', 'phone_public', 'is_admin',
       'created_at', 'updated_at'
     );

  -- אנון לא צריך את profiles בכלל (הדף הציבורי היחיד קורא רק את טבלת drills)
  revoke select on public.profiles from anon, authenticated;
  execute format('grant select (%s) on public.profiles to authenticated', allowed);
end $cols$;

-- ------------------------------------------------------------
-- 2) הפרופיל של עצמי — כולל הטלפון והמייל
-- ------------------------------------------------------------
create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- ------------------------------------------------------------
-- 3) ספריית מאמנים — טלפון רק אם המאמן סימן אותו כציבורי
--    (security_invoker=off: ה-VIEW רץ בהרשאות הבעלים, ולכן העמודות
--     שנשללו למעלה נגישות לו — אבל רק דרך הסינון שכאן)
-- ------------------------------------------------------------
drop view if exists public.coach_directory;
create view public.coach_directory
with (security_invoker = false)
as
  select
    p.id,
    p.first_name,
    p.last_name,
    p.club,
    p.age_groups,
    p.avatar_url,
    p.verified,
    p.role,
    p.phone_public,
    case when p.phone_public then p.phone else null end as phone
  from public.profiles p
  where coalesce(p.banned, false) = false
    and p.role = 'coach';

grant select on public.coach_directory to authenticated;

-- ------------------------------------------------------------
-- 4) אדמין — נתיב מפורש לכל השדות (כולל מייל/טלפון), רק לאדמין
-- ------------------------------------------------------------
create or replace function public.admin_profiles()
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;
  return query select * from public.profiles order by created_at desc;
end;
$$;

revoke all on function public.admin_profiles() from public, anon;
grant execute on function public.admin_profiles() to authenticated;

-- ------------------------------------------------------------
-- 5) הסכמת הורה לשחקן מתחת לגיל 16
-- ------------------------------------------------------------
alter table public.profiles add column if not exists guardian_email text;
alter table public.profiles add column if not exists guardian_consent_at timestamptz;
alter table public.profiles add column if not exists guardian_name text;

-- הטלפון של השחקן לא אמור להיות ציבורי בשום מצב
update public.profiles set phone_public = false where role = 'player' and phone_public;

create or replace function public.enforce_minor_consent()
returns trigger
language plpgsql
as $$
declare
  age int;
begin
  if new.role = 'player' and new.first_name is not null then
    age := extract(year from now())::int - coalesce(new.birth_year, 0);
    -- שנת לידה חובה לשחקן (בלעדיה אין דרך לדעת אם הוא קטין)
    if new.birth_year is null then
      raise exception 'חובה למלא שנת לידה בפרופיל שחקן';
    end if;
    if age < 16 and (new.guardian_email is null or new.guardian_consent_at is null) then
      raise exception 'שחקן מתחת לגיל 16 — נדרשת הסכמת הורה (מייל ואישור)';
    end if;
    -- שחקן לא חושף טלפון
    new.phone_public := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_minor_consent on public.profiles;
create trigger trg_minor_consent
  before insert or update on public.profiles
  for each row execute function public.enforce_minor_consent();

-- ------------------------------------------------------------
-- 6) סרטונים: מוצגים לשחקנים רק לאחר אישור
--    (סרטונים קיימים מסומנים כמאושרים כדי לא לרוקן את הספרייה)
-- ------------------------------------------------------------
alter table public.drill_videos add column if not exists approved boolean not null default false;
alter table public.drill_videos add column if not exists approved_by uuid;
alter table public.drill_videos add column if not exists approved_at timestamptz;
update public.drill_videos set approved = true where approved = false and created_at < now();

-- קריאה: מאמן/אדמין רואה הכול (כדי לאשר); שחקן רק מאושרים.
-- שם המדיניות הקיימת הוא "drill_videos_select_all" (using true) — חייבים למחוק
-- דווקא אותה, כי מדיניות RLS מצטברת ב-OR: מדיניות מתירה אחת שנשארת מבטלת
-- את כל ההגבלה.
drop policy if exists "drill_videos_select_all" on public.drill_videos;
drop policy if exists "videos_select_all" on public.drill_videos;
drop policy if exists "drill_videos_select" on public.drill_videos;
drop policy if exists "videos_read" on public.drill_videos;
create policy "videos_read" on public.drill_videos
  for select to authenticated
  using (approved or not public.is_player());

-- רק אדמין מאשר/מבטל אישור
create or replace function public.set_video_approved(p_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'אישור סרטונים מותר למנהלים בלבד';
  end if;
  update public.drill_videos
     set approved = p_approved,
         approved_by = case when p_approved then auth.uid() else null end,
         approved_at = case when p_approved then now() else null end
   where id = p_id;
end;
$$;

revoke all on function public.set_video_approved(uuid, boolean) from public, anon;
grant execute on function public.set_video_approved(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 7) רישום שגיאות צד-לקוח (כדי שקריסה אצל מאמן בשדה לא תישאר סוד)
-- ------------------------------------------------------------
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  message text not null,
  stack text,
  screen text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.client_errors enable row level security;

drop policy if exists "cerr_insert_self" on public.client_errors;
create policy "cerr_insert_self" on public.client_errors
  for insert to authenticated with check (user_id = auth.uid() or user_id is null);

drop policy if exists "cerr_admin_read" on public.client_errors;
create policy "cerr_admin_read" on public.client_errors
  for select to authenticated using (public.is_admin());

create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

-- רישום שהקובץ הורץ (דורש supabase_migrations_ledger.sql; לא נכשל אם הוא חסר)
do $mig$ begin perform public.mark_migration('supabase_privacy4.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';
