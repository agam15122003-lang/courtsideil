import { AlertTriangle, RotateCw } from 'lucide-react'
import { L } from './i18n'

// שפה אחת לשלושת המצבים (חוק המסמך: ריק / טעינה / שגיאה — מעוצבים, לא ברירת מחדל).
// טעינה: השתמשו ב-Skeleton.jsx (סקלטון תואם-צורה), לא בספינר ולא ב-"טוען...".

// מצב ריק — אייקון, כותרת, ושורת "מה עושים עכשיו" (+ פעולה אופציונלית)
export function EmptyState({ Icon, title, hint, action, onAction }) {
  return (
    <div className="empty-state">
      {Icon && <span className="empty-ic"><Icon size={26} /></span>}
      <div className="empty-title">{title}</div>
      {hint && <p className="muted small">{hint}</p>}
      {action && onAction && (
        <button type="button" className="btn-soft empty-cta" onClick={onAction}>{action}</button>
      )}
    </div>
  )
}

// מצב שגיאה — הסבר + דרך התאוששות. שגיאת שליפה אינה "אין נתונים".
export function ErrorState({ message, onRetry, compact }) {
  return (
    <div className={compact ? 'state-error compact' : 'state-error'} role="alert">
      <span className="state-error-ic"><AlertTriangle size={compact ? 16 : 20} /></span>
      <div className="state-error-body">
        <strong>{L('משהו השתבש', 'Something went wrong')}</strong>
        <span className="muted small">
          {message || L('לא הצלחנו לטעון את המידע. זו תקלת טעינה — שום דבר לא נמחק.',
            'We could not load this. It is a loading error — nothing was deleted.')}
        </span>
      </div>
      {onRetry && (
        <button type="button" className="state-error-retry" onClick={onRetry}>
          <RotateCw size={15} /> {L('נסה שוב', 'Try again')}
        </button>
      )}
    </div>
  )
}
