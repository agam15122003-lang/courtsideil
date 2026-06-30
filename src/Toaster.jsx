import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { subscribe } from './toast'
import { L } from './i18n'

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const DURATION = 3500

// מציג את הודעות ה-Toast. ממוקם פעם אחת בשורש האפליקציה.
// המיכל מרונדר תמיד (גם ריק) כדי שאזור ה-aria-live יהיה קבוע ב-DOM —
// אחרת קוראי מסך לא יכריזו על ההודעה הראשונה.
export default function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => {
    return subscribe((t) => {
      setItems((cur) => [...cur, t])
      setTimeout(() => {
        setItems((cur) => cur.filter((x) => x.id !== t.id))
      }, DURATION)
    })
  }, [])

  const dismiss = (id) => setItems((cur) => cur.filter((x) => x.id !== id))

  return (
    <div className="toaster" role="region" aria-live="polite" aria-atomic="false">
      {items.map((t) => {
        const Icon = ICONS[t.type] || Info
        return (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role={t.type === 'error' ? 'alert' : 'status'}
          >
            <Icon size={19} className="toast-ic" />
            <span className="toast-msg">{t.message}</span>
            <button
              type="button"
              className="toast-x"
              onClick={() => dismiss(t.id)}
              aria-label={L('סגירה', 'Close')}
            >
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
