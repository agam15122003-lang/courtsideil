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

**סטטוס: אומת.** `npm run verify` רץ ועבר (28.7.2026).

### אימות שהכללים באמת מוחלים (ולא רק נכתבו)

| כלל | סלקטור | נמצא ב-JSX |
|---|---|---|
| `view-fade` | `.main-inner` | `Dashboard.jsx:319`, `PlayerDashboard.jsx:1799` — **עם `key={view}`**, כלומר הרכיב מתמאונט מחדש בכל טאב והאנימציה באמת רצה |
| `animation: none` | `.main-inner > *` | מנטרל את `fade-rise` על שני הילדים בפועל |
| `card-enter` + delays | `.home-card` `.drill-card` `.coach-card` `.land-feature` | Home, DrillCard/GamesBoard/TrainingPlans/CoachProfile, CoachFinder, Landing |

`fade-rise` לא התייתם — עדיין משמש `.drawer-overlay`, dropdown ועוד 2 מקומות.

**פער שנמצא ותוקן:** `.news-card` ו-`.stat-card` נכללו ברשימת `card-enter` (שורות 6237-6238) אבל **מעולם לא קיבלו `animation-delay`** — לא בגרסה הישנה ולא בשלב א'. הם נכנסו ב-delay 0, כלומר בדיוק בתוך ה-fade של `.main-inner` — ההתנגשות ששלב א' בא לפרק. תוקן בסולם עדין ותחום: **210 / 240 / 270 / 300ms** (מתחיל מיד אחרי ה-fade של 220ms, צעדי 30ms, נעצר ב-300). הם גם נשמטו מרשימת ההשבתה — נוספו לשני הכיבויים.

---

## שלב ב' — GSAP (בוצע 28.7.2026)

### התשתית: `src/anim.js`

מודול חדש שמרכז את חוזה התנועה ב-JS:

- `motionOff()` — `prefers-reduced-motion` **או** `html.a11y-motion`. הקוראים לא מאתחלים timeline בכלל כשזה true (כלל ה-`*` הגלובלי עם `transition-duration: 0.001ms` לא עוצר GSAP).
- `dur('--dur-slow')` — קורא את טוקני המשך מ-`index.css` וממיר לשניות. אין ms קשיח בקוד.
- `EASE_OUT = 'power4.out'` — המקבילה בזמן ריצה ל-`--ease-out` (`cubic-bezier(.22,1,.36,1)`).
- `loadGsap()` — `import()` דינמי ממוזער ל-promise יחיד, כולל `DrawSVGPlugin` (חינמי מ-GSAP 3.13). **gsap לא נכנס ל-bundle הראשי** ולא נטען בכלל למי שביקש פחות תנועה.
- `resetArrowDraw` / `clearArrowDraw` / `buildArrowDraw` — מנוע ציור החצים המשותף לשני המסכים.

**שני מנגנוני ציור, לפי גיאומטריה ולא לפי סגנון:**
- **חץ ישר** (תנועה + מסירה) — הארכת `x2/y2`. לא DrawSVG: חץ מסירה הוא `strokeDasharray`, ו-DrawSVG דורס בדיוק את התכונה הזו — התוצאה הייתה החלקת מקפים במקום קו נמתח. בונוס: ראש החץ נגרר עם הקצה בחינם.
- **חץ קשת** (זריקה לסל) — DrawSVGPlugin, וראש החץ מוסתר עד 90% מהציור כדי שלא ירחף על קו חלקי.
- `opacity: 0` עד שמגיע התור של החץ — בלי זה קו באורך אפס עדיין צייר את ראש החץ שלו, וראש חץ בודד ריחף על המגרש לאורך ההשהיה.

### ב1 — TacticsBoard: קווי תנועה שמציירים את עצמם

**ממצא:** שורה 610 עשתה `arrows: []` — במצב "נגן אנימציה" לא היו חצים **בכלל**. זו תוספת, לא החלפה.

**שילוב ולא דריסה:** לולאת ה-`requestAnimationFrame` (531-555) נשארה **השעון היחיד**. GSAP מקבל timeline `paused: true` שנגרר ידנית ב-`tl.progress(frame.p / 0.85)` מתוך `useArrowDraw`. אין שתי לולאות שנגררות זו מזו, ו"השהה"/"התחל מהתחלה" הקיימים עובדים בלי שורת קוד נוספת כי הם משנים את `frame`.

- `DRAW_LEAD = 0.85` — החצים מסיימים להצטייר ב-85% מהמעבר: הקו מוביל, השחקן עוקב.
- `resetArrowDraw` מוחל ב-`useLayoutEffect` (סינכרוני) כדי שלא יהיה הבזק של חצים מלאים בזמן שה-`import()` בדרך.
- תלויות ה-effect הן חתימת ה-id-ים ולא מערך החצים — אחרת ה-timeline היה נבנה מחדש 60 פעם בשנייה.
- `clearArrowDraw` עובר על `geom` ולא על ה-DOM: בהחלפת שלב React כבר החליף את החצים לפני שה-cleanup של השלב הקודם רץ, ומעבר על ה-DOM היה מנקה את מצב הפתיחה של השלב **החדש**.

### ב2 — CourtDiagram: ציור הדרגתי (אפשרות ב')

`useNotebookDraw` — במאונט: קווי המגרש נמתחים (DrawSVG, stagger) → החצים מציירים את עצמם → האובייקטים נכנסים ב-fade+scale. כניסה מדורגת בין תרשימים סמוכים, חסומה ב-3 כדי שלא יהיה זנב אינסופי בתוכנית ארוכה. מאזין `beforeprint` קופץ ל-`progress(1)` כדי שהדפסה באמצע האנימציה תיתן דף שלם.

**הרכיב הופעל בפועל** (זו הייתה אפשרות ב' — שינוי מוצר, לא רק אנימציה): `noCourt` הוסר מ-`DrillCard.jsx` ומ-`PublicDrill.jsx`. הנימוק מעבר לאסתטיקה: כלל ה-`@media print` מסתיר הכול חוץ מ-`.notebook`, ו-`TacticsBoard` יושב **מחוץ** לה — כלומר עד היום **הדפסת תרגיל איבדה את המגרש לגמרי**. עמודת ה-150px היא storyboard מודפס לצד הנגן האינטראקטיבי.

לא הופעל ב: `DrillForm` (תצוגה מקדימה חיה תוך כדי עריכה על הלוח), ובשלושת מסכי התוכנית (`plan.board` לא קיים ב-`planToNotebook` — היה מתקבל מגרש ריק חסר ערך; לכל פריט כבר יש `TacticsBoard` משלו).

**`DrillSketch.jsx` — דולג.** 0 ייבואים בכל הריפו. קוד מת.

### אימות (28.7.2026)

`npm run verify` עבר. בנוסף — בדיקה חיה בדפדפן על עמוד probe זמני עם נתוני בדיקה (נמחק אחרי):

- **CourtDiagram**: שלושת התרשימים מציירים את עצמם ומסיימים נכון — `strokeDashoffset: 0`, חצים ב-`x2` היעד (250 / 380 / 150), ראש החץ הכתום מוחזר, אובייקטים ב-opacity 1.
- **TacticsBoard**: נתפס באמצע גרירה — חץ התנועה ב-`x2=231.06, y2=226.22` (בין המוצא 120,380 ליעד 250,200), חץ המסירה שתורו טרם הגיע ב-`opacity: 0` וקצה מקופל. כלומר השרשרת `frame.p → drawScrub → tl.progress → DOM` עובדת.
- **חוזה הנגישות**: תחת `html.a11y-motion` — `performance.getEntriesByType('resource')` מחזיר **אפס בקשות ל-gsap**. לא רק שה-timeline לא רץ; הספרייה לא הגיעה לדפדפן. כל התרשימים והחצים מוצגים שלמים וסטטיים, בלי opacity או dasharray אינליין.
- הערה: הכרטיסייה הייתה מוסתרת ולכן `requestAnimationFrame` היה חנוק לחלוטין (0 פריימים/שנייה). האנימציות "נתקעו" — זה חניקת דפדפן, לא באג. האימות בוצע בגרירה ידנית של `globalTimeline.time()`.

**גדלים:** ה-bundle הראשי גדל ב-3.9KB בלבד (315.1 → 319.0KB). gsap יושב ב-chunk עצל נפרד של 70.8KB + 4KB ל-DrawSVGPlugin, שנטענים רק כשבאמת מנפישים.

---

## הבא בתור (לא אושר עדיין)

- **שלב ג' — motion**: `LazyMotion` + `motionOff()` (כבר קיים ב-`anim.js`); bottom-sheets (`FeedbackSheet`, `SendToPlayers`, `SmartBuilder`); מגירת מובייל בכיוון RTL לוגי; `layout` על `MultiSelect` / `TeamAssignments` / `PlanRunner`.
- **שלב ד' — פוליש**: פסי התקדמות `width` → `scaleX` (כ-20 מופעים ב-`index.css` מפרים את DESIGN.md §3: "אין אנימציה של width/height בלייאאוט"); Lenis בדפים הציבוריים.
- ~~ספירת מספרים~~ — נדחה סופית (החלטה 3).

## חוזה קבוע לכל שלב
- כיבוי כפול: `prefers-reduced-motion` **וגם** `html.a11y-motion`. ב-JS זה אומר **לא לאתחל את ה-tween בכלל** — `transition-duration: 0.001ms !important` לא עוצר GSAP או motion.
- CSS חדש = בלוק append עם banner מתוארך בסוף `index.css` בלבד.
- טוקנים בלבד: `--dur-fast/base/slow`, `--ease-out/spring`. אין ms קשיח.
- RTL: תזוזה אופקית בכיוון לוגי, לא `x: -100`.
- `npm run verify` אחרי כל שלב.

## חוב שנצפה אגב הדרך (לא טופל)
- `Schedule.jsx:341` מייבא `ArrowRight` ישירות — DESIGN.md §4 מחייב `src/DirIcon.jsx`.
- `CourtDiagram.jsx` מכיל hex גולמי (`#1b2a4a`, `#E8763A`, `#D64545`) — DESIGN.md §1. גם `TacticsBoard.jsx` (`#1B2A4A`, `#E3B877`).
- `DrillSketch.jsx` — קוד מת, 0 ייבואים. מועמד למחיקה.
- כל `CourtDiagram` מגדיר מחדש `<marker id="nb-arrow">` — id כפול ב-DOM כשיש כמה תרשימים בעמוד. ויזואלית לא מורגש (המרקרים זהים), אבל לא תקין. קדם-קיים.
