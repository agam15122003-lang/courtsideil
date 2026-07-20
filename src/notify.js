import { supabase } from './supabaseClient'

// שליחת התראה למאמן אחר — "שגר ושכח": כישלון (למשל טבלה שטרם נוצרה)
// לא מפיל את הפעולה הראשית ולא מוצג למשתמש.
// to: מזהה הנמען, actor: מזהה השולח, type: 'like'|'comment'|'message'|'event'|'poll',
// content: טקסט קצר לתצוגה, nav: יעד ניווט ('community' / 'messages' / ...)
export async function sendNotification({ to, actor, type, content, nav }) {
  if (!to || to === actor) return // לא מתריעים לעצמנו
  try {
    await supabase.from('notifications').insert({
      user_id: to,
      actor_id: actor,
      type,
      content: content || null,
      nav: nav || null,
    })
  } catch (e) {
    console.warn('notification skipped:', e?.message)
  }
}
