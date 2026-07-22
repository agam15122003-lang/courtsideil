import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, MessageSquareHeart, Megaphone, Volume2 } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import ChatWindow from './ChatWindow'

// צ'אט קבוצתי — חדר אחד לכל קבוצה (מאמן + שחקנים מאושרים).
// props: session, coachId, team, isCoach
export default function TeamChat({ session, coachId, team, isCoach }) {
  const myId = session.user.id
  const [messages, setMessages] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [notReady, setNotReady] = useState(false)
  const [announceOnly, setAnnounceOnly] = useState(false)
  const namesRef = useRef({})

  const loadAnnounce = useCallback(async () => {
    const { data } = await supabase.from('team_join_codes').select('chat_announce_only').eq('coach_id', coachId).eq('team', team).maybeSingle()
    setAnnounceOnly(!!data?.chat_announce_only)
  }, [coachId, team])

  const load = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('team_messages')
      .select('*')
      .eq('coach_id', coachId).eq('team', team)
      .order('created_at', { ascending: true })
      .limit(500)
    if (error) { if (error.code === '42P01') setNotReady(true); setLoading(false); return }
    const msgs = data || []
    setMessages(msgs)
    const missing = [...new Set(msgs.map((m) => m.user_id))].filter((id) => !namesRef.current[id])
    if (missing.length) {
      const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name, role').in('id', missing)
      const next = { ...namesRef.current }
      for (const p of profs || []) next[p.id] = { name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('חבר', 'Member'), role: p.role }
      namesRef.current = next; setNames(next)
    }
    setLoading(false)
  }, [coachId, team])

  useEffect(() => { load(); loadAnnounce() }, [load, loadAnnounce])
  useEffect(() => {
    if (notReady) return
    let ch = null
    try {
      ch = supabase.channel(`team-messages-${coachId}-${team}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => load({ silent: true }))
        .subscribe()
    } catch { /* polling covers */ }
    const t = setInterval(() => load({ silent: true }), 30000)
    return () => { clearInterval(t); if (ch) supabase.removeChannel(ch) }
  }, [load, notReady, coachId, team])

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
