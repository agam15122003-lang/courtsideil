-- =====================================================================
-- CourtSide — «המקום שלי» מדבר באותה שפה כמו הטבלה  ·  16.8.2026
--
-- הבעיה, בשפה של מסך:
--   כרטיס «המקום שלי» אומר «מקום 7 מתוך 14», ומיד מתחתיו הטבלה מציגה
--   פחות שחקנים — ולפעמים גם סדר אחר. שני המספרים באים משתי פונקציות
--   שונות שסופרות אוכלוסייה שונה:
--     · game_board      מדרגת **רק שחקנים רשומים לטבלה** (game_is_listed):
--       חשבון פעיל, לא חסום, תפקיד «שחקן», ושם פרטי קיים.
--     · game_my_standing דירגה **את כולם**, כולל מי שאינו רשום לטבלה —
--       למשל קטין שממתין לאישור הורה, או חשבון שהוסר.
--   התוצאה: המקום שהשחקן רואה על עצמו אינו המקום שלו בטבלה שלידו.
--
-- מה משתנה כאן:
--   1. הדירוג (rank / total / «כמה נקודות מאחורי מי») מחושב מעכשיו על
--      אותה אוכלוסייה בדיוק כמו הטבלה — רק שחקנים רשומים.
--   2. **הנקודות של השחקן עצמו נשארות שלו** גם כשהוא עדיין לא רשום
--      לטבלה. קטין שממתין לאישור הורה צובר נקודות באמת, והמסך לא ימחק
--      לו אותן — הוא פשוט יראה «עוד לא בטבלה» במקום מקום מומצא.
--      (עמודת listed כבר מחזירה את זה, והמסך כבר מתייחס אליה.)
--
-- מה **לא** משתנה: החתימה, שמות העמודות וסדרן. הפרונט לא צריך שינוי,
-- והרצה חוזרת בטוחה.
--
-- אידמפוטנטי.
-- דורש: supabase_game_core_12_8.sql
-- =====================================================================


do $dep$
begin
  if to_regclass('public.game_points_ledger') is null then
    raise notice '';
    raise notice '  ✋ עצור: game_points_ledger לא קיימת — הרץ supabase_game_core_12_8.sql קודם.';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- game_my_standing — «איפה אני» מול אותה אוכלוסייה כמו game_board
--
-- ⚠ הפונקציה ממשיכה להחזיר שורה **גם למי שאינו רשום לטבלה**, עם
--   listed=false. זו הייתה ההחלטה המקורית והיא נכונה: מסך ריק בלי הסבר
--   הוא הדרך הבטוחה לאבד קטין שממתין לאישור הורה.
-- ⚠ #variable_conflict use_column — שמות עמודות הפלט (rank, points…) הם
--   גם משתני plpgsql; בלי ההנחיה הזו הפניה לעמודה עלולה לחזור כ«ambiguous».
-- ---------------------------------------------------------------------
create or replace function public.game_my_standing(
  p_scope  text default 'challenge',
  p_period text default 'month',
  p_key    text default null,
  p_league text default null
)
returns table (
  rank      int,
  points    int,
  total     int,
  listed    boolean,
  behind_by int,
  ahead_of  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_key text; v_me uuid := auth.uid();
begin
  if v_me is null then return; end if;

  v_key := nullif(btrim(coalesce(p_key, '')), '');
  if v_key is null then
    if p_period = 'month'  then select k.month  into v_key from public.game_period_keys() k; end if;
    if p_period = 'season' then select k.season into v_key from public.game_period_keys() k; end if;
  end if;
  if v_key is null then return; end if;

  return query
  with base as (
    select l.user_id, sum(l.points)::int as pts, min(l.occurred_at) as first_at
      from public.game_points_ledger l
     where l.scope = p_scope
       and (p_league is null or l.league_key = p_league)
       and case p_period
             when 'month'  then l.period_month  = v_key
             when 'season' then l.period_season = v_key
             when 'round'  then (l.ref_round = v_key::uuid or l.ref_challenge = v_key::uuid)
             else false
           end
       -- ⬅ השורה שכל הקובץ הזה קיים בשבילה: אותה אוכלוסייה כמו game_board
       and public.game_is_listed(l.user_id)
     group by l.user_id
  ),
  ranked as (
    select b.user_id, b.pts, rank() over (order by b.pts desc, b.first_at asc)::int as rnk
      from base b
  ),
  me as (select * from ranked where user_id = v_me),
  -- הנקודות שלי — בלי מסנן הרישום. מי שעוד לא בטבלה עדיין רואה כמה צבר.
  mine as (
    select coalesce(sum(l.points), 0)::int as pts
      from public.game_points_ledger l
     where l.user_id = v_me
       and l.scope = p_scope
       and (p_league is null or l.league_key = p_league)
       and case p_period
             when 'month'  then l.period_month  = v_key
             when 'season' then l.period_season = v_key
             when 'round'  then (l.ref_round = v_key::uuid or l.ref_challenge = v_key::uuid)
             else false
           end
  )
  select coalesce((select rnk from me), 0),
         coalesce((select pts from me), (select pts from mine), 0),
         (select count(*)::int from ranked),
         public.game_is_listed(v_me),
         coalesce((select r.pts from ranked r where r.rnk < (select rnk from me)
                    order by r.rnk desc limit 1) - (select pts from me), 0),
         (select public.game_display_name(r.user_id) from ranked r
           where r.rnk < (select rnk from me) order by r.rnk desc limit 1);
end;
$$;

revoke all on function public.game_my_standing(text,text,text,text) from public, anon;
grant execute on function public.game_my_standing(text,text,text,text) to authenticated;


do $mig$
begin
  begin
    perform public.mark_migration('supabase_game_standing_16_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) הפונקציה קיימת ומוגנת (חייב לחזור ריק):
--       select proname from pg_proc p
--         join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname = 'public' and p.proname = 'game_my_standing'
--          and p.proconfig is null;
--
--  2) הספירה זהה לטבלה. הרץ את שתי השורות — המספר חייב להיות זהה:
--       select count(*) as in_board from public.game_board('challenge','month',null,null,100,0);
--       -- ואז, מחשבון שחקן באפליקציה, כרטיס «המקום שלי» חייב לומר
--       -- «מתוך <אותו מספר>». מהדשבורד אפשר לראות את אותו מספר כך:
--       select count(*) as listed_players from (
--         select l.user_id from public.game_points_ledger l
--          where l.scope='challenge'
--            and l.period_month = (select month from public.game_period_keys())
--            and public.game_is_listed(l.user_id)
--          group by l.user_id) s;
--
--  3) מי שאינו רשום לטבלה עדיין רואה את הנקודות שלו. בחר שחקן שאינו
--     listed (למשל קטין שממתין לאישור הורה) ובדוק שיש לו נקודות בפנקס:
--       select l.user_id, sum(l.points) from public.game_points_ledger l
--        where not public.game_is_listed(l.user_id)
--          and l.period_month = (select month from public.game_period_keys())
--        group by 1;
--     במסך שלו: הניקוד יופיע, המקום יהיה «—», וההסבר «עוד לא בטבלה».
--
--  ⚠ שים לב: אצל שחקן שאינו רשום לטבלה המספר בכרטיס עשוי לרדת אחרי
--     ההרצה — כי עד עכשיו הוא דורג מול אוכלוסייה גדולה יותר. זה התיקון,
--     לא תקלה.
-- =====================================================================
