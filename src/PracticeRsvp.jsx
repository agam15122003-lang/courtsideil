// PracticeRsvp — רצועת «אישורי הגעה לאימון הקרוב» בתחתית ה-hero של בית המאמן.
// מסך 3a במסמך המסירה: «14 מתוך 16 אישרו · 2 טרם ענו» + «תזכורת ל-2».
//
// שני עקרונות שקובעים את המימוש:
// 1. **היעדר שורה = טרם ענה.** אין מצב 'pending' בטבלה; המונה הוא
//    (סגל מקושר) פחות (מי שהגיב). ראה supabase_practice_rsvp.sql.
// 2. **הטבלה עשויה לא להיות קיימת** אם הבעלים טרם הריץ את ה-SQL —
//    במקרה כזה הרכיב נעלם בשקט, כמו שאר הרכיבים הצדדיים בפרויקט.

import { useEffect, useState } from 'react'
import { CheckCheck, BellRing } from 'lucide-react'
import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import { toast } from './toast'
import { L } from './i18n'

export default function PracticeRsvp({ session, practice }) {
  const [state, setState] = useState(null) // { total, yes, pending:[{id,name}] }
  const [sending, setSending] = useState(false)

  const coachId = session?.user?.id
  const sessionId = practice?.session_id
  const team = practice?.team

  useEffect(() => {
    let alive = true
    if (!coachId || !sessionId || !team) { setState(null); return }

    ;(async () => {
      // הסגל: רק שחקנים עם חשבון מקושר יכולים לאשר
      const roster = await supabase
        .from('team_players')
        .select('player_id, name')
        .eq('coach_id', coachId)
        .eq('team', team)
        .not('player_id', 'is', null)
      if (!alive) return
      if (roster.error || !roster.data?.length) { setState(null); return }

      // select('*') — בטוח גם אם עמודת reason (supabase_todo_31_7.sql) טרם נוספה
      const replies = await supabase
        .from('practice_rsvp')
        .select('*')
        .eq('session_id', sessionId)
      // הטבלה טרם נוצרה — הרצועה פשוט לא מוצגת
      if (!alive || replies.error) { setState(null); return }

      const byPlayer = new Map((replies.data || []).map((r) => [r.player_id, r.response]))
      const nameOf = new Map(roster.data.map((p) => [p.player_id, p.name]))
      const pending = roster.data.filter((p) => !byPlayer.has(p.player_id))
      setState({
        total: roster.data.length,
        yes: (replies.data || []).filter((r) => r.response === 'yes').length,
        pending,
        // §6 — מי שלא מגיע, עם הסיבה שכתב (אם כתב)
        no: (replies.data || [])
          .filter((r) => r.response === 'no')
          .map((r) => ({ name: nameOf.get(r.player_id) || L('שחקן', 'Player'), reason: r.reason || null })),
      })
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
      <span className="cs-rsvp-tx">
        <b>{L('אישורי הגעה לאימון הקרוב', 'Attendance confirmations for the next practice')}</b>
        <span>
          <bdi dir="ltr">{state.yes}</bdi> {L('מתוך', 'of')} <bdi dir="ltr">{state.total}</bdi> {L('אישרו', 'confirmed')}
          {state.pending.length > 0 && (
            <> · <bdi dir="ltr">{state.pending.length}</bdi> {L('טרם ענו', 'have not replied')}</>
          )}
        </span>
      </span>
      {state.pending.length > 0 && (
        <button type="button" className="cs-rsvp-btn" onClick={remind} disabled={sending}>
          <BellRing size={14} aria-hidden="true" />
          {sending
            ? L('שולח...', 'Sending...')
            : <>{L('תזכורת ל-', 'Remind ')}<bdi dir="ltr">{state.pending.length}</bdi></>}
        </button>
      )}
      {/* §6 — מי הודיע שלא מגיע, והסיבה שכתב */}
      {state.no?.length > 0 && (
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
