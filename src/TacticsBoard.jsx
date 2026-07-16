import { useEffect, useRef, useState } from 'react'
import { MousePointer2, ArrowUpRight, Send, Target, Square, LayoutGrid, Play } from 'lucide-react'
import { L } from './i18n'

const HALF = { w: 500, h: 470 }
const FULL = { w: 940, h: 500 }

// תוויות מוערכות בזמן רינדור (תלויות שפה)
const palette = () => [
  { type: 'player', label: L('שחקן', 'Player') },
  { type: 'defender', label: L('מגן', 'Defender') },
  { type: 'cone', label: L('קונוס', 'Cone') },
  { type: 'ball', label: L('כדור', 'Ball') },
]

function CourtLines({ full }) {
  if (full) {
    return (
      <g stroke="#ffffff" strokeWidth="3" fill="none">
        <rect x="10" y="10" width="920" height="480" rx="6" />
        <line x1="470" y1="10" x2="470" y2="490" />
        <circle cx="470" cy="250" r="55" />
        <rect x="10" y="170" width="170" height="160" fill="rgba(27,42,74,0.12)" />
        <circle cx="180" cy="250" r="46" />
        <line x1="28" y1="210" x2="28" y2="290" />
        <circle cx="44" cy="250" r="9" />
        <path d="M10 64 L150 64 Q 330 250 150 436 L10 436" />
        <rect x="760" y="170" width="170" height="160" fill="rgba(27,42,74,0.12)" />
        <circle cx="760" cy="250" r="46" />
        <line x1="912" y1="210" x2="912" y2="290" />
        <circle cx="896" cy="250" r="9" />
        <path d="M930 64 L790 64 Q 610 250 790 436 L930 436" />
      </g>
    )
  }
  return (
    <g stroke="#ffffff" strokeWidth="3" fill="none">
      <rect x="10" y="10" width="480" height="450" rx="6" />
      <rect x="190" y="10" width="120" height="170" fill="rgba(27,42,74,0.12)" />
      <circle cx="250" cy="180" r="48" />
      <line x1="210" y1="28" x2="290" y2="28" />
      <circle cx="250" cy="42" r="9" />
      <path d="M60 10 L60 150 Q 250 330 440 150 L440 10" />
    </g>
  )
}

function ObjectShape({ o }) {
  if (o.type === 'cone') {
    return (
      <polygon
        points={`${o.x},${o.y - 12} ${o.x - 11},${o.y + 10} ${o.x + 11},${o.y + 10}`}
        fill="#E8763A"
        stroke="#A8491A"
        strokeWidth="1.5"
      />
    )
  }
  if (o.type === 'ball') {
    return <circle cx={o.x} cy={o.y} r="9" fill="#E8763A" stroke="#A8491A" strokeWidth="1.5" />
  }
  if (o.type === 'defender') {
    return (
      <>
        <circle cx={o.x} cy={o.y} r="14" fill="#fff" stroke="#D64545" strokeWidth="2.5" />
        <text x={o.x} y={o.y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#D64545">
          {o.label || 'X'}
        </text>
      </>
    )
  }
  return (
    <>
      <circle cx={o.x} cy={o.y} r="14" fill="#1B2A4A" />
      <text x={o.x} y={o.y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">
        {o.label}
      </text>
    </>
  )
}

// גובה הקשת של "זריקה לסל" לפי אורך החץ
const arcLift = (x1, y1, x2, y2) => Math.min(90, Math.hypot(x2 - x1, y2 - y1) * 0.5)

// מסלול קשת (פרבולה) לזריקה לסל
const arcPath = (x1, y1, x2, y2) => {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  return `M${x1},${y1} Q${mx},${my - arcLift(x1, y1, x2, y2)} ${x2},${y2}`
}

// חץ בודד (תנועה = קו מלא, מסירה = מקווקו, זריקה לסל = קשת כתומה)
function Arrow({ a, readOnly, onRemove }) {
  const cursor = { cursor: readOnly ? 'default' : 'pointer' }
  if (a.kind === 'shot') {
    const d = arcPath(a.x1, a.y1, a.x2, a.y2)
    return (
      <g style={cursor} onDoubleClick={() => !readOnly && onRemove(a.id)}>
        <path d={d} fill="none" stroke="transparent" strokeWidth="16" />
        <path d={d} fill="none" stroke="#E8763A" strokeWidth="3" markerEnd="url(#tb-arrowhead-shot)" />
      </g>
    )
  }
  const dash = a.kind === 'pass' ? '8,7' : undefined
  return (
    <g style={cursor} onDoubleClick={() => !readOnly && onRemove(a.id)}>
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
      />
    </g>
  )
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
  headerLabel,
}) {
  const svgRef = useRef(null)
  const dragId = useRef(null)
  const [draft, setDraft] = useState(null)
  const dim = full ? FULL : HALF
  const arrows = step.arrows || []

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
    capture(e)
    const p = toSvg(e)
    setDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
  }

  const onMove = (e) => {
    if (readOnly) return
    if (draft) {
      const p = toSvg(e)
      setDraft((d) => ({ ...d, x2: p.x, y2: p.y }))
      return
    }
    if (dragId.current == null) return
    onMoveObj(dragId.current, toSvg(e))
  }

  const onUp = () => {
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
        <CourtLines full={full} />
        {arrows.map((a) => (
          <Arrow
            key={a.id}
            a={a}
            readOnly={readOnly}
            onRemove={(id) => onRemoveArrow(stepIndex, id)}
          />
        ))}
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
          <g
            key={o.id}
            style={{ cursor: readOnly || tool !== 'select' ? 'default' : 'grab' }}
            onPointerDown={(e) => {
              if (!readOnly && tool === 'select') {
                e.stopPropagation()
                dragId.current = o.id
                capture(e)
              }
            }}
            onDoubleClick={() => !readOnly && tool === 'select' && onRemoveObj(stepIndex, o.id)}
          >
            <ObjectShape o={o} />
          </g>
        ))}
      </svg>
    </div>
  )
}

// לוח טקטיקה — מגרש (חצי/שלם), אובייקטים נגררים, חצים, וריבוי שלבים.
// value/onChange: { fullCourt, steps:[{objects:[], arrows:[]}] }
export default function TacticsBoard({ value, onChange, readOnly }) {
  const initial =
    value && value.steps ? value : { fullCourt: false, steps: [{ objects: [], arrows: [] }] }
  const [fullCourt, setFullCourt] = useState(!!initial.fullCourt)
  const [steps, setSteps] = useState(
    initial.steps && initial.steps.length ? initial.steps : [{ objects: [], arrows: [] }]
  )
  const [layout, setLayout] = useState(readOnly ? 'all' : 'single')
  const [current, setCurrent] = useState(0)
  const [tool, setTool] = useState('select')
  const [frame, setFrame] = useState({ idx: 0, p: 0 })
  const [paused, setPaused] = useState(false)

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
    arrows: [],
  }

  const shown =
    layout === 'all'
      ? steps.map((s, i) => [s, i])
      : [[steps[current] || { objects: [], arrows: [] }, current]]

  return (
    <div className="field-group">
      {!readOnly && <span className="field-label">{L('לוח טקטיקה (לא חובה)', 'Tactics board (optional)')}</span>}

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
            'בחר חצי מגרש או מגרש שלם, הוסף וגרור אובייקטים (לחיצה כפולה מוחקת). למצב חצים בחר "חץ תנועה" או "חץ מסירה" וגרור על המגרש (לחיצה כפולה על חץ מוחקת). בנה כמה שלבים בתצוגת "שלב בודד" או "כל השלבים".',
            'Choose half court or full court, then add and drag objects (double-click to delete). For arrows, pick "Movement arrow" or "Pass arrow" and drag on the court (double-click an arrow to delete). Build multiple steps in "Single step" or "All steps" view.'
          )}
        </p>
      )}
    </div>
  )
}
