import { useMemo, useState } from 'react'
import {
  FolderOpen, Users, Ruler, Weight, MoveUp, Timer, StickyNote, Plus, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, Shield, UserPlus, Lock, Eye, Check, X, CalendarDays, Activity,
  ListChecks,
} from 'lucide-react'
// חצי «הבא/הקודם» מתהפכים לפי שפה — אסור לייבא ChevronLeft/Right ישירות
import { ChevronBack as ChevronRight, ChevronFwd as ChevronLeft } from './DirIcon'
import { L } from './i18n'

// «תיק שחקן» — 18.8.2026, **תצוגה מוקדמת על נתוני דוגמה**.
//
// המסך הזה עוד לא מחובר למסד בכלל (בקשת הבעלים: «קודם רק המסכים»).
// המטרה שלו היא להכריע שאלות שאי אפשר להכריע בדיבור:
//   · האם דירוג של 12 שחקנים בסבב אחד הוא עבודה סבירה או עינוי?
//   · כמה קטגוריות זה יותר מדי?
//   · מה באמת רוצים לראות בפתיחת תיק — הגרף, המספרים או הטקסט?
//
// כשהמסכים יאושרו: כל מה שכאן ב-DEMO עובר לטבלאות (person אחד לכל שחקן,
// dossier_metrics לקטלוג, dossier_entries לערכים, dossier_access להרשאות).

// ---------- קטלוג הקטגוריות (ברירת המחדל שהצעתי; כל מועדון יוכל לערוך) ----------
const CATS = [
  {
    key: 'fund', he: 'יסודות', en: 'Fundamentals',
    metrics: [
      { key: 'ball', he: 'שליטה בכדור', en: 'Ball handling' },
      { key: 'pass', he: 'מסירה', en: 'Passing' },
      { key: 'fin', he: 'סיומות', en: 'Finishing' },
      { key: 'shot', he: 'זריקה מבחוץ', en: 'Outside shot' },
      { key: 'ft', he: 'זריקות חופשיות', en: 'Free throws' },
    ],
  },
  {
    key: 'def', he: 'הגנה', en: 'Defense',
    metrics: [
      { key: 'dman', he: 'הגנה 1 על 1', en: 'On-ball defense' },
      { key: 'dhelp', he: 'הגנת עזרה', en: 'Help defense' },
      { key: 'reb', he: 'ריבאונד', en: 'Rebounding' },
    ],
  },
  {
    key: 'mind', he: 'ראש ומחויבות', en: 'Mind & commitment',
    metrics: [
      { key: 'iq', he: 'הבנת משחק', en: 'Game understanding' },
      { key: 'commit', he: 'מחויבות', en: 'Commitment' },
      { key: 'coach', he: 'קשב להדרכה', en: 'Coachability' },
      { key: 'lead', he: 'מנהיגות', en: 'Leadership' },
    ],
  },
  {
    key: 'body', he: 'גוף ואתלטיות', en: 'Body & athleticism',
    metrics: [
      { key: 'ath', he: 'אתלטיות', en: 'Athleticism' },
      { key: 'speed', he: 'מהירות', en: 'Speed' },
      { key: 'endur', he: 'סבולת', en: 'Endurance' },
      { key: 'coord', he: 'קואורדינציה', en: 'Coordination' },
    ],
  },
]
const ALL_METRICS = CATS.flatMap((c) => c.metrics.map((m) => ({ ...m, cat: c.key, catHe: c.he })))

// מדידות (מספרים עם יחידות) — נפרדות מהדירוגים
const MEASURES = [
  { key: 'height', he: 'גובה', en: 'Height', unit: 'ס"מ', unitEn: 'cm', Icon: Ruler },
  { key: 'weight', he: 'משקל', en: 'Weight', unit: 'ק"ג', unitEn: 'kg', Icon: Weight },
  { key: 'jump', he: 'זינוק', en: 'Vertical', unit: 'ס"מ', unitEn: 'cm', Icon: MoveUp },
  { key: 'sprint', he: 'ריצת 20 מ׳', en: '20m sprint', unit: 'שנ׳', unitEn: 'sec', Icon: Timer },
]

// ---------- נתוני דוגמה ----------
const DEMO_DATES = ['2025-10-05', '2026-01-12', '2026-05-20']
const rnd = (seed) => {
  // גנרטור קבוע (בלי Math.random) — אותם נתונים בכל טעינה
  let x = seed * 9301 + 49297
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280 }
}
const DEMO_PLAYERS = [
  { id: 1, name: 'סול בלמן', number: 20, born: 2013, pos: 'רכז' },
  { id: 2, name: 'איתי כהן', number: 7, born: 2013, pos: 'קלע' },
  { id: 3, name: 'יונתן לוי', number: 11, born: 2014, pos: 'כנף' },
  { id: 4, name: 'רועי אברהם', number: 4, born: 2013, pos: 'סנטר' },
  { id: 5, name: 'אורי שגב', number: 9, born: 2014, pos: 'רכז' },
  { id: 6, name: 'נועם ברק', number: 14, born: 2013, pos: 'כנף' },
  { id: 7, name: 'עמית דגן', number: 5, born: 2014, pos: 'קלע' },
  { id: 8, name: 'דניאל אזולאי', number: 23, born: 2013, pos: 'סנטר' },
  { id: 9, name: 'שי מזרחי', number: 8, born: 2014, pos: 'כנף' },
  { id: 10, name: 'תום פרידמן', number: 3, born: 2013, pos: 'רכז' },
  { id: 11, name: 'אלון גל', number: 17, born: 2014, pos: 'כנף' },
  { id: 12, name: 'יובל נחום', number: 12, born: 2013, pos: 'סנטר' },
]
// דירוגים: לכל שחקן, לכל מדד, ערך בכל אחד משלושת התאריכים
const DEMO_RATINGS = (() => {
  const out = {}
  for (const p of DEMO_PLAYERS) {
    const r = rnd(p.id + 3)
    out[p.id] = {}
    for (const m of ALL_METRICS) {
      const base = 2 + Math.round(r() * 2) // 2..4
      const drift = r() > 0.62 ? 1 : 0
      out[p.id][m.key] = [
        base,
        Math.min(5, base + (r() > 0.5 ? drift : 0)),
        Math.min(5, base + drift + (r() > 0.7 ? 1 : 0)),
      ]
    }
  }
  return out
})()
const DEMO_MEASURES = (() => {
  const out = {}
  for (const p of DEMO_PLAYERS) {
    const r = rnd(p.id + 11)
    const h = 148 + Math.round(r() * 22)
    const w = 38 + Math.round(r() * 14)
    const j = 28 + Math.round(r() * 12)
    const s = 3.4 + r() * 0.6
    out[p.id] = {
      height: [h, h + 2, h + 5],
      weight: [w, w + 1, w + 3],
      jump: [j, j + 2, j + 3],
      sprint: [+(s).toFixed(2), +(s - 0.06).toFixed(2), +(s - 0.13).toFixed(2)],
    }
  }
  return out
})()
const DEMO_NOTES = {
  1: [
    { id: 1, on: '2026-05-20', kind: 'שיחה', by: 'אגם', text: 'שיחה על תפקיד הרכז. מבין מה מבקשים ממנו, צריך תזכורות בלחץ.' },
    { id: 2, on: '2026-02-02', kind: 'רקע', by: 'אגם', text: 'אח גדול שיחק בנוער. ההורים מאוד מעורבים, מגיעים לכל משחק.' },
    { id: 3, on: '2025-11-14', kind: 'פציעה', by: 'תמר', text: 'נקע קרסול קל באימון. חזר אחרי שבועיים בלי הגבלה.' },
  ],
}
const DEMO_SEASONS = [
  { season: '2026/27', team: 'נערים ב׳', coach: 'אגם אדירי', current: true },
  { season: '2025/26', team: 'קטסל א׳', coach: 'אגם אדירי' },
  { season: '2024/25', team: 'קטסל ב׳', coach: 'תמר לוי' },
]
const DEMO_AUTO = { att: 88, effort: 4.2, tasks: 14, games: 19 }

const fmtDate = (iso) => {
  const d = new Date(iso + 'T00:00')
  return Number.isNaN(d.getTime()) ? iso : `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`
}
const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0)
const catAvg = (ratings, catKey, dateIdx) => {
  const keys = CATS.find((c) => c.key === catKey).metrics.map((m) => m.key)
  return avg(keys.map((k) => (ratings[k] || [])[dateIdx] || 0))
}

// ---------- «עכביש»: תמונת המצב הנוכחית מול הסבב הקודם ----------
function Radar({ ratings, size = 216 }) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 26
  const pts = (idx) =>
    CATS.map((c, i) => {
      const a = (Math.PI * 2 * i) / CATS.length - Math.PI / 2
      const v = catAvg(ratings, c.key, idx) / 5
      return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v]
    })
  const path = (idx) => pts(idx).map((p) => p.join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="pd-radar" role="img"
      aria-label={L('תמונת מצב לפי תחומים', 'Snapshot by area')}>
      {[1, 0.75, 0.5, 0.25].map((f) => (
        <polygon key={f} points={CATS.map((c, i) => {
          const a = (Math.PI * 2 * i) / CATS.length - Math.PI / 2
          return [cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f].join(',')
        }).join(' ')} className="pd-radar-grid" />
      ))}
      <polygon points={path(1)} className="pd-radar-prev" />
      <polygon points={path(2)} className="pd-radar-now" />
      {CATS.map((c, i) => {
        const a = (Math.PI * 2 * i) / CATS.length - Math.PI / 2
        const x = cx + Math.cos(a) * (r + 16)
        const y = cy + Math.sin(a) * (r + 16)
        return (
          <text key={c.key} x={x} y={y} className="pd-radar-lbl"
            textAnchor={Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'}
            dominantBaseline="middle">
            {L(c.he, c.en)}
          </text>
        )
      })}
    </svg>
  )
}

// ---------- גרף קו לאורך זמן (מדד אחד) ----------
function Trend({ values, dates, unit, lowerIsBetter }) {
  const w = 520
  const h = 132
  const pad = { t: 14, r: 16, b: 26, l: 34 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, values.length - 1)
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / span)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const first = values[0]
  const last = values[values.length - 1]
  const better = lowerIsBetter ? last < first : last > first
  return (
    <div className="pd-trend">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={L('גרף התקדמות', 'Progress chart')}>
        <line x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} className="pd-axis" />
        <path d={line} className={better ? 'pd-line up' : 'pd-line down'} />
        {values.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r="4" className="pd-dot" />
            <text x={x(i)} y={y(v) - 10} className="pd-val" textAnchor="middle">{v}</text>
            <text x={x(i)} y={h - 8} className="pd-tick" textAnchor="middle">{fmtDate(dates[i])}</text>
          </g>
        ))}
      </svg>
      <span className={better ? 'pd-delta up' : 'pd-delta down'}>
        {better ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        <bdi dir="ltr">{(last - first > 0 ? '+' : '') + (Math.round((last - first) * 100) / 100)}</bdi> {unit}
      </span>
    </div>
  )
}

// ---------- חמש הנקודות של הדירוג ----------
function Dots({ value, onChange, name }) {
  return (
    <span className="pd-dots" role="radiogroup" aria-label={name}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}`}
          className={n <= value ? 'pd-dot-btn on' : 'pd-dot-btn'}
          onClick={() => onChange(n === value ? 0 : n)}
        >
          <span />
        </button>
      ))}
    </span>
  )
}

const DeltaIcon = ({ from, to }) => {
  if (to > from) return <span className="pd-chg up" title={L('עלייה', 'Up')}><TrendingUp size={13} /></span>
  if (to < from) return <span className="pd-chg down" title={L('ירידה', 'Down')}><TrendingDown size={13} /></span>
  return <span className="pd-chg flat" title={L('בלי שינוי', 'No change')}><Minus size={13} /></span>
}

// =====================================================================
//  1. תיק שחקן
// =====================================================================
function Dossier({ player, ratings, setRating }) {
  const [openCat, setOpenCat] = useState(CATS[0].key)
  const [trendMetric, setTrendMetric] = useState('fin')
  const [noteOpen, setNoteOpen] = useState(false)
  const notes = DEMO_NOTES[player.id] || DEMO_NOTES[1]
  const measures = DEMO_MEASURES[player.id]
  const age = 2026 - player.born

  const trendIsMeasure = MEASURES.some((m) => m.key === trendMetric)
  const trendValues = trendIsMeasure ? measures[trendMetric] : ratings[trendMetric]
  const trendUnit = trendIsMeasure
    ? L(MEASURES.find((m) => m.key === trendMetric).unit, MEASURES.find((m) => m.key === trendMetric).unitEn)
    : L('נק׳', 'pts')

  return (
    <div className="pd">
      {/* כותרת התיק */}
      <header className="pd-head">
        <span className="pd-num" dir="ltr">{player.number}</span>
        <div className="pd-head-tx">
          <h2 className="pd-name">{player.name}</h2>
          <span className="pd-meta">
            {player.pos} · <bdi dir="ltr">{age}</bdi> {L('שנים', 'yrs')} · {L('נערים ב׳', 'Youth B')}
          </span>
        </div>
        <span className="pd-lock"><Lock size={13} /> {L('סגור — אתה והמנהלים מעליך', 'Private — you and your managers')}</span>
      </header>

      {/* השנים שהתיק עבר איתו */}
      <div className="pd-seasons" aria-label={L('שנים קודמות', 'Previous seasons')}>
        {DEMO_SEASONS.map((s) => (
          <span key={s.season} className={s.current ? 'pd-season now' : 'pd-season'}>
            <b dir="ltr">{s.season}</b>
            <span>{s.team}</span>
            <i>{s.coach}</i>
          </span>
        ))}
      </div>

      <div className="pd-grid">
        {/* תמונת מצב */}
        <section className="pd-card">
          <div className="pd-card-h">
            <h3>{L('תמונת מצב', 'Snapshot')}</h3>
            <span className="muted small">{L('עודכן', 'Updated')} {fmtDate(DEMO_DATES[2])}</span>
          </div>
          <Radar ratings={ratings} />
          <div className="pd-legend">
            <span><i className="pd-sw now" /> {L('עכשיו', 'Now')}</span>
            <span><i className="pd-sw prev" /> {L('סבב קודם', 'Previous round')}</span>
          </div>
        </section>

        {/* מדידות */}
        <section className="pd-card">
          <div className="pd-card-h">
            <h3>{L('מדידות', 'Measurements')}</h3>
            <button type="button" className="link-button">{L('מדידה חדשה', 'New measurement')}</button>
          </div>
          <div className="pd-measures">
            {MEASURES.map((m) => {
              const vals = measures[m.key]
              const lower = m.key === 'sprint'
              const up = lower ? vals[2] < vals[1] : vals[2] > vals[1]
              return (
                <button
                  key={m.key}
                  type="button"
                  className={trendMetric === m.key ? 'pd-measure on' : 'pd-measure'}
                  onClick={() => setTrendMetric(m.key)}
                >
                  <span className="pd-measure-k"><m.Icon size={14} /> {L(m.he, m.en)}</span>
                  <b dir="ltr">{vals[2]}<small> {L(m.unit, m.unitEn)}</small></b>
                  <span className={up ? 'pd-measure-d up' : 'pd-measure-d down'}>
                    <bdi dir="ltr">{(vals[2] - vals[1] > 0 ? '+' : '') + (Math.round((vals[2] - vals[1]) * 100) / 100)}</bdi>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* גרף התקדמות */}
        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3>{L('התקדמות', 'Progress')}</h3>
            <select className="finder-input pd-select" value={trendMetric} onChange={(e) => setTrendMetric(e.target.value)}
              aria-label={L('בחירת מדד לגרף', 'Pick a metric')}>
              <optgroup label={L('מדידות', 'Measurements')}>
                {MEASURES.map((m) => <option key={m.key} value={m.key}>{L(m.he, m.en)}</option>)}
              </optgroup>
              {CATS.map((c) => (
                <optgroup key={c.key} label={L(c.he, c.en)}>
                  {c.metrics.map((m) => <option key={m.key} value={m.key}>{L(m.he, m.en)}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <Trend values={trendValues} dates={DEMO_DATES} unit={trendUnit} lowerIsBetter={trendMetric === 'sprint'} />
        </section>

        {/* דירוגים */}
        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3>{L('דירוגים', 'Ratings')}</h3>
            <span className="muted small">{L('1–5 · לחיצה על אותה נקודה מבטלת', '1–5 · tap the same dot to clear')}</span>
          </div>
          {CATS.map((c) => {
            const open = openCat === c.key
            const now = catAvg(ratings, c.key, 2)
            const prev = catAvg(ratings, c.key, 1)
            return (
              <div key={c.key} className={open ? 'pd-cat open' : 'pd-cat'}>
                <button type="button" className="pd-cat-h" onClick={() => setOpenCat(open ? '' : c.key)} aria-expanded={open}>
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  <b>{L(c.he, c.en)}</b>
                  <span className="pd-cat-avg" dir="ltr">{now.toFixed(1)}</span>
                  <DeltaIcon from={prev} to={now} />
                </button>
                {open && (
                  <ul className="pd-metrics">
                    {c.metrics.map((m) => (
                      <li key={m.key} className="pd-metric">
                        <span className="pd-metric-k">{L(m.he, m.en)}</span>
                        <Dots value={ratings[m.key][2]} name={L(m.he, m.en)} onChange={(v) => setRating(player.id, m.key, v)} />
                        <DeltaIcon from={ratings[m.key][1]} to={ratings[m.key][2]} />
                        <button type="button" className="pd-metric-note" aria-label={L('הערה למדד', 'Note for this metric')}>
                          <StickyNote size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </section>

        {/* רקע וטקסט חופשי */}
        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3>{L('רקע ושיחות', 'Background & talks')}</h3>
            <button type="button" className="btn-soft pd-add" onClick={() => setNoteOpen((v) => !v)}>
              <Plus size={15} /> {L('רשומה חדשה', 'New entry')}
            </button>
          </div>
          {noteOpen && (
            <div className="pd-note-new">
              <div className="chips">
                {['רקע', 'שיחה', 'פציעה', 'משפחה', 'לימודים'].map((k, i) => (
                  <button key={k} type="button" className={i === 1 ? 'chip selected' : 'chip'}>{k}</button>
                ))}
              </div>
              <textarea className="finder-input" rows={3} placeholder={L('מה קרה, מה נאמר, מה לעשות הלאה…', 'What happened, what was said, what next…')} />
              <div className="form-actions">
                <button type="button" className="btn-primary" onClick={() => setNoteOpen(false)}>{L('שמירה', 'Save')}</button>
                <button type="button" className="btn-ghost" onClick={() => setNoteOpen(false)}>{L('ביטול', 'Cancel')}</button>
              </div>
            </div>
          )}
          <ul className="pd-notes">
            {notes.map((n) => (
              <li key={n.id} className="pd-note">
                <span className="pd-note-top">
                  <span className="pd-note-kind">{n.kind}</span>
                  <span className="muted small"><CalendarDays size={12} /> {fmtDate(n.on)} · {n.by}</span>
                </span>
                <p>{n.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* מה שנאסף לבד */}
        <section className="pd-card pd-card--wide pd-auto">
          <div className="pd-card-h">
            <h3>{L('נאסף לבד מהאפליקציה', 'Collected automatically')}</h3>
            <span className="muted small">{L('בלי להקליד כלום', 'Nothing to type')}</span>
          </div>
          <div className="pd-auto-row">
            <span className="pd-auto-item"><Activity size={15} /> {L('נוכחות עונתית', 'Season attendance')} <b dir="ltr">{DEMO_AUTO.att}%</b></span>
            <span className="pd-auto-item"><TrendingUp size={15} /> {L('מאמץ ממוצע', 'Average effort')} <b dir="ltr">{DEMO_AUTO.effort}/5</b></span>
            <span className="pd-auto-item"><Check size={15} /> {L('משימות שבוצעו', 'Tasks done')} <b dir="ltr">{DEMO_AUTO.tasks}</b></span>
            <span className="pd-auto-item"><Users size={15} /> {L('משחקים', 'Games')} <b dir="ltr">{DEMO_AUTO.games}</b></span>
          </div>
        </section>
      </div>
    </div>
  )
}

// =====================================================================
//  2. סבב דירוג — כל הקטגוריות, מסך אחד בכל פעם
//     (הטבלה הראשונה נפסלה: שש קטגוריות בלבד, וגלילה לצדדים)
//     שני כיווני עבודה, כי מאמנים חושבים בשני הכיוונים:
//       · «שחקן אחרי שחקן» — פותחים שחקן, מדרגים אותו בהכול, הבא.
//       · «קטגוריה אחרי קטגוריה» — מדרגים את כל הקבוצה במחויבות,
//         ואז את כולם בסיומות. יוצא עקבי יותר בין השחקנים.
// =====================================================================
function RatingRound({ ratings, setRating, onOpenPlayer }) {
  const [mode, setMode] = useState('player') // player | metric
  const [pIdx, setPIdx] = useState(0)
  const [mIdx, setMIdx] = useState(0)
  // «הושלם» נמדד על הסבב הזה בלבד: מה שהמאמן נגע בו עכשיו. אחרת המונה
  // היה מראה 16/16 כבר בפתיחה (לכל שחקן יש דירוג מהסבב הקודם).
  const [touched, setTouched] = useState(() => new Set())
  const mark = (pid, key, v) => {
    setTouched((cur) => new Set(cur).add(`${pid}:${key}`))
    setRating(pid, key, v)
  }
  const isTouched = (pid, key) => touched.has(`${pid}:${key}`)

  const player = DEMO_PLAYERS[pIdx]
  const metric = ALL_METRICS[mIdx]
  // מה נחשב «הושלם»: כל 16 המדדים לשחקן / כל 12 השחקנים במדד
  const playerDone = (p) => ALL_METRICS.every((m) => isTouched(p.id, m.key))
  const metricDone = (m) => DEMO_PLAYERS.every((p) => isTouched(p.id, m.key))
  const donePlayers = DEMO_PLAYERS.filter(playerDone).length
  const doneMetrics = ALL_METRICS.filter(metricDone).length

  const step = (dir) => {
    if (mode === 'player') setPIdx((i) => Math.min(DEMO_PLAYERS.length - 1, Math.max(0, i + dir)))
    else setMIdx((i) => Math.min(ALL_METRICS.length - 1, Math.max(0, i + dir)))
  }
  const atStart = mode === 'player' ? pIdx === 0 : mIdx === 0
  const atEnd = mode === 'player' ? pIdx === DEMO_PLAYERS.length - 1 : mIdx === ALL_METRICS.length - 1
  const doneNow = mode === 'player' ? donePlayers : doneMetrics
  const totalNow = mode === 'player' ? DEMO_PLAYERS.length : ALL_METRICS.length

  return (
    <div className="pd">
      <header className="pd-head pd-head--round">
        <div className="pd-head-tx">
          <h2 className="pd-name">{L('סבב דירוג · נערים ב׳', 'Rating round · Youth B')}</h2>
          <span className="pd-meta">
            {mode === 'player'
              ? L('שחקן אחד על המסך, כל 16 הקטגוריות. מסמנים 1–5 ועוברים לשחקן הבא.',
                   'One player on screen with all 16 categories. Mark 1–5 and move on.')
              : L('קטגוריה אחת, כל הקבוצה — ככה הדירוג יוצא עקבי בין השחקנים.',
                   'One category, the whole team — this keeps the scale consistent.')}
          </span>
        </div>
        <span className="pd-round-count">
          <bdi dir="ltr">{doneNow}/{totalNow}</bdi> {mode === 'player' ? L('שחקנים הושלמו', 'players done') : L('קטגוריות הושלמו', 'categories done')}
        </span>
      </header>

      {/* איך לעבוד */}
      <div className="pd-mode" role="group" aria-label={L('כיוון העבודה', 'Working direction')}>
        <button type="button" className={mode === 'player' ? 'pd-mode-btn on' : 'pd-mode-btn'}
          aria-pressed={mode === 'player'} onClick={() => setMode('player')}>
          <Users size={15} /> {L('שחקן אחרי שחקן', 'Player by player')}
        </button>
        <button type="button" className={mode === 'metric' ? 'pd-mode-btn on' : 'pd-mode-btn'}
          aria-pressed={mode === 'metric'} onClick={() => setMode('metric')}>
          <ListChecks size={15} /> {L('קטגוריה אחרי קטגוריה', 'Category by category')}
        </button>
      </div>

      {/* פס התקדמות */}
      <div className="pd-prog" aria-hidden="true">
        {(mode === 'player' ? DEMO_PLAYERS : ALL_METRICS).map((x, i) => {
          const cur = i === (mode === 'player' ? pIdx : mIdx)
          const ok = mode === 'player' ? playerDone(x) : metricDone(x)
          return <span key={i} className={`pd-prog-i${cur ? ' cur' : ''}${ok ? ' ok' : ''}`} />
        })}
      </div>

      {/* ------- מצב א׳: שחקן אחד, כל הקטגוריות ------- */}
      {mode === 'player' && (
        <section className="pd-card pd-sheet">
          <div className="pd-sheet-h">
            <span className="pd-num" dir="ltr">{player.number}</span>
            <div>
              <button type="button" className="pd-sheet-name" onClick={() => onOpenPlayer(player.id)}>
                {player.name}
              </button>
              <span className="pd-meta dark">{player.pos} · <bdi dir="ltr">{2026 - player.born}</bdi> {L('שנים', 'yrs')}</span>
            </div>
            <span className="muted small pd-sheet-count">
              <bdi dir="ltr">{ALL_METRICS.filter((m) => isTouched(player.id, m.key)).length}/{ALL_METRICS.length}</bdi> {L('עודכנו בסבב הזה', 'updated in this round')}
            </span>
          </div>

          {CATS.map((c) => (
            <div key={c.key} className="pd-sheet-cat">
              <h4>{L(c.he, c.en)}</h4>
              <ul className="pd-metrics">
                {c.metrics.map((m) => (
                  <li key={m.key} className={isTouched(player.id, m.key) ? 'pd-metric is-new' : 'pd-metric'}>
                    <span className="pd-metric-k">{L(m.he, m.en)}</span>
                    <Dots value={ratings[player.id][m.key][2]} name={`${player.name} · ${L(m.he, m.en)}`}
                      onChange={(v) => mark(player.id, m.key, v)} />
                    <DeltaIcon from={ratings[player.id][m.key][1]} to={ratings[player.id][m.key][2]} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* ------- מצב ב׳: קטגוריה אחת, כל הקבוצה ------- */}
      {mode === 'metric' && (
        <section className="pd-card pd-sheet">
          <div className="pd-sheet-h">
            <div>
              <span className="pd-sheet-kick">{metric.catHe}</span>
              <b className="pd-sheet-name as-text">{L(metric.he, metric.en)}</b>
            </div>
            <span className="muted small pd-sheet-count">
              <bdi dir="ltr">{mIdx + 1}/{ALL_METRICS.length}</bdi> {L('קטגוריות', 'categories')}
            </span>
          </div>
          <ul className="pd-metrics">
            {DEMO_PLAYERS.map((p) => (
              <li key={p.id} className={isTouched(p.id, metric.key) ? 'pd-metric is-new' : 'pd-metric'}>
                <span className="pd-metric-k pd-metric-player">
                  <span className="pd-num sm" dir="ltr">{p.number}</span> {p.name}
                </span>
                <Dots value={ratings[p.id][metric.key][2]} name={`${p.name} · ${L(metric.he, metric.en)}`}
                  onChange={(v) => mark(p.id, metric.key, v)} />
                <DeltaIcon from={ratings[p.id][metric.key][1]} to={ratings[p.id][metric.key][2]} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* מעבר */}
      <div className="pd-nav">
        <button type="button" className="btn-soft" onClick={() => step(-1)} disabled={atStart}>
          <ChevronRight size={16} /> {L('הקודם', 'Previous')}
        </button>
        <span className="pd-nav-mid">
          {mode === 'player'
            ? L(`שחקן ${pIdx + 1} מתוך ${DEMO_PLAYERS.length}`, `Player ${pIdx + 1} of ${DEMO_PLAYERS.length}`)
            : L(`קטגוריה ${mIdx + 1} מתוך ${ALL_METRICS.length}`, `Category ${mIdx + 1} of ${ALL_METRICS.length}`)}
        </span>
        <button type="button" className="btn-primary pd-nav-next" onClick={() => step(1)} disabled={atEnd}>
          {L('הבא', 'Next')} <ChevronLeft size={16} />
        </button>
      </div>
      {atEnd && (
        <p className="pd-nav-end">
          {L('זה האחרון. הדירוגים נשמרים לתאריך של היום — הגרף בתיק יקבל נקודה חדשה.',
             'That was the last one. Ratings are saved under today’s date — the chart gets a new point.')}
        </p>
      )}
    </div>
  )
}

// =====================================================================
//  3. מי רואה את התיקים  (המסך «עץ המועדון» נפסל — לא היה מובן)
//     עכשיו: משפט אחד בראש שאומר בדיוק מי רואה, ואחריו שלושה כרטיסים.
// =====================================================================
const CLUB = {
  name: 'הפועל עמק חפר',
  iAmIn: true,                       // מנהל המועדון צירף אותי
  manager: 'אגם אדירי',
  pro: null,                         // מנהל מקצועי — עוד לא מונה
  myTeams: ['נערים ב׳', 'קטסל א׳'],
}
const LEVELS = [
  {
    key: 'club', he: 'מנהל מועדון', en: 'Club manager', who: CLUB.manager,
    seesHe: 'רואה את התיקים של כל השחקנים במועדון', seesEn: 'Sees every player in the club',
  },
  {
    key: 'pro', he: 'מנהל מקצועי', en: 'Technical director', who: null,
    seesHe: 'רואה את התיקים של המאמנים שהוא אחראי עליהם', seesEn: 'Sees the dossiers of the coaches under them',
  },
  {
    key: 'coach', he: 'מאמן', en: 'Coach', who: 'אגם אדירי (אתה)', me: true,
    seesHe: 'רואה את התיקים של הקבוצות שהוא מאמן', seesEn: 'Sees the dossiers of the teams they coach',
  },
]

function Access() {
  const [grants, setGrants] = useState([{ name: 'תמר לוי', team: 'נערים א׳', level: 'view' }])
  return (
    <div className="pd">
      <header className="pd-head">
        <div className="pd-head-tx">
          <h2 className="pd-name">{L('מי רואה את התיקים', 'Who sees the dossiers')}</h2>
          <span className="pd-meta">{L('התשובה במשפט אחד, ואחר כך הפירוט.', 'The answer in one line, then the details.')}</span>
        </div>
      </header>

      {/* התשובה, בגדול */}
      <div className="pd-answer">
        <Lock size={18} aria-hidden="true" />
        <p>
          {L('את התיקים של ', 'The dossiers of ')}
          <b>{CLUB.myTeams.join(' ' + L('ו', 'and') + ' ')}</b>
          {L(' רואים כרגע: ', ' are currently seen by: ')}
          <b>{L('אתה', 'you')}</b>
          {', '}
          <b>{CLUB.manager} ({L('מנהל המועדון', 'club manager')})</b>
          {grants.length ? `, ${grants.map((g) => g.name).join(', ')} (${L('נתת גישה', 'you granted access')})` : ''}
          {'. '}
          <span className="pd-answer-no">{L('אף אחד אחר — ולא השחקנים או ההורים.', 'Nobody else — and not the players or parents.')}</span>
        </p>
      </div>

      <div className="pd-grid">
        {/* מי מעליך */}
        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3><Shield size={16} /> {L('הסדר במועדון', 'The order in the club')} · {CLUB.name}</h3>
          </div>
          <ol className="pd-levels">
            {LEVELS.map((lv, i) => (
              <li key={lv.key} className={lv.me ? 'pd-level me' : 'pd-level'}>
                <span className="pd-level-n" aria-hidden="true">{i + 1}</span>
                <span className="pd-level-tx">
                  <b>{L(lv.he, lv.en)}</b>
                  {lv.who
                    ? <span className="pd-level-who">{lv.who}</span>
                    : <span className="pd-level-who empty">{L('עוד לא מונה אף אחד', 'Nobody appointed yet')}</span>}
                  <span className="pd-level-sees"><Eye size={13} /> {L(lv.seesHe, lv.seesEn)}</span>
                </span>
                {!lv.who && (
                  <button type="button" className="btn-soft pd-tree-btn"><UserPlus size={14} /> {L('מינוי', 'Appoint')}</button>
                )}
              </li>
            ))}
          </ol>
          <p className="muted small pd-tree-note">
            {L('מנהל מועדון ממנה את המנהל המקצועי ומצרף מאמנים. מאמן יכול לפתוח קבוצות ולנהל תיקים גם בלי שצירפו אותו — ואז אף מנהל לא רואה אותם.',
               'The club manager appoints the technical director and adds coaches. A coach can open teams and keep dossiers without being added — and then no manager sees them.')}
          </p>
        </section>

        {/* המצב שלי */}
        <section className="pd-card">
          <div className="pd-card-h"><h3>{L('המצב שלך', 'Your status')}</h3></div>
          <div className={CLUB.iAmIn ? 'pd-status in' : 'pd-status out'}>
            {CLUB.iAmIn ? <Check size={18} /> : <X size={18} />}
            <div>
              <b>{CLUB.iAmIn
                ? L(`מנהל המועדון צירף אותך ל${CLUB.name}`, `The club manager added you to ${CLUB.name}`)
                : L('אתה לא מצורף למועדון', 'You are not attached to a club')}</b>
              <span>{CLUB.iAmIn
                ? L('לכן מנהל המועדון רואה את התיקים שלך. אם תרצה שלא — צריך לצאת מהמועדון.', 'That is why the club manager sees your dossiers. To change it you would have to leave the club.')
                : L('התיקים שלך פרטיים לחלוטין — אף מנהל לא רואה אותם.', 'Your dossiers are completely private — no manager sees them.')}</span>
            </div>
          </div>
        </section>

        {/* גישות שנתתי */}
        <section className="pd-card">
          <div className="pd-card-h">
            <h3>{L('מאמנים שנתת להם גישה', 'Coaches you gave access')}</h3>
            <button type="button" className="btn-soft pd-add"
              onClick={() => setGrants((g) => [...g, { name: 'רן שביט', team: 'ילדים א׳', level: 'view' }])}>
              <Plus size={15} /> {L('הוספה', 'Add')}
            </button>
          </div>
          {grants.length === 0 ? (
            <p className="muted small">{L('לא נתת גישה לאף מאמן. רק אתה והמנהלים מעליך רואים.', 'You have not given any coach access. Only you and your managers can see.')}</p>
          ) : (
            <ul className="pd-grants">
              {grants.map((g, i) => (
                <li key={g.name + i}>
                  <b>{g.name}</b>
                  <span className="muted small">{g.team}</span>
                  <span className="pd-grant-lvl">{L('צפייה', 'View')}</span>
                  <button type="button" className="link-button danger" onClick={() => setGrants((cur) => cur.filter((_, x) => x !== i))}>
                    {L('הסרה', 'Remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

// =====================================================================
//  המסך
// =====================================================================
export default function PlayerDossier() {
  const [tab, setTab] = useState('dossier')
  const [playerId, setPlayerId] = useState(DEMO_PLAYERS[0].id)
  const [ratings, setRatings] = useState(DEMO_RATINGS)

  const setRating = (pid, key, value) =>
    setRatings((cur) => ({
      ...cur,
      [pid]: { ...cur[pid], [key]: [cur[pid][key][0], cur[pid][key][1], value] },
    }))

  const player = useMemo(() => DEMO_PLAYERS.find((p) => p.id === playerId), [playerId])

  return (
    <div className="welcome-card pd-screen">
      <div className="pd-demo-banner" role="note">
        <FolderOpen size={16} aria-hidden="true" />
        <span>
          <b>{L('תצוגה מוקדמת על נתוני דוגמה.', 'Preview on demo data.')}</b>{' '}
          {L('השמות והמספרים מומצאים, שום דבר לא נשמר, ואף שחקן אמיתי לא נוגע בזה. המטרה: להחליט אם המסך נוח לעבודה.',
             'Names and numbers are invented, nothing is saved, no real player is involved. The point: decide whether this screen works for you.')}
        </span>
      </div>

      <div className="tabs pd-tabs">
        <button className={tab === 'dossier' ? 'tab active' : 'tab'} onClick={() => setTab('dossier')}>
          <FolderOpen size={15} aria-hidden="true" /> {L('תיק שחקן', 'Player dossier')}
        </button>
        <button className={tab === 'round' ? 'tab active' : 'tab'} onClick={() => setTab('round')}>
          <Users size={15} aria-hidden="true" /> {L('סבב דירוג', 'Rating round')}
        </button>
        <button className={tab === 'tree' ? 'tab active' : 'tab'} onClick={() => setTab('tree')}>
          <Shield size={15} aria-hidden="true" /> {L('מי רואה את התיקים', 'Who sees them')}
        </button>
      </div>

      {tab === 'dossier' && (
        <>
          <div className="pd-picker">
            <span className="muted small">{L('שחקן', 'Player')}</span>
            <select className="finder-input" value={playerId} onChange={(e) => setPlayerId(Number(e.target.value))}
              aria-label={L('בחירת שחקן', 'Pick a player')}>
              {DEMO_PLAYERS.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
            </select>
          </div>
          <Dossier player={player} ratings={ratings[playerId]} setRating={setRating} />
        </>
      )}
      {tab === 'round' && (
        <RatingRound ratings={ratings} setRating={setRating} onOpenPlayer={(id) => { setPlayerId(id); setTab('dossier') }} />
      )}
      {tab === 'tree' && <Access />}
    </div>
  )
}
