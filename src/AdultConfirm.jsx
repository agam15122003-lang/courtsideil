import { useState } from 'react'
import { UserCheck, X } from 'lucide-react'
import { L } from './i18n'
import { toast } from './toast'
import useFocusTrap from './useFocusTrap'
import { confirmAdult } from './consent'

// מודל שנפתח לשחקן שכבר מלאו לו 18 ועדיין לא אישר את התנאים בעצמו.
// זה מה שסוגר את הממצא "במלאות 18 לא קורה כלום": הבגיר מאשר בעצמו,
// ופרטי ההורה מפסיקים לשמש בסיס להסכמה (השרת מנקה אותם ב-confirm_adult).
// props: open · onDone (אחרי אישור מוצלח) · onClose (דחייה ל"אחר כך")
export default function AdultConfirm({ open, onDone, onClose }) {
  const [agree, setAgree] = useState(false)
  const [saving, setSaving] = useState(false)
  const trapRef = useFocusTrap(!!open, () => onClose?.())

  if (!open) return null

  const submit = async (e) => {
    e.preventDefault()
    if (!agree) return
    setSaving(true)
    const res = await confirmAdult()
    setSaving(false)
    if (res.ok) {
      toast.success(L('תודה — החשבון עודכן לחשבון בוגר', 'Thanks — your account is now an adult account'))
      onDone?.()
    } else if (res.notDeployed) {
      // המסד עוד לא עודכן — לא חוסמים את המשתמש, פשוט סוגרים
      onClose?.()
    } else {
      toast.error(L('העדכון נכשל — נסו שוב', 'Update failed — please try again'))
    }
  }

  return (
    <div className="adc-overlay" onClick={() => onClose?.()}>
      <div
        className="adc-modal"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adc-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="adc-x" onClick={() => onClose?.()} aria-label={L('סגירה', 'Close')}>
          <X size={18} />
        </button>
        <span className="adc-ic"><UserCheck size={24} /></span>
        <h2 className="adc-title" id="adc-title">{L('מזל טוב — מלאו לך 18', 'Happy birthday — you are 18')}</h2>
        <p className="adc-text">
          {L('עד היום החשבון שלך פעל על סמך אישור של הורה. מגיל 18 האישור הוא שלך: אשר/י את התנאים בעצמך, ופרטי ההורה יימחקו מהחשבון.',
             'Until now your account ran on a parent’s approval. From 18 the approval is yours: accept the terms yourself, and your parent’s details will be removed from the account.')}
        </p>

        <form onSubmit={submit}>
          <label className="adc-check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              {L('קראתי ואני מסכים/ה ל', 'I have read and I agree to the ')}
              <a href="/terms.html" target="_blank" rel="noopener noreferrer">{L('תנאי השימוש', 'terms of use')}</a>
              {L(' ול', ' and the ')}
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות הפרטיות', 'privacy policy')}</a>
              {L('.', '.')}
            </span>
          </label>

          <div className="adc-actions">
            <button type="button" className="btn-ghost" onClick={() => onClose?.()} disabled={saving}>
              {L('אחר כך', 'Later')}
            </button>
            <button type="submit" className="btn-primary" disabled={!agree || saving} aria-busy={saving}>
              {saving && <span className="btn-spinner" aria-hidden="true" />}
              {saving ? L('שומר...', 'Saving...') : L('אישור', 'Confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
