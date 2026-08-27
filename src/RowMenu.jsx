import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { L } from './i18n'

// RowMenu — תפריט «⋯» לפעולות משניות של שורה או כרטיס.
//
// למה: כרטיס תוכנית נשא חמישה כפתורים באותו משקל בשורה אחת — פתח, שתף
// לקהילה, העתק אליי, וואטסאפ, מחק — כפול מספר הכרטיסים במסך. במובייל זה
// נשבר לשתיים-שלוש שורות, ו«מחק» ישב צמוד ל«וואטסאפ». DESIGN.md אומר
// במפורש: CTA ראשי אחד. כאן הפעולה הראשית נשארת כפתור, וכל השאר נכנס לכאן.
//
// items: [{ key, label, icon, onClick, danger }]  — danger מציג באדום,
// ותמיד אחרון ברשימה שנמסרת.
export default function RowMenu({ items, label }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const btnRef = useRef(null)
  const list = (items || []).filter(Boolean)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      // מחזירים מיקוד לכפתור — אחרת הוא נופל ל-body וגלישה במקלדת מתחילה מהתחלה
      btnRef.current?.focus()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!list.length) return null

  return (
    <div className="row-menu" ref={boxRef}>
      <button
        ref={btnRef}
        type="button"
        className="btn-ghost row-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label || L('עוד פעולות', 'More actions')}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="row-menu-pop" role="menu">
          {list.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={it.danger ? 'row-menu-item is-danger' : 'row-menu-item'}
              onClick={() => { setOpen(false); it.onClick() }}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
