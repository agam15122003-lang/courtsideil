# CourtSide 🏀

**הבית הדיגיטלי של מאמן הכדורסל** — קהילה, ספריית תרגילים, בונה תוכניות אימון, לוח טקטיקה, ניהול קבוצות, לו"ז, מדיה ועריכת וידאו. עברית RTL תחילה, עם תמיכה מלאה באנגלית.

🔗 **אתר חי:** https://courtsideil.vercel.app

## מה יש בפנים

| תחום | יכולות |
| --- | --- |
| 🏠 קהילה | פיד פוסטים עם תמונות, סוגי פוסט (שאלה/טיפ/וידאו/משרה/סקר), לייקים, תגובות, סקרים חיים, אירועים עם RSVP, ערוצי צ'אט לפי קטגוריה, הזמנת מאמנים בוואטסאפ |
| 🔔 התראות | פעמון עם מונה חי — לייק, תגובה, הצבעה, RSVP והודעה פרטית; זמן-אמת (Supabase Realtime) |
| 🏀 תרגילים | מחברת מאמן לכתיבה "כמו במציאות", לוח טקטיקה עם אנימציה, דירוגים, מועדפים, שיתוף וואטסאפ, דף ציבורי לתרגיל (`#/drill/<id>`) |
| 📋 תוכניות | בונה אימונים עם יעד 90 דק', פירוק זמן צבעוני לפי קטגוריה, סינון לפי מקור (שלי / קהילה), מצב הרצה חי, ייצוא PDF |
| 👥 קבוצות | סגל, נוכחות, מטרות, משחקים (כולל ייבוא מהאיגוד), טבלת ליגה |
| 🎬 וידאו | עורך חיתוך on-device עם ספריית קליפים, שמות ותיוגים |
| 📱 PWA | ניתן להתקנה כאפליקציה; טעינה מהירה מהמטמון; דחיסת תמונות לפני העלאה |

**טכנולוגיה:** React 18 (Vite) · Supabase (Postgres + RLS + Auth + Realtime + Storage) · Vercel

## הרצה מקומית

```bash
npm install
cp .env.local.example .env.local   # ומלא את המפתחות
npm run dev
```

`.env.local`:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

## הקמת מסד הנתונים (Supabase → SQL Editor)

הרץ את הקבצים לפי הסדר. כולם בטוחים להרצה חוזרת (idempotent):

| # | קובץ | מה הוא נותן |
| --- | --- | --- |
| 1 | `supabase_setup.sql` | פרופילים + הרשמה |
| 2 | `supabase_stage2.sql`, `supabase_stage3.sql`, `supabase_stage3_ratings.sql` | תרגילים ודירוגים |
| 3 | `supabase_saved_drills.sql`, `supabase_comments.sql` | מועדפים ותגובות |
| 4 | `supabase_training_plans.sql` | תוכניות אימון |
| 5 | `supabase_messages.sql`, `supabase_community_chat.sql` | הודעות פרטיות וצ'אט |
| 6 | `supabase_schedule.sql`, `supabase_games.sql`, `supabase_teams_admin.sql`, `supabase_attendance.sql` | לו"ז, משחקים, קבוצות, נוכחות |
| 7 | `supabase_launch_migration.sql`, `supabase_security_hardening.sql` | השקה + אבטחה בסיסית |
| 8 | `supabase_community.sql` | פיד הקהילה (פוסטים, לייקים, תגובות) |
| 9 | `supabase_community2.sql` | תיקון קשרים + ערוצי צ'אט + סוגי פוסט |
| 10 | `supabase_engagement.sql` | התראות, Realtime, סקרים, אירועים, דף תרגיל ציבורי |
| 11 | `supabase_security2.sql` | מגבלות תוכן ו-constraints |
| 12 | `supabase_players.sql`, `supabase_player_v2.sql` | עולם השחקן: הצטרפות בקוד, שיגורים, משוב |
| 13 | `supabase_sessions.sql`, `supabase_game_reviews.sql`, `supabase_effort.sql` | סיכומי אימון, ביקורות משחק, מאמץ |
| 14 | `supabase_team_chat.sql`, `supabase_player_goals.sql`, `supabase_team_slots.sql` | צ׳אט קבוצה, מטרות, שעות אימון |
| 15 | `supabase_feedback_sheet.sql`, `supabase_player_goal_logging.sql`, `supabase_goal_logs.sql` | מצב רוח/פוקוס, תיעוד עצמי, יומן התקדמות לגרפים |
| 16 | `supabase_migrations_ledger.sql` | רישום מה הורץ (schema_migrations) |
| 17 | `supabase_security3.sql` | נעילת role, קהילת שחקנים, קודי הצטרפות |
| 18 | `supabase_privacy4.sql` | **חובה** — סגירת PII, הסכמת הורה, אישור סרטונים, לוג שגיאות |
| 19 | `supabase_engagement2.sql` | "המאמן ממליץ", "ראיתי" על סיכום, תגובת אמוג'י למשוב |
| 20 | `supabase_assignments_progress.sql` | התקדמות חלקית בתרגילים (יעד כמותי + דיווח הדרגתי) |
| 21 | `supabase_practice_rsvp.sql` | אישורי הגעה לאימון הקרוב |
| 22 | `supabase_game_scores.sql` | תוצאת משחק וסיכום (our_score / their_score / summary) |
| 23 | `supabase_todo_31_7.sql` | סיבת אי-הגעה + טווחי יעדים מורחבים (half_year) |
| 24 | `supabase_goals_launch.sql` | יעדים 1.5 — created_by (יעד «אישי» מול «מהמאמן») |
| 25 | `supabase_tasks_launch.sql` | משימות 1.6 — status (פעילה/ארכיון) וארכוב אוטומטי |
| 26 | `supabase_player_card.sql` | **חובה** — כרטיס שחקן 1.7: פרטיות סגל (פרטים יבשים לחברי קבוצה), coach_notes, זמינות |
| 27 | `supabase_plan_parts.sql` | תוכניות 1.10 — plan_items.part (חלקי אימון) |
| 28 | `supabase_team_hub.sql` | הקבוצה והלו"ז 1.13 — טבלת הליגה גם לשחקנים (team_iba) |
| 29 | `supabase_legal_launch.sql` | **חובה** — משפטי 1.15: הסכמת הורה עד גיל 18, טלפון הורה, גרסת נוסח, בקשות מחיקה |
| 30 | `supabase_stage2_launch.sql` | שלב 2 — משחקי אימון (אזור/טווח/סטטוס) + מחיקת סרטון לאדמין |
| 31 | `supabase_plans_community.sql` | שיתוף תוכניות לקהילה — `training_plans.is_public` + קריאת תוכניות ופריטים משותפים |
| 32 | `supabase_rls_hardening_3_8.sql` | **חובה** — הקשחת RLS 3.8: סוף ל-`using(true)` על `profiles`, DM רק בין מכרים, נעילת `role`, אכיפת `banned`, קהילת מאמנים סגורה לשחקנים, מדיניות Storage לפי בעלים |
| 33 | `supabase_parent_consent.sql` | **חובה** — הסכמת הורה אמיתית: `consent_documents`/`guardians`/`consent_requests`/`consents`, קישור חד-פעמי להורה, ארבע קטגוריות הסכמה, `approval_status`, אישור עצמאי בגיל 18 |
| 34 | `supabase_consent_enforcement.sql` | **חובה** — אכיפה בשרת: מדיניות RESTRICTIVE על כתיבה לכל טבלת תוכן — חשבון חסום או קטין שממתין להסכמת הורה אינו כותב. דורש 32 ו-33 |
| 35 | `supabase_private_media.sql` | **חובה** — מדיניות SELECT על `storage.objects` והכנת המעבר ל-bucket פרטי + Signed URLs. **שורת ההיפוך שבסוף הקובץ מורצת ידנית רק אחרי פריסת פרונט שמייצר Signed URLs** |
| 36 | `supabase_hardening_medium_3_8.sql` | הקשחות בינוניות: `join_with_code()` (הצטרפות בקוד בלי INSERT ישיר), תצוגת `public_drills` בלי `created_by`, תפוגת קודי הצטרפות ומונה ניסיונות, אינדקסים לעמודות RLS. דורש 32 ו-33; שני סעיפים נעולים מאחורי `v_frontend_ready` |
| 37 | `supabase_schedule_board_4_8.sql` | **חובה** — זימון פגישה רק בין מאמנים (עד כה אפשר היה לזמן קטין), `location` ל-`schedule_entries`/`coach_meetings`, ואינדקס ראשון ל-`schedule_entries` |
| 38 | `supabase_notebook_18_8.sql` | **חובה** — «המחברת המלאה» 18.8: `training_plans.body/ink/courts/team/session_date/duration_minutes/is_draft`, `practice_attendance.reason`, `player_assignments.plan_view`, RPC `plan_for_player` (מה השחקן רואה מתוכנית ששוגרה אליו) |
| 39 | `supabase_dossier_18_8.sql` | **חובה לתיק שחקן** — `dossier_people` (זהות אחת לשחקן) + `team_players.person_id`, `dossier_metrics` (קטלוג: 16 דירוגים + 4 מדידות, ניתן לעריכה לכל מועדון), `dossier_entries`, `dossier_notes`, `dossier_access`, `club_roles`, ופונקציות ההרשאה `dossier_can_see`/`dossier_can_edit` |
| 40 | `supabase_club_manage_19_8.sql` | **חובה למסך «המועדון»** — `club_manager_sees_coach()` ומדיניות `roster_club_manager_read` על `team_players`: מנהל מועדון/מנהל מקצועי רואה את הסגל של מאמן **שצורף לעץ** בלבד, לקריאה בלבד. בלי הקובץ הזה המסך של המנהל ריק |
| 41 | `supabase_coach_age_gate_19_8.sql` | שער «מאמן קטין» — עמודה חדשה `game_settings.coach_birthdate_required` וגרסה מתוקנת של `game_block_minor_coach` (ענף «לא הצהיר» דורש גם שם מלא, אחרת השורה הריקה של `handle_new_user` נחסמת וכל הרשמה נשברת). **דורש שהפרונט של 19.8 יהיה באוויר לפני הדלקת המתג** |
| 42 | `supabase_player_room_off_19_8.sql` | סגירת **חדר השחקנים הארצי** — מדיניות RESTRICTIVE שחוסמת הוספת הודעות ל-`player_messages`. שום הודעה לא נמחקת. ביטול: `drop policy "pmsg_room_closed"` |
| 43 | `supabase_game_challenge_off_19_8.sql` | סגירת **האתגר השבועי והעלאות הווידאו** — שלילת INSERT/UPDATE על `game_challenge_submissions` ומחיקת מדיניות ההעלאה `media_insert_challenges`. שום קליפ ושום הגשה לא נמחקים, וכל מדיניות הקריאה נשארת |
| 44 | `supabase_coach_only_22_8.sql` | **חובה להשקת צד המאמן בלבד** (ראו «השקת צד המאמן» למטה) — `roster_id` על `session_effort` / `player_goals` / `player_feedback` / `session_goal_marks` / `player_assignments`, `session_effort.source` ('player'/'coach'), טבלה חדשה `assignment_coach_marks`, ומדיניות כתיבה למאמן. בלי הקובץ הזה המאמן לא יכול לרשום עומס, יעדים ומשוב לשחקן בלי חשבון. אדיטיבי — לא מוחק כלום |
| 45 | `supabase_roster_link_merge_3_9.sql` | **פיילוט צד השחקן** (ראו `הרצת_SQL_3.9.md`) — טריגר על `team_players`: כש-`player_id` מתמלא, יעדים (`player_goals`) ומשימות אישיות (`player_assignments`, לא קבוצתיות) שיושבים על השורה בלי חשבון מקבלים אותו; ניתוק מחזיר לאחור. + השלמה חד-פעמית לשורות שכבר מקושרות. **לא** נוגע ב-`session_effort` וב-`session_goal_marks`; ב-`player_feedback` רק ניקוי פרטיות חד-פעמי (סעיף 4): הערות סקירה 22.8–3.9 מנותקות מחשבון השחקן — לא ממזג קדימה. אחרי #44. האפליקציה עובדת גם בלעדיו |

> **גל «עולם המשחק» (12.8–16.8) אינו בטבלה הזו** — שבעת הקבצים `supabase_game_*` מרוכזים
> ב-`הרצת_SQL_12.8.md` עם סטטוס ההרצה בפועל. `supabase_game_quiz_hardening_13_8.sql` **רץ ואומת ב-18.8.2026 בערב.**

> **הגל של 18.8 מרוכז ב-`הרצת_SQL_18.8.md`** — שני קבצים
> (`supabase_notebook_18_8.sql` ואחריו `supabase_dossier_18_8.sql`),
> עם בדיקות אימות, מינוי מנהל מועדון, ומה משתנה על המסך.

> **גל 3.8–4.8 אינו בטבלה הזו.** ארבעה־עשר הקבצים שרצו בגל ההוא מרוכזים
> ב-`הרצת_SQL_3.8.md`, יחד עם מצב ההרצה בפועל ובדיקות האימות. הטבלה כאן
> מתארת את סדר ההקמה מאפס.

> **סדר קריטי בגל 32–36:** 32 → 33 → 34 (34 דורש `is_active_user()` מ-33 ו-`is_banned()` מ-32, ואם אחת חסרה הוא לא יוצר כלום). 35 עצמאי. 36 אחרי 32 ו-33.
>
> **שני מתגים שדורשים פריסת פרונט לפני הפעלה:**
> 1. `supabase_private_media.sql` — הפיכת ה-bucket לפרטי רק אחרי שהפרונט עובד ב-Signed URLs.
> 2. `supabase_hardening_medium_3_8.sql` — סעיפים 9ב ו-11ב (`v_frontend_ready`) מנתקים גישה ישירה שהפרונט ישן עדיין משתמש בה. הפרונט בגרסה הזו כבר קורא ל-`join_with_code` ול-`public_drills` עם נפילה לאחור, אז אפשר להפעיל אותם אחרי הפריסה הבאה.

> **סביבת ייצור קיימת?** שלבים 1–15 כבר רצים אצלך (ודא ש-`supabase_goal_logs.sql` מ-15 אכן רץ); **16–20 חדשים מ-24–25.7.2026 וחייבים לרוץ** —
> בלי 18 כל משתמש מחובר יכול לקרוא טלפון ומייל של כל שחקן. אחרי ההרצה:
> `select * from public.schema_migrations order by ran_at;`
> `supabase_cleanup_drills.sql` — אופציונלי, מוחק תרגילי דוגמה.
> נדרש גם bucket בשם `media` ב-Storage; מ-35 ואילך הוא נעשה פרטי, והגישה אליו רק ב-Signed URLs.

## השקת צד המאמן בלבד (22.8.2026)

ההשקה הראשונה היא **למאמנים בלבד**. צד השחקן **מוסתר, לא מחוק**: המתג
`PLAYER_SIDE` ב-`src/flags.js` שולט על הכול (כרגע `true` — פיילוט 2.9, ראו למטה).

**מה מוסתר כשהמתג כבוי:** בחירת תפקיד והרשמה כשחקן, קישורי `#/join` ו-`#/court`,
`PlayerDashboard` (חשבון שחקן שמתחבר רואה מסך המתנה — `PlayerSideClosed.jsx`),
קוד הצטרפות / QR / בקשות הצטרפות / הצלבת גילאים בסגל, אישורי הגעה (RSVP),
צ׳אט הקבוצה במסך ההודעות, «מתאמנים אישיים», התראות לשחקנים, ופרסום סיכום
האימון לצ׳אט. דף הנחיתה מציג גרסה למאמנים (הטיזר «בקרוב: צד השחקן» הוסר 30.8, החלטת הבעלים).

**מה נשאר ועובר לרישום של המאמן** (על שורת הסגל `team_players.id` → `roster_id`,
דורש את קובץ #44): עומס אחרי אימון (בורר 1–10 בסקירת האימון, `session_effort.source='coach'`),
«עמד ביעד?» (המאמן מסמן בסקירה — `session_goal_marks.roster_id`), יעדים אישיים
(`player_goals.roster_id`), משוב אישי (`player_feedback.roster_id`), ומשימות
(`player_assignments.roster_id` + סימון «ביצע» של המאמן ב-`assignment_coach_marks`).

**להחזיר את צד השחקן:** `PLAYER_SIDE = true` ו-`npm run verify`. לפני כן:
1. `pg_player_read` כבר מסנן `roster_id is null` מיעדי הקבוצה (קובץ #44) — לוודא שרץ.
2. שחקן שיתחבר לשורת סגל שכבר יש עליה יעדים/משובים/משימות (`roster_id` בלי `player_id`)
   צריך **מיזוג**: `update ... set player_id = <auth> where roster_id = <row> and player_id is null`
   על `player_goals` / `player_feedback` / `player_assignments` **בלבד** — עדיין לא נכתב, ולא צריך עד
   שיש שחקנים. ⚠ **לא** על `session_effort` ו-`session_goal_marks`: שם שורות המאמן נשארות עם
   `player_id` ריק לתמיד (unique של הדירוג העצמי עדיין בתוקף — שורה עם שני המזהים הייתה מתנגשת
   בשורת השחקן ונכתבת דרך המדיניות שלו). הקריאה ממילא הולכת דרך `roster_id` קודם.
3. `assignment_coach_marks` (סימוני המאמן) ו-`assignment_completions` (סימוני השחקן)
   הן שתי אמיתות נפרדות — להחליט מי מנצח במסך «מה נשלח ומי ביצע».

**2.9.2026 — פיילוט צד השחקן (ענף `player-pilot`):** `PLAYER_SIDE = true` — הבעלים החזיר את
צד השחקן לפיילוט עם השחקנים שלו. מתג חדש `BASKETBALL_WORLD = false` (`src/flags.js`) מסתיר
את «עולם הכדורסל» (חידון, דו-קרב, ניחושים, נקודות, `#/court`) — **מוסתר, לא מחוק**: היעד יורד
מהתפריט ומניווט־הכיס, המסך מרנדר את הבית, קישורי `#/court`/`#/r` נוחתים בדף הנחיתה, והתראות
משחק ישנות לא מוצגות. סעיפים 1–3 שלמעלה עדיין פתוחים. בנוסף: המאמן ממשיך לרשום על שורת הסגל,
ולכן מסך שקורא לפי `player_id` בלבד כשהמתג דלוק חייב לקרוא את **שתי** האמיתות (`roster_id` וגם
`player_id`). כבר עודכנו כך: `NextPractice.jsx` (דוח האימון האחרון) ו-`dossierApi.js` (אריחי התיק).

**3.9.2026 — שתי אמיתות (`COACH_LOGS`):** מתג חדש `COACH_LOGS = true` ב-`src/flags.js` — המאמן **תמיד**
רושם על שורת הסגל, ואף מסך לא גוזר יותר את התנהגות המאמן מ-`PLAYER_SIDE`. `SessionDetail` /
`TeamAssignments` (`COACH_MODE = COACH_LOGS`), `PlayerCard`, `Teams`, `PlayerGoals`, `playerReport`,
`sendToPlayersApi` / `SendToPlayers`, `TeamGoalsBoard`, `CoachTodo` — כולם קוראים את שתי האמיתות
(`roster_id` וגם `player_id` דרך `team_players.player_id`) ומציגים את שתיהן זו לצד זו («המאמן 7 · השחקן 8»,
«סימנת · סימן בעצמו»). ההערה לשחקן בסקירת האימון היא **פרטית למאמן** (`roster_id` בלבד, בלי התראה);
משוב מפורש נשאר ב«שליחת משוב לשחקן». אישור בקשת הצטרפות מחבר את החשבון לשורת סגל **קיימת** עם אותו
שם (בדיוק אחת) במקום לפתוח כפילות — `players.js decideMembership`. סעיף 2 שלמעלה נסגר עם קובץ #45
(`supabase_roster_link_merge_3_9.sql`, ראו `הרצת_SQL_3.9.md`); סעיף 3 הוכרע: כל אחד מהם מספיק ל«בוצע».

## פריסה

מחובר ל-Vercel: כל מיזוג ל-`main` נפרס אוטומטית (הגדר את שני משתני הסביבה
בפרויקט ה-Vercel). ‏CI ‏(GitHub Actions) מוודא build נקי על כל push/PR ל-main.

## מסמכים נוספים

- **`ניהול_הפרויקט.md` — מצב הפרויקט: מה להריץ, מה להחליט, ומה נשאר לבנות. המסמך הראשון לפתוח.**

- `SPEC.md` — אפיון · `SECURITY.md` — מדיניות אבטחה
- `HANDOFF_18.8.md` — האנדוף האחרון (המחברת המלאה + תיק שחקן)
- `HANDOFF.md`, `DESIGN_RESEARCH.md` — עיצוב · `AUDIT.md` — ממצאי סקירות
