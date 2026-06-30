-- =====================================================================
--  פנקס המאמן — צ'אט קבוצתי לכל המאמנים 💬
-- =====================================================================
--  מה הקובץ הזה עושה:
--  1. יוצר טבלה community_messages — הודעות בצ'אט המשותף.
--  2. אבטחה (RLS): כל מאמן מחובר רואה את כל ההודעות,
--     כותב רק בשם עצמו, ומוחק רק את ההודעות של עצמו.
--
--  הוראות: העתק את כל הקובץ והרץ ב-SQL Editor של Supabase.
--  בטוח להריץ אותו יותר מפעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) יצירת טבלת הצ'אט הקבוצתי
-- ---------------------------------------------------------------------
create table if not exists public.community_messages (
  id         uuid primary key default gen_random_uuid(),

  -- מי כתב (נמלא אוטומטית למאמן המחובר)
  user_id    uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,

  content    text not null,        -- תוכן ההודעה
  created_at timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 2) הפעלת אבטחה (RLS)
-- ---------------------------------------------------------------------
alter table public.community_messages enable row level security;


-- ---------------------------------------------------------------------
-- 3) מדיניות אבטחה
-- ---------------------------------------------------------------------
drop policy if exists "community_select_authenticated" on public.community_messages;
drop policy if exists "community_insert_own"           on public.community_messages;
drop policy if exists "community_delete_own"           on public.community_messages;

-- קריאה: כל מאמן מחובר רואה את כל ההודעות
create policy "community_select_authenticated"
  on public.community_messages for select
  to authenticated
  using (true);

-- כתיבה: רק בשם עצמי
create policy "community_insert_own"
  on public.community_messages for insert
  to authenticated
  with check (user_id = auth.uid());

-- מחיקה: רק את ההודעות של עצמי
create policy "community_delete_own"
  on public.community_messages for delete
  to authenticated
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- 4) רענון ה-cache של Supabase (כדי שהטבלה תזוהה מיד)
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';


-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — מוכן לצ'אט! ✓
-- =====================================================================
