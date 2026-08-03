// בדיקה שמונעת את הבאג שהפיל את מסך "הקבוצות שלי":
// ב-Windows מערכת הקבצים לא רגישה לאות גדולה, ו-Vite מנסה סיומת .js לפני .jsx.
// לכן `import X from './SendToPlayers'` נפתר מקומית לקובץ העזר sendToPlayers.js
// (שאין בו default export) — מסך לבן בפיתוח, בזמן שבלינוקס הכול עבד.
//
// הבדיקה: כל ייבוא יחסי בלי סיומת שיש לו "אח" ששמו זהה עד כדי אות גדולה —
// חייב סיומת מפורשת. בנוסף: אין שני קבצים בתיקייה ששמם נבדל רק באות גדולה.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, basename, extname, relative, resolve } from 'node:path'

const SRC = resolve('src')
const problems = []
const warnings = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(jsx?|mjs)$/.test(name)) checkFile(p)
  }
}

function siblings(dir) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function checkFile(file) {
  const src = readFileSync(file, 'utf8')
  const dir = dirname(file)
  const names = siblings(dir)
  const re = /(?:import\s[^'"]*from\s*|import\s*\(\s*)['"](\.\.?\/[^'"]+)['"]/g
  let m
  while ((m = re.exec(src))) {
    const spec = m[1]
    if (extname(spec)) continue // סיומת מפורשת — בטוח
    const base = basename(spec)
    const lower = base.toLowerCase()
    // כמה קבצים בתיקייה מתחילים באותו שם (ללא תלות באות גדולה)?
    const matches = names.filter((n) => n.replace(/\.(jsx?|mjs|ts|tsx)$/, '').toLowerCase() === lower)
    if (matches.length > 1) {
      problems.push(
        `${file}: הייבוא '${spec}' עמום — בתיקייה יש ${matches.join(', ')}. ` +
          'הוסף סיומת מפורשת (למשל \'./Name.jsx\').'
      )
    }
  }
}

function checkCaseCollisions(dir) {
  const seen = new Map()
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      checkCaseCollisions(p)
      continue
    }
    const key = name.toLowerCase()
    if (seen.has(key)) {
      problems.push(`${dir}: שני קבצים שנבדלים רק באות גדולה — ${seen.get(key)} ו-${name}`)
    } else {
      seen.set(key, name)
    }
  }
}

// ===== קבצים מתים =====================================================
// הבדיקה שלמעלה תופסת ייבוא עמום, אבל לא קובץ שלם שאף אחד לא מייבא.
// כך שרדו בריפו Attendance.jsx, DrillSketch.jsx, clipStore.js ו-SmartImage.jsx
// (סקירת 3.8.2026). כאן בונים את גרף הייבוא מנקודת הכניסה שב-index.html
// ומדווחים על כל קובץ ב-src שלא נגעו בו.
//
// זו אזהרה בלבד ולא כישלון: הגרף לא יכול לראות ייבוא דינמי עם נתיב מחושב
// (`import('./' + name)`), ולכן קובץ שנטען כך ידווח בטעות כמת. עדיף להתריע
// מדי מהיר מאשר להפיל בנייה תקינה.

const CODE_RE = /\.(jsx?|mjs)$/
const RESOLVE_EXT = ['', '.js', '.jsx', '.mjs', '.json', '/index.js', '/index.jsx']

function entryPoints() {
  const found = []
  try {
    const html = readFileSync(resolve('index.html'), 'utf8')
    const re = /<script[^>]*\ssrc=["']\/src\/([^"']+)["']/g
    let m
    while ((m = re.exec(html))) found.push(join(SRC, m[1]))
  } catch { /* אין index.html — נופלים ל-main.jsx */ }
  if (!found.length) found.push(join(SRC, 'main.jsx'))
  return found.filter((f) => existsSync(f))
}

// כל המפרטים היחסיים בקובץ: import / export ... from / import() / new URL()
function specsOf(src) {
  const out = []
  const patterns = [
    /(?:import|export)\s[^'"]*from\s*['"](\.\.?\/[^'"]+)['"]/g,
    /import\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
    /import\s*['"](\.\.?\/[^'"]+)['"]/g,          // import './index.css'
    /new\s+URL\s*\(\s*['"](\.\.?\/[^'"]+)['"]/g,  // worker / asset
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(src))) out.push(m[1])
  }
  return out
}

function resolveSpec(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec)
  for (const ext of RESOLVE_EXT) {
    const p = base + ext
    try {
      if (statSync(p).isFile()) return p
    } catch { /* לא קיים — ממשיכים לסיומת הבאה */ }
  }
  return null
}

function collectSrcFiles(dir, acc) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) collectSrcFiles(p, acc)
    else if (CODE_RE.test(name)) acc.push(p)
  }
  return acc
}

function checkUnreachable() {
  const entries = entryPoints()
  if (!entries.length) return // אין ממה להתחיל — לא מתריעים על סמך כלום
  const reached = new Set()
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()
    if (reached.has(file)) continue
    reached.add(file)
    if (!CODE_RE.test(file)) continue // CSS/JSON — לא ממשיכים לסרוק
    let src
    try {
      src = readFileSync(file, 'utf8')
    } catch { continue }
    for (const spec of specsOf(src)) {
      const target = resolveSpec(file, spec)
      if (target && !reached.has(target)) queue.push(target)
    }
  }
  for (const file of collectSrcFiles(SRC, [])) {
    if (!reached.has(file)) warnings.push(relative(resolve('.'), file).replace(/\\/g, '/'))
  }
}

walk(SRC)
checkCaseCollisions(SRC)
checkUnreachable()

if (warnings.length) {
  console.warn('\n⚠ קבצים ב-src שאף קובץ לא מייבא (אזהרה בלבד):\n')
  for (const w of warnings) console.warn('  • ' + w)
  console.warn(
    '\nאם הקובץ באמת מת — למחוק. אם הוא נטען בייבוא דינמי מחושב —' +
      ' להוסיף הערה בקובץ, האזהרה אינה מפילה את הבנייה.\n'
  )
}

if (problems.length) {
  console.error('\n❌ בדיקת ייבוא נכשלה:\n')
  for (const p of problems) console.error('  • ' + p)
  console.error(
    '\nהסבר: ייבוא בלי סיומת + שני קבצים בעלי אותו שם באותיות שונות = התנהגות שונה' +
      ' ב-Windows ובלינוקס. זה מה שהפיל את מסך הקבוצות ביולי 2026.\n'
  )
  process.exit(1)
}
console.log('✔ בדיקת ייבוא עברה — אין ייבוא עמום ואין התנגשות שמות')
