-- =====================================================================
-- CourtSide — אישור הורה לאימון אישי  ·  4.8.2026
--
-- מה זה סוגר: אחרי שני הקבצים הקודמים, קטין נתקע ב-'pending_parent'
-- ואין שום מסלול שיזיז אותו. כאן נבנה המסלול.
--
-- ⚠ פונקציות **נפרדות** ולא שינוי של create_consent_request /
-- get_consent_request / submit_parent_consent. מסלול ההסכמה הקיים הוא
-- הנתיב הרגיש ביותר במוצר, הוא נבדק ורץ בייצור, ואין סיבה לגעת בו
-- כדי להוסיף לידו מקרה חדש. הטבלאות משותפות — הלוגיקה לא.
--
-- ההסכמה נרשמת ב-consents עם consent_type='personal_training' ו-
-- subject_id = המאמן. הטבלה append-only, ולכן זו ראיה ולא הגדרה.
--
-- אידמפוטנטי. דורש: supabase_personal_training_4_8.sql, supabase_parent_consent.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) הקטין מנפיק קישור להורה עבור מאמן מסוים
--
--     לא מבקש מייל שוב: אם כבר יש guardian רשום (וברוב המקרים יש —
--     הקטין עבר את ההסכמה הבסיסית), הקישור נתלה עליו. אין guardian?
--     מחזיר need_guardian, והמסך שולח קודם למסלול הרגיל.
-- ---------------------------------------------------------------------
create or replace function public.create_trainee_consent_request(p_coach uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_guardian uuid;
  v_token    text;
  v_status   text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  -- חייב להתקיים קשר שממתין להורה. בלי זה אין מה לאשר, וגם אי אפשר
  -- לייצר קישורים על מאמנים אקראיים.
  select status into v_status from public.personal_trainees
   where player_id = v_me and coach_id = p_coach;
  if v_status is null or v_status = 'ended' then
    return jsonb_build_object('ok', false, 'reason', 'no_bond');
  end if;
  if v_status = 'active' then
    return jsonb_build_object('ok', true, 'reason', 'already_active');
  end if;

  select id into v_guardian from public.guardians where minor_id = v_me;
  if v_guardian is null then
    return jsonb_build_object('ok', false, 'reason', 'need_guardian');
  end if;

  -- טוקן חד-פעמי, דרך העוזר הקיים. ⚠ לא לייצר כאן טוקן ידנית:
  -- gen_random_bytes מגיע מ-pgcrypto, שאינו בנתיב החיפוש של פונקציה עם
  -- `set search_path = public` — וזה בדיוק מה שהפיל את הגרסה הראשונה
  -- כאן. new_consent_token() כבר מטפלת בזה: היא רצה עם
  -- `search_path = public, extensions` **וגם** עם נפילה לאחור אם התוסף
  -- חסר לגמרי. הטוקן נשמר כ-sha256 בלבד, כמו במסלול הראשי.
  v_token := public.new_consent_token();

  insert into public.consent_requests (minor_id, guardian_id, token_hash, purpose, subject_id, expires_at)
  values (v_me, v_guardian, encode(sha256(convert_to(v_token, 'utf8')), 'hex'), 'trainee', p_coach,
          now() + interval '14 days');

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

revoke all on function public.create_trainee_consent_request(uuid) from public, anon;
grant execute on function public.create_trainee_consent_request(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 1ב) **המאמן** מנפיק את הקישור — וזו הדרך המועדפת
--
--     החלטת הבעלים, והיא נכונה גם מבחינת המודל: עדיף שמבוגר יפנה להורה
--     ישירות מאשר שהילד יהיה השליח של האישור על עצמו. הגרסה של הקטין
--     (1) נשארת כגיבוי, למקרה שהמאמן אינו זמין.
--
--     המאמן אינו מקבל שום פרט על ההורה — לא מייל ולא טלפון. הוא מקבל
--     טוקן בלבד, ומעביר אותו בערוץ שכבר יש לו מול המשפחה.
-- ---------------------------------------------------------------------
create or replace function public.coach_trainee_consent_link(p_player uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_guardian uuid;
  v_token    text;
  v_status   text;
begin
  if v_me is null or not public.is_coach_id(v_me) then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  select status into v_status from public.personal_trainees
   where coach_id = v_me and player_id = p_player;
  if v_status is null or v_status = 'ended' then
    return jsonb_build_object('ok', false, 'reason', 'no_bond');
  end if;
  if v_status = 'active' then
    return jsonb_build_object('ok', true, 'reason', 'already_active');
  end if;

  select id into v_guardian from public.guardians where minor_id = p_player;
  if v_guardian is null then
    return jsonb_build_object('ok', false, 'reason', 'need_guardian');
  end if;

  v_token := public.new_consent_token();

  insert into public.consent_requests (minor_id, guardian_id, token_hash, purpose, subject_id, expires_at)
  values (p_player, v_guardian, encode(sha256(convert_to(v_token, 'utf8')), 'hex'), 'trainee', v_me,
          now() + interval '14 days');

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

revoke all on function public.coach_trainee_consent_link(uuid) from public, anon;
grant execute on function public.coach_trainee_consent_link(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2) ההורה פותח את הקישור — בלי חשבון
--
--     anon בכוונה: ההורה אינו משתמש רשום, וזו בדיוק אותה החלטה שנעשתה
--     במסלול הראשי. מחזיר רק מה שנדרש להחלטה: שם הילד, שם המאמן,
--     והמועדון. לא מייל, לא טלפון, לא כלום מעבר.
-- ---------------------------------------------------------------------
create or replace function public.get_trainee_consent(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r          record;
  v_minor    text;
  v_coach    text;
  v_club     text;
  v_status   text;
begin
  select cr.* into r from public.consent_requests cr
   where cr.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex')
     and cr.purpose = 'trainee';

  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if r.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;

  select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_minor
    from public.profiles where id = r.minor_id;
  select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), club
    into v_coach, v_club
    from public.profiles where id = r.subject_id;

  select status into v_status from public.personal_trainees
   where player_id = r.minor_id and coach_id = r.subject_id;

  return jsonb_build_object(
    'ok', true,
    'minor_name', v_minor,
    'coach_name', v_coach,
    'coach_club', v_club,
    'status', v_status,
    'decided', public.latest_consent_subject(r.minor_id, 'personal_training', r.subject_id)
  );
end;
$$;

revoke all on function public.get_trainee_consent(text) from public;
grant execute on function public.get_trainee_consent(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) ההורה מחליט
--
--     כתיבה ל-consents (append-only) ואז עדכון הקשר. סירוב מסיים את
--     הקשר — לא משאיר אותו תלוי, כדי שלא ייווצר מצב שבו ההורה אמר לא
--     והמאמן ממשיך לראות «ממתין».
-- ---------------------------------------------------------------------
create or replace function public.submit_trainee_consent(p_token text, p_grant boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare r record;
begin
  select cr.* into r from public.consent_requests cr
   where cr.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex')
     and cr.purpose = 'trainee';

  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if r.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;

  insert into public.consents
    (minor_id, guardian_id, request_id, consent_type, subject_id, value, source)
  values
    (r.minor_id, r.guardian_id, r.id, 'personal_training', r.subject_id,
     case when p_grant then 'granted' else 'denied' end, 'parent_link');

  update public.consent_requests set used_at = now() where id = r.id;

  if p_grant then
    -- הטריגר ptrainee_gate בודק שוב את ההסכמה. הוא יאשר עכשיו.
    update public.personal_trainees
       set status = 'active'
     where player_id = r.minor_id and coach_id = r.subject_id and status <> 'ended';
  else
    update public.personal_trainees
       set status = 'ended', ended_at = now()
     where player_id = r.minor_id and coach_id = r.subject_id;
  end if;

  return jsonb_build_object('ok', true, 'granted', p_grant);
end;
$$;

revoke all on function public.submit_trainee_consent(text, boolean) from public;
grant execute on function public.submit_trainee_consent(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- רישום
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_trainee_consent_4_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';

-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) מחשבון הקטין:  select public.create_trainee_consent_request('<coach>');
--     → {"ok":true,"token":"..."}
--  2) בלי חשבון:      select public.get_trainee_consent('<token>');
--     → שם הילד, שם המאמן, status='pending_parent'
--  3) אישור:          select public.submit_trainee_consent('<token>', true);
--     ואז select status from public.personal_trainees … → 'active'
--  4) סירוב על טוקן חדש → status='ended', והמאמן אינו רואה «ממתין» לנצח.
-- =====================================================================
