import { useEffect } from 'react'

// מצב מיקוד — הסרגל מפנה את המסך כשכותבים/פותחים תוכנית או תרגיל.
//
// ⚠ למה מחלקה על body ולא :has() ב-CSS: המנגנון המקורי (30.8) נשען על
//   .layout:has(.nbk-focus) — ו-:has() קיים רק מ-Chrome 105. הטאבלט של
//   הבעלים מריץ WebView עתיק שמתעלם מהכלל כולו, ולכן הסרגל נשאר במסך
//   בדיוק במקום שהכי מפריע: באמצע אימון. מחלקה שמודלקת מ-JS עובדת בכל
//   דפדפן שהאפליקציה בכלל רצה בו.
//
// מונה ולא דגל: שני מסכי מיקוד יכולים לחיות רגע בחפיפה (מעבר מהעורך
// למסך האימון) — הסרת המחלקה רק כשהאחרון שבהם ירד.
let count = 0

export default function useFocusMode() {
  useEffect(() => {
    count += 1
    document.body.classList.add('is-focus')
    return () => {
      count -= 1
      if (count <= 0) {
        count = 0
        document.body.classList.remove('is-focus')
      }
    }
  }, [])
}
