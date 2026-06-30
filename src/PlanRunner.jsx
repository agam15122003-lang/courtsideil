import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { L, tr } from './i18n'

// מצב הרצת אימון — טיימר גדול לכל תרגיל, עם מעבר בין התרגילים ברצף.
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
  const hasDur = (current?.duration_minutes || 0) > 0

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

  const next = () => setIndex((i) => Math.min(i + 1, items.length - 1))
  const prev = () => setIndex((i) => Math.max(i - 1, 0))
  const resetTimer = () => {
    setSecondsLeft((current?.duration_minutes || 0) * 60)
    setPaused(false)
  }

  return (
    <div className="welcome-card">
      <button className="link-button" onClick={onExit}>
        <ArrowRight size={15} className="back-ic" /> {L('סיום וחזרה לתוכנית', 'Finish and back to plan')}
      </button>

      <p className="muted small" style={{ marginTop: 10 }}>
        {planName} {L(`· תרגיל ${index + 1} מתוך ${items.length}`, `· drill ${index + 1} of ${items.length}`)}
      </p>

      <div className="runner-progress" aria-hidden="true">
        <div
          className="runner-progress-fill"
          style={{ width: `${((index + 1) / items.length) * 100}%` }}
        />
      </div>

      <div style={{ textAlign: 'center' }}>
        <h2 className="runner-title">{d.title || L('תרגיל', 'Drill')}</h2>
        {d.category && <span className="cat-badge">{tr(d.category)}</span>}
      </div>

      <div className={timeUp ? 'runner-timer up' : 'runner-timer'}>
        {hasDur ? `${mm}:${ss}` : '—'}
      </div>

      {timeUp && <p className="runner-timeup">{L('הזמן נגמר', "Time's up")}</p>}
      {!hasDur && (
        <p className="muted small" style={{ textAlign: 'center' }}>
          {L('לתרגיל הזה לא הוגדר משך — עבור ל"הבא" כשתסיים.', 'No duration set for this drill — tap "Next" when you finish.')}
        </p>
      )}

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
            className="btn-primary"
            style={{ marginTop: 0 }}
            onClick={() => setPaused((p) => !p)}
            disabled={timeUp}
          >
            {paused ? L('המשך', 'Resume') : L('השהה', 'Pause')}
          </button>
        )}
        {hasDur && (
          <button className="btn-ghost" onClick={resetTimer}>
            {L('איפוס', 'Reset')}
          </button>
        )}
        <button
          className="btn-ghost"
          onClick={next}
          disabled={index === items.length - 1}
        >
          {L('הבא', 'Next')}
        </button>
      </div>
    </div>
  )
}
