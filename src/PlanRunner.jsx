import { useState, useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { L, tr } from './i18n'
import { useReducedMotion } from './ui/motion'

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
  const reduced = useReducedMotion() // תחת prefers-reduced-motion מדלגים על צליל/רטט
  const audioCtxRef = useRef(null) // AudioContext יחיד לכל ההרצה

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

  // התקדמות התרגיל הנוכחי — אחוז הזמן שחלף מתוך המשך
  const totalSec = (current?.duration_minutes || 0) * 60
  const elapsedPct = totalSec > 0 ? ((totalSec - secondsLeft) / totalSec) * 100 : 0

  // סוף תרגיל — צפצוף קצר (WebAudio) ורטט, בעדינות ורק כשמותר להנפיש
  useEffect(() => {
    if (!timeUp || reduced) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) {
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
        const ctx = audioCtxRef.current
        if (ctx.state === 'suspended') ctx.resume()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.06, ctx.currentTime) // ווליום נמוך
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.15)
      }
    } catch {
      /* אין תמיכה באודיו — ממשיכים בשקט */
    }
    try {
      navigator.vibrate?.(200)
    } catch {
      /* אין תמיכה ברטט */
    }
  }, [timeUp, reduced])

  // סגירת ה-AudioContext ביציאה מהמסך
  useEffect(() => {
    return () => {
      try {
        audioCtxRef.current?.close()
      } catch {
        /* כבר סגור */
      }
    }
  }, [])

  const next = () => setIndex((i) => Math.min(i + 1, items.length - 1))
  const prev = () => setIndex((i) => Math.max(i - 1, 0))
  const resetTimer = () => {
    setSecondsLeft((current?.duration_minutes || 0) * 60)
    setPaused(false)
  }

  const isLast = index === items.length - 1
  // פעולה ראשית אחת ברורה בכל רגע: השהה/המשך בזמן ריצה, "הבא"/"סיום" כשהזמן נגמר או שאין משך
  const nextIsPrimary = !hasDur || timeUp

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

      {/* פס דק — כמה מהתרגיל הנוכחי כבר עבר */}
      {hasDur && (
        <div
          className="runner-drill-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(elapsedPct)}
          aria-label={L('התקדמות התרגיל הנוכחי', 'Current drill progress')}
        >
          <div
            className={timeUp ? 'runner-drill-progress-fill up' : 'runner-drill-progress-fill'}
            style={{ width: `${elapsedPct}%` }}
          />
        </div>
      )}

      {timeUp && <p className="runner-timeup" role="status">{L('הזמן נגמר', "Time's up")}</p>}
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
            className={nextIsPrimary ? 'btn-ghost' : 'btn-primary'}
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
        {isLast ? (
          /* בתרגיל האחרון "הבא" מוחלף בסיום — תמיד יש פעולה ראשית זמינה */
          <button
            className={nextIsPrimary ? 'btn-primary' : 'btn-ghost'}
            style={{ marginTop: 0 }}
            onClick={onExit}
          >
            {L('סיום האימון', 'Finish practice')}
          </button>
        ) : (
          <button
            className={nextIsPrimary ? 'btn-primary' : 'btn-ghost'}
            style={{ marginTop: 0 }}
            onClick={next}
          >
            {L('הבא', 'Next')}
          </button>
        )}
      </div>
    </div>
  )
}
