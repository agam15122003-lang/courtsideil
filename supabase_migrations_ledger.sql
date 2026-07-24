-- ============================================================
-- CourtSide — רישום מיגרציות (מה הורץ, מתי)
-- הבעיה: 33 קבצי SQL שמורצים ידנית ב-SQL Editor, בלי שום רישום. כשפיצ'ר
-- לא עובד, אין דרך לדעת אם הקוד שבור או שקובץ SQL לא הורץ — והקוד "סובלני
-- לטבלה חסרה", ולכן פיצ'ר מת נראה בדיוק כמו מסך ריק.
--
-- הרץ את הקובץ הזה פעם אחת, ואז בכל פעם שאתה מריץ קובץ SQL — הוסף שורה:
--   select public.mark_migration('supabase_privacy4.sql');
-- (השורה הזו כבר מופיעה בסוף הקבצים החדשים.)
--
-- כדי לראות מה הורץ:  select * from public.schema_migrations order by ran_at;
-- ============================================================

create table if not exists public.schema_migrations (
  filename text primary key,
  ran_at timestamptz not null default now(),
  ran_by uuid
);

alter table public.schema_migrations enable row level security;

drop policy if exists "migrations_read_admin" on public.schema_migrations;
create policy "migrations_read_admin" on public.schema_migrations
  for select to authenticated using (public.is_admin());

create or replace function public.mark_migration(p_file text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.schema_migrations (filename, ran_by)
  values (p_file, auth.uid())
  on conflict (filename) do update set ran_at = now(), ran_by = auth.uid();
$$;

-- רישום למפרע של הקבצים שכבר הורצו בייצור (לפי README + ההאנדוף).
-- אם קובץ כלשהו מהרשימה בעצם לא הורץ אצלך — מחק אותו מכאן לפני ההרצה.
select public.mark_migration(f) from (values
  ('supabase_setup.sql'), ('supabase_stage2.sql'), ('supabase_stage3.sql'),
  ('supabase_stage3_ratings.sql'), ('supabase_saved_drills.sql'), ('supabase_comments.sql'),
  ('supabase_training_plans.sql'), ('supabase_messages.sql'), ('supabase_community_chat.sql'),
  ('supabase_schedule.sql'), ('supabase_games.sql'), ('supabase_teams_admin.sql'),
  ('supabase_attendance.sql'), ('supabase_launch_migration.sql'), ('supabase_security_hardening.sql'),
  ('supabase_community.sql'), ('supabase_community2.sql'), ('supabase_engagement.sql'),
  ('supabase_security2.sql'), ('supabase_players.sql'), ('supabase_player_v2.sql'),
  ('supabase_sessions.sql'), ('supabase_game_reviews.sql'), ('supabase_effort.sql'),
  ('supabase_team_chat.sql'), ('supabase_player_goals.sql'), ('supabase_team_slots.sql'),
  ('supabase_feedback_sheet.sql'), ('supabase_player_goal_logging.sql')
) as t(f);

notify pgrst, 'reload schema';
