-- =====================================================================
--  פנקס המאמן — שדרוג: קבוצות, ייבוא איגוד, אדמין, דיווחים, אנטי-התחזות
--  בטוח להריץ יותר מפעם אחת. הרץ ב-SQL Editor של Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) טבלאות הקבוצה (נוצרות אם עוד לא קיימות)
-- ---------------------------------------------------------------------
create table if not exists public.team_players (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  team text not null,
  name text not null,
  number text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create table if not exists public.team_goals (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  team text not null,
  period text not null,
  content text,
  updated_at timestamptz not null default now()
);
create table if not exists public.team_games (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  team text not null,
  game_date date not null,
  game_time time,
  opponent text,
  location text,
  created_at timestamptz not null default now()
);
-- צוות מקצועי (עוזר מאמן, פיזיותרפיסט, מאמן גופני, מנהל קבוצה וכו')
create table if not exists public.team_staff (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  team text not null,
  name text not null,
  role text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 1) שחקן — שדות מידע מורחבים (עמדה, שנת לידה, טלפון, הערות, פציעה)
-- ---------------------------------------------------------------------
alter table public.team_players add column if not exists position    text;
alter table public.team_players add column if not exists birth_year  int;
alter table public.team_players add column if not exists phone       text;
alter table public.team_players add column if not exists notes       text;
alter table public.team_players add column if not exists injury_note text;

-- ---------------------------------------------------------------------
-- 2) מטרות לפי שבוע/חודש ספציפי (תכנון עתידי)
-- ---------------------------------------------------------------------
alter table public.team_goals add column if not exists period_key text not null default '';
-- מסירים אילוצי-ייחוד ישנים (coach+team+period) כדי לאפשר כמה שבועות/חודשים
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.team_goals'::regclass and contype = 'u'
  loop execute format('alter table public.team_goals drop constraint %I', r.conname); end loop;
end $$;
create unique index if not exists team_goals_unique
  on public.team_goals (coach_id, team, period, period_key);

-- ---------------------------------------------------------------------
-- 3) קישור קבוצה לליגה באיגוד (לטבלה החיה והמשחקים)
-- ---------------------------------------------------------------------
create table if not exists public.team_iba (
  coach_id uuid not null references auth.users(id) on delete cascade,
  team text not null,
  league_id text,
  league_name text,
  iba_team_id text,
  iba_team_name text,
  updated_at timestamptz not null default now(),
  primary key (coach_id, team)
);

-- אבטחה: כל מאמן רואה/עורך רק את הנתונים של עצמו
alter table public.team_players enable row level security;
alter table public.team_goals   enable row level security;
alter table public.team_games   enable row level security;
alter table public.team_iba     enable row level security;
alter table public.team_staff   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['team_players','team_goals','team_games','team_iba','team_staff'] loop
    execute format('drop policy if exists "%s_own" on public.%I', t, t);
    execute format(
      'create policy "%s_own" on public.%I for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id)',
      t, t);
  end loop;
end $$;

-- =====================================================================
--  אדמין + דיווחים + אנטי-התחזות
-- =====================================================================

-- 4) שדות ניהול בפרופיל
alter table public.profiles add column if not exists is_admin    boolean not null default false;
alter table public.profiles add column if not exists verified    boolean not null default false; -- מאומת (אנטי-התחזות)
alter table public.profiles add column if not exists banned      boolean not null default false;
alter table public.profiles add column if not exists verified_at timestamptz;
alter table public.profiles add column if not exists verified_by uuid;

-- 5) פונקציית בדיקת-אדמין (SECURITY DEFINER — מונע רקורסיית RLS)
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 6) מדיניות אדמין על profiles (נוסף על המדיניות הקיימת)
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin());

-- 7) טבלת דיווחים
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id  uuid references auth.users(id) on delete set null,
  target_type  text not null,            -- 'coach' | 'message' | 'content'
  target_id    text,
  target_label text,
  reason       text not null,
  details      text,
  status       text not null default 'open',  -- 'open' | 'resolved' | 'dismissed'
  created_at   timestamptz not null default now(),
  resolved_by  uuid,
  resolved_at  timestamptz
);
alter table public.reports enable row level security;
drop policy if exists "reports_insert_own"  on public.reports;
drop policy if exists "reports_select_own"  on public.reports;
drop policy if exists "reports_admin_all"   on public.reports;
create policy "reports_insert_own" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "reports_select_own" on public.reports for select using (auth.uid() = reporter_id);
create policy "reports_admin_all"  on public.reports for all using (public.is_admin()) with check (public.is_admin());

-- 8) הגדרת בעל המערכת כאדמין (לפי אימייל)
update public.profiles set is_admin = true
where id in (
  select id from auth.users
  where lower(email) in ('coachadiriagam@gmail.com', 'agam15122003@gmail.com')
);

-- ---------------------------------------------------------------------
-- 9) דירוג סרטונים (מדיה לפי דירוג משתמשים)
-- ---------------------------------------------------------------------
create table if not exists public.video_ratings (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.drill_videos(id) on delete cascade,
  user_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  rating   smallint not null check (rating between 1 and 5),
  created_at timestamptz default now(),
  unique (video_id, user_id)
);
alter table public.video_ratings enable row level security;
drop policy if exists "vr_select_auth" on public.video_ratings;
drop policy if exists "vr_insert_own"  on public.video_ratings;
drop policy if exists "vr_update_own"  on public.video_ratings;
drop policy if exists "vr_delete_own"  on public.video_ratings;
create policy "vr_select_auth" on public.video_ratings for select to authenticated using (true);
create policy "vr_insert_own"  on public.video_ratings for insert to authenticated with check (user_id = auth.uid());
create policy "vr_update_own"  on public.video_ratings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "vr_delete_own"  on public.video_ratings for delete to authenticated using (user_id = auth.uid());

-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — מוכן! ✓
-- =====================================================================
