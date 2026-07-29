import { useState, useEffect, useRef } from 'react'
import {
  Plus, Trash2, Users2, Target, CalendarClock, X,
  Pencil, Save, Trophy, ChevronRight, ChevronLeft, Download, Info,
  Briefcase, Phone, CalendarRange, CalendarDays, RotateCcw, Bandage,
  UserCheck, MessageSquareHeart, Star, Send as SendIcon,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import Avatar from './Avatar'
import SessionDetail from './SessionDetail'
// סיומת מפורשת: ב-Windows (מערכת קבצים לא רגישה לאות גדולה) Vite היה פותר
// את './SendToPlayers' לקובץ העזר sendToPlayers.js — ואז הרכיב קרס במסך לבן.
import SendToPlayers from './SendToPlayers.jsx'
import TeamAssignments from './TeamAssignments'
import TeamSlots from './TeamSlots'
import TeamGoalsBoard from './TeamGoalsBoard'
import TeamFocus from './TeamFocus'
import { PlayerGoalsEditor } from './PlayerGoals'
import { L, trTeam, cnt } from './i18n'
import { confirmDialog } from './confirm'
import useFocusTrap from './useFocusTrap'
import LeagueTable from './LeagueTable'
import TeamGames from './TeamGames'
import TeamConnect from './TeamConnect'
import Page from './Page'
import { ChevronFwd } from './DirIcon'
import { sendNotification } from './notify'
import { SkeletonRoster } from './Skeleton'

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
  return isNaN(d) ? str : d.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })
}
const sundayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n, 1); return x }
const weekLabel = (sun) => { const sat = addDays(sun, 6); return `${sun.getDate()}.${sun.getMonth() + 1} – ${sat.getDate()}.${sat.getMonth() + 1}.${sat.getFullYear()}` }
const monthLabel = (d) => d.toLocaleDateString(L('he-IL', 'en-US'), { month: 'long', year: 'numeric' })
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

export default function Teams({ session, profile, onNavigate, initialTab, onConsumeInitialTab }) {
  const me = session.user.id
  const teams = profile?.age_groups || []
  const [team, setTeam] = useState(teams[0] || '')
  // הטאב «שיגורים» התמזג לתוך «מטרות ומשימות», ולכן יעד ישן מנותב אליו
  const [tab, setTab] = useState(initialTab === 'tasks' ? 'goals' : (initialTab || 'roster'))
  const [sub, setSub] = useState(null) // null | 'games' — מסך המשחקים והטבלה
  const [players, setPlayers] = useState([])
  const [attByPlayer, setAttByPlayer] = useState({})
  const [staff, setStaff] = useState([])
  const [goalsMap, setGoalsMap] = useState({}) // 'period|key' -> content
  const [games, setGames] = useState([])
  const [iba, setIba] = useState(null) // קישור שמור לליגה באיגוד
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false) // טעינה שנכשלה != סגל ריק

  // הוספת שחקן / צוות
  const [pName, setPName] = useState('')
  const [pNum, setPNum] = useState('')
  const [reviewPractice, setReviewPractice] = useState(null)
  const [gpEdit, setGpEdit] = useState(null) // עריכת מטרות מהירה לשחקן {player_id, name, team}
  const [sForm, setSForm] = useState({ name: '', role: 'assistant', phone: '' })

  // עריכה (מודאלים)
  const [pEdit, setPEdit] = useState(null)
  const [sEdit, setSEdit] = useState(null)


  // משוב לשחקן (בתוך מודל השחקן)
  const [fbText, setFbText] = useState('')
  const [fbRating, setFbRating] = useState(0)
  const [fbHistory, setFbHistory] = useState([]) // 5 המשובים האחרונים לשחקן הפתוח
  useEffect(() => {
    if (!pEdit?.player_id) { setFbHistory([]); return }
    ;(async () => {
      const { data } = await supabase.from('player_feedback')
        .select('id, content, rating, created_at')
        .eq('coach_id', me).eq('player_id', pEdit.player_id)
        .order('created_at', { ascending: false }).limit(5)
      setFbHistory(data || [])
    })()
  }, [pEdit?.player_id, me])
  const sendFeedback = async () => {
    if (!pEdit?.player_id || !fbText.trim()) return
    const { error } = await supabase.from('player_feedback').insert({
      coach_id: me, player_id: pEdit.player_id,
      content: fbText.trim(), rating: fbRating || null,
    })
    if (error) { toast.error(L('שליחת המשוב נכשלה: ', 'Failed to send feedback: ') + error.message); return }
    sendNotification({ to: pEdit.player_id, actor: me, type: 'message', content: 'קיבלת משוב חדש מהמאמן', nav: 'feedback' })
    setFbText(''); setFbRating(0)
    setFbHistory((h) => [{ id: Date.now(), content: fbText.trim(), rating: fbRating || null, created_at: new Date().toISOString() }, ...h].slice(0, 5))
    toast.success(L('המשוב נשלח לשחקן', 'Feedback sent to the player'))
  }

  // מטרות — בורר שבוע/חודש
  const [gWeek, setGWeek] = useState(sundayOf(new Date()))
  const [gMonth, setGMonth] = useState(addMonths(new Date(), 0))
  const [wText, setWText] = useState('')
  const [mText, setMText] = useState('')
  const [sText, setSText] = useState('')

  // [7] Escape סוגר את המודאל הפתוח (בלי לשמור — כמו לחיצה על X)
  useEffect(() => {
    const anyOpen = pEdit || sEdit
    if (!anyOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (pEdit) setPEdit(null)
      else if (sEdit) setSEdit(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pEdit, sEdit])

  // מלכודת פוקוס לכל המודאלים (רק אחד פתוח בכל רגע)
  const anyDialog = pEdit || sEdit || gpEdit
  const dlgRef = useFocusTrap(!!anyDialog, () => {
    if (pEdit) setPEdit(null); else if (sEdit) setSEdit(null); else if (gpEdit) setGpEdit(null)
  })

  // יעד-עומק נצרך פעם אחת: כניסה מאוחרת יותר ל«הקבוצה שלי» תיפתח על הסגל,
  // ולא תיזכר לנצח בטאב שהגיע מהלו"ז.
  useEffect(() => { if (initialTab) onConsumeInitialTab?.() /* eslint-disable-next-line */ }, [])

  const loadTokenRef = useRef(0) // הגנה מפני מרוץ טעינות בהחלפת קבוצה מהירה

  async function load() {
    if (!team) { setLoading(false); return }
    // מזהה טעינה — החלפת קבוצה מהירה לא תיתן לתוצאה ישנה לדרוס את החדשה
    const token = ++loadTokenRef.current
    setLoading(true)
    const [pl, gl, gm, im, st, at] = await Promise.all([
      supabase.from('team_players').select('*').eq('coach_id', me).eq('team', team).order('created_at'),
      supabase.from('team_goals').select('*').eq('coach_id', me).eq('team', team),
      supabase.from('team_games').select('*').eq('coach_id', me).eq('team', team).order('game_date'),
      supabase.from('team_iba').select('*').eq('coach_id', me).eq('team', team).maybeSingle(),
      supabase.from('team_staff').select('*').eq('coach_id', me).eq('team', team).order('created_at'),
      supabase.from('practice_attendance').select('player_id, status').eq('coach_id', me).eq('team', team),
    ])
    if (token !== loadTokenRef.current) return // קבוצה אחרת נבחרה בינתיים — מתעלמים
    // אם קריאה מרכזית נכשלה (רשת) — מודיעים שזו תקלת טעינה, לא קבוצה ריקה
    const failed = !!(pl.error || gm.error)
    setLoadFailed(failed)
    if (failed) toast.error(L('טעינת הקבוצה נכשלה — בדוק חיבור ורענן', 'Failed to load the team — check your connection and refresh'))
    setStaff(st && !st.error ? st.data || [] : [])
    setPlayers(pl.error ? [] : pl.data || [])
    // נוכחות עונתית לכל שחקן: נוכח/איחר מתוך סך האימונים שסומנו
    const att = {}
    if (at && !at.error) {
      for (const r of at.data || []) {
        const a = att[r.player_id] || { present: 0, total: 0 }
        a.total += 1
        if (r.status !== 'absent') a.present += 1
        att[r.player_id] = a
      }
    }
    setAttByPlayer(att)
    const map = {}
    ;(gl.error ? [] : gl.data || []).forEach((r) => { map[`${r.period}|${r.period_key || ''}`] = r.content || '' })
    setGoalsMap(map)
    setGames(gm.error ? [] : gm.data || [])
    setIba(im && !im.error ? im.data : null)
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [team])
  useEffect(() => () => { loadTokenRef.current++ }, []) // ביטול טעינה תלויה בעת יציאה

  // סנכרון תיבות המטרות — כל תיבה מסתנכרנת רק כשהערך *שלה* משתנה (החלפת תקופה או
  // טעינה מהמסד). תלות בערך הספציפי ולא באובייקט כולו — כדי ששמירת תיבה אחת
  // לא תדרוס טקסט שטרם נשמר בתיבות האחרות.
  const wKey = `week|${ymd(gWeek)}`
  const mKey = `month|${monthKey(gMonth)}`
  useEffect(() => { setWText(goalsMap[wKey] || '') }, [goalsMap[wKey], wKey])
  useEffect(() => { setMText(goalsMap[mKey] || '') }, [goalsMap[mKey], mKey])
  useEffect(() => { setSText(goalsMap['season|'] || '') }, [goalsMap['season|']])

  // ייצוא הסגל לקובץ CSV (נפתח באקסל, כולל BOM לעברית תקינה)
  const exportRosterCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = [
      L('שם', 'Name'), L('מספר', 'Number'), L('עמדה', 'Position'),
      L('שנת לידה', 'Birth year'), L('טלפון', 'Phone'), L('סטטוס', 'Status'),
      L('נוכחות עונתית', 'Season attendance'),
    ]
    const rows = players.map((p) => {
      const a = attByPlayer[p.id]
      const att = a && a.total ? Math.round((a.present / a.total) * 100) + '%' : ''
      return [p.name, p.number, p.position, p.birth_year, p.phone, statusLabel(p.status), att]
    })
    const csv = '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const aEl = document.createElement('a')
    aEl.href = URL.createObjectURL(blob)
    aEl.download = `${team || 'roster'}.csv`
    document.body.appendChild(aEl)
    aEl.click()
    aEl.remove()
    setTimeout(() => URL.revokeObjectURL(aEl.href), 5000)
  }

  // ---------- שחקנים ----------
  const addPlayer = async () => {
    if (!pName.trim()) return
    const { error } = await supabase.from('team_players').insert({ coach_id: me, team, name: pName.trim(), number: pNum.trim() || null, status: 'active' })
    if (error) { console.error('teams add:', error.message); toast.error(L('ההוספה נכשלה — נסו שוב בעוד רגע.', 'Add failed — try again in a moment.')); return }
    setPName(''); setPNum(''); load()
  }
  const cycleStatus = async (p) => {
    const next = STATUSES[(STATUSES.findIndex((s) => s.key === p.status) + 1) % STATUSES.length].key
    // כשל עדכון היה נבלע בשקט: הצ׳יפ חוזר לערך הקודם בטעינה הבאה בלי הסבר
    const { error } = await supabase.from('team_players').update({ status: next }).eq('id', p.id)
    if (error) { toast.error(L('עדכון הסטטוס נכשל', 'Status update failed')); return }
    load()
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
    if (!(await confirmDialog({ message: L('להסיר את השחקן?', 'Remove this player?'), danger: true }))) return
    await supabase.from('team_players').delete().eq('id', id); setPEdit(null); load()
  }

  // ---------- צוות מקצועי ----------
  const addStaff = async () => {
    if (!sForm.name.trim()) return
    const { error } = await supabase.from('team_staff').insert({ coach_id: me, team, name: sForm.name.trim(), role: sForm.role, phone: sForm.phone.trim() || null })
    if (error) { console.error('teams add:', error.message); toast.error(L('ההוספה נכשלה — נסו שוב בעוד רגע.', 'Add failed — try again in a moment.')); return }
    setSForm({ name: '', role: sForm.role, phone: '' }); load()
  }
  const saveStaff = async () => {
    const s = sEdit
    const { error } = await supabase.from('team_staff').update({ name: (s.name || '').trim(), role: s.role, phone: s.phone || null, notes: s.notes || null }).eq('id', s.id)
    if (error) { toast.error(L('שמירה נכשלה: ', 'Save failed: ') + error.message); return }
    toast.success(L('פרטי הצוות נשמרו', 'Staff saved')); setSEdit(null); load()
  }
  const delStaff = async (id) => {
    if (!(await confirmDialog({ message: L('להסיר מאיש הצוות?', 'Remove this staff member?'), danger: true }))) return
    await supabase.from('team_staff').delete().eq('id', id); setSEdit(null); load()
  }

  // ---------- מטרות ----------
  const saveGoal = async (period, key, content) => {
    const { error } = await supabase.from('team_goals').upsert(
      { coach_id: me, team, period, period_key: key, content, updated_at: new Date().toISOString() },
      { onConflict: 'coach_id,team,period,period_key' }
    )
    if (error) { console.error('teams save:', error.message); toast.error(L('השמירה נכשלה — נסו שוב בעוד רגע.', 'Save failed — try again in a moment.')); return }
    setGoalsMap((m) => ({ ...m, [`${period}|${key}`]: content }))
    toast.success(L('המטרות נשמרו', 'Goals saved'))
  }

  if (teams.length === 0) {
    return (
      <Page eyebrow={L('הקבוצות שלי', 'My teams')} title={L('ניהול קבוצה', 'Team management')} size="sm">
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
      </Page>
    )
  }

  const injured = players.filter((p) => p.status !== 'active').length
  // נוכחות עונתית ממוצעת של הקבוצה — הצ׳יפ השני בבאנר של מסך 4a
  const attPcts = players.map((p) => attByPlayer[p.id]).filter((a) => a && a.total).map((a) => a.present / a.total)
  const teamAtt = attPcts.length ? Math.round((attPcts.reduce((s, x) => s + x, 0) / attPcts.length) * 100) : null

  // משחקים וטבלה — מסך משלהם, נפתח מכאן וחוזר לכאן
  if (sub === 'games') {
    return <TeamGames session={session} profile={profile} team={team} teams={teams} onBack={() => { setSub(null); load() }} />
  }

  return (
    <Page
      eyebrow={profile?.club || L('הקבוצה שלי', 'My team')}
      title={trTeam(team)}
      size="sm"
      actions={(
        <div className="team-hero-stats">
          <span className="cs-hero-pill">{L(`${players.length} שחקנים`, `${players.length} players`)}</span>
          {teamAtt != null && <span className="cs-hero-pill">{L('נוכחות ', 'Attendance ')}<b dir="ltr">{teamAtt}%</b></span>}
          {injured > 0 && <span className="cs-hero-pill">{L(`${injured} לא זמינים`, `${injured} unavailable`)}</span>}
        </div>
      )}
    >
      {teams.length > 1 && (
        <div className="chips team-switch">
          {teams.map((tm) => (
            <button key={tm} className={team === tm ? 'chip selected' : 'chip'} onClick={() => setTeam(tm)}>{trTeam(tm)}</button>
          ))}
        </div>
      )}

      {/* שלושה טאבים, בדיוק כמו במסך 4a במסמך המסירה: סגל · לו״ז ונוכחות ·
          מטרות ומשימות. עד היום היו כאן שבעה — ב-384px הם נחתכו בתוך מכל
          של 350px ו"שיגורים", "צ׳אט" ו"טבלה" היו בלתי נגישים בטלפון.
          הצ׳אט עבר למסך ההודעות (מסך 7a), והמשחקים והטבלה למסך משלהם. */}
      <div className="tabs team-tabs" style={{ marginTop: 14 }}>
        <button className={tab === 'roster' ? 'tab active' : 'tab'} onClick={() => setTab('roster')}><Users2 size={15} /> {L('סגל', 'Roster')}</button>
        <button className={tab === 'practices' ? 'tab active' : 'tab'} onClick={() => setTab('practices')}><CalendarClock size={15} /> {L('לו״ז ונוכחות', 'Schedule')}</button>
        <button className={tab === 'goals' ? 'tab active' : 'tab'} onClick={() => setTab('goals')}><Target size={15} /> {L('מטרות ומשימות', 'Goals & tasks')}</button>
      </div>

      {loading ? (
        <SkeletonRoster count={6} />
      ) : tab === 'roster' ? (
        /* ===================== סגל (פריסת מסך היעד 09: טבלה + פאנל צד) ===================== */
        <div className="team-split">
        <div className="team-section team-split-main">
          <div className="roster-meta-row">
            <p className="muted small" style={{ margin: 0 }}>
              {L(`${cnt(players.length, 'שחקן אחד', 'שחקנים')}`, `${players.length} players`)}
              {injured > 0 ? L(` · ${injured} לא זמינים`, ` · ${injured} unavailable`) : ''}
              {L(' · לחיצה על שחקן לפרטים מלאים', ' · tap a player for full details')}
            </p>
            {players.length > 0 && (
              /* ייצוא = פעולת אדמין נדירה — אייקון בלבד, לא טקסט בזרימה הראשית */
              <button type="button" className="icon-btn roster-export" onClick={exportRosterCsv}
                aria-label={L('ייצוא הסגל לקובץ CSV', 'Export roster to CSV')} title={L('ייצוא CSV', 'Export CSV')}>
                <Download size={15} />
              </button>
            )}
          </div>
          <div className="roster-add">
            <input className="finder-input" type="text" value={pName} onChange={(e) => setPName(e.target.value)}
              placeholder={L('שם השחקן', 'Player name')} aria-label={L('שם השחקן', 'Player name')}
              onKeyDown={(e) => e.key === 'Enter' && addPlayer()} />
            <input className="finder-input roster-num" type="text" value={pNum} onChange={(e) => setPNum(e.target.value)}
              placeholder={L('מס׳', '#')} aria-label={L('מספר חולצה', 'Jersey number')} dir="ltr" />
            <button className="btn-primary" style={{ marginTop: 0 }} onClick={addPlayer} aria-label={L('הוספת שחקן', 'Add player')}><Plus size={16} /></button>
          </div>
          {players.length === 0 && loadFailed ? (
            /* חשוב להבדיל: סגל ריק זה מצב תקין, אבל טעינה שנכשלה נראתה עד עכשיו
               בדיוק אותו דבר — כאילו כל השחקנים נמחקו. */
            <p className="alert alert-error" style={{ marginTop: 12 }}>
              {L('לא הצלחנו לטעון את הסגל. זו תקלת טעינה — השחקנים לא נמחקו. ',
                 'We could not load the roster. This is a loading error — no players were deleted. ')}
              <button type="button" className="link-button" onClick={load}>{L('נסה שוב', 'Try again')}</button>
            </p>
          ) : players.length === 0 ? (
            <p className="muted small" style={{ marginTop: 12 }}>{L('עדיין אין שחקנים בסגל.', 'No players in the roster yet.')}</p>
          ) : (
            <>
            <div className="roster-cols" aria-hidden="true">
              <span className="rc-num">{L('מס׳', '#')}</span>
              <span className="rc-name">{L('שחקן', 'Player')}</span>
              <span className="rc-att">{L('נוכחות עונתית', 'Season attendance')}</span>
              <span className="rc-status">{L('סטטוס', 'Status')}</span>
            </div>
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
                  {(() => {
                    const a = attByPlayer[p.id]
                    const pct = a && a.total ? Math.round((a.present / a.total) * 100) : null
                    return (
                      <span className="roster-att" title={pct == null ? L('אין נתוני נוכחות', 'No attendance data') : L(`נוכחות עונתית ${pct}%`, `Season attendance ${pct}%`)}>
                        <span className={`roster-att-bar${pct != null && pct >= 85 ? ' hi' : ''}`} aria-hidden="true">
                          <span style={{ width: `${pct ?? 0}%` }} />
                        </span>
                        <span className="roster-att-pct" dir="ltr">{pct == null ? '—' : `${pct}%`}</span>
                      </span>
                    )
                  })()}
                  <button className={`status-pill status-${p.status}`} onClick={(e) => { e.stopPropagation(); cycleStatus(p) }} title={L('שנה סטטוס', 'Change status')}>
                    {statusLabel(p.status)}
                  </button>
                  {p.player_id && (
                    <button className="icon-btn roster-goals" onClick={(e) => { e.stopPropagation(); setGpEdit({ player_id: p.player_id, name: p.name, team }) }} aria-label={L('מטרות', 'Goals')} title={L('מטרות אישיות', 'Personal goals')}><Target size={15} /></button>
                  )}
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setPEdit({ ...p }) }} aria-label={L('פרטים', 'Details')}><Info size={15} /></button>
                </li>
              ))}
            </ul>
            </>
          )}

          {/* קוד ההצטרפות ירד לכאן: הסגל הוא הסיבה שנכנסים לטאב הזה, והקוד
              תפס את כל החלק העליון של המסך בכל כניסה. */}
          <TeamConnect coachId={me} team={team} onApproved={load} />

          {/* משחקים וטבלה — מסך משלהם. בטלפון אין פאנל צד, ולכן זו הדלת
              היחידה אליהם, והיא חייבת להיות בזרימה הראשית. */}
          <button type="button" className="team-link-row" onClick={() => setSub('games')}>
            <span className="tlr-ic"><Trophy size={17} /></span>
            <span className="tlr-text">
              <strong>{L('משחקים וטבלה', 'Games & table')}</strong>
              <span className="muted small">{L('לוח המשחקים, ייבוא מהאיגוד וטבלת הליגה', 'Fixtures, association import and the league table')}</span>
            </span>
            <ChevronFwd size={17} aria-hidden="true" />
          </button>

          {/* ---- צוות מקצועי — מקופל: רוב מאמני הנוער לא מנהלים צוות ---- */}
          <details className="tg-collapse staff-block">
            <summary><Briefcase size={15} /> {L('צוות מקצועי', 'Professional staff')}</summary>
            <p className="muted small">{L('עוזר מאמן, מאמן גופני, פיזיותרפיסט, מנהל קבוצה ועוד — לחיצה לעריכה.', 'Assistant, fitness coach, physio, team manager and more — tap to edit.')}</p>
            <div className="staff-add">
              <input className="finder-input" type="text" value={sForm.name} onChange={(e) => setSForm((f) => ({ ...f, name: e.target.value }))} placeholder={L('שם', 'Name')} aria-label={L('שם איש הצוות', 'Staff member name')} onKeyDown={(e) => e.key === 'Enter' && addStaff()} />
              <select className="finder-input staff-role-sel" aria-label={L('תפקיד', 'Role')} value={sForm.role} onChange={(e) => setSForm((f) => ({ ...f, role: e.target.value }))}>
                {STAFF_ROLES.map((r) => <option key={r.key} value={r.key}>{L(r.he, r.en)}</option>)}
              </select>
              <button className="btn-primary" style={{ marginTop: 0 }} onClick={addStaff} aria-label={L('הוספת איש צוות', 'Add staff member')}><Plus size={16} /></button>
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
          </details>
        </div>

        {/* ---- פאנל צד: המשחק הבא + טבלת הליגה (מסך היעד 09) ----
             דסקטופ בלבד — מוסתר מתחת ל-940px, כי שם הוא נשפך מתחת לסגל
             ומציג בפעם השנייה תוכן שיש לו טאבים משלו. */}
        <aside className="team-side">
          {(() => {
            const today = ymd(new Date())
            const next = games.find((g) => g.game_date >= today)
            return (
              <div className="next-game-card">
                <span className="ng-eyebrow"><Trophy size={14} /> {L('המשחק הבא', 'Next game')}</span>
                {next ? (
                  <>
                    <h4 className="ng-title">{next.opponent ? L(`נגד ${next.opponent}`, `vs ${next.opponent}`) : L('משחק', 'Game')}</h4>
                    <div className="ng-meta">
                      <span><CalendarClock size={13} /> {ilFull(next.game_date)}{next.game_time ? ` · ${String(next.game_time).slice(0, 5)}` : ''}</span>
                      {next.location && <span>{next.location}</span>}
                    </div>
                    <button className="btn-primary ng-cta" onClick={() => setSub('games')}>
                      {L('לפרטי המשחק', 'Game details')}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="muted small" style={{ margin: '6px 0 10px' }}>{L('אין משחק קרוב ביומן.', 'No upcoming game.')}</p>
                    <button className="btn-soft ng-cta" onClick={() => setSub('games')}>
                      {L('הוספת משחק', 'Add a game')}
                    </button>
                  </>
                )}
              </div>
            )
          })()}
          {iba?.league_id ? (
            <div className="pr-card team-side-league">
              {/* הכותרת הוסרה: LeagueTable מרנדר כותרת בעצמו, כך ש"טבלת הליגה"
                  הופיע פעמיים. גם ה-prop compact הוסר — הרכיב לא מקבל אותו. */}
              <LeagueTable leagueId={iba.league_id} leagueName={iba.league_name} highlight={iba.iba_team_name || profile?.club} />
            </div>
          ) : (
            <div className="pr-card team-side-league">
              <h3 className="pr-card-title"><Trophy size={15} /> {L('טבלת הליגה', 'League table')}</h3>
              <p className="muted small" style={{ margin: 0 }}>{L('חבר את הקבוצה לליגת האיגוד בלשונית "טבלה" — והטבלה תופיע כאן.', 'Connect the team to its league in the "Table" tab — and the standings will show here.')}</p>
            </div>
          )}
        </aside>
        </div>
      ) : tab === 'goals' ? (
        /* ===================== מטרות =====================
           החלטת הבעלים 25.7: מטרות שבוע/חודש/עונה נשארות ובולטות (לא במגירה).
           היררכיה: המיקוד (מה שהשחקנים רואים) → שלושת כרטיסי התכנון של המאמן
           → מטרות אישיות לשחקנים. */
        <div className="team-section">
          <p className="tg-lede">
            {L('המיקוד מגיע לכל השחקנים ונמדד בסוף כל אימון · מטרות שבוע/חודש/עונה הן התכנון שלך · מטרה אישית מגיעה לשחקן אחד.',
               'The focus reaches every player and is measured after each practice · week/month/season goals are your planning · a personal goal reaches one player.')}
          </p>

          <TeamFocus coachId={me} team={team} />

          <h3 className="tg-section-title"><Target size={17} /> {L('מטרות הקבוצה', 'Team goals')}</h3>
          <div className="goals-grid2 tg-cards">
            {/* שבוע */}
            <div className="goal-card-v2 gc-week">
              <div className="goal-card-top"><span className="goal-ic"><CalendarRange size={17} /></span><h3>{L('השבוע', 'This week')}</h3></div>
              <div className="period-pill">
                <button className="period-arrow" onClick={() => setGWeek((d) => addDays(d, -7))} aria-label={L('שבוע קודם', 'Prev week')}><ChevronRight size={17} /></button>
                <span className="period-text" dir="ltr">{weekLabel(gWeek)}</span>
                <button className="period-arrow" onClick={() => setGWeek((d) => addDays(d, 7))} aria-label={L('שבוע הבא', 'Next week')}><ChevronLeft size={17} /></button>
              </div>
              {ymd(gWeek) !== ymd(sundayOf(new Date())) && (
                <button className="period-today2" onClick={() => setGWeek(sundayOf(new Date()))}><RotateCcw size={13} /> {L('חזרה לשבוע הנוכחי', 'Back to this week')}</button>
              )}
              <textarea className="finder-input goal-text" rows={4} value={wText} onChange={(e) => setWText(e.target.value)} placeholder={L('מה רוצים להשיג השבוע...', 'What to achieve this week...')} />
              <button className="btn-primary goal-save" onClick={() => saveGoal('week', ymd(gWeek), wText)}><Save size={15} /> {L('שמירה', 'Save')}</button>
            </div>

            {/* חודש */}
            <div className="goal-card-v2 gc-month">
              <div className="goal-card-top"><span className="goal-ic"><CalendarDays size={17} /></span><h3>{L('החודש', 'This month')}</h3></div>
              <div className="period-pill">
                <button className="period-arrow" onClick={() => setGMonth((d) => addMonths(d, -1))} aria-label={L('חודש קודם', 'Prev month')}><ChevronRight size={17} /></button>
                <span className="period-text">{monthLabel(gMonth)}</span>
                <button className="period-arrow" onClick={() => setGMonth((d) => addMonths(d, 1))} aria-label={L('חודש הבא', 'Next month')}><ChevronLeft size={17} /></button>
              </div>
              {monthKey(gMonth) !== monthKey(new Date()) && (
                <button className="period-today2" onClick={() => setGMonth(addMonths(new Date(), 0))}><RotateCcw size={13} /> {L('חזרה לחודש הנוכחי', 'Back to this month')}</button>
              )}
              <textarea className="finder-input goal-text" rows={4} value={mText} onChange={(e) => setMText(e.target.value)} placeholder={L('מה רוצים להשיג החודש...', 'What to achieve this month...')} />
              <button className="btn-primary goal-save" onClick={() => saveGoal('month', monthKey(gMonth), mText)}><Save size={15} /> {L('שמירה', 'Save')}</button>
            </div>

            {/* עונה */}
            <div className="goal-card-v2 gc-season">
              <div className="goal-card-top"><span className="goal-ic"><Trophy size={17} /></span><h3>{L('העונה', 'This season')}</h3></div>
              <p className="muted small" style={{ margin: '0 0 8px' }}>{L('היעדים הגדולים של העונה כולה.', 'The big targets for the whole season.')}</p>
              <textarea className="finder-input goal-text" rows={4} value={sText} onChange={(e) => setSText(e.target.value)} placeholder={L('יעדי העונה...', 'Season targets...')} />
              <button className="btn-primary goal-save" onClick={() => saveGoal('season', '', sText)}><Save size={15} /> {L('שמירה', 'Save')}</button>
            </div>
          </div>

          <TeamGoalsBoard coachId={me} team={team} />

          {/* «שיגורים» היה טאב נפרד — אבל שליחת משימה היא הדרך שבה מטרה
              הופכת לעבודה, ולכן היא יושבת כאן, מתחת למטרות. */}
          <h3 className="tg-section-title"><SendIcon size={17} /> {L('משימות לשחקנים', 'Player tasks')}</h3>
          <SendToPlayers session={session} embedded initialTeam={team} key={team} />
          <TeamAssignments coachId={me} team={team} />
        </div>
      ) : (
        /* ===================== לו״ז ונוכחות ===================== */
        <TeamSlots coachId={me} team={team} onReview={(entry) => setReviewPractice(entry)} />
      )}


      {/* ===================== מודאל: פרטי שחקן ===================== */}
      {pEdit && (
        <div className="tm-overlay" role="dialog" aria-modal="true">
          <div className="tm-modal" ref={dlgRef} onClick={(e) => e.stopPropagation()}>
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
                <input className="finder-input" value={pEdit.position || ''} onChange={(e) => setPEdit((p) => ({ ...p, position: e.target.value }))} placeholder={L('רכז / קלע / כנף / סנטר...', 'Guard / Forward / Center...')} />
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

            {/* משוב אישי — רק לשחקן עם חשבון מחובר */}
            {pEdit.player_id && (
              <div className="tm-feedback">
                <span className="field-label"><MessageSquareHeart size={15} /> {L('שליחת משוב לשחקן', 'Send feedback to player')}</span>
                <div className="tm-fb-stars" role="radiogroup" aria-label={L('דירוג', 'Rating')}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" className={n <= fbRating ? 'tm-star on' : 'tm-star'} onClick={() => setFbRating(n === fbRating ? 0 : n)} aria-label={L(`${n} כוכבים`, `${n} stars`)}>
                      <Star size={20} fill={n <= fbRating ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
                <textarea className="finder-input" rows={3} value={fbText} onChange={(e) => setFbText(e.target.value)} maxLength={2000}
                  placeholder={L('מה היה טוב באימון, ומה כדאי לשפר...', 'What went well, what to work on...')} />
                <button className="btn-soft" style={{ marginTop: 8 }} onClick={sendFeedback} disabled={!fbText.trim()}>
                  {L('שליחת המשוב', 'Send feedback')}
                </button>
                {/* מה כבר כתבת — הטופס היה insert בלבד והמאמן לא ראה את עצמו */}
                {fbHistory.length > 0 && (
                  <div className="tm-fb-history">
                    <span className="tm-fb-history-lbl">{L('משובים אחרונים ששלחת', 'Recent feedback you sent')}</span>
                    <ul>
                      {fbHistory.map((f) => (
                        <li key={f.id}>
                          <span className="tm-fb-when">{ilNum(f.created_at?.slice(0, 10))}</span>
                          {f.rating ? <span className="tm-fb-stars-mini"><Star size={11} fill="currentColor" /> {f.rating}</span> : null}
                          <span className="tm-fb-text">{f.content}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {pEdit.player_id && (
              <PlayerGoalsEditor coachId={me} playerId={pEdit.player_id} team={pEdit.team} playerName={pEdit.name} />
            )}
            {!pEdit.player_id && (
              <div className="tm-connect-hint">
                <span className="tm-connect-hint-ic"><Target size={16} /></span>
                <div>
                  <strong>{L('מטרות ומשוב אישי ייפתחו כשהשחקן יתחבר', 'Goals & personal feedback unlock once the player connects')}</strong>
                  <p className="muted small">{L('שתפו את השחקן בקוד ההצטרפות של הקבוצה (מופיע בראש טאב "סגל"). ברגע שהוא נכנס לאפליקציה ומתחבר, תוכלו להגדיר לו מטרות שבועיות/חודשיות/עונתיות ולשלוח משוב אישי — הכל יופיע אצלו מסודר.', 'Share your team join code with the player. Once they sign in, you can set them weekly/monthly/season goals and send personal feedback — it all shows up neatly on their side.')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== מודאל: איש צוות ===================== */}
      {sEdit && (
        <div className="tm-overlay" role="dialog" aria-modal="true">
          <div className="tm-modal" ref={dlgRef} onClick={(e) => e.stopPropagation()}>
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

      {reviewPractice && (
        <SessionDetail
          session={session}
          entry={reviewPractice}
          onClose={() => setReviewPractice(null)}
        />
      )}

      {/* מטרות מהירות לשחקן — נגיש מהסגל, לא קבור בעריכה */}
      {gpEdit && (
        <div className="tm-overlay" role="dialog" aria-modal="true" onClick={() => setGpEdit(null)}>
          <div className="tm-modal" ref={dlgRef} onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-head">
              <strong><Target size={16} /> {L('מטרות', 'Goals')} · {gpEdit.name}</strong>
              <button className="icon-btn" onClick={() => setGpEdit(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <div className="tm-modal-body">
              <PlayerGoalsEditor coachId={me} playerId={gpEdit.player_id} team={gpEdit.team} playerName={gpEdit.name} />
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}
