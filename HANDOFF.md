# HANDOFF — CourtSide

> **הודעה ראשונה לצ'אט חדש:** "אנא קרא את `HANDOFF.md` (ואם צריך `SPEC.md`) בתיקיית הפרויקט, ונמשיך."
>
> עודכן: **24.7.2026** · מסכם את המצב עד קומיט `c021247` (PR #73). קומיטים 1–73 ב-`main`, הכול דחוף ל-origin.

---

## 1. הוראות עבודה (חשוב!)

- המשתמש **מתחיל בקוד** — להסביר כל צעד **בעברית**, פשוט וברור.
- **צעד אחד בכל פעם** — לתת צעד, לחכות לאישור, להמשיך. לא להציף.
- **לבצע את העריכות בעצמך** בקבצים; תשובות בעברית ותמציתיות.
- **חסכוני בטוקנים**: עריכות ממוקדות (לא לשכתב קבצים שלמים), לא לקרוא קבצים מיותר.
- **SQL חדש = גם קובץ `supabase_*.sql` בשורש וגם קטע להדבקה** ב-Supabase SQL Editor. תמיד idempotent (`if not exists` / `drop policy if exists`) ותמיד מסתיים ב-`notify pgrst, 'reload schema';`.
- אחרי כל שינוי קוד: `npm --prefix "C:/Users/AGAM/Downloads/pinkas-hamaman" run build`.
- **עיצוב:** רק טוקנים מ-`index.css` (בלי הקסים קשיחים), אייקוני `lucide-react` (בלי אימוג'ים כאייקונים), RTL תחילה.
- שרת הפיתוח של המשתמש הוא לרוב **5174** (הפריוויו של Claude ב-5173) — צריך רענון קשיח אצלו.

## 2. טכנולוגיה ופריסה

- **React 18 + Vite** (JS/JSX, ללא TypeScript) · **Supabase** (Postgres + RLS + Auth + Realtime + Storage) · `lucide-react` · `@vercel/analytics`. אין Tailwind, אין framer-motion (ב-`main`) — CSS ידני.
- תיקייה: `C:\Users\AGAM\Downloads\pinkas-hamaman` · `npm run dev` → localhost:5173.
- **חי:** https://courtsideil.vercel.app — **Vercel, פריסה אוטומטית בכל מיזוג ל-`main`**. (Netlify הישן לא רלוונטי.)
- **CI:** `.github/workflows/ci.yml` מריץ build על כל push/PR ל-main.
- מפתחות: `.env.local` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (גם ב-Vercel Env).
- **PWA:** `public/manifest.webmanifest` + `public/sw.js` (נרשם ב-`main.jsx` ב-PROD בלבד), אייקונים, `og-image`, `privacy.html`/`terms.html`, `robots.txt`, `sitemap.xml`.
- **אבטחה:** כל הכתובות עוברות rewrite ל-`index.html`; `vercel.json` מגדיר CSP מלא + `X-Frame-Options: DENY` + Permissions-Policy. שינוי דומיין חיצוני (API/מדיה) מחייב עדכון ה-CSP שם.
- **עברית RTL** ברירת מחדל + **אנגלית** (`i18n.js`, `LanguageToggle`, `useLang()` ב-`App`), מצב כהה (`ThemeToggle`), `AccessibilityWidget`.

## 3. שני עולמות: מאמן ושחקן

`profiles.role` = `'coach' | 'player'`. הבחירה נעשית ב-`ProfileForm` (כרטיסי תפקיד, שלב ראשון בהרשמה). `Dashboard.jsx:174` בודק `profile?.role === 'player'` ומחזיר `PlayerDashboard` — כלומר **שני דשבורדים נפרדים לגמרי**.

**ניווט מאמן** (`Dashboard.jsx` NAV): בית · קהילה · חיפוש מאמנים · הודעות · תרגילים · תוכניות · הקבוצות שלי · לו"ז · מדיה (+ "ניהול" ל-`is_admin`). בר תחתון במובייל: בית/קהילה/תרגילים/הודעות/פרופיל.

**ניווט שחקן** (`PlayerDashboard.jsx` PLAYER_NAV): בית · התרגילים שלי · המטרות שלי\* · לו"ז\* · המאמן שלי\* · האימונים שלי\* · סרטונים · קהילה · הקבוצה שלי\* · פרופיל. (\* = מוצג רק לשחקן שמחובר לקבוצה.) בר תחתון: בית/תרגילים/מאמן/קהילה/פרופיל.

**החיבור ביניהם:** המאמן מייצר **קוד הצטרפות** לקבוצה (`team_join_codes`), השחקן מזין קוד → `team_memberships` בסטטוס `pending` → המאמן מאשר (`players.js: decideMembership`) → נוצרת שורת `team_players` מקושרת ב-`player_id` + התראה. הלוגיקה כולה ב-`src/players.js`.

## 4. מה בנוי ועובד

**צד מאמן**
- **בית** — כרטיס "אימון הבא" עם ספירה לאחור (`NextPractice`), משימות/היילייטס, כתבות כדורסל (אגרגטור Google News + קאש), ציטוט מתחלף (`QuoteStrip`), מאמן השבוע (`CoachOfWeek`, ניקוד בייסיאני).
- **קהילה** (`Community.jsx`, 50KB) — פיד פוסטים עם תמונות וסוגי פוסט (שאלה/טיפ/וידאו/משרה/סקר), לייקים, תגובות, סקרים חיים, אירועים + RSVP, ערוצי צ'אט לפי קטגוריה, שיתוף בוואטסאפ. **זה הלב של האפליקציה.**
- **התראות** (`Notifications.jsx` + `notify.js`) — פעמון עם מונה, Supabase Realtime.
- **תרגילים** — `DrillLibrary`/`DrillForm`/`DrillCard`, כתיבה בסטייל "מחברת מאמן" (`NotebookPage`, `CourtDiagram`), **לוח טקטיקה** (`TacticsBoard`: שלבים, חצים תנועה/מסירה/זריקה, אנימציה), דירוגים, מועדפים, תגיות, טיוטות, דף ציבורי לתרגיל `#/drill/<id>` (`PublicDrill`).
- **תוכניות אימון** — `TrainingPlans` (בונה + יעד 90 דק' + פירוק זמן צבעוני לפי קטגוריה), `SmartBuilder` (אוטומטי), `PlanRunner` (טיימר חי), `PlanNotebook` (מערך אימון להדפסה/PDF), שיתוף והעתקה בין מאמנים.
- **קבוצות** (`Teams.jsx`, 58KB) — סגל, צוות מקצועי, נוכחות (`Attendance`), מטרות (`TeamGoalsBoard`), משחקים + **ייבוא מאיגוד הכדורסל** (`iba.js`, REST של ibasketball.co.il) + **טבלת ליגה** (`LeagueTable`), קודי הצטרפות ואישור שחקנים (`TeamConnect`), שעות אימון קבועות (`TeamSlots`), צ'אט קבוצתי (`TeamChat`), משימות (`TeamAssignments`).
- **לו"ז** (`Schedule.jsx`) — לוח שבועי, אירועים חוזרים, בורר קבוצה, ייצוא לקלנדר (`ics.js`).
- **סיכומי אימון** (`SessionDetail`, `sessionId.js`) — נוכחות, מאמץ 1–10, פידבק אישי, MVP לאימון.
- **שליחה לשחקנים** (`SendToPlayers` + `sendToPlayers.js`) — דחיפת תרגילים/משימות לקבוצה או לשחקנים בודדים.
- **מדיה** (`Media`/`Videos`) — פודקאסטים + סרטונים לפי קטגוריה, דירוגי סרטונים, ייבוא מיוטיוב (אדמין, `youtube.js`).
- **תקשורת** — `Messages` (1:1), `ChatWindow`, `CommunityChat` דרך Community, `GamesBoard` (משחקי אימון).
- **ניהול** (`Admin.jsx`) — סטטיסטיקות, אימות/חסימת מאמנים, תלונות (`ReportButton`), זיהוי התחזות.

**צד שחקן** (`PlayerDashboard.jsx`, 65KB — הקובץ הגדול ביותר אחרי ה-CSS)
- בית שחקן מעוצב (כרטיס נייבי, רמה, רצף), מטרות אישיות + תיעוד עצמי (`PlayerGoals`), לו"ז, צ'אט עם המאמן (`CoachChat`), **האימונים שלי** — טיימליין היסטורי (`PlayerTimeline`) + טופס סיכום אימון (`FeedbackSheet`: מאמץ, מצב רוח, על מה עבדתי), תרגילים שהמאמן שלח, סרטונים, קהילת שחקנים (`PlayerCommunity`), פרופיל.

## 5. מסד נתונים (Supabase — הכול עם RLS)

**סדר הרצה** (idempotent; 1–7 כבר בייצור):

| # | קבצים | מה |
|---|---|---|
| 1 | `supabase_setup.sql` | `profiles` + טריגר הרשמה |
| 2 | `supabase_stage2/3/3_ratings.sql` | `drills`, `drill_ratings` |
| 3 | `supabase_saved_drills.sql`, `supabase_comments.sql` | `saved_drills`, `drill_comments` |
| 4 | `supabase_training_plans.sql` | `training_plans`, `plan_items` |
| 5 | `supabase_messages.sql`, `supabase_community_chat.sql` | `messages`, `community_messages` |
| 6 | `supabase_schedule.sql`, `supabase_games.sql`, `supabase_teams_admin.sql`, `supabase_attendance.sql` | `schedule_entries`, `game_requests`, `team_players/goals/games/staff/iba`, `reports`, `video_ratings`, `practice_attendance` |
| 7 | `supabase_launch_migration.sql`, `supabase_security_hardening.sql` | `coach_meetings`, `drill_videos`, הקשחה |
| 8 | `supabase_community.sql`, `supabase_community2.sql` | `community_posts/_likes/_comments` + ערוצים וסוגי פוסט |
| 9 | `supabase_engagement.sql` | `notifications`, Realtime, `community_poll_votes`, `community_events`, `community_event_rsvps` |
| 10 | `supabase_security2.sql` | מגבלות תוכן ו-constraints |
| 11 | `supabase_players.sql`, `supabase_player_v2.sql` | `team_join_codes`, `team_memberships`, `player_assignments`, `assignment_completions`, `player_feedback`, `player_messages` |
| 12 | `supabase_sessions.sql`, `supabase_game_reviews.sql`, `supabase_effort.sql` | `session_reviews`, `game_attendance`, `session_effort` |
| 13 | `supabase_team_chat.sql`, `supabase_player_goals.sql`, `supabase_team_slots.sql` | `team_messages`, `player_goals`, `team_practice_slots`, `session_goal_marks` |
| 14 | `supabase_feedback_sheet.sql`, `supabase_player_goal_logging.sql` | `session_effort.mood/focus` + RLS לתיעוד עצמי של השחקן |

- נדרש **bucket ציבורי `media`** ב-Storage (העלאה ל-authenticated). העלאות עוברות דחיסה בצד הלקוח (`storage.js`).
- `supabase_seed_drills.sql` — 30 תרגילי דוגמה · `supabase_cleanup_drills.sql` — מנקה אותם.
- הקוד **סובלני לטבלאות חסרות** (בודק שגיאות "does not exist" ומדלג) — ולכן פיצ'ר שלא עובד הוא לרוב SQL שלא הורץ, לא באג.

## 6. מערכת העיצוב

- **מקור האמת = הטוקנים ב-`src/index.css`** (`:root` בראש הקובץ): רמפות `--orange-*` / `--navy-*` / `--gray-*`, טוקני תפקיד (`--bg`, `--surface`, `--surface-alt`, `--text`, `--text-muted`, `--border`, `--ink-900`), אקצנט מפוצל (`--accent` לגוונים, `--accent-fill` למילוי כפתורים, `--accent-strong` לטקסט — WCAG AA), `--primary` = נייבי, צבעי קטגוריה (`--c-blue/green/purple/navy/orange/red`), `--space-*`, `--radius-*`, `--shadow-*`, סקאלת טיפוגרפיה `--text-xs…`.
- **גופנים:** Rubik (גוף) + Heebo 700–900 (כותרות), נטענים מ-`index.html`.
- **שני מצבים:** בהיר = *Court Edition* (קנבס חמים) · כהה = *Broadcast Energy* (`[data-theme="dark"]`).
- ⚠️ **`design-system/courtside/MASTER.md` הוא פלט אוטומטי גנרי (כחול/ירוק, Noto Sans) ולא מתאר את האפליקציה — להתעלם ממנו לטובת `index.css` + `SPEC.md`.**
- ⚠️ **`src/index.css` שוקל 476KB** — הצטברות של שכבות "רענון" זו על גב זו (עשרות בלוקים מתוארכים בסוף הקובץ). זה החוב העיצובי הגדול: כפילויות של `.btn-primary`/`.card`/`.stat-card`, סלקטורים שנלחמים זה בזה, וקושי לשנות משהו בלי רגרסיה. כל עבודת עיצוב גדולה צריכה להתחיל בהחלטה אם מאחדים.

## 7. פעולות פתוחות (משתמש)

0. **חובה — שלושה קבצי SQL חדשים מסבב 24.7** (ענף `design-ux-pass-jul24`), בסדר הזה:
   `supabase_migrations_ledger.sql` → `supabase_security3.sql` → `supabase_privacy4.sql`.
   בלי `privacy4` הקוד עובד (יש נפילה לאחור בכל קריאה), אבל **חשיפת ה-PII של הקטינים נשארת פתוחה**.
   אחרי ההרצה: `select * from public.schema_migrations order by ran_at;` יראה מה רץ.
1. **להריץ שני ה-SQL האחרונים** אם עוד לא: `supabase_feedback_sheet.sql` + `supabase_player_goal_logging.sql` (בלעדיהם "סיכום אימון" ו"מטרות" של השחקן ייכשלו).
2. **Resend / מיילים:** SMTP מותאם ב-Supabase עובד, אבל בלי דומיין מאומת נשלח **רק** ל-`coachadiriagam@gmail.com`. ל-launch: לאמת דומיין ב-Resend + להעלות Auth → Rate Limits → emails per hour (ברירת מחדל 2).
3. **Magic Link template** צריך `{{ .Token }}` כדי שקוד ה-OTP יישלח כקוד ולא רק כקישור.
4. Supabase → Auth → Providers → Email → Minimum password length = 8 (אכיפת שרת; בקליינט כבר נאכף).

## 7ב. סבב עיצוב, נגישות ואבטחה — 24.7.2026 (ענף `design-ux-pass-jul24`)

סקירה חיה של האפליקציה המחוברת (מאמן ושחקן, 1920 ו-384 אמיתי) + ביקורת קוד מרובת-סוכנים.
**מה תוקן:** קריסת מסך לבן ב"הקבוצות שלי" (התנגשות `SendToPlayers.jsx`/`sendToPlayers.js` ב-Windows —
הקובץ שונה ל-`sendToPlayersApi.js` ונוספה בדיקת CI); `ErrorBoundary` בשני העולמות + דיווח ל-`client_errors`;
`--text-muted` הוכהה ל-4.8:1; רצפת 12px; **שם המאמן בסייד-בר היה שחור על נייבי (1.03:1)**;
`.video-card` של דף הבית חטף את מסך המדיה; מלכודות פוקוס ב-9 דיאלוגים; `Enter` גלובלי שאישר מחיקה;
המגירה `inert` כשסגורה; H1 בכל מסך; תקלת טעינה מובדלת מ"ריק"; סינון/מיון מופרדים בספריית התרגילים;
לו"ז מותאם לשעות האימונים; עימוד סרטונים (4,316→767 צמתים); שלבי תרגיל כרשימה במקום קיר טקסט;
`role` נעול לאחר הרשמה; קהילת השחקנים רק לשחקנים מאושרים; **שער גיל והסכמת הורה מתחת ל-16**;
אישור סרטונים לפני חשיפה לשחקנים; `phone`/`email` נשללו מקריאה ישירה (VIEW + RPC).

**נמדד בסוף הסבב:** בכל 10 מסכי המאמן — 0 כשלי ניגודיות, 0 טקסט מתחת ל-12px, H1 אחד לכל מסך,
אין גלישה אופקית ב-384px, אין שגיאות קונסולה.

**נבדק ונמצא תקין (לא לתקן):** יעדי המגע בפוטר הנחיתה, בכפתור "היום" ובסימנייה — מכוסים ב-`@media (pointer: coarse)`
שלא מופעל בדפדפן שולחני; אנימציית `card-enter` לא "מעלימה תוכן לתמיד" (היא משלימה כשחוזרים פריימים);
הגוטר של הלו"ז במובייל כבר `sticky`; ריבועי הפודקאסט הירוקים הם ירוק-ספוטיפיי מכוון.

## 8. חובות עיצוב/UX פתוחים (המשך העבודה מכאן)

- **איחוד ה-CSS** (476KB, כפילויות פרימיטיבים) — הפריט הכי משמעותי.
- טקסט מסך שגיאת ההגדרות ב-`App.jsx` עוד מדבר על **Netlify** במקום Vercel.
- `PlayerDashboard.jsx` (65KB) ו-`Teams.jsx` (58KB) — מונוליטים שראוי לפצל לרכיבים.
- אין רכיבי UI משותפים ב-`main` (Modal/Button/Field) — יש `confirm.jsx` ו-`Skeleton.jsx` בלבד; דיאלוגים ומודלים מיושמים מקומית בכל מסך.
- עקביות בין עולם המאמן (שנבנה בהדרגה) לעולם השחקן (שעוצב לאחרונה לפי ה-hi-fi handoff) — המאמן נראה "מבוגר" יותר.
- נגישות: לבדוק ניגודיות במצב כהה, מצבי פוקוס, ויעדי מגע ≥44px במסכים החדשים.

## 9. היסטוריה מקוצרת (PR #1–#73)

- **#1–#10 (2–16.7)** — שדרוג עיצוב CourtSide, ערכת "ברודקאסט", 30 תרגילי דוגמה, launch-readiness (PWA, לגאלי), Court Edition + תיקוני E2E.
- **#11–#23 (16–17.7)** — נוכחות בקליק, מצב כהה = Broadcast Energy, בית 2.0, התאמה למוקאפים (Auth קינמטי, סגל, בונה תוכניות, מדיה), תיקון אתר לבן (הקשחת ה-Supabase client).
- **#24–#35 (18–19.7)** — Vercel/Cloudflare, עורך וידאו on-device (הוסר מאוחר יותר), אודיט מלא + תיקוני קריסה, **קהילה כלב האפליקציה**, ו-Design handoff שלב 1+2 (שפה מאוחדת, hero נייבי, בר תחתון).
- **#36–#45 (20–21.7)** — Council review (46 ממצאים), מנוע אנגייג'מנט (התראות/Realtime/PWA/סקרים/אירועים), דחיסת תמונות, הקשחת אבטחה, CI + README, דיאלוגים מעוצבים.
- **#46–#59 (21–22.7)** — **פלטפורמת השחקן**: הצטרפות בקוד, בית שחקן, צ'אט עם המאמן, סיכומי אימון (נוכחות/מאמץ/פידבק/MVP), ביקורות משחק, צ'אט קבוצתי, מטרות שבועיות/חודשיות/עונתיות, hub שליחה לשחקנים.
- **#60–#73 (22–23.7)** — טיימליין אימונים לשחקן, כרטיס בית חכם למאמן, סבב "declutter" (הוסרו badges/XP ועורך הווידאו), ואז **עיצוב מחדש של כל מסכי השחקן לפי ה-hi-fi handoff** + פרופיל + מצב רוח/פוקוס שהמאמן רואה.

---

**הצעד האחרון:** PR #73 — עיצוב מחדש של הפרופיל + המאמן רואה מצב רוח ופוקוס. **הבא:** עבודת עיצוב ונוחות שימוש באתר (סעיף 8).
