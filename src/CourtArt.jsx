// CourtArt — סימן-המים של המגרש: גרדיאנט נייבי, טבעת סל כתומה, רשת וכדור.
//
// זהו האיור שהיה במסך הכניסה לפני שהוחלף בצילום (commit 38f67bc), והוא גם
// דפוס הבית מ-DESIGN.md §2ב: «Hero נייבי עם סימן-מים של מגרש». משמש כרקע
// לכל ה-hero-ים באפליקציה במקום צילומי סטוק.
//
// `preserveAspectRatio="slice"` — ממלא גם באנר רחב-ונמוך (מובייל) וגם פאנל
// גבוה-וצר (דסקטופ) בלי לעוות.

export default function CourtArt({ variant = 'hero', className = '' }) {
  // מזהה ייחוד ל-gradient: שני איורים באותו עמוד לא יכולים לחלוק id
  const gid = `court-g-${variant}`
  return (
    <svg
      className={`court-art ${className}`.trim()}
      viewBox="0 0 400 500"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={gid} cx="0.35" cy="0.28" r="0.8">
          <stop offset="0" stopColor="var(--navy-1)" />
          <stop offset="1" stopColor="var(--navy-2)" />
        </radialGradient>
      </defs>
      <rect width="400" height="500" fill={`url(#${gid})`} />

      {/* קווי מגרש — סימן-מים ב-opacity נמוך (DESIGN.md: .10–.12) */}
      <g stroke="var(--on-dark)" strokeWidth="2" opacity="0.11" fill="none">
        <circle cx="200" cy="250" r="58" />
        <path d="M0 250h400" />
        <path d="M110 500V392h180v108" />
        <path d="M200 392a56 56 0 0 1 0 112" />
      </g>

      {/* טבעת הסל */}
      <circle cx="140" cy="120" r="70" stroke="rgba(232,118,58,0.5)" strokeWidth="10" fill="none" />
      <path d="M80 120 Q140 250 200 130" stroke="rgba(255,255,255,0.14)" strokeWidth="2" fill="none" />

      {/* הכדור */}
      <circle cx="90" cy="360" r="26" fill="var(--brand)" opacity="0.9" />
      <path
        d="M70 360 H110 M90 334 V386 M74 344 Q90 360 74 376 M106 344 Q90 360 106 376"
        stroke="rgba(10,14,24,0.85)"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}
