import { useEffect, useState } from 'react'
import { Clock, Users, CalendarDays } from 'lucide-react'
import NotebookBody from './NotebookBody'
import MiniCourt from './MiniCourt'
import { supabase } from './supabaseClient'
import { SkeletonCards } from './Skeleton'
import { ErrorState } from './states'
import { L, trTeam } from './i18n'

// דף המחברת של תוכנית — לקריאה בלבד. אותו דף בשלושה מקומות:
//   • «תצוגה מקדימה / הדפסה» מתוך העורך (המאמן)
//   • תוכנית קהילה («צפה כמערך אימון»)
//   • השחקן שקיבל את התוכנית (כשהמאמן בחר «הדף כולו»)
//
// plan: { name, team, session_date, duration_minutes, body, ink, courts, coach:{name, club} }
// attendance (אופציונלי, למאמן בלבד): [{ name, number, status, reason }]
// items (אופציונלי): תרגילים מקושרים — מוצגים רק כשאין גוף (תוכנית ישנה)

const fmtDate = (d) => {
  if (!d) return ''
  const x = new Date(String(d).slice(0, 10) + 'T00:00')
  if (Number.isNaN(x.getTime())) return String(d)
  return x.toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric', year: 'numeric' })
}

export function legacyItemsToBody(items) {
  const rows = (items || []).slice().sort((a, b) => ((a.part || 1) - (b.part || 1)) || ((a.position || 0) - (b.position || 0)))
  const parts = new Map()
  for (const it of rows) {
    const p = it.part || 1
    if (!parts.has(p)) parts.set(p, [])
    parts.get(p).push(it)
  }
  // הטקסט נשמר במסד ולכן תמיד בעברית — גם אם הממשק כרגע באנגלית
  // (מאמן אחר שיעתיק את התוכנית לא אמור לקבל דף באנגלית).
  const lines = []
  const many = parts.size > 1
  let n = 0
  for (const [, its] of parts) {
    n += 1
    if (many) lines.push(`חלק ${n}`)
    for (const it of its) {
      const d = it.drill || {}
      const title = d.title || it.title || 'תרגיל'
      const dur = it.duration_minutes ? ` — ${it.duration_minutes} דק׳` : ''
      lines.push(title + dur)
      const desc = it.note || d.description || it.description
      if (desc) lines.push(desc)
      lines.push('')
    }
  }
  return lines.join('\n').trim()
}

// דף תוכנית לפי מזהה — טוען את התוכנית (עם נפילה למסד שטרם הריץ את המיגרציה),
// את הפריטים המקושרים ואת פרטי המאמן, ומציג PlanSheet. משמש את הקהילה
// («צפה כמערך אימון») ואת הלו"ז (תוכנית שמצורפת לאימון).
// שלוש דרגות מסד (כמו במחברת): הדרגה האמצעית שומרת על title/description/part
// של הפריטים, כדי ששורות חופשיות בתוכנית ישנה לא ייראו כ«תרגיל» ריק.
const SHEET_ITEMS = 'plan_items(id, drill_id, position, part, duration_minutes, note, title, description, drill:drills(id, title, description, duration_minutes, category, board))'
const SHEET_ITEMS_BARE = 'plan_items(id, drill_id, position, duration_minutes, note, drill:drills(id, title, description, duration_minutes, category, board))'
const SHEET_COLS = [
  `id, name, created_by, body, ink, courts, team, session_date, duration_minutes, ${SHEET_ITEMS}`,
  `id, name, created_by, ${SHEET_ITEMS}`,
  `id, name, created_by, ${SHEET_ITEMS_BARE}`,
]
const missingCol = (e) => ['42703', 'PGRST204'].includes(e?.code) || /does not exist|could not find/i.test(e?.message || '')

export function PlanSheetById({ planId }) {
  const [state, setState] = useState({ loading: true, error: null, plan: null, items: [] })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    ;(async () => {
      setState((s) => ({ ...s, loading: true, error: null }))
      let tier = 0
      let { data, error } = await supabase.from('training_plans').select(SHEET_COLS[0]).eq('id', planId).single()
      while (error && missingCol(error) && tier < SHEET_COLS.length - 1) {
        tier += 1
        ;({ data, error } = await supabase.from('training_plans').select(SHEET_COLS[tier]).eq('id', planId).single())
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

  if (state.loading) return <SkeletonCards count={1} lines={6} />
  if (state.error) return <ErrorState message={state.error} onRetry={() => setTick((t) => t + 1)} />
  return <PlanSheet plan={state.plan} items={state.items} />
}

export default function PlanSheet({ plan, attendance, items }) {
  if (!plan) return null
  // גוף ריק ('') = דף שהמאמן השאיר ריק בכוונה (למשל כתב יד בלבד);
  // רק כשאין עמודת גוף בכלל (null) נופלים לפריטים הישנים.
  const body = plan.body != null ? plan.body : legacyItemsToBody(items)
  const courts = Array.isArray(plan.courts) ? plan.courts : []
  const drawnCourts = courts.filter((c) => {
    const st = c?.board?.steps || []
    return st.length > 1 || st.some((x) => (x.ink || []).length || (x.objects || []).length || (x.arrows || []).length)
  })
  const coach = plan.coach || {}
  const statusLabel = (s) => (s === 'late' ? L('איחר', 'Late') : s === 'absent' ? L('נעדר', 'Absent') : L('נוכח', 'Present'))

  return (
    <div className="notebook nbk nbk-sheet" dir="rtl">
      <div className="nb-header">
        <div className="nb-header-top">
          <span className="nb-club">{coach.club || 'CourtSide'}</span>
          <span className="nb-date">{fmtDate(plan.session_date) || ''}</span>
        </div>
        <h2 className="nb-title">{L('מערך אימון', 'Practice Plan')}</h2>
        {coach.name && <div className="nb-coach">{L('שם המאמן: ', 'Coach: ')}{coach.name}</div>}
      </div>

      <div className="nbk-page">
        <div className="nbk-main">
          <h3 className="nbk-name">{plan.name}</h3>
          <div className="nb-edit-meta nbk-meta">
            <span className="nb-slot">
              <Users size={14} aria-hidden="true" />
              <span className="nb-slot-k">{L('קבוצה', 'Team')}</span>
              <span className="nb-slot-in ro">{plan.team ? trTeam(plan.team) : '—'}</span>
            </span>
            <span className="nb-slot">
              <CalendarDays size={14} aria-hidden="true" />
              <span className="nb-slot-k">{L('תאריך', 'Date')}</span>
              <span className="nb-slot-in ro" dir="ltr">{fmtDate(plan.session_date) || '—'}</span>
            </span>
            <span className="nb-slot">
              <Clock size={14} aria-hidden="true" />
              <span className="nb-slot-k">{L('משך', 'Duration')}</span>
              <span className="nb-slot-in ro">
                {plan.duration_minutes ? <><bdi>{plan.duration_minutes}</bdi> {L('דק׳', 'min')}</> : '—'}
              </span>
            </span>
          </div>

          <NotebookBody value={body || ''} ink={plan.ink || []} minLines={body ? 4 : 8} />

          {attendance && attendance.length > 0 && (
            <section className="nbk-att nbk-att-ro">
              <div className="nbk-att-h">
                <span>{L('נוכחות', 'Attendance')}</span>
                <span className="muted small">
                  <span dir="ltr">{attendance.filter((a) => a.status !== 'absent').length}/{attendance.length}</span> {L('נוכחים', 'present')}
                </span>
              </div>
              <ul className="nbk-att-list ro">
                {attendance.map((a, i) => (
                  <li key={i} className={`nbk-att-row is-${a.status || 'present'}`}>
                    <span className="nbk-att-name">
                      {a.number ? <bdi className="nbk-att-num">{a.number}</bdi> : null}
                      {a.name}
                    </span>
                    <span className="nbk-att-status">{statusLabel(a.status)}</span>
                    {a.reason && <span className="nbk-att-reason">{a.reason}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* בתצוגה/הדפסה/שליחה לשחקנים מוצגים רק מגרשים שיש עליהם משהו —
            מגרש ריק הוא כלי עבודה של המאמן, לא חלק מהדף */}
        {drawnCourts.length > 0 && (
          <aside className="nbk-courts" aria-label={L('מגרשים', 'Courts')}>
            {drawnCourts.map((c, i) => (
              <MiniCourt key={c.id || i} board={c.board} index={i} />
            ))}
          </aside>
        )}
      </div>
    </div>
  )
}
