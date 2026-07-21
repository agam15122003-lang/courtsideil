-- ============================================================
-- CourtSide — פלטפורמת השחקנים: תפקיד, קוד הצטרפות, חברות בקבוצה,
-- תרגילים ששוגרו, ומשוב. הרץ פעם אחת ב-Supabase → SQL Editor → Run.
-- בטוח להרצה חוזרת (idempotent).
-- ============================================================

-- ---------- 1. תפקיד + שדות שחקן על הפרופיל ----------
alter table public.profiles add column if not exists role text not null default 'coach'; -- 'coach' | 'player'
alter table public.profiles add column if not exists birth_year int;
alter table public.profiles add column if not exists position text;

-- ---------- 2. קוד הצטרפות לכל קבוצה (מאמן + שכבת גיל) ----------
create table if not exists public.team_join_codes (
  code       text primary key,
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  team       text not null,
  created_at timestamptz not null default now(),
  unique (coach_id, team)
);
alter table public.team_join_codes enable row level security;

-- מאמן מנהל את הקודים של עצמו
drop policy if exists "join_codes_owner_all" on public.team_join_codes;
create policy "join_codes_owner_all" on public.team_join_codes
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());
-- כל מחובר יכול לפענח קוד (הקודים אקראיים/אטומים) — כדי לממש הצטרפות
drop policy if exists "join_codes_resolve" on public.team_join_codes;
create policy "join_codes_resolve" on public.team_join_codes
  for select to authenticated using (true);

-- ---------- 3. חברות: חשבון שחקן אמיתי ↔ קבוצת מאמן ----------
create table if not exists public.team_memberships (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  team       text not null,
  player_id  uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending',   -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (coach_id, team, player_id)
);
alter table public.team_memberships enable row level security;

-- שחקן: רואה ויוצר בקשות של עצמו
drop policy if exists "memb_player_select" on public.team_memberships;
create policy "memb_player_select" on public.team_memberships
  for select to authenticated using (player_id = auth.uid());
drop policy if exists "memb_player_insert" on public.team_memberships;
create policy "memb_player_insert" on public.team_memberships
  for insert to authenticated with check (player_id = auth.uid() and status = 'pending');
drop policy if exists "memb_player_delete" on public.team_memberships;
create policy "memb_player_delete" on public.team_memberships
  for delete to authenticated using (player_id = auth.uid());
-- מאמן: רואה ומעדכן בקשות לקבוצות שלו (אישור/דחייה)
drop policy if exists "memb_coach_select" on public.team_memberships;
create policy "memb_coach_select" on public.team_memberships
  for select to authenticated using (coach_id = auth.uid());
drop policy if exists "memb_coach_update" on public.team_memberships;
create policy "memb_coach_update" on public.team_memberships
  for update to authenticated using (coach_id = auth.uid());
drop policy if exists "memb_coach_delete" on public.team_memberships;
create policy "memb_coach_delete" on public.team_memberships
  for delete to authenticated using (coach_id = auth.uid());

create index if not exists memb_coach_idx on public.team_memberships (coach_id, team, status);
create index if not exists memb_player_idx on public.team_memberships (player_id, status);

-- קישור שורת סגל (טקסט) לחשבון שחקן אמיתי
alter table public.team_players add column if not exists player_id uuid references public.profiles(id) on delete set null;

-- עוזר: האם auth.uid() חבר מאושר בקבוצת (coach, team)?
create or replace function public.is_team_member(_coach uuid, _team text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_memberships m
    where m.coach_id = _coach and m.team = _team
      and m.player_id = auth.uid() and m.status = 'approved'
  );
$$;

-- שחקן מאושר יכול לקרוא את הלו"ז והסגל של הקבוצה שלו
drop policy if exists "schedule_member_read" on public.schedule_entries;
create policy "schedule_member_read" on public.schedule_entries
  for select to authenticated using (public.is_team_member(created_by, team));
drop policy if exists "roster_member_read" on public.team_players;
create policy "roster_member_read" on public.team_players
  for select to authenticated using (public.is_team_member(coach_id, team));

-- ---------- 4. תרגילים/תוכן ששוגרו לשחקן או לכל הקבוצה ----------
create table if not exists public.player_assignments (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  team       text,                                                   -- מלא = לכל הקבוצה
  player_id  uuid references public.profiles(id) on delete cascade,  -- מלא = לשחקן יחיד
  drill_id   uuid references public.drills(id) on delete cascade,
  plan_id    uuid references public.training_plans(id) on delete set null,
  video_url  text,
  title      text,
  note       text,
  due_date   date,
  created_at timestamptz not null default now()
);
alter table public.player_assignments enable row level security;

-- מאמן מנהל את השיגורים שלו
drop policy if exists "assign_coach_all" on public.player_assignments;
create policy "assign_coach_all" on public.player_assignments
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());
-- שחקן רואה שיגור אישי אליו, או שיגור-לקבוצה שהוא חבר מאושר בה
drop policy if exists "assign_player_read" on public.player_assignments;
create policy "assign_player_read" on public.player_assignments
  for select to authenticated using (
    player_id = auth.uid()
    or (player_id is null and team is not null and public.is_team_member(coach_id, team))
  );

create index if not exists assign_player_idx on public.player_assignments (player_id, created_at desc);
create index if not exists assign_team_idx on public.player_assignments (coach_id, team, created_at desc);

-- סימון "ביצעתי" לכל שחקן בנפרד
create table if not exists public.assignment_completions (
  assignment_id uuid not null references public.player_assignments(id) on delete cascade,
  player_id     uuid not null references public.profiles(id) on delete cascade,
  done_at       timestamptz not null default now(),
  primary key (assignment_id, player_id)
);
alter table public.assignment_completions enable row level security;

drop policy if exists "compl_player_all" on public.assignment_completions;
create policy "compl_player_all" on public.assignment_completions
  for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
-- מאמן רואה ביצועים של השיגורים שלו (מעקב)
drop policy if exists "compl_coach_read" on public.assignment_completions;
create policy "compl_coach_read" on public.assignment_completions
  for select to authenticated using (
    exists (select 1 from public.player_assignments a
            where a.id = assignment_completions.assignment_id and a.coach_id = auth.uid())
  );

-- ---------- 5. משוב אישי: מאמן → שחקן ----------
create table if not exists public.player_feedback (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  player_id  uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  rating     int,                       -- אופציונלי 1..5
  created_at timestamptz not null default now()
);
alter table public.player_feedback enable row level security;

drop policy if exists "fb_coach_all" on public.player_feedback;
create policy "fb_coach_all" on public.player_feedback
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists "fb_player_read" on public.player_feedback;
create policy "fb_player_read" on public.player_feedback
  for select to authenticated using (player_id = auth.uid());

create index if not exists fb_player_idx on public.player_feedback (player_id, created_at desc);

-- ---------- 6. זמן-אמת + מגבלות תוכן ----------
do $$
begin
  begin alter publication supabase_realtime add table public.team_memberships; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.player_assignments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.player_feedback; exception when duplicate_object then null; end;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fb_content_len') then
    alter table public.player_feedback add constraint fb_content_len check (char_length(content) <= 2000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assign_note_len') then
    alter table public.player_assignments add constraint assign_note_len check (note is null or char_length(note) <= 1000) not valid;
  end if;
end $$;

notify pgrst, 'reload schema';
