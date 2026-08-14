-- =====================================================================
-- CourtSide — חידון שנבנה לבד, לפי רמת קושי  ·  13.8.2026
--
-- מה משתנה: השחקן לא מחכה שהאדמין יכין חידון. הוא בוחר «קל / בינוני /
-- קשה» ומשחק מיד — המערכת מגרילה שאלות מהמאגר ובונה חידון אישי.
--
-- ⚠ ההכרעה שמחזיקה את זה: **תקרת ניקוד יומית.** בלי שער אדמין, שחקן
--   יכול לשחק אינסוף חידונים ביום — וזה בסדר גמור מבחינת כיף, אבל אסור
--   שכל אחד מהם יזכה בנקודות: הסקירה האדוורסרית כבר תפסה בדיוק את חור
--   חוות-הנקודות הזה בדו-קרבות. לכן:
--     · משחקים כמה שרוצים — הכיף לא מוגבל;
--     · **הנקודות נספרות רק על שלושת החידונים הראשונים ביום** (ניתן לכיול);
--     · מעבר לזה החידון עובד, מציג ניקוד, ופשוט לא נכנס לפנקס.
--   כך גם הטבלה החודשית נשארת תחרות אמיתית ולא מבחן סבלנות.
--
-- אידמפוטנטי.
-- דורש: supabase_game_quiz_12_8.sql
-- =====================================================================


do $dep$
begin
  if to_regclass('public.game_quizzes') is null then
    raise notice '';
    raise notice '  ✋ עצור: game_quizzes לא קיימת — הרץ supabase_game_quiz_12_8.sql.';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- 1) סוג חידון חדש: solo
-- ---------------------------------------------------------------------
do $ck$
declare r record;
begin
  if to_regclass('public.game_quizzes') is null then return; end if;
  for r in
    select conname from pg_constraint
     where conrelid = 'public.game_quizzes'::regclass
       and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.game_quizzes drop constraint %I', r.conname);
  end loop;
  alter table public.game_quizzes add constraint game_quizzes_kind_check
    check (kind in ('weekly', 'duel', 'solo'));
end $ck$;

alter table public.game_settings
  add column if not exists solo_scored_per_day int not null default 3;

insert into public.game_scoring_rules (key, points, min_entries, what, note) values
  ('quiz_solo', 10, 0, 'תשובה נכונה בחידון אישי', 'נספר רק בחידונים הראשונים של היום')
on conflict (key) do nothing;


-- ---------------------------------------------------------------------
-- 2) חידון סולו של אחר לא ייראה ולא ינוגן
--
--    game_quiz_read הקיימת חושפת כל חידון open לכל מחובר. עם חידוני
--    סולו זה היה הופך לרשימה של כל חידון שכל ילד יצר אי פעם.
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
           where d.quiz_id = id
             and (d.challenger_id = (select auth.uid()) or d.opponent_id = (select auth.uid()))))
  );


-- ---------------------------------------------------------------------
-- 2ב) כמה חידוני סולו כבר נספרו היום, וכמה נשארו
--
--     מקום אחד לחישוב — נקרא גם מהבנייה, גם מהסיום, וגם מהמסך. שתי
--     ספירות באותה לוגיקה בשני מקומות זה בדיוק איך שהן מתפצלות.
-- ---------------------------------------------------------------------
create or replace function public.game_solo_used_today(p_user uuid default null)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.game_points_ledger l
   where l.user_id = coalesce(p_user, auth.uid())
     and l.scope = 'quiz' and l.rule_key = 'quiz_solo'
     and l.occurred_on = (select k.d from public.game_period_keys() k);
$$;

create or replace function public.game_solo_left()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((select g.solo_scored_per_day from public.game_settings g where g.id), 3)
      - coalesce(public.game_solo_used_today(auth.uid()), 0), 0);
$$;

revoke all on function public.game_solo_used_today(uuid) from public, anon;
revoke all on function public.game_solo_left()           from public, anon;
grant execute on function public.game_solo_used_today(uuid) to authenticated;
grant execute on function public.game_solo_left()           to authenticated;


-- ---------------------------------------------------------------------
-- 3) game_quiz_solo — בונה ומתחיל בפעולה אחת
--
--    פעולה אחת ולא שתיים (בנה→התחל) כדי שהמסך לא יוכל להיתקע באמצע עם
--    חידון שנוצר ואיש לא משחק בו.
-- ---------------------------------------------------------------------
create or replace function public.game_quiz_solo(
  p_difficulty text default null,
  p_count      int  default 8,
  p_seconds    int  default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ids uuid[]; v_quiz uuid; v_att uuid; v_n int; v_cap int; v_used int; v_title text;
begin
  if not public.game_can_play() then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed',
      'message', 'צריך פרופיל מלא (שם ותאריך לידה), ולקטינים — אישור הורה.');
  end if;

  if p_difficulty is not null and p_difficulty not in ('easy', 'medium', 'hard') then
    return jsonb_build_object('ok', false, 'reason', 'bad_difficulty');
  end if;

  -- ⚠ בלי order by random() על כל המאגר: tablesample לא מתאים כאן (מאגר
  --   קטן), אבל 320 שורות זה זניח ו-random() פשוט וברור.
  select array_agg(id) into v_ids from (
    select q.id from public.game_questions q
     where q.active
       and (p_difficulty is null or q.difficulty = p_difficulty)
     order by random()
     limit greatest(least(coalesce(p_count, 8), 15), 3)
  ) s;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 3 then
    return jsonb_build_object('ok', false, 'reason', 'no_questions',
      'message', 'אין מספיק שאלות ברמה הזו במאגר.');
  end if;

  v_title := case p_difficulty
    when 'easy'   then 'חידון קל'
    when 'medium' then 'חידון בינוני'
    when 'hard'   then 'חידון קשה'
    else 'חידון מעורב' end;

  insert into public.game_quizzes (title, kind, question_ids, seconds_per_q, status, created_by)
  values (v_title, 'solo', v_ids,
          greatest(least(coalesce(p_seconds, 20), 120), 5), 'open', auth.uid())
  returning id into v_quiz;

  insert into public.game_quiz_attempts (quiz_id, user_id)
  values (v_quiz, auth.uid())
  returning id into v_att;

  -- כמה נשארו היום לניקוד — המסך אומר את זה מראש, בלי הפתעות בסוף.
  -- ⚠ ה-coalesce עוטף את תת-השאילתה ולא את העמודה: אם השורה היחידה
  --   ב-game_settings תיעלם, `select coalesce(col,3) ... where` מחזיר
  --   NULL ולא 3. זה הדפוס שכבר נהוג בקובץ הליבה.
  v_cap  := coalesce((select g.solo_scored_per_day from public.game_settings g where g.id), 3);
  v_used := coalesce(public.game_solo_used_today(auth.uid()), 0);

  return jsonb_build_object('ok', true,
    'quiz_id', v_quiz, 'attempt_id', v_att,
    'total', v_n, 'seconds_per_q', greatest(least(coalesce(p_seconds, 20), 120), 5),
    'title', v_title,
    'scored', v_used < v_cap,
    'scored_left', greatest(v_cap - v_used, 0));
end;
$$;

revoke all on function public.game_quiz_solo(text, int, int) from public, anon;
grant execute on function public.game_quiz_solo(text, int, int) to authenticated;


-- ---------------------------------------------------------------------
-- 4) game_quiz_finish — מזכה גם חידון סולו, עד התקרה היומית
-- ---------------------------------------------------------------------
create or replace function public.game_quiz_finish(p_attempt uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record; z record; v_n int; v_perfect boolean; v_bonus int; v_min int;
  v_month text; v_season text; v_day date;
  v_cap int; v_used int; v_scored boolean := false;
begin
  select * into a from public.game_quiz_attempts where id = p_attempt for update;
  if not found or (a.user_id <> auth.uid() and not public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if a.finished_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'score', a.score);
  end if;

  select * into z from public.game_quizzes where id = a.quiz_id;
  v_n := coalesce(array_length(z.question_ids, 1), 0);

  select coalesce(min_entries, 3) into v_min from public.game_scoring_rules where key = 'quiz_perfect';
  v_perfect := (v_n >= coalesce(v_min, 3) and a.correct_count = v_n);
  v_bonus   := case when v_perfect then public.game_points('quiz_perfect', 20) else 0 end;

  update public.game_quiz_attempts
     set finished_at = now(), score = score + v_bonus,
         current_qid = null, current_served_at = null
   where id = p_attempt;

  select k.d, k.month, k.season into v_day, v_month, v_season
    from public.game_period_keys(now()) k;

  -- מי מזוכה בפנקס:
  --   weekly — תמיד (האדמין פתח, יש אחד בשבוע).
  --   solo   — עד התקרה היומית.
  --   duel   — לעולם לא כאן; רק דרך ההכרעה מול יריב אמיתי.
  if z.kind = 'weekly' then
    v_scored := true;
    delete from public.game_points_ledger
     where scope = 'quiz' and user_id = a.user_id and source_key = 'quiz:' || a.quiz_id::text;
    insert into public.game_points_ledger
      (user_id, scope, source_key, rule_key, points, reason,
       occurred_at, occurred_on, period_month, period_season)
    values (a.user_id, 'quiz', 'quiz:' || a.quiz_id::text, 'quiz_correct',
            a.score + v_bonus,
            'חידון: ' || z.title || ' — ' || a.correct_count || '/' || v_n,
            now(), v_day, v_month, v_season);

  elsif z.kind = 'solo' then
    -- ⚠⚠ **הנעילה הזו היא כל התקרה.** בלעדיה: השחקן פותח עשר לשוניות,
    --   מגיע בכולן לשאלה האחרונה, ויורה עשר קריאות finish במקביל.
    --   ה-`for update` למעלה נועל את שורת ה-attempt — ולכל קריאה יש
    --   attempt אחר, כלומר אפס סריאליזציה. תחת READ COMMITTED כולן
    --   סופרות 0, כולן עוברות את הבדיקה, וכולן כותבות. גם ה-unique
    --   על (user_id, scope, source_key) לא מציל: כל חידון סולו הוא
    --   UUID חדש, ולכן ה-on conflict בנתיב הזה הוא קוד מת.
    --   התקדים בפרויקט: game_score_challenge נועלת בדיוק כך.
    --   המפתח צר (משתמש+יום) ולכן אינו חוסם שחקנים אחרים.
    perform pg_advisory_xact_lock(
      hashtext('game_solo_day:' || a.user_id::text || ':' || v_day::text));

    v_cap  := coalesce((select g.solo_scored_per_day from public.game_settings g where g.id), 3);
    v_used := coalesce(public.game_solo_used_today(a.user_id), 0);

    if v_used < v_cap then
      v_scored := true;
      insert into public.game_points_ledger
        (user_id, scope, source_key, rule_key, points, reason,
         occurred_at, occurred_on, period_month, period_season)
      values (a.user_id, 'quiz', 'quiz:' || a.quiz_id::text, 'quiz_solo',
              a.score + v_bonus,
              z.title || ' — ' || a.correct_count || '/' || v_n,
              now(), v_day, v_month, v_season)
      on conflict (user_id, scope, source_key) do nothing;   -- רשת ביטחון בלבד
      v_used := v_used + 1;
    end if;
  end if;

  if a.duel_id is not null then
    perform public.game_duel_settle(a.duel_id);
  end if;

  -- ⚑ המספר המעודכן חוזר **אחרי** הכתיבה, כדי שהמסך לא יפגר בחידון
  --   אחד ויבטיח «עוד 1 נספר» כשבפועל נשארו 0.
  return jsonb_build_object('ok', true, 'score', a.score + v_bonus,
    'correct', a.correct_count, 'total', v_n, 'perfect', v_perfect,
    'scored', v_scored, 'kind', z.kind,
    'scored_left', case when z.kind = 'solo'
                        then greatest(coalesce(v_cap, 3) - coalesce(v_used, 0), 0)
                        else null end);
end;
$$;

revoke all on function public.game_quiz_finish(uuid) from public, anon;
grant execute on function public.game_quiz_finish(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 5) ניקוי — חידוני סולו נטושים
--     כל בחירת קושי יוצרת שורה. מי שלחץ ולא שיחק משאיר שורה ריקה.
-- ---------------------------------------------------------------------
create or replace function public.game_purge_abandoned_quizzes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth.uid() is not null and not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;
  with dead as (
    delete from public.game_quizzes z
     where z.kind = 'solo' and z.created_at < now() - interval '7 days'
       and not exists (select 1 from public.game_quiz_attempts a
                        where a.quiz_id = z.id and a.finished_at is not null)
    returning 1)
  select count(*) into v_n from dead;
  return jsonb_build_object('ok', true, 'deleted', v_n);
end;
$$;

revoke all on function public.game_purge_abandoned_quizzes() from public, anon;
grant execute on function public.game_purge_abandoned_quizzes() to authenticated;


do $mig$
begin
  begin
    perform public.mark_migration('supabase_game_quiz_solo_13_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) מהאפליקציה, מחשבון שחקן: בחר «קל» ושחק. אמור לעבוד מיד, בלי אדמין.
--
--  2) התקרה היומית עובדת: שחק ארבעה חידוני סולו באותו יום. בשלושה
--     הראשונים תראה «נספר לטבלה», ברביעי «לא נספר היום». ואז:
--       select rule_key, count(*) from public.game_points_ledger
--        where scope='quiz' group by 1;
--     חייב להראות לכל היותר 3 שורות quiz_solo ליום לכל שחקן.
--
--  3) חידון סולו של אחר אינו נגיש — מחשבון שחקן שני:
--       select count(*) from public.game_quizzes where kind='solo';
--     חייב להחזיר רק את אלה שהוא עצמו יצר.
--
--  4) לשנות את התקרה (למשל ל-5):
--       update public.game_settings set solo_scored_per_day = 5;
-- =====================================================================
