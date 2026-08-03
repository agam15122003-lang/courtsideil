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
// TODO (Capacitor): כשנעטוף לאפליקציה נייטיבית להוסיף כאן
//   auth.storage — מתאם מעל @capacitor/preferences (או
//   capacitor-secure-storage-plugin לטוקנים), עם נפילה לאחור ל-localStorage
//   בדפדפן. ב-WKWebView ה-localStorage אינו מוצפן ועלול להימחק ע"י המערכת
//   בלחץ אחסון, מה שמנתק משתמשים אקראית. לא ממומש עכשיו כי Capacitor עדיין
//   לא מותקן בפרויקט (package.json).
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
  }
)
