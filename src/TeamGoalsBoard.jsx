import { useState, useEffect, useCallback } from 'react'
import { Target, ChevronDown, Users2 } from 'lucide-react'
import { supabase } from './supabaseClient'
import { L } from './i18n'
import { COACH_LOGS } from './flags'
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
    // צד המאמן בלבד (22.8): כל הסגל, והיעדים נשמרים על שורת הסגל (roster_id).
    // 3.9 — שתי אמיתות: תמיד כל הסגל (COACH_LOGS) — היעדים ממופים למטה לפי
    // roster_id וגם לפי player_id, ולכן שחקן מחובר ושחקן בלי חשבון מופיעים יחד.
    const connected = COACH_LOGS ? (rp || []) : (rp || []).filter((p) => p.player_id)
    setPlayers(connected)
    if (connected.length === 0) return
    // select('*') ולא רשימת עמודות: roster_id עלול עוד לא להתקיים במסד
    const { data: goals } = await supabase
      .from('player_goals')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
    const byRoster = new Map(connected.map((p) => [p.id, p.id]))
    const byAuth = new Map(connected.filter((p) => p.player_id).map((p) => [p.player_id, p.id]))
    const by = {} // roster_id -> goals
    for (const g of goals || []) {
      const rid = (g.roster_id && byRoster.get(g.roster_id)) || (g.player_id && byAuth.get(g.player_id))
      if (rid) (by[rid] = by[rid] || []).push(g)
    }
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
          <div className="empty-title">{!COACH_LOGS ? L('אין עדיין שחקנים מחוברים', 'No connected players yet') : L('אין עדיין שחקנים בסגל', 'No players in the roster yet')}</div>
          <p className="muted small">{!COACH_LOGS
            ? L('שתפו את קוד ההצטרפות — וכשהשחקנים יתחברו תוכלו להציב להם יעדים כאן.', 'Share the join code — once players connect you can set their goals here.')
            : L('הוסיפו שחקנים בטאב «סגל» — ואז תוכלו להציב לכל אחד יעדים כאן.', 'Add players in the roster tab — then you can set each one goals here.')}</p>
        </div>
      ) : (
        <ul className="gb-list">
          {players.map((p) => {
            const goals = goalsBy[p.id] || []
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
                    {/* onChange: תג הסיכום בשורה נבנה מ-goalsBy — בלי רענון הוא
                        נשאר על היעדים שהיו לפני העריכה בתוך השורה הפתוחה. */}
                    <PlayerGoalsEditor coachId={coachId} playerId={p.player_id} rosterId={p.id} team={team} playerName={p.name} onChange={load} />
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
