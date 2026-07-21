import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, MessageSquareHeart } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L } from './i18n'
import ChatWindow from './ChatWindow'

// צ'אט קהילת השחקנים — חדר אחד משותף לכל השחקנים.
// משתמש בטבלת player_messages (RLS: שחקנים בלבד). נופל בעדינות אם הטבלה עוד לא קיימת.
export default function PlayerCommunity({ session, profile }) {
  const myId = session.user.id
  const [messages, setMessages] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [notReady, setNotReady] = useState(false)
  const namesRef = useRef({})

  const load = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true)
    const { data, error: err } = await supabase
      .from('player_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(500)
    if (err) {
      // 42P01 = הטבלה עוד לא נוצרה במסד
      if (err.code === '42P01') setNotReady(true)
      else setError(L('טעינת הצ׳אט נכשלה', 'Failed to load chat'))
      setLoading(false)
      return
    }
    const msgs = data || []
    setMessages(msgs)
    const missing = [...new Set(msgs.map((m) => m.user_id))].filter((id) => !namesRef.current[id])
    if (missing.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', missing)
      const next = { ...namesRef.current }
      for (const p of profs || []) next[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('שחקן', 'Player')
      namesRef.current = next
      setNames(next)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // realtime + נפילה לפולינג כל 30 שנ'
  useEffect(() => {
    if (notReady) return
    let channel = null
    try {
      channel = supabase
        .channel('player-messages-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'player_messages' }, () => load({ silent: true }))
        .subscribe()
    } catch { /* realtime לא זמין — הפולינג מכסה */ }
    const t = setInterval(() => load({ silent: true }), 30000)
    return () => { clearInterval(t); if (channel) supabase.removeChannel(channel) }
  }, [load, notReady])

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
