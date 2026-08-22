import { memo, useEffect, useRef, useState } from 'react'

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

// «יש עט בסביבה»: מרגע שנראתה נגיעת עט, מגע אצבע אינו מצייר במשך
// הפרק הזה (מודולרי בכוונה — עט על מגרש אחד משתיק כף יד גם על השכן).
// 8 שניות, לא דקה: מספיק כדי לגשר על כף יד שנוחתת לפני החוד, ולא
// מספיק כדי להפוך לוח שלם לאזור מת למי שהניח את העט ועבר לאצבע.
// המחלקה html.has-pen מדליקה ב-CSS את «האצבע גוללת, העט מצייר» — רק
// כשבאמת יש עט; בלי עט, אצבע ממשיכה לצייר כרגיל (טלפון, אייפד בלי Pencil).
let lastPenAt = 0
let penTimer = 0
const PEN_SESSION_MS = 8000
const notePen = () => {
  const now = Date.now()
  lastPenAt = now
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (!root.classList.contains('has-pen')) root.classList.add('has-pen')
  clearTimeout(penTimer)
  penTimer = setTimeout(() => root.classList.remove('has-pen'), PEN_SESSION_MS)
}

// path של קו: נקודה בודדת מצוירת כנקודה (קו באורך 0.1 עם ראש עגול)
export function inkPath(p) {
  if (!p || p.length < 2) return ''
  if (p.length === 2) return `M${p[0]},${p[1]} L${p[0] + 0.1},${p[1]}`
  let d = `M${p[0]},${p[1]}`
  for (let i = 2; i < p.length; i += 2) d += ` L${p[i]},${p[i + 1]}`
  return d
}

// שכבת הקווים — קבוצה אחת בתוך SVG (משמשת גם בתצוגה לקריאה בלבד).
// הקווים השמורים ממורשמים בנפרד מקו הטיוטה: בזמן ציור בעט מגיעות עד
// 120 תנועות בשנייה, וכל אחת מעדכנת state — בלי ה-memo כל תנועה בנתה
// מחדש את ה-path של **כל** הדיו על הדף, וזה בדיוק ה«תקיעות» באייפד.
const StrokePath = ({ s }) => (
  <path
    d={inkPath(s.p)}
    stroke={s.c || INK_COLORS[0].c}
    strokeWidth={s.w || INK_WIDTH}
    // עובי הקו נמדד בפיקסלים של המסך ולא ביחידות ה-viewBox: אותו קו
    // נראה באותו עובי על מגרש קטן (216px), על הלוח במסך מלא, ובהדפסה.
    vectorEffect="non-scaling-stroke"
  />
)
const CommittedInk = memo(function CommittedInk({ strokes }) {
  return strokes.map((s) => <StrokePath key={s.id} s={s} />)
})
export function InkPaths({ strokes, draft }) {
  if (!(strokes || []).length && !draft) return null
  return (
    <g data-ink="1" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <CommittedInk strokes={strokes || []} />
      {draft && <StrokePath s={draft} />}
    </g>
  )
}

// האם נקודה (x,y) קרובה לקו — למחק.
// rx/ry נפרדים: על שכבת המחברת ה-viewBox אינו אחיד (x ב-0..1000, y
// בפיקסלים, preserveAspectRatio="none") — רדיוס שהומר לפי הרוחב בלבד
// הפך על הדף לאליפסה בגובה 24-31px שמחקה גם את השורה השכנה. הבדיקה
// מנרמלת כל ציר לרדיוס שלו: (dx/rx)2 + (dy/ry)2 <= 1.
export function hitStroke(s, x, y, rx, ry = rx) {
  const p = s.p || []
  const near = (dx, dy) => {
    const nx = dx / rx
    const ny = dy / ry
    return nx * nx + ny * ny <= 1
  }
  for (let i = 0; i < p.length; i += 2) {
    if (near(p[i] - x, p[i + 1] - y)) return true
  }
  // גם בין נקודות רחוקות (תנועה מהירה): מרחק לקטע
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1]
    const vx = bx - ax, vy = by - ay
    const len2 = vx * vx + vy * vy || 1
    let t = ((x - ax) * vx + (y - ay) * vy) / len2
    t = Math.max(0, Math.min(1, t))
    if (near(ax + t * vx - x, ay + t * vy - y)) return true
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
    const rx = rect && rect.width ? (px * dim.w) / rect.width : Math.max(8, dim.w / 80)
    // ציר y מומר בנפרד — ראו ההערה על hitStroke
    const ry = rect && rect.height ? (px * dim.h) / rect.height : rx
    // כל הקווים שנפגעו נמחקים יחד: קריאה אחת עם רשימת מזהים. קודם נשלחה
    // קריאה לכל קו, וכל אחת חושבה מאותו מצב ישן — כך שרק האחרון נמחק.
    const hit = (strokes || []).filter((s) => hitStroke(s, x, y, rx, ry)).map((s) => s.id)
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
    // דחיית כף היד: ברגע שנראה עט (Apple Pencil), מגע אצבע/כף יד מפסיק
    // לצייר לגמרי. באייפד כף היד נוגעת במסך **לפני** חוד העט — בלי זה
    // המגע תופס את תור הציור, מורח קו, והעט נדחה עד שהיד עוזבת.
    if (e.pointerType === 'pen') notePen()
    // המחק מותר באצבע גם כשיש עט — ההרגל של «מוחקים באצבע בזמן שהעט ביד»
    if (e.pointerType === 'touch' && tool !== 'eraser' && Date.now() - lastPenAt < PEN_SESSION_MS) return true
    if (active.current) {
      // העט גובר על מגע שהקדים אותו: הטיוטה של כף היד נזרקת והעט מצייר
      if (e.pointerType === 'pen' && active.current.pointerType === 'touch') {
        active.current = null
        draftRef.current = null
        setDraftState(null)
      } else {
        // רק מצביע אחד בכל רגע — עט שכבר מצייר מתעלם ממגע נוסף
        return true
      }
    }
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
    // העט ממשיך לצייר — החלון מתרענן (בלי לרוץ 120 פעמים בשנייה)
    if (e.pointerType === 'pen' && Date.now() - lastPenAt > 1000) notePen()
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

  // מחווה שהדפדפן ביטל (למשל: הפכה לגלילה) לא הופכת לקו שמור — קודם
  // pointercancel נכנס ל-finish והשאיר נקודה/קשקוש בכל גלילת אצבע.
  const cancel = (e) => {
    if (!active.current) return false
    if (e && e.pointerId != null && e.pointerId !== active.current.pointerId) return true
    active.current = null
    setDraft(null)
    return true
  }

  return {
    draft,
    drawing,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: cancel,
      onLostPointerCapture: finish,
    },
  }
}
