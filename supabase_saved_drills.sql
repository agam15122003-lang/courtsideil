-- =====================================================================
--  פנקס המאמן — שמירת תרגילים (מועדפים) 💾
-- =====================================================================
--  מה הקובץ הזה עושה:
--  1. יוצר טבלה saved_drills — כל שורה = תרגיל ששמור אצל מאמן מסוים.
--  2. אבטחה (RLS) פרטית: כל מאמן רואה ומנהל רק את השמורים של עצמו.
--
--  הוראות: העתק את כל הקובץ והרץ ב-SQL Editor של Supabase.
--  בטוח להריץ אותו יותר מפעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) יצירת טבלת המועדפים
-- ---------------------------------------------------------------------
create table if not exists public.saved_drills (
  id         uuid primary key default gen_random_uuid(),

  -- איזה תרגיל נשמר (אם התרגיל נמחק — השמירה נמחקת איתו)
  drill_id   uuid not null references public.drills(id) on delete cascade,

  -- מי שמר (נמלא אוטומטית למאמן המחובר)
  user_id    uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,

  created_at timestamptz default now(),

  -- כל מאמן שומר כל תרגיל פעם אחת בלבד
  unique (drill_id, user_id)
);


-- ---------------------------------------------------------------------
-- 2) הפעלת אבטחה (RLS)
-- ---------------------------------------------------------------------
alter table public.saved_drills enable row level security;


-- ---------------------------------------------------------------------
-- 3) מדיניות אבטחה — רשימה פרטית לחלוטין
-- ---------------------------------------------------------------------
drop policy if exists "saved_select_own" on public.saved_drills;
drop policy if exists "saved_insert_own" on public.saved_drills;
drop policy if exists "saved_delete_own" on public.saved_drills;

-- קריאה: כל מאמן רואה רק את השמורים של עצמו
create policy "saved_select_own"
  on public.saved_drills for select
  to authenticated
  using (user_id = auth.uid());

-- הוספה: רק לעצמך
create policy "saved_insert_own"
  on public.saved_drills for insert
  to authenticated
  with check (user_id = auth.uid());

-- הסרה: רק את השמורים של עצמך
create policy "saved_delete_own"
  on public.saved_drills for delete
  to authenticated
  using (user_id = auth.uid());


-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — מוכן למועדפים! ✓
-- =====================================================================
