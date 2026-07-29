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

  // Escape סוגר את המודאל הפתוח, ומלכודת פוקוס לשניהם
  useEffect(() => {
    if (!gEdit && !imp) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (gEdit) setGEdit(null); else setImp(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gEdit, imp])
  const dlgRef = useFocusTrap(!!(gEdit || imp), () => { if (gEdit) setGEdit(null); else setImp(null) })

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
  const delGame = async (id) => {
    if (!(await confirmDialog({ message: L('למחוק את המשחק?', 'Delete this game?'), danger: true }))) return
    await supabase.from('team_games').delete().eq('id', id); load()
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
        <ul className="game-list">
          {games.map((gm) => (
            <li key={gm.id} className="game-row">
              <div className="game-date">
                <span className="game-d" dir="ltr">{ilFull(gm.game_date)}</span>
                {gm.game_time && <span className="game-t"><Clock size={12} /> {gm.game_time}</span>}
              </div>
              <div className="game-body">
                <strong>{gm.opponent || L('יריבה', 'Opponent')}</strong>
                {gm.location && <span className="game-loc"><MapPin size={12} /> {gm.location}</span>}
              </div>
              <button className="icon-btn" onClick={() => setReviewGame(gm)} aria-label={L('נוכחות ומשוב', 'Attendance & review')} title={L('נוכחות ומשוב למשחק', 'Game attendance & review')}><ClipboardCheck size={15} /></button>
              <button className="icon-btn" onClick={() => setGEdit({ ...gm })} aria-label={L('עריכה', 'Edit')}><Pencil size={15} /></button>
              <button className="icon-btn" onClick={() => delGame(gm.id)} aria-label={L('מחק', 'Delete')}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
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
        <div className="tm-overlay" role="dialog" aria-modal="true" onClick={() => setImp(null)}>
          <div className="tm-modal" ref={dlgRef} onClick={(e) => e.stopPropagation()}>
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
        <div className="tm-overlay" role="dialog" aria-modal="true">
          <div className="tm-modal" ref={dlgRef} onClick={(e) => e.stopPropagation()}>
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
              <button className="btn-ghost danger" onClick={() => { delGame(gEdit.id); setGEdit(null) }}><Trash2 size={15} /> {L('מחק', 'Delete')}</button>
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
