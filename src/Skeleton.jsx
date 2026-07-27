// שלדי טעינה לשימוש חוזר — מונעים קפיצת layout ומראה "זול" של טקסט "טוען...".
// משתמשים במחלקות .skeleton/.skeleton-line הקיימות (שומר על prefers-reduced-motion).
import { L } from './i18n'

export function SkeletonCards({ count = 3, lines = 2 }) {
  return (
    <div className="skel-list" aria-busy="true" aria-label={L('טוען...', 'Loading...')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skel-card">
          <div className="skeleton skeleton-line" style={{ width: '55%', height: 16 }} />
          {Array.from({ length: lines }).map((_, j) => (
            <div
              key={j}
              className="skeleton skeleton-line"
              style={{ width: j % 2 ? '68%' : '88%' }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="stats-grid" aria-busy="true" aria-label={L('טוען...', 'Loading...')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat-card">
          <div className="skeleton skeleton-line" style={{ width: '50%', height: 26 }} />
          <div className="skeleton skeleton-line" style={{ width: '70%' }} />
        </div>
      ))}
    </div>
  )
}

// ----- שלדים תואמי-צורה (מפרט המסמך: לא ספינר ולא "טוען...") -----
// כל אחד משכפל את הפריסה האמיתית של המסך שלו, כדי שלא תהיה קפיצת layout.

// שורות רוסטר: ריבוע מספר חולצה + שם + פס נוכחות + תג סטטוס
export function SkeletonRoster({ count = 6 }) {
  return (
    <div className="skel-rows" aria-busy="true" aria-label={L('טוען...', 'Loading...')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skel-row">
          <div className="skeleton skel-sq" />
          <div className="skel-row-main">
            <div className="skeleton skeleton-line" style={{ width: `${52 + (i % 3) * 12}%`, height: 14, marginBottom: 6 }} />
            <div className="skeleton skeleton-line" style={{ width: '34%', height: 10, marginBottom: 0 }} />
          </div>
          <div className="skeleton skel-pill" />
        </div>
      ))}
    </div>
  )
}

// גריד סרטונים: thumbnail 16:9 + כותרת + שורת מטא
export function SkeletonMedia({ count = 6 }) {
  return (
    <div className="skel-media" aria-busy="true" aria-label={L('טוען...', 'Loading...')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skel-media-card">
          <div className="skeleton skel-thumb" />
          <div className="skeleton skeleton-line" style={{ width: '82%', height: 13 }} />
          <div className="skeleton skeleton-line" style={{ width: '46%', height: 10, marginBottom: 0 }} />
        </div>
      ))}
    </div>
  )
}

// פוסט בפיד: אווטאר + שם/זמן + פסקה + שורת פעולות
export function SkeletonFeed({ count = 3 }) {
  return (
    <div className="skel-rows" aria-busy="true" aria-label={L('טוען...', 'Loading...')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skel-post">
          <div className="skel-post-head">
            <div className="skeleton skel-avatar" />
            <div className="skel-row-main">
              <div className="skeleton skeleton-line" style={{ width: '44%', height: 13, marginBottom: 6 }} />
              <div className="skeleton skeleton-line" style={{ width: '28%', height: 10, marginBottom: 0 }} />
            </div>
          </div>
          <div className="skeleton skeleton-line" style={{ width: '94%' }} />
          <div className="skeleton skeleton-line" style={{ width: '76%', marginBottom: 0 }} />
        </div>
      ))}
    </div>
  )
}

// שורות שיחה: אווטאר עגול + שם + תצוגה מקדימה + שעה
export function SkeletonConvos({ count = 5 }) {
  return (
    <div className="skel-rows" aria-busy="true" aria-label={L('טוען...', 'Loading...')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skel-row">
          <div className="skeleton skel-avatar" />
          <div className="skel-row-main">
            <div className="skeleton skeleton-line" style={{ width: `${38 + (i % 4) * 9}%`, height: 13, marginBottom: 6 }} />
            <div className="skeleton skeleton-line" style={{ width: `${58 + (i % 3) * 11}%`, height: 10, marginBottom: 0 }} />
          </div>
          <div className="skeleton skel-time" />
        </div>
      ))}
    </div>
  )
}
