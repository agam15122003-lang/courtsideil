-- =====================================================================
--  פנקס המאמן — שלב 1: הקמת מסד הנתונים
-- =====================================================================
--  מה הקובץ הזה עושה:
--  1. יוצר טבלת "profiles" (פרופילים) עם תשתית מלאה לשלב 2.
--  2. מפעיל אבטחה (RLS) — כל מאמן עורך רק את הפרופיל שלו.
--  3. יוצר טריגר שמייצר פרופיל אוטומטית בכל הרשמה חדשה.
--
--  הוראות: העתק את כל הקובץ הזה והרץ אותו ב-SQL Editor של Supabase.
--  בטוח להריץ אותו יותר מפעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) טבלת הפרופילים
-- ---------------------------------------------------------------------
-- מקושרת לטבלת המשתמשים המובנית (auth.users).
-- העמודות full_name, club וכו' יישארו ריקות בשלב 1 ויתמלאו בשלב 2.

create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  first_name  text,
  last_name   text,
  club        text,
  age_groups  text[],     -- מערך של שכבות גיל (קטסל ב', ילדים א' וכו')
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'פרופיל מאמן — מקושר 1:1 למשתמש';


-- ---------------------------------------------------------------------
-- 2) הפעלת אבטחה ברמת השורה (Row Level Security)
-- ---------------------------------------------------------------------
-- בלי זה, כל אחד יכול לקרוא/לערוך הכול. עם זה — רק את השורה שלו.

alter table public.profiles enable row level security;

-- מוחקים מדיניות קודמת אם קיימת (כדי שאפשר יהיה להריץ שוב בבטחה)
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

-- כל מאמן רשאי לקרוא את הפרופיל של עצמו
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- כל מאמן רשאי ליצור את הפרופיל של עצמו
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- כל מאמן רשאי לעדכן את הפרופיל של עצמו
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);


-- ---------------------------------------------------------------------
-- 3) טריגר: יצירת פרופיל אוטומטית בהרשמה
-- ---------------------------------------------------------------------
-- כשמאמן חדש נרשם, נוצרת לו אוטומטית שורה ריקה בטבלת profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- מוחקים טריגר קודם אם קיים, ויוצרים מחדש
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — מסד הנתונים מוכן! ✓
-- =====================================================================
