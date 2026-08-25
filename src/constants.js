// ערכים קבועים שחוזרים בכל המערכת — מוגדרים פעם אחת כאן.

// כתובת האתר הקנונית — הבסיס לכל לינק שנשלח החוצה (שיתוף, הזמנה, QR,
// קישור איפוס סיסמה). אסור להשתמש כאן ב-window.location.origin: בתוך
// WebView נייטיב (Capacitor) ה-origin הוא capacitor://localhost (iOS) או
// https://localhost (אנדרואיד), וכל לינק שנבנה ממנו מגיע מת אצל הנמען.
// ניתן לעקוף בסביבה עם VITE_SITE_URL (למשל תצוגה מקדימה בוורסל).
export const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://courtsideil.vercel.app'

// כתובת יצירת הקשר הרשמית — פרטיות, נגישות, בקשות מחיקה ופניות הורים.
// נקודת אמת אחת: שלושת המסמכים הציבוריים (privacy/terms/accessibility),
// ווידג'ט הנגישות ומסך מחיקת החשבון חייבים להצביע לכאן. עד הגל הזה היו
// שתי כתובות שונות במקביל, וזה בלבל הורים ופנייה רגולטורית.
export const CONTACT_EMAIL = 'coachadiriagam@gmail.com'

// גרסת המסמכים המשפטיים שנרשמת יחד עם ההסכמה בהרשמה.
// חייבת להיות זהה למזהה הגרסה בראש privacy.html / terms.html /
// accessibility.html — אחרת אי אפשר לקשור רשומת הסכמה לנוסח שאושר.
// 24.8.2026 — v2: המסמכים נכתבו מחדש לצד המאמן בלבד (בלי חשבונות שחקן
// ובלי משטר הסכמת הורים), ונוסף סעיף שמסביר שהמאמן הוא בעל השליטה
// בפרטי השחקנים שהוא מזין.
export const TERMS_VERSION = 'v2 · 24.8.2026'

// ===== כללי הסיסמה — מקור אמת אחד =====
//
// ⚠️ זה UX בלבד, לא אכיפה. הבדיקה כאן רצה בדפדפן, וכל מי ששולח POST ישירות
// ל-auth/v1/signup (או ל-auth/v1/user בעדכון סיסמה) עוקף אותה לגמרי ומקבל
// בדיוק את מה שמוגדר בפרויקט Supabase. האפליקציה אינה אוכפת שום כלל סיסמה
// ואינה יכולה לאכוף — הקוד רק מסביר למשתמש מה מצופה ממנו.
//
// האכיפה האמיתית היחידה היא בדשבורד של Supabase, ואי אפשר להגדיר אותה מהקוד:
//   Supabase → Authentication → Sign In / Providers → Password
//     • Minimum password length = 8
//     • Password Requirements = "Lowercase, uppercase letters and digits"
//       (האפשרות הזמינה הקרובה ביותר שמחייבת אות גדולה)
//     • Leaked password protection (HaveIBeenPwned) = Enabled
// כל עוד ההגדרות האלה כבויות, ברירת המחדל של Supabase היא 6 תווים בלי מורכבות
// ובלי בדיקת סיסמאות שדלפו — באפליקציה שמחזיקה חשבונות של קטינים זו דלת פתוחה.
//
// החלטת הבעלים (4.8.2026): לפחות 8 תווים וגם אות גדולה אחת לפחות.
export const PASSWORD_MIN_LENGTH = 8

// הכללים עצמם — סדר התצוגה ברשימת הדרישות הוא הסדר כאן.
// he/en ולא L(): i18n.js מייבא את הקובץ הזה, וייבוא הפוך היה יוצר מעגל.
export const PASSWORD_RULES = [
  {
    id: 'length',
    test: (pw) => pw.length >= PASSWORD_MIN_LENGTH,
    he: `לפחות ${PASSWORD_MIN_LENGTH} תווים`,
    en: `At least ${PASSWORD_MIN_LENGTH} characters`,
    // ההודעה שמוצגת כשהכלל הזה נכשל — מנוסחת כמשפט שלם, כדי שמי שנכשל
    // יידע איזה כלל בדיוק נשבר במקום «הסיסמה אינה תקינה».
    errHe: `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים.`,
    errEn: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  },
  {
    id: 'upper',
    // רק A-Z: בעברית אין אותיות גדולות, ולכן הכלל מתייחס לאנגלית בלבד —
    // וזה מה שהטקסט אומר, כדי שנער שמקליד בעברית לא ייתקע בלי להבין למה.
    test: (pw) => /[A-Z]/.test(pw),
    he: 'אות גדולה באנגלית (A-Z)',
    en: 'One uppercase English letter (A-Z)',
    errHe: 'הסיסמה חייבת להכיל אות גדולה באנגלית אחת לפחות (A-Z).',
    errEn: 'Password must contain at least one uppercase English letter (A-Z).',
  },
  // שני הכללים הבאים אינם גחמה — הם מיישרים את הבדיקה בצד הלקוח להגדרה
  // שנבחרה בסופאבייס (Password requirements = "Lowercase, uppercase letters
  // and digits", 4.8.2026). בלעדיהם המסך היה מאשר סיסמה כמו "PASSWORD"
  // והשרת היה דוחה אותה בהודעה באנגלית בלי לומר איזה כלל נשבר.
  // ⚠ אם ההגדרה בלוח הבקרה משתנה — יש לעדכן כאן, אחרת חוזרת אותה אי-התאמה.
  {
    id: 'lower',
    test: (pw) => /[a-z]/.test(pw),
    he: 'אות קטנה באנגלית (a-z)',
    en: 'One lowercase English letter (a-z)',
    errHe: 'הסיסמה חייבת להכיל אות קטנה באנגלית אחת לפחות (a-z).',
    errEn: 'Password must contain at least one lowercase English letter (a-z).',
  },
  {
    id: 'digit',
    test: (pw) => /[0-9]/.test(pw),
    he: 'ספרה אחת לפחות (0-9)',
    en: 'At least one digit (0-9)',
    errHe: 'הסיסמה חייבת להכיל ספרה אחת לפחות (0-9).',
    errEn: 'Password must contain at least one digit (0-9).',
  },
]

// הבודק המשותף. מחזיר מבנה אחד שכל שלושת המסכים (הרשמה, איפוס, שינוי) צורכים:
//   valid   — האם כל הכללים עברו
//   rules   — כל כלל עם met:true/false, לרשימת הדרישות החיה בזמן ההקלדה
//   failed  — מזהי הכללים שנכשלו
//   errorHe/errorEn — הודעה על הכלל הראשון שנכשל (null כשהכול תקין)
export function checkPassword(pw) {
  const v = String(pw || '')
  const rules = PASSWORD_RULES.map((r) => ({
    id: r.id,
    he: r.he,
    en: r.en,
    met: r.test(v),
  }))
  const failed = PASSWORD_RULES.filter((r) => !r.test(v))
  return {
    valid: failed.length === 0,
    rules,
    failed: failed.map((r) => r.id),
    errorHe: failed.length ? failed[0].errHe : null,
    errorEn: failed.length ? failed[0].errEn : null,
  }
}

// תרגום שגיאות הסיסמה שמגיעות מהשרת של Supabase לעברית שאומרת מה בדיוק נדחה.
// השגיאות האלה מופיעות רק כשההגדרות בדשבורד מופעלות — כלומר זו האכיפה
// האמיתית, וכשהיא תופסת, המשתמש חייב לקבל הסבר ולא טקסט אנגלי גולמי.
// מחזיר {he,en} או null אם אין התאמה (ואז הקורא נופל להודעה הכללית שלו).
export function passwordServerError(msg) {
  const m = String(msg || '')
  if (/Password should be at least/i.test(m)) {
    return {
      he: `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים.`,
      en: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    }
  }
  if (/Password should contain|characters? of each/i.test(m)) {
    return {
      he: 'הסיסמה חייבת להכיל אות גדולה באנגלית, אות קטנה וספרה.',
      en: 'Password must contain an uppercase letter, a lowercase letter and a digit.',
    }
  }
  if (/known to be weak|easy to guess|pwned/i.test(m)) {
    return {
      he: 'הסיסמה הזו הופיעה בדליפות מוכרות ואינה בטוחה. בחר סיסמה אחרת.',
      en: 'This password appeared in known breaches and is not safe. Choose a different one.',
    }
  }
  if (/should be different from the old|same.*old password/i.test(m)) {
    return {
      he: 'הסיסמה החדשה זהה לישנה. בחר סיסמה אחרת.',
      en: 'The new password is the same as the old one. Choose a different one.',
    }
  }
  return null
}

// שכבות הגיל, בסדר המדויק (מהצעיר למבוגר).
export const AGE_GROUPS = [
  'בית ספר לכדורסל',
  'קטסל ב׳',
  'קטסל א׳',
  'ילדים ב׳',
  'ילדים א׳',
  'נערים ב׳',
  'נערים א׳',
  'נוער',
  'בוגרים',
]

// מגדר הקבוצה — להבחנה בין קבוצת בנים לקבוצת בנות.
export const GENDERS = ['בנים', 'בנות']

// פירוק/הרכבה של בחירת קבוצה מקודדת "<שכבה> <מגדר>" (נשמר ב-age_groups).
export const teamLabel = (age, gender) => `${age} ${gender}`
export const genderOf = (entry) =>
  GENDERS.find((g) => entry.endsWith(' ' + g)) || null
export const ageOf = (entry) => {
  const g = genderOf(entry)
  return g ? entry.slice(0, entry.length - g.length - 1) : entry
}

// רשימת מועדוני כדורסל בישראל — נאספה ממחקר מקורות איגוד הכדורסל והליגות.
// המאמן בוחר מתוכה, ואם המועדון שלו לא קיים אפשר להקליד ידנית.
export const ISRAELI_CLUBS = [
  'א.ס. עירוני אשקלון', 'א.ס. רמת השרון', 'אליצור אלקנה', 'אליצור אשקלון',
  'אליצור בית אל', 'אליצור גבעת שמואל', 'אליצור גוש עציון אפרת', 'אליצור חולון',
  'אליצור טירת הכרמל', 'אליצור יבנה', 'אליצור כוכב יאיר צור יגאל', 'אליצור נתניה',
  'אליצור עירוני נתניה', 'אליצור קריית אתא', 'אליצור ראשון לציון', 'אליצור רמלה',
  'אליצור שומרון', 'אליצור תל אביב', 'אנ"ד רמת השרון', 'אס"א טכניון חיפה',
  'אס"א ירושלים', 'בית"ר אשדוד', 'בית"ר ירושלים', 'בית"ר כפר יונה',
  'בית"ר תל אביב', 'בני הרצליה', 'בני יהודה תל אביב', 'בנות הרצליה',
  'הפועל אום אל פחם', 'הפועל אילת', 'הפועל אעבלין', 'הפועל אשדוד',
  'הפועל באר טוביה', 'הפועל באר יעקב', 'הפועל באר שבע', 'הפועל באר שבע דימונה',
  'הפועל בארי', 'הפועל בני כפר סבא', 'הפועל בני כפר קאסם', 'הפועל ברנר',
  'הפועל גבעתיים', 'הפועל גזר', 'הפועל גלבוע גליל', 'הפועל גלבוע מעיינות',
  'הפועל גליל עליון', 'הפועל הוד השרון', 'הפועל העמק', 'הפועל חבל אילות',
  'הפועל חבל מודיעין', 'הפועל חולון', 'הפועל חיפה', 'הפועל יגור',
  'הפועל יפו', 'הפועל ירושלים', 'הפועל כאוכב מנדא', 'הפועל כפר כנא',
  'הפועל כפר סבא', 'הפועל כפר קמא', 'הפועל לב חוף השרון', 'הפועל לב ירושלים',
  'הפועל לוד', "הפועל מג'דל כרום", 'הפועל מגדל גזר', 'הפועל מגדל העמק יזרעאל',
  'הפועל מגידו', 'הפועל מטה יהודה', 'הפועל מעגן מיכאל', 'הפועל מעלות תרשיחא',
  'הפועל מרנין קריית טבעון', 'הפועל נוף הגליל', 'הפועל ניר נהריה', 'הפועל נצר סרני',
  'הפועל נשר', 'הפועל סכנין', 'הפועל עכו', 'הפועל עמק הירדן',
  'הפועל עמק חפר', 'הפועל עמק יזרעאל', 'הפועל עפולה', 'הפועל פתח תקווה',
  'הפועל ראשון לציון', 'הפועל רמת גן גבעתיים', 'הפועל תל אביב', 'מ.כ. עוטף דרום',
  'מ.כ. עלייה תל אביב', 'מ.כ. קריית מלאכי', 'מ.ס. דבוריה', 'מ.ס. צפת',
  'מועדון כדורסל גני תקווה', 'מכבי אהרון רמת גן', 'מכבי אעבלין שפרעם', 'מכבי אשדוד',
  'מכבי באר יעקב', 'מכבי בת ים', 'מכבי גבעת שמואל', 'מכבי גדרה',
  "מכבי ג'ת", 'מכבי דימונה', 'מכבי הבילויים גדרה', 'מכבי הוד השרון',
  'מכבי חדרה', 'מכבי חולון', 'מכבי חיפה', 'מכבי חריש',
  'מכבי ימק"א נצרת', 'מכבי ירושלים', 'מכבי כרמיאל', 'מכבי כרמיאל בית הכרם',
  'מכבי מודיעין רעות', 'מכבי מעלה אדומים', 'מכבי מתן', 'מכבי סייע',
  'מכבי עומר', 'מכבי עין מאהל', 'מכבי עירוני כרמיאל', 'מכבי עירוני רמת גן',
  'מכבי עירוני רעננה', 'מכבי עמיחי חדרה', 'מכבי פתח תקווה', 'מכבי קיסריה',
  'מכבי קריית ביאליק', 'מכבי קריית גת', 'מכבי קריית ים', 'מכבי קריית מוצקין',
  'מכבי ראשון לציון', 'מכבי רחובות', 'מכבי רמת גן', 'מכבי רעננה',
  'מכבי שדרות', 'מכבי שוהם', 'מכבי שלומי', 'מכבי תל אביב',
  'נירוסופט כרמיאל', 'ע.ל.ה. אור יהודה', 'ע.ל.ה. יהוד', 'עוצמה מודיעין',
  'עירוני אילת', 'עירוני אעבלין', 'עירוני אשקלון', 'עירוני נהריה',
  'עירוני נס ציונה', 'עירוני קריית אונו', 'עירוני קריית אתא', 'שועלי באר שבע',
]

// קטגוריות תרגילים — לשימוש בשלבים הבאים (עדיין לא בשימוש).
export const DRILL_CATEGORIES = [
  'יסודות',
  'הגנה',
  'התקפה',
  'ניהול אימון',
  'ניהול משחק',
  'פיתוח שחקן',
]

// רמות קושי לתרגיל (לשימוש בספריית התרגילים).
export const DIFFICULTY_LEVELS = ['קל', 'בינוני', 'מתקדם']

// ציטוטים למאמנים — מתחלפים בדף הכניסה, בפס העליון ובבית.
//
// **רק ציטוטים שאדם אמיתי באמת אמר** (הנחיית הבעלים, 29.7.2026). הרשימה
// הקודמת נבדקה ציטוט-ציטוט מול מקורות, ו-13 מתוך 22 נפסלו: חלקם היו
// פתגמים בלי דובר («הגנה מנצחת אליפויות»), חלקם יוחסו לאדם הלא נכון
// («אל תספור את הימים» הוא של המאמן קלייד סמית מ-1950, לא של מוחמד עלי;
// «תרגול נכון הופך מושלם» מיוחס בדרך כלל ללומברדי ואף לו רק דרך אתרי
// אוסף), והשאר לא נמצאו בשום מקור ראשוני — רק ב-BrainyQuote ודומיו.
//
// **הכלל להוספה:** לכל ציטוט חייב להיות `source` — ספר, ראיון, תמליל
// נאום, אתר רשמי או עיתונות. אתר אוסף-ציטוטים לבדו אינו מקור.
// ציטוטים שנאמרו במקור בעברית שמורים בעברית, וה-text_en הוא תרגום.
export const COACHING_QUOTES = [
  // ---- מאמנים ----
  { text: 'הצלחה היא שלוות נפש שבאה מהידיעה שעשית כל מאמץ להיות הטוב שאתה מסוגל להיות.', author: 'ג׳ון ווּדן',
    text_en: 'Success is peace of mind which is a direct result of self-satisfaction in knowing you made the effort to become the best you are capable of becoming.', author_en: 'John Wooden',
    source: 'https://coachwooden.com/pyramid-of-success' },
  { text: 'הפרטים הקטנים הם שקובעים. דברים קטנים יוצרים דברים גדולים.', author: 'ג׳ון ווּדן',
    text_en: "It's the little details that are vital. Little things make big things happen.", author_en: 'John Wooden',
    source: 'https://newsroom.ucla.edu/magazine/john-wooden-tie-shoes-teaching-basketball' },
  { text: 'צעירים צריכים דוגמה אישית, לא ביקורת.', author: 'ג׳ון ווּדן',
    text_en: 'Young people need models, not critics.', author_en: 'John Wooden',
    source: 'https://en.wikiquote.org/wiki/John_Wooden' },
  { text: 'מאמן טוב גורם לשחקנים לראות מה הם יכולים להיות, ולא רק מה שהם.', author: 'ארה פרסיאן',
    text_en: 'A good coach will make players see what they can be rather than what they are.', author_en: 'Ara Parseghian',
    source: 'https://www.nd.edu/stories/ara-parseghian' },
  { text: 'שניים טובים מאחד — אם השניים פועלים כאחד.', author: 'מייק שישפסקי',
    text_en: 'Two are better than one if two act as one.', author_en: 'Mike Krzyzewski',
    source: 'https://coachk.com/quotes/' },
  { text: 'עבודת צוות אמיתית מתחילה ונגמרת בתקשורת.', author: 'מייק שישפסקי',
    text_en: 'Effective teamwork begins and ends with communication.', author_en: 'Mike Krzyzewski',
    source: 'https://coachk.com/quotes/' },
  { text: 'כולם רוצים לחיות בפסגת ההר — אבל כל האושר והצמיחה קורים בזמן הטיפוס.', author: 'פט סאמיט',
    text_en: "Everyone wants to live on top of the mountain, but all the happiness and growth occurs while you're climbing it.", author_en: 'Pat Summitt',
    source: 'https://www.espn.com/espnw/culture/story/_/id/26172217/book-excerpt-quotes-summitt-pat-summitt' },
  { text: 'תתרגל לעשות את זה נכון — עד שזה הופך לטבע שני.', author: 'פט סאמיט',
    text_en: "You have to discipline yourself to do something the right way until it's second nature.", author_en: 'Pat Summitt',
    source: 'https://www.espn.com/espnw/culture/story/_/id/26172217/book-excerpt-quotes-summitt-pat-summitt' },
  { text: 'תראה איך הם מתאמנים ואיך הם מתייחסים לחברים לקבוצה — זה אומר לך מי הם.', author: 'גרג פופוביץ׳',
    text_en: 'Watch how they practice. Watch how they react to their teammates. That tells you who they are.', author_en: 'Gregg Popovich',
    source: 'https://www.cbssports.com/nba/news/hall-of-fame-inductee-gregg-popovich-longest-tenured-active-coach-in-american-pro-sports-shares-his-wisdom/' },
  { text: 'המשמעת היא הגשר בין יעדים להישגים.', author: 'ג׳ים רוהן',
    text_en: 'Discipline is the bridge between goals and accomplishment.', author_en: 'Jim Rohn',
    source: 'https://en.wikiquote.org/wiki/Jim_Rohn' },

  // ---- שחקנים ----
  { text: 'פספסתי יותר מ-9,000 זריקות. הפסדתי כמעט 300 משחקים. נכשלתי שוב ושוב — ובגלל זה אני מצליח.', author: 'מייקל ג׳ורדן',
    text_en: "I've missed more than 9,000 shots in my career. I've lost almost 300 games. I've failed over and over and over again in my life. And that is why I succeed.", author_en: 'Michael Jordan',
    source: 'https://www.encyclopedia.com/books/politics-and-business-magazines/nike-inc' },
  { text: 'אני יכול לקבל כישלון — אבל אני לא יכול לקבל לא לנסות.', author: 'מייקל ג׳ורדן',
    text_en: "I can accept failure, but I can't accept not trying.", author_en: 'Michael Jordan',
    source: 'https://www.nba.com/news/michael-jordan-quotes' },
  { text: 'הכישרון מנצח משחקים, אבל עבודת צוות ושכל מנצחים אליפויות.', author: 'מייקל ג׳ורדן',
    text_en: 'Talent wins games, but teamwork and intelligence win championships.', author_en: 'Michael Jordan',
    source: 'https://www.nba.com/news/michael-jordan-quotes' },
  { text: 'מנטליות המאמבה היא חיפוש מתמיד להיות היום טוב יותר משהיית אתמול.', author: 'קובי בראיינט',
    text_en: "The Mamba Mentality is a constant quest to be better today than you were yesterday.", author_en: 'Kobe Bryant',
    source: 'https://www.si.com/nba/2017/12/19/kobe-bryant-los-angeles-lakers-jersey-retirement-staples-center' },
  { text: 'לא הגענו לכאן בזכות כישרון — הגענו לכאן בזכות ארבע לפנות בוקר.', author: 'קובי בראיינט',
    text_en: "We're not on this stage just because of talent. We're up here because of 4 a.m.", author_en: 'Kobe Bryant',
    source: 'https://speakola.com/sports/kobe-bryant-hall-of-fame-2021' },
  { text: 'כל אחד ואחד היה חשוב בדרך הזאת.', author: 'סטיבן קרי',
    text_en: 'Everybody mattered in that process.', author_en: 'Stephen Curry',
    source: 'https://asaptext.com/orgs/nbafinals/browse_file.php?browse_file_name=transcripts/121800.html' },
  { text: 'אם אתם רוצים להיות אלופים — זה לא אמור להיות קל.', author: 'דיאנה טאורסי',
    text_en: "If you want to be champions, it's not supposed to be easy.", author_en: 'Diana Taurasi',
    source: 'http://www.asapsports.com/show_interview.php?id=45483' },

  // ---- ישראל ----
  { text: 'אנחנו על המפה — ואנחנו נשארים על המפה. לא רק בספורט, בכל דבר.', author: 'טל ברודי',
    text_en: 'We are on the map, and we are going to stay on the map — not just in sports, but in everything.', author_en: 'Tal Brody',
    source: 'https://www.timesofisrael.com/film-on-israeli-basketballs-miracle-on-hardwood-set-to-screen-in-the-us/' },
  { text: 'אנחנו מאמנים את הילדים לנצח, במקום להשקיע באיך להפוך אותם לשחקנים טובים יותר.', author: 'עודד קטש',
    text_en: "We coach kids to win, instead of investing in how to make them better players.", author_en: 'Oded Katash',
    source: 'https://www.calcalist.co.il/conferences/article/bjqt8beq2' },
  { text: 'אצלנו אף אחד לא צריך לשכנע לשחק חזק — את זה אי אפשר ללמד.', author: 'דני אבדיה',
    text_en: "We don't need to convince guys to play hard. That's something you can't teach.", author_en: 'Deni Avdija',
    source: 'https://sports.yahoo.com/articles/deni-avdija-explains-mindset-behind-205900083.html' },
  { text: 'זו לא חובה — זו זכות.', author: 'עמרי כספי',
    text_en: "It's not a duty, it's a privilege.", author_en: 'Omri Casspi',
    source: 'https://www.timesofisrael.com/as-only-israeli-in-nba-omri-casspi-tries-to-be-best-ambassador-he-can/' },
  { text: 'המשכתי להוריד את הראש ולהתאמן — והכול היה בשביל הרגע הזה.', author: 'תום רעובני',
    text_en: "I put my head down and kept training — and it's all for this moment.", author_en: 'Tom Reuveny',
    source: 'https://www.timesofisrael.com/liveblog_entry/noting-gaza-war-israels-tom-reuveny-says-winning-gold-medal-much-bigger-than-me/' },
]

// ===== פודקסטים של כדורסל (קישור ישיר ל-show בספוטיפיי) =====
export const PODCASTS = [
  // עברית
  { title: "ספיק נ' רול", lang: 'עברית', desc: 'פודקאסט הכדורסל הישראלי המוביל — ליגת העל והנבחרת', url: 'https://open.spotify.com/show/5J3Ic6mTZicm3yDBaXJLPi' },
  { title: 'ONE — מכבי ת"א כדורסל', lang: 'עברית', desc: 'הפודקאסט על מכבי תל אביב', url: 'https://open.spotify.com/show/5MMgXF76yRGd00Y3BHqcgC' },
  { title: 'ה-NBA של ערוץ הספורט', lang: 'עברית', desc: 'כל מה שקורה ב-NBA, בעברית', url: 'https://open.spotify.com/show/28iAcpkVlSuxhnVVE654qL' },
  // English
  { title: 'The Lowe Post', lang: 'English', desc: "ESPN's Zach Lowe on the NBA", url: 'https://open.spotify.com/show/2mZHt3zBxyIuc0PYLdDDkr' },
  { title: 'The Old Man and the Three', lang: 'English', desc: 'NBA stars & deep conversations', url: 'https://open.spotify.com/show/5vMLIaAcXeWUpXRpUt5qXY' },
  { title: 'Thinking Basketball', lang: 'English', desc: 'Film, analytics & coaching breakdowns', url: 'https://open.spotify.com/show/12kpkAvUj6LGxzViDIH0qH' },
  { title: 'The Hoop Collective', lang: 'English', desc: 'ESPN NBA insiders — Brian Windhorst', url: 'https://open.spotify.com/show/4mOLvZqMud0JromeBgLpIh' },
]

// קטגוריות לסרטוני וידאו (יוטיוב) — לסינון.
// הקטגוריות המורחבות של מסמך ההשקה (1.11). חמש האחרונות הן קטגוריות
// ישנות שנשארות כדי שסרטונים קיימים ימשיכו להסתנן.
export const VIDEO_CATEGORIES = [
  'הגנה אישית',
  'הגנת אזור',
  'פרס',
  'התקפה מסודרת',
  'מעברים',
  'קליעה',
  'כדרור',
  'מסירות',
  'סיומות',
  'ריבאונד',
  'תנועה בלי כדור',
  'מסכים ופיק אנד רול',
  'אתלטיות',
  'מהירות וזריזות',
  'מניעת פציעות',
  'מנטלי',
  'אימון ילדים וקטסל',
  'ניהול קבוצה',
  'סקאוטינג',
  'פודקאסטים',
  'הגנה',
  'התקפה',
  'יסודות',
  'טקטיקה',
  'כושר',
]

// 20 הקטגוריות של מסמך ההשקה בלבד (בלי הישנות) — הייבוא האוטומטי רץ רק עליהן
export const VIDEO_CATEGORIES_CORE = VIDEO_CATEGORIES.slice(0, 20)

// סרטונים אוטומטיים לפי נושא — אגרגטור חוקי: רק קישור לחיפוש יוטיוב ממוקד-נושא
// (לא מאחסנים תוכן). פותח את הסרטונים הרלוונטיים והעדכניים ביותר לאותו נושא.
export const VIDEO_TOPIC_EN = {
  'הגנה אישית': 'man to man defense drills',
  'הגנת אזור': 'zone defense drills',
  'פרס': 'full court press defense drills',
  'התקפה מסודרת': 'half court offense sets',
  'מעברים': 'transition offense drills',
  'קליעה': 'shooting drills',
  'כדרור': 'dribbling drills',
  'מסירות': 'passing drills',
  'סיומות': 'finishing at the rim drills',
  'ריבאונד': 'rebounding drills',
  'תנועה בלי כדור': 'off ball movement drills',
  'מסכים ופיק אנד רול': 'pick and roll drills',
  'אתלטיות': 'basketball athleticism training',
  'מהירות וזריזות': 'speed and agility drills',
  'מניעת פציעות': 'basketball injury prevention',
  'מנטלי': 'basketball mental training',
  'אימון ילדים וקטסל': 'youth basketball coaching',
  'ניהול קבוצה': 'basketball team culture coaching',
  'סקאוטינג': 'basketball scouting breakdown',
  'פודקאסטים': 'basketball coaching podcast',
  'הגנה': 'defense drills',
  'התקפה': 'offense drills',
  'יסודות': 'fundamentals drills',
  'טקטיקה': 'plays tactics',
  'כושר': 'conditioning workout',
}
export const ytSearchUrl = (cat) =>
  'https://www.youtube.com/results?search_query=' +
  encodeURIComponent('basketball ' + (VIDEO_TOPIC_EN[cat] || cat) + ' coaching')

// ===== ייבוא אוטומטי של סרטונים מיוטיוב (YouTube Data API v3) =====
// המפתח נטען מקובץ .env.local (VITE_YOUTUBE_API_KEY) — לא נשמר בקוד!
// השג מפתח חינמי: https://console.cloud.google.com → הפעל "YouTube Data API v3"
// → "Create credentials" → API key → שים ב-.env.local.
// חובה להגביל את המפתח (Application restrictions → HTTP referrers → הדומיין שלך).
export const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || ''

// ===== אבטחה: מאשר רק קישורי http/https — חוסם javascript: וכד' (XSS) =====
export const safeUrl = (u) => {
  const s = String(u || '').trim()
  return /^https?:\/\//i.test(s) ? s : null
}
// כמה סרטונים לייבא לכל נושא בלחיצה
export const YT_IMPORT_PER_CATEGORY = 12
// מסמך ההשקה 2.3 — מסנני איכות לייבוא: סף צפיות מינימלי, ומשך 3–30 דקות
// (פודקאסטים פטורים מתקרת המשך)
export const YT_MIN_VIEWS = 3000
export const YT_MIN_MINUTES = 3
export const YT_MAX_MINUTES = 30

// ===== כתבות כדורסל לדף הבית (אגרגטור חוקי דרך rss2json) =====
// גישה חוקית: לא מעתיקים תוכן. מציגים כותרת מקורית + תמונה כשיש + שם המקור + קישור
// לכתבה המקורית (קרדיט). הכול מסונן לכדורסל בלבד, עם עדיפות לערוץ הספורט.

// מפתח API אופציונלי של rss2json — מסיר את הגבלת הקצב של ה-tier החינמי.
// הרשמה חינמית: https://rss2json.com/  → הדבק את המפתח כאן (בין הגרשיים).
// בלי מפתח: ynet עובד אמין, ושאר המקורות best-effort.
export const RSS2JSON_KEY = ''

// עוטף פיד RSS דרך rss2json (פותר CORS, מחזיר JSON אחיד).
const rss2json = (rssUrl) =>
  'https://api.rss2json.com/v1/api.json?rss_url=' +
  encodeURIComponent(rssUrl) +
  (RSS2JSON_KEY ? '&api_key=' + RSS2JSON_KEY : '')

// שאילתת Google News בעברית (אגרגטור — מקשר לכתבה המקורית עם שם המקור).
const gnews = (query) =>
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent(query + ' when:21d') +
  '&hl=he-IL&gl=IL&ceid=IL:he'

// מקורות הכתבות (מסמך ההשקה 2.2) — מדורי הכדורסל של אתרי ספורט ישראליים
// בלבד, דרך Google News (מקשר החוצה לכתבה המקורית — לא מעתיקים תוכן).
// google:true → הכותרת מכילה סיומת " - שם מקור"; נחלץ ממנה את המקור לקרדיט.
// ה-topic משמש לשילוב מתחלף (round-robin) כדי שלא יהיו 4 כתבות מאותו אתר.
// ‎-כדורגל — בלי זה שאילתת site: מחזירה גם כתבות כדורגל שהמילה «כדורסל»
// מופיעה אצלן רק בתפריט האתר (נבדק חי: ONE החזיר תוצאות 0:0 מכדורגל).
export const NEWS_SOURCES = [
  { name: 'ערוץ הספורט', topic: 'sport5', google: true, api: rss2json(gnews('כדורסל -כדורגל site:sport5.co.il')) },
  { name: 'ONE', topic: 'one', google: true, api: rss2json(gnews('כדורסל -כדורגל site:one.co.il')) },
  { name: 'וואלה ספורט', topic: 'walla', google: true, api: rss2json(gnews('כדורסל -כדורגל site:walla.co.il')) },
  { name: 'ישראל היום', topic: 'israelhayom', google: true, api: rss2json(gnews('כדורסל -כדורגל site:israelhayom.co.il')) },
]

// שמות שמזהים את ערוץ הספורט — לצורך הקפצה לראש (עדיפות, כבקשת המשתמש).
export const SPORT5_HINTS = ['ספורט 5', 'sport5', 'sport 5', 'ערוץ הספורט']

// תמונות גיבוי כדורסל (Unsplash — רישיון חופשי לשימוש מסחרי, חוקי).
// משמשות כשלכתבה אין תמונה משלה, כדי שכל כרטיס ייראה מלא.
const UN = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=440&q=60`
export const NEWS_FALLBACK_IMAGES = [
  UN('photo-1546519638-68e109498ffc'),
  UN('photo-1608245449230-4ac19066d2d0'),
  UN('photo-1574623452334-1e0ac2b3ccb4'),
  UN('photo-1519861531473-9200262188bf'),
  UN('photo-1504450758481-7338eba7524a'),
  UN('photo-1612872087720-bb876e2e67d1'),
]

// כמה כתבות להציג, וכל כמה זמן לרענן (קאשינג ב-localStorage).
// בבית מוצגות 4 (מסמך ההשקה 2.2); שולפים יותר כדי שהערבוב יהיה מגוון.
export const NEWS_COUNT = 8
export const NEWS_HOME_COUNT = 4
export const NEWS_CACHE_MINUTES = 15
export const NEWS_CACHE_KEY = 'home_news_cache_v8_il'

// קישורי תוכן קבועים (גיבוי + השראה) — מוצגים תחת הכתבות.
export const CONTENT_LINKS = [
  { title: 'NBA', desc: 'חדשות, סטטיסטיקות ותוצאות', url: 'https://www.nba.com' },
  { title: 'EuroLeague', desc: 'הליגה האירופית', url: 'https://www.euroleague.net' },
  { title: 'FIBA', desc: 'כדורסל בינלאומי', url: 'https://www.fiba.basketball' },
]
