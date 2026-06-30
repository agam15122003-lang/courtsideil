# סיכום מעבר — עולם הכדורסל

> העתק את ההודעה הראשונה לצ'אט החדש: "אנא קרא את `HANDOFF.md` ו-`SPEC.md` בתיקיית הפרויקט, ונמשיך."

## הוראות עבודה (חשוב!)
- המשתמש **מתחיל בקוד** — להסביר כל צעד **בעברית**, פשוט וברור.
- **לעבוד צעד אחד בכל פעם** — לתת צעד, לחכות לאישור, להמשיך. לא להציף.
- **לבצע את העריכות בעצמך** בקבצים. תשובות בעברית.
- **לעבוד חסכוני בטוקנים** בלי לפגוע באיכות: תשובות תמציתיות, עריכות ממוקדות (לא לשכתב קבצים שלמים בלי צורך), ולא לקרוא קבצים מיותר.
- **SQL חדש = קטע להדבקה** ב-Supabase SQL Editor (לא קובץ), ותמיד מסתיים ב-`notify pgrst, 'reload schema';` (מונע תקלת cache). המשתמש מדביק ומריץ ומאשר "עבד".
- אחרי כל שינוי קוד: `npm --prefix "C:/Users/AGAM/Downloads/pinkas-hamaman" run build` לוודא שאין שגיאות.
- **עיצוב:** כל UI חדש מציית למערכת העיצוב ב-`SPEC.md` ולטוקנים ב-`index.css` (לא ערכים קשיחים).

## טכנולוגיה
- React + Vite (JS/JSX), Supabase (PostgreSQL + Auth + RLS), אירוח Netlify, אייקונים `lucide-react`.
- תיקייה: `C:\Users\AGAM\Downloads\pinkas-hamaman` · פיתוח: `npm run dev` → localhost:5173.
- עברית RTL מלא · מצב כהה (`ThemeToggle`, נשמר ב-localStorage) · רספונסיבי.
- שם תצוגה: **עולם הכדורסל** (codename/תיקייה נשארו `pinkas-hamaman`).

## מצב נוכחי — מה בנוי ועובד
- **בית** (`Home`) — מסך נחיתה: hero, קיצורי דרך, קישורי תוכן.
- **פרופילים/קהילה** — הרשמה/התחברות + איפוס סיסמה; פרופיל; מאתר מאמנים; פרופיל מאמן לחיץ (תרגילים שלו + תוכניות ששיתף + שליחת הודעה); "האזור שלי" (סטטיסטיקות).
- **ספריית תרגילים** — הוספה עם שדות עשירים; חיפוש/סינון/מיון (כולל "הכי מדורגים"); דירוג כוכבים; מועדפים; תגובות; **תרגילים פרטיים** (`is_public`); **לוח טקטיקה** (`TacticsBoard`: מגרש חצי/שלם, גרירת שחקנים/מגנים/קונוסים/כדור, ריבוי שלבים בתצוגת "שלב בודד" או "כל השלבים").
- **תוכניות אימון** — בונה ידני (סדר/משך/הערה, פתיחת פרטים), **יצירת תרגיל חדש בתוך האימון** (פריט עם title/description בלי drill_id), בנאי חכם אוטומטי (`SmartBuilder`), מצב טיימר (`PlanRunner`), ייצוא PDF (Blob בכרטיסייה), **שיתוף תוכנית** (`is_public`) + העתקה מתוכניות של מאמנים אחרים.
- **לו"ז** (`Schedule`, טאב נפרד) — לוח שנה: בוחרים תאריך → שעות 06:00–22:00 → אימון לכל שעה (קבוצה/אישי) + צירוף תוכנית + הערה.
- **תקשורת** — הודעות פרטיות 1:1 + צ'אט קבוצתי (`Messages` עם מתג; `CommunityChat`); לוח משחקי אימון (`GamesBoard`, מתג בטאב "מאמנים").

## מסד הנתונים (Supabase, הכול עם RLS)
- `profiles` (id, first_name, last_name, club, age_groups, email) — קריאה לכולם, עריכה לבעלים.
- `drills` (+ `is_public` bool ברירת מחדל true, `board` jsonb ללוח טקטיקה, `sketch` text לא בשימוש) — select: `is_public OR owner`; כתיבה לבעלים.
- `drill_ratings` (drill_id,user_id,rating 1-5, unique) — קריאה לכולם, כתיבה לבעלים.
- `saved_drills` (drill_id,user_id, unique) — **פרטי** (owner).
- `drill_comments` (drill_id,user_id,content) — קריאה לכולם, כתיבה/מחיקה לבעלים.
- `messages` (sender_id,recipient_id,content,read_at) — רואים רק הודעות שלי.
- `community_messages` (user_id,content) — קריאה לכולם, כתיבה/מחיקה לבעלים.
- `game_requests` (created_by,age_group,game_date,location,note) — קריאה לכולם, כתיבה/מחיקה לבעלים.
- `training_plans` (id,name,created_by, + `is_public` bool ברירת מחדל false) — owner (all) + select where is_public.
- `plan_items` (plan_id, `drill_id` nullable, position, duration_minutes, note, + `title`,`description` לפריט מותאם) — דרך התוכנית (owner) + select אם התוכנית public.
- `schedule_entries` (created_by, plan_id, note, + `date`,`hour`,`is_personal`; `team`/`day_of_week`/`time` legacy/nullable) — **פרטי** (owner).

> הערה: שינויי הסכמה האחרונים (`drills.is_public`, `drills.board`, `training_plans.is_public`, `plan_items.title/description` + drill_id nullable, `schedule_entries.date/hour/is_personal`) הורצו כקטעי SQL ב-editor (לא נשמרו כקבצים). קבצי ה-SQL ההיסטוריים בשורש: setup, stage2, stage3, stage3_ratings, saved_drills, messages, training_plans, comments, community_chat, games, schedule.

## מבנה הקוד (src/)
`App` · `Landing` (דף נחיתה ציבורי) · `Auth` (עם `onBack`) · `ResetPassword` · `Dashboard` (סרגל צד עם 7 פריטים: בית/פרופיל/מאמנים/תרגילים/תוכניות/לו"ז/הודעות, אייקוני lucide) · `Home` · `ProfileForm` · `MyStats` · `CoachFinder` · `CoachProfile` · `GamesBoard` · `DrillLibrary` · `DrillForm` · `DrillCard` · `TacticsBoard` · `TrainingPlans` (כולל PlanBuilder) · `PlanRunner` · `SmartBuilder` · `Schedule` · `Messages` · `CommunityChat` · `ThemeToggle` · `constants.js` · `supabaseClient.js` · `index.css`. (`DrillSketch.jsx` — legacy, הוחלף ב-TacticsBoard.)

## מערכת עיצוב (ראה SPEC.md)
- טוקנים ב-`index.css`: רמפות צבע + טוקני תפקיד (`--bg`,`--surface`,`--surface-alt`,`--text`,`--text-muted`,`--border`,`--accent`,`--primary` נייבי לכפתורים), `--space-*`, `--radius-*`, `--shadow-*`, גופן Rubik. השמות הישנים (`--court`,`--paper`,`--navy`,`--white`...) הם **כינויים** לחדשים.
- מצב כהה: בלוק `[data-theme="dark"]` שדורס טוקני תפקיד.
- סגנון: מקצועי/נקי, בלי אימוג'ים בכפתורים (טקסט + אייקוני lucide), כפתור ראשי נייבי, כתום כהדגשה.

## מה נשאר (Backlog, לפי בקשות המשתמש)
- 🖼️ **יותר תמונות במסכים הפנימיים** — אווטארים למאמנים (ראשי תיבות בגרדיאנט), איורי מצב-ריק, תמונות־רקע לכרטיסים. ממקורות חוקיים בלבד (SVG מקורי / Unsplash). **טרם בוצע — הצעד הבא.**
- 🔔 התראות (לא נקרא) · 🏷️ תגיות לתרגילים · 👥 סגל שחקנים · 🔍 חיפוש גלובלי · אונבורדינג · PWA.
- דף הבית: קישורי פודקסטים/תוצאות משחקים (כרגע NBA/EuroLeague/FIBA סטטיים).
- **תשלום/מנויים** (Stripe + טבלת subscriptions + Edge Function ל-webhooks) — לקראת launch.

## עדכונים אחרונים (סבב עיצוב + פיצ'רים)
- ✅ **לוח טקטיקה — חצים ואנימציה.** שלושה כלים: **חץ תנועה** (קו מלא נייבי), **חץ מסירה** (מקווקו), **זריקה לסל** (קשת כתומה/פרבולה). גרירה לציור, דאבל-קליק מוחק. מצב **"נגן אנימציה"** — תנועה חלקה בין שלבים (easing + השהייה, requestAnimationFrame); **זריקה לסל מונפשת בקשת** (פרבולה). **"שלב חדש" משכפל את הקודם, ואם יוצא חץ מאובייקט — הוא ממוקם בקצה החץ בשלב הבא** (כולל הכדור בזריקה). הכל ב-`drills.board` jsonb (אין שינוי סכמה).
- ✅ **דף נחיתה ציבורי** (`Landing.jsx`) — נראה למי שלא מחובר. Hero דו-עמודתי, אילוסטרציית מגרש SVG מקורית, סטטיסטיקות, רשת פיצ'רים, "איך זה עובד", רצועת CTA, footer. `App.jsx`: לא-מחובר → Landing; "התחברות" → Auth (עם `onBack`).
- ✅ **שדרוג עיצוב 2.0** — בלוק "Refresh" בסוף `index.css`: רוחב תוכן 720→1040, רקע עם עומק, כפתורים גדולים (`btn-lg`/`btn-soft`), אינדיקטור פעיל בסרגל, כרטיסים מוגבהים, פס גלילה מעוצב, אנימציית כניסה, ליטוש משותף ל-`welcome-card`/`section-title`/`coach-card`/`stat-card`.
- ✅ **כתבות כדורסל חוקיות** (`Home.jsx` + `constants.js`) — אגרגטור: כותרת מקורית + תמונה + **שם מקור (קרדיט) + קישור למקור**, בלי AI ובלי העתקת תוכן. מקורות (`NEWS_SOURCES`, שליפה טורית + קאש 30 דק'): **שתי שאילתות Google News מסוננות-כדורסל מראש** (רחבה כללית קודם, ואז site:sport5.co.il). אין סינון מילות-מפתח (מיותר — השאילתה כבר כדורסל). `isSport5` מקפיץ את ערוץ הספורט לראש. `NEWS_FALLBACK_IMAGES` (Unsplash, חוקי) לכתבות בלי תמונה. `RSS2JSON_KEY` ריק — מפתח חינמי מ-rss2json.com מסיר הגבלת קצב.
  - ⚠️ **תיקון באג:** הגרסה הקודמת סיננה לפי `BASKETBALL_HINTS` והרגה את כל הכתבות (כותרות כמו "קולסון למכבי ת\"א" לא מכילות "כדורסל"). הוסר. ynet כפיד ספורט כללי הוסר (סינון לא אמין); Google News מספק כדורסל ישראלי מדויק כולל Sport5.

- ✅ **שדרוג UX 3.0 (מקצועיות).** קבצים חדשים: `toast.js` (store) + `Toaster.jsx` (ממומש ב-`main.jsx`) — **מערכת Toast** שמחליפה את כל ה-`alert()` הנייטיביים; משוב הצלחה אחרי כל שמירה/מחיקה. `Avatar.jsx` — **אווטאר ראשי-תיבות בגרדיאנט** (צבע דטרמיניסטי לפי שם), בשימוש ב-CoachFinder, CoachProfile, Messages, CommunityChat, Dashboard (הפרופיל שלי). **מחיקת הודעות פרטיות** נוספה ל-Messages (כפתור סל בכל בועה שלי) — **דורש מדיניות RLS** (ראה למטה). אישור מחיקה (`confirm`) + Toast הצלחה בכל המחיקות. כפתורי מחיקה ברורים יותר (`comment-del`/`msg-del`), טבעת פוקוס נגישה, גובה כפתורים אחיד, הסרת אימוג'י (🏗️), תיקון "את/ה"→"אני".
  - ⚠️ **SQL שטרם הורץ:** מדיניות מחיקת הודעות פרטיות —
    `create policy "delete own messages" on public.messages for delete to authenticated using (auth.uid() = sender_id); notify pgrst, 'reload schema';`

- ✅ **סבב QA אדוורסרי (workflow מרובה-סוכנים).** נמצאו ותוקנו 3 באגים + 14 פריטי ליטוש: (באגים) שיוך חץ→אובייקט בלוח הטקטיקה עכשיו חד-חד-ערכי עם סף הדוק; מיון תאריכי כתבות עם `parseDate` (replace ' '→'T', תקין גם ב-Safari/iOS); אזור ה-Toast (`Toaster`) מרונדר תמיד עם `role="alert"` לשגיאות (קוראי מסך). (ליטוש) כל ★/▲/▼/✓ הוחלפו באייקוני lucide (DrillCard, MyStats, TrainingPlans); מצבי-ריק עשירים (`.empty-state`) ל-DrillLibrary/TrainingPlans/GamesBoard; כפתורי מחיקה אחידים (`btn-ghost danger`); `confirm` + Toast הצלחה לכל מחיקה (כולל תגובות ומשחקים); קאש כתבות ישן משמש כגיבוי לכישלון שליפה; תמונות-גיבוי בלי כפילות; גלילה חלקה + scroll-margin בדף הנחיתה; `margin-top` של `btn-primary` הועבר להקשר `.auth-form` בלבד; pointer-capture בגרירה בלוח הטקטיקה; "התחל מהתחלה" באמת מנגן מחדש.

- ✅ **קבוצות, מועדונים, טלפון, ועיצוב וואו.** `constants.js`: נוספה שכבת גיל **"בית ספר לכדורסל"** (ראשונה); `GENDERS=['בנים','בנות']` + `teamLabel/genderOf/ageOf` (קבוצה נשמרת ב-`age_groups` כמחרוזת "<שכבה> <מגדר>"); `ISRAELI_CLUBS` — **144 מועדונים** ממחקר איגוד הכדורסל. **ProfileForm נכתב מחדש** (מקצועי, סקשנים): בורר מועדון מרשימה (`<datalist>`) עם הוספה ידנית, שדה **טלפון + מתג הצגה/הסתרה** (`phone`,`phone_public`, ניתן לשינוי בכל עת), ורשת **קבוצות (שכבה×בנים/בנות)**. CoachFinder מסנן לפי `ageOf`; CoachProfile/Dashboard מציגים טלפון (לפי הרשאה). **עיצוב:** צ'אט מודרני (בועות גרדיאנט עם זנב, כפתור שליחה עגול עם אייקון), Home מפוצץ (זוהר כתום/נייבי, eyebrow זכוכיתי, כותרת גדולה).
  - ⚠️ **SQL שטרם הורץ:** עמודות טלפון —
    `alter table public.profiles add column if not exists phone text, add column if not exists phone_public boolean not null default false; notify pgrst, 'reload schema';`

- ✅ **לו"ז מחדש, מדיה, עיצוב 3.0, והעלאת תמונות.**
  - **לו"ז** (`Schedule.jsx`) נכתב מחדש: בחירת יום + **טווח שעות (התחלה→סיום)**, רשימת אימונים מסודרת, מצב ריק. דורש עמודות `start_time`,`end_time`.
  - **עמוד מדיה** חדש (`Media.jsx` + פריט סרגל "מדיה"): טאב **פודקסטים** (סטטי מ-`PODCASTS`, פתיחה ישירה בספוטיפיי) + טאב **סרטונים** (`Videos.jsx`, טבלת `drill_videos`, הוספת קישור יוטיוב מסווג + סינון לפי קטגוריה + תמונה ממוזערת). `VIDEO_CATEGORIES` ב-constants.
  - **עיצוב 3.0 (בנצ'מרק NBA/ESPN/Stripe/Linear, ממחקר workflow):** גופן כותרות Heebo 800 + tracking שלילי, סקאלת טיפוגרפיה גדולה, ניטרליים קרירים + borders דקים + צללים שכבתיים, **כתום כ-CTA ראשי** (`.btn-primary`), פחות גרדיאנטים (אריחי אייקון שטוחים, מספרים data-grade), hero ברודקאסט (בסיס `--ink-900` + scrim תחתון), eyebrow tokens, מיקרו-אינטראקציות מרוסנות. הכל בבלוק "עיצוב 3.0" בסוף `index.css` + טוקנים חדשים ב-`:root`.
  - **העלאת תמונות** (`storage.js`, bucket ציבורי `media`): **תמונת פרופיל** ב-ProfileForm (+`profiles.avatar_url`, מוצגת ב-Avatar/CoachFinder/CoachProfile/Dashboard) ו**תמונת תרגיל** ב-DrillForm עם `capture` לצילום (+`drills.image_url`, מוצגת ב-DrillCard).
  - ⚠️ **SQL שטרם הורץ** (ראה בלוק מרוכז בצ'אט): עמודות לו"ז, טבלת `drill_videos`+RLS, `avatar_url`/`image_url`, ו-bucket `media`+policies.

- ✅ **התחברות בקוד (OTP) + תיקון פודקסטים.**
  - **Auth.jsx** נכתב מחדש עם מצב **'otp'**: בחירת ערוץ (נייד SMS / מייל) → `signInWithOtp` → הזנת קוד → `verifyOtp`. מתאים גם להרשמה וגם להתחברות (אותו flow). `toE164` ממיר מספר ישראלי (05X → +9725X). כפתור "כניסה עם קוד" מתחת לטופס הסיסמה.
  - ⚠️ **הגדרת Supabase נדרשת (לא SQL):** ל-SMS — Authentication → Providers → **Phone** → enable + ספק SMS (Twilio/MessageBird, בתשלום). ל-**קוד במייל** — Email Templates → Magic Link → להוסיף `{{ .Token }}` (אחרת נשלח קישור כניסה במקום קוד, שגם עובד). בלי ספק SMS — המייל עובד מיד.
  - **פודקסטים** (`PODCASTS` ב-constants): הוחלפו מחיפוש כללי ל**קישורי show ישירים** אמיתיים (אומתו בחיפוש): ספיק נ' רול, ONE מכבי ת"א, ה-NBA של ערוץ הספורט, The Lowe Post, Old Man and the Three, Thinking Basketball, The Hoop Collective.

- ✅ **שדרוג UX/נגישות מבוסס-אודיט (לפי מסמך ההנחיות + workflow אודיט שמצא 64 ממצאים).** `AUDIT.md` ו-`DESIGN_RESEARCH.md` נכתבו. בוצע מצטבר:
  - **שלב 1 — נגישות+עקביות:** פיצול הכתום — `--accent-fill #A8491A`/`--accent-strong` (כהה לרקע בהיר, בהיר לרקע כהה) לעמידה ב-WCAG AA (היה 2.96:1!). `:focus-visible` גלובלי, יעדי מגע ≥36px, איחוד רדיוס/אינפוט, `.welcome-badge` הירוק→eyebrow כתום, הכהיית error/success/tabs/placeholder.
  - **שלב 2 — מובייל:** `.mobile-topbar` (מותג+מצב כהה+התנתקות) + **bottom tab bar** קבוע (Dashboard); `.court--full` (תיקון letterbox), רשת ביטחון `overflow-x`.
  - **שלב 3 — מצבים:** `Skeleton.jsx` (`SkeletonCards`/`SkeletonStats`) ב-7 מסכים; **תיקון באג** Schedule+MyStats שהתעלמו משגיאות (סולם loading→error→empty); מצבי-ריק עם אייקון ל-CoachFinder/Messages/CommunityChat/CoachProfile.
  - **שלב 4 (חלקי):** משוב OTP/DrillForm→Toast, `aria-label` לשדות placeholder-only, `aria-label` ללינק וידאו, `dir="ltr"` לשדות מספר/תאריך.
  - ⏳ **נשאר:** שלב 4 (DrillForm→`.form-section`, busy flags, `aria-pressed` ל-chips), שלב 5 (ResetPassword show/hide+ולידציה חיה, היררכיית GamesBoard, progress ב-PlanRunner, אווטאר מטוקנים).
- ⚠️ **באג OTP מייל:** הסיבה — **custom SMTP מופעל אך לא מוגדר** (Gmail בלי App Password) חוסם את כל המיילים. **פתרון:** Authentication → Emails → SMTP Settings → לכבות "Enable custom SMTP" → Save. הקוד עכשיו מציג את השגיאה ב-Toast.

  - **שלב 4-5 (המשך):** OTP **מייל בלבד** (הוסר SMS שבתשלום), קוד עד 10 ספרות, **טיימר "שלח שוב" 60 שניות** (`cooldown`) למניעת היחסמות. **ResetPassword** — show/hide סיסמה (Eye/EyeOff) + ולידציית התאמה חיה + כפתור "המשך". **SmartBuilder** — toast סיכום תוצאה (כמה תרגילים/דקות מול היעד).
  - ⏳ **נשאר בשלב 4-5:** DrillForm→`.form-section`, busy flags לפעולות אסינכרוניות, `aria-pressed` ל-chips, היררכיית GamesBoard, progress ב-PlanRunner, אווטאר מטוקנים, ניקוי `→` glyphs.

## אימייל (Resend + Supabase) — סטטוס
- **Resend מחובר ועובד** (SMTP מותאם ב-Supabase: host `smtp.resend.com`, port 465, user `resend`, password=API key, sender `onboarding@resend.dev`). בלי דומיין מאומת — שולח רק למייל של חשבון Resend (`coachadiriagam@gmail.com`).
- **מגבלת קצב:** Supabase → Authentication → **Rate Limits** → "emails per hour" ברירת מחדל **2** — להעלות ל-30. פר-משתמש: קוד כל ~60 שניות.
- **תבנית מייל:** להוסיף `{{ .Token }}` ב-Magic Link template כדי שיישלח קוד (לא רק קישור).
- ל-launch: לאמת דומיין ב-Resend כדי לשלוח לכל מאמן.

  - **שלב 4-5 (הושלם ברובו):** טקסט כפתור "כניסה עם קוד למייל"; DrillForm — שדות מזווגים ב-`form-grid-2`; GamesBoard — `form-section` עם כותרת + סימון שדה חובה + כותרת "בקשות פתוחות" + skeleton; PlanRunner — `runner-progress` bar; ResetPassword/SmartBuilder כנ"ל.
  - ⏳ **נשאר (low priority):** busy flags (רוב הפעולות מוגנות-DB), `aria-pressed` ל-chips, Avatar מטוקנים, ניקוי `→` glyphs.

## Backlog כללי (בקשות המשתמש להמשך)
- **פריסה ל-Netlify** — הגרסה החיה ב-Netlify ישנה; כל שדרוגי העיצוב מקומיים. לפרוס מחדש כדי לראות במובייל.
- נוחות/ליטוש כללי, **ציטוטים** מתחלפים, **מעברים/אנימציות** עדינות בין מסכים, ועוד.
- אימות דומיין ב-Resend (ל-OTP/מיילים לכל המשתמשים) — לקראת launch.

- ✅ **דף כניסה/הרשמה פרימיום + ציטוטים + מדיניות סיסמה.**
  - **Auth** נכתב מחדש ללייאאוט **מפוצל** (`.auth-shell`): `.auth-brand-panel` כהה (ink-900 + זוהר כתום) עם לוגו, **ציטוט מתחלף** (7 שניות), וסימני אמון (Check). הטופס ב-`.auth-main`. במובייל הפאנל מוסתר (טופס בלבד).
  - **`COACHING_QUOTES`** ב-constants (ווּדן/ג'ורדן/פופוביץ' וכו'). באנר ציטוט מתחלף גם ב-Home (`.quote-banner`).
  - **סיסמה ≥ 8 תווים** — Auth (הרשמה בלבד, לא חוסם כניסה קיימת) + ResetPassword. ⚠️ לאכיפת-שרת: Supabase → Authentication → Providers → Email → Minimum password length = 8.
  - **השלמת פרטים חובה** — כבר נאכף (אין ביטול כשהפרופיל לא שלם); נוסף מסגור "שלב אחרון בהרשמה" + טקסט מזמין ב-ProfileForm.

- ✅ **דף כניסה ממורכז + ציטוטים בכל המסכים.** Auth שוכתב ללייאאוט **ממורכז** (`.auth-page` > `.auth-topquote` + `.auth-center`) — בלי הפאנל הימני. ציטוט מתחלף (כל דקה) ברצועה בראש העמוד; סימני אמון כצ'יפים צבעוניים (ירוק/כחול/כתום). `QuoteStrip.jsx` בראש כל מסך ב-Dashboard (ממורכז, כחול, `--quote-color`). 22 ציטוטים ב-`COACHING_QUOTES`.
- ✅ **כתבות מגוונות.** `NEWS_SOURCES` = 5 שאילתות לפי נושא (ליגת ווינר/NBA/יורוליג/נבחרת/ערוץ הספורט); Home משלב **round-robin** בין הנושאים (cache v4).
- ✅ **תגיות לתרגילים.** `drills.tags text[]` (דורש SQL). DrillForm — הוספת תגיות חופשיות (chips + X); DrillCard — תגיות לחיצות (#tag) שמסננות; DrillLibrary — `tagFilter` + תגיות בחיפוש + אינדיקציית תגית פעילה.
- ✅ **אונבורדינג.** כרטיס פתיחה בדף הבית למשתמש חדש (3 צעדים, נסגר ל-localStorage `onboarded_v1`).
- ✅ **ליטוש.** גלילה חלקה לראש בכל מעבר מסך (Dashboard).
  - ⚠️ **SQL לתגיות:** `alter table public.drills add column if not exists tags text[]; notify pgrst, 'reload schema';`

- ✅ **שם האפליקציה: `CourtSide`** (היה "עולם הכדורסל"). הוחלף בכל הקבצים (Auth/Dashboard/Home/Landing/ResetPassword) ובכותרת `index.html`. תיקיית הקוד נשארת `pinkas-hamaman`.
- ✅ **ניווט מובייל = מגירה מימין** (לא בר תחתון). Dashboard: כפתור המבורגר (☰) ב-`.mobile-topbar` פותח `state drawerOpen`; ה-`<aside className="sidebar">` הופך ל-`.sidebar.open` (נשלף מימין, `transform: translateX`), עם `.drawer-overlay` ו-`.drawer-close` (X). נסגר בבחירת מסך/קליק על הרקע. CSS ב-`@media (max-width:768px)`.

## 🚀 פריסה (Deployment)
- **חי ב-Netlify:** **https://thebasketballworldisrael.netlify.app** (פרויקט `thebasketballworldisrael`, צוות `agam15122003-lang`).
- **לא מחובר ל-git** → פריסה **ידנית**: `npm run build` ואז גרירת תיקיית `dist` ל-Netlify → Deploys (drag&drop). אחרי כל שינוי צריך לפרוס מחדש.
- מפתחות Supabase מוטמעים ב-build מ-`.env.local` (`VITE_SUPABASE_*`).

## ⚠️ פעולות פתוחות (משתמש)
1. **SQL לתגיות** (אם לא הורץ): `alter table public.drills add column if not exists tags text[]; notify pgrst, 'reload schema';`
2. **פריסה מחדש** של `dist` (אחרי שינויי CourtSide + מגירה).
3. **מובייל — "מלא באגים"** לפי המשתמש; צריך צילומי מסך לאבחון מדויק (המגירה תיקנה את הבר-התחתון הצפוף, אבל ייתכנו באגים נוספים).
4. אימייל OTP עובד דרך **Resend** (SMTP מותאם ב-Supabase), אך בלי דומיין מאומת שולח **רק** ל-`coachadiriagam@gmail.com`. ל-launch: לאמת דומיין ב-Resend. להעלות email rate limit (Supabase → Auth → Rate Limits, ברירת מחדל 2/שעה).

**הצעד האחרון שנעשה:** שם → CourtSide, ניווט מובייל → מגירה מימין. **הבא:** פריסה מחדש, אבחון באגי מובייל (צילומי מסך), הרצת SQL התגיות.
