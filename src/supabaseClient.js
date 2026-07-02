import { createClient } from '@supabase/supabase-js'

// הערכים האלה מגיעים מקובץ .env.local — אל תכתוב כאן את המפתחות ישירות.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// דגל למסך ההסבר ב-App — במקום קריסה למסך לבן במחשב חדש בלי .env.local
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!supabaseConfigured) {
  // הודעה ברורה אם שכחת למלא את קובץ ההגדרות
  console.error(
    'חסרים פרטי החיבור ל-Supabase. ודא שמילאת את הקובץ .env.local לפי המדריך.'
  )
}

// ערכי placeholder מונעים מ-createClient לזרוק שגיאה לפני ש-React עולה;
// App מציג מסך הגדרה ברור ולא מריץ שום שאילתה כשהחיבור לא מוגדר.
export const supabase = createClient(
  supabaseUrl || 'https://missing-config.supabase.co',
  supabaseAnonKey || 'missing-config'
)
