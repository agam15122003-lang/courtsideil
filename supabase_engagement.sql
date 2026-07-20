-- ============================================================
-- CourtSide — מנוע מעורבות: התראות, זמן-אמת, סקרים, אירועים,
-- ודף תרגיל ציבורי. הרץ פעם אחת ב-Supabase → SQL Editor → Run.
-- בטוח להריץ שוב (idempotent).
-- ============================================================

-- ---------- 1. התראות ----------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade, -- הנמען
  actor_id   uuid references public.profiles(id) on delete cascade,          -- מי גרם להתראה
  type       text not null,          -- 'like' | 'comment' | 'message' | 'event' | 'poll'
  content    text,                   -- טקסט קצר לתצוגה
  nav        text,                   -- יעד ניווט באפליקציה ('community' / 'messages' / ...)
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- כל מאמן מחובר יכול ליצור התראה למאמן אחר (הפעולה שלו היא המקור),
-- אבל רק כשהוא באמת ה-actor
drop policy if exists "notifications_insert_actor" on public.notifications;
create policy "notifications_insert_actor" on public.notifications
  for insert to authenticated with check (actor_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- ---------- 2. זמן-אמת (Realtime) ----------
-- מוסיפים את הטבלאות לפרסום של Supabase Realtime; מתעלמים אם כבר קיימות
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.community_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------- 3. סקרים בפיד ----------
alter table public.community_posts
  add column if not exists poll_options text[];

create table if not exists public.community_poll_votes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  option_idx int  not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.community_poll_votes enable row level security;

drop policy if exists "poll_votes_select" on public.community_poll_votes;
create policy "poll_votes_select" on public.community_poll_votes
  for select to authenticated using (true);

drop policy if exists "poll_votes_insert" on public.community_poll_votes;
create policy "poll_votes_insert" on public.community_poll_votes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "poll_votes_update" on public.community_poll_votes;
create policy "poll_votes_update" on public.community_poll_votes
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "poll_votes_delete" on public.community_poll_votes;
create policy "poll_votes_delete" on public.community_poll_votes
  for delete to authenticated using (user_id = auth.uid());

-- ---------- 4. אירועים ומפגשים ----------
create table if not exists public.community_events (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title      text not null,
  event_date date not null,
  event_time text,
  location   text,
  details    text,
  created_at timestamptz not null default now()
);

alter table public.community_events enable row level security;

drop policy if exists "events_select" on public.community_events;
create policy "events_select" on public.community_events
  for select to authenticated using (true);

drop policy if exists "events_insert" on public.community_events;
create policy "events_insert" on public.community_events
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "events_delete_own" on public.community_events;
create policy "events_delete_own" on public.community_events
  for delete to authenticated using (created_by = auth.uid());

create index if not exists community_events_date_idx
  on public.community_events (event_date);

create table if not exists public.community_event_rsvps (
  event_id   uuid not null references public.community_events(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.community_event_rsvps enable row level security;

drop policy if exists "rsvps_select" on public.community_event_rsvps;
create policy "rsvps_select" on public.community_event_rsvps
  for select to authenticated using (true);

drop policy if exists "rsvps_insert" on public.community_event_rsvps;
create policy "rsvps_insert" on public.community_event_rsvps
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "rsvps_delete" on public.community_event_rsvps;
create policy "rsvps_delete" on public.community_event_rsvps
  for delete to authenticated using (user_id = auth.uid());

-- ---------- 5. דף תרגיל ציבורי (קישור לשיתוף) ----------
-- מאפשר לאורחים (בלי חשבון) לקרוא אך ורק תרגילים ששותפו לקהילה —
-- כדי שקישור וואטסאפ לתרגיל ייפתח יפה גם אצל מי שעוד לא נרשם
drop policy if exists "drills_public_anon_read" on public.drills;
create policy "drills_public_anon_read" on public.drills
  for select to anon using (is_public = true);

-- רענון סכימת ה-API
notify pgrst, 'reload schema';
