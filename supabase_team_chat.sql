-- ============================================================
-- CourtSide — צ'אט קבוצתי (FE3)
-- חדר צ'אט לכל קבוצה (מאמן + השחקנים המאושרים). הצטרפות אוטומטית דרך RLS.
-- הרץ אחרי supabase_players.sql / supabase_player_v2.sql.
-- ============================================================

-- מתג "רק מאמן כותב" לכל קבוצה (נשמר על קוד ההצטרפות שכבר per coach+team)
alter table public.team_join_codes
  add column if not exists chat_announce_only boolean not null default false;

create table if not exists public.team_messages (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  team       text not null,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content    text not null,
  kind       text not null default 'text',   -- 'text' | 'system'
  created_at timestamptz not null default now()
);

alter table public.team_messages enable row level security;

-- קריאה: חבר קבוצה מאושר או המאמן עצמו
drop policy if exists "tm_select" on public.team_messages;
create policy "tm_select" on public.team_messages
  for select to authenticated
  using (public.is_team_member(coach_id, team) or coach_id = auth.uid());

-- כתיבה: חבר/מאמן; ובמצב "רק מאמן כותב" — רק המאמן
drop policy if exists "tm_insert" on public.team_messages;
create policy "tm_insert" on public.team_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (public.is_team_member(coach_id, team) or coach_id = auth.uid())
    and (
      coach_id = auth.uid()
      or not exists (
        select 1 from public.team_join_codes j
        where j.coach_id = team_messages.coach_id and j.team = team_messages.team and j.chat_announce_only
      )
    )
  );

-- מחיקה: כל אחד את שלו; המאמן יכול למחוק הכול (ניהול/מודרציה)
drop policy if exists "tm_delete" on public.team_messages;
create policy "tm_delete" on public.team_messages
  for delete to authenticated
  using (user_id = auth.uid() or coach_id = auth.uid());

create index if not exists team_messages_idx on public.team_messages (coach_id, team, created_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tm_content_len') then
    alter table public.team_messages add constraint tm_content_len check (char_length(content) <= 2000) not valid;
  end if;
end $$;

do $$
begin
  begin alter publication supabase_realtime add table public.team_messages; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
