# CourtSide — Handoff (עדכני · 2026-07)

> ההודעה הראשונה לצ׳אט החדש: "אנא קרא את `HANDOFF.md` בשורש הפרויקט ונמשיך."
> הסקשן הזה (העליון) הוא **המקור הסמכותי**. הסקשן "היסטוריה" בהמשך הוא הקשר מסבבים קודמים —
> במקום שבו יש סתירה (פריסה/workflow/נתיב מקומי) — **העליון גובר**.

## מה זה
CourtSide — אפליקציית כדורסל לנוער בעברית (RTL), חיבור **שחקן↔מאמן**.
- Live: https://courtsideil.vercel.app
- שפה: עברית RTL קודם, עם i18n דרך `L(he, en)` ו-`trTeam()`.
- מצב בהיר + כהה (toggle דרך `data-theme` על `<html>` + localStorage `theme` + event `themechange`).

## סטאק
- **React 18 + Vite** (React רגיל, לא Next).
- **Supabase** (Postgres + RLS + Auth + Realtime), supabase-js v2. קליינט ב-`src/supabaseClient.js`.
- כל ה-CSS בקובץ אחד גדול: **`src/index.css`** עם CSS-variable tokens.
- טסטים: **Playwright** עם mock ל-Supabase (screenshots).

## Design tokens (פלטת "warm sand")
בהיר: `--bg:#F4EEE3` `--surface:#FFF` `--surface-alt` `--text/--text-muted` `--border`
`--hero-navy/--hero-navy-2` `--accent(#C4592B)/--accent-fill/--accent-press/--accent-strong/--accent-soft`
`--c-green/-bg` `--c-purple/-bg` `--c-red/-bg` `--c-gold` · `--radius-md/lg/full` · `--shadow-sm/md` · `--font-display` (Rubik).
כהה: אותם שמות עם ערכים כהים תחת `[data-theme="dark"]`.
**חשוב:** תמיד להשתמש ב-tokens, לא בצבעים קשיחים. יש hook (impeccable) שסורק עיצוב אוטומטית.

## Git workflow (חובה) — מחליף את שיטת הפריסה הישנה
- הפריסה עכשיו **git-based CI**: merge ל-`main` → Vercel + Netlify מפרסמים אוטומטית. אין drag&drop ידני.
- ענף פיתוח: **`claude/project-connection-5py7om`**. לפתח שם, לא ב-main.
- לכל שינוי: commit → `git push -u origin claude/project-connection-5py7om` → לפתוח **draft PR** מול `main`.
- אחרי push: לסמן ready → לבדוק סטטוס Vercel + Netlify → **squash merge** → לבטל subscription ל-PR → לאפס את הענף:
  `git fetch origin main && git checkout -B claude/project-connection-5py7om origin/main && git push --force-with-lease`.
- GitHub דרך כלי MCP בלבד (`mcp__github__*`), אין `gh` CLI. Repo: `agam15122003-lang/the-basketball-world`.
- Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## מה נבנה לאחרונה (הכל merged ל-main)
עוצב מחדש כל **צד השחקן** לפי handoff עיצובי (מובייל-first, מחשב מתאים בהתאם):
- **בית** — הירו-תמונה נייבי/כתום + ספירה-לאחור 4 תאים + CTA "מלא סיכום אימון" + שלישיית סטטיסטיקה (נוכחות/רצף/עומס) + משימה שבועית + קיצורי דרך 2×2 + כרטיס הודעה מהמאמן + ציטוט + חדשות.
- **גיליון סיכום אימון (FeedbackSheet)** — bottom-sheet: עומס 1–10, מצב רוח (5), פוקוס (6 tags), עמידה במטרות, הערה → `session_effort` (עם `mood`+`focus`) + `session_goal_marks`.
- **האימונים שלי** — CTA סיכום + שלישייה + **גרף מגמת עומס** (SVG) + "אימונים שהיו" ככרטיסים שטוחים (`th-*`).
- **המטרות שלי** — הירו התקדמות כללית + כרטיסים עם +/− steppers + "סמן שבוצע" + הוספת מטרה (sheet) + **גרף התקדמות למטרה ספציפית** (`GoalChart`) + תיבת "כמה ביצעת?".
- **פרופיל** — אווטאר + שלישייה + קבוצות + הגדרות (מתג מצב-כהה/שפה/התנתקות).
- **לו״ז כטבלה שבועית** (`ScheduleGrid`) — ימים למעלה, טורי שעות בצד (התחלה–סיום), משבצת = קבוצה+מיקום. גם לשחקן (תחת "לו״ז") וגם למאמן (תחת "הקבוצות שלי → ימי אימון", עם מחיקה).
- **צד מאמן**: `SessionDetail` מציג mood+focus שהשחקן שלח; `TeamGoalsBoard` מציג היסטוריית עומס.

PRs שמוזגו: #70 (בית+feedback), #71 (trainings+chart), #72 (goals self-log), #73 (profile+coach mood/focus), #74 (schedule grid), #75 (history cards), #76 (goal progress chart).

## מיגרציות SQL להריץ ב-Supabase (SQL Editor) — קבצים בשורש הריפו
1. `supabase_feedback_sheet.sql` — עמודות `mood` + `focus` ל-`session_effort`. (הורץ)
2. `supabase_player_goal_logging.sql` — RLS: שחקן מעדכן/מוסיף/מוחק מטרות. (הורץ)
3. `supabase_goal_logs.sql` — טבלת `player_goal_logs` לגרף התקדמות המטרות. (לוודא שהורץ)

## קבצים מרכזיים (צד שחקן חדש)
- `src/PlayerDashboard.jsx` — כל אפליקציית השחקן (בית/הירו/StatTrio/Shortcuts/PlayerSchedule/PlayerProfile/ניווט).
- `src/FeedbackSheet.jsx` — גיליון סיכום אימון (`MOODS`, `FOCUS_OPTS`).
- `src/PlayerGoals.jsx` — `MyGoals` (self-log + `GoalChart`) + `PlayerGoalsEditor` (מאמן).
- `src/PlayerTimeline.jsx` — "האימונים שלי" (chart + היסטוריה `th-*`).
- `src/ScheduleGrid.jsx` — טבלת לו״ז שבועית משותפת.
- `src/TeamSlots.jsx` — לו״ז קבוע למאמן (משתמש ב-ScheduleGrid).
- `src/SessionDetail.jsx` — סקירת אימון למאמן (נוכחות/עומס/mood/focus/מטרות/MVP).
- `src/TeamGoalsBoard.jsx`, `src/Teams.jsx`, `src/NextPractice.jsx` — צד מאמן.
- `src/sessionId.js` — UUIDv5 דטרמיניסטי למופעי לו״ז חוזר (`occurrenceId`, `expandSlots`, `WEEKDAYS`).
- `src/index.css` — כל העיצוב.

## איך לבדוק (Playwright)
- Node: `/opt/node22/bin/node`, chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- build: `/opt/node22/bin/node node_modules/vite/bin/vite.js build`
- preview: `vite preview --port 4234 --strictPort --host` (להרוג preview ישן קודם: `pkill -9 -f vite`).
- Mock: route `**placeholder.supabase.co/**`, host `placeholder.supabase.co`, ref `placeholder`. auth token ל-localStorage `sb-placeholder-auth-token`.
- מובייל 430px: הניווט דרך drawer — `.drawer-toggle` ואז `.sidebar.open .nav-item` (click force).
- תמיד לבדוק בהיר **וגם** כהה, ולוודא `pageerrors: none`.

## מוסכמות
- מזהי session לאימונים חוזרים = UUIDv5 דטרמיניסטי (שחקן ומאמן חולקים אותו session_id בלי לממש שורות ב-DB).
- לא לשבור פיצ׳רים קיימים — רק לשפר.
- המשתמש רוצה עיצוב פשוט, נקי, יפה; בלי gamification/XP/badges.
- כשיש ספק בעיצוב — "the brief wins" (impeccable skill).

## פתוח / רעיונות להמשך
- להתאים את **צד המאמן** יותר לרוח העיצוב החדש (Teams/tabs, home card) בלי לשבור פיצ׳רים.
- אולי גרף התקדמות גם בצד המאמן (לראות התקדמות שחקן במטרה).
- לוודא ש-`supabase_goal_logs.sql` הורץ בפרודקשן.

---
---

# היסטוריה — הandoff הקודם (סבבים מוקדמים, לפני העיצוב מחדש)

> להקשר בלבד. חלקים כאן **עברו זמנם** (פריסה ידנית ל-Netlify, נתיב מקומי `pinkas-hamaman`, פורט dev 5173) —
> ראה הסקשן העליון לשיטה הנוכחית. סכמת ה-DB, המוסכמות והרקע עדיין שימושיים.

## הוראות עבודה (חשוב!)
- המשתמש **מתחיל בקוד** — להסביר כל צעד **בעברית**, פשוט וברור.
- **לעבוד צעד אחד בכל פעם** — לתת צעד, לחכות לאישור, להמשיך. לא להציף.
- **לבצע את העריכות בעצמך** בקבצים. תשובות בעברית.
- **SQL חדש = קטע להדבקה** ב-Supabase SQL Editor, ותמיד מסתיים ב-`notify pgrst, 'reload schema';`.
- **עיצוב:** כל UI חדש מציית למערכת העיצוב ולטוקנים ב-`index.css` (לא ערכים קשיחים).

## טכנולוגיה (רקע)
- React + Vite (JS/JSX), Supabase (PostgreSQL + Auth + RLS), אייקונים `lucide-react`.
- עברית RTL מלא · מצב כהה (`ThemeToggle`) · רספונסיבי.
- שם תצוגה: **CourtSide** (codename/תיקייה היסטורית `pinkas-hamaman`).

## מסד הנתונים (Supabase, הכול עם RLS) — בסיס
- `profiles` (id, first_name, last_name, club, age_groups, email, phone, phone_public, avatar_url) — קריאה לכולם, עריכה לבעלים.
- `drills` (+ `is_public`, `board` jsonb ללוח טקטיקה, `image_url`, `tags text[]`) — select: `is_public OR owner`; כתיבה לבעלים.
- `drill_ratings`, `saved_drills`, `drill_comments`, `drill_videos` — סביב תרגילים.
- `messages` (1:1), `community_messages`, `team_chat` — תקשורת.
- `training_plans` (+ `is_public`), `plan_items` — תוכניות אימון.
- `schedule_entries` (created_by, plan_id, date, start_time, end_time, location, team) — לו״ז חד-פעמי.
- `team_practice_slots` (coach_id, team, weekday, start_time, end_time, location) — לו״ז שבועי קבוע.
- `team_players` (roster), `team_games`, `game_attendance`, `practice_attendance` — קבוצה/נוכחות.
- `player_goals` (coach_id, player_id, period, title, target_value, progress_value, status), `player_goal_logs`, `session_goal_marks` — מטרות.
- `session_effort` (player_id, coach_id, session_id, effort, note, mood, focus), `session_reviews`, `player_feedback` — משוב/סיכומים.

## רקע עיצוב (סבבים קודמים)
- מערכת עיצוב הבשילה מ"עיצוב 2.0/3.0" (בנצ'מרק NBA/ESPN/Stripe/Linear) לפלטת "warm sand" הנוכחית.
- נגישות: פיצול הכתום ל-`--accent-fill`/`--accent-strong` לעמידה ב-WCAG AA; `:focus-visible`; יעדי מגע.
- מובייל: `.mobile-topbar` + מגירה מימין (`.sidebar.open`) + `.bottom-nav`.
- Toast (`toast.js`+`Toaster.jsx`) מחליף `alert()`; `Avatar.jsx` ראשי-תיבות בגרדיאנט; `Skeleton.jsx` למצבי טעינה.

## אימייל / OTP (רקע)
- OTP מייל דרך Supabase Auth (Magic Link template עם `{{ .Token }}`). SMTP: Resend.
- ל-launch: לאמת דומיין ב-Resend; להעלות email rate limit (Auth → Rate Limits).
