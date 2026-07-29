// Logo — סימן CourtSide. ארבע צורות: כדור, נקודת אור, שריקה וכפתור.
//
// היה משוכפל חמש פעמים באפליקציה (App.jsx, Auth.jsx, ResetPassword.jsx,
// ופעמיים ב-Dashboard.jsx) — בכל פעם עם ‎#E8763A קשיח, בניגוד לחוק הטוקנים
// של DESIGN.md §1. כאן הוא פעם אחת, דרך var(--brand).
//
//   <Logo size={30} />              — הסימן בלבד
//   <Logo size={30} withWordmark /> — הסימן + "CourtSide"

export default function Logo({ size = 30, withWordmark = false, className = '' }) {
  const mark = (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="42" cy="55" r="22" fill="var(--brand)" />
      <circle cx="42" cy="55" r="9" fill="var(--on-dark)" />
      <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="var(--brand)" />
      <circle cx="78" cy="30" r="6" fill="var(--brand)" />
    </svg>
  )

  if (!withWordmark) return mark

  return (
    <span className={`cs-logo ${className}`.trim()}>
      {mark}
      <span className="cs-logo-word">CourtSide</span>
    </span>
  )
}
