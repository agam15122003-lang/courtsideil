-- =====================================================================
--  CourtSide — זכות העיון והייצוא (סעיף 8 בצ'קליסט המשפטי של AUDIT_3.8)
--  נכתב 4.8.2026 · הרץ אחרי supabase_parent_consent.sql · אידמפוטנטי
--
--  הפער שנסגר כאן
--  ----------------
--  סעיף 8 ("זכות נושא המידע") סומן בביקורת כ«חלקי»: משתמש יכול לערוך
--  שדות בפרופיל שלו, אבל אין שום דרך *לראות* את כל מה שהמסד מחזיק עליו,
--  ואין ייצוא בכלל. public/privacy.html כבר מבטיח עיון וייצוא — ההבטחה
--  הזו הייתה עד היום בלי מימוש. לקטין הזכות הזו נתונה גם להורה.
--
--  שלוש נקודות כניסה
--  ------------------
--   1) my_data_export()              — המשתמש המחובר על עצמו.
--   2) admin_data_export(p_user)     — אדמין, כדי לענות לפנייה בכתב
--                                      שהגיעה דרך admin_requests.
--   3) guardian_data_export(p_token) — הורה בלי חשבון, מתוך קישור
--                                      הניהול (purpose='manage').
--  שלושתן עוטפות בונה אחד משותף, כדי שלא ייווצר מצב שבו מסלול אחד
--  מחזיר מידע שמסלול אחר שכח — פער כזה הוא בדיוק מה שהופך "ייצוא"
--  ל"ייצוא חלקי" בעין של רגולטור.
--
--  למה SECURITY DEFINER
--  ---------------------
--  supabase_privacy4.sql שלל SELECT ברמת הטבלה על profiles והחזיר רק
--  whitelist של עמודות; phone / birth_year / birth_date / guardian_*
--  נגישים רק דרך RPC. ייצוא שרץ בהרשאות המשתמש היה מחזיר לו פחות ממה
--  שהמסד מחזיק עליו — כלומר ייצוא שקרי. לכן ההרכבה נעשית בשרת.
--
--  ⚠ אזהרת תחזוקה חשובה (supabase_hardening_medium_3_8.sql:161)
--  ------------------------------------------------------------
--  קובץ ההקשחה מריץ לולאה שעוברת על **כל** פונקציות SECURITY DEFINER
--  ב-public ומריצה עליהן אוטומטית
--      revoke all ... from public, anon;  grant execute ... to authenticated;
--  שתי מסקנות מעשיות, ושתיהן קריטיות:
--
--   א) פונקציות העזר בקובץ הזה (_export_pick_col / _export_rows /
--      _export_summary / _data_export_for) הן **בכוונה SECURITY INVOKER**,
--      בניגוד לכלל הרגיל בפרויקט. אילו היו DEFINER, ריצה חוזרת של קובץ
--      ההקשחה הייתה מעניקה אותן ל-authenticated, וכל משתמש היה יכול
--      לקרוא ל-_data_export_for('<uid של מישהו אחר>') ולשאוב את התיק
--      המלא שלו. כ-INVOKER הן בטוחות מעצם הבנייה: קריאה ישירה מחשבון
--      רגיל רצה בהרשאות אותו חשבון, RLS חל, ו-select * על profiles אף
--      נופל על 42501 בגלל privacy4. כשהן נקראות מתוך העוטפות (שהן כן
--      DEFINER, בבעלות בעל הטבלאות) הן רצות בהרשאות הבעלים ורואות הכל.
--      אסור להפוך אותן ל-SECURITY DEFINER. לעולם.
--
--   ב) guardian_data_export חייבת EXECUTE ל-anon (ההורה אינו משתמש רשום),
--      בדיוק כמו get_consent_request. אם מריצים שוב את
--      supabase_hardening_medium_3_8.sql — יש להוסיף אותה לרשימת
--      הדילוגים שם (השורה שמחריגה get_consent_request/submit_parent_consent),
--      אחרת ההענקה ל-anon תישלל ודף ההורה יישבר.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) _export_pick_col — בוחרת את העמודה הראשונה ברשימת המועמדים שקיימת
--    בפועל בטבלה.
--
--    למה מועמדים ולא שם קבוע: הסכימה בייצור התפתחה בגלים (player_id
--    באחת, user_id בשנייה, created_by בשלישית), והייצוא חייב לשרוד
--    מסד שבו חלק מהגלים לא הורצו. עמודה חסרה מחזירה null, והמדור
--    בייצוא יסומן כ«לא קיים בסכימה» במקום להפיל את כל הקריאה.
-- ---------------------------------------------------------------------
create or replace function public._export_pick_col(p_rel regclass, p_cols text[])
returns text
language sql
stable
set search_path = public
as $$
  select c.col
    from unnest(p_cols) with ordinality as c(col, ord)
   where exists (
           select 1 from pg_attribute a
            where a.attrelid = p_rel
              and a.attname  = c.col
              and a.attnum   > 0
              and not a.attisdropped)
   order by c.ord
   limit 1;
$$;


-- ---------------------------------------------------------------------
-- 2) _export_rows — שורות שלמות מטבלה כלשהי, לפי מזהה/מזהים.
--
--    p_ids הוא מערך ולא uuid יחיד בכוונה: practice_attendance ו-
--    game_attendance מצביעות על team_players.id (שורת הסגל) ולא על
--    profiles.id, ולשחקן אחד יכולות להיות כמה שורות סגל אצל כמה מאמנים.
--    ייצוא שמחפש שם לפי auth.uid() היה מחזיר ריק ומשקר.
--
--    p_strip מסיר מפתחות מהפלט. השימוש הקריטי: token_hash ב-
--    consent_requests. to_jsonb(t) לוקח את השורה *כולה*, וייצוא שמחזיר
--    את גיבוב הטוקן היה הופך כל קובץ ייצוא שדלף לכלי התחזות להורה.
--
--    ערכי החזרה:
--      []            — הטבלה קיימת ואין שורות
--      [ ... ]       — השורות
--      null          — הטבלה או העמודה לא קיימות בסכימה הזו
--      {"_error":..} — הקריאה נכשלה (SQLSTATE), למשל חוסר הרשאה
--    ההבחנה בין השלושה מכוונת: "אין נתונים" ו"לא בדקנו" הם תשובות
--    שונות לחלוטין כשמדובר בזכות עיון.
-- ---------------------------------------------------------------------
create or replace function public._export_rows(
  p_table text,
  p_cols  text[],
  p_ids   uuid[],
  p_strip text[] default '{}'::text[],
  p_limit int     default 2000
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_rel regclass;
  v_col text;
  v_lim int := greatest(1, least(coalesce(p_limit, 2000), 20000));
  v_out jsonb;
begin
  v_rel := to_regclass('public.' || p_table);
  if v_rel is null then
    return null;
  end if;

  v_col := public._export_pick_col(v_rel, p_cols);
  if v_col is null then
    return null;
  end if;

  -- מערך ריק (למשל: אין לו בכלל שורת סגל) — אין מה לשאול
  if p_ids is null or array_length(p_ids, 1) is null then
    return '[]'::jsonb;
  end if;

  begin
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
         from (select * from %s where %I = any($1) limit %s) t',
      v_rel::text, v_col, v_lim)
      into v_out
     using p_ids;
  exception when others then
    -- ייצוא הוא זכות; כישלון בטבלה אחת לא רשאי להפיל את כל התיק.
    return jsonb_build_object('_error', sqlstate);
  end;

  if p_strip is not null and array_length(p_strip, 1) is not null then
    select coalesce(jsonb_agg(e - p_strip), '[]'::jsonb)
      into v_out
      from jsonb_array_elements(v_out) e;
  end if;

  return v_out;
end;
$$;


-- ---------------------------------------------------------------------
-- 2.1) _export_one — האיבר הראשון, בלי לבלוע סימון תקלה.
--      "v -> 0" לבדו היה מחזיר null גם על {"_error":"42501"}, כלומר
--      תקלת הרשאה בקריאת הפרופיל הייתה נראית בייצוא כ«אין פרופיל».
-- ---------------------------------------------------------------------
create or replace function public._export_one(p_val jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(p_val) = 'array' then p_val -> 0 else p_val end;
$$;


-- ---------------------------------------------------------------------
-- 3) _export_summary — ספירה + טווח תאריכים, בלי התוכן עצמו.
--    משמש להתכתבות דו-צדדית (ראה ההסבר במדור ההודעות למטה).
-- ---------------------------------------------------------------------
create or replace function public._export_summary(
  p_table    text,
  p_cols     text[],
  p_ids      uuid[],
  p_date_col text default 'created_at'
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_rel  regclass;
  v_col  text;
  v_date boolean;
  v_out  jsonb;
begin
  v_rel := to_regclass('public.' || p_table);
  if v_rel is null then
    return null;
  end if;

  v_col := public._export_pick_col(v_rel, p_cols);
  if v_col is null then
    return null;
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('count', 0);
  end if;

  v_date := exists (
    select 1 from pg_attribute a
     where a.attrelid = v_rel and a.attname = p_date_col
       and a.attnum > 0 and not a.attisdropped);

  begin
    if v_date then
      execute format(
        'select jsonb_build_object(''count'', count(*),
                                   ''first_at'', min(%1$I),
                                   ''last_at'',  max(%1$I))
           from %2$s where %3$I = any($1)',
        p_date_col, v_rel::text, v_col)
        into v_out using p_ids;
    else
      execute format(
        'select jsonb_build_object(''count'', count(*)) from %s where %I = any($1)',
        v_rel::text, v_col)
        into v_out using p_ids;
    end if;
  exception when others then
    return jsonb_build_object('_error', sqlstate);
  end;

  return v_out;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) _data_export_for — הבונה המשותף. כאן מוגדר *מה* נחשב "המידע שלי".
--
--    p_coach_private = false משמיט את הטקסט החופשי שהמאמן כתב על
--    השחקן. משמש רק במסלול ההורה-בלי-חשבון; ראה הנימוק המלא בסעיף 7.
--
--    ⚖ שאלה לעורך/ת הדין לפני עלייה לאוויר
--    --------------------------------------
--    שורות הסגל (team_players) נכללות כאן **במלואן**, כולל notes,
--    injury_note, height ו-coach_notes — שדות שהמאמן מילא, לא השחקן.
--    ההיגיון: "מידע שמוחזק עלי" הוא כל המידע, לא רק זה שהקלדתי בעצמי,
--    ו-injury_note הוא אפילו מידע בריאותי (רגישות מוגברת). מנגד יש
--    טענה מוכרת שהערכה מקצועית פנימית של מאמן היא דעה ולא "מידע",
--    ושחשיפתה פוגעת ביכולת לנהל קבוצה בכנות. ההכרעה כאן — לכלול —
--    היא ההכרעה השמרנית מבחינת זכות העיון והנועזת מבחינת המאמן.
--    ⚠ הבעלים חייב לאשר את זה עם עורך/ת דין לפני שילוח. אם ההכרעה
--    תתהפך: להוסיף את השדות האלה ל-p_strip של המדור 'roster' ולהשמיט
--    את המדור 'coach_private_notes' — שינוי של שתי שורות, בקובץ חדש.
-- ---------------------------------------------------------------------
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
    || 'הגעה, לוח אימונים, תרגילים ותוכניות שיצרת, התראות, פניות '
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

-- פונקציות העזר אינן חלק מה-API. ראה אזהרת התחזוקה בראש הקובץ:
-- הן חייבות להישאר SECURITY INVOKER, וגם השלילה כאן היא שכבת הגנה שנייה.
revoke all on function public._export_pick_col(regclass, text[])          from public, anon, authenticated;
revoke all on function public._export_one(jsonb)                          from public, anon, authenticated;
revoke all on function public._export_rows(text, text[], uuid[], text[], int) from public, anon, authenticated;
revoke all on function public._export_summary(text, text[], uuid[], text)  from public, anon, authenticated;
revoke all on function public._data_export_for(uuid, text, boolean)        from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5) my_data_export() — המשתמש על עצמו
--
--    בלי בדיקת banned / approval_status בכוונה: זכות העיון אינה תלויה
--    במצב החשבון. משתמש מושעה או קטין שממתין לאישור הורה זכאי לראות
--    מה מוחזק עליו בדיוק כמו כל אחד אחר — ולעיתים דווקא אז הוא צריך
--    את זה, כדי לערער.
-- ---------------------------------------------------------------------
create or replace function public.my_data_export()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  return public._data_export_for(v_uid, 'self', true);
end;
$$;

revoke all on function public.my_data_export() from public, anon;
grant execute on function public.my_data_export() to authenticated;


-- ---------------------------------------------------------------------
-- 6) admin_data_export(p_user) — אדמין עונה לפנייה בכתב
--
--    הפניות מגיעות מהיום דרך admin_requests. הפונקציה מחזירה בדיוק את
--    אותו מבנה, כדי שהתשובה שהאדמין שולח תהיה זהה למה שהמשתמש היה
--    מקבל בעצמו — אין "גרסת אדמין" מקוצרת.
-- ---------------------------------------------------------------------
create or replace function public.admin_data_export(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_subject');
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return public._data_export_for(p_user, 'admin', true);
end;
$$;

revoke all on function public.admin_data_export(uuid) from public, anon;
grant execute on function public.admin_data_export(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 7) guardian_data_export(p_token) — ההורה, בלי חשבון
--
--    ההכרעה: כן, בטוח — בסייג אחד.
--
--    למה כן: להורה של קטין יש בדיוק אותה זכות עיון, והוא הצד שהכי
--    סביר שיממש אותה. אין לו חשבון ולא יהיה לו; כל חלופה ("שייכנס
--    לחשבון של הילד", "שיכתוב לאדמין ויחכה") מעבירה את הזכות דרך
--    הקטין עצמו או דרך המתנה ידנית — כלומר הופכת אותה לתאורטית.
--    קישור הניהול הוא כבר היום ההזדהות של ההורה מול המערכת: מי שמחזיק
--    בו יכול לבטל הסכמה ולהשעות את החשבון — פעולה חמורה לא פחות
--    מקריאה. הוספת עיון אינה מרחיבה את מעגל האמון.
--
--    האימות זהה בדיוק ל-get_consent_request:
--      · השוואה מול sha256 בלבד (המסד לא מחזיק את הטוקן עצמו)
--      · expires_at חייב להיות בעתיד
--      · purpose חייב להיות 'manage' — טוקן 'initial' חד-פעמי, שנשלח
--        לפני שההורה בכלל הסכים, לא אמור להיות מפתח לתיק מלא
--      · used_at לא נבדק, בדיוק כמו שם: קישור ניהול מסומן used בכל
--        הנפקה מחדש אך נשאר תקף בכוונה (ראה supabase_consent_manage_fix)
--
--    והסייג: p_coach_private = false. קישור הניהול חי 365 יום ויושב
--    בתיבת מייל של הורה — נכס עמיד ובר-העברה. ביטול הסכמה דרכו הוא
--    פעולה הפיכה ומתועדת ביומן ההסכמות; שאיבת הערות חופשיות שהמאמן
--    כתב על הקטין היא בלתי הפיכה ולא מותירה עקבות אצל הנפגע. לכן
--    הטקסט החופשי של המאמן מוחרג מהמסלול האנונימי בלבד, והייצוא אומר
--    זאת במפורש במדור withheld — כולל איך לקבל גם אותו. ההורה לא מאבד
--    את הזכות; הוא רק נדרש לערוץ מזוהה כדי לממש את החלק הרגיש שלה.
-- ---------------------------------------------------------------------
create or replace function public.guardian_data_export(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- משתנים סקלריים ולא consent_requests%rowtype בכוונה: %ROWTYPE נפתר
  -- כבר בקומפילציה של הפונקציה, ולכן CREATE FUNCTION היה נכשל על מסד
  -- שבו מערכת ההסכמה עוד לא נפרסה — בניגוד לכלל "לשרוד סכימה חלקית".
  -- משפט SELECT רגיל, לעומת זאת, נפתר רק בהרצה, כלומר אחרי הבדיקה של
  -- to_regclass שלמטה.
  v_minor   uuid;
  v_purpose text;
  v_exp     timestamptz;
begin
  -- מסד שבו מערכת ההסכמה עוד לא נפרסה
  if to_regclass('public.consent_requests') is null then
    return jsonb_build_object('ok', false, 'reason', 'not_deployed');
  end if;

  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select cr.minor_id, cr.purpose, cr.expires_at
    into v_minor, v_purpose, v_exp
    from public.consent_requests cr
   where cr.token_hash = public.consent_token_hash(p_token);

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_exp <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_purpose is distinct from 'manage' then
    -- הודעה נפרדת מ-not_found: להורה שפתח קישור ישן מגיע להבין
    -- שהקישור אמיתי אבל לא מסוג שמאפשר עיון.
    return jsonb_build_object('ok', false, 'reason', 'wrong_purpose');
  end if;

  return public._data_export_for(v_minor, 'guardian_link', false);
end;
$$;

-- ⚠ החריגה מהתבנית מכוונת: anon חייב EXECUTE, כמו ב-get_consent_request.
revoke all on function public.guardian_data_export(text) from public;
grant execute on function public.guardian_data_export(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 8) רענון סכימת ה-API + רישום בלדג'ר
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_my_data.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקות עשן — הרץ אחרי המיגרציה
-- =====================================================================
--
--  1) מהחשבון של משתמש רגיל (בקונסול של האפליקציה, מחובר):
--       const { data } = await supabase.rpc('my_data_export')
--       console.log(Object.keys(data))
--     ציפייה: ok:true, generated_at, subject_id, וכל המדורים.
--     בדוק במיוחד:
--       data.profile.birth_date   — חייב להופיע למרות ש-privacy4 חוסם
--                                    את העמודה הזו בקריאה ישירה. אם הוא
--                                    undefined — ה-SECURITY DEFINER לא
--                                    עובד והייצוא חלקי.
--       data.consent_requests     — אף שורה לא מכילה token_hash.
--       data.messages_summary     — {count, first_at, last_at}, בלי content.
--
--  2) שחקן עם שורת סגל אצל מאמן (הבדיקה החשובה ביותר):
--       data.roster.length > 0
--       data.attendance_practice  — לא [] אם המאמן סימן לו נוכחות.
--     אם roster מלא אבל attendance_practice ריק — סימן שהמיפוי דרך
--     team_players.id נשבר. זו הייתה התקלה הצפויה כאן.
--
--  3) הרשאות — מחשבון authenticated רגיל, כל אחת חייבת ליפול על
--     «permission denied for function»:
--       await supabase.rpc('_data_export_for', { p_uid: '<uid זר>' })
--       await supabase.rpc('_export_rows', { p_table: 'profiles',
--                                            p_cols: ['id'],
--                                            p_ids: ['<uid זר>'] })
--     ואם מישהו בכל זאת הצליח לקרוא — הפונקציה INVOKER, כלומר RLS
--     ו-privacy4 עדיין חלים והתוצאה תהיה [] או {"_error":"42501"},
--     לא נתונים של אדם אחר. ודא שזה מה שקורה:
--       select public._export_rows('profiles', array['id'], array['<uid זר>'::uuid]);
--     -- כמשתמש רגיל: לא שורת פרופיל של אחר.
--
--  4) אדמין:
--       await supabase.rpc('admin_data_export', { p_user: '<uid>' })
--     מחשבון רגיל: «למנהלים בלבד». עם uid שאינו קיים: reason:'not_found'.
--
--  5) ההורה (בלי חשבון — פתח חלון גלישה בסתר):
--       -- קודם, מחשבון הקטין:
--       const { data: m } = await supabase.rpc('request_manage_link')
--       -- ואז, בלי התחברות, עם m.token:
--       await supabase.rpc('guardian_data_export', { p_token: m.token })
--     ציפייה: ok:true, source:'guardian_link',
--             coach_private_notes === null,
--             withheld.coach_free_text מוסבר בעברית,
--             ובכל שורה ב-roster אין notes / injury_note / coach_notes.
--     ומנגד — ההסכמות, הפרופיל והנוכחות של הילד כן שם.
--
--  6) דחיות בטוקן:
--       guardian_data_export עם טוקן אקראי          → 'not_found'
--       עם טוקן initial (מ-create_consent_request)  → 'wrong_purpose'
--       עם טוקן שפג                                  → 'expired'
--       בלי טוקן / מחרוזת ריקה                       → 'not_found'
--
--  7) עמידות למסד חלקי (הכלל: הפרונט לא קורס). על מסד בדיקה:
--       alter table public.saved_drills rename to saved_drills_x;
--       select public.my_data_export() -> 'saved_drills';   -- null, לא שגיאה
--       alter table public.saved_drills_x rename to saved_drills;
--
--  8) חשבון מושעה — זכות העיון נשמרת:
--       select public.admin_set_approval('<uid>', 'suspended');
--     ואז מאותו חשבון: my_data_export() חייבת להחזיר ok:true.
--     אם היא נחסמת — מישהו הוסיף בדיקת is_active_user() בטעות.
--
--  9) הרצה חוזרת של הקובץ כולו — חייבת לעבור נקי (אידמפוטנטיות).
--
-- 10) ⚠ אם מריצים שוב את supabase_hardening_medium_3_8.sql:
--       select has_function_privilege('anon',
--         'public.guardian_data_export(text)', 'execute');
--     חייב להישאר true. אם הפך ל-false — ההרצה החוזרת שללה את ההענקה,
--     ויש להוסיף את שם הפונקציה לרשימת הדילוגים שם (או פשוט להריץ
--     שוב את הקובץ הזה).
-- =====================================================================
