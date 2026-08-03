import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, MessageSquareHeart, Megaphone, Volume2 } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import ChatWindow from './ChatWindow'

const MSG_LIMIT = 200 // ההודעות האחרונות בחדר

// צ'אט קבוצתי — חדר אחד לכל קבוצה (מאמן + שחקנים מאושרים).
// props: session, coachId, team, isCoach
export default function TeamChat({ session, coachId, team, isCoach }) {
  const myId = session.user.id
  const [messages, setMessages] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [notReady, setNotReady] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false) // תקלת טעינה != צ׳אט ריק
  const [announceOnly, setAnnounceOnly] = useState(false)
  const namesRef = useRef({})

  const loadAnnounce = useCallback(async () => {
    const { data } = await supabase.from('team_join_codes').select('chat_announce_only').eq('coach_id', coachId).eq('team', team).maybeSingle()
    setAnnounceOnly(!!data?.chat_announce_only)
  }, [coachId, team])

  // השלמת שמות למשתמשים שעוד לא ראינו (משותף לטעינה ולצירוף מ-realtime)
  const fillNames = useCallback(async (ids) => {
    const missing = [...new Set(ids)].filter((id) => id && !namesRef.current[id])
    if (!missing.length) return
    const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name, role').in('id', missing)
    const next = { ...namesRef.current }
    for (const p of profs || []) next[p.id] = { name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('חבר', 'Member'), role: p.role }
    namesRef.current = next; setNames(next)
  }, [])

  const load = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true)
    // ascending:false + limit = ההודעות ה*אחרונות*. עם ascending:true ה-limit
    // חתך את 500 הראשונות, וברגע שהחדר עבר אותן חדשות פשוט הפסיקו להופיע.
    const { data, error } = await supabase
      .from('team_messages')
      .select('id, coach_id, team, user_id, content, kind, created_at')
      .eq('coach_id', coachId).eq('team', team)
      .order('created_at', { ascending: false })
      .limit(MSG_LIMIT)
    if (error) {
      if (error.code === '42P01') setNotReady(true)
      // תקלת רשת החזירה עד עכשיו צ׳אט ריק בשקט — נראה כאילו כל ההודעות נעלמו
      else { setLoadFailed(true); toast.error(L('טעינת הצ׳אט נכשלה — בדוק חיבור', 'Failed to load the chat — check your connection')) }
      setLoading(false); return
    }
    setLoadFailed(false)
    const msgs = (data || []).reverse() // חזרה לסדר כרונולוגי לתצוגה
    setMessages(msgs)
    await fillNames(msgs.map((m) => m.user_id))
    setLoading(false)
  }, [coachId, team, fillNames])

  useEffect(() => { load(); loadAnnounce() }, [load, loadAnnounce])
  useEffect(() => {
    if (notReady) return
    let ch = null
    try {
      ch = supabase.channel(`team-messages-${coachId}-${team}`)
        // INSERT מצרף את השורה מה-payload; מחיקה/עדכון נדירים ולכן טעינה שקטה
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, (p) => {
          const row = p.new
          if (p.eventType === 'INSERT' && row?.id) {
            if (row.coach_id !== coachId || row.team !== team) return // חדר של קבוצה אחרת
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row].slice(-MSG_LIMIT)))
            fillNames([row.user_id])
            return
          }
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
  }, [load, notReady, coachId, team, fillNames])

  const send = async (text) => {
    setSending(true)
    const { error } = await supabase.from('team_messages').insert({ coach_id: coachId, team, content: text })
    setSending(false)
    if (error) { toast.error(announceOnly && !isCoach ? L('רק המאמן יכול לכתוב עכשיו', 'Only the coach can post right now') : L('שליחת ההודעה נכשלה', 'Failed to send')); return false }
    load({ silent: true }); return true
  }
  const remove = async (id) => { await supabase.from('team_messages').delete().eq('id', id); load({ silent: true }) }

  const toggleAnnounce = async () => {
    const next = !announceOnly
    setAnnounceOnly(next)
    const { error } = await supabase.from('team_join_codes').update({ chat_announce_only: next }).eq('coach_id', coachId).eq('team', team)
    if (error) { setAnnounceOnly(!next); toast.error(L('העדכון נכשל', 'Update failed')); return }
    toast.success(next ? L('מצב "רק מאמן כותב" הופעל', 'Announcement mode on') : L('הצ׳אט פתוח לכולם', 'Chat open to all'))
  }

  if (notReady) {
    return (
      <div className="pl-screen">
        <h2 className="pl-h2">{L('צ׳אט הקבוצה', 'Team chat')}</h2>
        <div className="empty-state">
          <span className="empty-ic"><Users size={26} /></span>
          <div className="empty-title">{L('הצ׳אט כמעט מוכן', 'Chat is almost ready')}</div>
          <p className="muted small">{L('צריך להריץ פעם אחת את supabase_team_chat.sql ב-Supabase.', 'Run supabase_team_chat.sql once in Supabase.')}</p>
        </div>
      </div>
    )
  }

  if (loadFailed && messages.length === 0) {
    return (
      <div className="pl-screen">
        <h2 className="pl-h2">{L('צ׳אט הקבוצה', 'Team chat')}</h2>
        <div className="empty-state" role="alert">
          <span className="empty-ic"><Users size={26} /></span>
          <div className="empty-title">{L('לא הצלחנו לטעון את הצ׳אט', 'Could not load the chat')}</div>
          <p className="muted small">{L('ההודעות לא נמחקו — זו תקלת טעינה.', 'No messages were deleted — this is a loading error.')}</p>
          <button type="button" className="btn-primary" onClick={() => load()}>{L('נסה שוב', 'Try again')}</button>
        </div>
      </div>
    )
  }

  const norm = messages.map((m) => {
    const info = names[m.user_id]
    return {
      id: m.id, content: m.content, created_at: m.created_at, senderId: m.user_id,
      senderName: (m.user_id === coachId ? `🏀 ${info?.name || L('המאמן', 'Coach')}` : (info?.name || L('שחקן', 'Player'))),
    }
  })
  const playerBlocked = announceOnly && !isCoach

  return (
    <div className="pl-screen pl-chat-screen">
      <div className="pl-chat-head">
        <span className="pl-chat-badge"><Users size={18} /></span>
        <div style={{ flex: 1 }}>
          <h2 className="pl-h2" style={{ margin: 0 }}>{L('צ׳אט הקבוצה', 'Team chat')} · {trTeam(team)}</h2>
          <span className="muted small">{L('כל הקבוצה + המאמן במקום אחד', 'The whole team + coach in one place')}</span>
        </div>
        {isCoach && (
          <button className={announceOnly ? 'tc-announce on' : 'tc-announce'} onClick={toggleAnnounce} title={L('רק מאמן כותב', 'Only coach posts')}>
            {announceOnly ? <Megaphone size={15} /> : <Volume2 size={15} />}
            {announceOnly ? L('רק מאמן כותב', 'Coach-only') : L('פתוח', 'Open')}
          </button>
        )}
      </div>
      <div className="pl-chat-box">
        <ChatWindow
          messages={norm}
          myId={myId}
          onSend={send}
          onDelete={remove}
          sending={sending}
          loading={loading}
          showAuthor
          readOnly={playerBlocked}
          readOnlyNote={L('המאמן הפעיל מצב "רק מאמן כותב" 📣', 'The coach turned on announcement mode 📣')}
          empty={(
            <div className="empty-state">
              <span className="empty-ic"><MessageSquareHeart size={26} /></span>
              <div className="empty-title">{L('אין עדיין הודעות', 'No messages yet')}</div>
              <p className="muted small">{isCoach ? L('כתוב הודעה ראשונה לקבוצה 👋', 'Post the first message to your team 👋') : L('אמרו שלום לקבוצה 👋', 'Say hi to the team 👋')}</p>
            </div>
          )}
        />
      </div>
    </div>
  )
}
