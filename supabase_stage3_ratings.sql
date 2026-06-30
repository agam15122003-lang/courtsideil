-- =====================================================================
--  פנקס המאמן — שלב 3 (המשך): דירוג תרגילים ⭐
-- =====================================================================
--  מה הקובץ הזה עושה:
--  1. יוצר טבלה drill_ratings — דירוג של מאמן לתרגיל (1 עד 5 כוכבים).
--  2. כל מאמן יכול לדרג כל תרגיל פעם אחת (אפשר לעדכן את הדירוג).
--  3. אבטחה (RLS): כל מאמן מחובר רואה את כל הדירוגים (כדי לחשב ממוצע),
--     אבל יוצר/מעדכן/מוחק רק את הדירוג של עצמו.
--
--  הוראות: העתק את כל הקובץ והרץ ב-SQL Editor של Supabase.
--  בטוח להריץ אותו יותר מפעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) יצירת טבלת הדירוגים
-- ---------------------------------------------------------------------
create table if not exists public.drill_ratings (
  id         uuid primary key default gen_random_uuid(),

  -- לאיזה תרגיל הדירוג שייך (אם התרגיל נמחק — הדירוגים שלו נמחקים איתו)
  drill_id   uuid not null references public.drills(id) on delete cascade,

  -- מי דירג (נמלא אוטומטית למאמן המחובר)
  user_id    uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,

  -- הדירוג עצמו: מספר שלם בין 1 ל-5
  rating     smallint not null check (rating between 1 and 5),

  created_at timestamptz default now(),

  -- כל מאמן מדרג כל תרגיל פעם אחת בלבד (אפשר לעדכן את אותה שורה)
  unique (drill_id, user_id)
);


-- ---------------------------------------------------------------------
-- 2) הפעלת אבטחה (RLS)
-- ---------------------------------------------------------------------
alter table public.drill_ratings enable row level security;


-- ---------------------------------------------------------------------
-- 3) מדיניות אבטחה
-- ---------------------------------------------------------------------
drop policy if exists "ratings_select_authenticated" on public.drill_ratings;
drop policy if exists "ratings_insert_own"            on public.drill_ratings;
drop policy if exists "ratings_update_own"            on public.drill_ratings;
drop policy if exists "ratings_delete_own"            on public.drill_ratings;

-- קריאה: כל מאמן מחובר רואה את כל הדירוגים (כדי לחשב ממוצע)
create policy "ratings_select_authenticated"
  on public.drill_ratings for select
  to authenticated
  using (true);

-- הוספה: רק דירוג בשם עצמך
create policy "ratings_insert_own"
  on public.drill_ratings for insert
  to authenticated
  with check (user_id = auth.uid());

-- עדכון: רק את הדירוג של עצמך
create policy "ratings_update_own"
  on public.drill_ratings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- מחיקה: רק את הדירוג של עצמך
create policy "ratings_delete_own"
  on public.drill_ratings for delete
  to authenticated
  using (user_id = auth.uid());


-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — מוכן לכוכבים! ✓
-- =====================================================================
