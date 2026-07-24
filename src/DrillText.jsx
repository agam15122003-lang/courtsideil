// תיאור תרגיל קריא: מאמנים כותבים שלבים בתוך פסקה אחת ("1 - ... 2 - ... 3 - ")
// והשחקן קיבל קיר טקסט. כאן מזהים מספור עולה ורצוף והופכים אותו לרשימת שלבים.
// אם אין מספור אמיתי — מציגים את הטקסט כמו שהוא, בלי לגעת.

const MARK = /(?:^|[\s·|(])(\d{1,2})\s*[-–.)]\s+/g

export function parseSteps(text) {
  if (!text || typeof text !== 'string' || text.length < 60) return null

  const marks = []
  MARK.lastIndex = 0
  let m
  while ((m = MARK.exec(text))) {
    marks.push({ num: Number(m[1]), start: m.index, textStart: MARK.lastIndex })
  }
  // דורשים לפחות 3 שלבים במספור רצוף שמתחיל ב-1 — אחרת זה סתם מספר בתוך המשפט
  if (marks.length < 3) return null
  if (marks[0].num !== 1) return null
  for (let i = 1; i < marks.length; i++) {
    if (marks[i].num !== marks[i - 1].num + 1) return null
  }

  const intro = text.slice(0, marks[0].start).trim()
  const steps = marks.map((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length
    return text.slice(mk.textStart, end).trim().replace(/[,;]$/, '')
  }).filter(Boolean)

  if (steps.length < 3) return null
  return { intro, steps }
}

export default function DrillText({ text, className = '' }) {
  const parsed = parseSteps(text)
  if (!parsed) return <p className={className}>{text}</p>

  return (
    <div className={className}>
      {parsed.intro && <p className="dt-intro">{parsed.intro}</p>}
      <ol className="dt-steps">
        {parsed.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  )
}
