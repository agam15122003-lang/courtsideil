import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, MessageSquareHeart } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L } from './i18n'
import ChatWindow from './ChatWindow'

// צ'אט קהילת השחקנים — חדר אחד משותף לכל השחקנים.
// משתמש בטבלת player_messages (RLS: שחקנים בלבד). נופל בעדינות אם הטבלה עוד לא קיימת.
const MSG_LIMIT = 200 // ההודעות האחרונות בחדר

export default function PlayerCommunity({ session, profile }) {
  const myId = session.user.id
  const [messages, setMessages] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [notReady, setNotReady] = useState(false)
  const namesRef = useRef({})

  // השלמת שמות למשתמשים שעוד לא ראינו (משותף לטעינה ולצירוף מ-realtime)
  const fillNames = useCallback(async (ids) => {
    const missing = [...new Set(ids)].filter((id) => id && !namesRef.current[id])
    if (!missing.length) return
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', missing)
    const next = { ...namesRef.current }
    for (const p of profs || []) next[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('שחקן', 'Player')
    namesRef.current = next
    setNames(next)
  }, [])

  const load = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true)
    // ascending:false + limit = ההודעות ה*אחרונות*. עם ascending:true ה-limit
    // חתך את 500 הראשונות, וברגע שהחדר עבר אותן חדשות פשוט הפסיקו להופיע.
    const { data, error: err } = await supabase
      .from('player_messages')
      .select('id, user_id, channel, content, created_at')
      .order('created_at', { ascending: false })
      .limit(MSG_LIMIT)
    if (err) {
      // 42P01 = הטבלה עוד לא נוצרה במסד
      if (err.code === '42P01') setNotReady(true)
      else setError(L('טעינת הצ׳אט נכשלה', 'Failed to load chat'))
      setLoading(false)
      return
    }
    setError(null)
    const msgs = (data || []).reverse() // חזרה לסדר כרונולוגי לתצוגה
    setMessages(msgs)
    await fillNames(msgs.map((m) => m.user_id))
    setLoading(false)
  }, [fillNames])

  useEffect(() => { load() }, [load])

  // realtime + נפילה לפולינג כל 30 שנ' (רק כשהטאב גלוי)
  useEffect(() => {
    if (notReady) return
    let channel = null
    try {
      channel = supabase
        .channel('player-messages-live')
        // מצרפים את השורה מה-payload במקום לשלוף את כל החדר מחדש
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'player_messages' }, (p) => {
          const row = p.new
          if (!row?.id) { load({ silent: true }); return }
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row].slice(-MSG_LIMIT)))
          fillNames([row.user_id])
        })
        .subscribe()
    } catch { /* realtime לא זמין — הפולינג מכסה */ }
    const poll = () => { if (document.visibilityState === 'visible') load({ silent: true }) }
    const t = setInterval(poll, 30000)
    const onVis = () => { if (document.visibilityState === 'visible') load({ silent: true }) }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); if (channel) supabase.removeChannel(channel) }
  }, [load, notReady, fillNames])

  const send = async (text) => {
    setSending(true)
    const { error: err } = await supabase
      .from('player_messages')
      .insert({ user_id: myId, content: text, channel: 'כללי' })
    setSending(false)
    if (err) {
      toast.error(L('שליחת ההודעה נכשלה', 'Failed to send message'))
      return false
    }
    load({ silent: true })
    return true
  }

  const remove = async (id) => {
    await supabase.from('player_messages').delete().eq('id', id)
    load({ silent: true })
  }

  if (notReady) {
    return (
      <div className="pl-screen">
        <h2 className="pl-h2">{L('קהילת השחקנים', 'Players community')}</h2>
        <div className="empty-state">
          <span className="empty-ic"><Users size={26} /></span>
          <div className="empty-title">{L('הצ׳אט כמעט מוכן', 'Chat is almost ready')}</div>
          <p className="muted small">{L('צריך להריץ פעם אחת את supabase_player_v2.sql ב-Supabase כדי להפעיל את קהילת השחקנים.', 'Run supabase_player_v2.sql once in Supabase to turn on the players community.')}</p>
        </div>
      </div>
    )
  }

  const norm = messages.map((m) => ({
    id: m.id,
    content: m.content,
    created_at: m.created_at,
    senderId: m.user_id,
    senderName: names[m.user_id] || (m.user_id === myId ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : L('שחקן', 'Player')),
  }))

  return (
    <div className="pl-screen pl-chat-screen">
      <div className="pl-chat-head">
        <span className="pl-chat-badge"><Users size={18} /></span>
        <div>
          <h2 className="pl-h2" style={{ margin: 0 }}>{L('קהילת השחקנים', 'Players community')}</h2>
          <span className="muted small">{L('דברו, שתפו טיפים והתרגלו יחד 🏀', 'Talk, share tips, and train together 🏀')}</span>
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
          error={error}
          showAuthor
          empty={(
            <div className="empty-state">
              <span className="empty-ic"><MessageSquareHeart size={26} /></span>
              <div className="empty-title">{L('היו הראשונים לכתוב', 'Be the first to post')}</div>
              <p className="muted small">{L('אמרו שלום לקהילה 👋', 'Say hi to the community 👋')}</p>
            </div>
          )}
        />
      </div>
    </div>
  )
}
