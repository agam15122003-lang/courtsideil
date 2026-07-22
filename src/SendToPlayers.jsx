import { useState, useEffect, useCallback } from 'react'
import {
  Send, Users, User, Dumbbell, ClipboardList, MonitorPlay, PencilLine,
  Search, Check, CalendarDays, Inbox,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { loadRoster, sendAssignments, loadSentFeed } from './sendToPlayers'
import Avatar from './Avatar'

const SOURCES = [
  { id: 'drill', label: ['תרגיל', 'Drill'], Icon: Dumbbell, tone: 'blue' },
  { id: 'plan', label: ['תוכנית', 'Plan'], Icon: ClipboardList, tone: 'purple' },
  { id: 'video', label: ['סרטון', 'Video'], Icon: MonitorPlay, tone: 'green' },
  { id: 'task', label: ['משימה חופשית', 'Free task'], Icon: PencilLine, tone: 'orange' },
]

export default function SendToPlayers({ session, embedded, initialTeam }) {
  const me = session.user.id
  const [roster, setRoster] = useState({ teams: [], players: [] })
  const [mode, setMode] = useState('team') // 'team' | 'players'
  const [team, setTeam] = useState('')
  const [picked, setPicked] = useState(new Set())
  const [pQuery, setPQuery] = useState('')

  const [source, setSource] = useState('drill')
  const [items, setItems] = useState({}) // {drill:[], plan:[], video:[]}
  const [contentId, setContentId] = useState(null) // selected drill/plan/video id
  const [taskTitle, setTaskTitle] = useState('')
  const [sQuery, setSQuery] = useState('')

  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [sending, setSending] = useState(false)
  const [feed, setFeed] = useState(null)

  const refreshFeed = useCallback(async (r) => {
    setFeed(await loadSentFeed(me, r))
  }, [me])

  useEffect(() => {
    ;(async () => {
      const r = await loadRoster(me)
      setRoster(r)
      // בקבוצות שלי — הקבוצה הפעילה נבחרת מראש
      setTeam(initialTeam && r.teams.includes(initialTeam) ? initialTeam : (r.teams[0] || ''))
      if (!embedded) refreshFeed(r)
    })()
  }, [me, refreshFeed])

  // טעינת רשימת המקור לפי הטאב (פעם אחת לכל סוג)
  useEffect(() => {
    if (source === 'task' || items[source]) return
    ;(async () => {
      let data = []
      if (source === 'drill') {
        const res = await supabase.from('drills').select('id, title, category').eq('created_by', me).order('created_at', { ascending: false }).limit(200)
        data = (res.data || []).map((d) => ({ id: d.id, title: d.title, sub: d.category }))
      } else if (source === 'plan') {
        const res = await supabase.from('training_plans').select('id, name').eq('created_by', me).order('created_at', { ascending: false }).limit(200)
        data = (res.data || []).map((p) => ({ id: p.id, title: p.name }))
      } else if (source === 'video') {
        const res = await supabase.from('drill_videos').select('id, title, category, url').eq('created_by', me).order('created_at', { ascending: false }).limit(200)
        data = (res.data || []).map((v) => ({ id: v.id, title: v.title, sub: v.category, url: v.url }))
      }
      setItems((cur) => ({ ...cur, [source]: data }))
    })()
  }, [source, items, me])

  const connectedInTeam = roster.players.filter((p) => p.team === team)
  const targetCount = mode === 'team' ? connectedInTeam.length : picked.size

  const chosenItem = source !== 'task' ? (items[source] || []).find((i) => i.id === contentId) : null
  const hasContent = source === 'task' ? taskTitle.trim().length > 0 : !!chosenItem
  const canSend = targetCount > 0 && hasContent && !sending

  const togglePick = (pid) => setPicked((cur) => { const n = new Set(cur); n.has(pid) ? n.delete(pid) : n.add(pid); return n })

  const buildContent = () => {
    if (source === 'task') return { kind: 'task', title: taskTitle.trim() }
    if (source === 'drill') return { kind: 'drill', drillId: chosenItem.id, title: chosenItem.title }
    if (source === 'plan') return { kind: 'plan', planId: chosenItem.id, title: chosenItem.title }
    if (source === 'video') return { kind: 'video', videoUrl: chosenItem.url, title: chosenItem.title }
    return {}
  }

  const doSend = async () => {
    if (!canSend) return
    setSending(true)
    const res = await sendAssignments({
      coachId: me, mode, team,
      players: roster.players.filter((p) => picked.has(p.player_id)),
      content: buildContent(), note: note.trim(), dueDate: dueDate || null,
    })
    setSending(false)
    if (!res.ok) { toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + res.error); return }
    toast.success(mode === 'team'
      ? L(`נשלח ל${trTeam(team)} (${res.count} שחקנים)`, `Sent to ${trTeam(team)} (${res.count} players)`)
      : L(`נשלח ל-${res.count} שחקנים`, `Sent to ${res.count} players`))
    setContentId(null); setTaskTitle(''); setNote(''); setDueDate(''); setPicked(new Set())
    refreshFeed(roster)
  }

  const noConnected = roster.players.length === 0

  return (
    <div className={embedded ? 'sp-page sp-embedded' : 'sp-page'}>
      {!embedded && (
        <header className="welcome-card page-header sp-hero">
          <div className="welcome-badge">{L('שליחה לשחקנים', 'Send to players')}</div>
          <h2>{L('שגר תרגול לקבוצה או לשחקן', 'Send training to a team or a player')}</h2>
          <p className="muted small">{L('תרגיל, תוכנית, סרטון או משימה — לכל הקבוצה או לשחקנים מסוימים, עם תאריך יעד.', 'A drill, plan, video or task — to the whole team or to specific players, with a due date.')}</p>
        </header>
      )}

      {noConnected ? (
        <div className="empty-state">
          <span className="empty-ic"><Users size={26} /></span>
          <div className="empty-title">{L('אין עדיין שחקנים מחוברים', 'No connected players yet')}</div>
          <p className="muted small">{L('שתפו את קוד ההצטרפות מטאב "הקבוצות שלי" — ברגע ששחקן מתחבר, אפשר לשלוח לו כאן.', 'Share the join code from "My Teams" — once a player connects, you can send to them here.')}</p>
        </div>
      ) : (
        <>
          {/* יעד */}
          <section className="sp-card">
            <h3 className="sp-h3"><Users size={16} /> {L('למי שולחים?', 'Send to whom?')}</h3>
            <div className="sp-seg">
              <button className={mode === 'team' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setMode('team')}><Users size={15} /> {L('כל הקבוצה', 'Whole team')}</button>
              <button className={mode === 'players' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setMode('players')}><User size={15} /> {L('שחקנים ספציפיים', 'Specific players')}</button>
            </div>

            {mode === 'team' ? (
              <div className="sp-chips">
                {roster.teams.map((tm) => (
                  <button key={tm} className={team === tm ? 'chip active' : 'chip'} onClick={() => setTeam(tm)}>
                    {trTeam(tm)} · {roster.players.filter((p) => p.team === tm).length}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="sp-search"><Search size={15} /><input className="finder-input" value={pQuery} onChange={(e) => setPQuery(e.target.value)} placeholder={L('חיפוש שחקן...', 'Search player...')} /></div>
                <ul className="sp-players">
                  {roster.players.filter((p) => !pQuery || p.name?.includes(pQuery)).map((p) => (
                    <li key={p.player_id}>
                      <button className={picked.has(p.player_id) ? 'sp-player on' : 'sp-player'} onClick={() => togglePick(p.player_id)}>
                        <span className="sp-check">{picked.has(p.player_id) ? <Check size={14} /> : null}</span>
                        {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={30} />}
                        <span className="sp-player-name">{p.name}</span>
                        <span className="muted small">{trTeam(p.team)}{p.position ? ` · ${p.position}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* מקור */}
          <section className="sp-card">
            <h3 className="sp-h3"><Send size={16} /> {L('מה שולחים?', 'What are you sending?')}</h3>
            <div className="sp-source-tabs">
              {SOURCES.map((s) => (
                <button key={s.id} className={source === s.id ? `sp-src active ${s.tone}` : 'sp-src'} onClick={() => { setSource(s.id); setContentId(null) }}>
                  <s.Icon size={16} /> {L(s.label[0], s.label[1])}
                </button>
              ))}
            </div>

            {source === 'task' ? (
              <input className="finder-input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={L('לדוגמה: 100 זריקות עונשין', 'e.g. 100 free throws')} maxLength={120} />
            ) : (
              <>
                <div className="sp-search"><Search size={15} /><input className="finder-input" value={sQuery} onChange={(e) => setSQuery(e.target.value)} placeholder={L('חיפוש...', 'Search...')} /></div>
                <ul className="sp-items">
                  {(items[source] || []).filter((i) => !sQuery || i.title?.includes(sQuery)).slice(0, 60).map((i) => (
                    <li key={i.id}>
                      <button className={contentId === i.id ? 'sp-item on' : 'sp-item'} onClick={() => setContentId(i.id)}>
                        <span className="sp-check">{contentId === i.id ? <Check size={14} /> : null}</span>
                        <span className="sp-item-title">{i.title}</span>
                        {i.sub && <span className="muted small">{i.sub}</span>}
                      </button>
                    </li>
                  ))}
                  {(items[source] || []).length === 0 && <p className="muted small" style={{ padding: '8px 2px' }}>{L('אין פריטים להצגה.', 'Nothing to show.')}</p>}
                </ul>
              </>
            )}
          </section>

          {/* אפשרויות */}
          <section className="sp-card">
            <div className="sp-opts">
              <label className="pf-label" style={{ flex: 1 }}>
                <span><CalendarDays size={14} /> {L('תאריך יעד (לא חובה)', 'Due date (optional)')}</span>
                <input type="date" className="finder-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            </div>
            <textarea className="finder-input sp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('הערה לשחקנים (לא חובה)', 'Note to players (optional)')} rows={2} maxLength={400} />
          </section>

          <button className="btn-primary sp-send" onClick={doSend} disabled={!canSend} aria-busy={sending}>
            {sending && <span className="btn-spinner" aria-hidden="true" />}
            <Send size={17} /> {targetCount > 0 ? L(`שלח ל-${targetCount} שחקנים`, `Send to ${targetCount} players`) : L('בחרו יעד', 'Pick a target')}
          </button>
        </>
      )}

      {/* מה שלחתי לאחרונה (במצב מוטמע — TeamAssignments מציג את המעקב) */}
      {!embedded && (
      <section className="sp-card sp-feed">
        <h3 className="sp-h3"><Inbox size={16} /> {L('מה שלחתי לאחרונה', 'Recently sent')}</h3>
        {feed === null ? (
          <div className="app-loading" style={{ padding: 20 }}><div className="loader" /></div>
        ) : feed.length === 0 ? (
          <p className="muted small">{L('עוד לא שלחת תרגולים.', 'You haven’t sent any training yet.')}</p>
        ) : (
          <ul className="sp-sent">
            {feed.map((f) => {
              const pct = f.total > 0 ? Math.round((f.done / f.total) * 100) : 0
              return (
                <li key={f.id} className="sp-sent-item">
                  <div className="sp-sent-main">
                    <strong>{f.title}</strong>
                    <span className="muted small">
                      {f.player_id ? L('לשחקן', 'To a player') : `${trTeam(f.team)}`}
                      {f.due_date ? ` · ${L('עד', 'by')} ${new Date(f.due_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}` : ''}
                    </span>
                  </div>
                  <span className={pct >= 100 ? 'sp-ratio done' : 'sp-ratio'}>
                    {f.player_id ? (f.done > 0 ? L('בוצע ✓', 'Done ✓') : L('ממתין', 'Pending')) : `${f.done}/${f.total} ✓`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      )}
    </div>
  )
}
