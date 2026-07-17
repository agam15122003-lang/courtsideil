import { useState, useEffect } from 'react'
import {
  Plus, Trash2, Users2, Target, CalendarClock, MapPin, Clock, X,
  Pencil, Save, Trophy, ChevronRight, ChevronLeft, Download, Info,
  Briefcase, Phone, CalendarRange, CalendarDays, RotateCcw, Bandage,
  UserCheck,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import Avatar from './Avatar'
import { L, trTeam } from './i18n'
import { allLeagues, leaguesForAge, regionOf, teamsInLeague, leagueGames, clubCore } from './iba'
import LeagueTable from './LeagueTable'
import Attendance from './Attendance'

// ---- סטטוס שחקן ----
const STATUSES = [
  { key: 'active', he: 'פעיל', en: 'Active' },
  { key: 'injured', he: 'פצוע', en: 'Injured' },
  { key: 'sick', he: 'חולה', en: 'Sick' },
  { key: 'absent', he: 'לא מגיע', en: 'Absent' },
]
const statusLabel = (k) => L((STATUSES.find((x) => x.key === k) || STATUSES[0]).he, (STATUSES.find((x) => x.key === k) || STATUSES[0]).en)

// ---- תפקידי צוות מקצועי ----
const STAFF_ROLES = [
  { key: 'assistant', he: 'עוזר מאמן', en: 'Assistant coach' },
  { key: 'fitness', he: 'מאמן גופני / כושר', en: 'Strength & conditioning' },
  { key: 'physio', he: 'פיזיותרפיסט', en: 'Physiotherapist' },
  { key: 'manager', he: 'מנהל קבוצה', en: 'Team manager' },
  { key: 'statistician', he: 'סטטיסטיקאי', en: 'Statistician' },
  { key: 'doctor', he: 'רופא קבוצה', en: 'Team doctor' },
  { key: 'analyst', he: 'אנליסט וידאו', en: 'Video analyst' },
  { key: 'other', he: 'אחר', en: 'Other' },
]
const roleLabel = (k) => { const r = STAFF_ROLES.find((x) => x.key === k); return r ? L(r.he, r.en) : (k || L('צוות', 'Staff')) }

// ---- עזרי תאריך (תמיד תצוגה ישראלית dd.mm.yyyy, לא אמריקאי) ----
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ilNum = (str) => {
  if (!str) return ''
  const d = new Date(str + 'T00:00')
  return isNaN(d) ? str : `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
}
const ilFull = (str) => {
  if (!str) return ''
  const d = new Date(str + 'T00:00')
  return isNaN(d) ? str : d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })
}
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const sundayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n, 1); return x }
const weekLabel = (sun) => { const sat = addDays(sun, 6); return `${sun.getDate()}.${sun.getMonth() + 1} – ${sat.getDate()}.${sat.getMonth() + 1}.${sat.getFullYear()}` }
const monthLabel = (d) => `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

export default function Teams({ session, profile, onNavigate }) {
  const me = session.user.id
  const teams = profile?.age_groups || []
  const [team, setTeam] = useState(teams[0] || '')
  const [tab, setTab] = useState('roster')
  const [players, setPlayers] = useState([])
  const [staff, setStaff] = useState([])
  const [goalsMap, setGoalsMap] = useState({}) // 'period|key' -> content
  const [games, setGames] = useState([])
  const [iba, setIba] = useState(null) // קישור שמור לליגה באיגוד
  const [loading, setLoading] = useState(true)

  // הוספת שחקן / משחק / צוות
  const [pName, setPName] = useState('')
  const [pNum, setPNum] = useState('')
  const [gForm, setGForm] = useState({ date: '', time: '', opponent: '', location: '' })
  const [manualOpen, setManualOpen] = useState(false)
  const [sForm, setSForm] = useState({ name: '', role: 'assistant', phone: '' })

  // עריכה (מודאלים)
  const [pEdit, setPEdit] = useState(null)
  const [gEdit, setGEdit] = useState(null)
  const [sEdit, setSEdit] = useState(null)

  // מטרות — בורר שבוע/חודש
  const [gWeek, setGWeek] = useState(sundayOf(new Date()))
  const [gMonth, setGMonth] = useState(addMonths(new Date(), 0))
  const [wText, setWText] = useState('')
  const [mText, setMText] = useState('')
  const [sText, setSText] = useState('')

  // ייבוא מהאיגוד
  const [imp, setImp] = useState(null) // null=סגור, אחרת אובייקט-מצב
  const [leaguesAll, setLeaguesAll] = useState([])

  async function load() {
    if (!team) { setLoading(false); return }
    setLoading(true)
    const [pl, gl, gm, im, st] = await Promise.all([
      supabase.from('team_players').select('*').eq('coach_id', me).eq('team', team).order('created_at'),
      supabase.from('team_goals').select('*').eq('coach_id', me).eq('team', team),
      supabase.from('team_games').select('*').eq('coach_id', me).eq('team', team).order('game_date'),
      supabase.from('team_iba').select('*').eq('coach_id', me).eq('team', team).maybeSingle(),
      supabase.from('team_staff').select('*').eq('coach_id', me).eq('team', team).order('created_at'),
    ])
    setStaff(st && !st.error ? st.data || [] : [])
    setPlayers(pl.error ? [] : pl.data || [])
    const map = {}
    ;(gl.error ? [] : gl.data || []).forEach((r) => { map[`${r.period}|${r.period_key || ''}`] = r.content || '' })
    setGoalsMap(map)
    setGames(gm.error ? [] : gm.data || [])
    setIba(im && !im.error ? im.data : null)
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [team])

  // סנכרון תיבות המטרות עם השבוע/חודש הנבחר
  useEffect(() => { setWText(goalsMap[`week|${ymd(gWeek)}`] || '') }, [goalsMap, gWeek])
  useEffect(() => { setMText(goalsMap[`month|${monthKey(gMonth)}`] || '') }, [goalsMap, gMonth])
  useEffect(() => { setSText(goalsMap[`season|`] || '') }, [goalsMap])

  // ---------- שחקנים ----------
  const addPlayer = async () => {
    if (!pName.trim()) return
    const { error } = await supabase.from('team_players').insert({ coach_id: me, team, name: pName.trim(), number: pNum.trim() || null, status: 'active' })
    if (error) { toast.error(L('ההוספה נכשלה (הרצת את ה-SQL?): ', 'Add failed (ran the SQL?): ') + error.message); return }
    setPName(''); setPNum(''); load()
  }
  const cycleStatus = async (p) => {
    const next = STATUSES[(STATUSES.findIndex((s) => s.key === p.status) + 1) % STATUSES.length].key
    await supabase.from('team_players').update({ status: next }).eq('id', p.id); load()
  }
  const savePlayer = async () => {
    const p = pEdit
    const { error } = await supabase.from('team_players').update({
      name: (p.name || '').trim(), number: (p.number || '').toString().trim() || null,
      status: p.status, position: p.position || null,
      birth_year: p.birth_year ? parseInt(p.birth_year, 10) : null,
      phone: p.phone || null, notes: p.notes || null, injury_note: p.injury_note || null,
    }).eq('id', p.id)
    if (error) { toast.error(L('שמירה נכשלה: ', 'Save failed: ') + error.message); return }
    toast.success(L('פרטי השחקן נשמרו', 'Player saved')); setPEdit(null); load()
  }
  const delPlayer = async (id) => {
    if (!window.confirm(L('להסיר את השחקן?', 'Remove this player?'))) return
    await supabase.from('team_players').delete().eq('id', id); setPEdit(null); load()
  }

  // ---------- צוות מקצועי ----------
  const addStaff = async () => {
    if (!sForm.name.trim()) return
    const { error } = await supabase.from('team_staff').insert({ coach_id: me, team, name: sForm.name.trim(), role: sForm.role, phone: sForm.phone.trim() || null })
    if (error) { toast.error(L('ההוספה נכשלה (הרצת את ה-SQL?): ', 'Add failed (ran the SQL?): ') + error.message); return }
    setSForm({ name: '', role: sForm.role, phone: '' }); load()
  }
  const saveStaff = async () => {
    const s = sEdit
    const { error } = await supabase.from('team_staff').update({ name: (s.name || '').trim(), role: s.role, phone: s.phone || null, notes: s.notes || null }).eq('id', s.id)
    if (error) { toast.error(L('שמירה נכשלה: ', 'Save failed: ') + error.message); return }
    toast.success(L('פרטי הצוות נשמרו', 'Staff saved')); setSEdit(null); load()
  }
  const delStaff = async (id) => {
    if (!window.confirm(L('להסיר מאיש הצוות?', 'Remove this staff member?'))) return
    await supabase.from('team_staff').delete().eq('id', id); setSEdit(null); load()
  }

  // ---------- מטרות ----------
  const saveGoal = async (period, key, content) => {
    const { error } = await supabase.from('team_goals').upsert(
      { coach_id: me, team, period, period_key: key, content, updated_at: new Date().toISOString() },
      { onConflict: 'coach_id,team,period,period_key' }
    )
    if (error) { toast.error(L('שמירה נכשלה (עדכנת את ה-SQL?): ', 'Save failed (updated the SQL?): ') + error.message); return }
    setGoalsMap((m) => ({ ...m, [`${period}|${key}`]: content }))
    toast.success(L('המטרות נשמרו', 'Goals saved'))
  }

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
    if (!window.confirm(L('למחוק את המשחק?', 'Delete this game?'))) return
    await supabase.from('team_games').delete().eq('id', id); load()
  }

  // ---------- ייבוא מהאיגוד (קטגוריה → אזור/ליגה → קבוצה → משחקים) ----------
  const openImport = async () => {
    setImp({ age: team, showAll: false, leagueId: '', leagueName: '', teams: [], teamId: '', teamName: '', games: null, busy: true, step: 'league' })
    try {
      const ls = leaguesAll.length ? leaguesAll : await allLeagues()
      setLeaguesAll(ls)
      setImp((s) => ({ ...s, busy: false }))
    } catch {
      toast.error(L('שגיאה בחיבור לאיגוד הכדורסל', 'Could not connect to the association'))
      setImp((s) => s && { ...s, busy: false })
    }
  }
  const pickLeague = async (leagueId) => {
    const lg = leaguesAll.find((l) => String(l.id) === String(leagueId))
    setImp((s) => ({ ...s, leagueId, leagueName: lg?.name || '', busy: true, teams: [], teamId: '', games: null, step: 'team' }))
    try {
      const ts = await teamsInLeague(leagueId)
      const core = clubCore(profile?.club)
      ts.sort((a, b) => (b.title.includes(core) ? 1 : 0) - (a.title.includes(core) ? 1 : 0))
      setImp((s) => ({ ...s, teams: ts, busy: false }))
    } catch {
      toast.error(L('שגיאה בטעינת הקבוצות מהאיגוד', 'Error loading teams')); setImp((s) => ({ ...s, busy: false }))
    }
  }
  const pickTeam = async (teamId) => {
    const tName = imp.teams.find((t) => String(t.id) === String(teamId))?.title || ''
    setImp((s) => ({ ...s, teamId, teamName: tName, busy: true, games: null, step: 'games' }))
    try {
      const gs = await leagueGames(imp.leagueId, teamId)
      setImp((s) => ({ ...s, games: gs, busy: false }))
    } catch {
      toast.error(L('שגיאה בטעינת המשחקים', 'Error loading games')); setImp((s) => ({ ...s, games: [], busy: false }))
    }
  }
  const saveIbaLink = async (extra = {}) => {
    const row = { coach_id: me, team, league_id: String(imp.leagueId), league_name: imp.leagueName, iba_team_id: imp.teamId ? String(imp.teamId) : null, iba_team_name: imp.teamName || null, ...extra }
    await supabase.from('team_iba').upsert(row, { onConflict: 'coach_id,team' })
    setIba(row)
  }
  const importGames = async () => {
    if (!imp.games?.length) { await saveIbaLink(); toast.success(L('הליגה נשמרה לטבלה', 'League saved for the table')); setImp(null); return }
    const rows = imp.games.map((g) => ({ coach_id: me, team, game_date: g.date, game_time: g.time || null, opponent: g.opponent || null, location: g.location || null }))
    const { error } = await supabase.from('team_games').insert(rows)
    if (error) { toast.error(L('הייבוא נכשל (הרצת את ה-SQL?): ', 'Import failed (ran the SQL?): ') + error.message); return }
    await saveIbaLink()
    toast.success(L(`${rows.length} משחקים יובאו + הליגה נשמרה`, `${rows.length} games imported + league saved`))
    setImp(null); load()
  }

  if (teams.length === 0) {
    return (
      <div className="welcome-card">
        <header className="page-header">
          <div className="page-header-text">
            <div className="welcome-badge">{L('הקבוצות שלי', 'My Teams')}</div>
            <h2>{L('ניהול קבוצה', 'Team Management')}</h2>
          </div>
        </header>
        <div className="empty-state">
          <span className="empty-ic"><Users2 size={26} /></span>
          <div className="empty-title">{L('עדיין לא הגדרת קבוצות', 'No teams yet')}</div>
          <p className="muted small">{L('הוסף קבוצות בפרופיל ("הקבוצות שאני מאמן") כדי לנהל אותן כאן.', 'Add teams in your profile to manage them here.')}</p>
          {onNavigate && (
            <button type="button" className="btn-primary empty-cta" onClick={() => onNavigate('profile')}>
              {L('לעריכת הפרופיל', 'Edit profile')}
            </button>
          )}
        </div>
      </div>
    )
  }

  const injured = players.filter((p) => p.status !== 'active').length
  const impLeagues = imp ? (imp.showAll ? leaguesAll : (leaguesForAge(leaguesAll, imp.age).length ? leaguesForAge(leaguesAll, imp.age) : leaguesAll)) : []

  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('הקבוצות שלי', 'My Teams')}</div>
          <h2>{L('ניהול קבוצה', 'Team Management')}</h2>
          <p className="page-desc">{L('סגל, מטרות, משחקים וטבלת הליגה — לכל קבוצה שאתה מאמן.', 'Roster, goals, games and league table — for every team you coach.')}</p>
        </div>
      </header>

      <div className="chips" style={{ marginTop: 12 }}>
        {teams.map((tm) => (
          <button key={tm} className={team === tm ? 'chip selected' : 'chip'} onClick={() => setTeam(tm)}>{trTeam(tm)}</button>
        ))}
      </div>

      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={tab === 'roster' ? 'tab active' : 'tab'} onClick={() => setTab('roster')}><Users2 size={15} /> {L('סגל', 'Roster')}</button>
        <button className={tab === 'attendance' ? 'tab active' : 'tab'} onClick={() => setTab('attendance')}><UserCheck size={15} /> {L('נוכחות', 'Attendance')}</button>
        <button className={tab === 'goals' ? 'tab active' : 'tab'} onClick={() => setTab('goals')}><Target size={15} /> {L('מטרות', 'Goals')}</button>
        <button className={tab === 'games' ? 'tab active' : 'tab'} onClick={() => setTab('games')}><CalendarClock size={15} /> {L('משחקים', 'Games')}</button>
        <button className={tab === 'table' ? 'tab active' : 'tab'} onClick={() => setTab('table')}><Trophy size={15} /> {L('טבלה', 'Table')}</button>
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>{L('טוען...', 'Loading...')}</p>
      ) : tab === 'roster' ? (
        /* ===================== סגל ===================== */
        <div className="team-section">
          <p className="muted small">
            {L(`${players.length} שחקנים`, `${players.length} players`)}
            {injured > 0 ? L(` · ${injured} לא זמינים`, ` · ${injured} unavailable`) : ''}
            {L(' · לחיצה על שחקן לפרטים מלאים', ' · tap a player for full details')}
          </p>
          <div className="roster-add">
            <input className="finder-input" type="text" value={pName} onChange={(e) => setPName(e.target.value)}
              placeholder={L('שם השחקן', 'Player name')} onKeyDown={(e) => e.key === 'Enter' && addPlayer()} />
            <input className="finder-input roster-num" type="text" value={pNum} onChange={(e) => setPNum(e.target.value)} placeholder={L('מס׳', '#')} dir="ltr" />
            <button className="btn-primary" style={{ marginTop: 0 }} onClick={addPlayer}><Plus size={16} /></button>
          </div>
          {players.length === 0 ? (
            <p className="muted small" style={{ marginTop: 12 }}>{L('עדיין אין שחקנים בסגל.', 'No players in the roster yet.')}</p>
          ) : (
            <ul className="roster-list">
              {players.map((p) => (
                <li key={p.id} className="roster-row roster-clickable" onClick={() => setPEdit({ ...p })}>
                  {p.number ? <span className="roster-jersey">{p.number}</span> : <Avatar name={p.name} size={34} />}
                  <span className="roster-name">
                    {p.name}
                    {(p.position || p.injury_note) && (
                      <span className="roster-sub muted small">
                        {p.position || ''}{p.position && p.injury_note ? ' · ' : ''}
                        {p.injury_note && (
                          <span className="injury-flag"><Bandage size={12} /> {p.injury_note}</span>
                        )}
                      </span>
                    )}
                  </span>
                  <button className={`status-pill status-${p.status}`} onClick={(e) => { e.stopPropagation(); cycleStatus(p) }} title={L('שנה סטטוס', 'Change status')}>
                    {statusLabel(p.status)}
                  </button>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setPEdit({ ...p }) }} aria-label={L('פרטים', 'Details')}><Info size={15} /></button>
                </li>
              ))}
            </ul>
          )}

          {/* ---- צוות מקצועי ---- */}
          <div className="staff-block">
            <h3 className="staff-head"><Briefcase size={16} /> {L('צוות מקצועי', 'Professional staff')}</h3>
            <p className="muted small">{L('עוזר מאמן, מאמן גופני, פיזיותרפיסט, מנהל קבוצה ועוד — לחיצה לעריכה.', 'Assistant, fitness coach, physio, team manager and more — tap to edit.')}</p>
            <div className="staff-add">
              <input className="finder-input" type="text" value={sForm.name} onChange={(e) => setSForm((f) => ({ ...f, name: e.target.value }))} placeholder={L('שם', 'Name')} onKeyDown={(e) => e.key === 'Enter' && addStaff()} />
              <select className="finder-input staff-role-sel" value={sForm.role} onChange={(e) => setSForm((f) => ({ ...f, role: e.target.value }))}>
                {STAFF_ROLES.map((r) => <option key={r.key} value={r.key}>{L(r.he, r.en)}</option>)}
              </select>
              <button className="btn-primary" style={{ marginTop: 0 }} onClick={addStaff}><Plus size={16} /></button>
            </div>
            {staff.length === 0 ? (
              <p className="muted small" style={{ marginTop: 10 }}>{L('עדיין לא הוסף צוות מקצועי.', 'No staff added yet.')}</p>
            ) : (
              <ul className="roster-list">
                {staff.map((s) => (
                  <li key={s.id} className="roster-row roster-clickable" onClick={() => setSEdit({ ...s })}>
                    <span className="staff-ic"><Briefcase size={16} /></span>
                    <span className="roster-name">
                      {s.name}
                      <span className="roster-sub muted small">{roleLabel(s.role)}{s.phone ? ` · ${s.phone}` : ''}</span>
                    </span>
                    {s.phone && <a className="icon-btn" href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} aria-label={L('חיוג', 'Call')}><Phone size={15} /></a>}
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setSEdit({ ...s }) }} aria-label={L('עריכה', 'Edit')}><Pencil size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : tab === 'attendance' ? (
        /* ===================== נוכחות ===================== */
        <Attendance session={session} team={team} players={players} />
      ) : tab === 'goals' ? (
        /* ===================== מטרות (בורר שבוע/חודש) ===================== */
        <div className="team-section">
          <p className="muted small" style={{ marginBottom: 12 }}>{L('תכנן מטרות לכל שבוע וחודש — גם קדימה. דפדף בין התקופות ושמור.', 'Plan goals for any week and month — even ahead. Browse periods and save.')}</p>
          <div className="goals-grid2">
            {/* שבוע */}
            <div className="goal-card-v2 gc-week">
              <div className="goal-card-top"><span className="goal-ic"><CalendarRange size={17} /></span><h3>{L('מטרות השבוע', 'Weekly goals')}</h3></div>
              <div className="period-pill">
                <button className="period-arrow" onClick={() => setGWeek((d) => addDays(d, -7))} aria-label={L('שבוע קודם', 'Prev week')}><ChevronRight size={17} /></button>
                <span className="period-text" dir="ltr">{weekLabel(gWeek)}</span>
                <button className="period-arrow" onClick={() => setGWeek((d) => addDays(d, 7))} aria-label={L('שבוע הבא', 'Next week')}><ChevronLeft size={17} /></button>
              </div>
              <button className="period-today2" onClick={() => setGWeek(sundayOf(new Date()))}><RotateCcw size={13} /> {L('חזרה לשבוע הנוכחי', 'Back to this week')}</button>
              <textarea className="finder-input goal-text" rows={6} value={wText} onChange={(e) => setWText(e.target.value)} placeholder={L('מה רוצים להשיג השבוע...', 'What to achieve this week...')} />
              <button className="btn-primary goal-save" onClick={() => saveGoal('week', ymd(gWeek), wText)}><Save size={15} /> {L('שמירת מטרות השבוע', 'Save weekly goals')}</button>
            </div>

            {/* חודש */}
            <div className="goal-card-v2 gc-month">
              <div className="goal-card-top"><span className="goal-ic"><CalendarDays size={17} /></span><h3>{L('מטרות החודש', 'Monthly goals')}</h3></div>
              <div className="period-pill">
                <button className="period-arrow" onClick={() => setGMonth((d) => addMonths(d, -1))} aria-label={L('חודש קודם', 'Prev month')}><ChevronRight size={17} /></button>
                <span className="period-text">{monthLabel(gMonth)}</span>
                <button className="period-arrow" onClick={() => setGMonth((d) => addMonths(d, 1))} aria-label={L('חודש הבא', 'Next month')}><ChevronLeft size={17} /></button>
              </div>
              <button className="period-today2" onClick={() => setGMonth(addMonths(new Date(), 0))}><RotateCcw size={13} /> {L('חזרה לחודש הנוכחי', 'Back to this month')}</button>
              <textarea className="finder-input goal-text" rows={6} value={mText} onChange={(e) => setMText(e.target.value)} placeholder={L('מה רוצים להשיג החודש...', 'What to achieve this month...')} />
              <button className="btn-primary goal-save" onClick={() => saveGoal('month', monthKey(gMonth), mText)}><Save size={15} /> {L('שמירת מטרות החודש', 'Save monthly goals')}</button>
            </div>

            {/* עונה */}
            <div className="goal-card-v2 gc-season">
              <div className="goal-card-top"><span className="goal-ic"><Target size={17} /></span><h3>{L('מטרות העונה', 'Season goals')}</h3></div>
              <p className="muted small" style={{ margin: '0 0 8px' }}>{L('היעדים הגדולים של העונה כולה.', 'The big targets for the whole season.')}</p>
              <textarea className="finder-input goal-text" rows={6} value={sText} onChange={(e) => setSText(e.target.value)} placeholder={L('יעדי העונה...', 'Season targets...')} />
              <button className="btn-primary goal-save" onClick={() => saveGoal('season', '', sText)}><Save size={15} /> {L('שמירת מטרות העונה', 'Save season goals')}</button>
            </div>
          </div>
        </div>
      ) : tab === 'games' ? (
        /* ===================== משחקים ===================== */
        <div className="team-section">
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

          {games.length === 0 ? (
            <p className="muted small" style={{ marginTop: 12 }}>{L('עדיין אין משחקים. הוסף ידנית או ייבא מהאיגוד.', 'No games yet. Add manually or import.')}</p>
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
                  <button className="icon-btn" onClick={() => setGEdit({ ...gm })} aria-label={L('עריכה', 'Edit')}><Pencil size={15} /></button>
                  <button className="icon-btn" onClick={() => delGame(gm.id)} aria-label={L('מחק', 'Delete')}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        /* ===================== טבלת ליגה ===================== */
        <div className="team-section">
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
      )}

      {/* ===================== מודאל: ייבוא מהאיגוד ===================== */}
      {imp && (
        <div className="tm-overlay" onClick={() => setImp(null)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-head">
              <strong>{L('קישור לאיגוד הכדורסל', 'Link to the association')}</strong>
              <button className="icon-btn" onClick={() => setImp(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>

            {/* שלב 1 — קטגוריית גיל */}
            <label className="pf-label">{L('שכבת גיל', 'Age category')}
              <select className="finder-input" value={imp.age} onChange={(e) => setImp((s) => ({ ...s, age: e.target.value }))}>
                {teams.map((tm) => <option key={tm} value={tm}>{trTeam(tm)}</option>)}
              </select>
            </label>

            {/* שלב 2 — אזור/ליגה */}
            <label className="pf-label" style={{ marginTop: 10 }}>{L('אזור / ליגה ספציפית', 'Region / specific league')}
              <select className="finder-input" value={imp.leagueId} onChange={(e) => pickLeague(e.target.value)} disabled={imp.busy && !leaguesAll.length}>
                <option value="">{imp.busy && !leaguesAll.length ? L('טוען ליגות...', 'Loading leagues...') : L('— בחר ליגה —', '— Choose a league —')}</option>
                {impLeagues.map((l) => <option key={l.id} value={l.id}>{l.name}{regionOf(l.name) ? '' : ''}</option>)}
              </select>
            </label>
            <label className="switch-row" style={{ marginTop: 6 }}>
              <span className="switch"><input type="checkbox" checked={imp.showAll} onChange={(e) => setImp((s) => ({ ...s, showAll: e.target.checked }))} /><span className="switch-track" /></span>
              <span className="switch-text">{L('הצג את כל הליגות (לא רק לפי הגיל)', 'Show all leagues (not only by age)')}</span>
            </label>

            {/* שלב 3 — קבוצה */}
            {imp.leagueId && (
              <label className="pf-label" style={{ marginTop: 10 }}>{L('הקבוצה שלך בליגה', 'Your team in the league')}
                <select className="finder-input" value={imp.teamId} onChange={(e) => pickTeam(e.target.value)} disabled={imp.busy}>
                  <option value="">{imp.busy ? L('טוען קבוצות...', 'Loading teams...') : L('— בחר את הקבוצה שלך —', '— Choose your team —')}</option>
                  {imp.teams.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </label>
            )}

            {/* שלב 4 — משחקים */}
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

      {/* ===================== מודאל: פרטי שחקן ===================== */}
      {pEdit && (
        <div className="tm-overlay" onClick={() => setPEdit(null)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-head">
              <strong>{L('פרטי שחקן', 'Player details')}</strong>
              <button className="icon-btn" onClick={() => setPEdit(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <div className="form-grid-2">
              <label className="pf-label">{L('שם', 'Name')}
                <input className="finder-input" value={pEdit.name || ''} onChange={(e) => setPEdit((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label className="pf-label">{L('מספר חולצה', 'Jersey #')}
                <input className="finder-input" dir="ltr" value={pEdit.number || ''} onChange={(e) => setPEdit((p) => ({ ...p, number: e.target.value }))} />
              </label>
              <label className="pf-label">{L('עמדה', 'Position')}
                <input className="finder-input" value={pEdit.position || ''} onChange={(e) => setPEdit((p) => ({ ...p, position: e.target.value }))} placeholder={L('שולייה / רכז / סנטר...', 'Guard / Forward / Center...')} />
              </label>
              <label className="pf-label">{L('שנת לידה', 'Birth year')}
                <input className="finder-input" dir="ltr" inputMode="numeric" value={pEdit.birth_year || ''} onChange={(e) => setPEdit((p) => ({ ...p, birth_year: e.target.value }))} placeholder="2012" />
              </label>
            </div>
            <label className="pf-label" style={{ marginTop: 8 }}>{L('טלפון (שחקן/הורה)', 'Phone (player/parent)')}
              <input className="finder-input" type="tel" dir="ltr" value={pEdit.phone || ''} onChange={(e) => setPEdit((p) => ({ ...p, phone: e.target.value }))} placeholder="050-0000000" />
            </label>
            <label className="pf-label" style={{ marginTop: 8 }}>{L('סטטוס', 'Status')}
              <select className="finder-input" value={pEdit.status} onChange={(e) => setPEdit((p) => ({ ...p, status: e.target.value }))}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{L(s.he, s.en)}</option>)}
              </select>
            </label>
            {pEdit.status === 'injured' && (
              <label className="pf-label" style={{ marginTop: 8 }}>{L('פרטי פציעה', 'Injury details')}
                <input className="finder-input" value={pEdit.injury_note || ''} onChange={(e) => setPEdit((p) => ({ ...p, injury_note: e.target.value }))} placeholder={L('קרסול, חוזר בעוד שבועיים...', 'Ankle, back in 2 weeks...')} />
              </label>
            )}
            <label className="pf-label" style={{ marginTop: 8 }}>{L('מידע נוסף', 'Notes')}
              <textarea className="finder-input" rows={3} value={pEdit.notes || ''} onChange={(e) => setPEdit((p) => ({ ...p, notes: e.target.value }))} placeholder={L('חוזקות, נקודות לשיפור, הערות...', 'Strengths, areas to improve, notes...')} />
            </label>
            <div className="tm-modal-actions">
              <button className="btn-primary" onClick={savePlayer}><Save size={15} /> {L('שמירה', 'Save')}</button>
              <button className="btn-ghost danger" onClick={() => delPlayer(pEdit.id)}><Trash2 size={15} /> {L('הסר שחקן', 'Remove')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== מודאל: עריכת משחק ===================== */}
      {gEdit && (
        <div className="tm-overlay" onClick={() => setGEdit(null)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
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

      {/* ===================== מודאל: איש צוות ===================== */}
      {sEdit && (
        <div className="tm-overlay" onClick={() => setSEdit(null)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-head">
              <strong>{L('פרטי איש צוות', 'Staff details')}</strong>
              <button className="icon-btn" onClick={() => setSEdit(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <label className="pf-label">{L('שם', 'Name')}
              <input className="finder-input" value={sEdit.name || ''} onChange={(e) => setSEdit((s) => ({ ...s, name: e.target.value }))} />
            </label>
            <label className="pf-label" style={{ marginTop: 8 }}>{L('תפקיד', 'Role')}
              <select className="finder-input" value={sEdit.role || 'assistant'} onChange={(e) => setSEdit((s) => ({ ...s, role: e.target.value }))}>
                {STAFF_ROLES.map((r) => <option key={r.key} value={r.key}>{L(r.he, r.en)}</option>)}
              </select>
            </label>
            <label className="pf-label" style={{ marginTop: 8 }}>{L('טלפון', 'Phone')}
              <input className="finder-input" type="tel" dir="ltr" value={sEdit.phone || ''} onChange={(e) => setSEdit((s) => ({ ...s, phone: e.target.value }))} placeholder="050-0000000" />
            </label>
            <label className="pf-label" style={{ marginTop: 8 }}>{L('הערות', 'Notes')}
              <textarea className="finder-input" rows={3} value={sEdit.notes || ''} onChange={(e) => setSEdit((s) => ({ ...s, notes: e.target.value }))} />
            </label>
            <div className="tm-modal-actions">
              <button className="btn-primary" onClick={saveStaff}><Save size={15} /> {L('שמירה', 'Save')}</button>
              <button className="btn-ghost danger" onClick={() => delStaff(sEdit.id)}><Trash2 size={15} /> {L('הסר', 'Remove')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
