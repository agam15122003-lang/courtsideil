import { useEffect, useRef, useState } from 'react'

// «דיו» — ציור חופשי (עט/אצבע/עכבר) שמשותף לשלושה מקומות:
//   1. לוח הטקטיקה (TacticsBoard) — כלי «עט» ו«מחק» לצד החצים והשחקנים.
//   2. המגרשים הקטנים בצד המחברת (PlanNotebook) — ציור ישר על המגרש.
//   3. שכבת כתב היד מעל שורות המחברת.
//
// מודל הנתונים — קו אחד:
//   { id, c: '#1B2A4A', w: 3, p: [x0, y0, x1, y1, ...] }
// הנקודות ביחידות ה-viewBox של ה-SVG שעליו ציירו (לא פיקסלים), ולכן
// הציור נשמר כ-JSON קטן ומוצג נכון בכל גודל מסך. הקווים נשמרים כציור —
// לא הופכים לטקסט (זיהוי כתב יד בעברית לא אמין; הבעלים אישר).

export const INK_COLORS = [
  { c: '#1B2A4A', he: 'נייבי', en: 'Navy' },
  { c: '#E8763A', he: 'כתום', en: 'Orange' },
  { c: '#D64545', he: 'אדום', en: 'Red' },
]
export const INK_WIDTH = 3

const round1 = (n) => Math.round(n * 10) / 10

// path של קו: נקודה בודדת מצוירת כנקודה (קו באורך 0.1 עם ראש עגול)
export function inkPath(p) {
  if (!p || p.length < 2) return ''
  if (p.length === 2) return `M${p[0]},${p[1]} L${p[0] + 0.1},${p[1]}`
  let d = `M${p[0]},${p[1]}`
  for (let i = 2; i < p.length; i += 2) d += ` L${p[i]},${p[i + 1]}`
  return d
}

// שכבת הקווים — קבוצה אחת בתוך SVG (משמשת גם בתצוגה לקריאה בלבד)
export function InkPaths({ strokes, draft }) {
  const list = draft ? [...(strokes || []), draft] : strokes || []
  if (!list.length) return null
  return (
    <g data-ink="1" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {list.map((s) => (
        <path
          key={s.id}
          d={inkPath(s.p)}
          stroke={s.c || INK_COLORS[0].c}
          strokeWidth={s.w || INK_WIDTH}
          // עובי הקו נמדד בפיקסלים של המסך ולא ביחידות ה-viewBox: אותו קו
          // נראה באותו עובי על מגרש קטן (216px), על הלוח במסך מלא, ובהדפסה.
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

// האם נקודה (x,y) קרובה לקו — למחק
export function hitStroke(s, x, y, r) {
  const p = s.p || []
  const r2 = r * r
  for (let i = 0; i < p.length; i += 2) {
    const dx = p[i] - x
    const dy = p[i + 1] - y
    if (dx * dx + dy * dy <= r2) return true
  }
  // גם בין נקודות רחוקות (תנועה מהירה): מרחק לקטע
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1]
    const vx = bx - ax, vy = by - ay
    const len2 = vx * vx + vy * vy || 1
    let t = ((x - ax) * vx + (y - ay) * vy) / len2
    t = Math.max(0, Math.min(1, t))
    const dx = ax + t * vx - x
    const dy = ay + t * vy - y
    if (dx * dx + dy * dy <= r2) return true
  }
  return false
}

// hook הציור: מחזיר handlers ל-SVG + הקו שבציור כרגע (draft).
//   svgRef — ref ל-<svg>
//   dim    — {w,h} של ה-viewBox (יכול להשתנות בין רינדורים)
//   opts   — { tool: 'pen'|'eraser'|אחר, color, width, strokes, onAdd(stroke), onErase(id), eraseRadius }
// כשה-tool אינו pen/eraser ה-handlers לא עושים כלום — כך אפשר לפרוס אותם
// תמיד ולתת ל-handlers האחרים של המסך (גרירה/חצים) לפעול.
export function useInkTool(svgRef, dim, opts) {
  const [draft, setDraftState] = useState(null)
  const draftRef = useRef(null) // אותו קו — ב-ref כדי לא להריץ תופעות לוואי בתוך updater
  const setDraft = (d) => { draftRef.current = d; setDraftState(d) }
  const active = useRef(null) // { pointerId, pointerType }
  const last = useRef([0, 0])
  const { tool, color, width, strokes, onAdd, onErase, eraseRadius } = opts
  const drawing = tool === 'pen' || tool === 'eraser'

  const toSvg = (e) => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    if (!r.width || !r.height) return null
    return [
      round1(Math.max(0, Math.min(dim.w, ((e.clientX - r.left) / r.width) * dim.w))),
      round1(Math.max(0, Math.min(dim.h, ((e.clientY - r.top) / r.height) * dim.h))),
    ]
  }

  // רדיוס המחיקה נמדד באצבע — 12px על המסך — ומומר ליחידות ה-viewBox.
  // בלי ההמרה, מחק על מגרש קטן (216px ברוחב 940 יחידות) לא היה נוגע בכלום.
  const erase = (x, y) => {
    const rect = svgRef.current?.getBoundingClientRect()
    const px = eraseRadius || 12
    const r = rect && rect.width ? (px * dim.w) / rect.width : Math.max(8, dim.w / 80)
    // כל הקווים שנפגעו נמחקים יחד: קריאה אחת עם רשימת מזהים. קודם נשלחה
    // קריאה לכל קו, וכל אחת חושבה מאותו מצב ישן — כך שרק האחרון נמחק.
    const hit = (strokes || []).filter((s) => hitStroke(s, x, y, r)).map((s) => s.id)
    if (hit.length) onErase?.(hit)
  }

  // החלפת כלי באמצע קו (עט על הטאבלט + אצבע שנוגעת בסרגל): ה-handlers
  // מתנתקים, ה-pointerup לא מגיע, והעט היה נתקע «תפוס» עד יציאה מהמסך.
  useEffect(() => {
    if (drawing) return
    active.current = null
    draftRef.current = null
    setDraftState(null)
  }, [drawing])

  const onPointerDown = (e) => {
    if (!drawing) return false
    // רק מצביע אחד בכל רגע. אם עט (stylus) כבר מצייר — מגע של כף היד מתעלם.
    if (active.current) return true
    if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return true
    const pt = toSvg(e)
    if (!pt) return true
    active.current = { pointerId: e.pointerId, pointerType: e.pointerType }
    try { svgRef.current?.setPointerCapture?.(e.pointerId) } catch { /* לא נתמך — לא קריטי */ }
    e.preventDefault?.()
    if (tool === 'eraser') {
      erase(pt[0], pt[1])
      return true
    }
    last.current = pt
    setDraft({ id: Date.now() + Math.random(), c: color || INK_COLORS[0].c, w: width || INK_WIDTH, p: [pt[0], pt[1]] })
    return true
  }

  const onPointerMove = (e) => {
    if (!drawing || !active.current) return false
    if (e.pointerId !== active.current.pointerId) return true
    const pt = toSvg(e)
    if (!pt) return true
    if (tool === 'eraser') {
      erase(pt[0], pt[1])
      return true
    }
    // דילול: נקודה חדשה רק אם זזנו מספיק — JSON קטן, קו חלק
    const dx = pt[0] - last.current[0]
    const dy = pt[1] - last.current[1]
    if (dx * dx + dy * dy < 1.5) return true
    last.current = pt
    const d = draftRef.current
    if (d) setDraft({ ...d, p: [...d.p, pt[0], pt[1]] })
    return true
  }

  const finish = (e) => {
    if (!active.current) return false
    if (e && e.pointerId != null && e.pointerId !== active.current.pointerId) return true
    active.current = null
    const d = draftRef.current
    setDraft(null)
    if (d && d.p.length >= 2) onAdd?.(d)
    return true
  }

  return {
    draft,
    drawing,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
    },
  }
}
