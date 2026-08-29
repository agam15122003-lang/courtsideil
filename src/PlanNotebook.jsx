import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Plus, X, Clock, Users, Check, Save, Pencil, Eraser, Type, Trash2, BookOpen, Send, Printer,
  CalendarDays, UserCheck, Search, ClipboardList,
} from 'lucide-react'
// חץ "חזרה" כיווני דרך DirIcon (חוק RTL)
import { ArrowBack } from './DirIcon'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { L, trTeam } from './i18n'
import { PLAYER_SIDE } from './flags'
import { confirmDialog } from './confirm'
import { registerUnsaved } from './unsavedGuard'
import { INK_COLORS } from './ink'
import NotebookBody from './NotebookBody'
import MiniCourt, { emptyBoard } from './MiniCourt'
import PlanSheet, { legacyItemsToBody } from './PlanSheet'
import TacticsBoard from './TacticsBoard'
import SendToPlayers from './SendToPlayers.jsx'
import { SkeletonCards } from './Skeleton'
import { ErrorState } from './states'

// «המחברת המלאה» — 18.8.2026
//
// תוכנית אימון היא דף מחברת אחד: כותרת, קבוצה/תאריך/משך, טקסט חופשי על
// שורות (הקלדה או כתב יד בעט), מגרשים קטנים בצד שמאל שמציירים עליהם,
// ונוכחות בתחתית הדף. אין חלקים ממוספרים — המאמן ממספר בעצמו אם ירצה.
// תרגיל מהספרייה נכנס לטקסט בנקודת הכתיבה (שם + תוכן) ונשאר מקושר לתוכנית.
//
// אין שחזור טיוטה אוטומטי: יציאה בלי «שמור» = השינויים לא נשמרים.
// «שמור כטיוטה» שומר במסד עם is_draft — הטיוטה מופיעה ברשימה עם תג.
//
// props:
//   session         - המשתמש המחובר
//   planId          - תוכנית קיימת לעריכה (חסר = תוכנית חדשה)
//   onSaved(planId) - אחרי שמירה (המחברת נשארת פתוחה; ההורה מרענן את הרשימה)
//   onCancel        - חזרה לרשימה

// "עוד לא נפרס בפרודקשן" — עמודה/פונקציה/טבלה שחסרות במסד
export const notDeployed = (e) =>
  ['42703', '42883', '42P01', 'PGRST202', 'PGRST204'].includes(e?.code) ||
  /does not exist|could not find/i.test(e?.message || '')

const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fmtDateHe = (iso) => {
  if (!iso) return ''
  const x = new Date(iso + 'T00:00')
  return Number.isNaN(x.getTime()) ? iso : x.toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric', year: 'numeric' })
}
const newId = () => Date.now() + Math.random()

// סיבות היעדרות/איחור — רשימה מוכנה + מילים חופשיות
const REASONS = () => [
  { k: 'injury', he: 'פציעה', en: 'Injury' },
  { k: 'sick', he: 'מחלה', en: 'Sick' },
  { k: 'school', he: 'לימודים', en: 'School' },
  { k: 'family', he: 'משפחה', en: 'Family' },
  { k: 'other', he: 'אחר', en: 'Other' },
]
// הסיבה נשמרת כמחרוזת אחת: «פציעה» או «פציעה: קרסול». כאן מפרקים חזרה.
const splitReason = (s) => {
  const txt = (s || '').trim()
  if (!txt) return { preset: '', text: '' }
  for (const r of REASONS()) {
    if (txt === r.he || txt === r.en) return { preset: r.k, text: '' }
    if (txt.startsWith(r.he + ':') || txt.startsWith(r.en + ':')) return { preset: r.k, text: txt.slice(txt.indexOf(':') + 1).trim() }
  }
  return { preset: 'other', text: txt }
}
const joinReason = (preset, text) => {
  const r = REASONS().find((x) => x.k === preset)
  const t = (text || '').trim()
  if (!r) return t
  if (r.k === 'other' && t) return t
  return t ? `${r.he}: ${t}` : r.he
}

const sortRoster = (rows) =>
  rows.slice().sort((a, b) => {
    const na = parseInt(a.number, 10), nb = parseInt(b.number, 10)
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
    if (!Number.isNaN(na) && Number.isNaN(nb)) return -1
    if (Number.isNaN(na) && !Number.isNaN(nb)) return 1
    return (a.name || '').localeCompare(b.name || '', 'he')
  })

// שלוש דרגות מסד, כמו ברשימת התוכניות: עם עמודות המחברת / בלי אבל עם
// title+description+part על הפריטים (המצב בייצור היום) / מסד ותיק לגמרי.
// בלי הדרגה האמצעית, שורה חופשית בתוכנית ישנה הייתה נטענת כ«תרגיל» ריק.
const PLAN_ITEM_COLS = 'plan_items(id, drill_id, position, part, duration_minutes, note, title, description, drill:drills(id, title, description, duration_minutes, category, board))'
const PLAN_ITEM_COLS_BARE = 'plan_items(id, drill_id, position, duration_minutes, note, drill:drills(id, title, description, duration_minutes, category, board))'
const PLAN_SELECT = `id, name, created_by, created_at, is_public, body, ink, courts, team, session_date, duration_minutes, is_draft, updated_at, ${PLAN_ITEM_COLS}`
const PLAN_SELECT_MID = `id, name, created_by, created_at, is_public, ${PLAN_ITEM_COLS}`
const PLAN_SELECT_BARE = `id, name, created_by, created_at, ${PLAN_ITEM_COLS_BARE}`
const PLAN_SELECTS = [PLAN_SELECT, PLAN_SELECT_MID, PLAN_SELECT_BARE]

export default function PlanNotebook({ session, planId, onSaved, onCancel, onOpenRun }) {
  const me = session.user.id

  const [loading, setLoading] = useState(!!planId)
  const [loadError, setLoadError] = useState(null)
  const [coach, setCoach] = useState({ club: '', name: '' })
  const [teams, setTeams] = useState([])
  const legacyDb = useRef(false) // המסד עוד לא הריץ supabase_notebook_18_8.sql

  // --- הדף ---
  const [name, setName] = useState('')
  const [team, setTeam] = useState('')
  const [date, setDate] = useState(todayISO)
  const [duration, setDuration] = useState('')
  const [body, setBody] = useState('')
  const [ink, setInk] = useState([])
  const [courts, setCourts] = useState(() => [0, 1, 2].map(() => ({ id: newId(), board: emptyBoard() })))
  const [linked, setLinked] = useState([]) // תרגילים מהספרייה שנכנסו לדף: {key, id?, drill_id, title, duration_minutes}
  const [isDraft, setIsDraft] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [extraLines, setExtraLines] = useState(0)

  // --- כלים ---
  const [pageTool, setPageTool] = useState('type') // type | pen | eraser
  const [pageColor, setPageColor] = useState(INK_COLORS[0].c)
  const [courtTool, setCourtTool] = useState('pen') // pen | eraser
  const [courtColor, setCourtColor] = useState(INK_COLORS[0].c)
  const [openCourt, setOpenCourt] = useState(null)

  // --- נוכחות ---
  const [roster, setRoster] = useState([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState(null)
  const [rosterTick, setRosterTick] = useState(0) // «נסה שוב» לשליפת הסגל
  const [att, setAtt] = useState({}) // team_players.id -> {status, preset, text}
  const attTouched = useRef(false)

  // --- בורר תרגילים ---
  const [picking, setPicking] = useState(false)
  const [pickQuery, setPickQuery] = useState('')
  const [allDrills, setAllDrills] = useState(null)
  const [pickError, setPickError] = useState(null)
  const [pickSearching, setPickSearching] = useState(false)
  const [pickHits, setPickHits] = useState(null) // תוצאות חיפוש מהשרת (מעבר ל-400 הראשונים)
  const taRef = useRef(null)
  const cursorRef = useRef(null)
  const focusedOnce = useRef(false) // הטקסט קיבל פוקוס אי פעם? אחרת תרגיל נכנס בסוף

  // --- מצבים ---
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [savedId, setSavedId] = useState(planId || null)
  const snapshot = useRef('')
  const snapParts = useRef(null) // { base, ink, att } — חלקי הצילום, כדי לעדכן חלק בלי לפרסר

  // חתימה של כל מה שנשמר — כדי לדעת אם יש שינויים שלא נשמרו.
  // בשני שלבים בכוונה: הדיו והמגרשים הם 95% מהנפח ומשתנים רק בקו/מחיקה,
  // בעוד הטקסט משתנה בכל הקשה. חתימה אחת הייתה מסרקת את כל הדיו ל-JSON
  // מחדש על כל תו — בדיוק במכשיר (אייפד) שבו גם כותבים בעט וגם מקלידים.
  // שלושה חלקים — base (משתנה בכל הקשה, זול), ink (כבד, משתנה רק בקו/מחיקה),
  // att (הנוכחות, שנטענת מאוחר ומתעדכנת בצילום בלי לפרסר אותו).
  // ⚠ כל מי שכותב לצילום (ready, save, att-load) חייב לבנות אותו מאותם
  //   שלושה חלקים, אחרת ההשוואה לעולם לא שווה והדף «לא שמור» לנצח.
  const baseSer = useMemo(
    () => JSON.stringify({ name, team, date, duration, body, linked: linked.map((l) => l.drill_id), isDraft }),
    [name, team, date, duration, body, linked, isDraft]
  )
  const inkSer = useMemo(() => JSON.stringify({ ink, courts }), [ink, courts])
  const attSer = useMemo(() => JSON.stringify(att), [att])
  const serialized = baseSer + inkSer + attSer
  const dirty = snapshot.current !== '' && serialized !== snapshot.current

  // ---------- טעינה ----------
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: p } = await supabase
        .from('profiles').select('first_name, last_name, club, age_groups').eq('id', me).single()
      if (!alive) return
      if (p) {
        setCoach({ club: p.club || '', name: `${p.first_name || ''} ${p.last_name || ''}`.trim() })
        setTeams(Array.isArray(p.age_groups) ? p.age_groups : [])
      }
    })()
    return () => { alive = false }
  }, [me])

  useEffect(() => {
    if (!planId) return
    let alive = true
    ;(async () => {
      setLoading(true)
      let tier = 0
      let { data, error } = await supabase.from('training_plans').select(PLAN_SELECTS[0]).eq('id', planId).single()
      while (error && notDeployed(error) && tier < PLAN_SELECTS.length - 1) {
        tier += 1
        if (tier >= 1) legacyDb.current = true // אין עמודות מחברת במסד
        ;({ data, error } = await supabase.from('training_plans').select(PLAN_SELECTS[tier]).eq('id', planId).single())
      }
      if (!alive) return
      if (error || !data) {
        setLoadError(L('שגיאה בטעינת התוכנית: ', 'Failed to load plan: ') + (error?.message || ''))
        setLoading(false)
        return
      }
      const items = (data.plan_items || []).slice().sort((a, b) => ((a.part || 1) - (b.part || 1)) || (a.position - b.position))
      setName(data.name || '')
      setTeam(data.team || '')
      setDate(data.session_date || todayISO())
      setDuration(data.duration_minutes != null ? String(data.duration_minutes) : '')
      // תוכנית ישנה (בנויה מפריטים, בלי עמודת גוף בכלל) — הפריטים הופכים
      // לטקסט על הדף. גוף ריק ('') הוא בחירה של המאמן — לא ממלאים אותו שוב.
      setBody(data.body != null ? data.body : legacyItemsToBody(items))
      setInk(Array.isArray(data.ink) ? data.ink : [])
      const cs = Array.isArray(data.courts) && data.courts.length ? data.courts : [0, 1, 2].map(() => ({ id: newId(), board: emptyBoard() }))
      setCourts(cs.map((c) => ({ id: c.id || newId(), board: c.board && c.board.steps ? c.board : emptyBoard() })))
      setLinked(items.filter((it) => it.drill_id).map((it) => ({
        key: it.id, id: it.id, drill_id: it.drill_id,
        title: it.drill?.title || it.title || '', description: it.drill?.description || it.description || '',
        duration_minutes: it.duration_minutes ?? it.drill?.duration_minutes ?? null,
      })))
      setIsDraft(!!data.is_draft)
      setIsPublic(!!data.is_public)
      setLoading(false)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  // הצילום הראשון נלקח ברגע שהתוכנית עצמה נטענה. קודם חיכינו גם לסגל
  // ולנוכחות — וטקסט שנכתב בשניות הראשונות הפך לבסיס ההשוואה, כלומר
  // «לא שונה» ולא מוגן ביציאה. חלק הנוכחות נכנס לצילום אחר כך, מתוך
  // אפקט הסגל (שמעדכן רק את הרכיב שלו).
  const ready = !loading
  useEffect(() => {
    if (ready && !snapshot.current) {
      snapshot.current = serialized
      snapParts.current = { base: baseSer, ink: inkSer, att: attSer }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // הטקסט קיבל פוקוס אי פעם? (בלי זה «תרגיל מהספרייה» נכנס בסוף הדף)
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    const onFocus = () => { focusedOnce.current = true }
    el.addEventListener('focus', onFocus)
    return () => el.removeEventListener('focus', onFocus)
  }, [loading, preview])

  // הסגל של הקבוצה + הנוכחות שכבר סומנה לתאריך הזה
  useEffect(() => {
    if (!team) { setRoster([]); setRosterError(null); return }
    let alive = true
    ;(async () => {
      setRosterLoading(true)
      const [plRes, attRes] = await Promise.all([
        supabase.from('team_players').select('id, name, number, status, player_id').eq('coach_id', me).eq('team', team),
        supabase.from('practice_attendance').select('player_id, status, reason').eq('coach_id', me).eq('team', team).eq('session_date', date),
      ])
      let attRows = attRes.data
      if (attRes.error && notDeployed(attRes.error)) {
        // מסד בלי עמודת reason
        const r = await supabase.from('practice_attendance').select('player_id, status').eq('coach_id', me).eq('team', team).eq('session_date', date)
        attRows = r.data
      }
      if (!alive) return
      // כשל שליפה אינו «אין שחקנים»: מציגים שגיאה עם נסיון חוזר (DESIGN.md §6)
      if (plRes.error) {
        setRoster([])
        setRosterError(L('טעינת הסגל נכשלה: ', 'Failed to load the roster: ') + plRes.error.message)
        setRosterLoading(false)
        return
      }
      setRosterError(null)
      const rows = sortRoster(plRes.data || [])
      setRoster(rows)
      // סימון שמור לתאריך הזה מנצח; אין סימון — מתחילים נקי, אחרת הסימונים
      // של התאריך הקודם היו נכתבים בשמירה על התאריך החדש.
      const next = {}
      if (attRows && attRows.length) {
        for (const r of attRows) {
          const { preset, text } = splitReason(r.reason)
          next[r.player_id] = { status: r.status || 'present', preset, text }
        }
      }
      if (attRows?.length || !attTouched.current) {
        setAtt(next)
        attTouched.current = false
        // טעינה אינה «שינוי»: מעדכנים בצילום רק את חלק הנוכחות
        if (snapshot.current && snapParts.current) {
          const p = { ...snapParts.current, att: JSON.stringify(next) }
          snapParts.current = p
          snapshot.current = p.base + p.ink + p.att
        }
      }
      setRosterLoading(false)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, date, me, rosterTick])

  // אזהרה לפני עזיבת הדף עם שינויים — גם ברענון/סגירה של הדפדפן וגם
  // במעבר מסך בתוך האפליקציה (סרגל הצד, טאבים, ניווט מדף הבית).
  // בלי החלק השני, לחיצה על «ספרייה» באמצע כתיבה מחקה את הדף בשקט.
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    const off = registerUnsaved(() => confirmDialog({
      title: L('לצאת בלי לשמור?', 'Leave without saving?'),
      message: L('השינויים במחברת לא נשמרו. אפשר לחזור ולשמור כטיוטה.', 'Your changes were not saved. You can go back and save as a draft.'),
      confirmText: L('יציאה בלי לשמור', 'Leave without saving'),
      danger: true,
    }))
    return () => { window.removeEventListener('beforeunload', onUnload); off() }
  }, [dirty])

  // ---------- נוכחות ----------
  const attOf = (id) => att[id] || { status: 'present', preset: '', text: '' }
  const setStatus = (id, status) => {
    attTouched.current = true
    setAtt((cur) => ({ ...cur, [id]: { ...(cur[id] || { preset: '', text: '' }), status } }))
  }
  const setReason = (id, patch) => {
    attTouched.current = true
    setAtt((cur) => ({ ...cur, [id]: { ...(cur[id] || { status: 'absent' }), ...patch } }))
  }
  const attending = roster.filter((p) => attOf(p.id).status !== 'absent').length

  // ---------- מגרשים ----------
  const updateCourt = (id, board) => setCourts((cur) => cur.map((c) => (c.id === id ? { ...c, board } : c)))
  const addCourt = () => setCourts((cur) => [...cur, { id: newId(), board: emptyBoard() }])
  const clearOrRemoveCourt = async (c) => {
    const s = c.board?.steps?.[0] || {}
    const has = (s.ink || []).length || (s.objects || []).length || (s.arrows || []).length || (c.board?.steps || []).length > 1
    if (has) {
      const ok = await confirmDialog({ title: L('לנקות את המגרש?', 'Clear this court?'), message: L('הציור על המגרש יימחק.', 'The drawing on this court will be erased.'), confirmText: L('ניקוי', 'Clear') })
      if (!ok) return
      updateCourt(c.id, { ...c.board, steps: [{ objects: [], arrows: [], ink: [] }] })
      return
    }
    // האורך נבדק על המצב **הנוכחי**: c מגיע מ-MiniCourt הממומו, ולכן
    // הבדיקה על courts שב-closure הייתה ישנה ואפשרה למחוק גם את האחרון
    setCourts((cur) => (cur.length <= 1 ? cur : cur.filter((x) => x.id !== c.id)))
  }

  // ---------- בורר תרגילים ----------
  const PICK_PAGE = 400
  // השליפה בפונקציה נפרדת: «נסה שוב» קרא ל-openPicker, שבדק allDrills מתוך
  // closure ישן (עדיין []), לא שלף שוב — והבורר נשאר על «טוען תרגילים…» לנצח.
  const loadPickDrills = async () => {
    setPickError(null)
    setAllDrills(null)
    const { data, error } = await supabase
      .from('drills')
      .select('id, title, description, category, duration_minutes')
      .order('created_at', { ascending: false })
      .limit(PICK_PAGE)
    if (error) { setPickError(L('טעינת התרגילים נכשלה: ', 'Failed to load drills: ') + error.message); setAllDrills([]); return }
    setAllDrills(data || [])
  }
  const openPicker = async () => {
    setPicking(true)
    setPickQuery('')
    setPickHits(null)
    if (allDrills == null || pickError) await loadPickDrills()
  }

  // ספרייה גדולה מ-400 תרגילים: הרשימה המקומית היא רק «האחרונים», ולכן
  // חיפוש רץ גם בשרת — אחרת תרגיל ותיק פשוט לא היה נמצא.
  useEffect(() => {
    if (!picking) return
    const q = pickQuery.trim()
    if (q.length < 2 || (allDrills || []).length < PICK_PAGE) { setPickHits(null); return }
    let alive = true
    setPickSearching(true)
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('drills')
        .select('id, title, description, category, duration_minutes')
        .or(`title.ilike.%${q}%,category.ilike.%${q}%`)
        .order('title', { ascending: true })
        .limit(60)
      if (!alive) return
      setPickSearching(false)
      if (error) { setPickHits(null); return }
      setPickHits(data || [])
    }, 350)
    return () => { alive = false; clearTimeout(t); setPickSearching(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickQuery, picking, allDrills])
  const rememberCursor = () => {
    const el = taRef.current
    if (el && focusedOnce.current) cursorRef.current = el.selectionStart
  }
  // התרגיל נכנס בשורה חדשה במקום שבו נעצר הטקסט, אחרי שורת רווח: שם + תוכן.
  // אם עוד לא כתבו בדף בכלל — נכנס בסוף.
  const insertDrill = (d) => {
    const el = taRef.current
    let pos = body.length
    if (focusedOnce.current) {
      if (el && typeof el.selectionStart === 'number') pos = el.selectionStart
      else if (cursorRef.current != null) pos = cursorRef.current
    }
    pos = Math.max(0, Math.min(body.length, pos))
    let before = body.slice(0, pos)
    let after = body.slice(pos)
    before = before.replace(/\s+$/, '')
    after = after.replace(/^[ \t]*\n?/, '')
    const chunk = [d.title || L('תרגיל', 'Drill'), (d.description || '').trim()].filter(Boolean).join('\n')
    const insert = (before ? '\n\n' : '') + chunk + '\n' + (after ? '\n' : '')
    const next = before + insert + after
    setBody(next)
    setLinked((cur) => [...cur, { key: newId(), drill_id: d.id, title: d.title, description: d.description || '', duration_minutes: d.duration_minutes || null }])
    setPicking(false)
    const caret = before.length + insert.length
    cursorRef.current = caret
    setTimeout(() => {
      const t = taRef.current
      if (!t) return
      t.focus()
      try { t.setSelectionRange(caret, caret) } catch { /* לא קריטי */ }
    }, 0)
    toast.success(L(`«${d.title}» נכנס לדף`, `“${d.title}” added to the page`))
  }
  const unlinkDrill = (key) => setLinked((cur) => cur.filter((l) => l.key !== key))

  const pickList = useMemo(() => {
    const q = pickQuery.trim()
    const local = (allDrills || []).filter((d) => !q || (d.title || '').includes(q) || (d.category || '').includes(q))
    if (!pickHits) return local.slice(0, 60)
    // איחוד מקומי + תוצאות השרת, בלי כפילויות
    const seen = new Set(local.map((d) => d.id))
    return [...local, ...pickHits.filter((d) => !seen.has(d.id))].slice(0, 60)
  }, [allDrills, pickQuery, pickHits])

  // ---------- שמירה ----------
  const save = async ({ draft }) => {
    if (!name.trim()) {
      toast.error(L('תנו שם לתוכנית', 'Give the plan a name'))
      return
    }
    setSaving(true)
    const now = new Date().toISOString()
    // העמודה שלמה במסד: מעגלים ומונעים שלילי, אחרת «90.5» היה מפיל את כל
    // השמירה (הטקסט, הדיו והמגרשים) בשגיאת Postgres גולמית.
    const dNum = Number(duration)
    const durationInt = duration === '' || Number.isNaN(dNum) ? null : Math.max(0, Math.round(dNum))
    const full = {
      name: name.trim(),
      body,
      ink,
      courts: courts.map((c) => ({ id: c.id, board: c.board })),
      team: team || null,
      session_date: date || null,
      duration_minutes: durationInt,
      is_draft: !!draft,
      updated_at: now,
    }
    let id = savedId
    let usedLegacy = legacyDb.current
    let error = null

    const write = async (payload) => {
      if (id) {
        const r = await supabase.from('training_plans').update(payload).eq('id', id)
        return r.error
      }
      const r = await supabase.from('training_plans').insert({ ...payload, created_by: me }).select('id').single()
      if (!r.error && r.data) id = r.data.id
      return r.error
    }

    if (!usedLegacy) {
      error = await write(full)
      if (error && notDeployed(error)) { usedLegacy = true; legacyDb.current = true; error = null }
    }
    if (usedLegacy && !error) error = await write({ name: full.name })

    if (error) {
      setSaving(false)
      toast.error(L('השמירה נכשלה: ', 'Save failed: ') + error.message)
      return
    }

    // תרגילים מקושרים — נשמרים כ-plan_items (רק כשהמסד מעודכן; במסד ישן
    // מחיקת הפריטים הייתה מוחקת את תוכן התוכנית שהומר לטקסט בלי שהטקסט נשמר)
    let nextLinked = linked
    if (!usedLegacy) {
      // מוחקים רק פריטים שמקושרים לתרגיל בספרייה ושהמאמן ניתק. שורות
      // חופשיות של תוכנית ישנה (drill_id ריק) נשארות — הן התוכן שהשחקנים
      // כבר קיבלו, וההרצה/הבית עדיין קוראים אותן.
      const keepIds = linked.map((l) => l.id).filter(Boolean)
      let del = supabase.from('plan_items').delete().eq('plan_id', id).not('drill_id', 'is', null)
      if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`)
      const { error: e1 } = await del
      if (e1) toast.error(L('חלק מהתרגילים המקושרים לא נשמרו', 'Some linked drills were not saved'))
      // סדר: לפי המקום ברשימה. חדשים נכנסים עם position של מקומם.
      const fresh = linked.map((l, i) => ({ l, i })).filter((x) => !x.l.id)
      if (fresh.length) {
        const rows = fresh.map(({ l, i }) => ({ plan_id: id, drill_id: l.drill_id, position: i, duration_minutes: l.duration_minutes || null }))
        let r = await supabase.from('plan_items').insert(rows.map((x) => ({ ...x, part: 1 }))).select('id, position')
        if (r.error) r = await supabase.from('plan_items').insert(rows).select('id, position')
        if (r.error) toast.error(L('חלק מהתרגילים המקושרים לא נשמרו', 'Some linked drills were not saved'))
        else {
          const byPos = new Map((r.data || []).map((x) => [x.position, x.id]))
          nextLinked = linked.map((l, i) => (l.id ? l : { ...l, id: byPos.get(i) || l.id }))
        }
      }
      // עדכון סדר לפריטים שכבר היו במסד
      await Promise.all(linked.map((l, i) => (l.id ? supabase.from('plan_items').update({ position: i }).eq('id', l.id) : null)).filter(Boolean))
    }

    // נוכחות — נשמרת גם ב«נוכחות» של הקבוצה, אבל **רק** אם המאמן באמת
    // סימן משהו, או שהאימון כבר היה — תאריך שעבר **ממש**. תוכנית שנכתבת
    // ליום האימון עצמו (לפני האימון!) הייתה כותבת «הגיע» לכל הסגל, וסקירת
    // האימון שאחריו נראתה כאילו כבר מולאה.
    // כשהמסד עוד לא עודכן (usedLegacy) הקבוצה והתאריך לא נשמרו בתוכנית,
    // ולכן גם הנוכחות לא נכתבת — כדי לא ליצור רישום «יתום».
    const attWorthSaving = attTouched.current || (!!date && date < todayISO())
    if (team && roster.length && !usedLegacy && attWorthSaving) {
      const rows = roster.map((p) => {
        const a = attOf(p.id)
        return {
          coach_id: me, team, session_date: date, player_id: p.id,
          status: a.status || 'present',
          reason: a.status === 'present' ? null : (joinReason(a.preset, a.text) || null),
        }
      })
      let { error: e3 } = await supabase.from('practice_attendance').upsert(rows, { onConflict: 'coach_id,team,session_date,player_id' })
      if (e3 && notDeployed(e3)) {
        ;({ error: e3 } = await supabase.from('practice_attendance').upsert(rows.map(({ reason, ...r }) => r), { onConflict: 'coach_id,team,session_date,player_id' }))
      }
      if (e3) toast.error(L('הנוכחות לא נשמרה: ', 'Attendance was not saved: ') + e3.message)
    } else if (team && roster.length && !usedLegacy && !attWorthSaving) {
      toast.info(L('הנוכחות עוד לא נרשמה — היא תישמר ברגע שתסמנו אותה בדף.', 'Attendance was not recorded yet — it saves the moment you mark it on the page.'))
    }

    setSaving(false)
    setSavedId(id)
    setIsDraft(!!draft)
    setLinked(nextLinked)
    attTouched.current = false
    // המחברת נשארת פתוחה — הצילום מתעדכן למה שנשמר עכשיו.
    // במסד שטרם עודכן נשמר רק השם, ולכן הצילום **לא** מתעדכן: הדף עדיין
    // «לא שמור», וכל יציאה ממנו תזהיר במקום לאבד את הכתוב בשקט.
    if (!usedLegacy) {
      const p = {
        base: JSON.stringify({ name, team, date, duration, body, linked: nextLinked.map((l) => l.drill_id), isDraft: !!draft }),
        ink: JSON.stringify({ ink, courts }),
        att: JSON.stringify(att),
      }
      snapParts.current = p
      snapshot.current = p.base + p.ink + p.att
    }
    if (usedLegacy) {
      toast.error(L('נשמר השם בלבד! הטקסט, כתב היד והמגרשים לא נשמרו — צריך להריץ במסד את supabase_notebook_18_8.sql.', 'Only the name was saved! The text, handwriting and courts were not — run supabase_notebook_18_8.sql on the database.'))
    } else {
      toast.success(draft ? L('הטיוטה נשמרה', 'Draft saved') : L('התוכנית נשמרה', 'Plan saved'))
    }
    onSaved?.(id)
  }

  const cancel = async () => {
    if (dirty) {
      const ok = await confirmDialog({
        title: L('לצאת בלי לשמור?', 'Leave without saving?'),
        message: L('השינויים במחברת לא נשמרו. אפשר לחזור ולשמור כטיוטה.', 'Your changes were not saved. You can go back and save as a draft.'),
        confirmText: L('יציאה בלי לשמור', 'Leave without saving'),
        danger: true,
      })
      if (!ok) return
    }
    onCancel?.()
  }

  // ---------- מסכים חלופיים ----------
  const planTitle = name.trim() || L('תוכנית אימון', 'Practice plan')
  const sheetPlan = {
    name, team, session_date: date, duration_minutes: duration === '' ? null : Number(duration),
    body, ink, courts, coach,
  }
  const sheetAtt = team && roster.length
    ? roster.map((p) => { const a = attOf(p.id); return { name: p.name, number: p.number, status: a.status, reason: a.status === 'present' ? '' : joinReason(a.preset, a.text) } })
    : null

  if (preview) {
    return (
      <div className="welcome-card nbk-focus">
        <div className="nb-actions">
          <button type="button" className="btn-ghost" onClick={() => setPreview(false)}>
            <Pencil size={16} /> {L('חזרה לעריכה', 'Back to editing')}
          </button>
          <button type="button" className="btn-soft" onClick={() => window.print()}>
            <Printer size={16} /> {L('הדפסה', 'Print')}
          </button>
        </div>
        <PlanSheet plan={sheetPlan} attendance={sheetAtt} />
      </div>
    )
  }

  // nbk-focus גם כאן: בלעדיו האייפד הציג לרגע את שלד המסך המלא ואז קפץ
  // לפריסת העורך — ריצוד בכל פתיחת תוכנית
  if (loading) {
    return (
      <div className="welcome-card nbk-focus">
        <SkeletonCards count={1} lines={6} />
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="welcome-card nbk-focus">
        <button className="link-button" onClick={onCancel}>
          <ArrowBack size={15} className="back-ic" /> {L('כל התוכניות', 'All plans')}
        </button>
        <p className="alert alert-error" style={{ marginTop: 12 }}>{loadError}</p>
      </div>
    )
  }

  const openCourtObj = openCourt != null ? courts.find((c) => c.id === openCourt) : null
  const openCourtIdx = openCourtObj ? courts.indexOf(openCourtObj) : -1
  const noTeams = teams.length === 0

  return (
    <div className="welcome-card nbk-editor nbk-focus">
      <button className="link-button" onClick={cancel}>
        <ArrowBack size={15} className="back-ic" /> {L('כל התוכניות', 'All plans')}
      </button>

      <div className="drillform-head nbk-head" style={{ marginTop: 6 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {!savedId ? L('תוכנית אימון חדשה', 'New practice plan') : L('עריכת תוכנית', 'Edit plan')}
            {isDraft && savedId && <span className="nbk-draft-tag">{L('טיוטה', 'Draft')}</span>}
          </h2>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            {L('כותבים את האימון ישר על הדף — הקלדה או עט. תרגיל מהספרייה נכנס למקום שבו עצרתם. נוכחות מסמנים בתחתית הדף.', 'Write the practice right on the page — typing or pen. A library drill drops in where you stopped. Mark attendance at the bottom.')}
          </p>
        </div>
        <div className="nbk-head-actions">
          <button type="button" className="btn-soft" onClick={() => setPreview(true)}>
            <BookOpen size={16} /> {L('תצוגה והדפסה', 'Preview & print')}
          </button>
          {savedId && onOpenRun && (
            <button type="button" className="btn-soft" onClick={async () => {
              // «פתח כתוכנית» עוזב את העורך — אותה הגנה כמו יציאה רגילה
              if (dirty) {
                const ok = await confirmDialog({
                  title: L('לצאת בלי לשמור?', 'Leave without saving?'),
                  message: L('השינויים במחברת לא נשמרו. אפשר לחזור ולשמור כטיוטה.', 'Your changes were not saved. You can go back and save as a draft.'),
                  confirmText: L('יציאה בלי לשמור', 'Leave without saving'),
                  danger: true,
                })
                if (!ok) return
              }
              onOpenRun(savedId)
            }}>
              <BookOpen size={16} /> {L('פתח כתוכנית', 'Open as plan')}
            </button>
          )}
          {savedId && (
            <button type="button" className="btn-soft" onClick={() => setSending(true)}>
              <Send size={16} /> {PLAYER_SIDE ? L('שלח לשחקנים', 'Send to players') : L('כמשימה לשחקנים', 'As a task for players')}
            </button>
          )}
        </div>
      </div>

      {/* בורר תרגילים מהספרייה — נכנס לדף בנקודת הכתיבה */}
      {picking && (
        <div className="picker nbk-picker">
          <div className="picker-head">
            <span className="field-label">{L('תרגיל מהספרייה — נכנס במקום שבו עצרתם', 'Library drill — inserted where you stopped')}</span>
            <button className="link-button" onClick={() => setPicking(false)}>{L('סגור', 'Close')}</button>
          </div>
          <div className="nbk-pick-search">
            <Search size={15} aria-hidden="true" />
            <input
              className="finder-input"
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
              placeholder={L('חיפוש לפי שם או קטגוריה…', 'Search by name or category…')}
              autoFocus
            />
          </div>
          {pickError ? (
            <ErrorState compact message={pickError} onRetry={() => loadPickDrills()} />
          ) : allDrills == null || pickSearching ? (
            <p className="muted small">{L('טוען תרגילים…', 'Loading drills…')}</p>
          ) : pickList.length === 0 ? (
            <p className="muted small">{L('לא נמצאו תרגילים.', 'No drills found.')}</p>
          ) : (
            <div className="picker-list">
              {pickList.map((d) => (
                <button key={d.id} type="button" className="picker-item" onClick={() => insertDrill(d)}>
                  <span>{d.title}</span>
                  {d.duration_minutes && <span className="muted small" dir="ltr">{d.duration_minutes} {L('דק׳', 'min')}</span>}
                  {d.category && <span className="cat-badge">{d.category}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== המחברת ===== */}
      <div className="notebook nb-edit nbk" dir="rtl" style={{ marginTop: 16 }}>
        <div className="nb-header">
          <div className="nb-header-top">
            <span className="nb-club">{coach.club || 'CourtSide'}</span>
            <span className="nb-date">{fmtDateHe(date)}</span>
          </div>
          <h2 className="nb-title">{L('מערך אימון', 'Practice Plan')}</h2>
          {coach.name && <div className="nb-coach">{L('שם המאמן: ', 'Coach: ')}{coach.name}</div>}
        </div>

        <div className="nbk-page">
          {/* ---- העמודה הראשית: כותרת, פרטים, הטקסט, הנוכחות ---- */}
          <div className="nbk-main">
            <input
              className="nb-write nb-write-title"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={L('שם התוכנית...', 'Plan name...')}
              aria-label={L('שם התוכנית', 'Plan name')}
              maxLength={120}
            />

            <div className="nb-edit-meta nbk-meta">
              <label className="nb-slot">
                <Users size={14} aria-hidden="true" />
                <span className="nb-slot-k">{L('קבוצה', 'Team')}</span>
                <select
                  className="nb-write nb-slot-in nbk-select"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  aria-label={L('קבוצה', 'Team')}
                >
                  <option value="">{noTeams ? L('אין קבוצות בפרופיל', 'No teams in profile') : L('בחרו קבוצה…', 'Pick a team…')}</option>
                  {teams.map((t) => <option key={t} value={t}>{trTeam(t)}</option>)}
                  {team && !teams.includes(team) && <option value={team}>{trTeam(team)}</option>}
                </select>
              </label>
              <label className="nb-slot">
                <CalendarDays size={14} aria-hidden="true" />
                <span className="nb-slot-k">{L('תאריך', 'Date')}</span>
                <input
                  className="nb-write nb-slot-in nbk-date"
                  type="date"
                  dir="ltr"
                  value={date}
                  onChange={(e) => setDate(e.target.value || todayISO())}
                  aria-label={L('תאריך האימון', 'Practice date')}
                />
              </label>
              <label className="nb-slot">
                <Clock size={14} aria-hidden="true" />
                <span className="nb-slot-k">{L('משך האימון', 'Duration')}</span>
                <input
                  className="nb-write nb-slot-in nb-slot-num"
                  type="number"
                  min="0"
                  dir="ltr"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="90"
                  aria-label={L('משך האימון בדקות', 'Practice duration in minutes')}
                />
                <span className="nb-slot-unit">{L('דק׳', 'min')}</span>
              </label>
            </div>

            {/* סרגל הכתיבה: הקלדה / עט / מחק / צבע / תרגיל מהספרייה */}
            <div className="nbk-tools" role="toolbar" aria-label={L('כלי כתיבה', 'Writing tools')}>
              <div className="tb-group" role="group" aria-label={L('כלי', 'Tool')}>
                <button type="button" className={pageTool === 'type' ? 'tb-btn on' : 'tb-btn'} aria-pressed={pageTool === 'type'} onClick={() => setPageTool('type')}>
                  <Type size={15} /> {L('הקלדה', 'Type')}
                </button>
                <button type="button" className={pageTool === 'pen' ? 'tb-btn on' : 'tb-btn'} aria-pressed={pageTool === 'pen'} onClick={() => setPageTool('pen')}>
                  <Pencil size={15} /> {L('עט', 'Pen')}
                </button>
                <button type="button" className={pageTool === 'eraser' ? 'tb-btn on' : 'tb-btn'} aria-pressed={pageTool === 'eraser'} onClick={() => setPageTool('eraser')}>
                  <Eraser size={15} /> {L('מחק', 'Eraser')}
                </button>
                {pageTool === 'pen' && (
                  <span className="ink-colors" role="radiogroup" aria-label={L('צבע העט', 'Pen color')}>
                    {INK_COLORS.map((k) => (
                      <button key={k.c} type="button" role="radio" aria-checked={pageColor === k.c} aria-label={L(k.he, k.en)}
                        className={pageColor === k.c ? 'ink-swatch on' : 'ink-swatch'} style={{ '--ink': k.c }} onClick={() => setPageColor(k.c)} />
                    ))}
                  </span>
                )}
                {ink.length > 0 && (
                  <button type="button" className="tb-btn" onClick={async () => {
                    const ok = await confirmDialog({ title: L('למחוק את כל כתב היד בדף?', 'Erase all handwriting on the page?'), confirmText: L('מחיקה', 'Erase'), danger: true })
                    if (ok) setInk([])
                  }}>
                    <Trash2 size={15} /> {L('ניקוי הדיו', 'Clear ink')}
                  </button>
                )}
              </div>
              <button type="button" className="btn-soft nbk-add-drill" onPointerDown={rememberCursor} onClick={openPicker}>
                <Plus size={15} /> {L('תרגיל מהספרייה', 'Library drill')}
              </button>
            </div>

            <NotebookBody
              value={body}
              onChange={setBody}
              ink={ink}
              onInkChange={setInk}
              tool={pageTool}
              color={pageColor}
              textareaRef={taRef}
              placeholder={L('כותבים כאן את האימון — חימום, תרגילים, משחק… אפשר למספר חלקים בעצמכם. בעט: לוחצים «עט» וכותבים ביד.', 'Write the practice here — warm-up, drills, scrimmage… number the parts yourself if you like. With a stylus: tap “Pen” and write by hand.')}
              ariaLabel={L('תוכן האימון', 'Practice content')}
              minLines={16}
              extraLines={extraLines}
            />
            <div className="nbk-more-lines">
              <button type="button" className="link-button" onClick={() => setExtraLines((n) => n + 10)}>
                <Plus size={14} /> {L('עוד שורות', 'More lines')}
              </button>
              {(pageTool === 'pen' || pageTool === 'eraser') && (
                <span className="muted small">
                  {L('מצב עט — לחזרה להקלדה לחצו «הקלדה».', 'Pen mode — tap “Type” to go back to typing.')}
                </span>
              )}
            </div>

            {/* תרגילים מקושרים מהספרייה — נשארים מחוברים לתוכנית (להרצה ולשליחה) */}
            {linked.length > 0 && (
              <div className="nbk-linked">
                <span className="nbk-linked-h"><ClipboardList size={14} /> {L('תרגילים מהספרייה בדף הזה', 'Library drills on this page')}</span>
                <div className="chips">
                  {linked.map((l) => (
                    <span key={l.key} className="chip static nbk-linked-chip">
                      {l.title}
                      {l.duration_minutes ? <bdi className="muted"> · {l.duration_minutes}׳</bdi> : null}
                      <button type="button" className="nbk-linked-x" onClick={() => unlinkDrill(l.key)} aria-label={L(`בטל קישור ${l.title}`, `Unlink ${l.title}`)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="muted small" style={{ margin: '4px 0 0' }}>
                  {L('ביטול קישור לא מוחק את הטקסט מהדף — רק את החיבור לתרגיל בספרייה.', 'Unlinking keeps the text on the page — it only removes the link to the library drill.')}
                </p>
              </div>
            )}

            {/* ---- נוכחות — בתחתית הדף ---- */}
            <section className="nbk-att" aria-label={L('נוכחות', 'Attendance')}>
              <div className="nbk-att-h">
                <span className="nbk-att-title"><UserCheck size={16} /> {L('נוכחות', 'Attendance')}{team ? ` — ${trTeam(team)}` : ''}</span>
                {team && roster.length > 0 && (
                  <span className="muted small"><span dir="ltr">{attending}/{roster.length}</span> {L('נוכחים', 'present')} · {fmtDateHe(date)}</span>
                )}
              </div>
              {!team ? (
                <p className="muted small nbk-att-hint">
                  {noTeams
                    ? L('כדי לסמן נוכחות צריך קבוצה בפרופיל ושחקנים ב«הקבוצות שלי».', 'To mark attendance you need a team in your profile and players in “My teams”.')
                    : L('בחרו קבוצה למעלה — השחקנים יופיעו כאן. כולם מסומנים «נוכח»; סמנו רק מי שאיחר או נעדר.', 'Pick a team above — the players will show here. Everyone starts as “Present”; mark only who is late or absent.')}
                </p>
              ) : rosterLoading ? (
                <p className="muted small nbk-att-hint">{L('טוען סגל…', 'Loading roster…')}</p>
              ) : rosterError ? (
                <ErrorState compact message={rosterError} onRetry={() => setRosterTick((t) => t + 1)} />
              ) : roster.length === 0 ? (
                <p className="muted small nbk-att-hint">{L('אין שחקנים בקבוצה הזו עדיין — מוסיפים ב«הקבוצות שלי».', 'No players on this team yet — add them in “My teams”.')}</p>
              ) : (
                <ul className="nbk-att-list">
                  {roster.map((p) => {
                    const a = attOf(p.id)
                    return (
                      <li key={p.id} className={`nbk-att-row is-${a.status}`}>
                        <span className="nbk-att-name">
                          {p.number ? <bdi className="nbk-att-num">{p.number}</bdi> : null}
                          {p.name}
                        </span>
                        <span className="nbk-att-seg" role="group" aria-label={L(`נוכחות ${p.name}`, `${p.name} attendance`)}>
                          <button type="button" className={a.status === 'present' ? 'on' : ''} aria-pressed={a.status === 'present'} onClick={() => setStatus(p.id, 'present')}>{L('נוכח', 'Present')}</button>
                          <button type="button" className={a.status === 'late' ? 'on late' : ''} aria-pressed={a.status === 'late'} onClick={() => setStatus(p.id, 'late')}>{L('איחר', 'Late')}</button>
                          <button type="button" className={a.status === 'absent' ? 'on absent' : ''} aria-pressed={a.status === 'absent'} onClick={() => setStatus(p.id, 'absent')}>{L('נעדר', 'Absent')}</button>
                        </span>
                        {a.status !== 'present' && (
                          <span className="nbk-att-reason-in">
                            <select value={a.preset} onChange={(e) => setReason(p.id, { preset: e.target.value })} aria-label={L('סיבה', 'Reason')}>
                              <option value="">{L('סיבה…', 'Reason…')}</option>
                              {REASONS().map((r) => <option key={r.k} value={r.k}>{L(r.he, r.en)}</option>)}
                            </select>
                            <input
                              type="text"
                              value={a.text}
                              onChange={(e) => setReason(p.id, { text: e.target.value })}
                              placeholder={L('כמה מילים (לא חובה)', 'A few words (optional)')}
                              aria-label={L('פירוט הסיבה', 'Reason details')}
                              maxLength={120}
                            />
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* ---- עמודת המגרשים — צד שמאל ---- */}
          <aside className="nbk-courts" aria-label={L('מגרשים לשרטוט', 'Courts for sketching')}>
            <div className="nbk-courts-tools" role="toolbar" aria-label={L('כלי המגרשים', 'Court tools')}>
              <button type="button" className={courtTool === 'pen' ? 'tb-btn on' : 'tb-btn'} aria-pressed={courtTool === 'pen'} onClick={() => setCourtTool('pen')} aria-label={L('עט', 'Pen')} title={L('עט', 'Pen')}>
                <Pencil size={14} />
              </button>
              <button type="button" className={courtTool === 'eraser' ? 'tb-btn on' : 'tb-btn'} aria-pressed={courtTool === 'eraser'} onClick={() => setCourtTool('eraser')} aria-label={L('מחק', 'Eraser')} title={L('מחק', 'Eraser')}>
                <Eraser size={14} />
              </button>
              <span className="ink-colors" role="radiogroup" aria-label={L('צבע', 'Color')}>
                {INK_COLORS.map((k) => (
                  <button key={k.c} type="button" role="radio" aria-checked={courtColor === k.c} aria-label={L(k.he, k.en)}
                    className={courtColor === k.c ? 'ink-swatch on' : 'ink-swatch'} style={{ '--ink': k.c }} onClick={() => { setCourtColor(k.c); setCourtTool('pen') }} />
                ))}
              </span>
            </div>
            {courts.map((c, i) => (
              <MiniCourt
                key={c.id}
                board={c.board}
                onChange={(b) => updateCourt(c.id, b)}
                tool={courtTool}
                color={courtColor}
                index={i}
                onOpen={() => setOpenCourt(c.id)}
                onRemove={() => clearOrRemoveCourt(c)}
              />
            ))}
            <button type="button" className="btn-soft nbk-add-court" onClick={addCourt}>
              <Plus size={14} /> {L('עוד מגרש', 'Another court')}
            </button>
            <p className="muted small nbk-courts-hint">
              {L('מציירים ישר על המגרש. לחיצה על ההגדלה (או לחיצה כפולה) פותחת את הלוח הטקטי המלא — והציור חוזר לכאן.', 'Draw right on the court. The expand button (or a double-click) opens the full tactics board — the drawing comes back here.')}
            </p>
          </aside>
        </div>
      </div>

      {/* ===== שמירה ===== */}
      <div className="form-actions nbk-actions" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={() => save({ draft: false })} disabled={saving || !name.trim()} aria-busy={saving}>
          {saving ? <span className="btn-spinner" aria-hidden="true" /> : <Check size={16} />}
          {saving ? L('שומר...', 'Saving...') : L('שמירת התוכנית', 'Save plan')}
        </button>
        <button className="btn-soft" onClick={() => save({ draft: true })} disabled={saving || !name.trim()}>
          <Save size={16} /> {L('שמור כטיוטה', 'Save as draft')}
        </button>
        <button className="btn-ghost" onClick={cancel} disabled={saving}>
          {L('ביטול', 'Cancel')}
        </button>
        {dirty && <span className="muted small nbk-dirty">{L('יש שינויים שלא נשמרו', 'Unsaved changes')}</span>}
      </div>

      {/* הלוח הטקטי המלא — נפתח ממגרש קטן, הציור עובר וחוזר */}
      {openCourtObj && (
        <TacticsBoard
          key={openCourtObj.id}
          value={openCourtObj.board}
          onChange={(b) => updateCourt(openCourtObj.id, b)}
          startFull
          onCloseFull={() => setOpenCourt(null)}
          title={L(`מגרש ${openCourtIdx + 1}`, `Court ${openCourtIdx + 1}`)}
        />
      )}

      {sending && savedId && (
        <SendToPlayers
          session={session}
          variant="sheet"
          preset={{ kind: 'plan', id: savedId, title: name || L('תוכנית אימון', 'Practice plan'), sub: team ? trTeam(team) : '' }}
          onClose={() => setSending(false)}
        />
      )}
    </div>
  )
}
