import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FolderOpen, Users, Ruler, Weight, MoveUp, Timer, Plus, Shield, UserPlus, Lock, Eye, Check, X,
  CalendarDays, ListChecks, Link2, Database, Trash2, Printer, SlidersHorizontal, RotateCcw, EyeOff,
} from 'lucide-react'
import { L, trTeam } from './i18n'
import { toast } from './toast'
import { confirmDialog } from './confirm'
import { SkeletonCards } from './Skeleton'
import { ErrorState } from './states'
import * as api from './dossierApi'

// «תיק שחקן» — 18.8.2026.
// התיק עובר עם השחקן משנה לשנה: כל שורת סגל (קבוצה של שנה) תלויה על אדם
// אחד ב-dossier_people, וכל הדירוגים/המדידות/ההערות תלויים על האדם — לא
// על הקבוצה. לכן גרף ההתקדמות ממשיך גם כשהשחקן עולה שכבה.
//
// שלושה מסכים, לפי מה שאושר בתצוגה המוקדמת:
//   1. תיק שחקן   — תמונת מצב, מדידות, גרף, דירוגים, רקע, ומה שנאסף לבד
//   2. סבב דירוג  — כל הקטגוריות, שחקן־אחרי־שחקן או קטגוריה־אחרי־קטגוריה
//   3. מי רואה    — התשובה במשפט אחד, המבנה במועדון, והגישות
//
// ההרשאות נאכפות בשרת (dossier_can_see / dossier_can_edit ב-
// supabase_dossier_18_8.sql). המסך לא «מסתיר» — הוא פשוט לא מקבל מה
// שאסור לו. שחקנים והורים אינם רואים דבר מהתיק.

const ICON_BY_MEASURE = { height: Ruler, weight: Weight, jump: MoveUp, sprint: Timer }
// המפתח נשאר עברית — הוא מה שכבר שמור ב-dossier_notes.kind בפרוד;
// רק התווית מתורגמת (אותו דפוס כמו סיבות ההיעדרות ב-PlanNotebook).
const NOTE_KINDS = [
  { k: 'רקע', en: 'Background' },
  { k: 'שיחה', en: 'Talk' },
  { k: 'פציעה', en: 'Injury' },
  { k: 'משפחה', en: 'Family' },
  { k: 'לימודים', en: 'School' },
]
const kindLabel = (k) => {
  const x = NOTE_KINDS.find((n) => n.k === k)
  return x ? L(x.k, x.en) : k
}

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(String(iso).slice(0, 10) + 'T00:00')
  return Number.isNaN(d.getTime()) ? iso : `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`
}
const round1 = (n) => Math.round(n * 10) / 10
const f1 = (n) => (n ? (Math.round(n * 10) / 10).toFixed(1) : '—')
// גוון הממוצע (מסמך העיצוב 22.8): ככל שגבוה יותר — מלא יותר
const avgTint = (v) => (!v ? 't0' : v >= 4.5 ? 't5' : v >= 3.8 ? 't4' : v >= 3 ? 't3' : v >= 2 ? 't2' : 't1')
// ראשי תיבות לאווטאר («דור אביב» → «דא»)
const initials = (name) => (name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('') || '—'

// פס שינוי מספרי — במקום חץ: «+0.7», «−1», «=», או «חדש» כשאין סבב קודם
const DeltaChip = ({ from, to, lower = false, unit = '' }) => {
  if (!to) return null
  if (!from) return <span className="pd-chip flat">{L('חדש', 'new')}</span>
  const d = round1(to - from)
  const good = lower ? d < 0 : d > 0
  return (
    <span className={`pd-chip ${d === 0 ? 'flat' : good ? 'up' : 'down'}`} dir="ltr">
      {d === 0 ? '=' : (d > 0 ? '+' : '−') + Math.abs(d)}{unit ? ` ${unit}` : ''}
    </span>
  )
}
// «עכשיו» ו«סבב קודם» **לתאריך שנבחר**: כשמזינים לתאריך אחר צריך לראות מה היה
// בתוקף אז — לא את הדירוג האחרון בזמן. הסדרה מגיעה ממוינת בזמן מהמסד,
// והעדכון האופטימי שומר על המיון.
const atDate = (arr, on) => {
  const upto = (arr || []).filter((e) => e.on <= on)
  return {
    cur: upto.length ? upto[upto.length - 1].value : 0,
    prev: upto.length > 1 ? upto[upto.length - 2].value : 0,
  }
}
const hasOn = (arr, on) => (arr || []).some((e) => e.on === on)

// הדפסה/ייצוא: הדפדפן מדפיס — «שמירה כ-PDF» בחלון ההדפסה היא הייצוא.
// מסמנים את ה-body כדי שכללי ההדפסה יחולו על התיק בלבד; מסכים אחרים
// (המחברת, דף התרגיל) מדפיסים את עצמם ואסור להם להיעלם.
function printDossier() {
  const done = () => {
    document.body.classList.remove('print-dossier')
    window.removeEventListener('afterprint', done)
  }
  document.body.classList.add('print-dossier')
  window.addEventListener('afterprint', done)
  window.print()
  setTimeout(done, 1200)   // דפדפנים שלא יורים afterprint
}

// ---------- «עכביש» ----------
// 300 במקום 216, טבעות+חישורים, נקודה על כל קודקוד, ושם+מספר ליד כל ציר
function Radar({ cats, valNow, valPrev, size = 300 }) {
  if (cats.length < 3) return null
  const cx = size / 2, cy = size / 2, r = size / 2 - 46
  const catAvg = (c, fn) => {
    const v = c.metrics.map((m) => fn(m.key)).filter((x) => x > 0)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
  }
  const pt = (i, f) => {
    const a = (Math.PI * 2 * i) / cats.length - Math.PI / 2
    return [round1(cx + Math.cos(a) * r * f), round1(cy + Math.sin(a) * r * f)]
  }
  const poly = (fn) => cats.map((c, i) => pt(i, Math.min(1, catAvg(c, fn) / 5)).join(',')).join(' ')
  return (
    // שוליים אופקיים ב-viewBox: התוויות («גוף ואתלטיות») יוצאות מעבר לריבוע ונחתכו
    <svg viewBox={`-44 0 ${size + 88} ${size}`} className="pd-radar" role="img"
      aria-label={L('תמונת מצב לפי תחומים', 'Snapshot by area')}>
      {[1, 0.75, 0.5, 0.25].map((f) => (
        <polygon key={f} className="pd-radar-grid" points={cats.map((c, i) => pt(i, f).join(',')).join(' ')} />
      ))}
      {cats.map((c, i) => { const q = pt(i, 1); return <line key={c.key} className="pd-radar-spoke" x1={cx} y1={cy} x2={q[0]} y2={q[1]} /> })}
      <polygon points={poly(valPrev)} className="pd-radar-prev" />
      <polygon points={poly(valNow)} className="pd-radar-now" />
      {cats.map((c, i) => { const q = pt(i, Math.min(1, catAvg(c, valNow) / 5)); return <circle key={c.key} className="pd-radar-pt" cx={q[0]} cy={q[1]} r="4.5" /> })}
      {cats.map((c, i) => {
        const a = (Math.PI * 2 * i) / cats.length - Math.PI / 2
        const q = pt(i, 1.3)
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'
        return (
          <text key={c.key} x={q[0]} y={q[1] - 4} className="pd-radar-lbl" textAnchor={anchor}>
            <tspan>{c.label}</tspan>
            <tspan x={q[0]} dy="14" className="pd-radar-v" dir="ltr">{f1(catAvg(c, valNow))}</tspan>
          </text>
        )
      })}
    </svg>
  )
}

// ---------- גרף לאורך זמן ----------
function Trend({ series, unit, lowerIsBetter, teamAvg = 0, label = '' }) {
  if (!series || series.length === 0) {
    return (
      <p className="muted small">
        {L('אין עוד נתונים למדד הזה — הדירוג הראשון יפתח את הגרף.', 'No data yet — the first rating opens the chart.')}
      </p>
    )
  }
  const w = 620, h = 170, pad = { t: 22, r: 20, b: 38, l: 52 }
  const values = series.map((s) => s.value)
  // קו הקבוצה נכנס לחישוב הסקאלה, אחרת הוא היה נצמד לשפת הגרף ומשקר
  const scale = teamAvg > 0 ? [...values, teamAvg] : values
  const min = Math.min(...scale), max = Math.max(...scale)
  const span = max - min || 1
  const x = (i) => (series.length === 1 ? w / 2 : pad.l + (i * (w - pad.l - pad.r)) / (series.length - 1))
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / span)
  const base = h - pad.b
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.value)}`).join(' ')
  const area = `${line} L${x(series.length - 1)},${base} L${x(0)},${base} Z`
  const first = values[0], last = values[values.length - 1]
  const better = lowerIsBetter ? last < first : last > first
  const lastI = series.length - 1
  return (
    <div className="pd-trend">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={L('גרף התקדמות', 'Progress chart')}>
        <line x1={pad.l} y1={base} x2={w - pad.r} y2={base} className="pd-axis" />
        {teamAvg > 0 && (
          <g>
            <line x1={pad.l} y1={y(teamAvg)} x2={w - pad.r} y2={y(teamAvg)} className="pd-team-line" />
            <text x={w - pad.r} y={y(teamAvg) - 6} className="pd-team-lbl" textAnchor="end">
              {L('ממוצע שאר הקבוצה', 'Rest of the team')} <tspan dir="ltr">{teamAvg}</tspan>
            </text>
          </g>
        )}
        {series.length > 1 && <path d={area} className="pd-area" />}
        {series.length > 1 && <path d={line} className={better ? 'pd-line up' : 'pd-line down'} />}
        {series.map((s, i) => (
          <g key={s.on + '-' + i}>
            <circle cx={x(i)} cy={y(s.value)} r={i === lastI ? 6.5 : 4.5} className={i === lastI ? 'pd-dot last' : 'pd-dot'} />
            <text x={x(i)} y={y(s.value) - 12} className={i === lastI ? 'pd-val last' : 'pd-val'} textAnchor="middle">{s.value}</text>
            <text x={x(i)} y={h - 10} className={i === lastI ? 'pd-tick last' : 'pd-tick'} textAnchor="middle">{fmtDate(s.on)}</text>
          </g>
        ))}
      </svg>
      <div className="pd-trend-foot">
        {series.length > 1 && <DeltaChip from={first} to={last} lower={lowerIsBetter} unit={unit || ''} />}
        <span className="muted small">
          {L(`${series.length} נקודות מדידה`, `${series.length} data points`)}{label ? ` · ${label}` : ''}
        </span>
      </div>
    </div>
  )
}

// canClear: הערך שמוצג נרשם **לתאריך הנבחר**, ולכן לחיצה עליו מבטלת.
// אם הוא נגרר מסבב קודם — לחיצה עליו מאשרת אותו לתאריך הזה, לא מוחקת
// (אחרת «אותו דירוג כמו בפעם שעברה» היה בלתי אפשרי לרשום).
function Dots({ value, onChange, name, canClear = true, readOnly = false }) {
  if (readOnly) {
    return (
      <span className="pd-dots ro" role="img" aria-label={L(`${name}: ${value || '—'} מתוך 5`, `${name}: ${value || '—'} of 5`)}>
        {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= value ? (n === value ? 'pd-dot-ro on last' : 'pd-dot-ro on') : 'pd-dot-ro'} />)}
      </span>
    )
  }
  return (
    <span className="pd-dots" role="radiogroup" aria-label={name}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}`}
          className={n <= value ? (n === value ? 'pd-dot-btn on last' : 'pd-dot-btn on') : 'pd-dot-btn'}
          onClick={() => onChange(n === value && canClear ? 0 : n)}>
          <span />
        </button>
      ))}
    </span>
  )
}

// =====================================================================
//  המסך
// =====================================================================
export default function PlayerDossier({ session, profile, initialRosterId, onConsumeInitial }) {
  const me = session.user.id
  const club = profile?.club || ''

  const [tab, setTab] = useState('dossier')
  // תאריך ההזנה. ברירת המחדל היום; מאמן שממלא סבב שהתקיים בשבוע שעבר
  // בוחר את התאריך שלו, וכל מה שיסומן יישמר עליו.
  const [onDate, setOnDate] = useState(api.today())
  const [iAmManager, setIAmManager] = useState(false)
  const [iAmDirector, setIAmDirector] = useState(false)
  // מנהל שגולש בתיקים של מאמן אחר: { id, name }. קריאה בלבד — הדירוג
  // נשאר של מי שמאמן (dossier_can_edit במסד לא נותן לו לכתוב בכלל).
  const [viewCoach, setViewCoach] = useState(null)
  const [boot, setBoot] = useState({ loading: true, error: null, missing: false })
  const [catalog, setCatalog] = useState({ cats: [], measures: [], all: [] })
  const [teams, setTeams] = useState([])
  const [roster, setRoster] = useState([])
  const [team, setTeam] = useState('')
  const [rosterId, setRosterId] = useState(null)
  const [personByRoster, setPersonByRoster] = useState({})
  const [entries, setEntries] = useState({})      // personId -> metricKey -> [{on, value}]
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setBoot({ loading: true, error: null, missing: false })
      const cat = await api.loadCatalog()
      if (!alive) return
      if (cat.error) {
        setBoot({ loading: false, error: cat.error.message, missing: api.notDeployed(cat.error) })
        return
      }
      const t = await api.loadTeams(viewCoach?.id || me)
      if (!alive) return
      if (t.error) {
        setBoot({ loading: false, error: t.error.message, missing: api.notDeployed(t.error) })
        return
      }
      const rows = api.sortRoster(t.roster)
      setCatalog(cat)
      setTeams(t.teams)
      setRoster(rows)
      // מעבר בין מאמנים (גלישה של מנהל) — «הקבוצה שנבחרה» של הקודם לא
      // קיימת אצל הבא, ולכן נופלים לראשונה שלו במקום למסך ריק ומטעה
      setTeam((cur) => (cur && t.teams.includes(cur) ? cur : t.teams[0] || ''))
      setPersonByRoster(Object.fromEntries(rows.filter((r) => r.person_id).map((r) => [r.id, r.person_id])))
      setBoot({ loading: false, error: null, missing: false })
      // עריכת הקטלוג פתוחה למנהל מועדון בלבד — גם במסד וגם במסך
      if (club) {
        const cr = await api.loadClubRoles(club)
        if (alive && !cr.error) {
          const mine = (cr.roles || []).filter((r) => r.user_id === me)
          setIAmManager(mine.some((r) => r.role === 'club_manager'))
          setIAmDirector(mine.some((r) => r.role === 'technical_director'))
        }
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, club, viewCoach?.id, reloadKey])

  // הגעה מכרטיס השחקן: קופצים ישר לתיק שלו (קבוצה + שחקן), פעם אחת
  useEffect(() => {
    if (!initialRosterId || !roster.length) return
    const row = roster.find((r) => r.id === initialRosterId)
    if (row) { setTeam(row.team); setRosterId(row.id); setTab('dossier') }
    onConsumeInitial?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRosterId, roster.length])

  const teamRoster = useMemo(() => roster.filter((r) => r.team === team), [roster, team])
  // תלוי בזהות המערך ולא ב«שם הקבוצה + מספר שחקנים»: לשני מאמנים באותו
  // מועדון יש כמעט תמיד קבוצה באותו שם, ואם גם המספר זהה — הבדיקה הישנה
  // לא הייתה רצה, ו-rosterId היה נשאר תקוע על שחקן של המאמן הקודם.
  useEffect(() => {
    if (!teamRoster.length) { setRosterId(null); return }
    if (!teamRoster.some((r) => r.id === rosterId)) setRosterId(teamRoster[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamRoster])

  // מזהי האנשים של הקבוצה — לממוצע הקבוצה. **בלי לפתוח תיקים חדשים**:
  // פתיחת תיק היא פעולה של המאמן, לא תופעת לוואי של צפייה במסך.
  const teamPids = useMemo(
    () => teamRoster.map((r) => personByRoster[r.id]).filter(Boolean),
    [teamRoster, personByRoster]
  )

  // פתיחת תיק לשורת סגל — יוצרת את האדם בפעם הראשונה (RPC dossier_open)
  const ensurePerson = useCallback(async (rid) => {
    if (!rid) return null
    if (personByRoster[rid]) return personByRoster[rid]
    const { personId, error } = await api.openDossier(rid)
    if (error) {
      toast.error(L('פתיחת התיק נכשלה: ', 'Failed to open the dossier: ') + error.message)
      return null
    }
    setPersonByRoster((cur) => ({ ...cur, [rid]: personId }))
    setRoster((cur) => cur.map((r) => (r.id === rid ? { ...r, person_id: personId } : r)))
    return personId
  }, [personByRoster])

  const loadEntriesFor = useCallback(async (ids) => {
    const need = ids.filter(Boolean)
    if (!need.length) return
    const { byPerson, error } = await api.loadEntries(need)
    if (error) { toast.error(L('טעינת הדירוגים נכשלה', 'Failed to load ratings')); return }
    setEntries((cur) => ({ ...cur, ...Object.fromEntries(need.map((id) => [id, byPerson[id] || {}])) }))
  }, [])

  // הערכים של כל הקבוצה בשאילתה אחת — הבסיס לממוצע הקבוצה בגרף ובדירוגים
  useEffect(() => {
    if (teamPids.length) loadEntriesFor(teamPids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, teamPids.length])

  // שמירת דירוג/מדידה: מיד על המסך, ואז במסד. תיקון באותו יום דורס.
  // אם התיק עוד לא נוצר (לחיצה בשנייה הראשונה של פתיחה ראשונה) —
  // פותחים אותו כאן ואז שומרים, במקום לבלוע את הלחיצה בשקט.
  const setValue = async (personId, metricKey, value, rosterIdForOpen) => {
    let pid = personId
    if (!pid && rosterIdForOpen) pid = await ensurePerson(rosterIdForOpen)
    if (!pid) {
      toast.error(L('התיק עוד נטען — נסו שוב בעוד רגע', 'The dossier is still loading — try again in a moment'))
      return
    }
    return setValueFor(pid, metricKey, value)
  }

  const setValueFor = async (personId, metricKey, value) => {
    const on = onDate
    setEntries((cur) => {
      const person = { ...(cur[personId] || {}) }
      const arr = (person[metricKey] || []).filter((e) => e.on !== on)
      // הזנה לתאריך אחר נכנסת באמצע הסדרה — שומרים על המיון בזמן
      person[metricKey] = value > 0 ? [...arr, { on, value }].sort((a, b) => (a.on < b.on ? -1 : 1)) : arr
      return { ...cur, [personId]: person }
    })
    setSaving(true)
    const res = value > 0
      ? await api.saveEntry({ personId, metricKey, value, on, coachId: me })
      : await api.clearEntry({ personId, metricKey, on, coachId: me })
    setSaving(false)
    if (res.error) {
      toast.error(L('השמירה נכשלה: ', 'Save failed: ') + res.error.message)
      loadEntriesFor([personId])
    }
  }

  if (boot.loading) return <div className="welcome-card"><SkeletonCards count={2} lines={5} /></div>
  if (boot.missing) {
    return (
      <div className="welcome-card pd-screen">
        <div className="pd-demo-banner" role="note">
          <Database size={16} aria-hidden="true" />
          <span>
            <b>{L('המסד עוד לא עודכן.', 'The database is not migrated yet.')}</b>{' '}
            {L('כדי שהתיקים יעבדו צריך להריץ ב-Supabase את supabase_dossier_18_8.sql (ההוראות ב-הרצת_SQL_18.8.md). עד אז המסך ריק ושום דבר לא נשמר.',
               'Run supabase_dossier_18_8.sql in Supabase (instructions in הרצת_SQL_18.8.md). Until then this screen stays empty and nothing is saved.')}
          </span>
        </div>
      </div>
    )
  }
  if (boot.error) {
    return <div className="welcome-card"><ErrorState message={boot.error} onRetry={() => setReloadKey((k) => k + 1)} /></div>
  }

  const readOnly = !!viewCoach          // מנהל שגולש בתיקים של מאמן אחר
  // גלישה של מנהל היא תמונת מצב של **היום**. תאריך הזנה שהמאמן בחר לעצמו
  // אסור לו לדלוף לתיק של מאמן אחר — שם אין בורר תאריך שיגלה אותו, והתיק
  // היה נראה ריק בלי סיבה נראית לעין. נגזר כאן ולא ב-setState, כדי שכל
  // דרך עתידית להיכנס לגלישה תהיה מכוסה בלי לזכור לאפס.
  const viewDate = readOnly ? api.today() : onDate
  const noTeams = teams.length === 0
  const rosterRow = teamRoster.find((r) => r.id === rosterId)

  return (
    <div className="welcome-card pd-screen pd-v2">
      <div className="tabs pd-tabs">
        <button className={tab === 'dossier' ? 'tab active' : 'tab'} onClick={() => setTab('dossier')}>
          <FolderOpen size={15} aria-hidden="true" /> {L('תיק שחקן', 'Player dossier')}
        </button>
        {!readOnly && (
          <button className={tab === 'round' ? 'tab active' : 'tab'} onClick={() => setTab('round')}>
            <Users size={15} aria-hidden="true" /> {L('סבב דירוג', 'Rating round')}
          </button>
        )}
        {!readOnly && (
          <button className={tab === 'access' ? 'tab active' : 'tab'} onClick={() => setTab('access')}>
            <Shield size={15} aria-hidden="true" /> {L('מי רואה את התיקים', 'Who sees them')}
          </button>
        )}
        {(iAmManager || iAmDirector) && (
          <button className={tab === 'club' ? 'tab active' : 'tab'} onClick={() => setTab('club')}>
            <Shield size={15} aria-hidden="true" /> {L('המועדון', 'The club')}
          </button>
        )}
        {iAmManager && (
          <button className={tab === 'catalog' ? 'tab active' : 'tab'} onClick={() => setTab('catalog')}>
            <SlidersHorizontal size={15} aria-hidden="true" /> {L('הקטלוג', 'Catalog')}
          </button>
        )}
      </div>

      {readOnly && (
        <div className="pd-viewing" role="status">
          <Eye size={16} aria-hidden="true" />
          <span>
            {L(`אתה צופה בתיקים של ${viewCoach.name} — קריאה בלבד.`, `Viewing ${viewCoach.name}’s dossiers — read only.`)}
          </span>
          <button type="button" className="btn-soft" onClick={() => { setViewCoach(null); setTab('dossier') }}>
            <RotateCcw size={14} aria-hidden="true" /> {L('חזרה לקבוצות שלי', 'Back to my teams')}
          </button>
        </div>
      )}

      {tab === 'catalog' ? (
        <CatalogEditor club={club} rows={catalog.rows || []} onSaved={() => setReloadKey((k) => k + 1)} />
      ) : tab === 'club' ? (
        <ClubManage
          me={me}
          club={club}
          iAmManager={iAmManager}
          onBrowse={(coach) => { setViewCoach(coach); setTab('dossier') }}
        />
      ) : noTeams ? (
        <div className="empty-state">
          <span className="empty-ic"><Users size={26} /></span>
          <div className="empty-title">
            {readOnly ? L(`אין קבוצות אצל ${viewCoach.name}`, `No teams for ${viewCoach.name}`) : L('אין עדיין שחקנים', 'No players yet')}
          </div>
          <p className="muted small">
            {readOnly
              ? L('או שהוא עוד לא הוסיף שחקנים, או שהמסד עוד לא עודכן — צריך להריץ את supabase_club_manage_19_8.sql כדי שמנהל יראה סגל של מאמן אחר.',
                  'Either they added no players yet, or supabase_club_manage_19_8.sql has not been run — a manager cannot read another coach’s roster without it.')
              : L('התיקים נבנים על הסגל שלך — מוסיפים שחקנים ב«הקבוצות שלי», וכל שחקן מקבל תיק אוטומטית.',
                  'Dossiers are built on your roster — add players in “My teams” and each gets a dossier automatically.')}
          </p>
        </div>
      ) : (
        <>
          <div className="pd-picker">
            <span className="muted small">{L('קבוצה', 'Team')}</span>
            <select className="finder-input" value={team} onChange={(e) => setTeam(e.target.value)}
              aria-label={L('בחירת קבוצה', 'Pick a team')}>
              {teams.map((t) => <option key={t} value={t}>{trTeam(t)}</option>)}
            </select>
            {tab === 'dossier' && teamRoster.length > 0 && (
              <>
                <span className="muted small">{L('שחקן', 'Player')}</span>
                <select className="finder-input" value={rosterId || ''} onChange={(e) => setRosterId(e.target.value)}
                  aria-label={L('בחירת שחקן', 'Pick a player')}>
                  {teamRoster.map((r) => (
                    <option key={r.id} value={r.id}>{r.number ? `${r.number} · ` : ''}{r.name}</option>
                  ))}
                </select>
              </>
            )}
            {tab !== 'access' && !readOnly && (
              <>
                <span className="muted small">{L('תאריך', 'Date')}</span>
                <input className="finder-input pd-date" type="date" value={onDate} max={api.today()}
                  onChange={(e) => setOnDate(e.target.value || api.today())}
                  aria-label={L('תאריך ההזנה', 'Entry date')} />
                {onDate !== api.today() && (
                  <button type="button" className="pd-date-back" onClick={() => setOnDate(api.today())}>
                    <RotateCcw size={13} aria-hidden="true" /> {L('חזרה להיום', 'Back to today')}
                  </button>
                )}
              </>
            )}
            {!readOnly && (
              <span className={saving ? 'pd-saved busy' : 'pd-saved'} role="status">
                {saving ? L('שומר…', 'Saving…') : L('נשמר אוטומטית', 'Saved automatically')}
              </span>
            )}
          </div>

          {tab !== 'access' && !readOnly && onDate !== api.today() && (
            <p className="pd-backdate" role="status">
              <CalendarDays size={15} aria-hidden="true" />
              {L(`מזינים לתאריך ${fmtDate(onDate)} — מה שתסמנו כאן יישמר לתאריך הזה, ולא להיום.`,
                 `Entering for ${fmtDate(onDate)} — what you mark is saved under that date, not today.`)}
            </p>
          )}

          {teamRoster.length === 0 ? (
            <div className="empty-state">
              <span className="empty-ic"><Users size={26} /></span>
              <div className="empty-title">{L('אין שחקנים בקבוצה הזו', 'No players on this team')}</div>
              <p className="muted small">{L('מוסיפים שחקנים ב«הקבוצות שלי».', 'Add players in “My teams”.')}</p>
            </div>
          ) : tab === 'dossier' ? (
            <Dossier
              key={rosterId}
              me={me}
              rosterRow={rosterRow}
              catalog={catalog}
              personId={personByRoster[rosterId]}
              ensurePerson={ensurePerson}
              entries={entries}
              loadEntriesFor={loadEntriesFor}
              setValue={setValue}
              onDate={viewDate}
              teamPids={teamPids}
              readOnly={readOnly}
              rosterOwner={viewCoach?.id || me}
            />
          ) : tab === 'round' ? (
            <RatingRound
              key={team}
              team={team}
              teamRoster={teamRoster}
              catalog={catalog}
              personByRoster={personByRoster}
              ensurePerson={ensurePerson}
              entries={entries}
              loadEntriesFor={loadEntriesFor}
              setValue={setValue}
              onDate={onDate}
            />
          ) : (
            <Access
              me={me}
              club={club}
              team={team}
              rosterRow={rosterRow}
              personByRoster={personByRoster}
              ensurePerson={ensurePerson}
            />
          )}
        </>
      )}
    </div>
  )
}

// =====================================================================
//  1. תיק שחקן
// =====================================================================
function Dossier({ me, rosterRow, catalog, personId, ensurePerson, entries, loadEntriesFor, setValue, onDate, teamPids, readOnly = false, rosterOwner }) {
  const [openCat, setOpenCat] = useState(catalog.cats[0]?.key || '')
  const [cmp, setCmp] = useState(false)   // השוואה לממוצע הקבוצה
  const [trendKey, setTrendKey] = useState(catalog.measures[0]?.key || catalog.cats[0]?.metrics[0]?.key || '')
  const [notes, setNotes] = useState([])
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteKind, setNoteKind] = useState(NOTE_KINDS[0].k)
  const [noteText, setNoteText] = useState('')
  const [history, setHistory] = useState([])
  const [auto, setAuto] = useState({})
  const [dups, setDups] = useState([])
  const [measureEdit, setMeasureEdit] = useState(null)
  const [ready, setReady] = useState(false)
  const [pid, setPid] = useState(personId || null) // מזהה האדם, מקומית
  const opened = useRef(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!rosterRow) return
      let id = personId
      if (!id && !opened.current && !readOnly) { opened.current = true; id = await ensurePerson(rosterRow.id) }
      if (!alive) return
      if (!id) { if (readOnly) setReady(true); return }
      setPid(id)
      await loadEntriesFor([id])
      const [n, h, d] = await Promise.all([api.loadNotes(id), api.loadHistory(id), api.findDuplicates(id)])
      if (!alive) return
      setNotes(n.notes || [])
      setHistory(h.history || [])
      setDups(d.candidates || [])
      setReady(true)
      const st = await api.loadAutoStats({
        rosterId: rosterRow.id, playerId: rosterRow.player_id, coachId: rosterOwner || me, team: rosterRow.team,
      })
      if (alive) setAuto(st.stats || {})
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterRow?.id, personId])

  const E = entries[pid] || {}
  // מה שהיה בתוקף בתאריך הנבחר — לא הדירוג האחרון בזמן
  const now = (key) => atDate(E[key], onDate).cur
  const prev = (key) => atDate(E[key], onDate).prev
  // ממוצע **שאר** הקבוצה למדד, באותו תאריך, לפי מי שכבר יש לו ערך.
  // בלי להוציא את השחקן הנוכחי, קבוצה שדורגה בה רק הוא הייתה מציירת
  // «ממוצע הקבוצה» בדיוק דרך הנקודה שלו — השוואה של שחקן לעצמו.
  const teamAvg = (key) => {
    const vals = (teamPids || [])
      .filter((id) => id !== pid)
      .map((id) => atDate((entries[id] || {})[key], onDate).cur)
      .filter((v) => v > 0)
    return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  }
  const trendMetric = catalog.all.find((m) => m.key === trendKey)

  const addNote = async () => {
    if (!noteText.trim() || !pid) return
    const { note, error } = await api.addNote({ personId: pid, kind: noteKind, content: noteText.trim(), on: onDate, coachId: me })
    if (error) { toast.error(L('שמירת הרשומה נכשלה: ', 'Failed to save: ') + error.message); return }
    setNotes((cur) => [note, ...cur])
    setNoteText('')
    setNoteOpen(false)
    toast.success(L('נשמר בתיק', 'Saved to the dossier'))
  }
  const delNote = async (id) => {
    const ok = await confirmDialog({ title: L('למחוק את הרשומה?', 'Delete this entry?'), confirmText: L('מחיקה', 'Delete'), danger: true })
    if (!ok) return
    const { error } = await api.removeNote(id)
    if (error) { toast.error(L('המחיקה נכשלה', 'Delete failed')); return }
    setNotes((cur) => cur.filter((n) => n.id !== id))
  }
  const saveMeasure = async () => {
    const v = Number(measureEdit.value)
    if (Number.isNaN(v) || v <= 0) { toast.error(L('מספר לא תקין', 'Not a valid number')); return }
    await setValue(pid, measureEdit.key, v, rosterRow.id)
    setMeasureEdit(null)
  }
  const linkTo = async (candidate) => {
    const ok = await confirmDialog({
      title: L('זה אותו שחקן?', 'Same player?'),
      message: L(`ההיסטוריה של «${candidate.full_name}» תתחבר לתיק הזה — הדירוגים, המדידות וההערות של כל השנים יופיעו יחד. אי אפשר לבטל.`,
                 `The history of “${candidate.full_name}” will be merged into this dossier. This cannot be undone.`),
      confirmText: L('חיבור התיקים', 'Merge'),
    })
    if (!ok) return
    const { error } = await api.mergePeople(candidate.id, pid)
    if (error) { toast.error(L('החיבור נכשל: ', 'Merge failed: ') + error.message); return }
    toast.success(L('התיקים חוברו', 'Dossiers merged'))
    setDups([])
    loadEntriesFor([pid])
    api.loadNotes(pid).then((n) => setNotes(n.notes || []))
    api.loadHistory(pid).then((h) => setHistory(h.history || []))
  }

  if (!rosterRow) return null
  if (!ready) return <SkeletonCards count={2} lines={5} />
  if (readOnly && !pid) {
    return (
      <div className="empty-state">
        <span className="empty-ic"><FolderOpen size={26} /></span>
        <div className="empty-title">{L('התיק עוד לא נפתח', 'The dossier was not opened yet')}</div>
        <p className="muted small">
          {L('התיק נוצר בפעם הראשונה שהמאמן נכנס אליו. עד אז אין מה להראות — וזה תקין.',
             'A dossier is created the first time the coach opens it. Until then there is nothing to show.')}
        </p>
      </div>
    )
  }

  const age = rosterRow.birth_year ? new Date().getFullYear() - Number(rosterRow.birth_year) : null

  return (
    <div className="pd">
      <header className="pd-head">
        {/* קווי מגרש ברקע — קישוט, 10% */}
        <svg className="pd-head-court" viewBox="0 0 600 170" aria-hidden="true">
          <rect x="20" y="16" width="560" height="138" rx="8" />
          <circle cx="300" cy="85" r="40" />
          <line x1="300" y1="16" x2="300" y2="154" />
          <circle cx="20" cy="85" r="66" />
        </svg>
        <div className="pd-head-row">
          {rosterRow.number ? <b className="pd-num" dir="ltr">{rosterRow.number}</b> : null}
          <div className="pd-head-tx">
            <h2 className="pd-name">{rosterRow.name}</h2>
            <span className="pd-meta">
              {[rosterRow.position, age ? `${age} ${L('שנים', 'yrs')}` : null, trTeam(rosterRow.team)].filter(Boolean).join(' · ')}
            </span>
          </div>
          <span className="pd-head-actions">
            <button type="button" className="btn-soft pd-print-btn" onClick={printDossier}>
              <Printer size={15} aria-hidden="true" /> {L('הדפסה', 'Print')}
            </button>
            <span className="pd-lock">
              <Lock size={13} />{' '}
              {readOnly ? L('קריאה בלבד', 'Read only') : L('סגור — אתה והמנהלים מעליך', 'Private — you and your managers')}
            </span>
          </span>
        </div>
        {history.length > 1 && (
          <div className="pd-seasons" aria-label={L('השנים בתיק', 'Seasons in the dossier')}>
            {history.map((h) => (
              <span key={h.id} className={h.id === rosterRow.id ? 'pd-season now' : 'pd-season'}>
                <b dir="ltr">{new Date(h.created_at).getFullYear()}</b>
                <span>{trTeam(h.team)}</span>
                <i>{h.coachName}</i>
              </span>
            ))}
          </div>
        )}
      </header>

      {dups.length > 0 && !readOnly && (
        <div className="pd-dups">
          <Link2 size={16} aria-hidden="true" />
          <span>
            {L('יש במועדון תיק קיים עם אותו שם', 'There is an existing dossier with the same name')}
            {dups[0].coaches ? ` (${dups[0].coaches})` : ''}. {L('זה אותו שחקן?', 'Same player?')}
          </span>
          <button type="button" className="btn-soft" onClick={() => linkTo(dups[0])}>{L('כן, לחבר', 'Yes, merge')}</button>
          <button type="button" className="link-button" onClick={() => setDups([])}>{L('לא', 'No')}</button>
        </div>
      )}

      <div className="pd-grid">
        <section className="pd-card">
          <div className="pd-card-h">
            <h3>{L('תמונת מצב', 'Snapshot')}</h3>
            <span className="muted small">{L('ממוצע לפי תחום', 'Average per area')}</span>
          </div>
          <Radar cats={catalog.cats} valNow={now} valPrev={prev} />
          <div className="pd-legend">
            <span><i className="pd-sw now" /> {L('עכשיו', 'Now')}</span>
            <span><i className="pd-sw prev" /> {L('סבב קודם', 'Previous round')}</span>
          </div>
        </section>

        <section className="pd-card">
          <div className="pd-card-h">
            <h3>{L('מדידות', 'Measurements')}</h3>
            <span className="muted small">
              {readOnly ? L('לחיצה = בחירת מדד לגרף', 'Tap to chart a metric') : L('לחיצה = מדידה חדשה', 'Tap to add a new one')}
            </span>
          </div>
          <div className="pd-measures">
            {catalog.measures.map((m) => {
              const Icon = ICON_BY_MEASURE[m.key] || Ruler
              const v = now(m.key)
              const p = prev(m.key)
              return (
                <button key={m.key} type="button"
                  className={trendKey === m.key ? 'pd-measure on' : 'pd-measure'}
                  onClick={() => { setTrendKey(m.key); if (!readOnly) setMeasureEdit({ key: m.key, value: v || '' }) }}>
                  <span className="pd-measure-k"><i className="pd-measure-ic"><Icon size={13} /></i> {m.label}</span>
                  <span className="pd-measure-v">
                    <b dir="ltr">{v ? v : '—'}</b>
                    {v ? <small>{m.unit}</small> : null}
                    <DeltaChip from={p} to={v} lower={!!m.lower_is_better} />
                  </span>
                  {cmp && teamAvg(m.key) > 0 ? (
                    <span className="pd-measure-team">{L('קבוצה', 'team')} <bdi dir="ltr">{teamAvg(m.key)}</bdi></span>
                  ) : null}
                </button>
              )
            })}
          </div>
          {measureEdit && (
            <div className="pd-measure-edit">
              <label>
                {catalog.measures.find((m) => m.key === measureEdit.key)?.label}
                <input className="finder-input" type="number" step="0.01" min="0" dir="ltr" autoFocus
                  value={measureEdit.value}
                  onChange={(e) => setMeasureEdit((c) => ({ ...c, value: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveMeasure() }} />
              </label>
              <button type="button" className="btn-primary" onClick={saveMeasure}>{L('שמירה', 'Save')}</button>
              <button type="button" className="btn-ghost" onClick={() => setMeasureEdit(null)}>{L('ביטול', 'Cancel')}</button>
            </div>
          )}
        </section>

        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3>{L('התקדמות', 'Progress')}</h3>
            <select className="finder-input pd-select" value={trendKey} onChange={(e) => setTrendKey(e.target.value)}
              aria-label={L('בחירת מדד לגרף', 'Pick a metric')}>
              {catalog.measures.length > 0 && (
                <optgroup label={L('מדידות', 'Measurements')}>
                  {catalog.measures.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </optgroup>
              )}
              {catalog.cats.map((c) => (
                <optgroup key={c.key} label={c.label}>
                  {c.metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </optgroup>
              ))}
            </select>
            <button type="button" className={cmp ? 'pd-cmp on' : 'pd-cmp'} aria-pressed={cmp}
              onClick={() => setCmp((v) => !v)}>
              <Users size={14} aria-hidden="true" /> {L('השוואה לקבוצה', 'Compare to team')}
            </button>
          </div>
          <Trend series={E[trendKey]} unit={trendMetric?.kind === 'number' ? trendMetric.unit : L('נק׳', 'pts')}
            lowerIsBetter={!!trendMetric?.lower_is_better} teamAvg={cmp ? teamAvg(trendKey) : 0} label={trendMetric?.label || ''} />
          {cmp && teamAvg(trendKey) === 0 && (
            <p className="muted small">
              {L('אין עוד ערכים לשאר הקבוצה במדד הזה — הממוצע יופיע אחרי שתדרגו עוד שחקנים.',
                 'No values for the rest of the team on this metric yet.')}
            </p>
          )}
        </section>

        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3>{L('דירוגים', 'Ratings')}</h3>
            <span className="muted small">
              {readOnly ? L('1–5 · קריאה בלבד', '1–5 · read only') : L('1–5 · לחיצה על אותה נקודה מבטלת', '1–5 · tap the same dot to clear')}
            </span>
          </div>
          {catalog.cats.map((c) => {
            const open = openCat === c.key
            const vals = c.metrics.map((m) => now(m.key)).filter((v) => v > 0)
            const pvals = c.metrics.map((m) => prev(m.key)).filter((v) => v > 0)
            const avgNow = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
            const avgPrev = pvals.length ? pvals.reduce((a, b) => a + b, 0) / pvals.length : 0
            const tvals = cmp ? c.metrics.map((m) => teamAvg(m.key)).filter((v) => v > 0) : []
            const avgTeam = tvals.length ? round1(tvals.reduce((a, b) => a + b, 0) / tvals.length) : 0
            return (
              <div key={c.key} className={open ? 'pd-cat open' : 'pd-cat'}>
                <button type="button" className="pd-cat-h" onClick={() => setOpenCat(open ? '' : c.key)} aria-expanded={open}>
                  <i className="pd-chev" aria-hidden="true" />
                  <b>{c.label}</b>
                  <span className="pd-mini" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((k) => <i key={k} className={k <= Math.round(avgNow) ? 'on' : ''} />)}
                  </span>
                  <span className={`pd-cat-avg ${avgTint(avgNow)}`} dir="ltr">{f1(avgNow)}</span>
                  {avgTeam > 0 && (
                    <span className="pd-teamv" title={L('ממוצע שאר הקבוצה', 'Rest of the team')}>
                      {L('קבוצה', 'team')} <bdi dir="ltr">{avgTeam}</bdi>
                    </span>
                  )}
                  <DeltaChip from={round1(avgPrev)} to={round1(avgNow)} />
                </button>
                {open && (
                  <ul className="pd-metrics">
                    {c.metrics.map((m) => (
                      <li key={m.key} className="pd-metric">
                        <span className="pd-metric-k">{m.label}</span>
                        <Dots value={now(m.key)} name={m.label} canClear={hasOn(E[m.key], onDate)} readOnly={readOnly}
                          onChange={(v) => setValue(pid, m.key, v, rosterRow.id)} />
                        <b className={now(m.key) ? 'pd-mval' : 'pd-mval none'} dir="ltr">{now(m.key) || '—'}</b>
                        {cmp && teamAvg(m.key) > 0 ? (
                          <span className="pd-teamv" title={L('ממוצע שאר הקבוצה', 'Rest of the team')}>
                            {L('קבוצה', 'team')} <bdi dir="ltr">{teamAvg(m.key)}</bdi>
                          </span>
                        ) : null}
                        <DeltaChip from={prev(m.key)} to={now(m.key)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </section>

        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3>{L('רקע ושיחות', 'Background & talks')}</h3>
            {!readOnly && (
              <button type="button" className="btn-soft pd-add" onClick={() => setNoteOpen((v) => !v)}>
                {noteOpen ? L('סגירה', 'Close') : <><Plus size={15} /> {L('רשומה חדשה', 'New entry')}</>}
              </button>
            )}
          </div>
          {noteOpen && (
            <div className="pd-note-new">
              <div className="chips">
                {NOTE_KINDS.map((n) => (
                  <button key={n.k} type="button" className={noteKind === n.k ? 'chip selected' : 'chip'}
                    onClick={() => setNoteKind(n.k)}>{kindLabel(n.k)}</button>
                ))}
              </div>
              <textarea className="finder-input" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)}
                placeholder={L('מה קרה, מה נאמר, מה לעשות הלאה…', 'What happened, what was said, what next…')} maxLength={4000} />
              <div className="form-actions">
                <button type="button" className="btn-primary" onClick={addNote} disabled={!noteText.trim()}>{L('שמירה', 'Save')}</button>
                <button type="button" className="btn-ghost" onClick={() => { setNoteOpen(false); setNoteText('') }}>{L('ביטול', 'Cancel')}</button>
              </div>
            </div>
          )}
          {notes.length === 0 ? (
            <p className="muted small">
              {L('עוד לא נכתב כלום. כאן נשמר הרקע: משפחה, פציעות עבר, שיחות אישיות — מה שלא נכנס לדירוג.',
                 'Nothing written yet. Background lives here: family, past injuries, personal talks.')}
            </p>
          ) : (
            <ul className="pd-notes">
              {notes.map((n) => (
                <li key={n.id} className={`pd-note${n.kind === 'פציעה' ? ' hot' : n.kind === 'שיחה' ? ' talk' : ''}`}>
                  <span className="pd-note-top">
                    <span className="pd-note-kind">{kindLabel(n.kind)}</span>
                    <span className="muted small">
                      <CalendarDays size={12} /> {fmtDate(n.on_date)}
                      {n.coach ? ` · ${[n.coach.first_name, n.coach.last_name].filter(Boolean).join(' ')}` : ''}
                    </span>
                    {!readOnly && n.coach_id === me && (
                      <button type="button" className="pd-note-del" onClick={() => delNote(n.id)}>
                        <Trash2 size={13} aria-hidden="true" /> {L('מחיקה', 'Delete')}
                      </button>
                    )}
                  </span>
                  <p>{n.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pd-card pd-card--wide pd-auto">
          <div className="pd-card-h">
            <h3>{L('נאסף לבד מהאפליקציה', 'Collected automatically')}</h3>
            <span className="muted small">{L('בלי להקליד כלום', 'Nothing to type')}</span>
          </div>
          <div className="pd-auto-row">
            <span className="pd-auto-tile">
              <span className="pd-auto-k">{L('נוכחות', 'Attendance')}</span>
              <b dir="ltr">{auto.attendance != null ? `${auto.attendance}%` : '—'}</b>
              <span className="pd-auto-sub">
                {auto.attendance != null
                  ? <><bdi dir="ltr">{auto.sessions}</bdi> {L('אימונים · איחור נספר כנוכחות', 'sessions · late counts as present')}</>
                  : L('אין עדיין נוכחות רשומה', 'No attendance recorded yet')}
              </span>
            </span>
            <span className="pd-auto-tile">
              <span className="pd-auto-k">{L('עומס מדווח (ממוצע)', 'Reported load (avg)')}</span>
              <b dir="ltr">{auto.effort != null ? `${auto.effort}/10` : '—'}</b>
              <span className="pd-auto-sub">{L('מהדיווח שלו אחרי אימון', 'From his post-practice reports')}</span>
            </span>
            <span className="pd-auto-tile hot">
              <span className="pd-auto-k">{L('משימות שבוצעו', 'Tasks done')}</span>
              <b dir="ltr">{auto.tasks != null ? auto.tasks : '—'}</b>
              <span className="pd-auto-sub">{L('מתוך המשימות שנשלחו לו', 'Out of the tasks sent to him')}</span>
            </span>
          </div>
        </section>
      </div>

      {/* דף ההדפסה — מוסתר על המסך, וזה מה שיוצא למדפסת (או ל-PDF).
          טבלאות ולא גרפים: דף אחד שאפשר לקחת לשיחה עם ההורים או לארכיון.
          יושב על ה-body בפורטל, כדי שכלל ההדפסה יסתיר את כל השאר בשורה
          אחת — בלי «visibility» ובלי דפים ריקים. */}
      {createPortal(
        <div className="pd-paper">
          <div className="pdp-head">
            <h1>{rosterRow.name}{rosterRow.number ? ` · ${rosterRow.number}` : ''}</h1>
            <span>{[trTeam(rosterRow.team), rosterRow.position, age ? `${age} ${L('שנים', 'yrs')}` : null].filter(Boolean).join(' · ')}</span>
            <span className="pdp-date">{L('נכון ל-', 'As of ')}{fmtDate(onDate)}</span>
          </div>

          {history.length > 1 && (
            <p className="pdp-line">
              <b>{L('השנים בתיק: ', 'Seasons: ')}</b>
              {history.map((h) => `${new Date(h.created_at).getFullYear()} ${trTeam(h.team)}`).join(' · ')}
            </p>
          )}

          {catalog.measures.length > 0 && (
            <table className="pdp-tbl">
              <caption>{L('מדידות', 'Measurements')}</caption>
              <tbody>
                {catalog.measures.map((m) => (
                  <tr key={m.key}>
                    <th scope="row">{m.label}</th>
                    <td dir="ltr">{now(m.key) ? `${now(m.key)} ${m.unit || ''}` : '—'}</td>
                    <td dir="ltr">{teamAvg(m.key) ? `${L('קבוצה', 'team')} ${teamAvg(m.key)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {catalog.cats.map((c) => (
            <table className="pdp-tbl" key={c.key}>
              <caption>{c.label}</caption>
              <tbody>
                {c.metrics.map((m) => (
                  <tr key={m.key}>
                    <th scope="row">{m.label}</th>
                    <td dir="ltr">{now(m.key) ? `${now(m.key)}/5` : '—'}</td>
                    <td dir="ltr">{prev(m.key) ? `${L('קודם', 'prev')} ${prev(m.key)}` : ''}</td>
                    <td dir="ltr">{teamAvg(m.key) ? `${L('קבוצה', 'team')} ${teamAvg(m.key)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

          {Object.keys(auto).length > 0 && (
            <p className="pdp-line">
              <b>{L('נאסף לבד: ', 'Collected automatically: ')}</b>
              {[
                auto.attendance != null ? `${L('נוכחות (איחור נספר)', 'attendance (late counts)')} ${auto.attendance}%` : null,
                auto.effort != null ? `${L('עומס מדווח', 'reported load')} ${auto.effort}/10` : null,
                auto.tasks != null ? `${L('משימות שבוצעו', 'tasks done')} ${auto.tasks}` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}

          {notes.length > 0 && (
            <div className="pdp-notes">
              <h2>{L('רקע ושיחות', 'Background & talks')}</h2>
              {notes.map((n) => (
                <p key={n.id}><b>{kindLabel(n.kind)} · {fmtDate(n.on_date)}</b> {n.content}</p>
              ))}
            </div>
          )}

            <p className="pdp-foot">
              {L('תיק שחקן · CourtSide — מסמך פרטי של הצוות המקצועי.', 'Player dossier · CourtSide — private staff document.')}
            </p>
        </div>,
        document.body
      )}
    </div>
  )
}

// =====================================================================
//  2. סבב דירוג — כל הקטגוריות, מסך אחד בכל פעם
// =====================================================================
function RatingRound({ team, teamRoster, catalog, personByRoster, ensurePerson, entries, loadEntriesFor, setValue, onDate }) {
  // «לפי קטגוריה» (ברירת המחדל — כך ממלאים סבב מהר ועקבי) או «לפי שחקן»
  const [mode, setMode] = useState('metric')
  const [roundCat, setRoundCat] = useState(catalog.cats[0]?.key || '')
  const [roundRid, setRoundRid] = useState(teamRoster[0]?.id || null)
  const [prep, setPrep] = useState(true)
  const [pids, setPids] = useState({}) // rosterId -> personId (נבנה כאן, לא תלוי ב-prop)
  const metrics = useMemo(
    () => catalog.cats.flatMap((c) => c.metrics.map((m) => ({ ...m, catLabel: c.label }))),
    [catalog]
  )

  // פותחים תיק לכל הסגל פעם אחת, כדי שכל לחיצה תישמר מיד
  useEffect(() => {
    let alive = true
    ;(async () => {
      setPrep(true)
      const ids = []
      const map = {}
      for (const r of teamRoster) {
        const pid = personByRoster[r.id] || (await ensurePerson(r.id))
        if (pid) { ids.push(pid); map[r.id] = pid }
      }
      if (!alive) return
      setPids(map)
      await loadEntriesFor(ids)
      if (alive) setPrep(false)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, teamRoster.length])

  const isToday = onDate === api.today()
  const pidOf = (r) => pids[r.id] || personByRoster[r.id]
  const seriesOf = (r, key) => (entries[pidOf(r)] || {})[key]
  const valOf = (r, key) => atDate(seriesOf(r, key), onDate).cur
  // «הושלם» = יש ערך **לתאריך הנבחר** (לא ערך שנגרר מסבב קודם)
  const doneToday = (r, key) => hasOn(seriesOf(r, key), onDate)
  const mean = (arr) => { const g = arr.filter((x) => x > 0); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0 }

  if (prep) return <SkeletonCards count={1} lines={6} />
  if (!metrics.length) {
    return (
      <div className="empty-state">
        <span className="empty-ic"><ListChecks size={26} /></span>
        <div className="empty-title">{L('אין קטגוריות בקטלוג', 'No categories in the catalog')}</div>
        <p className="muted small">
          {L('מנהל המועדון מפעיל קטגוריות בטאב «הקטלוג» — בלעדיהן אין מה לדרג.',
             'The club manager enables categories under “Catalog” — without them there is nothing to rate.')}
        </p>
      </div>
    )
  }

  const byCat = mode === 'metric'
  const cat = catalog.cats.find((c) => c.key === roundCat) || catalog.cats[0]
  const player = teamRoster.find((r) => r.id === roundRid) || teamRoster[0]

  // הבלוקים: לפי קטגוריה — בלוק לכל שחקן; לפי שחקן — בלוק לכל קטגוריה
  const blocks = byCat
    ? teamRoster.map((r) => ({
        id: r.id, badge: r.number || '·', title: r.name, sub: r.position || '',
        avg: mean(cat.metrics.map((m) => valOf(r, m.key))),
        rows: cat.metrics.map((m) => ({ r, m })),
      }))
    : catalog.cats.map((c) => ({
        id: c.key, badge: String(c.metrics.length), title: c.label, sub: '',
        avg: mean(c.metrics.map((m) => valOf(player, m.key))),
        rows: c.metrics.map((m) => ({ r: player, m })),
      }))
  const pairs = blocks.flatMap((b) => b.rows)
  const done = pairs.filter(({ r, m }) => doneToday(r, m.key)).length

  return (
    <div className="pd pd-round">
      <div className="pd-card pd-round-top">
        <span className="pd-round-tx">
          <b>{L('סבב דירוג', 'Rating round')} · {trTeam(team)}</b>
          <span className="muted small">
            {byCat
              ? L('קטגוריה אחת, כל הסגל — כך ממלאים סבב מהר ועקבי.', 'One category, the whole squad — fast and consistent.')
              : L('שחקן אחד, כל הקטגוריות.', 'One player, every category.')}
            {' '}{isToday ? L('נשמר לתאריך של היום.', 'Saved under today’s date.') : L(`נשמר לתאריך ${fmtDate(onDate)}.`, `Saved under ${fmtDate(onDate)}.`)}
          </span>
        </span>
        <span className="pd-round-prog" role="status">
          {L(`דורגו ${done} מתוך ${pairs.length}`, `${done} of ${pairs.length} rated`)}
        </span>
        <span className="pd-mode" role="group" aria-label={L('כיוון העבודה', 'Working direction')}>
          <button type="button" className={byCat ? 'pd-mode-btn on' : 'pd-mode-btn'} aria-pressed={byCat} onClick={() => setMode('metric')}>
            {L('לפי קטגוריה', 'By category')}
          </button>
          <button type="button" className={!byCat ? 'pd-mode-btn on' : 'pd-mode-btn'} aria-pressed={!byCat} onClick={() => setMode('player')}>
            {L('לפי שחקן', 'By player')}
          </button>
        </span>
      </div>

      <div className="pd-round-sel" role="tablist" aria-label={byCat ? L('קטגוריה', 'Category') : L('שחקן', 'Player')}>
        {byCat
          ? catalog.cats.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={c.key === cat.key}
                className={c.key === cat.key ? 'pd-pill on' : 'pd-pill'} onClick={() => setRoundCat(c.key)}>{c.label}</button>
            ))
          : teamRoster.map((r) => (
              <button key={r.id} type="button" role="tab" aria-selected={r.id === player.id}
                className={r.id === player.id ? 'pd-pill on' : 'pd-pill'} onClick={() => setRoundRid(r.id)}>
                {r.number ? `${r.number} · ` : ''}{r.name}
              </button>
            ))}
      </div>

      <div className="pd-round-grid">
        {blocks.map((b) => (
          <section key={b.id} className="pd-card pd-block">
            <span className="pd-block-h">
              <i className="pd-badge" dir="ltr">{b.badge}</i>
              <b>{b.title}</b>
              <span className={`pd-cat-avg ${avgTint(b.avg)}`} dir="ltr">{f1(b.avg)}</span>
            </span>
            {b.rows.map(({ r, m }) => (
              <div key={m.key} className={doneToday(r, m.key) ? 'pd-metric is-new' : 'pd-metric'}>
                <span className="pd-metric-k">{m.label}</span>
                <Dots value={valOf(r, m.key)} name={`${r.name} · ${m.label}`} canClear={doneToday(r, m.key)}
                  onChange={(v) => setValue(pidOf(r), m.key, v, r.id)} />
                <b className={valOf(r, m.key) ? 'pd-mval' : 'pd-mval none'} dir="ltr">{valOf(r, m.key) || '—'}</b>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

// =====================================================================
//  3. מי רואה את התיקים
// =====================================================================
const ROLE_LABEL = {
  club_manager: {
    he: 'מנהל מועדון', en: 'Club manager',
    seesHe: 'רואה את התיקים של כל המאמנים שצורפו למועדון', seesEn: 'Sees the dossiers of every coach added to the club',
  },
  technical_director: {
    he: 'מנהל מקצועי', en: 'Technical director',
    seesHe: 'רואה את התיקים של המאמנים שצורפו למועדון', seesEn: 'Sees the dossiers of the coaches added to the club',
  },
  coach: {
    he: 'מאמן', en: 'Coach',
    seesHe: 'רואה את התיקים של הקבוצות שהוא מאמן', seesEn: 'Sees the dossiers of the teams they coach',
  },
}

function Access({ me, club, team, rosterRow, personByRoster, ensurePerson }) {
  const [roles, setRoles] = useState([])
  const [access, setAccess] = useState([])
  const [coaches, setCoaches] = useState([])
  const [pickOpen, setPickOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [retry, setRetry] = useState(0)
  const [personId, setPersonId] = useState(personByRoster[rosterRow?.id] || null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const pid = personByRoster[rosterRow?.id] || (rosterRow ? await ensurePerson(rosterRow.id) : null)
      if (!alive) return
      setPersonId(pid)
      const [r, c, a] = await Promise.all([
        api.loadClubRoles(club),
        api.loadClubCoaches(club, me),
        pid ? api.loadAccess(pid) : Promise.resolve({ access: [] }),
      ])
      if (!alive) return
      // מסך שמבטיח «אף אחד אחר לא רואה» חייב לדעת שהוא באמת בדק.
      // שאילתה שנכשלה החזירה עד היום רשימה ריקה — כלומר הבטחה על סמך
      // כלום. רשימת המאמנים לצירוף (c) היא נוחות בלבד ולכן רכה.
      const bad = r.error || a.error
      if (bad) { setErr(bad.message); setLoading(false); return }
      setErr(null)
      setRoles(r.roles || [])
      setCoaches(c.coaches || [])
      setAccess(a.access || [])
      setLoading(false)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club, rosterRow?.id, retry])

  const manager = roles.find((r) => r.role === 'club_manager')
  const director = roles.find((r) => r.role === 'technical_director')
  const iAmInTree = roles.some((r) => r.user_id === me && r.role === 'coach')
  const iAmManager = roles.some((r) => r.user_id === me && r.role === 'club_manager')

  const grant = async (coach) => {
    if (!personId) return
    const { error } = await api.grantAccess({ personId, coachId: coach.id, level: 'view', byId: me })
    if (error) { toast.error(L('מתן הגישה נכשל: ', 'Grant failed: ') + error.message); return }
    setAccess((cur) => [...cur.filter((x) => x.coach_id !== coach.id), { coach_id: coach.id, level: 'view', name: coach.name }])
    setPickOpen(false)
    toast.success(L(`${coach.name} רואה מעכשיו את התיק`, `${coach.name} can now see this dossier`))
  }
  // «צפייה» או «צפייה ועריכה». עריכה = הוא יכול לשנות דירוגים ולכתוב
  // רשומות בתיק, ולכן שואלים לפני — הסרה חזרה לצפייה היא לחיצה אחת.
  const setLevel = async (row, level) => {
    if (row.level === level) return
    if (level === 'edit') {
      const ok = await confirmDialog({
        title: L(`לתת ל${row.name} גם לערוך?`, `Let ${row.name} edit too?`),
        message: L('הוא יוכל לשנות דירוגים, להוסיף מדידות ולכתוב רשומות בתיק הזה. אפשר להחזיר ל«צפייה» בכל רגע.',
                   'They will be able to change ratings, add measurements and write entries in this dossier. You can switch back to “View” at any time.'),
        confirmText: L('כן, גם עריכה', 'Yes, allow editing'),
      })
      if (!ok) return
    }
    const { error } = await api.grantAccess({ personId, coachId: row.coach_id, level, byId: me })
    if (error) { toast.error(L('העדכון נכשל: ', 'Update failed: ') + error.message); return }
    setAccess((cur) => cur.map((x) => (x.coach_id === row.coach_id ? { ...x, level } : x)))
  }
  const revoke = async (row) => {
    const { error } = await api.revokeAccess({ personId, coachId: row.coach_id })
    if (error) { toast.error(L('ההסרה נכשלה', 'Remove failed')); return }
    setAccess((cur) => cur.filter((x) => x.coach_id !== row.coach_id))
  }

  if (loading) return <SkeletonCards count={2} lines={4} />
  if (err) return <ErrorState message={err} onRetry={() => setRetry((n) => n + 1)} />

  const seers = [L('אתה', 'you')]
  if (manager && manager.user_id !== me && iAmInTree) seers.push(`${manager.name} (${L('מנהל המועדון', 'club manager')})`)
  if (director && director.user_id !== me && iAmInTree) seers.push(`${director.name} (${L('מנהל מקצועי', 'technical director')})`)
  for (const a of access) seers.push(a.name)

  return (
    <div className="pd">
      <header className="pd-head">
        <div className="pd-head-tx">
          <h2 className="pd-name">{L('מי רואה את התיקים', 'Who sees the dossiers')}</h2>
          <span className="pd-meta">{L('התשובה במשפט אחד, ואחר כך הפירוט.', 'The answer in one line, then the details.')}</span>
        </div>
      </header>

      <div className="pd-answer">
        <Lock size={18} aria-hidden="true" />
        <p>
          {L('את התיקים של ', 'The dossiers of ')}<b>{trTeam(team)}</b>
          {L(' רואים כרגע: ', ' are currently seen by: ')}
          <b>{seers.join(', ')}</b>{'. '}
          <span className="pd-answer-no">{L('אף אחד אחר — ולא השחקנים או ההורים.', 'Nobody else — and not the players or parents.')}</span>
        </p>
      </div>

      <div className="pd-grid">
        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3><Shield size={16} /> {L('הסדר במועדון', 'The order in the club')}{club ? ` · ${club}` : ''}</h3>
          </div>
          {!club ? (
            <p className="muted small">
              {L('לא הגדרת מועדון בפרופיל, ולכן אין מבנה — התיקים שלך פרטיים לחלוטין.',
                 'No club in your profile, so there is no structure — your dossiers are fully private.')}
            </p>
          ) : (
            <ol className="pd-levels">
              {['club_manager', 'technical_director', 'coach'].map((key, i) => {
                const lbl = ROLE_LABEL[key]
                const holders = roles.filter((r) => r.role === key)
                const mine = holders.some((h) => h.user_id === me)
                return (
                  <li key={key} className={mine ? 'pd-level me' : 'pd-level'}>
                    <span className="pd-level-n" aria-hidden="true">{i + 1}</span>
                    <span className="pd-level-tx">
                      <b>{L(lbl.he, lbl.en)}</b>
                      {holders.length ? (
                        <span className="pd-level-who">
                          {holders.map((h) => h.name + (h.user_id === me ? L(' (אתה)', ' (you)') : '')).join(' · ')}
                        </span>
                      ) : (
                        <span className="pd-level-who empty">{L('עוד לא מונה אף אחד', 'Nobody appointed yet')}</span>
                      )}
                      <span className="pd-level-sees"><Eye size={13} /> {L(lbl.seesHe, lbl.seesEn)}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="muted small pd-tree-note">
            {L('מנהל המועדון ממנה מנהל מקצועי ומצרף מאמנים. מאמן שלא צורף — התיקים שלו פרטיים לחלוטין, גם אם רשם את שם המועדון בפרופיל.',
               'The club manager appoints the technical director and adds coaches. A coach who was not added keeps fully private dossiers.')}
          </p>
        </section>

        <section className="pd-card">
          <div className="pd-card-h"><h3>{L('המצב שלך', 'Your status')}</h3></div>
          <div className={iAmInTree || iAmManager ? 'pd-status in' : 'pd-status out'}>
            {iAmInTree || iAmManager ? <Check size={18} /> : <X size={18} />}
            <div>
              <b>
                {iAmManager
                  ? L('אתה מנהל המועדון', 'You are the club manager')
                  : iAmInTree
                    ? L(`צורפת ל${club}`, `You were added to ${club}`)
                    : L('לא צורפת למועדון', 'You were not added to a club')}
              </b>
              <span>
                {iAmInTree || iAmManager
                  ? L('לכן המנהלים במועדון רואים את התיקים שלך.', 'That is why the club managers can see your dossiers.')
                  : L('התיקים שלך פרטיים לחלוטין — אף מנהל לא רואה אותם, עד שמנהל המועדון יצרף אותך.',
                       'Your dossiers are fully private — no manager sees them until the club manager adds you.')}
              </span>
            </div>
          </div>
        </section>

        <section className="pd-card">
          <div className="pd-card-h">
            <h3>{L('גישה לתיק של ', 'Access to ')}{rosterRow?.name || '—'}</h3>
            <button type="button" className="btn-soft pd-add" onClick={() => setPickOpen((v) => !v)}>
              <Plus size={15} /> {L('מתן גישה', 'Grant access')}
            </button>
          </div>
          {pickOpen && (
            <div className="pd-note-new">
              {coaches.length === 0 ? (
                <p className="muted small">{L('אין מאמנים אחרים מהמועדון שלך באפליקציה.', 'No other coaches from your club use the app yet.')}</p>
              ) : (
                <div className="chips">
                  {coaches.map((c) => (
                    <button key={c.id} type="button" className="chip" onClick={() => grant(c)}>
                      <UserPlus size={13} /> {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <ul className="pd-grants">
            <li><b>{L('אתה', 'You')}</b> <span className="pd-grant-lvl owner">{L('בעל התיק', 'Owner')}</span></li>
            {manager && manager.user_id !== me && iAmInTree && (
              <li><i className="pd-ini">{initials(manager.name)}</i><b>{manager.name}</b> <span className="pd-grant-lvl auto">{L('לפי המבנה — מנהל מועדון', 'By structure — club manager')}</span></li>
            )}
            {access.map((a) => (
              <li key={a.coach_id}>
                <i className="pd-ini">{initials(a.name)}</i>
                <b>{a.name}</b>
                <span className="pd-lvl" role="group" aria-label={L(`רמת הגישה של ${a.name}`, `${a.name}’s access level`)}>
                  <button type="button" className={a.level === 'edit' ? 'pd-lvl-b' : 'pd-lvl-b on'}
                    aria-pressed={a.level !== 'edit'} onClick={() => setLevel(a, 'view')}>
                    <Eye size={13} aria-hidden="true" /> {L('צפייה', 'View')}
                  </button>
                  <button type="button" className={a.level === 'edit' ? 'pd-lvl-b on' : 'pd-lvl-b'}
                    aria-pressed={a.level === 'edit'} onClick={() => setLevel(a, 'edit')}>
                    <Check size={13} aria-hidden="true" /> {L('גם עריכה', 'Edit too')}
                  </button>
                </span>
                <button type="button" className="link-button danger" onClick={() => revoke(a)}>{L('הסרה', 'Remove')}</button>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {L('הגישה היא לתיק של השחקן הזה בלבד — לא לכל הקבוצה.', 'Access is for this player’s dossier only — not the whole team.')}
          </p>
        </section>
      </div>
    </div>
  )
}

// =====================================================================
//  4. הקטלוג — מה מדרגים במועדון (מנהל מועדון בלבד)
// =====================================================================
// ברירת המחדל (20 המדדים) גלובלית ומשותפת לכל המועדונים. מועדון לא משנה
// אותה — הוא מוסיף «שורת מועדון» עם אותו key, וזו דורסת אצלו בלבד. לכן
// «חזרה לברירת המחדל» היא פשוט מחיקת שורת המועדון.
function CatalogEditor({ club, rows, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)      // { m, label }
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState({ label: '', cat: '', newCat: '', kind: 'rating', unit: '', lower: false })

  // אותו מיזוג שב-loadCatalog — אבל בלי לסנן כבויים, כי כאן מנהלים גם אותם
  const merged = useMemo(() => {
    const byKey = new Map()
    for (const r of rows) {
      const cur = byKey.get(r.key)
      if (!cur || (r.club && !cur.club)) byKey.set(r.key, r)
    }
    return [...byKey.values()].sort((a, b) => (a.sort || 0) - (b.sort || 0))
  }, [rows])
  const globalKeys = useMemo(() => new Set(rows.filter((r) => !r.club).map((r) => r.key)), [rows])
  const cats = useMemo(() => {
    const out = []
    for (const m of merged) {
      let c = out.find((x) => x.key === m.cat)
      if (!c) { c = { key: m.cat, label: m.cat_label, metrics: [] }; out.push(c) }
      c.metrics.push(m)
    }
    return out
  }, [merged])

  // כתיבה: על שורת מועדון — עדכון; על שורה גלובלית — יצירת שורת מועדון
  const write = async (m, fields) => {
    setBusy(true)
    const res = m.club
      ? await api.saveClubMetric({ id: m.id, ...fields })
      : await api.saveClubMetric({
          club, key: m.key, label: m.label, cat: m.cat, cat_label: m.cat_label,
          kind: m.kind, unit: m.unit, lower_is_better: m.lower_is_better,
          sort: m.sort, active: m.active, ...fields,
        })
    setBusy(false)
    if (res.error) { toast.error(L('השמירה נכשלה: ', 'Save failed: ') + res.error.message); return false }
    onSaved()
    return true
  }

  const rename = async () => {
    const label = (edit?.label || '').trim()
    if (!label) return
    if (await write(edit.m, { label })) { setEdit(null); toast.success(L('השם עודכן', 'Renamed')) }
  }

  const toggle = async (m) => {
    if (m.active) {
      const ok = await confirmDialog({
        title: L(`להסתיר את «${m.label}»?`, `Hide “${m.label}”?`),
        message: L('המדד ייעלם ממסכי הדירוג של כל המאמנים במועדון. הדירוגים שכבר נרשמו נשמרים, ויחזרו ברגע שתחזירו אותו.',
                   'It disappears from the rating screens of every coach in the club. Existing ratings are kept and return if you re-enable it.'),
        confirmText: L('הסתרה', 'Hide'),
      })
      if (!ok) return
    }
    await write(m, { active: !m.active })
  }

  const reset = async (m) => {
    const ok = await confirmDialog({
      title: L('לחזור לברירת המחדל?', 'Back to the default?'),
      message: L(`«${m.label}» יחזור לשם ולהגדרה המקוריים של המערכת.`, `“${m.label}” returns to the original name and settings.`),
      confirmText: L('חזרה לברירת המחדל', 'Restore default'),
    })
    if (!ok) return
    setBusy(true)
    const { error } = await api.deleteClubMetric(m.id)
    setBusy(false)
    if (error) { toast.error(L('הפעולה נכשלה: ', 'Failed: ') + error.message); return }
    onSaved()
  }

  const remove = async (m) => {
    const ok = await confirmDialog({
      title: L(`למחוק את «${m.label}»?`, `Delete “${m.label}”?`),
      message: L('המדד יימחק מהקטלוג של המועדון. דירוגים שכבר נרשמו נשמרים במסד אך לא יוצגו יותר.',
                 'The metric is removed from the club catalog. Existing ratings stay in the database but are no longer shown.'),
      confirmText: L('מחיקה', 'Delete'), danger: true,
    })
    if (!ok) return
    setBusy(true)
    const { error } = await api.deleteClubMetric(m.id)
    setBusy(false)
    if (error) { toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message); return }
    onSaved()
  }

  const add = async () => {
    const label = draft.label.trim()
    const isNewCat = draft.cat === '__new'
    const catLabel = (isNewCat ? draft.newCat : cats.find((c) => c.key === draft.cat)?.label || '').trim()
    if (!label || !catLabel) {
      toast.error(L('צריך שם למדד ותחום שהוא שייך אליו', 'A name and an area are required'))
      return
    }
    const sort = (merged.length ? Math.max(...merged.map((m) => m.sort || 0)) : 0) + 10
    setBusy(true)
    const res = await api.saveClubMetric({
      club,
      key: api.newMetricKey(),
      label,
      cat: isNewCat ? `c_${api.newMetricKey().slice(2)}` : draft.cat,
      cat_label: catLabel,
      kind: draft.kind,
      unit: draft.kind === 'number' ? (draft.unit.trim() || null) : null,
      lower_is_better: draft.kind === 'number' ? !!draft.lower : false,
      sort,
      active: true,
    })
    setBusy(false)
    if (res.error) { toast.error(L('ההוספה נכשלה: ', 'Failed to add: ') + res.error.message); return }
    setDraft({ label: '', cat: '', newCat: '', kind: 'rating', unit: '', lower: false })
    setAddOpen(false)
    onSaved()
    toast.success(L('המדד נוסף לקטלוג', 'Added to the catalog'))
  }

  return (
    <div className="pd">
      <header className="pd-head">
        <div className="pd-head-tx">
          <h2 className="pd-name">{L('הקטלוג של ', 'The catalog of ')}{club}</h2>
          <span className="pd-meta">
            {L('מה מדרגים בתיקים — לכל המאמנים שצורפו למועדון. שינוי כאן משנה את המסכים שלהם.',
               'What gets rated in the dossiers — for every coach added to the club. A change here changes their screens.')}
          </span>
        </div>
        <button type="button" className="btn-soft pd-add" onClick={() => setAddOpen((v) => !v)}>
          <Plus size={15} aria-hidden="true" /> {L('מדד חדש', 'New metric')}
        </button>
      </header>

      <p className="pd-cat-note" role="note">
        <SlidersHorizontal size={15} aria-hidden="true" />
        {L('שינוי שם או הסתרה לא מוחקים דירוגים ישנים — הם רק משנים את מה שרואים מעכשיו. ההשוואה בין שנים נשארת אמינה כל עוד לא משנים את המשמעות של מדד קיים.',
           'Renaming or hiding never deletes past ratings — it only changes what is shown from now on.')}
      </p>

      {addOpen && (
        <div className="pd-note-new pd-cat-add">
          <label>
            {L('שם המדד', 'Metric name')}
            <input className="finder-input" value={draft.label} maxLength={40} autoFocus
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder={L('למשל: הגנת פיק־אנד־רול', 'e.g. Pick-and-roll defense')} />
          </label>
          <label>
            {L('התחום', 'Area')}
            <select className="finder-input" value={draft.cat} onChange={(e) => setDraft((d) => ({ ...d, cat: e.target.value }))}>
              <option value="">{L('בחרו תחום…', 'Pick an area…')}</option>
              {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              <option value="__new">{L('תחום חדש…', 'New area…')}</option>
            </select>
          </label>
          {draft.cat === '__new' && (
            <label>
              {L('שם התחום החדש', 'New area name')}
              <input className="finder-input" value={draft.newCat} maxLength={30}
                onChange={(e) => setDraft((d) => ({ ...d, newCat: e.target.value }))} />
            </label>
          )}
          <div className="chips">
            <button type="button" className={draft.kind === 'rating' ? 'chip selected' : 'chip'}
              onClick={() => setDraft((d) => ({ ...d, kind: 'rating' }))}>{L('דירוג 1–5', 'Rating 1–5')}</button>
            <button type="button" className={draft.kind === 'number' ? 'chip selected' : 'chip'}
              onClick={() => setDraft((d) => ({ ...d, kind: 'number' }))}>{L('מדידה במספר', 'Measurement')}</button>
          </div>
          {draft.kind === 'number' && (
            <>
              <label>
                {L('יחידה', 'Unit')}
                <input className="finder-input" value={draft.unit} maxLength={10}
                  onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                  placeholder={L('ס״מ / שנ׳ / ק״ג', 'cm / sec / kg')} />
              </label>
              <label className="pd-cat-lower">
                <input type="checkbox" checked={draft.lower}
                  onChange={(e) => setDraft((d) => ({ ...d, lower: e.target.checked }))} />
                {L('מספר נמוך יותר = טוב יותר (כמו ריצת 20 מ׳)', 'Lower is better (like a 20m sprint)')}
              </label>
            </>
          )}
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={add} disabled={busy || !draft.label.trim()}>
              {L('הוספה', 'Add')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>{L('ביטול', 'Cancel')}</button>
          </div>
        </div>
      )}

      {cats.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><SlidersHorizontal size={26} /></span>
          <div className="empty-title">{L('הקטלוג ריק', 'The catalog is empty')}</div>
          <p className="muted small">{L('מוסיפים מדד ראשון בכפתור «מדד חדש».', 'Add the first metric with “New metric”.')}</p>
        </div>
      ) : (
        <div className="pd-grid">
          {cats.map((c) => (
            <section className="pd-card pd-card--wide" key={c.key}>
              <div className="pd-card-h">
                <h3>{c.label}</h3>
                <span className="muted small">
                  <bdi dir="ltr">{c.metrics.filter((m) => m.active).length}/{c.metrics.length}</bdi> {L('מוצגים', 'shown')}
                </span>
              </div>
              <ul className="pd-cat-list">
                {c.metrics.map((m) => {
                  const overridden = !!m.club && globalKeys.has(m.key)
                  const own = !!m.club && !globalKeys.has(m.key)
                  const editing = edit?.m?.key === m.key
                  return (
                    <li key={m.key} className={m.active ? 'pd-cat-row' : 'pd-cat-row off'}>
                      {editing ? (
                        <>
                          <input className="finder-input" value={edit.label} maxLength={40} autoFocus
                            onChange={(e) => setEdit((cur) => ({ ...cur, label: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') rename() }}
                            aria-label={L('שם המדד', 'Metric name')} />
                          <button type="button" className="btn-primary" onClick={rename} disabled={busy}>{L('שמירה', 'Save')}</button>
                          <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>{L('ביטול', 'Cancel')}</button>
                        </>
                      ) : (
                        <>
                          <span className="pd-cat-nm">
                            {m.label}
                            <span className="pd-cat-kind">
                              {m.kind === 'number' ? (m.unit || L('מספר', 'number')) : '1–5'}
                            </span>
                            {overridden && <span className="pd-cat-tag">{L('שונה במועדון', 'Club change')}</span>}
                            {own && <span className="pd-cat-tag own">{L('של המועדון', 'Club metric')}</span>}
                            {!m.active && <span className="pd-cat-tag off">{L('מוסתר', 'Hidden')}</span>}
                          </span>
                          <button type="button" className="link-button" disabled={busy}
                            onClick={() => setEdit({ m, label: m.label })}>{L('שינוי שם', 'Rename')}</button>
                          <button type="button" className="link-button" disabled={busy} onClick={() => toggle(m)}>
                            {m.active
                              ? <><EyeOff size={13} aria-hidden="true" /> {L('הסתרה', 'Hide')}</>
                              : <><Eye size={13} aria-hidden="true" /> {L('הצגה', 'Show')}</>}
                          </button>
                          {overridden && (
                            <button type="button" className="link-button" disabled={busy} onClick={() => reset(m)}>
                              <RotateCcw size={13} aria-hidden="true" /> {L('ברירת מחדל', 'Default')}
                            </button>
                          )}
                          {own && (
                            <button type="button" className="link-button danger" disabled={busy} onClick={() => remove(m)}>
                              <Trash2 size={13} aria-hidden="true" /> {L('מחיקה', 'Delete')}
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================================
//  5. המועדון — הצוות, ומי רואה את מי (מנהל מועדון / מנהל מקצועי)
// =====================================================================
// מה שהיה עד היום שורת SQL: צירוף מאמן לעץ ומינוי מנהל מקצועי. המדיניות
// במסד (club_roles_manager) מתירה למנהל המועדון להוסיף/להסיר 'coach' ו-
// 'technical_director' במועדון שלו — ולא מנהלי מועדון נוספים, שזה של
// אדמין המערכת בלבד. המסך לא ממציא הרשאה, הוא רק נותן לה כפתור.
function ClubManage({ me, club, iAmManager, onBrowse }) {
  const [roles, setRoles] = useState([])
  const [coaches, setCoaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, c] = await Promise.all([api.loadClubRoles(club), api.loadClubCoaches(club, me)])
    if (r.error) { setErr(r.error.message); setLoading(false); return }
    setRoles(r.roles || [])
    setCoaches(c.coaches || [])
    setErr(null)
    setLoading(false)
  }, [club, me])
  useEffect(() => { load() }, [load])

  const managers = roles.filter((r) => r.role === 'club_manager')
  const director = roles.find((r) => r.role === 'technical_director')
  const inTree = roles.filter((r) => r.role === 'coach')
  // מאמנים במועדון שעדיין לא בעץ — הרשימה לצירוף
  const free = coaches.filter((c) => !roles.some((r) => r.user_id === c.id))

  const add = async (userId, role) => {
    setBusy(true)
    const { error } = await api.addClubRole({ club, userId, role, byId: me })
    setBusy(false)
    if (error) { toast.error(L('הצירוף נכשל: ', 'Failed: ') + error.message); return }
    setAddOpen(false)
    toast.success(role === 'coach' ? L('המאמן צורף למועדון', 'Coach added') : L('המנהל המקצועי מונה', 'Technical director appointed'))
    load()
  }

  const remove = async (row) => {
    const isCoach = row.role === 'coach'
    const ok = await confirmDialog({
      title: isCoach ? L(`להוציא את ${row.name} מהעץ?`, `Remove ${row.name} from the club?`)
                     : L(`לבטל את המינוי של ${row.name}?`, `Remove ${row.name} as technical director?`),
      message: isCoach
        ? L('מאותו רגע התיקים שלו פרטיים לחלוטין — גם אתה לא תראה אותם. שום נתון לא נמחק, והחזרה לעץ מחזירה את התצוגה.',
            'From that moment their dossiers are fully private — you will not see them either. Nothing is deleted; adding them back restores the view.')
        : L('הוא יישאר מאמן במועדון, אבל יפסיק לראות את התיקים של המאמנים האחרים.',
            'They stay a coach in the club but stop seeing the other coaches’ dossiers.'),
      confirmText: L('הסרה', 'Remove'), danger: true,
    })
    if (!ok) return
    setBusy(true)
    const { error } = await api.removeClubRole(row.id)
    setBusy(false)
    if (error) { toast.error(L('ההסרה נכשלה: ', 'Remove failed: ') + error.message); return }
    load()
  }

  if (!club) {
    return (
      <div className="empty-state">
        <span className="empty-ic"><Shield size={26} /></span>
        <div className="empty-title">{L('אין מועדון בפרופיל', 'No club in your profile')}</div>
        <p className="muted small">{L('רושמים את שם המועדון בפרופיל, ואז אפשר לבנות את הצוות.', 'Add your club name in the profile first.')}</p>
      </div>
    )
  }
  if (loading) return <SkeletonCards count={2} lines={4} />
  if (err) return <ErrorState message={err} onRetry={load} />

  return (
    <div className="pd">
      <header className="pd-head">
        <div className="pd-head-tx">
          <h2 className="pd-name">{club}</h2>
          <span className="pd-meta">
            {L('הצוות של המועדון — ומה שכל אחד רואה. מאמן שלא בעץ: התיקים שלו פרטיים לחלוטין.',
               'The club staff — and what each of them sees. A coach outside the tree keeps fully private dossiers.')}
          </span>
        </div>
        {iAmManager && free.length > 0 && (
          <button type="button" className="btn-soft pd-add" onClick={() => setAddOpen((v) => !v)}>
            <UserPlus size={15} aria-hidden="true" /> {L('צירוף מאמן', 'Add a coach')}
          </button>
        )}
      </header>

      {addOpen && (
        <div className="pd-note-new">
          <p className="muted small">
            {L('מאמנים שרשמו את שם המועדון בפרופיל ועוד לא צורפו. צירוף = אתה רואה את התיקים שלו, והוא ממשיך לעבוד כרגיל.',
               'Coaches who wrote this club in their profile and are not in the tree yet.')}
          </p>
          <div className="chips">
            {free.map((c) => (
              <button key={c.id} type="button" className="chip" disabled={busy} onClick={() => add(c.id, 'coach')}>
                <UserPlus size={13} aria-hidden="true" /> {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="pd-grid">
        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3><Shield size={16} aria-hidden="true" /> {L('הנהלה', 'Management')}</h3>
          </div>
          <ul className="pd-grants">
            <li>
              <b>{L('מנהל מועדון', 'Club manager')}</b>
              <span className="pd-grant-lvl auto">
                {managers.length
                  ? managers.map((m) => m.name + (m.user_id === me ? L(' (אתה)', ' (you)') : '')).join(' · ')
                  : L('לא מונה', 'Not appointed')}
              </span>
            </li>
            <li>
              <b>{L('מנהל מקצועי', 'Technical director')}</b>
              {director ? (
                <>
                  <span className="pd-grant-lvl auto">{director.name}{director.user_id === me ? L(' (אתה)', ' (you)') : ''}</span>
                  {iAmManager && (
                    <button type="button" className="link-button danger" disabled={busy} onClick={() => remove(director)}>
                      {L('ביטול מינוי', 'Remove')}
                    </button>
                  )}
                </>
              ) : (
                <span className="pd-grant-lvl">{L('לא מונה', 'Not appointed')}</span>
              )}
            </li>
          </ul>
          <p className="muted small">
            {L('מנהל מועדון נקבע רק בידי מנהל המערכת — זו שורת SQL אחת, ובכוונה. את המנהל המקצועי אתה ממנה מתוך המאמנים שבעץ.',
               'The club manager is set by the system admin only. You appoint the technical director from the coaches in the tree.')}
          </p>
        </section>

        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3><Users size={16} aria-hidden="true" /> {L('המאמנים בעץ', 'Coaches in the tree')}</h3>
            <span className="muted small"><bdi dir="ltr">{inTree.length}</bdi></span>
          </div>
          {inTree.length === 0 ? (
            <p className="muted small">
              {L('עוד לא צורף אף מאמן. עד שתצרף — כל מאמן במועדון עובד לבד, והתיקים שלו פרטיים לחלוטין. זה מצב תקין, לא תקלה.',
                 'No coach added yet. Until you add one, every coach works alone and their dossiers are fully private.')}
            </p>
          ) : (
            <ul className="pd-grants">
              {inTree.map((r) => (
                <li key={r.id}>
                  <i className={r.user_id === me ? 'pd-ini me' : 'pd-ini'}>{initials(r.name)}</i>
                  <b>{r.name}{r.user_id === me ? L(' (אתה)', ' (you)') : ''}</b>
                  <button type="button" className="link-button" onClick={() => onBrowse({ id: r.user_id, name: r.name })}>
                    <FolderOpen size={13} aria-hidden="true" /> {L('התיקים שלו', 'Their dossiers')}
                  </button>
                  {iAmManager && !director?.user_id && r.user_id !== me && (
                    <button type="button" className="link-button" disabled={busy} onClick={() => add(r.user_id, 'technical_director')}>
                      {L('מינוי כמנהל מקצועי', 'Make technical director')}
                    </button>
                  )}
                  {iAmManager && (
                    <button type="button" className="link-button danger" disabled={busy} onClick={() => remove(r)}>
                      {L('הוצאה מהעץ', 'Remove')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            {L('צפייה בתיקים היא קריאה בלבד: הדירוג נשאר של מי שמאמן. אם צריך לתקן — מבקשים מהמאמן, או שהוא נותן גישת «עריכה» במסך «מי רואה».',
               'Browsing is read-only: the rating belongs to the coach. To change one, ask them — or get “edit” access in the “Who sees” screen.')}
          </p>
        </section>
      </div>
    </div>
  )
}
