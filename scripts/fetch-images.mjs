#!/usr/bin/env node
// fetch-images.mjs — בונה את מאגר התמונות של האפליקציה מ-Openverse.
//
// למה Openverse: API ציבורי, **בלי מפתח**, עם סינון רישיון מובנה. אנחנו מושכים
// רק cc0 / pdm / by — כלומר נחלת הכלל או ייחוס בלבד, בלי NC ובלי SA.
//
// למה דפדוף ושרשרת שאילתות ולא בקשה אחת: נמדד מול ה-API החי (28.7.2026) —
// "basketball court" מחזירה 0 תמונות ≥1024px בעמוד הראשון, ו-"basketball training"
// מחזירה 1 בלבד מתוך 120 תוצאות. רוב תמונות ה-CC0 מגיעות מ-Flickr ותקועות על
// 1024px. לכן: כמה שאילתות לכל קטגוריה, וכמה עמודים לכל שאילתה, עד שיש מספיק.
//
// הרצה: npm run images
// אידמפוטנטי — תמונה שכבר ירדה והקבצים שלה קיימים לא תרד שוב.

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'public', 'images')
const MANIFEST = path.join(ROOT, 'src', 'data', 'images.json')

const API = 'https://api.openverse.org/v1/images/'
const LICENSE = 'cc0,pdm,by'
const PAGE_SIZE = 20
const MAX_PAGES = 8 // תקרה לכל שאילתה — שלא נרוקן את ה-API על שאילתה עקרה
const MIN_WIDTH = 1024 // רף הרוחב: מספיק ל-800px במובייל ול-1024 בדסקטופ
// סובלנות אחרי ההורדה: הרבה מקורות Flickr יורדים ב-1023px בגלל עיגול יחס.
// לפסול תמונה טובה בגלל פיקסל אחד זה בזבוז — הרף האמיתי נשמר ב-MIN_WIDTH.
const MIN_WIDTH_ACTUAL = 1000
const TARGET = 8 // תמונות לקטגוריה
// מכסת מועמדים **לכל שאילתה**, ולא בריכה משותפת. עם בריכה משותפת השאילתה
// הראשונה מילאה אותה לבדה והשאר מעולם לא נשלפו — ואז איכות הקטגוריה כולה
// נקבעה ע"י שאילתה אחת. כך כל שאילתה תורמת, והאוצרות בוחרת מתוך תמהיל.
const PER_QUERY = 14
// תקרות רוחב, לא יעדים. `withoutEnlargement` אומר שהקובץ יוצא ברוחב המקור אם
// הוא צר מהתקרה — ולכן הקבצים נקראים lg/sm ולא לפי מספר.
//
// למה זה חשוב כאן: נמדד מול ה-API החי (28.7.2026) — עם license=cc0,pdm,by
// כ-97% מהתוצאות הן Flickr, ו-Openverse מגיש להן את וריאנט ה-_b **שחסום
// ב-1024px**, גם כשה-API מדווח על מקור של 5623px. רק Wikimedia (3-5 מתוך 120)
// מגיש רזולוציה מלאה. כלומר 1024 היא התקרה המעשית של המאגר הזה, וקובץ בשם
// "-1600.webp" שמכיל 1024px היה שקר ל-srcSet.
const SIZES = [
  { name: 'lg', cap: 1600 },
  { name: 'sm', cap: 800 },
]
const QUALITY = 78
const IDEAL_WIDTH = 2400 // מקור רחב מדי = הורדה איטית בלי רווח איכות אחרי הקטנה
// גבולות יחס רוחב-גובה: ההירו והכרטיסים אופקיים. פנורמה של 1024×213 או
// תמונת פורטרט אינן שמישות באף אחד מהם — נדחות בשלב המועמדות.
const MIN_RATIO = 1.15
const MAX_RATIO = 2.4
const UA = 'CourtSide/0.1 (basketball coaching app; +https://github.com/)'

// פסילה ידנית — מזהים (8 תווים) שנבדקו בעין ונדחו.
// Openverse מחזיר לפי רלוונטיות טקסטואלית, לא לפי התאמה חזותית; רשימה זו היא
// שלב האוצרות. היא כאן ולא במקום אחר כדי שהרצה חוזרת תיתן את אותה תוצאה.
//   · גדר רשת ששולטת בפריים במקום המגרש (hero)
//   · דיוקנאות קבוצה מארכיונים היסטוריים, 1910-1954 (community) — נראה כמו
//     מוזיאון ולא כמו קהילת מאמנים פעילה
//   · תמונות שאין בהן כדורסל בכלל (בניין, צילום לילה)
const REJECT = new Set([
  // hero — גדר רשת ששולטת בפריים במקום המגרש
  'd40ad51b', '16d439df', '7f872ab4', '534a1b4d',
  // hero — "indoor basketball" החזירה אולם ריקודים, מסלול תצוגה, נבחרת כדורעף,
  // דיוקן ארכיון ואנשים בחליפות. אין בהן כדורסל.
  'f98b159c', '4fb07d91', 'b74d612f', 'ce341919', '598218ec', '789b370e',
  // hero — "sports hall" מחזירה חזיתות בניין. מקורות Wikimedia ברזולוציה
  // מלאה, ולכן דירוג הרוחב דחף אותן לראש — אבל הירו צריך מגרש, לא בניין.
  'ba71552f', '0dc2b252', 'bd4a2ad2', 'fe366c8c', '8d82315d', 'ce4d45d2', '996ae971', '4de74c6c',
  // hero — כפילות: אותו אולם מזווית כמעט זהה ל-8a129c96. בהחלפה כל 7 שניות
  // שתי תמונות דומות נראות כמו תקלה, לא כמו גיוון.
  '25d054dc',
  // drills — צילום לילה, בניין, כדורים ליד כלבים ישנים, שתי נשים ברחוב
  '3055a0f8', 'c506ad6d', '7740e095', '2979e905', '95e6d674',
  // community — דיוקנאות קבוצה מארכיונים היסטוריים 1910-1954: נראה כמו מוזיאון
  // ולא כמו קהילת מאמנים פעילה. וגם כרזה מצוירת מ-1929.
  '3ca60ebe', '50078faf', 'e42f90bd', '3afec29c',
  'dffed032', 'c162c5ee', 'd264dbf2', '4de6ddd8',
  '9b8e2b2b', 'b91123af',
])

// כל קטגוריה מקבלת כמה שאילתות. עוברים לשאילתה הבאה רק כשהקודמת מוצתה.
// הסדר משנה: "basketball court" מחזירה בעיקר מגרשים מבעד לגדר רשת, ו-
// "basketball team" מחזירה בעיקר דיוקנאות ארכיון. השאילתה שנותנת את התוצאה
// החזותית הטובה יותר הועברה לראש הרשימה.
const CATEGORIES = [
  {
    key: 'hero',
    alt: 'מגרש כדורסל',
    queries: ['basketball court', 'basketball arena', 'indoor basketball', 'sports hall'],
  },
  {
    key: 'drills',
    alt: 'שחקני כדורסל באימון',
    queries: ['basketball practice', 'basketball training', 'basketball drill'],
  },
  {
    key: 'community',
    alt: 'קבוצת כדורסל',
    queries: ['basketball game', 'basketball players', 'basketball team'],
  },
  {
    key: 'articles',
    alt: 'סל כדורסל',
    queries: ['basketball hoop', 'basketball ball', 'basketball net'],
  },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

// ---------- שליפה מ-Openverse ----------

// עמוד תוצאות אחד. 429 = חרגנו ממכסת האנונימי — נסיגה מדורגת ואז ויתור על העמוד.
async function searchPage(query, page) {
  const url = `${API}?q=${encodeURIComponent(query)}&license=${LICENSE}&page_size=${PAGE_SIZE}&page=${page}`
  for (let attempt = 0; attempt < 3; attempt++) {
    let res
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
    } catch {
      await sleep(1500 * (attempt + 1))
      continue
    }
    if (res.status === 429) {
      const wait = 5000 * (attempt + 1)
      log(`      · 429 מ-Openverse, ממתין ${wait / 1000}ש'`)
      await sleep(wait)
      continue
    }
    // 404 על עמוד = עברנו את סוף התוצאות, לא שגיאה
    if (res.status === 404) return null
    if (!res.ok) return null
    try {
      return await res.json()
    } catch {
      return null
    }
  }
  return null
}

function usable(r) {
  if (!r?.url || !r.id) return false
  if (REJECT.has(r.id.slice(0, 8))) return false
  if (!(r.width >= MIN_WIDTH)) return false
  const ratio = r.width / r.height
  if (!(ratio >= MIN_RATIO && ratio <= MAX_RATIO)) return false
  if (r.mature) return false
  // unstable__sensitivity — מערך סימוני רגישות; כל סימון = דילוג
  if (Array.isArray(r.unstable__sensitivity) && r.unstable__sensitivity.length) return false
  // SVG/GIF אינם צילומים; הם היחידים שעוברים את רף הרוחב בלי להיות תמונה אמיתית
  if (/\.(svg|gif)(\?|$)/i.test(r.url)) return false
  return true
}

// דירוג המועמדים — שתי דרגות ואז כוונון עדין:
// 1. מקור שמספיק לגרסת ה-1600 קודם לכל. בלי הדרגה הזאת מרווח |width - IDEAL|
//    מעדיף מקור 1024 (מרחק 1376) על מקור 2600 (מרחק 200 — אבל נראה טוב יותר),
//    והתוצאה היא שקובץ ה-"1600" הוא בפועל 1024. זה קרה בהרצה הראשונה.
// 2. בתוך הדרגה — הקרוב ביותר ל-IDEAL_WIDTH, כדי לא להוריד 12MP סתם.
function rank(a, b) {
  const tier = (r) => (r.width >= SIZES[0].cap ? 0 : 1)
  if (tier(a) !== tier(b)) return tier(a) - tier(b)
  return Math.abs(a.width - IDEAL_WIDTH) - Math.abs(b.width - IDEAL_WIDTH)
}

async function gather(cat, skipIds) {
  const seen = new Set(skipIds)
  const out = []
  for (const query of cat.queries) {
    let got = 0
    for (let page = 1; page <= MAX_PAGES && got < PER_QUERY; page++) {
      const json = await searchPage(query, page)
      await sleep(350) // נימוס מול API אנונימי
      if (!json?.results?.length) break
      for (const r of json.results) {
        if (got >= PER_QUERY) break
        if (seen.has(r.id) || !usable(r)) continue
        seen.add(r.id)
        out.push(r)
        got++
      }
      if (json.page >= json.page_count) break
    }
    log(`   "${query}" → ${got} מועמדים (סה"כ ${out.length})`)
  }
  return out.sort(rank)
}

// ---------- הורדה והמרה ----------

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// מייצר את שתי הגרסאות + LQIP. מחזיר את המידות של הגרסה הגדולה, כדי
// ש-SmartImage יוכל לשמור מקום מראש ולא תהיה קפיצת layout.
async function convert(buf, dir, slug) {
  const meta = await sharp(buf).metadata()
  // ה-API מדווח על מידות **המקור**, לא על מה ש-url מגיש בפועל — בודקים על הקובץ
  if (!(meta.width >= MIN_WIDTH_ACTUAL)) throw new Error(`רוחב בפועל ${meta.width}`)

  const dims = {}
  for (const s of SIZES) {
    const file = path.join(dir, `${slug}-${s.name}.webp`)
    const info = await sharp(buf)
      .rotate() // כיבוד EXIF orientation לפני ההקטנה
      .resize({ width: s.cap, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(file)
    // שומרים את הרוחב **בפועל** — ה-srcSet חייב לתאר את מה שיש בקובץ,
    // אחרת הדפדפן בוחר מקור לא נכון לרוחב התצוגה.
    if (s.name === 'lg') Object.assign(dims, { w: info.width, h: info.height })
    else dims.wSmall = info.width
  }

  // LQIP — 24px מטושטש, מוטמע כ-data-URI ב-JSON. זה ה"placeholder המטושטש"
  // בלי בקשת רשת שלישית ובלי הבהוב.
  const lq = await sharp(buf)
    .rotate()
    .resize({ width: 24 })
    .blur(1.2)
    .webp({ quality: 30 })
    .toBuffer()

  return { ...dims, lqip: `data:image/webp;base64,${lq.toString('base64')}` }
}

function entryFrom(r, cat, dims) {
  const slug = `${cat.key}-${r.id.slice(0, 8)}`
  return {
    id: r.id.slice(0, 8),
    src: `/images/${cat.key}/${slug}-lg.webp`,
    srcSmall: `/images/${cat.key}/${slug}-sm.webp`,
    w: dims.w,
    h: dims.h,
    wSmall: dims.wSmall,
    lqip: dims.lqip,
    alt: cat.alt,
    creator: r.creator || '',
    creatorUrl: r.creator_url || '',
    sourceUrl: r.foreign_landing_url || '',
    license: r.license || '',
    licenseUrl: r.license_url || '',
  }
}

// ---------- ראשי ----------

async function loadExisting() {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8'))
  } catch {
    return {}
  }
}

async function main() {
  const prev = await loadExisting()
  const manifest = {}
  const shortfall = []

  for (const cat of CATEGORIES) {
    const dir = path.join(OUT_DIR, cat.key)
    await mkdir(dir, { recursive: true })
    log(`\n▸ ${cat.key}`)

    // שומרים כל פריט קיים שהקבצים שלו עדיין על הדיסק — הרצה חוזרת לא מורידה שוב
    const kept = []
    for (const e of prev[cat.key] || []) {
      if (REJECT.has(e.id)) continue // פסילה ידנית גוברת על מאגר קיים
      const ok =
        (await exists(path.join(ROOT, 'public', e.src))) &&
        (await exists(path.join(ROOT, 'public', e.srcSmall)))
      if (ok) kept.push(e)
    }
    if (kept.length) log(`   ${kept.length} כבר במאגר`)
    if (kept.length >= TARGET) {
      manifest[cat.key] = kept.slice(0, TARGET)
      continue
    }

    const have = new Set(kept.map((e) => e.id))
    // המזהים השמורים הם 8 תווים; ה-gather משווה מול id מלא, אז מסננים אחרי
    const candidates = (await gather(cat, [])).filter((r) => !have.has(r.id.slice(0, 8)))

    const added = []
    for (const r of candidates) {
      if (kept.length + added.length >= TARGET) break
      const slug = `${cat.key}-${r.id.slice(0, 8)}`
      try {
        const dims = await convert(await download(r.url), dir, slug)
        added.push(entryFrom(r, cat, dims))
        log(`   ✓ ${slug} (${dims.w}×${dims.h}) — ${r.license}`)
      } catch (e) {
        log(`   ✗ ${slug} — ${e.message}`)
      }
    }

    manifest[cat.key] = [...kept, ...added]
    if (manifest[cat.key].length < TARGET) {
      shortfall.push(`${cat.key}: ${manifest[cat.key].length}/${TARGET}`)
    }
  }

  await mkdir(path.dirname(MANIFEST), { recursive: true })
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  log('\n— סיכום —')
  for (const cat of CATEGORIES) log(`   ${cat.key}: ${manifest[cat.key].length}`)
  log(`נכתב: ${path.relative(ROOT, MANIFEST)}`)
  if (shortfall.length) {
    log(`\n⚠ קטגוריות שלא הגיעו ל-${TARGET}: ${shortfall.join(', ')}`)
    log('  יש לתעד ב-PLAN.md ולהמשיך עם מה שיש.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
