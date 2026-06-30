-- =====================================================================
--  פנקס המאמן — שלב 3: ספריית תרגילים
-- =====================================================================
--  מה הקובץ הזה עושה:
--  1. יוצר טבלה חדשה בשם drills (תרגילים).
--  2. מפעיל אבטחה (RLS): כל מאמן מחובר רואה את כל התרגילים,
--     אבל יכול לערוך/למחוק רק את התרגילים שהוא עצמו הוסיף.
--
--  הוראות: העתק את כל הקובץ והרץ אותו ב-SQL Editor של Supabase.
--  בטוח להריץ אותו יותר מפעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) יצירת טבלת התרגילים
-- ---------------------------------------------------------------------
-- "if not exists" => בטוח להריץ שוב, לא ייתן שגיאה אם הטבלה כבר קיימת.

create table if not exists public.drills (
  id            uuid primary key default gen_random_uuid(),

  -- פרטי הבסיס
  title         text not null,        -- שם התרגיל
  description   text,                 -- תיאור / איך מבצעים
  category      text,                 -- קטגוריה (אחת מהשש)
  age_groups    text[] default '{}',  -- שכבות גיל מתאימות

  -- פרטים נוספים (אופציונליים)
  duration_minutes integer,           -- משך בדקות
  equipment     text,                 -- ציוד נדרש
  video_url     text,                 -- קישור לסרטון
  players       text,                 -- מספר שחקנים (טקסט חופשי)
  difficulty    text,                 -- רמת קושי (קל / בינוני / מתקדם)
  goal          text,                 -- מטרת התרגיל
  reps          text,                 -- מספר חזרות / סטים
  coach_notes   text,                 -- דגשים למאמן

  -- מי הוסיף ומתי (נמלא אוטומטית)
  created_by    uuid default auth.uid()
                references public.profiles(id) on delete set null,
  created_at    timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 2) הפעלת אבטחה (RLS) על הטבלה
-- ---------------------------------------------------------------------
alter table public.drills enable row level security;


-- ---------------------------------------------------------------------
-- 3) מדיניות אבטחה
-- ---------------------------------------------------------------------
-- מוחקים קודם מדיניות קיימת (אם יש) כדי שאפשר יהיה להריץ את הקובץ שוב.

drop policy if exists "drills_select_authenticated" on public.drills;
drop policy if exists "drills_insert_own"           on public.drills;
drop policy if exists "drills_update_own"           on public.drills;
drop policy if exists "drills_delete_own"           on public.drills;

-- קריאה: כל מאמן מחובר רואה את כל התרגילים (ספרייה משותפת)
create policy "drills_select_authenticated"
  on public.drills for select
  to authenticated
  using (true);

-- הוספה: מאמן יכול להוסיף תרגיל רק בשם עצמו
create policy "drills_insert_own"
  on public.drills for insert
  to authenticated
  with check (created_by = auth.uid());

-- עריכה: רק את התרגילים שהוא עצמו הוסיף
create policy "drills_update_own"
  on public.drills for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- מחיקה: רק את התרגילים שהוא עצמו הוסיף
create policy "drills_delete_own"
  on public.drills for delete
  to authenticated
  using (created_by = auth.uid());


-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — הטבלה מוכנה! ✓
-- =====================================================================
