import { useState, useEffect, useMemo, useRef } from 'react'
import { X, Search, Check, Link2 } from 'lucide-react'
import { allLeagues, leaguesForAge, teamsInLeague, clubCore } from './iba'
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
function Pick({ label, value, onPick, options, getKey, getLabel, placeholder, empty, busy, disabled }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const norm = (v) => String(v || '').replace(/[׳'"״]/g, '').toLowerCase().trim()
  const shown = useMemo(() => {
    const n = norm(q)
    if (!n) return options
    return options.filter((o) => norm(getLabel(o)).includes(n))
  }, [options, q, getLabel])
  const current = options.find((o) => getKey(o) === value)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="pf-label tfi-pick" ref={boxRef}>
      <span className="field-label">{label}</span>
      <button
        type="button"
        className={open ? 'finder-input tfi-control open' : 'finder-input tfi-control'}
        onClick={() => { if (!disabled) setOpen((o) => !o) }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={current ? '' : 'muted'}>
          {busy ? L('טוען…', 'Loading…') : current ? getLabel(current) : placeholder}
        </span>
      </button>
      {open && !disabled && (
        <div className="tfi-panel" role="listbox">
          <div className="ms-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={L('הקלד כדי לחפש...', 'Type to search...')}
              aria-label={L('חיפוש', 'Search')}
              autoFocus
            />
          </div>
          {shown.length === 0 && <p className="ms-empty muted small">{empty || L('לא נמצא', 'No match')}</p>}
          {shown.map((o) => {
            const k = getKey(o)
            return (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={k === value}
                className={k === value ? 'ms-option on' : 'ms-option'}
                onClick={() => { onPick(k, o); setOpen(false); setQ('') }}
              >
                <span className="ms-check">{k === value && <Check size={14} />}</span>
                {getLabel(o)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
          {L('הקישור נשמר יחד עם הפרופיל. את המשחקים עצמם מייבאים אחר כך במסך «משחקים וטבלה».',
             'The link is saved with your profile. The games themselves are imported later, on the Games & table screen.')}
        </p>
      </div>
    </div>
  )
}
