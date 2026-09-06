-- =====================================================================
-- CourtSide — תיקוני הפיילוט (צד המסד) · 6.9.2026
-- =====================================================================
-- קובץ אחד, אידמפוטנטי, בטוח להרצה חוזרת. הוא **לא** יוצר טבלאות ולא
-- מוחק מידע. הוא מחליף ארבע פונקציות קיימות ומהדק את ההרשאות על
-- טבלת הצ'ק-אין. ראו הרצת_SQL_6.9.md (עברית פשוטה) לצד הקובץ הזה.
--
-- מה מתוקן כאן
-- ------------
--  1) ONB-2  join_with_code — ילד שבקשתו נדחתה (לרוב בטעות מגע) לא יכול
--            היה לבקש שוב לעולם, והמסך אמר לו «הבקשה נשלחה». מעכשיו
--            ניסיון חדש עם קוד תקין מחזיר את הבקשה למצב «ממתין».
--  2) DI-2   _data_export_for — «המידע שלי» לא כלל את תשובות הצ'ק-אין,
--            הקטגוריה הרגישה ביותר שמוחזקת על קטין. נוסף מדור checkins.
--  3) DI-4   player_checkins — לשחקן נשארה זכות DELETE ישירה, ולכן דגל
--            אדום («חולה» / «כאב שמפריע») היה נמחק בלי זכר ובלי יומן.
--            המחיקה הישירה נשללת; נשארת רק delete_my_checkins(), שמעכשיו
--            רושמת ביומן שורה מסכמת אחת (בלי התשובות עצמן).
--  4) DI-5   purge_checkins_for_roster — כלי למאמן למחוק את מה שכבר
--            נאסף על ילד מסוים, כשההורה מבקש «ותמחקו גם את מה שיש».
--  5) DI-3   retention_run_scheduled — ההבטחה «נשמר 90 יום» לא הייתה
--            מחוברת לשום דבר שרץ. מעכשיו הריצה המתוזמנת מנקה גם את
--            הצ'ק-אין. ⚠ היא עדיין **יבשה** כל עוד retention_schedule.armed
--            = false — הפירוט המלא, כולל הפקודה הידנית, בקובץ ההרצה.
--
-- ⚠ סדר הרצה — חשוב
-- ------------------
-- הקובץ מחליף פונקציות שנוצרו בקבצים קודמים. אם מריצים **שוב** מתישהו
-- אחד מהשלושה האלה, הוא ידרוס את הגרסאות שכאן, ואז יש להריץ את הקובץ
-- הזה שוב אחריו:
--     supabase_hardening_medium_3_8.sql   (join_with_code)
--     supabase_my_data.sql                (_data_export_for)
--     supabase_retention_schedule.sql     (retention_run_scheduled)
-- זה בדיוק הדפוס שכבר קיים בפרויקט (עדיף להחליף בקובץ חדש מאשר לערוך
-- מיגרציה שרצה), והמחיר היחיד שלו הוא סדר ההרצה הזה.
--
-- ⚠ אם הטבלה player_checkins לא קיימת (מסד שלא הריץ את #46) — כל הסעיפים
-- שנוגעים בה מדלגים בשקט. הלקוח שורד את שני המצבים.
--
-- הרץ אחרי #46 (supabase_checkins_4_9.sql). לא תלוי ב-#47.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) בדיקת תלות — להודיע, לא להפיל
-- ---------------------------------------------------------------------
do $dep$
begin
  if to_regprocedure('public.resolve_join_code(text)') is null then
    raise notice 'pilot_fixes: resolve_join_code חסרה — join_with_code תיווצר אבל תיכשל בזמן ריצה. הרץ קודם supabase_security3.sql.';
  end if;
  if to_regprocedure('public._export_rows(text, text[], uuid[], text[], integer)') is null then
    raise notice 'pilot_fixes: _export_rows חסרה — הרץ קודם supabase_my_data.sql, אחרת סעיף 2 לא ישרת אף אחד.';
  end if;
  if to_regclass('public.player_checkins') is null then
    raise notice 'pilot_fixes: player_checkins לא קיימת — סעיפים 3-5 ידלגו בשקט (זה תקין).';
  end if;
  if to_regprocedure('public.retention_run_scheduled(boolean)') is null then
    raise notice 'pilot_fixes: retention_run_scheduled לא קיימת — היא תיווצר כאן; מומלץ להריץ אחר כך את supabase_retention_schedule.sql כדי לקבל גם את התזמון והמתג.';
  end if;
end $dep$;


-- =====================================================================
-- 1) ONB-2 — בקשת הצטרפות שנדחתה חייבת להיות ניתנת לפתיחה מחדש
-- =====================================================================
-- המקור: supabase_hardening_medium_3_8.sql סעיף 9. הועתק כאן במלואו,
-- עם שינוי אחד בלבד (ראו ההערה בגוף הפונקציה). כל שאר ההתנהגות —
-- החוזה, ההודעות, מונה הניסיונות, security definer ו-search_path —
-- זהה מילה במילה.
--
-- למה זה קריטי בפיילוט: הרשימה של המאמן היא «אישור/דחייה» של שורות
-- שנראות דומות. דחייה אחת בטעות סוגרת לילד את הדלת לצמיתות, והוא אפילו
-- לא יודע — המסך שלו אומר «הבקשה נשלחה, ממתין לאישור המאמן».

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

  -- 6.9 — בקשה שנדחתה נפתחת מחדש (ONB-2).
  -- עד היום: כל שורת חברות קיימת הוחזרה כמות שהיא, גם 'rejected'. המסך
  -- אצל הילד בודק רק ok, ולכן הוא ראה «הבקשה נשלחה» בזמן שלא נשלח דבר,
  -- ולחיצת «דחה» אחת של המאמן — גם טעות מגע — נעלה אותו לתמיד.
  -- מעכשיו: ניסיון חדש עם קוד תקין מחזיר שורה דחויה למצב 'pending'.
  -- created_at מתעדכן כי זו באמת בקשה חדשה (רשימת המאמן ממוינת לפיו),
  -- ו-decided_at מתאפס. שאר המצבים ('pending' / 'approved') לא נגעו בהם.
  if v_status = 'rejected' then
    update public.team_memberships m
       set status = 'pending', decided_at = null, created_at = now()
     where m.coach_id = v_coach and m.team = v_team and m.player_id = v_uid
       and m.status = 'rejected'
    returning m.status into v_status;

    if v_status = 'pending' then
      -- decided_at התאפס, ולכן הראיה שהייתה דחייה נשמרת ביומן.
      begin
        if to_regclass('public.audit_log') is not null then
          insert into public.audit_log (actor, action, entity, subject, details)
          values (v_uid, 'update', 'team_memberships', v_uid,
                  jsonb_build_object('reopened_after_reject', true,
                                     'coach_id', v_coach, 'team', v_team));
        end if;
      exception when others then null;
      end;
      -- בלי 'already': הלקוח שולח התראה למאמן רק על בקשה חדשה
      -- (src/players.js:95 — status='pending' && !already), וזו אכן חדשה.
      return jsonb_build_object('ok', true, 'status', 'pending',
                                'coach_id', v_coach, 'team', v_team, 'reopened', true);
    end if;

    -- מרוץ נדיר: המאמן אישר או מחק את השורה בדיוק בין הקריאה לעדכון.
    -- קוראים שוב ומחזירים את האמת (null → ממשיכים ל-insert הרגיל).
    select m.status into v_status
      from public.team_memberships m
     where m.coach_id = v_coach and m.team = v_team and m.player_id = v_uid;
  end if;

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


-- =====================================================================
-- 2) DI-2 — «המידע שלי» חייב לכלול את תשובות הצ'ק-אין
-- =====================================================================
-- המקור: supabase_my_data.sql סעיף 4. הועתק כאן במלואו עם שתי תוספות:
-- מדור 'checkins' (+ 'checkins_coach_logged'), והזכרת הקטגוריה בטקסט
-- ההסבר שבתוך הקובץ המיוצא. שום מדור קיים לא שונה ולא הוסר.
--
-- ⚠⚠ הפונקציה הזו חייבת להישאר SECURITY INVOKER — האזהרה המלאה בראש
-- supabase_my_data.sql: קובץ ההקשחה מעניק EXECUTE ל-authenticated לכל
-- פונקציית DEFINER ב-public, ולכן DEFINER כאן היה מאפשר לכל משתמש
-- לשאוב את התיק המלא של כל אחד אחר. אין כאן security definer בכוונה.

create or replace function public._data_export_for(
  p_uid           uuid,
  p_source        text default 'self',
  p_coach_private boolean default true
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_ids     uuid[] := array[p_uid];      -- מזהה החשבון
  v_roster  uuid[] := '{}'::uuid[];      -- מזהי שורות הסגל שלו (team_players.id)
  v_profile jsonb;
  v_out     jsonb;
begin
  if p_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_subject');
  end if;

  -- מזהי הסגל. דינמי + עטוף בחריגה כי team_players.player_id נוסף
  -- בגל מאוחר, ובמסד שבו הוא חסר אסור שכל הייצוא ייפול.
  if to_regclass('public.team_players') is not null then
    begin
      execute 'select coalesce(array_agg(id), ''{}''::uuid[])
                 from public.team_players where player_id = $1'
        into v_roster using p_uid;
    exception when others then
      v_roster := '{}'::uuid[];
    end;
  end if;

  v_profile := public._export_one(public._export_rows('profiles', array['id'], v_ids));

  v_out := jsonb_build_object(
    'ok',           true,
    'generated_at', now(),
    'subject_id',   p_uid,
    'source',       p_source,

    -- ----- הפרופיל, ההורה, וההסכמות -----
    'profile',  v_profile,
    'guardian', public._export_one(public._export_rows('guardians', array['minor_id'], v_ids)),
    -- consents היא append-only וזו הראיה המשפטית; מוחזרת במלואה,
    -- כולל denied ו-revoked, כי היסטוריית הסירובים היא בדיוק מה
    -- שהורה מבקש לראות.
    'consents', public._export_rows('consents', array['minor_id'], v_ids, '{}'::text[], 5000),
    -- token_hash מוסר. ראה ההסבר ב-_export_rows.
    'consent_requests', public._export_rows(
        'consent_requests', array['minor_id'], v_ids, array['token_hash']),

    -- ----- הסגל והשיוך לקבוצות -----
    'roster',      public._export_rows('team_players', array['player_id'], v_ids),
    'memberships', public._export_rows('team_memberships', array['player_id'], v_ids),

    -- ----- שיגורים ומשימות -----
    'assignments',            public._export_rows('player_assignments', array['player_id'], v_ids),
    'assignment_completions', public._export_rows('assignment_completions', array['player_id'], v_ids),

    -- ----- מטרות -----
    'goals',              public._export_rows('player_goals', array['player_id'], v_ids),
    'goal_logs',          public._export_rows('player_goal_logs', array['player_id'], v_ids, '{}'::text[], 5000),
    'session_goal_marks', public._export_rows('session_goal_marks', array['player_id'], v_ids, '{}'::text[], 5000),

    -- ----- מאמץ, מצב רוח ומשוב -----
    'effort',                 public._export_rows('session_effort', array['player_id'], v_ids, '{}'::text[], 5000),
    'coach_feedback',         public._export_rows('player_feedback', array['player_id'], v_ids),
    -- סקירות אימון שבהן הוא סומן MVP — הוא מוזכר שם בשמו
    'session_reviews_as_mvp', public._export_rows('session_reviews', array['mvp_player_id'], v_ids),

    -- ----- נוכחות ואישורי הגעה -----
    -- ⚠ שתי הראשונות לפי v_roster (team_players.id), לא לפי החשבון
    'attendance_practice', public._export_rows('practice_attendance', array['player_id'], v_roster, '{}'::text[], 5000),
    'attendance_games',    public._export_rows('game_attendance',     array['player_id'], v_roster, '{}'::text[], 5000),
    'rsvp',                public._export_rows('practice_rsvp',       array['player_id'], v_ids,   '{}'::text[], 5000),

    -- ----- צ'ק-אין הבוקר (6.9) -----
    -- זו הקטגוריה הרגישה ביותר שהמערכת מחזיקה על קטין (שינה, אנרגיה,
    -- מצב הגוף, אזורי כאב ו«אני חולה»), והיא נוצרה אחרי שהקובץ הזה נכתב.
    -- ייצוא שכותרתו «כל המידע» בלי המדור הזה אינו ייצוא מלא.
    -- שני מדורים כי לשורה יש שני מזהים אפשריים: דיווח עצמי (player_id)
    -- ודיווח שהמאמן רשם על שורת הסגל (roster_id, נתיב שמור לעתיד).
    'checkins',              public._export_rows('player_checkins', array['player_id'], v_ids,    '{}'::text[], 5000),
    'checkins_coach_logged', public._export_rows('player_checkins', array['roster_id'], v_roster, '{}'::text[], 5000),

    -- ----- תוכן שהוא יצר (רלוונטי בעיקר למאמן) -----
    'schedule_entries',        public._export_rows('schedule_entries', array['created_by'], v_ids),
    'drills_authored',         public._export_rows('drills',          array['created_by'], v_ids),
    'training_plans_authored', public._export_rows('training_plans',  array['created_by'], v_ids),
    'saved_drills',            public._export_rows('saved_drills',    array['user_id'],    v_ids),

    -- ----- הודעות -----
    --
    -- למה סיכום ולא תוכן:
    -- messages היא התכתבות אישית דו-צדדית. ייצוא של גוף ההודעות היה
    -- מוסר לצד אחד את *הצד השני* של כל שיחה — כלומר, כדי לכבד את זכות
    -- העיון של אדם אחד היינו פוגעים בפרטיותם של כל מי שהתכתב איתו.
    -- לכן: כמות וטווח תאריכים בלבד. זו מדיניות מקובלת בייצוא נתונים,
    -- והיא מוצהרת במפורש במדור notes כדי שהמשתמש יידע שהושמט משהו.
    'messages_summary', jsonb_build_object(
      'direct_sent',     public._export_summary('messages', array['sender_id'],    v_ids),
      'direct_received', public._export_summary('messages', array['recipient_id'], v_ids)
    ),

    -- מנגד: תוכן שהוא **המחבר היחיד** שלו מוחזר במלואו — צ'אט קבוצה,
    -- ערוץ שחקנים, פוסטים ותגובות בקהילה. שם אין "צד שני" בשורה, אז
    -- אין מה להגן עליו, ואין סיבה למנוע ממנו את מילותיו שלו.
    'own_content', jsonb_build_object(
      'team_messages',    public._export_rows('team_messages',   array['user_id'], v_ids, '{}'::text[], 5000),
      'player_messages',  public._export_rows('player_messages', array['user_id'], v_ids, '{}'::text[], 5000),
      'community_posts',  public._export_rows('community_posts', array['user_id'], v_ids),
      'community_comments', public._export_rows('community_post_comments', array['user_id'], v_ids),
      'community_messages', public._export_rows('community_messages', array['user_id', 'sender_id'], v_ids, '{}'::text[], 5000)
    ),

    -- ----- התראות -----
    'notifications_received', public._export_rows('notifications', array['user_id'],  v_ids, '{}'::text[], 5000),
    -- גם התראות שהוא *גרם* להן מזכירות אותו בשמו
    'notifications_caused',   public._export_rows('notifications', array['actor_id'], v_ids, '{}'::text[], 5000),

    -- ----- פניות, מחיקה, דיווחים, שגיאות -----
    'admin_requests',            public._export_rows('admin_requests', array['user_id'], v_ids),
    'account_deletion_requests', public._export_rows('account_deletion_requests', array['user_id'], v_ids),
    'reports_filed',             public._export_rows('reports', array['reporter_id'], v_ids),
    'client_errors',             public._export_rows('client_errors', array['user_id'], v_ids)
  );

  -- ----- הטקסט החופשי של המאמן -----
  if p_coach_private then
    v_out := v_out || jsonb_build_object(
      'coach_private_notes',
      public._export_rows('coach_notes', array['roster_id'], v_roster)
    );
  else
    v_out := v_out || jsonb_build_object(
      'coach_private_notes', null,
      'withheld', jsonb_build_object(
        'coach_free_text',
        'הערות חופשיות שהמאמן כתב על השחקן (coach_notes, וכן notes / '
        || 'injury_note / coach_notes בשורת הסגל) אינן נכללות בייצוא '
        || 'שנעשה דרך קישור הניהול. ניתן לקבלן דרך חשבון השחקן עצמו, '
        || 'או בפנייה לצוות במסך «פנייה למנהל».')
    );
    -- ומהשורות עצמן משמיטים את אותם שדות.
    -- רק כשזה באמת מערך: null (הטבלה לא בסכימה) ו-{"_error"} חייבים
    -- להישאר כפי שהם, אחרת "לא בדקנו" היה נראה כמו "אין שורות סגל".
    if jsonb_typeof(v_out -> 'roster') = 'array' then
      v_out := jsonb_set(v_out, '{roster}', coalesce(
        (select jsonb_agg(e - array['notes', 'injury_note', 'coach_notes'])
           from jsonb_array_elements(v_out -> 'roster') e),
        '[]'::jsonb));
    end if;
  end if;

  -- ----- ההסבר למשתמש, בעברית, בתוך הקובץ עצמו -----
  v_out := v_out || jsonb_build_object('notes', jsonb_build_object(
    'מה_זה',
    'זהו העתק של כל המידע שמערכת CourtSide מחזיקה על החשבון הזה, '
    || 'כפי שהוא ברגע ההפקה. הופק אוטומטית בשרת.',

    'מה_כלול',
    'הפרופיל המלא (כולל שדות שאינם מוצגים במסך, כגון תאריך לידה '
    || 'ומספר טלפון), פרטי ההורה הרשום והיסטוריית ההסכמות המלאה, '
    || 'שורות הסגל שהמאמן מנהל עליך, השיוך לקבוצות, שיגורים ומשימות, '
    || 'מטרות ויומני מטרות, דירוגי מאמץ, משוב מהמאמן, נוכחות ואישורי '
    || 'הגעה, לוח אימונים, תרגילים ותוכניות שיצרת, התראות, תשובות '
    || 'הצ׳ק-אין של הבוקר (שעות שינה, אנרגיה, מצב הגוף, אזורי כאב '
    || 'ו«אני חולה») — גם דיווחים שהמאמן רשם על שורת הסגל, פניות '
    || 'למנהל ובקשות מחיקה.',

    'מה_סוכם_בכוונה',
    'התכתבות אישית (הודעות פרטיות) מופיעה כמספר הודעות וטווח תאריכים '
    || 'בלבד, ולא כתוכן. הסיבה: כל שיחה כזו שייכת לשני אנשים, ומסירת '
    || 'התוכן המלא לצד אחד הייתה חושפת את המידע של הצד השני. תוכן '
    || 'שכתבת בצ׳אט קבוצה, בערוץ השחקנים או בקהילה — שבו אתה המחבר '
    || 'היחיד של השורה — מופיע במלואו.',

    'מה_לא_נשלח_לעולם',
    'גיבוב טוקן ההסכמה (token_hash) אינו נכלל, כדי שקובץ ייצוא שדלף '
    || 'לא יאפשר להתחזות להורה. סיסמאות אינן מאוחסנות במסד הזה כלל.',

    'ערכים_מיוחדים',
    'מדור שערכו null פירושו שהטבלה אינה קיימת בגרסת המסד הזו (ולא '
    || 'שאין נתונים); מערך ריק [] פירושו שהטבלה קיימת ואין בה שורות '
    || 'עליך; ערך מהצורה {"_error":"..."} פירושו שהקריאה לאותו מדור '
    || 'נכשלה ויש לפנות לתמיכה.',

    'תקרה',
    'כל מדור מוגבל ל-2,000 עד 5,000 שורות. חשבון שמגיע לתקרה יקבל את '
    || 'השורות האחרונות שנשלפו; לקבלת הכל יש לפנות לצוות.',

    'תיקון_או_מחיקה',
    'לתיקון פרט שגוי — מסך «הפרופיל שלי». לבקשת מחיקת חשבון או לפנייה '
    || 'בכתב — מסך «פנייה למנהל».'
  ));

  return v_out;
end;
$$;

-- ההענקות נשמרות ב-create or replace, והשלילה חוזרת כאן כשכבת הגנה
-- שנייה — בדיוק כמו במקור.
revoke all on function public._data_export_for(uuid, text, boolean) from public, anon, authenticated;


-- =====================================================================
-- 3) DI-4 — הדגל האדום לא ניתן למחיקה שקטה
-- =====================================================================
-- מה היה: supabase_checkins_4_9.sql הגן על coach_ack_at/handled_at ברמת
-- ההרשאות, כדי ששחקן לא יסמן «טופל» על עצמו וימחק את הדגל האדום לפני
-- שהמאמן ראה. אבל השלילה שם הייתה `revoke insert, update` בלבד:
-- DELETE נשאר מוענק, והמדיניות pc_player_own היא `for all` — כלומר
-- אותה תוצאה בדיוק הושגה במחיקה במקום בעדכון, ובלי שום שורת יומן.
--
-- מה משתנה: המחיקה הישירה מהלקוח נשללת, המדיניות מפוצלת לשלוש
-- (קריאה / הוספה / עדכון) עם אותם תנאים בדיוק, וזכות המחיקה של
-- השחקן נשמרת — אך ורק דרך delete_my_checkins(), שמעכשיו משאירה
-- שורת יומן מסכמת.
--
-- ⚠ בדוק לפני: אין בקוד הלקוח שום מחיקה ישירה של player_checkins
-- (grep על src/ ב-6.9: CheckinCard עושה insert/update בלבד; NextPractice
-- ו-CoachTodo קוראים בלבד). הרשאת DELETE נשללת בלי לשבור מסך קיים.
do $pc$
begin
  if to_regclass('public.player_checkins') is null then
    raise notice 'pilot_fixes: אין player_checkins — סעיף 3 דולג.';
    return;
  end if;

  -- 3א) שלילת המחיקה הישירה (PostgREST): DELETE /rest/v1/player_checkins
  -- (anon נשלל גם הוא לשלמות; ממילא אין לו מדיניות על הטבלה.
  --  service_role לא נוגעים בו — הוא נתיב השרת ועוקף RLS בכוונה.)
  execute 'revoke delete on public.player_checkins from authenticated';
  execute 'revoke delete on public.player_checkins from anon';

  -- 3ב) פיצול pc_player_own. התנאים מועתקים מ-4.9 מילה במילה:
  --     USING  — רק השורות שלו, ורק מקור 'player'
  --     CHECK  — בנוסף: בלי roster_id, רק בסגל של אותו מאמן, ורק אם
  --              ההורה לא ביקש «בלי שאלות בוקר» (wellness_off)
  execute 'drop policy if exists pc_player_own on public.player_checkins';

  execute 'drop policy if exists pc_player_read on public.player_checkins';
  execute $p$
    create policy pc_player_read on public.player_checkins
      for select to authenticated
      using (player_id = auth.uid() and source = 'player')
  $p$;

  execute 'drop policy if exists pc_player_insert on public.player_checkins';
  execute $p$
    create policy pc_player_insert on public.player_checkins
      for insert to authenticated
      with check (
        player_id = auth.uid() and source = 'player'
        and roster_id is null
        and public.is_on_coach_roster(coach_id, team)
        and not exists (
          select 1 from public.team_players tp
          where tp.player_id = auth.uid()
            and tp.coach_id = player_checkins.coach_id
            and tp.team = player_checkins.team
            and tp.wellness_off
        )
      )
  $p$;

  execute 'drop policy if exists pc_player_update on public.player_checkins';
  execute $p$
    create policy pc_player_update on public.player_checkins
      for update to authenticated
      using (player_id = auth.uid() and source = 'player')
      with check (
        player_id = auth.uid() and source = 'player'
        and roster_id is null
        and public.is_on_coach_roster(coach_id, team)
        and not exists (
          select 1 from public.team_players tp
          where tp.player_id = auth.uid()
            and tp.coach_id = player_checkins.coach_id
            and tp.team = player_checkins.team
            and tp.wellness_off
        )
      )
  $p$;

  raise notice 'pilot_fixes: מדיניות השחקן על player_checkins פוצלה ל-3, ומחיקה ישירה נשללה.';
end $pc$;


-- 3ג) «מחק את התשובות שלי» — נשארת זכות מלאה של השחקן, אבל לא שקטה.
-- הזהירות: היומן מקבל **שורה מסכמת אחת** — כמה דיווחים נמחקו, בין
-- אילו תאריכים, וכמה מהם היו מסומנים כדגל — ולא את התשובות עצמן.
-- כך למאמן יש עקבה שמשהו נמחק (חובת הזהירות שלו כלפי קטין), ובלי
-- לשמר את המידע הבריאותי שהילד ביקש למחוק.
create or replace function public.delete_my_checkins()
returns void
language plpgsql
security definer
set search_path = public
as $dmc$
declare
  v_uid    uuid := auth.uid();
  v_n      bigint;
  v_flag   bigint;
  v_first  date;
  v_last   date;
begin
  if v_uid is null then
    return;
  end if;
  if to_regclass('public.player_checkins') is null then
    return;
  end if;

  begin
    select count(*), count(*) filter (where c.sick or c.pain_blocks is true),
           min(c.checkin_date), max(c.checkin_date)
      into v_n, v_flag, v_first, v_last
      from public.player_checkins c
     where c.player_id = v_uid;

    if coalesce(v_n, 0) > 0 and to_regclass('public.audit_log') is not null then
      insert into public.audit_log (actor, action, entity, subject, details)
      values (v_uid, 'delete', 'player_checkins', v_uid,
              jsonb_build_object('via', 'delete_my_checkins',
                                 'deleted', v_n,
                                 'flagged', v_flag,
                                 'first_date', v_first,
                                 'last_date', v_last));
    end if;
  exception when others then
    -- כישלון ביומן לא רשאי למנוע מהילד למחוק את המידע שלו
    null;
  end;

  delete from public.player_checkins where player_id = v_uid;
end;
$dmc$;
revoke all on function public.delete_my_checkins() from public, anon;
grant execute on function public.delete_my_checkins() to authenticated;


-- =====================================================================
-- 4) DI-5 — «ותמחקו גם את מה שכבר נאסף»
-- =====================================================================
-- wellness_off («בלי שאלות בוקר») עוצר רק דיווחים חדשים. עד היום, הורה
-- שביקש למחוק גם את מה שכבר נאסף לא קיבל תשובה מעשית: המחיקה היחידה
-- הייתה של הילד עצמו (בלי כפתור במסך) או ניקוי כלל-מערכתי לפי תאריך.
--
-- זו הפונקציה שעונה על הבקשה הזו. אין לה עדיין כפתור במסך — עד שיהיה,
-- מריצים אותה ידנית מה-SQL Editor (הפקודה המדויקת בקובץ ההרצה).
-- ההרשאה נבדקת בגוף הפונקציה ולא בהענקה בלבד, כי קובץ ההקשחה מעניק
-- EXECUTE ל-authenticated לכל פונקציית DEFINER ב-public.
--
-- auth.uid() is null = הרצה מה-SQL Editor / service_role — הקשר מהימן,
-- בדיוק כמו ב-retention_run_scheduled ו-purge_expired_data. שם המחיקה
-- מוגבלת למאמן שרשום על שורת הסגל עצמה, ולא ל«מי שקרא».
create or replace function public.purge_checkins_for_roster(p_roster uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $pcr$
declare
  v_uid    uuid := auth.uid();
  v_coach  uuid;
  v_player uuid;
  v_team   text;
  v_n      bigint := 0;
begin
  if to_regclass('public.player_checkins') is null then
    return jsonb_build_object('ok', false, 'reason', 'no_table');
  end if;
  if p_roster is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- מחשבון מחובר: רק המאמן שהשורה הזו שלו. שורת סגל של מאמן אחר →
  -- 'not_found' (ולא 'forbidden'), כדי שלא ייווצר כלי לבדוק אילו
  -- מזהי סגל קיימים.
  select tp.player_id, tp.team, tp.coach_id into v_player, v_team, v_coach
    from public.team_players tp
   where tp.id = p_roster
     and (v_uid is null or tp.coach_id = v_uid);

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- שני הנתיבים: מה שהילד דיווח בעצמו (player_id + אותה קבוצה) ומה
  -- שנרשם על שורת הסגל. תמיד מוגבל לדיווחים שנאספו אצל אותו מאמן.
  with gone as (
    delete from public.player_checkins c
     where c.coach_id = v_coach
       and (c.roster_id = p_roster
            or (v_player is not null and c.player_id = v_player and c.team = v_team))
    returning c.id
  )
  select count(*) into v_n from gone;

  begin
    if v_n > 0 and to_regclass('public.audit_log') is not null then
      insert into public.audit_log (actor, action, entity, subject, details)
      values (coalesce(v_uid, v_coach), 'delete', 'player_checkins', v_player,
              jsonb_build_object('via', 'purge_checkins_for_roster',
                                 'roster_id', p_roster, 'team', v_team,
                                 'from_sql_editor', v_uid is null, 'deleted', v_n));
    end if;
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'deleted', v_n);
end;
$pcr$;
revoke all on function public.purge_checkins_for_roster(uuid) from public, anon;
grant execute on function public.purge_checkins_for_roster(uuid) to authenticated;


-- =====================================================================
-- 5) DI-3 — «נשמר 90 יום» מחובר סוף-סוף למשהו שרץ
-- =====================================================================
-- המקור: supabase_retention_schedule.sql סעיף 2. הועתק כאן במלואו עם
-- תוספת אחת: קריאה ל-checkins_purge באותה הרצה, באותו מצב יבש/אמיתי,
-- והתוצאה נספרת לתוך אותה שורת יומן.
--
-- ⚠ מה זה **לא** אומר: זה לא מדליק מחיקה. retention_schedule.armed הוא
-- false כברירת מחדל (וכך הוא בייצור, עד אישור עורך דין), ולכן ההרצה
-- המתוזמנת סופרת ולא מוחקת — גם עכשיו. מה שהשתנה: מהיום player_checkins
-- מופיעה בפלט ובשורת היומן, וברגע שהמערכת תידרך היא תנוקה יחד עם כולם.
-- הפקודה הידנית למחיקה בפועל מתועדת בהרצת_SQL_6.9.md.

create or replace function public.retention_run_scheduled(p_force_dry boolean default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_armed  boolean;
  v_dry    boolean;
  v_rows   jsonb  := '{}'::jsonb;
  v_total  bigint := 0;
  v_ck     jsonb;            -- 6.9 — תוצאת ניקוי הצ'ק-אין
  v_ckn    bigint;
begin
  if not (auth.uid() is null or coalesce(public.is_admin(), false)) then
    raise exception 'ניקוי נתונים מותר למנהלים בלבד';
  end if;

  select s.armed into v_armed from public.retention_schedule s where s.id;
  v_armed := coalesce(v_armed, false);

  -- p_force_dry מנצח תמיד. הוא קיים כדי שאדמין יוכל לבקש הרצה יבשה
  -- אפילו כשהמערכת דרוכה, בלי לשנות את המתג הלוך ושוב.
  v_dry := coalesce(p_force_dry, not v_armed);

  select coalesce(jsonb_object_agg(d.table_name, d.rows_affected), '{}'::jsonb),
         coalesce(sum(d.rows_affected), 0)
    into v_rows, v_total
    from public.purge_expired_data(v_dry) d;

  -- 6.9 — צ'ק-אין הבוקר (DI-3). player_checkins נוקתה עד היום בפונקציה
  -- עצמאית, checkins_purge, שאיש לא קרא לה: purge_expired_data נכתבה
  -- לפניה ואין בה ענף כזה, ואת שתיהן אסור לערוך (מיגרציות שכבר רצו).
  -- לכן החיבור נעשה כאן, בשכבה הדקה שכן מותר להחליף — וכך «90 יום»
  -- שרשום ב-retention_policy מקבל סוף-סוף מישהו שמבצע אותו.
  -- v_dry מועבר כמות שהוא: כל עוד retention_schedule.armed = false,
  -- גם הצ'ק-אין רק נספר ולא נמחק — בדיוק כמו כל שאר החלונות.
  begin
    v_ck  := public.checkins_purge(v_dry);
    v_ckn := coalesce((v_ck ->> 'deleted')::bigint, (v_ck ->> 'would_delete')::bigint, 0);
    if coalesce((v_ck ->> 'ok')::boolean, false) then
      v_rows  := v_rows || jsonb_build_object('player_checkins', v_ckn);
      v_total := v_total + v_ckn;
    else
      -- למשל not_admin — נרשם כדי שלא ייראה כאילו לא היה מה לנקות
      v_rows := v_rows || jsonb_build_object('player_checkins_skipped',
                                             coalesce(v_ck ->> 'reason', 'unknown'));
    end if;
  exception
    when undefined_function then
      -- מסד שלא הריץ את supabase_checkins_4_9.sql — לא תקלה
      null;
    when others then
      v_rows := v_rows || jsonb_build_object('player_checkins_error', sqlstate);
  end;

  -- הראיה שהתזמון רץ. action נפרד ליבש ולאמיתי כדי שאפשר יהיה להבדיל
  -- ביניהם בדיעבד; 'purge' (בלי סיומת) נשארת השורה שמייצרת
  -- purge_expired_data עצמה בהרצה ידנית מה-SQL Editor.
  if to_regclass('public.audit_log') is not null then
    insert into public.audit_log (actor, action, entity, details)
    values (auth.uid(),
            case when v_dry then 'purge_dry' else 'purge_run' end,
            'retention_policy',
            jsonb_build_object('ran_at',  now(),
                               'dry_run', v_dry,
                               'armed',   v_armed,
                               'source',  case when auth.uid() is null then 'schedule' else 'admin' end,
                               'rows',    v_rows,
                               'total',   v_total));
  end if;

  return jsonb_build_object('ok', true, 'dry_run', v_dry, 'armed', v_armed,
                            'total', v_total, 'rows', v_rows, 'ran_at', now());
end;
$$;

revoke all on function public.retention_run_scheduled(boolean) from public, anon;
grant execute on function public.retention_run_scheduled(boolean) to authenticated;
do $rsr$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.retention_run_scheduled(boolean) to service_role;
  end if;
end $rsr$;


-- ---------- רישום + רענון ----------
do $mig$ begin perform public.mark_migration('supabase_pilot_fixes_6_9.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
-- ביטול (rollback) — להדביק בשלמותו ב-SQL Editor
-- =====================================================================
-- הוא לא מוחק שום מידע. הוא מחזיר את ההתנהגות שהייתה לפני 6.9.
--
-- 1) player_checkins — חזרה למדיניות אחת ולזכות מחיקה ישירה:
--
--   do $rb$
--   begin
--     if to_regclass('public.player_checkins') is null then return; end if;
--     execute 'drop policy if exists pc_player_read on public.player_checkins';
--     execute 'drop policy if exists pc_player_insert on public.player_checkins';
--     execute 'drop policy if exists pc_player_update on public.player_checkins';
--     execute $p$
--       create policy pc_player_own on public.player_checkins
--         for all to authenticated
--         using (player_id = auth.uid() and source = 'player')
--         with check (
--           player_id = auth.uid() and source = 'player'
--           and roster_id is null
--           and public.is_on_coach_roster(coach_id, team)
--           and not exists (
--             select 1 from public.team_players tp
--             where tp.player_id = auth.uid()
--               and tp.coach_id = player_checkins.coach_id
--               and tp.team = player_checkins.team
--               and tp.wellness_off
--           )
--         )
--     $p$;
--     execute 'grant delete on public.player_checkins to authenticated';
--   end $rb$;
--
-- 2) הכלי החדש (אין לו קורא במסך, מחיקתו לא משפיעה על כלום):
--
--   drop function if exists public.purge_checkins_for_roster(uuid);
--
-- 3) שלוש הפונקציות שהוחלפו — הדרך הנקייה היא להריץ מחדש את הקבצים
--    המקוריים, כל אחד מהם מחזיר את הגרסה שלו כמות שהייתה:
--
--      supabase_hardening_medium_3_8.sql   → join_with_code
--      supabase_my_data.sql                → _data_export_for
--      supabase_checkins_4_9.sql           → delete_my_checkins
--      supabase_retention_schedule.sql     → retention_run_scheduled
--
--    ⚠ אחרי ריצה כזו, אם רוצים את תיקוני 6.9 בחזרה — פשוט להריץ שוב
--    את הקובץ הזה.
--
-- 4) לסיום:
--
--   notify pgrst, 'reload schema';
-- =====================================================================
