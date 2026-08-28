import { useState, useEffect, useMemo } from 'react'
import { X, Link2 } from 'lucide-react'
import { allLeagues, leaguesForAge, teamsInLeague, clubCore } from './iba'
import Pick from './Pick'
import { L, trTeam } from './i18n'
import useFocusTrap from './useFocusTrap'

// «ייבוא מהאיגוד» בתוך טופס הפרופיל.
//
// עד היום מאמן היה עושה את זה פעמיים: פעם אחת בוחר שכבת גיל מרשימה של 18
// בפרופיל, ופעם שנייה — במסך «משחקים וטבלה» — מוצא את אותה קבוצה עצמה
// באיגוד כדי לקשר לו״ז וטבלה. כאן זה נעשה פעם אחת: בוחרים את הקבוצה
// האמיתית באיגוד, והיא גם נכנסת ל«הקבוצות שאני מאמן» וגם נשמרת מקושרת.
//
// ⚠ מפתח החיבור הוא **מחרוזת שכבת הגיל** ("נערים א׳ בנים"), לא מזהה של
//   האיגוד: זה מה ש-team_iba.team מצפה לו, וגם Teams/TeamGames/PlayerTeamHub
//   מחפשים לפיו. לכן שכבת הגיל היא הצעד הראשון ולא נגזרת משם הליגה —
//   שמות הליגות באיגוד לא ממופים חזרה ל-18 המחרוזות.

// בורר עם הקלדה. רשימת הליגות באיגוד היא מאות שורות — <select> רגיל שם
// הוא חסר תועלת.
// props:
//   teamOptions - 18 מחרוזות «שכבה מגדר»
//   club        - המועדון מהפרופיל, לקידום הקבוצה הנכונה בראש הרשימה
//   onClose()   - סגירה בלי שמירה
//   onPick(link) - { team, league_id, league_name, iba_team_id, iba_team_name }
export default function TeamFromIba({ teamOptions, club, onClose, onPick }) {
  const [age, setAge] = useState('')
  const [leagues, setLeagues] = useState([])
  const [showAll, setShowAll] = useState(false)
  const [leagueId, setLeagueId] = useState('')
  const [teams, setTeams] = useState([])
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState('leagues')
  const [err, setErr] = useState(null)
  const dlgRef = useFocusTrap(true, onClose)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const ls = await allLeagues()
        if (alive) { setLeagues(ls || []); setBusy(null) }
      } catch (e) {
        // האיגוד הוא אתר חיצוני. אם הוא למטה או חוסם — אומרים את זה,
        // ולא משאירים בורר ריק שנראה כמו תקלה אצלנו.
        if (alive) { setErr(L('לא הצלחנו להתחבר לאתר האיגוד כרגע. אפשר לבחור קבוצה מהרשימה הרגילה ולנסות שוב מאוחר יותר.', 'Could not reach the association site right now. Pick a team from the regular list and try again later.')); setBusy(null) }
        console.warn('iba leagues:', e?.message)
      }
    })()
    return () => { alive = false }
  }, [])

  const visibleLeagues = useMemo(
    () => (showAll || !age ? leagues : leaguesForAge(leagues, age)),
    [leagues, age, showAll]
  )

  const chooseLeague = async (id) => {
    setLeagueId(id)
    setTeamId('')
    setTeams([])
    if (!id) return
    setBusy('teams')
    try {
      const ts = await teamsInLeague(id)
      // הקבוצה של המועדון שלך עולה לראש — אחרת זו רשימה של 12 יריבות
      const core = clubCore(club || '')
      const sorted = core
        ? [...ts].sort((a, b) => (b.title.includes(core) ? 1 : 0) - (a.title.includes(core) ? 1 : 0))
        : ts
      setTeams(sorted)
    } catch (e) {
      setErr(L('טעינת הקבוצות מהאיגוד נכשלה.', 'Loading teams from the association failed.'))
      console.warn('iba teams:', e?.message)
    }
    setBusy(null)
  }

  const league = leagues.find((l) => String(l.id) === String(leagueId))
  const team = teams.find((t) => String(t.id) === String(teamId))
  const ready = age && league && team

  const confirm = () => {
    if (!ready) return
    onPick({
      team: age,
      league_id: String(league.id),
      league_name: league.name,
      iba_team_id: String(team.id),
      iba_team_name: team.title,
    })
  }

  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-modal tfi" ref={dlgRef} role="dialog" aria-modal="true"
        aria-label={L('הוספת קבוצה מהאיגוד', 'Add a team from the association')} onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-head">
          <strong>{L('הוספת קבוצה מהאיגוד', 'Add a team from the association')}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={L('סגור', 'Close')}><X size={18} /></button>
        </div>

        <p className="muted small tfi-lede">
          {L('בוחרים את הקבוצה כמו שהיא רשומה באיגוד — והיא נכנסת לקבוצות שלך, כבר מקושרת ללו״ז ולטבלת הליגה.',
             'Pick the team as it is registered with the association — it joins your teams already linked to the schedule and league table.')}
        </p>

        {err && <div className="alert alert-error" style={{ marginBottom: 10 }}>{err}</div>}

        <Pick
          label={L('שכבת גיל', 'Age category')}
          value={age}
          onPick={(v) => { setAge(v); setLeagueId(''); setTeamId(''); setTeams([]) }}
          options={teamOptions}
          getKey={(o) => o}
          getLabel={(o) => trTeam(o)}
          placeholder={L('— בחר שכבה —', '— Choose a category —')}
        />

        <Pick
          label={L('הליגה באיגוד', 'League')}
          value={leagueId}
          onPick={chooseLeague}
          options={visibleLeagues}
          getKey={(o) => String(o.id)}
          getLabel={(o) => o.name}
          placeholder={L('— בחר ליגה —', '— Choose a league —')}
          empty={L('אין ליגה מתאימה — נסה «הצג את כל הליגות»', 'No matching league — try “show all leagues”')}
          busy={busy === 'leagues'}
          disabled={!age || busy === 'leagues' || !!err}
        />
        <label className="switch-row" style={{ marginTop: 6 }}>
          <span className="switch">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            <span className="switch-track" />
          </span>
          <span className="switch-text">{L('הצג את כל הליגות (לא רק לפי הגיל)', 'Show all leagues (not only by age)')}</span>
        </label>

        <Pick
          label={L('הקבוצה שלך בליגה', 'Your team in the league')}
          value={teamId}
          onPick={setTeamId}
          options={teams}
          getKey={(o) => String(o.id)}
          getLabel={(o) => o.title}
          placeholder={L('— בחר את הקבוצה שלך —', '— Choose your team —')}
          busy={busy === 'teams'}
          disabled={!leagueId || busy === 'teams'}
        />

        <button type="button" className="btn-primary" style={{ marginTop: 14 }} disabled={!ready} onClick={confirm}>
          <Link2 size={15} aria-hidden="true" /> {L('הוספה וקישור', 'Add and link')}
        </button>
        <p className="muted small" style={{ marginTop: 8 }}>
          {L('הקישור ולוח המשחקים נשמרים יחד עם הפרופיל — אין צורך לייבא שוב במסך אחר.',
             'The link and the fixture list are saved together with your profile — no need to import again elsewhere.')}
        </p>
      </div>
    </div>
  )
}
