-- ============================================================
-- CourtSide — הקשחה 3: הגנה על קטינים ועל שדה התפקיד
-- נכתב 24.7.2026 אחרי סקירת RLS. הרץ אחרי supabase_security_hardening.sql
-- ו-supabase_player_v2.sql. בטוח להרצה חוזרת.
--
-- מה זה מתקן:
-- 1) role היה שדה שכל משתמש יכול לשנות לעצמו בכל רגע (הטריגר הקיים שמר על
--    is_admin/verified/banned אבל נכתב לפני שהיה role). כלומר מבוגר יכול היה
--    להפוך את עצמו ל"שחקן" ולהיכנס למרחב של הקטינים, ולהיפך.
-- 2) הצ'אט של השחקנים (player_messages) היה פתוח לכל מי ש-role='player',
--    בלי שום קשר למאמן או לקבוצה — כלומר מרחב פתוח בין קטינים שכל אחד
--    שנרשם יכול להיכנס אליו.
-- 3) טבלת קודי ההצטרפות הייתה קריאה במלואה לכל משתמש מחובר (אפשר היה לשלוף
--    את כל הקודים והקבוצות). עכשיו הפענוח עובר דרך פונקציה שמחזירה קוד אחד.
-- ============================================================

-- ------------------------------------------------------------
-- 1) role מוגן: אפשר לבחור תפקיד רק בהרשמה (לפני שיש שם), ואדמין תמיד יכול
-- ------------------------------------------------------------
create or replace function public.protect_profile_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.is_admin     is distinct from old.is_admin
    or new.verified     is distinct from old.verified
    or new.banned       is distinct from old.banned
    or new.verified_at  is distinct from old.verified_at
    or new.verified_by  is distinct from old.verified_by then
      raise exception 'שינוי שדות ניהול מותר לאדמין בלבד';
    end if;

    -- תפקיד: נבחר פעם אחת בהשלמת ההרשמה (כשעוד אין first_name)
    if new.role is distinct from old.role and old.first_name is not null then
      raise exception 'לא ניתן לשנות תפקיד (מאמן/שחקן) לאחר ההרשמה. פנו לתמיכה.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_cols on public.profiles;
create trigger trg_protect_profile_cols
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_cols();

-- ------------------------------------------------------------
-- 2) קהילת השחקנים — רק שחקנים שמאמן אישר בפועל
-- ------------------------------------------------------------
create or replace function public.is_linked_player()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_memberships m
    where m.player_id = auth.uid() and m.status = 'approved'
  );
$$;

do $$
begin
  if to_regclass('public.player_messages') is not null then
    drop policy if exists "pmsg_select_players" on public.player_messages;
    execute 'create policy "pmsg_select_players" on public.player_messages
      for select to authenticated using (public.is_player() and public.is_linked_player())';

    drop policy if exists "pmsg_insert_own_player" on public.player_messages;
    execute 'create policy "pmsg_insert_own_player" on public.player_messages
      for insert to authenticated
      with check (user_id = auth.uid() and public.is_player() and public.is_linked_player())';
  end if;
end $$;

-- ------------------------------------------------------------
-- 3) קודי הצטרפות — פענוח דרך פונקציה, בלי קריאה חופשית לטבלה
-- ------------------------------------------------------------
create or replace function public.resolve_join_code(p_code text)
returns table (coach_id uuid, team text)
language sql
stable
security definer
set search_path = public
as $$
  select c.coach_id, c.team
  from public.team_join_codes c
  where upper(c.code) = upper(trim(p_code))
  limit 1;
$$;

revoke all on function public.resolve_join_code(text) from public;
grant execute on function public.resolve_join_code(text) to authenticated;

-- הסרת הקריאה החופשית לטבלה (הקוד באפליקציה עובר לפונקציה; יש נפילה לאחור
-- אם הפונקציה עוד לא קיימת, לכן אפשר להריץ את זה גם לפני עליית הגרסה)
drop policy if exists "join_codes_resolve" on public.team_join_codes;

-- רישום שהקובץ הורץ (דורש supabase_migrations_ledger.sql; לא נכשל אם הוא חסר)
do $mig$ begin perform public.mark_migration('supabase_security3.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';
