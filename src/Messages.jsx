import { toast } from './toast'
import { useState, useEffect } from 'react'
import { ChevronRight, MessageSquare, Search, Plus } from 'lucide-react'
import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
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

// טאב "הודעות" — שיחות פרטיות (1-על-1) בין מאמנים.
// הצ'אטים הקבוצתיים עברו לעמוד "קהילה" (פיד + ערוצים לפי קטגוריה).
// props:
//   session - המשתמש המחובר
export default function Messages({ session, onNavigate }) {
  const myId = session.user.id
  const [messages, setMessages] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCoachId, setActiveCoachId] = useState(null)
  const [sending, setSending] = useState(false)
  const [convSearch, setConvSearch] = useState('')

  async function loadMessages(opts = {}) {
    if (!opts.silent) setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      if (!opts.silent) {
        setError(L('שגיאה בטעינת ההודעות: ', 'Failed to load messages: ') + error.message)
        setLoading(false)
      }
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
        .select('id, first_name, last_name, club, role, position')
        .in('id', otherIds)
      const map = {}
      for (const p of profs || []) map[p.id] = p
      setProfilesById(map)
    }

    if (!opts.silent) setLoading(false)
  }

  useEffect(() => {
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // זמן-אמת: הודעה חדשה מופיעה ברגע שנשלחה (Realtime); polling איטי כגיבוי
  useEffect(() => {
    let channel = null
    try {
      channel = supabase
        .channel('messages-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          () => loadMessages({ silent: true })
        )
        .subscribe()
    } catch { /* realtime לא זמין — ה-polling מכסה */ }
    const t = setInterval(() => loadMessages({ silent: true }), 30000)
    return () => {
      clearInterval(t)
      if (channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nameOf = (otherId) => {
    const p = profilesById[otherId]
    if (!p) return L('משתתף', 'Member')
    return `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('משתתף', 'Member')
  }

  // תווית תפקיד לפי הצד השני בשיחה — שחקן מקבל "שחקן/עמדה", מאמן מקבל "מאמן/מועדון"
  const roleLabel = (otherId) => {
    const p = profilesById[otherId]
    if (!p) return L('משתתף', 'Member')
    if (p.role === 'player') {
      return L('שחקן', 'Player') + (p.position ? `, ${p.position}` : '')
    }
    return L('מאמן', 'Coach') + (p.club ? `, ${p.club}` : '')
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
    sendNotification({
      to: activeCoachId,
      actor: myId,
      type: 'message',
      content: L('שלח לך הודעה פרטית', 'sent you a private message'),
      nav: 'messages',
    })
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

  // ---------- תצוגת שיחה פרטית פתוחה — צ'אט + רשימת שיחות זו לצד זו (מסך היעד 07) ----------
  if (activeCoachId) {
    const threadMsgs = thread.map((m) => ({
      id: m.id,
      content: m.content,
      created_at: m.created_at,
      senderId: m.sender_id,
      senderName: nameOf(m.sender_id),
    }))
    return (
      <div className="msg-split">
        <div className="msg-split-chat">
          <ChatWindow
            key={activeCoachId}
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
                <span className="chat-header-text">
                  <h2 className="chat-title">{nameOf(activeCoachId)}</h2>
                  <span className="chat-status">
                    <span className="chat-status-dot" aria-hidden="true" />
                    {roleLabel(activeCoachId)}
                  </span>
                </span>
              </>
            }
          />
        </div>
        {/* רשימת השיחות — מוצגת לצד הצ'אט במסך רחב, נסתרת במובייל */}
        <aside className="msg-split-list">
          <div className="msg-search-wrap">
            <Search size={16} aria-hidden="true" />
            <input
              className="finder-input msg-search"
              type="search"
              value={convSearch}
              onChange={(e) => setConvSearch(e.target.value)}
              placeholder={L('חיפוש מאמן...', 'Search coach...')}
              aria-label={L('חיפוש שיחה', 'Search conversation')}
            />
          </div>
          {conversations
            .filter((c) => !convSearch.trim() || nameOf(c.coachId).toLowerCase().includes(convSearch.trim().toLowerCase()))
            .map((c) => (
            <button
              key={c.coachId}
              className={c.coachId === activeCoachId ? 'msg-conv active' : 'msg-conv'}
              onClick={() => openConversation(c.coachId)}
            >
              <Avatar name={nameOf(c.coachId)} size={40} />
              <span className="msg-conv-main">
                <span className="msg-conv-head">
                  <span className="msg-conv-name">{nameOf(c.coachId)}</span>
                  <span className="msg-time">{formatTime(c.lastMessage.created_at)}</span>
                </span>
                <span className="msg-conv-preview">{c.lastMessage.content}</span>
              </span>
              {c.unread > 0 && <span className="msg-unread">{c.unread}</span>}
            </button>
          ))}
        </aside>
      </div>
    )
  }

  // ---------- מסך ראשי: מתג + תוכן ----------
  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('הודעות', 'Messages')}</div>
          <h2>{L('שיחות פרטיות', 'Private chats')}</h2>
          <p className="page-desc">{L('שיחות אישיות עם מאמנים. לצ׳אטים הקבוצתיים — עמוד הקהילה.', 'Personal conversations with coaches. For group chats — see the Community page.')}</p>
        </div>
        {onNavigate && (
          <div className="page-header-actions">
            {/* [23] נקודת כניסה קבועה לשיחה חדשה */}
            <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => onNavigate('finder')}>
              <Plus size={16} aria-hidden="true" /> {L('שיחה חדשה', 'New chat')}
            </button>
            {/* [27] נוחת ישירות על טאב הצ'אטים בקהילה */}
            <button className="btn-soft" onClick={() => onNavigate('community-chats')}>
              {L('לצ׳אטים של הקהילה', 'Community chats')}
            </button>
          </div>
        )}
      </header>

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
                {onNavigate && (
                  <button type="button" className="btn-primary empty-cta" onClick={() => onNavigate('finder')}>
                    {L('למציאת מאמנים', 'Find coaches')}
                  </button>
                )}
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
    </div>
  )
}
