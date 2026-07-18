-- ============================================================
-- CourtSide — קהילה שלב 2: תיקון קשרים + ערוצי צ'אט לפי קטגוריה
-- הרץ קובץ זה פעם אחת ב-Supabase → SQL Editor → Run
-- בטוח להריץ שוב (idempotent).
-- ============================================================

-- ---------- 1. תיקון "more than one relationship" ----------
-- אם נוצרו בטעות כמה מפתחות-זר בין טבלאות הקהילה ל-profiles,
-- מוחקים את כולם ויוצרים אחד יחיד עם שם קבוע.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.community_posts'::regclass
      and contype = 'f'
      and confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table public.community_posts drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.community_posts
  add constraint community_posts_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.community_post_likes'::regclass
      and contype = 'f'
      and confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table public.community_post_likes drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.community_post_likes
  add constraint community_post_likes_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.community_post_comments'::regclass
      and contype = 'f'
      and confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table public.community_post_comments drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.community_post_comments
  add constraint community_post_comments_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- ---------- 2. ערוצי צ'אט לפי קטגוריה ----------
-- ההודעות הקיימות מהצ'אט הקבוצתי הישן עוברות אוטומטית לערוץ "כללי".
alter table public.community_messages
  add column if not exists channel text not null default 'כללי';

create index if not exists community_messages_channel_idx
  on public.community_messages (channel, created_at);

-- רענון סכימת ה-API (PostgREST) — כדי שהשינויים ייקלטו מיד
notify pgrst, 'reload schema';
