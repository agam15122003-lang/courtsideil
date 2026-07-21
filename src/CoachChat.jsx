import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L } from './i18n'
import { sendNotification } from './notify'
import Avatar from './Avatar'
import ChatWindow from './ChatWindow'

const coachName = (c) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || L('המאמן', 'Coach') : L('המאמן', 'Coach')

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
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(500)
    const thread = (data || []).filter(
      (m) => (m.sender_id === myId && m.recipient_id === coachId) ||
             (m.sender_id === coachId && m.recipient_id === myId)
    )
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
    try {
      ch = supabase.channel('coach-chat-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => load({ silent: true }))
        .subscribe()
    } catch { /* polling covers */ }
    const t = setInterval(() => load({ silent: true }), 30000)
    return () => { clearInterval(t); if (ch) supabase.removeChannel(ch) }
  }, [load, coachId])

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
