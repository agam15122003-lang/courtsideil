-- ============================================================
-- CourtSide — יעדים, מסמך ההשקה 1.5
-- מוסיף player_goals.created_by: מי יצר את היעד (המאמן או השחקן
-- עצמו) — כדי שהשחקן יראה «אישי» מול «מהמאמן». due_date כבר קיים.
-- שורות קיימות מסומנות כאילו נוצרו על ידי המאמן (אין דרך להבדיל
-- בדיעבד). אידמפוטנטי. הרץ אחרי supabase_player_goal_logging.sql.
-- ============================================================

alter table public.player_goals
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

update public.player_goals set created_by = coach_id where created_by is null;

-- רישום בטבלת המיגרציות (אם הלדג'ר קיים)
do $$
begin
  begin
    perform public.mark_migration('supabase_goals_launch.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
