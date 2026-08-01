import { useState, useEffect, useCallback } from 'react'
import { Target, ChevronDown, Users2 } from 'lucide-react'
import { supabase } from './supabaseClient'
import { L } from './i18n'
import Avatar from './Avatar'
import { PlayerGoalsEditor } from './PlayerGoals'

// לוח יעדים לשחקנים — רשימת כל השחקנים המחוברים, לכל אחד היעדים שלו במבט,
// ולחיצה פותחת טופס נקי (1.5): טווח · מה היעד · עד מתי. נתוני העומס
// הוסרו מכאן בכוונה — מקומם בכרטיס השחקן, לא בטופס הצבת יעד.
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
      <h3 className="ta-title"><Target size={16} /> {L('יעדים לשחקנים', 'Player goals')}</h3>
      <p className="muted small" style={{ marginBottom: 10 }}>{L('טאפ על שחקן להצבת יעדים.', 'Tap a player to set goals.')}</p>
      {players.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><Users2 size={24} /></span>
          <div className="empty-title">{L('אין עדיין שחקנים מחוברים', 'No connected players yet')}</div>
          <p className="muted small">{L('שתפו את קוד ההצטרפות — וכשהשחקנים יתחברו תוכלו להציב להם יעדים כאן.', 'Share the join code — once players connect you can set their goals here.')}</p>
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
                      ? <span className="gb-none">{L('אין יעדים פעילים', 'No active goals')}</span>
                      : active.slice(0, 3).map((g) => (
                          <span key={g.id} className={`gb-goal per-${g.period}`}>{g.title}</span>
                        ))}
                    {active.length > 3 && <span className="gb-more">+{active.length - 3}</span>}
                  </span>
                  <ChevronDown size={16} className={isOpen ? 'ta-chev open' : 'ta-chev'} />
                </button>
                {isOpen && (
                  <div className="gb-editor">
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
