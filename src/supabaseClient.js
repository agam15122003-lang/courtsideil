import { createClient } from '@supabase/supabase-js'

// הערכים האלה מגיעים ממשתני הסביבה (‎.env.local מקומית, או הגדרות ה-Deploy ב-Netlify).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// חסרים פרטי חיבור? במקום להפיל את כל האפליקציה (מסך לבן),
// יוצרים לקוח עם ערכי placeholder כדי שהממשק ייטען, ומסמנים דגל להצגת הודעה ברורה.
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!supabaseConfigured) {
  console.error(
    'חסרים פרטי החיבור ל-Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
    'הוסף אותם בהגדרות הסביבה (Netlify → Site settings → Environment variables) ובצע Deploy מחדש.'
  )
}

// createClient זורק שגיאה אם המפתח ריק — לכן משתמשים ב-placeholder בטוח כשחסר,
// כדי שהאתר ייטען ויציג הודעה במקום מסך ריק.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
)
