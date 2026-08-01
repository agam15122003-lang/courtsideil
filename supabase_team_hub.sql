-- ============================================================
-- CourtSide — «הקבוצה והלו"ז» לשחקן, מסמך ההשקה 1.13
-- חברי קבוצה מאושרים קוראים את קישור הליגה (team_iba) של הקבוצה
-- שלהם — כדי שטבלת הליגה מהאיגוד תוצג גם בעולם השחקן.
-- אידמפוטנטי. הרץ אחרי supabase_teams_admin.sql + supabase_players.sql.
-- ============================================================

drop policy if exists "team_iba_member_read" on public.team_iba;
create policy "team_iba_member_read" on public.team_iba
  for select to authenticated
  using (public.is_team_member(coach_id, team));

-- רישום בטבלת המיגרציות (אם הלדג'ר קיים)
do $$
begin
  begin
    perform public.mark_migration('supabase_team_hub.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
