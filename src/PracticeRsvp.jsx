// PracticeRsvp — רצועת «אישורי הגעה לאימון הקרוב» בתחתית ה-hero של בית המאמן.
// מסך 3a במסמך המסירה: «14 מתוך 16 אישרו · 2 טרם ענו» + «תזכורת ל-2».
//
// שני עקרונות שקובעים את המימוש:
// 1. **היעדר שורה = טרם ענה.** אין מצב 'pending' בטבלה; המונה הוא
//    (סגל מקושר) פחות (מי שהגיב). ראה supabase_practice_rsvp.sql.
// 2. **הטבלה עשויה לא להיות קיימת** אם הבעלים טרם הריץ את ה-SQL —
//    במקרה כזה הרכיב נעלם בשקט, כמו שאר הרכיבים הצדדיים בפרויקט.

import { useEffect, useState } from 'react'
import { CheckCheck, BellRing, Check, X, HelpCircle } from 'lucide-react'
import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import { toast } from './toast'
import { L } from './i18n'

// שליפת מצב אישורי ההגעה לאימון — משותפת לרצועת הבית ולפירוט בלו"ז.
// מחזירה null אם אין סגל מקושר או שהטבלה טרם נוצרה (הקוד סובלני ל-SQL שטרם רץ).
export async function loadRsvpState(coachId, team, sessionId) {
  if (!coachId || !sessionId || !team) return null
  // הסגל: רק שחקנים עם חשבון מקושר יכולים לאשר
  const roster = await supabase
    .from('team_players')
    .select('player_id, name')
    .eq('coach_id', coachId)
    .eq('team', team)
    .not('player_id', 'is', null)
  if (roster.error || !roster.data?.length) return null

  // select('*') — בטוח גם אם עמודת reason (supabase_todo_31_7.sql) טרם נוספה
  const replies = await supabase
    .from('practice_rsvp')
    .select('*')
    .eq('session_id', sessionId)
  if (replies.error) return null

  const byPlayer = new Map((replies.data || []).map((r) => [r.player_id, r.response]))
  const nameOf = new Map(roster.data.map((p) => [p.player_id, p.name]))
  return {
    total: roster.data.length,
    yes: (replies.data || []).filter((r) => r.response === 'yes').length,
    yesNames: (replies.data || [])
      .filter((r) => r.response === 'yes')
      .map((r) => nameOf.get(r.player_id) || L('שחקן', 'Player')),
    pending: roster.data.filter((p) => !byPlayer.has(p.player_id)),
    // §6 — מי שלא מגיע, עם הסיבה שכתב (אם כתב)
    no: (replies.data || [])
      .filter((r) => r.response === 'no')
      .map((r) => ({ name: nameOf.get(r.player_id) || L('שחקן', 'Player'), reason: r.reason || null })),
  }
}

// שלוש הרשימות — אישרו / לא מגיעים / טרם ענו (1.3)
export function RsvpLists({ state }) {
  if (!state) return null
  const groups = [
    { Icon: Check, cls: 'yes', label: L('אישרו', 'Confirmed'), items: state.yesNames.map((n) => ({ name: n })) },
    { Icon: X, cls: 'no', label: L('לא מגיעים', 'Not coming'), items: state.no },
    { Icon: HelpCircle, cls: 'pending', label: L('טרם ענו', 'No reply yet'), items: state.pending },
  ]
  return (
    <div className="rsvp-lists">
      {groups.map((g) => (
        <div key={g.cls} className={'rsvp-group ' + g.cls}>
          <b><g.Icon size={13} aria-hidden="true" /> {g.label} · <bdi dir="ltr">{g.items.length}</bdi></b>
          {g.items.length > 0 && (
            <ul>
              {g.items.map((p, i) => (
                <li key={i}>
                  {p.name}
                  {p.reason && <> — <span className="cs-rsvp-reason">{p.reason}</span></>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

// פירוט אישורי הגעה לאימון בודד — נטען בפאנל האימון בלו"ז (1.3)
export function RsvpBreakdown({ coachId, team, sessionId }) {
  const [state, setState] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await loadRsvpState(coachId, team, sessionId)
      if (alive) setState(s)
    })()
    return () => { alive = false }
  }, [coachId, team, sessionId])
  if (!state) return null
  return (
    <div className="rsvp-breakdown">
      <b className="rsvp-breakdown-hd">
        <CheckCheck size={14} aria-hidden="true" /> {L('אישורי הגעה', 'Attendance confirmations')} ·{' '}
        <bdi dir="ltr">{state.yes}/{state.total}</bdi>
      </b>
      <RsvpLists state={state} />
    </div>
  )
}

export default function PracticeRsvp({ session, practice }) {
  const [state, setState] = useState(null) // { total, yes, yesNames, pending, no }
  const [sending, setSending] = useState(false)
  const [showLists, setShowLists] = useState(false) // שמות בלחיצה (1.3)

  const coachId = session?.user?.id
  const sessionId = practice?.session_id
  const team = practice?.team

  useEffect(() => {
    let alive = true
    if (!coachId || !sessionId || !team) { setState(null); return }
    ;(async () => {
      const s = await loadRsvpState(coachId, team, sessionId)
      if (alive) setState(s)
    })()
    return () => { alive = false }
  }, [coachId, sessionId, team])

  if (!state) return null

  const remind = async () => {
    setSending(true)
    await Promise.all(
      state.pending.map((p) =>
        sendNotification({
          to: p.player_id,
          actor: coachId,
          type: 'event',
          content: L('תזכורת: לאשר הגעה לאימון הקרוב', 'Reminder: confirm your attendance for the next practice'),
          nav: 'schedule',
        }),
      ),
    )
    setSending(false)
    toast.success(L('התזכורת נשלחה', 'Reminder sent'))
  }

  return (
    <div className="cs-rsvp">
      <span className="cs-rsvp-ic" aria-hidden="true"><CheckCheck size={18} /></span>
      {/* 1.3 — לחיצה על המונה פותחת את שלוש הרשימות עם השמות */}
      <button
        type="button"
        className="cs-rsvp-tx cs-rsvp-toggle"
        onClick={() => setShowLists((v) => !v)}
        aria-expanded={showLists}
      >
        <b>{L('אישורי הגעה לאימון הקרוב', 'Attendance confirmations for the next practice')}</b>
        <span>
          <bdi dir="ltr">{state.yes}</bdi> {L('מתוך', 'of')} <bdi dir="ltr">{state.total}</bdi> {L('אישרו', 'confirmed')}
          {state.pending.length > 0 && (
            <> · <bdi dir="ltr">{state.pending.length}</bdi> {L('טרם ענו', 'have not replied')}</>
          )}
          {' · '}{showLists ? L('הסתרת שמות', 'hide names') : L('מי ענה?', 'who replied?')}
        </span>
      </button>
      {state.pending.length > 0 && (
        <button type="button" className="cs-rsvp-btn" onClick={remind} disabled={sending}>
          <BellRing size={14} aria-hidden="true" />
          {sending
            ? L('שולח...', 'Sending...')
            : <>{L('תזכורת ל-', 'Remind ')}<bdi dir="ltr">{state.pending.length}</bdi></>}
        </button>
      )}
      {showLists && <RsvpLists state={state} />}
      {/* §6 — מי הודיע שלא מגיע, והסיבה שכתב — מוצג תמיד, גם כשהרשימות סגורות */}
      {!showLists && state.no?.length > 0 && (
        <ul className="cs-rsvp-nolist">
          {state.no.map((p, i) => (
            <li key={i}>
              <b>{p.name}</b> {L('לא מגיע', 'not coming')}
              {p.reason && <> — <span className="cs-rsvp-reason">{p.reason}</span></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
