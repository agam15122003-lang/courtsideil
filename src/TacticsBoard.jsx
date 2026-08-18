import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MousePointer2, ArrowUpRight, Send, Target, Square, LayoutGrid, Play, Maximize2, X, Pencil, Eraser } from 'lucide-react'
import { L } from './i18n'
import { motionOff, dur, loadGsap, resetArrowDraw, clearArrowDraw, buildArrowDraw } from './anim'
import { CourtLines, ObjectShape, arcLift, arcPath } from './CourtDiagram'
// 18.8 — «עט» ו«מחק»: ציור חופשי על המגרש, נשמר לכל שלב ב-step.ink
import { InkPaths, useInkTool, INK_COLORS } from './ink'

const HALF = { w: 500, h: 470 }
const FULL = { w: 940, h: 500 }

// שיעור מהמעבר בין שלבים שבו ציור החצים כבר הסתיים (0.85 = 85% מהדרך)
const DRAW_LEAD = 0.85

// תוויות מוערכות בזמן רינדור (תלויות שפה)
const palette = () => [
  { type: 'player', label: L('שחקן', 'Player') },
  { type: 'defender', label: L('מגן', 'Defender') },
  { type: 'cone', label: L('קונוס', 'Cone') },
  { type: 'ball', label: L('כדור', 'Ball') },
]

// ציור המגרש, השחקנים והחצים מגיע מ-CourtDiagram — עותק אחד לשני המסכים
// (עד היום היו כאן שני עותקים זהים והתיקון באחד לא הגיע לשני).
// כאן משתמשים בווריאנט 'board': קווים לבנים עבים על מגרש הנייבי.

// לחיצה ארוכה למחיקה (מפרט המסמך). דאבל-קליק פשוט לא קיים במגע —
// עד היום אי אפשר היה למחוק אובייקט או חץ מהטלפון בכלל.
// מחזיר handlers שמתאימים גם לעכבר וגם למגע; תזוזה מבטלת (זו גרירה).
const LONG_PRESS_MS = 550
function useLongPress(onLongPress, enabled) {
  const timer = useRef(null)
  const start = useRef({ x: 0, y: 0 })
  const fired = useRef(false)

  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }
  if (!enabled) return {}

  // מוחזרים handlers בלבד — כדי שאפשר יהיה לפרוס אותם ישירות על אלמנט DOM
  return {
    onPointerDown: (e) => {
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      clear()
      timer.current = setTimeout(() => {
        fired.current = true
        // רטט קצר במכשירים שתומכים — משוב שהמחיקה קרתה
        if (navigator.vibrate) navigator.vibrate(18)
        onLongPress()
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e) => {
      if (!timer.current) return
      const dx = Math.abs(e.clientX - start.current.x)
      const dy = Math.abs(e.clientY - start.current.y)
      if (dx > 8 || dy > 8) clear() // זו גרירה, לא לחיצה ארוכה
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
  }
}

// חץ בודד (תנועה = קו מלא, מסירה = מקווקו, זריקה לסל = קשת כתומה)
// tool נדרש: לחיצה ארוכה מוחקת חץ רק בכלי «גרירה». בלי זה, ציור איטי בעט
// מעל חץ קיים היה מוחק אותו אחרי 550ms (ה-svg תופס את המצביע, ולכן ה-move
// וה-up של החץ לא מגיעים כדי לבטל את הטיימר).
function Arrow({ a, readOnly, tool = 'select', onRemove }) {
  const cursor = { cursor: readOnly || tool !== 'select' ? 'default' : 'pointer' }
  const lp = useLongPress(() => onRemove(a.id), !readOnly && tool === 'select')
  if (a.kind === 'shot') {
    const d = arcPath(a.x1, a.y1, a.x2, a.y2)
    return (
      <g style={cursor} {...lp} onDoubleClick={() => !readOnly && tool === 'select' && onRemove(a.id)}>
        <path d={d} fill="none" stroke="transparent" strokeWidth="16" />
        <path
          d={d}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="3"
          markerEnd="url(#tb-arrowhead-shot)"
          data-draw="arc"
          data-arrow-id={a.id}
        />
      </g>
    )
  }
  const dash = a.kind === 'pass' ? '8,7' : undefined
  return (
    <g style={cursor} {...lp} onDoubleClick={() => !readOnly && tool === 'select' && onRemove(a.id)}>
      <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth="16" />
      <line
        x1={a.x1}
        y1={a.y1}
        x2={a.x2}
        y2={a.y2}
        stroke="#1B2A4A"
        strokeWidth="3"
        strokeDasharray={dash}
        markerEnd="url(#tb-arrowhead)"
        data-draw="line"
        data-arrow-id={a.id}
      />
    </g>
  )
}

// אובייקט בודד על המגרש. רכיב נפרד כי הוא צריך hook של לחיצה ארוכה,
// ואי אפשר לקרוא hook בתוך map. משלב גרירה + מחיקה בלחיצה ארוכה:
// אותו onPointerDown מתניע את שניהם, ותזוזה מבטלת את הטיימר.
function ObjNode({ o, readOnly, tool, onStartDrag, onRemove }) {
  const active = !readOnly && tool === 'select'
  const lp = useLongPress(onRemove, active)
  return (
    <g
      style={{ cursor: active ? 'grab' : 'default' }}
      {...lp}
      onPointerDown={(e) => {
        lp.onPointerDown?.(e)
        if (active) onStartDrag(e)
      }}
      onDoubleClick={() => active && onRemove()}
    >
      <ObjectShape o={o} />
    </g>
  )
}

// ציור עצמי של חצי התנועה במצב "נגן אנימציה".
//
// שילוב ולא דריסה: לולאת ה-requestAnimationFrame שלמטה (מנוע התנועה של
// האובייקטים) נשארת השעון **היחיד**. GSAP לא מקבל שעון משלו — הוא מקבל
// timeline מושהה שנגרר ידנית (`progress()`) לפי אותו `frame.p`. לכן אין שתי
// לולאות שנגררות זו מזו, ו"השהה"/"התחל מהתחלה" הקיימים עובדים בלי שינוי.
//
// drawScrub: null = לא במצב נגינה (החצים סטטיים כרגיל). מספר 0..1 = התקדמות.
function useArrowDraw(arrows, stepIndex, drawScrub) {
  const hostRef = useRef(null)
  const tlRef = useRef(null)
  const playing = drawScrub != null
  // חתימה יציבה: משתנה רק כשקבוצת החצים באמת התחלפה, לא בכל פריים
  const sig = playing ? arrows.map((a) => a.id).join('|') : ''

  // מצב הפתיחה מוחל סינכרונית — אחרת החצים היו נראים מלאים לפריים־שניים
  // עד ש-import('gsap') חוזר, ואז קופצים לאפס.
  useLayoutEffect(() => {
    if (!playing || motionOff()) return
    resetArrowDraw(hostRef.current)
  }, [playing, sig, stepIndex])

  useEffect(() => {
    const host = hostRef.current
    if (!playing || !host || arrows.length === 0) return
    const geom = new Map(arrows.map((a) => [String(a.id), a]))
    // נגישות (DESIGN.md §3): לא מאתחלים timeline בכלל — החצים פשוט מצוירים
    if (motionOff()) {
      clearArrowDraw(host, geom)
      return
    }
    let dead = false
    loadGsap().then((gsap) => {
      if (dead || !gsap || hostRef.current !== host) return
      tlRef.current = buildArrowDraw(gsap, host, geom, {
        // החץ נמתח מהר יותר מהמעבר בין השלבים — הקו מוביל, השחקן עוקב
        each: dur('--dur-slow', 0.38),
        stagger: dur('--dur-fast', 0.14),
        shotMarker: 'tb-arrowhead-shot',
      })
    })
    return () => {
      dead = true
      tlRef.current?.kill()
      tlRef.current = null
      clearArrowDraw(host, geom)
    }
    // arrows נגזר מ-sig; לא מכניסים אותו לתלויות כדי לא לבנות מחדש בכל פריים
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, sig, stepIndex])

  // הגרירה עצמה — הפריים היחיד שרץ 60 פעם בשנייה. DRAW_LEAD < 1 כדי
  // שהחצים יסיימו להצטייר לפני שהאובייקטים מגיעים ליעד.
  useEffect(() => {
    const tl = tlRef.current
    if (tl && drawScrub != null) tl.progress(Math.min(1, drawScrub / DRAW_LEAD))
  }, [drawScrub])

  return hostRef
}

// לוח בודד לשלב אחד (מגרש + אובייקטים נגררים + חצים)
function Board({
  step,
  stepIndex,
  total,
  full,
  readOnly,
  tool,
  onAdd,
  onMoveObj,
  onRemoveObj,
  onDeleteStep,
  onAddArrow,
  onRemoveArrow,
  onAddInk,
  onRemoveInk,
  inkColor,
  headerLabel,
  drawScrub = null,
}) {
  const svgRef = useRef(null)
  const dragId = useRef(null)
  const [draft, setDraft] = useState(null)
  const dim = full ? FULL : HALF
  const arrows = step.arrows || []
  const arrowsRef = useArrowDraw(arrows, stepIndex, drawScrub)
  // עט/מחק — הקווים החופשיים של השלב הזה
  const ink = useInkTool(svgRef, dim, {
    tool: readOnly ? 'select' : tool,
    color: inkColor,
    strokes: step.ink || [],
    onAdd: (s) => onAddInk?.(stepIndex, s),
    onErase: (ids) => onRemoveInk?.(stepIndex, ids),
  })

  const toSvg = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return {
      x: Math.max(8, Math.min(dim.w - 8, ((e.clientX - r.left) / r.width) * dim.w)),
      y: Math.max(8, Math.min(dim.h - 8, ((e.clientY - r.top) / r.height) * dim.h)),
    }
  }

  // לכידת המצביע — כך גרירה/ציור ממשיכים גם אם המצביע יוצא מגבולות המגרש
  const capture = (e) => {
    try {
      svgRef.current?.setPointerCapture?.(e.pointerId)
    } catch {
      /* לא נתמך — לא קריטי */
    }
  }

  const onDown = (e) => {
    if (readOnly || tool === 'select') return
    if (ink.drawing) { ink.handlers.onPointerDown(e); return }
    capture(e)
    const p = toSvg(e)
    setDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
  }

  const onMove = (e) => {
    if (readOnly) return
    if (ink.drawing) { ink.handlers.onPointerMove(e); return }
    if (draft) {
      const p = toSvg(e)
      setDraft((d) => ({ ...d, x2: p.x, y2: p.y }))
      return
    }
    if (dragId.current == null) return
    onMoveObj(dragId.current, toSvg(e))
  }

  const onUp = (e) => {
    if (ink.drawing) { ink.handlers.onPointerUp(e); return }
    if (draft) {
      const len = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1)
      if (len > 12) {
        const kind = tool === 'arrow-pass' ? 'pass' : tool === 'arrow-shot' ? 'shot' : 'move'
        onAddArrow(stepIndex, { ...draft, kind })
      }
      setDraft(null)
    }
    dragId.current = null
  }

  return (
    <div className="board-block">
      <div className="court-controls">
        <span className="muted small">
          {headerLabel ||
            L(
              `שלב ${stepIndex + 1}${total > 1 ? ` מתוך ${total}` : ''}`,
              `Step ${stepIndex + 1}${total > 1 ? ` of ${total}` : ''}`
            )}
        </span>
        {!readOnly && total > 1 && (
          <button
            type="button"
            className="btn-ghost danger"
            onClick={() => onDeleteStep(stepIndex)}
          >
            {L('מחק שלב', 'Delete step')}
          </button>
        )}
      </div>

      {!readOnly && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {palette().map((p) => (
            <button
              type="button"
              key={p.type}
              className="chip"
              onClick={() => onAdd(stepIndex, p.type)}
            >
              + {p.label}
            </button>
          ))}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${dim.w} ${dim.h}`}
        className={full ? 'court court--full' : 'court'}
        role="img"
        aria-label={L(
          `לוח טקטיקה — ${full ? 'מגרש שלם' : 'חצי מגרש'}, שלב ${stepIndex + 1}`,
          `Tactics board — ${full ? 'full court' : 'half court'}, step ${stepIndex + 1}`
        )}
        style={{ touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          <marker
            id="tb-arrowhead"
            markerWidth="12"
            markerHeight="12"
            refX="9"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,1 L10,5 L0,9 Z" fill="#1B2A4A" />
          </marker>
          <marker
            id="tb-arrowhead-shot"
            markerWidth="12"
            markerHeight="12"
            refX="9"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,1 L10,5 L0,9 Z" fill="#E8763A" />
          </marker>
        </defs>
        <rect x="0" y="0" width={dim.w} height={dim.h} fill="#E3B877" />
        <CourtLines full={full} variant="board" />
        <g ref={arrowsRef}>
          {arrows.map((a) => (
            <Arrow
              key={a.id}
              a={a}
              readOnly={readOnly}
              tool={tool}
              onRemove={(id) => onRemoveArrow(stepIndex, id)}
            />
          ))}
        </g>
        {/* דיו חופשי — מתחת לשחקנים, מעל קווי המגרש */}
        <InkPaths strokes={step.ink} draft={ink.draft} />
        {draft &&
          (tool === 'arrow-shot' ? (
            <path
              d={arcPath(draft.x1, draft.y1, draft.x2, draft.y2)}
              fill="none"
              stroke="#E8763A"
              strokeWidth="3"
              opacity="0.6"
              markerEnd="url(#tb-arrowhead-shot)"
            />
          ) : (
            <line
              x1={draft.x1}
              y1={draft.y1}
              x2={draft.x2}
              y2={draft.y2}
              stroke="#1B2A4A"
              strokeWidth="3"
              strokeDasharray={tool === 'arrow-pass' ? '8,7' : undefined}
              opacity="0.6"
              markerEnd="url(#tb-arrowhead)"
            />
          ))}
        {step.objects.map((o) => (
          <ObjNode
            key={o.id}
            o={o}
            readOnly={readOnly}
            tool={tool}
            onStartDrag={(e) => { e.stopPropagation(); dragId.current = o.id; capture(e) }}
            onRemove={() => onRemoveObj(stepIndex, o.id)}
          />
        ))}
      </svg>
    </div>
  )
}

// לוח טקטיקה — מגרש (חצי/שלם), אובייקטים נגררים, חצים, דיו חופשי, וריבוי שלבים.
// value/onChange: { fullCourt, steps:[{objects:[], arrows:[], ink:[]}] }
// startFull/onCloseFull — 18.8: המחברת פותחת את הלוח ישר במסך מלא (מגרש קטן
// שנלחץ), וסגירתו מחזירה את הציור למגרש הקטן דרך onChange.
export default function TacticsBoard({ value, onChange, readOnly, autoPlay, startFull, onCloseFull, title }) {
  const initial =
    value && value.steps ? value : { fullCourt: false, steps: [{ objects: [], arrows: [] }] }
  const [fullCourt, setFullCourt] = useState(!!initial.fullCourt)
  const [steps, setSteps] = useState(
    initial.steps && initial.steps.length ? initial.steps : [{ objects: [], arrows: [] }]
  )
  const [layout, setLayout] = useState(readOnly ? 'all' : 'single')
  const [current, setCurrent] = useState(0)
  const [tool, setTool] = useState('select')
  const [inkColor, setInkColor] = useState(INK_COLORS[0].c)
  const [frame, setFrame] = useState({ idx: 0, p: 0 })
  const [paused, setPaused] = useState(false)
  // מסך מלא — מפרט המסמך: הלוח הוא קנבס, לא "שדה טופס (לא חובה)".
  // אותו דפוס portal שכבר עובד בפאנל התרגיל ב-DrillCard.
  const [full, setFull] = useState(!!startFull)
  const closeFull = () => { setFull(false); onCloseFull?.() }

  // מסך מלא: Escape סוגר ונועל את גלילת הרקע (אותו חוזה כמו הפאנלים האחרים)
  useEffect(() => {
    if (!full) return
    const onKey = (e) => { if (e.key === 'Escape') closeFull() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full])

  // autoPlay: פתיחת תרגיל מתניעה את האנימציה לבד — רגע ה"וואו" של הלוח.
  // מדלג כשמבקשים פחות תנועה (מערכת/ווידג'ט נגישות) או כשאין מספיק שלבים.
  useEffect(() => {
    if (!autoPlay || !readOnly) return
    if (!initial.steps || initial.steps.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (document.documentElement.classList.contains('a11y-motion')) return
    const t = setTimeout(() => {
      setFrame({ idx: 0, p: 0 })
      setPaused(false)
      setLayout('play')
    }, 400)
    return () => clearTimeout(t)
    // מכוון: רץ פעם אחת במאונט בלבד
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dim = fullCourt ? FULL : HALF

  const commit = (next, nf = fullCourt) => {
    setSteps(next)
    if (onChange) onChange({ fullCourt: nf, steps: next })
  }

  const addObj = (stepIndex, type) => {
    const sameType = steps[stepIndex].objects.filter((o) => o.type === type).length
    const label = type === 'player' || type === 'defender' ? String(sameType + 1) : ''
    const o = {
      id: Date.now() + Math.random(),
      type,
      x: Math.round(dim.w / 2),
      y: Math.round(dim.h / 2),
      label,
    }
    commit(
      steps.map((s, i) => (i === stepIndex ? { ...s, objects: [...s.objects, o] } : s))
    )
  }

  const moveObj = (stepIndex, objId, pos) => {
    setSteps((cur) => {
      const next = cur.map((s, i) =>
        i === stepIndex
          ? { ...s, objects: s.objects.map((o) => (o.id === objId ? { ...o, ...pos } : o)) }
          : s
      )
      if (onChange) onChange({ fullCourt, steps: next })
      return next
    })
  }

  const removeObj = (stepIndex, objId) =>
    commit(
      steps.map((s, i) =>
        i === stepIndex ? { ...s, objects: s.objects.filter((o) => o.id !== objId) } : s
      )
    )

  const addArrow = (stepIndex, arrow) =>
    commit(
      steps.map((s, i) => {
        if (i !== stepIndex) return s
        const arrows = [...(s.arrows || []), { id: Date.now() + Math.random(), ...arrow }]
        let objects = s.objects
        // זריקה לסל בלי כדור על המגרש — מוסיפים כדור בנקודת ההתחלה כדי שיהיה מה להעיף
        if (arrow.kind === 'shot' && !s.objects.some((o) => o.type === 'ball')) {
          objects = [
            ...s.objects,
            { id: Date.now() + Math.random(), type: 'ball', x: arrow.x1, y: arrow.y1, label: '' },
          ]
        }
        return { ...s, arrows, objects }
      })
    )

  const removeArrow = (stepIndex, arrowId) =>
    commit(
      steps.map((s, i) =>
        i === stepIndex ? { ...s, arrows: (s.arrows || []).filter((a) => a.id !== arrowId) } : s
      )
    )

  // דיו חופשי — קו נוסף / קו נמחק (מחק). המחיקה מגיעה מתוך תנועת מצביע,
  // ולכן דרך setSteps פונקציונלי כדי לא לאבד מחיקות רצופות באותו פריים.
  const addInk = (stepIndex, stroke) =>
    setSteps((cur) => {
      const next = cur.map((s, i) => (i === stepIndex ? { ...s, ink: [...(s.ink || []), stroke] } : s))
      if (onChange) onChange({ fullCourt, steps: next })
      return next
    })
  const removeInk = (stepIndex, inkIds) =>
    setSteps((cur) => {
      const ids = Array.isArray(inkIds) ? inkIds : [inkIds]
      const next = cur.map((s, i) =>
        i === stepIndex ? { ...s, ink: (s.ink || []).filter((k) => !ids.includes(k.id)) } : s
      )
      if (onChange) onChange({ fullCourt, steps: next })
      return next
    })

  const addStep = () => {
    // משכפל את השלב האחרון; כל חץ "מושך" את האובייקט הקרוב אליו ביותר אל קצה החץ.
    // שיוך חד-חד-ערכי (כל חץ → אובייקט אחד, כל אובייקט פעם אחת) כדי ששני אובייקטים
    // לא יידרסו לאותה נקודה, וכדי שכל חץ ימצא את האובייקט הנכון שלו.
    const prev = steps[steps.length - 1] || { objects: [], arrows: [] }
    const cloned = prev.objects.map((o) => ({ ...o }))
    const claimed = new Set()
    for (const a of prev.arrows || []) {
      let best = -1
      let bestD = 20 // סף הדוק (רדיוס אובייקט ≈ 14) כדי לא לתפוס אובייקט שכן בטעות
      cloned.forEach((o, idx) => {
        if (claimed.has(idx)) return
        const d = Math.hypot(a.x1 - o.x, a.y1 - o.y)
        if (d < bestD) {
          bestD = d
          best = idx
        }
      })
      if (best >= 0) {
        claimed.add(best)
        cloned[best] = { ...cloned[best], x: a.x2, y: a.y2 }
      }
    }
    const next = [...steps, { objects: cloned, arrows: [] }]
    commit(next)
    setCurrent(next.length - 1)
  }

  const delStep = (idx) => {
    if (steps.length === 1) {
      commit([{ objects: [], arrows: [] }])
      setCurrent(0)
      return
    }
    const next = steps.filter((_, i) => i !== idx)
    commit(next)
    setCurrent(Math.max(0, Math.min(current, next.length - 1)))
  }

  const setCourt = (full) => {
    if (full !== fullCourt) {
      setFullCourt(full)
      commit(steps, full)
    }
  }

  // אנימציה: מתקדם בין שלבים ברצף — תנועה חלקה (easing) + השהייה קצרה בכל שלב (לולאה)
  useEffect(() => {
    if (layout !== 'play' || paused || steps.length < 2) return
    const MOVE = 850 // משך התנועה בין שלבים
    const HOLD = 450 // השהייה על שלב לפני מעבר
    let raf
    let from = frame.idx >= steps.length - 1 ? 0 : frame.idx
    let start = null
    const tick = (ts) => {
      if (start == null) start = ts
      const el = ts - start
      let p
      if (el < MOVE) p = el / MOVE
      else if (el < MOVE + HOLD) p = 1
      else {
        from = from + 1 > steps.length - 2 ? 0 : from + 1
        start = ts
        p = 0
      }
      setFrame({ idx: from, p })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, paused, steps])

  // האטה בכניסה וביציאה (easeInOutCubic) לתנועה טבעית
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const lerp = (a, b, t) => a + (b - a) * t
  const playSrc = steps[frame.idx] || { objects: [], arrows: [] }
  const playDst = steps[frame.idx + 1] || playSrc
  const e = ease(frame.p)
  const srcArrows = playSrc.arrows || []

  // נושא הכדור — השחקן הקרוב ביותר לכדור, כל עוד אין ממנו מסירה/זריקה.
  // כך הכדור תמיד משויך לשחקן ונע איתו לאורך האנימציה (במקום לרחף לבד).
  const ball = playSrc.objects.find((o) => o.type === 'ball')
  let carrierId = null
  if (ball) {
    const passing = srcArrows.some(
      (a) =>
        (a.kind === 'pass' || a.kind === 'shot') &&
        Math.hypot(a.x1 - ball.x, a.y1 - ball.y) < 25
    )
    if (!passing) {
      let bestD = Infinity
      for (const p of playSrc.objects) {
        if (p.type !== 'player') continue
        const d = Math.hypot(p.x - ball.x, p.y - ball.y)
        if (d < bestD) {
          bestD = d
          carrierId = p.id
        }
      }
    }
  }

  const playStep = {
    objects: playSrc.objects.map((o) => {
      // הכדור מוחזק ע"י שחקן — עוקב אחריו עם אותו היסט יחסי
      if (o.type === 'ball' && carrierId != null) {
        const cs = playSrc.objects.find((p) => p.id === carrierId)
        const cd = playDst.objects.find((p) => p.id === carrierId) || cs
        return {
          ...o,
          x: lerp(cs.x, cd.x, e) + (o.x - cs.x),
          y: lerp(cs.y, cd.y, e) + (o.y - cs.y),
        }
      }
      const target = playDst.objects.find((d) => d.id === o.id) || o
      const x = lerp(o.x, target.x, e)
      let y = lerp(o.y, target.y, e)
      // אם התנועה מקורה בחץ "זריקה לסל" — מסלול קשת (פרבולה) במקום קו ישר
      const shot = srcArrows.find(
        (a) => a.kind === 'shot' && Math.hypot(a.x1 - o.x, a.y1 - o.y) < 20
      )
      if (shot) y -= Math.sin(Math.PI * e) * arcLift(o.x, o.y, target.x, target.y)
      return { ...o, x, y }
    }),
    // עד היום מצב הנגינה הסתיר את החצים לגמרי. עכשיו הם מוצגים ומציירים את
    // עצמם תוך כדי המעבר (useArrowDraw) — הקו מסביר לאן השחקן הולך.
    arrows: srcArrows,
    ink: playSrc.ink || [],
  }

  const shown =
    layout === 'all'
      ? steps.map((s, i) => [s, i])
      : [[steps[current] || { objects: [], arrows: [] }, current]]

  const body = (
    <div className={full ? 'field-group tb-fullscreen' : 'field-group'}>
      {!readOnly && !full && (
        <span className="field-label tb-label">
          {L('לוח טקטיקה', 'Tactics board')}
          <button type="button" className="tb-expand" onClick={() => setFull(true)}>
            <Maximize2 size={14} /> {L('מסך מלא', 'Full screen')}
          </button>
        </span>
      )}
      {full && (
        <div className="tb-fs-head">
          <strong>{title || L('לוח טקטיקה', 'Tactics board')}</strong>
          <span className="muted small">
            {L(`שלב ${current + 1} מתוך ${steps.length}`, `Step ${current + 1} of ${steps.length}`)}
          </span>
          {onCloseFull ? (
            <button type="button" className="btn-primary tb-fs-done" onClick={closeFull}>
              {L('סיום — חזרה למחברת', 'Done — back to notebook')}
            </button>
          ) : null}
          <button type="button" className="tb-fs-close" onClick={closeFull} aria-label={L('סגור', 'Close')}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* סרגל כלים צף — קבוצות: מגרש | תצוגה | כלי ציור */}
      <div className="tb-toolbar" role="toolbar" aria-label={L('כלי לוח הטקטיקה', 'Tactics board tools')}>
        {!readOnly && (
          <div className="tb-group" role="group" aria-label={L('סוג מגרש', 'Court type')}>
            <button type="button" className={!fullCourt ? 'tb-btn on' : 'tb-btn'} aria-pressed={!fullCourt} onClick={() => setCourt(false)}>
              {L('חצי מגרש', 'Half court')}
            </button>
            <button type="button" className={fullCourt ? 'tb-btn on' : 'tb-btn'} aria-pressed={fullCourt} onClick={() => setCourt(true)}>
              {L('מגרש שלם', 'Full court')}
            </button>
          </div>
        )}

        <div className="tb-group" role="group" aria-label={L('תצוגה', 'View')}>
          <button type="button" className={layout === 'single' ? 'tb-btn on' : 'tb-btn'} aria-pressed={layout === 'single'} onClick={() => setLayout('single')}>
            <Square size={15} /> {L('שלב בודד', 'Single step')}
          </button>
          <button type="button" className={layout === 'all' ? 'tb-btn on' : 'tb-btn'} aria-pressed={layout === 'all'} onClick={() => setLayout('all')}>
            <LayoutGrid size={15} /> {L('כל השלבים', 'All steps')}
          </button>
          <button
            type="button"
            className={layout === 'play' ? 'tb-btn on' : 'tb-btn'}
            aria-pressed={layout === 'play'}
            onClick={() => {
              setFrame({ idx: 0, p: 0 })
              setPaused(false)
              setLayout('play')
            }}
          >
            <Play size={15} /> {L('נגן אנימציה', 'Play animation')}
          </button>
        </div>

        {!readOnly && (
          <div className="tb-group" role="group" aria-label={L('כלי ציור', 'Drawing tools')}>
            <button type="button" className={tool === 'select' ? 'tb-btn on' : 'tb-btn'} aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
              <MousePointer2 size={15} /> {L('גרירה', 'Drag')}
            </button>
            <button type="button" className={tool === 'arrow-move' ? 'tb-btn on' : 'tb-btn'} aria-pressed={tool === 'arrow-move'} onClick={() => setTool('arrow-move')}>
              <ArrowUpRight size={15} /> {L('חץ תנועה', 'Movement arrow')}
            </button>
            <button type="button" className={tool === 'arrow-pass' ? 'tb-btn on' : 'tb-btn'} aria-pressed={tool === 'arrow-pass'} onClick={() => setTool('arrow-pass')}>
              <Send size={15} /> {L('חץ מסירה', 'Pass arrow')}
            </button>
            <button type="button" className={tool === 'arrow-shot' ? 'tb-btn on' : 'tb-btn'} aria-pressed={tool === 'arrow-shot'} onClick={() => setTool('arrow-shot')}>
              <Target size={15} /> {L('זריקה לסל', 'Shot')}
            </button>
          </div>
        )}

        {/* 18.8 — עט חופשי ומחק (עכבר / אצבע / עט על טאבלט) */}
        {!readOnly && (
          <div className="tb-group" role="group" aria-label={L('עט חופשי', 'Free pen')}>
            <button type="button" className={tool === 'pen' ? 'tb-btn on' : 'tb-btn'} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}>
              <Pencil size={15} /> {L('עט', 'Pen')}
            </button>
            <button type="button" className={tool === 'eraser' ? 'tb-btn on' : 'tb-btn'} aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}>
              <Eraser size={15} /> {L('מחק', 'Eraser')}
            </button>
            {tool === 'pen' && (
              <span className="ink-colors" role="radiogroup" aria-label={L('צבע העט', 'Pen color')}>
                {INK_COLORS.map((k) => (
                  <button
                    key={k.c}
                    type="button"
                    role="radio"
                    aria-checked={inkColor === k.c}
                    aria-label={L(k.he, k.en)}
                    className={inkColor === k.c ? 'ink-swatch on' : 'ink-swatch'}
                    style={{ '--ink': k.c }}
                    onClick={() => setInkColor(k.c)}
                  />
                ))}
              </span>
            )}
          </div>
        )}
      </div>

      {layout !== 'play' &&
        shown.map(([s, i]) => (
          <Board
            key={i}
            step={s}
            stepIndex={i}
            total={steps.length}
            full={fullCourt}
            readOnly={readOnly}
            tool={tool}
            onAdd={addObj}
            onMoveObj={(objId, pos) => moveObj(i, objId, pos)}
            onRemoveObj={removeObj}
            onDeleteStep={delStep}
            onAddArrow={addArrow}
            onRemoveArrow={removeArrow}
            onAddInk={addInk}
            onRemoveInk={removeInk}
            inkColor={inkColor}
          />
        ))}

      {layout === 'play' &&
        (steps.length < 2 ? (
          <p className="muted small">{L('הוסף לפחות שני שלבים כדי לנגן אנימציה.', 'Add at least two steps to play the animation.')}</p>
        ) : (
          <>
            <Board
              step={playStep}
              stepIndex={frame.idx}
              total={steps.length}
              full={fullCourt}
              readOnly
              tool="select"
              drawScrub={frame.p}
              headerLabel={L(
                `מנגן · מעבר משלב ${frame.idx + 1} לשלב ${frame.idx + 2}`,
                `Playing · step ${frame.idx + 1} → ${frame.idx + 2}`
              )}
              onAdd={() => {}}
              onMoveObj={() => {}}
              onRemoveObj={() => {}}
              onDeleteStep={() => {}}
              onAddArrow={() => {}}
              onRemoveArrow={() => {}}
            />
            <div className="court-controls">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setPaused((v) => !v)}
              >
                {paused ? L('נגן', 'Play') : L('השהה', 'Pause')}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setFrame({ idx: 0, p: 0 })
                  setPaused(false)
                }}
              >
                {L('התחל מהתחלה', 'Restart')}
              </button>
            </div>
          </>
        ))}

      {layout === 'single' && (
        <div className="court-controls">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCurrent(Math.max(0, current - 1))}
            disabled={current === 0}
          >
            {L('הקודם', 'Previous')}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCurrent(Math.min(steps.length - 1, current + 1))}
            disabled={current === steps.length - 1}
          >
            {L('הבא', 'Next')}
          </button>
          {!readOnly && (
            <button type="button" className="btn-ghost" onClick={addStep}>
              {L('שלב חדש', 'New step')}
            </button>
          )}
        </div>
      )}

      {layout === 'all' && !readOnly && (
        <button type="button" className="btn-ghost" style={{ marginTop: 8 }} onClick={addStep}>
          {L('+ שלב חדש', '+ New step')}
        </button>
      )}

      {!readOnly && (
        <p className="muted small">
          {L(
            'בחר חצי מגרש או מגרש שלם, הוסף וגרור אובייקטים. למחיקה — לחיצה ארוכה על האובייקט או על החץ (גם בטלפון). למצב חצים בחר "חץ תנועה", "חץ מסירה" או "זריקה לסל" וגרור על המגרש. "עט" מצייר ביד חופשית (עכבר, אצבע או עט), "מחק" מוחק קו בנגיעה. בנה כמה שלבים בתצוגת "שלב בודד" או "כל השלבים".',
            'Choose half court or full court, then add and drag objects. To delete, long-press the object or the arrow (works on phones too). For arrows, pick "Movement arrow", "Pass arrow" or "Shot" and drag on the court. "Pen" draws freehand (mouse, finger or stylus), "Eraser" removes a line on touch. Build multiple steps in "Single step" or "All steps" view.'
          )}
        </p>
      )}
    </div>
  )

  // במצב מסך מלא הלוח עובר ל-portal מעל האפליקציה — הטופס נשאר שלם מאחור
  return full ? createPortal(<div className="tb-fs-scrim">{body}</div>, document.body) : body
}
