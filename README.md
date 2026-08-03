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

## פריסה

מחובר ל-Vercel: כל מיזוג ל-`main` נפרס אוטומטית (הגדר את שני משתני הסביבה
בפרויקט ה-Vercel). ‏CI ‏(GitHub Actions) מוודא build נקי על כל push/PR ל-main.

## מסמכים נוספים

- `SPEC.md` — אפיון · `SECURITY.md` — מדיניות אבטחה
- `HANDOFF.md`, `DESIGN_RESEARCH.md` — עיצוב · `AUDIT.md` — ממצאי סקירות
