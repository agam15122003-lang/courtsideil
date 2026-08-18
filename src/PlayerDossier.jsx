import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderOpen, Users, Ruler, Weight, MoveUp, Timer, Plus, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, Shield, UserPlus, Lock, Eye, Check, X, CalendarDays, Activity,
  ListChecks, Link2, Database, Trash2,
} from 'lucide-react'
// חצי «הבא/הקודם» מתהפכים לפי שפה — אסור לייבא ChevronLeft/Right ישירות
import { ChevronBack as ChevronRight, ChevronFwd as ChevronLeft } from './DirIcon'
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
const NOTE_KINDS = ['רקע', 'שיחה', 'פציעה', 'משפחה', 'לימודים']

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(String(iso).slice(0, 10) + 'T00:00')
  return Number.isNaN(d.getTime()) ? iso : `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`
}
const round1 = (n) => Math.round(n * 10) / 10
// «עכשיו» ו«סבב קודם»: הערך האחרון, והערך מהתאריך שלפניו
const seriesNow = (arr) => (arr && arr.length ? arr[arr.length - 1].value : 0)
const seriesPrev = (arr) => (arr && arr.length > 1 ? arr[arr.length - 2].value : 0)

// ---------- «עכביש» ----------
function Radar({ cats, valNow, valPrev, size = 216 }) {
  if (cats.length < 3) return null
  const cx = size / 2, cy = size / 2, r = size / 2 - 26
  const catAvg = (c, fn) => {
    const v = c.metrics.map((m) => fn(m.key)).filter((x) => x > 0)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
  }
  const poly = (fn) =>
    cats.map((c, i) => {
      const a = (Math.PI * 2 * i) / cats.length - Math.PI / 2
      const v = catAvg(c, fn) / 5
      return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v].join(',')
    }).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="pd-radar" role="img"
      aria-label={L('תמונת מצב לפי תחומים', 'Snapshot by area')}>
      {[1, 0.75, 0.5, 0.25].map((f) => (
        <polygon key={f} className="pd-radar-grid" points={cats.map((c, i) => {
          const a = (Math.PI * 2 * i) / cats.length - Math.PI / 2
          return [cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f].join(',')
        }).join(' ')} />
      ))}
      <polygon points={poly(valPrev)} className="pd-radar-prev" />
      <polygon points={poly(valNow)} className="pd-radar-now" />
      {cats.map((c, i) => {
        const a = (Math.PI * 2 * i) / cats.length - Math.PI / 2
        return (
          <text key={c.key} x={cx + Math.cos(a) * (r + 16)} y={cy + Math.sin(a) * (r + 16)}
            className="pd-radar-lbl" dominantBaseline="middle"
            textAnchor={Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'}>
            {c.label}
          </text>
        )
      })}
    </svg>
  )
}

// ---------- גרף לאורך זמן ----------
function Trend({ series, unit, lowerIsBetter }) {
  if (!series || series.length === 0) {
    return (
      <p className="muted small">
        {L('אין עוד נתונים למדד הזה — הדירוג הראשון יפתח את הגרף.', 'No data yet — the first rating opens the chart.')}
      </p>
    )
  }
  const w = 520, h = 132, pad = { t: 18, r: 16, b: 26, l: 34 }
  const values = series.map((s) => s.value)
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const x = (i) => (series.length === 1 ? w / 2 : pad.l + (i * (w - pad.l - pad.r)) / (series.length - 1))
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / span)
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.value)}`).join(' ')
  const first = values[0], last = values[values.length - 1]
  const better = lowerIsBetter ? last < first : last > first
  return (
    <div className="pd-trend">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={L('גרף התקדמות', 'Progress chart')}>
        <line x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} className="pd-axis" />
        {series.length > 1 && <path d={line} className={better ? 'pd-line up' : 'pd-line down'} />}
        {series.map((s, i) => (
          <g key={s.on + '-' + i}>
            <circle cx={x(i)} cy={y(s.value)} r="4" className="pd-dot" />
            <text x={x(i)} y={y(s.value) - 10} className="pd-val" textAnchor="middle">{s.value}</text>
            <text x={x(i)} y={h - 8} className="pd-tick" textAnchor="middle">{fmtDate(s.on)}</text>
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <span className={better ? 'pd-delta up' : 'pd-delta down'}>
          {better ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <bdi dir="ltr">{(last - first > 0 ? '+' : '') + round1(last - first)}</bdi> {unit || ''}
        </span>
      )}
    </div>
  )
}

function Dots({ value, onChange, name }) {
  return (
    <span className="pd-dots" role="radiogroup" aria-label={name}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}`}
          className={n <= value ? 'pd-dot-btn on' : 'pd-dot-btn'}
          onClick={() => onChange(n === value ? 0 : n)}>
          <span />
        </button>
      ))}
    </span>
  )
}

const DeltaIcon = ({ from, to }) => {
  if (!from || !to) return <span className="pd-chg flat" />
  if (to > from) return <span className="pd-chg up" title={L('עלייה', 'Up')}><TrendingUp size={13} /></span>
  if (to < from) return <span className="pd-chg down" title={L('ירידה', 'Down')}><TrendingDown size={13} /></span>
  return <span className="pd-chg flat" title={L('בלי שינוי', 'No change')}><Minus size={13} /></span>
}

// =====================================================================
//  המסך
// =====================================================================
export default function PlayerDossier({ session, profile, initialRosterId, onConsumeInitial }) {
  const me = session.user.id
  const club = profile?.club || ''

  const [tab, setTab] = useState('dossier')
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
      const t = await api.loadTeams(me)
      if (!alive) return
      if (t.error) {
        setBoot({ loading: false, error: t.error.message, missing: api.notDeployed(t.error) })
        return
      }
      const rows = api.sortRoster(t.roster)
      setCatalog(cat)
      setTeams(t.teams)
      setRoster(rows)
      setTeam((cur) => cur || t.teams[0] || '')
      setPersonByRoster(Object.fromEntries(rows.filter((r) => r.person_id).map((r) => [r.id, r.person_id])))
      setBoot({ loading: false, error: null, missing: false })
    })()
    return () => { alive = false }
  }, [me, reloadKey])

  // הגעה מכרטיס השחקן: קופצים ישר לתיק שלו (קבוצה + שחקן), פעם אחת
  useEffect(() => {
    if (!initialRosterId || !roster.length) return
    const row = roster.find((r) => r.id === initialRosterId)
    if (row) { setTeam(row.team); setRosterId(row.id); setTab('dossier') }
    onConsumeInitial?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRosterId, roster.length])

  const teamRoster = useMemo(() => roster.filter((r) => r.team === team), [roster, team])
  useEffect(() => {
    if (!teamRoster.length) { setRosterId(null); return }
    if (!teamRoster.some((r) => r.id === rosterId)) setRosterId(teamRoster[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, teamRoster.length])

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

  // שמירת דירוג/מדידה: מיד על המסך, ואז במסד. תיקון באותו יום דורס.
  const setValue = async (personId, metricKey, value) => {
    if (!personId) return
    const on = api.today()
    setEntries((cur) => {
      const person = { ...(cur[personId] || {}) }
      const arr = (person[metricKey] || []).filter((e) => e.on !== on)
      person[metricKey] = value > 0 ? [...arr, { on, value }] : arr
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

  const noTeams = teams.length === 0
  const rosterRow = teamRoster.find((r) => r.id === rosterId)

  return (
    <div className="welcome-card pd-screen">
      <div className="tabs pd-tabs">
        <button className={tab === 'dossier' ? 'tab active' : 'tab'} onClick={() => setTab('dossier')}>
          <FolderOpen size={15} aria-hidden="true" /> {L('תיק שחקן', 'Player dossier')}
        </button>
        <button className={tab === 'round' ? 'tab active' : 'tab'} onClick={() => setTab('round')}>
          <Users size={15} aria-hidden="true" /> {L('סבב דירוג', 'Rating round')}
        </button>
        <button className={tab === 'access' ? 'tab active' : 'tab'} onClick={() => setTab('access')}>
          <Shield size={15} aria-hidden="true" /> {L('מי רואה את התיקים', 'Who sees them')}
        </button>
      </div>

      {noTeams ? (
        <div className="empty-state">
          <span className="empty-ic"><Users size={26} /></span>
          <div className="empty-title">{L('אין עדיין שחקנים', 'No players yet')}</div>
          <p className="muted small">
            {L('התיקים נבנים על הסגל שלך — מוסיפים שחקנים ב«הקבוצות שלי», וכל שחקן מקבל תיק אוטומטית.',
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
            {saving && <span className="muted small">{L('שומר…', 'Saving…')}</span>}
          </div>

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
function Dossier({ me, rosterRow, catalog, personId, ensurePerson, entries, loadEntriesFor, setValue }) {
  const [openCat, setOpenCat] = useState(catalog.cats[0]?.key || '')
  const [trendKey, setTrendKey] = useState(catalog.measures[0]?.key || catalog.cats[0]?.metrics[0]?.key || '')
  const [notes, setNotes] = useState([])
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteKind, setNoteKind] = useState(NOTE_KINDS[0])
  const [noteText, setNoteText] = useState('')
  const [history, setHistory] = useState([])
  const [auto, setAuto] = useState({})
  const [dups, setDups] = useState([])
  const [measureEdit, setMeasureEdit] = useState(null)
  const [ready, setReady] = useState(false)
  const opened = useRef(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!rosterRow) return
      let pid = personId
      if (!pid && !opened.current) { opened.current = true; pid = await ensurePerson(rosterRow.id) }
      if (!alive || !pid) return
      await loadEntriesFor([pid])
      const [n, h, d] = await Promise.all([api.loadNotes(pid), api.loadHistory(pid), api.findDuplicates(pid)])
      if (!alive) return
      setNotes(n.notes || [])
      setHistory(h.history || [])
      setDups(d.candidates || [])
      setReady(true)
      const st = await api.loadAutoStats({
        rosterId: rosterRow.id, playerId: rosterRow.player_id, coachId: me, team: rosterRow.team,
      })
      if (alive) setAuto(st.stats || {})
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterRow?.id, personId])

  const E = entries[personId] || {}
  const now = (key) => seriesNow(E[key])
  const prev = (key) => seriesPrev(E[key])
  const trendMetric = catalog.all.find((m) => m.key === trendKey)

  const addNote = async () => {
    if (!noteText.trim() || !personId) return
    const { note, error } = await api.addNote({ personId, kind: noteKind, content: noteText.trim(), coachId: me })
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
    await setValue(personId, measureEdit.key, v)
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
    const { error } = await api.mergePeople(candidate.id, personId)
    if (error) { toast.error(L('החיבור נכשל: ', 'Merge failed: ') + error.message); return }
    toast.success(L('התיקים חוברו', 'Dossiers merged'))
    setDups([])
    loadEntriesFor([personId])
    api.loadNotes(personId).then((n) => setNotes(n.notes || []))
    api.loadHistory(personId).then((h) => setHistory(h.history || []))
  }

  if (!rosterRow) return null
  if (!ready) return <SkeletonCards count={2} lines={5} />

  const age = rosterRow.birth_year ? new Date().getFullYear() - Number(rosterRow.birth_year) : null

  return (
    <div className="pd">
      <header className="pd-head">
        {rosterRow.number ? <span className="pd-num" dir="ltr">{rosterRow.number}</span> : null}
        <div className="pd-head-tx">
          <h2 className="pd-name">{rosterRow.name}</h2>
          <span className="pd-meta">
            {[rosterRow.position, age ? `${age} ${L('שנים', 'yrs')}` : null, trTeam(rosterRow.team)].filter(Boolean).join(' · ')}
          </span>
        </div>
        <span className="pd-lock"><Lock size={13} /> {L('סגור — אתה והמנהלים מעליך', 'Private — you and your managers')}</span>
      </header>

      {dups.length > 0 && (
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

      <div className="pd-grid">
        <section className="pd-card">
          <div className="pd-card-h"><h3>{L('תמונת מצב', 'Snapshot')}</h3></div>
          <Radar cats={catalog.cats} valNow={now} valPrev={prev} />
          <div className="pd-legend">
            <span><i className="pd-sw now" /> {L('עכשיו', 'Now')}</span>
            <span><i className="pd-sw prev" /> {L('סבב קודם', 'Previous round')}</span>
          </div>
        </section>

        <section className="pd-card">
          <div className="pd-card-h">
            <h3>{L('מדידות', 'Measurements')}</h3>
            <span className="muted small">{L('לחיצה = מדידה חדשה', 'Tap to add a new one')}</span>
          </div>
          <div className="pd-measures">
            {catalog.measures.map((m) => {
              const Icon = ICON_BY_MEASURE[m.key] || Ruler
              const v = now(m.key)
              const p = prev(m.key)
              const up = m.lower_is_better ? v < p : v > p
              return (
                <button key={m.key} type="button"
                  className={trendKey === m.key ? 'pd-measure on' : 'pd-measure'}
                  onClick={() => { setTrendKey(m.key); setMeasureEdit({ key: m.key, value: v || '' }) }}>
                  <span className="pd-measure-k"><Icon size={14} /> {m.label}</span>
                  <b dir="ltr">{v ? v : '—'}{v ? <small> {m.unit}</small> : null}</b>
                  {v && p ? (
                    <span className={up ? 'pd-measure-d up' : 'pd-measure-d down'}>
                      <bdi dir="ltr">{(v - p > 0 ? '+' : '') + round1(v - p)}</bdi>
                    </span>
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
          </div>
          <Trend series={E[trendKey]} unit={trendMetric?.kind === 'number' ? trendMetric.unit : L('נק׳', 'pts')}
            lowerIsBetter={!!trendMetric?.lower_is_better} />
        </section>

        <section className="pd-card pd-card--wide">
          <div className="pd-card-h">
            <h3>{L('דירוגים', 'Ratings')}</h3>
            <span className="muted small">{L('1–5 · לחיצה על אותה נקודה מבטלת', '1–5 · tap the same dot to clear')}</span>
          </div>
          {catalog.cats.map((c) => {
            const open = openCat === c.key
            const vals = c.metrics.map((m) => now(m.key)).filter((v) => v > 0)
            const pvals = c.metrics.map((m) => prev(m.key)).filter((v) => v > 0)
            const avgNow = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
            const avgPrev = pvals.length ? pvals.reduce((a, b) => a + b, 0) / pvals.length : 0
            return (
              <div key={c.key} className={open ? 'pd-cat open' : 'pd-cat'}>
                <button type="button" className="pd-cat-h" onClick={() => setOpenCat(open ? '' : c.key)} aria-expanded={open}>
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  <b>{c.label}</b>
                  <span className="pd-cat-avg" dir="ltr">{avgNow ? avgNow.toFixed(1) : '—'}</span>
                  <DeltaIcon from={avgPrev} to={avgNow} />
                </button>
                {open && (
                  <ul className="pd-metrics">
                    {c.metrics.map((m) => (
                      <li key={m.key} className="pd-metric">
                        <span className="pd-metric-k">{m.label}</span>
                        <Dots value={now(m.key)} name={m.label} onChange={(v) => setValue(personId, m.key, v)} />
                        <DeltaIcon from={prev(m.key)} to={now(m.key)} />
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
            <button type="button" className="btn-soft pd-add" onClick={() => setNoteOpen((v) => !v)}>
              <Plus size={15} /> {L('רשומה חדשה', 'New entry')}
            </button>
          </div>
          {noteOpen && (
            <div className="pd-note-new">
              <div className="chips">
                {NOTE_KINDS.map((k) => (
                  <button key={k} type="button" className={noteKind === k ? 'chip selected' : 'chip'} onClick={() => setNoteKind(k)}>{k}</button>
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
                <li key={n.id} className="pd-note">
                  <span className="pd-note-top">
                    <span className="pd-note-kind">{n.kind}</span>
                    <span className="muted small">
                      <CalendarDays size={12} /> {fmtDate(n.on_date)}
                      {n.coach ? ` · ${[n.coach.first_name, n.coach.last_name].filter(Boolean).join(' ')}` : ''}
                    </span>
                    {n.coach_id === me && (
                      <button type="button" className="pd-note-del" onClick={() => delNote(n.id)} aria-label={L('מחיקה', 'Delete')}>
                        <Trash2 size={13} />
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
          {Object.keys(auto).length === 0 ? (
            <p className="muted small">
              {L('אין עוד נתונים — נוכחות, מאמץ ומשימות יופיעו כאן ברגע שיהיו.', 'No data yet — attendance, effort and tasks appear here once they exist.')}
            </p>
          ) : (
            <div className="pd-auto-row">
              {auto.attendance != null && (
                <span className="pd-auto-item">
                  <Activity size={15} /> {L('נוכחות', 'Attendance')} <b dir="ltr">{auto.attendance}%</b>
                  <span className="muted small">(<bdi dir="ltr">{auto.sessions}</bdi> {L('אימונים', 'sessions')})</span>
                </span>
              )}
              {auto.effort != null && (
                <span className="pd-auto-item"><TrendingUp size={15} /> {L('עומס מדווח (ממוצע)', 'Reported load (avg)')} <b dir="ltr">{auto.effort}/10</b></span>
              )}
              {auto.tasks != null && (
                <span className="pd-auto-item"><Check size={15} /> {L('משימות שבוצעו', 'Tasks done')} <b dir="ltr">{auto.tasks}</b></span>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// =====================================================================
//  2. סבב דירוג — כל הקטגוריות, מסך אחד בכל פעם
// =====================================================================
function RatingRound({ team, teamRoster, catalog, personByRoster, ensurePerson, entries, loadEntriesFor, setValue }) {
  const [mode, setMode] = useState('player')
  const [pIdx, setPIdx] = useState(0)
  const [mIdx, setMIdx] = useState(0)
  const [prep, setPrep] = useState(true)
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
      for (const r of teamRoster) {
        const pid = personByRoster[r.id] || (await ensurePerson(r.id))
        if (pid) ids.push(pid)
      }
      if (!alive) return
      await loadEntriesFor(ids)
      if (alive) setPrep(false)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, teamRoster.length])

  const today = api.today()
  const pidOf = (r) => personByRoster[r.id]
  const seriesOf = (r, key) => (entries[pidOf(r)] || {})[key]
  const valOf = (r, key) => seriesNow(seriesOf(r, key))
  const doneToday = (r, key) => (seriesOf(r, key) || []).some((e) => e.on === today)

  const playerDone = (r) => metrics.length > 0 && metrics.every((m) => doneToday(r, m.key))
  const metricDone = (m) => teamRoster.length > 0 && teamRoster.every((r) => doneToday(r, m.key))
  const donePlayers = teamRoster.filter(playerDone).length
  const doneMetrics = metrics.filter(metricDone).length

  const player = teamRoster[Math.min(pIdx, teamRoster.length - 1)]
  const metric = metrics[Math.min(mIdx, Math.max(0, metrics.length - 1))]
  const atStart = mode === 'player' ? pIdx === 0 : mIdx === 0
  const atEnd = mode === 'player' ? pIdx >= teamRoster.length - 1 : mIdx >= metrics.length - 1
  const step = (d) => {
    if (mode === 'player') setPIdx((i) => Math.min(teamRoster.length - 1, Math.max(0, i + d)))
    else setMIdx((i) => Math.min(metrics.length - 1, Math.max(0, i + d)))
  }

  if (prep) return <SkeletonCards count={1} lines={6} />
  if (!metrics.length) {
    return <p className="muted small">{L('אין קטגוריות בקטלוג.', 'No categories in the catalog.')}</p>
  }

  return (
    <div className="pd">
      <header className="pd-head pd-head--round">
        <div className="pd-head-tx">
          <h2 className="pd-name">{L('סבב דירוג · ', 'Rating round · ')}{trTeam(team)}</h2>
          <span className="pd-meta">
            {mode === 'player'
              ? L(`שחקן אחד על המסך, כל ${metrics.length} הקטגוריות. הדירוג נשמר לתאריך של היום.`,
                   `One player, all ${metrics.length} categories. Saved under today’s date.`)
              : L('קטגוריה אחת, כל הקבוצה — ככה הדירוג יוצא עקבי בין השחקנים.',
                   'One category, the whole team — this keeps the scale consistent.')}
          </span>
        </div>
        <span className="pd-round-count">
          <bdi dir="ltr">{mode === 'player' ? `${donePlayers}/${teamRoster.length}` : `${doneMetrics}/${metrics.length}`}</bdi>{' '}
          {mode === 'player' ? L('שחקנים הושלמו', 'players done') : L('קטגוריות הושלמו', 'categories done')}
        </span>
      </header>

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

      <div className="pd-prog" aria-hidden="true">
        {(mode === 'player' ? teamRoster : metrics).map((x, i) => {
          const cur = i === (mode === 'player' ? pIdx : mIdx)
          const ok = mode === 'player' ? playerDone(x) : metricDone(x)
          return <span key={x.id || x.key} className={`pd-prog-i${cur ? ' cur' : ''}${ok ? ' ok' : ''}`} />
        })}
      </div>

      {mode === 'player' ? (
        <section className="pd-card pd-sheet">
          <div className="pd-sheet-h">
            {player.number ? <span className="pd-num" dir="ltr">{player.number}</span> : null}
            <div>
              <b className="pd-sheet-name as-text">{player.name}</b>
              <span className="pd-meta dark">{[player.position, trTeam(player.team)].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="muted small pd-sheet-count">
              <bdi dir="ltr">{metrics.filter((m) => doneToday(player, m.key)).length}/{metrics.length}</bdi> {L('עודכנו היום', 'updated today')}
            </span>
          </div>
          {catalog.cats.map((c) => (
            <div key={c.key} className="pd-sheet-cat">
              <h4>{c.label}</h4>
              <ul className="pd-metrics">
                {c.metrics.map((m) => (
                  <li key={m.key} className={doneToday(player, m.key) ? 'pd-metric is-new' : 'pd-metric'}>
                    <span className="pd-metric-k">{m.label}</span>
                    <Dots value={valOf(player, m.key)} name={`${player.name} · ${m.label}`}
                      onChange={(v) => setValue(pidOf(player), m.key, v)} />
                    <DeltaIcon from={seriesPrev(seriesOf(player, m.key))} to={valOf(player, m.key)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : (
        <section className="pd-card pd-sheet">
          <div className="pd-sheet-h">
            <div>
              <span className="pd-sheet-kick">{metric.catLabel}</span>
              <b className="pd-sheet-name as-text">{metric.label}</b>
            </div>
            <span className="muted small pd-sheet-count">
              <bdi dir="ltr">{mIdx + 1}/{metrics.length}</bdi> {L('קטגוריות', 'categories')}
            </span>
          </div>
          <ul className="pd-metrics">
            {teamRoster.map((r) => (
              <li key={r.id} className={doneToday(r, metric.key) ? 'pd-metric is-new' : 'pd-metric'}>
                <span className="pd-metric-k pd-metric-player">
                  {r.number ? <span className="pd-num sm" dir="ltr">{r.number}</span> : null} {r.name}
                </span>
                <Dots value={valOf(r, metric.key)} name={`${r.name} · ${metric.label}`}
                  onChange={(v) => setValue(pidOf(r), metric.key, v)} />
                <DeltaIcon from={seriesPrev(seriesOf(r, metric.key))} to={valOf(r, metric.key)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="pd-nav">
        <button type="button" className="btn-soft" onClick={() => step(-1)} disabled={atStart}>
          <ChevronRight size={16} /> {L('הקודם', 'Previous')}
        </button>
        <span className="pd-nav-mid">
          {mode === 'player'
            ? L(`שחקן ${pIdx + 1} מתוך ${teamRoster.length}`, `Player ${pIdx + 1} of ${teamRoster.length}`)
            : L(`קטגוריה ${mIdx + 1} מתוך ${metrics.length}`, `Category ${mIdx + 1} of ${metrics.length}`)}
        </span>
        <button type="button" className="btn-primary pd-nav-next" onClick={() => step(1)} disabled={atEnd}>
          {L('הבא', 'Next')} <ChevronLeft size={16} />
        </button>
      </div>
      {atEnd && (
        <p className="pd-nav-end">
          {L('זה האחרון. כל דירוג נשמר לתאריך של היום, והגרף בתיק קיבל נקודה חדשה.',
             'That was the last one. Every rating is saved under today’s date and the chart has a new point.')}
        </p>
      )}
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
      setRoles(r.roles || [])
      setCoaches(c.coaches || [])
      setAccess(a.access || [])
      setLoading(false)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club, rosterRow?.id])

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
  const revoke = async (row) => {
    const { error } = await api.revokeAccess({ personId, coachId: row.coach_id })
    if (error) { toast.error(L('ההסרה נכשלה', 'Remove failed')); return }
    setAccess((cur) => cur.filter((x) => x.coach_id !== row.coach_id))
  }

  if (loading) return <SkeletonCards count={2} lines={4} />

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
              <li><b>{manager.name}</b> <span className="pd-grant-lvl auto">{L('לפי המבנה — מנהל מועדון', 'By structure — club manager')}</span></li>
            )}
            {access.map((a) => (
              <li key={a.coach_id}>
                <b>{a.name}</b>
                <span className="pd-grant-lvl">{a.level === 'edit' ? L('צפייה ועריכה', 'View & edit') : L('צפייה', 'View')}</span>
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
