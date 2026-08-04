// יצירת חומרי הגלם לאייקון ולמסך הפתיחה של האפליקציה הנייטיבית.
// המקור הוא הלוגו הקיים ב-public/ — כדי שהאייקון בטלפון יהיה אותו לוגו
// שמופיע בלשונית הדפדפן, ולא ייווצר מותג שני.
//
// למה 1024 ו-2732: אלה הגדלים ש-@capacitor/assets דורש כקלט. הוא מקטין
// מהם לכל הצפיפויות. אנדרואיד לא משתמש באף אחד מהם כמו שהוא — האייקון
// הגדול ביותר שהוא מייצר הוא 192px — ולכן ההגדלה מ-512 אינה פוגעת באיכות
// של מה שנראה בפועל על המסך.
//
// הרצה: node scripts/make-app-assets.mjs   (ואז: npx @capacitor/assets generate --android)
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

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
//    **לא** מ-icon-512.png: הקובץ ההוא אטום, והריבוע הכתום שלו היה יושב
//    כמלבן חד באמצע הרקע הכהה. במקומו הצורות של whistle.svg מצוירות כאן
//    מחדש בלי ריבוע הרקע — הצופר בלבן, והחור שלו בצבע הרקע כדי שייראה
//    כניקוב אמיתי ולא ככתם.
//    הקואורדינטות זהות ל-public/whistle.svg (viewBox 0 0 100 100).
//    אם הלוגו שם ישתנה, צריך לעדכן גם כאן — שני הקבצים אינם מסונכרנים לבד.
const CANVAS = 2732
const MARK = 760

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${MARK}" height="${MARK}">
  <circle cx="42" cy="55" r="22" fill="#fff"/>
  <circle cx="42" cy="55" r="9" fill="${NIGHT}"/>
  <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="#fff"/>
  <circle cx="78" cy="30" r="6" fill="#fff"/>
</svg>`

const mark = await sharp(Buffer.from(markSvg)).png().toBuffer()

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
