import { toast } from './toast'
import { useState, useEffect } from 'react'
import { MessagesSquare } from 'lucide-react'
import { supabase } from './supabaseClient'
import ChatWindow from './ChatWindow'
import { L } from './i18n'

// צ'אט קבוצתי — פיד משותף לכל המאמנים.
// props:
//   session - המשתמש המחובר
export default function CommunityChat({ session }) {
  const myId = session.user.id
  const [messages, setMessages] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('community_messages')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      setError(L("שגיאה בטעינת הצ'אט: ", 'Failed to load chat: ') + error.message)
      setLoading(false)
      return
    }

    const msgs = data || []
    setMessages(msgs)
    setError(null)

    // מושכים בנפרד את שמות הכותבים
    const ids = [...new Set(msgs.map((m) => m.user_id))]
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', ids)
      const map = {}
      for (const p of profs || []) map[p.id] = p
      setProfilesById(map)
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const nameOf = (id) => {
    const p = profilesById[id]
    if (!p) return L('מאמן', 'Coach')
    return `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('מאמן', 'Coach')
  }

  const sendMessage = async (text) => {
    setSending(true)
    const { error } = await supabase
      .from('community_messages')
      .insert({ user_id: myId, content: text })
    setSending(false)
    if (error) {
      toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + error.message)
      return false
    }
    load()
    return true
  }

  const remove = async (id) => {
    if (!window.confirm(L('למחוק את ההודעה?', 'Delete this message?'))) return
    const { error } = await supabase
      .from('community_messages')
      .delete()
      .eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Failed to delete: ') + error.message)
      return
    }
    toast.success(L('ההודעה נמחקה', 'Message deleted'))
    load()
  }

  const norm = messages.map((m) => ({
    id: m.id,
    content: m.content,
    created_at: m.created_at,
    senderId: m.user_id,
    senderName: nameOf(m.user_id),
  }))

  return (
    <>
      <p className="muted small" style={{ marginTop: 8, marginBottom: 12 }}>
        {L("צ'אט פתוח לכל המאמנים — שאלות, טיפים ושיתוף.", 'Open chat for all coaches — questions, tips and sharing.')}
      </p>
      <ChatWindow
        messages={norm}
        myId={myId}
        onSend={sendMessage}
        onDelete={remove}
        sending={sending}
        loading={loading}
        error={error}
        showAuthor
        empty={
          <div className="empty-state">
            <span className="empty-ic">
              <MessagesSquare size={26} />
            </span>
            <div className="empty-title">{L("עדיין אין הודעות בצ'אט", 'No messages in the chat yet')}</div>
            <p className="muted small">{L('כתוב את ההודעה הראשונה לקהילת המאמנים.', 'Write the first message to the coaching community.')}</p>
          </div>
        }
      />
    </>
  )
}
