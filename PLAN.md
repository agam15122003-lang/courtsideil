# PLAN.md — תוכנית אנימציה ל-CourtSide

> קובץ מתגלגל: כל תשובה של Claude נכתבת גם לכאן. עודכן 28.7.2026, ענף `redesign`.

---

## החלטות שאושרו (28.7.2026)

| # | נושא | החלטה |
|---|---|---|
| 1 | סדר עבודה | **שלב א' בלבד — CSS בסיסי.** שלבים ב'/ג' אחר כך. |
| 2 | Lenis | רק בדפים הציבוריים (Landing / PublicDrill). **לא** בתוך האפליקציה. |
| 3 | ספירת מספרים בטיילים | **לא.** מאמן צריך לקרוא מספר מיד. ירד מהתוכנית לצמיתות. |

---

## חלוקת תפקידים בין הספריות

| ספרייה | תפקיד יחיד | אסור לה |
|---|---|---|
| **CSS (קיים)** | ברירת מחדל: hover, כניסות מסך, stagger, פסי התקדמות, skeletons | — |
| **motion** | מודלים / bottom-sheets / drawer / רשימות עם `layout` | **לא** כניסות מסך (DESIGN.md §3 — `AnimatePresence mode="wait"` נתקע בטאבים ברקע) |
| **gsap** | ציר-זמן מתוזמן ו-SVG | **לא** hover, לא כניסות כרטיסים |
| **lenis** | גלילה חלקה בדפים הציבוריים בלבד | **לא** ב-Dashboard / עולם השחקן |

נכון להיום אף אחת משלוש הספריות לא מיובאת בקוד. `package.json` כולל `motion@12.42.2`, `gsap@3.15.0`, `lenis@1.3.25`.

---

## ממצאי בדיקה — שלב א' המקורי התייתר

בבדיקת הקוד לפני הכתיבה התברר ששני הסעיפים של שלב א' לא רלוונטיים:

### א1 — "TacticsBoard: השמע מהלך" → **כבר בנוי, בלי GSAP**
`src/TacticsBoard.jsx:531-555` מכיל מנוע `requestAnimationFrame` מלא: אינטרפולציה בין שלבים, `easeInOutCubic` (שורה 558), play/pause, לולאה, ו-`autoPlay`.
חוזה הנגישות כבר מקוים ב-`TacticsBoard.jsx:404-417` — `autoPlay` מדלג גם על `prefers-reduced-motion` וגם על `html.a11y-motion`.
**מסקנה:** להחליף מנוע עובד ב-GSAP זה שכתוב, לא שדרוג. הסעיף יורד.
*(הערה: לולאת ה-play הידנית לא חסומה תחת reduced-motion — וזה נכון. המשתמש לחץ "נגן" במפורש.)*

### א2 — "CourtDiagram: ציור קווים" → **הרכיב לא מוצג בפועל**
כל שבעת הקוראים ל-`NotebookPage` מעבירים `noCourt`:
`DrillCard.jsx:239`, `DrillForm.jsx:381`, `PublicDrill.jsx:67`, `Schedule.jsx:346`, `TrainingPlans.jsx:745`, `TrainingPlans.jsx:1156`.
**מסקנה:** `CourtDiagram` הוא קוד מת כרגע. אנימציה עליו לא תיראה לאף אחד. הסעיף יורד.

---

## מה כן בוצע — איחוד שכבת הכניסה

**הבעיה שנמצאה:** בכל החלפת טאב רצו **שלוש** אנימציות כניסה זו על גבי זו:

| שכבה | סלקטור | אנימציה | מקור |
|---|---|---|---|
| 1 | `.main-inner` | `view-enter` — 380ms, opacity + `translateY(10px)` | `index.css:6224` |
| 2 | `.main-inner > *` | `fade-rise` — 320ms, opacity + `translateY(8px)` | `index.css:2753` |
| 3 | `.home-card` ואחרים | `card-enter` — 380ms + delay עד 190ms | `index.css:6239` |

המסך זז, מה שבתוכו זז שוב, והכרטיסים זזים בפעם השלישית — כ-570ms של תנועה מורכבת בכל ניווט,
מעל התקרה של **DESIGN.md §3** (כניסת מסך ≤380ms). זה מורגש בכל שמונת מסכי המאמן.

**התיקון (היררכיית תנועה — דבר אחד זז):** בלוק append מתוארך בסוף `src/index.css`:

1. `.main-inner` → `view-fade`, **fade בלבד בלי תזוזה**, `var(--dur-base)` (220ms).
2. `.main-inner > *` → `animation: none` — השכבה האמצעית מבוטלת. (ל-`.main-inner` יש בפועל שני ילדים בלבד, `QuoteStrip` והמסך, אז זה מעולם לא היה stagger אמיתי.)
3. הכרטיסים נשארים הרוקדים היחידים; ה-delay-ים הוזזו ל-200/250/300/350ms כדי שיתחילו **אחרי** שה-fade הסתיים במקום להתנגש בו.
4. כיבוי כפול מפורש — `@media (prefers-reduced-motion: reduce)` **וגם** `html.a11y-motion`, בלי להישען על כלל ה-`*` הגלובלי.

**סטטוס: `npm run verify` טרם רץ — הופסק על ידי המשתמש.** התיקון לא מאומת.

---

## הבא בתור (לא אושר עדיין)

- **שלב ב' — motion**: `LazyMotion` + `motionOff()`; bottom-sheets (`FeedbackSheet`, `SendToPlayers`, `SmartBuilder`); מגירת מובייל בכיוון RTL לוגי; `layout` על `MultiSelect` / `TeamAssignments` / `PlanRunner`.
- **שלב ג' — פוליש**: פסי התקדמות `width` → `scaleX` (כ-20 מופעים ב-`index.css` מפרים את DESIGN.md §3: "אין אנימציה של width/height בלייאאוט"); Lenis בדפים הציבוריים.
- ~~ספירת מספרים~~ — נדחה סופית (החלטה 3).

## חוזה קבוע לכל שלב
- כיבוי כפול: `prefers-reduced-motion` **וגם** `html.a11y-motion`. ב-JS זה אומר **לא לאתחל את ה-tween בכלל** — `transition-duration: 0.001ms !important` לא עוצר GSAP או motion.
- CSS חדש = בלוק append עם banner מתוארך בסוף `index.css` בלבד.
- טוקנים בלבד: `--dur-fast/base/slow`, `--ease-out/spring`. אין ms קשיח.
- RTL: תזוזה אופקית בכיוון לוגי, לא `x: -100`.
- `npm run verify` אחרי כל שלב.

## חוב שנצפה אגב הדרך (לא טופל)
- `Schedule.jsx:341` מייבא `ArrowRight` ישירות — DESIGN.md §4 מחייב `src/DirIcon.jsx`.
- `CourtDiagram.jsx` מכיל hex גולמי (`#1b2a4a`, `#E8763A`, `#D64545`) — DESIGN.md §1.
