import { useState } from 'react'
import { KeyRound, Check } from 'lucide-react'
import { ChevronFwd } from './DirIcon'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { passwordStrength } from './ResetPassword'
import { L } from './i18n'

// שינוי סיסמה מתוך הפרופיל (TODO §13) — למשתמש מחובר, מאמן ושחקן.
// אותה קריאת updateUser כמו במסך האיפוס; מד החוזק הוא משוב בלבד,
// כלל הוואלידציה נשאר 8 תווים.
export default function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const strength = passwordStrength(pw)
  const match = pw2 !== '' && pw === pw2
  const canSave = pw.length >= 8 && match && !saving

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setSaving(false)
    if (error) {
      toast.error(L('עדכון הסיסמה נכשל: ', 'Password update failed: ') + error.message)
      return
    }
    toast.success(L('הסיסמה עודכנה', 'Password updated'))
    setPw('')
    setPw2('')
    setOpen(false)
  }

  return (
    <div className="cpw">
      <button type="button" className="cpw-row" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="cpw-row-t">
          <KeyRound size={15} aria-hidden="true" /> {L('שינוי סיסמה', 'Change password')}
        </span>
        <ChevronFwd size={16} />
      </button>

      {open && (
        <div className="cpw-panel">
          <label className="cpw-lbl">
            <span>{L('סיסמה חדשה', 'New password')}</span>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={L('לפחות 8 תווים', 'At least 8 characters')}
              autoComplete="new-password"
              dir={pw ? 'ltr' : undefined}
            />
          </label>
          {pw && (
            <span className="cpw-meter" data-lvl={strength.level} aria-hidden="true">
              <i style={{ width: strength.pct + '%' }} />
            </span>
          )}
          <label className="cpw-lbl">
            <span>{L('אישור סיסמה', 'Confirm password')}</span>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder={L('הקלד שוב את הסיסמה', 'Type it again')}
              autoComplete="new-password"
              dir={pw2 ? 'ltr' : undefined}
            />
          </label>
          {match && (
            <span className="cpw-match">
              <Check size={13} aria-hidden="true" /> {L('הסיסמאות תואמות', 'Passwords match')}
            </span>
          )}
          <button type="button" className="btn-primary cpw-save" disabled={!canSave} onClick={save}>
            {saving ? L('מעדכן...', 'Updating...') : L('עדכון סיסמה', 'Update password')}
          </button>
        </div>
      )}
    </div>
  )
}
