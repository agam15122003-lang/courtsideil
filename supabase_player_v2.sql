-- ============================================================
-- CourtSide — שדרוג צד השחקן (v2)
-- • צ'אט קהילת שחקנים (שחקנים בלבד)
-- • קריאה עצמית של נוכחות לשחקן (לטבעת הנוכחות בדף הבית)
-- הרץ קובץ זה ב-Supabase SQL Editor (אחרי supabase_players.sql).
-- ============================================================

-- ---------- עוזרים (security definer כדי לא ליצור רקורסיית RLS) ----------

-- האם המשתמש הנוכחי הוא שחקן?
create or replace function public.is_player()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'player'
  );
$$;

-- האם שורת סגל (team_players.id) שייכת לשחקן המחובר?
create or replace function public.is_my_roster(_player_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_players tp
    where tp.id = _player_id and tp.player_id = auth.uid()
  );
$$;

-- ---------- צ'אט קהילת השחקנים ----------
create table if not exists public.player_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  channel    text not null default 'כללי',
  content    text not null,
  created_at timestamptz not null default now()
);

alter table public.player_messages enable row level security;

drop policy if exists "pmsg_select_players" on public.player_messages;
create policy "pmsg_select_players" on public.player_messages
  for select to authenticated using (public.is_player());

drop policy if exists "pmsg_insert_own_player" on public.player_messages;
create policy "pmsg_insert_own_player" on public.player_messages
  for insert to authenticated with check (user_id = auth.uid() and public.is_player());

drop policy if exists "pmsg_delete_own" on public.player_messages;
create policy "pmsg_delete_own" on public.player_messages
  for delete to authenticated using (user_id = auth.uid());

create index if not exists player_messages_channel_idx
  on public.player_messages (channel, created_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pmsg_content_len') then
    alter table public.player_messages
      add constraint pmsg_content_len check (char_length(content) <= 2000) not valid;
  end if;
end $$;

-- ---------- נוכחות: השחקן קורא את הרשומות שלו ----------
-- (practice_attendance.player_id מפנה ל-team_players.id; ההצמדה לחשבון דרך team_players.player_id)
do $$
begin
  if to_regclass('public.practice_attendance') is not null then
    execute 'alter table public.practice_attendance enable row level security';
    execute 'drop policy if exists "attendance_player_self_read" on public.practice_attendance';
    execute 'create policy "attendance_player_self_read" on public.practice_attendance
      for select to authenticated using (public.is_my_roster(player_id))';
  end if;
end $$;

-- ---------- realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.player_messages;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
