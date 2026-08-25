import { toast } from './toast'
import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Search, Users2, RotateCw } from 'lucide-react'
import { ChevronBack } from './DirIcon'
import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import ChatWindow from './ChatWindow'
import Avatar from './Avatar'
import TeamChat from './TeamChat'
import { SkeletonConvos } from './Skeleton'
import { L, trTeam } from './i18n'
import { PLAYER_SIDE } from './flags'
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

const MSG_COLS = 'id, sender_id, recipient_id, content, read_at, created_at'
// ההודעות האחרונות בתיבה לכל סבב גילוי (בלי גבול נשלפה כל התיבה כל 30 שנ')
const MSG_LIMIT = 300
// ההודעות האחרונות *בתוך* שיחה פתוחה — נשלפות בשאילתה ייעודית משלה, כדי
// ששיחה שנפתחה לא תוכל להיות ריקה רק מפני שהתיבה עמוסה בשיחה אחרת.
const THREAD_LIMIT = 200
// סבבי גילוי שיחות: 300 ההודעות האחרונות בתיבה יכולות להיות כולן משיחה
// אחת עמוסה, וכך 19 שיחות אחרות נעלמו לגמרי מהרשימה. כל סבב נוסף שולף את
// ההודעות האחרונות של בני-שיח שעוד לא התגלו, ולכן שיחה ישנה עדיין מגיעה
// לרשימה. בפועל הסבב השני כבר מחזיר מעט שורות והשלישי אפס.
const CONV_PASSES = 3
const CONV_PEERS_MAX = 150 // מעבר לזה ה-URL של סבב הגילוי ארוך מדי — עוצרים

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
//   onRead - (אופציונלי) כמה הודעות נקראו זה עתה, לעדכון הבאדג׳ במעטפת
export default function Messages({ session, profile, onNavigate, onRead }) {
  const myId = session.user.id
  const myTeams = profile?.age_groups || []
  const [tab, setTab] = useState('personal') // 'personal' | 'team'
  const [chatTeam, setChatTeam] = useState(myTeams[0] || '')
  const [messages, setMessages] = useState([]) // רק לבניית רשימת השיחות
  const [thread, setThread] = useState([]) // ההודעות של השיחה הפתוחה
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState(null)
  const [threadTick, setThreadTick] = useState(0) // רענון יזום של השיחה הפתוחה
  const [listTruncated, setListTruncated] = useState(false) // נגמרו סבבי הגילוי
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCoachId, setActiveCoachId] = useState(null)
  const [sending, setSending] = useState(false)
  const [convSearch, setConvSearch] = useState('')
  const profilesRef = useRef({})
  // ה-handler של ה-Realtime נרשם פעם אחת ולכן הוא לא רואה state מתעדכן —
  // השיחה הפתוחה נקראת דרך ref.
  const activeCoachIdRef = useRef(null)
  activeCoachIdRef.current = activeCoachId
  // שיחה שהמשתמש פתח *במכוון* וממתינה לסימון «נקרא» ברגע שההיסטוריה שלה
  // תיטען. פתיחה אוטומטית בדסקטופ לא מסמנת נקרא, ולכן זה לא קורה בטעינה.
  const markReadRef = useRef(null)
  // איזו שיחה כבר טעונה ב-thread — כדי להבדיל בין «מעבר לשיחה» (שלד טעינה)
  // לבין רענון תקופתי של אותה שיחה (בשקט).
  const threadCoachRef = useRef(null)

  // משלים פרופילים רק למי שעוד לא ראינו — קודם נשלפו כל הפרופילים מחדש
  // בכל טעינה (וטעינה רצה כל 30 שנ' וגם בכל INSERT של מישהו אחר).
  async function fillProfiles(ids) {
    const missing = [...new Set(ids)].filter((id) => id && !profilesRef.current[id])
    if (!missing.length) return
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, club, role, position')
      .in('id', missing)
    const next = { ...profilesRef.current }
    for (const p of profs || []) next[p.id] = p
    profilesRef.current = next
    setProfilesById(next)
  }

  // מצרף שורת הודעה בודדת (מ-realtime או מהתשובה של insert) בלי שליפה מלאה
  function appendMessage(row) {
    if (!row?.id) return
    if (row.sender_id !== myId && row.recipient_id !== myId) return // שיחה של אחרים
    const peer = row.sender_id === myId ? row.recipient_id : row.sender_id
    // אין כאן slice: הרשימה נבנית משלושה סבבי גילוי, וחיתוך ל-300 האחרונות
    // היה מוחק שוב את השיחות הישנות שהסבבים בדיוק הביאו. הגודל ממילא מתאפס
    // בכל poll (loadMessages מחליף את המערך).
    setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
    // אותה שורה חייבת להיכנס גם לשיחה הפתוחה, אחרת היא לא תופיע בצ׳אט
    if (peer === activeCoachIdRef.current) {
      setThread((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row].slice(-THREAD_LIMIT)))
    }
    fillProfiles([peer])
  }

  async function loadMessages(opts = {}) {
    if (!opts.silent) setLoading(true)
    // ascending:false + limit = ההודעות ה*אחרונות*; בלי limit בכלל נשלפה כל
    // תיבת הדואר בכל poll. ההיפוך מחזיר לסדר כרונולוגי שכל המסך מניח.
    // סבב הגילוי הנוסף מוציא מהחשבון את בני-השיח שכבר נמצאו, ולכן שיחה
    // שההודעה האחרונה בה ישנה מ-300 ההודעות האחרונות עדיין מגיעה לרשימה.
    const rows = []
    const peers = new Set()
    let truncated = false

    for (let pass = 0; pass < CONV_PASSES; pass++) {
      // התיבה שלי בלבד — מפורשות. מדיניות messages_admin_read מאפשרת לאדמין
      // לקרוא את כל הטבלה, ובלי הסינון הזה רשימת השיחות שלו הייתה מתמלאת
      // בשיחות של אחרים (וגם סבבי הגילוי היו מתבזבזים עליהן).
      let q = supabase.from('messages').select(MSG_COLS).or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
      if (pass > 0) {
        // הודעה ששלחתי לעצמי תיתן peer === myId; אסור להוציא את עצמי מהסינון
        const ids = [...peers].filter((id) => id && id !== myId)
        if (!ids.length || ids.length > CONV_PEERS_MAX) { truncated = ids.length > CONV_PEERS_MAX; break }
        // מזהי UUID בלבד (מגיעים מהמסד) — אין כאן קלט משתמש להרכבת המחרוזת
        const list = `(${ids.join(',')})`
        q = q.not('sender_id', 'in', list).not('recipient_id', 'in', list)
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(MSG_LIMIT)

      if (error) {
        if (pass > 0) break // סבב הגילוי נכשל — נשארים עם מה שכבר נאסף
        if (!opts.silent) {
          setError(L('שגיאה בטעינת ההודעות: ', 'Failed to load messages: ') + error.message)
          setLoading(false)
        }
        return
      }

      // רשת ביטחון בלקוח, בדיוק כמו ב-CoachChat: שורה שאינה שלי לא תיכנס
      const raw = data || []
      const page = raw.filter((m) => m.sender_id === myId || m.recipient_id === myId)
      rows.push(...page)
      for (const m of page) peers.add(m.sender_id === myId ? m.recipient_id : m.sender_id)
      // עמוד לא מלא = הגענו לסוף מה שיש להביא בסבב הזה (נבדק על מה שהמסד
      // החזיר, לא על מה ששרד את הסינון, אחרת נעצור באמצע בטעות)
      if (raw.length < MSG_LIMIT) { truncated = false; break }
      truncated = true // אם ייגמרו הסבבים — ייתכן שנשארו שיחות ישנות יותר
    }

    // הסבבים מחזירים כל אחד מהחדש לישן; ממיינים הכול לסדר כרונולוגי אחד
    const msgs = rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    setMessages(msgs)
    setListTruncated(truncated)
    setError(null)

    await fillProfiles(msgs.map((m) => (m.sender_id === myId ? m.recipient_id : m.sender_id)))

    if (!opts.silent) setLoading(false)
  }

  useEffect(() => {
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- השיחה הפתוחה נשלפת בשאילתה משלה ----
  // קודם היא סוננה מתוך אותן 300 הודעות של כל התיבה, ולכן פתיחת שיחה ישנה
  // (למשל מתוך התראה) הציגה צ׳אט ריק למרות שההודעות קיימות במסד.
  useEffect(() => {
    if (!activeCoachId) {
      threadCoachRef.current = null
      setThread([])
      setThreadError(null)
      return undefined
    }
    // רענון תקופתי של אותה שיחה לא מציג שלד טעינה ולא מרוקן את הצ׳אט —
    // רק מעבר לשיחה אחרת עושה זאת.
    const switched = threadCoachRef.current !== activeCoachId
    threadCoachRef.current = activeCoachId
    let alive = true
    if (switched) {
      setThread([])
      setThreadError(null)
      setThreadLoading(true)
    }
    ;(async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(MSG_COLS)
        .or(`and(sender_id.eq.${myId},recipient_id.eq.${activeCoachId}),and(sender_id.eq.${activeCoachId},recipient_id.eq.${myId})`)
        .order('created_at', { ascending: false })
        .limit(THREAD_LIMIT)
      if (!alive) return
      setThreadLoading(false)
      if (error) {
        // רענון שקט שנכשל לא מוחק שיחה שכבר מוצגת
        if (switched) setThreadError(L('שגיאה בטעינת השיחה: ', 'Failed to load the conversation: ') + error.message)
        return
      }
      const rows = (data || []).reverse()
      setThread(rows)
      setThreadError(null)
      // סימון «נקרא» ממתין לכאן: רק אז ידועות גם ההודעות הישנות שלא נקראו
      if (markReadRef.current === activeCoachId) {
        markReadRef.current = null
        markThreadRead(activeCoachId, rows)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCoachId, myId, threadTick])

  // זמן-אמת: הודעה חדשה מופיעה ברגע שנשלחה (Realtime); polling איטי כגיבוי.
  // ה-INSERT מצרף את השורה מה-payload במקום לטעון מחדש את כל התיבה, וה-polling
  // עוצר כשהטאב ברקע.
  useEffect(() => {
    let channel = null
    try {
      channel = supabase
        .channel('messages-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (p) => appendMessage(p.new)
        )
        .subscribe()
    } catch { /* realtime לא זמין — ה-polling מכסה */ }
    // עד היום השיחה הפתוחה התרעננה «בחינם» כי היא סוננה מתוך התיבה. עכשיו
    // היא שאילתה נפרדת, ולכן ה-poll חייב לרענן גם אותה (רק כשהיא פתוחה).
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      loadMessages({ silent: true })
      if (activeCoachIdRef.current) setThreadTick((n) => n + 1)
    }
    const t = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', refresh)
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
    // עם צד שחקן סגור כל השיחות הן בין מאמנים; התווית «שחקן» רק בלבלה
    if (PLAYER_SIDE && p.role === 'player') {
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
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    // פעם אחת בלבד: בלי השמירה הזו «חזרה לכל ההודעות» בדסקטופ פתח מיד
    // מחדש את השיחה האחרונה, ורשימת השיחות לא הייתה נגישה שם בכלל.
    if (autoOpenedRef.current || activeCoachId || conversations.length === 0) return
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    autoOpenedRef.current = true
    setActiveCoachId(conversations[0].coachId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCoachId, conversations.length])

  // סימון «נקרא» לפי ההודעות שנשלפו לשיחה עצמה (ולא לפי מה שנכנס לרשימה)
  async function markThreadRead(coachId, rows) {
    const unreadIds = rows
      .filter((m) => m.sender_id === coachId && m.recipient_id === myId && !m.read_at)
      .map((m) => m.id)
    if (!unreadIds.length) return
    const readAt = new Date().toISOString()
    const { error } = await supabase.from('messages').update({ read_at: readAt }).in('id', unreadIds)
    if (error) return
    // עדכון מקומי בשני ה-stateים במקום שליפה מלאה רק בשביל דגל «נקרא»
    const ids = new Set(unreadIds)
    const patch = (list) => list.map((m) => (ids.has(m.id) ? { ...m, read_at: readAt } : m))
    setThread(patch)
    setMessages(patch)
    // מדווחים למעטפת כמה ירדו — אחרת הבאדג׳ בניווט נשאר על המספר הישן
    // עד מעבר מסך או עד ה-poll הבא
    onRead?.(unreadIds.length)
  }

  const openConversation = (coachId) => {
    if (coachId === activeCoachId) {
      // אותה שיחה כבר פתוחה — ה-effect לא ירוץ שוב, מסמנים ישירות
      markThreadRead(coachId, thread)
      return
    }
    markReadRef.current = coachId
    setActiveCoachId(coachId)
  }

  const sendMessage = async (text) => {
    setSending(true)
    const { data, error } = await supabase.from('messages').insert({
      sender_id: myId,
      recipient_id: activeCoachId,
      content: text,
    }).select(MSG_COLS).maybeSingle()
    setSending(false)
    if (error) {
      toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + error.message)
      return false
    }
    if (data) appendMessage(data)
    sendNotification({
      to: activeCoachId,
      actor: myId,
      type: 'message',
      content: L('שלח לך הודעה פרטית', 'sent you a private message'),
      nav: 'messages',
    })
    if (!data) {
      // ה-insert לא החזיר שורה (RLS על select) — מרעננים גם את השיחה עצמה,
      // אחרת ההודעה שנשלחה לא תופיע בצ׳אט עד רענון הבא
      loadMessages({ silent: true })
      setThreadTick((n) => n + 1)
    }
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
    // הסרה מקומית בשני ה-stateים במקום שליפה מלאה. בלי ההסרה מהרשימה
    // התצוגה המקדימה של השיחה הייתה נשארת על הודעה שכבר לא קיימת.
    const drop = (list) => list.filter((m) => m.id !== id)
    setMessages(drop)
    setThread(drop)
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
        {/* h2 ולא h1: הבאנר («השיחות שלי») הוא הכותרת הראשית של המסך */}
        <h2 className="sr-only">{L('שיחה פרטית', 'Private chat')}</h2>
        <div className="msg-split-chat">
          <ChatWindow
            key={activeCoachId}
            messages={threadMsgs}
            myId={myId}
            onSend={sendMessage}
            onDelete={deleteMessage}
            sending={sending}
            loading={threadLoading}
            error={threadError}
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
                  <ChevronBack size={20} />
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
      {/* מסך 7a: מסילת טאבים אחת מתחת לבאנר — אישי (עם מונה) והקבוצה.
          צד המאמן בלבד: צ׳אט הקבוצה הוא עם השחקנים — אין אותם, אין טאב. */}
      {PLAYER_SIDE && (
      <div className="tabs msg-tabs">
        <button className={tab === 'personal' ? 'tab active' : 'tab'} onClick={() => setTab('personal')}>
          <MessageSquare size={15} aria-hidden="true" /> {L('אישי', 'Direct')}
          {unreadTotal > 0 && <span className="tab-badge">{unreadTotal}</span>}
        </button>
        <button className={tab === 'team' ? 'tab active' : 'tab'} onClick={() => setTab('team')}>
          <Users2 size={15} aria-hidden="true" /> {L('הקבוצה', 'Team')}
        </button>
      </div>
      )}

      {PLAYER_SIDE && tab === 'team' ? (
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
              placeholder={PLAYER_SIDE ? L('חיפוש מאמן או שחקן...', 'Search coach or player...') : L('חיפוש מאמן...', 'Search coach...')}
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
                  {/* היה כתוב טאב «מאמנים» — שם שלא קיים בניווט. היעד האמיתי
                      הוא «חיפוש מאמנים», בדיוק מה שהכפתור שמתחת פותח. */}
                  {L('כדי לשלוח הודעה — היכנסו ל"חיפוש מאמנים", פתחו פרופיל של מאמן ולחצו "שליחת הודעה".', 'To send a message — go to "Find Coaches", open a coach profile and tap "Send message".')}
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
            {/* שקיפות: אם גם אחרי סבבי הגילוי נשארו הודעות שלא נשלפו, אומרים
                זאת במפורש במקום להציג רשימה חתוכה כאילו היא מלאה */}
            {!loading && !error && listTruncated && conversations.length > 0 && (
              <p className="muted small" style={{ textAlign: 'center', marginTop: 10 }}>
                {L('ייתכן שיש שיחות ישנות יותר שעדיין לא נטענו — רעננו כדי לנסות שוב.', 'There may be older conversations not loaded yet — refresh to try again.')}
              </p>
            )}
          </div>
      </>
      )}
    </div>
  )
}
