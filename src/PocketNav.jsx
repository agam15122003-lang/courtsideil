// «ניווט־כיס» (11.8.2026) — הגלולה הצפה של מסמך העיצוב 3a, שמחליפה את
// שורת הניווט התחתונה בשני העולמות: ארבעה יעדים יומיים וכפתור כתום מרכזי
// שפותח גיליון עם כל הפיצ׳רים.
//
// הרכיב הוא תצוגה בלבד — הרשימות, היעד הפעיל והניווט עצמו מגיעים מההורה
// (Dashboard/PlayerDashboard), כדי שלא יהיו שני מקורות אמת לניווט.
import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import useFocusTrap from './useFocusTrap'
import { L } from './i18n'

// items: [{ id, label, Icon, badge? }] — ארבעה, שניים מכל צד של הכפתור
// all:   [{ id, label, Icon, badge? }] — הגיליון המלא
// footer: תוכן חופשי לתחתית הגיליון (כרטיס משתמש, שפה, מצב כהה, התנתקות)
export default function PocketNav({ items, all, activeId, onNavigate, footer = null, label = null }) {
  const [open, setOpen] = useState(false)
  const trapRef = useFocusTrap(open, () => setOpen(false))

  // גלילת הרקע ננעלת כל עוד הגיליון פתוח (אותו דפוס כמו במגירת הסרגל).
  // המחלקה על body היא גם הווסת של כפתור הנגישות הצף — z-index שלו הוא
  // 9000, גבוה מכל גיליון, והוא היה יושב על שורת התחתית שלו.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('pkn-open')
    // סיבוב לרוחב מסתיר את הגיליון ב-CSS (מעל 768px) — בלי הסגירה הזאת
    // המצב נשאר פתוח, הגלילה נעולה ואין כפתור סגירה על המסך
    const mq = window.matchMedia('(min-width:769px)')
    const onWide = (e) => { if (e.matches) setOpen(false) }
    mq.addEventListener('change', onWide)
    return () => {
      mq.removeEventListener('change', onWide)
      document.body.style.overflow = prev
      document.body.classList.remove('pkn-open')
    }
  }, [open])

  const go = (id) => { setOpen(false); onNavigate(id) }
  const half = Math.ceil(items.length / 2)

  const pillItem = (item) => (
    <button
      key={item.id}
      type="button"
      data-nav={item.id}
      className={activeId === item.id ? 'pkn-item active' : 'pkn-item'}
      aria-label={item.label}
      aria-current={activeId === item.id ? 'page' : undefined}
      onClick={() => onNavigate(item.id)}
    >
      <span className="pkn-ic">
        <item.Icon size={21} aria-hidden="true" />
        {item.badge > 0 && (
          <span className="pkn-badge" dir="ltr">{item.badge > 9 ? '9+' : item.badge}</span>
        )}
      </span>
      <span className="pkn-lbl">{item.label}</span>
    </button>
  )

  return (
    <>
      <nav className="pkn" aria-label={label || L('ניווט', 'Navigation')}>
        {items.slice(0, half).map(pillItem)}
        <button
          type="button"
          className="pkn-all"
          aria-label={L('כל הפיצ׳רים', 'All features')}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        {items.slice(half).map(pillItem)}
      </nav>

      {open && (
        <div className="pkn-sheet-wrap">
          <button
            type="button"
            className="pkn-scrim"
            aria-label={L('סגירה', 'Close')}
            onClick={() => setOpen(false)}
          />
          <div
            className="pkn-sheet"
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label={L('כל הפיצ׳רים', 'All features')}
          >
            <span className="pkn-grip" aria-hidden="true" />
            <div className="pkn-sheet-head">
              <h2 className="pkn-sheet-title">{L('כל הפיצ׳רים', 'All features')}</h2>
              <button
                type="button"
                className="pkn-close"
                aria-label={L('סגירה', 'Close')}
                onClick={() => setOpen(false)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="pkn-grid">
              {all.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-nav={item.id}
                  className={activeId === item.id ? 'pkn-tile active' : 'pkn-tile'}
                  aria-current={activeId === item.id ? 'page' : undefined}
                  onClick={() => go(item.id)}
                >
                  <span className="pkn-tile-ic"><item.Icon size={16} aria-hidden="true" /></span>
                  <span className="pkn-tile-lbl">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="pkn-tile-badge" dir="ltr">{item.badge > 9 ? '9+' : item.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {footer && <div className="pkn-foot">{footer}</div>}
          </div>
        </div>
      )}
    </>
  )
}
