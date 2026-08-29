-- ============================================================
-- הרכבים מוכנים לאימון — 29.8.2026
-- ============================================================
-- זוגות / שלשות / רביעיות / חמישיות שהמאמן מכין מראש לאימון מסוים.
--
-- ⚠ פרטי לחלוטין, בכוונה: הטבלה נפרדת מ-training_plans וההרשאות הן
--   «רק המאמן שיצר». תוכנית ששותפה לקהילה לא חושפת את ההרכבים — מי
--   שפותח אותה פשוט לא מקבל שורה מכאן. אין צורך בסינון בצד הלקוח.
--
-- שורה אחת לכל תוכנית (plan_id הוא המפתח). groups הוא JSON:
--   [{ "id": "...", "size": 3, "name": "שלשות מסירות",
--      "players": ["<team_players.id>", ...] }, ...]
--
-- ביטול (אם משהו השתבש):
--   drop table if exists public.plan_lineups cascade;

create table if not exists public.plan_lineups (
  plan_id    uuid primary key references public.training_plans(id) on delete cascade,
  coach_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  groups     jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- אינדקס לחיפוש «ההרכבים האחרונים שלי» (העתקה מהאימון הקודם)
create index if not exists plan_lineups_coach_idx on public.plan_lineups (coach_id, updated_at desc);

alter table public.plan_lineups enable row level security;

drop policy if exists lineups_select_own on public.plan_lineups;
create policy lineups_select_own on public.plan_lineups
  for select using (auth.uid() = coach_id);

drop policy if exists lineups_insert_own on public.plan_lineups;
create policy lineups_insert_own on public.plan_lineups
  for insert with check (auth.uid() = coach_id);

drop policy if exists lineups_update_own on public.plan_lineups;
create policy lineups_update_own on public.plan_lineups
  for update using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

drop policy if exists lineups_delete_own on public.plan_lineups;
create policy lineups_delete_own on public.plan_lineups
  for delete using (auth.uid() = coach_id);

-- רענון סכימת ה-API
notify pgrst, 'reload schema';
