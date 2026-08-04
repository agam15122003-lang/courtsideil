# CourtSide — דוח סקירה מלא (3.8.2026)

דוח זה מסכם סקירת עומק של פרויקט CourtSide (`C:/Users/AGAM/Downloads/pinkas-hamaman`) שבוצעה על-ידי שישה סוכני-תחום במקביל: אבטחת Supabase/RLS, אבטחת צד-לקוח וסודות, ביצועים, מוכנות לעטיפת Capacitor, איכות קוד/RTL/נגישות, ודין פרטיות וקטינים. הממצאים אוחדו, כפילויות בין תחומים מוזגו, וכל ממצא מדורג לפי חומרה עם תיקון מוצע. **שורה תחתונה:** המוצר בשל מבחינת חוויה ועיצוב, אבל שכבת ה-RLS ומנגנון הסכמת ההורים אינם מוכנים לקטין אמיתי — 5 ממצאים קריטיים ו-20 גבוהים חייבים להיסגר לפני שמשתמש ראשון נכנס.

---

## תמצית מנהלים

1. **כל משתמש רשום יכול לשלואת המאגר המלא של הקטינים** — `profiles_select_authenticated` נשארה `USING(true)` (supabase_stage2.sql:68); שם, תמונה, עמדה ומועדון של כל ילד בפלטפורמה בקריאת REST אחת.
2. **כל מבוגר יכול לשלוח הודעה פרטית לכל קטין** — ל-`messages_insert_own` אין בדיקת קשר קבוצתי (supabase_messages.sql:53). בשילוב עם (1) זה וקטור grooming קלאסי.
3. **הרשמה פתוחה ללא שער** — `signInWithOtp` בלי `shouldCreateUser:false` (src/Auth.jsx:184) מאפשרת חשבון authenticated מלא במייל חד-פעמי, ומורידה את מחיר הניצול של כל האמור לעיל לאפס.
4. **הסכמת ההורה נכתבת בידי הקטין עצמו** — הקליינט כותב `guardian_consent_at` ישירות (src/ProfileForm.jsx:119), שנת הלידה חופשית לעריכה, ואין שום פעולה של ההורה. משפטית ספק אם קיימת הסכמה כלל.
5. **תמונות פנים של קטינים ב-bucket ציבורי** — `media` הוא Public ואף מיגרציה לא יוצרת מדיניות `storage.objects` (supabase_launch_migration.sql:144); ה-URL נגיש לכל האינטרנט לנצח, גם אחרי מחיקת חשבון.
6. **מחיקת חשבון היא הבטחה ריקה** — `mailto:` בלבד, אין מסך אדמין לבקשות, אין מחיקת auth user ואין ניקוי Storage, מול הבטחת 30 יום במדיניות (src/PlayerDashboard.jsx:1774).
7. **"חסימה" של משתמש היא ויזואלית בלבד** — העמודה `banned` לא נבדקת באף מדיניות RLS (supabase_teams_admin.sql:111); מי שנחסם בעקבות תלונה ממשיך לכתוב ולשלוח הודעות.
8. **אין לאדמין דרך טכנית להסיר תוכן פוגעני** — אף טבלת תוכן לא כוללת מדיניות DELETE לאדמין (supabase_community.sql:26), בפלטפורמה שמארחת קטינים.
9. **הפרדת עולם הקטינים מעולם המבוגרים קיימת רק בניווט** — קהילת המאמנים, הפיד והצ'אט פתוחים לשחקנים בקריאת API ישירה (supabase_community_chat.sql:43).
10. **זרימת הצטרפות השחקנים מתה בפרודקשן** — `pendingRequests` שולפת `birth_year` שנשלל ברמת grant, השגיאה נבלעת ומסך אישור הבקשות ריק תמיד (src/players.js:127).
11. **מסמכים משפטיים סותרים את המציאות** — סעיף 3 במדיניות מצהיר שאין העברה לצד שלישי בעוד Vercel Analytics, Google Fonts, YouTube ו-rss2json מקבלים נתונים; ו-JoinWithCode מבטיח לקטינים מייל להורה שלא נשלח.
12. **חסמי מובייל טכניים** — `window.location.origin` בכל בוני הלינקים, אין טיפול ב-Back של אנדרואיד, ואין `viewport-fit=cover`; העטיפה תשבור שיתוף, איפוס סיסמה וניווט.

---

## ממצאים לפי חומרה

### קריטי

**[קריטי] supabase_stage2.sql:68** — המדיניות `profiles_select_authenticated` היא `USING(true)` לכל authenticated ומעולם לא הוחלפה. כל משתמש רשום (כולל שחקן, וכולל מי שנרשם עכשיו בקוד חד-פעמי) יכול לשלוף בקריאת PostgREST ישירה `GET /rest/v1/profiles?select=id,first_name,last_name,avatar_url,position,club&role=eq.player` את המאגר המלא של כל הקטינים בפלטפורמה — שם מלא, תמונה, עמדה ומועדון. privacy4 חסם רק עמודות (phone/birth_year) אבל לא שורות, ולכן ההגנה היחידה היא שהממשק לא מציג את זה. **תיקון:** להחליף את `profiles_select_authenticated` במדיניות מצומצמת: קריאת שורה של עצמי (`id = auth.uid()`), קריאת שורות של אנשים שיש איתי קשר בפועל (`public.is_team_member` / coach_id משותף) או `is_admin()`. חיפוש המאמנים כבר עובר דרך ה-VIEW `coach_directory`, ולוקאפ שמות בצ'אטים צריך לעבור ל-RPC ייעודי (SECURITY DEFINER) שמקבל רשימת מזהים ומחזיר שם בלבד רק למי שבאותו מרחב.

**[קריטי] supabase_messages.sql:53** — `messages_insert_own` בודק רק `sender_id = auth.uid() and recipient_id <> auth.uid()`. אין שום בדיקת תפקיד או קשר קבוצתי — כלומר כל מבוגר רשום יכול לשלוח הודעה פרטית ישירה לכל קטין במערכת, בלי שהמאמן שלו יידע ובלי קשר לקבוצה. בשילוב עם שליפת כל הפרופילים (supabase_stage2.sql:68) זה ערוץ פנייה ישיר לכל ילד בפלטפורמה — וקטור grooming קלאסי. **תיקון:** להוסיף ל-WITH CHECK תנאי קשר: מותר לשלוח רק אם שני הצדדים מאמנים, או אם השולח הוא המאמן של הנמען / הנמען הוא המאמן של השולח (`public.is_team_member` או שורה מאושרת ב-`team_memberships`). לחסום לחלוטין הודעות שחקן↔שחקן ומבוגר-זר↔קטין, ולהוסיף מדיניות מחיקה/קריאה לאדמין לצורכי תלונות.

**[קריטי] supabase_launch_migration.sql:144 (+ src/storage.js:45)** — ה-bucket `media` מוגדר Public, והגדרות ה-Storage קיימות אך ורק כהערה בקובץ — אף אחת מ-48 המיגרציות לא יוצרת מדיניות על `storage.objects`. תמונות הפרופיל של קטינים (כולל `capture="user"` — סלפי) ותמונות מאימונים יושבות בכתובת ציבורית קבועה בלי אימות, בלי תפוגה, ניתנות לאינדוקס ולהורדה גם אחרי שהחשבון נמחק (מחיקת פרופיל לא נוגעת ב-Storage), ובלי הסכמה ספציפית לפרסום דמות קטין. **תיקון:** להעביר את `media` ל-Private ולהגיש תמונות דרך `createSignedUrl` עם תפוגה קצרה (או bucket ציבורי נפרד לתוכן שיווקי בלבד ו-bucket פרטי לאווטארים), לכתוב את מדיניות `storage.objects` בקובץ SQL ממוסמך, להוסיף שורת הסכמה מפורשת לתמונה בטופס ההורה, ולמחוק את תיקיית המשתמש ב-Storage בעת מחיקת חשבון.

**[קריטי] src/ProfileForm.jsx:119** — הסכמת ההורה נכתבת כולה בידי הקטין: הקטין מסמן את הצ'קבוקס, מזין כל מייל שירצה כ-`guardian_email`, והקליינט שולח `guardian_consent_at = new Date().toISOString()` ב-upsert רגיל על profiles — בלי אימות מול ההורה (אין מייל, אין טוקן, אין רשומה נפרדת, אין מצב "ממתין לאישור"). גם שנת הלידה היא שדה חופשי: ילד בן 12 שיקליד 1990 עובר את הטריגר `enforce_minor_consent` (supabase_legal_launch.sql:30) בלי הסכמה כלל, ואף יכול לאפס בדיעבד את רשומת ההסכמה שלו. לפי חוק הכשרות המשפטית קטין אינו יכול לאשר בעצמו — ייתכן שאין כאן הסכמה כלל. חסם משפטי להשקה עם קטינים; נדרשת בדיקת עורך דין. **תיקון:** להוציא את שדות ההסכמה מכתיבת המשתמש (`revoke update (guardian_*, birth_year) on public.profiles from authenticated`), ולממש Edge Function ששולחת להורה קישור אימות חד-פעמי; רק אימות הטוקן בצד השרת כותב `guardian_consent_at`. מצב חשבון "ממתין לאישור הורה" שמגביל חשיפה למאמן, ולצ'אטים ולמדיה — עד האישור.

**[קריטי] src/PlayerDashboard.jsx:1774** — מחיקת חשבון לא מבוצעת בפועל אף פעם: `account_deletion_requests` נקלטת אך אין שום ממשק אדמין שמציג אותה (אפס אזכורים ב-src מלבד ה-insert), אין נתיב service-role למחיקת `auth.users`, ואין ניקוי Storage. מדיניות הפרטיות (סעיפים 5, 8) מבטיחה מחיקה תוך 30 יום — הבטחה שאין מאחוריה מנגנון, לגבי נתוני קטינים. **תיקון:** להוסיף לשונית "בקשות מחיקה" ב-Admin.jsx שקוראת את הטבלה, ותהליך מחיקה בפועל (Edge Function עם service key: מחיקת auth user, שורות team_players משויכות, קבצי media) + סימון `status='done'`. עד אז — בדיקה ידנית שבועית בטבלה.

---

### גבוה

**[גבוה] supabase_security3.sql:37** — נעילת ה-role בטריגר `protect_profile_privileged_cols` מותנית ב-`old.first_name is not null`. אפשר לעקוף אותה בשתי קריאות PostgREST: קודם `PATCH profiles set first_name=null` (אין שום מדיניות שמונעת), ואז `PATCH role='player'`. מבוגר יכול להפוך את עצמו לשחקן ולהיכנס למרחבי הקטינים (drill_videos הלא-מאושרים, player_messages), ושחקן קטין יכול להפוך את עצמו למאמן. **תיקון:** לחסום שינוי `role` בכל מקרה למי שאינו אדמין (להסיר את התנאי על first_name), ולהוסיף ל-`enforce_minor_consent` חסימת עדכון ש-first_name הופך ל-null. בחירת התפקיד בהרשמה תיעשה פעם אחת דרך RPC ייעודי.

**[גבוה] supabase_launch_migration.sql:146** — מדיניות ה-Storage המתועדת היא INSERT+UPDATE+DELETE ל-authenticated עם התנאי היחיד `(bucket_id = 'media')` — בלי שיוך לנתיב או לבעלים. כל משתמש רשום יכול למחוק או לדרוס כל קובץ ב-bucket, כולל תמונת פרופיל של קטין (החלפה בתמונה פוגענית) וכל תמונות הקהילה — בלי כל עקבות בטבלאות. **תיקון:** להצמיד את המדיניות לנתיב הבעלים: `with check/using (bucket_id='media' and (storage.foldername(name))[2] = auth.uid()::text)`, ולהגביל DELETE/UPDATE לבעלים ולאדמין בלבד.

**[גבוה] supabase_teams_admin.sql:111** — העמודה `banned` מתעדכנת בפאנל האדמין אבל אינה נבדקת באף מדיניות RLS ובאף פונקציה — היא מסננת אך ורק את ה-VIEW `coach_directory` (supabase_privacy4.sql:86). משתמש שנחסם בעקבות תלונה על התנהגות מול קטין ממשיך עם JWT תקף וגישה מלאה ל-API: קורא פרופילים, שולח הודעות פרטיות, כותב בקהילה. "חסימה" באפליקציה היא ויזואלית בלבד. **תיקון:** להוסיף בדיקת `not banned` לכל מדיניות כתיבה/קריאה רגישה דרך פונקציית עוזר (`public.is_banned()` בסגנון `is_admin()`), ולפחות: messages, community_*, player_messages, team_messages, profiles. במקביל — להפעיל `ban_duration` של Supabase Auth כדי לפסול את הטוקן עצמו.

**[גבוה] src/Auth.jsx:184** — `signInWithOtp({ email })` נקרא בלי `shouldCreateUser:false`, וברירת המחדל היא true. כלומר כל אחד יכול ליצור חשבון authenticated מלא בכתובת מייל חד-פעמית, בלי סיסמה ובלי שום שער. כל חשבון כזה מקבל מיד את כל מה שנפתח ל-authenticated: רשימת כל הקטינים (profiles), שליחת הודעות פרטיות, כתיבה בקהילה ובהתראות. זה מוריד את מחיר הניצול של הממצאים הקריטיים לאפס. **תיקון:** בזרימת ההתחברות להעביר `shouldCreateUser:false` (OTP לכניסה בלבד), ולהשאיר יצירת חשבון רק במסלול ההרשמה המפורש. בנוסף להפעיל CAPTCHA ב-Supabase Auth ולהגביל rate-limit על OTP.

**[גבוה] supabase_stage3.sql:62** — המדיניות `drills_select_authenticated` (`select to authenticated using true`) נוצרה כאן ומעולם לא נמחקה: supabase_launch_migration.sql:32-33 מוחק רק את `drills_select_all` ואת `drills_select_public_or_own`. מדיניות permissive מתאחדות ב-OR, ולכן שער ה-`is_public` שנוסף ב-launch_migration הוא אות מתה — כל תרגיל פרטי (`is_public=false`), כולל לוח הטקטיקה `board` ו-`image_url`, נקרא על ידי כל משתמש רשום, כולל שחקנים של קבוצות יריבות. **תיקון:** `drop policy if exists "drills_select_authenticated" on public.drills;` ולוודא ששרדה רק `drills_select_public_or_own` + `drills_public_anon_read`. כדאי גם לרוץ על כל הטבלאות ולבדוק שאין מדיניות `using(true)` שרידה (`select tablename, policyname, qual from pg_policies where qual = 'true'`).

**[גבוה] supabase_community_chat.sql:43 (+ supabase_community.sql:19,23)** — `community_messages` ו-`community_posts`/`community_post_comments`/`community_post_likes` פתוחים לקריאה ולכתיבה לכל authenticated בלי בדיקת role. שחקן קטין יכול לקרוא ולכתוב בצ'אט ובפיד של המאמנים המבוגרים דרך קריאת REST ישירה עם ה-anon key, וכל תוכן שמאמנים כותבים שם (כולל תמונות, עד 8 לפוסט) גלוי לקטינים. ההפרדה בין עולם המבוגרים לעולם הקטינים קיימת רק בניווט של הממשק. **תיקון:** להוסיף פונקציית `is_coach()` (בדפוס `is_player` הקיימת) ולהדק את מדיניות ה-select וה-insert של `community_messages`, `community_posts`, `community_post_comments`, `community_post_likes`, `community_events` ו-`community_poll_votes` למאמנים/אדמין בלבד (או לבנות ערוץ ייעודי לשחקנים), ולבדוק בפועל עם חשבון שחקן מול `/rest/v1/community_messages`.

**[גבוה] supabase_community.sql:26** — אין באף אחת מ-48 המיגרציות מדיניות מחיקה לאדמין על אף טבלת תוכן: `community_posts`, `community_post_comments`, `community_messages`, `player_messages`, `team_messages` — בכולן DELETE מותר רק ליוצר (ובצ'אט הקבוצתי גם למאמן). טבלת `reports` קיימת אבל לאדמין אין שום נתיב טכני להסיר תוכן פוגעני שנוגע לקטין מלבד כניסה ידנית ל-SQL Editor. זו חשיפה משפטית ישירה בפלטפורמה שמארחת קטינים. **תיקון:** להוסיף לכל טבלת תוכן מדיניות `"<t>_admin_delete" for delete to authenticated using (public.is_admin())`, ולחבר אותה לזרימת הטיפול בתלונות בפאנל האדמין (כפתור "הסר תוכן" על שורת הדיווח).

**[גבוה] supabase_security3.sql:60** — `is_linked_player()` בודקת רק שקיימת חברות מאושרת כלשהי, בלי קשר לקבוצה. התוצאה: `player_messages` הוא חדר צ'אט אחד ארצי שכל הקטינים מכל המועדונים נמצאים בו יחד, בלי מאמן, בלי מודרציה ובלי יכולת מחיקה של אף אחד מלבד הכותב עצמו. security3 צמצם את זה מ"כל מי שסימן role=player" ל"כל מי שאושר בקבוצה כלשהי" — אבל זה עדיין מרחב פתוח בין קטינים זרים. **תיקון:** או לצמצם את הצ'אט לפי קבוצה (`using public.is_team_member(coach_id, team)` כמו ב-team_messages), או להשאירו ארצי אך עם מודרציה (מדיניות מחיקה לאדמין), סינון תוכן, ודיווח בתוך המסך. בכל מקרה — לא להשיק אותו כמרחב פתוח וללא פיקוח.

**[גבוה] supabase_engagement.sql:28** — `notifications_insert_actor` בודק רק `actor_id = auth.uid()`; עמודת `user_id` (הנמען) אינה מוגבלת כלל. כל משתמש רשום יכול לדחוף מספר בלתי מוגבל של התראות עם טקסט חופשי (עד 300 תווים) לכל קטין במערכת, כולל ניווט מכוון (`nav`), בלי שום קשר קבוצתי — ערוץ הטרדה/פישינג ישיר שעוקף את מסך ההודעות. **תיקון:** להוסיף ל-WITH CHECK דרישת קשר בין actor לנמען (`public.is_team_member` או חברות מאושרת משותפת), או להעביר את יצירת ההתראות ל-RPC SECURITY DEFINER שמוודא את הקשר ומגביל קצב, ולשלול INSERT ישיר על הטבלה.

**[גבוה] src/players.js:127** — `pendingRequests` שולפת `profiles!player_id(first_name, last_name, birth_year, position, avatar_url)`, אבל supabase_privacy4.sql:45-46 שלל את ה-SELECT הרוחבי על profiles והחזיר הרשאה רק לרשימת עמודות ש-`birth_year` אינו בה. הקריאה מחזירה 42501, השגיאה נבלעת (`const { data } = …`), והפונקציה מחזירה `[]` תמיד — כלומר מסך אישור בקשות ההצטרפות של המאמן ריק בקביעות וכל זרימת הצטרפות השחקנים מתה בפרודקשן, בלי שום הודעת שגיאה. **תיקון:** להסיר את `birth_year` מה-select (או לחשוף גיל דרך RPC ייעודי שמחזיר רק את מה שהמאמן צריך), ולהפסיק לבלוע את `error` בכל הקריאות ב-players.js — לפחות `console.error` + הודעת toast.

**[גבוה] src/JoinWithCode.jsx:261** — הודעה כוזבת לקטינים: "מתחת לגיל 16? נשלח אישור הורה למייל... עד שההורה מאשר, המאמן לא רואה את הפרטים" — הסף השגוי (הדין באפליקציה הוא 18, supabase_legal_launch.sql), שום מייל לא נשלח (אין תשתית דיוור), ואין מצב הסתרה מהמאמן. מצג שווא בממשק כלפי קטינים על הגנה שלא קיימת. **תיקון:** לתקן את הטקסט למציאות בפועל (גיל 18, ההסכמה נרשמת בטופס הפרופיל) או למחוק את ההערה — עד שמנגנון מייל להורה קיים באמת.

**[גבוה] public/privacy.html:44** — סעיף 3 מצהיר "איננו מעבירים מידע אישי לצדדים שלישיים" בעוד בפועל נתוני משתמשים (כולל IP וצפיות עמודים של קטינים) מגיעים ל-Vercel (אחסון + Analytics ב-main.jsx:14), Google Fonts (index.html:29), YouTube/img.youtube.com, googleapis.com ו-rss2json (ארה"ב). מדיניות לא מדויקת = פגם בהסכמה שניתנה על בסיסה, במיוחד לגבי קטינים. העברת מידע קטינים לחו"ל דורשת בסיס לפי תיקון 13 — לבדיקת עו"ד. **תיקון:** לעדכן את סעיפים 3–4: לפרט את כל מעבדי המשנה (Supabase, Vercel + Analytics, Google Fonts/YouTube, rss2json), איזה מידע מגיע לכל אחד ובאיזו מדינה; לחלופין לצמצם (self-host לפונטים, הסרת Analytics) ואז להצהיר בהתאם.

**[גבוה] supabase_legal_launch.sql:25 (+ src/ProfileForm.jsx:41)** — חישוב גיל לפי הפרש שנים קלנדרי בלבד (`extract(year) - birth_year`) גם בטריגר וגם בלקוח: שחקן שימלאו לו 18 בדצמבר נחשב בגיר כבר מ-1 בינואר — קטינים בני 17 נרשמים בלי הסכמת הורה במשך עד 11 חודשים. **תיקון:** מאחר שנאסף רק `birth_year`, לחשב שמרנית: לדרוש הסכמת הורה כאשר `current_year - birth_year <= 18` (כלומר עד שבוודאות מלאו 18), או לאסוף תאריך לידה מלא לצורך השער בלבד.

**[גבוה] src/ProfileForm.jsx:120** — רשומת ההסכמה אינה אמינה כראיה: `consent_at` ו-`guardian_consent_version` נכתבים מהלקוח (ניתנים לזיוף בקריאת API ישירה), הגרסה מקובעת בקוד `'v1 · 1.8.2026'` בלי קשר לנוסח שפורסם בפועל, וכל השדות ניתנים לעדכון/דריסה בכל upsert של המשתמש — אין לוג הסכמות בלתי-ניתן-לשינוי. **תיקון:** טבלת `consent_log` נפרדת (append-only, בלי policy עדכון/מחיקה), שמתמלאת בטריגר בשרת עם `now()` ועם גרסת המסמך מטבלת גרסאות — לא מערכי לקוח; לחסום עדכון של `guardian_consent_at` קיים בטריגר.

**[גבוה] supabase_players.sql:69** — שורת הסגל (`team_players`) עם name, phone, birth_date מלא, height, notes, injury_note של קטין נשארת אצל המאמן לנצח: מחיקת החשבון רק מנתקת (`on delete set null`), עזיבת קבוצה לא מוחקת כלום, ואין שום מנגנון retention — בניגוד להבטחת סעיף 5 במדיניות. **תיקון:** להגדיר מדיניות: במחיקת חשבון/עזיבה — מחיקה או אנונימיזציה של שורת ה-roster (לפחות phone/birth_date/notes/injury_note); job תקופתי לניקוי שורות של שחקנים לא פעילים.

**[גבוה] public/__devlogin.html:1** — הקובץ עם `access_token` + `refresh_token` אמיתיים של חשבון המאמן (agam15122003@gmail.com, כולל UUID של המשתמש) עדיין נגיש בהיסטוריית git שנדחפה ל-GitHub (github.com/agam15122003-lang/The-basketball-world, קומיטים 87e1ef1 עד 566a697). הטוקן פג והסשן בוטל, אבל המייל האישי, מזהה המשתמש ומבנה מפתח ה-localStorage חשופים לכל מי שיש לו גישה לריפו, וכל שכפול עתידי של הריפו משכפל את הדליפה. **תיקון:** שכתוב היסטוריה (git filter-repo או BFG) להסרת `public/__devlogin.html` מכל הקומיטים + force-push לכל הענפים, או החלטה מפורשת ומתועדת לקבל את הסיכון בהינתן שהטוקן בוטל. בכל מקרה לוודא שהריפו נשאר פרטי.

**[גבוה] src/constants.js:253** — מפתח Google API אמיתי (`AIzaSy…[הוסתר]`) הוקשח בקוד בקומיט הראשוני (a347ed1) והוסר רק ב-969c478 — הוא נגיש לכל מי שרואה את היסטוריית הריפו. אם המפתח לא סובב, אפשר לשרוף איתו את מכסת ה-YouTube API או לצבור חיובים בפרויקט ה-Google Cloud. **תיקון:** לסובב (regenerate) את המפתח ב-Google Cloud Console מיד אם טרם נעשה, ולוודא שהמפתח החדש מוגבל ל-YouTube Data API v3 בלבד עם הגבלת HTTP referrer לדומיין courtsideil.vercel.app.

**[גבוה] index.html:9** — ה-viewport חסר `viewport-fit=cover`, ולכן כל 16 השימושים ב-`env(safe-area-inset-*)` ב-index.css (ניווט תחתון, מגירות, טוסטים, טופ-בר) מחזירים 0 במכשירי notch — ב-WebView נייטיב (וגם ב-PWA standalone) הניווט התחתון יישב מתחת ל-home indicator וכותרות ייחתכו מתחת ל-notch. **תיקון:** לשנות ל-`content="width=device-width, initial-scale=1.0, viewport-fit=cover"` — שינוי של שורה אחת שמפעיל את כל ה-safe-area הקיים.

**[גבוה] src/share.js:11** — כל בוני הלינקים משתמשים ב-`window.location.origin` (share.js:11,27, LeagueTable.jsx:49, TrainingPlans.jsx:407, TeamConnect.jsx:49). בתוך Capacitor זה מחזיר `capacitor://localhost` (iOS) או `https://localhost` (Android) — לינק שיתוף בוואטסאפ, לינק הצטרפות `#/join`, וה-QR (שמקודד את joinUrl) יהיו לינקים מתים אצל כל נמען. **תיקון:** להגדיר קבוע `SITE_URL='https://courtsideil.vercel.app'` (או VITE_SITE_URL) בקובץ אחד ולהשתמש בו בכל בוני הלינקים במקום `window.location.origin`.

**[גבוה] src/Auth.jsx:146** — `resetPasswordForEmail` עם `redirectTo: window.location.origin+'?reset=true'` (גם בשורה 165) — בתוך Capacitor ה-origin יהיה `capacitor://localhost`, כתובת ש-Supabase ידחה (לא ברשימת ה-Redirect URLs) או שהמייל יכיל לינק שלא נפתח בשום מקום; זרימת איפוס סיסמה מתה לחלוטין באפליקציה. **תיקון:** `redirectTo` לקבוע SITE_URL; הלינק ייפתח באתר בדפדפן (עובד גם בלי האפליקציה), ובהמשך להוסיף Universal/App Link שיחזיר לאפליקציה עם טיפול ב-`?reset=true` ב-appUrlOpen.

**[גבוה] src/App.jsx:15** — ניווט מבוסס hash + state של React (authStep, טאבים ב-Dashboard, מודלים) בלי אף אינטגרציה עם history/popstate (grep מאשר: אפס מאזיני popstate בכל src). באנדרואיד כפתור ה-Back החומרתי יסגור את האפליקציה מכל מסך פנימי — חוויה שבורה וסיכון לדחייה ב-Play Store. **תיקון:** להוסיף מאזין `backButton` של @capacitor/app: אם יש מודל/מגירה פתוחים — לסגור; אם לא בטאב הבית — לחזור לטאב הבית; אחרת `App.exitApp()`. לחלופין לדחוף `history.pushState` על כל מעבר מסך ולהאזין ל-popstate.

**[גבוה] src/PlayerDashboard.jsx:1776** — מחיקת חשבון (חובה חוקית, במיוחד לקטינים) ממומשת כ-`window.location.href='mailto:...'` — ב-WKWebView ניווט mailto נחסם/לא מטופל כברירת מחדל, כך שהזרימה מתה באפליקציה; בנוסף Apple דורשת מחיקת חשבון בתוך האפליקציה (guideline 5.1.1v) — mailto לא יעבור App Review. **תיקון:** בטווח קצר לעטוף mailto ב-`window.open` או Capacitor `App.openUrl`; לפני הגשה לחנויות לממש מחיקה אמיתית בתוך האפליקציה (Edge Function עם service role שמוחקת את המשתמש).

**[גבוה] src/Community.jsx:791** — שאילתת הצ'אט ממוינת `created_at` עולה עם `limit(500)` — מחזירה את 500 ההודעות הישנות ביותר. ברגע שהטבלה תעבור 500 שורות, הודעות חדשות פשוט לא יופיעו לאף אחד — הפיצ'ר נשבר בשקט. אותו באג בדיוק ב-PlayerCommunity.jsx:23-26, CoachChat.jsx:28-29, TeamChat.jsx:32-33. **תיקון:** לשלוף `ascending:false` עם `limit(500)` ואז `reverse()` בצד הלקוח, בכל 4 הקבצים.

**[גבוה] src/Messages.jsx:63** — `loadMessages` שולף `select('*')` על כל טבלת messages בלי limit, ורץ מחדש במלואו כל 30 שניות (polling) ועל כל INSERT ב-realtime — גם של שיחות אחרות. ככל שההיסטוריה גדלה זה נהיה איטי ושורף egress של Supabase ללא תקרה. **תיקון:** להוסיף limit + מיון יורד (או שליפה לפי שיחה פעילה), וב-handler של ה-INSERT לצרף את השורה החדשה מה-payload במקום לטעון הכול מחדש.

**[גבוה] src/index.css:2927** — `.phone-link` — טקסט קישור בצבע `var(--accent)` (#E8763A, ~3.0:1 על רקע בהיר) — הפרת חוק AA של CLAUDE.md:28 (כתום לטקסט חייב `--accent-strong`). קיימות ~59 הופעות של `color: var(--accent)`, חלקן טקסט רץ (למשל .news-src בשורה 2645, .nav-item.active בשורה 1266). כשל נגישות משפטי באתר המחויב להצהרת נגישות ישראלית. **תיקון:** לעבור על כל 59 ההופעות של `color: var(--accent)` ולהחליף ל-`--accent-strong` בכל מקום שהוא טקסט (לא אייקון/גבול) על רקע בהיר; להתחיל ב-.phone-link, .news-src, .nav-item.active.

**[גבוה] src/PlayerGoals.jsx:41** — מסך יעדי שחקן (קטינים) בלי מצב טעינה ובלי טיפול בשגיאות קריאה — `const { data } = await supabase` זורק את error, כך ששגיאת שאילתא מוצגת כ-empty state (בדיוק האנטי-פאטרן שאסור לפי CLAUDE.md כלל 4). גם update/delete בשורות 82-92 מתעלמים משגיאות — מחיקה/עדכון יעד יכולים להיכשל בשקט והמשתמש לא יידע. **תיקון:** לפרק `{ data, error }` בכל שאילתא, להציג הודעת שגיאה עם כפתור רענון, ולהוסיף state של loading עם skeleton. לבדוק error גם ב-update/delete ולהציג toast בכישלון.

---

### בינוני

**[בינוני] supabase_migrations_ledger.sql:26** — `mark_migration(p_file text)` היא SECURITY DEFINER בלי בדיקת role ובלי revoke — ב-Postgres ברירת המחדל היא EXECUTE ל-PUBLIC, ולכן כל משתמש (וגם anon) יכול לקרוא ל-`POST /rest/v1/rpc/mark_migration` עם כל מחרוזת. ה-upsert (`on conflict do update set ran_at=now(), ran_by=auth.uid()`) מאפשר גם לשכתב רשומות קיימות. הלדג'ר — כלי האבחון היחיד למה הורץ בפרודקשן — הופך לבלתי אמין, ו-`p_file` חסר הגבלת אורך מאפשר ניפוח. **תיקון:** `revoke all on function public.mark_migration(text) from public, anon, authenticated;` ולהוסיף בתוך הפונקציה `if not public.is_admin() then raise exception`. להוסיף גם check על אורך filename.

**[בינוני] supabase_player_card.sql:42** — פונקציות SECURITY DEFINER שנוצרו עם `grant execute … to authenticated` בלבד, בלי `revoke all … from public` — ולכן זמינות גם ל-anon: `team_roster`, `set_my_availability`, `admin_delete_video` (supabase_stage2_launch.sql:41), וכן העוזרים is_admin/is_team_member/is_player/is_my_roster/is_linked_player/is_on_coach_roster. כרגע כולן מסתמכות על `auth.uid()` ולכן מחזירות ריק ל-anon, אבל זו הגנה מקרית: כל שינוי עתידי בגוף הפונקציה הופך אותן לנתיב עוקף-RLS פתוח לאינטרנט. `set_my_availability` גם מעדכנת את כל שורות הסגל של השחקן בכל הקבוצות בבת אחת. **תיקון:** להוסיף לכל פונקציית SECURITY DEFINER את הדפוס שכבר קיים ב-privacy4: `revoke all on function … from public, anon; grant execute … to authenticated`. ב-`set_my_availability` להוסיף פרמטרי coach_id/team כדי לעדכן שורה אחת.

**[בינוני] supabase_privacy4.sql:122** — `enforce_minor_consent` (וגם `messages_recipient_read_only` ב-supabase_security_hardening.sql:47) מוגדרות בלי `set search_path` — Supabase מסמן זאת כליקוי, ובטריגר שרץ בהקשר של קורא כלשהו זה פותח פתח להשתלטות על רזולוציית שמות. בנוסף שער הקטינים מותנה ב-`new.first_name is not null`, כך ששורת שחקן שנוצרת/מתעדכנת בלי first_name עוקפת לגמרי את בדיקת שנת הלידה וההסכמה. **תיקון:** להוסיף `set search_path = public` לשתי הפונקציות, ולהחליף את התנאי כך שכל שורה עם `role='player'` תיבדק (או לחסום `role='player'` בלי birth_year כבר בטריגר ההרשמה handle_new_user).

**[בינוני] supabase_player_goal_logging.sql:17** — `pg_player_insert` בודק רק `player_id = auth.uid()`, אבל `coach_id` (not null) ו-`team` נשלטים לגמרי על ידי הקליינט. כל שחקן יכול להזריק יעדים מזויפים לדשבורד של כל מאמן במערכת, ו-`pg_player_update` (`using player_id = auth.uid()`) מאפשר לו גם לשכתב title/target_value/status/coach_id של יעד שהמאמן הגדיר לו — כלומר לזייף את רשומת המעקב של המאמן. **תיקון:** ב-WITH CHECK של ה-insert לדרוש `coach_id = auth.uid()` (יעד אישי) או `public.is_team_member(coach_id, team)`; ב-update להגביל את השחקן לעמודות ההתקדמות בלבד — עדיף להעביר את עדכון ההתקדמות ל-RPC ולבטל את מדיניות ה-UPDATE הישירה.

**[בינוני] supabase_effort.sql:24** — `se_player_all` הוא FOR ALL עם WITH CHECK שבודק רק `player_id = auth.uid()`; coach_id, team ו-session_id חופשיים. אותו דפוס ב-`session_goal_marks` (supabase_team_slots.sql:53) וב-`player_goal_logs` (supabase_goal_logs.sql:20). כל שחקן יכול להזריק שורות דירוג מאמץ והערות טקסט לדוחות של כל מאמן במערכת, כולל מאמן שאינו שלו — זיהום נתונים ודלת אחורית להעברת טקסט למאמן זר. **תיקון:** להוסיף לכל WITH CHECK את התנאי `public.is_team_member(coach_id, team)` (כמו שכבר נעשה נכון ב-practice_rsvp דרך is_on_coach_roster), ולוודא שגם session_id שייך לקבוצה.

**[בינוני] supabase_stage3.sql:68** — `drills_insert_own` דורש רק `created_by = auth.uid()` בלי בדיקת תפקיד — שחקן יכול להכניס ולערוך תרגילים (כולל `is_public=true` עם קישורי וידאו שרירותיים) לספריית התרגילים המשותפת של המאמנים דרך ה-API, למרות שה-UI חוסם זאת. **תיקון:** להוסיף `and public.is_coach()` (או בדיקת role='coach') ל-with check של `drills_insert_own` ו-`drills_update_own`.

**[בינוני] supabase_privacy4.sql:209** — `cerr_insert_self` מתיר לכל משתמש רשום להכניס שורות `client_errors` ללא הגבלה, עם message/stack באורך בלתי מוגבל (אין check constraint), וגם עם `user_id` null — כלומר בלי שיוך. זה גם נתיב ניפוח מסד נתונים זול (אין rate limit) וגם מקום שבו stack traces של מסכי שחקנים עלולים לשמור PII של קטינים ללא מדיניות שמירה. **תיקון:** להוסיף check על אורך message (≤1000) ו-stack (≤4000), לדרוש `user_id = auth.uid()` בלבד, להוסיף מגבלת קצב (למשל unique חלקי על user_id+message+date) ומדיניות מחיקה אוטומטית אחרי 30 יום.

**[בינוני] supabase_players.sql:49** — `memb_player_insert` מתיר לכל משתמש רשום ליצור בקשת חברות ל-(coach_id, team) שרירותיים — אין שום קישור לקוד ההצטרפות שדרכו הוא כביכול הגיע. אפשר לסרוק את מזהי המאמנים (זמינים דרך profiles או דרך drills.created_by) ולהציף כל מאמן בבקשות הצטרפות, מה שמקל על אישור בטעות של גורם זר לקבוצה של קטינים. **תיקון:** להעביר את יצירת הבקשה ל-RPC SECURITY DEFINER שמקבל את הקוד עצמו, מפענח אותו בשרת ויוצר את השורה — ולבטל את מדיניות ה-INSERT הישירה על team_memberships.

**[בינוני] supabase_security3.sql:83** — `resolve_join_code` מחזירה coach_id+team לכל קוד תקף, לכל משתמש מחובר, ללא הגבלת קצב, ללא נעילה אחרי כשלונות וללא לוג. הקודים הם 6 תווים מאלפבית של 32 (~1.07e9 צירופים) — סריקה מלאה לא ריאלית ב-HTTP, אבל הקודים קבועים לנצח לכל (coach, team), אין תפוגה ואין רוטציה, ולכן קוד שדלף פעם אחת בקבוצת וואטסאפ נשאר תקף לכל החיים. **תיקון:** להוסיף לטבלת הקודים `expires_at` ואפשרות רוטציה בכפתור אחד במסך הקבוצה, לסנן בפונקציה קודים שפגו, ולהוסיף מונה ניסיונות כושלים לכל משתמש (או Edge Function עם rate limit) לפני החזרת תשובה.

**[בינוני] src/Auth.jsx:121** — מינימום 8 תווים לסיסמה נאכף רק בקליינט (בדיקת `password.length` ו-`minLength` בטופס). הרשמה ישירה מול `auth/v1/signup` עוקפת את זה לחלוטין ומקבלת את מה שמוגדר בפרויקט Supabase — ברירת המחדל היא 6 תווים בלי דרישות מורכבות ובלי בדיקת סיסמאות שדלפו. בפלטפורמה שמכילה חשבונות של קטינים זה בסיס להשתלטות על חשבון בניחוש. **תיקון:** להגדיר ב-Supabase → Authentication → Policies מינימום 8 תווים + דרישת מורכבות, ולהפעיל Leaked password protection (HaveIBeenPwned). האכיפה בקליינט נשארת כחוויית משתמש בלבד.

**[בינוני] supabase_migrations_ledger.sql:43** — סדר ההרצה שמתועד ברישום למפרע שגוי: `supabase_teams_admin.sql` מופיע לפני `supabase_launch_migration.sql`, אבל teams_admin יוצר את `video_ratings` עם FK ל-`public.drill_videos` שנוצרת רק ב-launch_migration. בסביבה חדשה (שחזור מאסון, staging) הרצה לפי הסדר הזה תיפול, וב-SQL Editor הכשלון מגלגל אחורה את כל הקובץ — כלומר חמש טבלאות הקבוצה (team_players/goals/games/iba/staff) נשארות בלי RLS ובלי מדיניות. אין שום דרך אוטומטית לשחזר את מצב האבטחה מ-48 הקבצים. **תיקון:** למספר את הקבצים לפי סדר תלות אמיתי (0001_…, 0002_…) או לעבור ל-supabase/migrations עם ה-CLI, לפצל את video_ratings לקובץ שרץ אחרי drill_videos, ולהוסיף סקריפט אימות שמריץ את כל הרצף על מסד ריק ב-CI.

**[בינוני] supabase_teams_admin.sql:87** — חסרים אינדקסים על העמודות שמופיעות ב-USING של מדיניות RLS, ולכן כל שאילתה סורקת טבלה תחת הערכת מדיניות לכל שורה: team_players(player_id) ו-(coach_id,team) עבור roster_self_read ו-is_team_member, team_goals/team_games/team_iba/team_staff(coach_id), messages(sender_id) ו-(recipient_id), drills(created_by) ו-(is_public), profiles(role) עבור coach_directory. בטבלאות ההודעות והסגל זה מתדרדר לינארית עם הגידול. **תיקון:** `create index` על: team_players(player_id), team_players(coach_id, team), messages(recipient_id, created_at desc), messages(sender_id, created_at desc), drills(created_by), drills(is_public), team_goals(coach_id), team_games(coach_id, team), team_iba(coach_id), team_staff(coach_id), profiles(role).

**[בינוני] src/Auth.jsx:339** — הסכמת ההרשמה לתנאי שימוש ומדיניות (מאמנים ושחקנים בגירים) לא נרשמת בשום מקום — הצ'קבוקס רק חוסם את הכפתור; אין timestamp ואין גרסה. אין דרך להוכיח מי הסכים למה ומתי. **תיקון:** לשמור `accepted_terms_at` + `terms_version` על profiles (או ב-consent_log) בעת ההרשמה.

**[בינוני] src/ProfileForm.jsx:363** — נוסח ההסכמה של ההורה מפנה רק למדיניות הפרטיות — ההורה לא מאשר את תנאי השימוש, בעוד פתיחת החשבון היא התקשרות חוזית של קטין שדורשת אישור אפוטרופוס גם לתנאים (חוק הכשרות המשפטית). לבדיקת עו"ד. **תיקון:** להוסיף לנוסח ההסכמה קישור לתנאי השימוש ואישור מפורש שלהם, ולתעד את גרסת שני המסמכים.

**[בינוני] supabase_player_card.sql:20** — מזעור מידע: המאמן מזין על קטין תאריך לידה מלא (`birth_date`) בנוסף ל-birth_year, גובה, טלפון והערות חופשיות (`notes`) — בלי שהשחקן/ההורה רואים או מאשרים; birth_date מלא אינו נחוץ לניהול קבוצה כששנת לידה קיימת. **תיקון:** להסיר את birth_date (או להשאיר שנה בלבד), להציג לשחקן בפרופיל שלו את כל מה שהמאמן מנהל עליו, ולצמצם שדות חופשיים.

**[בינוני] supabase_player_card.sql:45** — זכות העיון: `coach_notes` — הערות מאמן על שחקן קטין — חסויות לחלוטין מהשחקן ומההורה, ואין שום מסך/ייצוא "כל המידע עליי" (עיון לפי סעיף 13 לחוק). ייתכן שהערות על נושא המידע כלולות בזכות העיון — לבדיקת עו"ד. **תיקון:** להוסיף מסך/RPC "המידע שלי" שמרכז את כל הנתונים על השחקן (כולל שורת roster ונתוני פעילות) עם אפשרות ייצוא JSON/CSV; להגדיר נוהל מענה לבקשת עיון של הורה.

**[בינוני] supabase_privacy4.sql:196** — אין שום תיעוד גישה למאגר (audit log) מעבר ל-client_errors: תקנות אבטחת מידע התשע"ז-2017 דורשות לרמת אבטחה בינונית (סבירה למאגר עם נתוני בריאות של קטינים) מנגנון תיעוד גישה; לוגים מובנים של Supabase נשמרים ימים בודדים ב-tier חינמי. גם אין נוהל אירוע אבטחה מתועד. **תיקון:** טבלת audit (טריגרים על profiles/team_players לפעולות קריאה רגישות דרך RPC ועדכונים), מסמך הגדרות מאגר ונוהל דיווח אירוע — נדרש ליווי עו"ד/ממונה לקביעת רמת האבטחה.

**[בינוני] supabase_feedback_sheet.sql:7** — נתוני פעילות רגישים של קטינים — mood (מצב רוח), effort, status פצוע/חולה, injury_note — נשמרים ללא הגבלת זמן ובלי מנגנון מחיקה תקופתי; מצטבר פרופיל התנהגותי/בריאותי רב-שנתי על קטין. **תיקון:** להגדיר תקופת שמירה (למשל עונה/שנתיים) ו-job מחיקה/אנונימיזציה תקופתי ל-session_effort, player_feedback, הודעות צ'אט ו-client_errors.

**[בינוני] src/ProfileForm.jsx:37** — במלאות 18 לשחקן אין שום תהליך: פרטי ההורה (שם, מייל, טלפון) נשמרים לנצח בלי מטרה, ואין אשרור מחדש של ההסכמה על-ידי הבגיר. **תיקון:** בדיקה שנתית (או בכניסה) — אם השחקן כבר בגיר: בקשת אישור תנאים עצמאי ומחיקת שדות guardian_*.

**[בינוני] src/TrainingPlans.jsx:717 (+ src/playerReport.js:81)** — עמוד ההדפסה נפתח כ-`blob:` URL שמכיל `<script>` inline להפעלת `window.print()`. מסמך blob יורש את ה-CSP של הדף (script-src 'self' בלי unsafe-inline) — הסקריפט ייחסם בפרודקשן וההדפסה האוטומטית לא תרוץ. **תיקון:** להסיר את הסקריפט מה-HTML ולקרוא `w.print()` מהחלון הפותח (w.onload / setTimeout), או להדפיס דרך iframe נסתר — בלי inline script בתוך ה-blob.

**[בינוני] src/constants.js:253** — `VITE_YOUTUBE_API_KEY` נארז בבאנדל הציבורי (כל `VITE_` חשוף בצד לקוח — זה מתועד, אבל ההגנה היחידה היא הגבלת referrer). לא ניתן לאמת מהריפו שהמפתח שמוגדר ב-Vercel אכן מוגבל ל-HTTP referrer של הדומיין; בלי ההגבלה כל אחד יכול להעתיק את המפתח מהבאנדל ולשרוף את המכסה. **תיקון:** לאמת ב-Google Cloud Console שהמפתח הפרודקשני מוגבל ל-referrer של courtsideil.vercel.app ול-YouTube Data API v3 בלבד, ולהגדיר תקרת מכסה יומית נמוכה.

**[בינוני] src/App.jsx:22** — דיפ-לינקים `#/join/<CODE>` ו-`#/drill/<id>` (ובעתיד `#/consent/<token>` — עדיין לא קיים בקוד) הם https-לינקים לאתר; בלי App Links (assetlinks.json) / Universal Links (apple-app-site-association) + טיפול ב-appUrlOpen שממפה URL→hash, לינק שנשלח בוואטסאפ ייפתח תמיד בדפדפן ולא באפליקציה. חשוב: fragment (`#/...`) לא תמיד מועבר ב-Universal Links — עדיף נתיבים אמיתיים. **תיקון:** להוסיף קבצי well-known לדומיין הוורסל, לקנפג appUrlOpen ב-@capacitor/app שממיר את ה-URL ל-hash פנימי, ולוודא שלינק הסכמת הורים נפתח באתר כשהאפליקציה לא מותקנת (זו התנהגות ברירת המחדל של App Links).

**[בינוני] src/supabaseClient.js:21** — `createClient` בברירת מחדל שומר את ה-session ב-localStorage — ב-WKWebView האחסון אינו מוצפן ועלול להימחק ע"י המערכת (ניקוי אחסון/לחץ דיסק), מה שינתק משתמשים אקראית; טוקן בכתב גלוי באפליקציה שמחזיקה נתוני קטינים אינו סטנדרט נייטיב. **תיקון:** להעביר storage adapter ב-`auth.storage` שמבוסס @capacitor/preferences (או capacitor-secure-storage-plugin לטוקנים), עם fallback ל-localStorage בדפדפן.

**[בינוני] public/sw.js:28** — ב-iOS Capacitor (סכמת `capacitor://`) Service Workers לא נתמכים — ה-register ב-main.jsx ייכשל בשקט, כל אסטרטגיית ה-cache והרענון האוטומטי (controllerchange→reload ב-main.jsx:29) לא יפעלו; באנדרואיד ה-SW עלול להירשם על `https://localhost` ולנסות network-first על ניווט כשאין שרת בכלל. **תיקון:** בבנייה ל-Capacitor לא לרשום SW כלל (הנכסים ממילא ארוזים לוקלית) — לעטוף את הרישום ב-main.jsx בבדיקת `!window.Capacitor`; עדכוני גרסה באפליקציה יטופלו דרך חנות/Live Update ולא דרך SW.

**[בינוני] src/notify.js:10** — התראות הן רק שורות DB שנקראות בתוך האפליקציה — באפליקציה נייטיבית משתמשים מצפים ל-push כשהאפליקציה סגורה, ואין שום תשתית שרת לשליחה (אין Edge Functions בפרויקט). **תיקון:** נדרש: @capacitor/push-notifications בצד לקוח; טבלת device_tokens (user_id, token, platform) עם RLS שכל משתמש כותב רק לעצמו; ו-Supabase Edge Function שמופעלת ב-Database Webhook על INSERT ל-notifications ושולחת דרך FCM HTTP v1 (iOS דרך FCM→APNs). בלי רכיב השרת אין דרך לשלוח push.

**[בינוני] src/index.css:161** — עשרות שימושים ב-`100vh` (שורות 161,166,189,1208,1221,2092...) לצד 8 בלבד ב-dvh — ב-WebView עם מקלדת פתוחה 100vh לא מתכווץ, אז קלטים בתחתית מסכים מלאי-גובה (צ'אט, מודלים) יוסתרו מאחורי המקלדת; באנדרואיד adjustResize חלקי ובאייפון המקלדת שכבת overlay. **תיקון:** להחליף height/min-height:100vh ל-100dvh בקונטיינרים של מסכים מלאים; להגדיר @capacitor/keyboard עם `resize:'body'` (iOS) ולהוסיף scrollIntoView בפוקוס על קלטי הצ'אט.

**[בינוני] index.html:19** — תגי OG (og:url, og:image בשורות 19-20 וגם shortcut בשורה 42) עדיין מצביעים על courtsideil.netlify.app — תצוגות שיתוף בוואטסאפ/פייסבוק מציגות ומקשרות לדומיין הישן במקום courtsideil.vercel.app. **תיקון:** לעדכן את שלוש הכתובות ל-https://courtsideil.vercel.app.

**[בינוני] src/TrainingPlans.jsx:723** — `window.open` לחלון הדפסה (וגם playerReport.js:85, share.js:6 ל-wa.me, Auth.jsx:38 לאתרי מייל) — ב-WebView ההתנהגות של window.open לא צפויה: עלול לנווט את ה-WebView הראשי עצמו החוצה או להיחסם; זרימת ההדפסה מבוססת חלון־חדש כנראה לא תעבוד כלל. **תיקון:** לינקים חיצוניים (wa.me, מייל, יוטיוב) — לנתב דרך @capacitor/browser או App.openUrl (wa.me ייפתח ישירות בוואטסאפ); דוח/הדפסה — לייצר PDF ולשתף עם @capacitor/share במקום window.print בחלון חדש.

**[בינוני] src/ProfileForm.jsx:201** — שלושה קלטי `<input type="file">` (גם Community.jsx:664, DrillForm.jsx:330) — באנדרואיד בלי הרשאות READ_MEDIA_IMAGES/CAMERA ב-AndroidManifest הבוחר לא ייפתח, וב-iOS חסרות מחרוזות NSPhotoLibraryUsageDescription/NSCameraUsageDescription ב-Info.plist האפליקציה תקרוס בבחירת מצלמה. **תיקון:** בהקמת Capacitor להוסיף את ההרשאות והמחרוזות; לשקול @capacitor/camera לחוויה נייטיבית עקבית.

**[בינוני] package.json:14** — אין שום תלות Capacitor, אין הגדרות StatusBar (ערכת הנייבי #141E36 מול סטטוס-בר לבן ברירת מחדל תיראה שבורה), ואין נכסי Splash — כל תשתית העטיפה הנייטיבית חסרה. **תיקון:** `npm i @capacitor/core @capacitor/cli @capacitor/app @capacitor/status-bar @capacitor/splash-screen`; capacitor.config עם `webDir:'dist'`; `StatusBar.setBackgroundColor('#141E36')` + style בהתאם ל-data-theme; לייצר splash מלוגו הנייבי עם @capacitor/assets.

**[בינוני] src/DrillLibrary.jsx:110** — `loadDrills` טוען את כל טבלת drills עם `select('*')` + שלושה joins (מחבר, כל הדירוגים, כל השמירות) בלי limit ובלי עימוד. ספריית תרגילים קהילתית גדלה בלי גבול — המסך יאט וה-egress יתנפח. **תיקון:** עימוד (range) או limit ראשוני עם "טען עוד", ורשימת עמודות מפורשת במקום `*`.

**[בינוני] src/TrainingPlans.jsx:638** — `deletePart` מריץ UPDATE נפרד וסדרתי לכל פריט שאחרי החלק שנמחק (N+1). תוכנית עם 20 פריטים = 20 round-trips; כשל באמצע משאיר מספרי חלקים לא עקביים בלי דרך לשחזר. **תיקון:** עדכון אצווה אחד — RPC קטן בפוסטגרס (`UPDATE ... SET part = part - 1 WHERE plan_id = X AND part > pn`) או לפחות Promise.all.

**[בינוני] src/Dashboard.jsx:12** — PlayerDashboard (כמעט 2000 שורות) וכל עולם השחקן שהוא גורר סטטית (PlayerTeamHub, PlayerGoals, PlayerTimeline, PlayerCommunity, FeedbackSheet...) יושבים ב-chunk הראשי (398KB / 120KB gzip) — כל מאמן מוריד את כל מסכי השחקן שלעולם לא יראה. זה המועמד הגדול ביותר ל-lazy שנשאר. **תיקון:** `const PlayerDashboard = lazy(() => import('./PlayerDashboard'))` — כבר יש Suspense+ErrorBoundary במקום, זה שינוי של שורה.

**[בינוני] src/index.css:1** — 760KB מקור / 493KB בנוי (82KB gzip) של CSS אחד נטען חוסם-רינדור בכל עמוד כולל דף הנחיתה. עלות ה-parse על מובייל זול מורגשת, וכלל ה-append-only מבטיח שזה רק גדל, כולל כללים דרוסים שנשארים לנצח. **תיקון:** בלי לגעת בקיים: לפתוח קובץ המשך חדש (index2.css) לתוספות מכאן והלאה שמיובא רק מהמסכים הרלוונטיים, ו/או critical-CSS קטן לדף הנחיתה. ה-hash על הקובץ כבר נותן קאש טוב בין ביקורים.

**[בינוני] src/Home.jsx:88** — אותן טבלאות נשלפות במקביל ע"י רכיבים-אחים על מסך הבית: `team_practice_slots` עם `select('*')` נטען בנפרד ב-Home.jsx:88, HomeSections.jsx:53, HomeSections.jsx:221 ו-NextPractice.jsx:43 — ארבע שליפות זהות ברינדור אחד (17 נקודות קריאה בכל הקוד). `schedule_entries` נטען פעמיים-שלוש באותו מסך. **תיקון:** לשלוף פעם אחת ב-Home ולהעביר כ-props, או hook משותף עם קאש קצר (SWR ידני פשוט).

**[בינוני] src/main.jsx:34** — אין ErrorBoundary ברמת השורש — App, Toaster ו-AccessibilityWidget מרונדרים חשופים. ה-boundaries הקיימים מכסים רק את תוכן המסך בתוך Dashboard/PlayerDashboard; קריסה ב-chrome (ניווט, sidebar, QuoteStrip, מסכי ה-Auth/Landing) = מסך לבן מלא. **תיקון:** לעטוף את `<App />` ב-ErrorBoundary נוסף ב-main.jsx (הרכיב כבר קיים ומקבל prop של screen).

**[בינוני] src/Community.jsx:836** — אין React.memo באף רכיב באפליקציה (ו-useMemo קיים רק ב-Attendance.jsx שהוא קובץ מת). ב-Community כל state של הקומפוזר (כל הקשה בטקסט, כל תמונה) יושב באותו רכיב עם רשימת 500 ההודעות — כל הקשה מרנדרת מחדש את כל הפיד. אותו דפוס ב-DrillLibrary (חיפוש מעל כל הכרטיסים). **תיקון:** לפצל את הקומפוזר לרכיב-בן עם state משלו, ו-React.memo על פריט הודעה/DrillCard.

**[בינוני] src/Dashboard.jsx:412** — `key={view}` על `.main-inner` מפרק ומרכיב את כל המסך בכל מעבר ניווט (בשביל אנימציית כניסה) — כל ה-state נזרק וכל השאילתות רצות מחדש בכל ביקור חוזר, גם ניווט הלוך-חזור של שנייה. **תיקון:** להפעיל את האנימציה עם class + animationend במקום remount, או לפחות לשמר קאש נתונים מחוץ לרכיבים (module-level) כדי שחזרה למסך לא תשלוף הכול שוב.

**[בינוני] src/storage.js:30** — אין thumbnails בכלל — ההעלאה נדחסת ל-1600px וזה הקובץ שמוצג גם ברשימות: אווטאר 72px ב-profile, תצוגות פיד, כרטיסי תרגיל — כולם מורידים את ה-JPEG המלא. פיד עם 20 פוסטים עם תמונות = עשרות MB במובייל. **תיקון:** להשתמש ב-Supabase Image Transformations בכתובת התצוגה (width=200 לאווטאר, width=600 לפיד), או להעלות גרסת thumb שנייה ב-uploadImage.

**[בינוני] src/PlayerGoals.jsx:192** — שישה דיאלוגים עם `role="dialog"` לא משתמשים ב-useFocusTrap הקיים: PlayerGoals.jsx:192, FeedbackSheet.jsx:112, Notifications.jsx:158, Community.jsx:408 (לייטבוקס), DrillCard.jsx:236, AccessibilityWidget.jsx:170+270. פוקוס בורח מאחורי הדיאלוג במקלדת/קורא-מסך, ו-Escape לא סוגר בחלקם — דווקא בווידג'ט הנגישות עצמו. **תיקון:** לחבר `useFocusTrap(open, onClose)` לכל אחד מששת הדיאלוגים, כפי שנעשה כבר ב-confirm.jsx וב-SendToPlayers.jsx.

**[בינוני] src/AccessibilityWidget.jsx:295** — אימייל יצירת קשר בהצהרת הנגישות שבווידג'ט (coachadiriagam@gmail.com) שונה מהאימייל בהצהרה הציבורית public/accessibility.html:39 וב-privacy/terms (agam15122003@gmail.com) וגם מ-mailto מחיקת חשבון ב-PlayerDashboard.jsx:1776. חוסר עקביות בערוץ פניות נגישות/פרטיות הוא חשיפה רגולטורית קטנה ומבלבל הורים. **תיקון:** לבחור כתובת רשמית אחת, לרכז אותה בקבוע אחד (constants.js) ולעדכן את הווידג'ט, שלושת קבצי ה-HTML הציבוריים ו-PlayerDashboard.

**[בינוני] src/CoachOfWeek.jsx:2** — שבעה קבצים מייבאים אייקוני כיוון ישירות מ-lucide-react ועוקפים את src/DirIcon.jsx: CoachOfWeek, CoachProfile:7, Messages:3, MyDrills:2, PlanNotebook:2, Schedule:3, TrainingPlans:3. כיוון החץ קשיח — במעבר לאנגלית (i18n.js:161 מחליף dir) החצים מצביעים הפוך. **תיקון:** להחליף בכל שבעת הקבצים ל-DirIcon (Chevron/Arrow כיווניים) כפי ש-16 קבצים אחרים כבר עושים.

**[בינוני] src/index.css:14349** — הפרת חוק "שני גרדיאנטים בלבד באפליקציה" (DESIGN.md:55) — 254 הופעות gradient בקובץ, חלקן עם hex גולמי בניגוד לחוק הטוקנים: #FFC978 (14349), #101B33 (6355), #101A2E (10348), וגרדיאנט שלישי בסגנון חדש ב-16110 (orange-600→brand-strong). **תיקון:** למפות את הגרדיאנטים לשתי המשפחות המותרות (hero נייבי, מילוי התקדמות כתום), להמיר hex גולמי לטוקנים, ולמחוק/לאחד את החריגים בבלוקים החדשים.

**[בינוני] src/PlayerDashboard.jsx:1** — רכיב של 1992 שורות עם ~25 תתי-רכיבים פנימיים ו-session/membership מוזרמים דרך כל שכבה — כל שינוי קטן מסכן את כל מסך השחקן (קהל הקטינים), וקשה לבדיקה. גם Community (1302), TrainingPlans (1222), Schedule (1040), TacticsBoard (883), Auth (835) חורגים מ-800 שורות. **תיקון:** לפצל את PlayerDashboard לקבצים לפי אזור (MyAssignments, PlayerSchedule, PlayerVideos, HomeRsvp...) ולהעביר session/membership ל-Context. לפצל את השאר בהדרגה באותה שיטה.

**[בינוני] src/TacticsBoard.jsx:58** — כפילות לוגיקה: TacticsBoard.jsx ו-CourtDiagram.jsx מכילים אותו רינדור SVG של מגרש/שחקנים/חצים (אותם hex, אותם עיגולים r=14) בשני עותקים; escapeHtml מוגדר גם ב-ChatWindow.jsx:46 וגם ב-TrainingPlans.jsx; timeAgo משוכפל ב-Community, Notifications, PlayerDashboard. תיקון באחד לא מגיע לשני. **תיקון:** לחלץ רכיב מגרש משותף (CourtSvg) שישרת את שניהם, ולהעביר escapeHtml ו-timeAgo ל-utils משותף.

**[בינוני] src/index.css:16034** — `.land-loop-step` בבלוק חדש משתמש ב-`text-align: right` פיזי במקום start — במעבר לאנגלית (LTR) הטקסט בדף הנחיתה יישאר מיושר ימינה ויישבר ויזואלית. **תיקון:** להחליף ל-`text-align: start` (ולסרוק את הבלוקים החדשים מ-15000 ומטה על אותו דפוס).

**[בינוני] src/PlayerDashboard.jsx:466** — מחרוזות X/Y מספריות בתוך טקסט עברי בלי `dir="ltr"`: שורה 466 (`{doneCount}/{items.length}`) ושורה 1570 (marks X/Y יעדים) — בניגוד לחוק RTL מס' 1 ב-CLAUDE.md; בסביבת RTL הסלאש והמספרים עלולים להתהפך (Y/X). **תיקון:** לעטוף ב-`<b dir="ltr">` או `<bdi>` כפי שנעשה כבר בשורות 346 ו-1487 באותו קובץ.

**[בינוני] src/FeedbackSheet.jsx:13** — הטוקן `--c-gold` לא מוגדר בשום מקום ב-index.css — כל השימושים (FeedbackSheet.jsx:13, index.css:14094, 15598) נופלים ל-fallback עם hex גולמי (#DFA23C / #b8862f), כך שצבע ה"זהב" לא מגיב למצב כהה ואינו חלק ממערכת הטוקנים. בנוסף hex גולמי ישיר #C85A4E בשורה 15. **תיקון:** להגדיר `--c-gold` ב-`:root` ובמצב כהה, ולהחליף את #C85A4E בטוקן (או --warn קיים).

---

### נמוך

**[נמוך] src/supabaseClient.js:5,20** — `createClient` נקרא בלי אובייקט auth — persistSession=true ל-localStorage (מפתח sb-<ref>-auth-token), autoRefreshToken=true ובלי flowType מפורש, לצד 43 קריאות localStorage נוספות (טיוטות תרגילים ותוכניות, קוד הצטרפות, הגדרות). הטוקן נשאר בדפדפן ללא תפוגת חוסר-פעילות — בעייתי במיוחד במכשיר משותף/טלפון של ילד — ו-XSS בודד היה מאפשר גניבת סשן מלאה. ה-CSP הקשוח (`script-src 'self'` בלי unsafe-inline) והיעדר dangerouslySetInnerHTML מפחיתים מאוד את הסבירות — סיכון שיורי בלבד. **תיקון:** להעביר ל-createClient `auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, storageKey: '…' }`, להוסיף ניתוק אוטומטי אחרי חוסר פעילות, ולתעד ב-SECURITY.md; אופציה עתידית: storage מותאם או קיצור משך ה-refresh token.

**[נמוך] supabase_players.sql:130** — `compl_player_all` הוא FOR ALL עם בדיקת `player_id = auth.uid()` בלבד; `assignment_id` אינו מאומת מול השיגורים שבאמת נשלחו לשחקן. שחקן יכול לסמן "ביצעתי" ולדווח progress_value שרירותי על שיגורים של קבוצות אחרות, מה שמזהם את מסך "מה נשלח ומי ביצע" של מאמנים זרים. **תיקון:** להוסיף ל-WITH CHECK `exists (select 1 from public.player_assignments a where a.id = assignment_id and (a.player_id = auth.uid() or public.is_team_member(a.coach_id, a.team)))`.

**[נמוך] supabase_engagement.sql:144** — `drills_public_anon_read` (ובנוסף `drills_select_public_or_own` שנוצרה בלי TO ולכן חלה גם על anon) חושפת לגולש לא-מזוהה את כל התרגילים הציבוריים כולל עמודת `created_by` — כלומר רשימת ה-UUID של המאמנים במערכת, בלי צורך בחשבון. זה חומר גלם לניחוש/מיפוי מזהים בקריאות אחרות. **תיקון:** להגיש את דף התרגיל הציבורי דרך VIEW או RPC שמחזיר רק את השדות התצוגתיים (בלי created_by), ולהשאיר את המדיניות הישירה ל-authenticated בלבד.

**[נמוך] public/privacy.html:20** — ניהול גרסאות של המסמכים המשפטיים הוא פרוזה בלבד ("עודכן לאחרונה: אוגוסט 2026") — אין מזהה גרסה במסמך שתואם ל-'v1 · 1.8.2026' שנרשם בהסכמה, ואין ארכיון נוסחים קודמים להוכחת מה אושר. **תיקון:** להוסיף מזהה גרסה + תאריך מדויק בראש כל מסמך, ולשמור עותקי גרסאות קודמות (למשל /legal/v1/…).

**[נמוך] src/PlayerDashboard.jsx:1776** — ערוץ מימוש הזכויות הוא Gmail פרטי (agam15122003@gmail.com) גם במדיניות וגם ב-fallback של בקשת המחיקה — בקשה שנשלחת במייל אינה מתועדת במערכת ועלולה ללכת לאיבוד. **תיקון:** כתובת ייעודית (privacy@…) עם תיעוד פניות, וגוף מייל מובנה ב-fallback שכולל את מזהה המשתמש.

**[נמוך] index.html:29** — פונטים נטענים מ-Google Fonts — כתובת IP של כל משתמש (כולל קטינים) נשלחת לגוגל בכל טעינה; ה-CSP מתיר זאת במפורש (vercel.json). **תיקון:** self-host לקבצי Rubik/Heebo (woff2 בתיקיית public) והסרת הדומיינים מה-CSP.

**[נמוך] src/Teams.jsx:217** — ייצוא סגל ל-CSV מוריד פרטי קטינים (טלפון, הערות) לקובץ לא מנוהל במחשב המאמן, בלי אזהרה ובלי תיעוד. **תיקון:** להוסיף אזהרת אחריות לפני הייצוא ולשקול השמטת עמודות רגישות (injury_note/notes) מהקובץ.

**[נמוך] src/playerReport.js:21** — שרשור ישיר של שם הקבוצה לפילטר PostgREST: ``.or(`player_id.eq.${pid},team.eq.${team}`)`` — שם קבוצה עם פסיק או סוגריים ישבור את הפילטר או ירחיב אותו (ספירת "משימות שנשלחו" שגויה). ה-RLS מגביל את הדליפה לשורות שהמשתמש ממילא רשאי לראות, ולכן זו בעיית עמידות ולא דליפה. **תיקון:** לפצל לשתי שאילתות נפרדות (eq על player_id ו-eq על team) או להשתמש ב-`.filter()` עם ערכים מצוטטים כנדרש ב-PostgREST.

**[נמוך] src/DrillLibrary.jsx:46** — `isCoach = (profile?.role || 'coach') !== 'player'` — כשהפרופיל עוד לא נטען ברירת המחדל היא הרשאות מאמן ב-UI (fail-open). ה-RLS חוסם בפועל, אבל כיוון ברירת המחדל הפוך מעקרון fail-safe וכפתורי מאמן עלולים להבהב לשחקן. **תיקון:** לשנות את ברירת המחדל ל-fail-closed: `const isCoach = profile?.role === 'coach'` (או להסתיר פעולות עד שהפרופיל נטען).

**[נמוך] package.json:1** — npm audit: שתי חולשות high (vite <=6.4.2 — path traversal בקבצי `.map` בשרת הפיתוח + חשיפת NTLMv2 ב-Windows; postcss <=8.5.17 — path traversal ב-source maps) ואחת moderate (esbuild — אתר זר יכול לקרוא תגובות משרת הפיתוח). כולן בשרשרת הבנייה/שרת הפיתוח בלבד ואינן נשלחות לפרודקשן, אבל שרת dev פתוח במכונת הפיתוח חשוף. **תיקון:** `npm audit fix` / שדרוג vite לגרסה מתוקנת (7.x או 6.4.3+), שיעדכן גם esbuild ו-postcss.

**[נמוך] src/ResetPassword.jsx:49** — `window.location.href=origin` (וגם window.location.reload ב-main.jsx:29, ניקוי hash ב-App.jsx:25,198) — hard reload ב-WebView עובד אך גורם הבזק טעינה מלא ואיבוד state; לא שובר אך מרגיש לא-נייטיבי. **תיקון:** לחזור הביתה דרך state של React (איפוס isRecoveryMode) במקום ניווט מלא.

**[נמוך] src/index.css:3992** — DESIGN.md דורש יעדי מגע 44px ומעלה, אך ord-btn/star/msg-del/toast-x/img-remove מוגדרים ל-min 36px בלבד, וצ'יפים (שורה 573: padding 8/14 + פונט 14) יוצאים כ-35px גובה — קטן מהנדרש למגע באצבע. **תיקון:** להעלות ל-min-width/height:44px (או להוסיף padding/hit-area פסאודו-אלמנט) לכל כפתורי האייקון והצ'יפים.

**[נמוך] src/TeamConnect.jsx:52** — ה-QR נוצר דרך api.qrserver.com — תלות בשירות צד ג' ששולח אליו את קוד ההצטרפות של קבוצת קטינים; באפליקציה גם עלול להיחסם ע"י CSP/רשת ומקודד origin שגוי (ראה ממצא ה-origin ב-share.js). **תיקון:** לייצר QR לוקלית עם ספרייה קלה (למשל qrcode ~10KB) במקום שירות חיצוני.

**[נמוך] src/Community.jsx:843** — בכל INSERT ב-realtime ובכל poll של 30 שניות נטען כל הפיד (500 שורות + פרופילים) מחדש במקום לצרף את ההודעה החדשה, וה-polling ממשיך גם כשהטאב ברקע — בזבוז סוללה ו-egress בכל 5 מסכי הצ'אט. **תיקון:** לצרף את שורת ה-payload של האירוע ל-state, ולעצור polling כש-`document.visibilityState !== 'visible'`.

**[נמוך] src/Home.jsx:91** — שליפת practice_attendance של המאמן ללא תיחום תאריך — כל היסטוריית הנוכחות מאז ומעולם רק לחישוב אחוז. אחרי שתי עונות זה אלפי שורות בכל טעינת דף הבית (HomeSections.jsx:308 כבר עושה את זה נכון עם gte של 30 יום). **תיקון:** להוסיף `.gte('session_date', ...)` לחלון הרלוונטי, כמו ב-HomeSections.

**[נמוך] src/Attendance.jsx:1** — קבצים מתים בריפו: Attendance.jsx (257 שורות, מוזכר רק בהערות), DrillSketch.jsx, clipStore.js, SmartImage.jsx + src/data/images.json (מערכת ה-LQIP כולה לא מיובאת מאף מקום). לא נכנסים ל-bundle אבל מבלבלים ומזמינים באגים בעריכה עתידית. **תיקון:** למחוק את ארבעת הקבצים ואת images.json, או לתעד למה נשמרים. scripts/check-imports.mjs לא תופס קבצים שלמים שאינם מיובאים — שווה להוסיף לו בדיקה כזו.

**[נמוך] package.json:17** — תלויות מוצהרות שאינן מיובאות בשום מקום ב-src: lenis, motion, clsx, tailwind-merge. לא מנפחות את ה-bundle (tree-shaking) אבל מגדילות התקנה, npm audit surface ובלבול. **תיקון:** `npm uninstall lenis motion clsx tailwind-merge`.

**[נמוך] src/Community.jsx:374** — תמונות הפיד עם loading=lazy אבל בלי width/height או aspect-ratio — כל תמונה שנטענת מזיזה את הפיד (CLS), מעצבן במיוחד בגלילת מובייל. תצוגות הקומפוזר (שורה 605) בלי lazy בכלל. **תיקון:** לשמור מידות בעת ההעלאה (יש כבר bitmap ב-storage.js) ולכתוב width/height על ה-img, או aspect-ratio ב-CSS החדש.

**[נמוך] src/TrainingPlans.jsx:103** — `loadPlans` שולף `select('*')` עם items מקוננים על כל התוכניות הנגישות (שלי + קהילה) בלי limit — יגדל עם הקהילה. **תיקון:** רשימת עמודות מפורשת ו-limit עם "טען עוד" לטאב הקהילה.

**[נמוך] src/NextPractice.jsx:109** — טיקר setInterval של שנייה לספירה לאחור מרנדר את הכרטיס כל שנייה כל עוד דף הבית פתוח (וכן שני טיקרים דומים ב-PlayerDashboard.jsx:195,1308). מוכל ברכיב קטן אז הנזק מוגבל, אבל מיותר כשהיעד רחוק. **תיקון:** לעדכן כל דקה כשנותרו מעל שעה, ולעבור לשנייה רק מתחת לדקות האחרונות.

**[נמוך] CLAUDE.md:21** — תיעוד לא מעודכן: CLAUDE.md עדיין מציין Karantina כפונט שלישי, בעוד DESIGN.md:45 קובע שהוסר ב-26.7 ו-index.html טוען רק Rubik+Heebo — סוכן/מפתח הבא עלול להחזיר את הפונט. **תיקון:** לעדכן את שורה 21 ל"Rubik / Heebo" בלבד.

**[נמוך] src/PlayerDashboard.jsx:356** — כפתור-אייקון בלי aria-label: כפתור ה-Check לרישום התקדמות מותאמת אישית מכיל רק `<Check size={14}/>` — קורא מסך מקריא "כפתור" בלי הקשר, בניגוד לחוק 2 ב-CLAUDE.md. **תיקון:** להוסיף `aria-label={L('שמירת ערך','Save value')}` לכפתור.

**[נמוך] src/FeedbackSheet.jsx:141** — סגנון inline עם `color:'#fff'` ורקע מ-m.col — hex גולמי ב-JSX בניגוד לחוק הטוקנים (DESIGN.md); דפוס דומה גם ב-CourtDiagram/TacticsBoard (SVG מגרש — שם זה גבולי כי מדובר בציור, אך `fill="var(--...)"` עובד גם ב-SVG). **תיקון:** להחליף ל-var(--surface)/טוקן טקסט הפוך, ולשקול המרת ה-hex ב-SVG המגרש לטוקנים.

**[נמוך] src/Media.jsx:16** — Media מקבל props של session ו-profile ולא משתמש באף אחד מהם — שריד מהגרסה הקודמת שמסתיר את החוזה האמיתי של הרכיב. **תיקון:** להסיר את שני ה-props מהחתימה ומהקריאה ב-Dashboard.

**[נמוך] src/TrainingPlans.jsx:711** — HTML ההדפסה משתמש ב-`font-family: Arial` ו-hex גולמי (#111, #333, #555) — כמסמך הדפסה נפרד זה פטור מחוק הטוקנים, אבל הפונט סוטה מ-Rubik/Heebo גם בהדפסה, כך שהפלט המודפס לא נראה כמו המותג. **תיקון:** לטעון Rubik ב-HTML ההדפסה (או `font-family: Rubik, Arial`) וליישר את צבעי הדיו לערכי הטוקנים.

---

## צ'קליסט תאימות — קטינים ופרטיות

| סעיף | מצב | מיקום | הערות |
|---|---|---|---|
| 1. זיהוי קטינים | חלקי | src/ProfileForm.jsx:314-324, supabase_legal_launch.sql:24-32, supabase_player_card.sql:20 | שנת לידה חובה לשחקן, נאכפת בטופס ובטריגר DB — גרנולריות שנה בלבד בפרופיל (מזעור טוב). אבל: חישוב הגיל קלנדרי (מסווג בני 17 כבגירים עד יום ההולדת), המאמן מזין תאריך לידה מלא ב-team_players במקביל, ואין שום אימות גיל לחשבון מאמן (התנאים דורשים 18+ אך דבר לא בודק). נדרשת בדיקת עורך דין. |
| 2. מנגנון הסכמת הורים | חלקי | src/ProfileForm.jsx:336-368, supabase_legal_launch.sql:17-43 | קיימים שדות guardian_name/email/phone וטריגר DB שחוסם שמירת פרופיל קטין בלי מייל הורה + consent_at. אבל ההורה אינו ישות במודל ואינו מבצע שום פעולה: הקטין מסמן את הצ'קבוקס בעצמו, אין שליחת מייל להורה (אין תשתית דיוור), ואין מצב 'ממתין לאישור' — ההבטחה ב-JoinWithCode.jsx:261 על מייל להורה כוזבת. לפי חוק הכשרות המשפטית ספק אם זו הסכמה — חובה בדיקת עורך דין. |
| 3. תיעוד הסכמה | חלקי | src/ProfileForm.jsx:114-121, supabase_privacy4.sql:115-117, supabase_legal_launch.sql:13-14 | נרשם מי (guardian_*), מתי (guardian_consent_at) ואיזו גרסה (guardian_consent_version). אבל הכול נכתב מצד הלקוח (ניתן לזיוף ב-API ישיר), הגרסה מקובעת בקוד ('v1 · 1.8.2026') בלי טבלת גרסאות מסמכים, והשדות ניתנים לשינוי בכל upsert — אין תיעוד append-only. ערך ראייתי חלש — בדיקת עורך דין נדרשת. |
| 4. מדיניות פרטיות | חלקי | public/privacy.html, מקושרת מ-src/Auth.jsx:350 ומ-src/ProfileForm.jsx:364 | קיימת, בעברית ברורה, מקושרת מצ'קבוקס ההרשמה ומהסכמת ההורה; מכסה סוגי מידע, מטרות, אחסון בחו"ל (Supabase), שמירה 30 יום, זכויות וסעיף קטינים מפורט. אבל סעיף 3 ('איננו מעבירים לצדדים שלישיים') סותר את המציאות — Vercel Analytics, Google Fonts, YouTube ו-rss2json אינם מוזכרים; TODO בקוד (שורה 17) מציין שטרם עברה עורך דין — חובה לפני השקה. |
| 5. תנאי שימוש | קיים | public/terms.html, מקושר מ-src/Auth.jsx:346 | קיימים, מקושרים מההרשמה (צ'קבוקס חוסם), מנוסחים בעברית פשוטה; סעיף 2 מגדיר גילאים (מאמן 18+, שחקן קטין בהסכמת הורה) וסעיף 3 את אחריות המאמן. פערים: ההורה של קטין לא מאשר את התנאים (רק את המדיניות), ואין תיעוד גרסה. הנוסח מעולם לא נבדק על-ידי עורך דין — נדרש. |
| 6. מדיה של קטינים | חלקי | src/storage.js:45-53, src/ProfileForm.jsx:200-207, supabase_privacy4.sql:154-191 | סרטוני תרגול מוצגים לשחקנים רק אחרי אישור אדמין (מנגנון approved — קיים). אבל קטין מעלה תמונת פנים (כולל capture עצמי) ל-bucket 'media' ציבורי — נגיש לכל אינטרנט בלי התחברות, בלי הסכמה ספציפית לפרסום תמונת קטין, ובלי מחיקת קבצים בעזיבה/מחיקה. בדיקת עורך דין נדרשת לעניין פרסום דמות קטין. |
| 7. מזעור מידע | חלקי | profiles: supabase_players.sql:8-10, supabase_privacy4.sql:115-117; team_players: supabase_teams_admin.sql:9-55, supabase_player_card.sql:20-22 | נאסף על שחקן: מייל+סיסמה (auth), שם פרטי+משפחה, מועדון (רשות), טלפון (רשות, נכפה לא-ציבורי), תמונה, שנת לידה, עמדה, guardian_name/email/phone/consent. בנוסף המאמן מזין ב-team_players: name, number, status (כשיר/פצוע/חולה), position, birth_year, phone, notes (טקסט חופשי), injury_note (מידע בריאות!), birth_date מלא, height, availability_since; וכן coach_notes נסתרות, ונתוני פעילות: נוכחות, effort+mood+focus, משוב, יעדים, הודעות, client_errors (user_agent+stack). לא חיוניים: birth_date מלא (כפילות לשנה), height, phone של הקטין עצמו בפרופיל, notes חופשי. חיובי: אנון לא קורא profiles כלל, עמודות רגישות נחסמו ברמת grant (privacy4). |
| 8. זכויות נושא המידע | חלקי | עריכה: src/ProfileForm.jsx; מחיקה: src/PlayerDashboard.jsx:1766-1784; הורה: public/privacy.html §7 | עיון/תיקון — רק בפרטי הפרופיל העצמי; אין מסך 'כל המידע עליי' (נתוני roster שהמאמן מזין, coach_notes ונתוני פעילות אינם נגישים לעיון/תיקון). ייצוא — אין בכלל. מחיקה — כפתור בקשה קיים אך אין אדמין שרואה אותה ואין ביצוע בפועל. זכויות הורה — מייל Gmail פרטי בלבד, ללא תהליך מובנה או אימות זהות ההורה. בדיקת עורך דין נדרשת. |
| 9. אבטחת מידע לפי התקנות | חלקי | vercel.json (headers/CSP), supabase_privacy4.sql, supabase_security2/3/hardening.sql | הערכת סיווג: מאגר עם מידע רגיש (בריאות — injury_note/status/mood) על קטינים — סביר רמת אבטחה בינונית לפחות לפי תקנות אבטחת מידע התשע"ז-2017; קביעה סופית לממונה/עורך דין. קיים: TLS מלא (Vercel/Supabase), CSP+headers קשוחים, RLS נרחב כולל חסימת עמודות רגישות, סיסמה 8+ תווים. חסר: תיעוד גישה (audit log), מסמך הגדרות מאגר, נוהל אירוע אבטחה, 2FA לאדמין, ביקורת תקופתית. עומק טכני של RLS/הרשאות מכוסה על-ידי סוכני האבטחה 1-2 — כאן רק ההיבט הרגולטורי. |
| 10. זרימות לצד שלישי | חלקי | src/main.jsx:14 (Vercel Analytics), index.html:26-29 (Google Fonts), src/youtube.js:40, src/constants.js:278-299 (rss2json+Google News), vercel.json (CSP) | Supabase — כל ה-PII כולל קטינים; אזור האחסון לא ניתן לקביעה מהקוד (VITE_SUPABASE_URL בסביבה) — לוודא בדשבורד; המדיניות מגלה 'שרתים מחוץ לישראל'. Vercel — אחסון + Analytics (IP, צפיות עמודים, כולל קטינים) — לא מוזכר במדיניות. Google Fonts — IP של כל משתמש לגוגל. YouTube — thumbnails מ-img.youtube.com (IP+referer); embeds ב-youtube-nocookie (טוב). googleapis.com — חיפוש סרטונים (שאילתות מאמן). rss2json (ארה"ב) — IP בלבד, בלי מידע אישי. העברת מידע קטינים לחו"ל דורשת בסיס לפי תיקון 13 — חובה בדיקת עורך דין. |
| 11. שמירה ומחיקה | חסר | supabase_legal_launch.sql:46-65, src/PlayerDashboard.jsx:1766-1784, supabase_players.sql:69 | המדיניות מבטיחה מחיקה תוך 30 יום אך אין שום מנגנון ביצוע: אין UI אדמין לבקשות, אין מחיקת auth user, אין ניקוי Storage. עזיבת קבוצה / מחיקת חשבון משאירות את שורת ה-roster המלאה אצל המאמן (set null בלבד). במלאות 18 — כלום: פרטי ההורה נשמרים לנצח. אין שום job/מדיניות retention לנתוני פעילות, צ'אט או client_errors. זהו הפער הגדול ביותר מול ההצהרות — בדיקת עורך דין נדרשת. |

> **הבהרה:** הצ'קליסט הזה הוא ניתוח טכני-הנדסי של מצב הקוד מול דרישות מוכרות (חוק הגנת הפרטיות ותיקון 13, חוק הכשרות המשפטית והאפוטרופסות, תקנות אבטחת מידע התשע"ז-2017). הוא **אינו ייעוץ משפטי**. כל הסעיפים המסומנים "נדרשת בדיקת עורך דין" — ובכללם מנגנון הסכמת ההורים, נוסחי המדיניות והתנאים, סיווג רמת האבטחה של המאגר, העברת מידע קטינים לחו"ל ופרסום דמות קטין — חייבים אישור עורך דין המתמחה בפרטיות ובדין ישראלי לפני השקה עם קטינים.

---

## תוכנית פעולה

### 1. חובה לפני שמשתמש אמיתי — ובמיוחד קטין — נכנס

1. `profiles_select_authenticated` USING(true) (supabase_stage2.sql:68) — צמצום המדיניות + RPC ללוקאפ שמות.
2. `messages_insert_own` בלי בדיקת קשר (supabase_messages.sql:53) — דרישת קשר קבוצתי, חסימת מבוגר-זר↔קטין.
3. bucket `media` ציבורי בלי מדיניות storage.objects (supabase_launch_migration.sql:144 + src/storage.js:45) — Private + signed URLs.
4. הסכמת הורה שנכתבת בידי הקטין (src/ProfileForm.jsx:119) — revoke על guardian_*/birth_year + Edge Function עם טוקן להורה.
5. `shouldCreateUser` פתוח ב-signInWithOtp (src/Auth.jsx:184) — סגירת יצירת חשבון בזרימת ההתחברות + CAPTCHA.
6. עקיפת נעילת role דרך first_name=null (supabase_security3.sql:37) — חסימת שינוי role לחלוטין.
7. מדיניות Storage בלי שיוך לבעלים (supabase_launch_migration.sql:146) — הצמדה לנתיב auth.uid().
8. `banned` לא נבדק באף מדיניות (supabase_teams_admin.sql:111) — `is_banned()` + ban_duration ב-Auth.
9. `drills_select_authenticated` שרידה (supabase_stage3.sql:62) — drop policy + סריקת `qual='true'` בכל הטבלאות.
10. קהילת המאמנים פתוחה לשחקנים (supabase_community_chat.sql:43 + supabase_community.sql:19,23) — `is_coach()` בכל המדיניות.
11. אין מדיניות DELETE לאדמין על תוכן (supabase_community.sql:26) — `<t>_admin_delete` + כפתור "הסר תוכן" בפאנל.
12. `player_messages` כחדר ארצי בין קטינים זרים (supabase_security3.sql:60) — צמצום לפי קבוצה או מודרציה מלאה.
13. הזרקת התראות לכל קטין (supabase_engagement.sql:28) — דרישת קשר ב-WITH CHECK או RPC.
14. הודעה כוזבת על מייל להורה (src/JoinWithCode.jsx:261) — תיקון הטקסט למציאות (גיל 18, בלי הבטחת מייל).
15. חישוב גיל קלנדרי (supabase_legal_launch.sql:25 + src/ProfileForm.jsx:41) — סף שמרני `<= 18`.
16. זרימת אישור בקשות ההצטרפות מתה (src/players.js:127) — הסרת birth_year מה-select + הפסקת בליעת שגיאות.
17. טוקנים ומייל אישי בהיסטוריית git (public/__devlogin.html:1) — שכתוב היסטוריה או החלטת סיכון מתועדת + ריפו פרטי.
18. מפתח Google בהיסטוריית git (src/constants.js:253) — רוטציה + הגבלת referrer/API.

### 2. חובה לפני השקה

1. מחיקת חשבון שאינה מבוצעת (src/PlayerDashboard.jsx:1774) — מסך "בקשות מחיקה" ב-Admin + Edge Function שמוחקת auth user, roster ו-Storage.
2. מדיניות פרטיות סותרת את המציאות (public/privacy.html:44) — פירוט מעבדי משנה או צמצום שירותים; אישור עו"ד.
3. רשומת הסכמה לא אמינה כראיה (src/ProfileForm.jsx:120) — טבלת `consent_log` append-only שנכתבת בשרת.
4. נתוני roster של קטין נשמרים לנצח (supabase_players.sql:69) — מחיקה/אנונימיזציה בעזיבה ובמחיקת חשבון + job retention.
5. `.phone-link` וכל טקסט ב-`var(--accent)` (src/index.css:2927) — מעבר ל-`--accent-strong`; כשל AA באתר עם הצהרת נגישות.
6. PlayerGoals בלי loading/error handling (src/PlayerGoals.jsx:41) — פירוק `{data, error}`, מצב שגיאה, בדיקת update/delete.
7. צ'אט שנשבר מעל 500 הודעות (src/Community.jsx:791 + PlayerCommunity/CoachChat/TeamChat) — `ascending:false` + reverse.
8. `loadMessages` בלי limit עם polling של 30ש' (src/Messages.jsx:63) — limit + append מה-payload.
9. אישור עו"ד לכל סעיפי הצ'קליסט המסומנים — הסכמת הורים, נוסחים, סיווג המאגר, העברה לחו"ל, פרסום דמות קטין.
10. הקשחות RLS מדרג בינוני שראוי לסגור לפני קהל אמיתי: `mark_migration` פתוח ל-PUBLIC, revoke על כל פונקציות SECURITY DEFINER, `search_path` בטריגרים, זיוף יעדים/מאמץ (`pg_player_insert`, `se_player_all`), `drills_insert_own` בלי role, `client_errors` בלי מגבלות, בקשות חברות בלי קוד, קודי הצטרפות נצחיים, מינימום סיסמה בצד Supabase.

### 3. חובה לפני העטיפה למובייל

1. חסר `viewport-fit=cover` (index.html:9) — הפעלת כל ה-safe-area הקיים.
2. `window.location.origin` בכל בוני הלינקים (src/share.js:11 ו-4 קבצים נוספים) — קבוע SITE_URL.
3. `resetPasswordForEmail` עם origin של capacitor (src/Auth.jsx:146) — redirectTo ל-SITE_URL.
4. אין טיפול ב-Back של אנדרואיד (src/App.jsx:15) — מאזין backButton עם היררכיית סגירה.
5. מחיקת חשבון דרך mailto (src/PlayerDashboard.jsx:1776) — App.openUrl כפתרון ביניים, ומחיקה בתוך האפליקציה לפני App Review (guideline 5.1.1v).
6. תשתית Capacitor חסרה לגמרי (package.json:14) + הרשאות מצלמה/גלריה (src/ProfileForm.jsx:201) + App/Universal Links (src/App.jsx:22) + storage מאובטח לסשן (src/supabaseClient.js:21) + Service Worker שלא נרשם (public/sw.js:28) + 100vh מול מקלדת (src/index.css:161) + window.open לחלונות חיצוניים (src/TrainingPlans.jsx:723) + תגי OG לדומיין הישן (index.html:19) + push notifications (src/notify.js:10).

### 4. נחמד שיהיה / בהמשך

1. ביצועים: עימוד ב-DrillLibrary ו-TrainingPlans, lazy ל-PlayerDashboard, פיצול index.css, איחוד שליפות כפולות ב-Home, ErrorBoundary בשורש, React.memo, `key={view}` ב-Dashboard, thumbnails ב-storage.js, batch ב-deletePart, טיקרים וטעינות ללא תיחום תאריך.
2. איכות ונגישות: useFocusTrap בששת הדיאלוגים, איחוד כתובת המייל הרשמית, DirIcon בשבעת הקבצים, מיפוי גרדיאנטים והטוקן `--c-gold`, פיצול PlayerDashboard והקבצים מעל 800 שורות, איחוד CourtSvg/escapeHtml/timeAgo, `text-align: start`, `dir="ltr"` על X/Y, aria-label לכפתור ה-Check, יעדי מגע 44px.
3. פרטיות ומזעור: הסרת birth_date המלא ו-height, מסך "המידע שלי" עם ייצוא, retention לנתוני פעילות וצ'אט, audit log ונוהל אירוע אבטחה, אישור תנאים בהרשמה עם timestamp, אישור התנאים בידי ההורה, תהליך בגרות ב-18, גרסאות מסמכים, כתובת privacy@ ייעודית, self-host לפונטים, אזהרה בייצוא CSV.
4. תחזוקה: מיספור מיגרציות לפי תלות אמיתית + CI על מסד ריק, אינדקסים לעמודות ה-RLS, `npm audit fix` ל-vite/postcss/esbuild, הסרת תלויות לא בשימוש, מחיקת הקבצים המתים, הקשחת supabaseClient (pkce + ניתוק בחוסר פעילות), QR לוקלי, הדפסה בלי inline script, פילטר PostgREST ב-playerReport, fail-closed ב-DrillLibrary, עדכון CLAUDE.md, hex גולמי ב-FeedbackSheet ובהדפסה, props מיותרים ב-Media.
