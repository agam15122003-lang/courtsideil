// יצירת כל אייקוני האתר מהלוגו החדש (5a) — מקור אחד, public/courtside-icon.svg.
//
// עד היום חמשת קובצי ה-PNG האלה נוצרו ביד (יולי 2026) ולא היה להם סקריפט,
// ולכן כשהלוגו התחלף הם נשארו עם הצופר הישן. עכשיו הם נגזרים מה-SVG:
// שינוי הלוגו = הרצה אחת של הקובץ הזה.
//
// הרצה:  node scripts/make-icons.mjs
//
// למה שני רקעים שונים:
//   favicon-32  — כדור על שקוף. בלשונית הדפדפן הצללית העגולה נקראת טוב
//                 יותר מריבוע, וגם על לשונית כהה וגם על בהירה.
//   שאר האייקונים — כדור על נייבי אטום. iOS ואנדרואיד לא מכבדים שקיפות
//                 באייקון של מסך הבית; שקוף יוצא שחור. הנייבי הוא --navy-2
//                 מ-DESIGN.md §1, אותו צבע שמסמך המסירה של הלוגו נוקב בו.
//
// maskable: אנדרואיד חותך את האייקון לצורת המשגר (עיגול/טיפה/ריבוע מעוגל)
// ומבטיח רק את 80% המרכזיים. הכדור שם קטן יותר בכוונה כדי שלא ייחתך.
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

const NAVY = '#0A1428'                       // --navy-2
const SRC = 'public/courtside-icon.svg'
const svg = await readFile(SRC, 'utf8')

// הכדור לבדו בגודל נתון, כ-PNG עם שקיפות.
const ball = (px) => sharp(Buffer.from(svg)).resize(px, px).png().toBuffer()

// כדור ממורכז על ריבוע נייבי אטום.
async function plate(size, ballRatio) {
  const mark = await ball(Math.round(size * ballRatio))
  return sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer()
}

const jobs = [
  // [קובץ, גודל, יחס הכדור, רקע]
  ['public/favicon-32.png', 32, 1, null],
  ['public/apple-touch-icon.png', 180, 0.72, NAVY],
  ['public/icon-192.png', 192, 0.72, NAVY],
  ['public/icon-512.png', 512, 0.72, NAVY],
  ['public/icon-512-maskable.png', 512, 0.55, NAVY],
]

for (const [out, size, ratio, bg] of jobs) {
  const buf = bg ? await plate(size, ratio) : await ball(Math.round(size * ratio))
  await sharp(buf).toFile(out)
  console.log(`${out.padEnd(30)} ${size}×${size}  ${bg ? `כדור ${Math.round(ratio * 100)}% על ${bg}` : 'כדור על שקוף'}`)
}

console.log('\nנוצרו 5 אייקונים מ-' + SRC)
console.log('להמשך (אפליקציית אנדרואיד): node scripts/make-app-assets.mjs')
