-- =====================================================================
-- CourtSide — עולם המשחק: חידונים ודו-קרבות  ·  12.8.2026
--
-- שני מצבי משחק על אותו מאגר שאלות:
--   · **חידון על זמן** — שאלות בזו אחר זו, טיימר לכל שאלה, בונוס מהירות.
--   · **דו-קרב** — שני שחקנים מקבלים בדיוק את אותן שאלות; מי שצבר יותר
--     מנצח, ושובר שוויון הוא הזמן הכולל. ההזמנה נשלחת כקישור בוואטסאפ.
--
-- ⚠ **ההכרעה החשובה ביותר בקובץ: השחקן לעולם אינו מקבל את התשובה הנכונה.**
--   מפתח ה-anon של Supabase יושב בתוך קוד האפליקציה שכל אחד יכול לפתוח.
--   אילו טבלת השאלות הייתה קריאה לשחקנים, כל ילד היה מושך את המאגר עם
--   התשובות בשאילתה אחת, והחידון היה מת ביום הראשון. לכן:
--     · ל-game_questions **אין** מדיניות SELECT לשחקן. אדמין בלבד.
--     · השאלות מוגשות דרך game_quiz_next() שמחזירה טקסט ואפשרויות בלבד.
--     · הבדיקה נעשית בשרת, ב-game_quiz_answer(), וההסבר מוחזר רק **אחרי**
--       שנרשמה תשובה.
--
-- ⚠ וההכרעה השנייה: **הזמן נמדד בשרת.** הלקוח מדווח כמה זמן לקח לו —
--   וזה נתון שאי אפשר לסמוך עליו. הזמן שנחשב לניקוד הוא ההפרש בין הרגע
--   שהשרת הגיש את השאלה לרגע שקיבל תשובה.
--
-- אידמפוטנטי.
-- דורש: supabase_game_core_12_8.sql (38) בלבד. אפשר להריץ בכל שלב אחריו.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) בדיקת תלות
-- ---------------------------------------------------------------------
do $dep$
begin
  if to_regclass('public.game_points_ledger') is null then
    raise notice '';
    raise notice '===================================================================';
    raise notice '  ✋ עצור: public.game_points_ledger לא קיימת.';
    raise notice '  הרץ קודם את supabase_game_core_12_8.sql (קובץ 38).';
    raise notice '===================================================================';
  end if;
end $dep$;


-- ---------------------------------------------------------------------
-- 1) הרחבת הפנקס ל-scope חדש: quiz
--
--     ⚠ הוספת ערך ל-CHECK מחייבת להפיל ולבנות מחדש. הרשימה כוללת את
--     כל הערכים הקיימים — אחרת שורות ותיקות יפרו את האילוץ החדש.
-- ---------------------------------------------------------------------
do $sc$
declare r record;
begin
  if to_regclass('public.game_points_ledger') is null then return; end if;

  for r in
    select conname from pg_constraint
     where conrelid = 'public.game_points_ledger'::regclass
       and contype = 'c' and pg_get_constraintdef(oid) ilike '%scope%'
  loop
    execute format('alter table public.game_points_ledger drop constraint %I', r.conname);
  end loop;
  alter table public.game_points_ledger add constraint game_points_ledger_scope_check
    check (scope in ('predictions', 'challenge', 'quiz'));

  for r in
    select conname from pg_constraint
     where conrelid = 'public.game_awards'::regclass
       and contype = 'c' and pg_get_constraintdef(oid) ilike '%scope%'
  loop
    execute format('alter table public.game_awards drop constraint %I', r.conname);
  end loop;
  alter table public.game_awards add constraint game_awards_scope_check
    check (scope is null or scope in ('predictions', 'challenge', 'quiz'));
end $sc$;

insert into public.game_scoring_rules (key, points, min_entries, what, note) values
  ('quiz_correct',    10, 0, 'תשובה נכונה בחידון',        null),
  ('quiz_speed',       5, 0, 'בונוס מהירות מלא',           'יורד ליניארית עם הזמן שנותר'),
  ('quiz_perfect',    20, 3, 'חידון מושלם',                'דורש לפחות 3 שאלות'),
  ('duel_win',        25, 0, 'ניצחון בדו-קרב',             null),
  ('duel_draw',       10, 0, 'תיקו בדו-קרב',               null)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------
-- 2) game_questions — המאגר
--
--     ⚠ אין כאן מדיניות SELECT לשחקן. זה לא שכחה.
-- ---------------------------------------------------------------------
create table if not exists public.game_questions (
  id         uuid primary key default gen_random_uuid(),
  category   text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  q          text not null,
  options    text[] not null check (array_length(options, 1) = 4),
  correct    int  not null check (correct between 0 and 3),
  explain    text,
  durable    boolean not null default true,
  source     text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (q)
);

create index if not exists game_q_pick_idx on public.game_questions (active, category, difficulty);

comment on table public.game_questions is
  '⚠ מאגר השאלות **כולל התשובות**. אין מדיניות SELECT ל-authenticated '
  'בכוונה: מפתח ה-anon חשוף בקוד הלקוח, וקריאה ישירה הייתה מוסרת את כל '
  'התשובות. השאלות מוגשות רק דרך game_quiz_next(), בלי העמודה correct.';

alter table public.game_questions enable row level security;

drop policy if exists "game_q_admin" on public.game_questions;
create policy "game_q_admin" on public.game_questions
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.game_questions from anon, authenticated;
grant select, insert, update, delete on public.game_questions to authenticated;  -- נשלט ב-RLS


-- ---------------------------------------------------------------------
-- 3) game_quizzes — מופע חידון
-- ---------------------------------------------------------------------
create table if not exists public.game_quizzes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  kind          text not null default 'weekly' check (kind in ('weekly', 'duel')),
  question_ids  uuid[] not null default '{}',
  seconds_per_q int  not null default 20 check (seconds_per_q between 5 and 120),
  status        text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opens_at      timestamptz,
  closes_at     timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists game_quiz_status_idx on public.game_quizzes (status, opens_at);

alter table public.game_quizzes enable row level security;

drop policy if exists "game_quiz_read"  on public.game_quizzes;
drop policy if exists "game_quiz_admin" on public.game_quizzes;

-- ⚠ question_ids גלוי, אבל הוא רק רשימת מזהים — בלי גישה ל-game_questions
--   הוא חסר ערך. התשובות אינן ניתנות לשליפה בשום מסלול.
create policy "game_quiz_read" on public.game_quizzes
  for select to authenticated
  using (status in ('open', 'closed') or (select public.is_admin()));
create policy "game_quiz_admin" on public.game_quizzes
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 4) game_duels — דו-קרב אחד מול אחד
-- ---------------------------------------------------------------------
create table if not exists public.game_duels (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.game_quizzes(id) on delete cascade,
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id   uuid references public.profiles(id) on delete cascade,
  invite_code   text not null unique,
  status        text not null default 'pending' check (status in ('pending', 'active', 'done', 'expired')),
  winner_id     uuid references public.profiles(id) on delete set null,
  is_draw       boolean not null default false,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '48 hours',
  decided_at    timestamptz,
  check (opponent_id is null or opponent_id <> challenger_id)
);

create index if not exists game_duel_mine_idx on public.game_duels (challenger_id, status);
create index if not exists game_duel_opp_idx  on public.game_duels (opponent_id, status);

alter table public.game_duels enable row level security;

drop policy if exists "game_duel_mine"  on public.game_duels;
drop policy if exists "game_duel_admin" on public.game_duels;

-- שני המשתתפים רואים; אף אחד אחר לא. ההצטרפות עצמה עוברת דרך RPC עם
-- הקוד, ולא דרך קריאה ישירה — אחרת אפשר היה למשוך את כל הדו-קרבות
-- הפתוחים במערכת ולראות מי משחק נגד מי.
create policy "game_duel_mine" on public.game_duels
  for select to authenticated
  using (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid())
         or (select public.is_admin()));
create policy "game_duel_admin" on public.game_duels
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 5) ניסיונות ותשובות
-- ---------------------------------------------------------------------
create table if not exists public.game_quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.game_quizzes(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  duel_id       uuid references public.game_duels(id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  score         int not null default 0,
  correct_count int not null default 0,
  total_ms      int not null default 0,
  -- מצב ההגשה הנוכחי: איזו שאלה הוגשה ומתי. הבסיס למדידת זמן בשרת.
  current_qid   uuid,
  current_served_at timestamptz,
  unique (quiz_id, user_id)
);

create index if not exists game_att_user_idx on public.game_quiz_attempts (user_id, started_at desc);
create index if not exists game_att_duel_idx on public.game_quiz_attempts (duel_id);

alter table public.game_quiz_attempts enable row level security;

drop policy if exists "game_att_own"   on public.game_quiz_attempts;
drop policy if exists "game_att_admin" on public.game_quiz_attempts;

create policy "game_att_own" on public.game_quiz_attempts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin())
         or exists (select 1 from public.game_duels d
                     where d.id = duel_id
                       and (d.challenger_id = (select auth.uid()) or d.opponent_id = (select auth.uid()))));
create policy "game_att_admin" on public.game_quiz_attempts
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ⚠ אין INSERT/UPDATE לשחקן. הכל דרך ה-RPC — אחרת אפשר לכתוב score ישירות.
revoke insert, update, delete on public.game_quiz_attempts from anon, authenticated;
grant select on public.game_quiz_attempts to authenticated;

create table if not exists public.game_quiz_answers (
  attempt_id  uuid not null references public.game_quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.game_questions(id) on delete cascade,
  chosen      int  not null check (chosen between 0 and 3),
  is_correct  boolean not null,
  ms          int not null default 0,
  points      int not null default 0,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

alter table public.game_quiz_answers enable row level security;

drop policy if exists "game_ans_own" on public.game_quiz_answers;
create policy "game_ans_own" on public.game_quiz_answers
  for select to authenticated
  using (exists (select 1 from public.game_quiz_attempts a
                  where a.id = attempt_id
                    and (a.user_id = (select auth.uid()) or (select public.is_admin()))));

revoke insert, update, delete on public.game_quiz_answers from anon, authenticated;
grant select on public.game_quiz_answers to authenticated;


-- ---------------------------------------------------------------------
-- 6) בניית חידון — אדמין
-- ---------------------------------------------------------------------
create or replace function public.game_build_quiz(
  p_title      text,
  p_count      int  default 8,
  p_categories text[] default null,
  p_difficulty text default null,
  p_seconds    int  default 20,
  p_kind       text default 'weekly'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ids uuid[]; v_id uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select array_agg(id) into v_ids from (
    select q.id from public.game_questions q
     where q.active
       and (p_categories is null or q.category = any (p_categories))
       and (p_difficulty is null or q.difficulty = p_difficulty)
     order by random()
     limit greatest(coalesce(p_count, 8), 1)
  ) s;

  if v_ids is null or array_length(v_ids, 1) is null then
    return jsonb_build_object('ok', false, 'reason', 'no_questions',
      'message', 'אין שאלות מתאימות במאגר לפי הסינון שביקשת.');
  end if;

  insert into public.game_quizzes (title, kind, question_ids, seconds_per_q, created_by)
  values (p_title, coalesce(p_kind, 'weekly'), v_ids, coalesce(p_seconds, 20), auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'quiz_id', v_id, 'questions', array_length(v_ids, 1));
end;
$$;


-- ---------------------------------------------------------------------
-- 7) התחלת ניסיון
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


-- ---------------------------------------------------------------------
-- 8) game_quiz_next — מגישה את השאלה הבאה **בלי התשובה**
-- ---------------------------------------------------------------------
create or replace function public.game_quiz_next(p_attempt uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a record; z record; v_qid uuid; v_q record; v_idx int; v_done int;
begin
  select * into a from public.game_quiz_attempts where id = p_attempt for update;
  if not found or a.user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if a.finished_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'finished');
  end if;

  select * into z from public.game_quizzes where id = a.quiz_id;

  select count(*) into v_done from public.game_quiz_answers where attempt_id = p_attempt;

  -- השאלה הבאה לפי הסדר שנקבע בבניית החידון
  select qid, idx into v_qid, v_idx from (
    select u.qid, u.idx from unnest(z.question_ids) with ordinality as u(qid, idx)
     where not exists (select 1 from public.game_quiz_answers ans
                        where ans.attempt_id = p_attempt and ans.question_id = u.qid)
     order by u.idx limit 1
  ) s;

  if v_qid is null then
    return jsonb_build_object('ok', true, 'done', true, 'answered', v_done);
  end if;

  select id, q, options, category, difficulty into v_q
    from public.game_questions where id = v_qid;

  -- חותמת ההגשה — ממנה נמדד הזמן, בשרת
  update public.game_quiz_attempts
     set current_qid = v_qid, current_served_at = now()
   where id = p_attempt;

  return jsonb_build_object(
    'ok', true, 'done', false,
    'question_id', v_q.id,
    'q', v_q.q,
    'options', to_jsonb(v_q.options),     -- ⚑ בלי correct, בלי explain
    'category', v_q.category,
    'difficulty', v_q.difficulty,
    'index', v_idx,
    'total', array_length(z.question_ids, 1),
    'seconds', z.seconds_per_q);
end;
$$;


-- ---------------------------------------------------------------------
-- 9) game_quiz_answer — בדיקה בשרת, וההסבר חוזר רק עכשיו
-- ---------------------------------------------------------------------
create or replace function public.game_quiz_answer(p_attempt uuid, p_question uuid, p_chosen int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record; z record; v_q record;
  v_ms int; v_limit_ms int; v_ok boolean; v_pts int; v_speed int; v_left numeric;
begin
  select * into a from public.game_quiz_attempts where id = p_attempt for update;
  if not found or a.user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if a.finished_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'finished');
  end if;
  -- ⚠ אפשר לענות **רק** על השאלה שהשרת הגיש. בלי זה אפשר לדלג קדימה,
  --   לפתוח את כל השאלות במקביל, ולענות עליהן בלי טיימר.
  if a.current_qid is distinct from p_question then
    return jsonb_build_object('ok', false, 'reason', 'wrong_question');
  end if;

  select * into z from public.game_quizzes where id = a.quiz_id;
  select * into v_q from public.game_questions where id = p_question;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_question'); end if;

  v_limit_ms := z.seconds_per_q * 1000;
  v_ms := greatest(0, (extract(epoch from (now() - a.current_served_at)) * 1000)::int);
  v_ok := (p_chosen = v_q.correct);

  -- מעבר לזמן: התשובה נרשמת, אבל אינה מזכה בנקודות. עדיף על חסימה —
  -- ילד שהאינטרנט שלו נתקע לא נשאר תקוע בשאלה לנצח.
  if v_ms > v_limit_ms then
    v_pts := 0; v_speed := 0;
  elsif v_ok then
    v_pts   := public.game_points('quiz_correct', 10);
    v_left  := 1.0 - (v_ms::numeric / nullif(v_limit_ms, 0));
    v_speed := floor(public.game_points('quiz_speed', 5) * greatest(v_left, 0))::int;
    v_pts   := v_pts + v_speed;
  else
    v_pts := 0; v_speed := 0;
  end if;

  insert into public.game_quiz_answers (attempt_id, question_id, chosen, is_correct, ms, points)
  values (p_attempt, p_question, p_chosen, v_ok, v_ms, v_pts)
  on conflict (attempt_id, question_id) do nothing;

  -- ⚠ אם השורה כבר הייתה קיימת — יוצאים **לפני** עדכון הניקוד. אחרת
  --   קריאה כפולה (רשת שנתקעה, לחיצה כפולה) הייתה מוסיפה נקודות פעמיים
  --   על אותה תשובה. שומר ה-current_qid כבר חוסם את זה, וזו החגורה השנייה.
  if not found then
    return jsonb_build_object('ok', true, 'duplicate', true,
      'correct', v_ok, 'correct_index', v_q.correct, 'explain', v_q.explain, 'points', 0);
  end if;

  update public.game_quiz_attempts
     set score = score + v_pts,
         correct_count = correct_count + (case when v_ok then 1 else 0 end),
         total_ms = total_ms + v_ms,
         current_qid = null, current_served_at = null
   where id = p_attempt;

  return jsonb_build_object(
    'ok', true,
    'correct', v_ok,
    'correct_index', v_q.correct,     -- מותר עכשיו: התשובה כבר נרשמה
    'explain', v_q.explain,
    'points', v_pts,
    'speed_bonus', v_speed,
    'too_slow', v_ms > v_limit_ms);
end;
$$;


-- ---------------------------------------------------------------------
-- 10) סיום — ניקוד לפנקס
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

  delete from public.game_points_ledger
   where scope = 'quiz' and user_id = a.user_id and source_key = 'quiz:' || a.quiz_id::text;

  insert into public.game_points_ledger
    (user_id, scope, source_key, rule_key, points, reason,
     occurred_at, occurred_on, period_month, period_season)
  values (a.user_id, 'quiz', 'quiz:' || a.quiz_id::text, 'quiz_correct',
          a.score + v_bonus,
          'חידון: ' || z.title || ' — ' || a.correct_count || '/' || v_n,
          now(), v_day, v_month, v_season);

  -- דו-קרב: אם שני הצדדים סיימו — מכריעים
  if a.duel_id is not null then
    perform public.game_duel_settle(a.duel_id);
  end if;

  return jsonb_build_object('ok', true, 'score', a.score + v_bonus,
    'correct', a.correct_count, 'total', v_n, 'perfect', v_perfect);
end;
$$;


-- ---------------------------------------------------------------------
-- 11) דו-קרב — יצירה, הצטרפות, הכרעה
-- ---------------------------------------------------------------------
create or replace function public.game_duel_create(p_count int default 6, p_seconds int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ids uuid[]; v_quiz uuid; v_duel uuid; v_code text;
begin
  if not public.game_can_play() then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select array_agg(id) into v_ids from (
    select q.id from public.game_questions q where q.active
     order by random() limit greatest(coalesce(p_count, 6), 3)
  ) s;
  if v_ids is null then return jsonb_build_object('ok', false, 'reason', 'no_questions'); end if;

  insert into public.game_quizzes (title, kind, question_ids, seconds_per_q, status, created_by)
  values ('דו-קרב', 'duel', v_ids, coalesce(p_seconds, 20), 'open', auth.uid())
  returning id into v_quiz;

  -- קוד קצר וקריא. ⚠ במכוון **בלי gen_random_bytes** — היא מגיעה מהרחבת
  -- pgcrypto שאינה מובטחת בכל פרויקט, ופונקציה שנשענת עליה הייתה נכשלת
  -- רק ברגע שילד מנסה לפתוח דו-קרב. md5 הוא ליבה של פוסטגרס.
  -- 0 ו-1 מוחלפים כדי שלא יתבלבלו עם O ועם I בהקראה בוואטסאפ.
  for i in 1..5 loop
    v_code := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', 'GH'), 1, 6));
    begin
      insert into public.game_duels (quiz_id, challenger_id, invite_code)
      values (v_quiz, auth.uid(), v_code)
      returning id into v_duel;
      exit;
    exception when unique_violation then
      v_duel := null;   -- התנגשות קוד — מגרילים שוב
    end;
  end loop;

  if v_duel is null then
    return jsonb_build_object('ok', false, 'reason', 'code_collision');
  end if;

  return jsonb_build_object('ok', true, 'duel_id', v_duel, 'quiz_id', v_quiz, 'code', v_code);
end;
$$;

create or replace function public.game_duel_join(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare d record;
begin
  if not public.game_can_play() then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select * into d from public.game_duels
   where invite_code = upper(btrim(p_code)) for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'bad_code', 'message', 'הקוד לא נמצא.');
  end if;
  if d.challenger_id = auth.uid() then
    return jsonb_build_object('ok', true, 'duel_id', d.id, 'quiz_id', d.quiz_id, 'mine', true);
  end if;
  if d.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired', 'message', 'ההזמנה פגה.');
  end if;
  if d.opponent_id is not null and d.opponent_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'taken', 'message', 'מישהו אחר כבר קיבל את האתגר.');
  end if;

  update public.game_duels
     set opponent_id = auth.uid(), status = 'active'
   where id = d.id and opponent_id is null;

  return jsonb_build_object('ok', true, 'duel_id', d.id, 'quiz_id', d.quiz_id, 'mine', false);
end;
$$;

create or replace function public.game_duel_settle(p_duel uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d record; a1 record; a2 record; v_winner uuid; v_draw boolean := false;
  v_month text; v_season text; v_day date; v_pts int;
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

  -- שובר שוויון: זמן כולל קצר יותר
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

  if v_draw then
    v_pts := public.game_points('duel_draw', 10);
    insert into public.game_points_ledger
      (user_id, scope, source_key, rule_key, points, reason, occurred_at, occurred_on, period_month, period_season)
    select u, 'quiz', 'duel:' || p_duel::text, 'duel_draw', v_pts, 'תיקו בדו-קרב',
           now(), v_day, v_month, v_season
      from unnest(array[d.challenger_id, d.opponent_id]) u;
  else
    v_pts := public.game_points('duel_win', 25);
    insert into public.game_points_ledger
      (user_id, scope, source_key, rule_key, points, reason, occurred_at, occurred_on, period_month, period_season)
    values (v_winner, 'quiz', 'duel:' || p_duel::text, 'duel_win', v_pts, 'ניצחון בדו-קרב',
            now(), v_day, v_month, v_season);
  end if;

  return jsonb_build_object('ok', true, 'winner', v_winner, 'draw', v_draw);
end;
$$;


-- ---------------------------------------------------------------------
-- 12) הרשאות
-- ---------------------------------------------------------------------
revoke all on function public.game_build_quiz(text,int,text[],text,int,text) from public, anon;
revoke all on function public.game_quiz_start(uuid, uuid)                    from public, anon;
revoke all on function public.game_quiz_next(uuid)                           from public, anon;
revoke all on function public.game_quiz_answer(uuid, uuid, int)              from public, anon;
revoke all on function public.game_quiz_finish(uuid)                         from public, anon;
revoke all on function public.game_duel_create(int, int)                     from public, anon;
revoke all on function public.game_duel_join(text)                           from public, anon;
revoke all on function public.game_duel_settle(uuid)                         from public, anon;

grant execute on function public.game_build_quiz(text,int,text[],text,int,text) to authenticated;
grant execute on function public.game_quiz_start(uuid, uuid)                    to authenticated;
grant execute on function public.game_quiz_next(uuid)                           to authenticated;
grant execute on function public.game_quiz_answer(uuid, uuid, int)              to authenticated;
grant execute on function public.game_quiz_finish(uuid)                         to authenticated;
grant execute on function public.game_duel_create(int, int)                     to authenticated;
grant execute on function public.game_duel_join(text)                           to authenticated;
grant execute on function public.game_duel_settle(uuid)                         to authenticated;


-- ---------------------------------------------------------------------
-- רישום
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_game_quiz_12_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) **הבדיקה החשובה ביותר** — מחשבון שחקן אמיתי בדפדפן (לא מכאן):
--       select * from public.game_questions;
--     חייב להחזיר **0 שורות**. אם חזרו שאלות — התשובות דלפו והחידון מת.
--
--  2) הזמן נמדד בשרת: התחל חידון, קבל שאלה, המתן מעבר לטיימר וענה נכון.
--     התשובה תיקלט, אבל points יהיה 0 ו-too_slow יהיה true.
--
--  3) אי אפשר לענות על שאלה שלא הוגשה:
--     קרא ל-game_quiz_answer עם question_id של שאלה אחרת מהחידון.
--     חייב לחזור reason='wrong_question'.
--
--  4) דו-קרב: צור, הצטרף מחשבון שני, סיים בשניהם, וּודא הכרעה יחידה —
--     הרצה חוזרת של game_duel_settle לא מוסיפה נקודות פעם שנייה.
--
--  5) הרצה חוזרת של הקובץ כולו — חייבת לעבור נקי.
-- =====================================================================
