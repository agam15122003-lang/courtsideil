// מגרש כדורסל סטטי בסגנון "דף מחברת" — קווים דקים על רקע לבן (כמו בשרטוטי
// מחברת האימונים), עם האובייקטים והחצים של לוח הטקטיקה (אם קיים).
const FULL = { w: 940, h: 500 }
const HALF = { w: 500, h: 470 }
const LINE = 'var(--navy-900, #1B2A4A)'

function CourtLines({ full }) {
  if (full) {
    return (
      <g stroke={LINE} strokeWidth="2" fill="none">
        <rect x="10" y="10" width="920" height="480" rx="6" />
        <line x1="470" y1="10" x2="470" y2="490" />
        <circle cx="470" cy="250" r="55" />
        <rect x="10" y="170" width="170" height="160" />
        <circle cx="180" cy="250" r="46" />
        <path d="M10 64 L150 64 Q 330 250 150 436 L10 436" />
        <rect x="760" y="170" width="170" height="160" />
        <circle cx="760" cy="250" r="46" />
        <path d="M930 64 L790 64 Q 610 250 790 436 L930 436" />
      </g>
    )
  }
  return (
    <g stroke={LINE} strokeWidth="2" fill="none">
      <rect x="10" y="10" width="480" height="450" rx="6" />
      <rect x="190" y="10" width="120" height="170" />
      <circle cx="250" cy="180" r="48" />
      <path d="M60 10 L60 150 Q 250 330 440 150 L440 10" />
    </g>
  )
}

function ObjectShape({ o }) {
  if (o.type === 'cone')
    return (
      <polygon
        points={`${o.x},${o.y - 12} ${o.x - 11},${o.y + 10} ${o.x + 11},${o.y + 10}`}
        fill="var(--orange-500, #E8763A)"
        stroke="var(--orange-700, #A8491A)"
        strokeWidth="1.5"
      />
    )
  if (o.type === 'ball')
    return <circle cx={o.x} cy={o.y} r="9" fill="var(--orange-500, #E8763A)" stroke="var(--orange-700, #A8491A)" strokeWidth="1.5" />
  if (o.type === 'defender')
    return (
      <>
        <circle cx={o.x} cy={o.y} r="14" fill="#fff" stroke="#D64545" strokeWidth="2.5" />
        <text x={o.x} y={o.y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#D64545">
          {o.label || 'X'}
        </text>
      </>
    )
  return (
    <>
      <circle cx={o.x} cy={o.y} r="14" fill="var(--navy-900, #1B2A4A)" />
      <text x={o.x} y={o.y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">
        {o.label}
      </text>
    </>
  )
}

const arcLift = (x1, y1, x2, y2) => Math.min(90, Math.hypot(x2 - x1, y2 - y1) * 0.5)
const arcPath = (x1, y1, x2, y2) =>
  `M${x1},${y1} Q${(x1 + x2) / 2},${(y1 + y2) / 2 - arcLift(x1, y1, x2, y2)} ${x2},${y2}`

function Arrow({ a }) {
  if (a.kind === 'shot')
    return (
      <path d={arcPath(a.x1, a.y1, a.x2, a.y2)} fill="none" stroke="var(--orange-500, #E8763A)" strokeWidth="3" markerEnd="url(#nb-arrow-shot)" />
    )
  return (
    <line
      x1={a.x1}
      y1={a.y1}
      x2={a.x2}
      y2={a.y2}
      stroke={LINE}
      strokeWidth="3"
      strokeDasharray={a.kind === 'pass' ? '8,7' : undefined}
      markerEnd="url(#nb-arrow)"
    />
  )
}

// step אופציונלי — שלב בודד מלוח הטקטיקה; אם אין, מצויר מגרש ריק (תבנית).
export default function CourtDiagram({ full = false, step }) {
  const dim = full ? FULL : HALF
  const objects = (step && step.objects) || []
  const arrows = (step && step.arrows) || []
  return (
    <svg viewBox={`0 0 ${dim.w} ${dim.h}`} className="nb-court" role="img" aria-label="basketball court diagram">
      <defs>
        <marker id="nb-arrow" markerWidth="11" markerHeight="11" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,1 L10,5 L0,9 Z" fill={LINE} />
        </marker>
        <marker id="nb-arrow-shot" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,1 L10,5 L0,9 Z" fill="var(--orange-500, #E8763A)" />
        </marker>
      </defs>
      <rect x="0" y="0" width={dim.w} height={dim.h} fill="#ffffff" />
      <CourtLines full={full} />
      {arrows.map((a) => (
        <Arrow key={a.id} a={a} />
      ))}
      {objects.map((o) => (
        <ObjectShape key={o.id} o={o} />
      ))}
    </svg>
  )
}
