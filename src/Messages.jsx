import { toast } from './toast'
import { useState, useEffect } from 'react'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { supabase } from './supabaseClient'
import CommunityChat from './CommunityChat'
import ChatWindow from './ChatWindow'
import Avatar from './Avatar'
import { SkeletonCards } from './Skeleton'
import { L } from './i18n'

// בונה רשימת שיחות מקובצות לפי המאמן השני בשיחה
function buildConversations(messages, myId) {
  const map = new Map()
  for (const m of messages) {
    const iAmSender = m.sender_id === myId
    const coachId = iAmSender ? m.recipient_id : m.sender_id
    if (!map.has(coachId)) {
      map.set(coachId, { coachId, lastMessage: m, unread: 0 })
    }
    const conv = map.get(coachId)
    conv.lastMessage = m // ההודעות ממוינות מהישן לחדש, אז האחרון גובר
    if (!iAmSender && !m.read_at) conv.unread += 1
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)
  )
}

function formatTime(ts) {
  return new Date(ts).toLocaleString(L('he-IL', 'en-US'), {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// טאב "הודעות" — מתג בין שיחות פרטיות (1-על-1) לבין צ'אט קבוצתי.
// props:
//   session - המשתמש המחובר
export default function Messages({ session, onNavigate }) {
  const myId = session.user.id
  const [mode, setMode] = useState('private') // 'private' | 'community'
  const [messages, setMessages] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCoachId, setActiveCoachId] = useState(null)
  const [sending, setSending] = useState(false)

  async function loadMessages() {
    setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      setError(L('שגיאה בטעינת ההודעות: ', 'Failed to load messages: ') + error.message)
      setLoading(false)
      return
    }

    const msgs = data || []
    setMessages(msgs)
    setError(null)

    const otherIds = [
      ...new Set(
        msgs.map((m) => (m.sender_id === myId ? m.recipient_id : m.sender_id))
      ),
    ]
    if (otherIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', otherIds)
      const map = {}
      for (const p of profs || []) map[p.id] = p
      setProfilesById(map)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nameOf = (coachId) => {
    const p = profilesById[coachId]
    if (!p) return L('מאמן', 'Coach')
    return `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('מאמן', 'Coach')
  }

  const conversations = buildConversations(messages, myId)

  const thread = activeCoachId
    ? messages.filter(
        (m) =>
          (m.sender_id === myId && m.recipient_id === activeCoachId) ||
          (m.sender_id === activeCoachId && m.recipient_id === myId)
      )
    : []

  const openConversation = async (coachId) => {
    setActiveCoachId(coachId)
    const unreadIds = messages
      .filter((m) => m.sender_id === coachId && m.recipient_id === myId && !m.read_at)
      .map((m) => m.id)
    if (unreadIds.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds)
      loadMessages()
    }
  }

  const sendMessage = async (text) => {
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      sender_id: myId,
      recipient_id: activeCoachId,
      content: text,
    })
    setSending(false)
    if (error) {
      toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + error.message)
      return false
    }
    loadMessages()
    return true
  }

  const deleteMessage = async (id) => {
    if (!window.confirm(L('למחוק את ההודעה? פעולה זו אינה הפיכה.', 'Delete this message? This cannot be undone.'))) return
    const { data, error } = await supabase.from('messages').delete().eq('id', id).select('id')
    if (error || !data || data.length === 0) {
      toast.error(L('המחיקה נכשלה — נסה שוב', 'Failed to delete — try again'))
      return
    }
    toast.success(L('ההודעה נמחקה', 'Message deleted'))
    loadMessages()
  }

  // ---------- תצוגת שיחה פרטית פתוחה ----------
  if (activeCoachId) {
    const threadMsgs = thread.map((m) => ({
      id: m.id,
      content: m.content,
      created_at: m.created_at,
      senderId: m.sender_id,
      senderName: nameOf(m.sender_id),
    }))
    return (
      <ChatWindow
        messages={threadMsgs}
        myId={myId}
        onSend={sendMessage}
        onDelete={deleteMessage}
        sending={sending}
        loading={false}
        error={null}
        empty={
          <p className="muted" style={{ textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
            {L('אין הודעות עדיין — כתוב את הראשונה', 'No messages yet — write the first one')}
          </p>
        }
        header={
          <>
            <button
              type="button"
              className="chat-back"
              onClick={() => setActiveCoachId(null)}
              aria-label={L('חזרה לכל ההודעות', 'Back to all messages')}
              title={L('חזרה', 'Back')}
            >
              <ChevronRight size={20} />
            </button>
            <Avatar name={nameOf(activeCoachId)} size={38} />
            <h2 className="chat-title">{nameOf(activeCoachId)}</h2>
          </>
        }
      />
    )
  }

  // ---------- מסך ראשי: מתג + תוכן ----------
  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('הודעות', 'Messages')}</div>
          <h2>{L('הודעות ושיחות', 'Messages & chats')}</h2>
          <p className="page-desc">{L('שיחות אישיות עם מאמנים וצ׳אט קבוצתי פתוח לכל הקהילה.', 'Private conversations with coaches and an open group chat for the whole community.')}</p>
        </div>
      </header>

      <div className="tabs">
        <button
          className={mode === 'private' ? 'tab active' : 'tab'}
          onClick={() => setMode('private')}
        >
          {L('שיחות פרטיות', 'Private chats')}
        </button>
        <button
          className={mode === 'community' ? 'tab active' : 'tab'}
          onClick={() => setMode('community')}
        >
          {L("צ'אט קבוצתי", 'Group chat')}
        </button>
      </div>

      {mode === 'community' ? (
        <CommunityChat session={session} />
      ) : (
        <>
          <div className="library-header">
            <h2 style={{ marginBottom: 0 }}>{L('השיחות שלי', 'My chats')}</h2>
            <button className="btn-ghost library-add" onClick={loadMessages}>
              {L('רענון', 'Refresh')}
            </button>
          </div>

          <div className="finder-results">
            {loading ? (
              <SkeletonCards count={3} />
            ) : error ? (
              <div className="alert alert-error">{error}</div>
            ) : conversations.length === 0 ? (
              <div className="empty-state">
                <span className="empty-ic">
                  <MessageSquare size={26} />
                </span>
                <div className="empty-title">{L('אין לך הודעות עדיין', "You don't have any messages yet")}</div>
                <p className="muted small">
                  {L('כדי לשלוח הודעה — היכנס לטאב "מאמנים", פתח פרופיל של מאמן ולחץ "שלח הודעה".', 'To send a message — go to the "Coaches" tab, open a coach profile and tap "Send message".')}
                </p>
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.coachId}
                  className="msg-conv"
                  onClick={() => openConversation(c.coachId)}
                >
                  <Avatar name={nameOf(c.coachId)} size={46} />
                  <div className="msg-conv-main">
                    <div className="msg-conv-head">
                      <span className="msg-conv-name">{nameOf(c.coachId)}</span>
                      {c.unread > 0 && <span className="msg-unread">{c.unread}</span>}
                    </div>
                    <span className="msg-conv-preview">
                      {c.lastMessage.sender_id === myId ? L('אני: ', 'Me: ') : ''}
                      {c.lastMessage.content}
                    </span>
                    <span className="msg-time">{formatTime(c.lastMessage.created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
