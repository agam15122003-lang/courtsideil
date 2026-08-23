import { toast } from './toast'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Check, CalendarPlus, ClipboardCheck, RotateCw, MapPin, Users, User, Handshake, Trophy } from 'lucide-react'
// אייקוני כיוון דרך DirIcon — מתהפכים אוטומטית במעבר לאנגלית (חוק RTL)
import { ArrowBack, ChevronFwd, ChevronBack } from './DirIcon'
import { downloadIcs } from './ics'
import { supabase } from './supabaseClient'
import { SkeletonCards } from './Skeleton'
import SessionDetail from './SessionDetail'
import { PlanSheetById } from './PlanSheet'
import { expandSlotsRange } from './sessionId'
import { L, trTeam } from './i18n'
import { PLAYER_SIDE } from './flags'
import { confirmDialog } from './confirm'
import { useNetworkSmall } from './network'
import WeekList from './WeekList'
import { RsvpBreakdown } from './PracticeRsvp'

// טווח השעות המוצג בלוח, וגובה שורת-שעה בפיקסלים.
// ROW_H_WIDE — במסך רחב הלוח הוא המשטח הראשי ולא תצוגה משנית, ושורה
// גבוהה יותר היא מה שמאפשר לקרוא שם קבוצה ותוכנית בתוך הבלוק.
const START_HOUR = 6
const END_HOUR = 23
const ROW_H = 44
const ROW_H_WIDE = 64
// קפיצת הגרירה. 15 דקות — אותו ערך שהפרוטוטייפ עובד בו, ומספיק גס
// כדי שגרירה ביד לא תיצור 18:07.
const SNAP_MIN = 15

// שמות הימים לשורות «ימי אימון קבועים». team_practice_slots.weekday הוא 0=ראשון.
const WD_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

// האם המסך רחב מספיק ללוח דו-טורי. hook מקומי ולא ייבוא ממסך אחר —
// אין כאן ספריית hooks משותפת, וייבוא ממסך שכן היה יוצר תלות הפוכה.
function useWide(query = '(min-width: 1100px)') {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return wide
}

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
// יום ראשון של השבוע שבו נמצא התאריך (השבוע בישראל מתחיל בראשון)
const sundayOf = (d) => {
  const x = new Date(d)
  x.setDate(x.getDate() - x.getDay())
  x.setHours(0, 0, 0, 0)
  return x
}
const hoursOf = (t) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h + (m || 0) / 60
}
// תאריך בפורמט ישראלי מלא — "יום ראשון, 28 ביוני 2026"
const ilDate = (str) => {
  if (!str) return ''
  const d = new Date(str + 'T00:00')
  if (isNaN(d)) return str
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}


// לו"ז שבועי בסגנון Outlook — ימים בעמודות, שעות בשורות, אימונים כבלוקים.
// props: session
export default function Schedule({ session, onNavigate }) {
  const me = session.user.id
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))
  const [teamFilter, setTeamFilter] = useState('')
  // 1.2 — ברירת המחדל היא הרשימה השבועית; גריד השעות נפתח לפי דרישה
  const [showGrid, setShowGrid] = useState(false)
  // ...ובמסך רחב בדיוק ההפך: הלוח הוא המסך, והרשימה היא התצוגה המשנית
  // שנפתחת לפי דרישה — מתחת ללוח, לא מעליו.
  const [showListWide, setShowListWide] = useState(false)
  const [entries, setEntries] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [reviewEntry, setReviewEntry] = useState(null)
  const [slots, setSlots] = useState([])
  const [games, setGames] = useState([])
  const [attRows, setAttRows] = useState([])   // נוכחות שסומנה השבוע — לצ'יפ "נוכחות סומנה"
  const [rsvpRows, setRsvpRows] = useState([]) // אישורי הגעה השבוע — לצ'יפ "X/Y אישרו"
  const [rosterCounts, setRosterCounts] = useState({}) // קבוצה → מספר שחקנים מחוברים
  const [allHours, setAllHours] = useState(false) // ברירת מחדל: רק השעות שיש בהן משהו
  const [planView, setPlanView] = useState(null) // {plan, items} — צפייה בתוכנית המצורפת

  // מסך רחב = הלוח הוא המשטח הראשי, והפאנלים עוברים לטור צדדי דביק.
  // מתחת לזה שום דבר לא משתנה — המסך נשאר בדיוק כפי שהוא היום.
  const wide = useWide()
  const rowH = wide ? ROW_H_WIDE : ROW_H

  // schedule_entries.location נוספה ב-supabase_schedule_board_4_8.sql.
  // עד שהיא תרוץ אין להציג שדה שהקלדה בו נזרקת בשקט — לכן בודקים בפועל
  // ולא מניחים. null = עוד לא נבדק.
  const [hasLoc, setHasLoc] = useState(null)
  const [location, setLocation] = useState('')

  // גרירה ליצירת אירוע. {col, a, b} בדקות מתחילת היום; null = לא גוררים.
  const [ghost, setGhost] = useState(null)
  const dragRef = useRef(null)

  // 18.8 — התוכנית המצורפת נפתחת כדף המחברת המלא (PlanSheetById טוען לבד)
  const openPlan = (plan) => setPlanView({ plan })

  // טופס הוספה
  const [adding, setAdding] = useState(false)
  const [formDate, setFormDate] = useState(ymd(new Date()))
  const [startTime, setStartTime] = useState('18:00')
  const [endTime, setEndTime] = useState('19:30')
  const [isPersonal, setIsPersonal] = useState(false)
  const [team, setTeam] = useState('')
  const [planId, setPlanId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [repeatWeekly, setRepeatWeekly] = useState(false)
  const [myTeams, setMyTeams] = useState([])

  // רשימת הקבוצות של המאמן — לבחירה מדויקת (חשוב כדי שהשחקנים יראו את האימון)
  useEffect(() => {
    ;(async () => {
      const [{ data: prof }, { data: rp }] = await Promise.all([
        supabase.from('profiles').select('age_groups').eq('id', me).maybeSingle(),
        supabase.from('team_players').select('team, player_id').eq('coach_id', me),
      ])
      const set = new Set([...(prof?.age_groups || []), ...((rp || []).map((r) => r.team))])
      setMyTeams([...set].filter(Boolean))
      // מונה שחקנים מחוברים לכל קבוצה — המכנה של "X/Y אישרו"
      const counts = {}
      for (const r of rp || []) if (r.player_id) counts[r.team] = (counts[r.team] || 0) + 1
      setRosterCounts(counts)
    })()
  }, [me])

  // בדיקה חד-פעמית: האם עמודת המקום קיימת. שאילתת שורה אחת — אם העמודה
  // חסרה PostgREST מחזיר שגיאה, ואז השדה פשוט לא מוצג.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { error } = await supabase.from('schedule_entries').select('id, location').limit(1)
      if (alive) setHasLoc(!error)
    })()
    return () => { alive = false }
  }, [])

  // זימון מאמן אחר לפגישה
  const [meetings, setMeetings] = useState([])
  const [coaches, setCoaches] = useState([])
  const [inviting, setInviting] = useState(false)
  const [invTo, setInvTo] = useState('')
  const [invTopic, setInvTopic] = useState('')
  const [invDate, setInvDate] = useState(ymd(new Date()))
  const [invStart, setInvStart] = useState('18:00')
  const [invEnd, setInvEnd] = useState('19:00')
  const [invNote, setInvNote] = useState('')
  const [invSaving, setInvSaving] = useState(false)
  const netSmall = useNetworkSmall() // זימון מאמן אחר דורש רשת — מוסתר כשהיא קטנה

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = addDays(weekStart, 6)
  const allSlotOccs = expandSlotsRange(slots, weekStart, weekEnd)
  // §4 — בורר קבוצה: כשמאמנים יותר מקבוצה אחת, אפשר לצפות בלו"ז של
  // קבוצה ספציפית. '' = כל הקבוצות. אימון אישי מוצג תמיד.
  // הרשימה מ-myTeams (כל הקבוצות של המאמן), לא מנתוני השבוע — אחרת
  // בשבוע שיש בו קבוצה אחת הצ'יפים נעלמים ואי אפשר להחליף
  const weekTeams = [...new Set([...entries, ...allSlotOccs].map((x) => x.team).filter(Boolean))]
  const slotTeams = [...new Set((slots || []).map((x) => x.team).filter(Boolean))]
  const teamNames = [...new Set([...myTeams, ...weekTeams, ...slotTeams])]
  const inTeam = (t, personal) => !teamFilter || personal || t === teamFilter
  const fEntries = teamFilter ? entries.filter((e) => inTeam(e.team, e.is_personal)) : entries
  const weekSlotOccs = teamFilter ? allSlotOccs.filter((o) => o.team === teamFilter) : allSlotOccs
  const fGames = teamFilter ? games.filter((g) => g.team === teamFilter) : games

  // 1.2 — נתוני הצ'יפים של הרשימה השבועית
  const attMarked = new Set(attRows.map((r) => `${r.team}|${r.session_date}`))
  const rsvpYes = {}
  for (const r of rsvpRows) if (r.response === 'yes') rsvpYes[r.session_id] = (rsvpYes[r.session_id] || 0) + 1

  // 1.2 — כל אירועי השבוע, מנורמלים לרכיב הרשימה
  const weekDays = days.map((d) => {
    const ds = ymd(d)
    return {
      date: ds,
      items: [
        ...fEntries.filter((e) => e.date === ds).map((e) => ({
          key: 'e' + e.id, session_id: e.id, kind: e.is_personal ? 'personal' : 'practice', date: ds,
          start_time: e.start_time, end_time: e.end_time, team: e.team, location: e.location, plan: e.plan,
          raw: e,
        })),
        ...weekSlotOccs.filter((o) => o.date === ds).map((o) => ({
          key: 's' + o.session_id, session_id: o.session_id, kind: 'practice', date: ds,
          start_time: o.start_time, end_time: o.end_time, team: o.team, location: o.location, plan: null,
          recurring: true,
          raw: {
            id: o.session_id, date: o.date, start_time: o.start_time, end_time: o.end_time,
            team: o.team, location: o.location, is_personal: false, plan: null, _recurring: true,
          },
        })),
        ...fGames.filter((g) => g.game_date === ds).map((g) => ({
          key: 'g' + g.id, session_id: g.id, kind: 'game', date: ds,
          start_time: g.game_time, end_time: null, team: g.team, location: g.location, plan: null,
          opponent: g.opponent, raw: g,
        })),
        ...(meetings || []).filter((m) => m.date === ds).map((m) => ({
          key: 'm' + m.id, session_id: m.id, kind: 'meeting', date: ds,
          start_time: m.start_time, end_time: m.end_time, team: null, location: null, plan: null,
          topic: m.topic, raw: m,
        })),
      ],
    }
  })

  // בחירת אירוע סוגרת כל טופס פתוח. בלי זה הטור הצדדי היה מציג גם טופס
  // וגם פרטים בו-זמנית — שלושת המצבים חייבים להיות בלעדיים.
  const selectEvent = (v) => { setSelected(v); setAdding(false); setInviting(false) }

  // ---- גרירה על עמודה ריקה = פתיחת אירוע בטווח שנגרר ----
  // רק בעכבר: במגע הגרירה מתנגשת בגלילת הדף, ולכן שם נשארת הלחיצה
  // הרגילה שפותחת שעה עגולה.
  const finePointer = () =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
  const minsAt = (clientY, el) => {
    const r = el.getBoundingClientRect()
    const raw = startHour * 60 + ((clientY - r.top) / rowH) * 60
    const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN
    return Math.max(startHour * 60, Math.min((endHour + 1) * 60, snapped))
  }
  const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

  const onColPointerDown = (dateStr, colIndex) => (ev) => {
    if (ev.button || !finePointer()) return
    const el = ev.currentTarget
    const a = minsAt(ev.clientY, el)
    dragRef.current = { el, dateStr, a, moved: false }
    setGhost({ col: colIndex, a, b: a })
    el.setPointerCapture?.(ev.pointerId)
  }
  const onColPointerMove = (colIndex) => (ev) => {
    const d = dragRef.current
    if (!d || d.el !== ev.currentTarget) return
    const b = minsAt(ev.clientY, d.el)
    if (Math.abs(b - d.a) >= SNAP_MIN) d.moved = true
    setGhost({ col: colIndex, a: d.a, b })
  }
  const endDrag = (ev) => {
    const d = dragRef.current
    dragRef.current = null
    setGhost(null)
    if (!d) return
    // גרירה קצרה מדי = לחיצה. נופלים למסלול השעה העגולה הקיים.
    if (!d.moved) { openAdd(d.dateStr, Math.floor(d.a / 60)); return }
    const b = minsAt(ev.clientY, d.el)
    const lo = Math.min(d.a, b)
    const hi = Math.max(d.a, b)
    openRange(d.dateStr, hhmm(lo), hhmm(Math.max(hi, lo + 30)))
  }
  const cancelDrag = () => { dragRef.current = null; setGhost(null) }

  // Escape מבטל גרירה באמצע — אחרת אין דרך לצאת בלי ליצור אירוע.
  useEffect(() => {
    if (!ghost) return
    const on = (e) => { if (e.key === 'Escape') cancelDrag() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [ghost])

  // פתיחת אירוע מהרשימה — לפי הסוג
  const openFromList = (ev) => {
    if (ev.kind === 'meeting') selectEvent({ ...ev.raw, _meeting: true })
    else if (ev.kind === 'game') setReviewEntry({
      id: ev.raw.id, team: ev.raw.team, date: ev.raw.game_date, start_time: ev.raw.game_time,
      session_type: 'game', opponent: ev.raw.opponent,
    })
    else selectEvent(ev.raw)
  }
  // טווח השעות מותאם למה שבאמת יש בשבוע. קודם לכן הוצגו תמיד 06:00–23:00,
  // כלומר כמעט תמיד חצי לוח ריק מעל האימון הראשון. "כל השעות" פותח את הטווח המלא.
  const weekHours = []
  for (const e of fEntries) {
    const s = hoursOf(e.start_time) ?? e.hour
    if (s != null) { weekHours.push(s); weekHours.push((hoursOf(e.end_time) ?? s + 1)) }
  }
  for (const o of weekSlotOccs || []) {
    const s = hoursOf(o.start_time)
    if (s != null) { weekHours.push(s); weekHours.push(hoursOf(o.end_time) ?? s + 1) }
  }
  for (const m of meetings || []) {
    const s = hoursOf(m.start_time)
    if (s != null) { weekHours.push(s); weekHours.push(hoursOf(m.end_time) ?? s + 1) }
  }
  const dataMin = weekHours.length ? Math.min(...weekHours) : 15
  const dataMax = weekHours.length ? Math.max(...weekHours) : 21
  const startHour = allHours ? START_HOUR : Math.max(START_HOUR, Math.min(dataMin - 1, 15))
  const endHour = allHours ? END_HOUR : Math.min(END_HOUR, Math.max(dataMax + 1, 21))
  const hours = []
  for (let h = startHour; h <= endHour; h++) hours.push(h)
  const todayStr = ymd(new Date())
  const calRef = useRef(null)

  const loadTokenRef = useRef(0) // הגנה מפני מרוץ טעינות בהחלפת שבוע מהירה

  async function load() {
    // מזהה טעינה — הקשה מהירה על ‹ › לא תיתן לתוצאה של שבוע ישן לצייר על החדש
    const token = ++loadTokenRef.current
    setLoading(true)
    // השאילתות רצות במקביל — טעינת המסך מהירה פי 3-4
    const [entriesRes, plansRes, meetingsRes, coachesRes, slotsRes, gamesRes, attRes, rsvpRes] = await Promise.all([
      supabase
        .from('schedule_entries')
        .select('*, plan:training_plans(id, name)')
        .gte('date', ymd(weekStart))
        .lte('date', ymd(weekEnd)),
      supabase
        .from('training_plans')
        .select('id, name')
        .order('created_at', { ascending: false }),
      // פגישות עם מאמנים אחרים (RLS מסנן לפגישות שאני צד בהן). אם הטבלה עוד לא קיימת — מתעלמים.
      supabase
        .from('coach_meetings')
        .select('*, from_p:profiles!coach_meetings_from_coach_fkey(first_name,last_name), to_p:profiles!coach_meetings_to_coach_fkey(first_name,last_name)')
        .gte('date', ymd(weekStart))
        .lte('date', ymd(weekEnd)),
      // רשימת מאמנים לזימון.
      // ⚠ `role = 'coach'` הוא חובה, לא נוחות. מדיניות הקריאה של profiles
      // מחזירה למאמן גם את השחקנים שלו (shares_team_with), ולכן בלי הסינון
      // הזה הרשימה כללה **קטינים** כנמענים אפשריים לזימון פגישה, והזימון
      // נחת ביומן של הילד. השער האמיתי הוא במסד
      // (supabase_schedule_board_4_8.sql) — זה כאן רק כדי שלא נציג בחירה
      // שהשרת ידחה ממילא.
      supabase
        .from('profiles')
        .select('id, first_name, last_name, club')
        .eq('role', 'coach')
        .neq('id', me),
      // ימי אימון קבועים (מנוהלים ב"הקבוצות שלי") — מוצגים גם בלו"ז השבועי
      supabase
        .from('team_practice_slots')
        .select('*')
        .eq('coach_id', me),
      // משחקי השבוע — מוצגים ברשימה השבועית לצד האימונים
      supabase
        .from('team_games')
        .select('*')
        .eq('coach_id', me)
        .gte('game_date', ymd(weekStart))
        .lte('game_date', ymd(weekEnd)),
      // נוכחות שסומנה השבוע — לצ'יפ "נוכחות סומנה" (סובלני אם הטבלה חסרה)
      supabase
        .from('practice_attendance')
        .select('team, session_date')
        .eq('coach_id', me)
        .gte('session_date', ymd(weekStart))
        .lte('session_date', ymd(weekEnd)),
      // אישורי הגעה השבוע — לצ'יפ "X/Y אישרו" (סובלני אם הטבלה עוד לא רצה)
      // צד המאמן בלבד: אין מי שיאשר — לא שולפים ולא מציגים את הצ׳יפ
      PLAYER_SIDE
        ? supabase
            .from('practice_rsvp')
            .select('session_id, response')
            .eq('coach_id', me)
            .gte('session_date', ymd(weekStart))
            .lte('session_date', ymd(weekEnd))
        : Promise.resolve({ data: [], error: null }),
    ])
    if (token !== loadTokenRef.current) return // שבוע אחר נבחר בינתיים — מתעלמים
    if (entriesRes.error) {
      setError(L('שגיאה בטעינת הלו"ז: ', 'Error loading schedule: ') + entriesRes.error.message)
      setLoading(false)
      return
    }
    setError(null)
    setEntries(entriesRes.data || [])
    setPlans(plansRes.data || [])
    setMeetings(meetingsRes.error ? [] : meetingsRes.data || [])
    setCoaches((coachesRes.data || []).filter((c) => c.first_name && c.last_name))
    setSlots(slotsRes && !slotsRes.error ? slotsRes.data || [] : [])
    setGames(gamesRes && !gamesRes.error ? gamesRes.data || [] : [])
    setAttRows(attRes && !attRes.error ? attRes.data || [] : [])
    setRsvpRows(rsvpRes && !rsvpRes.error ? rsvpRes.data || [] : [])
    setLoading(false)
  }

  const sendInvite = async () => {
    if (!invTo) {
      toast.error(L('בחרו מאמן לזימון.', 'Choose a coach to invite.'))
      return
    }
    if (!invTopic.trim()) {
      toast.error(L('כתוב נושא לפגישה.', 'Add a topic for the meeting.'))
      return
    }
    if (!invStart || !invEnd || invEnd <= invStart) {
      toast.error(L('בדוק את שעות הפגישה.', 'Check the meeting times.'))
      return
    }
    setInvSaving(true)
    const { error } = await supabase.from('coach_meetings').insert({
      from_coach: me,
      to_coach: invTo,
      date: invDate,
      start_time: invStart,
      end_time: invEnd,
      topic: invTopic.trim(),
      note: invNote.trim() || null,
      status: 'pending',
    })
    setInvSaving(false)
    if (error) {
      console.error('invite:', error.message); toast.error(L('הזימון נכשל — נסו שוב בעוד רגע.', 'Invite failed — try again in a moment.'))
      return
    }
    setInviting(false)
    setInvTopic('')
    setInvNote('')
    toast.success(L('הזימון נשלח למאמן', 'Invite sent to the coach'))
    load()
  }

  const respondMeeting = async (m, status) => {
    const { error } = await supabase.from('coach_meetings').update({ status }).eq('id', m.id)
    if (error) {
      toast.error(L('העדכון נכשל: ', 'Update failed: ') + error.message)
      return
    }
    setSelected(null)
    toast.success(status === 'accepted' ? L('הפגישה אושרה', 'Meeting accepted') : L('הפגישה נדחתה', 'Meeting declined'))
    load()
  }

  const removeMeeting = async (id) => {
    if (!(await confirmDialog({ message: L('למחוק את הפגישה?', 'Delete this meeting?'), danger: true }))) return
    const { error } = await supabase.from('coach_meetings').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
      return
    }
    setSelected(null)
    toast.success(L('הפגישה נמחקה', 'Meeting deleted'))
    load()
  }

  const coachName = (c) => (c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '')

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])
  useEffect(() => () => { loadTokenRef.current++ }, []) // ביטול טעינה תלויה בעת יציאה

  // openAdd מקבל שעה שלמה (לחיצה) — openRange מקבל טווח מדויק (גרירה).
  const openAdd = (dateStr, hour) => {
    openRange(
      dateStr,
      hour != null ? `${pad(hour)}:00` : '18:00',
      hour != null ? `${pad(Math.min(hour + 1, 23))}:00` : '19:30',
    )
  }
  const openRange = (dateStr, start, end) => {
    setFormDate(dateStr || todayStr)
    setStartTime(start)
    setEndTime(end)
    setLocation('')
    setIsPersonal(false)
    setTeam(myTeams.length === 1 ? myTeams[0] : '')
    setPlanId('')
    setNote('')
    setRepeatWeekly(false)
    setSelected(null)
    setAdding(true)
  }

  const saveEntry = async () => {
    if (!startTime || !endTime) {
      toast.error(L('בחר שעת התחלה ושעת סיום.', 'Choose a start and end time.'))
      return
    }
    if (endTime <= startTime) {
      toast.error(L('שעת הסיום צריכה להיות אחרי שעת ההתחלה.', 'The end time must be after the start time.'))
      return
    }
    if (!isPersonal && !team.trim()) {
      toast.error(L('בחר קבוצה או סמן "אימון אישי".', 'Choose a team or mark "Personal practice".'))
      return
    }
    setSaving(true)
    const base = {
      created_by: me,
      start_time: startTime,
      end_time: endTime,
      hour: parseInt(startTime.split(':')[0], 10),
      is_personal: isPersonal,
      team: isPersonal ? null : team.trim(),
      plan_id: planId || null,
      note: note.trim() || null,
    }
    if (hasLoc && location.trim()) base.location = location.trim()
    // אימון חוזר: יוצרים 12 מופעים שבועיים (מאותו יום בשבוע)
    const rows = []
    const weeks = repeatWeekly && !isPersonal ? 12 : 1
    for (let i = 0; i < weeks; i++) {
      rows.push({ ...base, date: ymd(addDays(new Date(formDate + 'T00:00'), i * 7)) })
    }
    let { error } = await supabase.from('schedule_entries').insert(rows)
    // רשת ביטחון שנייה: אם הבדיקה אמרה שהעמודה קיימת אבל השרת מסרב
    // (מסד שדרסו לו את המיגרציה, cache ישן של PostgREST) — שומרים בלעדיה
    // במקום להפיל למשתמש את כל השמירה.
    if (error && /location/i.test(error.message || '') &&
        (error.code === 'PGRST204' || error.code === '42703' ||
         /column .* does not exist|could not find the .* column/i.test(error.message || ''))) {
      setHasLoc(false)
      ;({ error } = await supabase
        .from('schedule_entries')
        .insert(rows.map(({ location: _drop, ...r }) => r)))
    }
    setSaving(false)
    if (error) {
      toast.error(L('השמירה נכשלה: ', 'Save failed: ') + error.message)
      return
    }
    setAdding(false)
    toast.success(weeks > 1 ? L(`נוספו ${weeks} אימונים שבועיים`, `Added ${weeks} weekly practices`) : L('האימון נוסף ללו"ז', 'Practice added to schedule'))
    load()
  }

  const removeEntry = async (id) => {
    if (!(await confirmDialog({ message: L('למחוק את האימון מהלו"ז?', 'Remove this practice from the schedule?'), danger: true }))) return
    const { error } = await supabase.from('schedule_entries').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
      return
    }
    setSelected(null)
    toast.success(L('האימון הוסר', 'Practice removed'))
    load()
  }

  const locale = 'he-IL' // תאריכים תמיד בפורמט ישראלי (יום · חודש · שנה)
  // פורמט מספרי ישראלי (יום.חודש.שנה) — אין בלבול RTL עם שמות חודשים
  const weekLabel =
    `${weekStart.getDate()}.${weekStart.getMonth() + 1}` +
    ' – ' +
    `${weekEnd.getDate()}.${weekEnd.getMonth() + 1}.${weekEnd.getFullYear()}`

  // גלילה אוטומטית לעמודת היום במובייל (RTL עלול להסתיר אותה)
  // חייב להיות לפני כל return מוקדם — אחרת מספר ה-hooks משתנה בין רינדורים ו-React קורס.
  useEffect(() => {
    if (loading || planView) return
    calRef.current?.querySelector('.cal-dayhead.today')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [loading, weekStart, planView])

  // כשנפתח פאנל פרטים/הוספה מתחת ללוח הגבוה — מגלגלים אליו (במובייל אחרת נראה
  // כאילו הלחיצה לא עשתה כלום, כי הפאנל מופיע הרחק מתחת לאזור הנראה).
  useEffect(() => {
    if (planView) return
    if (selected || adding || inviting) {
      requestAnimationFrame(() => {
        // .sched-form לא קיים במסך הזה (הטפסים הם .cal-form), ולכן לחיצה על
        // משבצת ריקה פתחה טופס הרחק מתחת לקפל בלי לגלול אליו — באייפד זה
        // נראה כאילו הלחיצה לא עשתה כלום. block:'start' מביא את השדה הראשון
        // לראש המסך ומשאיר מקום למקלדת.
        document
          .querySelector('.csx-rail .cal-detail, .csx-rail .cal-form')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [selected, adding, inviting, planView])

  if (planView) {
    return (
      <div className="welcome-card">
        <button className="link-button" onClick={() => setPlanView(null)}>
          <ArrowBack size={15} className="back-ic" /> {L('חזרה ללו"ז', 'Back to schedule')}
        </button>
        <PlanSheetById planId={planView.plan.id} />
      </div>
    )
  }

  // במסך רחב הלוח פתוח תמיד — הוא המשטח הראשי. מתחת לזה נשמרת ההתנהגות
  // הקיימת: רשימה קודם, והגריד נפתח לפי דרישה.
  const gridOpen = wide || showGrid
  // שלושת מצבי הטור הצדדי, בלעדיים.
  const railMode = selected ? 'detail' : (adding || inviting) ? 'compose' : 'idle'

  // «הבא בתור» — האירוע הקרוב ביותר בשבוע המוצג שעוד לא הסתיים.
  // מחושב מ-weekDays שכבר בזיכרון, בלי שאילתה נוספת.
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const nextUp = weekDays
    .flatMap((d) => d.items)
    .filter((x) => {
      if (!x.start_time) return false
      if (x.date > todayStr) return true
      if (x.date < todayStr) return false
      const end = hoursOf(x.end_time) ?? (hoursOf(x.start_time) ?? 0) + 1
      return end * 60 > nowMin
    })
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))[0] || null

  const whenLabel = (dateStr) => {
    if (dateStr === todayStr) return L('היום', 'Today')
    if (dateStr === ymd(addDays(new Date(todayStr + 'T00:00'), 1))) return L('מחר', 'Tomorrow')
    return L('יום ', 'Day ') + WD_LONG[new Date(dateStr + 'T00:00').getDay()]
  }

  // מוגדר פעם אחת ומוצג במיקום אחד בלבד — לפני הלוח במסך צר, אחריו
  // במסך רחב. שכפול ה-JSX היה מזמין את שתי הגרסאות להיפרד עם הזמן.
  const weekListEl = (
    <WeekList
      days={weekDays}
      isCoach
      attMarked={attMarked}
      rsvpYes={PLAYER_SIDE ? rsvpYes : null}
      rosterCount={rosterCounts}
      onOpen={openFromList}
      onOpenPlan={(ev) => openPlan(ev.plan)}
      onBuildPlan={() => onNavigate && onNavigate('plans')}
      onAttendance={(ev) => setReviewEntry({
        id: ev.session_id, team: ev.team, date: ev.date, start_time: ev.start_time,
        session_type: 'practice', location: ev.location,
      })}
    />
  )

  return (
    <div className={'welcome-card' + (wide ? ' csx-wide' : '')}>
      {/* אין כאן כותרת: Dashboard עוטף את המסך ב-<Page> שכבר נותן
          eyebrow, H1 ותת-כותרת. שתי כותרות = שני H1 באותו מסך. */}
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button
            className="icon-btn"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label={L('שבוע קודם', 'Previous week')}
          >
            <ChevronBack size={18} />
          </button>
          <button className="btn-ghost cal-today" onClick={() => setWeekStart(sundayOf(new Date()))}>
            {L('היום', 'Today')}
          </button>
          {gridOpen && (
            <button
              type="button"
              className="btn-ghost cal-today"
              onClick={() => setAllHours((v) => !v)}
              aria-pressed={allHours}
              title={L('הצגת כל שעות היום בלוח', 'Show every hour of the day')}
            >
              {allHours ? L('שעות האימונים', 'Practice hours') : L('כל השעות', 'All hours')}
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label={L('שבוע הבא', 'Next week')}
          >
            <ChevronFwd size={18} />
          </button>
          <span className="cal-weeklabel" dir="ltr">{weekLabel}</span>
        </div>
        <div className="cal-actions">
          {netSmall === false && (
            <button className="btn-soft" onClick={() => { setInviting(true); setSelected(null); setAdding(false) }}>
              {L('זימון מאמן', 'Invite coach')}
            </button>
          )}
          <button className="btn-primary cal-add" style={{ marginTop: 0 }} onClick={() => openAdd()}>
            <Plus size={18} /> {L('הוסף אימון', 'Add')}
          </button>
        </div>
      </div>

      {/* csx-shell — במסך רחב שני טורים (לוח + טור צדדי דביק); מתחת
          לנקודת השבירה הוא לא מוגדר ב-CSS בכלל, והכל נשאר זרימה רגילה
          אחת מתחת לשנייה, בדיוק כפי שהיה. */}
      <div className="csx-shell">
      <div className="csx-board">

      {loading ? (
        <SkeletonCards count={2} />
      ) : error ? (
        <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>
      ) : (
        <>
        {/* ===== 16a · רצועת הימים וסדר היום, מעל הגריד השבועי ===== */}
        {teamNames.length > 1 && (
          <div className="cal-teamchips" role="tablist" aria-label={L('סינון לפי קבוצה', 'Filter by team')}>
            <button type="button" role="tab" aria-selected={!teamFilter}
              className={!teamFilter ? 'chip selected' : 'chip'} onClick={() => setTeamFilter('')}>
              {L('כל הקבוצות', 'All teams')}
            </button>
            {teamNames.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={teamFilter === t}
                className={teamFilter === t ? 'chip selected' : 'chip'} onClick={() => setTeamFilter(t)}>
                {trTeam(t)}
              </button>
            ))}
          </div>
        )}

        {/* המקרא יושב בסרגל ולא בטור הצדדי — הוא מסביר את הלוח, ולכן
            מקומו לידו. מוסתר במסך צר, שם אין לו מקום ואין גם לוח. */}
        {wide && (
          <div className="csx-legend" aria-hidden="true">
            <span><i className="csx-dot practice" />{L('אימון קבוצה', 'Practice')}</span>
            <span><i className="csx-dot personal" />{L('אימון אישי', 'Personal')}</span>
            <span><i className="csx-dot meeting" />{L('פגישה', 'Meeting')}</span>
            <span><i className="csx-dot game" />{L('משחק', 'Game')}</span>
          </div>
        )}
        {/* 1.2 — הרשימה השבועית: כותרת יום + כרטיסי אירועים, עם צ'יפים למאמן.
            במסך צר היא המשטח הראשי ולכן מופיעה כאן; במסך רחב היא יורדת
            אל מתחת ללוח (אותו אלמנט בדיוק, רק במיקום אחר בעץ). */}
        {!wide && weekListEl}

        {/* במסך רחב הלוח פתוח תמיד, ואין מה לפתוח ולסגור. */}
        {!wide && (
          <button type="button" className="cal-weeksep" onClick={() => setShowGrid((v) => !v)} aria-expanded={showGrid}>
            <span aria-hidden="true" />
            <span className="cal-weeksep-t">
              {L('תצוגת רשת שעות', 'Hour grid')} {showGrid ? '▴' : '▾'}
            </span>
            <span aria-hidden="true" />
          </button>
        )}

        {gridOpen && (
        <div className="cal-scroll" ref={calRef}>
          {/* key לפי שבוע — החלפת שבוע נכנסת ב-fade קצר במקום swap יבש */}
          <div className="cal-grid" key={ymd(weekStart)}>
            <div className="cal-corner" />
            {days.map((d, i) => {
              const ds = ymd(d)
              return (
                <div key={i} className={'cal-dayhead' + (ds === todayStr ? ' today' : '')}>
                  <span className="cal-dayname">
                    {d.toLocaleDateString(locale, { weekday: 'short' })}
                  </span>
                  <span className="cal-daynum">{d.getDate()}</span>
                </div>
              )
            })}

            <div className="cal-gutter">
              {hours.map((h) => (
                <div key={h} className="cal-hour" style={{ height: rowH }}>
                  <span dir="ltr">{pad(h)}:00</span>
                </div>
              ))}
            </div>

            {days.map((d, i) => {
              const ds = ymd(d)
              const slotEntries = weekSlotOccs.filter((o) => o.date === ds).map((o) => ({
                id: o.session_id, date: o.date, start_time: o.start_time, end_time: o.end_time,
                team: o.team, location: o.location, is_personal: false, plan: null, _recurring: true,
              }))
              const dayEntries = [...fEntries.filter((e) => e.date === ds), ...slotEntries]
              const dayMeetings = meetings.filter((m) => m.date === ds)
              // משחקים נטענים מזה זמן אך מעולם לא צוירו על הלוח — רק
              // ברשימה. אין להם end_time בטבלה, ולכן גובה קבוע של שורה
              // אחת; לא ממציאים שעת סיום, לא כאן ולא בתווית.
              const dayGames = fGames.filter((g) => g.game_date === ds)

              // אירועים חופפים נפרסים זה-לצד-זה (interval partitioning):
              // מחלקים כל "אשכול" חפיפה לעמודות, כך ששום אירוע לא מוסתר
              const laneItems = [
                ...dayEntries.map((e) => {
                  const s = hoursOf(e.start_time) ?? (e.hour || 18)
                  return { key: 'e' + e.id, s, en: hoursOf(e.end_time) ?? s + 1 }
                }),
                ...dayMeetings.map((m) => {
                  const s = hoursOf(m.start_time) ?? 18
                  return { key: 'm' + m.id, s, en: hoursOf(m.end_time) ?? s + 1 }
                }),
              ].sort((a, b) => a.s - b.s || a.en - b.en)
              const lanePos = {}
              {
                let cluster = []
                let laneEnds = []
                let maxEnd = -Infinity
                const flush = () => {
                  for (const c of cluster) lanePos[c.key].lanes = laneEnds.length
                  cluster = []
                  laneEnds = []
                }
                for (const it of laneItems) {
                  if (cluster.length && it.s >= maxEnd) { flush(); maxEnd = -Infinity }
                  let lane = laneEnds.findIndex((end) => end <= it.s)
                  if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.en) }
                  else laneEnds[lane] = it.en
                  lanePos[it.key] = { lane, lanes: 1 }
                  cluster.push(it)
                  maxEnd = Math.max(maxEnd, it.en)
                }
                flush()
              }
              const laneStyle = (key) => {
                const p = lanePos[key]
                if (!p || p.lanes <= 1) return {}
                return {
                  insetInlineStart: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                  insetInlineEnd: 'auto',
                  width: `calc(${100 / p.lanes}% - 4px)`,
                }
              }
              return (
                <div
                  key={i}
                  className={'cal-daycol' + (ds === todayStr ? ' today' : '')}
                  style={{ height: hours.length * rowH }}
                  onPointerDown={onColPointerDown(ds, i)}
                  onPointerMove={onColPointerMove(i)}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  onClick={(ev) => {
                    // בעכבר הכל עובר דרך ה-pointer handlers; ה-onClick נשאר
                    // למגע ולמקלדת, ששם אין גרירה.
                    if (finePointer()) return
                    const rect = ev.currentTarget.getBoundingClientRect()
                    const y = ev.clientY - rect.top
                    const hour = Math.min(endHour, startHour + Math.floor(y / rowH))
                    openAdd(ds, hour)
                  }}
                >
                  {dayEntries.map((e) => {
                    const s = hoursOf(e.start_time) ?? (e.hour || 18)
                    const en = hoursOf(e.end_time) ?? s + 1
                    const top = (s - startHour) * rowH
                    const height = Math.max(28, (en - s) * rowH - 2)
                    return (
                      <button
                        key={e.id}
                        className={'cal-event' + (e.is_personal ? ' personal' : '') + (e._recurring ? ' recurring' : '')
                          + (selected && selected.id === e.id ? ' csx-sel' : '')}
                        style={{ top, height, ...laneStyle('e' + e.id) }}
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          selectEvent(e)
                        }}
                      >
                        <span className="cal-event-time" dir="ltr">
                          {e.start_time}
                          {e.end_time ? '–' + e.end_time : ''}
                        </span>
                        <span className="cal-event-title">
                          {e.is_personal ? L('אימון אישי', 'Personal') : trTeam(e.team)}
                        </span>
                        {e.plan && <span className="cal-event-plan">{e.plan.name}</span>}
                      </button>
                    )
                  })}

                  {dayMeetings.map((m) => {
                    const s = hoursOf(m.start_time) ?? 18
                    const en = hoursOf(m.end_time) ?? s + 1
                    const top = (s - startHour) * rowH
                    const height = Math.max(28, (en - s) * rowH - 2)
                    const other = m.from_coach === me ? m.to_p : m.from_p
                    return (
                      <button
                        key={'m' + m.id}
                        className={'cal-event meeting' + (m.status === 'pending' ? ' pending' : '')
                          + (selected && selected._meeting && selected.id === m.id ? ' csx-sel' : '')}
                        style={{ top, height, ...laneStyle('m' + m.id) }}
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          selectEvent({ ...m, _meeting: true })
                        }}
                      >
                        <span className="cal-event-time" dir="ltr">
                          {m.start_time}
                          {m.end_time ? '–' + m.end_time : ''}
                        </span>
                        <span className="cal-event-title">{m.topic}</span>
                        <span className="cal-event-plan">
                          {coachName(other)}
                          {m.status === 'pending' ? L(' · ממתין', ' · pending') : ''}
                        </span>
                      </button>
                    )
                  })}

                  {dayGames.map((g) => {
                    const s = hoursOf(g.game_time)
                    if (s == null) return null
                    return (
                      <button
                        key={'g' + g.id}
                        className="cal-event csx-game"
                        style={{ top: (s - startHour) * rowH, height: Math.max(28, rowH - 2) }}
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setReviewEntry({
                            id: g.id, team: g.team, date: g.game_date, start_time: g.game_time,
                            session_type: 'game', opponent: g.opponent,
                          })
                        }}
                      >
                        <span className="cal-event-time" dir="ltr">{g.game_time}</span>
                        <span className="cal-event-title">
                          {L('מול ', 'vs ')}{g.opponent || trTeam(g.team)}
                        </span>
                      </button>
                    )
                  })}

                  {/* רמז הגרירה — מראה את הטווח שייווצר, לפני שנוצר */}
                  {ghost && ghost.col === i && Math.abs(ghost.b - ghost.a) >= SNAP_MIN && (
                    <div
                      className="csx-ghost"
                      aria-hidden="true"
                      style={{
                        top: (Math.min(ghost.a, ghost.b) / 60 - startHour) * rowH,
                        height: Math.max(18, (Math.abs(ghost.b - ghost.a) / 60) * rowH - 2),
                      }}
                    >
                      <span dir="ltr">
                        {hhmm(Math.min(ghost.a, ghost.b))}–{hhmm(Math.max(ghost.a, ghost.b))}
                      </span>
                    </div>
                  )}

                  {ds === todayStr && (() => {
                    const now = new Date()
                    const nowH = now.getHours() + now.getMinutes() / 60
                    if (nowH < startHour || nowH > endHour + 1) return null
                    return <div className="cal-nowline" style={{ top: (nowH - startHour) * rowH }} aria-hidden="true" />
                  })()}
                </div>
              )
            })}
          </div>
        </div>
        )}
        </>
      )}

      {gridOpen && (
      <p className="muted small" style={{ marginTop: 10 }}>
        {wide
          ? L('לחיצה על משבצת ריקה מוסיפה אימון באותה שעה · גרירה פותחת אירוע בטווח המדויק.',
              'Tap an empty slot to add a practice · drag to open one over an exact range.')
          : L('לחיצה על משבצת ריקה מוסיפה אימון באותה שעה.', 'Tap an empty slot to add a practice at that time.')}
      </p>
      )}

      {/* במסך רחב הרשימה היא התצוגה המשנית, ויושבת מתחת ללוח */}
      {wide && !loading && !error && (
        <>
          <button
            type="button"
            className="cal-weeksep"
            onClick={() => setShowListWide((v) => !v)}
            aria-expanded={showListWide}
          >
            <span aria-hidden="true" />
            <span className="cal-weeksep-t">
              {L('תצוגת רשימה', 'List view')} {showListWide ? '▴' : '▾'}
            </span>
            <span aria-hidden="true" />
          </button>
          {showListWide && weekListEl}
        </>
      )}

      </div>{/* /csx-board */}

      <div className="csx-rail">

      {/* מצב סרק — מה שרואים כשלא נבחר אירוע ולא פתוח טופס */}
      {railMode === 'idle' && !loading && !error && (
        <>
          <div className="csx-quick">
            <span className="csx-eyebrow">{L('הוספה מהירה', 'Quick add')}</span>
            <button type="button" className="csx-quick-row" onClick={() => openAdd()}>
              <span>
                <b>{L('אימון קבוצה', 'Team practice')}</b>
                {/* צד המאמן בלבד: אין מי שיאשר הגעה — לא מבטיחים אישורי הגעה */}
                <span className="muted small">{PLAYER_SIDE ? L('קבוצה, תוכנית, אישורי הגעה', 'Team, plan, RSVPs') : L('קבוצה, תוכנית ומקום', 'Team, plan and venue')}</span>
              </span>
              <Users size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="csx-quick-row"
              onClick={() => { openAdd(); setIsPersonal(true) }}
            >
              <span>
                <b>{L('אימון אישי', 'Personal practice')}</b>
                <span className="muted small">{L('רק ביומן שלך', 'Yours only')}</span>
              </span>
              <User size={17} aria-hidden="true" />
            </button>
            {netSmall === false && (
              <button
                type="button"
                className="csx-quick-row"
                onClick={() => { setInviting(true); setSelected(null); setAdding(false) }}
              >
                <span>
                  <b>{L('פגישה עם מאמן', 'Coach meeting')}</b>
                  <span className="muted small">{L('נשלחת לאישור הצד השני', 'Sent for their approval')}</span>
                </span>
                <Handshake size={17} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* «הבא בתור» — האירוע הקרוב ביותר שעוד לא נגמר. מחושב ממה
              שכבר בזיכרון; אין כאן שאילתה נוספת. */}
          {nextUp && (
            <div className="csx-card">
              <span className="csx-eyebrow csx-eyebrow-accent">{L('הבא בתור', 'Next up')}</span>
              <h3 className="csx-next-title">
                {nextUp.kind === 'meeting'
                  ? nextUp.topic
                  : nextUp.kind === 'game'
                    ? L('מול ', 'vs ') + (nextUp.opponent || '')
                    : nextUp.kind === 'personal'
                      ? L('אימון אישי', 'Personal practice')
                      : trTeam(nextUp.team)}
              </h3>
              <p className="muted small csx-next-meta">
                <span dir="ltr">{nextUp.start_time}{nextUp.end_time ? '–' + nextUp.end_time : ''}</span>
                {' · '}{whenLabel(nextUp.date)}
                {nextUp.location ? ' · ' + nextUp.location : ''}
              </p>
              <div className="csx-next-actions">
                <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={() => openFromList(nextUp)}>
                  {L('פרטים ונוכחות', 'Details & attendance')}
                </button>
                <button
                  type="button"
                  className="btn-soft"
                  style={{ marginTop: 0 }}
                  onClick={() => downloadIcs({
                    title: nextUp.kind === 'meeting' ? nextUp.topic : trTeam(nextUp.team) || L('אימון', 'Practice'),
                    date: nextUp.date,
                    start: nextUp.start_time,
                    end: nextUp.end_time,
                    location: nextUp.location,
                  })}
                >
                  <CalendarPlus size={15} /> {L('הוסף ליומן', 'Add to calendar')}
                </button>
              </div>
            </div>
          )}

          {/* ימי האימון הקבועים — שורות אמיתיות, לא רק הפניה */}
          {slots.length > 0 && (
            <div className="csx-card">
              <div className="csx-card-head">
                <span className="csx-eyebrow csx-eyebrow-accent">{L('ימי אימון קבועים', 'Fixed practice days')}</span>
                <span className="muted small">{PLAYER_SIDE ? L('מופיעים אוטומטית לשחקנים', 'Shown to players automatically') : L('נכנסים ללו"ז השבועי אוטומטית', 'Added to the weekly schedule automatically')}</span>
              </div>
              <div className="csx-slotrows">
                {slots.map((s) => (
                  <div key={s.id} className="csx-slotrow">
                    <span>
                      <b>{trTeam(s.team)}</b>
                      <span className="muted small">{L('יום ', 'Day ')}{WD_LONG[s.weekday] || ''}{s.location ? ' · ' + s.location : ''}</span>
                    </span>
                    <span className="csx-slotrow-when" dir="ltr">
                      {(s.start_time || '').slice(0, 5)}–{(s.end_time || '').slice(0, 5)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted small csx-slots-note">
                {L('שינוי יום קבוע נעשה ב«הקבוצות שלי ← ימי אימון», והוא מתעדכן בכל השבועות. ', 'Fixed days are changed under “My teams → practice days”, and update across every week. ')}
                {onNavigate && (
                  <button type="button" className="link-button" onClick={() => onNavigate('teams-practices')}>
                    {L('לניהול', 'Manage')}
                  </button>
                )}
              </p>
            </div>
          )}

          <div className="csx-stats">
            <div><b className="stat-num" dir="ltr">{weekDays.reduce((a, d) => a + d.items.filter((x) => x.kind === 'practice').length, 0)}</b><span className="muted small">{L('אימונים השבוע', 'Practices')}</span></div>
            <div><b className="stat-num" dir="ltr">{weekDays.reduce((a, d) => a + d.items.filter((x) => x.kind === 'game').length, 0)}</b><span className="muted small">{L('משחקים', 'Games')}</span></div>
            <div><b className="stat-num" dir="ltr">{slots.length}</b><span className="muted small">{L('ימים קבועים', 'Fixed days')}</span></div>
          </div>
        </>
      )}

      {/* פרטי פגישה שנבחרה */}
      {selected && selected._meeting && (
        <div className="cal-detail">
          <div className="cal-detail-head">
            <strong>{L('פגישה: ', 'Meeting: ')}{selected.topic}</strong>
            <button className="icon-btn" onClick={() => setSelected(null)} aria-label={L('סגור', 'Close')}>
              <X size={16} />
            </button>
          </div>
          <div className="cal-detail-row" dir="ltr">
            {selected.start_time}
            {selected.end_time ? '–' + selected.end_time : ''}
          </div>
          <div className="cal-detail-plan">
            {selected.to_coach === me ? L('מ: ', 'From: ') : L('עם: ', 'With: ')}
            {coachName(selected.from_coach === me ? selected.to_p : selected.from_p)}
          </div>
          <div className={'cal-status cal-status-' + selected.status}>
            {selected.status === 'pending'
              ? L('ממתין לאישור', 'Pending')
              : selected.status === 'accepted'
                ? <><Check size={14} aria-hidden="true" /> {L('אושר', 'Accepted')}</>
                : L('נדחה', 'Declined')}
          </div>
          {selected.note && <p className="muted small" style={{ marginTop: 8 }}>{selected.note}</p>}
          {selected.to_coach === me && selected.status === 'pending' && (
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => respondMeeting(selected, 'accepted')}>
                {L('אישור', 'Accept')}
              </button>
              <button className="btn-ghost" onClick={() => respondMeeting(selected, 'declined')}>
                {L('דחייה', 'Decline')}
              </button>
            </div>
          )}
          <button className="btn-ghost danger" style={{ marginTop: 12 }} onClick={() => removeMeeting(selected.id)}>
            <Trash2 size={15} /> {L('מחיקת הפגישה', 'Delete meeting')}
          </button>
        </div>
      )}

      {/* פרטי אימון שנבחר */}
      {selected && !selected._meeting && (
        <div className="cal-detail">
          <div className="cal-detail-head">
            <strong>
              {selected.is_personal ? L('אימון אישי', 'Personal practice') : trTeam(selected.team)}
            </strong>
            <button className="icon-btn" onClick={() => setSelected(null)} aria-label={L('סגור', 'Close')}>
              <X size={16} />
            </button>
          </div>
          <div className="cal-detail-row" dir="ltr">
            {selected.start_time}
            {selected.end_time ? '–' + selected.end_time : ''}
          </div>
          {selected._recurring && (
            /* היה טקסט שמפנה ל«הקבוצות שלי ← ימי אימון» בלי דרך להגיע לשם */
            <p className="muted small cal-recurring-note" style={{ marginTop: 8 }}>
              <RotateCw size={13} /> {L('אימון קבוע. ', 'Fixed practice. ')}
              {onNavigate && (
                <button type="button" className="link-button" onClick={() => onNavigate('teams-practices')}>
                  {L('לניהול הימים והשעות', 'Manage days & times')}
                </button>
              )}
            </p>
          )}
          {selected.plan && (
            <button
              className="btn-primary cal-open-plan"
              style={{ marginTop: 8 }}
              onClick={() => openPlan(selected.plan)}
            >
              {L('פתח את תוכנית האימון', 'Open training plan')} · {selected.plan.name}
            </button>
          )}
          {selected.note && <p className="muted small" style={{ marginTop: 8 }}>{selected.note}</p>}
          {/* 1.3 — אישורי הגעה לאימון: אישרו / לא מגיעים / טרם ענו */}
          {PLAYER_SIDE && !selected.is_personal && selected.team && (
            <RsvpBreakdown coachId={me} team={selected.team} sessionId={selected.id} />
          )}
          {!selected.is_personal && selected.team && (
            <button
              className="btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => setReviewEntry(selected)}
            >
              <ClipboardCheck size={15} /> {L('נוכחות ומשוב לאימון', 'Attendance & session review')}
            </button>
          )}
          <button
            className="btn-soft"
            style={{ marginTop: 12 }}
            onClick={() => downloadIcs({
              title: selected.is_personal ? L('אימון אישי', 'Personal practice') : L(`אימון ${selected.team || ''}`, `Practice ${selected.team || ''}`),
              date: selected.date,
              start: selected.start_time,
              end: selected.end_time,
              location: selected.location,
              description: selected.note || (selected.plan ? selected.plan.name : ''),
            })}
          >
            <CalendarPlus size={15} /> {L('הוסף ליומן', 'Add to calendar')}
          </button>
          {!selected._recurring && (
            <button
              className="btn-ghost danger"
              style={{ marginTop: 12 }}
              onClick={() => removeEntry(selected.id)}
            >
              <Trash2 size={15} /> {L('מחיקת האימון', 'Delete practice')}
            </button>
          )}
        </div>
      )}

      {/* טופס הוספה */}
      {adding && (
        <div className="cal-form">
          <div className="cal-form-head">
            <span className="field-label">{L('אימון חדש', 'New practice')}</span>
            <button className="icon-btn" onClick={() => setAdding(false)} aria-label={L('סגור', 'Close')}>
              <X size={16} />
            </button>
          </div>

          <label className="pf-label">
            {L('תאריך', 'Date')}
            <input
              className="finder-input"
              type="date"
              value={formDate}
              dir="ltr"
              onChange={(e) => setFormDate(e.target.value)}
            />
            <span className="muted small cal-il-date">{ilDate(formDate)}</span>
          </label>

          <div className="form-grid-2" style={{ marginTop: 10 }}>
            <label className="pf-label">
              {L('שעת התחלה', 'Start time')}
              <input
                className="finder-input"
                type="time"
                value={startTime}
                dir="ltr"
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="pf-label">
              {L('שעת סיום', 'End time')}
              <input
                className="finder-input"
                type="time"
                value={endTime}
                dir="ltr"
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>

          <div className="chips" style={{ marginTop: 12 }}>
            <button
              type="button"
              className={!isPersonal ? 'chip selected' : 'chip'}
              onClick={() => setIsPersonal(false)}
            >
              {L('אימון קבוצה', 'Team practice')}
            </button>
            <button
              type="button"
              className={isPersonal ? 'chip selected' : 'chip'}
              onClick={() => setIsPersonal(true)}
            >
              {L('אימון אישי', 'Personal practice')}
            </button>
          </div>

          {!isPersonal && (
            <>
              {myTeams.length > 0 ? (
                <select
                  className="finder-input"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  aria-label={L('בחר קבוצה', 'Choose team')}
                  style={{ marginTop: 10 }}
                >
                  <option value="">{L('בחר קבוצה...', 'Choose a team...')}</option>
                  {myTeams.map((t) => (
                    <option key={t} value={t}>{trTeam(t)}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="finder-input"
                  type="text"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  aria-label={L('שם הקבוצה', 'Team name')}
                  placeholder={L('שם הקבוצה (לדוגמה: נערים א׳ בנים)', 'Team name (e.g. Youth A Boys)')}
                  style={{ marginTop: 10 }}
                />
              )}
              <p className="muted small cal-recurring-tip" style={{ marginTop: 10 }}>
                {/* צד המאמן בלבד: אין שחקנים שיראו אותו — רק הלו"ז שלך */}
                <RotateCw size={13} /> {PLAYER_SIDE
                  ? L('אימון שחוזר כל שבוע מוגדר פעם אחת ומופיע כאן ואצל השחקנים אוטומטית. ', 'A weekly fixed practice is set once, and appears here and for your players automatically. ')
                  : L('אימון שחוזר כל שבוע מוגדר פעם אחת ונכנס ללו"ז בכל השבועות אוטומטית. ', 'A weekly fixed practice is set once, and lands in every week of your schedule automatically. ')}
                {onNavigate && (
                  <button type="button" className="link-button" onClick={() => onNavigate('teams-practices')}>
                    {L('להגדרת ימי אימון', 'Set practice days')}
                  </button>
                )}
              </p>
            </>
          )}

          <select
            className="finder-input"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            aria-label={L('תוכנית אימון מצורפת', 'Attached training plan')}
            style={{ marginTop: 10 }}
          >
            <option value="">{L('— ללא תוכנית אימון מצורפת —', '— No attached training plan —')}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* מוצג רק כשהעמודה באמת קיימת — שדה שההקלדה בו נזרקת בשקט
              גרוע משדה שאינו קיים. */}
          {hasLoc && (
            <input
              className="finder-input"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-label={L('מקום', 'Location')}
              placeholder={L('אולם / מגרש (לא חובה)', 'Venue / court (optional)')}
              style={{ marginTop: 10 }}
            />
          )}

          <input
            className="finder-input"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={L('הערה לאימון', 'Practice note')}
            /* צד המאמן בלבד: ההערה נשארת אצלך — אין שחקנים שיראו אותה */
            placeholder={PLAYER_SIDE ? L('הערה — השחקנים בקבוצה יראו אותה', 'Note — visible to the team') : L('הערה לאימון (לא חובה)', 'Practice note (optional)')}
            style={{ marginTop: 10 }}
          />

          <div className="form-actions">
            <button className="btn-primary" disabled={saving} onClick={saveEntry}>
              {saving ? L('שומר...', 'Saving...') : L('שמירת האימון', 'Save practice')}
            </button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>
              {L('ביטול', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      {/* טופס זימון מאמן */}
      {inviting && (
        <div className="cal-form">
          <div className="cal-form-head">
            <span className="field-label">{L('זימון מאמן לפגישה', 'Invite a coach to a meeting')}</span>
            <button className="icon-btn" onClick={() => setInviting(false)} aria-label={L('סגור', 'Close')}>
              <X size={16} />
            </button>
          </div>

          <label className="pf-label">
            {L('מאמן', 'Coach')}
            <select className="finder-input" value={invTo} onChange={(e) => setInvTo(e.target.value)}>
              <option value="">{L('— בחר מאמן —', '— Choose a coach —')}</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {coachName(c)}{c.club ? ` · ${c.club}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="pf-label" style={{ marginTop: 10 }}>
            {L('נושא הפגישה', 'Meeting topic')}
            <input
              className="finder-input"
              type="text"
              value={invTopic}
              onChange={(e) => setInvTopic(e.target.value)}
              placeholder={L('לדוגמה: תיאום משחק ידידות', 'e.g. Arrange a friendly game')}
            />
          </label>

          <label className="pf-label" style={{ marginTop: 10 }}>
            {L('תאריך', 'Date')}
            <input className="finder-input" type="date" dir="ltr" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
            <span className="muted small cal-il-date">{ilDate(invDate)}</span>
          </label>

          <div className="form-grid-2" style={{ marginTop: 10 }}>
            <label className="pf-label">
              {L('שעת התחלה', 'Start time')}
              <input className="finder-input" type="time" dir="ltr" value={invStart} onChange={(e) => setInvStart(e.target.value)} />
            </label>
            <label className="pf-label">
              {L('שעת סיום', 'End time')}
              <input className="finder-input" type="time" dir="ltr" value={invEnd} onChange={(e) => setInvEnd(e.target.value)} />
            </label>
          </div>

          <input
            className="finder-input"
            type="text"
            value={invNote}
            onChange={(e) => setInvNote(e.target.value)}
            aria-label={L('הערה', 'Note')}
            placeholder={L('הערה (לא חובה)', 'Note (optional)')}
            style={{ marginTop: 10 }}
          />

          <div className="form-actions">
            <button className="btn-primary" disabled={invSaving} onClick={sendInvite}>
              {invSaving ? L('שולח...', 'Sending...') : L('שליחת זימון', 'Send invite')}
            </button>
            <button className="btn-ghost" onClick={() => setInviting(false)}>
              {L('ביטול', 'Cancel')}
            </button>
          </div>
          {coaches.length === 0 && (
            <p className="muted small" style={{ marginTop: 8 }}>
              {L('אין עדיין מאמנים אחרים במערכת.', 'No other coaches in the system yet.')}
            </p>
          )}
        </div>
      )}

      </div>{/* /csx-rail */}
      </div>{/* /csx-shell */}

      {reviewEntry && (
        <SessionDetail session={session} entry={reviewEntry} onClose={() => setReviewEntry(null)} />
      )}
    </div>
  )
}
