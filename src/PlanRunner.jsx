import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Play, Pause, RotateCcw, Volume2, VolumeX, ChevronsUpDown } from 'lucide-react'
import { L, tr, getDir } from './i18n'
import { ChevronBack, ChevronFwd } from './DirIcon'
import useFocusTrap from './useFocusTrap'

// מצב הרצת אימון — «על הפרקט».
//
// פריט 3 במסמך המסירה: «הרגע היחיד שבו מחזיקים את הטלפון באולם. צריך:
// תרגיל נוכחי, מה הבא, טיימר, טקסט גדול שנקרא ממטר, ומעבר בלי לחפש.»
// לכן זה **מסך מלא** ולא כרטיס בתוך מעטפת האפליקציה: אין סיידבר, אין
// תפריט תחתון, אין באנר — רק מה שהמאמן צריך לראות מרחוק.
//
// שלוש החלטות שנובעות מהשימוש בפועל:
// 1. **המסך לא נכבה** באמצע אימון (Wake Lock, מתחדש אחרי חזרה מרקע).
//    אם הדפדפן לא תומך — פשוט אין נעילה, בלי הודעת שגיאה.
// 2. **סוף תרגיל נשמע**, כי המאמן לא מסתכל על הטלפון: ביפ קצר
//    (WebAudio, בלי קובץ) ורטט. יש כפתור השתקה, והבחירה נשמרת.
// 3. **הטיימר מבוסס חותמת-זמן** ולא ספירת setInterval — טלפון שננעל
//    או טאב ברקע לא "מקפיאים" את הזמן.
//
// props:
//   items    - פריטי התוכנית (כולל drill, duration_minutes, note)
//   planName - שם התוכנית
//   onExit   - יציאה חזרה לבונה התוכנית
const MUTE_KEY = 'runner_muted'

export default function PlanRunner({ items, planName, onExit }) {
  const [index, setIndex] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(
    (items[0]?.duration_minutes || 0) * 60
  )
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === '1')
  const [showDetail, setShowDetail] = useState(false)
  // כל איפוס מקדם את המונה הזה. בלעדיו אפקט הטיימר לא מורץ מחדש
  // (התלויות שלו לא משתנות), ה-deadline הישן שורד וה-tick דורס את האיפוס.
  const [resetKey, setResetKey] = useState(0)

  const current = items[index]
  const d = current?.drill || {}
  const totalSeconds = (Number(current?.duration_minutes) || 0) * 60
  const hasDur = totalSeconds > 0
  const deadlineRef = useRef(null)
  const beepedRef = useRef(false)

  // ---- נעילת גלילה מאחורי המסך המלא ----
  useEffect(() => {
    document.documentElement.classList.add('runner-open')
    return () => document.documentElement.classList.remove('runner-open')
  }, [])

  // ---- Wake Lock: המסך נשאר דולק כל עוד האימון רץ ----
  useEffect(() => {
    let lock = null
    let alive = true
    const request = async () => {
      try {
        if (!('wakeLock' in navigator)) return
        lock = await navigator.wakeLock.request('screen')
      } catch { /* נדחה (סוללה חלשה / אין תמיכה) — ממשיכים בלי */ }
    }
    request()
    // חזרה מרקע משחררת את הנעילה — מבקשים אותה מחדש
    const onVis = () => { if (alive && !document.hidden && !lock?.released) request() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      try { lock && lock.release() } catch { /* כבר שוחרר */ }
    }
  }, [])

  // ---- מעבר תרגיל — איפוס הטיימר למשך של התרגיל החדש ----
  useEffect(() => {
    setSecondsLeft((Number(items[index]?.duration_minutes) || 0) * 60)
    setPaused(false)
    setShowDetail(false)
    beepedRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // ---- הטיימר ----
  useEffect(() => {
    if (paused || !hasDur) return
    deadlineRef.current = Date.now() + secondsLeft * 1000
    const tick = () => {
      const rem = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000))
      setSecondsLeft(rem)
    }
    const id = setInterval(tick, 250)
    const onVis = () => { if (!document.hidden) tick() } // סנכרון מיידי בחזרה למסך
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, index, hasDur, resetKey])

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const timeUp = hasDur && secondsLeft === 0
  const frac = hasDur ? secondsLeft / totalSeconds : 0 // חלק הזמן שנותר (0..1)

  // ---- סוף תרגיל: ביפ + רטט, פעם אחת לכל תרגיל ----
  const beep = useCallback(() => {
    try { navigator.vibrate && navigator.vibrate([140, 70, 140]) } catch { /* לא נתמך */ }
    if (muted) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime + 0.52)
      osc.onended = () => ctx.close()
    } catch { /* דפדפן שחוסם אודיו בלי אינטראקציה — הרטט מספיק */ }
  }, [muted])

  useEffect(() => {
    if (timeUp && !beepedRef.current) { beepedRef.current = true; beep() }
  }, [timeUp, beep])

  const next = () => setIndex((i) => Math.min(i + 1, items.length - 1))
  const prev = () => setIndex((i) => Math.max(i - 1, 0))
  const resetTimer = () => {
    setSecondsLeft(totalSeconds)
    setPaused(false)
    beepedRef.current = false
    setResetKey((k) => k + 1)
  }
  const toggleMute = () => setMuted((m) => { localStorage.setItem(MUTE_KEY, m ? '0' : '1'); return !m })

  // ---- מקלדת: רווח = השהיה, חצים = מעבר, Escape = יציאה ----
  useEffect(() => {
    const onKey = (e) => {
      // Escape מטופל במלכודת הפוקוס (useFocusTrap) — לא כאן, כדי לא לסגור פעמיים
      if (e.target?.closest?.('input, textarea, select')) return
      // רווח על כפתור ממוקד הוא ההפעלה שלו; preventDefault כאן היה גונב אותה
      if (e.code === 'Space' && !e.target?.closest?.('button, a[href]')) {
        e.preventDefault(); setPaused((p) => !p)
      }
      // «קדימה» תלוי בכיוון הכתיבה: בעברית חץ שמאלה, באנגלית ימינה
      const fwd = getDir() === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
      const back = getDir() === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
      if (e.key === fwd) next()
      if (e.key === back) prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  const nextItem = items[index + 1]
  const nextTitle = nextItem ? nextItem.drill?.title || nextItem.title : null
  const nextDur = nextItem ? Number(nextItem.duration_minutes) || 0 : 0
  const detail = current?.note || d.description || current?.description
  const isLast = index === items.length - 1
  // aria-modal="true" בלי מלכודת פוקוס הוא הצהרה לא נכונה: הסיידבר
  // והתפריט התחתון נשארים בסדר ה-Tab מתחת לשכבה האטומה.
  const fsRef = useFocusTrap(true, onExit)

  return (
    <div ref={fsRef} className={timeUp ? 'runner-fs time-up' : 'runner-fs'} role="dialog" aria-modal="true"
      aria-label={L('הרצת אימון', 'Practice runner')}>
      <span className="runner-fs-art" aria-hidden="true" />

      <header className="runner-fs-top">
        <button type="button" className="runner-icon-btn" onClick={onExit}
          aria-label={L('סיום האימון וחזרה לתוכנית', 'Finish and back to the plan')}>
          <X size={20} />
        </button>
        <span className="runner-eyebrow">
          <span className="runner-live-dot" aria-hidden="true" />
          {L('אימון חי', 'Live practice')}{planName ? ` · ${planName}` : ''}
        </span>
        <button type="button" className="runner-icon-btn" onClick={toggleMute}
          aria-pressed={muted} aria-label={muted ? L('הפעלת צליל סיום', 'Unmute end sound') : L('השתקת צליל סיום', 'Mute end sound')}>
          {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>
      </header>

      {/* סגמנט לכל תרגיל — לחיצה קופצת ישירות לתרגיל, «מעבר בלי לחפש».
          לא role="progressbar": ילדיו של progressbar הם presentational לפי ARIA,
          וכל כפתורי הקפיצה היו נמחקים מעץ הנגישות — בדיוק היכולת שבשבילה נבנה
          המסך. ההתקדמות עצמה מוכרזת בשורת «תרגיל N מתוך M» שמתחת. */}
      <div
        className="runner-steps"
        role="group"
        aria-label={L('מעבר מהיר בין תרגילי האימון', 'Jump between the practice drills')}
      >
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            className={i < index ? 'runner-step done' : i === index ? 'runner-step current' : 'runner-step'}
            onClick={() => setIndex(i)}
            aria-label={L(`מעבר לתרגיל ${i + 1}`, `Go to drill ${i + 1}`)}
            aria-current={i === index ? 'step' : undefined}
          />
        ))}
      </div>

      <div className="runner-fs-body">
        <p className="runner-count">
          {L(`תרגיל ${index + 1} מתוך ${items.length}`, `Drill ${index + 1} of ${items.length}`)}
          {d.category ? <> · {tr(d.category)}</> : null}
        </p>

        <h1 className="runner-fs-title">{d.title || current?.title || L('תרגיל', 'Drill')}</h1>

        <div className={timeUp ? 'runner-fs-timer up' : 'runner-fs-timer'} role="timer" dir="ltr">
          {hasDur ? `${mm}:${ss}` : '—'}
        </div>

        {hasDur ? (
          <div className="runner-timebar" aria-hidden="true">
            <div className="runner-timebar-fill" style={{ transform: `scaleX(${frac})` }} />
          </div>
        ) : (
          <p className="runner-nodur">
            {L('לתרגיל הזה לא הוגדר משך — «הבא» כשתסיים.', 'No duration for this drill — tap “Next” when you finish.')}
          </p>
        )}

        {timeUp && <p className="runner-timeup" role="status">{L('הזמן נגמר', "Time's up")}</p>}

        {/* ההסבר לא תופס את המסך: שורה אחת, ונפתח בלחיצה כשצריך להיזכר */}
        {detail && (
          <div className={showDetail ? 'runner-detail open' : 'runner-detail'}>
            <button type="button" className="runner-detail-btn" onClick={() => setShowDetail((v) => !v)} aria-expanded={showDetail}>
              <ChevronsUpDown size={15} aria-hidden="true" />
              {showDetail ? L('הסתרת ההסבר', 'Hide the details') : L('מה עושים בתרגיל', 'What happens in this drill')}
            </button>
            {showDetail && <p className="runner-detail-text">{detail}</p>}
          </div>
        )}
      </div>

      <footer className="runner-fs-foot">
        <div className="runner-controls">
          <button type="button" className="runner-ctl" onClick={prev} disabled={index === 0}
            aria-label={L('התרגיל הקודם', 'Previous drill')}>
            <ChevronBack size={22} />
          </button>

          {hasDur ? (
            <button type="button" className="runner-play" onClick={() => setPaused((p) => !p)} disabled={timeUp}>
              {paused ? <><Play size={20} /> {L('המשך', 'Resume')}</> : <><Pause size={20} /> {L('השהה', 'Pause')}</>}
            </button>
          ) : (
            <button type="button" className="runner-play" onClick={next} disabled={isLast}>
              {L('סיימנו — לתרגיל הבא', 'Done — next drill')}
            </button>
          )}

          {hasDur && (
            <button type="button" className="runner-ctl" onClick={resetTimer} aria-label={L('איפוס הטיימר', 'Reset the timer')}>
              <RotateCcw size={19} />
            </button>
          )}

          <button type="button" className="runner-ctl" onClick={next} disabled={isLast}
            aria-label={L('התרגיל הבא', 'Next drill')}>
            <ChevronFwd size={22} />
          </button>
        </div>

        {nextTitle ? (
          <button type="button" className={timeUp ? 'runner-next-card hot' : 'runner-next-card'} onClick={next}>
            <span className="runner-next-label">{L('הבא בתור', 'Up next')}</span>
            <span className="runner-next-name">{nextTitle}</span>
            {nextDur > 0 && <span className="runner-next-dur" dir="ltr">{nextDur}′</span>}
            <ChevronFwd size={18} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="runner-next-card done" onClick={onExit}>
            <span className="runner-next-label">{L('זה התרגיל האחרון', 'Last drill')}</span>
            <span className="runner-next-name">{L('סיום האימון', 'Finish the practice')}</span>
            <ChevronFwd size={18} aria-hidden="true" />
          </button>
        )}
      </footer>
    </div>
  )
}
