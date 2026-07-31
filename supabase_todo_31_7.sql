-- ============================================================
-- CourtSide — סבב המשוב של 31.7 (TODO_31.7.md)
-- הרץ ב-Supabase → SQL Editor → New query → Run
-- בטוח להרצה חוזרת.
--
-- §6  סיבת אי-הגעה: שחקן שמסמן «לא מגיע» יכול לכתוב סיבה במלל
--     חופשי שהמאמן רואה.
-- §10 מטרה חצי-שנתית: הרחבת תקופות המטרה + יישור 'season'
--     (הקוד סינן לפי 'season' שה-constraint מעולם לא הרשה —
--     לכן טאב «העונה» היה ריק תמיד).
-- ============================================================

-- §6 · עמודת סיבה על אישור ההגעה
alter table public.practice_rsvp
  add column if not exists reason text
  check (reason is null or char_length(reason) <= 200);

-- §10 · תקופות המטרות: מוסיפים 'half_year' ומשאירים את הקיימות.
--   'session' = אחרי אימון · 'week' · 'month' · 'half_year' · 'year'
alter table public.player_goals
  drop constraint if exists player_goals_period_check;
alter table public.player_goals
  add constraint player_goals_period_check
  check (period in ('week', 'month', 'half_year', 'year', 'session'));

-- ============================================================
-- הצעה א-4 · מעקב פציעות: סטטוס זמינות על שחקן
--   fit = כשיר · light = פציעה קלה · out = מושבת
-- ============================================================
alter table public.team_players
  add column if not exists fitness text not null default 'fit'
  check (fitness in ('fit', 'light', 'out'));
alter table public.team_players
  add column if not exists fitness_note text
  check (fitness_note is null or char_length(fitness_note) <= 120);
