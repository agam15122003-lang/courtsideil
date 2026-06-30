import { createClient } from '@supabase/supabase-js'

// הערכים האלה מגיעים מקובץ .env.local — אל תכתוב כאן את המפתחות ישירות.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // הודעה ברורה אם שכחת למלא את קובץ ההגדרות
  console.error(
    'חסרים פרטי החיבור ל-Supabase. ודא שמילאת את הקובץ .env.local לפי המדריך.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
