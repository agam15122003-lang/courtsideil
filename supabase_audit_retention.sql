-- =====================================================================
--  CourtSide — תיעוד שינויים (audit) ומדיניות שמירה/מחיקה (retention)
--  נכתב 4.8.2026 · הרץ אחרי supabase_parent_consent.sql · אידמפוטנטי
--
--  שני הפערים מהצ'קליסט המשפטי ב-AUDIT_3.8.md שהקובץ הזה סוגר:
--
--   · סעיף 9 (אבטחת מידע לפי התקנות) — "חסר: תיעוד גישה (audit log)".
--     תקנות הגנת הפרטיות (אבטחת מידע) התשע"ז-2017 דורשות, ברמת אבטחה
--     בינונית, מנגנון תיעוד. מאגר שמחזיק injury_note / status / mood של
--     קטינים סביר שיושב שם. עד היום לא היה שום תיעוד: הלוגים המובנים של
--     Supabase נשמרים ימים בודדים ב-tier החינמי, ואחריהם אין דרך לענות
--     על "מי שינה את מה, מתי, ועל מי".
--
--   · סעיף 11 (שמירה ומחיקה) — השורה היחידה שסומנה "חסר" במלואה.
--     מדיניות הפרטיות מבטיחה מחיקה תוך 30 יום, ובפועל לא היה שום מנגנון
--     retention: לא לשגיאות לקוח, לא להתראות, לא לטוקנים של הסכמה, ולא
--     לשורות roster של שחקנים שעזבו (שנשארו אצל המאמן במלואן, כולל טלפון
--     והערות פציעה, כי player_id הוא on delete set null בלבד).
--
--  ============================================================
--  ⚠ מגבלה מוצהרת — הקובץ הזה מתעד **שינויים**, לא **קריאות**
--  ============================================================
--  התקנות מדברות גם על תיעוד *גישה* למידע. הקובץ הזה **אינו** מתעד
--  קריאות, ובכוונה: כיום הפרונט קורא מ-profiles / team_players ישירות
--  דרך PostgREST עם RLS. כדי לתעד כל קריאה היה צריך לחסום select לגמרי
--  ולנתב כל שליפה דרך RPC של SECURITY DEFINER שכותב שורת audit — שינוי
--  ארכיטקטוני רוחבי בכל מסך באפליקציה, ובנוסף מייצר נפח יומן אדיר
--  (כל טעינת מסך קבוצה = עשרות שורות).
--  מה שכן קיים כתחליף חלקי: supabase_privacy4.sql שלל select ברמת
--  הטבלה על profiles והשאיר whitelist עמודות, כך שהעמודות הרגישות
--  (phone, birth_date, guardian_*) נחשפות רק דרך RPC — ואת אלה כן אפשר
--  יהיה לתעד בעתיד בנקודה אחת.
--  ⇦ הפער הזה חייב לעלות מול עורך הדין/ממונה אבטחת המידע: הוא זה שקובע
--    אם רמת האבטחה של המאגר מחייבת תיעוד קריאות ובאיזה היקף. אל תניח
--    שהקובץ הזה לבדו מסמן את סעיף 9 כ"תקין".
--
--  אין pg_cron בפרויקט — ראו סעיף 6 להוראות תזמון.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) קבועים — חלונות השמירה, במקום אחד, בטבלה שאפשר לערוך בלי מיגרציה
--
--    ⚠⚠ המספרים כאן הם **מצייני מקום (placeholders) שנבחרו הנדסית**,
--    ולא תקופות שמישהו אישר משפטית. 30 הימים היחידים שיש להם עוגן הם
--    ההבטחה שכתובה במדיניות הפרטיות עצמה. כל השאר (90 / 180 / 365 / 730)
--    נבחרו כאיזון סביר בין "לא לשמור מידע של קטינים לנצח" לבין "לא
--    להשמיד ראיה או היסטוריה של מאמן". **עורך דין חייב לאשר אותם.**
--    שינוי לא דורש מיגרציה חדשה — update על השורה כאן, ואז דוח יבש.
--
--    למה טבלה ולא קבועים בקוד: כדי שהתיקון של עורך הדין יהיה שורת SQL
--    אחת, ולא עריכה של פונקציה שכבר רצה בייצור (הכלל: לא נוגעים במיגרציה
--    שכבר הורצה).
-- ---------------------------------------------------------------------
create table if not exists public.retention_policy (
  key        text primary key,
  days       int  not null check (days between 1 and 3650),
  method     text not null check (method in ('delete', 'anonymise')),
  what       text not null,               -- מה בדיוק נוגעים בו
  note       text,                        -- למה נבחרה השיטה הזו
  updated_at timestamptz not null default now()
);

alter table public.retention_policy enable row level security;

drop policy if exists "retention_policy_admin_read" on public.retention_policy;
create policy "retention_policy_admin_read" on public.retention_policy
  for select to authenticated using (public.is_admin());

revoke all on public.retention_policy from anon, authenticated;
grant select on public.retention_policy to authenticated;

-- on conflict do nothing — הרצה חוזרת של הקובץ לא דורסת ערך שעורך הדין
-- כבר תיקן. זו הסיבה שאין כאן do update.
insert into public.retention_policy (key, days, method, what, note) values
  ('client_errors',    30,  'delete',
   'שורות client_errors ישנות',
   'stack traces של מסכי שחקנים עלולים להכיל PII של קטינים. 30 יום = ההבטחה במדיניות הפרטיות. מחיקה ולא אנונימיזציה — אין לשורות האלה שום ערך היסטורי אחרי חודש.'),

  ('consent_requests', 90,  'delete',
   'טוקני בקשת הסכמה שנוצלו או שפגו',
   'זו רק **הזמנה** להורה (token_hash + expires_at) — לא הראיה. הראיה היושבת ב-consents היא append-only ולא נמחקת כאן לעולם. 90 יום מאפשרים לברר מול הורה שטוען שלא קיבל קישור.'),

  ('notifications',    180, 'delete',
   'התראות ישנות (נקראו או לא)',
   'התראה נושאת content חופשי ושם של מי שגרם לה — כלומר מידע על קטינים. אחרי חצי שנה אין לה שום שימוש למשתמש. מחיקה מלאה.'),

  ('audit_log',        730, 'delete',
   'שורות יומן התיעוד עצמן',
   '24 חודשים — היומן עצמו הוא מאגר של מידע רגיש, ולכן גם עליו חלה חובת מזעור. ⚠ זה בדיוק סוג המספר שהתקנות עשויות לחייב אחרת (יש דרישות שמירה מינימליות ליומני אבטחה) — לאשר מול עו"ד לפני שמריצים בפעם הראשונה.'),

  ('team_players',     365, 'anonymise',
   'שורות roster של שחקנים שהתנתקו מהמאמן',
   'אנונימיזציה ולא מחיקה — practice_attendance, game_reviews ו-player_stats תלויים ב-team_players.id עם on delete cascade. מחיקת השורה הייתה מוחקת עונה שלמה של נוכחות ומשחקים מהמאמן. לכן מאפסים את המידע האישי (טלפון, תאריך לידה, הערות, פציעה) ומשאירים שלד סטטיסטי בלי זהות.'),

  ('coach_notes',      365, 'delete',
   'הערות מאמן פרטיות על שחקן שעזב',
   'טקסט חופשי שהמאמן כתב על קטין. אין לו ערך סטטיסטי ואי אפשר לאנונימז טקסט חופשי בצורה אמינה — לכן מחיקה, בו-זמנית עם אנונימיזציית שורת ה-roster.')
on conflict (key) do nothing;

-- קורא חלון שמירה לפי מפתח, עם נפילה לברירת מחדל אם השורה נמחקה בטעות.
create or replace function public.retention_days(p_key text, p_fallback int default 365)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.days from public.retention_policy r where r.key = p_key),
                  greatest(coalesce(p_fallback, 365), 1));
$$;

revoke all on function public.retention_days(text, int) from public, anon;
grant execute on function public.retention_days(text, int) to authenticated;


-- ---------------------------------------------------------------------
-- 2) audit_log — יומן השינויים
--
--    actor      = מי ביצע (auth.uid()). null = פעולה מהשרת/SQL Editor/
--                 service_role, כלומר פעולה privileged — וזו אינפורמציה
--                 בפני עצמה, לא חור.
--    subject    = על מי המידע. זה השדה שמאפשר לענות על השאלה שהורה
--                 באמת שואל: "מי נגע בנתונים של הילד שלי".
--    entity/_id = איזו טבלה ואיזו שורה.
--    details    = מה השתנה, עמודה-עמודה. אף פעם לא dump של שורה שלמה.
--
--    RLS: קריאה לאדמין בלבד, ואין שום policy של insert/update/delete —
--    כלומר אף לקוח לא יכול לכתוב או למחוק ביומן. הכתיבה היחידה היא
--    מהטריגר, שהוא SECURITY DEFINER ולכן עוקף RLS.
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid,                        -- בלי FK: מחיקת המשתמש לא תמחק את התיעוד שלו
  action     text not null,               -- 'insert' | 'update' | 'delete' | 'purge'
  entity     text not null,               -- שם הטבלה
  entity_id  uuid,
  subject    uuid,                        -- מי בעל המידע שנגעו בו
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx
  on public.audit_log (created_at desc);
create index if not exists audit_log_subject_idx
  on public.audit_log (subject, created_at desc);
-- לא נדרש בסעיף אבל זול, וזו השאילתה השנייה בשכיחות ("מה קרה לשורה הזו")
create index if not exists audit_log_entity_idx
  on public.audit_log (entity, entity_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_admin_read" on public.audit_log;
create policy "audit_log_admin_read" on public.audit_log
  for select to authenticated using (public.is_admin());

-- אין policy נוספת בכוונה: אין insert, אין update, אין delete למשתמשים.
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- שורת יומן לא נערכת לעולם. מחיקה כן מותרת — ה-retention בסעיף 6 חייב
-- אותה — אבל היא מגיעה רק מפונקציה של SECURITY DEFINER, כי ללקוחות
-- ההרשאה נשללה למעלה.
create or replace function public.audit_log_no_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'audit_log הוא יומן — אי אפשר לערוך שורה קיימת';
end;
$$;

do $alnu$
begin
  drop trigger if exists trg_audit_log_no_update on public.audit_log;
  create trigger trg_audit_log_no_update
    before update on public.audit_log
    for each row execute function public.audit_log_no_update();
end $alnu$;


-- ---------------------------------------------------------------------
-- 3) הטריגר — מתעד שינוי בעמודות הרגישות בלבד
--
--    שתי רמות תיעוד, וזו החלטה של מזעור מידע:
--
--    · plain   — נרשם ערך ישן→חדש כפשוטו. אלה שדות קצרים ומובְנים
--                שהערך שלהם *הוא* העניין: role, is_admin, banned,
--                approval_status, birth_date. (הביקורת מצאה קטינים
--                שעורכים לעצמם birth_date כדי לחמוק משער ההורים —
--                בלי הערך הישן והחדש התיעוד חסר ערך.)
--
--    · redact  — נרשם רק *שהשדה השתנה* + אורכים, בלי התוכן.
--                injury_note, notes, טלפונים ומייל של הורה. אין סיבה
--                שהיומן יהפוך לעותק שני של תיק הפציעות של הקטין; מספיק
--                לדעת שמישהו נגע בו ומתי.
--
--    עמידות: הגישה לערכים היא דרך to_jsonb ולא דרך new.<col>, ולכן
--    עמודה שלא קיימת בפריסה מסוימת פשוט לא מייצרת הפרש (null מול null)
--    במקום להפיל את הכתיבה ב-42703.
--
--    מחיר: אם שום עמודה רגישה לא השתנתה — יוצאים בלי לכתוב כלום.
--    עדכון של height או של תמונת פרופיל לא מייצר שורת יומן.
-- ---------------------------------------------------------------------
create or replace function public.audit_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plain   text[] := '{}';
  v_redact  text[] := '{}';
  v_col     text;
  v_old     jsonb;
  v_new     jsonb;
  v_ov      jsonb;
  v_nv      jsonb;
  v_details jsonb := '{}'::jsonb;
  v_row     jsonb;
  v_entity  uuid;
  v_subject uuid;
begin
  begin
    -- '{}' לצד שלא קיים, ואז coalesce ל-'null'::jsonb בהשוואה, כדי
    -- ש-INSERT של עמודה ריקה לא ייחשב "שינוי" מ-לא-קיים ל-null.
    v_old := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
    v_new := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
    v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

    if tg_table_name = 'profiles' then
      v_plain  := array['role', 'is_admin', 'banned', 'verified', 'approval_status',
                        'birth_date', 'birth_year', 'phone_public',
                        'guardian_consent_at', 'guardian_consent_version',
                        'adult_confirmed_at', 'role_locked_at'];
      v_redact := array['phone', 'guardian_name', 'guardian_email', 'guardian_phone'];
      v_entity  := (v_row ->> 'id')::uuid;
      v_subject := v_entity;                       -- הפרופיל הוא בעל המידע

    elsif tg_table_name = 'team_players' then
      v_plain  := array['status', 'birth_date', 'birth_year', 'height',
                        'availability_since', 'player_id', 'team', 'number'];
      v_redact := array['phone', 'notes', 'injury_note', 'name'];
      v_entity  := (v_row ->> 'id')::uuid;
      -- שורת roster לא תמיד מקושרת לפרופיל (מאמן שהקליד שם ידנית) —
      -- אז subject יכול להיות null, וזה תקין. entity_id עדיין מזהה.
      v_subject := nullif(v_row ->> 'player_id', '')::uuid;

    elsif tg_table_name = 'coach_notes' then
      -- coach_notes היא **טבלה** נפרדת (supabase_player_card.sql:45), לא
      -- עמודה על team_players. תוכנה הוא טקסט חופשי של מאמן על קטין,
      -- ולכן redact מלא: מתעדים שנגעו, לא מה נכתב.
      v_redact := array['content'];
      v_entity  := (v_row ->> 'id')::uuid;
      select tp.player_id into v_subject
        from public.team_players tp
       where tp.id = nullif(v_row ->> 'roster_id', '')::uuid;

    else
      return null;                                 -- טבלה שלא מתועדת
    end if;

    foreach v_col in array v_plain loop
      v_ov := coalesce(v_old -> v_col, 'null'::jsonb);
      v_nv := coalesce(v_new -> v_col, 'null'::jsonb);
      if v_ov is distinct from v_nv then
        v_details := v_details || jsonb_build_object(
          v_col, jsonb_build_object('from', v_ov, 'to', v_nv));
      end if;
    end loop;

    foreach v_col in array v_redact loop
      v_ov := coalesce(v_old -> v_col, 'null'::jsonb);
      v_nv := coalesce(v_new -> v_col, 'null'::jsonb);
      if v_ov is distinct from v_nv then
        -- #>> '{}' מוציא את הטקסט הגולמי; על 'null'::jsonb הוא מחזיר NULL
        v_details := v_details || jsonb_build_object(
          v_col, jsonb_build_object(
            'redacted', true,
            'from_len', coalesce(length(v_ov #>> '{}'), 0),
            'to_len',   coalesce(length(v_nv #>> '{}'), 0)));
      end if;
    end loop;

    -- שום דבר רגיש לא השתנה — לא כותבים שורה. זה מה שמחזיק את היומן קטן.
    if v_details = '{}'::jsonb then
      return null;
    end if;

    insert into public.audit_log (actor, action, entity, entity_id, subject, details)
    values (auth.uid(), lower(tg_op), tg_table_name, v_entity, v_subject, v_details);

  exception when others then
    -- כישלון בתיעוד לא יפיל שמירת פרופיל או עדכון פציעה באמצע אימון.
    -- ⚠ המשמעות: היומן הוא best-effort. הכשל נרשם ב-Postgres logs כאזהרה
    -- ולא נבלע בשקט, כדי שיהיה אפשר לגלות אותו.
    raise warning 'audit_log: כשל בתיעוד % על % — %', tg_op, tg_table_name, sqlerrm;
  end;

  return null;                                     -- AFTER trigger: מוחזר ומתעלמים
end;
$$;

revoke all on function public.audit_sensitive_change() from public, anon;


-- 3ב) חיבור הטריגר, עם שמירה על to_regclass — פריסה שבה טבלה עדיין לא
--     קיימת (למשל supabase_player_card.sql שלא הורץ) לא תפיל את הקובץ.
do $att$
declare
  v_t text;
begin
  foreach v_t in array array['profiles', 'team_players', 'coach_notes'] loop
    if to_regclass('public.' || v_t) is not null then
      execute format('drop trigger if exists trg_audit_sensitive on public.%I', v_t);
      execute format(
        'create trigger trg_audit_sensitive after insert or update or delete on public.%I '
        'for each row execute function public.audit_sensitive_change()', v_t);
      raise notice 'audit: טריגר חובר ל-public.%', v_t;
    else
      raise notice 'audit: public.% לא קיימת — דילוג', v_t;
    end if;
  end loop;
end $att$;


-- ---------------------------------------------------------------------
-- 4) שעון העזיבה — unlinked_at / anonymised_at על team_players
--
--    הבעיה שסעיף 11 מתאר: player_id הוא on delete set null, ולכן שחקן
--    שמחק חשבון או שהוסר מהקבוצה משאיר אצל המאמן שורה מלאה — שם, טלפון,
--    תאריך לידה, הערת פציעה — בלי שום חותמת שאומרת מתי הוא עזב.
--
--    בלי חותמת אי אפשר לעשות retention: שורה עם player_id = null יכולה
--    להיות גם שחקן שעזב וגם שחקן שהמאמן פשוט הקליד ידנית ומעולם לא היה
--    מקושר — ואת השנייה אסור לגעת. הטריגר כאן מבדיל ביניהן, כי הוא רואה
--    את המעבר not-null → null ברגע שהוא קורה.
--
--    ⚠ אין backfill בכוונה: לשורות הקיימות היום unlinked_at יישאר null,
--    ולכן הן לעולם לא ייכנסו לאנונימיזציה האוטומטית. אי אפשר לדעת בדיעבד
--    מי מהן "עזבה" — וניחוש כאן היה משמיד roster חי של מאמן. הספירה
--    מתחילה מהיום.
-- ---------------------------------------------------------------------
alter table public.team_players add column if not exists unlinked_at    timestamptz;
alter table public.team_players add column if not exists anonymised_at  timestamptz;

create index if not exists team_players_unlinked_idx
  on public.team_players (unlinked_at) where unlinked_at is not null;

create or replace function public.team_players_track_unlink()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.player_id is not null and new.player_id is null then
    new.unlinked_at := now();                 -- עזב / נמחק / הוסר
  elsif new.player_id is not null then
    new.unlinked_at := null;                  -- חזר לקבוצה — השעון מתאפס
  end if;
  return new;
end;
$$;

revoke all on function public.team_players_track_unlink() from public, anon;

do $tpu$
begin
  if to_regclass('public.team_players') is not null then
    drop trigger if exists trg_team_players_track_unlink on public.team_players;
    -- בכוונה בלי "of player_id": ניתוק מגיע גם מפעולת on delete set null
    -- של ה-FK, ולא רק מ-update מפורש של הפרונט. הפונקציה זולה (שני if).
    create trigger trg_team_players_track_unlink
      before update on public.team_players
      for each row execute function public.team_players_track_unlink();
  end if;
end $tpu$;


-- ---------------------------------------------------------------------
-- 5) purge_expired_data — נקודת הכניסה היחידה למחיקה/אנונימיזציה
--
--    ברירת המחדל היא **הרצה יבשה**. בלי ארגומנט הפונקציה לא מוחקת כלום,
--    רק סופרת. זו הגנה מכוונת: המספרים בטבלת retention_policy עדיין לא
--    אושרו משפטית, ומחיקה היא פעולה שאין ממנה חזרה.
--
--      select * from public.purge_expired_data();        -- יבש (ברירת מחדל)
--      select * from public.purge_expired_data(false);   -- מבצע בפועל
--
--    ⚠ אין pg_cron בפרויקט הזה. אל תניח שזה רץ מעצמו. שלוש אפשרויות:
--      א) ידנית — פעם בחודש מה-SQL Editor. קודם יבש, לקרוא את המספרים,
--         ורק אז false. זו האפשרות הריאלית היום.
--      ב) להפעיל את ההרחבה pg_cron בדשבורד של Supabase
--         (Database → Extensions → pg_cron), ואז:
--           select cron.schedule('courtside-purge', '0 3 1 * *',
--                                $q$ select * from public.purge_expired_data(false) $q$);
--      ג) Edge Function מתוזמן שקורא ל-RPC עם service_role.
--    ⇦ עד שאחת מהשלוש מופעלת בפועל, ההבטחה "מחיקה תוך 30 יום" שבמדיניות
--      הפרטיות עדיין לא מגובה במנגנון רץ. זה לא נסגר בקובץ SQL לבדו.
-- ---------------------------------------------------------------------
create or replace function public.purge_expired_data(p_dry_run boolean default true)
returns table (table_name text, rows_affected bigint)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_dry   boolean := coalesce(p_dry_run, true);
  v_days  int;
  v_n     bigint;
  v_set   text;
  v_sql   text;
  v_ids   uuid[];
begin
  -- מותר לאדמין, או להרצה בלי JWT (SQL Editor / cron / service_role) —
  -- אותו שער בדיוק כמו ב-purge_old_client_errors בקובץ ההקשחה.
  if not (auth.uid() is null or coalesce(public.is_admin(), false)) then
    raise exception 'ניקוי נתונים מותר למנהלים בלבד';
  end if;

  -- 5א) client_errors — מחיקה. stack traces של מסכי קטינים.
  --     (הקובץ supabase_hardening_medium_3_8.sql כבר סיפק
  --      purge_old_client_errors(); כאן זה מרוכז תחת נקודת כניסה אחת
  --      עם אותו חלון, כדי שלבעלים תהיה פקודה אחת לזכור.)
  v_days := public.retention_days('client_errors', 30);
  if to_regclass('public.client_errors') is not null then
    if v_dry then
      select count(*) into v_n from public.client_errors
       where created_at < now() - make_interval(days => v_days);
    else
      delete from public.client_errors
       where created_at < now() - make_interval(days => v_days);
      get diagnostics v_n = row_count;
    end if;
    table_name := 'client_errors'; rows_affected := v_n; return next;
  end if;

  -- 5ב) consent_requests — מחיקה של טוקנים שמוצו או שפגו.
  --     שוב, להסרת ספק: **הראיה לא נמחקת**. טבלת consents היא
  --     append-only ואינה מופיעה בקובץ הזה בשום מקום.
  v_days := public.retention_days('consent_requests', 90);
  if to_regclass('public.consent_requests') is not null then
    if v_dry then
      select count(*) into v_n from public.consent_requests
       where (used_at is not null and used_at    < now() - make_interval(days => v_days))
          or (used_at is null     and expires_at < now() - make_interval(days => v_days));
    else
      delete from public.consent_requests
       where (used_at is not null and used_at    < now() - make_interval(days => v_days))
          or (used_at is null     and expires_at < now() - make_interval(days => v_days));
      get diagnostics v_n = row_count;
    end if;
    table_name := 'consent_requests'; rows_affected := v_n; return next;
  end if;

  -- 5ג) notifications — מחיקה. content חופשי + actor, כלומר מידע על קטינים.
  v_days := public.retention_days('notifications', 180);
  if to_regclass('public.notifications') is not null then
    if v_dry then
      select count(*) into v_n from public.notifications
       where created_at < now() - make_interval(days => v_days);
    else
      delete from public.notifications
       where created_at < now() - make_interval(days => v_days);
      get diagnostics v_n = row_count;
    end if;
    table_name := 'notifications'; rows_affected := v_n; return next;
  end if;

  -- 5ד) team_players — **אנונימיזציה**, לא מחיקה.
  --     practice_attendance / game_reviews / player_stats מצביעים על
  --     team_players.id עם on delete cascade; delete כאן היה מוחק למאמן
  --     עונה שלמה של נוכחות ומשחקים. לכן מאפסים את המידע האישי ומשאירים
  --     שלד: מספר חולצה, תפקיד, קבוצה — מספיק לסטטיסטיקה, בלי זהות.
  --     ה-SET נבנה דינמית מהעמודות שקיימות בפועל, כדי שפריסה בלי
  --     supabase_player_card.sql לא תיפול על 42703.
  v_days := public.retention_days('team_players', 365);
  if to_regclass('public.team_players') is not null then
    select count(*) into v_n
      from public.team_players tp
     where tp.unlinked_at is not null
       and tp.anonymised_at is null
       and tp.unlinked_at < now() - make_interval(days => v_days);

    if not v_dry and v_n > 0 then
      -- אוספים את המזהים לפני העדכון — צריך אותם למחיקת coach_notes בסעיף 5ה
      select array_agg(tp.id) into v_ids
        from public.team_players tp
       where tp.unlinked_at is not null
         and tp.anonymised_at is null
         and tp.unlinked_at < now() - make_interval(days => v_days);

      select string_agg(format('%I = null', a.attname), ', ')
        into v_set
        from unnest(array['phone', 'notes', 'injury_note', 'birth_date',
                          'birth_year', 'height', 'availability_since']) as u(col)
        join pg_attribute a
          on a.attrelid = 'public.team_players'::regclass
         and a.attname  = u.col
         and a.attnum   > 0
         and not a.attisdropped;

      -- אם אף אחת מהעמודות לא קיימת בפריסה הזו, v_set הוא null ואז
      -- מדלגים על הפסיק — כדי לא לייצר הצבה כפולה לאותה עמודה.
      v_sql := format(
        'update public.team_players set %sname = %L, anonymised_at = now() '
        'where id = any($1)',
        case when v_set is null then '' else v_set || ', ' end, 'שחקן לשעבר');
      execute v_sql using v_ids;
      get diagnostics v_n = row_count;
    end if;

    table_name := 'team_players'; rows_affected := coalesce(v_n, 0); return next;
  end if;

  -- 5ה) coach_notes — מחיקה. טקסט חופשי שאי אפשר לאנונימז באמינות.
  --     נמחק יחד עם שורות ה-roster שאנונימזו זה עתה (v_ids), ובנוסף
  --     כל הערה ששייכת לשורה שכבר אנונימזה בעבר.
  v_days := public.retention_days('coach_notes', 365);
  if to_regclass('public.coach_notes') is not null then
    if v_dry then
      select count(*) into v_n
        from public.coach_notes cn
        join public.team_players tp on tp.id = cn.roster_id
       where tp.unlinked_at is not null
         and tp.unlinked_at < now() - make_interval(days => v_days);
    else
      delete from public.coach_notes cn
       using public.team_players tp
       where tp.id = cn.roster_id
         and (tp.anonymised_at is not null or tp.id = any(coalesce(v_ids, '{}'::uuid[])));
      get diagnostics v_n = row_count;
    end if;
    table_name := 'coach_notes'; rows_affected := v_n; return next;
  end if;

  -- 5ו) audit_log — היומן מזדקן גם הוא. הוא עצמו מאגר של מידע רגיש.
  v_days := public.retention_days('audit_log', 730);
  if v_dry then
    select count(*) into v_n from public.audit_log
     where created_at < now() - make_interval(days => v_days);
  else
    delete from public.audit_log
     where created_at < now() - make_interval(days => v_days);
    get diagnostics v_n = row_count;
  end if;
  table_name := 'audit_log'; rows_affected := v_n; return next;

  -- 5ז) הניקוי עצמו מתועד. פעולת retention היא בדיוק סוג הפעולה
  --     שצריכה להיות ניתנת לביקורת בדיעבד ("מי מחק, מתי, כמה").
  if not v_dry then
    insert into public.audit_log (actor, action, entity, details)
    values (auth.uid(), 'purge', 'retention_policy',
            jsonb_build_object('ran_at', now(), 'dry_run', false));
  end if;
end;
$$;

revoke all on function public.purge_expired_data(boolean) from public, anon;
grant execute on function public.purge_expired_data(boolean) to authenticated;
do $psr$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.purge_expired_data(boolean) to service_role;
  end if;
end $psr$;


-- ---------------------------------------------------------------------
-- 6) admin_purge_report — להסתכל לפני שקופצים
--
--    מריץ את הניקוי במצב יבש ומצרף לכל שורה את החלון, את השיטה ואת
--    ההסבר למה נבחרה. זו התצוגה שהבעלים (או עורך הדין) צריך לראות לפני
--    שהוא מריץ purge_expired_data(false) בפעם הראשונה.
--        select * from public.admin_purge_report();
-- ---------------------------------------------------------------------
drop function if exists public.admin_purge_report();
create or replace function public.admin_purge_report()
returns table (
  table_name     text,
  method         text,
  retention_days int,
  rows_affected  bigint,
  what           text,
  note           text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;
  return query
    select d.table_name,
           coalesce(r.method, 'delete'),
           coalesce(r.days, 0),
           d.rows_affected,
           coalesce(r.what, ''),
           coalesce(r.note, '')
      from public.purge_expired_data(true) d
      left join public.retention_policy r on r.key = d.table_name
     order by d.rows_affected desc, d.table_name;
end;
$$;

revoke all on function public.admin_purge_report() from public, anon;
grant execute on function public.admin_purge_report() to authenticated;


-- ---------------------------------------------------------------------
-- 7) רענון סכימת ה-API + רישום בלדג'ר
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_audit_retention.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקת עשן אחרי ההרצה
--
--  1) הטריגרים חוברו (צריך להופיע 3, או 2 אם coach_notes לא קיימת):
--       select tgrelid::regclass as tbl from pg_trigger
--        where tgname = 'trg_audit_sensitive' and not tgisinternal;
--
--  2) התיעוד עובד — ומתעד רק את מה שרגיש. מחשבון מאמן, בקונסולה:
--       // שינוי לא רגיש — לא אמור להיווצר תיעוד
--       await supabase.from('team_players').update({ height: 181 }).eq('id','<roster_id>')
--       // שינוי רגיש — כן
--       await supabase.from('team_players').update({ status: 'injured' }).eq('id','<roster_id>')
--     ואז מחשבון אדמין:
--       select action, entity, subject, details, created_at
--         from public.audit_log order by created_at desc limit 5;
--     → שורה אחת בלבד, עם details = {"status": {"from": "active", "to": "injured"}}.
--       אין שורה עבור height. אם יש שתיים — הרשימה v_plain לא נכונה.
--
--  3) המזעור באמת עובד — התוכן לא נשמר ביומן:
--       await supabase.from('team_players')
--         .update({ injury_note: 'קרע ברצועה הצולבת' }).eq('id','<roster_id>')
--     → details חייב להיות {"injury_note": {"redacted": true, "from_len": 0, "to_len": 21}}
--       ולא הטקסט עצמו. אם הטקסט מופיע — עצור, זו דליפה.
--
--  4) היומן חסין לעריכה ולקריאה של מי שאינו אדמין:
--       update public.audit_log set details = '{}'::jsonb;   -- חייב ליפול
--     ומחשבון מאמן רגיל בקונסולה:
--       await supabase.from('audit_log').select('*')          -- חייב לחזור ריק/42501
--       await supabase.from('audit_log').insert({ action:'x', entity:'y' })  -- 42501
--
--  5) שעון העזיבה מתחיל לתקתק רק על ניתוק אמיתי:
--       update public.team_players set player_id = null where id = '<roster_id>';
--       select unlinked_at from public.team_players where id = '<roster_id>';  -- now()
--       update public.team_players set player_id = '<uid>' where id = '<roster_id>';
--       select unlinked_at from public.team_players where id = '<roster_id>';  -- null
--     ושורה שהמאמן הקליד ידנית ומעולם לא הייתה מקושרת נשארת unlinked_at = null
--     לנצח — ולכן לעולם לא תאונומז. זו ההתנהגות הרצויה.
--
--  6) הדוח היבש (מחשבון אדמין) — **הפקודה שמריצים לפני הכול**:
--       select * from public.admin_purge_report();
--     כל שורה מראה כמה שורות ייפגעו, באיזו שיטה, ולמה. אם מספר כלשהו
--     נראה גדול מדי — עצור ובדוק. אל תריץ את הבא לפני שהמספרים הגיוניים:
--       select * from public.purge_expired_data(false);
--
--  7) הרצה חוזרת של הקובץ לא דורסת חלונות שעודכנו:
--       update public.retention_policy set days = 45 where key = 'client_errors';
--       -- הרץ את הקובץ שוב --
--       select key, days from public.retention_policy where key = 'client_errors';  -- 45
--
--  ⚠ לפני שמריצים purge_expired_data(false) בפעם הראשונה בייצור:
--    לגבות (Supabase → Database → Backups), ולוודא שעורך הדין אישר את
--    הערכים בטבלת retention_policy. אחרי מחיקה אין חזרה.
-- =====================================================================
