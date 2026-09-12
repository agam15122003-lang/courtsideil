-- =====================================================================
-- CourtSide — צ'ק-אין בוקר: דגל שנסגר חוזר, ו«ראיתי» לא סופר שורה ריקה
-- 12.9.2026
-- =====================================================================
-- מה זה מתקן (שני באגים שהתגלו בסקירת הפיילוט, שניהם במסד בלבד):
--
-- 1) **דגל אדום שנסגר פעם אחת לא חזר לעולם.** יש שורה אחת לילד ליום
--    (pc_player_day), והילד מעדכן את אותה שורה כל היום. ברגע שהמאמן הקיש
--    «דיברתי איתו» נכתב handled_at — ומעולם לא התאפס. תרחיש אמיתי:
--    הילד מסמן «אני חולה» → המאמן מקיש «דיברתי איתו» → הילד לוחץ «בעצם
--    אני בסדר» → בצהריים הוא מסמן «כואב · מפריע לשחק». אותה שורה,
--    handled_at כבר מלא, והדגל האדום החדש **לא מופיע אצל המאמן בכלל**
--    (CoachTodo.jsx מסנן `!c.handled_at`). אותו שורש בדיוק ב-coach_ack_at:
--    רצועת המוכנות מציגה «ראיתי» גם אחרי שהתשובה השתנתה.
--    הילד גם לא יכול לתקן את זה מצדו — ההרשאות שלו (supabase_checkins_4_9
--    שורות 107-108) לא כוללות את העמודות האלה, וטוב שכך.
--
-- 2) **«ראיתי את התקינים» סימן גם שורות ריקות.** ack_checkins סימנה כל
--    שורה לא-מסומנת של אותו יום, בלי לדרוש שיש בה בכלל תשובה. שורה ריקה
--    (מה שנשאר אחרי «בעצם אני בסדר» — sick=false ותו לא) אינה «דיווח»
--    לפי המסך (NextPractice.jsx: hasAnswer), ולכן השרת סימן שורות
--    שהלקוח לא מכיר, החזיר אותן, והמאמן קיבל «לא היה מה לסמן» בדיוק
--    כשהיה. מעכשיו שתי ההגדרות זהות.
--
-- 3) בנוסף, שורה אחת של הידוק שלא רצתה לחכות: **שלילת DELETE ישיר**
--    מ-authenticated על player_checkins. ראו סעיף 3 למטה.
--
-- בטוח להרצה חוזרת (אידמפוטנטי). הרץ אחרי #46 (supabase_checkins_4_9.sql).
-- ראו הרצת_SQL_12.9.md.
--
-- ⚠ תלות (כולן כבר בייצור):
--   public.player_checkins + public.checkins_touch() — supabase_checkins_4_9.sql
--   public.mark_migration(text)                      — supabase_migrations_ledger.sql
--
-- הלקוח שורד פרוד בלי הקובץ הזה: הכול ממשיך לעבוד בדיוק כמו היום, רק
-- עם שני הבאגים שלמעלה. אין כאן טבלה חדשה, עמודה חדשה או שינוי סכימה —
-- רק שתי פונקציות שמוחלפות ושלילת הרשאה אחת.
-- =====================================================================

do $guard$
begin
  if to_regclass('public.player_checkins') is null then
    raise exception 'public.player_checkins לא קיימת — הרץ קודם את supabase_checkins_4_9.sql (#46)';
  end if;
end $guard$;


-- ---------------------------------------------------------------------
-- 1) הטריגר: תשובה שהשתנתה פותחת מחדש את «ראיתי» ואת «דיברתי איתו»
--
--    למה בטריגר ולא בלקוח: אי אפשר בלקוח. לשחקן אין הרשאת UPDATE על
--    coach_ack_at/handled_at (זו הגנה מכוונת מ-4.9 — אחרת ילד היה מסמן
--    «טופל» על עצמו ומעלים את הדגל). הטריגר רץ כבעלים ולכן כן יכול,
--    והוא המקום היחיד שרואה גם את הערך הישן וגם את החדש.
--
--    ⚠ ההשוואה היא is distinct from על כל שש עמודות התשובה יחד: עדכון
--    שכותב את אותו ערך (הקשה חוזרת על אותו צ'יפ) **לא** מאפס כלום,
--    ופונקציות המאמן (ack_checkin/handle_checkin) לא מאפסות את עצמן —
--    הן נוגעות רק בעמודות שלהן.
-- ---------------------------------------------------------------------
create or replace function public.checkins_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();

  -- 12.9.2026 — דגל שנסגר חייב לחזור כשהתוכן משתנה. בלי זה, «דיברתי
  -- איתו» של הבוקר בולע גם את הדיווח הבא של אותו יום (אותה שורה), והמאמן
  -- לא רואה כאב שדווח אחרי הצהריים. אותו דבר ל«ראיתי» ברצועת המוכנות.
  if tg_op = 'UPDATE'
     and (new.sleep_bucket, new.energy, new.body,
          new.pain_area, new.pain_blocks, new.sick)
         is distinct from
         (old.sleep_bucket, old.energy, old.body,
          old.pain_area, old.pain_blocks, old.sick)
  then
    new.coach_ack_at := null;
    new.coach_ack_by := null;
    new.handled_at   := null;
    new.handled_by   := null;
  end if;

  return new;
end $$;

-- הטריגר עצמו כבר קיים מ-#46 ומצביע על הפונקציה בשם — החלפת גוף
-- הפונקציה מספיקה. מוגדר כאן מחדש רק ליתר ביטחון (idempotent).
drop trigger if exists checkins_touch_trg on public.player_checkins;
create trigger checkins_touch_trg before update on public.player_checkins
  for each row execute function public.checkins_touch();


-- ---------------------------------------------------------------------
-- 2) «ראיתי את התקינים» — רק שורות שיש בהן באמת תשובה
--
--    התנאי החדש זהה ל-hasAnswer בלקוח. את הענף `sick = true` שיש שם
--    אין צורך להוסיף: הפונקציה ממילא מסמנת רק שורות `sick = false`
--    (שורה של ילד חולה נסגרת בטאפ פרטני, לא בסימון גורף).
-- ---------------------------------------------------------------------
create or replace function public.ack_checkins(p_team text, p_date date)
returns setof uuid
language sql security definer set search_path = public as $$
  update public.player_checkins
     set coach_ack_at = now(), coach_ack_by = auth.uid()
   where coach_id = auth.uid() and team = p_team and checkin_date = p_date
     and coach_ack_at is null and player_id is not null
     and sick = false
     and pain_blocks is not true
     and coalesce(sleep_bucket, 5) > 1
     -- 12.9.2026 — שורה בלי אף תשובה אינה «דיווח» (כך בדיוק ברצועת
     -- המוכנות). בלי התנאי הזה השרת סימן שורות שהמסך לא סופר, והמאמן
     -- ראה «הכול כבר היה מסומן» בדיוק כשהוא סימן משהו.
     and (sleep_bucket is not null or energy is not null or body is not null)
  returning player_id;
$$;
revoke all on function public.ack_checkins(text, date) from public, anon;
grant execute on function public.ack_checkins(text, date) to authenticated;


-- ---------------------------------------------------------------------
-- 3) שלילת DELETE ישיר על player_checkins
--
--    supabase_checkins_4_9.sql שלל `insert, update` בלבד, והמדיניות
--    pc_player_own היא `for all` — כלומר קטין שסימן «חולה» או «כאב
--    שמפריע» ורוצה שהמאמן לא יראה יכול פשוט למחוק את השורה בקריאת API
--    ישירה, והדגל נעלם בלי עקבה. אין בלקוח שום מחיקה ישירה של
--    player_checkins (נבדק ב-grep על src/ ב-12.9), ולכן השלילה לא
--    שוברת שום מסך.
--
--    זכות המחיקה של הילד **נשמרת במלואה** — דרך delete_my_checkins(),
--    שהיא security definer ולכן אינה נפגעת מהשלילה.
--
--    ⚠ זו חצי מהעבודה. הפיצול של pc_player_own לשלוש מדיניות ושורת
--    היומן המסכמת ב-delete_my_checkins נמצאים ב-supabase_pilot_fixes_6_9.sql
--    סעיף 3, וגם אותו צריך להריץ (הרצת_SQL_12.9.md שלב 2). השורה כאן
--    חוזרת עליו בכוונה כי היא זו שסוגרת את הפרצה בפועל, והיא בת שורה
--    אחת — כדי שהפרצה תיסגר גם אם רק הקובץ הזה ירוץ. הרצת שני הקבצים
--    בכל סדר שהוא בטוחה.
-- ---------------------------------------------------------------------
revoke delete on public.player_checkins from authenticated;
revoke delete on public.player_checkins from anon;


-- ---------- רישום + רענון ----------
do $mig$ begin perform public.mark_migration('supabase_checkin_flags_12_9.sql'); exception when undefined_function then null; end $mig$;

notify pgrst, 'reload schema';

-- =====================================================================
-- ביטול (אם צריך) — חזרה מדויקת למצב שלפני, סעיף-סעיף:
--
-- 1) הטריגר (מחזיר את הגרסה מ-supabase_checkins_4_9.sql):
--    create or replace function public.checkins_touch()
--    returns trigger language plpgsql as $$
--    begin new.updated_at := now(); return new; end $$;
--
-- 2) «ראיתי את התקינים» — להריץ מחדש את הבלוק
--    `create or replace function public.ack_checkins` מתוך
--    supabase_checkins_4_9.sql (שורות 138-151) כמות שהוא.
--
-- 3) החזרת זכות המחיקה (לא מומלץ — זו פרצה):
--    grant delete on public.player_checkins to authenticated;
--
-- ואחרי כל ביטול:  notify pgrst, 'reload schema';
-- =====================================================================
