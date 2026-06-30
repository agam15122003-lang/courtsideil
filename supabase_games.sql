-- =====================================================================
--  פנקס המאמן — תיאום משחקי אימון 🗓️
-- =====================================================================
--  מה הקובץ הזה עושה:
--  1. יוצר טבלה game_requests — בקשות למשחקי אימון ("מחפש משחק").
--  2. אבטחה (RLS): כל מאמן מחובר רואה את כל הבקשות (לוח ציבורי),
--     מפרסם רק בשם עצמו, ומוחק רק את הבקשות של עצמו.
--
--  הוראות: העתק את כל הקובץ והרץ ב-SQL Editor של Supabase.
--  בטוח להריץ אותו יותר מפעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) יצירת טבלת בקשות המשחק
-- ---------------------------------------------------------------------
create table if not exists public.game_requests (
  id         uuid primary key default gen_random_uuid(),

  -- מי פרסם (נמלא אוטומטית למאמן המחובר)
  created_by uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,

  age_group  text,                 -- שכבת גיל למשחק
  game_date  date,                 -- תאריך מבוקש (אופציונלי)
  location   text,                 -- מיקום (אופציונלי)
  note       text,                 -- פרטים נוספים (אופציונלי)
  created_at timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 2) הפעלת אבטחה (RLS)
-- ---------------------------------------------------------------------
alter table public.game_requests enable row level security;


-- ---------------------------------------------------------------------
-- 3) מדיניות אבטחה
-- ---------------------------------------------------------------------
drop policy if exists "games_select_authenticated" on public.game_requests;
drop policy if exists "games_insert_own"           on public.game_requests;
drop policy if exists "games_delete_own"           on public.game_requests;

-- קריאה: כל מאמן מחובר רואה את כל הבקשות (לוח ציבורי)
create policy "games_select_authenticated"
  on public.game_requests for select
  to authenticated
  using (true);

-- פרסום: רק בשם עצמי
create policy "games_insert_own"
  on public.game_requests for insert
  to authenticated
  with check (created_by = auth.uid());

-- מחיקה: רק את הבקשות של עצמי
create policy "games_delete_own"
  on public.game_requests for delete
  to authenticated
  using (created_by = auth.uid());


-- ---------------------------------------------------------------------
-- 4) רענון ה-cache של Supabase (כדי שהטבלה תזוהה מיד)
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';


-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — מוכן ללוח המשחקים! ✓
-- =====================================================================
