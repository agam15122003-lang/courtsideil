-- =====================================================================
--  פנקס המאמן — הודעות בתוך האפליקציה 💬
-- =====================================================================
--  מה הקובץ הזה עושה:
--  1. יוצר טבלה messages — הודעה ממאמן אחד למאמן אחר.
--  2. אבטחה (RLS): כל מאמן רואה רק הודעות ששלח או קיבל,
--     שולח רק בשם עצמו, ויכול לסמן "נקרא" רק על הודעות שקיבל.
--
--  הוראות: העתק את כל הקובץ והרץ ב-SQL Editor של Supabase.
--  בטוח להריץ אותו יותר מפעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) יצירת טבלת ההודעות
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),

  -- מי שלח (נמלא אוטומטית למאמן המחובר)
  sender_id    uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,

  -- למי נשלח
  recipient_id uuid not null references public.profiles(id) on delete cascade,

  content      text not null,        -- תוכן ההודעה
  read_at      timestamptz,          -- מתי הנמען קרא (null = טרם נקרא)
  created_at   timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 2) הפעלת אבטחה (RLS)
-- ---------------------------------------------------------------------
alter table public.messages enable row level security;


-- ---------------------------------------------------------------------
-- 3) מדיניות אבטחה
-- ---------------------------------------------------------------------
drop policy if exists "messages_select_own"       on public.messages;
drop policy if exists "messages_insert_own"       on public.messages;
drop policy if exists "messages_update_recipient" on public.messages;

-- קריאה: רואים רק הודעות ששלחתי או שקיבלתי
create policy "messages_select_own"
  on public.messages for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- שליחה: רק בשם עצמי, ולא לעצמי
create policy "messages_insert_own"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid() and recipient_id <> auth.uid());

-- עדכון (סימון "נקרא"): רק הנמען של ההודעה
create policy "messages_update_recipient"
  on public.messages for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());


-- =====================================================================
--  סיום. אם לא הופיעו שגיאות אדומות — מוכן להודעות! ✓
-- =====================================================================
