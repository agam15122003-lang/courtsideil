// TeamGames — משחקים, ייבוא מהאיגוד וטבלת הליגה.
//
// עד היום זה חי כשני טאבים מתוך שבעה בתוך Teams.jsx (64KB). המסמך
// («21 מסכים מעוצבים», עמוד 21, פריט 2) מבקש שהקבוצה תישאר שלושה טאבים
// בלבד — סגל · לו״ז ונוכחות · מטרות ומשימות — ולכן המשחקים יוצאים לכאן,
// למסך משלהם שנפתח מתוך הקבוצה וחוזר אליה.
//
// זו העברה נאמנה של ההתנהגות הקיימת, לא עיצוב מחדש: פריט 6 באותו עמוד
// («משחקים, ליגה וטבלה» — לוח תוצאות, סיכום משחק ומספרים גדולים) הוא
// שלב נפרד, והוא ייבנה על הקובץ הזה.

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Trash2, Trophy, Clock, MapPin, X, Pencil, Save, Download,
  ClipboardCheck, CalendarClock,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { confirmDialog } from './confirm'
import useFocusTrap from './useFocusTrap'
import { ChevronBack } from './DirIcon'
import SessionDetail from './SessionDetail'
import LeagueTable from './LeagueTable'
import { allLeagues, leaguesForAge, teamsInLeague, leagueGames, clubCore } from './iba'

const ilFull = (str) => {
  if (!str) return ''
  const d = new Date(str + 'T00:00')
  return isNaN(d) ? str : d.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })
}
const pad2 = (n) => String(n).padStart(2, '0')
const ymdOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// «בעוד כמה ימים המשחק» — הדבר הראשון שמאמן רוצה לדעת כשהוא נכנס לכאן
function untilLabel(dateStr) {
  if (!dateStr) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00')
  const days = Math.round((d - today) / 86400000)
  if (days === 0) return L('היום', 'Today')
  if (days === 1) return L('מחר', 'Tomorrow')
  if (days < 0) return L(`לפני ${-days} ימים`, `${-days} days ago`)
  if (days <= 7) return L(`בעוד ${days} ימים`, `In ${days} days`)
  return ilFull(dateStr)
}
// תוצאה → ניצחון / הפסד / תיקו
const outcomeOf = (g) => {
  if (g.our_score == null || g.their_score == null) return null
  if (g.our_score > g.their_score) return 'w'
  if (g.our_score < g.their_score) return 'l'
  return 'd'
}

// props: session · profile · team (השכבה הנוכחית) · teams (כל השכבות, לבורר הייבוא)
//        onBack — חזרה למסך הקבוצה
export default function TeamGames({ session, profile, team, teams = [], onBack }) {
  const me = session.user.id
  const [games, setGames] = useState([])
  const [iba, setIba] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const [manualOpen, setManualOpen] = useState(false)
  const [gForm, setGForm] = useState({ date: '', time: '', opponent: '', location: '' })
  const [gEdit, setGEdit] = useState(null)
  const [reviewGame, setReviewGame] = useState(null)
  const [scoreEdit, setScoreEdit] = useState(null) // {game, our, their, summary}

  const [imp, setImp] = useState(null) // null=סגור, אחרת אובייקט-מצב הייבוא
  const [leaguesAll, setLeaguesAll] = useState([])
  const loadTokenRef = useRef(0)

  const load = useCallback(async () => {
    if (!team) { setLoading(false); return }
    const token = ++loadTokenRef.current
    setLoading(true)
    const [gm, im] = await Promise.all([
      supabase.from('team_games').select('*').eq('coach_id', me).eq('team', team).order('game_date'),
      supabase.from('team_iba').select('*').eq('coach_id', me).eq('team', team).maybeSingle(),
    ])
    if (token !== loadTokenRef.current) return
    // טעינה שנכשלה אינה «אין משחקים» — ולכל שגיאה יש דרך התאוששות
    setLoadFailed(!!gm.error)
    setGames(gm.error ? [] : gm.data || [])
    setIba(im && !im.error ? im.data : null)
    setLoading(false)
  }, [me, team])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { loadTokenRef.current++ }, [])

  // Escape ומלכודת פוקוס — לשלושת המודאלים, כולל «תוצאה וסיכום»
  const closeDialog = () => {
    if (gEdit) setGEdit(null)
    else if (scoreEdit) setScoreEdit(null)
    else setImp(null)
  }
  const anyDialog = !!(gEdit || imp || scoreEdit)
  const dlgRef = useFocusTrap(anyDialog, closeDialog)

  // ---------- משחקים ----------
  const addGame = async () => {
    if (!gForm.date) { toast.error(L('בחר תאריך למשחק', 'Choose a game date')); return }
    const { error } = await supabase.from('team_games').insert({
      coach_id: me, team, game_date: gForm.date, game_time: gForm.time || null,
      opponent: gForm.opponent.trim() || null, location: gForm.location.trim() || null,
    })
    if (error) { toast.error(L('ההוספה נכשלה: ', 'Add failed: ') + error.message); return }
    setGForm({ date: '', time: '', opponent: '', location: '' }); load()
  }
  const saveGame = async () => {
    const g = gEdit
    const { error } = await supabase.from('team_games').update({
      game_date: g.game_date, game_time: g.game_time || null,
      opponent: (g.opponent || '').trim() || null, location: (g.location || '').trim() || null,
    }).eq('id', g.id)
    if (error) { toast.error(L('שמירה נכשלה: ', 'Save failed: ') + error.message); return }
    toast.success(L('המשחק עודכן', 'Game updated')); setGEdit(null); load()
  }
  // מחזיר true רק אם המשחק באמת נמחק — מודאל העריכה נסגר על סמך זה,
  // ולא מיד עם הלחיצה (ביטול בדיאלוג האישור היה מוחק את מה שהוקלד).
  const delGame = async (id) => {
    if (!(await confirmDialog({ message: L('למחוק את המשחק?', 'Delete this game?'), danger: true }))) return false
    const { error } = await supabase.from('team_games').delete().eq('id', id)
    if (error) { toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message); return false }
    load()
    return true
  }

  // ---------- תוצאה וסיכום ----------
  const saveScore = async () => {
    const s = scoreEdit
    const our = s.our === '' ? null : Number(s.our)
    const their = s.their === '' ? null : Number(s.their)
    const { error } = await supabase.from('team_games')
      .update({ our_score: our, their_score: their, summary: s.summary?.trim() || null })
      .eq('id', s.game.id)
    if (error) {
      // העמודות נוספות ב-supabase_game_scores.sql — אם הוא טרם הורץ,
      // אומרים את זה במפורש במקום «שמירה נכשלה» סתמי.
      const missing = error.code === 'PGRST204' || /our_score|their_score|summary/i.test(error.message || '')
      toast.error(missing
        ? L('צריך להריץ את supabase_game_scores.sql כדי לשמור תוצאות', 'Run supabase_game_scores.sql to store scores')
        : L('שמירה נכשלה: ', 'Save failed: ') + error.message)
      return
    }
    toast.success(L('התוצאה נשמרה', 'Score saved'))
    setScoreEdit(null); load()
  }

  // ---------- ייבוא מהאיגוד (קטגוריה → אזור/ליגה → קבוצה → משחקים) ----------
  const openImport = async () => {
    setImp({ age: team, showAll: false, leagueId: '', leagueName: '', teams: [], teamId: '', teamName: '', games: null, busy: true, step: 'league' })
    try {
      const ls = leaguesAll.length ? leaguesAll : await allLeagues()
      setLeaguesAll(ls)
      setImp((s) => s && ({ ...s, busy: false }))
    } catch {
      toast.error(L('שגיאה בחיבור לאיגוד הכדורסל', 'Could not connect to the association'))
      setImp((s) => s && { ...s, busy: false })
    }
  }
  const pickLeague = async (leagueId) => {
    const lg = leaguesAll.find((l) => String(l.id) === String(leagueId))
    setImp((s) => s && ({ ...s, leagueId, leagueName: lg?.name || '', busy: true, teams: [], teamId: '', games: null, step: 'team' }))
    try {
      const ts = await teamsInLeague(leagueId)
      const core = clubCore(profile?.club)
      ts.sort((a, b) => (b.title.includes(core) ? 1 : 0) - (a.title.includes(core) ? 1 : 0))
      setImp((s) => s && ({ ...s, teams: ts, busy: false }))
    } catch {
      toast.error(L('שגיאה בטעינת הקבוצות מהאיגוד', 'Error loading teams')); setImp((s) => s && ({ ...s, busy: false }))
    }
  }
  const pickTeam = async (teamId) => {
    const tName = imp.teams.find((t) => String(t.id) === String(teamId))?.title || ''
    setImp((s) => s && ({ ...s, teamId, teamName: tName, busy: true, games: null, step: 'games' }))
    try {
      const gs = await leagueGames(imp.leagueId, teamId)
      setImp((s) => s && ({ ...s, games: gs, busy: false }))
    } catch {
      toast.error(L('שגיאה בטעינת המשחקים', 'Error loading games')); setImp((s) => s && ({ ...s, games: [], busy: false }))
    }
  }
  const saveIbaLink = async (extra = {}) => {
    const row = { coach_id: me, team, league_id: String(imp.leagueId), league_name: imp.leagueName, iba_team_id: imp.teamId ? String(imp.teamId) : null, iba_team_name: imp.teamName || null, ...extra }
    const { error } = await supabase.from('team_iba').upsert(row, { onConflict: 'coach_id,team' })
    if (error) { toast.error(L('שמירת הליגה נכשלה: ', 'Saving the league failed: ') + error.message); return false }
    setIba(row)
    return true
  }
  const importGames = async () => {
    if (!imp.games?.length) {
      if (await saveIbaLink()) { toast.success(L('הליגה נשמרה לטבלה', 'League saved for the table')); setImp(null) }
      return
    }
    // מוחקים משחקים שיובאו קודם לאותה קבוצה, כדי לא לשכפל בייבוא חוזר
    await supabase.from('team_games').delete().eq('coach_id', me).eq('team', team).eq('source', 'iba')
    const rows = imp.games.map((g) => ({ coach_id: me, team, game_date: g.date, game_time: g.time || null, opponent: g.opponent || null, location: g.location || null, source: 'iba' }))
    const { error } = await supabase.from('team_games').insert(rows)
    if (error) {
      // אם עמודת source לא קיימת במסד — נופלים חזרה לייבוא רגיל בלי דדופ
      const { error: e2 } = await supabase.from('team_games').insert(imp.games.map((g) => ({ coach_id: me, team, game_date: g.date, game_time: g.time || null, opponent: g.opponent || null, location: g.location || null })))
      if (e2) { console.error('games import:', e2.message); toast.error(L('הייבוא נכשל — נסו שוב בעוד רגע.', 'Import failed — try again in a moment.')); return }
    }
    await saveIbaLink()
    toast.success(L(`${rows.length} משחקים יובאו + הליגה נשמרה`, `${rows.length} games imported + league saved`))
    setImp(null); load()
  }

  const impLeagues = imp ? (imp.showAll ? leaguesAll : (leaguesForAge(leaguesAll, imp.age).length ? leaguesForAge(leaguesAll, imp.age) : leaguesAll)) : []

  return (
    <div className="team-section tg-screen">
      <div className="tg-screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label={L('חזרה לקבוצה', 'Back to the team')}>
          <ChevronBack size={20} />
        </button>
        {/* H1 אחד לכל מסך — זה מסך, לא סקשן בתוך הקבוצה */}
        <h1 className="ta-title tg-screen-title">
          <Trophy size={17} /> {L('משחקים וטבלה', 'Games & table')} · {trTeam(team)}
        </h1>
      </div>

      <div className="games-cta">
        <button className="btn-primary games-import-btn" style={{ marginTop: 0 }} onClick={openImport}>
          <Download size={16} /> {L('ייבוא משחקים + טבלה מהאיגוד', 'Import games + table from the association')}
        </button>
        <button className="manual-toggle" onClick={() => setManualOpen((v) => !v)}>
          <Plus size={14} /> {L('הוספה ידנית', 'Add manually')}
        </button>
      </div>
      <p className="muted small games-hint">{L('מומלץ לייבא מהאיגוד. לא הסתדר? אפשר להוסיף משחק ידנית.', 'Import from the association is best. Didn’t work? Add a game manually.')}</p>

      {manualOpen && (
        <div className="game-add">
          <div className="form-grid-2">
            <label className="pf-label">{L('תאריך', 'Date')}
              <input className="finder-input" type="date" dir="ltr" value={gForm.date} onChange={(e) => setGForm((f) => ({ ...f, date: e.target.value }))} />
              {gForm.date && <span className="muted small date-preview">{ilFull(gForm.date)}</span>}
            </label>
            <label className="pf-label">{L('שעה', 'Time')}
              <input className="finder-input" type="time" dir="ltr" value={gForm.time} onChange={(e) => setGForm((f) => ({ ...f, time: e.target.value }))} />
            </label>
          </div>
          <input className="finder-input" type="text" value={gForm.opponent} onChange={(e) => setGForm((f) => ({ ...f, opponent: e.target.value }))} placeholder={L('יריבה', 'Opponent')} style={{ marginTop: 10 }} />
          <input className="finder-input" type="text" value={gForm.location} onChange={(e) => setGForm((f) => ({ ...f, location: e.target.value }))} placeholder={L('מיקום (אולם/כתובת)', 'Location (gym/address)')} style={{ marginTop: 10 }} />
          <button className="btn-primary" onClick={addGame}><Plus size={16} /> {L('הוספת משחק', 'Add game')}</button>
        </div>
      )}

      {loading ? (
        <div className="app-loading" style={{ padding: 30 }}><div className="loader" /></div>
      ) : loadFailed ? (
        <p className="alert alert-error" style={{ marginTop: 12 }}>
          {L('לא הצלחנו לטעון את המשחקים. זו תקלת טעינה — שום משחק לא נמחק. ', 'We could not load the games. This is a loading error — nothing was deleted. ')}
          <button type="button" className="link-button" onClick={load}>{L('נסה שוב', 'Try again')}</button>
        </p>
      ) : games.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 12 }}>
          <span className="empty-ic"><CalendarClock size={26} /></span>
          <div className="empty-title">{L('עדיין אין משחקים', 'No games yet')}</div>
          <p className="muted small">{L('ייבא את לוח המשחקים מהאיגוד — או הוסף משחק ידנית.', 'Import the fixture list from the association — or add a game manually.')}</p>
        </div>
      ) : (
        (() => {
          const today = ymdOf(new Date())
          const upcoming = games.filter((g) => g.game_date >= today)
          const past = games.filter((g) => g.game_date < today).reverse()
          const next = upcoming[0]
          const played = past.filter((g) => outcomeOf(g))
          const wins = played.filter((g) => outcomeOf(g) === 'w').length
          const losses = played.filter((g) => outcomeOf(g) === 'l').length

          const gameRow = (gm) => {
            const o = outcomeOf(gm)
            return (
              <li key={gm.id} className="gm-row">
                <div className="gm-when">
                  <span className="gm-date" dir="ltr">{ilFull(gm.game_date)}</span>
                  {gm.game_time && <span className="gm-time"><Clock size={12} /> {String(gm.game_time).slice(0, 5)}</span>}
                </div>
                <div className="gm-main">
                  <strong>{gm.opponent || L('יריבה', 'Opponent')}</strong>
                  {gm.location && <span className="gm-loc"><MapPin size={12} /> {gm.location}</span>}
                  {/* הסיכום נשמר במסד אבל לא הוצג בשום מקום — כאן הוא חוזר */}
                  {gm.summary && <span className="gm-summary">{gm.summary}</span>}
                </div>
                {o ? (
                  <button type="button" className={`gm-score o-${o}`} onClick={() => setScoreEdit({ game: gm, our: String(gm.our_score), their: String(gm.their_score), summary: gm.summary || '' })}
                    title={L('עריכת התוצאה', 'Edit score')}>
                    <b dir="ltr">{gm.our_score}–{gm.their_score}</b>
                    <span>{o === 'w' ? L('ניצחון', 'Win') : o === 'l' ? L('הפסד', 'Loss') : L('תיקו', 'Draw')}</span>
                  </button>
                ) : gm.game_date < today ? (
                  /* הסיכום נטען גם כשאין תוצאה — אחרת פתיחה חוזרת הייתה
                     מוחקת סיכום שנכתב בלי ציונים. */
                  <button type="button" className="gm-add-score" onClick={() => setScoreEdit({ game: gm, our: '', their: '', summary: gm.summary || '' })}>
                    {gm.summary ? L('תוצאה וסיכום', 'Score & summary') : L('הוספת תוצאה', 'Add score')}
                  </button>
                ) : null}
                <div className="gm-acts">
                  <button className="icon-btn" onClick={() => setReviewGame(gm)} aria-label={L('נוכחות ומשוב', 'Attendance & review')} title={L('נוכחות ומשוב למשחק', 'Game attendance & review')}><ClipboardCheck size={15} /></button>
                  <button className="icon-btn" onClick={() => setGEdit({ ...gm })} aria-label={L('עריכה', 'Edit')}><Pencil size={15} /></button>
                  <button className="icon-btn" onClick={() => delGame(gm.id)} aria-label={L('מחק', 'Delete')}><Trash2 size={15} /></button>
                </div>
              </li>
            )
          }

          return (
            <>
              {/* לוח התוצאות של המשחק הבא — המספרים הגדולים של המסך */}
              {next && (
                <div className="gm-next">
                  <span className="gm-next-eyebrow">{L('המשחק הבא', 'Next game')}</span>
                  <span className="gm-next-until">{untilLabel(next.game_date)}</span>
                  <h2 className="gm-next-opp">{next.opponent || L('יריבה', 'Opponent')}</h2>
                  <p className="gm-next-meta">
                    <span dir="ltr">{ilFull(next.game_date)}{next.game_time ? ` · ${String(next.game_time).slice(0, 5)}` : ''}</span>
                    {next.location && <span>{next.location}</span>}
                  </p>
                  <div className="gm-next-acts">
                    <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => setReviewGame(next)}>
                      <ClipboardCheck size={16} /> {L('נוכחות ומשוב', 'Attendance & review')}
                    </button>
                  </div>
                </div>
              )}

              {played.length > 0 && (
                <div className="gm-record">
                  <span className="gm-record-num" dir="ltr">{wins}–{losses}</span>
                  <span className="gm-record-lbl">{L(`מאזן העונה · ${played.length} משחקים`, `Season record · ${played.length} games`)}</span>
                </div>
              )}

              {upcoming.length > 0 && (
                <>
                  <h3 className="gm-sec">{L('קרובים', 'Upcoming')}</h3>
                  <ul className="gm-list">{upcoming.map(gameRow)}</ul>
                </>
              )}
              {past.length > 0 && (
                <>
                  <h3 className="gm-sec">{L('תוצאות', 'Results')}</h3>
                  <ul className="gm-list">{past.map(gameRow)}</ul>
                </>
              )}
            </>
          )
        })()
      )}

      {/* ---- טבלת הליגה ---- */}
      <div className="tg-table-block">
        {iba?.league_id ? (
          <>
            <LeagueTable leagueId={iba.league_id} leagueName={iba.league_name} highlight={iba.iba_team_name || profile?.club} />
            <button className="link-button" style={{ marginTop: 12 }} onClick={openImport}>{L('שינוי הליגה המקושרת', 'Change linked league')}</button>
          </>
        ) : (
          <div className="empty-state">
            <span className="empty-ic"><Trophy size={26} /></span>
            <div className="empty-title">{L('עדיין לא קושרה ליגה', 'No league linked yet')}</div>
            <p className="muted small">{L('קשר את הקבוצה שלך לליגה באיגוד כדי לראות כאן טבלה חיה שמתעדכנת אוטומטית.', 'Link your team to an association league to see a live, auto-updating table here.')}</p>
            <button className="btn-primary" onClick={openImport}><Download size={16} /> {L('קישור לליגה באיגוד', 'Link an association league')}</button>
          </div>
        )}
      </div>

      {/* ===================== מודאל: ייבוא מהאיגוד ===================== */}
      {imp && (
        <div className="tm-overlay" onClick={() => setImp(null)}>
          <div className="tm-modal" ref={dlgRef} role="dialog" aria-modal="true"
            aria-label={L('קישור לאיגוד הכדורסל', 'Link to the association')} onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-head">
              <strong>{L('קישור לאיגוד הכדורסל', 'Link to the association')}</strong>
              <button className="icon-btn" onClick={() => setImp(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>

            <label className="pf-label">{L('שכבת גיל', 'Age category')}
              <select className="finder-input" value={imp.age} onChange={(e) => setImp((s) => ({ ...s, age: e.target.value }))}>
                {teams.map((tm) => <option key={tm} value={tm}>{trTeam(tm)}</option>)}
              </select>
            </label>

            <label className="pf-label" style={{ marginTop: 10 }}>{L('אזור / ליגה ספציפית', 'Region / specific league')}
              <select className="finder-input" value={imp.leagueId} onChange={(e) => pickLeague(e.target.value)} disabled={imp.busy && !leaguesAll.length}>
                <option value="">{imp.busy && !leaguesAll.length ? L('טוען ליגות...', 'Loading leagues...') : L('— בחר ליגה —', '— Choose a league —')}</option>
                {impLeagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="switch-row" style={{ marginTop: 6 }}>
              <span className="switch"><input type="checkbox" checked={imp.showAll} onChange={(e) => setImp((s) => ({ ...s, showAll: e.target.checked }))} /><span className="switch-track" /></span>
              <span className="switch-text">{L('הצג את כל הליגות (לא רק לפי הגיל)', 'Show all leagues (not only by age)')}</span>
            </label>

            {imp.leagueId && (
              <label className="pf-label" style={{ marginTop: 10 }}>{L('הקבוצה שלך בליגה', 'Your team in the league')}
                <select className="finder-input" value={imp.teamId} onChange={(e) => pickTeam(e.target.value)} disabled={imp.busy}>
                  <option value="">{imp.busy ? L('טוען קבוצות...', 'Loading teams...') : L('— בחר את הקבוצה שלך —', '— Choose your team —')}</option>
                  {imp.teams.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </label>
            )}

            {imp.busy && imp.step === 'games' && <p className="muted small" style={{ marginTop: 10 }}>{L('טוען משחקים מהאיגוד...', 'Loading games...')}</p>}
            {imp.games && imp.games.length > 0 && (
              <div className="tm-games">
                <p className="muted small">{L(`נמצאו ${imp.games.length} משחקים`, `${imp.games.length} games found`)}</p>
                <ul className="game-list">
                  {imp.games.map((g, i) => (
                    <li key={i} className="game-row">
                      <div className="game-date"><span className="game-d" dir="ltr">{ilFull(g.date)}</span>{g.time && <span className="game-t">{g.time}</span>}</div>
                      <div className="game-body"><strong>{g.opponent}</strong>{g.location && <span className="game-loc">{g.location}</span>}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {imp.games && imp.games.length === 0 && (
              <p className="muted small" style={{ marginTop: 10 }}>{L('אין משחקים זמינים ב-API כרגע — אפשר עדיין לשמור את הליגה לטבלה.', 'No games available in the API — you can still save the league for the table.')}</p>
            )}

            {imp.leagueId && imp.teamId && (
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={importGames}>
                <Save size={15} /> {imp.games?.length ? L(`ייבא ${imp.games.length} משחקים ושמור ליגה`, `Import ${imp.games.length} games & save league`) : L('שמור ליגה לטבלה', 'Save league for table')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===================== מודאל: עריכת משחק ===================== */}
      {gEdit && (
        <div className="tm-overlay" onClick={() => setGEdit(null)}>
          <div className="tm-modal" ref={dlgRef} role="dialog" aria-modal="true"
            aria-label={L('עריכת משחק', 'Edit game')} onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-head">
              <strong>{L('עריכת משחק', 'Edit game')}</strong>
              <button className="icon-btn" onClick={() => setGEdit(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <div className="form-grid-2">
              <label className="pf-label">{L('תאריך', 'Date')}
                <input className="finder-input" type="date" dir="ltr" value={gEdit.game_date || ''} onChange={(e) => setGEdit((g) => ({ ...g, game_date: e.target.value }))} />
                {gEdit.game_date && <span className="muted small date-preview">{ilFull(gEdit.game_date)}</span>}
              </label>
              <label className="pf-label">{L('שעה', 'Time')}
                <input className="finder-input" type="time" dir="ltr" value={gEdit.game_time || ''} onChange={(e) => setGEdit((g) => ({ ...g, game_time: e.target.value }))} />
              </label>
            </div>
            <input className="finder-input" value={gEdit.opponent || ''} onChange={(e) => setGEdit((g) => ({ ...g, opponent: e.target.value }))} placeholder={L('יריבה', 'Opponent')} style={{ marginTop: 10 }} />
            <input className="finder-input" value={gEdit.location || ''} onChange={(e) => setGEdit((g) => ({ ...g, location: e.target.value }))} placeholder={L('מיקום', 'Location')} style={{ marginTop: 10 }} />
            <div className="tm-modal-actions">
              <button className="btn-primary" onClick={saveGame}><Save size={15} /> {L('שמירה', 'Save')}</button>
              <button className="btn-ghost danger" onClick={async () => { const id = gEdit.id; if (await delGame(id)) setGEdit(null) }}><Trash2 size={15} /> {L('מחק', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== מודאל: תוצאה וסיכום ===================== */}
      {scoreEdit && (
        <div className="tm-overlay" onClick={() => setScoreEdit(null)}>
          <div className="tm-modal" ref={dlgRef} role="dialog" aria-modal="true"
            aria-label={L('תוצאה וסיכום למשחק', 'Game score and summary')} onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-head">
              <strong>{L('תוצאה וסיכום', 'Score & summary')}</strong>
              <button className="icon-btn" onClick={() => setScoreEdit(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <p className="muted small" style={{ margin: '0 0 10px' }}>
              {scoreEdit.game.opponent || L('יריבה', 'Opponent')} · {ilFull(scoreEdit.game.game_date)}
            </p>
            <div className="gm-score-inputs">
              <label className="pf-label">{L('אנחנו', 'Us')}
                <input className="finder-input" type="number" dir="ltr" min="0" inputMode="numeric"
                  value={scoreEdit.our} onChange={(e) => setScoreEdit((s) => ({ ...s, our: e.target.value }))} />
              </label>
              <span className="gm-score-dash" aria-hidden="true">–</span>
              <label className="pf-label">{L('היריבה', 'Them')}
                <input className="finder-input" type="number" dir="ltr" min="0" inputMode="numeric"
                  value={scoreEdit.their} onChange={(e) => setScoreEdit((s) => ({ ...s, their: e.target.value }))} />
              </label>
            </div>
            <label className="pf-label" style={{ marginTop: 10 }}>{L('סיכום קצר (לא חובה)', 'Short summary (optional)')}
              <textarea className="finder-input" rows={3} maxLength={2000} value={scoreEdit.summary}
                onChange={(e) => setScoreEdit((s) => ({ ...s, summary: e.target.value }))}
                placeholder={L('מה עבד, מה לא, ומה לוקחים לאימון הבא...', 'What worked, what didn’t, what to take to the next practice...')} />
            </label>
            <div className="tm-modal-actions">
              <button className="btn-primary" onClick={saveScore}><Save size={15} /> {L('שמירה', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {reviewGame && (
        <SessionDetail
          session={session}
          entry={{ id: reviewGame.id, team, date: reviewGame.game_date, start_time: reviewGame.game_time, session_type: 'game', opponent: reviewGame.opponent }}
          onClose={() => setReviewGame(null)}
        />
      )}
    </div>
  )
}
