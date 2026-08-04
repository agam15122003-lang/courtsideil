import { useState } from 'react'
import { KeyRound, Check } from 'lucide-react'
import { ChevronFwd } from './DirIcon'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { passwordStrength, PasswordRules } from './ResetPassword'
import { checkPassword, passwordServerError } from './constants'
import { L } from './i18n'

// שינוי סיסמה מתוך הפרופיל (TODO §13) — למשתמש מחובר, מאמן ושחקן.
// אותה קריאת updateUser כמו במסך האיפוס; מד החוזק הוא משוב בלבד,
// וכללי הוואלידציה מגיעים מ-checkPassword (constants.js) — אותם כללים
// בדיוק כמו בהרשמה ובאיפוס. גם כאן: בדיקת קליינט = UX, לא אכיפה.
export default function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const strength = passwordStrength(pw)
  const check = checkPassword(pw)
  const match = pw2 !== '' && pw === pw2
  // הכפתור נשאר פעיל גם כשהסיסמה לא עומדת בכללים — כך המשתמש מקבל הודעה
  // שאומרת מה חסר, במקום כפתור אפור בלי הסבר.
  const canSave = pw !== '' && match && !saving

  const save = async () => {
    setErr(null)
    if (!check.valid) {
      setErr(L(check.errorHe, check.errorEn))
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setSaving(false)
    if (error) {
      // דחייה מצד השרת (ההגדרות בדשבורד) — מוצגת בעברית ליד הכפתור, לא רק
      // כטוסט חולף, כדי שהמשתמש יראה מה לתקן בזמן שהוא מקליד מחדש
      const pwErr = passwordServerError(error.message)
      const text = pwErr
        ? L(pwErr.he, pwErr.en)
        : L('עדכון הסיסמה נכשל: ', 'Password update failed: ') + error.message
      setErr(text)
      toast.error(text)
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
              onChange={(e) => {
                setPw(e.target.value)
                setErr(null) // ההודעה נעלמת ברגע שמתחילים לתקן
              }}
              placeholder={L('לפחות 8 תווים ואות גדולה', 'At least 8 chars + a capital')}
              autoComplete="new-password"
              dir={pw ? 'ltr' : undefined}
            />
          </label>
          {pw && (
            <span className="cpw-meter" data-lvl={strength.level} aria-hidden="true">
              <i style={{ width: strength.pct + '%' }} />
            </span>
          )}
          {/* אותה רשימת דרישות חיה כמו בהרשמה ובאיפוס */}
          <PasswordRules password={pw} />
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
          {/* אינליין ולא csa-err: הכלל הזה מוגדר כ-.csa .csa-err, והפאנל הזה
              יושב בפרופיל (.cpw) ולא תחת .csa. רק טוקנים, בלי hex. */}
          {err && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--danger)' }} role="alert">
              {err}
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
