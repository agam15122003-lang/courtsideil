-- ============================================================
-- CourtSide — תוצאות משחק (פריט 6 במסמך «21 מסכים מעוצבים»)
-- «אין מסך משחק, אין סיכום משחק» — כדי שיהיה סיכום, צריך איפה לשמור
-- את התוצאה. שלוש עמודות על team_games, בלי טבלה חדשה ובלי RLS חדש:
-- הרשאות team_games כבר מוגדרות (הבעלים בלבד) מ-supabase_teams_admin.sql.
--
-- הקוד סובלני לקובץ שלא הורץ: כפתור «הוספת תוצאה» פשוט לא נשמר ומציג
-- הודעה, שאר מסך המשחקים ממשיך לעבוד.
-- ============================================================

alter table public.team_games add column if not exists our_score  int;
alter table public.team_games add column if not exists their_score int;
alter table public.team_games add column if not exists summary    text;

-- תוצאה שלילית היא באג הקלדה, לא משחק
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'team_games_scores_nonneg') then
    alter table public.team_games add constraint team_games_scores_nonneg
      check ((our_score is null or our_score >= 0) and (their_score is null or their_score >= 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'team_games_summary_len') then
    alter table public.team_games add constraint team_games_summary_len
      check (summary is null or char_length(summary) <= 2000);
  end if;
end $$;

select public.mark_migration('supabase_game_scores.sql');
