-- =====================================================================
-- CourtSide — צ'ק-אין בוקר לשחקן (פיילוט נערים א׳) · 4.9.2026
-- =====================================================================
-- מה זה: שלוש שאלות בוקר (שינה / אנרגיה / גוף) שהשחקן עונה בטלפון,
-- והמאמן רואה רצועת «מוכנות היום» בבית + דגלים אדומים ב«דברים לביצוע».
-- בלי טקסט חופשי. שמירה 90 יום. מוצג רק אצל המאמן ואצל השחקן עצמו —
-- לא בתיק השחקן ולא בדוח המודפס.
--
-- בטוח להרצה חוזרת (אידמפוטנטי). הרץ אחרי #44 (supabase_coach_only_22_8.sql)
-- ו-#45 (supabase_roster_link_merge_3_9.sql). ראו הרצת_SQL_4.9.md.
--
-- ⚠ תלות (כולן כבר בייצור):
--   public.is_on_coach_roster(uuid, text)  — supabase_practice_rsvp.sql
--   public.is_active_user() / is_banned()  — supabase_parent_consent.sql /
--                                            supabase_rls_hardening_3_8.sql
--   public.retention_policy (key,days,...) — supabase_audit_retention.sql
--   public.mark_migration(text)            — supabase_migrations_ledger.sql
--
-- הלקוח שורד פרוד בלי הקובץ הזה: הכרטיס אצל השחקן והרצועה אצל המאמן
-- פשוט לא מרונדרים (שגיאת 42P01/PGRST205 נבלעת בשקט — דפוס HomeRsvp).
-- =====================================================================

-- ---------- 1. הטבלה ----------
create table if not exists public.player_checkins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.profiles(id) on delete cascade,      -- דיווח עצמי
  roster_id uuid references public.team_players(id) on delete cascade,  -- רשם המאמן (ילד בלי חשבון; אין UI כרגע, המקום שמור)
  coach_id uuid not null references auth.users(id) on delete cascade,
  team text not null,
  checkin_date date not null,                 -- לפי שעון ישראל (localDate בלקוח, לא toISOString)
  source text not null default 'player' check (source in ('player','coach')),
  sleep_bucket smallint check (sleep_bucket between 0 and 5),  -- 0:<6 · 1:6-7 · 2:7-8 · 3:8-9 · 4:9-10 · 5:10+
  energy smallint check (energy between 1 and 5),              -- 1 גמור … 5 מלא אנרגיה
  body smallint check (body between 1 and 3),                  -- 1 בסדר · 2 קצת תפוס · 3 כואב
  pain_area text[] check (pain_area <@ array['knee','ankle_foot','back','shoulder_arm','head','other']),
  pain_blocks boolean,                        -- «מפריע לשחק?» (רק כש-body=3)
  sick boolean not null default false,        -- «אני חולה היום»
  fill_ms integer,                            -- זמן מילוי מרינדור ראשון עד תשובה שלישית (מדד פיילוט)
  coach_ack_at timestamptz, coach_ack_by uuid,   -- «ראיתי»
  handled_at timestamptz, handled_by uuid,       -- «דיברתי איתו» (דגל אדום)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pc_who_chk check (player_id is not null or roster_id is not null),
  constraint pc_src_chk check ((source = 'player' and player_id is not null)
                            or (source = 'coach' and roster_id is not null))
);

-- ייחודיות: דיווח אחד לילד ליום. אינדקסים חלקיים כי כל שורה נושאת רק
-- אחד משני המזהים. ⚠ ללקוח: אי אפשר upsert עם on_conflict על אינדקס
-- חלקי דרך PostgREST — הלקוח עושה insert, ועל 23505 עובר ל-update.
create unique index if not exists pc_player_day on public.player_checkins (player_id, checkin_date) where player_id is not null;
create unique index if not exists pc_roster_day on public.player_checkins (roster_id, checkin_date) where roster_id is not null;
create index if not exists pc_coach_day on public.player_checkins (coach_id, team, checkin_date desc);

-- updated_at — אין טריגר גנרי בפרויקט (נבדק 4.9), לכן פונקציה מקומית קטנה
create or replace function public.checkins_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists checkins_touch_trg on public.player_checkins;
create trigger checkins_touch_trg before update on public.player_checkins
  for each row execute function public.checkins_touch();

-- ---------- 2. כיבוי לילד בודד (ההורה ביקש «בלי שאלות») ----------
alter table public.team_players add column if not exists wellness_off boolean not null default false;

-- ---------- 2ב. «עוזר מאמן» — תג תפקיד על הקבוצה (תצוגה בלבד) ----------
-- team_iba היא שורת ההגדרות היחידה שיש לכל (מאמן, קבוצה) — pk (coach_id, team),
-- מדיניות "_own" קיימת. עמודה ולא טבלה חדשה; שורה בלי קישור ליגה תקינה
-- (league_id נשאר ריק והקוד הקיים מתייחס אליה כ«לא מקושרת»).
alter table public.team_iba add column if not exists coach_role text
  check (coach_role is null or coach_role in ('head', 'assistant'));

-- ---------- 3. RLS ----------
alter table public.player_checkins enable row level security;

-- השחקן: קורא/כותב רק את שלו, רק כשהוא באמת בסגל של המאמן, ורק אם
-- שורת הסגל שלו לא כובתה (wellness_off — ההורה ביקש בלי שאלות).
drop policy if exists pc_player_own on public.player_checkins;
create policy pc_player_own on public.player_checkins
  for all to authenticated
  using (player_id = auth.uid() and source = 'player')
  with check (
    player_id = auth.uid() and source = 'player'
    and roster_id is null  -- 4.9 — שורת שחקן לא נושאת מזהה סגל (זה נתיב המאמן בלבד)
    and public.is_on_coach_roster(coach_id, team)
    and not exists (
      select 1 from public.team_players tp
      where tp.player_id = auth.uid()
        and tp.coach_id = player_checkins.coach_id
        and tp.team = player_checkins.team
        and tp.wellness_off
    )
  );

-- 4.9 — עמודות המאמן («ראיתי»/«דיברתי איתו») מוגנות ברמת ההרשאות: בלי זה
-- שחקן יכול, בקריאת API ידנית, לסמן coach_ack/handled על השורה של עצמו —
-- והדגל האדום שלו נעלם מ«דברים לביצוע» לפני שהמאמן ראה. פונקציות המאמן
-- (ack/handle) הן security definer ולכן לא נפגעות. INSERT מוגבל באותה דרך
-- כדי שאי אפשר יהיה להכניס שורה כבר-«מטופלת». id/תאריכים נקבעים ב-default.
revoke insert, update on public.player_checkins from authenticated;
grant insert (player_id, roster_id, coach_id, team, checkin_date, source,
              sleep_bucket, energy, body, pain_area, pain_blocks, sick, fill_ms)
  on public.player_checkins to authenticated;
grant update (sleep_bucket, energy, body, pain_area, pain_blocks, sick, fill_ms)
  on public.player_checkins to authenticated;

-- המאמן: קורא את כל מה שדווח אצלו; כותב רק שורות «רשם המאמן» על שורת סגל שלו
drop policy if exists pc_coach_read on public.player_checkins;
create policy pc_coach_read on public.player_checkins
  for select to authenticated using (coach_id = auth.uid());

drop policy if exists pc_coach_write on public.player_checkins;
create policy pc_coach_write on public.player_checkins
  for all to authenticated
  using (source = 'coach' and coach_id = auth.uid())
  with check (
    source = 'coach' and coach_id = auth.uid()
    and player_id is null  -- 4.9 — שורת מאמן לא נושאת חשבון שחקן (הצד ההפוך של pc_player_own)
    and exists (select 1 from public.team_players tp
                where tp.id = roster_id and tp.coach_id = auth.uid())
  );

-- שער ההסכמה — אותה מדיניות RESTRICTIVE בדיוק כמו בכל טבלאות התוכן
-- (supabase_consent_enforcement.sql): קטין שממתין להורה / חשבון חסום לא כותב.
drop policy if exists player_checkins_active_gate on public.player_checkins;
create policy player_checkins_active_gate on public.player_checkins
  as restrictive for insert to authenticated
  with check (public.is_active_user() and not public.is_banned());

-- ---------- 4. פונקציות למאמן (security definer — עוקפות את RLS בכוונה:
--             למאמן אין מדיניות UPDATE על שורות שהשחקן כתב) ----------

-- «ראיתי את כולם» — מסמן ראיתי רק על השורות **התקינות** (לא חולה, לא כאב
-- שמפריע, לא שינה קצרה). שורה מסומנת (צהובה/אדומה) נסגרת רק בטאפ פרטני.
create or replace function public.ack_checkins(p_team text, p_date date)
returns setof uuid
language sql security definer set search_path = public as $$
  update public.player_checkins
     set coach_ack_at = now(), coach_ack_by = auth.uid()
   where coach_id = auth.uid() and team = p_team and checkin_date = p_date
     and coach_ack_at is null and player_id is not null
     and sick = false
     and pain_blocks is not true
     and coalesce(sleep_bucket, 5) > 1
  returning player_id;
$$;
revoke all on function public.ack_checkins(text, date) from public, anon;
grant execute on function public.ack_checkins(text, date) to authenticated;

-- «ראיתי» על שורה אחת (שורות מסומנות בגיליון המוכנות)
create or replace function public.ack_checkin(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.player_checkins
     set coach_ack_at = now(), coach_ack_by = auth.uid()
   where id = p_id and coach_id = auth.uid();
$$;
revoke all on function public.ack_checkin(uuid) from public, anon;
grant execute on function public.ack_checkin(uuid) to authenticated;

-- «דיברתי איתו» — סוגר דגל אדום (כאב שמפריע / חולה) ב«דברים לביצוע»
create or replace function public.handle_checkin(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.player_checkins
     set handled_at = now(), handled_by = auth.uid()
   where id = p_id and coach_id = auth.uid();
$$;
revoke all on function public.handle_checkin(uuid) from public, anon;
grant execute on function public.handle_checkin(uuid) to authenticated;

-- «מחק את התשובות שלי» — זכות מחיקה של השחקן (המדיניות pc_player_own
-- ממילא מתירה delete; הפונקציה קיימת כדי שמחיקה גורפת תהיה קריאה אחת)
create or replace function public.delete_my_checkins()
returns void
language sql security definer set search_path = public as $$
  delete from public.player_checkins where player_id = auth.uid();
$$;
revoke all on function public.delete_my_checkins() from public, anon;
grant execute on function public.delete_my_checkins() to authenticated;

-- ---------- 5. שמירה 90 יום ----------
-- שורת מדיניות + פונקציית ניקוי **עצמאית** — לא עריכה של purge_expired_data:
-- עריכת פונקציה של מיגרציה קודמת נדרסת בהרצה חוזרת שלה (אותו נימוק
-- והדפוס בדיוק כמו game_purge_videos ב-supabase_game_media_12_8.sql).
-- יבשה כברירת מחדל; הרצה בפועל ידנית, פעם בחודש (ראו הרצת_SQL_4.9.md).
do $ret$
begin
  if to_regclass('public.retention_policy') is not null then
    insert into public.retention_policy (key, days, method, what, note)
    values ('player_checkins', 90, 'delete',
            'דיווחי צ''ק-אין בוקר של שחקנים (שינה/אנרגיה/גוף/חולה)',
            'מידע בריאותי של קטינים — חלון קצר במכוון. מופעל ידנית דרך checkins_purge(false), יבש כברירת מחדל עד אישור עו"ד.')
    on conflict (key) do nothing;
  end if;
exception when others then
  raise notice 'ℹ רישום מפתח הרטנשן דולג: %', sqlerrm;
end $ret$;

create or replace function public.checkins_purge(p_dry boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_days int := 90;
  v_n int;
begin
  if auth.uid() is not null and not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;
  -- החלון נקרא מטבלת המדיניות — תיקון של עורך הדין הוא update שם, לא כאן
  begin
    select days into v_days from public.retention_policy where key = 'player_checkins';
  exception when undefined_table then null; end;
  v_days := coalesce(v_days, 90);

  select count(*) into v_n from public.player_checkins
   where checkin_date < current_date - v_days;

  if p_dry then
    return jsonb_build_object('ok', true, 'dry', true, 'days', v_days, 'would_delete', v_n);
  end if;

  delete from public.player_checkins where checkin_date < current_date - v_days;
  return jsonb_build_object('ok', true, 'dry', false, 'days', v_days, 'deleted', v_n);
end;
$$;
revoke all on function public.checkins_purge(boolean) from public, anon;
grant execute on function public.checkins_purge(boolean) to authenticated;

-- ---------- רישום + רענון ----------
do $mig$ begin perform public.mark_migration('supabase_checkins_4_9.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';

-- =====================================================================
-- ביטול (אם צריך): מכבה את הפיצ'ר בלי למחוק דיווחים —
--   drop policy if exists pc_player_own on public.player_checkins;
-- (השחקנים לא יכולים יותר לכתוב/לקרוא; המאמן עדיין רואה מה שנאסף.)
-- מחיקה מלאה:
--   drop table if exists public.player_checkins cascade;
--   alter table public.team_players drop column if exists wellness_off;
--   alter table public.team_iba drop column if exists coach_role;
--   drop function if exists public.ack_checkins(text, date);
--   drop function if exists public.ack_checkin(uuid);
--   drop function if exists public.handle_checkin(uuid);
--   drop function if exists public.delete_my_checkins();
--   drop function if exists public.checkins_purge(boolean);
--   drop function if exists public.checkins_touch();
--   delete from public.retention_policy where key = 'player_checkins';
--   notify pgrst, 'reload schema';
-- =====================================================================
