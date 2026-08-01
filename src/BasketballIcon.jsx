// Basketball — אייקון כדורסל בסגנון lucide (קו, 24x24, currentColor).
//
// למה קובץ ולא ייבוא: ל-lucide-react בגרסה שבפרויקט **אין** אייקון כדורסל,
// ועד היום השתמשנו ב-Volleyball כתחליף — כדור עם קווים שאינם תפרי כדורסל.
// זה אייקון UI של מערכת העיצוב שלנו (לא נכס חיצוני), ולכן הוא מצויר כאן
// באותם פרמטרים בדיוק של lucide כדי שיישב נכון ליד שאר האייקונים:
// viewBox 24, stroke=currentColor, strokeWidth=2, linecap/linejoin=round.
//
//   <BasketballIcon size={16} />
export default function BasketballIcon({ size = 24, className = '', ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {/* היקף הכדור */}
      <circle cx="12" cy="12" r="10" />
      {/* התפרים: אנכי, אופקי, ושתי קשתות הצד — החתימה של כדורסל */}
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="M4.9 4.9a12 12 0 0 1 0 14.2" />
      <path d="M19.1 4.9a12 12 0 0 0 0 14.2" />
    </svg>
  )
}
