import { useEffect, useState } from 'react'

// זיהוי מצב לא-מקוון. עד 24.8 לא היה כזה בכלל בשום מקום באפליקציה:
// מאמן באולם עם קליטה גרועה ראה שמירות שנכשלות אחת אחרי השנייה, כל אחת
// עם טוסט אחר, ובלי שאף מסך יגיד לו שהבעיה היא הרשת.
//
// navigator.onLine הוא סימן חלש (הוא אומר «יש ממשק רשת», לא «יש אינטרנט»),
// ולכן משתמשים בו רק לכיוון אחד: false = בוודאות אין. true לא נחשב הבטחה,
// והמסכים ממשיכים לטפל בשגיאות שלהם כרגיל.
export default function useOnline() {
  const [online, setOnline] = useState(() => {
    try { return navigator.onLine !== false } catch { return true }
  })
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
