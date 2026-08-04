-- =====================================================================
--  CourtSide — סגירת 5 מדיניות USING(true) שרדו את ההקשחה (3.8.2026)
--
--  אחרי הרצת supabase_rls_hardening_3_8.sql, בדיקת האימות
--    select tablename, policyname from pg_policies
--    where schemaname='public' and qual='true';
--  עדיין החזירה 5 שורות. ההקשחה טיפלה ב-profiles וב-drills (הקריטיים),
--  אבל חמש טבלאות נוספות נשארו פתוחות לקריאה מלאה לכל משתמש מחובר —
--  כלומר גם לחשבון שחקן.
--
--  ⚠ הכי חשוב כאן: "videos read all" על drill_videos.
--  supabase_privacy4.sql:167 יצר את videos_read עם
--    using (approved or not public.is_player())
--  כדי שקטין יראה רק סרטונים שאדמין אישר. אבל מדיניות permissive
--  מתאחדות ב-OR, ולכן מדיניות שנייה עם using(true) — שנוצרה ידנית
--  בדשבורד (השם עם רווחים מסגיר את המקור, היא לא קיימת באף קובץ SQL) —
--  ביטלה את השער לגמרי. **שער אישור הסרטונים לקטינים מעולם לא עבד.**
--
--  ארבע הנותרות פחות חמורות אבל מאותה משפחה: הן חושפות user_id ותוכן
--  של מאמנים לחשבונות שחקנים. כולן שייכות למסכים שהם ממילא של מאמנים
--  בלבד (אומת בקוד — ראה ההערה מעל כל סעיף), ולכן הצמצום ל-is_coach()
--  אינו משנה שום זרימה קיימת.
--
--  דורש: supabase_rls_hardening_3_8.sql (בשביל is_coach()).
--  אידמפוטנטי — אפשר להריץ שוב בלי נזק.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) בדיקת תלות — בלי is_coach() אין טעם להמשיך
-- ---------------------------------------------------------------------
do $dep$
begin
  if to_regprocedure('public.is_coach()') is null then
    raise exception 'חסרה הפונקציה public.is_coach() — הרץ קודם supabase_rls_hardening_3_8.sql';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- 1) drill_videos — החור האמיתי
--     מוחקים כל מדיניות SELECT מיותרת על הטבלה ומשאירים רק את
--     videos_read של privacy4. השחקן ימשיך לראות סרטונים מאושרים
--     (PlayerDashboard.jsx → PlayerVideos), אבל לא-מאושרים ייחסמו.
--     המחיקה נעשית בסריקת pg_policies ולא בשם קשיח, כי ייתכנו
--     מדיניות ידניות נוספות עם שמות שאיננו מכירים.
-- ---------------------------------------------------------------------
do $vid$
declare r record; v_dropped int := 0;
begin
  if to_regclass('public.drill_videos') is null then
    raise notice 'drill_videos לא קיימת — מדלג';
    return;
  end if;
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'drill_videos'
      and cmd in ('SELECT', 'ALL') and policyname <> 'videos_read'
  loop
    execute format('drop policy if exists %I on public.drill_videos', r.policyname);
    v_dropped := v_dropped + 1;
    raise notice 'drill_videos: הוסרה מדיניות קריאה עודפת %', r.policyname;
  end loop;

  -- מוודאים ששער האישור עצמו קיים (אם privacy4 טרם רץ אצלך)
  drop policy if exists "videos_read" on public.drill_videos;
  create policy "videos_read" on public.drill_videos
    for select to authenticated
    using (approved or not public.is_player());

  raise notice 'drill_videos: הוסרו % מדיניות עודפות; שער האישור פעיל', v_dropped;
end $vid$;


-- ---------------------------------------------------------------------
-- 2) drill_ratings — דירוגי כוכבים על תרגילים
--     נקרא רק ממסכי מאמן: DrillCard, DrillLibrary, MyDrills, MyStats,
--     CoachOfWeek, CoachProfile. אף אחד מהם אינו מרונדר ב-PlayerDashboard.
--     דף התרגיל הציבורי (PublicDrill.jsx) אינו קורא את הטבלה, והמדיניות
--     ממילא הייתה to authenticated — כך שאנונימי לא מושפע.
-- ---------------------------------------------------------------------
do $rat$
begin
  if to_regclass('public.drill_ratings') is null then return; end if;
  drop policy if exists "ratings_select_authenticated" on public.drill_ratings;
  drop policy if exists "ratings_select_coaches" on public.drill_ratings;
  create policy "ratings_select_coaches" on public.drill_ratings
    for select to authenticated
    using (public.is_coach() or public.is_admin());
  raise notice 'drill_ratings: קריאה צומצמה למאמנים';
exception when duplicate_object then
  raise notice 'drill_ratings: המדיניות כבר קיימת';
end $rat$;


-- ---------------------------------------------------------------------
-- 3) drill_comments — תגובות על תרגילים
--     נקרא רק מ-DrillCard (מסך מאמן).
-- ---------------------------------------------------------------------
do $com$
begin
  if to_regclass('public.drill_comments') is null then return; end if;
  drop policy if exists "comments_select_authenticated" on public.drill_comments;
  drop policy if exists "comments_select_coaches" on public.drill_comments;
  create policy "comments_select_coaches" on public.drill_comments
    for select to authenticated
    using (public.is_coach() or public.is_admin());
  raise notice 'drill_comments: קריאה צומצמה למאמנים';
exception when duplicate_object then
  raise notice 'drill_comments: המדיניות כבר קיימת';
end $com$;


-- ---------------------------------------------------------------------
-- 4) game_requests — לוח משחקי האימון
--     נקרא רק מ-GamesBoard, שמרונדר בתוך CoachFinder — מסך מאמנים.
--     השורות מכילות שם מועדון, אזור וטלפון ליצירת קשר.
-- ---------------------------------------------------------------------
do $gam$
begin
  if to_regclass('public.game_requests') is null then return; end if;
  drop policy if exists "games_select_authenticated" on public.game_requests;
  drop policy if exists "games_select_coaches" on public.game_requests;
  create policy "games_select_coaches" on public.game_requests
    for select to authenticated
    using (public.is_coach() or public.is_admin());
  raise notice 'game_requests: קריאה צומצמה למאמנים';
exception when duplicate_object then
  raise notice 'game_requests: המדיניות כבר קיימת';
end $gam$;


-- ---------------------------------------------------------------------
-- 5) video_ratings — דירוגי סרטונים
--     נקרא רק מ-Videos.jsx (מסך המדיה של המאמן). לשחקן יש רכיב נפרד
--     (PlayerVideos בתוך PlayerDashboard.jsx) שאינו נוגע בטבלה הזו.
-- ---------------------------------------------------------------------
do $vrat$
begin
  if to_regclass('public.video_ratings') is null then return; end if;
  drop policy if exists "vr_select_auth" on public.video_ratings;
  drop policy if exists "vr_select_coaches" on public.video_ratings;
  create policy "vr_select_coaches" on public.video_ratings
    for select to authenticated
    using (public.is_coach() or public.is_admin());
  raise notice 'video_ratings: קריאה צומצמה למאמנים';
exception when duplicate_object then
  raise notice 'video_ratings: המדיניות כבר קיימת';
end $vrat$;


-- ---------------------------------------------------------------------
-- 6) רישום בלדג'ר + רענון סכימה
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_rls_gaps_3_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקות עשן
--
--  1) הבדיקה המרכזית — חייבת לחזור ריקה:
--       select tablename, policyname from pg_policies
--       where schemaname = 'public' and qual = 'true';
--
--  2) שער אישור הסרטונים — עכשיו אמור באמת לעבוד.
--     מחשבון שחקן (role='player'):
--       select id, title, approved from public.drill_videos;
--     צפוי: רק שורות עם approved = true.
--     מחשבון מאמן: כל השורות, כולל לא-מאושרות.
--
--  3) אי-רגרסיה במסכי המאמן — כולם חייבים להמשיך לעבוד כרגיל:
--     ספריית התרגילים (ממוצע כוכבים על הכרטיסים), תגובות בתוך כרטיס
--     תרגיל, לוח משחקי האימון במאתר המאמנים, ומסך המדיה.
--
--  4) אי-רגרסיה במסך השחקן: «סרטונים שנבחרו בשבילך» חייב להמשיך
--     להציג את הסרטונים המאושרים.
-- =====================================================================
