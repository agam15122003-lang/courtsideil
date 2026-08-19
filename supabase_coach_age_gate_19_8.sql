-- =====================================================================
-- CourtSide — שער «מאמן קטין»: להפוך אותו מהצהרה לאכיפה  ·  19.8.2026
-- =====================================================================
-- מה היה עד היום, בשפה של מסך:
--   הטריגר game_block_minor_coach (supabase_game_legal_12_8.sql) נכתב כדי
--   לחסום קטין שנרשם כ«מאמן» ובכך עוקף את כל שער הקטינים. אבל מסך
--   הפרופיל **מעולם לא אסף תאריך לידה ממאמן** — כל פרופיל מאמן הגיע
--   למסד עם birth_date=null, ולכן שני ענפי החסימה היו no-op ב-100%
--   מהמקרים. המערכת הבטיחה «מאמנים הם בגירים» ולא בדקה אף פעם.
--
--   הפרונט תוקן ב-19.8: יש שדה תאריך לידה בענף המאמן, הוא נשלח למסד,
--   וקטין נחסם כבר במסך. הקובץ הזה סוגר את הצד השרתי.
--
-- מה נוסף כאן, ורק זה:
--   1. עמודה **חדשה** game_settings.coach_birthdate_required (ברירת
--      מחדל false). לא נוגעים ב-require_coach_birthdate הישנה — ראו §0.
--   2. גרסה מתוקנת של game_block_minor_coach: ענף «לא הצהיר בכלל»
--      דורש גם שם מלא, כדי שהשורה הריקה שנוצרת בהרשמה עצמה
--      (handle_new_user מכניס profiles(id) בלבד, role מקבל ברירת מחדל
--      'coach') לא תיחסם ותפיל את כל ההרשמה.
--
-- §0 למה עמודה חדשה ולא הישנה — זו לא קפדנות, זו מלכודת אמיתית:
--   הדלקת require_coach_birthdate כמו שהיא **שוברת כל הרשמה חדשה**,
--   כי בענף ב' של הגרסה הישנה אין דרישת שם. אם נדליק את הישנה ואחר כך
--   מישהו יריץ שוב את supabase_game_legal_12_8.sql (וזה מה שמסמכי
--   ההרצה אומרים לעשות כשקובץ נכשל), הגוף הישן חוזר בשקט — והמתג
--   נשאר דלוק, כי `add column if not exists ... default false` לא מאפס
--   ערך קיים. התוצאה: כל הרשמה בפרוד מתה, בלי שאף שורת קוד השתנתה.
--   עם עמודה חדשה, הרצה חוזרת של הקובץ הישן מחזירה גוף שקורא עמודה
--   שנשארה false — כלומר השער נכבה. כיבוי הוא לא נעים; השבתת הרשמה
--   היא אסון. בוחרים בכיוון שנכשל בצורה בטוחה.
--   ⚠ אם הרצת שוב את supabase_game_legal_12_8.sql — הרץ שוב גם את זה.
--
-- מה הקובץ **לא** עושה:
--   · לא נוגע במאמנים קיימים. הטריגר חוסם רק בהשלמת פרופיל ראשונה,
--     בדיוק כמו קודם. מאמן ותיק בלי תאריך לידה ממשיך לעבוד ולערוך.
--     אכיפה רטרואקטיבית היא החלטה של הבעלים, לא תופעת לוואי של קובץ.
--   · לא מוחק ולא משנה אף נתון קיים.
--
-- בטוח להרצה חוזרת. הרצה: Supabase → SQL Editor → הדבקה → Run.
-- ביטול מלא: update public.game_settings set coach_birthdate_required = false;
--            (החסימה על קטין **מוצהר** נשארת — היא לא תלויה במתג)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) המתג החדש. עטוף: אם מיגרציית עולם המשחק טרם רצה, ALTER על טבלה
--    שאינה קיימת מפיל את כל הקובץ.
-- ---------------------------------------------------------------------
do $rq$
begin
  if to_regclass('public.game_settings') is not null then
    alter table public.game_settings
      add column if not exists coach_birthdate_required boolean not null default false;
  end if;
end $rq$;


-- ---------------------------------------------------------------------
-- 2) הטריגר המתוקן
--    ההבדל היחיד מהגרסה של 12.8: ענף ב' קורא את העמודה החדשה **וגם**
--    דורש שם מלא. ענף א' (קטין מוצהר) לא נגעתי בו — הוא כבר נכון,
--    ומהיום הוא סוף־סוף מקבל נתון לעבוד איתו.
-- ---------------------------------------------------------------------
create or replace function public.game_block_minor_coach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_completing boolean; v_age int; v_require boolean;
begin
  -- ⚠ profiles.role הוא text בלי CHECK, ומדיניות העדכון על הפרופיל אינה
  -- מגבילה את הערך — כלומר משתמש יכול לכתוב לעצמו כל מחרוזת. האפליקציה
  -- מתייחסת לכל מה שאינו 'player' כמאמן, אבל שני השערים בדקו שוויון
  -- מדויק: השער כאן על 'coach', ושער ההסכמות של הקטינים על 'player'.
  -- מחרוזת שלישית ('Coach', 'coach ') הייתה חומקת בין שניהם — קטין בלי
  -- אישור הורה ובלי בדיקת גיל. נרמול כאן, לפני כל החלטה.
  new.role := case when new.role = 'player' then 'player' else 'coach' end;

  -- «הפרופיל מושלם עכשיו»: יצירה, או המעבר הראשון משם ריק לשם מלא.
  -- ⚠ חייב להישאר IF ולא ביטוי אחד עם OR: ב-INSERT הרשומה OLD אינה
  -- מוקצית, ו-plpgsql מעריך את הביטוי כולו — «record old is not
  -- assigned yet» היה מפיל כל יצירת פרופיל. אין קיצור מסלול ב-OR.
  if tg_op = 'INSERT' then
    v_completing := true;
  else
    v_completing := coalesce(old.first_name, '') = ''
                and coalesce(new.first_name, '') <> '';
  end if;

  -- אחרי הנרמול יש בדיוק שני ערכים, ולכן «כל מי שאינו שחקן» = מאמן.
  if not v_completing or new.role = 'player' then
    return new;
  end if;

  v_age := public.minor_age(new.birth_date, new.birth_year);

  -- א. הצהיר על גיל, והגיל מעיד על קטין — חסימה מוחלטת, בלי מתג.
  if v_age is not null and v_age < 18 then
    raise exception 'חשבון מאמן מיועד לבגירים (18+). אם אתה שחקן — חזור אחורה ובחר «שחקן».'
      using errcode = '55000';
  end if;

  -- ב. לא הצהיר בכלל — נדרש רק כשהמתג החדש דלוק, **ורק על שורה עם שם**.
  --    השורה הריקה שנוצרת ברגע ההרשמה (handle_new_user: insert into
  --    profiles(id), role מקבל default 'coach') חייבת לעבור — אחרת
  --    החריגה מתגלגלת דרך on_auth_user_created ומבטלת את יצירת המשתמש.
  select coalesce(g.coach_birthdate_required, false) into v_require
    from public.game_settings g where g.id;

  if coalesce(v_require, false) and v_age is null
     and coalesce(new.first_name, '') <> '' then
    raise exception 'חשבון מאמן מחייב תאריך לידה (אימות גיל).'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

-- הטריגר עצמו כבר קיים מ-12.8 ו-create or replace שומר על הקישור;
-- יוצרים מחדש רק אם מסיבה כלשהי הוא נמחק.
do $tg$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'game_block_minor_coach_trg'
       and tgrelid = 'public.profiles'::regclass
  ) then
    create trigger game_block_minor_coach_trg
      before insert or update on public.profiles
      for each row execute function public.game_block_minor_coach();
  end if;
end $tg$;

comment on function public.game_block_minor_coach() is
  'חוסם קטין שנרשם כ«מאמן». גרסת 19.8: ענף «לא הצהיר» קורא את '
  'coach_birthdate_required (ולא את require_coach_birthdate, שנשארת false '
  'בכוונה כדי שהרצה חוזרת של הקובץ מ-12.8 תכבה את השער במקום להשבית '
  'הרשמה), ודורש שם מלא כדי שהשורה הריקה של handle_new_user תעבור.';


-- ---------------------------------------------------------------------
-- 3) רישום ביומן ההרצות + רענון הסכימה
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.mark_migration('supabase_coach_age_gate_19_8.sql');
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
--  אימות אחרי ההרצה — **בדיקה אחת, בטוחה, שלא משנה כלום:**
--
--       select coach_birthdate_required, require_coach_birthdate
--         from public.game_settings;        -- אמור לחזור: false, false
--
--  שתי השורות false פירושן: הקובץ רץ, והשער עדיין כבוי. זהו.
--
--  ⚠ מה שהיה כאן קודם ונמחק בכוונה: בדיקה שהדליקה את המתג, יצרה שורת
--    פרופיל, והציעה `delete from public.profiles where first_name is
--    null` לניקוי. שלוש מלכודות בשורה אחת — היא משאירה את השער דלוק
--    בפרוד לפני שהפרונט עלה, היא כותבת לטבלה חיה, וה-DELETE הזה מוחק
--    **כל משתמש אמיתי שנרשם ועוד לא מילא פרופיל**. מסמך הרצה לא נותן
--    לבעלים פקודת מחיקה בלי סינון. הענף שהיא ניסתה לבדוק (השורה הריקה
--    של handle_new_user) מכוסה בתנאי `coalesce(new.first_name,'') <> ''`
--    שכתוב למעלה, ואפשר לקרוא אותו בעיניים.
--
--  להדליק את השער — **רק אחרי שהפרונט של 19.8 באוויר**:
--       update public.game_settings set coach_birthdate_required = true;
--
--  ואז, כדי לוודא שההרשמה לא נשברה: להיכנס למסך ההרשמה באתר עצמו,
--  לפתוח חשבון בדיקה, ולמחוק אותו אחר כך לפי המזהה שלו. בדיקה דרך
--  המסך היא הבדיקה האמיתית; SQL על טבלה חיה הוא סיכון מיותר.
-- =====================================================================
