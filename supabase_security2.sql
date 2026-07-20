-- ============================================================
-- CourtSide — חיזוקי אבטחה ותקינות נתונים (שכבת המסד)
-- הרץ פעם אחת ב-Supabase → SQL Editor → Run. בטוח להריץ שוב.
-- החוקים נוספים כ-NOT VALID: שורות קיימות לא נחסמות, חדשות נאכפות.
-- ============================================================

-- עוזר: מוסיף constraint רק אם אינו קיים
create or replace function public._add_check(t regclass, cname text, expr text)
returns void language plpgsql as $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = t and conname = cname
  ) then
    execute format('alter table %s add constraint %I check (%s) not valid', t, cname, expr);
  end if;
end $$;

-- ---------- מגבלות אורך תוכן (מונע הצפה/ניפוח דרך ה-API) ----------
select public._add_check('public.community_posts', 'posts_content_len',
  'content is null or char_length(content) <= 4000');
select public._add_check('public.community_posts', 'posts_images_max',
  'image_urls is null or array_length(image_urls, 1) <= 8');
select public._add_check('public.community_posts', 'posts_poll_opts_max',
  'poll_options is null or array_length(poll_options, 1) <= 6');
select public._add_check('public.community_posts', 'posts_type_len',
  'post_type is null or char_length(post_type) <= 30');

select public._add_check('public.community_post_comments', 'comments_content_len',
  'char_length(content) <= 1000');

select public._add_check('public.community_messages', 'cmsg_content_len',
  'char_length(content) <= 4000');
select public._add_check('public.community_messages', 'cmsg_channel_len',
  'channel is null or char_length(channel) <= 40');

select public._add_check('public.messages', 'pmsg_content_len',
  'char_length(content) <= 4000');

-- ---------- התראות: סוגים מוכרים בלבד + אורכים ----------
select public._add_check('public.notifications', 'ntf_type_allowed',
  $$type in ('like', 'comment', 'message', 'event', 'poll')$$);
select public._add_check('public.notifications', 'ntf_content_len',
  'content is null or char_length(content) <= 300');
select public._add_check('public.notifications', 'ntf_nav_len',
  'nav is null or char_length(nav) <= 40');

-- ---------- סקרים: אינדקס אפשרות בטווח ----------
select public._add_check('public.community_poll_votes', 'poll_idx_range',
  'option_idx between 0 and 9');

-- ---------- אירועים: אורכים ותאריך סביר ----------
select public._add_check('public.community_events', 'ev_title_len',
  'char_length(title) <= 120');
select public._add_check('public.community_events', 'ev_location_len',
  'location is null or char_length(location) <= 120');
select public._add_check('public.community_events', 'ev_details_len',
  'details is null or char_length(details) <= 1000');
select public._add_check('public.community_events', 'ev_time_len',
  'event_time is null or char_length(event_time) <= 10');
select public._add_check('public.community_events', 'ev_date_sane',
  $$event_date between date '2020-01-01' and date '2100-01-01'$$);

-- ניקוי העוזר
drop function public._add_check(regclass, text, text);

-- רענון סכימת ה-API
notify pgrst, 'reload schema';
