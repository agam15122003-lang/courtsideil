-- =====================================================================
--  מיגרציית השקה — מיישרת את מסד הנתונים לקוד האפליקציה
-- =====================================================================
--  למה זה קריטי: חלק משינויי הסכמה בוצעו בעבר ידנית ב-SQL Editor ולא
--  נשמרו כקבצים. בסביבה החיה ייתכן שהם קיימים — אבל אם עמודה אחת חסרה,
--  הרשמה / הוספת תרגיל / שמירת אימון נכשלים לגמרי.
--  הקובץ הזה בטוח להרצה חוזרת (add column if not exists) — הרץ אותו
--  פעם אחת ב-Supabase → SQL Editor → Run, וכל הפערים ייסגרו.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) פרופילים — טלפון, הצגת טלפון, תמונת פרופיל
--    (ProfileForm שולח את השדות האלה בכל שמירה)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists phone        text,
  add column if not exists phone_public boolean not null default false,
  add column if not exists avatar_url   text,
  add column if not exists updated_at   timestamptz default now();

-- ---------------------------------------------------------------------
-- 2) תרגילים — תגיות, פומבי/פרטי, לוח טקטיקה, תמונה
--    (DrillForm שולח tags/is_public/board/image_url בכל הוספה)
-- ---------------------------------------------------------------------
alter table public.drills
  add column if not exists tags       text[],
  add column if not exists is_public  boolean not null default true,
  add column if not exists board      jsonb,
  add column if not exists image_url  text;

-- מדיניות קריאה: תרגיל פומבי לכולם, פרטי רק לבעליו
drop policy if exists "drills_select_all" on public.drills;
drop policy if exists "drills_select_public_or_own" on public.drills;
create policy "drills_select_public_or_own"
  on public.drills for select
  using (is_public or created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 3) לו"ז — טווח שעות, אימון אישי, שיוך ליום/תאריך
--    (Schedule.jsx כותב date/start_time/end_time/is_personal;
--     "אימון אישי" נשמר בלי team, לכן team חייב לאפשר NULL)
-- ---------------------------------------------------------------------
alter table public.schedule_entries
  add column if not exists date        date,
  add column if not exists start_time  text,
  add column if not exists end_time    text,
  add column if not exists is_personal boolean not null default false,
  add column if not exists hour        smallint;

alter table public.schedule_entries alter column team        drop not null;
alter table public.schedule_entries alter column day_of_week drop not null;

-- ---------------------------------------------------------------------
-- 4) פגישות מאמנים (כפתור "זמן מאמן" בלו"ז) — הטבלה חסרה לגמרי
-- ---------------------------------------------------------------------
create table if not exists public.coach_meetings (
  id         uuid primary key default gen_random_uuid(),
  from_coach uuid not null references public.profiles(id) on delete cascade,
  to_coach   uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  start_time text,
  end_time   text,
  topic      text not null,
  note       text,
  status     text not null default 'pending'
             check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now()
);
alter table public.coach_meetings enable row level security;

drop policy if exists "coach_meetings_select_party" on public.coach_meetings;
drop policy if exists "coach_meetings_insert_from"  on public.coach_meetings;
drop policy if exists "coach_meetings_update_to"    on public.coach_meetings;
drop policy if exists "coach_meetings_delete_party" on public.coach_meetings;

-- שני הצדדים רואים את הפגישה
create policy "coach_meetings_select_party" on public.coach_meetings for select
  using (auth.uid() = from_coach or auth.uid() = to_coach);
-- אני מזמין מישהו אחר (לא את עצמי)
create policy "coach_meetings_insert_from" on public.coach_meetings for insert
  with check (auth.uid() = from_coach and to_coach <> from_coach);
-- הצד המוזמן מעדכן סטטוס (אישור/דחייה)
create policy "coach_meetings_update_to" on public.coach_meetings for update
  using (auth.uid() = to_coach);
-- כל צד יכול לבטל
create policy "coach_meetings_delete_party" on public.coach_meetings for delete
  using (auth.uid() = from_coach or auth.uid() = to_coach);

-- ---------------------------------------------------------------------
-- 5) מחיקת הודעה פרטית — חסרה מדיניות DELETE (המחיקה "הצליחה" בלי למחוק)
-- ---------------------------------------------------------------------
drop policy if exists "messages_delete_sender" on public.messages;
create policy "messages_delete_sender" on public.messages for delete
  to authenticated using (sender_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6) סרטוני תרגילים (עמוד מדיה → טאב סרטונים)
-- ---------------------------------------------------------------------
create table if not exists public.drill_videos (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,
  title      text not null,
  category   text,
  url        text not null,
  note       text,
  created_at timestamptz default now()
);
alter table public.drill_videos enable row level security;
drop policy if exists "drill_videos_select_all"    on public.drill_videos;
drop policy if exists "drill_videos_insert_own"    on public.drill_videos;
drop policy if exists "drill_videos_delete_own"    on public.drill_videos;
create policy "drill_videos_select_all" on public.drill_videos for select using (true);
create policy "drill_videos_insert_own" on public.drill_videos for insert with check (auth.uid() = created_by);
create policy "drill_videos_delete_own" on public.drill_videos for delete using (auth.uid() = created_by);

-- ---------------------------------------------------------------------
-- 7) לרענן את סכמת ה-API כדי שהשינויים ייכנסו לתוקף מיד
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

-- =====================================================================
--  אחרי הרצה: אם עדיין יש שגיאת "column ... does not exist" —
--  הריצו את השאילתה הבאה כדי לראות אילו עמודות באמת קיימות:
--    select table_name, column_name from information_schema.columns
--    where table_schema='public' and table_name in
--    ('profiles','drills','schedule_entries','messages') order by 1,2;
-- =====================================================================
--
--  ⚠️ להעלאת תמונות (פרופיל/תרגיל) צריך גם bucket אחסון בשם media:
--    Supabase → Storage → New bucket → name: media → Public: on
--    ואז Policies → for authenticated: INSERT + UPDATE + DELETE
--    כאשר (bucket_id = 'media').
-- =====================================================================
