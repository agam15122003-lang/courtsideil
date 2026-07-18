-- ============================================================
-- CourtSide — קהילת המאמנים (פיד): פוסטים, לייקים ותגובות
-- הרץ קובץ זה פעם אחת ב-Supabase → SQL Editor → Run
-- בטוח להריץ שוב (idempotent).
-- ============================================================

-- ---------- פוסטים ----------
create table if not exists public.community_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content    text,
  image_urls text[],
  created_at timestamptz not null default now()
);

alter table public.community_posts enable row level security;

drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts
  for select to authenticated using (true);

drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "community_posts_delete" on public.community_posts;
create policy "community_posts_delete" on public.community_posts
  for delete to authenticated using (user_id = auth.uid());

create index if not exists community_posts_created_idx
  on public.community_posts (created_at desc);

-- ---------- לייקים ----------
create table if not exists public.community_post_likes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.community_post_likes enable row level security;

drop policy if exists "community_post_likes_select" on public.community_post_likes;
create policy "community_post_likes_select" on public.community_post_likes
  for select to authenticated using (true);

drop policy if exists "community_post_likes_insert" on public.community_post_likes;
create policy "community_post_likes_insert" on public.community_post_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "community_post_likes_delete" on public.community_post_likes;
create policy "community_post_likes_delete" on public.community_post_likes
  for delete to authenticated using (user_id = auth.uid());

-- ---------- תגובות ----------
create table if not exists public.community_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

alter table public.community_post_comments enable row level security;

drop policy if exists "community_post_comments_select" on public.community_post_comments;
create policy "community_post_comments_select" on public.community_post_comments
  for select to authenticated using (true);

drop policy if exists "community_post_comments_insert" on public.community_post_comments;
create policy "community_post_comments_insert" on public.community_post_comments
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "community_post_comments_delete" on public.community_post_comments;
create policy "community_post_comments_delete" on public.community_post_comments
  for delete to authenticated using (user_id = auth.uid());

create index if not exists community_post_comments_post_idx
  on public.community_post_comments (post_id, created_at);

-- ---------- אחסון תמונות ----------
-- התמונות עולות ל-bucket הקיים 'media' תחת התיקייה community/<user-id>/...
-- אם ההעלאה נכשלת עם שגיאת policy — ודא שקיימת מדיניות העלאה ל-bucket:
--   insert on storage.objects for authenticated
--   with check (bucket_id = 'media')
