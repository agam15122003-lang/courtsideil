import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Toaster from './Toaster.jsx'
import AccessibilityWidget from './AccessibilityWidget.jsx'
import { ConfirmHost } from './confirm.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { applyDir } from './i18n'
import { inject } from '@vercel/analytics'

// גופנים מקומיים במקום Google Fonts. הסיבה היא פרטיות: כל עוד ה-<link> ישב
// ב-index.html, כתובת ה-IP של כל מי שפתח את האפליקציה — כולל קטינים — נשלחה
// לשרתי גוגל בכל טעינת דף, וזה גם צד-שלישי שחייבים לתעד במדיניות הפרטיות.
// למה דווקא קבצי המשקל המאוחדים (400.css) ולא קבצי תת-הקבוצה (hebrew-400.css):
// רק המאוחדים כוללים unicode-range לכל תת-קבוצה. בלעדיו שני @font-face לאותה
// משפחה+משקל מתנגשים והאחרון גובר — כלומר האותיות העבריות היו נופלות לפונט
// המערכת וכל האפליקציה הייתה משנה מראה. עם unicode-range הדפדפן מוריד בפועל
// רק את הטווח העברי והלטיני; ערבית/קירילית נארזות ל-dist אך לעולם לא נמשכות.
// המשקלים כאן זהים בדיוק למה ש-index.html ביקש קודם מגוגל (Rubik 400–800,
// Heebo 700–900), כדי שלא ישתנה שום דבר ויזואלית.
// @fontsource מגדיר font-display: swap בכל @font-face, ולכן בטלפון איטי הטקסט
// מוצג מיד בפונט המערכת ומתחלף — ולא מהבהב ריק.
import '@fontsource/rubik/400.css'
import '@fontsource/rubik/500.css'
import '@fontsource/rubik/600.css'
import '@fontsource/rubik/700.css'
import '@fontsource/rubik/800.css'
import '@fontsource/heebo/700.css'
import '@fontsource/heebo/800.css'
import '@fontsource/heebo/900.css'
import './index.css'

applyDir() // קובע lang/dir על <html> לפי השפה השמורה

// אנליטיקס (Vercel) — סקריפט same-origin, עומד ב-CSP; פועל רק בפרודקשן
if (import.meta.env.PROD) inject()

// Service worker — התקנה כאפליקציה וטעינה מהירה (פרודקשן בלבד, ובדפדפן בלבד).
// בתוך Capacitor לא רושמים SW: ב-iOS הסכמה capacitor:// לא תומכת ב-Service
// Workers כלל, ובאנדרואיד ה-SW היה נרשם על https://localhost ומנסה network-first
// על ניווט כשאין בכלל שרת. הנכסים ממילא ארוזים לוקלית באפליקציה, ועדכוני גרסה
// מגיעים דרך החנות ולא דרך רענון אוטומטי — ולכן גם ה-controllerchange כאן מיותר
// ומסוכן (רענון מלא באמצע שימוש).
const inCapacitor = typeof window !== 'undefined' && !!window.Capacitor
if (import.meta.env.PROD && !inCapacitor && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* לא קריטי */ })
  })
  // גרסה חדשה נפרסה → ה-worker החדש משתלט (skipWaiting) → רענון אחד
  // אוטומטי במקום «רענון קשה» ידני. הדגל מונע לולאת רענונים, ובדיקת
  // ה-controller מוודאת שההתקנה הראשונה (אין worker קודם) לא מרעננת.
  const swHadController = !!navigator.serviceWorker.controller
  let swRefreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!swHadController || swRefreshing) return
    swRefreshing = true
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* גדר בטיחות אחרונה: ה-boundaries שבתוך הדשבורד מכסים רק את תוכן המסך,
        וקריסה ב-chrome (ניווט, sidebar, מסכי Auth/Landing) הייתה מסך לבן מלא. */}
    <ErrorBoundary screen="root">
      <App />
    </ErrorBoundary>
    <Toaster />
    <ConfirmHost />
    <AccessibilityWidget />
  </React.StrictMode>,
)
