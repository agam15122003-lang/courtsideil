// תגית סמנטית — success / warning / error / info / accent / neutral (ברירת מחדל).
// שימוש: <Badge tone="success">מאומת</Badge>
export default function Badge({ tone = 'neutral', className = '', children }) {
  return <span className={`badge badge--${tone}${className ? ' ' + className : ''}`}>{children}</span>
}
