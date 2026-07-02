// כפתור אחוד — וריאנטים על גבי מחלקות ה-CSS הקנוניות + מצב טעינה נגיש.
// שימוש: <Button variant="danger" loading={saving} onClick={...}>מחיקה</Button>
import { Loader2 } from 'lucide-react'

const VARIANTS = {
  primary: 'btn-primary',
  soft: 'btn-soft',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

export default function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const cls = [VARIANTS[variant] || VARIANTS.primary, loading ? 'btn-loading' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 size={16} className="btn-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
