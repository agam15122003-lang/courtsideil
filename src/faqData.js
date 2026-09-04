import { L } from './i18n'
import { CONTACT_EMAIL } from './constants'
import { PLAYER_SIDE } from './flags'

// תוכן «שאלות ותשובות». מופרד מ-Help.jsx כדי שאפשר יהיה לערוך נוסח
// בלי לגעת ברכיב.
//
// ⚠ כלל אחד שולט בקובץ: כל תשובה כאן חייבת להיות **נכונה לאפליקציה כפי
// שהיא היום**. אם משהו עוד לא קיים — אומרים את זה בפירוש, ואומרים מה
// לעשות במקום. תשובה שמבטיחה פיצ'ר שלא קיים גרועה מאין תשובה בכלל,
// כי מאמן יחפש אותו ולא ימצא.
// 2.9 — צד השחקן חזר לפיילוט (PLAYER_SIDE=true): התשובות על «השחקנים
// שלי» מתפצלות לפי המתג — עם חשבונות שחקן ובלי — כדי ששני המצבים יישארו נכונים.
export const FAQ_CATEGORIES = [
  'התחלה',
  'הקבוצה והסגל',
  'אימונים ותרגילים',
  'לו״ז וסקירה',
  'קהילה',
  'פרטיות וחשבון',
  'תקלות',
]

export function faqItems() {
  return [
    // ---------- התחלה ----------
    {
      category: 'התחלה',
      q: L('נכנסתי והכול ריק. מאיפה מתחילים?', 'I logged in and everything is empty. Where do I start?'),
      a: L(
        'משני דברים, לפי הסדר: קודם מגדירים בפרופיל אילו קבוצות אתה מאמן, ואז מוסיפים את השחקנים לסגל. מהרגע שיש קבוצה וסגל, כל שאר המסכים מתמלאים לבד.\nבדף הבית יש כרטיס «בוא נתחיל» עם שלושת הצעדים, וכל צעד מוביל ישר למקום הנכון.',
        'Two things, in order: first set which teams you coach in your profile, then add players to the roster. Once you have a team and a roster, every other screen fills itself in.\nThe home screen shows a "Let\'s start" card with the three steps, and each step takes you straight there.'
      ),
    },
    {
      category: 'התחלה',
      q: L('איפה מגדירים את הקבוצות שאני מאמן?', 'Where do I set the teams I coach?'),
      a: L(
        'בפרופיל, בשדה «הקבוצות שאני מאמן». זה לא שדה טכני — הוא זה שפותח את מסך «הקבוצות שלי» ואת הלו״ז. בלעדיו אין לאן להוסיף שחקנים.',
        'In your profile, under "Teams I coach". It is not a technical field — it is what opens the Teams screen and the schedule. Without it there is nowhere to add players.'
      ),
    },
    {
      category: 'התחלה',
      q: L('יש הדרכה? איך אני רואה שוב את הסיור?', 'Is there a walkthrough? How do I see the tour again?'),
      a: L(
        'כן. בכניסה הראשונה נפתח סיור מודרך שעובר על כל המסכים ומסביר מה יש בכל אחד. הוא רק מראה ומסביר — לא משנה לך שום דבר.\nלפתוח אותו שוב אפשר מהכפתור בתחתית המסך הזה, מהפרופיל, ומהבאנר בדף הבית.',
        'Yes. On your first login a guided tour walks every screen and explains what each one is for. It only shows and explains — it changes nothing.\nTo replay it, use the button at the bottom of this screen, your profile, or the home banner.'
      ),
    },
    {
      category: 'התחלה',
      q: L('זה עולה כסף?', 'Does this cost money?'),
      a: L(
        'לא. כרגע השימוש חינם וכל הכלים פתוחים. אם יהיה בעתיד מסלול בתשלום — נודיע מראש, ומה שכבר שמרת יישאר שלך.',
        'No. It is free right now and every tool is open. If a paid plan comes later we will tell you in advance, and everything you saved stays yours.'
      ),
    },
    {
      category: 'התחלה',
      q: L('צריך להתקין אפליקציה?', 'Do I need to install an app?'),
      a: L(
        'לא. פותחים את הכתובת בדפדפן — בטלפון, באייפד או במחשב. אפשר להוסיף את האתר למסך הבית של הטלפון והוא ייפתח כמו אפליקציה רגילה.',
        'No. Just open the address in a browser — phone, iPad or computer. You can add the site to your phone home screen and it opens like a regular app.'
      ),
    },

    {
      category: 'התחלה',
      q: L('נרשמתי ולא הגיע מייל אישור', 'I signed up and no confirmation email arrived'),
      a: L(
        'קודם תבדוק בספאם וב«קידומי מכירות» — שם זה נוחת ברוב המקרים. באותו מסך יש «שליחה מחדש», וגם אפשרות לתקן את כתובת המייל אם הייתה טעות.\nיש גם דרך עוקפת: כניסה עם קוד למייל — שש ספרות שנשלחות אליך, בלי סיסמה בכלל.',
        'Check spam and the Promotions tab first — that is where it usually lands. The same screen has a resend button and a way to fix a mistyped address.\nThere is also a workaround: sign in with an emailed code — six digits, no password at all.'
      ),
    },

    // ---------- הקבוצה והסגל ----------
    {
      category: 'הקבוצה והסגל',
      q: L('השחקנים שלי צריכים להירשם?', 'Do my players need to sign up?'),
      a: PLAYER_SIDE ? L(
        'לא חובה. אתה מזין את הסגל ורושם נוכחות, עומס, יעדים ומשוב — גם בלי שאף שחקן מתחבר.\nשחקן שתרצה שיראה את הדברים בטלפון שלו מצטרף עם קוד הקבוצה (מסך «הקבוצות שלי»), ואחרי שתאשר אותו הוא רואה את הלו״ז, המשימות, היעדים והמשוב שנשלחו לו — ויכול לדווח בעצמו אחרי אימון. מי שלא מתחבר — הכול נשאר אצלך כמו היום.',
        'Not required. You enter the roster and log attendance, load, goals and notes — even if no player ever signs in.\nA player you want to see things on their phone joins with the team code (Teams screen); once you approve them they see the schedule, tasks, goals and feedback sent to them — and can report after practice. Anyone who does not join — everything stays with you as today.'
      ) : L(
        'לא, ובכוונה. CourtSide פתוחה למאמנים בלבד: אתה מזין את הסגל, ורושם נוכחות, עומס, יעדים ומשוב — והכול נשמר אצלך. השחקנים לא מתחברים, לא רואים כלום ולא מקבלים שום הודעה.',
        'No, and that is deliberate. Right now CourtSide is for coaches only: you enter the roster and log attendance, load, goals and notes — and it all stays with you. Players do not log in, see anything, or get any message.\nA player side is coming later.'
      ),
    },
    {
      category: 'הקבוצה והסגל',
      q: L('מה קורה למה שאני כותב על שחקן? מישהו רואה את זה?', 'What happens to what I write about a player? Does anyone see it?'),
      a: PLAYER_SIDE ? L(
        'תלוי מה. העומס שרשמת, סימוני «עמד ביעד» ותיק השחקן — רק אתה. משוב אישי, יעד, וההערה שאתה כותב לשחקן בסקירת האימון — שחקן שמחובר לסגל רואה אותם בטלפון שלו (זו המטרה, והוא מקבל על זה התראה). שחקן שלא מחובר — הכול נשאר אצלך. מאמן אחר לא רואה את הסגל שלך בשום מקרה.',
        'Depends. The load you logged, "met the goal" marks and the dossier — only you. Personal feedback, goals, and the line you write a player in the practice review — a player connected to the roster sees them on their phone (that is the point, and they get a notification). A player who is not connected — everything stays with you. No other coach ever sees your roster.'
      ) : L(
        'רק אתה. המשוב, היעדים, ציוני העומס וההערות שאתה כותב על שחקן נשמרים בחשבון שלך בלבד. שום שחקן והורה לא רואים אותם, ומאמן אחר לא רואה את הסגל שלך.',
        'Only you. The notes, goals, load scores and remarks you write about a player are stored in your account only. No player or parent sees them, and no other coach sees your roster.'
      ),
    },
    {
      category: 'הקבוצה והסגל',
      q: L('שחקן נפצע. למחוק אותו מהרשימה?', 'A player got injured. Should I delete him from the list?'),
      a: L(
        'לא. משנים לו את הסטטוס ל«פצוע» או «לא זמין», והוא נשאר בסגל עם כל ההיסטוריה שלו. הוא מסומן ברשימה, ואחוז הנוכחות שלו לא נפגע על אימונים שהוא לא היה יכול להגיע אליהם.',
        'No. Change the status to injured or unavailable and he stays on the roster with his full history. He is flagged in the list, and his attendance is not counted against him for practices he could not attend.'
      ),
    },
    {
      category: 'הקבוצה והסגל',
      q: L('אני מאמן שתי קבוצות. אפשר?', 'I coach two teams. Is that possible?'),
      a: L(
        'כן. מוסיפים בפרופיל את כל שכבות הגיל שאתה מאמן, ואז במסך «הקבוצות שלי» עוברים ביניהן. לכל קבוצה סגל, לו״ז ותוכניות משלה.',
        'Yes. Add every age group you coach in your profile, then switch between them on the Teams screen. Each team has its own roster, schedule and plans.'
      ),
    },
    {
      category: 'הקבוצה והסגל',
      q: L('מה קורה לנתונים בסוף העונה?', 'What happens to my data at the end of the season?'),
      a: L(
        'הכול נשאר. הסגל, הנוכחות, הסקירות והתוכניות נשמרים בחשבון שלך ולא נמחקים בסוף עונה. אפשר לעדכן את הסגל לעונה החדשה ולשמור את ההיסטוריה של הקודמת.',
        'Everything stays. Roster, attendance, reviews and plans are kept in your account and are not wiped at season end. You can update the roster for the new season and keep last season\'s history.'
      ),
    },

    {
      category: 'הקבוצה והסגל',
      q: L('איך מוסיפים שחקן? צריך ממנו מייל או אישור?', 'How do I add a player? Do I need their email or approval?'),
      a: L(
        'לא צריך ממנו כלום. ב«הקבוצות שלי» מקלידים שם ומספר חולצה — וזה מספיק כדי להתחיל לסמן נוכחות ולהציב יעדים. עמדה, שנת לידה וטלפון אפשר להוסיף אחר כך בכרטיס השחקן, אם בכלל צריך.' + (PLAYER_SIDE ? ' ואם תרצה שיראה את הדברים בטלפון שלו — שולחים לו את קוד הקבוצה מאותו מסך.' : ''),
        'Nothing from them. On the Teams screen type a name and jersey number — that is enough to start marking attendance and setting goals. Position, birth year and phone can be added later in the player card, if you need them at all.' + (PLAYER_SIDE ? ' And if you want them to see things on their phone — send them the team code from that same screen.' : '')
      ),
    },
    {
      category: 'הקבוצה והסגל',
      q: PLAYER_SIDE
        ? L('גם בלי חשבון לשחקן — מה הטעם ביעדים ובמשוב?', 'Even without a player account — what is the point of goals and notes?')
        : L('אם לשחקן אין חשבון, מה הטעם ביעדים ובמשוב?', 'If the player has no account, what is the point of goals and notes?'),
      a: L(
        'הטעם הוא אתה. הכול מצטבר בכרטיס השחקן לאורך העונה — אחוז נוכחות, ממוצע עומס, היעדים וההערות שכתבת — וכשמגיעה שיחה עם השחקן או עם ההורה יש לך נתונים ולא תחושות.\nאת השיחה עצמה אתה עושה בעל פה. בכרטיס יש דוח אישי להדפסה או לשמירה כ-PDF, אם נוח לך עם דף ביד.',
        'The point is you. It all accumulates in the player card over the season — attendance, average load, goals and your notes — so when you sit down with a player or a parent you have data, not impressions.\nThe conversation itself you have in person. The card has a printable report, or a PDF, if you prefer paper in hand.'
      ),
    },
    {
      category: 'הקבוצה והסגל',
      q: L('מה קורה כשמוחקים שחקן, או כשמורידים שכבת גיל מהפרופיל?', 'What happens if I delete a player, or remove an age group?'),
      a: L(
        'שני דברים שונים לגמרי. מחיקת שחקן מהסגל מוחקת מיד גם את מה שתלוי בו, ואין שחזור — אם אתה רק לא בטוח, שנה לו סטטוס ל«לא פעיל» במקום.\nהורדת שכבת גיל מהפרופיל רק מסתירה את הקבוצה מהמסך. תחזיר את השכבה, והכול חוזר כמו שהיה.',
        'Two very different things. Deleting a player also deletes what hangs off them, with no undo — if you are merely unsure, set them to inactive instead.\nRemoving an age group from your profile only hides the team. Add it back and everything returns.'
      ),
    },
    {
      category: 'הקבוצה והסגל',
      q: L('אפשר להוציא את הסגל לאקסל?', 'Can I export the roster to Excel?'),
      a: L(
        'כן. בראש רשימת הסגל יש כפתור הורדה שמוציא קובץ שנפתח באקסל: שם, מספר, עמדה, שנת לידה, טלפון, סטטוס ואחוז נוכחות.\nהערות חופשיות והערות פציעה לא נכללות, בכוונה. ומרגע ההורדה הקובץ יצא מהאפליקציה — האחריות עליו שלך.',
        'Yes. Above the roster there is a download button that produces a file that opens in Excel: name, number, position, birth year, phone, status and attendance.\nFree-text notes and injury notes are deliberately excluded. And once downloaded the file has left the app — it is your responsibility.'
      ),
    },

    {
      category: 'הקבוצה והסגל',
      q: L('אפשר לחבר את הקבוצה שלי לליגה באיגוד?', 'Can I connect my team to its league at the association?'),
      a: L(
        'כן, ועדיף לעשות את זה כבר בפרופיל: תחת «הקבוצות שאני מאמן» יש «ייבוא קבוצה מהאיגוד». בוחרים שכבת גיל, את הליגה, ואת הקבוצה שלך כמו שהיא רשומה באיגוד — בכל השלושה אפשר להקליד ולחפש.\nהקבוצה נכנסת לקבוצות שלך וגם נשמרת מקושרת, כך שהלו״ז וטבלת הליגה כבר יודעים מי אתה. את המשחקים עצמם מייבאים אחר כך במסך «משחקים וטבלה».',
        'Yes, and it is best done in your profile: under “Teams I coach” there is “Import a team from the association”. Choose an age category, the league, and your team as it is registered — all three are searchable by typing.\nThe team joins your teams and is saved linked, so the schedule and league table already know who you are. The games themselves are imported later on the Games & table screen.'
      ),
    },

    // ---------- אימונים ותרגילים ----------
    {
      category: 'אימונים ותרגילים',
      q: L('איפה רואים תרגילים שמאמנים אחרים שיתפו?', 'Where do I see drills other coaches shared?'),
      a: L(
        'שתי דרכים, ושתיהן במסך «אימונים ותרגילים»:\n· בטאב «מהקהילה» — שם יושב כל מה ששיתפו, עם מתג בין תוכניות לתרגילים.\n· בטאב «בניית תרגיל», בבורר שלמעלה בוחרים «תרגילים מהקהילה».\nאפשר לסנן לפי קטגוריה וגיל, לדרג, ולשמור למועדפים.',
        'Two ways, both on the Practices & drills screen:\n· The "From the community" tab holds everything shared, with a toggle between plans and drills.\n· On the "Build a drill" tab, the selector at the top has "Community drills".\nYou can filter by category and age, rate, and save to favorites.'
      ),
    },
    {
      category: 'אימונים ותרגילים',
      q: L('אפשר לקחת תוכנית אימון של מאמן אחר ולהשתמש בה?', "Can I take another coach's practice plan and use it?"),
      a: L(
        'כן. בטאב «מהקהילה» בוחרים «תוכניות», פותחים תוכנית ורואים את כל החלקים והזמנים. משם אפשר להעתיק אותה אליך ולשנות מה שרוצים — התוכנית המקורית של המאמן האחר לא משתנה.',
        'Yes. In the "From the community" tab choose "Plans", open one and see all its sections and timings. From there you can copy it to yourself and change whatever you like — the original coach\'s plan is untouched.'
      ),
    },
    {
      category: 'אימונים ותרגילים',
      q: L('חייב לשתף את התרגילים שלי?', 'Do I have to share my drills?'),
      a: L(
        'לא. אפשר לעבוד לגמרי פרטי. שיתוף הוא פעולה יזומה שלך, לכל תרגיל או תוכנית בנפרד, ואפשר לבטל אותו בכל רגע.',
        'No. You can work fully privately. Sharing is something you do on purpose, per drill or plan, and you can undo it any time.'
      ),
    },
    {
      category: 'אימונים ותרגילים',
      q: L('מה זה בעצם «תוכנית אימון» כאן?', 'What exactly is a practice plan here?'),
      a: L(
        'דף אחד לאימון: חלקים לפי סדר, כמה דקות לכל חלק, התרגילים שבתוכם, ומקום לשרטט מגרשים בכתב יד. בונים פעם אחת, ומריצים אותה בכל אימון שרוצים.',
        'One page per practice: sections in order, minutes per section, the drills inside them, and room to sketch courts by hand. Build it once, run it as often as you like.'
      ),
    },
    {
      category: 'אימונים ותרגילים',
      q: L('אפשר לשרטט מגרש?', 'Can I draw a court?'),
      a: L(
        'כן, ישר בתוך התוכנית או התרגיל. באייפד עם עט זה עובד הכי טוב — יש מצב שמתעלם ממגע כף היד כדי שלא ישרבט בטעות.',
        'Yes, right inside a plan or drill. It works best on iPad with a pencil — there is a mode that ignores palm touches so you do not scribble by accident.'
      ),
    },

    {
      category: 'אימונים ותרגילים',
      q: L('יצאתי מהמחברת וכל מה שכתבתי נעלם', 'I left the notebook and everything I wrote disappeared'),
      a: L(
        'המחברת לא שומרת לבד — צריך «שמירה» או «שמירה כטיוטה». אם תנסה לצאת עם עבודה פתוחה תקפוץ שאלה שמזהירה אותך; אבל אם אישרת יציאה, מה שנכתב מאז השמירה האחרונה לא נשמר.',
        'The notebook does not autosave — you need Save or Save as draft. If you try to leave with open work a warning asks first; but if you confirm, anything since the last save is gone.'
      ),
    },
    {
      category: 'אימונים ותרגילים',
      q: L('תרגיל שאני כותב — כל הקהילה רואה אותו?', 'A drill I write — does the whole community see it?'),
      a: L(
        'רק אם תבחר בזה. בעורך התרגיל יש שתי אפשרויות — «שיתוף לקהילה» ו«פרטי (רק אני)» — ואפשר לעבור לפרטי בכל שלב.\nתוכנית אימון מתפרסמת רק אם לחצת «שתף לקהילה». היא לא נחשפת מעצמה.',
        'Only if you choose it. The drill editor offers Share with the community or Private (only me), and you can switch to private at any time.\nA practice plan is published only if you press Share. It never exposes itself.'
      ),
    },

    // ---------- לו״ז וסקירה ----------
    {
      category: 'לו״ז וסקירה',
      q: L('צריך להוסיף כל אימון ידנית?', 'Do I have to add every practice by hand?'),
      a: L(
        'לא. קובעים פעם אחת ימי אימון קבועים לקבוצה, והם נכנסים ללו״ז לבד שבוע אחרי שבוע. ידנית מוסיפים רק חריגים: אימון חד-פעמי, משחק, או אימון אישי שרק אתה רואה.',
        'No. Set fixed practice days once per team and they enter the schedule on their own, week after week. You only add exceptions by hand: a one-off practice, a game, or a personal session only you see.'
      ),
    },
    {
      category: 'לו״ז וסקירה',
      q: L('איך מסמנים נוכחות?', 'How do I mark attendance?'),
      a: L(
        'לוחצים על האימון בלו״ז ואז על «נוכחות ומשוב לאימון». נפתח כל הסגל, ולכל שחקן שלושה כפתורים: נוכח · איחר · נעדר. יש גם «כולם נוכחים» שמסמן את כולם בלחיצה אחת ואז מתקנים חריגים.',
        'Tap the practice in the schedule, then "Attendance & notes". The whole roster opens with three buttons per player: present · late · absent. There is also "all present" that marks everyone in one tap so you only fix the exceptions.'
      ),
    },
    {
      category: 'לו״ז וסקירה',
      q: L('מה זה «עומס» ולמה זה 1 עד 10?', 'What is "load" and why 1 to 10?'),
      a: L(
        'זו מדידה פשוטה של כמה האימון היה קשה לשחקן. שואלים אותו בסוף האימון «כמה קשה היה, 1 עד 10?» ורושמים. אחרי כמה אימונים רואים ממוצע קבוצתי ואפשר לזהות מי נשחק ומי לא עובד מספיק.' + (PLAYER_SIDE ? ' שחקן מחובר יכול גם לדרג בעצמו מהטלפון אחרי האימון — והמספר שלו מופיע בסקירת האימון.' : ''),
        'A simple measure of how hard the practice was for a player. At the end you ask "how hard was it, 1 to 10?" and log it. After a few practices you get a team average and can spot who is being overworked and who is coasting.' + (PLAYER_SIDE ? ' A connected player can also rate it themselves from their phone after practice — their number shows up in the practice review.' : '')
      ),
    },
    {
      category: 'לו״ז וסקירה',
      q: L('מה נשמר בסקירה של האימון?', 'What is saved in a practice review?'),
      a: L(
        'הנוכחות, ציוני העומס, אילו יעדים סומנו כמושגים, וההערות שכתבת לעצמך. הכול נשמר לתאריך הזה ונשאר שם — בסוף העונה יש לך תיעוד של כל אימון.',
        'Attendance, load scores, which goals were met, and the notes you wrote for yourself. It is all saved to that date and stays there — by season end you have a record of every practice.'
      ),
    },

    // ---------- קהילה ----------
    {
      category: 'קהילה',
      q: L('מה יש בקהילה?', 'What is in the community?'),
      a: L(
        'פיד של מאמנים אחרים: שאלות, טיפים, תרגילים ורעיונות. אפשר רק לקרוא בשקט, ואפשר לפרסם. אף אחד לא רואה את הסגל שלך או את מה שכתבת עליו — רק מה שבחרת לפרסם.',
        'A feed of other coaches: questions, tips, drills and ideas. You can read quietly or post. Nobody sees your roster or what you wrote about it — only what you chose to publish.'
      ),
    },
    {
      category: 'קהילה',
      q: L('איך מוצאים מאמן אחר, ואיך שולחים לו הודעה?', 'How do I find another coach and message them?'),
      a: L(
        'במסך «חיפוש מאמנים» מסננים לפי מועדון ושכבת גיל. מהפרופיל של המאמן אפשר לפתוח שיחה, והיא מופיעה אצל שניכם במסך «הודעות».',
        'On the "Coach finder" screen, filter by club and age group. From a coach\'s profile you can start a conversation, and it shows up for both of you under "Messages".'
      ),
    },
    {
      category: 'קהילה',
      q: L('אני מחפש יריבה למשחק אימון. יש לזה מקום?', 'I am looking for a scrimmage opponent. Is there a place for that?'),
      a: L(
        'כן — לוח משחקי האימון, במסך «חיפוש מאמנים». מפרסמים שם שהקבוצה שלך מחפשת משחק, ומאמנים אחרים מסננים לפי אזור וגיל ושולחים הודעה.',
        'Yes — the scrimmage board on the "Coach finder" screen. Post that your team is looking for a game, and other coaches filter by region and age and message you.'
      ),
    },

    {
      category: 'קהילה',
      q: L('מה מאמן אחר רואה עליי?', 'What does another coach see about me?'),
      a: L(
        'את השם, המועדון, הקבוצות שאתה מאמן, ואת התרגילים והתוכניות ששיתפת. הטלפון מוצג רק אם הדלקת את המתג בפרופיל, וכתובת המייל לא מוצגת לאף אחד אף פעם.\nבפרופיל יש לשונית «כך רואים אותך» שמראה לך בדיוק את זה.',
        'Your name, club, the teams you coach, and whatever drills and plans you shared. Your phone shows only if you switched it on in your profile, and your email is never shown to anyone.\nYour profile has a How others see you tab that shows exactly this.'
      ),
    },

    // ---------- פרטיות וחשבון ----------
    {
      category: 'פרטיות וחשבון',
      q: L('איפה נשמרים הנתונים, ומי יכול לראות אותם?', 'Where is my data stored, and who can see it?'),
      a: L(
        'בחשבון האישי שלך בענן, וזמין לך מכל מכשיר. מאמן אחר לא רואה את הסגל שלך, את הנוכחות או את ההערות. גלוי לאחרים רק מה שבחרת לשתף: תרגילים, תוכניות ופוסטים בקהילה, והפרופיל הציבורי שלך.',
        'In your personal cloud account, available to you from any device. Other coaches do not see your roster, attendance or notes. Only what you chose to share is visible: drills, plans, community posts, and your public profile.'
      ),
    },
    {
      category: 'פרטיות וחשבון',
      q: L('אני מזין פרטים של קטינים. מה זה אומר מבחינתי?', 'I am entering minors\' details. What does that mean for me?'),
      a: L(
        'שאתה האחראי עליהם. אתה מחליט מה להזין ומה לא, ו-CourtSide מעבדת את זה עבורך ושומרת. מומלץ להזין רק את מה שבאמת צריך לעבודה שלך, ולא פרטים אישיים שאין להם שימוש באימון.\nהפירוט המלא נמצא במדיניות הפרטיות, בקישור שבתחתית המסך הזה.',
        'That you are responsible for them. You decide what to enter, and CourtSide processes and stores it for you. Enter only what you actually need for coaching, not personal details with no use on the court.\nThe full details are in the privacy policy, linked at the bottom of this screen.'
      ),
    },
    {
      category: 'פרטיות וחשבון',
      q: L('אני מקבל התראות למייל או לטלפון?', 'Do I get email or phone notifications?'),
      a: L(
        'לא. הכול נשאר בתוך האפליקציה — הפעמון שלמעלה מרכז הודעות, תגובות וזימונים. אין התראות דחיפה לטלפון ואין מיילים.',
        'No. Everything stays inside the app — the bell at the top collects messages, replies and invites. There are no phone push notifications and no emails.'
      ),
    },
    {
      category: 'פרטיות וחשבון',
      q: L('איך מוחקים חשבון או מקבלים עותק של הנתונים?', 'How do I delete my account or get a copy of my data?'),
      a: L(
        `שולחים מייל ל-${CONTACT_EMAIL} ומבקשים. אנחנו מטפלים ועונים תוך 30 יום. אין כרגע כפתור מחיקה בתוך האפליקציה — זה מכוון, כדי שלא יימחק חשבון בטעות.`,
        `Email ${CONTACT_EMAIL} and ask. We handle it and reply within 30 days. There is no delete button inside the app right now — that is deliberate, so nothing gets erased by accident.`
      ),
    },

    {
      category: 'פרטיות וחשבון',
      q: L('אפשר לשנות סיסמה או כתובת מייל?', 'Can I change my password or email?'),
      a: L(
        'סיסמה — כן. בפרופיל, תחת «הגדרות», יש «שינוי סיסמה» (לפחות 8 תווים, עם אות גדולה באנגלית, אות קטנה וספרה).\nכתובת מייל אי אפשר לשנות מתוך האפליקציה — לזה כותבים לנו מהכפתור שבתחתית המסך הזה.',
        'Password — yes. Under Settings in your profile there is Change password (at least 8 characters, with an uppercase letter, a lowercase letter and a digit).\nEmail cannot be changed from inside the app — write to us using the button at the bottom of this screen.'
      ),
    },

    // ---------- תקלות ----------
    {
      category: 'תקלות',
      q: L('רשמתי משהו והוא לא נשמר. מה קרה?', 'I wrote something and it was not saved. What happened?'),
      a: L(
        'כמעט תמיד זה חיבור אינטרנט. אם אין רשת, מופיע פס אדום למעלה שאומר את זה — מה שנכתב באותו רגע לא נשמר. באולמות הקליטה חלשה, אז שווה לבדוק את הפס לפני שמקלידים סקירה ארוכה.',
        'It is almost always the connection. When you are offline a red bar appears at the top saying so — anything typed then is not saved. Gyms have weak reception, so check that bar before typing a long review.'
      ),
    },
    {
      category: 'תקלות',
      q: L('מסך נראה ריק או תקוע. מה עושים?', 'A screen looks empty or stuck. What do I do?'),
      a: L(
        'קודם מרעננים את הדף. אם זה נמשך, יוצאים ונכנסים שוב לחשבון. ואם גם זה לא עזר — תשלח לנו מייל מהכפתור שבתחתית המסך הזה, ותכתוב באיזה מסך זה קרה ומה ניסית לעשות.',
        'First refresh the page. If it persists, sign out and back in. And if that does not help — email us from the button at the bottom of this screen and say which screen it happened on and what you were trying to do.'
      ),
    },
    {
      category: 'תקלות',
      q: L('משהו נראה שבור באייפד דווקא', 'Something looks broken specifically on iPad'),
      a: L(
        'כדאי לנסות גם לרוחב וגם לאורך, ולוודא שהדפדפן מעודכן. אם משהו נחתך או לא נלחץ — תשלח לנו צילום מסך במייל, זה הכי מהיר לתקן.',
        'Try both landscape and portrait, and make sure the browser is up to date. If something is cut off or unclickable, email us a screenshot — that is the fastest way to get it fixed.'
      ),
    },
  ]
}
