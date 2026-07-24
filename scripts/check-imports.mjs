// בדיקה שמונעת את הבאג שהפיל את מסך "הקבוצות שלי":
// ב-Windows מערכת הקבצים לא רגישה לאות גדולה, ו-Vite מנסה סיומת .js לפני .jsx.
// לכן `import X from './SendToPlayers'` נפתר מקומית לקובץ העזר sendToPlayers.js
// (שאין בו default export) — מסך לבן בפיתוח, בזמן שבלינוקס הכול עבד.
//
// הבדיקה: כל ייבוא יחסי בלי סיומת שיש לו "אח" ששמו זהה עד כדי אות גדולה —
// חייב סיומת מפורשת. בנוסף: אין שני קבצים בתיקייה ששמם נבדל רק באות גדולה.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, basename, extname, resolve } from 'node:path'

const SRC = resolve('src')
const problems = []

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

walk(SRC)
checkCaseCollisions(SRC)

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
