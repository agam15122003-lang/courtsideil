import { useState, useEffect } from 'react'
import { ArrowRight, Play, Pause, RotateCcw } from 'lucide-react'
import { L, tr } from './i18n'

// מצב הרצת אימון — "שידור חי": טיימר ענק על במה כהה בסגנון ברודקאסט,
// סגמנט התקדמות לכל תרגיל ופס זמן שמתרוקן (scaleX — בלי לאנמט width).
// props:
//   items    - פריטי התוכנית (כולל drill, duration_minutes, note)
//   planName - שם התוכנית
//   onExit   - יציאה חזרה לבונה התוכנית
export default function PlanRunner({ items, planName, onExit }) {
  const [index, setIndex] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(
    (items[0]?.duration_minutes || 0) * 60
  )
  const [paused, setPaused] = useState(false)

  const current = items[index]
  const d = current?.drill || {}
  const totalSeconds = (current?.duration_minutes || 0) * 60
  const hasDur = totalSeconds > 0

  // מעבר תרגיל — איפוס הטיימר למשך של התרגיל החדש
  useEffect(() => {
    setSecondsLeft((items[index]?.duration_minutes || 0) * 60)
    setPaused(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // טיק כל שנייה (כשלא בהשהיה)
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 0 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [paused, index])

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const timeUp = hasDur && secondsLeft === 0
  const frac = hasDur ? secondsLeft / totalSeconds : 0 // חלק הזמן שנותר (0..1)

  const next = () => setIndex((i) => Math.min(i + 1, items.length - 1))
  const prev = () => setIndex((i) => Math.max(i - 1, 0))
  const resetTimer = () => {
    setSecondsLeft(totalSeconds)
    setPaused(false)
  }
  const nextItem = items[index + 1]
  const nextTitle = nextItem ? nextItem.drill?.title || nextItem.title : null

  return (
    <div className="welcome-card runner-live">
      <button className="link-button" onClick={onExit}>
        <ArrowRight size={15} className="back-ic" /> {L('סיום וחזרה לתוכנית', 'Finish and back to plan')}
      </button>

      {/* eyebrow שידור חי — נקודה פועמת + שם התוכנית */}
      <div className="runner-eyebrow">
        <span className="runner-live-dot" aria-hidden="true" />
        {L('אימון חי', 'Live practice')} · {planName}
      </div>

      {/* סגמנט לכל תרגיל — רואים את ההתקדמות, לא רק קוראים אותה */}
      <div
        className="runner-steps"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={items.length}
        aria-valuenow={index + 1}
        aria-label={L(`תרגיל ${index + 1} מתוך ${items.length}`, `Drill ${index + 1} of ${items.length}`)}
      >
        {items.map((it, i) => (
          <span
            key={it.id}
            className={i < index ? 'runner-step done' : i === index ? 'runner-step current' : 'runner-step'}
          />
        ))}
      </div>
      <p className="runner-count muted small">
        {L(`תרגיל ${index + 1} מתוך ${items.length}`, `Drill ${index + 1} of ${items.length}`)}
      </p>

      {/* הבמה — לוח תוצאות נייבי עם קווי מגרש */}
      <div className={timeUp ? 'runner-stage time-up' : 'runner-stage'}>
        <h2 className="runner-title">{d.title || current?.title || L('תרגיל', 'Drill')}</h2>
        {d.category && <span className="cat-badge" data-cat={d.category}>{tr(d.category)}</span>}

        <div className={timeUp ? 'runner-timer up' : 'runner-timer'} role="timer">
          {hasDur ? `${mm}:${ss}` : '—'}
        </div>

        {hasDur && (
          <div className="runner-timebar" aria-hidden="true">
            <div className="runner-timebar-fill" style={{ transform: `scaleX(${frac})` }} />
          </div>
        )}

        {timeUp && <p className="runner-timeup" role="status">{L('הזמן נגמר', "Time's up")}</p>}
        {!hasDur && (
          <p className="runner-nodur">
            {L('לתרגיל הזה לא הוגדר משך — עבור ל"הבא" כשתסיים.', 'No duration set for this drill — tap "Next" when you finish.')}
          </p>
        )}
      </div>

      {current?.note && (
        <div className="drill-notes" style={{ marginTop: 16 }}>
          <span className="detail-label">{L('הערה', 'Note')}</span>
          <p>{current.note}</p>
        </div>
      )}
      {d.description && <p className="drill-desc">{d.description}</p>}

      <div className="runner-controls">
        <button className="btn-ghost" onClick={prev} disabled={index === 0}>
          {L('הקודם', 'Previous')}
        </button>
        {hasDur && (
          <button
            className="btn-primary runner-main-btn"
            style={{ marginTop: 0 }}
            onClick={() => setPaused((p) => !p)}
            disabled={timeUp}
          >
            {paused ? <><Play size={17} /> {L('המשך', 'Resume')}</> : <><Pause size={17} /> {L('השהה', 'Pause')}</>}
          </button>
        )}
        {hasDur && (
          <button className="btn-ghost" onClick={resetTimer}>
            <RotateCcw size={15} /> {L('איפוס', 'Reset')}
          </button>
        )}
        <button
          className={timeUp ? 'btn-primary runner-main-btn' : 'btn-ghost'}
          style={timeUp ? { marginTop: 0 } : undefined}
          onClick={next}
          disabled={index === items.length - 1}
        >
          {L('הבא', 'Next')}
        </button>
      </div>

      {nextTitle && (
        <p className="runner-next">
          <span className="runner-next-label">{L('הבא בתור', 'Up next')}</span> {nextTitle}
        </p>
      )}
    </div>
  )
}
