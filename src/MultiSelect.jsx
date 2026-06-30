import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X, Check } from 'lucide-react'
import { L } from './i18n'

// בחירה מרובה בסגנון "סטאק": שדה סגור שנפתח לרשימת אפשרויות,
// והבחירות מוצגות מתחתיו כתגיות שאפשר להסיר. מחליף שורות צ'יפים פתוחות.
// props:
//   options     - מערך ערכים (מחרוזות)
//   selected    - מערך הערכים שנבחרו
//   onToggle    - (value) => void  — מוסיף/מסיר ערך בודד
//   renderLabel - (value) => string  — טקסט להצגה (ברירת מחדל: הערך עצמו)
//   placeholder - טקסט כשאין בחירה
export default function MultiSelect({ options, selected, onToggle, renderLabel, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const label = renderLabel || ((v) => v)
  const count = selected.length

  // סגירה בלחיצה מחוץ לרכיב
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="multiselect" ref={ref}>
      <button
        type="button"
        className={`ms-control${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={count ? 'ms-value' : 'ms-value ms-placeholder'}>
          {count
            ? L(`${count} נבחרו`, `${count} selected`)
            : placeholder || L('בחר...', 'Select...')}
        </span>
        <ChevronDown size={18} className="ms-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="ms-panel" role="listbox" aria-multiselectable="true">
          {options.map((opt) => {
            const on = selected.includes(opt)
            return (
              <button
                type="button"
                key={opt}
                role="option"
                aria-selected={on}
                className={`ms-option${on ? ' on' : ''}`}
                onClick={() => onToggle(opt)}
              >
                <span className="ms-check">{on && <Check size={14} />}</span>
                {label(opt)}
              </button>
            )
          })}
        </div>
      )}

      {count > 0 && (
        <div className="ms-tags">
          {selected.map((opt) => (
            <span key={opt} className="ms-tag">
              {label(opt)}
              <button
                type="button"
                className="ms-tag-x"
                aria-label={L('הסר', 'Remove')}
                onClick={() => onToggle(opt)}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
