-- =====================================================================
--  CourtSide — פתיחת המבוי הסתום בהסכמת ההורים
--  נכתב 4.8.2026 · הרץ אחרי supabase_parent_consent.sql · אידמפוטנטי
--
--  ⚠ supabase_parent_consent.sql כבר רץ בפרודקשן. אין לערוך אותו.
--    כל תיקון מגיע כקובץ חדש — זה הקובץ.
--
--  ------------------------------------------------------------------
--  המבוי הסתום (התגלה בבדיקה חיה, 4.8.2026)
--  ------------------------------------------------------------------
--  הורה אישר 'basic' וסירב במכוון להסכמות המדיה. עכשיו הוא רוצה לשנות
--  את דעתו — ואין שום דרך:
--    · create_consent_request דוחה purpose='manage' על הסף
--      ('manage_not_allowed', supabase_parent_consent.sql ~714) — כלומר
--      קישור ניהול לא ניתן להנפקה מחדש לעולם.
--    · submit_parent_consent חוסם שדרוג של סעיף רשות מ-'denied'
--      ל-'granted' דרך טוקן 'initial' ('upgrade_requires_manage', ~948).
--    · אין שום פונקציית אדמין שמַעניקה הסכמה — רק admin_revoke_consent
--      שמבטלת.
--    · ל-PlayerDashboard אין בכלל כרטיס הסכמות, כלומר לשחקן אין ממשק
--      לשלוח משהו להורה מחדש.
--  התוצאה: אם ההורה איבד (או מעולם לא קיבל) את קישור הניהול — המשפחה
--  נעולה לנצח על ההחלטה הראשונה. זה בלתי קביל במערכת שכל הבסיס המשפטי
--  שלה הוא שהורה רשאי לחזור בו בכל עת (סעיף 8-9 במסמך א').
--
--  ------------------------------------------------------------------
--  למה הנפקה מחדש של קישור ניהול היא לא ויתור אבטחתי
--  ------------------------------------------------------------------
--  הקוד עצמו כבר מודה בזה. ההערה ב-supabase_parent_consent.sql ~1033
--  אומרת במפורש על מנגנון ה-self-submission שהוא «חיכוך, לא בקרה —
--  גלישה בסתר או התנתקות עוקפות אותו».
--
--  ההגנה שבאמת מחזיקה היא **נעילת מייל ההורה**: ברגע שנרשמה הכרעה
--  בסיסית כלשהי (granted / denied / revoked), הקטין כבר לא יכול לשנות
--  את guardian_email — לא דרך create_consent_request ('email_locked',
--  ~768) ולא דרך UPDATE ישיר (הטריגר enforce_minor_consent, ~483).
--  לכן קישור ניהול שמונפק מחדש הולך *תמיד* לאותו הורה שכבר הכריע פעם
--  אחת. חסימת ההנפקה לא מוסיפה שום אבטחה — היא רק יוצרת את המבוי הסתום.
--
--  ------------------------------------------------------------------
--  מה הקובץ הזה מוסיף
--  ------------------------------------------------------------------
--   1) request_manage_link()  — הקטין המחובר מנפיק קישור ניהול חדש
--      להורה שכבר רשום. בלי פרמטרים בכלל: אי אפשר להסיט אותו למייל אחר.
--   2) admin_set_consent()    — רשת הביטחון האנושית: אדמין קובע ערך
--      להסכמה בודדת (למשל אחרי בירור טלפוני עם ההורה).
--   3) create_consent_request — **לא נגענו בה**. ההנמקה המלאה בסעיף 3.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1) request_manage_link() — הנפקה מחדש של קישור הניהול
--
--  נקראת בידי **הקטין המחובר**, ומחזירה טוקן שהוא מעביר להורה באותו
--  ערוץ שבו העביר את הקישור הראשון (וואטסאפ — אין בפרויקט שום תשתית
--  מייל בצד שרת).
--
--  שלוש הקפדות שהופכות את זה לבטוח:
--   (א) אין פרמטר מייל. בכלל. ההורה נלקח מ-guardians, כלומר מהרשומה
--       שכבר ננעלה. זו הסיבה היחידה שההנפקה מחדש אינה חור אבטחה, ולכן
--       אסור להוסיף כאן פרמטר כזה גם בעתיד.
--   (ב) דורשת שכבר נרשמה הכרעה בסיסית כלשהי. לפני ההכרעה הראשונה
--       המסלול הנכון הוא create_consent_request('initial') — קישור
--       ניהול לחשבון שאיש לא אישר מעולם היה עוקף את כל זרימת האישור.
--   (ג) הגבלת קצב נפרדת משלה (5 ל-24 שעות), שנספרת רק על בקשות
--       'manage' ולכן לא מרעיבה את מסלול ה-'initial' ולהפך.
--
--  ועובדת גם על חשבון מושעה — וזה מכוון: הורה שביטל הסכמה חייב לקבל
--  דרך לחזור בו ולהחזיר את הילד לפעילות. חסימת מושעים כאן הייתה
--  משחזרת בדיוק את המבוי הסתום, רק במקום אחר.
--
--  חוזה התשובות מול הפרונט (src/consent.js):
--    {ok:true, token, expires_at, guardian_email}
--    'not_authenticated' · 'not_a_player' · 'no_guardian' ·
--    'no_prior_consent' · 'rate_limited'
--  guardian_email חוזר בכוונה: ה-UI חייב להגיד לשחקן למי בדיוק הקישור
--  מיועד, כדי שיהיה מובן מאליו שאי אפשר להפנות אותו למישהו אחר.
-- ---------------------------------------------------------------------
create or replace function public.request_manage_link()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_basic text;
  v_g     public.guardians%rowtype;
  v_cnt   int;
  v_token text;
  v_exp   timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select p.role into v_role from public.profiles p where p.id = v_uid;
  if coalesce(v_role, '') <> 'player' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_player');
  end if;

  -- ההורה נלקח מהרשומה, אף פעם לא מהלקוח (ראה הקפדה א' למעלה)
  select * into v_g from public.guardians g where g.minor_id = v_uid;
  if v_g.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_guardian');
  end if;

  -- latest_consent ולא has_consent: אחרי ביטול has_consent מחזירה false,
  -- ואז הורה שביטל היה מאבד את הדרך לחזור בו — זה בדיוק המבוי הסתום
  -- שהקובץ הזה בא לפתוח. כל הכרעה שהיא (granted/denied/revoked) מספיקה.
  v_basic := public.latest_consent(v_uid, 'basic');
  if v_basic is null then
    return jsonb_build_object('ok', false, 'reason', 'no_prior_consent');
  end if;

  -- הגבלת קצב על 'manage' בלבד. הספירה ב-create_consent_request סופרת
  -- את כל השורות ללא הבחנת purpose, ולכן ספירה משותפת כאן הייתה גורמת
  -- להנפקות ניהול לחסום בקשות initial לגיטימיות (ולהפך).
  select count(*) into v_cnt
    from public.consent_requests cr
   where cr.minor_id = v_uid
     and cr.purpose  = 'manage'
     and cr.created_at > now() - interval '24 hours';
  if v_cnt >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- סימון הבקשות הישנות כמוחלפות.
  --
  -- שים לב מה זה עושה ומה לא: get_consent_request ו-submit_parent_consent
  -- בודקות used_at אך ורק כש-purpose='initial' (שורות ~850 ו-~915 בקובץ
  -- המקורי), ולכן הסימון כאן הוא **רישום ולא ביטול** — קישור ניהול ישן
  -- שההורה שמר אצלו ממשיך לעבוד.
  -- זה מכוון ולא פספוס: כדי לבטל אותו באמת היה צריך expires_at = now(),
  -- וזה היה נותן לקטין נשק — ספאם של הנפקות מחדש שמכבה את הקישור השמור
  -- של ההורה בלי למסור לו אף פעם את החדש, כלומר שלילת הפיקוח ההורי.
  -- ריבוי טוקנים חיים אינו סיכון: כולם נמסרו לאותו הורה נעול.
  update public.consent_requests
     set used_at = now()
   where minor_id = v_uid
     and purpose  = 'manage'
     and used_at is null
     and expires_at > now();

  v_exp   := now() + interval '365 days';
  v_token := public.new_consent_token();

  -- רק ה-sha256 נשמר. מי שמחזיק את הקישור מחזיק את הסוד; דליפת המסד
  -- אינה מאפשרת להתחזות להורה.
  insert into public.consent_requests (minor_id, guardian_id, token_hash, purpose, expires_at)
  values (v_uid, v_g.id, public.consent_token_hash(v_token), 'manage', v_exp);

  return jsonb_build_object('ok', true,
                            'token',          v_token,
                            'expires_at',     v_exp,
                            'guardian_email', v_g.email);
end;
$$;

revoke all on function public.request_manage_link() from public, anon;
grant execute on function public.request_manage_link() to authenticated;


-- ---------------------------------------------------------------------
--  2) admin_set_consent(minor, type, value) — רשת הביטחון האנושית
--
--  למקרה שהמשפחה איבדה את הקישור לגמרי, או שההורה מעדיף לסדר את זה
--  בטלפון. משלימה את admin_revoke_consent, שידעה רק לבטל.
--
--  שלושה עקרונות:
--   · גרסאות הנוסח נקראות מהמסד (consent_documents) ולא מהלקוח, בדיוק
--     כמו ב-submit_parent_consent — רשומת ראיה שמצטטת גרסה שהלקוח שלח
--     אינה ראיה.
--   · source='admin', כדי שביומן ההסכמות לא תיראה הרשומה כאישור שההורה
--     נתן בעצמו דרך הקישור.
--   · תופעות הלוואי על approval_status זהות בדיוק לאלה של
--     submit_parent_consent, כולל **אותו טקסט reason** בבקשת המחיקה —
--     אחרת לוגיקת הביטול-באישור-מחדש (parent_consent ~1005) תפסיק
--     להתאים, ובקשת מחיקה תישאר תלויה על חשבון פעיל.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_consent(p_minor uuid, p_type text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc     text;
  v_terms   text;
  v_privacy text;
  v_gid     uuid;
  v_exists  boolean;
begin
  if not public.is_admin() then
    raise exception 'למנהלים בלבד';
  end if;
  if p_type is null or p_type not in ('basic', 'media_team', 'media_public', 'marketing') then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;
  if p_value is null or p_value not in ('granted', 'denied', 'revoked') then
    return jsonb_build_object('ok', false, 'reason', 'bad_value');
  end if;

  select true into v_exists from public.profiles where id = p_minor;
  if not coalesce(v_exists, false) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select version into v_doc     from public.consent_documents where id = 'doc_a';
  select version into v_terms   from public.consent_documents where id = 'terms';
  select version into v_privacy from public.consent_documents where id = 'privacy';

  -- ההורה מקושר לרשומה אם הוא קיים. admin_revoke_consent משאירה null,
  -- וזה חוסר: יומן שלא אומר על איזה הורה מדובר קשה יותר לבדיקה בדיעבד.
  select g.id into v_gid from public.guardians g where g.minor_id = p_minor;

  insert into public.consents (minor_id, guardian_id, consent_type, value,
                               terms_version, privacy_version, doc_version, source, note)
  values (p_minor, v_gid, p_type, p_value, v_terms, v_privacy, v_doc, 'admin',
          format('admin_set_consent · %s=%s', p_type, p_value));

  -- ---- תופעות הלוואי, רק על 'basic' ----
  if p_type = 'basic' then
    -- הטריגר על profiles דוחה שינוי approval_status מכל כותב שאינו
    -- מורשה. is_admin() לבדה כבר מספיקה שם, אבל הסימון נשאר כדי שכל
    -- ה-RPCs ייראו אותו דבר — ולכן גם האיפוס חייב לרוץ תמיד, גם בכשל.
    perform set_config('app.consent_writer', 'on', true);
    begin
      if p_value = 'granted' then
        update public.profiles
           set approval_status = 'active', updated_at = now()
         where id = p_minor;

        -- אישור מחדש סוגר את בקשת המחיקה שנוצרה בביטול הקודם. הטקסט
        -- חייב להישאר מילה במילה זהה לזה שב-submit_parent_consent
        -- ובענף ה-'revoked' שלמטה. השוואת שוויון ולא LIKE: בקשת מחיקה
        -- שהשחקן הגיש בעצמו (reason ריק) לא תבוטל מאחורי גבו.
        update public.account_deletion_requests
           set status = 'cancelled'
         where user_id = p_minor
           and status  = 'pending'
           and reason  = 'ביטול הסכמת הורה דרך קישור הניהול';

      elsif p_value = 'revoked' then
        update public.profiles
           set approval_status = 'suspended', updated_at = now()
         where id = p_minor;

        -- ביטול ההסכמה הבסיסית = בקשת מחיקת חשבון, לפי סעיף 9 במסמך א'
        insert into public.account_deletion_requests (user_id, reason)
        select p_minor, 'ביטול הסכמת הורה דרך קישור הניהול'
         where not exists (
           select 1 from public.account_deletion_requests adr
            where adr.user_id = p_minor and adr.status = 'pending'
         );

      else  -- 'denied'
        update public.profiles
           set approval_status = 'pending_parent', updated_at = now()
         where id = p_minor;
      end if;
    exception when others then
      perform set_config('app.consent_writer', 'off', true);
      raise;
    end;
    perform set_config('app.consent_writer', 'off', true);
  end if;

  return jsonb_build_object('ok', true,
                            'state',           public.consent_state(p_minor),
                            'approval_status', (select approval_status
                                                  from public.profiles where id = p_minor));
end;
$$;

revoke all on function public.admin_set_consent(uuid, text, text) from public, anon;
grant execute on function public.admin_set_consent(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------
--  3) create_consent_request — הוחלט **לא** לגעת בה
--
--  השיקול המקורי היה להגדיר אותה מחדש כאן ב-CREATE OR REPLACE, ולהחליף
--  רק את הענף שמחזיר 'manage_not_allowed' בהפניה ל-request_manage_link().
--  ההחלטה היא לא לעשות את זה, ומהסיבות הבאות:
--
--   (א) הרווח התפקודי הוא אפס. request_manage_link() כבר נותנת לפרונט
--       מסלול נקי ומלא, ואף קורא בקוד לא מבקש purpose='manage' —
--       src/consent.js:78 מעביר purpose רק כפרמטר, וכל הקוראים שולחים
--       'initial'. הענף שנשאר הוא קוד מת שמחזיר הודעה נכונה.
--
--   (ב) המחיר הוא סיכון ממשי. הפונקציה היא ~145 שורות שמריצות עכשיו
--       את זרימת ההרשמה של כל קטין בפרודקשן: נעילת המייל, המראה
--       לעמודות ה-guardian_* הישנות שהפרונט שבפרוד עדיין קורא מהן,
--       חלון ה-72 שעות, ה-already_consented שמושתק בכל שמירת פרופיל,
--       וחמש מחרוזות reason שהפרונט ממפה. שכפול ידני של כל זה לקובץ
--       שני יוצר גם סיכון להעתקה שגויה עכשיו, וגם סיכון קבוע להתפצלות:
--       מי שיתקן בעתיד את הקובץ המקורי לא ידע שיש כאן עותק שדורס אותו
--       בהרצה מאוחרת יותר.
--
--   (ג) הכלל של הפרויקט הוא שתיקון מגיע כקובץ חדש. דריסת פונקציה
--       שלמה מקובץ אחר הופכת את סדר ההרצה בין הקבצים למשמעותי — וזה
--       בדיוק סוג התלות שהקבצים האידמפוטנטיים כאן נבנו כדי להימנע ממנה.
--
--  לכן 'manage_not_allowed' נשאר בתוקף בפונקציה המקורית, והוא נכון גם
--  כהצהרה: קישור ניהול אכן לא נוצר דרך הנתיב ההוא. הנתיב הנכון הוא
--  request_manage_link(), שהיא הפונקציה היחידה שגם נועלת את ההורה וגם
--  דורשת שכבר קיימת הכרעה קודמת.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
--  4) רענון סכימת ה-API + רישום בלדג'ר
-- ---------------------------------------------------------------------
do $mig$
begin
  begin
    perform public.mark_migration('supabase_consent_manage_fix.sql');
  exception when others then null;
  end;
end $mig$;

notify pgrst, 'reload schema';


-- =====================================================================
--  בדיקת עשן אחרי ההרצה
--
--  הכנה — קח את המזהים שאתה עובד איתם:
--    select id, first_name, approval_status from public.profiles
--     where role = 'player' order by created_at desc limit 5;
--    -- <uid> = הקטין שההורה שלו סירב למדיה
--    select public.consent_state('<uid>');
--    -- אמור להראות basic:granted, media_public:denied
--
--  1) הנפקה מחדש של קישור הניהול (מהקונסולה, מחובר **כקטין עצמו**):
--       await supabase.rpc('request_manage_link')
--     → {ok:true, token, expires_at, guardian_email}
--     · expires_at כשנה קדימה.
--     · guardian_email חייב להיות המייל של ההורה שכבר אישר — אם מופיע
--       שם מייל אחר, משהו שבור בנעילה ואסור להמשיך.
--     הקישור להורה: https://courtsideil.vercel.app/#/consent/<token>
--
--  2) הקישור באמת עובד ובאמת 'manage' (גם בלי התחברות, בחלון פרטי):
--       await supabase.rpc('get_consent_request', { p_token: '<token>' })
--     → {ok:true, purpose:'manage', state:{...}}
--     ועכשיו השדרוג שהיה חסום עד היום:
--       await supabase.rpc('submit_parent_consent',
--         { p_token:'<token>', p_decisions:{ media_public:'granted' } })
--     → {ok:true}. בקישור initial אותה קריאה מחזירה
--       'upgrade_requires_manage' — זה ההבדל, וזה מה שנפתח.
--
--  3) *הבדיקה החשובה* — אי אפשר להסיט את הקישור להורה אחר.
--     לפונקציה אין בכלל פרמטר מייל, ולכן זו בדיקה בשני חלקים:
--       await supabase.rpc('request_manage_link', { p_email:'kid@example.com' })
--     → שגיאה PGRST202 (אין פונקציה כזו עם הפרמטר) — לא מסלול עוקף.
--       await supabase.rpc('create_consent_request',
--         { p_name:null, p_email:'kid@example.com', p_phone:null,
--           p_relation:'parent', p_purpose:'initial' })
--     → {ok:false, reason:'email_locked'}
--     ולבסוף, מחשבון הקטין:
--       await supabase.from('guardians').update({ email:'kid@example.com' })
--         .eq('minor_id', uid)
--     → נכשל (אין policy כתיבה על guardians).
--
--  4) הגבלת הקצב וההגנות סביבה (מחשבון הקטין):
--       6 קריאות רצופות ל-request_manage_link  → השישית 'rate_limited'
--       מחשבון מאמן                              → 'not_a_player'
--       מקטין שאף הורה לא הכריע עליו עדיין       → 'no_prior_consent'
--         (זה נכון: שם המסלול הוא create_consent_request עם 'initial')
--       מקטין מושעה (ההורה ביטל)                 → {ok:true} — **בכוונה**.
--         זו הנקודה שמחזירה הורה שחזר בו; אם כאן חוזר 'suspended',
--         המבוי הסתום נסגר שוב.
--
--  5) אדמין הופך סירוב מדיה לאישור (מחשבון אדמין):
--       select public.admin_set_consent('<uid>', 'media_public', 'granted');
--     → ok:true, ובתוך state המפתח media_public הפך ל-'granted'.
--       select public.has_consent('<uid>', 'media_public');   -- true
--       select value, source, doc_version, note
--         from public.consents
--        where minor_id = '<uid>' and consent_type = 'media_public'
--        order by created_at desc limit 1;
--     → source='admin', doc_version מלא (נקרא מהמסד), note מסביר.
--     מחשבון רגיל אותה קריאה חייבת ליפול על «למנהלים בלבד».
--
--  6) שינוי המדיה באמת משנה נראוּת (זו כל הפואנטה).
--     has_consent מזינה את media_consent_ok, וזו מזינה את מדיניות
--     ה-storage ב-supabase_private_media.sql:
--       select public.media_consent_ok('<uid>', 'media_public', false);
--     → false לפני הקריאה בסעיף 5, true אחריה.
--     ואימות חי: קובץ בבאקט 'media' תחת התיקייה של <uid> — נסה למשוך
--     אותו בחלון פרטי (anon). לפני האישור הוא חסום, אחריו נטען.
--     בכיוון ההפוך:
--       select public.admin_set_consent('<uid>', 'media_team', 'revoked');
--     → גם משתמש מחובר מפסיק לראות אותו.
--
--  7) תופעות הלוואי של 'basic' זהות לאלה של הקישור (סעיף 8ב במקור):
--       select public.admin_set_consent('<uid>', 'basic', 'revoked');
--       select approval_status from public.profiles where id = '<uid>';
--     → 'suspended'
--       select status, reason from public.account_deletion_requests
--        where user_id = '<uid>' order by created_at desc limit 1;
--     → pending · 'ביטול הסכמת הורה דרך קישור הניהול'
--       select public.admin_set_consent('<uid>', 'basic', 'granted');
--     → approval_status חוזר ל-'active', ואותה שורת מחיקה הפכה
--       ל-'cancelled'. אם היא נשארה 'pending' — הטקסט לא תואם, ותקן.
--       select public.admin_set_consent('<uid>', 'basic', 'denied');
--     → 'pending_parent'
--
--  8) היומן נשאר ראיה גם אחרי כל זה — שתי השורות האלה חייבות להיכשל:
--       update public.consents set value = 'granted';
--       delete from public.consents;
--
--  9) המיגרציה נרשמה:
--       select * from public.schema_migrations
--        where filename = 'supabase_consent_manage_fix.sql';
-- =====================================================================
