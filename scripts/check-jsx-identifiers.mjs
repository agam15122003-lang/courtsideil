// סורק מזהי JSX חופשיים — <Foo /> שאין לו import, הגדרה או משתנה.
//
// למה זה קיים: `npm run verify` מריץ check-imports ואז vite build, ושניהם
// עוברים בשקט על <User size={14} /> בלי import. esbuild לא פותר מזהים,
// והשגיאה מתפוצצת רק בדפדפן — בדרך כלל במסך שלא נפתח בבדיקה הידנית.
//
// הרצה:  node scripts/check-jsx-identifiers.mjs [קובץ ...]
// בלי ארגומנטים — כל src/**/*.jsx.
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : globSync('src/**/*.jsx')

// רכיבים מובנים של React שמותר להשתמש בהם בלי import מפורש הם רק אלה
// שמגיעים דרך React.* — ב-JSX הם תמיד מנוקדים, ולכן לא ייתפסו כאן ממילא.
let bad = 0

// הערות ומחרוזות מוסרות לפני הסריקה — אחרת «<Page>» בתוך הערת תיעוד
// ו-«#/consent/<TOKEN>» בתוך משפט נספרים כרכיבים. ההחלפה שומרת על מספר
// השורות כדי שמספרי השורות בדוח יישארו נכונים.
const stripNoise = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const code = stripNoise(src)

  // כל <Foo או <Foo.Bar — רק אות ראשונה גדולה (רכיב, לא תג HTML).
  // המנוקדים (<Foo.Bar>) נבדקים לפי החלק שלפני הנקודה.
  const used = new Set()
  for (const m of code.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) used.add(m[1])

  const missing = []
  for (const name of used) {
    const patterns = [
      // import Foo from ... / import Foo, { ... }
      new RegExp('^\\s*import\\s+' + name + '\\b', 'm'),
      // import { Foo } וגם import Default, { Foo } — הבדיקה על השם המקומי
      new RegExp('^\\s*import\\s+[^;\\n]*\\{[^}]*\\b' + name + '\\b[^}]*\\}', 'm'),
      new RegExp('\\bas\\s+' + name + '\\b'),
      // הגדרה מקומית
      new RegExp('^\\s*(export\\s+)?(default\\s+)?function\\s+' + name + '\\b', 'm'),
      new RegExp('^\\s*(export\\s+)?(const|let|var)\\s+' + name + '\\b', 'm'),
      new RegExp('^\\s*(export\\s+)?class\\s+' + name + '\\b', 'm'),
      // פרמטר או destructuring בתוך הקובץ (מקרה נדיר, למשל render prop)
      new RegExp('\\{[^}]*\\b' + name + '\\b[^}]*\\}\\s*=\\s'),
      new RegExp('\\(\\s*\\{[^}]*\\b' + name + '\\b'),
    ]
    if (!patterns.some((re) => re.test(src))) missing.push(name)
  }

  if (missing.length) {
    bad++
    console.log(`✗ ${file}`)
    for (const n of missing) {
      const line = src.split(/\r?\n/).findIndex((l) => l.includes('<' + n)) + 1
      console.log(`    <${n}>  — אין import או הגדרה  (שורה ${line})`)
    }
  }
}

if (bad) {
  console.log(`\n${bad} קבצים עם מזהי JSX חופשיים`)
  process.exit(1)
}
console.log(`✓ ${files.length} קבצים — כל רכיבי ה-JSX מוגדרים`)
