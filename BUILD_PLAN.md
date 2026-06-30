# CourtSide — תוכנית הבנייה הסופית: פתיחת השער לשחקנים, הורים ומועדונים

מסמך זה הוא תוכנית העבודה הסופית, אחרי תיקון כל ממצאי הביקורת. הוא כתוב כך שמאמן (לא איש טכנולוגיה) יבין מה קורה בכל שלב, אבל עם שמות הטבלאות, הפונקציות והקבצים האמיתיים שכבר קיימים בקוד — ועם התיקונים שמונעים שבירה ודליפה.

> נוצר ע"י תהליך רב-סוכן (9 אדריכלים קראו את הקוד האמיתי → איחוד → ביקורת אדוורסרית → גרסה סופית). משלים את [ROADMAP_TRAINEES.md](ROADMAP_TRAINEES.md).

---

## חזון בקצרה

CourtSide מפסיק להיות "פנקס למאמן" והופך ל**מערכת-הפעלה לקבוצת כדורסל**: המאמן שולח תרגילים ומשימות → השחקן מבצע ומדווח → המאמן רואה ביצוע ונותן משוב אישי שנשמר בציר-זמן → ההורה רואה שקיפות מלאה (לו"ז, מיקומים, נוכחות, משוב) → מנהל מועדון מקבל דשבורד-על. הכול מעל הקוד הקיים, **בלי לשבור אף מאמן שכבר עובד היום**.

**שלושת עקרונות-הברזל (חוזרים בכל שלב):**
1. **אדיטיביות.** כל מאמן קיים ממשיך בדיוק כמו היום. כל עמודת `role` חדשה = `default 'coach'`. כל מדיניות אבטחה חדשה היא **תוספת** מעל הקיים. שלוש חריגות מכוונות (נעילת `role`, צמצום `profiles_select`, `can_message`) מטופלות בנפרד ובמפורש.
2. **שכבת-אמת אחת.** כל גישה לנתוני שחקן עוברת **רק** דרך פונקציות-אמת `SECURITY DEFINER STABLE` בתבנית `public.is_admin()` הקיימת — אף פעם לא דרך תנאי ad-hoc. מונע גם רקורסיית-RLS וגם דליפה אופקית.
3. **בטוח-by-default.** עד שיש קישור פעיל, השחקן רואה `null` שורות. אין גישה = ברירת המחדל.

---

## חלק 0 — מה כבר קיים בקוד (אומת)

| נכס קיים | איפה | חשיבות |
|---|---|---|
| `public.is_admin()` (security definer stable) | `supabase_teams_admin.sql:116-119` | התבנית המדויקת לכל פונקציות-האמת החדשות. |
| דפוס `"*_own"` (`using auth.uid()=coach_id`) | `supabase_teams_admin.sql:93-102` | כל טבלאות הקבוצה. נשאר ללא נגיעה. |
| `handle_new_user()` — שתי גרסאות, `on conflict (id) do nothing` | `supabase_setup.sql:66-78`, `supabase_stage2.sql:30-42` | אם הפרופיל קיים, role לא יתעדכן → role נקבע דרך RPC. |
| `profiles_update_own` בלי `with check` | `supabase_setup.sql:56-58` | מאפשר לעדכן כל עמודה כולל `role` → חור הסלמה, ננעל בשלב 1. |
| `profiles_select_authenticated` — כל מחובר קורא כל פרופיל | `supabase_stage2.sql:64-71` | דליפת קטינים → מצומצם בשלב 1. |
| `messages` FK ל-`profiles(id)` | `supabase_messages.sql:22-25` | ל-`can_message` יש להצטלב מול `profiles.is_minor`. |
| `team_players(coach_id, name, number, position, birth_year, injury_note...)` | `supabase_teams_admin.sql:9-55` | ציר האמת של השחקן. מקשרים אליו, לא מכפילים. |
| `drills(... coach_notes, created_by ...)` | `supabase_stage3.sql:19-84` | `coach_notes` = דגשים למאמן → לא חושפים לשחקן (view נפרד, שלב 3). |
| `Auth.jsx` — `signUp` בלי `options.data`; קיים OTP path | `src/Auth.jsx:62` | זרימת קטין תשתמש ב-OTP (session מיידי). |
| אי-התאמת `schedule_entries` (SQL מול קוד) | — | `team` הוא טקסט חופשי לא מפתח; מאמתים עמודות ב-`information_schema` לפני כתיבה. |
| `storage.js` — bucket ציבורי `media`, בלי EXIF-stripping | `src/storage.js:13,20` | מדיית-שחקן ממתינה ל-`media-private` (שלב 6ב). |

---

## חלק 1 — סדר השלבים

### שלב 1 — תפקידים (`role`) + נעילה + צמצום חשיפת פרופילים  [יסוד, מאמץ 3/5]
**מספק:** עמוד-השדרה של כל המהלך + סגירת דליפת-הפרופילים מההתחלה.

**SQL — `supabase_roles.sql`** (אידמפוטנטי):
1. עמודה ואז constraint בנפרד: `add column role ... default 'coach'` → `add constraint ... not valid` → `validate`. (`'admin'` **לא** ברשימה — אדמין מזוהה רק ע"י `is_admin`.)
2. `public.auth_role()` — תבנית `is_admin()`. **אסור** להשתמש בה לגייטינג-אדמין.
3. עדכון שתי גרסאות `handle_new_user()` — קוראות role מ-metadata אך חוסמות ערכי-על (רק `player`/`parent`).
4. **נעילת role:** מחליפים `profiles_update_own` ב-policy עם `with check` שמקבעת role + `set_my_role()` `security definer` (מקבל רק `player`/`parent`, רק כשעדיין `coach`).
5. **צמצום `profiles_select`:** מאמנים גלויים לכולם; `player`/`parent` רק לעצמם / למאמן / להורה המקושר.

**קבצים:** `src/roles.js` (חדש), `src/Dashboard.jsx:143` (שורה אחת), `src/i18n.js`.
**בדיקת קבלה:** מאמן קיים → תפריט זהה; `role='player'` ידני → תפריט מצומצם; ניסיון להחזיר ל-`coach` → נכשל; `select * from profiles` → רק מאמנים + עצמי.
**rollback:** `supabase_roles_down.sql`.

### שלב 2 — קישורים + פונקציות-אמת + redeem עם אישור-מאמן  [יסוד, מאמץ 4/5]
**מספק:** מחבר חשבון לשורת `team_players` קיימת + המנגנון הוויראלי (קוד/QR), עם הגנה מחטיפת-זהות.

**SQL — `supabase_trainees_foundation.sql`:**
1. `team_players add user_id (on delete set null), claimed_at`.
2. `player_invites` (קוד 6 ספרות + token QR, `expires_at` בשעות, `max_uses`).
3. `parent_links` (`status` pending/active/revoked, `consent_at`).
4. `coach_player_links` (`unique(coach_id, team_player_id)`; `player_id on delete cascade`).
5. פונקציות-אמת בשמות לפי סוג-מפתח: `is_my_player(auth.users.id)`, `is_parent_of_tp(team_players.id)`, `is_my_parent_user`, `owns_tp`.
6. `redeem_player_invite()` — `security definer`, `for update`, מכניס קישור **`pending`** (לא active!) → המאמן מאשר עם `approve_link()`. מונע חטיפת-זהות מצילום-מסך.
7. `create_player_invite()` — בודק `owns_tp` (מאמן ב' לא מזמין לשחקן של מאמן א').

**קבצים:** `src/Teams.jsx` (הזמן/אשר), `src/InviteModal.jsx` + `src/RedeemInvite.jsx` (חדשים), `src/Auth.jsx` (OTP, token ב-localStorage).
**בדיקת קבלה (סקריפט חובה):** שחקן א' מקבל **0** שורות מנתוני שחקן ב'. קישור pending → אין גישה; אחרי approve → יש. **תוצאה ≠0 חוסמת מיזוג לפרודקשן.**

### שלב 3 — מעטפת השחקן + דשבורד + ספרייה קריאה-בלבד  [פיצ'ר, מאמץ 3/5]
- `player_streaks`, ו-**view `drills_public`** ללא `coach_notes`/מחבר (שחקן לא קורא `drills` ישירות).
- `src/PlayerShell.jsx` + `src/PlayerHome.jsx` + `src/PlayerDrillLibrary.jsx` (חדשים). prop `readOnly` ל-`DrillCard`.
- **קריטי:** ניתוב `role==='player'` **לפני** חישוב `showForm` ב-`Dashboard.jsx` (אחרת שחקן נתקע בטופס-מאמן).

### שלב 4 — מנוע הליבה: הקצאות ומשימות  [פיצ'ר-מפתח, מאמץ 4/5]
- `assignments` (snapshot של כותרת התרגיל), `assignment_targets`, `submissions`.
- שחקן רואה רק את ה-submission שלו (לא את הנמענים האחרים). טריגר `BEFORE UPDATE` מגן על `coach_feedback`/`coach_approved`.
- **וידאו כבוי** עד שלב 6ב.
- `src/AssignDrillModal.jsx`, `src/Compliance.jsx`, `src/MyTasks.jsx` (חדשים) + כפתור "הקצה" ב-`DrillCard`.

### שלב 5 — יומן משוב אישי (צד-מאמן ב-MVP)  [פיצ'ר, מאמץ 3/5]
- `player_feedback(context_type practice/game/general, context_date, game_id, rating, note, visibility default internal)`.
- `src/FeedbackTimeline.jsx` + `src/GiveFeedback.jsx` (חדשים) + טאב "משוב" ב-`Teams.jsx`.
- חשיפה לשחקן/הורה **נדחית** (ב-MVP רק צד-מאמן). `visibility='internal'` לעולם לא דולף.

### שלב 6א — בטיחות קטינים: שער-גיל + הסכמת-הורה + סגירת DM  [תנאי-סף, מאמץ 4/5]
**אסור להשיק שחקן אמיתי בלי זה.**
- `birth_date`, `is_minor` (NOT NULL default false, מחושב בטריגר <16), `account_status`, `parent_consents` + `redeem_consent` (חתימה+זמן+IP, אימייל הורה נפרד).
- **`can_message()`** על insert **וגם** update: מבוגר↔מבוגר = תמיד true (מאמנים לא נשברים); אחרת רק קשר מאומת.
- `src/ConsentPending.jsx` + `src/ParentConsent.jsx` (חדשים), גייט ב-`Dashboard.jsx`.

### שלב 6ב — אבטחת מדיה (bucket פרטי + signed URLs + EXIF)  [תנאי-סף לווידאו, מאמץ 4/5]
- bucket `media-private` + RLS + signed URLs + EXIF/geo-stripping. רק עכשיו מפעילים `require_video` משלב 4.

### שלב 7 — אזור ההורה (שקיפות, קריאה-בלבד)  [פיצ'ר, מאמץ 4/5]
- אימות עמודות `schedule_entries` ב-`information_schema` לפני כתיבת מדיניות.
- מדיניות SELECT הורה (`created_by IN מאמני-ילדיי AND is_personal=false AND team תואם`). אימונים אישיים מסוננים.
- `src/ParentDashboard.jsx`, `src/ParentSchedule.jsx` (Waze/Maps), `src/ParentChildPicker.jsx` (חדשים).

### שלב 8 — מנהל מועדון + דשבורד-על (Club OS)  [חזון, מאמץ 4/5]
- `clubs`, `memberships`, `in_same_club`. אישור `club_admin` רק דרך `is_admin()` (אנטי-התחזות). מיגרציית-גישור מ-`profiles.club` (טקסט) ל-`clubs`.
- `src/ClubRequestForm.jsx`, `src/ClubDashboard.jsx` (חדשים) + טאב "מועדונים" ב-`Admin.jsx`.

---

## חלק 2 — מיגרציית SQL מאוחדת (סדר הרצה)

```
0. (קיים) setup → stage2 → stage3 → teams_admin → messages → schedule   ← אל תיגע
1. supabase_roles.sql               role + auth_role() + נעילת role + צמצום profiles_select   [+ down]
2. supabase_trainees_foundation.sql user_id, player_invites, parent_links, coach_player_links,
                                     פונקציות-אמת, redeem(→pending), create_invite, approve_link
3. supabase_stage4_players.sql      player_streaks, drills_public (בלי coach_notes)
4. supabase_assignments.sql         assignments, targets, submissions, BEFORE UPDATE guard (וידאו כבוי)
5. supabase_player_feedback.sql     player_feedback (visibility internal)
6a. supabase_minors_safety.sql      is_minor (NOT NULL false), consent, can_message (מבוגר↔מבוגר=true)
6b. supabase_media_security.sql     media-private bucket, signed URLs, EXIF — מפעיל require_video
7. supabase_parent_zone.sql         team_attendance, SELECT הורה (created_by+team+is_personal=false)
8. supabase_clubs.sql               clubs, memberships, גישור profiles.club
*  supabase_trainees_rls_test.sql   בדיקת דליפה אחרי כל קובץ מ-2 והלאה. תוצאה ≠0 = חוסם.
```

**כללי-ברזל:** כל עמודת role/דגל חדש → `default` בטוח. כל פונקציית-אמת → `security definer stable` + `grant execute to authenticated`, מוגדרת רק אחרי הטבלאות שהיא קוראת.

---

## חלק 3 — קו ה-MVP

**הלולאה המינימלית — "מאמן שולח תרגיל, רואה מי ביצע":**
1. תפקידים + ניתוב + צמצום profiles (שלב 1) — חובה.
2. קישור שחקן/הורה בקוד/QR עם אישור-מאמן (שלב 2) — חובה.
3. מעטפת שחקן + ספרייה קריאה-בלבד (שלב 3).
4. הקצאות + "המשימות שלי" + Compliance (שלב 4) — ה-Moat. בלי וידאו.
5. בטיחות קטינים מינימלית (שלב 6א) — **תנאי-סף לפני שחקן אמיתי**.
6. דשבורד-הורה מינימלי (דורש 2 + 6א + מדיניות-7).
7. Streak בסיסי.

**נדחה:** חשיפת משוב לשחקן/הורה, וידאו-ביצוע (6ב), מנהל מועדון (8), PWA+Push, RSVP מלא, גיימיפיקציה מורחבת, תשלומים, מאמן-AI.

---

## חלק 4 — "מה בונים ראשון": PR ראשון מדויק

**מטרה:** להניח את עמוד-השדרה (`role`) + לסגור את דליפת-הפרופילים, ולהוכיח שמאמן קיים לא נשבר — בלי לבנות עדיין שום מסך-שחקן.

1. **`supabase_roles.sql`** (חדש): role default 'coach' + auth_role() + עדכון handle_new_user + נעילת role (`with check` + `set_my_role` security definer) + צמצום `profiles_select_visible`.
2. **`supabase_roles_down.sql`** (חדש) — rollback מוכן.
3. **`src/roles.js`** (חדש) — `navForRole` (ענף coach = `NAV` הקיים בדיוק).
4. **`src/Dashboard.jsx`** — שינוי שורה אחת (143); לא-מוגדר = מאמן; הערת-TODO למיקום PlayerShell העתידי.
5. **`src/i18n.js`** — `role.*` + `nav.*` (he+en).

**למה בטוח:** כל הקיימים `role='coach'` → אותו NAV → אפס שינוי חזותי. אין מסך-שחקן → אין משטח-תקלות חדש.
**בדיקת קבלה:** מאמן קיים — תפריט זהה; role='player' ידני → תפריט מצומצם; ניסיון להסלים role → נכשל; אדמין רואה ניהול; Schedule/CoachFinder עדיין מציגים מאמנים.

---

## חלק 5 — אבטחה + בטיחות קטינים (תמצית)

**מניעת דליפה בין שחקנים:** שכבת-אמת אחת (security definer, שמות לפי סוג-מפתח); קישור `pending` עד אישור-מאמן; `on delete` מפורש; שחקן לא ניגש ל-`assignment_targets`; redeem דרך RPC בלבד; נעילת role; שחקן קורא מ-`drills_public`; **סקריפט בדיקת-דליפה אוטומטי אחרי כל שינוי RLS**; הסתרת-UI = נוחות בלבד, האבטחה תמיד ב-RLS.

**תנאי-סף לבטיחות קטינים (לפני שחקן אמיתי ראשון):** שער-גיל server-side; הסכמת-הורה מתועדת (double opt-in לאימייל נפרד); אין DM פתוח מבוגר↔קטין (מבוגר↔מבוגר נשאר פתוח); מדיה פרטית + EXIF-stripping; צמצום profiles כבר משלב 1; `visibility='internal'` לא דולף; הרחבת `reports.target_type` ל-player/parent.
