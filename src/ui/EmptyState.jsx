// מצב ריק מזמין — אייקון, כותרת, הסבר קצר והנעה לפעולה.
// שימוש: <EmptyState icon={Dumbbell} title="אין תרגילים עדיין" desc="..." action={<Button>...</Button>} />
export default function EmptyState({ icon: Icon, title, desc, action, className = '' }) {
  return (
    <div className={`empty-state${className ? ' ' + className : ''}`}>
      {Icon && (
        <span className="empty-ic" aria-hidden="true">
          <Icon size={26} />
        </span>
      )}
      {title && <h3 className="empty-title">{title}</h3>}
      {desc && <p className="empty-desc">{desc}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
