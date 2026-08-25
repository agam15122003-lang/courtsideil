import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// מקור אחד לכל פעמוני ההתראות.
//
// עד 25.8 הפעמון רונדר בשלושה מקומות בו־זמנית (הסרגל העליון, המגירה,
// והבאנר בדף הבית). כל עותק פתח polling משלו וגם מנוי realtime משלו —
// **על אותו שם ערוץ**. התוצאה: שלוש שליפות בדקה מכל מאמן, ושלושה מנויים
// כפולים שה-Supabase דוחה חלק מהם בשקט. גרוע מזה, ניתוק של עותק אחד קרא
// removeChannel על הערוץ ששני האחרים עדיין הסתמכו עליו — כלומר אחרי מעבר
// בין מסכים ההתראות בזמן אמת פשוט הפסיקו להגיע.
//
// עכשיו: שליפה אחת, ערוץ אחד, ומונה מנויים שסוגר אותם רק כשהפעמון האחרון ירד.
let state = { items: [], loading: true, available: true, failed: false }
let uid = null
let poll = null
let channel = null
const subs = new Set()

const set = (patch) => {
  state = { ...state, ...patch }
  for (const fn of subs) fn(state)
}

export async function loadNotifications() {
  if (!uid) return
  const myId = uid
  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:profiles!actor_id(first_name, last_name)')
    .eq('user_id', myId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (myId !== uid) return // התחלף משתמש באמצע השליפה
  if (error) {
    // טבלה חסרה (42P01 / PGRST205) — פעמון שקט, כי הפיצ'ר לא קיים.
    // כל שגיאה אחרת היא תקלת רשת: הפעמון נשאר, עם דרך לנסות שוב.
    const missingTable = error.code === '42P01' || error.code === 'PGRST205' || /does not exist/i.test(error.message || '')
    set(missingTable ? { available: false, loading: false } : { failed: true, loading: false })
    return
  }
  set({ items: data || [], available: true, failed: false, loading: false })
}

function start(myId) {
  uid = myId
  loadNotifications()
  poll = setInterval(loadNotifications, 60000)
  try {
    channel = supabase
      .channel('notifications-' + myId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` },
        () => loadNotifications()
      )
      .subscribe()
  } catch { /* realtime לא זמין — ה-polling מכסה */ }
}

function stop() {
  clearInterval(poll)
  poll = null
  if (channel) supabase.removeChannel(channel)
  channel = null
  uid = null
  state = { items: [], loading: true, available: true, failed: false }
}

// סימון הכול כנקרא — משותף, כדי שכל שלושת הפעמונים יאבדו את ה-badge יחד
export async function markAllRead() {
  const ids = state.items.filter((n) => !n.read_at).map((n) => n.id)
  if (!ids.length) return
  const at = new Date().toISOString()
  set({ items: state.items.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at || at } : n)) })
  await supabase.from('notifications').update({ read_at: at }).in('id', ids)
}

export function retryNotifications() {
  set({ loading: true, failed: false })
  loadNotifications()
}

export default function useNotifications(myId) {
  const [snap, setSnap] = useState(state)
  useEffect(() => {
    if (!myId) return undefined
    // משתמש אחר (התחברות מחדש) — לאפס לפני שמתחברים מחדש
    if (uid && uid !== myId) stop()
    subs.add(setSnap)
    if (subs.size === 1) start(myId)
    else setSnap(state)
    return () => {
      subs.delete(setSnap)
      if (subs.size === 0) stop()
    }
  }, [myId])
  return snap
}
