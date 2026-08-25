import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, X, Check, Search } from 'lucide-react'
import { L } from './i18n'

// בחירה מרובה בסגנון "סטאק": שדה סגור שנפתח לרשימת אפשרויות,
// והבחירות מוצגות מתחתיו כתגיות שאפשר להסיר. מחליף שורות צ'יפים פתוחות.
// props:
//   options     - מערך ערכים (מחרוזות)
//   selected    - מערך הערכים שנבחרו
//   onToggle    - (value) => void  — מוסיף/מסיר ערך בודד
//   renderLabel - (value) => string  — טקסט להצגה (ברירת מחדל: הערך עצמו)
//   placeholder - טקסט כשאין בחירה
//   searchable  - הצגת שדה חיפוש בראש הרשימה (ברירת מחדל: מ-8 אפשרויות ומעלה)
//
// ⚠ החיפוש אינו קישוט: בורר הקבוצות מציג 18 אפשרויות בעברית, והמאמן
//   יודע בדיוק מה הוא מחפש («נערים ב»). גלילה ברשימה כדי למצוא שורה
//   שאתה כבר יודע את שמה היא בזבוז זמן, ובטלפון גם עבודה מייגעת.
export default function MultiSelect({ options, selected, onToggle, renderLabel, placeholder, searchable }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const searchRef = useRef(null)
  const label = renderLabel || ((v) => v)
  const count = selected.length
  const withSearch = searchable !== undefined ? searchable : (options || []).length >= 8

  // ההשוואה מתעלמת מגרשיים וגרש — «נערים א׳» מול «נערים א» מול «נערים א'»
  const norm = (v) => String(v || '').replace(/[׳'"״]/g, '').toLowerCase().trim()
  const shown = useMemo(() => {
    const needle = norm(q)
    if (!needle) return options
    return (options || []).filter((o) => norm(label(o)).includes(needle) || norm(o).includes(needle))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, q])

  // סגירה בלחיצה מחוץ לרכיב
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    // סגירה גם ב-Escape — נגישות מקלדת (הפוקוס נשאר על הפקד)
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    // הפוקוס נכנס לשדה החיפוש — אפשר להתחיל להקליד מיד
    if (withSearch) setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => { if (!open) setQ('') }, [open])

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
          {withSearch && (
            <div className="ms-search">
              <Search size={15} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={L('הקלד כדי לחפש...', 'Type to search...')}
                aria-label={L('חיפוש ברשימה', 'Search the list')}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (shown.length === 1) onToggle(shown[0]) } }}
              />
            </div>
          )}
          {shown.length === 0 && (
            <p className="ms-empty muted small">{L(`לא נמצא «${q}»`, `No match for “${q}”`)}</p>
          )}
          {shown.map((opt) => {
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
