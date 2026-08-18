import { useMemo, useState } from 'react'
import {
  FolderOpen, Users, Ruler, Weight, MoveUp, Timer, StickyNote, Plus, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, Shield, UserPlus, Lock, Eye, Check, X, CalendarDays, Activity,
} from 'lucide-react'
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
const metricLabel = (key) => {
  const m = ALL_METRICS.find((x) => x.key === key)
  return m ? L(m.he, m.en) : key
}

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
//  2. סבב דירוג — כל הקבוצה, מהר
// =====================================================================
const ROUND_KEYS = ['ball', 'fin', 'dman', 'iq', 'commit', 'ath']
function RatingRound({ ratings, setRating, onOpenPlayer }) {
  const [done, setDone] = useState(() => new Set())
  const total = DEMO_PLAYERS.length
  return (
    <div className="pd">
      <header className="pd-head pd-head--round">
        <div className="pd-head-tx">
          <h2 className="pd-name">{L('סבב דירוג · נערים ב׳', 'Rating round · Youth B')}</h2>
          <span className="pd-meta">{L('שש הקטגוריות המרכזיות. הכול לחיץ — לתיק המלא נכנסים מהשם.', 'Six core categories. Tap to rate; open the full dossier from the name.')}</span>
        </div>
        <span className="pd-round-count">
          <bdi dir="ltr">{done.size}/{total}</bdi> {L('הושלמו', 'done')}
        </span>
      </header>

      <div className="pd-round-wrap">
        <table className="pd-round">
          <thead>
            <tr>
              <th scope="col">{L('שחקן', 'Player')}</th>
              {ROUND_KEYS.map((k) => <th key={k} scope="col">{metricLabel(k)}</th>)}
              <th scope="col">{L('סיום', 'Done')}</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_PLAYERS.map((p) => (
              <tr key={p.id} className={done.has(p.id) ? 'is-done' : undefined}>
                <th scope="row">
                  <button type="button" className="pd-round-name" onClick={() => onOpenPlayer(p.id)}>
                    <span className="pd-num sm" dir="ltr">{p.number}</span> {p.name}
                  </button>
                </th>
                {ROUND_KEYS.map((k) => (
                  <td key={k}>
                    <Dots value={ratings[p.id][k][2]} name={`${p.name} · ${metricLabel(k)}`}
                      onChange={(v) => setRating(p.id, k, v)} />
                  </td>
                ))}
                <td>
                  <button type="button" className={done.has(p.id) ? 'pd-done on' : 'pd-done'}
                    aria-pressed={done.has(p.id)}
                    onClick={() => setDone((cur) => { const n = new Set(cur); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}>
                    <Check size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        {L('בטלפון הטבלה נגללת לצדדים; אפשר גם לדרג שחקן־שחקן מתוך התיק שלו.',
           'On a phone the table scrolls sideways; you can also rate player by player inside the dossier.')}
      </p>
    </div>
  )
}

// =====================================================================
//  3. העץ והגישות
// =====================================================================
const TREE = {
  club: 'הפועל עמק חפר',
  manager: { name: 'אגם אדירי', role: 'מנהל מועדון' },
  pro: null,
  coaches: [
    { name: 'אגם אדירי', teams: ['נערים ב׳', 'קטסל א׳'], inTree: true, me: true },
    { name: 'תמר לוי', teams: ['נערים א׳'], inTree: true },
    { name: 'רן שביט', teams: ['ילדים א׳'], inTree: false },
  ],
}
function Tree() {
  const [grants, setGrants] = useState([{ name: 'תמר לוי', level: 'view' }])
  return (
    <div className="pd">
      <header className="pd-head">
        <div className="pd-head-tx">
          <h2 className="pd-name">{L('העץ של המועדון והגישות', 'Club tree & access')}</h2>
          <span className="pd-meta">{L('מי רואה תיקים של מי — וגם מי לא.', 'Who sees whose dossiers — and who does not.')}</span>
        </div>
      </header>

      <div className="pd-grid">
        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3><Shield size={16} /> {TREE.club}</h3>
            <span className="muted small">{L('הדגמה — עוד לא מחובר', 'Demo — not wired yet')}</span>
          </div>
          <ul className="pd-tree">
            <li className="pd-tree-row lvl0">
              <span className="pd-tree-role">{L('מנהל מועדון', 'Club manager')}</span>
              <b>{TREE.manager.name}</b>
              <span className="pd-tree-see"><Eye size={13} /> {L('רואה את כל תיקי המועדון', 'Sees every dossier in the club')}</span>
            </li>
            <li className="pd-tree-row lvl1">
              <span className="pd-tree-role">{L('מנהל מקצועי', 'Technical director')}</span>
              <span className="pd-tree-empty">{L('לא מונה', 'Not appointed')}</span>
              <button type="button" className="btn-soft pd-tree-btn"><UserPlus size={14} /> {L('מינוי', 'Appoint')}</button>
            </li>
            {TREE.coaches.map((c) => (
              <li key={c.name} className={c.inTree ? 'pd-tree-row lvl2' : 'pd-tree-row lvl2 out'}>
                <span className="pd-tree-role">{L('מאמן', 'Coach')}</span>
                <b>{c.name}{c.me ? L(' (אתה)', ' (you)') : ''}</b>
                <span className="muted small">{c.teams.join(' · ')}</span>
                {c.inTree ? (
                  <span className="pd-tree-see in"><Check size={13} /> {L('בעץ', 'In the tree')}</span>
                ) : (
                  <>
                    <span className="pd-tree-see out"><X size={13} /> {L('לא צורף — התיקים שלו פרטיים', 'Not joined — dossiers stay private')}</span>
                    <button type="button" className="btn-soft pd-tree-btn">{L('צירוף לעץ', 'Add to tree')}</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small pd-tree-note">
            {L('מאמן יכול לפתוח קבוצות ולנהל תיקים גם בלי להיות בעץ — אבל אז אף מנהל לא רואה אותם.',
               'A coach can open teams and keep dossiers without being in the tree — but then no manager sees them.')}
          </p>
        </section>

        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3>{L('גישה לתיק של סול בלמן', 'Access to Sol Belman’s dossier')}</h3>
            <button type="button" className="btn-soft pd-add" onClick={() => setGrants((g) => [...g, { name: 'רן שביט', level: 'view' }])}>
              <Plus size={15} /> {L('מתן גישה למאמן', 'Grant a coach access')}
            </button>
          </div>
          <ul className="pd-grants">
            <li><b>{L('אגם אדירי', 'Agam Adiri')}</b> <span className="pd-grant-lvl owner">{L('בעל התיק', 'Owner')}</span></li>
            <li><b>{TREE.manager.name}</b> <span className="pd-grant-lvl auto">{L('לפי העץ — מנהל מועדון', 'By the tree — club manager')}</span></li>
            {grants.map((g, i) => (
              <li key={g.name + i}>
                <b>{g.name}</b>
                <span className="pd-grant-lvl">{g.level === 'view' ? L('צפייה', 'View') : L('צפייה ועריכה', 'View & edit')}</span>
                <button type="button" className="link-button danger" onClick={() => setGrants((cur) => cur.filter((_, x) => x !== i))}>
                  {L('הסרה', 'Remove')}
                </button>
              </li>
            ))}
          </ul>
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
          <Shield size={15} aria-hidden="true" /> {L('העץ והגישות', 'Tree & access')}
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
      {tab === 'tree' && <Tree />}
    </div>
  )
}
