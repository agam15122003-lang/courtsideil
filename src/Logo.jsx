// Logo — סימן ולוקאפ CourtSide. הווריאנט הנבחר: 5a, «הכדור שהוא ה-o».
//
// הסימן הוא כדורסל: עיגול כתום עם ארבעה תפרים. אותו כדור בדיוק הוא גם
// האות o במילה CourtSide, וגם הפאביקון (public/courtside-icon.svg) —
// כלומר יש סימן אחד למותג, לא שניים.
//
//   <Logo size={30} />                          — הכדור בלבד
//   <Logo size={30} withWordmark />             — הכדור בתוך המילה CourtSide
//   <Logo size={34} withWordmark withTagline /> — הלוקאפ המלא, עם הקו והשורה בעברית
//
// הכול פרופורציוני ל-size (קוטר הכדור): גוף הוורדמארק = size × 1.38
// ושורת העברית = גוף × 0.3. לכן <Logo size={40} /> מגדיל את הלוקאפ
// כולו בלי לגעת בשום מספר אחר.
//
// ⚠ לקו הכתום אין רוחב קבוע בכוונה. במסמך המסירה הוא היה גוף × 4.45,
// אבל בגופן של האתר המילה יוצאת 218px והשורה בעברית 221 — כלומר הקו
// היה נגמר לפני ה-e והשורה הייתה גולשת ממנו. הלוקאפ הוא inline-block,
// ולכן הוא מתכווץ לרוחב הילד הרחב ביותר והקו פשוט ממלא אותו.
//
// צבע דרך טוקנים בלבד (DESIGN.md §1): var(--brand) לכתום, currentColor
// לוורדמארק. התפרים הם var(--logo-seam) עם ברירת מחדל לבנה — הם מצוירים
// **על** הכדור ולא נוגעים ברקע, ולכן לבן קריא מעל כל משטח באפליקציה.
// מי שירצה תפר בצבע הרקע (המראה של «חתוך מהמשטח») יגדיר --logo-seam
// על המיכל עצמו, לא גלובלית — יש באפליקציה כמה גווני נייבי שונים.

const SEAM = 'M50 10V90M10 50h80M22 22Q50 50 22 78M78 22Q50 50 78 78'

function Ball({ px }) {
  return (
    <svg viewBox="0 0 100 100" width={px} height={px} style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="40" fill="var(--brand)" />
      <path d={SEAM} fill="none" stroke="var(--logo-seam, #fff)" strokeWidth="6" />
    </svg>
  )
}

export default function Logo({ size = 30, withWordmark = false, withTagline = false, className = '' }) {
  if (!withWordmark) return <Ball px={size} />

  const fs = Math.round(size * 1.38)                 // גוף הוורדמארק
  const ruleH = Math.max(3, Math.round(fs * 0.085))
  const tagFs = +(fs * 0.3).toFixed(1)

  // dir=ltr: «CourtSide» חייבת להיקרא משמאל לימין גם בתוך דף RTL.
  const wordmark = (
    <span
      className="cs-logo-word"
      dir="ltr"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        font: `900 ${fs}px/1 var(--font-display)`,
        letterSpacing: '-0.04em',
      }}
    >
      C
      <span style={{ display: 'inline-flex', flexShrink: 0, margin: '0 1px 2px' }}>
        <Ball px={Math.round(fs * 0.72)} />
      </span>
      urtSide
    </span>
  )

  if (!withTagline) {
    return (
      <span className={`cs-logo ${className}`.trim()} aria-label="CourtSide" role="img">
        {wordmark}
      </span>
    )
  }

  return (
    <span
      className={`cs-logo cs-logo-lockup ${className}`.trim()}
      aria-label="CourtSide — הבית של מאמני הכדורסל הישראלי"
      role="img"
      style={{ display: 'inline-block' }}
    >
      {wordmark}
      <span
        className="cs-logo-rule"
        style={{
          display: 'block',
          height: ruleH,
          borderRadius: ruleH / 2,
          background: 'var(--brand)',
          marginTop: Math.round(fs * 0.28),
        }}
      />
      <span
        className="cs-logo-tag"
        style={{
          display: 'block',
          marginTop: Math.round(fs * 0.23),
          font: `700 ${tagFs}px/1.25 var(--font-display)`,
          whiteSpace: 'nowrap',
          direction: 'rtl',
          textAlign: 'right',
        }}
      >
        הבית של מאמני הכדורסל <span style={{ color: 'var(--logo-tag-accent, var(--brand-text))' }}>הישראלי</span>
      </span>
    </span>
  )
}
