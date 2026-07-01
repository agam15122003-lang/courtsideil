// ערכים קבועים שחוזרים בכל המערכת — מוגדרים פעם אחת כאן.

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

// ציטוטים מעוררי השראה למאמנים (מתחלפים בדף הכניסה ובבית).
export const COACHING_QUOTES = [
  { text: 'תרגול לא הופך מושלם — תרגול נכון הופך מושלם.', author: 'ג׳ון ווּדן', text_en: "Practice doesn't make perfect. Perfect practice makes perfect.", author_en: 'John Wooden' },
  { text: 'הצלחה היא שקט נפשי שמגיע מהידיעה שעשית כמיטב יכולתך.', author: 'ג׳ון ווּדן', text_en: 'Success is peace of mind that comes from knowing you did your best.', author_en: 'John Wooden' },
  { text: 'אל תיתן למה שאתה לא יכול לעשות להפריע למה שאתה כן יכול.', author: 'ג׳ון ווּדן', text_en: "Don't let what you cannot do interfere with what you can do.", author_en: 'John Wooden' },
  { text: 'דברים קטנים יוצרים דברים גדולים.', author: 'ג׳ון ווּדן', text_en: 'Little things make big things happen.', author_en: 'John Wooden' },
  { text: 'פספסתי יותר מ-9,000 זריקות בקריירה. בגלל זה אני מצליח.', author: 'מייקל ג׳ורדן', text_en: "I've missed more than 9,000 shots in my career. That is why I succeed.", author_en: 'Michael Jordan' },
  { text: 'אני יכול לקבל כישלון — אבל אני לא יכול לקבל לא לנסות.', author: 'מייקל ג׳ורדן', text_en: "I can accept failure, but I can't accept not trying.", author_en: 'Michael Jordan' },
  { text: 'הכישרון מנצח משחקים, אבל עבודת צוות ושכל מנצחים אליפויות.', author: 'מייקל ג׳ורדן', text_en: 'Talent wins games, but teamwork and intelligence win championships.', author_en: 'Michael Jordan' },
  { text: 'מנטליות המאמבה היא לנסות להיות הגרסה הטובה ביותר של עצמך — כל יום.', author: 'קובי בראיינט', text_en: 'The Mamba Mentality is trying to be the best version of yourself — every day.', author_en: 'Kobe Bryant' },
  { text: 'הכישרון לבדו לא מספיק. צריך לעבוד קשה יותר מכולם.', author: 'קובי בראיינט', text_en: 'Talent alone is not enough. You have to work harder than everyone.', author_en: 'Kobe Bryant' },
  { text: 'החוזק של הקבוצה הוא כל שחקן. החוזק של כל שחקן הוא הקבוצה.', author: 'פיל ג׳קסון', text_en: 'The strength of the team is each member. The strength of each member is the team.', author_en: 'Phil Jackson' },
  { text: 'מצוינות היא התוצאה של שאיפה תמידית להשתפר, שוב ושוב.', author: 'פט ריילי', text_en: 'Excellence is the result of constantly striving to improve, again and again.', author_en: 'Pat Riley' },
  { text: 'כדורסל הוא משחק של טעויות — מי שמתאושש מהר יותר, מנצח.', author: 'גרג פופוביץ׳', text_en: 'Basketball is a game of mistakes — whoever recovers faster, wins.', author_en: 'Gregg Popovich' },
  { text: 'המאמן הטוב גורם לשחקניו לראות מה הם יכולים להיות, לא רק מה שהם.', author: 'ארה פרסיאן', text_en: 'A good coach makes his players see what they can become, not just what they are.', author_en: 'Ara Parseghian' },
  { text: 'אלופים מתאמנים גם כשאף אחד לא מסתכל.', author: 'לארי בירד', text_en: 'Champions practice even when no one is watching.', author_en: 'Larry Bird' },
  { text: 'לא משחקים נגד יריב — משחקים נגד המשחק עצמו.', author: 'באבי נייט', text_en: "You don't play against opponents — you play against the game itself.", author_en: 'Bobby Knight' },
  { text: 'עבודה קשה מנצחת כישרון, כשהכישרון לא עובד קשה.', author: 'פתגם כדורסל', text_en: "Hard work beats talent when talent doesn't work hard.", author_en: 'Basketball proverb' },
  { text: 'הגנה מנצחת אליפויות.', author: 'פתגם כדורסל', text_en: 'Defense wins championships.', author_en: 'Basketball proverb' },
  { text: 'תהליך לפני תוצאה — שפר אחוז אחד בכל יום.', author: 'פתגם אימון', text_en: 'Process over outcome — improve one percent every day.', author_en: 'Coaching proverb' },
  { text: 'אל תספור את הימים — תגרום לימים לספור.', author: 'מוחמד עלי', text_en: "Don't count the days — make the days count.", author_en: 'Muhammad Ali' },
  { text: 'הקושי שאתה חווה היום מפתח את הכוח שתצטרך מחר.', author: 'פתגם ספורט', text_en: "The struggle you face today develops the strength you'll need tomorrow.", author_en: 'Sports proverb' },
  { text: 'המשמעת היא הגשר בין מטרות להישגים.', author: 'ג׳ים רוהן', text_en: 'Discipline is the bridge between goals and accomplishment.', author_en: 'Jim Rohn' },
  { text: 'נצח את הגרסה שלך מאתמול.', author: 'פתגם אימון', text_en: "Beat yesterday's version of yourself.", author_en: 'Coaching proverb' },
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
export const VIDEO_CATEGORIES = [
  'הגנה',
  'התקפה',
  'יסודות',
  'כדרור',
  'קליעה',
  'מסירות',
  'ריבאונד',
  'תנועה בלי כדור',
  'טקטיקה',
  'כושר',
]

// סרטונים אוטומטיים לפי נושא — אגרגטור חוקי: רק קישור לחיפוש יוטיוב ממוקד-נושא
// (לא מאחסנים תוכן). פותח את הסרטונים הרלוונטיים והעדכניים ביותר לאותו נושא.
export const VIDEO_TOPIC_EN = {
  'הגנה': 'defense drills',
  'התקפה': 'offense drills',
  'יסודות': 'fundamentals drills',
  'כדרור': 'dribbling drills',
  'קליעה': 'shooting drills',
  'מסירות': 'passing drills',
  'ריבאונד': 'rebounding drills',
  'תנועה בלי כדור': 'off ball movement drills',
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

// מקורות הכתבות — שאילתות Google News מסוננות-כדורסל מראש (כל הכותרות מכילות "כדורסל").
// google:true → הכותרת מכילה סיומת " - שם מקור"; נחלץ ממנה את המקור האמיתי לקרדיט.
// השאילתה הראשונה ממקדת בערוץ הספורט (Sport5); השנייה מרחיבה לכלל המקורות הישראליים.
// כמה שאילתות לפי נושאים שונים — כדי שהכתבות לא יהיו כולן על אותו אירוע.
// ה-topic משמש לשילוב מתחלף (round-robin) בין הנושאים.
export const NEWS_SOURCES = [
  { name: 'ליגת ווינר', topic: 'israel', google: true, api: rss2json(gnews('כדורסל ("ליגת ווינר" OR מכבי OR הפועל OR "ליגת העל בכדורסל")')) },
  { name: 'NBA', topic: 'nba', google: true, api: rss2json(gnews('NBA כדורסל')) },
  { name: 'יורוליג', topic: 'europe', google: true, api: rss2json(gnews('(יורוליג OR יורוקאפ) כדורסל')) },
  { name: 'נבחרת ישראל', topic: 'national', google: true, api: rss2json(gnews('נבחרת ישראל כדורסל')) },
  { name: 'ערוץ הספורט', topic: 'sport5', google: true, api: rss2json(gnews('כדורסל site:sport5.co.il')) },
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
export const NEWS_COUNT = 8
export const NEWS_CACHE_MINUTES = 15
export const NEWS_CACHE_KEY = 'home_news_cache_v5'

// קישורי תוכן קבועים (גיבוי + השראה) — מוצגים תחת הכתבות.
export const CONTENT_LINKS = [
  { title: 'NBA', desc: 'חדשות, סטטיסטיקות ותוצאות', url: 'https://www.nba.com' },
  { title: 'EuroLeague', desc: 'הליגה האירופית', url: 'https://www.euroleague.net' },
  { title: 'FIBA', desc: 'כדורסל בינלאומי', url: 'https://www.fiba.basketball' },
]
