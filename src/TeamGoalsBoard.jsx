import { useState, useEffect, useCallback } from 'react'
import { Target, ChevronDown, Users2, Flame, CheckCircle2, CalendarCheck } from 'lucide-react'
import { supabase } from './supabaseClient'
import { L } from './i18n'
import Avatar from './Avatar'
import { PlayerGoalsEditor } from './PlayerGoals'

// דרגת עומס → צבע (נמוך=כחול, בינוני=ירוק, גבוה=אדום)
const loadTone = (e) => (e >= 8 ? 'hi' : e >= 6 ? 'mid' : 'lo')

// מיני-דוח שחקן — ממוצע עומס, % עמידה במטרות, % נוכחות + היסטוריית עומס אחרונה. במבט אחד.
function GbStats({ coachId, playerAuthId, rosterId }) {
  const [st, setSt] = useState(null)
  useEffect(() => {
    ;(async () => {
      const [{ data: eff }, { data: marks }, { data: att }] = await Promise.all([
        supabase.from('session_effort').select('effort, session_date, session_type').eq('coach_id', coachId).eq('player_id', playerAuthId).order('session_date', { ascending: false }),
        supabase.from('session_goal_marks').select('met').eq('coach_id', coachId).eq('player_id', playerAuthId),
        supabase.from('practice_attendance').select('status').eq('coach_id', coachId).eq('player_id', rosterId),
      ])
      const effVals = (eff || []).map((r) => r.effort)
      const met = (marks || []).filter((m) => m.met).length
      const attRows = att || []
      const present = attRows.filter((a) => a.status && a.status !== 'absent').length
      setSt({
        avgEffort: effVals.length ? (effVals.reduce((s, v) => s + v, 0) / effVals.length).toFixed(1) : null,
        goalsPct: (marks || []).length ? Math.round((met / marks.length) * 100) : null,
        attPct: attRows.length ? Math.round((present / attRows.length) * 100) : null,
        recent: (eff || []).slice(0, 4),
      })
    })()
  }, [coachId, playerAuthId, rosterId])
  if (!st) return null
  return (
    <>
      <div className="gb-stats">
        <span className="gb-stat"><Flame size={13} /> {L('עומס ממוצע', 'Avg load')} <b>{st.avgEffort ?? '—'}</b></span>
        <span className="gb-stat"><CheckCircle2 size={13} /> {L('עמידה במטרות', 'Goals met')} <b>{st.goalsPct != null ? `${st.goalsPct}%` : '—'}</b></span>
        <span className="gb-stat"><CalendarCheck size={13} /> {L('נוכחות', 'Attendance')} <b>{st.attPct != null ? `${st.attPct}%` : '—'}</b></span>
      </div>
      {st.recent.length > 0 && (
        <div className="gb-load">
          <span className="gb-load-label"><Flame size={12} /> {L('העומס באימונים האחרונים', 'Recent load')}</span>
          <div className="gb-load-row">
            {st.recent.map((r, i) => (
              <span key={i} className={`gb-load-tag ${loadTone(r.effort)}`}>
                {r.session_date ? new Date(r.session_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' }) : ''} · {r.effort}/10
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// לוח מטרות לשחקנים — רשימת כל השחקנים המחוברים, לכל אחד המטרות שלו במבט,
// ולחיצה פותחת עורך מהיר (צ'יפים + הוספה). (מאמן, בטאב "מטרות")
export default function TeamGoalsBoard({ coachId, team }) {
  const [players, setPlayers] = useState(null)
  const [goalsBy, setGoalsBy] = useState({})
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    const { data: rp } = await supabase
      .from('team_players')
      .select('id, name, number, player_id')
      .eq('coach_id', coachId).eq('team', team).order('number')
    const connected = (rp || []).filter((p) => p.player_id)
    setPlayers(connected)
    if (connected.length === 0) return
    const { data: goals } = await supabase
      .from('player_goals')
      .select('id, player_id, title, period, status, target_value, progress_value, unit')
      .eq('coach_id', coachId)
      .in('player_id', connected.map((p) => p.player_id))
      .order('created_at', { ascending: false })
    const by = {}
    for (const g of goals || []) (by[g.player_id] = by[g.player_id] || []).push(g)
    setGoalsBy(by)
  }, [coachId, team])
  useEffect(() => { load() }, [load])

  if (players === null) return null

  return (
    <div className="gb">
      <h3 className="ta-title"><Target size={16} /> {L('מטרות לשחקנים', 'Player goals')}</h3>
      <p className="muted small" style={{ marginBottom: 10 }}>{L('טאפ על שחקן להוספת מטרות.', 'Tap a player to add goals.')}</p>
      {players.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><Users2 size={24} /></span>
          <div className="empty-title">{L('אין עדיין שחקנים מחוברים', 'No connected players yet')}</div>
          <p className="muted small">{L('שתפו את קוד ההצטרפות — וכשהשחקנים יתחברו תוכלו להציב להם מטרות כאן.', 'Share the join code — once players connect you can set their goals here.')}</p>
        </div>
      ) : (
        <ul className="gb-list">
          {players.map((p) => {
            const goals = goalsBy[p.player_id] || []
            const active = goals.filter((g) => g.status !== 'done')
            const isOpen = openId === p.id
            return (
              <li key={p.id} className="gb-item">
                <button className="gb-head" onClick={() => setOpenId(isOpen ? null : p.id)} aria-expanded={isOpen}>
                  {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={30} />}
                  <span className="gb-name">{p.name}</span>
                  <span className="gb-summary">
                    {active.length === 0
                      ? <span className="gb-none">{L('אין מטרות פעילות', 'No active goals')}</span>
                      : active.slice(0, 3).map((g) => (
                          <span key={g.id} className={`gb-goal per-${g.period}`}>{g.title}</span>
                        ))}
                    {active.length > 3 && <span className="gb-more">+{active.length - 3}</span>}
                  </span>
                  <ChevronDown size={16} className={isOpen ? 'ta-chev open' : 'ta-chev'} />
                </button>
                {isOpen && (
                  <div className="gb-editor">
                    <GbStats coachId={coachId} playerAuthId={p.player_id} rosterId={p.id} />
                    <PlayerGoalsEditor coachId={coachId} playerId={p.player_id} team={team} playerName={p.name} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
