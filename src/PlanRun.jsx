import { useEffect, useRef, useState } from 'react'
import { Pencil, Printer, UserCheck } from 'lucide-react'
import { ArrowBack } from './DirIcon'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import PlanSheet from './PlanSheet'
import { notDeployed } from './PlanNotebook'
import { SkeletonCards } from './Skeleton'
import { ErrorState } from './states'
import LineupsSection from './LineupsSection'

// «פתח כתוכנית» — מסך האימון. 29.8.2026, לבקשת הבעלים:
// אחרי שהתוכנית נשמרה, פותחים אותה כדף נקי (בלי עורך ובלי סרגל — מצב
// מיקוד) ומסמנים עליו נוכחות. זה המסך שפותחים באולם.
//
// ⚠ הנוכחות כאן נשמרת **מיד, בכל הקשה** — אין כפתור שמירה. באולם אין
//   זמן ל«שמור», והקשה שנשמרה היא הקשה שלא הולכת לאיבוד. הקשה שנכשלה
//   ברשת מוחזרת לאחור עם טוסט — המסך לא משקר.
// ⚠ לא כותבים «נוכח» לכל הסגל מעצמנו: נשמר רק שחקן שהמאמן הקיש עליו.
//   (תוכנית שנפתחה לפני האימון הייתה מסמנת נוכחות לכולם — הבאג שכבר
//   תוקן פעם במחברת. אותו כלל בדיוק.)
//
// props:
//   session       - המשתמש המחובר
//   planId        - התוכנית
//   onBack()      - חזרה לרשימה
//   onEdit(id)    - מעבר לעריכה במחברת

const REASONS = () => [
  { k: 'injury', he: 'פציעה', en: 'Injury' },
  { k: 'sick', he: 'מחלה', en: 'Sick' },
  { k: 'school', he: 'לימודים', en: 'School' },
  { k: 'family', he: 'משפחה', en: 'Family' },
  { k: 'other', he: 'אחר', en: 'Other' },
]
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

// אותן שלוש דרגות מסד כמו בשאר מסכי התוכניות
const RUN_COLS = [
  'id, name, created_by, body, ink, courts, team, session_date, duration_minutes, plan_items(id, drill_id, position, part, duration_minutes, note, title, description, drill:drills(id, title, description, duration_minutes, category, board))',
  'id, name, created_by, plan_items(id, drill_id, position, part, duration_minutes, note, title, description, drill:drills(id, title, description, duration_minutes, category, board))',
  'id, name, created_by, plan_items(id, drill_id, position, duration_minutes, note, drill:drills(id, title, description, duration_minutes, category, board))',
]

export default function PlanRun({ session, planId, onBack, onEdit }) {
  const me = session.user.id
  const [state, setState] = useState({ loading: true, error: null, plan: null, items: [] })
  const [tick, setTick] = useState(0)

  const [roster, setRoster] = useState([])
  const [rosterError, setRosterError] = useState(null)
  const [att, setAtt] = useState({}) // team_players.id -> {status, preset, text, saving}
  const reasonTimers = useRef({})

  // תוכנית בלי תאריך עדיין צריכה נוכחות — הרישום ממופתח לקבוצה+תאריך,
  // ולכן מציעים תאריך (ברירת מחדל: היום) שהמאמן יכול לשנות.
  const todayISO = () => {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const [dateOverride, setDateOverride] = useState(todayISO)
  const team = state.plan?.team || ''
  const date = state.plan?.session_date || dateOverride

  // ---------- טעינת התוכנית ----------
  useEffect(() => {
    let alive = true
    ;(async () => {
      setState((s) => ({ ...s, loading: true, error: null }))
      let tier = 0
      let { data, error } = await supabase.from('training_plans').select(RUN_COLS[0]).eq('id', planId).single()
      while (error && notDeployed(error) && tier < RUN_COLS.length - 1) {
        tier += 1
        ;({ data, error } = await supabase.from('training_plans').select(RUN_COLS[tier]).eq('id', planId).single())
      }
      if (!alive) return
      if (error || !data) {
        setState({ loading: false, error: L('שגיאה בטעינת התוכנית: ', 'Failed to load plan: ') + (error?.message || ''), plan: null, items: [] })
        return
      }
      const { data: pr } = await supabase.from('profiles').select('first_name, last_name, club').eq('id', data.created_by).maybeSingle()
      if (!alive) return
      const coach = pr ? { club: pr.club || '', name: `${pr.first_name || ''} ${pr.last_name || ''}`.trim() } : {}
      setState({ loading: false, error: null, plan: { ...data, coach }, items: data.plan_items || [] })
    })()
    return () => { alive = false }
  }, [planId, tick])

  // ---------- הסגל והנוכחות שכבר סומנה ----------
  useEffect(() => {
    if (!team || !date) { setRoster([]); return }
    let alive = true
    ;(async () => {
      const [plRes, attRes] = await Promise.all([
        supabase.from('team_players').select('id, name, number, status').eq('coach_id', me).eq('team', team),
        supabase.from('practice_attendance').select('player_id, status, reason').eq('coach_id', me).eq('team', team).eq('session_date', date),
      ])
      let attRows = attRes.data
      if (attRes.error && notDeployed(attRes.error)) {
        const r = await supabase.from('practice_attendance').select('player_id, status').eq('coach_id', me).eq('team', team).eq('session_date', date)
        attRows = r.data
      }
      if (!alive) return
      if (plRes.error) {
        setRosterError(L('טעינת הסגל נכשלה: ', 'Failed to load the roster: ') + plRes.error.message)
        return
      }
      setRosterError(null)
      setRoster(sortRoster(plRes.data || []))
      const next = {}
      for (const r of attRows || []) {
        const { preset, text } = splitReason(r.reason)
        next[r.player_id] = { status: r.status || 'present', preset, text }
      }
      setAtt(next)
    })()
    return () => { alive = false }
  }, [team, date, me])

  // ---------- שמירה מיידית ----------
  const persist = async (playerId, entry) => {
    const row = {
      coach_id: me, team, session_date: date, player_id: playerId,
      status: entry.status || 'present',
      reason: entry.status === 'present' ? null : (joinReason(entry.preset, entry.text) || null),
    }
    let { error } = await supabase.from('practice_attendance').upsert(row, { onConflict: 'coach_id,team,session_date,player_id' })
    if (error && notDeployed(error)) {
      const { reason, ...bare } = row
      ;({ error } = await supabase.from('practice_attendance').upsert(bare, { onConflict: 'coach_id,team,session_date,player_id' }))
    }
    return error
  }

  const attOf = (id) => att[id] || { status: null, preset: '', text: '' }

  const tapStatus = async (playerId, status) => {
    const prev = attOf(playerId)
    const next = { ...prev, status }
    setAtt((cur) => ({ ...cur, [playerId]: next }))
    const error = await persist(playerId, next)
    if (error) {
      // ההקשה לא נשמרה — מחזירים את המסך לאמת ואומרים זאת
      setAtt((cur) => ({ ...cur, [playerId]: prev }))
      toast.error(L('הסימון לא נשמר — נסו שוב.', 'The mark was not saved — try again.'))
    }
  }

  const editReason = (playerId, patch) => {
    const next = { ...attOf(playerId), ...patch }
    setAtt((cur) => ({ ...cur, [playerId]: next }))
    // הסיבה נשמרת בהשהיה קצרה — לא upsert על כל אות
    clearTimeout(reasonTimers.current[playerId])
    reasonTimers.current[playerId] = setTimeout(async () => {
      const error = await persist(playerId, next)
      if (error) toast.error(L('הסיבה לא נשמרה — נסו שוב.', 'The reason was not saved — try again.'))
    }, 600)
  }
  useEffect(() => () => { Object.values(reasonTimers.current).forEach(clearTimeout) }, [])

  const marked = roster.filter((p) => attOf(p.id).status)
  const attending = marked.filter((p) => attOf(p.id).status !== 'absent').length

  if (state.loading) {
    return <div className="welcome-card nbk-focus"><SkeletonCards count={1} lines={6} /></div>
  }
  if (state.error) {
    return (
      <div className="welcome-card nbk-focus">
        <button className="link-button" onClick={onBack}>
          <ArrowBack size={15} className="back-ic" /> {L('כל התוכניות', 'All plans')}
        </button>
        <ErrorState message={state.error} onRetry={() => setTick((t) => t + 1)} />
      </div>
    )
  }

  return (
    <div className="welcome-card nbk-focus plan-run">
      <button className="link-button" onClick={onBack}>
        <ArrowBack size={15} className="back-ic" /> {L('כל התוכניות', 'All plans')}
      </button>
      <div className="nb-actions" style={{ marginTop: 12 }}>
        <button className="btn-soft" onClick={() => onEdit?.(planId)}>
          <Pencil size={16} /> {L('עריכה במחברת', 'Edit in the notebook')}
        </button>
        <button className="btn-soft" onClick={() => window.print()}>
          <Printer size={16} /> {L('הדפסה', 'Print')}
        </button>
      </div>

      <PlanSheet plan={state.plan} items={state.items} />

      {/* ---- נוכחות — נשמרת מיד בכל הקשה ---- */}
      <section className="nbk-att plan-run-att" aria-label={L('נוכחות', 'Attendance')}>
        <div className="nbk-att-h">
          <span className="nbk-att-title"><UserCheck size={16} /> {L('נוכחות', 'Attendance')}{team ? ` — ${trTeam(team)}` : ''}</span>
          {roster.length > 0 && marked.length > 0 && (
            <span className="muted small"><span dir="ltr">{attending}/{roster.length}</span> {L('נוכחים', 'present')}</span>
          )}
        </div>
        {team && !state.plan?.session_date && (
          <p className="muted small nbk-att-hint plan-run-date">
            {L('לתוכנית אין תאריך — הנוכחות תירשם לתאריך: ', 'This plan has no date — attendance is recorded for: ')}
            <input type="date" dir="ltr" value={dateOverride} onChange={(e) => setDateOverride(e.target.value || todayISO())} aria-label={L('תאריך הנוכחות', 'Attendance date')} />
          </p>
        )}
        {!team ? (
          <p className="muted small nbk-att-hint">{L('לתוכנית הזו אין קבוצה — פתחו אותה במחברת ובחרו קבוצה כדי לסמן נוכחות.', 'This plan has no team — open it in the notebook and pick a team to mark attendance.')}</p>
        ) : rosterError ? (
          <ErrorState compact message={rosterError} onRetry={() => setTick((t) => t + 1)} />
        ) : roster.length === 0 ? (
          <p className="muted small nbk-att-hint">{L('אין שחקנים בקבוצה הזו עדיין — מוסיפים ב«הקבוצות שלי».', 'No players on this team yet — add them in “My teams”.')}</p>
        ) : (
          <>
            <p className="muted small nbk-att-hint">{L('כל הקשה נשמרת מיד — אין צורך בכפתור שמירה.', 'Every tap saves instantly — no save button needed.')}</p>
            <ul className="nbk-att-list">
              {roster.map((p) => {
                const a = attOf(p.id)
                return (
                  <li key={p.id} className={`nbk-att-row is-${a.status || 'unmarked'}`}>
                    <span className="nbk-att-name">
                      {p.number ? <bdi className="nbk-att-num">{p.number}</bdi> : null}
                      {p.name}
                    </span>
                    <span className="nbk-att-seg" role="group" aria-label={L(`נוכחות ${p.name}`, `${p.name} attendance`)}>
                      <button type="button" className={a.status === 'present' ? 'on' : ''} aria-pressed={a.status === 'present'} onClick={() => tapStatus(p.id, 'present')}>{L('נוכח', 'Present')}</button>
                      <button type="button" className={a.status === 'late' ? 'on late' : ''} aria-pressed={a.status === 'late'} onClick={() => tapStatus(p.id, 'late')}>{L('איחר', 'Late')}</button>
                      <button type="button" className={a.status === 'absent' ? 'on absent' : ''} aria-pressed={a.status === 'absent'} onClick={() => tapStatus(p.id, 'absent')}>{L('נעדר', 'Absent')}</button>
                    </span>
                    {(a.status === 'late' || a.status === 'absent') && (
                      <span className="nbk-att-reason-in">
                        <select value={a.preset} onChange={(e) => editReason(p.id, { preset: e.target.value })} aria-label={L('סיבה', 'Reason')}>
                          <option value="">{L('סיבה…', 'Reason…')}</option>
                          {REASONS().map((r) => <option key={r.k} value={r.k}>{L(r.he, r.en)}</option>)}
                        </select>
                        <input
                          type="text"
                          value={a.text}
                          onChange={(e) => editReason(p.id, { text: e.target.value })}
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
          </>
        )}
      </section>

      {/* ---- הרכבים מוכנים — פרטיים למאמן ---- */}
      <LineupsSection session={session} planId={planId} team={team} roster={roster} />
    </div>
  )
}
