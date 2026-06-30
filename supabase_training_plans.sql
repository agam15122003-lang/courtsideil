-- =====================================================================
--  פנקס המאמן — שלב 2: בונה תוכנית אימון 🏗️
-- =====================================================================
--  מה הקובץ הזה עושה:
--  1. יוצר טבלה training_plans — תוכנית אימון (שם + בעלים).
--  2. יוצר טבלה plan_items — התרגילים שבתוך כל תוכנית,
--     כל אחד עם סדר (position), משך בדקות, והערה.
--  3. אבטחה (RLS): כל מאמן רואה ומנהל רק את התוכניות של עצמו.
--
--  הוראות: העתק את כל הקובץ והרץ ב-SQL Editor של Supabase.
--  בטוח להריץ אותו יותר מפעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) טבלת התוכניות
-- ---------------------------------------------------------------------
create table if not exists public.training_plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,        -- שם התוכנית (למשל "אימון הגנה לנוער")
  created_by uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 2) טבלת הפריטים בתוכנית (תרגיל אחד בתוך תוכנית)
-- ---------------------------------------------------------------------
create table if not exists public.plan_items (
  id               uuid primary key default gen_random_uuid(),

  -- לאיזו תוכנית הפריט שייך (אם התוכנית נמחקת — הפריטים נמחקים איתה)
  plan_id          uuid not null references public.training_plans(id) on delete cascade,

  -- איזה תרגיל (אם התרגיל נמחק מהספרייה — הוא יוסר גם מהתוכניות)
  drill_id         uuid not null references public.drills(id) on delete cascade,

  position         integer not null default 0,  -- סדר התרגיל בתוך התוכנית
  duration_minutes integer,                      -- משך בדקות (אפשר לשנות לכל פריט)
  note             text,                         -- הערה לפריט (למשל "דגש על תקשורת")
  created_at       timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 3) הפעלת אבטחה (RLS)
-- ---------------------------------------------------------------------
alter table public.training_plans enable row level security;
alter table public.plan_items     enable row level security;


-- ---------------------------------------------------------------------
-- 4) מדיניות אבטחה
-- ---------------------------------------------------------------------
-- תוכניות: כל מאמן רואה/יוצר/עורך/מוחק רק את התוכניות של עצמו.
drop policy if exists "plans_all_own" on public.training_plans;
create policy "plans_all_own"
  on public.training_plans for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- פריטים: מותר לגעת בפריט רק אם התוכנית שלו שייכת לי.
drop policy if exists "plan_items_all_own" on public.plan_items;
create policy "plan_items_all_own"
  on public.plan_items for all
  to authenticated
  using (
    exists (
      select 1 from public.training_plans p
      where p.id = plan_items.plan_id and p.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.training_plans p
      where p.id = plan_items.plan_id and p.created_by = auth.uid()
    )
  );


-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — מוכן לבנות תוכניות! ✓
-- =====================================================================
