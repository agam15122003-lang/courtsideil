import { toast } from './toast'
import { useState, useEffect } from 'react'
import { ChevronRight, MessageSquare, Search, Users2, RotateCw } from 'lucide-react'
import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import ChatWindow from './ChatWindow'
import Avatar from './Avatar'
import TeamChat from './TeamChat'
import { SkeletonConvos } from './Skeleton'
import { L, trTeam } from './i18n'
import { confirmDialog } from './confirm'

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

// מסך ההודעות — מסך אחד עם שני טאבים, לפי מסך 7a במסמך המסירה
// («מסך אחד עם שני טאבים — אישי והקבוצה — במקום שני יעדים בניווט»):
//   אישי  — שיחות 1-על-1 עם מאמנים ושחקנים
//   הקבוצה — צ׳אט הקבוצה, שישב עד היום כטאב שביעי בתוך «הקבוצות שלי»
// הצ'אטים של הקהילה נשארים בעמוד הקהילה (פיד + ערוצים לפי קטגוריה).
// props:
//   session - המשתמש המחובר
//   profile - לשכבות הגיל שהמאמן מאמן (הטאב הקבוצתי)
export default function Messages({ session, profile, onNavigate }) {
  const myId = session.user.id
  const myTeams = profile?.age_groups || []
  const [tab, setTab] = useState('personal') // 'personal' | 'team'
  const [chatTeam, setChatTeam] = useState(myTeams[0] || '')
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
  // חיפוש חי — אותה רשימה מסוננת משרתת גם את הרשימה הראשית וגם את הפאנל
  // שליד הצ'אט הפתוח, כדי ששתיהן לא יתפצלו להתנהגויות שונות.
  const convQuery = convSearch.trim().toLowerCase()
  const visibleConvs = convQuery
    ? conversations.filter((c) => nameOf(c.coachId).toLowerCase().includes(convQuery))
    : conversations

  // במסך רחב הפריסה היא צ׳אט + רשימה זה לצד זה, אבל היא נראתה רק אחרי בחירת
  // שיחה — עד אז 60% מהמסך היו ריקים. בדסקטופ נפתחת השיחה העדכנית מעצמה.
  // לא מסמנים "נקרא" אוטומטית: הסימון נשאר לפעולה מכוונת של המשתמש.
  useEffect(() => {
    if (activeCoachId || conversations.length === 0) return
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    setActiveCoachId(conversations[0].coachId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCoachId, conversations.length])

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
    if (!(await confirmDialog({ message: L('למחוק את ההודעה? פעולה זו אינה הפיכה.', 'Delete this message? This cannot be undone.'), danger: true }))) return
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
        <h1 className="sr-only">{L('שיחות פרטיות', 'Private chats')}</h1>
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
          {visibleConvs.map((c) => (
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

  // ---------- מסך ראשי: שני טאבים + תוכן ----------
  const unreadTotal = conversations.reduce((n, c) => n + c.unread, 0)

  return (
    <div className="msg-screen">
      {/* מסך 7a: מסילת טאבים אחת מתחת לבאנר — אישי (עם מונה) והקבוצה */}
      <div className="tabs msg-tabs">
        <button className={tab === 'personal' ? 'tab active' : 'tab'} onClick={() => setTab('personal')}>
          <MessageSquare size={15} aria-hidden="true" /> {L('אישי', 'Direct')}
          {unreadTotal > 0 && <span className="tab-badge">{unreadTotal}</span>}
        </button>
        <button className={tab === 'team' ? 'tab active' : 'tab'} onClick={() => setTab('team')}>
          <Users2 size={15} aria-hidden="true" /> {L('הקבוצה', 'Team')}
        </button>
      </div>

      {tab === 'team' ? (
        myTeams.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ic"><Users2 size={26} /></span>
            <div className="empty-title">{L('עדיין לא הגדרת קבוצות', 'No teams yet')}</div>
            <p className="muted small">{L('הוסף את שכבות הגיל שאתה מאמן בפרופיל — וצ׳אט הקבוצה ייפתח כאן.', 'Add the age groups you coach in your profile — the team chat opens here.')}</p>
            {onNavigate && (
              <button type="button" className="btn-primary empty-cta" onClick={() => onNavigate('profile')}>
                {L('לעריכת הפרופיל', 'Edit profile')}
              </button>
            )}
          </div>
        ) : (
          <div className="msg-team">
            {myTeams.length > 1 && (
              <div className="chips msg-team-chips">
                {myTeams.map((tm) => (
                  <button key={tm} className={chatTeam === tm ? 'chip selected' : 'chip'} onClick={() => setChatTeam(tm)}>{trTeam(tm)}</button>
                ))}
              </div>
            )}
            <TeamChat key={chatTeam} session={session} coachId={myId} team={chatTeam} isCoach />
          </div>
        )
      ) : (
      <>
          <div className="msg-search-wrap msg-search-top">
            <Search size={16} aria-hidden="true" />
            <input
              className="finder-input msg-search"
              type="search"
              value={convSearch}
              onChange={(e) => setConvSearch(e.target.value)}
              placeholder={L('חיפוש מאמן או שחקן...', 'Search coach or player...')}
              aria-label={L('חיפוש שיחה', 'Search conversation')}
            />
            <button className="icon-btn" onClick={loadMessages} aria-label={L('רענון', 'Refresh')} title={L('רענון', 'Refresh')}>
              <RotateCw size={16} />
            </button>
          </div>

          <div className="finder-results">
            {loading ? (
              <SkeletonConvos count={5} />
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
            ) : visibleConvs.length === 0 ? (
              /* חיפוש בלי תוצאה אינו «אין הודעות» — ולכן גם היציאה ממנו שונה */
              <div className="empty-state">
                <span className="empty-ic"><Search size={26} /></span>
                <div className="empty-title">{L('אין שיחה שמתאימה לחיפוש', 'No conversation matches your search')}</div>
                <button type="button" className="btn-soft empty-cta" onClick={() => setConvSearch('')}>
                  {L('ניקוי החיפוש', 'Clear search')}
                </button>
              </div>
            ) : (
              visibleConvs.map((c) => (
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
                    <span className="msg-conv-role">{roleLabel(c.coachId)}</span>
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
