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
export const NEWS_CACHE_KEY = 'home_news_cache_v6'

// קישורי תוכן קבועים (גיבוי + השראה) — מוצגים תחת הכתבות.
export const CONTENT_LINKS = [
  { title: 'NBA', desc: 'חדשות, סטטיסטיקות ותוצאות', url: 'https://www.nba.com' },
  { title: 'EuroLeague', desc: 'הליגה האירופית', url: 'https://www.euroleague.net' },
  { title: 'FIBA', desc: 'כדורסל בינלאומי', url: 'https://www.fiba.basketball' },
]
