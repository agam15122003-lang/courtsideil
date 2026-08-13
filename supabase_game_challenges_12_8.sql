-- =====================================================================
-- CourtSide — עולם המשחק: האתגר השבועי  ·  12.8.2026
--
-- מחזור החיים המלא: הגדרה (מראש, מהבנק) → הגשה (שחקן) → אישור (אדמין) →
-- הכרעה והכרזה (אוטומטי במוצ"ש) → ניקוד לפנקס → טופ-5 לייצוא.
--
-- ⚠ ארבע הכרעות שנראות טכניות ואינן:
--
--   1) **decide_at נפרד מ-closes_at.** החלון נסגר שבת בצהריים, אבל
--      ההכרעה היא במוצ"ש. בלי שדה נפרד, המתזמן שרץ כל רבע שעה היה
--      מכריז מנצח בשבת ב-12:15 — באמצע שבת, ובניגוד לאפיון.
--
--   2) **אישור דורש מספר גרסה.** בלעדיו האדמין מאשר סרטון שלא צפה בו:
--      השחקן מחליף קובץ ותוצאה בין הצפייה ללחיצה, וקליפ שאיש לא ראה
--      נכנס לטבלה **ולייצוא לאינסטגרם**.
--
--   3) **blocked ≠ rejected.** חסימה מסתירה את הקליפ ו**שומרת** את
--      הקובץ. תוכן שהוא באמת בלתי חוקי — משמרים ומדווחים, לא משמידים.
--
--   4) **min_entries_for_prize.** תחרות פרס עם שלושה משתתפים היא החוליה
--      המשפטית החלשה ביותר, ובמקביל טופ-5 מתוך ארבע הגשות הוא חסר
--      משמעות. פחות מהרף — תואר בלבד, בלי פרס חומרי.
--
-- אידמפוטנטי.
-- דורש: supabase_game_core_12_8.sql (38) · supabase_game_legal_12_8.sql (39)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) בדיקת תלות
-- ---------------------------------------------------------------------
do $dep$
begin
  if to_regclass('public.game_points_ledger') is null then
    raise notice '';
    raise notice '===================================================================';
    raise notice '  ✋ עצור: public.game_points_ledger לא קיימת.';
    raise notice '  הרץ קודם את supabase_game_core_12_8.sql (קובץ 38).';
    raise notice '===================================================================';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- 1) game_challenges — האתגר
-- ---------------------------------------------------------------------
create table if not exists public.game_challenges (
  id            uuid primary key default gen_random_uuid(),
  seq           int  unique,                 -- מספר סידורי בבנק (1..12) — בסיס לרצף
  slug          text unique,
  title         text not null,
  subtitle      text,

  metric_label  text not null,               -- «כמה שלשות בדקה»
  metric_unit   text,                        -- «שלשות»
  metric_dir    text not null default 'desc' check (metric_dir in ('desc', 'asc')),
  rules_text    text,                        -- ברירת מחדל מגיעה מ-game_settings

  prize            text,
  prize_value_ils  numeric(8,2),
  prize_to_guardian boolean not null default true,
  sponsor_name     text,
  sponsor_logo_path text,
  rules_url        text,

  opens_at      timestamptz,
  closes_at     timestamptz,
  decide_at     timestamptz,
  status        text not null default 'draft'
                check (status in ('draft', 'scheduled', 'open', 'closed', 'decided')),

  min_entries_for_prize int not null default 6,

  decided_at    timestamptz,
  scored_at     timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint game_chal_window   check (closes_at is null or opens_at is null or closes_at > opens_at),
  constraint game_chal_decide   check (decide_at is null or closes_at is null or decide_at >= closes_at),
  -- פרס מחייב תקנון. שער עורך הדין השני נמצא ב-game_settings.
  constraint game_chal_prize_rules check (prize is null or rules_url is not null)
);

-- אתגר פתוח אחד בלבד בכל רגע
create unique index if not exists game_chal_one_open
  on public.game_challenges ((status)) where status = 'open';
create index if not exists game_chal_status_idx on public.game_challenges (status, opens_at);

alter table public.game_challenges enable row level security;

drop policy if exists "game_chal_read"  on public.game_challenges;
drop policy if exists "game_chal_admin" on public.game_challenges;

-- שחקן רואה רק אתגר שכבר נפתח. טיוטה של אתגר עתידי היא ספוילר, וגם
-- מידע שאין שום סיבה לחשוף — הבנק כולו מתוכנן שנים קדימה.
create policy "game_chal_read" on public.game_challenges
  for select to authenticated
  using (status in ('open', 'closed', 'decided') or (select public.is_admin()));
create policy "game_chal_admin" on public.game_challenges
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 1ב) game_challenge_open — חייבת להיווצר **לפני** מדיניות ההגשות,
--     שמשתמשת בה. פונקציית SQL נבדקת בזמן היצירה, ומדיניות שמפנה
--     לפונקציה שאינה קיימת מפילה את כל הקובץ (42883 — קרה בפרוד 12.8).
--     fail-closed: אתגר שלא נמצא, שאינו פתוח, או שחלונו נגמר — סגור.
-- ---------------------------------------------------------------------
create or replace function public.game_challenge_open(p_challenge uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.status = 'open'
       and (c.opens_at  is null or now() >= c.opens_at)
       and (c.closes_at is null or now() <  c.closes_at)
      from public.game_challenges c where c.id = p_challenge), false);
$$;


-- ---------------------------------------------------------------------
-- 2) game_challenge_submissions — ההגשה
-- ---------------------------------------------------------------------
create table if not exists public.game_challenge_submissions (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.game_challenges(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,

  source        text not null default 'app' check (source in ('app', 'manual')),
  media_path    text check (media_path is null or media_path like 'challenges/%'),

  reported_score numeric(8,2) not null check (reported_score >= 0),
  approved_score numeric(8,2),

  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'blocked')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 200),

  -- הצהרות המגיש. שתיהן תנאי לייצוא, ואף אחת מהן אינה תנאי לניקוד.
  allow_publish      boolean not null default false,
  no_others_in_frame boolean not null default false,

  age_flagged   boolean not null default false,

  first_submitted_at timestamptz not null default now(),
  submitted_at       timestamptz not null default now(),   -- שובר השוויון
  version       int not null default 1,

  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),

  unique (challenge_id, user_id)
);

create index if not exists game_sub_queue_idx on public.game_challenge_submissions (challenge_id, status, submitted_at);
create index if not exists game_sub_pending_idx on public.game_challenge_submissions (status) where status = 'pending';

comment on table public.game_challenge_submissions is
  'הגשה אחת לשחקן לאתגר. החלפה מעדכנת את אותה שורה ומעלה version — '
  'ו-version הוא מה שמונע מהאדמין לאשר סרטון שהוחלף אחרי שצפה בו.';

alter table public.game_challenge_submissions enable row level security;

drop policy if exists "game_sub_select_own" on public.game_challenge_submissions;
drop policy if exists "game_sub_insert_own" on public.game_challenge_submissions;
drop policy if exists "game_sub_update_own" on public.game_challenge_submissions;
drop policy if exists "game_sub_admin"      on public.game_challenge_submissions;
drop policy if exists "game_sub_gate_ins"   on public.game_challenge_submissions;
drop policy if exists "game_sub_gate_upd"   on public.game_challenge_submissions;

-- הפיד חי (הכרעת הבעלים 13.8, אחרי שאושרו רשתות הביטחון): הגשה נראית
-- לכל השחקנים מיד, בלי שער אישור. מה שכן מסונן: נדחו/נחסמו נראות רק
-- לבעליהן ולאדמין; אתגר בטיוטה אינו נראה; וחומת ההפרדה חלה.
-- ⚠ השורה כאן חושפת שם ותוצאה בלבד — **הקובץ** מוגן בנפרד במדיניות
--   ה-Storage (game_clip_visible, קובץ 41): וידאו של קטין נראה לאחרים
--   רק אם הורהו אישר «מדיה פנימית», והחסימה שלך מסתירה מיידית.
create policy "game_sub_select_own" on public.game_challenge_submissions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "game_sub_select_feed" on public.game_challenge_submissions;
create policy "game_sub_select_feed" on public.game_challenge_submissions
  for select to authenticated
  using (
    status in ('pending', 'approved')
    and not public.game_wall_blocks()
    and exists (select 1 from public.game_challenges c
                 where c.id = challenge_id and c.status in ('open', 'closed', 'decided'))
  );

create policy "game_sub_insert_own" on public.game_challenge_submissions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.game_challenge_open(challenge_id));

-- אין החלפה אחרי אישור או חסימה
create policy "game_sub_update_own" on public.game_challenge_submissions
  for update to authenticated
  using (user_id = (select auth.uid()) and status not in ('approved', 'blocked'))
  with check (user_id = (select auth.uid()) and public.game_challenge_open(challenge_id));

create policy "game_sub_admin" on public.game_challenge_submissions
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- שער הכניסה — RESTRICTIVE, ולכן נחתך עם כל השאר ולא מתאחד ב-OR.
-- ⚠ שער נפרד ל-UPDATE הוא חובה: supabase_consent_enforcement.sql יוצר
--   שערים ל-INSERT בלבד, ומסלול «החלפת הגשה» היה עוקף אותו לגמרי.
create policy "game_sub_gate_ins" on public.game_challenge_submissions
  as restrictive for insert to authenticated
  with check (public.game_can_play());
create policy "game_sub_gate_upd" on public.game_challenge_submissions
  as restrictive for update to authenticated
  using (public.game_can_play()) with check (public.game_can_play());

-- מחיקה — רק דרך game_delete_my_submission (סעיף 5ב): היא מוחקת גם את
-- הקובץ מהמחסן וגם את הנקודות, ומסרבת אחרי הכרעה. DELETE ישיר היה
-- משאיר קובץ יתום ונקודות רפאים.
revoke delete on public.game_challenge_submissions from authenticated;


-- ---------------------------------------------------------------------
-- 3) game_challenge_results — נעול בהכרעה
--
--     ⚠ RLS חובה: הטבלה מכילה publish_ok_at_decision, כלומר מצב הסכמת
--     ההורה של קטין מזוהה. בלי מדיניות, קריאת REST אחת הייתה מחזירה
--     לכל נרשם את מצב ההסכמות של כל הילדים.
-- ---------------------------------------------------------------------
create table if not exists public.game_challenge_results (
  challenge_id uuid not null references public.game_challenges(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  place        int  not null,
  score        numeric(8,2),
  is_winner    boolean not null default false,
  publish_ok_at_decision boolean,
  decided_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.game_challenge_results enable row level security;

drop policy if exists "game_res_select_own" on public.game_challenge_results;
create policy "game_res_select_own" on public.game_challenge_results
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke insert, update, delete on public.game_challenge_results from anon, authenticated;
grant select on public.game_challenge_results to authenticated;


-- ---------------------------------------------------------------------
-- 4) עזרים
--    (game_challenge_open הועברה לסעיף 1ב — לפני המדיניות שמשתמשת בה)
-- ---------------------------------------------------------------------

-- האם הקובץ נעול לשינוי (הגשה שאושרה או נחסמה).
-- כאן ולא בסעיף 1ב: פונקציית SQL נבדקת ביצירה, והיא קוראת מטבלת
-- ההגשות — שקיימת רק מסעיף 2 והלאה.
create or replace function public.game_media_locked(p_path text, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_challenge_submissions s
     where s.media_path = p_path and s.user_id = p_owner
       and s.status in ('approved', 'blocked'));
$$;


-- ---------------------------------------------------------------------
-- 4ב) חלון ברירת המחדל — ראשון בערב עד חמישי בערב
--
--     הכרעת הבעלים (12.8): הוא מעלה אתגר **ידנית בכל שבוע** ובוחר בעצמו
--     את היום והשעה. לכן אין כאן שום תאריך קשיח — רק **ברירות מחדל
--     שיושבות בהגדרות**, וכל אחת מהן ניתנת לשינוי בלי לגעת בקוד:
--
--       update public.game_settings
--          set default_close_dow = 4, default_close_time = '20:00',   -- חמישי בערב
--              default_decide_dow = 6, default_decide_time = '20:30'; -- מוצ"ש
--
--     ‎(0=ראשון · 1=שני · 2=שלישי · 3=רביעי · 4=חמישי · 5=שישי · 6=שבת)
--
--     וגם זה רק ברירת מחדל: מסך הפרסום מאפשר לבחור תאריך ושעה חופשיים
--     לכל אתגר בנפרד, והם גוברים תמיד.
--
--     ⚠ ההכרעה כברירת מחדל היא במוצ"ש ולא ברגע הסגירה, ובכוונה: זה נותן
--     יומיים לאשר סרטונים ולערוך את הריל בלי לחץ, ומוצ"ש הוא הזמן שבו
--     אנשים באמת בטלפון. רוצה הכרזה מיד בסגירה — שווה את שני ה-dow.
-- ---------------------------------------------------------------------
alter table public.game_settings add column if not exists default_close_dow   int  not null default 4;
alter table public.game_settings add column if not exists default_close_time  time not null default '20:00';
alter table public.game_settings add column if not exists default_decide_dow  int  not null default 6;
alter table public.game_settings add column if not exists default_decide_time time not null default '20:30';

do $dw$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.game_settings'::regclass
                    and conname  = 'game_settings_dow_range') then
    alter table public.game_settings add constraint game_settings_dow_range
      check (default_close_dow between 0 and 6 and default_decide_dow between 0 and 6);
  end if;
end $dw$;

create or replace function public.game_default_window(p_from timestamptz default now())
returns table (opens_at timestamptz, closes_at timestamptz, decide_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tz text; v_loc timestamp; v_today date;
  v_cdow int; v_ctime time; v_ddow int; v_dtime time;
  v_close_d date; v_decide_d date;
  v_close timestamptz; v_decide timestamptz;
begin
  select coalesce(g.tz, 'Asia/Jerusalem'), coalesce(g.default_close_dow, 4),
         coalesce(g.default_close_time, time '20:00'), coalesce(g.default_decide_dow, 6),
         coalesce(g.default_decide_time, time '20:30')
    into v_tz, v_cdow, v_ctime, v_ddow, v_dtime
    from public.game_settings g where g.id;

  v_tz    := coalesce(v_tz, 'Asia/Jerusalem');
  v_cdow  := coalesce(v_cdow, 4);  v_ctime := coalesce(v_ctime, time '20:00');
  v_ddow  := coalesce(v_ddow, 6);  v_dtime := coalesce(v_dtime, time '20:30');

  v_loc   := p_from at time zone v_tz;
  v_today := v_loc::date;

  -- יום הסגירה הקרוב; אם הוא היום והשעה כבר עברה — השבוע הבא
  v_close_d := v_today + ((v_cdow - extract(dow from v_today)::int + 7) % 7);
  if v_close_d = v_today and v_loc::time >= v_ctime then
    v_close_d := v_close_d + 7;
  end if;

  -- יום ההכרעה — היום הראשון מסוגו **אחרי** יום הסגירה (0 = אותו יום)
  v_decide_d := v_close_d + ((v_ddow - extract(dow from v_close_d)::int + 7) % 7);

  v_close  := (v_close_d  + v_ctime) at time zone v_tz;
  v_decide := (v_decide_d + v_dtime) at time zone v_tz;

  -- אותו יום ושעה מוקדמת יותר — ההכרעה נדחפת לרגע הסגירה, אחרת
  -- ה-CHECK על decide_at >= closes_at היה מפיל את הפרסום.
  if v_decide < v_close then v_decide := v_close; end if;

  return query select p_from, v_close, v_decide;
end;
$$;


-- ---------------------------------------------------------------------
-- 4ג) game_open_challenge — פרסום ידני, לחיצה אחת
--
--     האתגרים נשמרים כטיוטה בבנק, והבעלים בוחר מהם ומפרסם בכל ראשון.
--     הבנק אינו לוח זמנים — הוא ספרייה: הוא שומר על «עשר דקות בראשון»
--     במקום «לכתוב אתגר מאפס», ומשאיר את ההחלטה מה מתאים השבוע אצלו.
-- ---------------------------------------------------------------------
create or replace function public.game_open_challenge(
  p_challenge uuid,
  p_opens     timestamptz default null,
  p_closes    timestamptz default null,
  p_decide    timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare w record; v_open uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into w from public.game_default_window(coalesce(p_opens, now()));

  -- אתגר פתוח קודם נסגר — האינדקס מרשה אחד בלבד, ועדיף לסגור מסודר
  -- מאשר להחזיר שגיאה שהבעלים צריך לפענח בערב ראשון.
  select id into v_open from public.game_challenges where status = 'open' and id <> p_challenge;
  if v_open is not null then
    update public.game_challenges set status = 'closed' where id = v_open;
  end if;

  update public.game_challenges
     set status    = 'open',
         opens_at  = coalesce(p_opens,  w.opens_at),
         closes_at = coalesce(p_closes, w.closes_at),
         decide_at = coalesce(p_decide, w.decide_at)
   where id = p_challenge;

  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  return jsonb_build_object('ok', true,
    'closes_at', coalesce(p_closes, w.closes_at),
    'decide_at', coalesce(p_decide, w.decide_at),
    'closed_previous', v_open is not null);
end;
$$;


-- ---------------------------------------------------------------------
-- 4ד) game_reschedule_challenge — שינוי תאריכים **תוך כדי**
--
--     דרישת הבעלים: לבחור יום, שעה ומועד הכרזה, ולשנות אותם גם אחרי
--     שהאתגר כבר רץ. שולחים רק את מה שרוצים לשנות; NULL = «אל תיגע».
--
--     ⚠ למה RPC ולא UPDATE ישיר מהמסך: שינוי תאריכים באתגר חי הוא בדיוק
--     המקום שבו נוצרות סתירות (סגירה לפני פתיחה, הכרזה לפני סגירה,
--     הארכה של אתגר שכבר הוכרע). כאן זה נבדק פעם אחת, ומוחזרת הודעה
--     בעברית במקום שגיאת CHECK שאיש לא מבין.
-- ---------------------------------------------------------------------
create or replace function public.game_reschedule_challenge(
  p_challenge uuid,
  p_opens     timestamptz default null,
  p_closes    timestamptz default null,
  p_decide    timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c record; v_o timestamptz; v_c timestamptz; v_d timestamptz;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into c from public.game_challenges where id = p_challenge for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_o := coalesce(p_opens,  c.opens_at);
  v_c := coalesce(p_closes, c.closes_at);
  v_d := coalesce(p_decide, c.decide_at);

  if v_o is not null and v_c is not null and v_c <= v_o then
    return jsonb_build_object('ok', false, 'reason', 'closes_before_opens',
      'message', 'מועד הסגירה חייב להיות אחרי מועד הפתיחה.');
  end if;
  if v_c is not null and v_d is not null and v_d < v_c then
    return jsonb_build_object('ok', false, 'reason', 'decide_before_closes',
      'message', 'מועד ההכרזה לא יכול להיות לפני מועד הסגירה.');
  end if;

  -- אתגר שכבר הוכרע: הארכה תבלבל את מי שכבר ראה מנצח. נדרשת הכרעה
  -- חוזרת מפורשת (game_decide_challenge עם p_redecide), שגם מתועדת.
  if c.status = 'decided' then
    return jsonb_build_object('ok', false, 'reason', 'already_decided',
      'message', 'האתגר כבר הוכרע. להארכה — בטל את ההכרעה תחילה.');
  end if;

  update public.game_challenges
     set opens_at = v_o, closes_at = v_c, decide_at = v_d,
         -- הארכה של אתגר שנסגר מחזירה אותו לאוויר, וזה בדיוק מה שרוצים
         -- כשמאריכים בגלל מזג אוויר או חג.
         status = case when c.status = 'closed' and v_c > now() then 'open' else c.status end
   where id = p_challenge;

  return jsonb_build_object('ok', true, 'opens_at', v_o, 'closes_at', v_c, 'decide_at', v_d,
    'reopened', c.status = 'closed' and v_c > now());
end;
$$;


-- ---------------------------------------------------------------------
-- 5) שומר ההגשה — כופה את מה שהשחקן לא אמור לקבוע
-- ---------------------------------------------------------------------
create or replace function public.game_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_admin boolean;
begin
  v_admin := coalesce(public.is_admin(), false);
  if v_admin then return new; end if;

  new.user_id        := auth.uid();
  new.status         := 'pending';
  new.approved_score := null;
  new.reviewed_by    := null;
  new.reviewed_at    := null;
  new.source         := 'app';
  new.submitted_at   := now();

  if tg_op = 'INSERT' then
    new.first_submitted_at := now();
    new.version := 1;
  else
    new.first_submitted_at := old.first_submitted_at;
    new.challenge_id       := old.challenge_id;
    new.version            := old.version + 1;
    -- ⚠ רף גרסאות: בלעדיו אפשר לדחוף עשרות קבצים בלילה אחד, וכל אחד
    --   מהם עולה אחסון ותור אישור. חמש הגשות הן יותר מדי בפועל.
    if new.version > 5 then
      raise exception 'הגעת למספר ההגשות המרבי לאתגר הזה (5). ההגשה האחרונה שלך נשמרה.'
        using errcode = '54000';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists game_submissions_guard_trg on public.game_challenge_submissions;
create trigger game_submissions_guard_trg
  before insert or update on public.game_challenge_submissions
  for each row execute function public.game_submissions_guard();


-- ---------------------------------------------------------------------
-- 5ב) מחיקת הגשה בידי השחקן — «התחרטתי»
--
--     RPC ולא DELETE ישיר: המחיקה חייבת לגרור איתה את הקובץ מהמחסן
--     ואת הנקודות מהפנקס, ולסרב אחרי שהאתגר הוכרע — תוצאות שפורסמו
--     אינן משתנות למפרע כי מישהו התחרט.
-- ---------------------------------------------------------------------
create or replace function public.game_delete_my_submission(p_challenge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record; c record;
begin
  select * into s from public.game_challenge_submissions
   where challenge_id = p_challenge and user_id = auth.uid() for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  select * into c from public.game_challenges where id = p_challenge;
  if c.status = 'decided' then
    return jsonb_build_object('ok', false, 'reason', 'decided',
      'message', 'האתגר כבר הוכרע — התוצאות סופיות ואי אפשר למחוק.');
  end if;
  if s.status = 'blocked' then
    -- קליפ חסום נשמר כראיה. מחיקתו — רק דרך האדמין.
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;

  if s.media_path is not null then
    delete from storage.objects where bucket_id = 'media' and name = s.media_path;
  end if;
  delete from public.game_challenge_submissions where id = s.id;
  -- הניקוד מתעדכן דרך טריגר ה-rescore (סעיף 5ג)

  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------
-- 5ג) ניקוד חי — כל שינוי בהגשות מחשב מחדש את האתגר
--
--     בלי שער אישור אין רגע «אישור» שמפעיל ניקוד, ולכן הטריגר. הוא
--     בטוח לריצה מרובה (מחק-בטווח-וכתוב-מחדש + נעילה), והנפח בפיילוט
--     זעיר. AFTER, כדי שהחישוב יראה את המצב החדש.
-- ---------------------------------------------------------------------
create or replace function public.game_rescore_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.game_score_challenge(coalesce(new.challenge_id, old.challenge_id));
  return null;
end;
$$;

drop trigger if exists game_rescore_trg on public.game_challenge_submissions;
create trigger game_rescore_trg
  after insert or update or delete on public.game_challenge_submissions
  for each row execute function public.game_rescore_on_change();


-- ---------------------------------------------------------------------
-- 6) game_score_challenge — כותבת לפנקס
--
--     דפוס מחק-בטווח-וכתוב-מחדש: רק מחיקה פותרת שורה שצריכה **להיעלם**
--     (הגשה שאושרה ואז נדחתה). upsert היה משאיר אותה שם לנצח.
-- ---------------------------------------------------------------------
create or replace function public.game_score_challenge(p_challenge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c            record;
  v_n          int;
  v_top5_min   int;
  v_month text; v_season text; v_day date;
  v_part int; v_top int; v_win int;
begin
  -- ⚠ בכוונה בלי בדיקת אדמין: אין ללקוח grant execute (רק revoke),
  --   והפונקציה מופעלת מטריגר ה-rescore שנורה גם מפעולת שחקן.
  --   בדיקת אדמין כאן הייתה משתיקה את הניקוד החי בדיוק כשצריך אותו.

  select * into c from public.game_challenges where id = p_challenge;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_challenge'); end if;

  -- נעילה: שתי הרצות במקביל (המתזמן + לחיצה ידנית) לא יכפילו נקודות
  perform pg_advisory_xact_lock(hashtext('game_score_chal:' || p_challenge::text));

  select k.d, k.month, k.season into v_day, v_month, v_season
    from public.game_period_keys(coalesce(c.closes_at, now())) k;

  select count(*) into v_n from public.game_challenge_submissions
   where challenge_id = p_challenge and status in ('pending', 'approved');

  select coalesce(min_entries, 8) into v_top5_min
    from public.game_scoring_rules where key = 'chal_top5';

  v_part := public.game_points('chal_participate', 15);
  v_top  := public.game_points('chal_top5', 15);
  v_win  := public.game_points('chal_win', 40);

  delete from public.game_points_ledger
   where scope = 'challenge' and ref_challenge = p_challenge;

  with ranked as (
    select s.user_id,
           coalesce(s.approved_score, s.reported_score) as score,
           row_number() over (
             order by case when c.metric_dir = 'desc'
                           then -coalesce(s.approved_score, s.reported_score)
                           else  coalesce(s.approved_score, s.reported_score) end asc,
                      s.submitted_at asc) as place
      from public.game_challenge_submissions s
     where s.challenge_id = p_challenge and s.status in ('pending', 'approved')
  ),
  rows_to_write as (
    -- השתתפות
    select user_id, 'part:' || p_challenge::text as source_key, 'chal_participate' as rule_key,
           v_part as points, 'הגשה מאושרת באתגר: ' || c.title as reason
      from ranked
    union all
    -- טופ-5, רק מעל הרף
    select user_id, 'top5:' || p_challenge::text, 'chal_top5', v_top,
           'מקום ' || place || ' באתגר: ' || c.title
      from ranked where place <= 5 and v_n >= v_top5_min
    union all
    -- ניצחון
    select user_id, 'win:' || p_challenge::text, 'chal_win', v_win,
           'ניצחון באתגר: ' || c.title
      from ranked where place = 1
  )
  insert into public.game_points_ledger
    (user_id, scope, source_key, rule_key, points, reason,
     occurred_at, occurred_on, period_month, period_season, ref_challenge)
  select user_id, 'challenge', source_key, rule_key, points, reason,
         coalesce(c.closes_at, now()), v_day, v_month, v_season, p_challenge
    from rows_to_write;

  update public.game_challenges set scored_at = now() where id = p_challenge;

  -- הרצף נבדק בחלון ולא נקודתית: דחייה באתגר 5 חייבת למחוק גם את שורת
  -- הרצף של אתגר 7, אחרת הפנקס טוען שיש רצף שאין.
  if c.seq is not null then
    perform public.game_score_streaks(c.seq, c.seq + 2);
  end if;

  return jsonb_build_object('ok', true, 'approved', v_n, 'top5_counted', v_n >= v_top5_min);
end;
$$;


-- ---------------------------------------------------------------------
-- 7) game_score_streaks — שלושה אתגרים ברצף עם הגשה מאושרת
-- ---------------------------------------------------------------------
create or replace function public.game_score_streaks(p_from_seq int, p_to_seq int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_pts int; v_month text; v_season text; v_day date;
begin
  v_pts := public.game_points('chal_streak3', 15);

  for r in
    select c.id, c.seq, c.title, c.closes_at
      from public.game_challenges c
     where c.seq between p_from_seq and p_to_seq
     order by c.seq
  loop
    select k.d, k.month, k.season into v_day, v_month, v_season
      from public.game_period_keys(coalesce(r.closes_at, now())) k;

    delete from public.game_points_ledger
     where scope = 'challenge' and source_key = 'streak:' || r.seq::text;

    insert into public.game_points_ledger
      (user_id, scope, source_key, rule_key, points, reason,
       occurred_at, occurred_on, period_month, period_season, ref_challenge)
    select s.user_id, 'challenge', 'streak:' || r.seq::text, 'chal_streak3', v_pts,
           'שלושה אתגרים ברצף', coalesce(r.closes_at, now()), v_day, v_month, v_season, r.id
      from public.game_challenge_submissions s
      join public.game_challenges c2 on c2.id = s.challenge_id and c2.seq = r.seq
     where s.status in ('pending', 'approved')
       and exists (select 1 from public.game_challenge_submissions s1
                     join public.game_challenges c1 on c1.id = s1.challenge_id
                    where c1.seq = r.seq - 1 and s1.user_id = s.user_id and s1.status in ('pending', 'approved'))
       and exists (select 1 from public.game_challenge_submissions s2
                     join public.game_challenges c0 on c0.id = s2.challenge_id
                    where c0.seq = r.seq - 2 and s2.user_id = s.user_id and s2.status in ('pending', 'approved'));
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 8) game_review_submission — תור האישור
-- ---------------------------------------------------------------------
create or replace function public.game_review_submission(
  p_id      uuid,
  p_version int,
  p_action  text,
  p_score   numeric default null,
  p_reason  text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;
  if p_action not in ('approve', 'reject', 'block', 'flag_age') then
    return jsonb_build_object('ok', false, 'reason', 'bad_action');
  end if;

  select * into s from public.game_challenge_submissions where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  -- ⚠ הבדיקה שמונעת אישור של סרטון שלא נצפה: השחקן החליף קובץ ותוצאה
  --   בין הרגע שפתחת את הנגן לרגע שלחצת «אשר».
  if p_version is not null and s.version is distinct from p_version then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'version', s.version);
  end if;

  if p_action = 'flag_age' then
    update public.game_challenge_submissions
       set age_flagged = true, status = 'pending', reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;
    begin
      insert into public.admin_requests (user_id, kind, message)
      values (s.user_id, 'age_correction',
              'סומן מתור האתגר: נראה צעיר מהגיל המוצהר. יש לאמת גיל לפני פרסום.');
    exception when others then null;
    end;
    return jsonb_build_object('ok', true, 'status', 'flagged');
  end if;

  if p_action = 'approve' then
    update public.game_challenge_submissions
       set status = 'approved',
           approved_score = coalesce(p_score, s.reported_score),
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;
  elsif p_action = 'reject' then
    update public.game_challenge_submissions
       set status = 'rejected', reject_reason = p_reason,
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;
  else -- block: מסתיר, **שומר את הקובץ**
    update public.game_challenge_submissions
       set status = 'blocked', reject_reason = p_reason,
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;
  end if;

  -- ניקוד מחדש מיידי — אחרת הטבלה משקרת עד ההכרעה
  perform public.game_score_challenge(s.challenge_id);

  return jsonb_build_object('ok', true, 'status', p_action);
end;
$$;


-- ---------------------------------------------------------------------
-- 9) game_decide_challenge — ההכרעה וההכרזה
-- ---------------------------------------------------------------------
create or replace function public.game_decide_challenge(p_challenge uuid, p_redecide boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c record; v_winner uuid; v_n int;
begin
  if auth.uid() is not null and not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into c from public.game_challenges where id = p_challenge for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if c.status = 'decided' and not p_redecide then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  if c.status = 'decided' and p_redecide then
    begin
      insert into public.audit_log (actor, action, entity, entity_id, details)
      values (auth.uid(), 'redecide', 'game_challenges', p_challenge,
              jsonb_build_object('title', c.title, 'was_decided_at', c.decided_at));
    exception when others then null;
    end;
  end if;

  perform public.game_score_challenge(p_challenge);

  delete from public.game_challenge_results where challenge_id = p_challenge;

  insert into public.game_challenge_results
    (challenge_id, user_id, place, score, is_winner, publish_ok_at_decision)
  select p_challenge, s.user_id,
         row_number() over (
           order by case when c.metric_dir = 'desc'
                         then -coalesce(s.approved_score, s.reported_score)
                         else  coalesce(s.approved_score, s.reported_score) end asc,
                    s.submitted_at asc),
         coalesce(s.approved_score, s.reported_score),
         false,
         public.game_publish_ok(s.user_id)
    from public.game_challenge_submissions s
   where s.challenge_id = p_challenge and s.status in ('pending', 'approved');

  update public.game_challenge_results set is_winner = true
   where challenge_id = p_challenge and place = 1;

  select user_id into v_winner from public.game_challenge_results
   where challenge_id = p_challenge and place = 1;
  select count(*) into v_n from public.game_challenge_results where challenge_id = p_challenge;

  if v_winner is not null then
    insert into public.game_awards (user_id, award_kind, award_key, period_key, scope, ref_id)
    values (v_winner, 'title', 'challenge_champion', p_challenge::text, 'challenge', p_challenge)
    on conflict (user_id, award_key, period_key) do nothing;
  end if;

  update public.game_challenges
     set status = 'decided', decided_at = now() where id = p_challenge;

  return jsonb_build_object('ok', true, 'entries', v_n, 'has_winner', v_winner is not null);
end;
$$;


-- ---------------------------------------------------------------------
-- 10) game_challenge_top5 — הרשימה לייצוא
--
--     ⚠ can_publish נבדק **חי** ולא מהתצלום הקפוא: הורה רשאי לחזור בו
--     גם אחרי ההכרעה, ורגע האמת הוא רגע ההורדה.
-- ---------------------------------------------------------------------
create or replace function public.game_challenge_top5(p_challenge uuid)
returns table (
  place int, user_id uuid, display_name text, score numeric,
  media_path text, can_publish boolean, publish_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then return; end if;

  return query
  select r.place, r.user_id, public.game_display_name(r.user_id), r.score,
         s.media_path,
         (s.allow_publish and s.no_others_in_frame and public.game_publish_ok(r.user_id)),
         case
           when not s.allow_publish      then 'submitter_opted_out'
           when not s.no_others_in_frame then 'others_in_frame_not_declared'
           else public.game_publish_reason(r.user_id)
         end
    from public.game_challenge_results r
    join public.game_challenge_submissions s
      on s.challenge_id = r.challenge_id and s.user_id = r.user_id
   where r.challenge_id = p_challenge and r.place <= 5
   order by r.place;
end;
$$;


-- ---------------------------------------------------------------------
-- 11) הרשאות
-- ---------------------------------------------------------------------
revoke all on function public.game_default_window(timestamptz)                 from public, anon;
revoke all on function public.game_open_challenge(uuid,timestamptz,timestamptz,timestamptz)       from public, anon;
revoke all on function public.game_reschedule_challenge(uuid,timestamptz,timestamptz,timestamptz) from public, anon;
grant execute on function public.game_default_window(timestamptz)                 to authenticated;
grant execute on function public.game_open_challenge(uuid,timestamptz,timestamptz,timestamptz)       to authenticated;
grant execute on function public.game_reschedule_challenge(uuid,timestamptz,timestamptz,timestamptz) to authenticated;

revoke all on function public.game_challenge_open(uuid)                        from public, anon;
revoke all on function public.game_media_locked(text, uuid)                    from public, anon;
revoke all on function public.game_delete_my_submission(uuid)                  from public, anon;
grant  execute on function public.game_delete_my_submission(uuid)              to authenticated;
revoke all on function public.game_rescore_on_change()                         from public, anon, authenticated;
revoke all on function public.game_submissions_guard()                         from public, anon, authenticated;
revoke all on function public.game_score_challenge(uuid)                       from public, anon, authenticated;
revoke all on function public.game_score_streaks(int, int)                     from public, anon, authenticated;
revoke all on function public.game_review_submission(uuid,int,text,numeric,text) from public, anon;
revoke all on function public.game_decide_challenge(uuid, boolean)             from public, anon;
revoke all on function public.game_challenge_top5(uuid)                        from public, anon;

grant execute on function public.game_challenge_open(uuid)                        to authenticated;
grant execute on function public.game_media_locked(text, uuid)                    to authenticated;
grant execute on function public.game_review_submission(uuid,int,text,numeric,text) to authenticated;
grant execute on function public.game_decide_challenge(uuid, boolean)             to authenticated;
grant execute on function public.game_challenge_top5(uuid)                        to authenticated;


-- ---------------------------------------------------------------------
-- 12) בנק הפתיחה — שישה אתגרים מהאפיון, כולם **טיוטה**
--
--     נשמרים כ-draft בכוונה: שחקן אינו רואה טיוטה (ראה המדיניות בסעיף 1),
--     והבעלים עובר עליהם, מתקן ניסוח, ורק אז מתזמן. ששת הנותרים מגיעים
--     אחרי אישור הבעלים על גיליון האתגרים.
-- ---------------------------------------------------------------------
insert into public.game_challenges (seq, slug, title, metric_label, metric_unit, metric_dir, subtitle)
values
  (1, 'three-point-minute', 'מטר של שלשות', 'כמה שלשות בדקה', 'שלשות', 'desc',
      'דקה על השעון, מכל נקודה מאחורי הקשת'),
  (2, 'free-throw-line',    'קו העונשין',   'כמה מתוך 20 נכנסו', 'קליעות', 'desc',
      'עשרים זריקות עונשין ברצף'),
  (3, 'five-spots',         'חמש עמדות',    'כמה סבבים ב-90 שניות', 'סבבים', 'desc',
      'חמש עמדות מסומנות, תשעים שניות על השעון'),
  (4, 'fire-eights',        'שמיניות אש',   'כמה העברות ב-30 שניות', 'העברות', 'desc',
      'בין הרגליים, בלי לאבד כדור'),
  (5, 'board-king',         'מלך הלוח',     'כמה נגיעות ב-30 שניות', 'נגיעות', 'desc',
      'טיפ-אין רצוף על הלוח'),
  (6, 'passing-wall',       'קיר המסירות',  'כמה מסירות ב-45 שניות', 'מסירות', 'desc',
      'מסירות חזה לקיר ממרחק שני מטר')
on conflict (seq) do nothing;


-- ---------------------------------------------------------------------
-- רישום
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_game_challenges_12_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) בנק הפתיחה נטען, וכולם טיוטה:
--       select seq, title, status from public.game_challenges order by seq;
--     שש שורות, כולן 'draft'.
--
--  2) שחקן אינו רואה טיוטה — **מחשבון שחקן בדפדפן**, לא מכאן:
--       select count(*) from public.game_challenges;
--     חייב להחזיר 0 כל עוד אין אתגר פתוח.
--
--  3) אתגר פתוח אחד בלבד:
--       update public.game_challenges set status='open' where seq=1;
--       update public.game_challenges set status='open' where seq=2;
--     השנייה **חייבת להיכשל** על game_chal_one_open.
--       update public.game_challenges set status='draft' where seq in (1,2);
--
--  4) פרס בלי תקנון נדחה:
--       update public.game_challenges set prize='כדור' where seq=1;
--     חייב להיכשל על game_chal_prize_rules.
--
--  5) הרצה חוזרת של הקובץ כולו — חייבת לעבור נקי.
-- =====================================================================
