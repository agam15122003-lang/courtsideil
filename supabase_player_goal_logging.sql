-- ============================================================
-- CourtSide — השחקן מתעד התקדמות במטרות ומוסיף מטרות אישיות
-- מרחיב את supabase_player_goals.sql: השחקן יכול לעדכן התקדמות/סטטוס
-- על המטרות שהוצבו לו, וגם ליצור/למחוק מטרות אישיות משלו.
-- הרץ אחרי supabase_player_goals.sql.
-- ============================================================

-- עדכון התקדמות/סטטוס על המטרות האישיות של השחקן
drop policy if exists "pg_player_update" on public.player_goals;
create policy "pg_player_update" on public.player_goals
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

-- יצירת מטרה אישית (השחקן עצמו)
drop policy if exists "pg_player_insert" on public.player_goals;
create policy "pg_player_insert" on public.player_goals
  for insert to authenticated
  with check (player_id = auth.uid());

-- מחיקת מטרה אישית שהשחקן יצר
drop policy if exists "pg_player_delete" on public.player_goals;
create policy "pg_player_delete" on public.player_goals
  for delete to authenticated
  using (player_id = auth.uid());

notify pgrst, 'reload schema';
