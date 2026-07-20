import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, Heart, MessageCircle, MessageSquare, CalendarDays, BarChart3, Check } from 'lucide-react'
import { supabase } from './supabaseClient'
import { L } from './i18n'

const TYPE_ICON = {
  like: Heart,
  comment: MessageCircle,
  message: MessageSquare,
  event: CalendarDays,
  poll: BarChart3,
}

function timeAgo(ts) {
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (min < 1) return L('עכשיו', 'now')
  if (min < 60) return L(`לפני ${min} דק'`, `${min}m`)
  const hrs = Math.round(min / 60)
  if (hrs < 24) return L(`לפני ${hrs} שע'`, `${hrs}h`)
  const days = Math.round(hrs / 24)
  return L(`לפני ${days} ימים`, `${days}d`)
}

// פעמון התראות — badge חי, פאנל נפתח, סימון כנקרא וניווט ליעד.
// props: session, onNavigate(viewId)
export default function Notifications({ session, onNavigate }) {
  const myId = session.user.id
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [available, setAvailable] = useState(true) // false = הטבלה עוד לא נוצרה
  const panelRef = useRef(null)
  const btnRef = useRef(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:profiles!actor_id(first_name, last_name)')
      .eq('user_id', myId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) {
      // טבלה חסרה — מציגים פעמון שקט בלי לשגות
      setAvailable(false)
      return
    }
    setAvailable(true)
    setItems(data || [])
  }, [myId])

  // טעינה ראשונית + זמן-אמת (עם גיבוי polling כל דקה)
  useEffect(() => {
    load()
    const poll = setInterval(load, 60000)
    let channel = null
    try {
      channel = supabase
        .channel('notifications-' + myId)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` },
          () => load()
        )
        .subscribe()
    } catch { /* realtime לא זמין — ה-polling מכסה */ }
    return () => {
      clearInterval(poll)
      if (channel) supabase.removeChannel(channel)
    }
  }, [load, myId])

  // סגירה בלחיצה בחוץ / Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unread = items.filter((n) => !n.read_at).length

  const openPanel = async () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      // סימון הכול כנקרא — ה-badge נעלם, הפריטים עדיין מסומנים "חדש" בפאנל
      const ids = items.filter((n) => !n.read_at).map((n) => n.id)
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids)
      setItems((cur) => cur.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)))
    }
  }

  const go = (n) => {
    setOpen(false)
    if (n.nav && onNavigate) onNavigate(n.nav)
  }

  const actorName = (n) =>
    n.actor ? `${n.actor.first_name || ''} ${n.actor.last_name || ''}`.trim() || L('מאמן', 'A coach') : L('מאמן', 'A coach')

  if (!available) return null

  return (
    <div className="ntf-wrap">
      <button
        ref={btnRef}
        type="button"
        className={open ? 'ntf-bell open' : 'ntf-bell'}
        onClick={openPanel}
        aria-label={unread > 0 ? L(`התראות — ${unread} חדשות`, `Notifications — ${unread} new`) : L('התראות', 'Notifications')}
        aria-expanded={open}
      >
        <Bell size={19} />
        {unread > 0 && <span className="ntf-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="ntf-panel" ref={panelRef} role="dialog" aria-label={L('התראות', 'Notifications')}>
          <div className="ntf-head">
            <span>{L('התראות', 'Notifications')}</span>
            {items.length > 0 && (
              <span className="ntf-head-hint"><Check size={13} /> {L('סומן כנקרא', 'Marked read')}</span>
            )}
          </div>
          {items.length === 0 ? (
            <p className="ntf-empty">{L('אין התראות עדיין — כשמאמן יגיב או יעשה לייק, זה יופיע כאן.', 'No notifications yet — likes and comments will show up here.')}</p>
          ) : (
            <ul className="ntf-list">
              {items.map((n) => {
                const Icon = TYPE_ICON[n.type] || Bell
                return (
                  <li key={n.id}>
                    <button type="button" className={n.read_at ? 'ntf-item' : 'ntf-item is-new'} onClick={() => go(n)}>
                      <span className={`ntf-ic t-${n.type}`}><Icon size={15} /></span>
                      <span className="ntf-body">
                        <span className="ntf-text">
                          <strong>{actorName(n)}</strong> {n.content}
                        </span>
                        <span className="ntf-time">{timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
