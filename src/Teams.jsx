import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Plus, Trash2, Users2, Target, CalendarClock, X,
  Pencil, Save, Trophy, ChevronRight, ChevronLeft, Download, Info,
  Briefcase, Phone, CalendarRange, CalendarDays, RotateCcw, Bandage,
  UserCheck, MessageSquareHeart, Star, Send as SendIcon,
  Printer, Check, Share2, CalendarSearch, ClipboardPaste,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import Avatar from './Avatar'
import SessionDetail from './SessionDetail'
// סיומת מפורשת: ב-Windows (מערכת קבצים לא רגישה לאות גדולה) Vite היה פותר
// את './SendToPlayers' לקובץ העזר sendToPlayers.js — ואז הרכיב קרס במסך לבן.
import SendToPlayers from './SendToPlayers.jsx'
import TeamAssignments from './TeamAssignments'
import { printPlayerReport } from './playerReport'
import TeamSlots from './TeamSlots'
import TeamGoalsBoard from './TeamGoalsBoard'
import TeamFocus from './TeamFocus'
import { PlayerGoalsEditor } from './PlayerGoals'
import { L, trTeam, cnt } from './i18n'
// 4.9 — PILOT_COACHES: פאנל קוד-ההצטרפות מוצג רק למאמני הפיילוט
import { PLAYER_SIDE, COACH_LOGS, PILOT_COACHES } from './flags'
import { confirmDialog } from './confirm'
import useFocusTrap from './useFocusTrap'
import LeagueTable from './LeagueTable'
import TeamGames from './TeamGames'
import TeamConnect from './TeamConnect'
import PlayerCard from './PlayerCard'
import Page from './Page'
import { ChevronFwd } from './DirIcon'
import { sendNotification } from './notify'
import { SkeletonRoster } from './Skeleton'
import { pendingRequests, decideMembership, ageMismatches } from './players'
import { waShare } from './share'

// פירוק רשימה מודבקת לשורות של { number, name }.
//
// מאמן מדביק ממה שיש לו ביד — וואטסאפ, אקסל, פתק — ולכן הפרסר סובלני:
//   «7 דני כהן» · «דני כהן 7» · «7, דני כהן» · «7 - דני כהן» · «דני כהן»
// מספר מזוהה רק כשהוא עומד בפני עצמו בקצה השורה, כדי ש«דני כהן 2» לא
// ייחתך כשהכוונה הייתה לשם. שורות ריקות וכפילויות שם מסוננות.
export function parseRoster(text) {
  const seen = new Set()
  const rows = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    let line = raw.replace(/\t/g, ' ').trim()
    if (!line) continue
    // תבליטים ומספור אוטומטי בתחילת שורה («1. », «- », «• »)
    line = line.replace(/^[\u2022\u25CF*\-–—]\s*/, '')
    let number = null
    let name = line
    // «7, דני כהן» או «7 - דני כהן» או «7 דני כהן»
    let m = name.match(/^(\d{1,3})\s*[,\-–—.:]?\s+(.*)$/)
    if (m && m[2].trim()) { number = m[1]; name = m[2] }
    else {
      // «דני כהן 7» — המספר בסוף
      m = name.match(/^(.*?)\s+[,\-–—]?\s*(\d{1,3})$/)
      if (m && m[1].trim()) { name = m[1]; number = m[2] }
    }
    name = name.replace(/\s+/g, ' ').trim().replace(/[,;]+$/, '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ name, number: number || null })
  }
  return rows
}


// ---- סטטוס שחקן ----
const STATUSES = [
  { key: 'active', he: 'פעיל', en: 'Active' },
  { key: 'injured', he: 'פצוע', en: 'Injured' },
  { key: 'sick', he: 'חולה', en: 'Sick' },
  { key: 'absent', he: 'לא פעיל', en: 'Inactive' },
]
const statusLabel = (k) => L((STATUSES.find((x) => x.key === k) || STATUSES[0]).he, (STATUSES.find((x) => x.key === k) || STATUSES[0]).en)

// ---- הקשר ההסכמה של בקשת הצטרפות ----
// המודל כאן נשען על המאמן כשומר האנושי: הוא זה שמכיר את השחקן ואת המשפחה.
// כדי שההחלטה שלו תהיה מודעת ולא מקרית, כל בקשה מסומנת במצב ההסכמה שלה.
// null = המיגרציה טרם רצה (approval_status/has_consent חסרים) — ואז המסך
// חוזר בדיוק להתנהגות של היום: בלי תג, בלי דיאלוג, בלי פאנל.
const consentState = (r) => {
  if (!r?.approval_status) return null
  if (r.approval_status === 'pending_parent') return 'waiting'
  if (r.approval_status === 'suspended') return 'revoked'
  if (r.parent_approved === true) return 'approved'
  if (r.parent_approved === false) return 'adult'
  return null // has_consent לא זמין — עדיף בלי תג מאשר תג שקרי
}
// הטקסטים נשמרים he/en ולא עוברים ב-L כאן: מודול נטען פעם אחת, והחלפת
// שפה בזמן ריצה הייתה מקבעת את השפה של הטעינה הראשונה.
// הצבעים דרך טוקנים בלבד — אין hex, ואין תוספת ל-index.css.
const CONSENT_BADGE = {
  approved: { he: 'ההורה אישר', en: 'Parent approved', cls: 'tc-meter full' },
  waiting: { he: 'ממתין לאישור הורה', en: 'Waiting for parent approval', cls: 'tc-meter', style: { background: 'var(--warn-soft)', color: 'var(--warn-ink)' } },
  revoked: { he: 'ההסכמה בוטלה', en: 'Consent revoked', cls: 'tc-meter', style: { background: 'var(--danger-soft)', color: 'var(--danger)' } },
  adult: { he: 'לא קטין', en: 'Not a minor', cls: 'tc-meter', style: { background: 'var(--surface-alt)', color: 'var(--text-muted)' } },
}
const reqName = (p) => (p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '') || L('שחקן', 'Player')

// ---- הצלבת גיל: הסגל מול הצהרת השחקן ----
// הניסוח כאן נבחר בקפידה: אף תווית לא מאשימה צד. תאריך לידה מוקלד פעמיים —
// המאמן בשורת הסגל, השחקן בפרופיל — וטעות הקלדה של המאמן שכיחה בדיוק כמו
// טעות של השחקן. 'critical' הוא המקרה היחיד שמסומן באדום, כי שם שני
// המקורות חלוקים על עצם היות השחקן קטין — וזה מה שקובע אם בכלל נדרש אישור
// הורה. גם כאן he/en נשמרים כמחרוזות ולא עוברים ב-L ברמת המודול, אחרת
// שפת הטעינה הראשונה הייתה מתקבעת.
const AGE_SEVERITY = {
  critical: { he: 'קטין או בגיר — לא ברור', en: 'Minor or adult — unclear', style: { background: 'var(--danger-soft)', color: 'var(--danger)' } },
  major: { he: 'פער משמעותי', en: 'Significant gap', style: { background: 'var(--warn-soft)', color: 'var(--warn-ink)' } },
  minor: { he: 'פער קטן', en: 'Small gap', style: { background: 'var(--surface-alt)', color: 'var(--text-muted)' } },
}
// השוואת שם קבוצה סובלנית לרישיות ולרווחים: אותו שם נשמר לעתים בכתיב שונה
// בין הפרופיל לשורת הסגל, ופאנל ריק בזמן שהצ׳יפ מראה מספר גרוע מכלום.
const sameTeam = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

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
  // הטאב «שיגורים» התמזג לתוך «יעדים ומשימות», ולכן יעד ישן מנותב אליו
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
  // מוני רענון: משימה שנרשמה זה עתה צריכה להופיע במעקב שמתחתיה, וסקירת
  // אימון שנשמרה צריכה להפוך את האימון מ«פתוח» ל«סגור» בטאב הלו״ז.
  const [taRev, setTaRev] = useState(0)
  const [slotsRev, setSlotsRev] = useState(0)
  const [gpEdit, setGpEdit] = useState(null) // עריכת יעדים מהירה לשחקן {player_id, name, team}
  const [sForm, setSForm] = useState({ name: '', role: 'assistant', phone: '' })

  // עריכה (מודאלים)
  const [pEdit, setPEdit] = useState(null)
  const [sEdit, setSEdit] = useState(null)
  const [playerPage, setPlayerPage] = useState(null) // 1.7 — כרטיס שחקן מלא


  // משוב לשחקן (בתוך מודל השחקן)
  const [fbText, setFbText] = useState('')
  const [fbRating, setFbRating] = useState(0)
  const [fbHistory, setFbHistory] = useState([]) // 5 המשובים האחרונים לשחקן הפתוח
  // צד המאמן בלבד (22.8): המשוב נשמר על שורת הסגל (roster_id) ולא על חשבון
  // השחקן — ולכן זמין לכל שחקן, מחובר או לא.
  // 3.9 — שתי אמיתות: תמיד לפי שורת הסגל (COACH_LOGS); לשחקן מקושר קוראים
  // גם לפי player_id (משובים שנשמרו על החשבון לפני 22.8). לא נגזר מ-PLAYER_SIDE.
  const fbByRoster = COACH_LOGS
  const fbOpen = !!pEdit?.id && (fbByRoster || !!pEdit.player_id)
  useEffect(() => {
    // טיוטה של שחקן אחד לא נשארת בתיבה של השחקן הבא
    setFbText(''); setFbRating(0)
    if (!fbOpen) { setFbHistory([]); return }
    ;(async () => {
      const base = () => supabase.from('player_feedback').select('id, content, rating, created_at').eq('coach_id', me)
        .order('created_at', { ascending: false }).limit(5)
      let { data, error } = await (fbByRoster
        ? (pEdit.player_id ? base().or(`roster_id.eq.${pEdit.id},player_id.eq.${pEdit.player_id}`) : base().eq('roster_id', pEdit.id))
        : base().eq('player_id', pEdit.player_id))
      // מסד בלי roster_id (המיגרציה של 22.8 טרם רצה) — לשחקן מקושר קוראים לפי חשבון
      if (error && fbByRoster && pEdit.player_id && /roster_id/i.test(error.message || '')) ({ data, error } = await base().eq('player_id', pEdit.player_id))
      setFbHistory(error ? [] : (data || []))
    })()
  }, [fbOpen, fbByRoster, pEdit?.id, pEdit?.player_id, me])
  const sendFeedback = async () => {
    if (!fbOpen || !fbText.trim()) return
    const row = {
      coach_id: me, player_id: pEdit.player_id || null, roster_id: pEdit.id,
      content: fbText.trim(), rating: fbRating || null,
    }
    let { error } = await supabase.from('player_feedback').insert(row)
    // מסד שטרם הריץ supabase_coach_only_22_8.sql: בלי roster_id. לשחקן מחובר
    // שומרים כמו פעם; לשחקן בלי חשבון אין לאן — אומרים את זה במפורש.
    if (error && /roster_id/i.test(error.message || '')) {
      if (pEdit.player_id) ({ error } = await supabase.from('player_feedback').insert({ ...row, roster_id: undefined }))
      else { toast.error(L('כדי לשמור משוב צריך להריץ את supabase_coach_only_22_8.sql', 'Saving feedback needs supabase_coach_only_22_8.sql')); return }
    }
    if (error) { console.error('teams feedback:', error.message); toast.error(L('שמירת המשוב נכשלה — נסו שוב בעוד רגע.', 'Saving the feedback failed — try again in a moment.')); return }
    if (PLAYER_SIDE && pEdit.player_id) sendNotification({ to: pEdit.player_id, actor: me, type: 'message', content: 'קיבלת משוב חדש מהמאמן', nav: 'feedback' })
    setFbText(''); setFbRating(0)
    setFbHistory((h) => [{ id: Date.now(), content: fbText.trim(), rating: fbRating || null, created_at: new Date().toISOString() }, ...h].slice(0, 5))
    toast.success(PLAYER_SIDE && pEdit.player_id ? L('המשוב נשלח לשחקן', 'Feedback sent to the player') : L('המשוב נשמר בכרטיס השחקן', 'Feedback saved to the player card'))
  }

  // יעדים — בורר שבוע/חודש
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

  // ---------- בקשות הצטרפות: המאמן כשומר מודע ----------
  const [reqs, setReqs] = useState([])
  const [reqsLoading, setReqsLoading] = useState(true)
  const [reqsFailed, setReqsFailed] = useState(false) // כשל טעינה != אין בקשות
  const [deciding, setDeciding] = useState(null)      // id של בקשה בטיפול
  const [reqsRev, setReqsRev] = useState(0)           // מפתח רענון ל-TeamConnect
  const reqTokenRef = useRef(0)

  const loadReqs = async () => {
    const token = ++reqTokenRef.current
    setReqsLoading(true)
    // quiet: פאנל החיבור שמתחת קורא לאותה פונקציה, ושני טוסטים זהים על
    // אותה תקלה זה רעש. השגיאה מוצגת כאן כפס אינליין עם "נסה שוב".
    const rows = await pendingRequests(me, { quiet: true })
    if (token !== reqTokenRef.current) return // קבוצה אחרת נבחרה בינתיים
    setReqsFailed(!!rows.loadError)
    setReqs(rows.filter((r) => r.team === team))
    setReqsLoading(false)
  }
  // צד המאמן בלבד: אין בקשות הצטרפות (אין חשבונות שחקן) — לא שולפים בכלל
  useEffect(() => { if (PLAYER_SIDE) loadReqs(); else setReqsLoading(false) /* eslint-disable-next-line */ }, [me, team])
  useEffect(() => () => { reqTokenRef.current++ }, [])

  // רק בקשות שיש להן הקשר הסכמה אמיתי מוצגות כאן. במסד שטרם הריץ את
  // מיגרציות ההסכמה זה תמיד ריק — והמסך זהה לחלוטין להיום.
  const consentReqs = reqs.filter((r) => consentState(r))

  // ---------- אי-התאמות גיל ----------
  // נטען פעם אחת לכל הקבוצות של המאמן (ולא לכל קבוצה בנפרד): הצ׳יפ בבאנר
  // חייב להראות גם פער שיושב בקבוצה שלא פתוחה כרגע, אחרת המאמן צריך לחפש.
  const [ageRows, setAgeRows] = useState([])
  const [ageLoading, setAgeLoading] = useState(true)
  const [ageFailed, setAgeFailed] = useState(false) // כשל בדיקה != אין פערים
  const ageTokenRef = useRef(0)

  const loadAges = async () => {
    const token = ++ageTokenRef.current
    setAgeLoading(true)
    // quiet: זו לא תקלה שהמאמן גרם לה, והיא מוצגת כאן כפס אינליין עם
    // "נסה שוב". טוסט אדום בכל כניסה לסגל היה רעש בלבד.
    const rows = await ageMismatches(me, { quiet: true })
    if (token !== ageTokenRef.current) return
    setAgeFailed(!!rows.loadError)
    setAgeRows(rows)
    setAgeLoading(false)
  }
  // צד המאמן בלבד: ההצלבה היא מול תאריך שהשחקן הזין בפרופיל — אין כזה
  useEffect(() => { if (PLAYER_SIDE) loadAges(); else setAgeLoading(false) /* eslint-disable-next-line */ }, [me])
  useEffect(() => () => { ageTokenRef.current++ }, [])

  const teamAgeRows = ageRows.filter((r) => sameTeam(r.team, team))

  // ההודעה למשפחה. הניסוח מכוון: מציג את שני התאריכים, אומר במפורש שייתכן
  // שהטעות היא של המאמן, ומסביר למה זה משנה — בלי להטיל אשם ובלי לדרוש.
  const ageNudgeText = (r) => {
    const side = (birth, age) => (birth ? ilNum(birth)
      : age != null ? L(`גיל ${age}`, `age ${age}`)
        : L('לא מולא', 'not filled in'))
    const mine = side(r.coach_birth, r.coach_age)
    const theirs = side(r.player_birth, r.player_age)
    const nm = r.name || L('השחקן', 'the player')
    return L(
      `שלום! אנחנו מסדרים את פרטי הקבוצה ב-CourtSide, ויש אי-התאמה בתאריך הלידה של ${nm}: אצלי ברשימת הקבוצה רשום ${mine}, ובפרופיל באפליקציה מופיע ${theirs}. כנראה טעות הקלדה — ובהחלט יכול להיות שדווקא אצלי. אפשר לבדוק את התאריך בפרופיל באפליקציה ולתקן אם צריך? אני אבדוק גם אצלי. התאריך חשוב כי לפיו נקבע אם נדרש אישור הורה. תודה רבה!`,
      `Hi! We're tidying up the team details on CourtSide, and there's a mismatch in ${nm}'s date of birth: my team list says ${mine}, while the app profile shows ${theirs}. It's most likely a typo — quite possibly mine. Could you check the date in the app profile and fix it if needed? I'll check my side too. The date matters because it decides whether a parent's approval is required. Thank you!`
    )
  }

  // הודעה קצרה שהמאמן שולח למשפחה. לא ננעצת בשם מסך מסוים באפליקציה,
  // כדי שלא תתיישן ברגע שהניסוח שם ישתנה.
  const nudgeText = (r) => L(
    `שלום! ${reqName(r.player)} ביקש/ה להצטרף לקבוצה שלנו ב-CourtSide. כדי שהחשבון יהיה פעיל צריך אישור של הורה — האפליקציה שולחת להורה לינק אישור קצר, וזה לוקח דקה. עד האישור החשבון נשאר מוגבל: בלי העלאת תמונות ובלי כתיבה בקהילה ובצ׳אטים. תודה!`,
    `Hi! ${reqName(r.player)} asked to join our team on CourtSide. The account needs a parent's approval to become active — the app sends the parent a short approval link, and it takes a minute. Until then the account stays restricted: no photo uploads and no posting in the community or chats. Thanks!`
  )

  const decideRequest = async (r, approve) => {
    const st = consentState(r)
    // ההחלטה נשארת של המאמן — אבל היא חייבת להיות מפורשת, לא אגבית.
    if (approve && st === 'waiting') {
      const ok = await confirmDialog({
        title: L('לאשר שחקן שההורה שלו טרם אישר?', 'Approve a player whose parent has not approved?'),
        message: L(
          'זהו קטין שהאפוטרופוס שלו עדיין לא אישר את ההרשמה. באישור הבקשה אתם מצהירים שאתם מכירים את השחקן ואת משפחתו. השחקן יצטרף לקבוצה — אבל יישאר מוגבל באפליקציה: בלי העלאת תמונות, בלי כתיבה בקהילה ובצ׳אטים ובלי שליחת הודעות — עד שההורה יאשר.',
          'This is a minor whose guardian has not yet approved the registration. By approving you confirm that you know the player and their family. The player will join the team — but will stay restricted in the app: no photo uploads, no posting in the community or chats and no messaging — until the parent approves.',
        ),
        confirmText: L('אני מכיר את המשפחה — לאשר', 'I know the family — approve'),
        danger: false,
      })
      if (!ok) return
    }
    if (approve && st === 'revoked') {
      const ok = await confirmDialog({
        title: L('לאשר שחקן שההסכמה שלו בוטלה?', 'Approve a player whose consent was revoked?'),
        message: L(
          'ההורה ביטל את ההסכמה והחשבון מושהה. אישור הבקשה לא יפתח לשחקן את האפליקציה — הוא יישאר חסום עד שהעניין ייפתר מול ההורה או מול מנהל המערכת.',
          'The parent revoked consent and the account is suspended. Approving will not open the app for this player — they stay blocked until it is resolved with the parent or with an administrator.',
        ),
        confirmText: L('אישור בכל זאת', 'Approve anyway'),
        danger: true,
      })
      if (!ok) return
    }
    setDeciding(r.id)
    const res = await decideMembership({ ...r }, approve)
    setDeciding(null)
    if (!res.ok) { toast.error(L('הפעולה נכשלה: ', 'Action failed: ') + res.reason); return }
    // 3.9 — אם החשבון חובר לשורת סגל קיימת (או שנוצרה שורה חדשה) — אומרים את זה
    toast.success(approve
      ? (res.hint || L('השחקן אושר והתווסף לסגל', 'Player approved and added to the roster'))
      : L('הבקשה נדחתה', 'Request declined'))
    loadReqs()
    setReqsRev((v) => v + 1) // מרענן גם את רשימת הבקשות בפאנל החיבור
    if (approve) load()
  }

  // סנכרון תיבות היעדים — כל תיבה מסתנכרנת רק כשהערך *שלה* משתנה (החלפת תקופה או
  // טעינה מהמסד). תלות בערך הספציפי ולא באובייקט כולו — כדי ששמירת תיבה אחת
  // לא תדרוס טקסט שטרם נשמר בתיבות האחרות.
  // team בתלויות: בלי זה טקסט שהוקלד ולא נשמר נשאר בתיבה גם אחרי החלפת
  // קבוצה (הערך במפה זהה — לרוב ריק — ולכן האפקט לא רץ), והשמירה הבאה
  // הייתה כותבת אותו על הקבוצה החדשה.
  const wKey = `week|${ymd(gWeek)}`
  const mKey = `month|${monthKey(gMonth)}`
  useEffect(() => { setWText(goalsMap[wKey] || '') }, [goalsMap[wKey], wKey, team])
  useEffect(() => { setMText(goalsMap[mKey] || '') }, [goalsMap[mKey], mKey, team])
  // מפתח העונה: הכתיבה היא saveGoal('year', '') ולכן המפתח הוא 'year|'.
  // הקריאה חיפשה 'season|' — יעדי העונה נשמרו ולא חזרו לתיבה לעולם.
  useEffect(() => { setSText(goalsMap['year|'] || '') }, [goalsMap['year|'], team])

  // ייצוא הסגל לקובץ CSV (נפתח באקסל, כולל BOM לעברית תקינה).
  // הקובץ יוצא מהאפליקציה אל מחשב פרטי ומכיל פרטי קטינים — ולכן שני שינויים:
  //   1) אזהרת אחריות מפורשת לפני ההורדה (הייצוא היה שקט לגמרי).
  //   2) העמודות הרגישות ביותר — הערות חופשיות (notes) והערת פציעה
  //      (injury_note, שהיא מידע בריאותי) — אינן נכללות בקובץ כלל.
  const exportRosterCsv = async () => {
    const ok = await confirmDialog({
      title: L('ייצוא פרטי הסגל לקובץ?', 'Export roster details to a file?'),
      message: L(
        'הקובץ מכיל פרטים אישיים של שחקנים, לרוב קטינים — שם, שנת לידה וטלפון. מרגע ההורדה הוא יוצא מהאפליקציה ואינו מוגן: האחריות לשמירתו, לאי-הפצתו ולמחיקתו כשאינו נחוץ היא עליך. הערות חופשיות והערות פציעה לא ייכללו בקובץ.',
        'The file contains personal details of players, most of them minors — name, birth year and phone. Once downloaded it leaves the app unprotected: keeping it safe, not sharing it, and deleting it when no longer needed are your responsibility. Free-text notes and injury notes are not included.',
      ),
      confirmText: L('הורדת הקובץ', 'Download the file'),
    })
    if (!ok) return
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
  // הדבקת רשימה — הכול בבת אחת במקום 14 סבבים
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteBusy, setPasteBusy] = useState(false)
  const pasteRows = useMemo(() => parseRoster(pasteText), [pasteText])

  const addPasted = async () => {
    if (!pasteRows.length || pasteBusy) return
    setPasteBusy(true)
    // שם שכבר קיים בסגל מדולג — מאמן שמדביק פעמיים לא מקבל כפילויות
    const have = new Set(players.map((x) => String(x.name || '').toLowerCase()))
    const fresh = pasteRows.filter((r) => !have.has(r.name.toLowerCase()))
    if (!fresh.length) {
      toast.error(L('כל השמות ברשימה כבר בסגל.', 'Every name on the list is already in the roster.'))
      setPasteBusy(false)
      return
    }
    const { error } = await supabase.from('team_players').insert(
      fresh.map((r) => ({ coach_id: me, team, name: r.name, number: r.number, status: 'active' }))
    )
    setPasteBusy(false)
    if (error) {
      console.error('roster paste:', error.message)
      toast.error(L('ההוספה נכשלה — נסו שוב בעוד רגע.', 'Add failed — try again in a moment.'))
      return
    }
    const skipped = pasteRows.length - fresh.length
    toast.success(skipped
      ? L(`נוספו ${fresh.length} שחקנים · ${skipped} כבר היו בסגל`, `Added ${fresh.length} · ${skipped} already in the roster`)
      : L(`נוספו ${fresh.length} שחקנים`, `Added ${fresh.length} players`))
    setPasteText('')
    setPasteOpen(false)
    load()
  }

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
    // עדכון השורה בלבד ולא load(): הצ׳יפ מתגלגל בין ארבעה מצבים, וטעינה
    // מחדש של כל הסגל לשלד בכל לחיצה הפכה את המעבר בין מצבים לבלתי אפשרי.
    setPlayers((cur) => cur.map((x) => (x.id === p.id ? { ...x, status: next } : x)))
  }
  const savePlayer = async () => {
    const p = pEdit
    const { error } = await supabase.from('team_players').update({
      name: (p.name || '').trim(), number: (p.number || '').toString().trim() || null,
      status: p.status, position: p.position || null,
      birth_year: p.birth_year ? parseInt(p.birth_year, 10) : null,
      phone: p.phone || null, notes: p.notes || null, injury_note: p.injury_note || null,
    }).eq('id', p.id)
    if (error) { console.error('teams save player:', error.message); toast.error(L('השמירה נכשלה — נסו שוב בעוד רגע.', 'Save failed — try again in a moment.')); return }
    // שנת לידה שהשתנתה כאן היא בדיוק מה שהצלבת הגיל בודקת — מרעננים אותה,
    // אחרת הפער היה ממשיך להופיע אחרי שהמאמן כבר תיקן אותו.
    toast.success(L('פרטי השחקן נשמרו', 'Player saved')); setPEdit(null); load(); loadAges()
  }
  // 4.9 — «בלי שאלות בוקר»: כיבוי הצ'ק-אין לילד בודד (בקשת הורה בוואטסאפ —
  // בלי סבב הסכמות). טאפ אחד, נשמר מיד; סובלני למסד שטרם הריץ את המיגרציה.
  const toggleWellness = async (p, v) => {
    const { error } = await supabase.from('team_players').update({ wellness_off: v }).eq('id', p.id)
    if (error) {
      const colMissing = ['42703', 'PGRST204'].includes(error.code) || /wellness_off/i.test(error.message || '')
      toast.error(colMissing
        ? L('כדי לכבות את שאלות הבוקר צריך להריץ את supabase_checkins_4_9.sql', 'Turning morning questions off needs supabase_checkins_4_9.sql')
        : L('העדכון נכשל — נסו שוב בעוד רגע.', 'Update failed — try again in a moment.'))
      return
    }
    setPEdit((c) => (c && c.id === p.id ? { ...c, wellness_off: v } : c))
    setPlayers((cur) => cur.map((x) => (x.id === p.id ? { ...x, wellness_off: v } : x)))
    toast.success(v
      ? L('שאלות הבוקר כובו לשחקן הזה', 'Morning questions turned off for this player')
      : L('שאלות הבוקר הודלקו חזרה', 'Morning questions turned back on'))
  }

  const delPlayer = async (id) => {
    if (!(await confirmDialog({
      title: L('להסיר את השחקן מהסגל?', 'Remove this player from the roster?'),
      message: L('השחקן יוסר מהקבוצה יחד עם הפרטים שרשמת עליו. אי אפשר לשחזר.',
                 'The player will be removed from the team along with the details you recorded. This cannot be undone.'),
      confirmText: L('הסרת השחקן', 'Remove player'),
      danger: true,
    }))) return
    // כשל מחיקה נבלע בשקט ונראה בדיוק כמו הצלחה — עד לרענון הבא
    const { error } = await supabase.from('team_players').delete().eq('id', id)
    if (error) { console.error('teams del player:', error.message); toast.error(L('ההסרה נכשלה — נסו שוב בעוד רגע.', 'Removal failed — try again in a moment.')); return }
    setPEdit(null); load(); loadAges()
  }

  // ---------- התפקיד שלי בקבוצה (4.9) ----------
  // «מאמן ראשי» (ברירת מחדל) / «עוזר מאמן» — תצוגה בלבד, שום דבר אחר לא
  // נשען על זה. נשמר על שורת ההגדרות של הקבוצה (team_iba — pk לכל
  // מאמן+קבוצה, קיימת ממילא); שורה בלי קישור ליגה תקינה — league_id ריק.
  // סובלני למסד שטרם הריץ את supabase_checkins_4_9.sql (העמודה חסרה).
  const coachRole = iba?.coach_role || 'head'
  const saveCoachRole = async (v) => {
    if (v === coachRole) return
    const { error } = await supabase.from('team_iba')
      .upsert({ coach_id: me, team, coach_role: v }, { onConflict: 'coach_id,team' })
    if (error) {
      const colMissing = ['42703', 'PGRST204'].includes(error.code) || /coach_role/i.test(error.message || '')
      toast.error(colMissing
        ? L('כדי לסמן «עוזר מאמן» צריך להריץ את supabase_checkins_4_9.sql', 'Marking “assistant coach” needs supabase_checkins_4_9.sql')
        : L('השמירה נכשלה — נסו שוב בעוד רגע.', 'Save failed — try again in a moment.'))
      return
    }
    setIba((cur) => ({ ...(cur || { coach_id: me, team }), coach_role: v }))
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
    if (error) { console.error('teams save staff:', error.message); toast.error(L('השמירה נכשלה — נסו שוב בעוד רגע.', 'Save failed — try again in a moment.')); return }
    toast.success(L('פרטי הצוות נשמרו', 'Staff saved')); setSEdit(null); load()
  }
  const delStaff = async (id) => {
    if (!(await confirmDialog({
      title: L('להסיר את איש הצוות?', 'Remove this staff member?'),
      message: L('איש הצוות יוסר מהקבוצה יחד עם הפרטים וההערות שרשמת עליו.',
                 'The staff member will be removed from the team along with their details and notes.'),
      confirmText: L('הסרה', 'Remove'),
      danger: true,
    }))) return
    const { error } = await supabase.from('team_staff').delete().eq('id', id)
    if (error) { console.error('teams del staff:', error.message); toast.error(L('ההסרה נכשלה — נסו שוב בעוד רגע.', 'Removal failed — try again in a moment.')); return }
    setSEdit(null); load()
  }

  // ---------- יעדים ----------
  const saveGoal = async (period, key, content) => {
    const { error } = await supabase.from('team_goals').upsert(
      { coach_id: me, team, period, period_key: key, content, updated_at: new Date().toISOString() },
      { onConflict: 'coach_id,team,period,period_key' }
    )
    if (error) { console.error('teams save:', error.message); toast.error(L('השמירה נכשלה — נסו שוב בעוד רגע.', 'Save failed — try again in a moment.')); return }
    setGoalsMap((m) => ({ ...m, [`${period}|${key}`]: content }))
    toast.success(L('היעדים נשמרו', 'Goals saved'))
  }

  if (teams.length === 0) {
    return (
      <Page eyebrow={L('הקבוצות שלי', 'My teams')} title={L('ניהול קבוצה', 'Team management')} size="sm">
        <div className="empty-state">
          <span className="empty-ic"><Users2 size={26} /></span>
          <div className="empty-title">{L('נתחיל מקבוצה אחת', 'Let’s start with one team')}</div>
          <p className="muted small" style={{ maxWidth: 460 }}>
            {L('בוחרים בפרופיל את שכבות הגיל שאתם מאמנים — ומכאן נפתחים הסגל, הנוכחות, היעדים והלו״ז של כל קבוצה.',
               'Pick the age groups you coach in your profile — that opens the roster, attendance, goals and schedule for each team.')}
          </p>
          {/* CTA ישר לטופס העריכה: «profile» סתם הנחית על תצוגת הפרופיל,
              ומשם המאמן החדש היה צריך למצוא «עריכת פרטים» ולגלול */}
          {onNavigate && (
            <button type="button" className="btn-primary empty-cta" onClick={() => onNavigate('profile-edit')}>
              {L('בחירת הקבוצות שלי', 'Choose my teams')}
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

  // 1.7 — כרטיס שחקן מלא: נפתח מלחיצה על שחקן בסגל
  if (playerPage) {
    // חזרה מהכרטיס מרעננת גם את הצלבת הגיל: תאריך הלידה נערך שם, וזה
    // המקום היחיד שבו המאמן מתקן את הצד שלו.
    return (
      <PlayerCard
        coachId={me}
        team={team}
        player={playerPage}
        onBack={() => { setPlayerPage(null); load(); loadAges() }}
        // «תיק שחקן» מוצג רק למי שהמסך פתוח בפניו — אחרת הניווט נופל למסך
        // הפרופיל. כשהתיק ייפתח לכל המאמנים, יורדת בדיקת is_admin.
        onOpenDossier={onNavigate && profile?.is_admin ? (p) => onNavigate(`dossier:${p.id}`) : undefined}
      />
    )
  }

  return (
    <Page
      eyebrow={profile?.club || L('הקבוצה שלי', 'My team')}
      title={trTeam(team)}
      size="sm"
      actions={(
        <div className="team-hero-stats">
          {/* 4.9 — תג «עוזר מאמן» בבאנר הקבוצה (team_iba.coach_role, תצוגה בלבד) */}
          {iba?.coach_role === 'assistant' && (
            <span className="cs-hero-pill">{L('עוזר מאמן', 'Assistant coach')}</span>
          )}
          <span className="cs-hero-pill">{L(`${players.length} שחקנים`, `${players.length} players`)}</span>
          {teamAtt != null && <span className="cs-hero-pill">{L('נוכחות ', 'Attendance ')}<b dir="ltr">{teamAtt}%</b></span>}
          {injured > 0 && <span className="cs-hero-pill">{L(`${injured} לא זמינים`, `${injured} unavailable`)}</span>}
          {/* הצ׳יפ הזה הוא הדרך של המאמן *לדעת* שיש מה לבדוק בלי לחפש: הוא
              יושב בבאנר שנראה מכל שלושת הטאבים, וסופר את כל הקבוצות שלו.
              כפתור ולא span — לחיצה מביאה לסגל, ואם בקבוצה הפתוחה אין פער
              היא גם עוברת לקבוצה שבה הוא כן יושב. fontFamily בלבד באינליין:
              כפתור לא יורש גופן, ושאר העיצוב נשאר של הטוקן בקלאס. */}
          {ageRows.length > 0 && (
            <button
              type="button" className="cs-hero-pill" style={{ fontFamily: 'inherit', cursor: 'pointer' }}
              onClick={() => {
                setTab('roster')
                if (teamAgeRows.length === 0) {
                  const t = ageRows.find((r) => teams.some((x) => sameTeam(x, r.team)))?.team
                  const match = t && teams.find((x) => sameTeam(x, t))
                  if (match) setTeam(match)
                }
              }}
              title={L('תאריך הלידה שרשום אצלך בסגל שונה ממה שהשחקן הצהיר — בכל הקבוצות שלך',
                       'The birth date on your roster differs from what the player declared — across all your teams')}
            >
              <CalendarSearch size={13} aria-hidden="true" />
              {L('תאריכי לידה לבדיקה ', 'Birth dates to check ')}<b><bdi>{ageRows.length}</bdi></b>
            </button>
          )}
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
          יעדים ומשימות. עד היום היו כאן שבעה — ב-384px הם נחתכו בתוך מכל
          של 350px ו"שיגורים", "צ׳אט" ו"טבלה" היו בלתי נגישים בטלפון.
          הצ׳אט עבר למסך ההודעות (מסך 7a), והמשחקים והטבלה למסך משלהם. */}
      <div className="tabs team-tabs" style={{ marginTop: 14 }}>
        <button className={tab === 'roster' ? 'tab active' : 'tab'} onClick={() => setTab('roster')}><Users2 size={15} /> {L('סגל', 'Roster')}</button>
        <button className={tab === 'practices' ? 'tab active' : 'tab'} onClick={() => setTab('practices')}><CalendarClock size={15} /> {L('לו״ז ונוכחות', 'Schedule')}</button>
        <button className={tab === 'goals' ? 'tab active' : 'tab'} onClick={() => setTab('goals')}><Target size={15} /> {L('יעדים ומשימות', 'Goals & tasks')}</button>
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
          {/* ---- תאריכי לידה שלא מסתדרים ----
              יושב בראש הסגל ולא בתחתיתו: זה בירור שצריך לקרות לפני שממשיכים
              לנהל את הקבוצה. כשה-RPC לא קיים (מסד שטרם הריץ את
              supabase_age_crosscheck.sql) הרשימה ריקה והמסך זהה להיום.
              כשל בדיקה כן מוצג — "אין פערים" ו"לא הצלחנו לבדוק" הם שני
              דברים שונים לגמרי, ואסור שייראו אותו דבר. */}
          {(!PLAYER_SIDE || ageLoading) ? null : ageFailed ? (
            <p className="alert alert-error" style={{ marginBlockStart: 12 }}>
              {L('לא הצלחנו לבדוק את תאריכי הלידה בסגל. זו תקלת בדיקה בלבד — שום נתון לא השתנה. ',
                 'We could not check the roster birth dates. This is a check failure only — nothing was changed. ')}
              <button type="button" className="link-button" onClick={loadAges}>{L('נסה שוב', 'Try again')}</button>
            </p>
          ) : teamAgeRows.length > 0 ? (
            <div className="tc-panel tc-open" style={{ marginBlockStart: 12 }}>
              <div className="tc-head tc-head-static">
                <span className="tc-head-l"><CalendarSearch size={16} /> {L('תאריכי לידה שכדאי לוודא', 'Birth dates worth verifying')}</span>
                <span className="tc-head-r"><span className="tc-badge"><bdi>{teamAgeRows.length}</bdi></span></span>
              </div>
              <div className="tc-body">
                <p className="muted small" style={{ margin: 0, marginBlockStart: 10 }}>
                  {L('בשורות האלה תאריך הלידה שרשום בסגל שונה מזה שהשחקן הזין בפרופיל שלו. זה לא אומר שמישהו לא דייק בכוונה — טעות הקלדה ברשימת הקבוצה שכיחה בדיוק כמו טעות של השחקן, ולכן שווה לבדוק את שני הצדדים ולתקן את זה שטעה.',
                     'On these rows the birth date on the roster differs from the one the player entered in their profile. Nobody is being accused — a typo on the team list is just as common as a mistake by the player, so it is worth checking both sides and fixing whichever is wrong.')}
                </p>
                <div className="tc-reqs">
                  {teamAgeRows.map((r) => {
                    const sev = AGE_SEVERITY[r.severity] || AGE_SEVERITY.major
                    const crit = r.severity === 'critical'
                    // מצב ההסכמה של השחקן, אם ידוע — אותו תג בדיוק כמו בבקשות
                    const cSt = consentState({ approval_status: r.approval_status })
                    const cBadge = cSt ? CONSENT_BADGE[cSt] : null
                    // השורה בסגל שממנה מתקנים את הצד של המאמן
                    const rosterRow = players.find((p) => p.player_id === r.player_id)
                    const side = (birth, age) => (
                      <>
                        {birth ? <bdi>{ilNum(birth)}</bdi> : age != null
                          ? <>{L('גיל ', 'age ')}<bdi>{age}</bdi></>
                          : L('לא מולא', 'not filled in')}
                        {birth && age != null ? <> (<bdi>{age}</bdi>)</> : null}
                      </>
                    )
                    return (
                      <div key={r.player_id} className="tc-req"
                        style={crit ? { borderColor: 'var(--danger)', background: 'var(--danger-soft)' } : undefined}>
                        <Avatar name={r.name || L('שחקן', 'Player')} size={34} />
                        <span className="tc-req-name">
                          {r.name || L('שחקן', 'Player')}
                          <span style={{ display: 'block', marginBlockStart: 4 }}>
                            <span className="tc-meter" style={sev.style}>{L(sev.he, sev.en)}</span>
                            {cBadge && (
                              <span className={cBadge.cls} style={{ ...cBadge.style, marginInlineStart: 6 }}>
                                {L(cBadge.he, cBadge.en)}
                              </span>
                            )}
                          </span>
                          <span className="muted small" style={{ display: 'block', marginBlockStart: 4 }}>
                            {L('ברשימה שלך: ', 'On your list: ')}{side(r.coach_birth, r.coach_age)}
                            {' · '}
                            {L('השחקן הצהיר: ', 'The player declared: ')}{side(r.player_birth, r.player_age)}
                          </span>
                          {crit && (
                            /* המקרה היחיד שמסומן באדום: לפי מקור אחד זה קטין
                               ולפי השני בגיר. זו לא קוסמטיקה — זה מה שקובע
                               אם בכלל צריך אישור הורה. */
                            <span className="small" style={{ display: 'block', marginBlockStart: 4, color: 'var(--danger)' }}>
                              {L('לפי מקור אחד מדובר בקטין ולפי השני בבגיר — וזה בדיוק מה שקובע אם נדרש אישור הורה. כדאי לברר את השורה הזו קודם כל.',
                                 'One source says this is a minor and the other says an adult — and that is exactly what decides whether parental consent is required. Worth resolving this row first.')}
                            </span>
                          )}
                        </span>
                        <button type="button" className="icon-btn" disabled={!rosterRow}
                          onClick={() => rosterRow && setPlayerPage({ ...rosterRow })}
                          aria-label={L('פתיחת כרטיס השחקן לתיקון הפרטים ברשימה', 'Open the player card to fix the roster details')}
                          title={rosterRow
                            ? L('תיקון הפרטים אצלי', 'Fix my details')
                            : L('שורת הסגל לא נמצאה', 'Roster row not found')}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" className="icon-btn" onClick={() => waShare(ageNudgeText(r))}
                          aria-label={L('שליחת בקשה למשפחה לבדוק את התאריך בוואטסאפ', 'Ask the family on WhatsApp to check the date')}
                          title={L('בקשה למשפחה לבדוק', 'Ask the family to check')}>
                          <Share2 size={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <div className="roster-add">
            <input className="finder-input" type="text" value={pName} onChange={(e) => setPName(e.target.value)}
              placeholder={L('שם השחקן', 'Player name')} aria-label={L('שם השחקן', 'Player name')}
              onKeyDown={(e) => e.key === 'Enter' && addPlayer()} />
            <input className="finder-input roster-num" type="text" value={pNum} onChange={(e) => setPNum(e.target.value)}
              placeholder={L('מס׳', '#')} aria-label={L('מספר חולצה', 'Jersey number')} dir="ltr" />
            <button className="btn-primary" style={{ marginTop: 0 }} onClick={addPlayer} aria-label={L('הוספת שחקן', 'Add player')}><Plus size={16} /></button>
          </div>

          {/* הדבקת רשימה — 14 שחקנים בהדבקה אחת במקום 14 סבבים */}
          <div className="roster-paste">
            <button type="button" className="link-button" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>
              <ClipboardPaste size={14} /> {pasteOpen ? L('סגירה', 'Close') : L('הדבקת רשימת שחקנים', 'Paste a player list')}
            </button>
            {pasteOpen && (
              <div className="roster-paste-box">
                <p className="muted small">
                  {L('שורה לכל שחקן. אפשר «7 דני כהן», «דני כהן 7» או שם בלבד — וגם להדביק ישר מוואטסאפ או מאקסל.', 'One player per line. 7 Danny Cohen, Danny Cohen 7, or just a name — paste straight from WhatsApp or Excel.')}
                </p>
                <textarea
                  className="finder-input roster-paste-area"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={7}
                  placeholder={'7 דני כהן\n12 יהלי דגן\nנועם פרץ'}
                  aria-label={L('רשימת שחקנים להדבקה', 'Player list to paste')}
                />
                <div className="roster-paste-foot">
                  <span className="muted small">
                    {pasteRows.length
                      ? L(`זוהו ${pasteRows.length} שחקנים`, `${pasteRows.length} players detected`)
                      : L('עוד לא זוהו שחקנים', 'No players detected yet')}
                  </span>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: 0 }}
                    onClick={addPasted}
                    disabled={!pasteRows.length || pasteBusy}
                  >
                    {pasteBusy ? L('מוסיף...', 'Adding...') : L('הוספה לסגל', 'Add to roster')}
                  </button>
                </div>
                {pasteRows.length > 0 && (
                  <ul className="roster-paste-preview">
                    {pasteRows.slice(0, 20).map((r, i) => (
                      <li key={i}>
                        {r.number && <b dir="ltr">{r.number}</b>} {r.name}
                      </li>
                    ))}
                    {pasteRows.length > 20 && <li className="muted">{L(`ועוד ${pasteRows.length - 20}...`, `and ${pasteRows.length - 20} more...`)}</li>}
                  </ul>
                )}
              </div>
            )}
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
                <li key={p.id} className="roster-row roster-clickable" onClick={() => setPlayerPage({ ...p })}>
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
                  {/* 3.9 — יעדים לכל שורת סגל, מחובר או לא (המאמן רושם על roster_id) */}
                  {COACH_LOGS && (
                    <button className="icon-btn roster-goals" onClick={(e) => { e.stopPropagation(); setGpEdit({ player_id: p.player_id, roster_id: p.id, name: p.name, team }) }} aria-label={L('יעדים', 'Goals')} title={L('יעדים אישיים', 'Personal goals')}><Target size={15} /></button>
                  )}
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setPEdit({ ...p }) }} aria-label={L('פרטים', 'Details')}><Info size={15} /></button>
                </li>
              ))}
            </ul>
            </>
          )}

          {/* ---- בקשות הצטרפות עם הקשר ההסכמה ----
              נטען בשקט: אותה רשימה מוצגת גם בפאנל החיבור שמתחת, ולכן שורת
              "טוען..." כאן רק הייתה מקפיצה את הפריסה בכל כניסה לסגל.
              שגיאת טעינה כן מוצגת — "אין בקשות" ו"לא הצלחנו לטעון" חייבים
              להיראות שונה. */}
          {(!PLAYER_SIDE || reqsLoading) ? null : reqsFailed ? (
            <p className="alert alert-error" style={{ marginTop: 14 }}>
              {L('לא הצלחנו לטעון את בקשות ההצטרפות. זו תקלת טעינה — הבקשות לא נמחקו. ',
                 'We could not load the join requests. This is a loading error — no request was deleted. ')}
              <button type="button" className="link-button" onClick={loadReqs}>{L('נסה שוב', 'Try again')}</button>
            </p>
          ) : consentReqs.length > 0 ? (
            <div className="tc-panel tc-open" style={{ marginTop: 14 }}>
              <div className="tc-head tc-head-static">
                <span className="tc-head-l"><UserCheck size={16} /> {L('בקשות הצטרפות · אישור הורה', 'Join requests · parent approval')}</span>
                <span className="tc-head-r"><span className="tc-badge"><bdi>{consentReqs.length}</bdi></span></span>
              </div>
              <div className="tc-body">
                <p className="muted small" style={{ margin: '10px 0 0' }}>
                  {L('לפני שמאשרים — כאן רואים אם ההורה כבר אישר את ההרשמה. שחקן שההורה שלו טרם אישר יכול להצטרף לקבוצה, אבל יישאר מוגבל באפליקציה עד שההורה יאשר.',
                     'Before approving — see whether the parent has already approved. A player whose parent has not approved yet can still join the team, but stays restricted in the app until the parent approves.')}
                </p>
                <div className="tc-reqs">
                  {consentReqs.map((r) => {
                    const st = consentState(r)
                    const badge = CONSENT_BADGE[st]
                    const needsParent = st === 'waiting' || st === 'revoked'
                    return (
                      <div key={r.id} className="tc-req">
                        <Avatar name={reqName(r.player)} url={r.player?.avatar_url} size={34} />
                        <span className="tc-req-name">
                          {reqName(r.player)}
                          {r.player?.position ? <span className="muted small"> · {r.player.position}</span> : null}
                          <span style={{ display: 'block', marginBlockStart: 4 }}>
                            <span className={badge.cls} style={badge.style}>{L(badge.he, badge.en)}</span>
                          </span>
                        </span>
                        {needsParent && (
                          /* דחיפה עדינה למשפחה — הדרך של המאמן לקדם את האישור
                             במקום להישאר תקוע מולו. */
                          <button type="button" className="icon-btn" onClick={() => waShare(nudgeText(r))}
                            aria-label={L('שליחת הסבר להורה בוואטסאפ', 'Send the parent an explanation on WhatsApp')}
                            title={L('שליחת הסבר להורה', 'Nudge the parent')}>
                            <Share2 size={15} />
                          </button>
                        )}
                        <button className="tc-approve" disabled={deciding === r.id}
                          onClick={() => decideRequest(r, true)} aria-label={L('אישור', 'Approve')}>
                          <Check size={16} />
                        </button>
                        <button className="tc-reject" disabled={deciding === r.id}
                          onClick={() => decideRequest(r, false)} aria-label={L('דחייה', 'Decline')}>
                          <X size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* קוד ההצטרפות ירד לכאן: הסגל הוא הסיבה שנכנסים לטאב הזה, והקוד
              תפס את כל החלק העליון של המסך בכל כניסה.
              key: החלטה שהתקבלה בפאנל שלמעלה חייבת להיעלם גם מהרשימה שבפנים,
              אחרת נשארת שם בקשה שכבר הוכרעה. */}
          {/* צד המאמן בלבד: אין קוד הצטרפות, QR ומד «מחוברים» — אין למי */}
          {/* 4.9 — פיילוט: הפאנל מוצג רק למאמן שברשימת PILOT_COACHES (ריקה = כולם).
              קישורי #/join שכבר יצאו ממשיכים לעבוד — רק הדלת ליצירת חדשים מוגבלת. */}
          {PLAYER_SIDE && (PILOT_COACHES.length === 0 || PILOT_COACHES.includes(session.user.email)) &&
            <TeamConnect key={`${team}:${reqsRev}`} coachId={me} team={team} onApproved={load} />}

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

          {/* 4.9 — התפקיד שלי בקבוצה: ראשי / עוזר (תצוגה בלבד; התג מופיע בבאנר) */}
          <div className="pc4-role">
            <span className="muted small">{L('התפקיד שלי בקבוצה:', 'My role on this team:')}</span>
            <div className="chips">
              <button type="button" className={coachRole === 'head' ? 'chip selected' : 'chip'}
                aria-pressed={coachRole === 'head'} onClick={() => saveCoachRole('head')}>
                {L('מאמן ראשי', 'Head coach')}
              </button>
              <button type="button" className={coachRole === 'assistant' ? 'chip selected' : 'chip'}
                aria-pressed={coachRole === 'assistant'} onClick={() => saveCoachRole('assistant')}>
                {L('עוזר מאמן', 'Assistant coach')}
              </button>
            </div>
          </div>

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
              <p className="muted small" style={{ margin: 0 }}>{L('חבר את הקבוצה לליגת האיגוד במסך «משחקים וטבלה» — והטבלה תופיע כאן.', 'Connect the team to its league in «Games & table» — and the standings will show here.')}</p>
            </div>
          )}
        </aside>
        </div>
      ) : tab === 'goals' ? (
        /* ===================== יעדים =====================
           החלטת הבעלים 25.7: יעדי שבוע/חודש/עונה נשארות ובולטות (לא במגירה).
           היררכיה: המיקוד (מה שהשחקנים רואים) → שלושת כרטיסי התכנון של המאמן
           → יעדים אישיים לשחקנים. */
        <div className="team-section">
          <p className="tg-lede">
            {PLAYER_SIDE
              ? L('המיקוד מגיע לכל השחקנים ונמדד בסוף כל אימון · יעדי שבוע/חודש/עונה הן התכנון שלך · יעד אישי מגיע לשחקן אחד.',
                  'The focus reaches every player and is measured after each practice · week/month/season goals are your planning · a personal goal reaches one player.')
              : L('המיקוד הוא מה שהקבוצה עובדת עליו, ומסמנים בסקירת האימון מי עמד בו · יעדי שבוע/חודש/עונה הן התכנון שלך · יעד אישי הוא לשחקן אחד, ואתה מעדכן אותו אחרי האימון.',
                  'The focus is what the team works on, and you mark in the practice review who met it · week/month/season goals are your planning · a personal goal is for one player, and you update it after practice.')}
          </p>

          <TeamFocus coachId={me} team={team} />

          <h3 className="tg-section-title"><Target size={17} /> {L('יעדי הקבוצה', 'Team goals')}</h3>
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
              <button className="btn-primary goal-save" onClick={() => saveGoal('year', '', sText)}><Save size={15} /> {L('שמירה', 'Save')}</button>
            </div>
          </div>

          <TeamGoalsBoard coachId={me} team={team} />

          {/* «שיגורים» היה טאב נפרד — אבל שליחת משימה היא הדרך שבה מטרה
              הופכת לעבודה, ולכן היא יושבת כאן, מתחת ליעדים. */}
          <h3 className="tg-section-title"><SendIcon size={17} /> {PLAYER_SIDE ? L('משימות לשחקנים', 'Player tasks') : L('משימות', 'Tasks')}</h3>
          {!PLAYER_SIDE && (
            <p className="muted small" style={{ margin: '-6px 0 10px' }}>
              {L('רשימת המשימות שלך לשחקנים — מה ביקשת ממי ועד מתי. השחקן לא רואה אותה; אתה מסמן «ביצע» אחרי שבדקת איתו באימון.',
                 'Your task list for the players — what you asked of whom and by when. Players do not see it; you tick “done” after checking with them at practice.')}
            </p>
          )}
          <SendToPlayers session={session} embedded initialTeam={team} key={team} onSent={() => setTaRev((v) => v + 1)} />
          <TeamAssignments key={`${team}:${taRev}`} coachId={me} team={team} />
        </div>
      ) : (
        /* ===================== לו״ז ונוכחות ===================== */
        <TeamSlots key={`${team}:${slotsRev}`} coachId={me} team={team} onReview={(entry) => setReviewPractice(entry)} />
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
            {/* 4.9 — כיבוי הצ'ק-אין לילד בודד (הורה שביקש). נשמר מיד בטאפ,
                לא בכפתור «שמירה» — כדי שביטול הסכמה יהיה פעולה אחת. */}
            {PLAYER_SIDE && (
              <label className="pc4-well" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={!!pEdit.wellness_off}
                  onChange={(e) => toggleWellness(pEdit, e.target.checked)} />
                <span>
                  <b>{L('בלי שאלות בוקר', 'No morning questions')}</b>{' '}
                  <span className="muted small">{L('— הצ׳ק-אין היומי לא יוצג לשחקן הזה (בקשת הורה)', '— the daily check-in is hidden for this player (parent request)')}</span>
                </span>
              </label>
            )}
            <div className="tm-modal-actions">
              <button className="btn-primary" onClick={savePlayer}><Save size={15} /> {L('שמירה', 'Save')}</button>
              {/* א-6 — דוח התקדמות לעמוד אחד: נוכחות, משימות, יעדים ומשוב */}
              <button className="btn-soft" onClick={() => printPlayerReport({ player: pEdit, team, att: attByPlayer[pEdit.id] })}>
                <Printer size={15} /> {L('דוח התקדמות', 'Progress report')}
              </button>
              <button className="btn-ghost danger" onClick={() => delPlayer(pEdit.id)}><Trash2 size={15} /> {L('הסר שחקן', 'Remove')}</button>
            </div>

            {/* משוב אישי — לשחקן מחובר; בצד המאמן בלבד — לכל שורת סגל */}
            {fbOpen && (
              <div className="tm-feedback">
                <span className="field-label"><MessageSquareHeart size={15} /> {PLAYER_SIDE && pEdit.player_id ? L('שליחת משוב לשחקן', 'Send feedback to player') : L('משוב אישי — נשמר אצלך בלבד', 'Personal note — kept with you only')}</span>
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
                  {pEdit.player_id ? L('שליחת המשוב', 'Send feedback') : L('שמירת המשוב', 'Save feedback')}
                </button>
                {/* מה כבר כתבת — הטופס היה insert בלבד והמאמן לא ראה את עצמו */}
                {fbHistory.length > 0 && (
                  <div className="tm-fb-history">
                    <span className="tm-fb-history-lbl">{pEdit.player_id ? L('משובים אחרונים ששלחת', 'Recent feedback you sent') : L('משובים אחרונים', 'Recent feedback')}</span>
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
            {/* 3.9 — עורך היעדים לכל שורת סגל (roster_id + player_id כשיש); ההנחיה
                «ייפתחו כשהשחקן יתחבר» הוסרה — היעדים לא תלויים בחשבון */}
            {COACH_LOGS && (
              <PlayerGoalsEditor coachId={me} playerId={pEdit.player_id} rosterId={pEdit.id} team={pEdit.team} playerName={pEdit.name} />
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
          /* סגירת הסקירה מרעננת את הלו״ז — אחרת האימון נשאר «פתוח» למרות
             שהנוכחות והסיכום כבר נשמרו. */
          onClose={() => { setReviewPractice(null); setSlotsRev((v) => v + 1) }}
        />
      )}

      {/* יעדים מהירות לשחקן — נגיש מהסגל, לא קבור בעריכה */}
      {gpEdit && (
        <div className="tm-overlay" role="dialog" aria-modal="true" onClick={() => setGpEdit(null)}>
          <div className="tm-modal" ref={dlgRef} onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-head">
              <strong><Target size={16} /> {L('יעדים', 'Goals')} · {gpEdit.name}</strong>
              <button className="icon-btn" onClick={() => setGpEdit(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <div className="tm-modal-body">
              <PlayerGoalsEditor coachId={me} playerId={gpEdit.player_id} rosterId={gpEdit.roster_id} team={gpEdit.team} playerName={gpEdit.name} />
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}
