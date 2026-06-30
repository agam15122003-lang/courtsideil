-- =====================================================================
--  פנקס המאמן — תגובות על תרגילים 💬
-- =====================================================================
--  מה הקובץ הזה עושה:
--  1. יוצר טבלה drill_comments — תגובה של מאמן על תרגיל.
--  2. אבטחה (RLS): כל מאמן מחובר רואה את כל התגובות,
--     מוסיף תגובה רק בשם עצמו, ומוחק רק את התגובות של עצמו.
--
--  הוראות: העתק את כל הקובץ והרץ ב-SQL Editor של Supabase.
--  בטוח להריץ אותו יותר מפעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) יצירת טבלת התגובות
-- ---------------------------------------------------------------------
create table if not exists public.drill_comments (
  id         uuid primary key default gen_random_uuid(),

  -- על איזה תרגיל התגובה (אם התרגיל נמחק — התגובות נמחקות איתו)
  drill_id   uuid not null references public.drills(id) on delete cascade,

  -- מי כתב (נמלא אוטומטית למאמן המחובר)
  user_id    uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,

  content    text not null,        -- תוכן התגובה
  created_at timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 2) הפעלת אבטחה (RLS)
-- ---------------------------------------------------------------------
alter table public.drill_comments enable row level security;


-- ---------------------------------------------------------------------
-- 3) מדיניות אבטחה
-- ---------------------------------------------------------------------
drop policy if exists "comments_select_authenticated" on public.drill_comments;
drop policy if exists "comments_insert_own"           on public.drill_comments;
drop policy if exists "comments_delete_own"           on public.drill_comments;

-- קריאה: כל מאמן מחובר רואה את כל התגובות
create policy "comments_select_authenticated"
  on public.drill_comments for select
  to authenticated
  using (true);

-- הוספה: רק בשם עצמי
create policy "comments_insert_own"
  on public.drill_comments for insert
  to authenticated
  with check (user_id = auth.uid());

-- מחיקה: רק את התגובות של עצמי
create policy "comments_delete_own"
  on public.drill_comments for delete
  to authenticated
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- 4) רענון ה-cache של Supabase (כדי שהטבלה תזוהה מיד)
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';


-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — מוכן לתגובות! ✓
-- =====================================================================
