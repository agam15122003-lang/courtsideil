-- =====================================================================
--  CourtSide — הצלבת גיל: השחקן מול המאמן
--  נכתב 4.8.2026 · הרץ אחרי supabase_parent_consent.sql · אידמפוטנטי
--
--  ---------------------------------------------------------------
--  הבעיה (AUDIT_3.8.md, שורה 254 — «זיהוי קטינים: חלקי»)
--  ---------------------------------------------------------------
--  שנת הלידה ותאריך הלידה בפרופיל הם שדה חופשי שהשחקן ממלא בעצמו.
--  ילד בן 12 שמקליד 1990 עובר את שער הקטינים (enforce_minor_consent)
--  בלי הסכמת הורה. אין לנו — ולא תהיה לנו — שום דרך לאמת תעודת זהות.
--
--  ---------------------------------------------------------------
--  התובנה שעליה הקובץ הזה בנוי
--  ---------------------------------------------------------------
--  יש שני מקורות בלתי-תלויים לגיל של שחקן:
--    (1) ההצהרה של השחקן עצמו       — profiles.birth_date / birth_year
--    (2) ההזנה של המאמן בסגל        — team_players.birth_date / birth_year
--  את (2) מילא מבוגר שמכיר את המשפחה בפועל. הוא לא ראה מה השחקן הצהיר,
--  והשחקן לא ראה מה הוא הזין. כשהשניים לא מסכימים — יש מה לבדוק.
--  זה מה שהופך «שאלנו» ל«בדקנו».
--
--  ---------------------------------------------------------------
--  מה זה מוכיח — ובעיקר, מה זה *לא* מוכיח
--  ---------------------------------------------------------------
--  ✔ מה כן:
--    · מאתר *אי-הסכמה* בין שני בני אדם על הגיל של שחקן מסוים.
--    · מדגיש את המקרה שמשנה משפטית: צד אחד אומר קטין, השני אומר בגיר.
--    · נותן למאמן — הגורם האנושי היחיד שמכיר את הילד — רשימה קצרה
--      וממוקדת לבדוק, במקום «תסתכל על כל הסגל».
--
--  ✘ מה לא, ואסור להציג אחרת:
--    · **זה לא אימות זהות.** אין כאן תעודת זהות, אין מסמך, אין צד שלישי.
--      שום שורה כאן אינה קובעת מי צודק — היא קובעת שיש מחלוקת בלבד.
--    · **קטין שאמר למאמן את אותו שקר — לא ייתפס.** אם הילד הצהיר 2005
--      גם בפרופיל וגם למאמן שרשם אותו לסגל, שני המקורות מסכימים ואין
--      כאן שום התרעה. זו המגבלה המרכזית, והיא לא ניתנת לסגירה בקוד.
--    · **המאמן יכול להיות הטועה.** הוא מקליד עשרות שחקנים מרשימת
--      איגוד, טעות הקלדה בשנה היא דבר שבשגרה. לכן הפלט מנוסח כמחלוקת
--      («שני המקורות אינם תואמים») ולעולם לא כהאשמה («השחקן שיקר»).
--      ה-UI חייב לשמור על הניסוח הזה.
--    · **כיסוי חלקי.** ההשוואה אפשרית רק כששני הצדדים מילאו נתוני
--      לידה. שורת סגל שהמאמן לא הזין בה שנה — לא מפיקה שום אות.
--      admin_age_mismatch_summary() מחזירה במפורש כמה שורות בכלל
--      ניתנות להשוואה, כדי שהמספר «0 אי-התאמות» לא ייקרא כ«הכול תקין»
--      כשהאמת היא «אף אחד לא מילא».
--    · **לא נוגע באכיפה.** הפונקציות כאן קוראות בלבד. הן לא משנות
--      approval_status, לא חוסמות ולא משעות. ההחלטה אנושית.
--
--  ---------------------------------------------------------------
--  החלטות חישוב
--  ---------------------------------------------------------------
--  · הגיל מחושב ב-minor_age() משני הצדדים — אותה פונקציה שהטריגר
--    משתמש בה. אם השער סבור שמישהו קטין, גם ההצלבה תסבור כך.
--  · שני הצדדים מעדיפים תאריך לידה מלא על שנה, בדיוק כמו minor_age.
--  · «אותה שנה, גרנולריות שונה» = הסכמה, ולא מדווח. הסבר: minor_age
--    שמרנית כשיש רק שנה (מחזירה את הגיל שבוודאות כבר מלא), ולכן מאמן
--    שהזין 1.6.2008 ושחקן שהצהיר «2008» ייראו כמו פער של שנה — או
--    אפילו כמו «קטין מול בגיר» — בלי שיש ביניהם מחלוקת אמיתית ולו
--    ליום אחד. סינון האַרְטִיפָקְט הזה קודם לכל סיווג, כולל critical.
--    המחיר: מחלוקת אמיתית על *היום* בתוך שנה מוסכמת, כשרק צד אחד
--    הזין תאריך מלא, לא תדווח. זה המחיר הנכון — הרעש היה חונק את
--    האות, ומאמן שמקבל רשימה מלאת התרעות שווא מפסיק להסתכל עליה.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) age_mismatches — הרשימה עצמה, שורה לכל שורת סגל מקושרת חולקת
--
--    הרשאות:
--      · מאמן  → רק הסגל שלו (coach_id = auth.uid()).
--      · אדמין → הכול, או קבוצה של מאמן מסוים דרך p_coach.
--      · כל השאר → אפס שורות בשקט (לא חריגה: PlayerDashboard לא אמור
--        לקרוס אם מישהו יקרא לזה בטעות).
--      · p_coach הוא פרמטר של אדמין בלבד. מאמן שמעביר אותו נדחה
--        בחריגה ולא «בשקט» — ניסיון להציץ בסגל של מאמן אחר הוא באג
--        או תקיפה, ובשני המקרים עדיף שיישמע.
--
--    חשיפת מידע: הפונקציה מחזירה למאמן את תאריך/שנת הלידה שהשחקן
--    הצהיר — נתון שנשלל ממנו ברמת grant ב-supabase_privacy4.sql.
--    זו חריגה מכוונת ומצומצמת: אי אפשר ליישב מחלוקת בלי לראות את שני
--    הצדדים שלה, המאמן כבר מחזיק תאריך לידה של אותו ילד שהוא עצמו
--    הזין, והשורות מוגבלות לשחקנים המקושרים לסגל שלו ורק כשיש פער.
--    שחקן תואם לא נחשף כאן בכלל.
-- ---------------------------------------------------------------------
drop function if exists public.age_mismatches(uuid);
create or replace function public.age_mismatches(p_coach uuid default null)
returns table (
  roster_id        uuid,      -- שורת הסגל (שחקן יכול להופיע ביותר מקבוצה)
  player_id        uuid,
  roster_name      text,      -- השם כפי שהמאמן רשם אותו בסגל
  team             text,
  coach_id         uuid,
  coach_name       text,
  coach_birth_date date,      -- מה שהמאמן הזין
  coach_birth_year int,
  coach_age        int,
  coach_says_minor boolean,
  self_birth_date  date,      -- מה שהשחקן הצהיר
  self_birth_year  int,
  self_age         int,
  self_says_minor  boolean,
  age_diff         int,       -- חיובי = המאמן חושב שהשחקן מבוגר יותר
  severity         text,      -- 'critical' | 'major' | 'minor'
  approval_status  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin boolean := public.is_admin();
  v_scope uuid;   -- null = כל הפלטפורמה (אדמין בלבד)
begin
  if p_coach is not null and not v_admin then
    raise exception 'למנהלים בלבד';
  end if;

  if v_admin then
    v_scope := p_coach;
  else
    -- לא אדמין: חייב להיות מאמן פעיל, ורואה רק את עצמו
    if public.is_banned() or not public.is_coach() then
      return;
    end if;
    v_scope := auth.uid();
  end if;

  return query
  with pairs as (
    select
      tp.id                                              as r_roster_id,
      tp.player_id                                       as r_player_id,
      tp.name                                            as r_roster_name,
      tp.team                                            as r_team,
      tp.coach_id                                        as r_coach_id,
      nullif(btrim(coalesce(cp.first_name, '') || ' ' ||
                   coalesce(cp.last_name, '')), '')      as r_coach_name,
      tp.birth_date                                      as r_c_bdate,
      tp.birth_year                                      as r_c_byear,
      public.minor_age(tp.birth_date, tp.birth_year)     as r_c_age,
      p.birth_date                                       as r_s_bdate,
      p.birth_year                                       as r_s_byear,
      public.minor_age(p.birth_date, p.birth_year)       as r_s_age,
      -- שנת הלידה האפקטיבית של כל צד. תאריך מלא גובר על שנה, בדיוק
      -- כמו ב-minor_age — כדי ששני החישובים לא יסתמכו על מקור אחר.
      coalesce(extract(year from tp.birth_date)::int, tp.birth_year) as r_c_year,
      coalesce(extract(year from p.birth_date)::int,  p.birth_year)  as r_s_year,
      -- צד אחד עם תאריך מלא והשני עם שנה בלבד → פערי החישוב אינם ראיה
      ((tp.birth_date is null) <> (p.birth_date is null))            as r_mixed,
      p.approval_status                                  as r_status
    from public.team_players tp
    join public.profiles p on p.id = tp.player_id
    left join public.profiles cp on cp.id = tp.coach_id
    where tp.player_id is not null
      and (v_scope is null or tp.coach_id = v_scope)
      -- אין מה להשוות אם צד אחד לא מילא כלום
      and public.minor_age(tp.birth_date, tp.birth_year) is not null
      and public.minor_age(p.birth_date,  p.birth_year)  is not null
  ),
  scored as (
    select
      pr.*,
      (pr.r_c_age - pr.r_s_age) as r_diff,
      case
        -- ההסכמה על השנה מנטרלת את הכול: שני בני האדם אמרו אותו דבר,
        -- וכל פער שנותר נולד מהשמרנות של minor_age ולא ממחלוקת.
        when pr.r_mixed and pr.r_c_year = pr.r_s_year then null
        -- קטין מול בגיר. זה המקרה היחיד עם משמעות משפטית ישירה, והוא
        -- גובר גם כשההפרש המספרי הוא שנה אחת בלבד (17 מול 18).
        when (pr.r_c_age < 18) <> (pr.r_s_age < 18)    then 'critical'
        when abs(pr.r_c_age - pr.r_s_age) >= 2         then 'major'
        when abs(pr.r_c_age - pr.r_s_age) = 1          then 'minor'
        else null                                       -- תואמים → לא מוחזר
      end as r_sev
    from pairs pr
  )
  select
    s.r_roster_id,
    s.r_player_id,
    s.r_roster_name,
    s.r_team,
    s.r_coach_id,
    s.r_coach_name,
    s.r_c_bdate,
    s.r_c_byear,
    s.r_c_age,
    (s.r_c_age < 18),
    s.r_s_bdate,
    s.r_s_byear,
    s.r_s_age,
    (s.r_s_age < 18),
    s.r_diff,
    s.r_sev,
    s.r_status
  from scored s
  where s.r_sev is not null
  order by case s.r_sev when 'critical' then 0 when 'major' then 1 else 2 end,
           abs(s.r_diff) desc,
           s.r_team nulls last,
           s.r_roster_name;
end;
$$;

revoke all on function public.age_mismatches(uuid) from public, anon;
grant execute on function public.age_mismatches(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 2) age_mismatch_count — מונה לתג (badge) במסך המאמן
--    אותן הרשאות בדיוק, כי הוא פשוט סופר את הפלט של 1. מי שלא רואה
--    שורות מקבל 0 ולא שגיאה — תג לא אמור להפיל מסך.
--    שים לב: אצל אדמין המספר הוא כלל-פלטפורמי, וזה מכוון.
-- ---------------------------------------------------------------------
create or replace function public.age_mismatch_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.age_mismatches();
$$;

revoke all on function public.age_mismatch_count() from public, anon;
grant execute on function public.age_mismatch_count() to authenticated;


-- ---------------------------------------------------------------------
-- 3) admin_age_mismatch_summary — תמונת מצב כלל-פלטפורמית לאדמין
--
--    למה זה קיים, כשאדמין כבר מקבל את כל השורות מ-age_mismatches():
--    שורות בלי מכנה אינן אומרות דבר. «3 אי-התאמות» יכול להיות מצוין
--    (מתוך 400 שורות שניתן להשוות) או חסר משמעות (מתוך 4). לכן כאן
--    מוחזרים גם linked_players וגם comparable — כמה שורות סגל מקושרות
--    יש למאמן בכלל, וכמה מהן בכלל ניתנות להשוואה. הפער בין השניים הוא
--    מדד הכיסוי האמיתי של המנגנון, וגם רשימת המאמנים שכדאי לבקש מהם
--    להשלים שנות לידה בסגל.
--
--    מאמן מוחזר גם כשאין לו ולו אי-התאמה אחת (אפסים) — בכוונה: זו
--    השורה שמראה «0 מתוך 0 ניתנות להשוואה», והיא החשובה לבדיקה.
-- ---------------------------------------------------------------------
drop function if exists public.admin_age_mismatch_summary();
create or replace function public.admin_age_mismatch_summary()
returns table (
  coach_id       uuid,
  coach_name     text,
  linked_players int,   -- שורות סגל מקושרות לחשבון שחקן
  comparable     int,   -- מתוכן: שני הצדדים מילאו נתוני לידה
  critical       int,
  major          int,
  minor          int,
  total          int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;

  return query
  with base as (
    select
      tp.coach_id as b_coach,
      count(*)::int as b_linked,
      (count(*) filter (
        where public.minor_age(tp.birth_date, tp.birth_year) is not null
          and public.minor_age(p.birth_date,  p.birth_year)  is not null
      ))::int as b_comparable
    from public.team_players tp
    join public.profiles p on p.id = tp.player_id
    where tp.player_id is not null
    group by tp.coach_id
  ),
  mm as (
    -- קריאה אחת ל-age_mismatches(null): הגיון הסיווג חי במקום אחד בלבד
    select
      m.coach_id as m_coach,
      (count(*) filter (where m.severity = 'critical'))::int as m_crit,
      (count(*) filter (where m.severity = 'major'))::int    as m_major,
      (count(*) filter (where m.severity = 'minor'))::int    as m_minor,
      count(*)::int                                          as m_total
    from public.age_mismatches(null) m
    group by m.coach_id
  )
  select
    b.b_coach,
    nullif(btrim(coalesce(cp.first_name, '') || ' ' ||
                 coalesce(cp.last_name, '')), ''),
    b.b_linked,
    b.b_comparable,
    coalesce(mm.m_crit, 0),
    coalesce(mm.m_major, 0),
    coalesce(mm.m_minor, 0),
    coalesce(mm.m_total, 0)
  from base b
  left join mm on mm.m_coach = b.b_coach
  left join public.profiles cp on cp.id = b.b_coach
  order by coalesce(mm.m_crit, 0) desc,
           coalesce(mm.m_major, 0) desc,
           coalesce(mm.m_total, 0) desc,
           b.b_linked desc;
end;
$$;

revoke all on function public.admin_age_mismatch_summary() from public, anon;
grant execute on function public.admin_age_mismatch_summary() to authenticated;


-- ---------------------------------------------------------------------
-- 4) רענון סכימת ה-API + רישום בלדג'ר
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_age_crosscheck.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקות עשן — הרץ אחרי המיגרציה
--
--  1) הפונקציות קיימות ובהרשאות הנכונות:
--       select p.proname, p.prosecdef,
--              array_to_string(p.proacl, ' ') as acl
--         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname = 'public'
--          and p.proname in ('age_mismatches', 'age_mismatch_count',
--                            'admin_age_mismatch_summary');
--     → prosecdef חייב להיות t בשלוש, ו-acl חייב להכיל authenticated=X
--       ולא להכיל anon.
--
--  2) מחשבון מאמן (קונסולת הדפדפן):
--       await supabase.rpc('age_mismatches')
--     → מערך שורות מהסגל שלו בלבד. בדוק ידנית שכל coach_id בפלט
--       שווה ל-uid שלך.
--       await supabase.rpc('age_mismatch_count')
--     → מספר, זהה לאורך המערך שלמעלה.
--
--  3) *הבדיקה החשובה* — מאמן לא מציץ אצל מאמן אחר:
--       await supabase.rpc('age_mismatches', { p_coach: '<uid של מאמן אחר>' })
--     → שגיאה «למנהלים בלבד». לא מערך ריק — שגיאה.
--
--  4) שחקן ואדמין:
--       -- מחשבון שחקן:
--       await supabase.rpc('age_mismatches')      → []  (בלי שגיאה)
--       await supabase.rpc('age_mismatch_count')  → 0
--       await supabase.rpc('admin_age_mismatch_summary')  → «למנהלים בלבד»
--       -- מחשבון אדמין:
--       await supabase.rpc('admin_age_mismatch_summary')
--     → שורה לכל מאמן עם שחקנים מקושרים, כולל אפסים.
--
--  5) הסיווג — צור מחלוקת מלאכותית ב-SQL Editor על שורת סגל מקושרת
--     כלשהי (החלף <rid>), ובדוק את severity אחרי כל שלב:
--
--       -- 5א · critical: המאמן אומר בגיר, השחקן הצהיר קטין
--       update public.team_players set birth_date = null, birth_year = 1995
--        where id = '<rid>';
--       -- ודא שבפרופיל המקושר יש שנת לידה של קטין (למשל 2012)
--       select severity, coach_age, self_age, age_diff
--         from public.age_mismatches(
--                (select coach_id from public.team_players where id = '<rid>'));
--       → 'critical'
--
--       -- 5ב · major: שניהם קטינים, הפרש 3 שנים
--       update public.team_players set birth_year = 2009 where id = '<rid>';
--       -- (מול פרופיל עם 2012) → 'major', age_diff = 3
--
--       -- 5ג · minor: הפרש שנה אחת בין שני קטינים
--       update public.team_players set birth_year = 2011 where id = '<rid>';
--       → 'minor', age_diff = 1
--
--       -- 5ד · הסכמה = לא מוחזר כלל
--       update public.team_players set birth_year = 2012 where id = '<rid>';
--       → השורה נעלמת מהפלט. שורה תואמת לעולם אינה מוחזרת.
--
--  6) *סינון האַרְטִיפָקְט* — הבדיקה שמונעת התרעות שווא, ובלעדיה
--     המנגנון היה מציף את המאמן ומאבד אמון:
--       -- אותה שנה משני הצדדים, אבל למאמן יש תאריך מלא ולשחקן רק שנה
--       update public.team_players
--          set birth_date = '2008-06-01', birth_year = 2008 where id = '<rid>';
--       -- ובפרופיל המקושר: birth_date = null, birth_year = 2008
--     → השורה **לא** מוחזרת, אף שהגילים המחושבים שונים (18 מול 17)
--       ואף ששניהם נופלים בצדדים שונים של 18. שניהם אמרו «2008» —
--       אין מחלוקת.
--
--  7) מה שהמנגנון לא תופס, וכדאי לראות את זה במו עיניך פעם אחת:
--       update public.team_players set birth_date = null, birth_year = 2005
--        where id = '<rid>';
--       -- וגם בפרופיל המקושר: birth_year = 2005 (אותו שקר בדיוק)
--     → אפס שורות. קטין שאמר את אותו דבר לשני הצדדים אינו מזוהה כאן.
--       זו מגבלה מובנית, לא באג. אל תתאר את המנגנון כ«אימות גיל».
--
--  8) כיסוי — כמה בכלל אפשר לבדוק:
--       select coach_name, linked_players, comparable, total
--         from public.admin_age_mismatch_summary();
--     אם comparable נמוך בהרבה מ-linked_players, המנגנון כמעט עיוור
--     אצל אותו מאמן — הפעולה הנכונה היא לבקש ממנו להשלים שנות לידה
--     בסגל, לא להסיק שהכול תקין.
--
--  9) אל תשכח להחזיר את נתוני הבדיקה למצבם המקורי אחרי סעיפים 5-7.
-- =====================================================================
