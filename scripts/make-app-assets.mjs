// יצירת חומרי הגלם לאייקון ולמסך הפתיחה של האפליקציה הנייטיבית.
// המקור הוא public/courtside-icon.svg — כדי שהאייקון בטלפון יהיה אותו לוגו
// שמופיע בלשונית הדפדפן, ולא ייווצר מותג שני.
//
// למה 1024 ו-2732: אלה הגדלים ש-@capacitor/assets דורש כקלט. הוא מקטין
// מהם לכל הצפיפויות. אנדרואיד לא משתמש באף אחד מהם כמו שהוא — האייקון
// הגדול ביותר שהוא מייצר הוא 192px — ולכן ההגדלה מ-512 אינה פוגעת באיכות
// של מה שנראה בפועל על המסך.
//
// הרצה: node scripts/make-app-assets.mjs   (ואז: npx @capacitor/assets generate --android)
import sharp from 'sharp'
import { mkdir, readFile } from 'node:fs/promises'

// רקע הלילה של המותג — הערך של --bg במצב כהה (index.css, הבלוק האחרון).
// מסך הפתיחה נשאר כהה תמיד, גם למשתמש במצב בהיר: הוא נמשך פחות משנייה,
// והבזק לבן בפתיחה בולט הרבה יותר מהמעבר מכהה לבהיר.
const NIGHT = '#0D1424'

const SRC = 'public/icon-512.png'
const OUT = 'assets'

await mkdir(OUT, { recursive: true })

// 1) האייקון — ריבוע מלא, בלי שוליים. אנדרואיד חותך אותו בעצמו לפי צורת
//    המסכה של המשגר.
await sharp(SRC).resize(1024, 1024, { fit: 'cover' }).png().toFile(`${OUT}/icon.png`)

// 2) מסך הפתיחה — הסימן לבדו על רקע הלילה.
//    **לא** מ-icon-512.png: הקובץ ההוא אטום, והריבוע הנייבי שלו היה יושב
//    כמלבן חד באמצע הרקע הכהה. במקומו הכדור לבדו, ישר מקובץ הלוגו.
//    בעבר הגאומטריה שוכפלה כאן ביד, והערה הזהירה שצריך לעדכן את שני
//    המקומות יחד — וכשהלוגו התחלף זה בדיוק מה שנשכח. עכשיו הקובץ נקרא
//    מהמקור ואין מה לסנכרן.
const CANVAS = 2732
const MARK = 760

const markSvg = await readFile('public/courtside-icon.svg', 'utf8')
const mark = await sharp(Buffer.from(markSvg)).resize(MARK, MARK).png().toBuffer()

const splash = await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 4, background: NIGHT },
})
  .composite([{ input: mark, gravity: 'center' }])
  .png()
  .toBuffer()

// שתי הגרסאות זהות במכוון — ראו ההערה על הרקע למעלה.
await sharp(splash).toFile(`${OUT}/splash.png`)
await sharp(splash).toFile(`${OUT}/splash-dark.png`)

console.log(`נוצרו ב-${OUT}/: icon.png (1024) · splash.png + splash-dark.png (${CANVAS}, רקע ${NIGHT})`)
