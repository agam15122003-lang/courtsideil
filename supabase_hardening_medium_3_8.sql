-- ============================================================
-- CourtSide — הקשחת ממצאי "בינוני" ו"נמוך" ממסד הנתונים (AUDIT_3.8.md)
-- נכתב 3.8.2026. אידמפוטנטי לחלוטין — בטוח להרצה חוזרת.
--
-- מה הקובץ הזה סוגר (מספרי הסעיפים מתאימים לדוח הסקירה):
--   1)  mark_migration פתוחה ל-PUBLIC/anon וניתנת לשכתוב  (migrations_ledger:26)
--   2)  פונקציות SECURITY DEFINER שהוענקו בלי revoke → זמינות ל-anon (player_card:42)
--       + set_my_availability שמעדכנת את כל הקבוצות בבת אחת
--   3)  פונקציות בלי set search_path                      (privacy4:122)
--   4)  זיוף/שכתוב מטרות שחקן על דשבורד של מאמן זר        (player_goal_logging:17)
--   5)  הזרקת שורות מאמץ/סימוני מטרה/יומן לדוחות של מאמן זר (effort:24, team_slots:53, goal_logs:20)
--   6)  compl_player_all בלי אימות assignment_id            (players:130)
--   7)  drills_insert_own/update_own בלי בדיקת תפקיד        (stage3:68)
--   8)  client_errors בלי מגבלות אורך/קצב/שמירה             (privacy4:209)
--   9)  memb_player_insert בלי קשר לקוד הצטרפות             (players:49)     ⚠ דורש תיקון בפרונט
--   10) קודי הצטרפות נצחיים, resolve_join_code בלי rate-limit (security3:83)
--   11) drills.created_by נחשף לאנונימי בדף התרגיל הציבורי  (engagement:144)  ⚠ דורש תיקון בפרונט
--   12) חסרים אינדקסים לעמודות שמופיעות ב-USING של RLS      (teams_admin:87)
--   13) סדר ההרצה ההיסטורי בלדג'ר שגוי                       (migrations_ledger:43)  — תיעוד בלבד
--
-- ---------------- סדר הרצה ----------------
-- הרץ **אחרי** supabase_rls_hardening_3_8.sql (שם מוגדרות public.is_coach()/
-- is_banned()/shares_team_with()) ואחרי supabase_parent_consent.sql.
-- אם is_coach() עדיין לא קיימת — סעיף 0 יוצר גרסה זהה כדי שהקובץ לא ייפול,
-- והקובץ של סוכן ה-RLS ידרוס אותה ב-create or replace כשירוץ.
--
-- ---------------- ⚠ שני סעיפים שדורשים פריסת פרונט תחילה ----------------
-- סעיפים 9ב ו-11ב מנתקים גישה ישירה שהפרונט עדיין משתמש בה, ולכן הם נעולים
-- מאחורי מתג ידני (חפש "v_frontend_ready" למטה). כל השאר רץ תמיד ובבטחה.
-- ============================================================


-- ============================================================
-- 0) עוזרים
-- ============================================================

-- 0.1 is_coach() — נוצרת כאן **רק אם היא חסרה**, כדי שהקובץ הזה יוכל לרוץ גם
--     לפני supabase_rls_hardening_3_8.sql. create function (ולא create or
--     replace) במכוון: אסור לדרוס את ההגדרה של סוכן ה-RLS.
do $ic$
begin
  if to_regprocedure('public.is_coach()') is null then
    execute $f$
      create function public.is_coach()
      returns boolean
      language sql stable security definer set search_path = public, extensions
      as $b$
        select coalesce((select p.role = 'coach' from public.profiles p where p.id = auth.uid()), false);
      $b$;
    $f$;
    raise notice 'CourtSide: נוצרה public.is_coach() זמנית (supabase_rls_hardening_3_8.sql עוד לא רץ).';
  end if;
end $ic$;

-- 0.2 עוזר חדש: האם המשתמש המחובר הוא שחקן מאושר אצל מאמן מסוים (בלי תלות בקבוצה)?
--     נחוץ לטבלאות שיש בהן coach_id אבל אין team (למשל session_goal_marks).
--     השם נבחר כדי לא להתנגש ב-shares_team_with() של סוכן ה-RLS.
create or replace function public.is_approved_under_coach(_coach uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.team_memberships m
    where m.coach_id = _coach
      and m.player_id = auth.uid()
      and m.status = 'approved'
  );
$$;


-- ============================================================
-- 1) mark_migration — נעילה לאדמין בלבד + הגבלת אורך שם קובץ
--    (AUDIT: supabase_migrations_ledger.sql:26)
--
-- הבעיה: SECURITY DEFINER בלי revoke ובלי בדיקת role. ברירת המחדל של Postgres
-- היא EXECUTE ל-PUBLIC, ולכן גם anon יכול היה לקרוא ל-
--   POST /rest/v1/rpc/mark_migration
-- עם כל מחרוזת, וה-upsert אפשר גם לשכתב שורות קיימות בלדג'ר.
--
-- ⚑ למה השומר הוא "is_admin() או auth.uid() is null":
--   כל 48 קבצי המיגרציה (כולל אלה שנכתבו בגל הזה) קוראים ל-mark_migration
--   מתוך ה-SQL Editor של Supabase. שם ההרצה היא בתפקיד postgres/service role
--   ואין JWT כלל, כלומר auth.uid() מחזירה null ו-is_admin() מחזירה false.
--   שומר של is_admin() בלבד היה שובר את כל קבצי המיגרציה. לכן: קריאה בלי
--   זהות (SQL Editor / service role) מותרת, וקריאה עם זהות חייבת להיות אדמין.
-- ============================================================

create or replace function public.mark_migration(p_file text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- הרצה מה-SQL Editor / service role: אין JWT → auth.uid() is null → מותר.
  -- הרצה מהאפליקציה עם JWT: חייב להיות אדמין.
  if not (auth.uid() is null or coalesce(public.is_admin(), false)) then
    raise exception 'רישום מיגרציה מותר למנהלים בלבד';
  end if;

  if p_file is null or btrim(p_file) = '' then
    raise exception 'שם קובץ מיגרציה ריק';
  end if;
  if char_length(p_file) > 120 then
    raise exception 'שם קובץ מיגרציה ארוך מדי (מקסימום 120 תווים)';
  end if;

  insert into public.schema_migrations (filename, ran_by)
  values (btrim(p_file), auth.uid())
  on conflict (filename) do update set ran_at = now(), ran_by = auth.uid();
end;
$$;

-- שלילת ההרשאה הרוחבית. service_role נשאר (Edge Functions/CI), הבעלים תמיד יכול.
revoke all on function public.mark_migration(text) from public, anon, authenticated;
do $mg$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.mark_migration(text) to service_role;
  end if;
end $mg$;

-- הגבלת אורך גם ברמת הטבלה (not valid — לא נוגע בשורות היסטוריות)
do $ml$
begin
  if to_regclass('public.schema_migrations') is not null
     and not exists (select 1 from pg_constraint where conname = 'schema_migrations_filename_len') then
    alter table public.schema_migrations
      add constraint schema_migrations_filename_len
      check (char_length(filename) <= 120) not valid;
  end if;
end $ml$;


-- ============================================================
-- 2) כל פונקציות ה-SECURITY DEFINER — revoke לפני grant
--    (AUDIT: supabase_player_card.sql:42)
--
-- הבעיה: ברוב הקבצים נכתב רק `grant execute ... to authenticated`, בלי
-- `revoke all ... from public, anon`. הרשאות ב-Postgres מצטברות, ולכן הרשאת
-- ברירת המחדל ל-PUBLIC נשארה — כלומר anon יכול לקרוא לפונקציות שעוקפות RLS.
-- כרגע הן מסתמכות על auth.uid() ולכן מחזירות ריק, אבל זו הגנה מקרית בלבד.
--
-- הלולאה עוברת על pg_proc במקום על רשימה קשיחה, כדי שתהיה עמידה לשינוי חתימות
-- ותתפוס גם פונקציות שייכתבו בעתיד. מה שהיא מוצאת כיום:
--   team_roster, set_my_availability, admin_delete_video, is_admin, is_team_member,
--   is_player, is_my_roster, is_linked_player, is_on_coach_roster, resolve_join_code,
--   my_profile, admin_profiles, set_video_approved, set_video_featured,
--   ack_session_effort, react_to_feedback, is_coach, is_banned, shares_team_with,
--   profiles_lite, join_with_code, וכל פונקציות ההסכמה של supabase_parent_consent.sql.
--
-- דילוגים מכוונים:
--   • get_consent_request / submit_parent_consent — ההורה פועל **בלי חשבון**,
--     ולכן EXECUTE ל-anon שם הוא הכרחי ומכוון (ראה החוזה המשותף).
--   • mark_migration — טופלה בסעיף 1 (נשללת גם מ-authenticated).
--   • פונקציות טריגר (returns trigger) — הן לא נקראות ישירות; שלילת EXECUTE
--     מהן עלולה למנוע יצירת טריגר בעתיד ואין בה תועלת אבטחה.
--   • פונקציות שמגיעות מהרחבה (pg_depend deptype='e').
-- ============================================================

do $sd$
declare
  r record;
  v_has_service boolean := exists (select 1 from pg_roles where rolname = 'service_role');
  v_count int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
       and p.proname not in ('get_consent_request', 'submit_parent_consent', 'mark_migration')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
    if v_has_service then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
    v_count := v_count + 1;
  end loop;
  raise notice 'CourtSide: הוקשחו % פונקציות SECURITY DEFINER (revoke public/anon).', v_count;
end $sd$;

-- ------------------------------------------------------------
-- 2.1 set_my_availability — עדכון קבוצה אחת במקום כל הקבוצות
--
-- הגרסה הקיימת (supabase_player_card.sql:60) מריצה
--   update team_players ... where player_id = auth.uid()
-- כלומר שחקן שרשום אצל שני מאמנים מסמן "פצוע" — וזה נכתב על שורות הסגל
-- אצל **שני** המאמנים בבת אחת, כולל injury_note (מידע בריאות) למאמן שלא רלוונטי.
--
-- הפתרון: עומס-יתר (overload) חדש בעל 4 ארגומנטים **בלי ערכי ברירת מחדל**.
-- בכוונה בלי defaults: אילו היו, קריאה עם 2 ארגומנטים הייתה הופכת לדו-משמעית
-- ("function is not unique") ושוברת את הפרונט הקיים. כך הקריאה הישנה
-- (2 ארגומנטים) ממשיכה לעבוד בדיוק כמו קודם, והחדשה מדויקת.
--
-- ⚑ הפרונט: כשמסך הזמינות יעודכן, לקרוא ל-
--     supabase.rpc('set_my_availability', { _status, _note, _coach: coachId, _team: team })
--   ואם מוחזרת שגיאת PGRST202/42883 (הפונקציה לא נפרסה) — ליפול חזרה
--   לקריאה עם שני הארגומנטים הישנים.
-- ------------------------------------------------------------
create or replace function public.set_my_availability(_status text, _note text, _coach uuid, _team text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'נדרשת התחברות';
  end if;
  if _status not in ('active', 'injured', 'sick') then
    raise exception 'invalid status';
  end if;
  update public.team_players
     set status = _status,
         injury_note = nullif(trim(coalesce(_note, '')), ''),
         availability_since = current_date
   where player_id = auth.uid()
     and coach_id = _coach
     and team = _team;
end $$;

revoke all on function public.set_my_availability(text, text, uuid, text) from public, anon;
grant execute on function public.set_my_availability(text, text, uuid, text) to authenticated;

-- הגרסה הישנה נשארת לתאימות לאחור, אבל עם בדיקת התחברות מפורשת
create or replace function public.set_my_availability(_status text, _note text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'נדרשת התחברות';
  end if;
  if _status not in ('active', 'injured', 'sick') then
    raise exception 'invalid status';
  end if;
  -- תאימות לאחור: מעדכן את כל שורות הסגל של השחקן. השתמש בעומס-היתר
  -- בעל 4 הארגומנטים כדי לעדכן קבוצה אחת בלבד.
  update public.team_players
     set status = _status,
         injury_note = nullif(trim(coalesce(_note, '')), ''),
         availability_since = current_date
   where player_id = auth.uid();
end $$;

revoke all on function public.set_my_availability(text, text) from public, anon;
grant execute on function public.set_my_availability(text, text) to authenticated;


-- ============================================================
-- 3) set search_path לכל פונקציה שחסרה אותו
--    (AUDIT: supabase_privacy4.sql:122)
--
-- פונקציה בלי search_path מקובע פותחת פתח להשתלטות על רזולוציית שמות
-- (משתמש יוצר סכימה משלו ומקדים אותה ב-search_path), ו-Supabase מסמנת זאת
-- כליקוי ב-linter. הלולאה מתקנת את כל מי שחסר לו — כולל
-- messages_recipient_read_only (supabase_security_hardening.sql:47).
--
-- ⚑ הערך הוא "public, extensions" ולא "public" בלבד: חלק מהפונקציות קוראות
--   ל-gen_random_uuid()/crypto בלי שם סכימה, ואלה יושבות ב-extensions אצל
--   Supabase. סכימה שלא קיימת ב-search_path פשוט מתעלמים ממנה, ולכן זה בטוח
--   גם בהתקנה עצמית.
--
-- ⚑ enforce_minor_consent מדולגת במפורש — סוכן הסכמת ההורים משכתב אותה בגל הזה.
-- ============================================================

do $sp$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proconfig is null                      -- אין לו שום SET מקובע
       and p.proname <> 'enforce_minor_consent'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
    v_count := v_count + 1;
  end loop;
  raise notice 'CourtSide: הוסף search_path ל-% פונקציות.', v_count;
end $sp$;


-- ============================================================
-- 4) player_goals — סוף לזיוף מטרות על דשבורד של מאמן זר
--    (AUDIT: supabase_player_goal_logging.sql:17)
--
-- הבעיה: pg_player_insert בדק רק player_id = auth.uid(), בעוד coach_id (not null)
-- ו-team נשלטים לגמרי בידי הקליינט — כל שחקן יכול היה להזריק מטרות לדשבורד של
-- כל מאמן במערכת. ו-pg_player_update אפשר לשחקן לשכתב title/target_value/
-- status/coach_id של מטרה שהמאמן הגדיר לו, כלומר לזייף את רשומת המעקב.
-- ============================================================

do $pg$
begin
  if to_regclass('public.player_goals') is null then
    raise notice 'CourtSide: player_goals לא קיימת — סעיף 4 דולג.';
    return;
  end if;

  -- הוספה: המטרה חייבת להיות שייכת למשתמש עצמו, ותחת מאמן שהוא באמת רשום אצלו
  drop policy if exists "pg_player_insert" on public.player_goals;
  create policy "pg_player_insert" on public.player_goals
    for insert to authenticated
    with check (
      player_id = auth.uid()
      and (
        coach_id = auth.uid()                                          -- מטרה אישית לגמרי
        or (team is not null and public.is_team_member(coach_id, team))
        or public.is_approved_under_coach(coach_id)                     -- חברות מאושרת בלי team
      )
    );

  -- עדכון: אותה דרישת שיוך. הגבלת העמודות עצמה נעשית בטריגר למטה,
  -- כי RLS עובד ברמת שורה ולא ברמת עמודה.
  drop policy if exists "pg_player_update" on public.player_goals;
  create policy "pg_player_update" on public.player_goals
    for update to authenticated
    using (player_id = auth.uid())
    with check (
      player_id = auth.uid()
      and (
        coach_id = auth.uid()
        or (team is not null and public.is_team_member(coach_id, team))
        or public.is_approved_under_coach(coach_id)
      )
    );

  -- מחיקה: נשארת כפי שהייתה (player_id = auth.uid()) **במכוון**.
  -- מטרה אישית שהשחקן יוצר לעצמו נשמרת עם coach_id של המאמן שלו
  -- (src/PlayerGoals.jsx:309), ולכן צמצום המחיקה ל-coach_id = auth.uid()
  -- היה מונע מהשחקן למחוק את המטרות שלו עצמו. המחיקה גם אינה בממצאי הדוח.
  drop policy if exists "pg_player_delete" on public.player_goals;
  create policy "pg_player_delete" on public.player_goals
    for delete to authenticated
    using (player_id = auth.uid());
end $pg$;

-- טריגר: השחקן מעדכן אך ורק עמודות התקדמות (progress_value / status / updated_at).
-- כל שאר העמודות — של המאמן. המאמן והאדמין לא מוגבלים.
create or replace function public.player_goals_player_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- המאמן הבעלים, יוצר השורה, או אדמין — ללא הגבלה
  if auth.uid() is null
     or auth.uid() = old.coach_id
     or coalesce(public.is_admin(), false) then
    return new;
  end if;

  if auth.uid() = old.player_id then
    if new.id           is distinct from old.id
    or new.coach_id     is distinct from old.coach_id
    or new.player_id    is distinct from old.player_id
    or new.team         is distinct from old.team
    or new.period       is distinct from old.period
    or new.title        is distinct from old.title
    or new.description  is distinct from old.description
    or new.metric_type  is distinct from old.metric_type
    or new.target_value is distinct from old.target_value
    or new.unit         is distinct from old.unit
    or new.due_date     is distinct from old.due_date
    or new.created_at   is distinct from old.created_at then
      raise exception 'שחקן רשאי לעדכן רק את ההתקדמות והסטטוס של המטרה';
    end if;
  end if;
  return new;
end;
$$;

do $pgt$
begin
  if to_regclass('public.player_goals') is not null then
    drop trigger if exists trg_player_goals_player_guard on public.player_goals;
    create trigger trg_player_goals_player_guard
      before update on public.player_goals
      for each row execute function public.player_goals_player_guard();
  end if;
end $pgt$;


-- ============================================================
-- 5) FOR ALL שבודק רק player_id — הזרקת שורות לדוחות של מאמן זר
--    (AUDIT: supabase_effort.sql:24, supabase_team_slots.sql:53, supabase_goal_logs.sql:20)
--
-- בשלוש הטבלאות ה-WITH CHECK בדק רק player_id = auth.uid(), בעוד coach_id/team/
-- session_id/goal_id חופשיים — כלומר כל שחקן יכול היה להזריק דירוגי מאמץ
-- והערות טקסט חופשי לדוחות של כל מאמן במערכת (גם ערוץ להעברת טקסט למאמן זר).
-- ============================================================

-- 5.1 session_effort — יש coach_id + team, אז אפשר בדיקה מלאה
do $se$
begin
  if to_regclass('public.session_effort') is null then
    raise notice 'CourtSide: session_effort לא קיימת — דולג.';
    return;
  end if;
  drop policy if exists "se_player_all" on public.session_effort;
  create policy "se_player_all" on public.session_effort
    for all to authenticated
    using (player_id = auth.uid())
    with check (
      player_id = auth.uid()
      and (
        coach_id = auth.uid()
        or public.is_team_member(coach_id, team)
      )
    );
end $se$;

-- 5.2 session_goal_marks — יש coach_id אבל אין team, ולכן:
--     (א) חברות מאושרת אצל אותו מאמן, (ב) המטרה המסומנת באמת שייכת לאותו מאמן.
do $sg$
begin
  if to_regclass('public.session_goal_marks') is null then
    raise notice 'CourtSide: session_goal_marks לא קיימת — דולג.';
    return;
  end if;
  drop policy if exists "sgm_player_all" on public.session_goal_marks;
  create policy "sgm_player_all" on public.session_goal_marks
    for all to authenticated
    using (player_id = auth.uid())
    with check (
      player_id = auth.uid()
      and (coach_id = auth.uid() or public.is_approved_under_coach(coach_id))
      and exists (
        select 1 from public.player_goals g
         where g.id = session_goal_marks.goal_id
           and g.coach_id = session_goal_marks.coach_id
      )
    );
end $sg$;

-- 5.3 player_goal_logs — אין בטבלה coach_id/team כלל; השיוך היחיד הוא goal_id.
--     לכן במקום is_team_member ישיר, מאמתים שהמטרה עצמה שייכת לשחקן
--     (או שהיא מטרה קבוצתית של קבוצה שהוא חבר מאושר בה) — בדיוק אותה הגנה.
do $gl$
begin
  if to_regclass('public.player_goal_logs') is null then
    raise notice 'CourtSide: player_goal_logs לא קיימת — דולג.';
    return;
  end if;
  drop policy if exists "pgl_player_all" on public.player_goal_logs;
  create policy "pgl_player_all" on public.player_goal_logs
    for all to authenticated
    using (player_id = auth.uid())
    with check (
      player_id = auth.uid()
      and exists (
        select 1 from public.player_goals g
         where g.id = player_goal_logs.goal_id
           and (
             g.player_id = auth.uid()
             or (g.player_id is null and g.team is not null and public.is_team_member(g.coach_id, g.team))
           )
      )
    );
end $gl$;


-- ============================================================
-- 6) assignment_completions — אימות assignment_id
--    (AUDIT: supabase_players.sql:130)
--
-- הבעיה: compl_player_all הוא FOR ALL עם בדיקת player_id בלבד, כך ששחקן יכול
-- לסמן "ביצעתי" על שיגורים של קבוצות אחרות ולזהם את מסך המעקב של מאמן זר.
-- התנאי החדש זהה בדיוק לתנאי הקריאה assign_player_read.
-- ============================================================

do $ac$
begin
  if to_regclass('public.assignment_completions') is null then
    raise notice 'CourtSide: assignment_completions לא קיימת — דולג.';
    return;
  end if;
  drop policy if exists "compl_player_all" on public.assignment_completions;
  create policy "compl_player_all" on public.assignment_completions
    for all to authenticated
    using (player_id = auth.uid())
    with check (
      player_id = auth.uid()
      and exists (
        select 1 from public.player_assignments a
         where a.id = assignment_completions.assignment_id
           and (
             a.player_id = auth.uid()
             or (a.player_id is null and a.team is not null and public.is_team_member(a.coach_id, a.team))
           )
      )
    );
end $ac$;


-- ============================================================
-- 7) drills — רק מאמן מפרסם לספריית התרגילים המשותפת
--    (AUDIT: supabase_stage3.sql:68)
--
-- הבעיה: drills_insert_own/drills_update_own דרשו רק created_by = auth.uid()
-- בלי בדיקת תפקיד, כך ששחקן יכול היה להכניס תרגילים (כולל is_public=true עם
-- קישורי וידאו שרירותיים) לספרייה של המאמנים דרך ה-API, למרות ש-ה-UI חוסם.
-- ============================================================

do $dr$
begin
  if to_regclass('public.drills') is null then
    raise notice 'CourtSide: drills לא קיימת — דולג.';
    return;
  end if;

  drop policy if exists "drills_insert_own" on public.drills;
  create policy "drills_insert_own" on public.drills
    for insert to authenticated
    with check (
      created_by = auth.uid()
      and (public.is_coach() or coalesce(public.is_admin(), false))
    );

  drop policy if exists "drills_update_own" on public.drills;
  create policy "drills_update_own" on public.drills
    for update to authenticated
    using (
      created_by = auth.uid()
      and (public.is_coach() or coalesce(public.is_admin(), false))
    )
    with check (
      created_by = auth.uid()
      and (public.is_coach() or coalesce(public.is_admin(), false))
    );
end $dr$;


-- ============================================================
-- 8) client_errors — אורך, שיוך, קצב ושמירה
--    (AUDIT: supabase_privacy4.sql:209)
--
-- הבעיה: משתמש רשום יכול היה להזרים שורות ללא הגבלה, עם message/stack באורך
-- בלתי מוגבל וגם עם user_id = null (בלי שיוך). זה גם נתיב ניפוח מסד זול, וגם
-- מקום שבו stack traces ממסכי שחקנים עלולים לשמור PII של קטינים ללא מדיניות
-- שמירה.
-- ============================================================

do $ce$
begin
  if to_regclass('public.client_errors') is null then
    raise notice 'CourtSide: client_errors לא קיימת — סעיף 8 דולג.';
    return;
  end if;

  -- 8.1 מגבלות אורך. not valid — שורות היסטוריות לא נבדקות (ואין צורך למחוק אותן).
  if not exists (select 1 from pg_constraint where conname = 'client_errors_msg_len') then
    alter table public.client_errors
      add constraint client_errors_msg_len check (char_length(message) <= 1000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_errors_stack_len') then
    alter table public.client_errors
      add constraint client_errors_stack_len check (stack is null or char_length(stack) <= 4000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_errors_screen_len') then
    alter table public.client_errors
      add constraint client_errors_screen_len check (screen is null or char_length(screen) <= 200) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_errors_ua_len') then
    alter table public.client_errors
      add constraint client_errors_ua_len check (user_agent is null or char_length(user_agent) <= 300) not valid;
  end if;

  -- 8.2 שיוך חובה: אין יותר user_id = null.
  --     ErrorBoundary.jsx שולח user_id = null כשה-getUser נכשל; באותו מקרה
  --     ההכנסה תידחה, והקוד שם כבר בולע את השגיאה עם console.warn בלבד.
  drop policy if exists "cerr_insert_self" on public.client_errors;
  create policy "cerr_insert_self" on public.client_errors
    for insert to authenticated with check (user_id = auth.uid());
end $ce$;

-- 8.3 הגבלת קצב + דחיית כפילויות.
--     מחזיר NULL ב-BEFORE INSERT = השורה נזרקת בשקט, בלי שגיאה לקליינט
--     (עדיף מ-raise: דיווח שגיאה לא אמור להפיל עוד שגיאה על המשתמש).
create or replace function public.client_errors_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_recent int;
begin
  if new.user_id is null then
    return null;
  end if;

  -- אותה הודעה בדיוק מאותו משתמש ב-10 הדקות האחרונות — כבר נרשמה
  if exists (
    select 1 from public.client_errors c
     where c.user_id = new.user_id
       and c.message = new.message
       and c.created_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;

  -- תקרה: 50 דיווחים למשתמש בשעה
  select count(*) into v_recent
    from public.client_errors c
   where c.user_id = new.user_id
     and c.created_at > now() - interval '1 hour';
  if v_recent >= 50 then
    return null;
  end if;

  return new;
end;
$$;

do $cet$
begin
  if to_regclass('public.client_errors') is not null then
    drop trigger if exists trg_client_errors_rate_limit on public.client_errors;
    create trigger trg_client_errors_rate_limit
      before insert on public.client_errors
      for each row execute function public.client_errors_rate_limit();
    create index if not exists client_errors_user_created_idx
      on public.client_errors (user_id, created_at desc);
  end if;
end $cet$;

-- 8.4 שמירה (retention) — 30 יום, בהתאם למדיניות הפרטיות.
--     ⚑ אין pg_cron בפרויקט, ולכן זו פונקציה **ידנית/תזמון חיצוני** ולא job
--     אוטומטי. הרץ אותה מה-SQL Editor אחת לחודש:
--         select public.purge_old_client_errors();          -- 30 יום כברירת מחדל
--     או, אם תפעיל את ההרחבה pg_cron בדשבורד של Supabase:
--         select cron.schedule('purge-client-errors', '0 3 * * *',
--                              $q$ select public.purge_old_client_errors(30) $q$);
create or replace function public.purge_old_client_errors(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_deleted int := 0;
begin
  -- מותר לאדמין, או להרצה בלי JWT (SQL Editor / cron / service role)
  if not (auth.uid() is null or coalesce(public.is_admin(), false)) then
    raise exception 'ניקוי לוג השגיאות מותר למנהלים בלבד';
  end if;
  if to_regclass('public.client_errors') is null then
    return 0;
  end if;
  delete from public.client_errors
   where created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_old_client_errors(int) from public, anon;
do $pc$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.purge_old_client_errors(int) to service_role;
  end if;
end $pc$;


-- ============================================================
-- 9) בקשת הצטרפות רק דרך קוד — public.join_with_code()
--    (AUDIT: supabase_players.sql:49)
--
-- הבעיה: memb_player_insert מתיר לכל משתמש רשום ליצור בקשת חברות ל-(coach_id,
-- team) שרירותיים, בלי שום קישור לקוד ההצטרפות שדרכו הוא כביכול הגיע. אפשר
-- לסרוק מזהי מאמנים (profiles / drills.created_by) ולהציף כל מאמן בבקשות —
-- מה שמעלה מאוד את הסיכוי שגורם זר יאושר בטעות לקבוצה של קטינים.
--
-- ============================================================================
-- ⚠ דורש תיקון בפרונט
-- ============================================================================
-- src/players.js:74 מבצע כרגע insert **ישיר** לטבלת team_memberships:
--     await supabase.from('team_memberships').insert({ coach_id, team, player_id, status:'pending' })
-- ברגע שמדיניות ה-INSERT הישירה תוסר, הקריאה הזו תיכשל ב-42501 וזרימת
-- ההצטרפות של השחקנים תמות. לכן:
--
--   1) קודם לפרוס פרונט שמשתמש ב-RPC (עם נפילה לאחור לקוד הישן).
--   2) רק אחר כך להריץ את סעיף 9ב למטה (המתג v_frontend_ready).
--
-- החוזה המדויק של ה-RPC:
--     supabase.rpc('join_with_code', { p_code: 'ABC123' })
--   מחזיר jsonb:
--     { ok:true,  status:'pending'|'approved'|'rejected',
--       coach_id:uuid, team:text, already?:true }
--     { ok:false, reason:'auth' | 'not-found' | 'expired' | 'rate-limited' | 'self' }
--   נפילה לאחור (עד שהפונקציה תיפרס בפרודקשן): אם השגיאה היא PGRST202 / 42883
--   ("function does not exist") — להמשיך בקוד הישן של resolve_join_code + insert.
--   ההתראה למאמן ("שחקן ביקש להצטרף לקבוצה שלך") נשארת בצד הלקוח כמו היום.
-- ============================================================================

create or replace function public.join_with_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid    uuid := auth.uid();
  v_coach  uuid;
  v_team   text;
  v_status text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  -- הפענוח עובר דרך resolve_join_code כדי לרשת ממנה את סינון הקודים שפגו
  -- ואת מונה הניסיונות הכושלים (סעיף 10).
  select r.coach_id, r.team into v_coach, v_team
    from public.resolve_join_code(p_code) r
   limit 1;

  if v_coach is null then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_coach = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  select m.status into v_status
    from public.team_memberships m
   where m.coach_id = v_coach and m.team = v_team and m.player_id = v_uid;

  if v_status is not null then
    return jsonb_build_object('ok', true, 'status', v_status,
                              'coach_id', v_coach, 'team', v_team, 'already', true);
  end if;

  insert into public.team_memberships (coach_id, team, player_id, status)
  values (v_coach, v_team, v_uid, 'pending');

  return jsonb_build_object('ok', true, 'status', 'pending',
                            'coach_id', v_coach, 'team', v_team);
exception
  when unique_violation then
    -- מרוץ בין שתי לחיצות — הבקשה כבר קיימת
    return jsonb_build_object('ok', true, 'status', 'pending',
                              'coach_id', v_coach, 'team', v_team, 'already', true);
  when insufficient_privilege then
    return jsonb_build_object('ok', false, 'reason', 'rate-limited');
end;
$$;

revoke all on function public.join_with_code(text) from public, anon;
grant execute on function public.join_with_code(text) to authenticated;


-- ============================================================
-- 10) קודי הצטרפות — תפוגה, רוטציה ומונה ניסיונות
--     (AUDIT: supabase_security3.sql:83)
--
-- הבעיה: הקודים (6 תווים) קבועים לנצח לכל (coach, team) — קוד שדלף פעם אחת
-- בקבוצת וואטסאפ נשאר תקף לכל החיים; ול-resolve_join_code אין הגבלת קצב,
-- אין נעילה אחרי כשלונות ואין לוג.
-- ============================================================

-- 10.1 תפוגה: null = לתמיד (ברירת מחדל — לא משנה התנהגות של קודים קיימים)
alter table public.team_join_codes add column if not exists expires_at timestamptz;

comment on column public.team_join_codes.expires_at is
  'תפוגת הקוד. null = ללא תפוגה (ברירת מחדל, תואם לאחור). רוטציה: המאמן כבר '
  'רשאי למחוק ולהוסיף שורה דרך המדיניות join_codes_owner_all — כפתור "רענן קוד" '
  'במסך הקבוצה עושה delete+insert, בלי צורך ב-RPC נוסף.';

-- 10.2 מונה ניסיונות פענוח (למניעת סריקה ולתחקור)
create table if not exists public.join_code_attempts (
  id         bigserial primary key,
  user_id    uuid references public.profiles(id) on delete cascade,
  code_hash  text,                       -- md5 בלבד, לא הקוד עצמו
  ok         boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.join_code_attempts enable row level security;

-- אף אחד לא כותב/קורא ישירות; הכתיבה נעשית רק דרך resolve_join_code
-- (SECURITY DEFINER) והקריאה שמורה לאדמין.
drop policy if exists "jca_admin_read" on public.join_code_attempts;
create policy "jca_admin_read" on public.join_code_attempts
  for select to authenticated using (coalesce(public.is_admin(), false));

create index if not exists join_code_attempts_user_idx
  on public.join_code_attempts (user_id, created_at desc);

revoke all on table public.join_code_attempts from anon;

-- 10.3 resolve_join_code — סינון קודים שפגו + חסימה אחרי 10 כשלונות בשעה.
--      חתימת ההחזרה נשמרת בדיוק (create or replace לא יכול לשנות אותה),
--      אבל השפה עוברת ל-plpgsql והפונקציה הופכת ל-volatile כדי שתוכל לרשום
--      את הניסיון. הפרונט קורא ב-POST /rpc בכל מקרה, ולכן זה שקוף לו.
create or replace function public.resolve_join_code(p_code text)
returns table (coach_id uuid, team text)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_fails int;
  -- משתנים סקלריים ולא record: אם ה-SELECT לא מוצא שורה, שניהם פשוט null
  -- (ואין תלות בהתנהגות של record לא-מאותחל). השמות שונים מ-coach_id/team
  -- כי אלה כבר תפוסים כפרמטרי OUT של החתימה.
  v_found uuid;
  v_tm    text;
  v_code  text := upper(btrim(coalesce(p_code, '')));
begin
  if v_uid is null then
    raise exception 'נדרשת התחברות כדי לממש קוד הצטרפות';
  end if;
  if v_code = '' then
    return;
  end if;

  -- הגבלת קצב: 10 ניסיונות כושלים בשעה האחרונה
  select count(*) into v_fails
    from public.join_code_attempts a
   where a.user_id = v_uid
     and a.ok = false
     and a.created_at > now() - interval '1 hour';
  if v_fails >= 10 then
    raise exception 'יותר מדי ניסיונות קוד שגויים. נסו שוב בעוד שעה.'
      using errcode = 'insufficient_privilege';
  end if;

  select c.coach_id, c.team
    into v_found, v_tm
    from public.team_join_codes c
   where upper(c.code) = v_code
     and (c.expires_at is null or c.expires_at > now())
   limit 1;

  insert into public.join_code_attempts (user_id, code_hash, ok)
  values (v_uid, md5(v_code), v_found is not null);

  if v_found is null then
    return;                       -- קוד לא קיים / פג — מחזירים ריק, כמו קודם
  end if;

  coach_id := v_found;
  team     := v_tm;
  return next;
end;
$$;

revoke all on function public.resolve_join_code(text) from public, anon;
grant execute on function public.resolve_join_code(text) to authenticated;

-- 10.4 ניקוי תקופתי של לוג הניסיונות (אותו דפוס ידני כמו client_errors)
create or replace function public.purge_old_join_attempts(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_deleted int := 0;
begin
  if not (auth.uid() is null or coalesce(public.is_admin(), false)) then
    raise exception 'ניקוי לוג הניסיונות מותר למנהלים בלבד';
  end if;
  delete from public.join_code_attempts
   where created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_old_join_attempts(int) from public, anon;


-- ============================================================
-- 11) דף התרגיל הציבורי — בלי created_by
--     (AUDIT: supabase_engagement.sql:144)
--
-- הבעיה: drills_public_anon_read (וגם drills_select_public_or_own שנוצרה בלי
-- TO ולכן חלה גם על anon) חושפת לגולש לא-מזוהה את **כל** העמודות של תרגיל
-- ציבורי, כולל created_by — כלומר רשימת ה-UUID של כל המאמנים במערכת, בלי
-- צורך בחשבון. זה חומר גלם למיפוי מזהים בקריאות אחרות.
--
-- הפתרון: VIEW ייעודי עם שדות תצוגה בלבד (security_invoker=false → רץ
-- בהרשאות הבעלים ולכן לא נחסם על ידי מדיניות ה-drills עצמה).
--
-- ============================================================================
-- ⚠ דורש תיקון בפרונט
-- ============================================================================
-- src/PublicDrill.jsx:20 קורא כיום:
--     supabase.from('drills').select('*').eq('id', drillId).maybeSingle()
-- צריך לעבור ל-:
--     supabase.from('public_drills').select('*').eq('id', drillId).maybeSingle()
-- עם נפילה לאחור: אם השגיאה היא 42P01 ("relation does not exist") — לחזור
-- לשאילתה הישנה, כדי שהדף יעבוד גם לפני שה-SQL הזה רץ בפרודקשן.
-- רק אחרי פריסת הפרונט מפעילים את סעיף 11ב (המתג v_frontend_ready).
-- ============================================================================

do $pv$
declare
  v_cols text;
  v_where text := 'true';
begin
  if to_regclass('public.drills') is null then
    raise notice 'CourtSide: drills לא קיימת — סעיף 11 דולג.';
    return;
  end if;

  -- רשימת עמודות דינמית: הפרויקט הוסיף tags/is_public/board/image_url רק
  -- ב-supabase_launch_migration.sql, וייתכן שסביבה כלשהי עדיין בלעדיהן.
  select string_agg(format('d.%I', column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'drills'
     and column_name in (
       'id', 'title', 'description', 'category', 'age_groups', 'duration_minutes',
       'equipment', 'video_url', 'players', 'difficulty', 'goal', 'reps',
       'coach_notes', 'tags', 'image_url', 'board', 'created_at'
     );

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'drills' and column_name = 'is_public') then
    v_where := 'd.is_public = true';
  end if;

  -- drop + create ולא create or replace: replace לא יכול לשנות את רשימת
  -- העמודות, וזה בדיוק מה שקורה כשסביבה מקבלת עמודות חדשות ל-drills.
  execute 'drop view if exists public.public_drills';
  execute format(
    'create view public.public_drills with (security_invoker = false) as
       select %s from public.drills d where %s', v_cols, v_where);

  execute 'grant select on public.public_drills to anon, authenticated';
end $pv$;


-- ============================================================
-- ⚠⚠ מתג ידני — סעיפים 9ב + 11ב (מנתקים גישה שהפרונט עדיין משתמש בה)
--
-- שנה את v_frontend_ready ל-true **רק אחרי** שהפרונט הבא נפרס לפרודקשן:
--   • src/players.js       → supabase.rpc('join_with_code', { p_code })
--   • src/PublicDrill.jsx  → supabase.from('public_drills')
-- עד אז הבלוק מדלג בשקט, וכל שאר הקובץ ממשיך לרוץ.
-- ============================================================
do $gate$
declare
  v_frontend_ready boolean := false;   -- ←←← שנה ל-true אחרי פריסת הפרונט
begin
  if not v_frontend_ready then
    raise notice 'CourtSide: סעיפים 9ב+11ב דולגו (v_frontend_ready=false). ראה את ההערות המסומנות ⚠.';
    return;
  end if;

  -- 9ב — ביטול ה-INSERT הישיר ל-team_memberships. מעכשיו רק join_with_code().
  if to_regclass('public.team_memberships') is not null then
    drop policy if exists "memb_player_insert" on public.team_memberships;
    raise notice 'CourtSide: memb_player_insert הוסרה — הצטרפות רק דרך join_with_code().';
  end if;

  -- 11ב — anon לא קורא יותר את טבלת drills ישירות, רק את ה-VIEW public_drills.
  if to_regclass('public.drills') is not null then
    drop policy if exists "drills_public_anon_read" on public.drills;
    drop policy if exists "drills_select_public_or_own" on public.drills;
    create policy "drills_select_public_or_own" on public.drills
      for select to authenticated
      using (is_public or created_by = auth.uid());
    raise notice 'CourtSide: קריאת drills הוגבלה ל-authenticated; אנונימי עובר דרך public_drills.';
  end if;
end $gate$;
-- ⚑ הערת סדר: אם supabase_rls_hardening_3_8.sql ירוץ **אחרי** הקובץ הזה והוא
--   יוצר מחדש את drills_public_anon_read / drills_select_public_or_own בלי TO,
--   סעיף 11ב יתבטל. במקרה כזה הרץ את הקובץ הזה שוב (הוא אידמפוטנטי).


-- ============================================================
-- 12) אינדקסים לעמודות שמופיעות ב-USING של מדיניות RLS
--     (AUDIT: supabase_teams_admin.sql:87)
--
-- בלי אלה כל שאילתה סורקת טבלה מלאה תחת הערכת מדיניות לכל שורה. בטבלאות
-- ההודעות והסגל זה מתדרדר לינארית עם הגידול.
--
-- ⚑ במכוון "create index if not exists" ולא "create index concurrently":
--   CONCURRENTLY אינו יכול לרוץ בתוך טרנזקציה, וה-SQL Editor של Supabase עוטף
--   את כל הקובץ בטרנזקציה אחת — כלומר CONCURRENTLY היה מפיל את כל הקובץ.
--   הטבלאות כאן קטנות ולכן נעילת הכתיבה הקצרה זניחה. אם בעתיד טבלה תגדל
--   מאוד — הרץ את השורה שלה לבד, כהצהרה יחידה, עם CONCURRENTLY.
-- ============================================================

do $ix$
declare
  r record;
begin
  for r in
    select * from (values
      ('team_players',  'tp_player_idx',            '(player_id)'),
      ('team_players',  'tp_coach_team_idx',        '(coach_id, team)'),
      ('messages',      'messages_recipient_idx',   '(recipient_id, created_at desc)'),
      ('messages',      'messages_sender_idx',      '(sender_id, created_at desc)'),
      ('drills',        'drills_created_by_idx',    '(created_by)'),
      ('drills',        'drills_is_public_idx',     '(is_public)'),
      ('team_goals',    'team_goals_coach_idx',     '(coach_id)'),
      ('team_games',    'team_games_coach_team_idx','(coach_id, team)'),
      ('team_iba',      'team_iba_coach_idx',       '(coach_id)'),
      ('team_staff',    'team_staff_coach_idx',     '(coach_id)'),
      ('profiles',      'profiles_role_idx',        '(role)'),
      ('team_memberships', 'memb_coach_status_idx', '(coach_id, status)'),
      -- נוצרת בגל הזה ב-supabase_parent_consent.sql; מדולגת אם עוד לא קיימת
      ('consents',      'consents_minor_idx',       '(minor_id, consent_type, created_at desc)')
    ) as t(tbl, idx, cols)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      begin
        execute format('create index if not exists %I on public.%I %s', r.idx, r.tbl, r.cols);
      exception
        when undefined_column then
          raise notice 'CourtSide: אינדקס % דולג — עמודה חסרה ב-%.', r.idx, r.tbl;
        when others then
          raise notice 'CourtSide: אינדקס % דולג (%).', r.idx, sqlerrm;
      end;
    end if;
  end loop;
end $ix$;


-- ============================================================
-- 13) ⚑ בעיה ידועה שלא נפתרת כאן: סדר ההרצה ההיסטורי בלדג'ר שגוי
--     (AUDIT: supabase_migrations_ledger.sql:43)
--
-- הרישום למפרע ב-supabase_migrations_ledger.sql:39-50 מונה את הקבצים בסדר
-- הזה (קטע):
--     ... supabase_schedule.sql, supabase_games.sql, supabase_teams_admin.sql,
--         supabase_attendance.sql, supabase_launch_migration.sql, ...
--
-- אבל התלות האמיתית הפוכה:
--   • supabase_teams_admin.sql יוצר את video_ratings עם FK ל-public.drill_videos
--   • public.drill_videos נוצרת רק ב-supabase_launch_migration.sql
-- כלומר בסביבה חדשה (שחזור מאסון / staging) הרצה לפי הסדר הרשום **תיפול**,
-- וב-SQL Editor הכישלון מגלגל אחורה את כל הקובץ — חמש טבלאות הקבוצה
-- (team_players / team_goals / team_games / team_iba / team_staff) יישארו
-- בלי RLS ובלי מדיניות. אין היום שום דרך אוטומטית לשחזר את מצב האבטחה
-- מ-48 הקבצים.
--
-- הסדר הנכון בפועל (התלויות הקשות בלבד):
--   1. supabase_setup.sql            — profiles, handle_new_user
--   2. supabase_stage2.sql           — profiles מורחב
--   3. supabase_stage3.sql           — drills (+ stage3_ratings)
--   4. supabase_launch_migration.sql — drill_videos, drills.is_public/board/image_url
--   5. supabase_teams_admin.sql      — team_* , is_admin(), video_ratings ← דורש (4)
--   6. supabase_players.sql          — team_memberships, is_team_member()
--   7. supabase_player_v2.sql        — is_player(), is_my_roster()
--   8. שאר קבצי הפיצ'רים (sessions / effort / goals / community / …)
--   9. supabase_security*.sql, supabase_privacy4.sql — הקשחות
--  10. supabase_migrations_ledger.sql
--  11. קבצי 3.8: rls_hardening → parent_consent → הקובץ הזה
--
-- הפיצול הנדרש (לא בוצע — 48 קבצים, מסוכן לשנות עכשיו בלי CI):
--   להוציא את יצירת video_ratings מ-supabase_teams_admin.sql לקובץ נפרד
--   (למשל supabase_video_ratings.sql) שירוץ אחרי supabase_launch_migration.sql.
--
-- ההמלצה לטווח בינוני: מעבר ל-supabase/migrations עם ה-CLI ומיספור
-- 0001_/0002_ לפי התלות האמיתית, ובדיקת CI שמריצה את כל הרצף על מסד ריק.
--
-- הבעיה נרשמת כאן כתקלה ידועה ומתועדת — ראה גם את בדיקת העשן בסוף הקובץ.
-- ============================================================


-- ============================================================
-- רענון סכימת ה-API + רישום בלדג'ר
-- ============================================================
do $$
begin
  begin
    perform public.mark_migration('supabase_hardening_medium_3_8.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקת עשן — מה לבדוק אחרי ההרצה
--
--  1) mark_migration נעולה:
--       select has_function_privilege('anon',          'public.mark_migration(text)', 'execute'),
--              has_function_privilege('authenticated', 'public.mark_migration(text)', 'execute');
--     → שתי התשובות חייבות להיות false. (ההרצה מה-SQL Editor עדיין עובדת —
--       הרישום של הקובץ הזה עצמו למעלה הוא ההוכחה: select * from public.schema_migrations
--       order by ran_at desc limit 3;)
--
--  2) אין יותר פונקציית SECURITY DEFINER פתוחה ל-anon (מלבד שתי פונקציות ההסכמה):
--       select p.proname
--         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname='public' and p.prosecdef
--          and has_function_privilege('anon', p.oid, 'execute')
--          and p.proname not in ('get_consent_request','submit_parent_consent');
--     → חייב לחזור ריק.
--
--  3) אין יותר פונקציה בלי search_path:
--       select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.prokind='f' and p.proconfig is null;
--     → אמור לחזור לכל היותר enforce_minor_consent (סוכן ההסכמה מטפל בה).
--
--  4) מחשבון שחקן אמיתי (ולא מה-SQL Editor!), דרך REST:
--     א. insert ל-player_goals עם coach_id של מאמן זר  → חייב 42501
--     ב. update על מטרה שהמאמן הגדיר, עם שינוי title    → חייב שגיאה
--        "שחקן רשאי לעדכן רק את ההתקדמות והסטטוס של המטרה"
--     ג. update על אותה מטרה עם progress_value בלבד     → חייב לעבור
--     ד. insert ל-session_effort עם coach_id זר         → חייב 42501
--     ה. insert ל-assignment_completions עם assignment_id של קבוצה אחרת → 42501
--     ו. insert ל-drills                                 → חייב 42501 (שחקן אינו מאמן)
--
--  5) מחשבון מאמן: הוספה ועריכה של תרגיל ממשיכות לעבוד כרגיל.
--
--  6) זמינות: select public.set_my_availability('injured','כאב ברך');  — עדיין עובד.
--     ולשחקן ששייך לשתי קבוצות:
--       select public.set_my_availability('injured','כאב ברך', '<coach_uuid>', '<team>');
--     → רק שורת הסגל של אותו מאמן מתעדכנת.
--
--  7) קודי הצטרפות:
--       select * from public.resolve_join_code('קוד תקין');   → מחזיר שורה
--       select * from public.resolve_join_code('ZZZZZZ');      → ריק
--     11 ניסיונות שגויים ברצף מאותו משתמש → שגיאת "יותר מדי ניסיונות".
--     תפוגה: update public.team_join_codes set expires_at = now() - interval '1 day'
--            where code = '<קוד>';  → resolve_join_code מחזירה ריק.
--     select * from public.join_code_attempts order by created_at desc limit 5;  (כאדמין)
--
--  8) לוג שגיאות: שתי קריסות זהות ברצף אצל אותו משתמש → שורה אחת בלבד
--     ב-client_errors (הכפילות נזרקת בשקט).
--       select public.purge_old_client_errors(30);   → מחזיר מספר שורות שנמחקו.
--
--  9) אינדקסים:
--       select tablename, indexname from pg_indexes
--        where schemaname='public' and indexname like any (array['tp_%','messages_%','drills_%','team_%','profiles_role_idx','consents_%']);
--
-- 10) ⚠ שני הסעיפים הנעולים (9ב + 11ב) עדיין לא הופעלו. אחרי פריסת הפרונט
--     (src/players.js → join_with_code, src/PublicDrill.jsx → public_drills):
--     שנה v_frontend_ready ל-true והרץ את הקובץ שוב. אז בדוק:
--       • שחקן חדש מצטרף עם קוד → הבקשה נוצרת ומופיעה אצל המאמן.
--       • insert ישיר ל-team_memberships מחשבון שחקן → 42501.
--       • דף /#/drill/<id> בלי התחברות → נטען; ובקריאת REST ישירה
--         GET /rest/v1/drills?select=created_by עם ה-anon key → 42501/ריק.
--
-- 11) התקלה הידועה מסעיף 13 (סדר המיגרציות) **לא נסגרה** — היא מתועדת בלבד.
--     לפני שחזור לסביבה חדשה, הרץ את supabase_launch_migration.sql לפני
--     supabase_teams_admin.sql.
-- =====================================================================
