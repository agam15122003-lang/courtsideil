import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, Check } from 'lucide-react'
import { L } from './i18n'

// Pick — בורר יחיד עם הקלדה. שדה סגור שנפתח לרשימה עם חיפוש בראשה.
//
// ⚠ החיפוש כאן אינו קישוט. רשימת הליגות של האיגוד היא מאות שורות, ומאמן
//   יודע בדיוק מה הוא מחפש («נערים ב׳ צפון»). select רגיל שם חסר תועלת:
//   גלילה במאות שורות כדי למצוא אחת ששמה ידוע, ובטלפון גם עבודה מייגעת.
//
// היה מוגדר בתוך TeamFromIba.jsx בלבד, בעוד שמסך «משחקים וטבלה» — המסך
// שמאמן באמת מגיע אליו כדי לייבא — נשאר עם select רגיל לאותה בחירה בדיוק.
// אותה משימה חייבת להיראות אותו דבר, ולכן הרכיב יושב עכשיו בקובץ משלו.
//
// props:
//   label       - תווית השדה
//   value       - המפתח הנבחר
//   onPick      - (key, option) => void
//   options     - מערך אפשרויות
//   getKey      - (option) => string   מפתח ייחודי
//   getLabel    - (option) => string   טקסט להצגה
//   placeholder - טקסט כשאין בחירה
//   empty       - טקסט כשאין תוצאות לחיפוש
//   busy        - מציג «טוען…» במקום הערך
//   disabled    - חוסם פתיחה
export default function Pick({
  label, value, onPick, options, getKey, getLabel,
  placeholder, empty, busy, disabled,
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const list = options || []

  // ההשוואה מתעלמת מגרשיים וגרש — «נערים א׳» מול «נערים א» מול «נערים א'»
  const norm = (v) => String(v || '').replace(/[׳'"״]/g, '').toLowerCase().trim()
  const shown = useMemo(() => {
    const n = norm(q)
    if (!n) return list
    return list.filter((o) => norm(getLabel(o)).includes(n))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, q])
  const current = list.find((o) => getKey(o) === value)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="pf-label tfi-pick" ref={boxRef}>
      <span className="field-label">{label}</span>
      <button
        type="button"
        className={open ? 'finder-input tfi-control open' : 'finder-input tfi-control'}
        onClick={() => { if (!disabled) setOpen((o) => !o) }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={current ? '' : 'muted'}>
          {busy ? L('טוען…', 'Loading…') : current ? getLabel(current) : placeholder}
        </span>
      </button>
      {open && !disabled && (
        <div className="tfi-panel" role="listbox">
          <div className="ms-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={L('הקלד כדי לחפש...', 'Type to search...')}
              aria-label={L('חיפוש', 'Search')}
              autoFocus
            />
          </div>
          {shown.length === 0 && <p className="ms-empty muted small">{empty || L('לא נמצא', 'No match')}</p>}
          {shown.map((o) => {
            const k = getKey(o)
            return (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={k === value}
                className={k === value ? 'ms-option on' : 'ms-option'}
                onClick={() => { onPick(k, o); setOpen(false); setQ('') }}
              >
                <span className="ms-check">{k === value && <Check size={14} />}</span>
                {getLabel(o)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
