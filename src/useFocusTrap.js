import { useEffect, useRef } from 'react'

// מלכודת פוקוס לדיאלוגים: מונעת מ-Tab לצאת מהחלון, מחזירה את הפוקוס למקום
// שממנו נפתח, וסוגרת ב-Escape. בלי זה aria-modal="true" הוא הצהרה לא נכונה —
// קורא מסך "נעול" בדיאלוג בזמן שהמקלדת ממשיכה לטייל ברקע.
//
// שימוש:
//   const ref = useFocusTrap(open, onClose)
//   <div className="overlay"><div ref={ref} role="dialog" aria-modal="true"> ... </div></div>
const SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function useFocusTrap(open, onClose) {
  const ref = useRef(null)
  // onClose ב-ref כדי שהאפקט לא יאותחל מחדש בכל רינדור של ההורה
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const node = ref.current
    const previous = document.activeElement

    const focusables = () =>
      Array.from(node?.querySelectorAll(SELECTOR) || []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )

    // פוקוס ראשוני: הפריט הראשון שמסומן autofocus, אחרת הראשון בדיאלוג
    // ⚠ עוגן: יש דיאלוגים שברגע מסוים אין בהם אף פריט מיקוד (טעינה, או כל
    //   הכפתורים disabled בזמן שליחה). בלי למקד את הדיאלוג עצמו הפוקוס נשאר
    //   על body, והמלכודת למטה מוותרת — כלומר Tab יוצא אל המסך שמאחור.
    const first = node?.querySelector('[autofocus]') || focusables()[0] || node
    first?.focus?.()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) { e.preventDefault(); node?.focus?.(); return }
      const firstEl = list[0]
      const lastEl = list[list.length - 1]
      const inside = node.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === firstEl || !inside)) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && (document.activeElement === lastEl || !inside)) {
        // ⚠ גם כשהפוקוס **מחוץ** לדיאלוג (למשל אחרי שכפתור נעשה disabled
        //   והדפדפן העיף את הפוקוס ל-body) — Tab חוזר פנימה ולא בורח למסך.
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      // החזרת הפוקוס לכפתור שפתח את הדיאלוג
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus()
      }
    }
  }, [open])

  return ref
}
