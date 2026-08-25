import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ArrowLeft, ArrowRight } from 'lucide-react'
import { L } from './i18n'
import { motionOff } from './anim'
import tourSteps from './tourSteps'
import useFocusTrap from './useFocusTrap'

export const TOUR_KEY = 'tour_v1'

export function tourSeen() {
  try { return !!localStorage.getItem(TOUR_KEY) } catch { return true }
}
export function markTourSeen() {
  try { localStorage.setItem(TOUR_KEY, '1') } catch { /* מצב פרטי — הסיור פשוט יופיע שוב */ }
}

// ---------- זרקור ----------
//
// למה ארבע רצועות ולא clip-path או box-shadow ענק:
// (א) `box-shadow: 0 0 0 9999px` יוצר שכבה בגודל עשרות אלפי פיקסלים
//     שספארי באייפד מרסטר במלואה בכל תזוזה — גלילה מקרטעת עד כדי קפיאה.
// (ב) `clip-path` על שכבה במסך מלא מכריח שכבת קומפוזיציה חדשה בכל frame,
//     ובאייפדוס הוא גם נשבר כשההורה עצמו מונפש.
// ארבע רצועות ממוקמות (מעל / מתחת / ימין / שמאל של החור) הן ארבעה
// מלבנים פשוטים — אפס גזירה, אפס shadow ענק, וכל דפדפן מטפל בהן טוב.
const RING = 6 // ריפוד סביב העוגן
const GAP = 12 // מרווח בין החור לבועה
const EDGE = 12 // מרווח מינימלי מקצה המסך

// עוגן "קיים ב-DOM" אינו עוגן שרואים. שתי מלכודות אמיתיות שנתפסו בבדיקה:
// (א) מתחת ל-840 סרגל הצד הוא מגירה סגורה — הפריטים שלו עדיין ב-DOM,
//     עם רוחב וגובה, אבל visibility:hidden ומוסטים אל מחוץ למסך. הזרקור
//     סימן שם חור בשום מקום.
// (ב) המגירה מקבלת inert כשהיא סגורה — כלומר היא כבר מוצהרת כלא-קיימת.
// גלילה אנכית דווקא כן פותרת עוגן שמתחת לקפל, ולכן נבדקת רק החפיפה
// האופקית, לא האנכית.
function shown(el) {
  if (el.closest("[inert]")) return false
  if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false
  const cs = getComputedStyle(el)
  if (cs.visibility === "hidden" || cs.display === "none") return false
  // ⚠ בלי בדיקת opacity במכוון: אנימציית הכניסה של המסכים מתחילה ב-0,
  //   ובדיקה כזו פסלה את העוגן האמיתי בדיוק בפריים שבו חיפשנו אותו.
  const r = el.getBoundingClientRect()
  return r.right > 0 && r.left < window.innerWidth
}
function bandStyles(hole) {
  if (!hole) return []
  const { top, left, width, height } = hole
  const right = left + width
  const bottom = top + height
  return [
    { key: 't', style: { top: 0, left: 0, right: 0, height: Math.max(0, top) } },
    { key: 'b', style: { top: bottom, left: 0, right: 0, bottom: 0 } },
    { key: 'l', style: { top, left: 0, width: Math.max(0, left), height } },
    { key: 'r', style: { top, left: right, right: 0, height } },
  ]
}

// מיקום הבועה: מנסה את הצד המועדף, ואם אין מקום — עובר לצד עם הכי הרבה
// מקום. תמיד נצמד אל תוך המסך, כי בועה חתוכה גרועה מבועה במקום לא אידיאלי.
function placeBubble(hole, box, vw, vh, prefer) {
  if (!hole) return { left: (vw - box.w) / 2, top: (vh - box.h) / 2, side: 'center' }
  const space = {
    bottom: vh - (hole.top + hole.height) - GAP,
    top: hole.top - GAP,
    left: hole.left - GAP,
    right: vw - (hole.left + hole.width) - GAP,
  }
  const order = [prefer, 'bottom', 'top', 'left', 'right'].filter(Boolean)
  let side = order.find((s) => space[s] >= (s === 'left' || s === 'right' ? box.w : box.h))
  if (!side) side = Object.keys(space).sort((a, b) => space[b] - space[a])[0]

  let left
  let top
  if (side === 'bottom' || side === 'top') {
    left = hole.left + hole.width / 2 - box.w / 2
    top = side === 'bottom' ? hole.top + hole.height + GAP : hole.top - GAP - box.h
  } else {
    top = hole.top + hole.height / 2 - box.h / 2
    left = side === 'left' ? hole.left - GAP - box.w : hole.left + hole.width + GAP
  }
  left = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - box.w - EDGE))
  top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - box.h - EDGE))
  return { left, top, side }
}

export default function GuidedTour({ onGo, onClose }) {
  const steps = useRef(tourSteps()).current
  const [i, setI] = useState(0)
  const [hole, setHole] = useState(null) // null = שקופית ממורכזת
  const [pos, setPos] = useState(null)
  const [ready, setReady] = useState(false)
  // aria-modal="true" בלי מלכודת פוקוס הוא הצהרה לא נכונה: המסך שמאחור
  // מוצהר כלא-קיים, אבל Tab ממשיך לטייל בו. המלכודת מטפלת גם ב-Escape.
  const bubbleRef = useFocusTrap(true, () => finishRef.current())
  const finishRef = useRef(null)
  const anchorRef = useRef(null)
  const rafRef = useRef(0)
  const step = steps[i]
  const reduce = motionOff()

  // סיום או דילוג מחזירים לדף הבית: הסיור מנווט בין מסכים, ומאמן שלחץ
  // «דילוג» בצעד 15 נשאר אחרת תקוע במסך «מדיה» שהוא לא ביקש.
  const finish = useCallback(() => { markTourSeen(); onGo('home'); onClose() }, [onClose, onGo])
  finishRef.current = finish

  // ---------- מדידה ----------
  const measure = useCallback(() => {
    const el = anchorRef.current
    if (!el || !el.isConnected) { setHole(null); return }
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) { setHole(null); return }
    setHole({
      top: Math.max(0, r.top - RING),
      left: Math.max(0, r.left - RING),
      width: r.width + RING * 2,
      height: r.height + RING * 2,
    })
  }, [])

  // ---------- איתור העוגן ----------
  // המסך שאליו ניווטנו לא בהכרח סיים לטעון, ולכן מחפשים בלולאת rAF עד
  // תקציב זמן. חריגה מהתקציב אינה תקלה — היא נופלת לשקופית ממורכזת.
  useEffect(() => {
    let alive = true
    let timer = 0
    setReady(false)
    anchorRef.current = null

    const budget = step.view ? 4000 : 1500
    const t0 = performance.now()
    const find = () => {
      if (!alive) return
      const sels = step.anchor || []
      for (const sel of sels) {
        const el = document.querySelector(sel)
        if (el && shown(el)) {
          const r = el.getBoundingClientRect()
          // עוגן שתופס כמעט את כל המסך אינו זרקור אלא רקע: במקרה כזה
          // עדיפה שקופית ממורכזת על "חור" בגודל העמוד.
          const huge = r.height > window.innerHeight * 0.75 && r.width > window.innerWidth * 0.9
          if (r.width > 4 && r.height > 4 && !huge) {
            anchorRef.current = el
            el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
            // אחרי גלילה צריך למדוד מחדש, ולכן מדידה נדחית
            timer = setTimeout(() => { if (alive) { measure(); setReady(true) } }, reduce ? 40 : 320)
            return
          }
        }
      }
      if (!sels.length || performance.now() - t0 > budget) {
        setHole(null)
        setReady(true)
        return
      }
      rafRef.current = requestAnimationFrame(find)
    }

    // הצעד מנווט קודם, ורק אחר כך מחפשים
    if (step.view) {
      Promise.resolve(onGo(step.view)).then(() => { if (alive) rafRef.current = requestAnimationFrame(find) })
    } else {
      rafRef.current = requestAnimationFrame(find)
    }
    return () => {
      alive = false
      cancelAnimationFrame(rafRef.current)
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  // מיקום הבועה — אחרי שיש לה גודל אמיתי
  useEffect(() => {
    if (!ready) return undefined
    const put = () => {
      const b = bubbleRef.current
      if (!b) return
      const box = { w: b.offsetWidth, h: b.offsetHeight }
      setPos(placeBubble(hole, box, window.innerWidth, window.innerHeight, step.place))
    }
    put()
    const onMove = () => { measure(); put() }
    window.addEventListener('resize', onMove)
    window.addEventListener('orientationchange', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('orientationchange', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hole, i])

  const next = () => (i >= steps.length - 1 ? finish() : setI(i + 1))
  const prev = () => setI((n) => Math.max(0, n - 1))

  // ---------- מקלדת ----------
  useEffect(() => {
    const onKey = (e) => {
      // Escape מגיע מ-useFocusTrap, לא מכאן — אחרת finish רץ פעמיים
      // חצים לפי סדר הקריאה בעברית: «הבא» הוא שמאלה
      if (e.key === 'ArrowLeft' || e.key === 'Enter') { e.preventDefault(); next() }
      if (e.key === 'ArrowRight') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  // בכל צעד הפוקוס חוזר לתחילת הבועה, אחרת קורא המסך נשאר על הכפתור
  // שנלחץ ולא מקריא את הטקסט החדש
  useEffect(() => {
    if (!ready) return
    const node = bubbleRef.current
    node?.focus?.()
  }, [ready, i])

  const bands = bandStyles(hole)
  const total = steps.length

  return (
    <div className={reduce ? 'tour tour-still' : 'tour'} role="dialog" aria-modal="true" aria-label={L('סיור מודרך', 'Guided tour')}>
      {/* בלי חור: כיסוי מלא. עם חור: ארבע רצועות סביבו + חוסם שקוף על החור
          עצמו, כי הסיור לא מבקש מהמאמן ללחוץ על שום דבר. */}
      {hole ? (
        <>
          {bands.map((b) => <div key={b.key} className="tour-band" style={b.style} />)}
          <div className="tour-block" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
          <div className="tour-ring" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} aria-hidden="true" />
        </>
      ) : (
        <div className="tour-band tour-full" />
      )}

      <div
        className="tour-bubble"
        ref={bubbleRef}
        tabIndex={-1}
        style={pos ? { top: pos.top, left: pos.left, visibility: 'visible' } : { visibility: 'hidden' }}
      >
        <div className="tour-head">
          <span className="tour-count" dir="ltr">{i + 1}/{total}</span>
          {!step.last && (
            <button type="button" className="tour-skip" onClick={finish}>{L('דילוג', 'Skip')}</button>
          )}
          <button type="button" className="tour-x" onClick={finish} aria-label={L('סגירת הסיור', 'Close tour')}>
            <X size={16} />
          </button>
        </div>
        <h2 className="tour-title">{step.title}</h2>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((s, n) => <span key={s.key} className={n === i ? 'tour-dot on' : 'tour-dot'} />)}
        </div>
        <div className="tour-acts">
          {i > 0 && (
            <button type="button" className="btn-ghost tour-back" onClick={prev}>
              <ArrowRight size={15} aria-hidden="true" /> {L('הקודם', 'Back')}
            </button>
          )}
          <button type="button" className="btn-primary tour-next" onClick={next}>
            {step.last ? L('סיימנו', 'Done') : L('הבא', 'Next')}
            {!step.last && <ArrowLeft size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  )
}
