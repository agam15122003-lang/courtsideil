import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { InkPaths, useInkTool } from './ink'

// גוף המחברת — טקסט על שורות + שכבת דיו (כתב יד/עט) מעל השורות.
//
// שני מצבים באותו רכיב:
//   • עריכה (onChange קיים): textarea שקוף שגדל עם הטקסט, ומעליו SVG של
//     הדיו. כשהכלי הוא 'pen'/'eraser' ה-SVG תופס את המצביע (אצבע/עט/עכבר),
//     וכשהכלי הוא 'type' הוא שקוף למצביע והלחיצות מגיעות ל-textarea.
//   • קריאה (onChange חסר): הטקסט כ-<div> על אותן שורות, הדיו מוצג בלבד.
//
// יחידות הדיו: הרוחב במאיות הדף (0..1000) והגובה **בפיקסלים** — בדיוק
// כמו שורות המחברת, שהן 30px קבועים בכל רוחב מסך. לכן כתב יד שנכתב על
// שורה 5 נשאר על שורה 5 גם בטלפון, גם אחרי סיבוב המכשיר וגם בהדפסה
// (ה-SVG נמתח רק לרוחב — preserveAspectRatio="none").
//
// props:
//   value, onChange        — הטקסט (onChange חסר = קריאה בלבד)
//   ink, onInkChange       — קווי הדיו
//   tool                   — 'type' | 'pen' | 'eraser'
//   color                  — צבע העט
//   placeholder, textareaRef, minLines, extraLines
export const PAGE_W = 1000
export const LINE_H = 30 // גובה שורה בפיקסלים — תואם ל-.nb-write-lines

export default function NotebookBody({
  value,
  onChange,
  ink,
  onInkChange,
  tool = 'type',
  color,
  placeholder,
  textareaRef,
  minLines = 16,
  extraLines = 0,
  ariaLabel,
}) {
  const wrapRef = useRef(null)
  const innerTa = useRef(null)
  const taRef = textareaRef || innerTa
  const svgRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const editable = typeof onChange === 'function'

  // ה-textarea גדל עם הטקסט (בלי גלילה פנימית — הדף עצמו הוא הגלילה)
  useLayoutEffect(() => {
    if (!editable) return
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, editable, taRef])

  // מודדים את הדף כדי לגזור viewBox לדיו (רוחב 1000, גובה יחסי)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const vh = Math.max(1, size.h || (minLines + extraLines) * LINE_H)
  const strokes = ink || []
  const inkTool = useInkTool(svgRef, { w: PAGE_W, h: vh }, {
    tool: editable ? tool : 'type',
    color,
    strokes,
    onAdd: (s) => onInkChange?.([...strokes, s]),
    onErase: (ids) => onInkChange?.(strokes.filter((k) => !ids.includes(k.id))),
    eraseRadius: 14,
  })

  // גובה מינימלי: שורות ריקות לכתיבה + מקום מתחת לדיו הנמוך ביותר
  // (ה-y של הדיו הוא כבר פיקסלים, ולכן אין כאן המרה)
  let inkBottomPx = 0
  for (const s of strokes) for (let i = 1; i < (s.p || []).length; i += 2) if (s.p[i] > inkBottomPx) inkBottomPx = s.p[i]
  const minH = Math.max((minLines + extraLines) * LINE_H, inkBottomPx ? inkBottomPx + LINE_H * 2 : 0)

  return (
    <div
      ref={wrapRef}
      className={`nbk-body${inkTool.drawing ? ' is-drawing' : ''}${editable ? '' : ' is-readonly'}`}
      style={{ minHeight: minH }}
    >
      {editable ? (
        <textarea
          ref={taRef}
          className="nb-write nb-write-lines nbk-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          rows={minLines}
          spellCheck
        />
      ) : (
        <div className="nb-lines nbk-text nbk-text-ro">{value}</div>
      )}
      <svg
        ref={svgRef}
        className="nbk-ink"
        viewBox={`0 0 ${PAGE_W} ${vh}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        {...(inkTool.drawing ? inkTool.handlers : {})}
      >
        <InkPaths strokes={strokes} draft={inkTool.draft} />
      </svg>
    </div>
  )
}
