-- ============================================================
-- CourtSide — התקדמות חלקית בתרגילים ("ביצעתי 100 מתוך 200")
-- נכתב 25.7.2026. הרץ אחרי supabase_engagement2.sql. בטוח להרצה חוזרת.
--
-- למה: המאמן שולח "200 זריקות עונשין" והשחקן יכול לסמן רק בוצע/לא בוצע.
-- עכשיו המאמן קובע יעד כמותי בשליחה, והשחקן מדווח התקדמות בהדרגה.
-- שיגור קבוצתי נשאר שורה אחת (יעד אחיד לכולם) — ההתקדמות של כל שחקן
-- נשמרת בשורה שלו ב-assignment_completions.
-- ============================================================

-- יעד כמותי על שיגור (המאמן קובע בשליחה; ריק = תרגיל בוצע/לא-בוצע כרגיל)
alter table public.player_assignments add column if not exists target_value numeric;
alter table public.player_assignments add column if not exists unit text;

-- התקדמות פר-שחקן. done_at הופך ל-nullable:
--   שורה עם done_at=null  = בתהליך (התקדמות חלקית)
--   שורה עם done_at מלא   = בוצע
-- ברירת המחדל now() נשארת — קוד ישן שמוסיף שורה בלי done_at עדיין מסמן "בוצע".
alter table public.assignment_completions add column if not exists progress_value numeric not null default 0;
alter table public.assignment_completions add column if not exists updated_at timestamptz not null default now();
alter table public.assignment_completions alter column done_at drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assign_target_pos') then
    alter table public.player_assignments add constraint assign_target_pos
      check (target_value is null or target_value > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assign_unit_len') then
    alter table public.player_assignments add constraint assign_unit_len
      check (unit is null or char_length(unit) <= 30) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compl_progress_nonneg') then
    alter table public.assignment_completions add constraint compl_progress_nonneg
      check (progress_value >= 0) not valid;
  end if;
end $$;

-- אין צורך במדיניות RLS חדשה:
--   compl_player_all (supabase_players.sql) הוא FOR ALL על שורות השחקן עצמו,
--   ו-compl_coach_read מכסה קריאת מאמן. העמודות החדשות יורשות אותן.

do $mig$ begin perform public.mark_migration('supabase_assignments_progress.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';
