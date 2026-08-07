// מטביע מזהה-בילד ב-dist/sw.js אחרי שהבילד הסתיים כולו.
// רץ מ-package.json ("build": "vite build && node tools/stamp-sw.mjs") ולא
// כ-plugin של Vite: העתקת public/ אל dist/ יכולה לנחות אחרי closeBundle —
// ואפילו רגע אחרי ש-vite עצמו הסתיים (נצפה ב-7.8 על Windows: ההחתמה רצה,
// וההעתקה המאוחרת דרסה אותה). לכן: כותבים, ממתינים, קוראים שוב ומוודאים
// שההחתמה שרדה — עד עשרה ניסיונות.
// בלי ההחתמה sw.js זהה בין דיפלויים, הדפדפן לא מתקין SW חדש, ומשתמשי
// מובייל נתקעים על גרסה ישנה לתמיד.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const p = fileURLToPath(new URL('../dist/sw.js', import.meta.url))
const id = Date.now().toString(36)
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

let ok = false
for (let i = 0; i < 10; i++) {
  const src = readFileSync(p, 'utf8')
  if (src.includes(`courtside-${id}`)) { ok = true; break }
  if (src.includes('__BUILD_ID__')) writeFileSync(p, src.replace('__BUILD_ID__', id))
  sleep(400)
}
if (!ok) {
  const final = readFileSync(p, 'utf8')
  ok = final.includes(`courtside-${id}`)
}
if (!ok) {
  console.error('stamp-sw: ההחתמה לא שרדה — dist/sw.js עדיין עם התבנית או עם מזהה זר')
  process.exit(1)
}
console.log(`stamp-sw: courtside-${id}`)
