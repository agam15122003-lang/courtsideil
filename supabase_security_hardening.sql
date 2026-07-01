-- =====================================================================
--  חיזוק אבטחה (Security Hardening) — להרצה ב-Supabase SQL Editor
-- =====================================================================
--  מה הקובץ הזה סוגר:
--  1) חור קריטי: כל משתמש יכול היה להפוך את עצמו לאדמין/מאומת
--  2) מקבל הודעה יכול היה לשכתב את תוכן ההודעה שקיבל
--  3) חוסר מגבלת אורך על טקסטים מהמשתמשים (הצפה/ספאם)
--  4) חשיפת אימיילים של כל המאמנים לכל משתמש מחובר
--  בטוח להרצה חוזרת (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) הגנה על עמודות מיוחסות בפרופיל
--    המדיניות "profiles_update_own" מאפשרת לכל מאמן לעדכן את השורה
--    שלו — כולל is_admin / verified / banned. הטריגר הזה חוסם שינוי
--    של העמודות האלה אלא אם המבצע הוא אדמין.
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.is_admin     is distinct from old.is_admin
    or new.verified     is distinct from old.verified
    or new.banned       is distinct from old.banned
    or new.verified_at  is distinct from old.verified_at
    or new.verified_by  is distinct from old.verified_by then
      raise exception 'שינוי שדות ניהול מותר לאדמין בלבד';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_cols on public.profiles;
create trigger trg_protect_profile_cols
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_cols();

-- ---------------------------------------------------------------------
-- 2) הודעות פרטיות: המקבל רשאי לעדכן רק את read_at (סימון "נקרא")
--    בלי זה — המקבל יכול לשכתב את תוכן ההודעה שנשלחה אליו.
-- ---------------------------------------------------------------------
create or replace function public.messages_recipient_read_only()
returns trigger
language plpgsql
as $$
begin
  -- השולח לא נוגע בהודעה אחרי שליחה; המקבל מותר לו רק read_at
  if auth.uid() = old.recipient_id and auth.uid() <> old.sender_id then
    if new.content      is distinct from old.content
    or new.sender_id    is distinct from old.sender_id
    or new.recipient_id is distinct from old.recipient_id
    or new.created_at   is distinct from old.created_at then
      raise exception 'מקבל הודעה רשאי לעדכן רק את סימון הקריאה';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_read_only on public.messages;
create trigger trg_messages_read_only
  before update on public.messages
  for each row execute function public.messages_recipient_read_only();

-- ---------------------------------------------------------------------
-- 3) מגבלות אורך על תוכן משתמשים (מניעת הצפה)
-- ---------------------------------------------------------------------
do $$ begin
  alter table public.drill_comments
    add constraint drill_comments_len check (char_length(content) between 1 and 2000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.community_messages
    add constraint community_messages_len check (char_length(content) between 1 and 2000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.messages
    add constraint messages_len check (char_length(content) between 1 and 4000);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 4) הפסקת חשיפת אימיילים
--    profiles.email נקרא ע"י אף מסך באפליקציה (האתר מציג את האימייל
--    מ-auth בלבד), אבל המדיניות הרחבה חושפת אותו לכל משתמש מחובר.
--    מעדכנים את הטריגר שלא יכתוב אימייל, ומסירים את העמודה.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.profiles drop column if exists email;
