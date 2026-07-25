import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// פיצ'רים שדורשים רשת של מאמנים (מאמן השבוע, לוח משחקי אימון, זימון מאמנים)
// מוסתרים כשיש מעט מאמנים — עם 2 מאמנים הם רק רעש שמבלבל. הסף: 15.
const THRESHOLD = 15

export function useNetworkSmall() {
  const [small, setSmall] = useState(null) // null = עדיין לא ידוע (מוסתר בינתיים)
  useEffect(() => {
    let alive = true
    ;(async () => {
      let { count } = await supabase.from('coach_directory').select('id', { count: 'exact', head: true })
      if (count == null) {
        const legacy = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'coach')
        count = legacy.count
      }
      if (alive && count != null) setSmall(count < THRESHOLD)
    })()
    return () => { alive = false }
  }, [])
  return small
}
