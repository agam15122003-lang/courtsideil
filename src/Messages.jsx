import { toast } from './toast'
import { useState, useEffect } from 'react'
import { ChevronRight, MessageSquare, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from './supabaseClient'
import CommunityChat from './CommunityChat'
import ChatWindow from './ChatWindow'
import Avatar from './Avatar'
import Modal from './ui/Modal'
import Button from './ui/Button'
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
export default function Messages({ session }) {
  const myId = session.user.id
  const [mode, setMode] = useState('private') // 'private' | 'community'
  const [messages, setMessages] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [activeCoachId, setActiveCoachId] = useState(null)
  const [sending, setSending] = useState(false)
  const [confirmDelMsg, setConfirmDelMsg] = useState(null) // id הודעה למחיקה (החליף את window.confirm)
  const [deleting, setDeleting] = useState(false)

  // refresh=true — הרשימה הקיימת נשארת על המסך (בלי "קריעה" לשלדים), רק חיווי עדין
  async function loadMessages(refresh = false) {
    refresh ? setRefreshing(true) : setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      setError(L('שגיאה בטעינת ההודעות: ', 'Failed to load messages: ') + error.message)
      setLoading(false)
      setRefreshing(false)
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
    setRefreshing(false)
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
      loadMessages(true)
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
      return
    }
    toast.success(L('ההודעה נשלחה', 'Message sent'))
    loadMessages(true)
  }

  // מחיקה בפועל — אחרי אישור במודאל (החליף את window.confirm)
  const confirmDeleteMsg = async () => {
    if (!confirmDelMsg) return
    setDeleting(true)
    const { error } = await supabase.from('messages').delete().eq('id', confirmDelMsg)
    setDeleting(false)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Failed to delete: ') + error.message)
      return
    }
    setConfirmDelMsg(null)
    toast.success(L('ההודעה נמחקה', 'Message deleted'))
    loadMessages(true)
  }

  // מודאל אישור המחיקה — מרונדר גם במסך הרשימה וגם בתוך שיחה פתוחה
  const deleteConfirmModal = (
    <Modal
      open={!!confirmDelMsg}
      onClose={() => setConfirmDelMsg(null)}
      title={L('מחיקת הודעה', 'Delete message')}
      size="sm"
      footer={
        <>
          <Button variant="danger" loading={deleting} onClick={confirmDeleteMsg}>
            <Trash2 size={15} /> {L('מחיקה', 'Delete')}
          </Button>
          <Button variant="ghost" disabled={deleting} onClick={() => setConfirmDelMsg(null)}>{L('ביטול', 'Cancel')}</Button>
        </>
      }
    >
      <p className="confirm-del-text">
        {L('למחוק את ההודעה?', 'Delete this message?')}
        <br />
        <span className="muted small">{L('אי אפשר לבטל את הפעולה.', 'This action cannot be undone.')}</span>
      </p>
    </Modal>
  )

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
      <>
      <ChatWindow
        messages={threadMsgs}
        myId={myId}
        onSend={sendMessage}
        onDelete={(id) => setConfirmDelMsg(id)}
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
      {deleteConfirmModal}
      </>
    )
  }

  // ---------- מסך ראשי: מתג + תוכן ----------
  return (
    <div className="welcome-card">
      <div className="welcome-badge">{L('הודעות', 'Messages')}</div>

      <div className="tabs" style={{ marginTop: 12 }}>
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
            <button
              className="btn-ghost library-add"
              onClick={() => loadMessages(true)}
              disabled={refreshing}
              aria-busy={refreshing || undefined}
            >
              <RefreshCw size={15} className={refreshing ? 'spin-ic' : undefined} /> {L('רענון', 'Refresh')}
            </button>
          </div>

          <div className="finder-results">
            {loading ? (
              <SkeletonCards count={3} />
            ) : error ? (
              <div className="alert alert-error msgs-error" role="alert">
                <span>{error}</span>
                <Button variant="ghost" onClick={() => loadMessages()}>{L('נסה שוב', 'Try again')}</Button>
              </div>
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
                    <span className="msg-time" dir="ltr">{formatTime(c.lastMessage.created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
      {deleteConfirmModal}
    </div>
  )
}
