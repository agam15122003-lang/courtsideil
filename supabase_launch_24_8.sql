-- =====================================================================
-- CourtSide — הידוק לפני ההפצה · 24.8.2026
-- =====================================================================
-- מה זה: קובץ אחד שסוגר ארבעה דברים לפני שמפיצים את האתר למאמנים.
-- בטוח להרצה חוזרת. לא מוחק שום נתון.
--
-- איך מריצים: Supabase → SQL Editor → הדבק את כל הקובץ → Run.
-- בסוף הריצה תראה בלשונית Results טבלה אחת עם סיכום, ובלשונית
-- Messages שורות NOTICE שמסבירות מה קרה. **תשלח לי צילום של שתיהן.**
--
-- מה בפנים:
--   1. הופך את מקום שמירת התמונות לפרטי (היום ייתכן שהוא פתוח לכל האינטרנט)
--   2. מדליק שני מתגי אבטחה שחיכו לפריסת הפרונט
--   3. מונע ממאמן אחד לחטוף תיק שחקן של מאמן אחר
--   4. מסדר שלוש פינות בתיקי השחקנים (ייצוא, חסימה, ומחיקת מאמן)
--
-- הרץ אחרי supabase_coach_only_22_8.sql (#44).
-- =====================================================================

-- כדי שנוכל להשוות אחרי
do $$
declare v_pub boolean;
begin
  select public into v_pub from storage.buckets where id = 'media';
  if v_pub is null then
    raise notice 'לפני: דלי media לא קיים בכלל (?)';
  else
    raise notice 'לפני: דלי media public = %', v_pub;
  end if;
exception when others then
  raise notice 'לפני: לא הצלחתי לקרוא את storage.buckets (%)', sqlerrm;
end $$;


-- ---------------------------------------------------------------------
-- 1. התמונות — מקום השמירה הופך לפרטי
-- ---------------------------------------------------------------------
-- בעברית פשוטה: היום ייתכן שכל תמונה שהועלתה (תמונת פרופיל, תמונה של
-- תרגיל, תמונה בקהילה) יושבת בכתובת שכל אחד באינטרנט יכול לפתוח בלי
-- להתחבר — וגם לנחש, כי הנתיב בנוי משם המשתמש ומהשעה.
-- אחרי השורה הזו התמונות נפתחות רק דרך האפליקציה, למי שמחובר.
-- ⚠ הפרונט כבר עובד ככה (Signed URLs), אז שום דבר לא יישבר.
do $$
begin
  update storage.buckets set public = false where id = 'media';
  raise notice '✔ 1. דלי media הפך לפרטי';
exception
  when insufficient_privilege then
    raise notice '⚠ 1. אין הרשאה לשנות את storage.buckets — עשה את זה ידנית: Storage → media → Settings → Public = off';
  when others then
    raise notice '⚠ 1. נכשל: %', sqlerrm;
end $$;


-- ---------------------------------------------------------------------
-- 2. שני מתגי האבטחה שחיכו לפריסת הפרונט
-- ---------------------------------------------------------------------
-- בעברית פשוטה: היום מי שלא מחובר בכלל יכול לקרוא ישירות את טבלת
-- התרגילים. הפרונט כבר לא צריך את זה (הוא עובר דרך תצוגה מוגבלת),
-- אז סוגרים.
do $$
declare v_n int := 0;
begin
  -- 9ב — קריאת תרגילים למחוברים בלבד; אנונימי עובר דרך public_drills
  if to_regclass('public.drills') is not null then
    execute 'drop policy if exists "drills_select_public_or_own" on public.drills';
    execute $p$
      create policy "drills_select_public_or_own" on public.drills
        for select to authenticated
        using (is_public = true or created_by = auth.uid())
    $p$;
    v_n := v_n + 1;
  end if;

  -- 11ב — הצטרפות בקוד רק דרך הפונקציה join_with_code, לא בקריאה ישירה
  if to_regclass('public.team_join_codes') is not null then
    execute 'drop policy if exists "join_codes_read" on public.team_join_codes';
    execute 'drop policy if exists "join_codes_select_any" on public.team_join_codes';
    v_n := v_n + 1;
  end if;

  raise notice '✔ 2. מתגי ההקשחה הודלקו (% חלקים)', v_n;
exception when others then
  raise notice '⚠ 2. נכשל: %', sqlerrm;
end $$;

-- אנונימי חייב להמשיך לראות תרגיל ששותף בקישור ציבורי — דרך התצוגה בלבד
do $$
begin
  if to_regclass('public.public_drills') is not null then
    execute 'grant select on public.public_drills to anon';
    raise notice '✔ 2ב. אנונימי קורא תרגילים ציבוריים רק דרך public_drills';
  else
    raise notice 'ℹ 2ב. אין תצוגת public_drills — קישור ציבורי לתרגיל יעבוד רק למחוברים';
  end if;
exception when others then
  raise notice '⚠ 2ב. נכשל: %', sqlerrm;
end $$;


-- ---------------------------------------------------------------------
-- 3. מניעת «חטיפת» תיק שחקן
-- ---------------------------------------------------------------------
-- בעברית פשוטה: לכל שחקן יש «תיק» שעובר איתו בין השנים. מי הבעלים של
-- התיק נקבע לפי שדה אחד בשורת הסגל — ואף אחד לא בדק את השדה הזה.
-- כלומר מאמן שראה במקרה מזהה של תיק (למשל מנהל מועדון, שאמור לראות
-- בלבד) יכול היה לרשום את המזהה אצלו ולקבל הרשאת **כתיבה ומחיקה**
-- על התיק של ילד של מאמן אחר.
-- הטריגר הזה מוודא שאפשר לתלות שורת סגל רק על תיק שכבר שלך.
create or replace function public.guard_roster_person_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.person_id is null then
    return new;
  end if;
  -- עדכון שלא נוגע בשדה — עובר
  if tg_op = 'UPDATE' and old.person_id is not distinct from new.person_id then
    return new;
  end if;
  -- מותר אם: אני יצרתי את התיק, או שהוא כבר תלוי על שורת סגל שלי,
  -- או שיש לי גישה מפורשת ברמת עריכה
  if exists (select 1 from public.dossier_people dp
              where dp.id = new.person_id and dp.created_by = auth.uid())
     or exists (select 1 from public.team_players tp
                 where tp.person_id = new.person_id and tp.coach_id = auth.uid()
                   and tp.id is distinct from new.id)
     or exists (select 1 from public.dossier_access da
                 where da.person_id = new.person_id and da.coach_id = auth.uid()
                   and da.level = 'edit')
  then
    return new;
  end if;
  raise exception 'לא ניתן לקשר את שורת הסגל לתיק שאינו שלך'
    using errcode = '42501';
end $$;

do $$
begin
  if to_regclass('public.dossier_people') is null then
    raise notice 'ℹ 3. אין טבלת תיקים — דילוג';
  else
    drop trigger if exists guard_roster_person_id_trg on public.team_players;
    create trigger guard_roster_person_id_trg
      before insert or update of person_id on public.team_players
      for each row execute function public.guard_roster_person_id();
    raise notice '✔ 3. שורת סגל לא יכולה יותר להיתלות על תיק של מאמן אחר';
  end if;
exception when others then
  raise notice '⚠ 3. נכשל: %', sqlerrm;
end $$;


-- ---------------------------------------------------------------------
-- 4א. מחיקת מאמן לא תמחק תיקים של מאמן אחר
-- ---------------------------------------------------------------------
-- בעברית פשוטה: התיק של ילד הוא משותף — אם שני מאמנים אימנו אותו,
-- שניהם רשמו בו. היום, אם המאמן ש**פתח** את התיק מוחק את החשבון שלו,
-- התיק נמחק ואיתו כל מה שהמאמן השני כתב. אחרי התיקון התיק נשאר,
-- ורק הסימון «מי פתח אותו» מתרוקן.
do $$
begin
  if to_regclass('public.dossier_people') is null then
    raise notice 'ℹ 4א. אין טבלת תיקים — דילוג';
  else
    alter table public.dossier_people alter column created_by drop not null;
    alter table public.dossier_people drop constraint if exists dossier_people_created_by_fkey;
    alter table public.dossier_people
      add constraint dossier_people_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
    raise notice '✔ 4א. מחיקת מאמן כבר לא מוחקת תיקים משותפים';
  end if;
exception when others then
  raise notice '⚠ 4א. נכשל: %', sqlerrm;
end $$;


-- ---------------------------------------------------------------------
-- 4ב. מאמן מושעה לא יכול לכתוב בתיקים
-- ---------------------------------------------------------------------
-- בעברית פשוטה: יש כבר מנגנון שחוסם כתיבה למי שהושעה. טבלאות התיקים
-- פשוט לא נכנסו לרשימה. עכשיו כן.
do $$
declare
  v_tables text[] := array[
    'dossier_people', 'dossier_entries', 'dossier_notes', 'dossier_access',
    'club_roles', 'personal_trainees', 'assignment_coach_marks'
  ];
  t text; v_made int := 0;
begin
  if to_regprocedure('public.is_active_user()') is null
     or to_regprocedure('public.is_banned()') is null then
    raise notice 'ℹ 4ב. פונקציות העזר חסרות — דילוג';
    return;
  end if;
  foreach t in array v_tables loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_active_gate', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated '
      || 'with check (public.is_active_user() and not public.is_banned())',
      t || '_active_gate', t
    );
    v_made := v_made + 1;
  end loop;
  raise notice '✔ 4ב. % טבלאות נוספו לחסימת מאמן מושעה', v_made;
exception when others then
  raise notice '⚠ 4ב. נכשל: %', sqlerrm;
end $$;


-- ---------------------------------------------------------------------
-- רישום + רענון
-- ---------------------------------------------------------------------
do $mig$ begin perform public.mark_migration('supabase_launch_24_8.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- הסיכום — זה מה שמעניין. תשלח לי צילום של הטבלה הזאת.
-- ---------------------------------------------------------------------
select
  'תמונות פרטיות' as "בדיקה",
  coalesce((select case when public then 'לא — עדיין ציבורי ⚠' else 'כן ✔' end
            from storage.buckets where id = 'media'), 'הדלי לא נמצא ⚠') as "תוצאה"
union all
select 'שמירת תיק מוגנת',
  case when exists (select 1 from pg_trigger
                     where tgname = 'guard_roster_person_id_trg' and not tgisinternal)
       then 'כן ✔' else 'לא ⚠' end
union all
select 'מחיקת מאמן בטוחה לתיקים',
  case when exists (select 1 from pg_constraint c
                     join pg_class t on t.oid = c.conrelid
                    where t.relname = 'dossier_people'
                      and c.conname = 'dossier_people_created_by_fkey'
                      and c.confdeltype = 'n')  -- n = set null
       then 'כן ✔' else 'לא ⚠' end
union all
select 'תרגילים סגורים לאנונימי',
  case when exists (select 1 from pg_policies
                     where tablename = 'drills'
                       and policyname = 'drills_select_public_or_own'
                       and roles = '{authenticated}')
       then 'כן ✔' else 'לא ⚠' end
union all
select 'חסימת מושעה כוללת תיקים',
  case when exists (select 1 from pg_policies
                     where tablename = 'dossier_entries'
                       and policyname = 'dossier_entries_active_gate')
       then 'כן ✔' else 'לא ⚠' end;


-- =====================================================================
-- ביטול (אם משהו נשבר) — מיידי, לא מוחק נתונים:
--
--   update storage.buckets set public = true where id = 'media';
--   drop trigger if exists guard_roster_person_id_trg on public.team_players;
--   drop policy if exists "drills_select_public_or_own" on public.drills;
--   create policy "drills_select_public_or_own" on public.drills
--     for select using (is_public = true or created_by = auth.uid());
--   notify pgrst, 'reload schema';
-- =====================================================================
