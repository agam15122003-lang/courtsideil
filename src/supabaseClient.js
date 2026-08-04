import { createClient } from '@supabase/supabase-js'

// הערכים האלה מגיעים ממשתני הסביבה (‎.env.local מקומית, או Environment Variables ב-Vercel).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// חסרים פרטי חיבור? במקום להפיל את כל האפליקציה (מסך לבן),
// יוצרים לקוח עם ערכי placeholder כדי שהממשק ייטען, ומסמנים דגל להצגת הודעה ברורה.
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!supabaseConfigured) {
  console.error(
    'חסרים פרטי החיבור ל-Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
    'הוסף אותם בהגדרות הסביבה (Vercel → Project Settings → Environment Variables) ובצע Deploy מחדש.'
  )
}

// createClient זורק שגיאה אם המפתח ריק — לכן משתמשים ב-placeholder בטוח כשחסר,
// כדי שהאתר ייטען ויציג הודעה במקום מסך ריק.
// הגדרות ה-auth נכתבות במפורש ולא נשארות לברירת המחדל:
//   persistSession + autoRefreshToken — המשתמש נשאר מחובר בין ביקורים.
//   detectSessionInUrl — קישור איפוס סיסמה / כניסה מהמייל נקלט אוטומטית.
//   flowType: 'implicit' — החלטה מודעת, ולא ברירת מחדל ששכחנו.
//     ב-PKCE ה-code_verifier נשמר ב-localStorage של **המכשיר שביקש** את הקישור
//     בלבד. קישורי מייל (איפוס סיסמה, magic link) נפתחים בפועל הרבה פעמים
//     במכשיר אחר — הטלפון פותח מייל שנשלח מהמחשב, או ה-WebView של Gmail שהוא
//     קונטקסט אחסון נפרד — ואז ה-exchangeCodeForSession נכשל ב-"invalid request:
//     both auth code and code verifier should be non-empty", והמשתמש נתקע במסך
//     "הקישור אינו תקין" בלי שום דרך להתאושש. זה בדיוק מסלול השחזור שאסור שיישבר.
//     ב-implicit הטוקן חוזר ב-#fragment: ה-fragment לא נשלח לשרת ולא ל-Referer,
//     ו-detectSessionInUrl מנקה אותו מה-URL מיד אחרי הקליטה — כך שהחשיפה
//     מצטמצמת להיסטוריית הדפדפן המקומית, מחיר סביר מול שבירת איפוס הסיסמה.
//   מעבר ל-PKCE בעתיד מחייב קודם טיפול מפורש ב-?code= בכל נקודת נחיתה
//   (App.jsx / ResetPassword.jsx), או מעבר לתבנית token_hash + verifyOtp
//   בתבניות המייל של Supabase — שתיהן עובדות חוצה-מכשירים.
// אחסון הטוקן — מומש 4.8.2026, כשהותקן Capacitor (זה היה ה-TODO שחסם).
//
// ב-WebView נייטיב ה-localStorage אינו אחסון יציב: המערכת רשאית לפנות אותו
// בלחץ אחסון, וה-WebView באנדרואיד מאבד אותו גם ב-"נקה נתוני אפליקציה"
// חלקי. התוצאה היא ניתוק אקראי של משתמשים מחוברים. Preferences נשמר
// ב-SharedPreferences (אנדרואיד) / UserDefaults (iOS) ואינו מתפנה ככה.
//
// **רק בנייטיב.** בדפדפן נשארת ברירת המחדל של supabase-js, במכוון:
// Preferences מוסיף לכל מפתח קידומת משלו, ומעבר אליו באתר החי היה מחליף
// את שם המפתח ומנתק בבת אחת כל משתמש מחובר. אין מה להסב במעבר לנייטיב —
// התקנה טרייה מתחילה ממילא בלי סשן.
const inCapacitor = typeof window !== 'undefined' && !!window.Capacitor

// ייבוא דינמי ולא סטטי: כך התוסף אינו נכנס ל-bundle של הדפדפן, שבו הוא
// לעולם לא ירוץ.
let prefsPromise = null
const prefs = () => (prefsPromise ||= import('@capacitor/preferences').then((m) => m.Preferences))

// ⚠ הלקח מהבנייה הראשונה (4.8.2026): הגרסה הראשונה כאן עטפה את הקריאות
// ב-try/catch בלבד, והאפליקציה נתקעה על מסך טעינה לנצח.
//
// קריאה לתוסף נייטיב יכולה **לא לחזור בכלל** — לא שגיאה, פשוט שקט.
// try/catch תופס רק דחייה, ולכן לא הגן על כלום. ו-supabase-js ממתין
// לקריאת האחסון לפני שהוא עונה על getSession, שכל מסך הטעינה תלוי בו.
// לכן כל קריאה מוגבלת בזמן, ונפילה אחורה היא ל-localStorage ולא ל-null:
// נפילה ל-null פירושה התנתקות המשתמש, וזה תיקון גרוע מהתקלה.
const RACE_MS = 2500
const SILENT = Symbol('silent')

// מחזיר SILENT אם התוסף לא ענה בזמן. הטיימר מנוקה כדי לא להשאיר
// טיימרים תלויים על כל קריאת אחסון.
const withTimeout = (p) => {
  let t
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise((res) => { t = setTimeout(() => res(SILENT), RACE_MS) }),
  ])
}

const local = {
  getItem: (k) => { try { return window.localStorage.getItem(k) } catch { return null } },
  setItem: (k, v) => { try { window.localStorage.setItem(k, v) } catch { /* מלא או חסום */ } },
  removeItem: (k) => { try { window.localStorage.removeItem(k) } catch { /* אין מה לעשות */ } },
}

const nativeStorage = {
  async getItem(key) {
    try {
      const P = await withTimeout(prefs())
      if (P === SILENT) return local.getItem(key)
      const r = await withTimeout(P.get({ key }))
      if (r === SILENT) return local.getItem(key)
      // Preferences ריק ו-localStorage לא: זה מסלול המעבר של מי שהיה
      // מחובר לפני שהתוסף נכנס. עדיף להמשיך את הסשן מלקרוא null.
      return r?.value ?? local.getItem(key)
    } catch { return local.getItem(key) }
  },

  // נכתב לשניהם, ובמכוון. Preferences הוא המקור הקובע בקריאה, ולכן
  // התועלת המקורית נשמרת: אם המערכת תפנה את localStorage בלחץ אחסון,
  // הטוקן עדיין ב-Preferences והמשתמש נשאר מחובר. ו-localStorage הוא
  // הרשת מתחת — אם התוסף שותק, יש מאיפה לקרוא.
  async setItem(key, value) {
    local.setItem(key, value)
    try {
      const P = await withTimeout(prefs())
      if (P !== SILENT) await withTimeout(P.set({ key, value }))
    } catch { /* localStorage כבר עודכן */ }
  },

  async removeItem(key) {
    local.removeItem(key)
    try {
      const P = await withTimeout(prefs())
      if (P !== SILENT) await withTimeout(P.remove({ key }))
    } catch { /* localStorage כבר עודכן */ }
  },
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
      // undefined = ברירת המחדל (localStorage). לא לכתוב כאן localStorage
      // במפורש — supabase-js בודק את הסביבה בעצמו, וכתיבה מפורשת שוברת
      // רינדור בצד שרת אם ייכנס אי־פעם.
      storage: inCapacitor ? nativeStorage : undefined,
    },
  }
)
