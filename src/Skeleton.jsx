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
