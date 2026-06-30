# AUDIT — סקירת UX/UI/נגישות (מצב נוכחי)

> נוצר מאודיט רב-סוכני שיטתי מול הצ'ק-ליסט שבמסמך ההנחיות. 64 ממצאים, 12 בחומרה גבוהה.
> הסטאק: React + Vite (JS/JSX), CSS עם design tokens (`index.css`), Supabase, RTL מלא, מצב כהה.

## 🔴 ממצאים בחומרה גבוהה (12)

### נגישות (WCAG 2.2 AA)
1. **כתום מותג נכשל בניגודיות.** טקסט לבן על `--accent #E8763A` = **2.96:1** (נדרש 4.5:1) — נכשל בכל ה-CTA הראשיים (`.btn-primary`, `.btn-hero`, `.btn-send`, `.chip.selected`, `.sched-add-btn`, `.land-login`). **תיקון:** מילוי כפתורים → `--orange-700 #A8491A` (5.78:1).
2. **כתום כטקסט/אייקון על רקע בהיר** = 2.66–2.96:1 — נכשל ב-`.nav-item.active`, `.rating-avg`, "פתח בספוטיפיי", eyebrow/kickers, אייקוני accent. **תיקון:** טקסט/אייקון משמעותי → `--orange-700`.
3. **פוקוס מקלדת בלתי-נראה** על הרבה פקדים אמיתיים — חוק ה-`:focus-visible` מכסה רק 9 סלקטורים. לא מכוסים: `.star`, `.ord-btn`, `.msg-del`, `.toast-x`, `.img-remove`, `.otp-opt`, `.btn-send`, וכרטיסי-עוגן (`.home-card`/`.news-card`/`.podcast-card`/`.video-thumb`/`.msg-conv`/`.picker-item`). **תיקון:** `:focus-visible` גלובלי.
4. **שדות בלי `<label>`/`aria-label`** — מזוהים רק ב-placeholder (Schedule שם-קבוצה+הערה, Videos חיפוש+הערה, TrainingPlans שם-תוכנית, Schedule בורר תוכנית). **תיקון:** labels/aria-label.

### עקביות
5. **`.welcome-badge` (תג ירוק של "הצלחה") בשימוש שגוי** ככותרת-עמוד ניטרלית ב-~10 מסכים → כל הכותרות ירוקות, בסתירה ל-`.eyebrow` הקיים. **תיקון:** `.page-eyebrow` אחיד (כתום-700); `.welcome-badge` רק להצלחה.
6. **שתי מערכות אינפוט מקבילות** — `.auth-form`/`.finder-input` (רדיוס 11px, גבול 1.5px `--line`) מול `.pf-label` (`--radius-sm`, `--border`). טפסים נראים שונה בין מסכים. **תיקון:** מערכת אינפוט אחת.

### רספונסיביות
7. **סרגל הצד במובייל — הכשל הגדול ביותר.** מתחת ל-768px כל הסרגל (8 פריטים + מתג מצב + "התנתקות") הופך לשורה אחת עם `overflow-x:auto`; ה-footer נדחף מחוץ למסך בטלפון. **תיקון:** **bottom tab bar** קבוע, או grid עם footer מוצמד.
8. **דף נחיתה — סרגל עליון** בלי breakpoint; ב-320–360px הכותרת + כפתור "התחברות/הרשמה" גולשים. **תיקון:** media query, קיצור תווית.
9. **לוח טקטיקה — מגרש שלם דחוס.** `.court` עם `aspect-ratio` קבוע של חצי מגרש → "מגרש שלם" (940×500) מקבל letterbox עם פסים ריקים, כמעט בלתי-שמיש בטלפון. **תיקון:** `.court--full { aspect-ratio: 940/500 }`.

### מצבים (States)
10. **שלד טעינה (skeleton) מחובר רק ל-Home.** כל 10 מסכי-הדאטה האחרים מציגים `טוען...` חשוף (קפיצת layout, מראה זול). **תיקון:** `SkeletonCard` לכל רשימה.
11. **Schedule + MyStats מתעלמים משגיאות.** `load()` זורק את ה-`error` → כשל רשת מוצג כ"יום ריק" / "אפס סטטיסטיקות". MyStats מחזיר `null` בטעינה (כל "האזור שלי" נעלם). **תיקון:** סולם loading→error→empty→list.

## 🟡 ממצאים בחומרה בינונית (עיקרי)
- **רדיוס כרטיסים לא אחיד** — `.plan-item`(14), `.msg-bubble`(14/16), `.msg-conv`(12), `.picker`(12), `.stat-card`(12) לא נורמלו ל-`--radius-card`(10).
- **`margin-top` מובנה ב-`.btn-primary`** מתבטל ב-12 `marginTop:0` inline. **תיקון:** מרווח בידי ה-container (gap).
- **~90 מרווחי-pixel inline** מחוץ לסקאלת 4px, לא עקביים בין מסכים.
- **`.btn-ghost` בלי `:disabled`/`:active`**; פעולות אסינכרוניות (דירוג, שמירה, מחיקה, מיון, רענון) בלי מצב busy → לחיצות כפולות.
- **משוב למשתמש לא עקבי** — חלק ב-Toaster, חלק ב-`.alert` בתחתית כרטיס ארוך (מתחת לקפל).
- **טוקני סמנטיקה על רקע מגוון** נכשלים — error #D64545 (3.76:1), success #2E9E5B (3.01:1), tab לא-פעיל (3.55:1), placeholder (~2.33:1).
- **קבוצות chips** בלי `role="group"` + `aria-pressed`.
- **יעדי מגע <44px** — `.ord-btn`/`.star`/`.msg-del`/`.toast-x`.
- **DrillForm** — טופס ארוך שטוח בלי `.form-section` (בניגוד ל-ProfileForm).
- **MyStats/GamesBoard** — חוסר היררכיה (אין כותרת ראשית/תת-כותרת).
- **grids עם רצפת minmax גבוהה** (260–270px) צפופים ב-320px.
- **גלישה אופקית** — אין רשת ביטחון גלובלית (`overflow-x`, `overflow-wrap`).

## 🟢 ממצאים בחומרה נמוכה (עיקרי)
- אייקון Star עם hex קשיח `#E8763A` ב-MyStats (לא token).
- אווטאר — 8 זוגות hex קשיחים, 4 משכפלים טוקני מותג.
- `.cat-badge` "פרטי" עם inline style במקום modifier class.
- ThemeToggle בלי `aria-pressed`/state דינמי.
- חצי `→`/`←` כטקסט (Auth/PlanRunner/SmartBuilder) — שביר ב-RTL.
- שדות מספריים/תאריך בלי `dir="ltr"` עקבי.
- ResetPassword בלי show/hide סיסמה ובלי ולידציה חיה.
- SmartBuilder בלי סיכום תוצאה; PlanRunner בלי progress bar.
- TacticsBoard SVG בלי `role`/`aria-label`/חלופת מקלדת.

## סיכום לפי ממד
| ממד | גבוה | בינוני | נמוך |
|------|------|--------|------|
| נגישות | 4 | 6 | 3 |
| עקביות | 2 | 4 | 2 |
| רספונסיביות | 3 | 3 | 2 |
| מצבים | 3 | 5 | 2 |
| מסכים+RTL | 0 | 6 | 9 |
