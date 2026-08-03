import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L } from './i18n'
import { sendNotification } from './notify'
import Avatar from './Avatar'
import ChatWindow from './ChatWindow'

const coachName = (c) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || L('המאמן', 'Coach') : L('המאמן', 'Coach')

const MSG_LIMIT = 200 // ההודעות האחרונות בשיחה

// צ'אט אישי בין השחקן למאמן שלו (טבלת messages הקיימת — DM).
// props: session, coach {id, first_name, last_name, avatar_url, club}
export default function CoachChat({ session, coach }) {
  const myId = session.user.id
  const coachId = coach?.id
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const nameRef = useRef({})

  const load = useCallback(async ({ silent } = {}) => {
    if (!coachId) { setLoading(false); return }
    if (!silent) setLoading(true)
    // ascending:false + limit מחזיר את ההודעות ה*אחרונות* — עם ascending:true
    // ה-limit חתך את 500 הראשונות, וכל הודעה חדשה פשוט לא הופיעה יותר.
    // הסינון לשיחה נעשה כבר במסד, אחרת ה-limit היה מתמלא בשיחות אחרות.
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, content, read_at, created_at')
      .or(`and(sender_id.eq.${myId},recipient_id.eq.${coachId}),and(sender_id.eq.${coachId},recipient_id.eq.${myId})`)
      .order('created_at', { ascending: false })
      .limit(MSG_LIMIT)
    const thread = (data || []).filter(
      (m) => (m.sender_id === myId && m.recipient_id === coachId) ||
             (m.sender_id === coachId && m.recipient_id === myId)
    ).reverse() // חזרה לסדר כרונולוגי לתצוגה
    setMsgs(thread)
    setLoading(false)
    // סימון הודעות המאמן כנקראו
    const unread = thread.filter((m) => m.sender_id === coachId && !m.read_at).map((m) => m.id)
    if (unread.length) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread)
    }
  }, [myId, coachId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!coachId) return
    let ch = null
    // INSERT מצרף את השורה מה-payload במקום לשלוף את כל השיחה מחדש;
    // שאר האירועים (מחיקה/סימון נקרא) נדירים ולכן טעינה שקטה מספיקה.
    const onInsert = (row) => {
      if (!row) return false
      const mine = (row.sender_id === myId && row.recipient_id === coachId) ||
                   (row.sender_id === coachId && row.recipient_id === myId)
      if (!mine) return true // שיחה של מישהו אחר — מתעלמים לגמרי
      setMsgs((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row].slice(-MSG_LIMIT)))
      return true
    }
    try {
      ch = supabase.channel('coach-chat-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => {
          if (p.eventType === 'INSERT' && onInsert(p.new)) return
          load({ silent: true })
        })
        .subscribe()
    } catch { /* polling covers */ }
    // פולינג רק כשהטאב גלוי — אין טעם לשרוף סוללה ו-egress ברקע
    const poll = () => { if (document.visibilityState === 'visible') load({ silent: true }) }
    const t = setInterval(poll, 30000)
    const onVis = () => { if (document.visibilityState === 'visible') load({ silent: true }) }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); if (ch) supabase.removeChannel(ch) }
  }, [load, coachId, myId])

  const send = async (text) => {
    setSending(true)
    const { error } = await supabase.from('messages').insert({ sender_id: myId, recipient_id: coachId, content: text })
    setSending(false)
    if (error) { toast.error(L('השליחה נכשלה', 'Failed to send')); return false }
    sendNotification({ to: coachId, actor: myId, type: 'message', content: L('שלח לך הודעה', 'sent you a message'), nav: 'messages' })
    load({ silent: true })
    return true
  }

  const remove = async (id) => {
    await supabase.from('messages').delete().eq('id', id)
    load({ silent: true })
  }

  const norm = msgs.map((m) => ({
    id: m.id, content: m.content, created_at: m.created_at,
    senderId: m.sender_id, senderName: m.sender_id === myId ? L('אני', 'Me') : coachName(coach),
  }))

  return (
    <div className="pl-screen pl-chat-screen">
      <div className="pl-chat-head">
        <Avatar name={coachName(coach)} url={coach?.avatar_url} size={42} />
        <div>
          <h2 className="pl-h2" style={{ margin: 0 }}>{coachName(coach)}</h2>
          <span className="muted small">{L('המאמן שלך', 'Your coach')}{coach?.club ? ` · ${coach.club}` : ''}</span>
        </div>
      </div>
      <div className="pl-chat-box">
        <ChatWindow
          messages={norm}
          myId={myId}
          onSend={send}
          onDelete={remove}
          sending={sending}
          loading={loading}
          empty={(
            <div className="empty-state">
              <span className="empty-ic"><MessageSquare size={26} /></span>
              <div className="empty-title">{L('כתבו למאמן', 'Message your coach')}</div>
              <p className="muted small">{L('שאלה? צריכים עזרה עם תרגיל? כתבו כאן.', 'A question? Need help with a drill? Write here.')}</p>
            </div>
          )}
        />
      </div>
    </div>
  )
}
