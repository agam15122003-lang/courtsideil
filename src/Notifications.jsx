import { useState, useEffect, useRef } from 'react'
import { Bell, Heart, MessageCircle, MessageSquare, CalendarDays, BarChart3, Check, Trophy } from 'lucide-react'
import { supabase } from './supabaseClient'
import { L } from './i18n'
import { PLAYER_SIDE } from './flags'
import { SkeletonConvos } from './Skeleton'
import useFocusTrap from './useFocusTrap'
import useNotifications, { markAllRead, retryNotifications } from './notificationsStore'

const TYPE_ICON = {
  like: Heart,
  comment: MessageCircle,
  message: MessageSquare,
  event: CalendarDays,
  poll: BarChart3,
  // עולם המשחק — שידורי מערכת, בלי actor
  challenge_open: Trophy,
  challenge_lock: Trophy,
  challenge_decided: Trophy,
  submission_approved: Trophy,
  submission_rejected: Trophy,
  rank_changed: Trophy,
  award: Trophy,
}

// קיבוץ לפי יום — «היום» / «אתמול» / התאריך עצמו
function groupByDay(rows) {
  const dayKey = (ts) => new Date(ts).toDateString()
  const today = new Date().toDateString()
  const yest = new Date(Date.now() - 86400000).toDateString()
  const out = []
  for (const r of rows) {
    const key = dayKey(r.created_at)
    let g = out.find((x) => x.key === key)
    if (!g) {
      const label = key === today ? L('היום', 'Today')
        : key === yest ? L('אתמול', 'Yesterday')
        : new Date(r.created_at).toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })
      g = { key, label, rows: [] }
      out.push(g)
    }
    g.rows.push(r)
  }
  return out
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
  const { items, available, loading, failed } = useNotifications(myId)
  const [open, setOpen] = useState(false)
  // ה-ref של מלכודת הפוקוס משמש גם לזיהוי לחיצה מחוץ לפאנל
  const panelRef = useFocusTrap(open, () => setOpen(false))
  const btnRef = useRef(null)

  // סגירה בלחיצה בחוץ. Escape ומלכודת הפוקוס מגיעים מ-useFocusTrap שלמטה,
  // שמחזיר את הפוקוס לפעמון בסגירה — קודם הפוקוס ברח אל מאחורי הפאנל.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const unread = items.filter((n) => !n.read_at).length

  const openPanel = () => {
    const next = !open
    setOpen(next)
    // סימון הכול כנקרא — ה-badge נעלם, הפריטים עדיין מסומנים "חדש" בפאנל
    if (next && unread > 0) markAllRead()
  }

  const go = (n) => {
    setOpen(false)
    if (n.nav && onNavigate) onNavigate(n.nav)
  }

  // ⚠ התראה בלי actor אינה בהכרח «מאמן». שידורי המערכת (אתגר נפתח, מנצח
  // הוכרז, המקום שלך השתנה) נשלחים מהשרת עם actor_id ריק — ובלי הענף הזה
  // הן נקראו «מאמן האתגר השבועי נפתח», כלומר שם של אדם שלא עשה כלום.
  const SYSTEM_TYPES = /^(challenge_|submission_|round_|rank_|award)/
  const actorName = (n) => {
    if (n.actor) {
      return `${n.actor.first_name || ''} ${n.actor.last_name || ''}`.trim() || L('מאמן', 'A coach')
    }
    if (SYSTEM_TYPES.test(String(n.type || ''))) return 'CourtSide'
    return L('מאמן', 'A coach')
  }

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
        <div className="ntf-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={L('התראות', 'Notifications')}>
          <div className="ntf-head">
            <span>{L('התראות', 'Notifications')}</span>
            {items.length > 0 && (
              <span className="ntf-head-hint"><Check size={13} /> {L('הכול סומן כנקרא', 'All marked as read')}</span>
            )}
          </div>
          {loading ? (
            <SkeletonConvos count={4} />
          ) : failed ? (
            <div className="ntf-empty-state">
              <span className="ntf-empty-ic"><Bell size={22} /></span>
              <strong>{L('לא הצלחנו לטעון התראות', "Couldn't load notifications")}</strong>
              <button type="button" className="btn-soft" onClick={retryNotifications}>{L('נסה שוב', 'Try again')}</button>
            </div>
          ) : items.length === 0 ? (
            <div className="ntf-empty-state">
              <span className="ntf-empty-ic"><Bell size={22} /></span>
              <strong>{L('שקט לגמרי', 'All quiet')}</strong>
              <p className="ntf-empty">{L('כשמישהו יגיב, יסמן לייק או ישלח לך הודעה — זה יופיע כאן.', 'When someone replies, likes or messages you — it lands here.')}</p>
            </div>
          ) : (
            /* מקובץ לפי יום: 30 שורות רצופות בלי חלוקה הן קיר, לא רשימה */
            groupByDay(items).map((group) => (
              <div key={group.key} className="ntf-group">
                <span className="ntf-group-lbl">{group.label}</span>
                <ul className="ntf-list">
                  {group.rows.map((n) => {
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
              </div>
            ))
          )}

          {/* «מה נשאר בפנים» — האפליקציה לא שולחת התראות דחיפה, וכדאי
              שזה ייאמר במפורש במקום שהמשתמש יחכה להן. */}
          <details className="ntf-about">
            <summary>{L('מה מגיע לכאן?', 'What shows up here?')}</summary>
            <p>
              {PLAYER_SIDE
                ? L('הודעות ממאמנים ומשחקנים, תגובות ולייקים בקהילת המאמנים, אירועים שנפתחו, ומשימות שנשלחו אליך. הכול נשאר בתוך האפליקציה — אין התראות דחיפה לטלפון, ואף אחת מההתראות לא נשלחת במייל.',
                    'Messages from coaches and players, community comments and likes, new events, and tasks sent to you. Everything stays inside the app — there are no phone push notifications, and none of this is emailed.')
                : L('הודעות ממאמנים, תגובות ולייקים בקהילת המאמנים ואירועים שנפתחו. הכול נשאר בתוך האפליקציה — אין התראות דחיפה לטלפון, ואף אחת מההתראות לא נשלחת במייל.',
                    'Messages from coaches, community comments and likes, and new events. Everything stays inside the app — there are no phone push notifications, and none of this is emailed.')}
            </p>
          </details>
        </div>
      )}
    </div>
  )
}
