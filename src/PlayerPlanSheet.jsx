import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, BookOpen, Clock } from 'lucide-react'
import { supabase } from './supabaseClient'
import { L } from './i18n'
import useFocusTrap from './useFocusTrap'
import PlanSheet from './PlanSheet'
import { SkeletonCards } from './Skeleton'
import { ErrorState } from './states'

// גיליון «תוכנית האימון» בעולם השחקן — 18.8.
// עד היום שחקן ראה מתוכנית ששוגרה אליו רק את *השם*. עכשיו המאמן בוחר בכל
// שליחה מה השחקן רואה: רשימת התרגילים (שם + תוכן) או דף המחברת כולו.
// המידע מגיע מ-RPC plan_for_player (supabase_notebook_18_8.sql) — הפונקציה
// עצמה מחזירה את הגוף רק כשנבחר «הדף כולו», כך שהפרונט לא צריך להסתיר כלום.
//
// ⚠ createPortal ל-body בכוונה (כמו CoachCardSheet): .main-inner מסיים
// אנימציה עם transform שהופך אותו ל-containing block ל-position:fixed.
export default function PlayerPlanSheet({ planId, title, onClose }) {
  const ref = useFocusTrap(true, onClose)
  const [state, setState] = useState({ loading: true, error: null, plan: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setState((s) => ({ ...s, loading: true, error: null }))
      const { data, error } = await supabase.rpc('plan_for_player', { p_plan: planId })
      if (!alive) return
      if (error) {
        // מסד שטרם הריץ את המיגרציה — הפונקציה לא קיימת
        const notDeployed = ['42883', 'PGRST202'].includes(error.code) || /does not exist|could not find/i.test(error.message || '')
        setState({
          loading: false,
          error: notDeployed
            ? L('התוכנית עוד לא זמינה לצפייה מהאפליקציה — המאמן צריך לעדכן את המערכת.', 'The plan is not viewable from the app yet — the coach needs to update the system.')
            : L('שגיאה בטעינת התוכנית: ', 'Failed to load the plan: ') + error.message,
          plan: null,
        })
        return
      }
      if (!data) {
        setState({ loading: false, error: L('התוכנית לא זמינה — אולי הוסרה או שהשליחה בוטלה.', 'The plan is unavailable — it may have been removed or the assignment cancelled.'), plan: null })
        return
      }
      setState({ loading: false, error: null, plan: data })
    })()
    return () => { alive = false }
  }, [planId, tick])

  const plan = state.plan
  const items = plan?.items || []

  return createPortal(
    <div className="ps ps-overlay" data-page="pplan">
      <button type="button" className="ps-scrim" onClick={onClose} aria-label={L('סגירה', 'Close')} />
      <div className="ps-sheet pps-sheet" ref={ref} role="dialog" aria-modal="true" aria-label={L('תוכנית אימון', 'Practice plan')}>
        <div className="ps-sheet-head">
          <span className="ps-av-lg ps-av-lg--soft" aria-hidden="true"><BookOpen size={20} /></span>
          <span className="ps-sheet-tx">
            <span className="ps-sheet-kick">{L('תוכנית אימון מהמאמן', 'Practice plan from your coach')}</span>
            <b className="ps-sheet-title">{plan?.name || title || L('תוכנית אימון', 'Practice plan')}</b>
            {plan?.coach?.name && <span className="ps-mut">{plan.coach.name}{plan.coach.club ? ` · ${plan.coach.club}` : ''}</span>}
          </span>
          <button type="button" className="ps-x" onClick={onClose} aria-label={L('סגירה', 'Close')}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {state.loading ? (
          <SkeletonCards count={2} lines={3} />
        ) : state.error ? (
          <ErrorState message={state.error} onRetry={() => setTick((t) => t + 1)} compact />
        ) : plan.view === 'page' ? (
          <div className="pps-page">
            <PlanSheet plan={plan} items={items} />
          </div>
        ) : (
          <div className="pps-list">
            {plan.duration_minutes ? (
              <span className="ps-chip ps-chip--mut"><Clock size={12} aria-hidden="true" /> {plan.duration_minutes} {L("דק'", 'min')}</span>
            ) : null}
            {items.length === 0 ? (
              <p className="ps-mut">{L('המאמן עוד לא הוסיף תרגילים מהספרייה לתוכנית הזו.', 'Your coach has not added library drills to this plan yet.')}</p>
            ) : (
              <ol className="pps-drills">
                {items.map((it, i) => (
                  <li key={it.id || i} className="pps-drill">
                    <div className="pps-drill-head">
                      <span className="pps-n">{i + 1}</span>
                      <b className="pps-title">{it.title || L('תרגיל', 'Drill')}</b>
                      {it.duration_minutes ? <span className="ps-chip ps-chip--mut" dir="ltr">{it.duration_minutes}׳</span> : null}
                    </div>
                    {it.description && <p className="pps-desc">{it.description}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
