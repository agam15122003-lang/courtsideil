-- =====================================================================
-- CourtSide — הקשחת החידונים: סגירת ארבעה חורים  ·  13.8.2026 (ערב)
--
-- הסקירה האדוורסרית השנייה אימתה ארבעה ליקויים בעולם החידונים. שלושה
-- מהם מאפשרים לצבור נקודות בלי לדעת כדורסל — כלומר להפוך את הטבלה
-- למבחן סבלנות. אחד הוא באג שנכתב אתמול ושובר את הדו-קרבות בשקט.
--
--   1) **חוות נקודות בדו-קרב.** שני חשבונות (אח ואחות, שני ילדים
--      בקבוצה) מריצים בלולאה: יוצר → מצטרף → שניהם מסיימים **בלי לענות
--      על שאלה אחת**. שני הניסיונות עם score=0 ו-total_ms=0, ולכן
--      ההכרעה היא «תיקו» ושניהם מקבלים 10 נקודות. אין תקרה יומית על
--      דו-קרבות, ומגבלת «5 הזמנות פתוחות» סופרת רק pending — ברגע
--      שהשותף מצטרף הסטטוס הופך ל-active והמונה מתאפס.
--      גרוע יותר מהתיקו: צד אחד עונה נכון על שאלה אחת = 25 נקודות.
--
--   2) **מספר השאלות ומשך הטיימר היו בשליטת הלקוח.** game_quiz_solo
--      קיבלה p_count ו-p_seconds מהדפדפן. שחקן שקורא ל-RPC ישירות
--      מבקש 15 שאלות ו-120 שניות — ומרוויח פי 1.75 נקודות מכל אחד
--      משלושת החידונים הנספרים. פרמטר שמשפיע על ניקוד לא יכול להגיע
--      מהצד שמרוויח ממנו.
--
--   3) **game_quiz_start פתח כל חידון סולו של כל שחקן.** הבדיקה שנוספה
--      אתמול כיסתה רק kind='duel'. סולו של אחר נשאר פתוח לניגון.
--
--   4) **באג שנכתב אתמול:** במדיניות game_quiz_read, תת-השאילתה כתבה
--      `where d.quiz_id = id` — ו-`id` הלא-מוסמך נקשר ל-game_duels.id
--      ולא ל-game_quizzes.id. כלומר `d.quiz_id = d.id`, שלעולם אינו
--      נכון. התוצאה: **חידון של דו-קרב לא היה נראה לאף אחד**, והזרוע
--      הזו במדיניות הייתה קוד מת.
--
-- אידמפוטנטי.
-- דורש: supabase_game_quiz_solo_13_8.sql
-- =====================================================================


do $dep$
begin
  if to_regprocedure('public.game_solo_used_today(uuid)') is null then
    raise notice '';
    raise notice '  ✋ עצור: הרץ קודם את supabase_game_quiz_solo_13_8.sql.';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- 1) פרמטרי החידון עוברים לשרת
-- ---------------------------------------------------------------------
alter table public.game_settings add column if not exists solo_questions int not null default 8;
alter table public.game_settings add column if not exists solo_seconds   int not null default 20;
alter table public.game_settings add column if not exists duel_scored_per_day int not null default 5;

do $qc$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.game_settings'::regclass
                    and conname  = 'game_settings_solo_range') then
    alter table public.game_settings add constraint game_settings_solo_range
      check (solo_questions between 3 and 15 and solo_seconds between 5 and 120);
  end if;
end $qc$;


-- ---------------------------------------------------------------------
-- 2) game_quiz_read — תיקון הקישור השבור
-- ---------------------------------------------------------------------
drop policy if exists "game_quiz_read" on public.game_quizzes;
create policy "game_quiz_read" on public.game_quizzes
  for select to authenticated
  using (
    (select public.is_admin())
    or (kind = 'weekly' and status in ('open', 'closed'))
    or created_by = (select auth.uid())
    or (kind = 'duel' and exists (
          select 1 from public.game_duels d
           -- ⚠ מוסמך במפורש: `id` לבדו נקשר ל-game_duels.id ולא לחידון.
           where d.quiz_id = public.game_quizzes.id
             and (d.challenger_id = (select auth.uid()) or d.opponent_id = (select auth.uid()))))
  );


-- ---------------------------------------------------------------------
-- 3) game_quiz_solo — הפרמטרים מההגדרות בלבד
-- ---------------------------------------------------------------------
create or replace function public.game_quiz_solo(
  p_difficulty text default null,
  p_count      int  default null,   -- ⚑ מתעלמים ממנו; נשאר לתאימות חתימה
  p_seconds    int  default null    -- ⚑ מתעלמים ממנו
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ids uuid[]; v_quiz uuid; v_att uuid; v_n int; v_cap int; v_used int;
        v_title text; v_q int; v_sec int;
begin
  if not public.game_can_play() then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed',
      'message', 'צריך פרופיל מלא (שם ותאריך לידה), ולקטינים — אישור הורה.');
  end if;

  if p_difficulty is not null and p_difficulty not in ('easy', 'medium', 'hard') then
    return jsonb_build_object('ok', false, 'reason', 'bad_difficulty');
  end if;

  -- ⚠ **לא מהלקוח.** פרמטר שמשפיע על ניקוד לא מגיע מהצד שמרוויח ממנו.
  select coalesce(g.solo_questions, 8), coalesce(g.solo_seconds, 20)
    into v_q, v_sec
    from public.game_settings g where g.id;
  v_q   := greatest(least(coalesce(v_q, 8), 15), 3);
  v_sec := greatest(least(coalesce(v_sec, 20), 120), 5);

  select array_agg(id) into v_ids from (
    select q.id from public.game_questions q
     where q.active and (p_difficulty is null or q.difficulty = p_difficulty)
     order by random() limit v_q
  ) s;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 3 then
    return jsonb_build_object('ok', false, 'reason', 'no_questions',
      'message', 'אין מספיק שאלות ברמה הזו במאגר.');
  end if;

  v_title := case p_difficulty
    when 'easy' then 'חידון קל' when 'medium' then 'חידון בינוני'
    when 'hard' then 'חידון קשה' else 'חידון מעורב' end;

  insert into public.game_quizzes (title, kind, question_ids, seconds_per_q, status, created_by)
  values (v_title, 'solo', v_ids, v_sec, 'open', auth.uid())
  returning id into v_quiz;

  insert into public.game_quiz_attempts (quiz_id, user_id)
  values (v_quiz, auth.uid())
  returning id into v_att;

  v_cap  := coalesce((select g.solo_scored_per_day from public.game_settings g where g.id), 3);
  v_used := coalesce(public.game_solo_used_today(auth.uid()), 0);

  return jsonb_build_object('ok', true,
    'quiz_id', v_quiz, 'attempt_id', v_att, 'total', v_n,
    'seconds_per_q', v_sec, 'title', v_title,
    'scored', v_used < v_cap, 'scored_left', greatest(v_cap - v_used, 0));
end;
$$;

revoke all on function public.game_quiz_solo(text, int, int) from public, anon;
grant execute on function public.game_quiz_solo(text, int, int) to authenticated;


-- ---------------------------------------------------------------------
-- 4) game_quiz_start — חידון סולו שמור לבעליו
-- ---------------------------------------------------------------------
create or replace function public.game_quiz_start(p_quiz uuid, p_duel uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare q record; a record; v_id uuid;
begin
  if not public.game_can_play() then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed',
      'message', 'צריך להשלים את הפרופיל ואישור הורה כדי להשתתף.');
  end if;

  select * into q from public.game_quizzes where id = p_quiz;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if q.kind = 'weekly' and q.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  -- חידון סולו שייך למי שיצר אותו, ותו לא.
  if q.kind = 'solo' and q.created_by is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  if q.kind = 'duel' and not exists (
    select 1 from public.game_duels dd
     where dd.quiz_id = q.id
       and (dd.challenger_id = auth.uid() or dd.opponent_id = auth.uid())) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_duel');
  end if;

  select * into a from public.game_quiz_attempts
   where quiz_id = p_quiz and user_id = auth.uid();

  if found then
    if a.finished_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'already_done',
        'message', 'כבר שיחקת את החידון הזה.', 'score', a.score);
    end if;
    return jsonb_build_object('ok', true, 'attempt_id', a.id, 'resumed', true,
      'total', array_length(q.question_ids, 1), 'seconds_per_q', q.seconds_per_q);
  end if;

  insert into public.game_quiz_attempts (quiz_id, user_id, duel_id)
  values (p_quiz, auth.uid(), p_duel)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'attempt_id', v_id, 'resumed', false,
    'total', array_length(q.question_ids, 1), 'seconds_per_q', q.seconds_per_q);
end;
$$;

revoke all on function public.game_quiz_start(uuid, uuid) from public, anon;
grant execute on function public.game_quiz_start(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 5) game_duel_settle — שער השתתפות + תקרה יומית
-- ---------------------------------------------------------------------
create or replace function public.game_duel_settle(p_duel uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d record; a1 record; a2 record; v_winner uuid; v_draw boolean := false;
  v_month text; v_season text; v_day date; v_pts int;
  v_n1 int; v_n2 int; v_cap int; v_used int; v_uid uuid;
begin
  select * into d from public.game_duels where id = p_duel for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if d.status = 'done' then return jsonb_build_object('ok', true, 'already', true); end if;
  if d.opponent_id is null then return jsonb_build_object('ok', true, 'waiting', 'opponent'); end if;

  select * into a1 from public.game_quiz_attempts
   where quiz_id = d.quiz_id and user_id = d.challenger_id;
  select * into a2 from public.game_quiz_attempts
   where quiz_id = d.quiz_id and user_id = d.opponent_id;

  if a1 is null or a2 is null or a1.finished_at is null or a2.finished_at is null then
    return jsonb_build_object('ok', true, 'waiting', 'both_to_finish');
  end if;

  -- ⚠ **שער ההשתתפות.** שני הצדדים חייבים לענות בפועל. בלי זה: שני
  --   חשבונות פותחים דו-קרב, שניהם מסיימים בלי לגעת בשאלה, שניהם
  --   ב-0 נקודות ו-0ms — «תיקו» — ועשר נקודות לכל אחד, בלולאה.
  select count(*) into v_n1 from public.game_quiz_answers where attempt_id = a1.id;
  select count(*) into v_n2 from public.game_quiz_answers where attempt_id = a2.id;

  if coalesce(v_n1, 0) = 0 or coalesce(v_n2, 0) = 0 then
    update public.game_duels
       set status = 'done', decided_at = now(), is_draw = true
     where id = p_duel;
    return jsonb_build_object('ok', true, 'no_credit', true, 'reason', 'no_answers');
  end if;

  if a1.score > a2.score then v_winner := d.challenger_id;
  elsif a2.score > a1.score then v_winner := d.opponent_id;
  elsif a1.total_ms < a2.total_ms then v_winner := d.challenger_id;
  elsif a2.total_ms < a1.total_ms then v_winner := d.opponent_id;
  else v_draw := true;
  end if;

  update public.game_duels
     set status = 'done', winner_id = v_winner, is_draw = v_draw, decided_at = now()
   where id = p_duel;

  select k.d, k.month, k.season into v_day, v_month, v_season from public.game_period_keys(now()) k;

  delete from public.game_points_ledger
   where scope = 'quiz' and source_key = 'duel:' || p_duel::text;

  v_cap := coalesce((select g.duel_scored_per_day from public.game_settings g where g.id), 5);

  -- תיקו: שני הצדדים, כל אחד תחת התקרה שלו.
  if v_draw then
    v_pts := public.game_points('duel_draw', 10);
    -- ⚠ v_uid ולא a1: a1 היא רשומת הניסיון, ולולאה עליה הייתה דורסת אותה.
    foreach v_uid in array array[d.challenger_id, d.opponent_id] loop
      perform pg_advisory_xact_lock(
        hashtext('game_duel_day:' || v_uid::text || ':' || v_day::text));
      select count(*) into v_used from public.game_points_ledger l
       where l.user_id = v_uid and l.scope = 'quiz'
         and l.rule_key in ('duel_win', 'duel_draw') and l.occurred_on = v_day;
      if coalesce(v_used, 0) < v_cap then
        insert into public.game_points_ledger
          (user_id, scope, source_key, rule_key, points, reason,
           occurred_at, occurred_on, period_month, period_season)
        values (v_uid, 'quiz', 'duel:' || p_duel::text, 'duel_draw', v_pts,
                'תיקו בדו-קרב', now(), v_day, v_month, v_season)
        on conflict (user_id, scope, source_key) do nothing;
      end if;
    end loop;
  else
    perform pg_advisory_xact_lock(
      hashtext('game_duel_day:' || v_winner::text || ':' || v_day::text));
    select count(*) into v_used from public.game_points_ledger l
     where l.user_id = v_winner and l.scope = 'quiz'
       and l.rule_key in ('duel_win', 'duel_draw') and l.occurred_on = v_day;
    if coalesce(v_used, 0) < v_cap then
      v_pts := public.game_points('duel_win', 25);
      insert into public.game_points_ledger
        (user_id, scope, source_key, rule_key, points, reason,
         occurred_at, occurred_on, period_month, period_season)
      values (v_winner, 'quiz', 'duel:' || p_duel::text, 'duel_win', v_pts,
              'ניצחון בדו-קרב', now(), v_day, v_month, v_season)
      on conflict (user_id, scope, source_key) do nothing;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'winner', v_winner, 'draw', v_draw);
end;
$$;

revoke all on function public.game_duel_settle(uuid) from public, anon;
grant execute on function public.game_duel_settle(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 6) game_duel_create — המגבלה סופרת גם דו-קרבות פעילים
-- ---------------------------------------------------------------------
create or replace function public.game_duel_create(p_count int default null, p_seconds int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ids uuid[]; v_quiz uuid; v_duel uuid; v_code text; v_q int; v_sec int;
begin
  if not public.game_can_play() then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  -- ⚠ סופר pending **וגם** active: קודם נספר רק pending, וברגע שהשותף
  --   הצטרף הסטטוס הפך ל-active והמונה התאפס — כלומר אפס מגבלה בפועל.
  if (select count(*) from public.game_duels
       where challenger_id = auth.uid()
         and status in ('pending', 'active')
         and created_at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_open',
      'message', 'פתחת הרבה דו-קרבות היום. סיים את הקיימים או המתן.');
  end if;

  select coalesce(g.solo_questions, 8), coalesce(g.solo_seconds, 20) into v_q, v_sec
    from public.game_settings g where g.id;
  v_q   := greatest(least(coalesce(v_q, 8), 15), 3);
  v_sec := greatest(least(coalesce(v_sec, 20), 120), 5);

  select array_agg(id) into v_ids from (
    select q.id from public.game_questions q where q.active
     order by random() limit v_q
  ) s;
  if v_ids is null then return jsonb_build_object('ok', false, 'reason', 'no_questions'); end if;

  insert into public.game_quizzes (title, kind, question_ids, seconds_per_q, status, created_by)
  values ('דו-קרב', 'duel', v_ids, v_sec, 'open', auth.uid())
  returning id into v_quiz;

  for i in 1..5 loop
    v_code := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', 'GH'), 1, 6));
    begin
      insert into public.game_duels (quiz_id, challenger_id, invite_code)
      values (v_quiz, auth.uid(), v_code)
      returning id into v_duel;
      exit;
    exception when unique_violation then
      v_duel := null;
    end;
  end loop;

  if v_duel is null then
    return jsonb_build_object('ok', false, 'reason', 'code_collision');
  end if;

  return jsonb_build_object('ok', true, 'duel_id', v_duel, 'quiz_id', v_quiz, 'code', v_code);
end;
$$;

revoke all on function public.game_duel_create(int, int) from public, anon;
grant execute on function public.game_duel_create(int, int) to authenticated;


do $mig$
begin
  begin
    perform public.mark_migration('supabase_game_quiz_hardening_13_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) דו-קרב ריק אינו מזכה: פתח דו-קרב משני חשבונות, סיים בשניהם בלי
--     לענות, ואז:
--       select rule_key, count(*) from public.game_points_ledger
--        where scope='quiz' group by 1;
--     לא אמורה להופיע שורת duel_draw חדשה.
--
--  2) פרמטרים מהשרת: קרא ל-RPC עם ערכים חריגים —
--       select public.game_quiz_solo('easy', 15, 120);
--     ה-total חייב לחזור 8 וה-seconds_per_q 20 (או מה שב-game_settings).
--
--  3) חידון סולו של אחר: קח quiz_id של שחקן אחר וקרא
--       select public.game_quiz_start('<quiz_id>');
--     חייב לחזור reason='not_yours'.
--
--  4) לשנות את התקרות:
--       update public.game_settings
--          set solo_scored_per_day = 3, duel_scored_per_day = 5,
--              solo_questions = 8, solo_seconds = 20;
-- =====================================================================
