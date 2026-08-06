-- =====================================================================
-- CourtSide — אימון אישי: הקשר מאמן↔מתאמן  ·  4.8.2026
--
-- מה זה נותן: מאמן יכול להחזיק **מתאמנים אישיים** — שחקנים שאינם בהכרח
-- בסגל שלו — ולשגר להם משימות. מנוע המשימות כבר קיים
-- (player_assignments מ-supabase_players.sql); מה שחסר הוא הקשר עצמו.
--
-- ⚠ למה זה הקובץ הרגיש בפרויקט:
--   קשר אישי בין מאמן לקטין **מחוץ למסגרת קבוצה** הוא בדיוק התבנית שכל
--   מודל האבטחה כאן נועד לשמור עליה. בקבוצה יש הורים אחרים, מועדון ועדים;
--   באימון אישי אין. לכן:
--     · קטין נעול לחלוטין עד שההורה מאשר **את המאמן הזה בשם**.
--     · האישור נרשם ב-consents, שהיא append-only — כלומר ראיה.
--     · אין ערוץ הודעות חופשי. משימות בלבד, ותמיד מתועדות.
--
-- אידמפוטנטי.
-- דורש: supabase_players.sql (player_assignments), supabase_parent_consent.sql
--       (consents/minor_age), ו-supabase_schedule_board_4_8.sql — משם מגיעה
--       is_coach_id(), שהמדיניות כאן נשענת עליה. הרץ אותו קודם.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) is_minor_id — «האם המזהה הזה שייך לקטין»
--     נשען על minor_age() הקיימת, שמדויקת מתאריך לידה ושמרנית כשיש רק שנה.
--     SECURITY DEFINER: birth_date מחוץ ל-whitelist הקריאה של privacy4,
--     והמדיניות חייבת לקרוא אותו. מחזירה בוליאני אחד, לא נתון.
--     ברירת המחדל כשאין נתוני לידה היא **true** — מי שלא הוכח כבגיר
--     נחשב קטין, וזה הכיוון הבטוח.
-- ---------------------------------------------------------------------
create or replace function public.is_minor_id(_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.minor_age(p.birth_date, p.birth_year) < 18
       from public.profiles p where p.id = _id),
    true
  );
$$;

revoke all on function public.is_minor_id(uuid) from public, anon;
grant execute on function public.is_minor_id(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2) הרחבת יומן ההסכמות לאישור פר-מאמן
--
--     ארבע הקטגוריות הקיימות הן גלובליות לילד («מותר לצלם»). כאן צריך
--     אישור שמכוון ל**אדם מסוים**, ולכן נוספת subject_id.
--     ה-CHECK מוחלף ולא נוסף — אחרת אי אפשר לכתוב את הערך החדש.
--     טריגר ה-append-only (trg_consents_immutable) נשאר כפי שהוא.
-- ---------------------------------------------------------------------
alter table public.consents          add column if not exists subject_id uuid;
alter table public.consent_requests  add column if not exists subject_id uuid;

do $ck$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.consents'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%consent_type%'
  loop
    execute format('alter table public.consents drop constraint %I', r.conname);
  end loop;
  alter table public.consents add constraint consents_consent_type_check
    check (consent_type in ('basic', 'media_team', 'media_public', 'marketing', 'personal_training'));

  for r in
    select conname from pg_constraint
     where conrelid = 'public.consent_requests'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%purpose%'
  loop
    execute format('alter table public.consent_requests drop constraint %I', r.conname);
  end loop;
  alter table public.consent_requests add constraint consent_requests_purpose_check
    check (purpose in ('initial', 'manage', 'trainee'));
end $ck$;

create index if not exists consents_subject_idx
  on public.consents (minor_id, consent_type, subject_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3) personal_trainees — הקשר עצמו
--
--     unique(coach_id, player_id) ולא unique(player_id): הבעלים ביקש
--     במפורש שמתאמן יוכל להיות אצל כמה מאמנים במקביל (זריקות אצל אחד,
--     כושר אצל אחר).
--
--     המסלול: השחקן מבקש (pending_coach) → המאמן מאשר → אם קטין,
--     pending_parent עד אישור ההורה → active. ended = הקשר הסתיים.
-- ---------------------------------------------------------------------
create table if not exists public.personal_trainees (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles(id) on delete cascade,
  player_id    uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending_coach'
               check (status in ('pending_coach', 'pending_parent', 'active', 'ended')),
  requested_at timestamptz not null default now(),
  approved_at  timestamptz,
  guardian_ok_at timestamptz,
  ended_at     timestamptz,
  note         text,
  unique (coach_id, player_id)
);

create index if not exists ptrainees_coach_idx  on public.personal_trainees (coach_id, status);
create index if not exists ptrainees_player_idx on public.personal_trainees (player_id, status);

alter table public.personal_trainees enable row level security;

-- הצדדים לקשר רואים אותו. אף אחד אחר לא.
drop policy if exists "ptrainees_select_party" on public.personal_trainees;
create policy "ptrainees_select_party" on public.personal_trainees
  for select to authenticated
  using (coach_id = auth.uid() or player_id = auth.uid() or (select public.is_admin()));

-- השחקן מבקש. הוא היוזם, ולא המאמן — מבוגר שמוסיף לעצמו ילד בלי ידיעתו
-- הוא בדיוק מה שאסור. הבקשה נולדת תמיד pending_coach.
drop policy if exists "ptrainees_insert_player" on public.personal_trainees;
create policy "ptrainees_insert_player" on public.personal_trainees
  for insert to authenticated
  with check (
    player_id = auth.uid()
    and coach_id <> auth.uid()
    and public.is_coach_id(coach_id)
    and status = 'pending_coach'
  );

-- שני הצדדים יכולים לעדכן — המאמן מאשר, וכל צד יכול לסיים.
-- המעבר ל-active נשלט בטריגר למטה, לא כאן.
drop policy if exists "ptrainees_update_party" on public.personal_trainees;
create policy "ptrainees_update_party" on public.personal_trainees
  for update to authenticated
  using (coach_id = auth.uid() or player_id = auth.uid())
  with check (coach_id = auth.uid() or player_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4) השער: אי אפשר להגיע ל-active בלי אישור הורה כשמדובר בקטין
--
--     הטריגר ולא המדיניות: המדיניות בודקת מי כותב, הטריגר בודק **מה**
--     נכתב, וזה מה שצריך כאן. גם admin_set_approval לא עוקף אותו.
-- ---------------------------------------------------------------------
-- latest_consent_subject — כמו latest_consent הקיימת, אבל ממוקדת לאדם.
-- מוגדרת לפני הטריגר שקורא לה.
create or replace function public.latest_consent_subject(_minor uuid, _type text, _subject uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.value from public.consents c
   where c.minor_id = _minor and c.consent_type = _type and c.subject_id = _subject
   order by c.created_at desc limit 1;
$$;

revoke all on function public.latest_consent_subject(uuid, text, uuid) from public, anon;
grant execute on function public.latest_consent_subject(uuid, text, uuid) to authenticated;

create or replace function public.ptrainee_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    if public.is_minor_id(new.player_id)
       and public.latest_consent_subject(new.player_id, 'personal_training', new.coach_id) is distinct from 'granted' then
      -- לא שגיאה למשתמש — פשוט לא עוברים ל-active. השורה נשארת
      -- ממתינה, והמסך מציג «ממתין לאישור הורה».
      new.status := 'pending_parent';
      new.approved_at := coalesce(new.approved_at, now());
    else
      new.guardian_ok_at := coalesce(new.guardian_ok_at, now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ptrainee_gate on public.personal_trainees;
create trigger trg_ptrainee_gate
  before insert or update on public.personal_trainees
  for each row execute function public.ptrainee_gate();

-- ---------------------------------------------------------------------
-- 5) personal_bond_active — הפרדיקט שהמשימות נשענות עליו
-- ---------------------------------------------------------------------
create or replace function public.personal_bond_active(_coach uuid, _player uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.personal_trainees t
     where t.coach_id = _coach and t.player_id = _player and t.status = 'active'
  );
$$;

revoke all on function public.personal_bond_active(uuid, uuid) from public, anon;
grant execute on function public.personal_bond_active(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6) ⚠ סגירת פרצה קיימת ב-player_assignments
--
--     המדיניות היום היא `coach_id = auth.uid()` בלבד — כלומר מאמן יכול
--     לשגר משימה ל**כל** מזהה שהוא מכיר, גם ילד שאינו שלו. עכשיו יש
--     שתי דרכים לגיטימיות בלבד: שיגור לקבוצה שלו, או למתאמן אישי פעיל.
--     בלי הסעיף הזה נעילת הקטין שלמעלה חסרת ערך — היא הייתה נעקפת
--     בשיגור ישיר.
-- ---------------------------------------------------------------------
drop policy if exists "assign_coach_all" on public.player_assignments;

drop policy if exists "assign_coach_read"   on public.player_assignments;
drop policy if exists "assign_coach_write"  on public.player_assignments;
drop policy if exists "assign_coach_modify" on public.player_assignments;
drop policy if exists "assign_coach_delete" on public.player_assignments;

create policy "assign_coach_read" on public.player_assignments
  for select to authenticated using (coach_id = auth.uid());

create policy "assign_coach_write" on public.player_assignments
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and (
      -- שיגור לכל הקבוצה
      (player_id is null and team is not null)
      -- או לשחקן יחיד: או שהוא בסגל שלי, או שהוא מתאמן אישי פעיל
      or (player_id is not null and (
            exists (select 1 from public.team_players tp
                     where tp.coach_id = auth.uid() and tp.player_id = player_assignments.player_id)
            or public.personal_bond_active(auth.uid(), player_assignments.player_id)
         ))
    )
  );

create policy "assign_coach_modify" on public.player_assignments
  for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy "assign_coach_delete" on public.player_assignments
  for delete to authenticated using (coach_id = auth.uid());

-- ---------------------------------------------------------------------
-- רישום
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_personal_training_4_8.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';

-- =====================================================================
-- בדיקות אחרי ההרצה
--
--  1) קטין אינו יכול להיות active בלי אישור הורה:
--       insert into public.personal_trainees (coach_id, player_id, status)
--       values ('<coach>', '<minor>', 'pending_coach');
--       update public.personal_trainees set status='active' where ...;
--       select status from public.personal_trainees where ...;
--     חייב להחזיר 'pending_parent'. אם החזיר 'active' — הטריגר לא נוצר.
--
--  2) שיגור משימה למי שאינו שלי נחסם:
--       insert into public.player_assignments (coach_id, player_id, title)
--       values (auth.uid(), '<זר>', 'בדיקה');
--     חייב להיכשל על row-level security.
--
--  3) הרצה חוזרת של הקובץ כולו — חייבת לעבור נקי.
-- =====================================================================
