import { useState, useEffect, useCallback } from 'react'
import { Dumbbell, ChevronDown, Check, Clock, Inbox } from 'lucide-react'
import { supabase } from './supabaseClient'
import { L, trTeam } from './i18n'
import Avatar from './Avatar'
import { SkeletonCards } from './Skeleton'
import { ErrorState } from './states'

// סקירת מטלות/שיגורים לקבוצה — מה נשלח ומי ביצע. (מאמן, בטאב "מטלות")
export default function TeamAssignments({ coachId, team }) {
  const [roster, setRoster] = useState([])
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    const { data: rp } = await supabase
      .from('team_players')
      .select('id, name, number, player_id')
      .eq('coach_id', coachId).eq('team', team).order('number')
    const players = (rp || []).filter((p) => p.player_id) // מחוברים בלבד
    setRoster(players)
    const authIds = new Set(players.map((p) => p.player_id))

    const { data: asg, error: asgErr } = await supabase
      .from('player_assignments')
      .select('*, drill:drills(title), plan:training_plans(name)')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .limit(80)
    // כשל שליפה אינו «אין מטלות»: בלי ההפרדה הזו תקלת רשת הציגה בדיוק
    // את מצב הריק «עדיין לא שלחת מטלות לקבוצה הזו».
    if (asgErr) { setFailed(true); setItems([]); return }
    setFailed(false)
    const mine = (asg || []).filter((a) => a.team === team || authIds.has(a.player_id))
    if (mine.length === 0) { setItems([]); return }

    // בוצע = done_at מלא; שורה בלי done_at = התקדמות חלקית. fallback אם המיגרציה טרם רצה.
    let { data: compl, error } = await supabase
      .from('assignment_completions')
      .select('assignment_id, player_id, done_at, progress_value')
      .in('assignment_id', mine.map((a) => a.id))
    if (error) {
      const legacy = await supabase.from('assignment_completions')
        .select('assignment_id, player_id, done_at').in('assignment_id', mine.map((a) => a.id))
      compl = (legacy.data || []).map((c) => ({ ...c, progress_value: 0 }))
    }
    const doneBy = {}
    const progBy = {} // assignment_id -> { player_id: progress_value }
    for (const c of compl || []) {
      if (c.done_at) (doneBy[c.assignment_id] = doneBy[c.assignment_id] || new Set()).add(c.player_id)
      if (Number(c.progress_value) > 0) (progBy[c.assignment_id] = progBy[c.assignment_id] || {})[c.player_id] = Number(c.progress_value)
    }

    setItems(mine.map((a) => {
      const title = a.drill?.title || a.plan?.name || a.title || (a.video_url ? L('סרטון', 'Video') : L('משימה', 'Task'))
      const targets = a.player_id ? players.filter((p) => p.player_id === a.player_id) : players
      const doneSet = doneBy[a.id] || new Set()
      return { ...a, title, targets, doneSet, prog: progBy[a.id] || {}, done: targets.filter((p) => doneSet.has(p.player_id)).length, total: targets.length }
    }))
  }, [coachId, team])

  useEffect(() => { load() }, [load])

  if (items === null) return <SkeletonCards count={3} lines={2} />
  if (failed) return <ErrorState compact message={L('לא הצלחנו לטעון את המטלות של הקבוצה.', "We couldn't load this team's tasks.")} onRetry={load} />

  return (
    <div className="team-section">
      <h3 className="ta-title" style={{ marginTop: 18 }}><Dumbbell size={16} /> {L('מה נשלח ומי ביצע', 'Sent & done')}</h3>
      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><Inbox size={26} /></span>
          <div className="empty-title">{L('עדיין לא שלחת מטלות לקבוצה הזו', 'No tasks sent to this team yet')}</div>
          <p className="muted small">{L('בחר תרגיל למעלה ושלח — המעקב יופיע כאן.', 'Pick a drill above and send — tracking shows up here.')}</p>
        </div>
      ) : (
        <ul className="ta-list">
          {items.map((a) => {
            const pct = a.total > 0 ? Math.round((a.done / a.total) * 100) : 0
            const isOpen = openId === a.id
            return (
              <li key={a.id} className="ta-item">
                <button className="ta-head" onClick={() => setOpenId(isOpen ? null : a.id)} aria-expanded={isOpen}>
                  <div className="ta-head-main">
                    <strong>{a.title}</strong>
                    <span className="muted small">
                      {a.player_id ? L('אישי', 'Individual') : L('לכל הקבוצה', 'Whole team')}
                      {a.due_date ? ` · ${L('עד', 'by')} ${new Date(a.due_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}` : ''}
                    </span>
                  </div>
                  <span className={pct >= 100 ? 'ta-ratio done' : 'ta-ratio'}>{a.done}/{a.total} ✓</span>
                  <ChevronDown size={16} className={isOpen ? 'ta-chev open' : 'ta-chev'} />
                </button>
                {isOpen && (
                  <ul className="ta-players">
                    {a.targets.length === 0 ? (
                      <li className="muted small" style={{ padding: '6px 4px' }}>{L('אין שחקנים מחוברים ליעד הזה.', 'No connected players for this target.')}</li>
                    ) : a.targets.map((p) => {
                      const done = a.doneSet.has(p.player_id)
                      const prog = a.prog[p.player_id]
                      return (
                        <li key={p.id} className="ta-player">
                          {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={28} />}
                          <span className="ta-player-name">{p.name}</span>
                          {!done && a.target_value && prog > 0 && (
                            <span className="ta-partial" dir="ltr">{prog}/{a.target_value}</span>
                          )}
                          <span className={done ? 'ta-status done' : 'ta-status'}>{done ? <><Check size={13} /> {L('ביצע', 'Done')}</> : <><Clock size={13} /> {L('ממתין', 'Pending')}</>}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
