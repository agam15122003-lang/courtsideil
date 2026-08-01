-- ============================================================
-- CourtSide — בניית תוכנית בחלקים, מסמך ההשקה 1.10
-- מוסיף plan_items.part: מספר החלק בתוכנית (חלק 1, חלק 2...).
-- שורות קיימות = חלק 1. אידמפוטנטי. הרץ אחרי supabase_stage3.sql.
-- ============================================================

alter table public.plan_items
  add column if not exists part int not null default 1
  check (part between 1 and 20);

-- רישום בטבלת המיגרציות (אם הלדג'ר קיים)
do $$
begin
  begin
    perform public.mark_migration('supabase_plan_parts.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
