// אווטאר עם ראשי תיבות על רקע גרדיאנט — צבע דטרמיניסטי לפי השם.
// נותן זהות ויזואלית בכל מקום בלי תלות בתמונות חיצוניות.
import { L } from './i18n'

const GRADIENTS = [
  ['#E8763A', '#A8491A'], // כתום מותג
  ['#41598C', '#1B2A4A'], // נייבי מותג
  ['#2E9E5B', '#1C6E3D'], // ירוק
  ['#3A82E8', '#1F57B0'], // כחול
  ['#9B5DE5', '#5E2CA5'], // סגול
  ['#E0A92E', '#A87A12'], // ענבר
  ['#16A4A4', '#0C6E6E'], // טורקיז
  ['#D6457A', '#9B2350'], // ורוד
]

function pick(name) {
  const s = name || ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const a = parts[0][0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1][0] || '' : ''
  return (a + b).toUpperCase()
}

export default function Avatar({ name, size = 44, className = '', url = null }) {
  // אם הועלתה תמונת פרופיל — מציגים אותה; אחרת ראשי תיבות על גרדיאנט
  if (url) {
    return (
      <img
        src={url}
        alt={name || ''}
        className={`avatar avatar-img ${className}`.trim()}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    )
  }
  const [c1, c2] = pick(name)
  return (
    <span
      className={`avatar ${className}`.trim()}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
      }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  )
}
