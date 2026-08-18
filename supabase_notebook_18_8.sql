-- =====================================================================
-- CourtSide — «המחברת המלאה»: תוכנית אימון כדף אחד  ·  18.8.2026
--
-- מה משתנה, בשפה של מסך:
--   «בניית תוכנית» כבר לא נבנית מחלקים ממוספרים ומתרגילים־בכרטיסים, אלא
--   נכתבת כדף מחברת שלם: טקסט חופשי על שורות, שכבת דיו (כתב יד/עט),
--   מגרשים קטנים בצד עם ציור חופשי, ונוכחות שמסומנת בתחתית הדף.
--
--   1. training_plans מקבלת את גוף הדף:
--        body             — הטקסט של המחברת (טקסט חופשי, שורה־שורה)
--        ink              — שכבת הדיו מעל השורות (jsonb: רשימת קווים)
--        courts           — המגרשים הקטנים (jsonb: [{id, board}] — board באותו
--                           מבנה של drills.board, כולל ink לכל שלב)
--        team             — הקבוצה שהאימון נכתב לה (מחרוזת כמו team_players.team)
--        session_date     — תאריך האימון (ברירת מחדל היום; ניתן לשינוי)
--        duration_minutes — משך האימון (שדה ידני — אין יותר חלקים לחשב מהם)
--        is_draft         — «שמור כטיוטה»: מופיע ברשימה עם תג, לא נחשב מוכן
--        updated_at       — עדכון אחרון (הרשימה מציגה «עודכן»)
--   2. practice_attendance.reason — סיבת היעדרות/איחור («פציעה», «מחלה»…)
--      שמסומנת מתוך המחברת ונשמרת גם בנוכחות העונתית של הקבוצה.
--   3. player_assignments.plan_view — כשמאמן שולח תוכנית לשחקנים הוא בוחר
--      מה הם יראו: 'drills' (רשימת התרגילים בלבד) או 'page' (הדף כולו).
--   4. plan_for_player(uuid) — RPC לשחקן: מחזירה את התוכנית ששוגרה אליו
--      לפי הבחירה של המאמן. עד היום שחקן ראה רק את *שם* התוכנית.
--      נעשה כפונקציה (security definer) ולא כמדיניות RLS על training_plans,
--      כדי שהגוף (body/ink/courts) לא ייחשף כשנבחר «רשימת תרגילים בלבד».
--   5. plan_items.title / description / part — קיימים בייצור אך חסרים
--      בחלק מהמיגרציות; מובטחים כאן כדי שה-RPC לא תיפול.
--
-- הפרונט שורד מסד שטרם הריץ את הקובץ: השמירה נופלת חזרה לעמודות הישנות
-- (שם בלבד) ומודיעה למאמן שהמחברת המלאה תישמר אחרי המיגרציה.
--
-- אידמפוטנטי. דורש: supabase_training_plans.sql, supabase_attendance.sql,
-- supabase_players.sql (is_team_member, player_assignments).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) גוף הדף על training_plans
-- ---------------------------------------------------------------------
alter table public.training_plans
  add column if not exists body             text,
  add column if not exists ink              jsonb,
  add column if not exists courts           jsonb,
  add column if not exists team             text,
  add column if not exists session_date     date,
  add column if not exists duration_minutes integer,
  add column if not exists is_draft         boolean not null default false,
  add column if not exists updated_at       timestamptz;

create index if not exists training_plans_owner_updated_idx
  on public.training_plans (created_by, updated_at desc);


-- ---------------------------------------------------------------------
-- 2) plan_items — עמודות שהקוד מניח (title/description מ«שורה חופשית»,
--    part מ-supabase_plan_parts.sql). drill_id הופך לאופציונלי כי פריט
--    חופשי (שורה שנכתבה ביד) לא מפנה לתרגיל בספרייה.
-- ---------------------------------------------------------------------
alter table public.plan_items
  add column if not exists title       text,
  add column if not exists description text,
  add column if not exists part        int not null default 1;

do $$
begin
  alter table public.plan_items alter column drill_id drop not null;
exception when others then null;
end $$;


-- ---------------------------------------------------------------------
-- 3) סיבת היעדרות/איחור על הנוכחות
-- ---------------------------------------------------------------------
alter table public.practice_attendance
  add column if not exists reason text;


-- ---------------------------------------------------------------------
-- 4) מה השחקן רואה כשמשגרים לו תוכנית
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.player_assignments') is not null then
    alter table public.player_assignments
      add column if not exists plan_view text
        check (plan_view is null or plan_view in ('drills', 'page'));
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 5) plan_for_player — התוכנית כפי ששוגרה לשחקן המחובר
--    מחזירה null אם לא שוגרה אליו (אישית או לקבוצה שהוא חבר מאושר בה).
--    'page' גובר על 'drills' אם יש כמה שיגורים לאותה תוכנית.
-- ---------------------------------------------------------------------
create or replace function public.plan_for_player(p_plan uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_n     int;
  v_page  boolean;
  v_plan  public.training_plans%rowtype;
  v_items jsonb;
  v_coach jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  select * into v_plan from public.training_plans where id = p_plan;
  if not found then
    return null;
  end if;

  -- השיגור חייב להגיע **מבעל התוכנית** (או שהתוכנית משותפת לקהילה).
  -- בלי התנאי הזה מאמן אחר יכול היה לרשום שיגור עם plan_id של תוכנית
  -- פרטית שאינה שלו, ולחשוף לשחקנים שלו את הדף של מאמן אחר —
  -- הפונקציה היא security definer ולכן היא עוקפת את plans_all_own.
  select count(*), coalesce(bool_or(coalesce(a.plan_view, 'drills') = 'page'), false)
    into v_n, v_page
  from public.player_assignments a
  where a.plan_id = p_plan
    and (a.coach_id = v_plan.created_by or coalesce(v_plan.is_public, false))
    and (
      a.player_id = auth.uid()
      or (a.player_id is null and a.team is not null
          and public.is_team_member(a.coach_id, a.team))
    );

  if coalesce(v_n, 0) = 0 then
    return null;
  end if;

  select jsonb_build_object(
           'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
           'club', p.club)
    into v_coach
  from public.profiles p
  where p.id = v_plan.created_by;

  -- התרגילים המקושרים (מהספרייה) + שורות חופשיות ישנות — בסדר החלק/המיקום.
  -- מוחזרים רק השם והתוכן — בלי ציוד/שחקנים/הערות מאמן (הבעלים ביקש
  -- «השם והתוכן בלי כל השאר»).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',               pi.id,
           'title',            coalesce(d.title, pi.title),
           'description',      coalesce(d.description, pi.description),
           'duration_minutes', pi.duration_minutes,
           'category',         d.category,
           'board',            d.board
         ) order by coalesce(pi.part, 1), pi.position), '[]'::jsonb)
    into v_items
  from public.plan_items pi
  left join public.drills d on d.id = pi.drill_id
  where pi.plan_id = p_plan;

  return jsonb_build_object(
    'id',               v_plan.id,
    'name',             v_plan.name,
    'view',             case when v_page then 'page' else 'drills' end,
    'team',             v_plan.team,
    'session_date',     v_plan.session_date,
    'duration_minutes', v_plan.duration_minutes,
    'coach',            v_coach,
    'items',            v_items,
    -- גוף הדף רק כשהמאמן בחר «הדף כולו»
    'body',             case when v_page then v_plan.body   else null end,
    'ink',              case when v_page then v_plan.ink    else null end,
    'courts',           case when v_page then v_plan.courts else null end
  );
end;
$$;

revoke all on function public.plan_for_player(uuid) from public;
grant execute on function public.plan_for_player(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 6) רישום בלדג'ר המיגרציות (אם קיים) + רענון סכימת ה-API
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.mark_migration('supabase_notebook_18_8.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
--  אימות מהיר אחרי ההרצה:
--    select column_name from information_schema.columns
--     where table_name = 'training_plans' and column_name in ('body','ink','courts','is_draft');
--    select public.plan_for_player('00000000-0000-0000-0000-000000000000');  -- null
-- =====================================================================
