import { L } from './i18n'
import { PLAYER_SIDE } from './flags'

// צעדי הסיור המודרך.
//
// כלל אחד שולט בקובץ הזה: **הסיור רק מראה ומסביר**. אף צעד לא מבקש
// מהמאמן לבצע פעולה, לא כותב שום דבר למסד, ולא לוחץ בשבילו. מי שרוצה
// לנסות — סוגר את הסיור ומנסה.
//
// לכל צעד:
//   view   — לאיזה מסך לנווט לפני שמציגים אותו (בלי זה נשארים במסך הנוכחי)
//   anchor — **רשימת** סלקטורים לפי סדר עדיפות. הראשון שנמצא ונראה מנצח.
//            הרשימה מכסה את שלושת משטחי הניווט: הסרגל בדסקטופ, גלולת
//            ניווט־הכיס במובייל, והגיליון «כל הפיצ׳רים». בלי רשימה כזו
//            כל צעד ניווטי היה נשבר במעבר בין אייפד לדסקטופ.
//   title/body — הטקסט בבועה
//   place  — העדפת מיקום ('bottom' ברירת מחדל); הבועה מתהפכת לבד אם אין מקום
//
// צעד בלי anchor — או כזה שהעוגן שלו לא נמצא בזמן שהוקצב — מוצג כשקופית
// ממורכזת בלי זרקור, במקום להיתקע. זו נקודת הכשל הכי סבירה: מסך שעוד לא
// סיים לטעון, או פריט ניווט שלא קיים בגודל מסך מסוים.

// עוגני צעד ניווטי, לפי סדר יורד של "כמה זה מסביר":
// פריט הסרגל בדסקטופ ← גלולת ניווט־הכיס במובייל ← ואם שניהם מוסתרים
// (מגירה סגורה באייפד) — הבאנר של המסך עצמו, שאליו ממילא ניווטנו.
// בלי החוליה האחרונה שבעה צעדים סימנו חור מחוץ למסך באייפד ובטלפון.
const SCREEN = ['.cs-hero-bar', '.cm-hero', '.nh-hero']
const nav = (id) => [
  `.sidebar-nav [data-nav="${id}"]`,
  `.pkn [data-nav="${id}"]`,
  `.pkn-grid [data-nav="${id}"]`,
  ...SCREEN,
]

export default function tourSteps() {
  return [
    // ---------- פתיחה ----------
    {
      key: 'w1',
      view: 'home',
      slide: true,
      title: L('נעים להכיר — זה CourtSide', 'Meet CourtSide'),
      body: L(
        'שתי דקות, ואתה יודע איפה הכול. אני רק מראה ומסביר — לא נוגע בכלום ולא משנה לך שום דבר.',
        'Two minutes and you will know where everything is. I only show and explain — nothing here is changed or saved.'
      ),
    },
    {
      key: 'w2',
      slide: true,
      title: L('המסלול של מאמן כאן', 'A coach loop here'),
      body: L(
        'הקבוצה והסגל · מחברת האימון · הרצת האימון בזמן אמת · סקירה אחריו. כל השאר — קהילה, תרגילים, לו״ז — יושב סביב המסלול הזה.',
        'Your team and roster · the practice notebook · running the practice live · the review after. Everything else — community, drills, schedule — sits around that loop.'
      ),
    },
    {
      key: 'w3',
      slide: true,
      title: L('אפשר לצאת בכל רגע', 'You can leave any time'),
      body: L(
        'כפתור «דילוג» סוגר את הסיור, ו-Esc עושה את אותו הדבר. תמיד אפשר לפתוח אותו שוב מדף הבית.',
        'The Skip button closes the tour, and Esc does the same. You can always reopen it from the home screen.'
      ),
    },

    // ---------- דף הבית ----------
    {
      key: 'hero',
      view: 'home',
      anchor: ['.nh-hero'],
      title: L('דף הבית', 'The home screen'),
      body: L(
        'הבוקר שלך במבט אחד: התאריך, האימון הקרוב, והדרך אליו. הכפתור הכתום כאן תמיד מוביל לדבר הבא שצריך לעשות.',
        'Your morning at a glance: the date, the next practice, and the way into it. The orange button here always leads to the next thing to do.'
      ),
      place: 'bottom',
    },
    {
      key: 'todo',
      anchor: ['.nh-o-todo'],
      title: L('מה מחכה לך', 'What is waiting for you'),
      body: L(
        'הכרטיס הזה משתנה לפי המצב שלך: בהתחלה הוא מראה את צעדי הפתיחה, ואחר כך — נוכחות שלא סומנה, סקירות שלא נכתבו ומשימות פתוחות.',
        'This card changes with your state: at first it shows the setup steps, later — unmarked attendance, unwritten reviews and open tasks.'
      ),
    },
    {
      key: 'week',
      anchor: ['.nh-o-week', '.nh-side'],
      title: L('השבוע שלך', 'Your week'),
      body: L(
        'שבעת הימים הקרובים, עם האימונים והמשחקים שכבר קבועים. לחיצה על יום פותחת אותו במלואו.',
        'The next seven days with the practices and games already set. Tapping a day opens it in full.'
      ),
      place: 'left',
    },

    // ---------- הקבוצה ----------
    {
      key: 'nav-teams',
      view: 'teams',
      anchor: nav('teams'),
      title: L('הקבוצה — נקודת ההתחלה', 'Your team — where it starts'),
      body: L(
        'כאן מוגדרות הקבוצות שאתה מאמן, ובתוך כל קבוצה הסגל: שם, מספר ותפקיד. כל השאר באפליקציה נשען על הרשימה הזו.',
        'This is where your teams live, and inside each team — the roster: name, number and position. Everything else in the app leans on that list.'
      ),
    },
    {
      key: 'roster',
      view: 'teams',
      anchor: ['.roster-list', '.roster-cols', '.empty-state'],
      title: L('הסגל', 'The roster'),
      // 2.9 — עם צד שחקן פתוח: לא חייבים חשבון, אבל יש דרך לחבר
      body: PLAYER_SIDE ? L(
        'שחקן נוסף כאן פעם אחת, ומופיע מאליו בנוכחות, ביעדים, במשוב ובסקירה. לא חייבים לו חשבון — ומי שרוצה לראות את הדברים בטלפון שלו מצטרף עם קוד הקבוצה שמופיע כאן.',
        'Add a player once here and they appear on their own in attendance, goals, feedback and the review. No account required — a player who wants it on their phone joins with the team code shown here.'
      ) : L(
        'שחקן נוסף כאן פעם אחת, ומופיע מאליו בנוכחות, ביעדים, במשוב ובסקירה. אין צורך שלשחקנים יהיה חשבון — הכול נשמר אצלך.',
        'Add a player once here and they appear on their own in attendance, goals, feedback and the review. Players do not need accounts — everything is kept on your side.'
      ),
    },

    // ---------- אימונים ותרגילים ----------
    {
      key: 'nav-work',
      view: 'work',
      anchor: nav('work'),
      title: L('אימונים ותרגילים', 'Practices and drills'),
      body: L(
        'שני טאבים במסך אחד: ספריית התרגילים, ובניית תוכנית האימון מהם.',
        'Two tabs on one screen: the drill library, and building a practice plan out of it.'
      ),
    },
    {
      key: 'drills',
      view: 'drills',
      anchor: ['.wk-tabs', '.tabs', '.drill-grid'],
      title: L('ספריית התרגילים', 'The drill library'),
      body: L(
        'תרגילים עם שרטוט מגרש, ציוד ומספר שחקנים. אפשר להוסיף משלך, וכל תרגיל נכנס לתוך תוכנית אימון.',
        'Drills with a court diagram, equipment and player count. You can add your own, and each drill goes into a practice plan.'
      ),
    },
    {
      key: 'plans',
      view: 'plans',
      anchor: ['.wk-tabs', '.tabs', '.plan-list'],
      title: L('מחברת האימון', 'The practice notebook'),
      body: L(
        'תוכנית אימון היא דף אחד: חלקים, זמנים ושרטוטים בכתב יד — ובאימון עצמו היא נפתחת לצד הנוכחות והיעדים.',
        'A practice plan is a single page: sections, timings and handwritten diagrams — and during the practice it opens beside attendance and goals.'
      ),
    },

    // ---------- לו״ז ----------
    {
      key: 'nav-schedule',
      view: 'schedule',
      anchor: nav('schedule'),
      title: L('הלו״ז', 'The schedule'),
      body: L(
        'ימי האימון הקבועים נכנסים ללו״ז לבד, שבוע אחרי שבוע. אימון חד־פעמי או משחק מתווספים ידנית.',
        'Fixed practice days enter the schedule on their own, week after week. A one-off practice or a game is added by hand.'
      ),
    },
    {
      key: 'schedule-add',
      view: 'schedule',
      anchor: ['.cal-actions', '.csx-quick', '.cal-add'],
      title: L('מה אפשר להוסיף כאן', 'What you can add here'),
      body: L(
        'אימון קבוצה, אימון אישי שרק אתה רואה, משחק — ואפילו פגישה עם מאמן אחר מהמערכת.',
        'A team practice, a personal practice only you see, a game — and even a meeting with another coach on the system.'
      ),
      place: 'bottom',
    },

    // ---------- קהילה ----------
    {
      key: 'nav-community',
      view: 'community',
      anchor: nav('community'),
      title: L('קהילת המאמנים', 'The coaches community'),
      body: L(
        'פיד של מאמנים אחרים: שאלות, תרגילים ורעיונות. אפשר לקרוא בשקט, ואפשר לפרסם.',
        'A feed of other coaches: questions, drills and ideas. You can read quietly, or post.'
      ),
    },
    {
      key: 'nav-finder',
      view: 'finder',
      anchor: nav('finder'),
      title: L('מאתר המאמנים', 'The coach finder'),
      body: L(
        'חיפוש מאמנים לפי מועדון ושכבת גיל — ומשם גם לוח משחקי האימון, למי שמחפש יריבה לשבת.',
        'Search coaches by club and age group — and from there the scrimmage board, if you need an opponent.'
      ),
    },
    {
      key: 'nav-messages',
      view: 'messages',
      anchor: nav('messages'),
      title: L('הודעות', 'Messages'),
      body: L(
        'שיחות אישיות עם מאמנים אחרים. הפעמון שלמעלה מודיע כשמשהו חדש מגיע.',
        'Private conversations with other coaches. The bell above tells you when something new arrives.'
      ),
    },
    {
      key: 'nav-media',
      view: 'media',
      anchor: nav('media'),
      title: L('מדיה', 'Media'),
      body: L(
        'סרטוני אימון ופודקאסטים שהקהילה מדרגת. אפשר להוסיף כל סרטון יוטיוב.',
        'Training videos and podcasts the community rates. Any YouTube video can be added.'
      ),
    },

    // ---------- שאלות ותשובות ----------
    {
      key: 'nav-help',
      view: 'help',
      anchor: nav('help'),
      title: L('נתקעת? יש מסך לזה', 'Stuck? There is a screen for that'),
      body: L(
        'שאלות ותשובות על כל מה שיש כאן, עם חיפוש. ומה שאין שם — כפתור אחד ששולח לנו את השאלה, ואנחנו עונים.',
        'Questions and answers about everything here, with search. And what is missing — one button sends us your question, and we answer.'
      ),
    },

    // ---------- הפעמון ----------
    {
      key: 'bell',
      view: 'home',
      anchor: ['.sidebar-bell .ntf-bell', '.topbar-actions .ntf-bell', '.nh-hero-bell .ntf-bell', '.ntf-bell'],
      title: L('הפעמון', 'The bell'),
      body: L(
        'תגובות, הודעות וזימונים נאספים כאן. הכול נשאר בתוך האפליקציה — אין התראות לטלפון ואין מיילים.',
        'Replies, messages and invites collect here. It all stays inside the app — no phone notifications and no emails.'
      ),
      place: 'bottom',
    },

    // ---------- סיום ----------
    {
      key: 'end',
      slide: true,
      title: L('זהו, אתה בפנים', 'That is it — you are in'),
      body: L(
        'הצעד הראשון הוא הקבוצה והסגל; משם הכול נפתח. את הסיור אפשר לפתוח שוב בכל רגע מדף הבית.',
        'The first step is your team and roster; everything opens from there. You can reopen this tour any time from the home screen.'
      ),
      last: true,
    },
  ]
}
