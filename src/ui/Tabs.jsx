// טאבים נגישים — role=tablist, roving tabindex, חיצים מודעי-RTL.
// שימוש: <Tabs ariaLabel="..." items={[{value:'a',label:'א'}]} value={v} onChange={setV} />
import { useRef } from 'react'

export default function Tabs({ items, value, onChange, ariaLabel, className = '' }) {
  const ref = useRef(null)
  const idx = Math.max(0, items.findIndex((it) => it.value === value))

  const onKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const rtl = (document.documentElement.dir || 'rtl') === 'rtl'
    let next = idx
    if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    // ב-RTL חץ ימינה = הפריט הקודם (הרשימה זורמת מימין לשמאל)
    else if ((e.key === 'ArrowRight') !== rtl) next = Math.min(idx + 1, items.length - 1)
    else next = Math.max(idx - 1, 0)
    if (next !== idx) {
      onChange(items[next].value)
      ref.current?.querySelectorAll('[role="tab"]')[next]?.focus()
    }
  }

  return (
    <div className={`tabs${className ? ' ' + className : ''}`} role="tablist" aria-label={ariaLabel} ref={ref} onKeyDown={onKeyDown}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={it.value === value}
          tabIndex={it.value === value ? 0 : -1}
          className={`tab${it.value === value ? ' active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
