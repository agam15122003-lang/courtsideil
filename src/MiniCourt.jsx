import { memo, useRef } from 'react'
import { Maximize2, Trash2 } from 'lucide-react'
import { CourtLines, ObjectShape, Arrow, courtDim } from './CourtDiagram'
import { InkPaths, useInkTool } from './ink'
import { L } from './i18n'

// מגרש קטן בשולי המחברת — מציירים עליו ישר (עכבר / אצבע / עט), ולחיצה על
// «הגדל» פותחת את לוח הטקטיקה המלא. אותו מבנה נתונים כמו drills.board:
//   board = { fullCourt, steps: [{ objects, arrows, ink }] }
// המגרש הקטן מציג ומצייר על השלב הראשון; הלוח המלא יכול להוסיף שלבים.
//
// props:
//   board, onChange   — הלוח (onChange חסר = קריאה בלבד)
//   tool, color       — 'pen' | 'eraser' + צבע (מהסרגל של עמודת המגרשים)
//   onOpen, onRemove  — פתיחה בלוח המלא / הסרת המגרש
//   index             — מספר המגרש (לתווית)
// ברירת המחדל במחברת: מגרש שלם **לאורך** — צר, ולכן משאיר רוחב לכתיבה
export const emptyBoard = () => ({ fullCourt: true, portrait: true, steps: [{ objects: [], arrows: [], ink: [] }] })

function MiniCourt({ board, onChange, tool = 'pen', color, onOpen, onRemove, index = 0 }) {
  const svgRef = useRef(null)
  const b = board && board.steps && board.steps.length ? board : emptyBoard()
  const step = b.steps[0] || { objects: [], arrows: [], ink: [] }
  const full = b.fullCourt !== false
  const portrait = !!b.portrait
  const dim = courtDim(full, portrait)
  const editable = typeof onChange === 'function'
  const strokes = step.ink || []

  const setInk = (ink) =>
    onChange?.({ ...b, steps: b.steps.map((s, i) => (i === 0 ? { ...s, ink } : s)) })

  const inkTool = useInkTool(svgRef, dim, {
    tool: editable ? tool : 'type',
    color,
    strokes,
    onAdd: (s) => setInk([...strokes, s]),
    onErase: (ids) => setInk(strokes.filter((k) => !ids.includes(k.id))),
  })

  const hasContent =
    strokes.length || (step.objects || []).length || (step.arrows || []).length || b.steps.length > 1

  // is-erasing: במחק אסור ל-touch-action: pan-y (של html.has-pen) לחטוף
  // שפשוף אנכי לגלילה — האצבע חייבת למחוק גם כשהעט בסביבה
  return (
    <div className={`mini-court${editable ? ' is-edit' : ''}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dim.w} ${dim.h}`}
        className={`nb-court mini-court-svg${inkTool.drawing ? ' is-drawing' : ''}${editable && tool === 'eraser' ? ' is-erasing' : ''}`}
        role="img"
        aria-label={L(`מגרש ${index + 1}`, `Court ${index + 1}`)}
        onDoubleClick={editable && onOpen ? onOpen : undefined}
        {...(inkTool.drawing ? inkTool.handlers : {})}
      >
        <rect x="0" y="0" width={dim.w} height={dim.h} fill="#ffffff" />
        <CourtLines full={full} portrait={portrait} />
        {(step.arrows || []).map((a) => (
          <Arrow key={a.id} a={a} />
        ))}
        <InkPaths strokes={strokes} draft={inkTool.draft} />
        {(step.objects || []).map((o) => (
          <g key={o.id}>
            <ObjectShape o={o} />
          </g>
        ))}
      </svg>
      {/* בטלפון: כל המגרש הוא כפתור פתיחה (ראו index.css — מוצג עד 720px) */}
      {editable && onOpen && (
        <button
          type="button"
          className="mini-court-open"
          onClick={onOpen}
          aria-label={L(`פתיחת מגרש ${index + 1} בלוח הטקטי`, `Open court ${index + 1} in the tactics board`)}
        />
      )}
      {editable && (
        <div className="mini-court-tools">
          <span className="mini-court-n">{index + 1}</span>
          {b.steps.length > 1 && (
            <span className="mini-court-steps" dir="ltr">{b.steps.length}×</span>
          )}
          <button type="button" className="mini-court-btn" onClick={onOpen} aria-label={L('פתח בלוח הטקטי', 'Open in the tactics board')} title={L('פתח בלוח הטקטי', 'Open in the tactics board')}>
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            className="mini-court-btn danger"
            onClick={onRemove}
            aria-label={hasContent ? L('נקה מגרש', 'Clear court') : L('הסר מגרש', 'Remove court')}
            title={hasContent ? L('נקה מגרש', 'Clear court') : L('הסר מגרש', 'Remove court')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
      {!editable && b.steps.length > 1 && (
        <span className="mini-court-steps ro" dir="ltr">{b.steps.length}×</span>
      )}
    </div>
  )
}

// memo: המגרשים חיים לצד המחברת, וכל מחיקת דיו על **הדף** וכל הקשה רינדרו
// מחדש גם את שלושתם (SVG מלא כל אחד). ההשוואה מתעלמת מה-callbacks בכוונה:
// PlanNotebook יוצר אותם מחדש בכל רינדור, אבל הם סוגרים רק על מזהה
// המגרש ועל setState פונקציונלי — השוואה שטוחה עליהם הייתה מבטלת את
// ה-memo לחלוטין. מה שמשנה את הציור הוא board/tool/color/index.
export default memo(MiniCourt, (a, b) =>
  a.board === b.board && a.tool === b.tool && a.color === b.color && a.index === b.index)
