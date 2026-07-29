# github.md — חוזה הסנכרון

> **צ׳אט חדש: קרא את הקובץ הזה ראשון, ועדכן אותו בסוף כל סנכרון.**
> מה יש כאן: הקומיט האחרון, מה השתנה, מפת מסך→קבצים, ומה חייב לרוץ במסד.

## מצב נוכחי

| | |
|---|---|
| ריפו | `agam15122003-lang/courtsideil` (ה-remote המקומי עדיין בשם הישן `The-basketball-world` — אותו ריפו, GitHub מפנה) |
| ענף עבודה | `redesign` — נדחף, וגם **מוזג ל-main** |
| ענף פרודקשן | `main` — עומד על `afa7a1e` (29.7). **כל עבודת 28–29.7 באוויר.** שני קבצי ה-SQL שלמטה עדיין מחכים להרצה. |
| בילד | `npm run check && npm run build` — ירוק |
| שרת פיתוח | `npm run dev` (הבעלים מריץ על 5174) |

## מה נכנס ב-29.7.2026 — סגירת מסמך «21 מסכים מעוצבים»

המסמך (`עיצוב חדש פרויקט.pdf`, 24 עמ׳) מנה בעמוד 21 שבעה אזורים שקיימים בקוד ואין להם עיצוב. כולם נסגרו:

1. **כניסה · הרשמה · איפוס** — `RolePicker.jsx`, `JoinWithCode.jsx`, `Auth.jsx`, `ResetPassword.jsx` לפי חבילת `design_handoff_auth`, ו-`Page.jsx` שמכליל את הבאנר והגלולה לכל מסך.
2. **«הקבוצה שלי»** — שלושה טאבים (סגל · לו״ז ונוכחות · מטרות ומשימות), המשחקים והטבלה יצאו ל-`TeamGames.jsx`, הצ׳אט עבר למסך ההודעות, והקישור השבור מהלו״ז נסגר (`navigate('teams-practices')`).
3. **הרצת אימון** — `PlanRunner.jsx` כמסך מלא: טיימר עד 168px, Wake Lock, ביפ ורטט בסוף תרגיל, מצב לרוחב.
4. **«שלח לשחקנים»** — `SendToPlayers.jsx` כדלת אחת (הבורר-בזק בכרטיס התרגיל נמחק), «מה מבקשים בחזרה» (וי / מספר), ומסך אישור.
5. **פרופיל והתראות** — «מה מאמנים אחרים רואים» ב-`ProfileForm.jsx`, התראות מקובצות לפי יום ב-`Notifications.jsx`.
6. **משחקים ותוצאות** — לוח תוצאות ב-`TeamGames.jsx` + `supabase_game_scores.sql`.
7. **הקצוות** — H1 אחד לכל מסך (הוסרו כותרות כפולות מ-CoachFinder/Admin/TrainingPlans/Schedule), ותרגיל ציבורי לפי חוקי הבית.

**שינוי גלובלי:** `.tab.active` / `.chip.selected` = נייבי מלא + טקסט לבן; במצב כהה משטח מורם עם צל (מסך 1j). דורס את בלוק «[6] טאבים וצ'יפים» ב-`index.css:12880`.

## חייב לרוץ ב-Supabase

| קובץ | למה | סטטוס |
|---|---|---|
| `supabase_practice_rsvp.sql` | אישורי הגעה לאימון הקרוב | **להריץ** |
| `supabase_game_scores.sql` | `our_score` / `their_score` / `summary` על `team_games` | **להריץ** |

הקוד סובלני: בלי הקבצים האלה המסכים עובדים, והשמירה אומרת בדיוק איזה קובץ חסר.
רשימת ההרצה המלאה: `README.md` (טבלת 22 השלבים) ו-`HANDOFF.md`.

## מפת מסך → קבצים

לפי המזהים בקובץ העיצוב (`Courtside Mobile.dc.html`), כפי שהם מופיעים במסמך המסירה.

| מסך | מזהה | קבצים |
|---|---|---|
| בית המאמן | 3a · 3c | `Home.jsx` · `HomeSections.jsx` · `Dashboard.jsx` · `NotebookPage.jsx` |
| בית השחקן | 3b · 3d | `PlayerDashboard.jsx` |
| הקבוצה שלי | 4a · 4b | `Teams.jsx` · `TeamConnect.jsx` · `TeamFocus.jsx` · `TeamAssignments.jsx` · `players.js` |
| ספריית התרגילים | 5a · 5b | `DrillLibrary.jsx` · `DrillCard.jsx` · `CourtDiagram.jsx` · `constants.js` |
| סגירת אימון | 6a · 6b | `SessionDetail.jsx` · `FeedbackSheet.jsx` |
| הודעות | 7a · 7b | `Messages.jsx` · `TeamChat.jsx` · `ChatWindow.jsx` |
| הצטרפות בקוד | 8a | `players.js` · `TeamConnect.jsx` · `JoinWithCode.jsx` |
| האימונים שלי | 9a · 9b | `PlayerTimeline.jsx` · `FeedbackSheet.jsx` |
| פרופיל המאמן | 10a · 10b | `CoachProfile.jsx` · `MyStats.jsx` · `Dashboard.jsx` |
| קהילת המאמנים | 11a · 11b | `Community.jsx` · `PlayerCommunity.jsx` |
| המשימות שלי | 12a · 12b | `PlayerDashboard.jsx` (MyAssignments) · `PlayerGoals.jsx` · `TeamAssignments.jsx` |
| תוכניות · בניית תרגיל | 13a · 13b | `TrainingPlans.jsx` · `DrillForm.jsx` · `SmartBuilder.jsx` |
| מדיה | 14a · 14b | `Media.jsx` · `Videos.jsx` |
| לוח הטקטיקה | 15a · 15b | `TacticsBoard.jsx` · `CourtDiagram.jsx` |
| לו״ז | 16a · 16b | `Schedule.jsx` · `NextPractice.jsx` · `TeamSlots.jsx` |
| הסגל המלא | 17a · 17b | `Attendance.jsx` |
| כרטיס השחקן של המאמן | 17c · 17d | `TeamGoalsBoard.jsx` · `PlayerGoals.jsx` · `SessionDetail.jsx` |
| פרופיל השחקן | 18a · 18b | `PlayerDashboard.jsx` · `ProfileForm.jsx` |
| תרגיל בודד | 18c · 18d | `NotebookPage.jsx` · `DrillCard.jsx` · `TacticsBoard.jsx` |
| טעינה · ריק · שגיאה | 19a · 19b | `states.jsx` · `Skeleton.jsx` |
| מצב כהה | 3c | `ThemeToggle.jsx` |
| משחקים וטבלה (חדש) | — | `TeamGames.jsx` · `LeagueTable.jsx` · `iba.js` |
| מצב הרצה (חדש) | — | `PlanRunner.jsx` |

## איך בודקים חי בלי להקליד סיסמה

1. מביאים session: `POST {VITE_SUPABASE_URL}/auth/v1/token?grant_type=password` עם ה-anon key.
2. יוצרים `public/__devlogin.html` שכותב את המפתח `sb-<ref>-auth-token` ל-localStorage ומפנה ל-`/`.
3. פותחים אותו בדפדפן, בודקים, ו**מוחקים את הקובץ** — יש בו access token.

הערה: הזרקת JS חיצונית ל-localStorage בתצוגת התצוגה המקדימה נחסמת (SecurityError); סקריפט של הדף עצמו עובד.

## מה נכנס אחרי הדחיפה הראשונה (29.7, המשך)

עמוד 22 במסמך («מה שעוצב אבל עוד לא מומש») נסגר כמעט כולו:

- **סרגל תחתון של 5** בשני העולמות. מאמן: בית · קהילה · תוכניות · הקבוצה · הודעות. שחקן: בית · המשימות שלי · האימונים שלי · הקבוצה · פרופיל (בדיוק מוקאפ 3b).
- **שלדי טעינה** ב-13 מסכים, ו**הפרדת שגיאה מריק** בחמישה מקומות שבהם כשל רשת התחזה ל«אין נתונים».
- **שתי דלתות** לבניית תוכנית («בנה לי» / «אני אבנה») במקום שלוש, ויעד עומק `plans:<id>` לפתיחת תוכנית מסוימת.
- **eyebrow אחיד + כתום נגיש** בדף הבית, והכתבות ירדו מאחורי דגל `SHOW_NEWS` ב-`Home.jsx`.
- **סקירה יריבה** (שלושה סוכנים על תשעת הקומיטים) העלתה 13 תקלות שתוקנו — הבולטות: «איפוס הטיימר» במסך ההרצה שלא עשה כלום, גיליון השליחה בלי מלכודת פוקוס, ומודאל התוצאה בלי Escape.

## מה נשאר פתוח

- **מיזוג סרטונים לתרגילים — לא נעשה בכוונה.** הבעלים אישר מחדש ב-29.7 שהמדיה נשארת מסך נפרד; היא כבר לא בסרגל התחתון אלא במגירה, כך שהרעש ירד בלי לאבד את המסך.
- **דיווח בווידאו** על משימה — דורש סכימה + אחסון, ולכן לא נבנה.
- **מסך הקהילה של השחקן** נגיש רק מאריח אחד בדף הבית (הוסר מהניווט בכוונה ב-25.7).
- שני קבצי ה-SQL שלמעלה עדיין מחכים להרצה — **הקוד כבר בפרודקשן, אז עד שירוצו: אישורי ההגעה לא נשמרים ותוצאת משחק לא נשמרת** (שניהם מציגים הודעה מפורשת ולא נופלים).
