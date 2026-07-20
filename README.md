# CourtSide 🏀

**הבית הדיגיטלי של מאמן הכדורסל** — קהילה, ספריית תרגילים, בונה תוכניות אימון, לוח טקטיקה, ניהול קבוצות, לו"ז, מדיה ועריכת וידאו. עברית RTL תחילה, עם תמיכה מלאה באנגלית.

🔗 **אתר חי:** https://courtsideil.vercel.app

## מה יש בפנים

| תחום | יכולות |
| --- | --- |
| 🏠 קהילה | פיד פוסטים עם תמונות, סוגי פוסט (שאלה/טיפ/וידאו/משרה/סקר), לייקים, תגובות, סקרים חיים, אירועים עם RSVP, ערוצי צ'אט לפי קטגוריה, הזמנת מאמנים בוואטסאפ |
| 🔔 התראות | פעמון עם מונה חי — לייק, תגובה, הצבעה, RSVP והודעה פרטית; זמן-אמת (Supabase Realtime) |
| 🏀 תרגילים | מחברת מאמן לכתיבה "כמו במציאות", לוח טקטיקה עם אנימציה, דירוגים, מועדפים, שיתוף וואטסאפ, דף ציבורי לתרגיל (`#/drill/<id>`) |
| 📋 תוכניות | בונה אימונים עם יעד 90 דק', פירוק זמן צבעוני לפי קטגוריה, בנאי חכם, מצב הרצה חי, ייצוא PDF |
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

> **סביבת ייצור קיימת?** שלבים 1–7 כבר רצים אצלך; ודא ש-8–11 הורצו.
> `supabase_cleanup_drills.sql` — אופציונלי, מוחק תרגילי דוגמה.
> נדרש גם bucket ציבורי בשם `media` ב-Storage (עם מדיניות העלאה ל-authenticated).

## פריסה

מחובר ל-Vercel: כל מיזוג ל-`main` נפרס אוטומטית (הגדר את שני משתני הסביבה
בפרויקט ה-Vercel). ‏CI ‏(GitHub Actions) מוודא build נקי על כל push/PR ל-main.

## מסמכים נוספים

- `SPEC.md` — אפיון · `SECURITY.md` — מדיניות אבטחה
- `HANDOFF.md`, `DESIGN_RESEARCH.md` — עיצוב · `AUDIT.md` — ממצאי סקירות
