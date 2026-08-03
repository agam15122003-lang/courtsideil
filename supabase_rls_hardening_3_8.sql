-- =====================================================================
--  CourtSide — הקשחת RLS 3.8.2026  (סגירת כל ממצאי ה-RLS הקריטיים/גבוהים)
--  ---------------------------------------------------------------------
--  מקור: AUDIT_3.8.md. הקובץ סוגר את החורים הבאים:
--    1. profiles_select_authenticated = using(true)  (supabase_stage2.sql:68)
--    2. messages_insert_own בלי בדיקת קשר            (supabase_messages.sql:53)
--    3. עקיפת נעילת role דרך first_name=null         (supabase_security3.sql:37)
--    4. banned לא נבדק באף מדיניות                    (supabase_teams_admin.sql:111)
--    5. drills_select_authenticated ששרדה             (supabase_stage3.sql:62)
--    6. קהילת המאמנים פתוחה לשחקנים                   (supabase_community_chat.sql:43)
--    7. אין מדיניות DELETE לאדמין על תוכן              (supabase_community.sql:26)
--    8. player_messages = חדר ארצי אחד של קטינים זרים (supabase_security3.sql:60)
--    9. notifications_insert_actor בלי בדיקת נמען      (supabase_engagement.sql:28)
--   10. מדיניות Storage רחבות בלי שיוך לבעלים         (supabase_launch_migration.sql:146)
--
--  הרץ ב-Supabase → SQL Editor → Run. אידמפוטנטי — בטוח להרצה חוזרת.
--  סדר: אחרי supabase_privacy4.sql ו-supabase_security3.sql.
--
--  ⚠ שים לב: הקובץ הזה משנה את מדיניות הקריאה של profiles — השינוי המסוכן
--  ביותר בפרויקט. קרא את בדיקת קריאות-הפרונט למטה לפני ההרצה.
-- =====================================================================


-- =====================================================================
--  בדיקת כל קריאות ה-profiles בפרונט מול המדיניות החדשה
--  ---------------------------------------------------------------------
--  הכלל החדש:
--     id = auth.uid()  OR  is_admin()  OR  role = 'coach'  OR  shares_team_with(id)
--  (עם שכבת banned: משתמש חסום רואה אך ורק את השורה של עצמו)
--
--  הרציונל: מאמנים הם ספריה ציבורית במוצר הזה (coach_directory כבר חושף אותם,
--  מחברי תרגילים ופוסטים הם מאמנים). שורות של *שחקנים* — קטינים — נעשות
--  גלויות אך ורק למאמן שלהם ולחברי הקבוצה שלהם.
--
--  כל קריאה/join שנבדקה, ולמה היא ממשיכה לעבוד:
--
--  src/Admin.jsx:36          profiles.select('*')             → is_admin() ✓
--  src/CoachFinder.jsx:42    coach_directory (VIEW)           → security_invoker=false, לא מושפע ✓
--  src/CoachFinder.jsx:48    fallback profiles ... role=coach → role='coach' ✓
--  src/CoachOfWeek.jsx:56    coach_directory                  → לא מושפע ✓
--  src/CoachOfWeek.jsx:61    fallback profiles של בעל תרגיל   → בעל תרגיל = מאמן ✓
--  src/CoachProfile.jsx:35   author:profiles על drills        → מחבר תרגיל = מאמן ✓
--  src/Community.jsx:449     author:profiles!user_id (פוסטים) → הקהילה נסגרת למאמנים בסעיף 6 ✓
--  src/Community.jsx:816     profiles.in(ids) של הצ'אט        → כותבי הצ'אט = מאמנים ✓
--  src/Community.jsx:1193/99 ספירת מאמנים (role=coach)        → role='coach' ✓
--  src/Dashboard.jsx:216     profiles.eq(id, me)              → id = auth.uid() ✓
--  src/DrillCard.jsx:56      user:profiles על drill_comments  → מסך מאמנים בלבד; והקוד כבר
--                                                               מטפל ב-user=null (שורה 342) ✓
--  src/DrillForm.jsx:134     profiles של עצמי                 → id = auth.uid() ✓
--  src/DrillLibrary.jsx:113  author:profiles על drills        → מחבר תרגיל = מאמן ✓
--  src/GamesBoard.jsx:61     creator:profiles על game_requests→ יוצר בקשת משחק = מאמן ✓
--  src/Home.jsx:127          author:profiles!user_id (פוסטים) → מאמנים ✓
--  src/Messages.jsx:87       profiles.in(otherIds)            → אחרי סעיף 4 בן-שיח DM הוא
--                                                               מאמן, או מאמן/שחקן באותה קבוצה ✓
--  src/network.js:15         count profiles role=coach        → role='coach' ✓
--  src/Notifications.jsx:61  actor:profiles!actor_id          → אחרי סעיף 9 ה-actor הוא מאמן
--                                                               או שותף-קבוצה ✓
--  src/PlanNotebook.jsx:32   profiles של עצמי                 → id = auth.uid() ✓
--  src/PlayerCommunity.jsx:39 profiles.in(ids) של הצ'אט       → אחרי סעיף 8 כל הכותבים
--                                                               הנראים הם שותפי-קבוצה ✓
--  src/players.js:127        player:profiles!player_id        → shares_team_with כולל חברות
--                                                               בכל סטטוס, כולל 'pending' —
--                                                               מסך אישור הבקשות ממשיך לעבוד ✓
--  src/players.js:138        coach:profiles!coach_id          → role='coach' ✓
--  src/PlayerTeamHub.jsx:43  rpc('team_roster')               → SECURITY DEFINER, לא מושפע ✓
--  src/PlayerTimeline.jsx:98 coach:profiles!coach_id          → role='coach' ✓
--  src/ProfileForm.jsx:126   upsert על profiles               → מדיניות INSERT/UPDATE לא נגענו ✓
--  src/Schedule.jsx:98       profiles.eq(id, me)              → id = auth.uid() ✓
--  src/Schedule.jsx:226      from_p/to_p על coach_meetings    → שני הצדדים מאמנים ✓
--  src/Schedule.jsx:231      profiles.neq(id, me)             → מחזיר עכשיו מאמנים + השחקנים
--                                                               שלי במקום את כל המאגר. זו
--                                                               *הקטנה* של תוצאות — רשימת
--                                                               הזימון לפגישת מאמנים נשארת
--                                                               מלאה. אין שבירה ✓
--  src/TeamChat.jsx:45       profiles.in(missing)             → כותבי צ'אט קבוצתי = המאמן
--                                                               + חברים מאושרים ✓
--  src/TrainingPlans.jsx:518 profiles של עצמי                 → id = auth.uid() ✓
--  src/TrainingPlans.jsx:1186 profiles של בעל התוכנית         → בעל תוכנית = מאמן ✓
--
--  הערת דעיכה (לא שבירה): שיחת DM היסטורית מול שחקן שכבר עזב את הקבוצה
--  (שורת ה-membership נמחקה) תציג את ההודעה בלי שם. זו דעיכה מקובלת —
--  ההודעה עצמה נשארת, ואין קריסה.
--
--  ⚠ דורש תיקון בפרונט
--  ---------------------------------------------------------------------
--  (א) src/players.js:127 שולף גם birth_year, שכבר עכשיו נשלל ברמת grant
--      (supabase_privacy4.sql:45-46) ומחזיר 42501. זה ממצא נפרד באודיט
--      (src/players.js:127) ובבעלות סוכן הפרונט — המדיניות החדשה כאן לא
--      מחמירה אותו ולא פותרת אותו. אין לפתור אותו על ידי החזרת grant על
--      birth_year — הוא נשלל בכוונה.
--  (ב) עמודת profiles.approval_status (מגיעה מ-supabase_parent_consent.sql)
--      אינה מוגנת בטריגר שכאן, כי הפונקציות של זרימת ההסכמה משנות אותה
--      בהקשר של הקטין עצמו וחסימה כאן הייתה שוברת אותן. על סוכן ההסכמה
--      לוודא ש-approval_status ניתן לשינוי אך ורק מתוך ה-RPCים שלו
--      (למשל revoke update (approval_status) on public.profiles from authenticated).
--      בלי זה קטין יכול לקבוע לעצמו approval_status='active'.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) בדיקת קדם — נכשל עם הודעה ברורה במקום שגיאה סתומה באמצע הקובץ
-- ---------------------------------------------------------------------
do $pre$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'חסרה public.profiles — הרץ קודם את supabase_setup.sql';
  end if;
  if to_regclass('public.team_memberships') is null then
    raise exception 'חסרה public.team_memberships — הרץ קודם את supabase_players.sql';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'team_players' and column_name = 'player_id'
  ) then
    raise exception 'חסרה העמודה team_players.player_id — הרץ קודם את supabase_players.sql';
  end if;
  if to_regproc('public.is_admin') is null then
    raise exception 'חסרה public.is_admin() — הרץ קודם את supabase_teams_admin.sql';
  end if;
  if to_regproc('public.is_team_member') is null then
    raise exception 'חסרה public.is_team_member() — הרץ קודם את supabase_players.sql';
  end if;
end $pre$;


-- ---------------------------------------------------------------------
-- 1) פונקציות עזר (SECURITY DEFINER — כדי לא ליצור רקורסיית RLS)
-- ---------------------------------------------------------------------

-- האם משתמש מסוים הוא מאמן? (עומס-יתר: גרסה עם פרמטר + גרסה על המחובר)
create or replace function public.is_coach(p_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'coach' from public.profiles p where p.id = p_id), false);
$$;

create or replace function public.is_coach()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_coach(auth.uid());
$$;

-- האם המשתמש המחובר חסום? (ה"חסימה" הייתה עד היום ויזואלית בלבד)
create or replace function public.is_banned()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.banned from public.profiles p where p.id = auth.uid()), false);
$$;

-- ------------------------------------------------------------
-- shares_team_with — לב המדיניות החדשה. חייב להיות רחב מספיק כדי לא
-- לשבור מסכים קיימים, וצר מספיק כדי שקטין לא ייחשף לזרים.
-- true כאשר:
--   (א) אני מאמן ולנבדק יש שורת חברות אצלי — בכל סטטוס, כולל 'pending'
--       (בלי זה מסך אישור בקשות ההצטרפות מציג בקשות בלי שם)
--   (ב) אני מאמן והנבדק מקושר לשורת סגל שלי (team_players.player_id)
--   (ג) אני שחקן והנבדק הוא מאמן שיש לי אצלו שורת חברות (כל סטטוס)
--   (ד) שנינו חברים מאושרים באותה (coach_id, team)
--   (ה) אני חבר מאושר בקבוצה והנבדק מקושר לשורת סגל של אותה קבוצה
-- ------------------------------------------------------------
create or replace function public.shares_team_with(p_other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    p_other = auth.uid()
    -- (א) מאמן → מבקש/חבר בקבוצה שלי (כל סטטוס)
    or exists (
      select 1 from public.team_memberships m
      where m.coach_id = auth.uid() and m.player_id = p_other
    )
    -- (ב) מאמן → שחקן מקושר בסגל שלי
    or exists (
      select 1 from public.team_players tp
      where tp.coach_id = auth.uid() and tp.player_id = p_other
    )
    -- (ג) שחקן → המאמן שלו (כל סטטוס, כדי שהשם יוצג כבר בזמן ההמתנה)
    or exists (
      select 1 from public.team_memberships m
      where m.player_id = auth.uid() and m.coach_id = p_other
    )
    -- (ד) שני חברים מאושרים באותה קבוצה
    or exists (
      select 1
      from public.team_memberships a
      join public.team_memberships b
        on b.coach_id = a.coach_id and b.team = a.team
      where a.player_id = auth.uid() and a.status = 'approved'
        and b.player_id = p_other  and b.status = 'approved'
    )
    -- (ה) אני חבר מאושר, והנבדק הוא שורת סגל של אותה קבוצה
    or exists (
      select 1
      from public.team_memberships m
      join public.team_players tp
        on tp.coach_id = m.coach_id and tp.team = m.team
      where m.player_id = auth.uid() and m.status = 'approved'
        and tp.player_id = p_other
    ),
    false);
$$;

-- ------------------------------------------------------------
-- profiles_lite — לוקאפ שמות לצ'אטים. מחזיר שם/אווטאר/תפקיד בלבד,
-- ורק למי שממילא מותר לראות תחת אותו כלל של מדיניות ה-SELECT.
-- ------------------------------------------------------------
create or replace function public.profiles_lite(p_ids uuid[])
returns table (id uuid, first_name text, last_name text, avatar_url text, role text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;
  -- תקרה: מונע שימוש בפונקציה כדי לגרד את כל המאגר בקריאה אחת
  if array_length(p_ids, 1) > 500 then
    raise exception 'יותר מדי מזהים בבקשה אחת (מקסימום 500)';
  end if;
  return query
    select p.id, p.first_name, p.last_name, p.avatar_url, p.role
      from public.profiles p
     where p.id = any (p_ids)
       and (
         p.id = auth.uid()
         or (
           not public.is_banned()
           and (public.is_admin() or p.role = 'coach' or public.shares_team_with(p.id))
         )
       );
end;
$$;

revoke all on function public.is_coach()                from public, anon;
revoke all on function public.is_coach(uuid)            from public, anon;
revoke all on function public.is_banned()               from public, anon;
revoke all on function public.shares_team_with(uuid)    from public, anon;
revoke all on function public.profiles_lite(uuid[])     from public, anon;

grant execute on function public.is_coach()             to authenticated;
grant execute on function public.is_coach(uuid)         to authenticated;
grant execute on function public.is_banned()            to authenticated;
grant execute on function public.shares_team_with(uuid) to authenticated;
grant execute on function public.profiles_lite(uuid[])  to authenticated;

-- אינדקסים לתמיכה בפונקציות שרצות בתוך USING על כל שורה
create index if not exists profiles_role_idx          on public.profiles (role);
create index if not exists memb_coach_player_idx      on public.team_memberships (coach_id, player_id);
create index if not exists memb_player_coach_idx      on public.team_memberships (player_id, coach_id);
create index if not exists team_players_player_idx    on public.team_players (player_id);
create index if not exists team_players_coach_pl_idx  on public.team_players (coach_id, player_id);
create index if not exists team_players_coach_team_ix on public.team_players (coach_id, team);


-- ---------------------------------------------------------------------
-- 2) [קריטי] profiles — סוף ל-using(true)
--    מדיניות permissive מתאחדות ב-OR, ולכן *חייבים* למחוק את הישנה.
--    הוספת מדיניות צרה לצידה לא הייתה עושה כלום.
-- ---------------------------------------------------------------------
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_own"           on public.profiles;
drop policy if exists "profiles_select_related"       on public.profiles;

create policy "profiles_select_related"
  on public.profiles for select
  to authenticated
  using (
    -- תמיד את עצמי (גם אם נחסמתי — אחרת האפליקציה לא נטענת בכלל)
    -- ה-(select ...) סביב פונקציות חסרות-פרמטר הוא דפוס הביצועים המומלץ
    -- של Supabase: הוא הופך אותן ל-InitPlan שמחושב פעם אחת לשאילתה
    -- במקום פעם לכל שורה. הסמנטיקה זהה.
    profiles.id = (select auth.uid())
    or (
      not (select public.is_banned())
      and (
        (select public.is_admin())
        -- מאמנים = ספריה ציבורית במוצר הזה (coach_directory כבר חושף אותם)
        or profiles.role = 'coach'
        -- שורות של שחקנים (קטינים) — רק למאמן שלהם ולחברי הקבוצה
        or public.shares_team_with(profiles.id)
      )
    )
  );

-- מדיניות האדמין מ-supabase_teams_admin.sql (profiles_select_admin) נשארת
-- כפי שהיא ומתאחדת ב-OR — אין צורך לגעת בה.

-- הרשאת עמודה ל-approval_status (מגיע מ-supabase_parent_consent.sql).
-- שומר על כל ה-grants הקיימים מ-supabase_privacy4.sql — רק *מוסיף*.
do $ap$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'approval_status'
  ) then
    execute 'grant select (approval_status) on public.profiles to authenticated';
  end if;
end $ap$;


-- ---------------------------------------------------------------------
-- 3) [גבוה] נעילת role — סגירת העקיפה דרך first_name=null
--    היה: הנעילה הותנתה ב-old.first_name is not null, כלומר
--    PATCH first_name=null ואז PATCH role='player' עקף אותה.
--    עכשיו: הנעילה נשענת על עמודה ייעודית role_locked_at שנקבעת פעם אחת,
--    ואי אפשר לאפס אותה, וגם אי אפשר לאפס את first_name. הכלל הישן
--    (old.first_name is not null) נשאר כרצפה נוספת ב-OR, כדי שהנעילה לא
--    תהיה תלויה בהצלחת ה-backfill שלמטה.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists role_locked_at timestamptz;

-- נעילה רטרואקטיבית לכל מי שכבר השלים הרשמה.
--
-- ⚠ למה זה עטוף ולא UPDATE חשוף: בזמן שהקובץ הזה רץ (מיגרציה 32) עדיין
-- מותקן טריגר הקטינים **הישן** trg_minor_consent (supabase_privacy4.sql:122
-- / supabase_legal_launch.sql:17) — הוא מוחלף רק ב-supabase_parent_consent.sql
-- שהיא מיגרציה 33 ורצה אחרינו. הטריגר הזה זורק חריגה על *כל* שורת
-- role='player' עם first_name ובלי birth_year, וגם על קטין בלי guardian_*.
-- ב-SQL Editor כל הקובץ הוא טרנזקציה אחת, ולכן שורת שחקן ישנה אחת כזו
-- הייתה מגלגלת אחורה את **כל** מיגרציה 32: profiles_select_related לא
-- נוצרת, using(true) על profiles נשאר, וגם חסימת ה-DM ומדיניות ה-Storage
-- לא נוצרות — והמפעיל רואה שגיאה שמדברת על שנת לידה ולא על ההקשחה.
-- מעבר ל-33 לא היה פותר: גם הטריגר v3 (supabase_parent_consent.sql:421)
-- זורק 'חובה למלא שנת לידה' כש-minor_age() מחזירה null, מחוץ לתנאי
-- v_privileged. לכן מנטרלים את הטריגרים סביב ה-backfill בלבד.
--
-- trg_protect_profile_cols מנוטרל אף הוא — בהרצה חוזרת הוא כבר קיים,
-- והוא היה דורס את חותמת הזמן ההיסטורית ב-now().
do $lock$
declare
  v_off text[] := array[]::text[];  -- רק הטריגרים שבאמת ניטרלנו — כדי להחזיר בדיוק אותם
  t     text;
  r     record;
begin
  foreach t in array array['trg_minor_consent', 'trg_protect_profile_cols'] loop
    begin
      execute format('alter table public.profiles disable trigger %I', t);
      v_off := v_off || t;
    exception when others then
      -- הטריגר לא קיים בסביבה הזו, או שאין בעלות על הטבלה. ממשיכים —
      -- ה-backfill למטה יודע לשרוד גם עם טריגר פעיל.
      null;
    end;
  end loop;

  begin
    update public.profiles
       set role_locked_at = coalesce(updated_at, created_at, now())
     where role_locked_at is null
       and first_name is not null;
  exception when others then
    -- נפילה כאן = לא הצלחנו לנטרל (הרצה בתפקיד שאינו בעלים של הטבלה).
    -- נועלים שורה-שורה ובולעים כישלון בודד: עדיף שיישארו שורות לא-נעולות
    -- (הן ננעלות ממילא בעריכת הפרופיל הבאה, וסעיף הנעילה למטה מגבה אותן
    -- דרך old.first_name) מאשר שכל ההקשחה תתגלגל אחורה.
    raise notice 'ה-backfill הקבוצתי נכשל (%) — עוברים לנעילה שורה-שורה', sqlerrm;
    for r in select id, coalesce(updated_at, created_at, now()) as ts
               from public.profiles
              where role_locked_at is null
                and first_name is not null
    loop
      begin
        update public.profiles set role_locked_at = r.ts where id = r.id;
      exception when others then
        raise notice 'דילוג על הפרופיל % — %', r.id, sqlerrm;
      end;
    end loop;
  end;

  -- החזרה. בכוונה בלי exception handler: אם ההחזרה נכשלת חייבים לתת
  -- לבלוק ה-DO כולו להתגלגל אחורה (וכך גם ה-DISABLE מתבטל), אחרת נשאיר
  -- טריגר אבטחה מנוטרל בייצור — וזה גרוע ממיגרציה שנעצרה.
  foreach t in array v_off loop
    execute format('alter table public.profiles enable trigger %I', t);
  end loop;
end $lock$;

create or replace function public.protect_profile_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    -- שדות ניהול — אדמין בלבד
    if new.is_admin     is distinct from old.is_admin
    or new.verified     is distinct from old.verified
    or new.banned       is distinct from old.banned
    or new.verified_at  is distinct from old.verified_at
    or new.verified_by  is distinct from old.verified_by then
      raise exception 'שינוי שדות ניהול מותר לאדמין בלבד';
    end if;

    -- אסור למחוק את השם אחרי שנקבע: זו הייתה הדלת האחורית לשינוי תפקיד
    -- וגם לעקיפת שער הקטינים ב-enforce_minor_consent
    if old.first_name is not null and new.first_name is null then
      raise exception 'לא ניתן למחוק את השם מהפרופיל';
    end if;

    -- הנעילה עצמה אינה ניתנת לאיפוס בידי המשתמש
    new.role_locked_at := old.role_locked_at;

    -- תפקיד: נבחר פעם אחת בלבד, בהשלמת ההרשמה.
    -- old.first_name is not null נשאר כתנאי-רצפה (הכלל הישן מ-
    -- supabase_security3.sql:37) ולא רק role_locked_at: אם ה-backfill למעלה
    -- נאלץ לדלג על שורה בגלל טריגר הקטינים, השורה הזו נשארת עם
    -- role_locked_at = null — ובלי הרצפה הזו היה נפתח לה "היפוך תפקיד אחד
    -- חינם". מחיקת first_name כבר חסומה למעלה, ולכן זו לא דלת אחורית.
    -- בהרשמה אמיתית old.first_name הוא null (handle_new_user יוצר שורה עם
    -- id בלבד), ולכן בחירת התפקיד הראשונה ממשיכה לעבוד.
    if new.role is distinct from old.role
       and (old.role_locked_at is not null or old.first_name is not null) then
      raise exception 'לא ניתן לשנות תפקיד (מאמן/שחקן) לאחר ההרשמה. פנו לתמיכה.';
    end if;
  end if;

  -- ברגע שיש שם — התפקיד ננעל
  if new.first_name is not null and new.role_locked_at is null then
    new.role_locked_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_cols on public.profiles;
create trigger trg_protect_profile_cols
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_cols();

-- ננעל כבר ב-INSERT: בלי זה נשארה חלון של "היפוך תפקיד אחד חינם" למי
-- שיוצר את שורת הפרופיל שלו ישירות עם first_name (INSERT ואז UPDATE).
create or replace function public.lock_role_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.first_name is not null and new.role_locked_at is null then
    new.role_locked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_role_insert on public.profiles;
create trigger trg_lock_role_insert
  before insert on public.profiles
  for each row execute function public.lock_role_on_insert();


-- ---------------------------------------------------------------------
-- 4) [קריטי] messages — סוף לפנייה ישירה של מבוגר זר לכל קטין
--    מותר לשלוח DM אך ורק:
--      • מאמן ↔ מאמן
--      • מאמן ↔ שחקן שיש איתו קשר קבוצתי בפועל
--    חסום לחלוטין: שחקן ↔ שחקן, ומבוגר-זר ↔ קטין.
-- ---------------------------------------------------------------------
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id <> auth.uid()
    and not public.is_banned()
    and (
      (public.is_coach() and public.is_coach(recipient_id))
      or (
        public.shares_team_with(recipient_id)
        and (public.is_coach() or public.is_coach(recipient_id))
      )
    )
  );

-- אדמין: קריאה ומחיקה לצורכי טיפול בתלונות על תוכן שנוגע לקטין.
-- ⚠ זו הרחבה משמעותית של גישת האדמין להודעות פרטיות — יש להשתמש בה
-- רק במסגרת טיפול בדיווח, ורצוי לתעד כל שימוש.
drop policy if exists "messages_admin_read" on public.messages;
create policy "messages_admin_read"
  on public.messages for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "messages_admin_delete" on public.messages;
create policy "messages_admin_delete"
  on public.messages for delete
  to authenticated
  using ((select public.is_admin()));

create index if not exists messages_recipient_idx on public.messages (recipient_id, created_at desc);
create index if not exists messages_sender_idx    on public.messages (sender_id, created_at desc);


-- ---------------------------------------------------------------------
-- 5) [גבוה] drills — מחיקת המדיניות ששרדה והפכה את שער is_public לאות מתה
-- ---------------------------------------------------------------------
drop policy if exists "drills_select_authenticated" on public.drills;
drop policy if exists "drills_select_all"           on public.drills;

-- מוודאים ששער ה-is_public אכן קיים (idempotent)
drop policy if exists "drills_select_public_or_own" on public.drills;
create policy "drills_select_public_or_own"
  on public.drills for select
  using (is_public or created_by = auth.uid());

-- שחקן חייב לראות תרגיל *פרטי* ששוגר אליו אישית או לקבוצה שלו,
-- אחרת מסך "המשימות שלי" מציג שיגור בלי תוכן (PlayerDashboard.jsx:387,
-- PlayerCard.jsx:119, TeamAssignments.jsx:35)
do $dr$
begin
  if to_regclass('public.player_assignments') is not null then
    execute 'drop policy if exists "drills_assigned_read" on public.drills';
    execute 'create policy "drills_assigned_read" on public.drills
      for select to authenticated
      using (exists (
        select 1 from public.player_assignments a
        where a.drill_id = drills.id
          and (
            a.player_id = auth.uid()
            or (a.player_id is null and a.team is not null
                and public.is_team_member(a.coach_id, a.team))
          )
      ))';
  end if;
end $dr$;

create index if not exists drills_created_by_idx on public.drills (created_by);
create index if not exists drills_public_idx     on public.drills (is_public);


-- ---------------------------------------------------------------------
-- 6) [גבוה] קהילת המאמנים — הפרדה אמיתית בין עולם המבוגרים לעולם הקטינים
--    עד היום ההפרדה הייתה בניווט בלבד: שחקן קטין יכול היה לקרוא ולכתוב
--    בפיד ובצ'אט של המאמנים בקריאת REST ישירה עם ה-anon key.
--    השער: מאמן (או אדמין) שאינו חסום.
-- ---------------------------------------------------------------------
do $com$
declare
  -- כל השער אינו תלוי-שורה, ולכן הוא נכתב כ-(select ...) ומחושב פעם אחת
  gate constant text := '(((select public.is_coach()) or (select public.is_admin())) and not (select public.is_banned()))';
  own  constant text := 'user_id = (select auth.uid())';
begin
  -- פוסטים
  if to_regclass('public.community_posts') is not null then
    execute 'drop policy if exists "community_posts_select" on public.community_posts';
    execute format('create policy "community_posts_select" on public.community_posts
      for select to authenticated using (%s)', gate);
    execute 'drop policy if exists "community_posts_insert" on public.community_posts';
    execute format('create policy "community_posts_insert" on public.community_posts
      for insert to authenticated with check (%s and %s)', own, gate);
  end if;

  -- לייקים
  if to_regclass('public.community_post_likes') is not null then
    execute 'drop policy if exists "community_post_likes_select" on public.community_post_likes';
    execute format('create policy "community_post_likes_select" on public.community_post_likes
      for select to authenticated using (%s)', gate);
    execute 'drop policy if exists "community_post_likes_insert" on public.community_post_likes';
    execute format('create policy "community_post_likes_insert" on public.community_post_likes
      for insert to authenticated with check (%s and %s)', own, gate);
  end if;

  -- תגובות
  if to_regclass('public.community_post_comments') is not null then
    execute 'drop policy if exists "community_post_comments_select" on public.community_post_comments';
    execute format('create policy "community_post_comments_select" on public.community_post_comments
      for select to authenticated using (%s)', gate);
    execute 'drop policy if exists "community_post_comments_insert" on public.community_post_comments';
    execute format('create policy "community_post_comments_insert" on public.community_post_comments
      for insert to authenticated with check (%s and %s)', own, gate);
  end if;

  -- צ'אט המאמנים
  if to_regclass('public.community_messages') is not null then
    execute 'drop policy if exists "community_select_authenticated" on public.community_messages';
    execute format('create policy "community_select_authenticated" on public.community_messages
      for select to authenticated using (%s)', gate);
    execute 'drop policy if exists "community_insert_own" on public.community_messages';
    execute format('create policy "community_insert_own" on public.community_messages
      for insert to authenticated with check (%s and %s)', own, gate);
  end if;

  -- סקרים
  if to_regclass('public.community_poll_votes') is not null then
    execute 'drop policy if exists "poll_votes_select" on public.community_poll_votes';
    execute format('create policy "poll_votes_select" on public.community_poll_votes
      for select to authenticated using (%s)', gate);
    execute 'drop policy if exists "poll_votes_insert" on public.community_poll_votes';
    execute format('create policy "poll_votes_insert" on public.community_poll_votes
      for insert to authenticated with check (%s and %s)', own, gate);
    execute 'drop policy if exists "poll_votes_update" on public.community_poll_votes';
    execute format('create policy "poll_votes_update" on public.community_poll_votes
      for update to authenticated using (%s and %s) with check (%s and %s)', own, gate, own, gate);
  end if;

  -- אירועים
  if to_regclass('public.community_events') is not null then
    execute 'drop policy if exists "events_select" on public.community_events';
    execute format('create policy "events_select" on public.community_events
      for select to authenticated using (%s)', gate);
    execute 'drop policy if exists "events_insert" on public.community_events';
    execute format('create policy "events_insert" on public.community_events
      for insert to authenticated with check (created_by = (select auth.uid()) and %s)', gate);
  end if;

  -- אישורי הגעה לאירועים
  if to_regclass('public.community_event_rsvps') is not null then
    execute 'drop policy if exists "rsvps_select" on public.community_event_rsvps';
    execute format('create policy "rsvps_select" on public.community_event_rsvps
      for select to authenticated using (%s)', gate);
    execute 'drop policy if exists "rsvps_insert" on public.community_event_rsvps';
    execute format('create policy "rsvps_insert" on public.community_event_rsvps
      for insert to authenticated with check (%s and %s)', own, gate);
  end if;
end $com$;


-- ---------------------------------------------------------------------
-- 7) [גבוה] player_messages — סוף לחדר הארצי של קטינים זרים
--    is_linked_player() בדקה רק "מאושר באיזושהי קבוצה", ולכן כל הקטינים
--    מכל המועדונים ישבו יחד בחדר אחד בלי מאמן ובלי מודרציה.
--    הפתרון בלי שינוי סכימה ובלי שינוי בפרונט (PlayerCommunity.jsx שולף
--    את הטבלה בלי סינון): הראות עצמה מוגבלת לשותפי-קבוצה.
-- ---------------------------------------------------------------------
do $pm$
begin
  if to_regclass('public.player_messages') is not null
     and to_regproc('public.is_player') is not null
     and to_regproc('public.is_linked_player') is not null then
    execute 'drop policy if exists "pmsg_select_players" on public.player_messages';
    execute 'create policy "pmsg_select_players" on public.player_messages
      for select to authenticated
      using (
        (select public.is_admin())
        or (
          not (select public.is_banned())
          and (user_id = (select auth.uid()) or public.shares_team_with(user_id))
        )
      )';

    execute 'drop policy if exists "pmsg_insert_own_player" on public.player_messages';
    execute 'create policy "pmsg_insert_own_player" on public.player_messages
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and public.is_player()
        and not public.is_banned()
        and public.is_linked_player()
      )';
  end if;
end $pm$;

-- צ'אט קבוצתי: משתמש חסום לא כותב
do $tmsg$
begin
  if to_regclass('public.team_messages') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'team_join_codes'
         and column_name = 'chat_announce_only'
     ) then
    execute 'drop policy if exists "tm_insert" on public.team_messages';
    execute 'create policy "tm_insert" on public.team_messages
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and not public.is_banned()
        and (public.is_team_member(coach_id, team) or coach_id = auth.uid())
        and (
          coach_id = auth.uid()
          or not exists (
            select 1 from public.team_join_codes j
            where j.coach_id = team_messages.coach_id
              and j.team = team_messages.team
              and j.chat_announce_only
          )
        )
      )';
  end if;
end $tmsg$;


-- ---------------------------------------------------------------------
-- 8) [גבוה] notifications — סוף לדחיפת התראות לכל קטין במערכת
--    כל הקריאות ל-sendNotification בפרונט נבדקו: הנמען הוא תמיד המאמן
--    שלי, שחקן בסגל/בקבוצה שלי, או מחבר פוסט בקהילה (מאמן).
-- ---------------------------------------------------------------------
drop policy if exists "notifications_insert_actor" on public.notifications;
create policy "notifications_insert_actor"
  on public.notifications for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and not public.is_banned()
    and (
      user_id = auth.uid()
      or public.shares_team_with(user_id)
      or (public.is_coach() and public.is_coach(user_id))
    )
  );


-- ---------------------------------------------------------------------
-- 9) [גבוה] מדיניות DELETE לאדמין על כל טבלת תוכן
--    בלי זה לאדמין אין שום נתיב טכני להסיר תוכן פוגעני שנוגע לקטין,
--    מלבד כניסה ידנית ל-SQL Editor.
-- ---------------------------------------------------------------------
do $adm$
declare t text;
begin
  foreach t in array array[
    'community_posts', 'community_post_comments', 'community_post_likes',
    'community_messages', 'community_events', 'community_poll_votes',
    'community_event_rsvps', 'player_messages', 'team_messages',
    'drill_comments', 'drill_videos', 'drills', 'game_requests',
    'player_feedback', 'client_errors'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "%s_admin_delete" on public.%I', t, t);
      execute format('create policy "%s_admin_delete" on public.%I
        for delete to authenticated using ((select public.is_admin()))', t, t);
    end if;
  end loop;
end $adm$;

-- קריאה לאדמין על תוכן שאינו קהילתי, כדי שיוכל לבדוק דיווח לפני הסרה
do $admr$
declare t text;
begin
  foreach t in array array['player_messages', 'team_messages', 'drill_comments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "%s_admin_read" on public.%I', t, t);
      execute format('create policy "%s_admin_read" on public.%I
        for select to authenticated using ((select public.is_admin()))', t, t);
    end if;
  end loop;
end $admr$;


-- ---------------------------------------------------------------------
-- 10) [גבוה] Storage — הצמדת כתיבה/מחיקה לתיקיית הבעלים
--     היה: INSERT+UPDATE+DELETE ל-authenticated עם התנאי היחיד
--     bucket_id='media' — כל משתמש רשום יכול היה לדרוס את תמונת הפרופיל
--     של כל קטין או למחוק את כל תמונות הקהילה, בלי עקבות.
--
--     נתיב ההעלאה בפועל (src/storage.js:43): `<folder>/<userId>/<ts>.<ext>`
--     ולכן (storage.foldername(name))[2] הוא מזהה הבעלים.
--
--     ⚠ הקובץ הזה *לא* יוצר מדיניות SELECT על storage.objects ולא הופך את
--     ה-bucket לפרטי — הצד הזה שייך לקובץ הנפרד של המעבר ל-bucket פרטי.
--     כל עוד ה-bucket ציבורי, הצגת התמונות עוברת ב-CDN הציבורי ואינה
--     תלויה במדיניות SELECT, ולכן הסרת המדיניות הרחבה לא שוברת תצוגה.
-- ---------------------------------------------------------------------
do $st$
declare r record;
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects לא קיים — דילוג על מדיניות האחסון';
    return;
  end if;

  -- (א) הסרת כל מדיניות כתיבה רחבה על bucket media שאינה מצמידה לבעלים
  for r in
    select policyname
      from pg_policies
     where schemaname = 'storage'
       and tablename  = 'objects'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%media%'
       and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) not like '%auth.uid()%'
       and policyname not in ('media_insert_own_folder', 'media_update_own_folder', 'media_delete_own_folder')
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
    raise notice 'הוסרה מדיניות אחסון רחבה מדי: %', r.policyname;
  end loop;

  -- (ב) העלאה: רק לתיקייה של עצמי, רק לתיקיות המוכרות, ורק אם לא נחסמתי
  execute 'drop policy if exists "media_insert_own_folder" on storage.objects';
  execute $p$create policy "media_insert_own_folder" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'media'
      and (storage.foldername(name))[1] in ('avatars', 'drills', 'community')
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and not (select public.is_banned())
    )$p$;

  -- (ג) דריסה (upsert:true ב-src/storage.js): רק הבעלים או אדמין
  execute 'drop policy if exists "media_update_own_folder" on storage.objects';
  execute $p$create policy "media_update_own_folder" on storage.objects
    for update to authenticated
    using (
      bucket_id = 'media'
      and ((storage.foldername(name))[2] = (select auth.uid())::text or (select public.is_admin()))
    )
    with check (
      bucket_id = 'media'
      and ((storage.foldername(name))[2] = (select auth.uid())::text or (select public.is_admin()))
    )$p$;

  -- (ד) מחיקה: רק הבעלים או אדמין (הסרת תמונה פוגענית)
  execute 'drop policy if exists "media_delete_own_folder" on storage.objects';
  execute $p$create policy "media_delete_own_folder" on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'media'
      and ((storage.foldername(name))[2] = (select auth.uid())::text or (select public.is_admin()))
    )$p$;

exception when others then
  -- מדיניות על storage.objects דורשת בעלות/הרשאה שלא תמיד קיימת ל-postgres
  -- ב-SQL Editor. במקרה כזה שאר הקובץ חייב להמשיך להיות תקף.
  raise warning 'יצירת מדיניות ה-Storage נכשלה (%). צור אותן ידנית ב-Storage → Policies לפי הגוף שבסעיף 10 של הקובץ הזה.', sqlerrm;
end $st$;


-- ---------------------------------------------------------------------
-- 11) רישום המיגרציה + רענון סכימת ה-API
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_rls_hardening_3_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  שאילתת אימות — חייבת לחזור ריקה (או בלי אף טבלה רגישה):
--
--    select tablename, policyname, qual
--      from pg_policies
--     where schemaname = 'public' and qual = 'true';
--
--  ובמקביל, לוודא שלא נשארה מדיניות אחסון בלי שיוך לבעלים:
--
--    select policyname, cmd, qual, with_check
--      from pg_policies
--     where schemaname = 'storage' and tablename = 'objects';
--
--  ⚠ חובה אחרי ההרצה — הקובץ הזה רץ כטרנזקציה אחת ב-SQL Editor, ומיגרציה
--  34 בודקת רק את *קיום* is_banned() ולכן "תצליח" גם אם 32 התגלגלה אחורה.
--  שלוש שאילתות שמאשרות שההקשחה באמת נחתה:
--
--    -- (א) המדיניות הרחבה נעלמה והצרה נוצרה — חייב להחזיר שורה אחת בלבד,
--    --     בשם profiles_select_related
--    select policyname from pg_policies
--     where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
--       and policyname in ('profiles_select_authenticated', 'profiles_select_related');
--
--    -- (ב) נעילת ה-role עברה על כל מי שכבר השלים הרשמה — צפוי 0.
--    --     ערך > 0 = הטריגר הישן חסם שורות ו-backfill עבד במצב "שורה-שורה"
--    --     (חפש 'דילוג על הפרופיל' בפלט). לא קריטי — הרצפה שב-
--    --     protect_profile_privileged_cols מכסה אותן — אבל שווה לתקן:
--    --     אלו שורות שחקן בלי birth_year, והשחקן חסום מלשמור פרופיל.
--    select count(*) from public.profiles
--     where role_locked_at is null and first_name is not null;
--
--    -- (ג) שני הטריגרים חזרו לפעולה — tgenabled חייב להיות 'O' בשניהם
--    select tgname, tgenabled from pg_trigger
--     where tgrelid = 'public.profiles'::regclass and not tgisinternal;
-- =====================================================================


-- =====================================================================
--  בדיקות עשן — הוכחה שכל חור נסגר
--  ---------------------------------------------------------------------
--  הכנה: קח את ה-anon key מ-Supabase → Settings → API, ואת ה-access_token
--  של חשבון בדיקה (מהדפדפן: JSON.parse(localStorage[<sb-...-auth-token>]).access_token).
--  אל תשמור את הטוקן בקובץ ואל תדחוף אותו ל-git.
--
--    export URL="https://<PROJECT>.supabase.co"
--    export ANON="<anon key>"
--    export TOK="<access_token של חשבון שחקן בדיקה>"
--    H=(-H "apikey: $ANON" -H "Authorization: Bearer $TOK")
--
--  1) [קריטי] דליפת מאגר הקטינים — מחשבון שחקן:
--       curl -s "${H[@]}" "$URL/rest/v1/profiles?select=id,first_name,role&role=eq.player"
--     צפוי: רק אני + חברי הקבוצה שלי. אם חוזר יותר מזה — profiles_select_related
--     לא נוצרה או שנשארה מדיניות using(true). בדוק בשאילתת האימות למעלה.
--     ומחשבון מאמן א' על שחקן של מאמן ב':
--       curl -s "${H[@]}" "$URL/rest/v1/profiles?select=id&id=eq.<PLAYER_OF_ANOTHER_COACH>"
--     צפוי: []
--
--  2) [קריטי] DM למבוגר-זר→קטין — מחשבון מאמן א' אל שחקן של מאמן ב':
--       curl -s -X POST "${H[@]}" -H "Content-Type: application/json" \
--         -d '{"recipient_id":"<PLAYER_OF_ANOTHER_COACH>","content":"test"}' \
--         "$URL/rest/v1/messages"
--     צפוי: 403 עם "new row violates row-level security policy".
--     ומחשבון שחקן אל שחקן אחר — גם כן 403.
--     בדיקת אי-רגרסיה: מאמן→מאמן ומאמן→שחקן שלו חייבים להצליח (201).
--
--  3) [גבוה] עקיפת נעילת role — מחשבון קיים עם שם:
--       curl -s -X PATCH "${H[@]}" -H "Content-Type: application/json" \
--         -d '{"first_name":null}' "$URL/rest/v1/profiles?id=eq.<MY_ID>"
--     צפוי: 400 "לא ניתן למחוק את השם מהפרופיל".
--       curl -s -X PATCH "${H[@]}" -H "Content-Type: application/json" \
--         -d '{"role":"coach"}' "$URL/rest/v1/profiles?id=eq.<MY_ID>"
--     צפוי: 400 "לא ניתן לשנות תפקיד...".
--     אי-רגרסיה: הרשמה חדשה (פרופיל בלי first_name) חייבת להצליח לקבוע role פעם אחת.
--     ואם שאילתה (ב) למעלה החזירה > 0 — בדוק גם על אחת מהשורות שנפסחו
--     (role_locked_at is null אבל first_name is not null) שהיא עדיין חסומה:
--       curl -s -X PATCH "${H[@]}" -H "Content-Type: application/json" \
--         -d '{"role":"coach"}' "$URL/rest/v1/profiles?id=eq.<SKIPPED_ID>"
--     צפוי: 400 — הרצפה של old.first_name תופסת גם בלי role_locked_at.
--
--  4) [גבוה] banned — סמן חשבון בדיקה כחסום:
--       update public.profiles set banned = true where id = '<TEST_ID>';
--     ⚠ אם ה-UPDATE הזה נופל על «חובה למלא שנת לידה בפרופיל שחקן» — זה
--       trg_minor_consent הישן, לא באג בהקשחה. מלא birth_year לשורת הבדיקה
--       או השתמש בחשבון מאמן; אל תנטרל את הטריגר ידנית ותשכח להחזיר אותו.
--     ואז מאותו חשבון:
--       curl -s "${H[@]}" "$URL/rest/v1/profiles?select=id"        → רק השורה של עצמו
--       curl -s "${H[@]}" "$URL/rest/v1/community_messages?select=id" → []
--       POST ל-messages / community_posts / player_messages         → 403
--     החזר: update public.profiles set banned = false where id = '<TEST_ID>';
--     ⚠ השלמה חובה מחוץ ל-SQL: Supabase → Auth → Users → Ban user
--        (ban_duration) כדי לפסול גם את הטוקן הקיים.
--
--  5) [גבוה] תרגילים פרטיים — צור תרגיל עם is_public=false מחשבון מאמן א',
--     ואז מחשבון מאמן ב' (או שחקן):
--       curl -s "${H[@]}" "$URL/rest/v1/drills?select=id,title&id=eq.<PRIVATE_DRILL_ID>"
--     צפוי: []
--     אי-רגרסיה: שגר את אותו תרגיל לשחקן שלך (player_assignments) —
--     מחשבון השחקן הוא כן חייב לחזור (drills_assigned_read).
--
--  6) [גבוה] קהילת המאמנים סגורה לשחקנים — מחשבון שחקן:
--       curl -s "${H[@]}" "$URL/rest/v1/community_messages?select=id"  → []
--       curl -s "${H[@]}" "$URL/rest/v1/community_posts?select=id"     → []
--       curl -s -X POST "${H[@]}" -H "Content-Type: application/json" \
--         -d '{"content":"test"}' "$URL/rest/v1/community_messages"    → 403
--     אי-רגרסיה: מחשבון מאמן שתי הקריאות הראשונות חייבות להחזיר תוכן.
--
--  7) [גבוה] מחיקה לאדמין — מחשבון אדמין:
--       curl -s -X DELETE "${H[@]}" "$URL/rest/v1/community_posts?id=eq.<POST_OF_SOMEONE_ELSE>"
--     צפוי: 204, והפוסט נעלם. מחשבון לא-אדמין: הפוסט נשאר.
--
--  8) [גבוה] player_messages כבר לא חדר ארצי — שני חשבונות שחקן
--     של *מאמנים שונים*. שחקן א' כותב הודעה, ואז מחשבון שחקן ב':
--       curl -s "${H[@]}" "$URL/rest/v1/player_messages?select=id,content"
--     צפוי: ההודעה של שחקן א' לא מופיעה. שני שחקנים של אותו מאמן ואותה
--     קבוצה — כן רואים זה את זה.
--     ⚠ צפוי: הודעות היסטוריות מכל הארץ "ייעלמו" מהמסך של כל שחקן. זה
--     בדיוק התיקון, לא באג.
--
--  9) [גבוה] התראות — מחשבון א' אל משתמש שאין איתו שום קשר:
--       curl -s -X POST "${H[@]}" -H "Content-Type: application/json" \
--         -d '{"user_id":"<STRANGER_ID>","actor_id":"<MY_ID>","type":"message","content":"x"}' \
--         "$URL/rest/v1/notifications"
--     צפוי: 403. אי-רגרסיה: אישור בקשת הצטרפות במסך המאמן חייב להמשיך
--     לשלוח התראה לשחקן (players.js:158) — בדוק שההתראה מגיעה.
--
-- 10) [גבוה] Storage — מחשבון א', נסה לדרוס קובץ של משתמש ב':
--       curl -s -X POST "${H[@]}" -H "x-upsert: true" \
--         -F "file=@x.jpg" "$URL/storage/v1/object/media/avatars/<OTHER_USER_ID>/1.jpg"
--     צפוי: 403 "new row violates row-level security policy".
--     ומחיקה:
--       curl -s -X DELETE "${H[@]}" "$URL/storage/v1/object/media/avatars/<OTHER_USER_ID>/1.jpg"
--     צפוי: 403 / 400. אי-רגרסיה: העלאת אווטאר לעצמי מהאפליקציה חייבת לעבוד.
--
-- 11) לוקאפ שמות דרך ה-RPC (למסכי צ'אט):
--       curl -s -X POST "${H[@]}" -H "Content-Type: application/json" \
--         -d '{"p_ids":["<TEAMMATE_ID>","<STRANGER_MINOR_ID>"]}' \
--         "$URL/rest/v1/rpc/profiles_lite"
--     צפוי: מוחזר רק ה-teammate. וללא טוקן (anon) — 401/404.
-- =====================================================================
