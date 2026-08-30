import { WifiOff, ClipboardList, Home as HomeIcon } from 'lucide-react'
import { L } from './i18n'

// «תוכנה בסיסית בלי רשת» — 30.8.2026, בקשת הבעלים לפני ההפצה:
// בלי אינטרנט האפליקציה נשארת בסיסית ויציבה — בית, תוכניות/תרגילים ועזרה
// עובדים מהעותק השמור. שאר המסכים מקבלים את הדף הזה במקום חצי-מסך שבור
// עם שגיאות, ונפתחים לבד ברגע שהרשת חוזרת (online מדליק רינדור מחדש).
//
// inline — גרסה מוקטנת בתוך מסך קיים (למשל הטאב «מהקהילה» בבניית אימון).
export default function OfflineGate({ onGoPlans, onGoHome, inline }) {
  return (
    <div className={inline ? 'offline-gate is-inline' : 'offline-gate'} role="status">
      <span className="offline-gate-ic" aria-hidden="true"><WifiOff size={inline ? 20 : 28} /></span>
      <h2 className="offline-gate-title">{L('המסך הזה צריך אינטרנט', 'This screen needs an internet connection')}</h2>
      <p className="offline-gate-sub">
        {L('הוא ייפתח מעצמו ברגע שהרשת תחזור. בינתיים — התוכניות והתרגילים עובדים גם בלי רשת, ונוכחות מסמנים מתוך התוכנית («פתח כתוכנית»).',
           'It opens by itself as soon as the network is back. Meanwhile — plans and drills keep working offline, and attendance is marked from the plan (“Open as plan”).')}
      </p>
      {(onGoPlans || onGoHome) && (
        <div className="offline-gate-actions">
          {onGoPlans && (
            <button type="button" className="btn-primary" onClick={onGoPlans}>
              <ClipboardList size={16} /> {L('לתוכניות האימון', 'Practice plans')}
            </button>
          )}
          {onGoHome && (
            <button type="button" className="btn-soft" onClick={onGoHome}>
              <HomeIcon size={16} /> {L('לדף הבית', 'Home')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
