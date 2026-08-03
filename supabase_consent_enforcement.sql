-- =====================================================================
--  CourtSide — אכיפת מצב החשבון בצד השרת (AUDIT_3.8)
--
--  שני ממצאים שהקובץ הזה סוגר, שניהם על נתיב *הכתיבה*:
--
--  1) «חסימה» היא ויזואלית בלבד — supabase_teams_admin.sql:111.
--     העמודה profiles.banned מתעדכנת בפאנל האדמין, אבל היא לא נבדקת
--     באף מדיניות RLS ובאף פונקציה: היא מסננת רק את ה-VIEW
--     coach_directory. משתמש שנחסם בעקבות תלונה על התנהגות מול קטין
--     ממשיך עם JWT תקף — קורא, כותב בקהילה ושולח הודעות פרטיות.
--
--  2) «קטין ממתין להסכמת הורה» נחסם רק ב-UI.
--     profiles.approval_status = 'pending_parent' משנה מסכים באפליקציה,
--     אבל כל קריאת PostgREST ישירה (או build ישן בקאש) עדיין כותבת.
--
--  הפתרון: מדיניות RESTRICTIVE אחת לכל טבלת תוכן, על INSERT בלבד.
--  מדיניות restrictive מתאחדת עם המדיניות ה-permissive הקיימות ב-AND
--  ולא ב-OR — כלומר שום מדיניות קיימת לא נחלשת, לא נמחקת ולא נכתבת
--  מחדש; פשוט מתווסף תנאי-על: "החשבון פעיל ולא חסום".
--
--  אידמפוטנטי לחלוטין. אפשר להריץ שוב בלי נזק.
--
--  ⚠ תלות: הקובץ הזה לא מגדיר את פונקציות העזר. הוא דורש
--      public.is_active_user()  (מתוך supabase_parent_consent.sql)
--      public.is_banned()       (מתוך supabase_rls_hardening_3_8.sql)
--    אם אחת מהן חסרה — הקובץ *לא* יוצר כלום, רק ידפיס NOTICE ויסתיים
--    בהצלחה. הרץ קודם את שני הקבצים האלה ואז חזור לכאן.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1) בדיקת תלות — לכשול בקול רם אבל בלי לשבור את ההרצה
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_active_user()') is null then
    raise notice '';
    raise notice '===================================================================';
    raise notice '  ✋ עצור: public.is_active_user() לא קיימת.';
    raise notice '  הרץ קודם את supabase_parent_consent.sql, ורק אז את הקובץ הזה.';
    raise notice '  (שום מדיניות לא נוצרה — המסד לא השתנה.)';
    raise notice '===================================================================';
  end if;
  if to_regprocedure('public.is_banned()') is null then
    raise notice '';
    raise notice '===================================================================';
    raise notice '  ✋ עצור: public.is_banned() לא קיימת.';
    raise notice '  הרץ קודם את supabase_rls_hardening_3_8.sql, ורק אז את הקובץ הזה.';
    raise notice '  (שום מדיניות לא נוצרה — המסד לא השתנה.)';
    raise notice '===================================================================';
  end if;
end $$;


-- ---------------------------------------------------------------------
--  2) שער הכתיבה — מדיניות restrictive אחת לכל טבלת תוכן
--
--  לולאה על מערך שמות; to_regclass מדלג בשקט על טבלה שלא קיימת
--  בסכימה הנוכחית, כך שהקובץ בטוח בכל מצב סכימה (פרויקט חדש, ייצור
--  ישן, או ריצה אחרי חלק מהמיגרציות בלבד).
--
--  ── מה מכוסה ──
--  פיד הקהילה והצ'אטים, הודעות פרטיות, הודעות לשחקן, צ'אט קבוצה,
--  התראות, חברויות/הצטרפות לקבוצה, תרגילים ותגובות/דירוגים, דיווחים,
--  מאמץ/משוב/מטרות ויומני מטרות, נוכחות ואישורי הגעה, יומן ותוכניות.
--
--  ── מה מוחרג במכוון (ולמה) ──
--  • public.account_deletion_requests — משתמש מושהה, חסום או קטין
--    שממתין להסכמת הורה *חייב* להמשיך ולבקש מחיקת חשבון. חסימת
--    הנתיב הזה הייתה הופכת את זכות המחיקה למותנית בהתנהגות, וזה
--    בדיוק ההפך ממה שמדיניות הפרטיות מבטיחה.
--  • public.client_errors — קליטת שגיאות לקוח. אם דווקא לחשבון
--    התקוע האפליקציה קורסת, אנחנו רוצים לראות את הלוג, לא לחסום אותו.
--  • public.profiles — הרשמה ויצירת פרופיל חייבות לעבוד *לפני*
--    שיש בכלל approval_status; חסימה כאן הייתה נועלת כל משתמש חדש
--    מחוץ למערכת. הגנת הפרופיל נעשית בטריגר ובמדיניות הקיימות.
--  • טבלאות ההסכמה (consents / consent_requests) — קטין במצב
--    pending_parent חייב להצליח ליצור בקשת הסכמה, אחרת אין לו דרך
--    לצאת מהמצב הממתין. הן ממילא נכתבות רק דרך RPC של security definer.
--  • public.schema_migrations — תשתית, נכתבת רק דרך mark_migration.
-- ---------------------------------------------------------------------
do $$
declare
  v_tables text[] := array[
    -- קהילה ופיד
    'community_posts', 'community_post_likes', 'community_post_comments',
    'community_messages', 'community_poll_votes', 'community_events',
    'community_event_rsvps',
    -- הודעות
    'messages', 'player_messages', 'team_messages',
    -- התראות
    'notifications',
    -- קבוצות וחברויות
    'team_memberships', 'team_join_codes', 'team_players', 'team_staff',
    'team_goals', 'team_games', 'team_iba', 'team_practice_slots',
    -- תרגילים ותוכן נלווה
    'drills', 'drill_comments', 'drill_ratings', 'drill_videos',
    'saved_drills', 'video_ratings',
    -- דיווחים
    'reports',
    -- מאמץ, משוב, מטרות ותיעוד
    'session_effort', 'session_reviews', 'session_goal_marks',
    'player_feedback', 'player_goals', 'player_goal_logs',
    'player_assignments', 'assignment_completions', 'coach_notes',
    -- לוח זמנים, נוכחות ומשחקים
    'schedule_entries', 'practice_attendance', 'practice_rsvp',
    'game_attendance', 'game_requests', 'coach_meetings',
    -- תוכניות אימון
    'training_plans', 'plan_items'
  ];
  t          text;
  v_policy   text;
  v_made     int := 0;
  v_missing  int := 0;
  v_failed   int := 0;
begin
  -- בלי פונקציות העזר אין מה ליצור — יוצאים בשקט (ה-NOTICE כבר נדפס למעלה)
  if to_regprocedure('public.is_active_user()') is null
     or to_regprocedure('public.is_banned()') is null then
    raise notice 'supabase_consent_enforcement.sql: דילוג — פונקציות העזר חסרות.';
    return;
  end if;

  foreach t in array v_tables loop
    if to_regclass('public.' || quote_ident(t)) is null then
      v_missing := v_missing + 1;
      continue;
    end if;

    v_policy := t || '_active_gate';

    begin
      execute format('drop policy if exists %I on public.%I', v_policy, t);
      execute format(
        'create policy %I on public.%I as restrictive for insert to authenticated '
        || 'with check (public.is_active_user() and not public.is_banned())',
        v_policy, t
      );
      v_made := v_made + 1;
    exception
      when undefined_function then
        v_failed := v_failed + 1;
        raise notice '⚠ %: פונקציית עזר נעלמה באמצע הריצה — הרץ קודם את קבצי ההקשחה.', t;
      when insufficient_privilege then
        v_failed := v_failed + 1;
        raise notice '⚠ %: אין הרשאה ליצור מדיניות. הרץ כבעל הסכימה.', t;
      when others then
        v_failed := v_failed + 1;
        raise notice '⚠ %: יצירת המדיניות נכשלה — %', t, sqlerrm;
    end;
  end loop;

  raise notice '';
  raise notice 'supabase_consent_enforcement.sql: נוצרו % שערי כתיבה, % טבלאות לא קיימות (דילוג), % כשלונות.',
    v_made, v_missing, v_failed;
end $$;


-- ---------------------------------------------------------------------
--  3) רישום בלדג'ר + רענון סכימת ה-API
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.mark_migration('supabase_consent_enforcement.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקת עשן אחרי ההרצה
--
--  א) לראות את כל השערים שנוצרו (צריך להחזיר שורה לכל טבלה קיימת,
--     ובעמודה permissive את הערך RESTRICTIVE):
--       select tablename, policyname, permissive, cmd
--       from pg_policies
--       where schemaname = 'public' and policyname like '%_active_gate'
--       order by tablename;
--
--  ב) לוודא שההחרגות באמת מוחרגות (אמור להחזיר 0 שורות):
--       select policyname from pg_policies
--       where policyname like '%_active_gate'
--         and tablename in ('account_deletion_requests', 'client_errors', 'profiles');
--
--  ג) הבדיקה האמיתית — מחשבון בדיקה:
--       update public.profiles set banned = true where id = '<uuid של חשבון בדיקה>';
--     ואז מאותו חשבון, מהאפליקציה, לנסות לפרסם בקהילה. אמורה לחזור
--     שגיאת "new row violates row-level security policy". לבטל אחרי:
--       update public.profiles set banned = false where id = '<uuid>';
--
--  ד) לוודא שבקשת מחיקת חשבון *כן* עוברת מאותו חשבון חסום —
--     זו ההחרגה המכוונת, וזו הבדיקה שמוכיחה אותה.
--
--  ⚠ שים לב: הקובץ מגן על נתיב הכתיבה בלבד (INSERT). הגבלת הקריאה
--     של משתמש חסום היא באחריות supabase_rls_hardening_3_8.sql, ופסילת
--     הטוקן עצמו נעשית ב-Supabase Auth דרך ban_duration.
-- =====================================================================
