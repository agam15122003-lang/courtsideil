-- ============================================================
-- CourtSide — סיכום אימון מורחב (feedback sheet): מצב רוח + פוקוס
-- מוסיף לטבלת session_effort הקיימת שדות "איך הרגשת" ו"על מה עבדת".
-- הרץ אחרי supabase_effort.sql.
-- ============================================================

alter table public.session_effort add column if not exists mood  text;      -- 'tough'|'tired'|'ok'|'good'|'great'
alter table public.session_effort add column if not exists focus text[];     -- למשל: {'כדרור','הגנה'}

notify pgrst, 'reload schema';
