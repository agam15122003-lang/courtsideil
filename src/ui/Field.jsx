// שדה טופס אחוד — תווית + פקד + שגיאה/רמז, עם חיווט aria מלא.
// שימוש רגיל:  <Field label="שם"><input .../></Field>
// חיווט מלא:   <Field label="שם" error={err}>{(a) => <input id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} ... />}</Field>
import { useId } from 'react'

export default function Field({ label, hint, error, className = '', children }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined

  const content =
    typeof children === 'function' ? children({ id, describedBy, invalid: !!error || undefined }) : children

  return (
    <div className={`field${error ? ' field--error' : ''}${className ? ' ' + className : ''}`}>
      {label && (
        <label className="field-label" htmlFor={typeof children === 'function' ? id : undefined}>
          {label}
        </label>
      )}
      {content}
      {hint && !error && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={errId} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
