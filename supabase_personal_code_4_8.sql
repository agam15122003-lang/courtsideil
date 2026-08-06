-- =====================================================================
-- CourtSide — קוד אימון אישי  ·  4.8.2026
--
-- הבעיה שהקובץ פותר: אחרי supabase_personal_training_4_8.sql הקשר קיים,
-- אבל אין לשחקן דרך **למצוא** את המאמן. ספריית המאמנים היא מסך של
-- מאמנים בלבד, ולכן הרשימה נשארה ריקה לנצח.
--
-- הפתרון: קוד אישי למאמן, נפרד מקוד הקבוצה (החלטת הבעלים) — כך שאפשר
-- לתת קוד לאימון אישי בלי לפתוח גישה לקבוצה, ולהפך.
--
-- ⚠ הקוד נפתר **רק דרך RPC**. לא ניתנת הרשאת קריאה על העמודה: אחרת
-- אפשר היה לסרוק את טבלת הפרופילים ולמפות קודים. אותה תפיסה בדיוק
-- כמו resolve_join_code בקובץ ההקשחה.
--
-- אידמפוטנטי. דורש: supabase_personal_training_4_8.sql,
--                    supabase_hardening_medium_3_8.sql (join_code_attempts).
-- =====================================================================

alter table public.profiles add column if not exists personal_code text;

-- ייחודי, אבל רק על ערכים שאינם null — לרוב המשתמשים אין קוד כזה.
create unique index if not exists profiles_personal_code_key
  on public.profiles (personal_code) where personal_code is not null;

-- ---------------------------------------------------------------------
-- 1) יצירת קוד
--
--     אלפבית בלי 0/O ובלי 1/I/L — הקוד מוכתב בעל פה ובוואטסאפ, ובלבול
--     בין השניים האלה הוא תלונת התמיכה הראשונה של כל מערכת קודים.
--     שש תווים = ~1.07 מיליארד צירופים, ועם הגבלת הקצב שלמטה זה מספיק.
-- ---------------------------------------------------------------------
create or replace function public.gen_personal_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out text;
  i int;
begin
  loop
    out := '';
    for i in 1..6 loop
      out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.personal_code = out);
  end loop;
  return out;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) הקוד שלי — למאמן. יוצר בפעם הראשונה, ומחזיר אותו אחר כך.
-- ---------------------------------------------------------------------
create or replace function public.personal_code_mine()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v text;
begin
  if not public.is_coach_id(auth.uid()) then
    raise exception 'למאמנים בלבד';
  end if;
  select personal_code into v from public.profiles where id = auth.uid();
  if v is null then
    v := public.gen_personal_code();
    update public.profiles set personal_code = v where id = auth.uid();
  end if;
  return v;
end;
$$;

revoke all on function public.personal_code_mine() from public, anon;
grant execute on function public.personal_code_mine() to authenticated;

-- ---------------------------------------------------------------------
-- 3) בקשה לפי קוד — לשחקן
--
--     מחזיר jsonb ולא זורק, כדי שהמסך יוכל להסביר בעברית במקום להציג
--     קוד שגיאה. שלוש תשובות: ok / not_found / already.
--
--     הגבלת קצב: עשרה כשלונות בשעה חוסמים, על אותה טבלה ועל אותו רעיון
--     כמו resolve_join_code. בלי זה שש תווים ניתנים לסריקה.
-- ---------------------------------------------------------------------
create or replace function public.request_personal_coach(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_coach uuid;
  v_fails int;
  v_exist text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  select count(*) into v_fails
    from public.join_code_attempts
   where user_id = auth.uid() and not ok and created_at > now() - interval '1 hour';
  if v_fails >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;

  select id into v_coach from public.profiles
   where personal_code = v_code and role = 'coach';

  if v_coach is null then
    insert into public.join_code_attempts (user_id, code_hash, ok)
    values (auth.uid(), md5(v_code), false);
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_coach = auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  select status into v_exist from public.personal_trainees
   where coach_id = v_coach and player_id = auth.uid();

  if v_exist is not null and v_exist <> 'ended' then
    return jsonb_build_object('ok', true, 'reason', 'already', 'status', v_exist);
  end if;

  -- קשר שהסתיים אפשר לחדש: הבקשה חוזרת ל-pending_coach, והמאמן מאשר שוב.
  -- אישור ההורה נבדק שוב בטריגר — ביטול שלו לא נעקף בחידוש.
  if v_exist = 'ended' then
    update public.personal_trainees
       set status = 'pending_coach', requested_at = now(), ended_at = null,
           approved_at = null, guardian_ok_at = null
     where coach_id = v_coach and player_id = auth.uid();
  else
    insert into public.personal_trainees (coach_id, player_id, status)
    values (v_coach, auth.uid(), 'pending_coach');
  end if;

  insert into public.join_code_attempts (user_id, code_hash, ok)
  values (auth.uid(), md5(v_code), true);

  return jsonb_build_object('ok', true, 'reason', 'sent');
end;
$$;

revoke all on function public.request_personal_coach(text) from public, anon;
grant execute on function public.request_personal_coach(text) to authenticated;

-- ---------------------------------------------------------------------
-- רישום
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_personal_code_4_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';

-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) מחשבון מאמן:  select public.personal_code_mine();
--     חייב להחזיר שש תווים, ואותו ערך בכל קריאה חוזרת.
--
--  2) מחשבון שחקן:  select public.request_personal_coach('<הקוד>');
--     → {"ok": true, "reason": "sent"}.  קריאה שנייה → "already".
--
--  3) קוד שגוי עשר פעמים ברצף → {"ok": false, "reason": "rate"}.
--
--  4) העמודה אינה קריאה ישירות:
--       select personal_code from public.profiles where id <> auth.uid();
--     מחשבון שחקן — חייב לא להחזיר קודים של אחרים.
-- =====================================================================
