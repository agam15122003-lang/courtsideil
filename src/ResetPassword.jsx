import { useState } from 'react'
import { Check, Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react'
import { supabase } from './supabaseClient'
import Logo from './Logo'
import { L } from './i18n'

// מד חוזק סיסמה — משוב בלבד. חוק הוואלידציה נשאר 8 תווים (README §1c/§1h),
// המד לא מוסיף כלל חדש. מיוצא כדי שמסך ההרשמה (1c) ייבא את אותה נוסחה
// במקום לשכפל אותה.
//   <8 תווים            → חלשה (אדום)
//   8+                  → בסדר
//   8+ עם אות גדולה/ספרה → טובה (72%)
//   12+ מעורב           → חזקה (92%)
export function passwordStrength(pw) {
  const v = pw || ''
  const upper = /[A-Z]/.test(v)
  const digit = /\d/.test(v)
  const symbol = /[^A-Za-z0-9]/.test(v)
  const mixed = (upper ? 1 : 0) + (digit ? 1 : 0) + (symbol ? 1 : 0) >= 2

  if (v.length < 8) return { level: 'weak', pct: v ? 30 : 0, label: L('חלשה', 'Weak') }
  if (v.length >= 12 && mixed) return { level: 'strong', pct: 92, label: L('חזקה', 'Strong') }
  if (upper || digit) return { level: 'good', pct: 72, label: L('טובה', 'Good') }
  return { level: 'fair', pct: 52, label: L('בסדר', 'Fair') }
}

// קורא שגיאה מקישור איפוס פגום/מנוצל: Supabase מחזיר
// "...#error=access_denied&error_code=otp_expired&error_description=..."
function readLinkError() {
  try {
    const h = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
    if (h.get('error')) return h.get('error_description') || h.get('error_code') || h.get('error')
  } catch { /* ללא hash */ }
  return null
}

// מסך זה מוצג כשהמשתמש מגיע מקישור איפוס הסיסמה במייל.
export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [linkError] = useState(readLinkError)

  const goHome = () => {
    window.location.href = window.location.origin
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (password !== confirm) {
      setError(L('הסיסמאות אינן תואמות. נסה שוב.', "The passwords don't match. Try again."))
      return
    }
    if (password.length < 8) {
      setError(L('הסיסמה חייבת להכיל לפחות 8 תווים.', 'Password must be at least 8 characters.'))
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(L('משהו השתבש: ', 'Something went wrong: ') + error.message)
    } else {
      setDone(true)
      setMessage(L('הסיסמה עודכנה בהצלחה!', 'Password updated successfully!'))
      setTimeout(goHome, 2500)
    }
  }

  // משוב חי על התאמת הסיסמאות
  const matchState = !confirm ? null : password === confirm ? 'ok' : 'bad'
  const strength = passwordStrength(password)

  // באנר שטוח 150px — גרדיאנט נייבי נקי, בלי איור, עם הלוגו בתחתית
  const banner = (
    <aside className="csa-banner csa-banner--flat">
      <div className="csa-banner-body">
        <div className="csa-brand rp-brand-push">
          <Logo size={26} />
          <span>CourtSide</span>
        </div>
      </div>
    </aside>
  )

  // ===== קישור פג תוקף / מנוצל — מסך משלו, עם דרך יציאה =====
  if (linkError) {
    return (
      <div className="csa rp">
        {banner}
        <div className="csa-sheet csa-sheet--flat csa-sheet--center">
          <div className="csa-sheet-in">
            <span className="csa-hero-ic rp-hero-ic--warn" aria-hidden="true">
              <AlertTriangle size={34} />
            </span>
            <h1>{L('קישור האיפוס פג תוקף', 'The reset link has expired')}</h1>
            <p>
              {L(
                'קישורי איפוס תקפים לשעה אחת ולשימוש חד-פעמי. חוזרים לדף ההתחברות, לוחצים "שכחת סיסמה?" ומקבלים קישור חדש.',
                'Reset links are valid for one hour and for a single use. Go back to the login page, tap "Forgot password?" and get a fresh link.',
              )}
            </p>
            <button type="button" className="btn-primary" onClick={goHome}>
              {L('חזרה לדף ההתחברות', 'Back to login')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== המסך הרגיל — בחירת סיסמה חדשה =====
  return (
    <div className="csa rp">
      {banner}

      <div className="csa-sheet csa-sheet--flat">
        <div className="csa-sheet-in">
          <div className="csa-head">
            <h1>{L('סיסמה חדשה', 'New password')}</h1>
            <p>
              {L(
                'בוחרים סיסמה שאתה יכול לזכור, ואנחנו נדאג שתישאר מחובר.',
                "Pick a password you can actually remember — we'll keep you signed in.",
              )}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="csa-form">
            {/* --- סיסמה חדשה + מד חוזק --- */}
            <label className="csa-lbl csa-lbl--meter">
              <span className="csa-lbl-row">
                <span className="csa-lbl-t">{L('סיסמה חדשה', 'New password')}</span>
                {password && (
                  <span className="csa-meter-t" data-lvl={strength.level}>
                    {L('חוזק: ', 'Strength: ')}
                    {strength.label}
                  </span>
                )}
              </span>
              <span className="csa-field">
                <Lock size={18} aria-hidden="true" />
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={L('לפחות 8 תווים', 'At least 8 characters')}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  /* dir רק כשיש תוכן — placeholder עברי ב-dir="ltr" הוא באג מתועד (DESIGN.md §4) */
                  dir={password ? 'ltr' : undefined}
                  disabled={done}
                />
                <button
                  type="button"
                  className={show ? 'csa-eye is-on' : 'csa-eye'}
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? L('הסתרת הסיסמה', 'Hide password') : L('הצגת הסיסמה', 'Show password')}
                  aria-pressed={show}
                >
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </span>
              <span className="csa-meter" data-lvl={strength.level} aria-hidden="true">
                <i style={{ width: strength.pct + '%' }} />
              </span>
            </label>

            {/* --- אישור סיסמה --- */}
            <label className="csa-lbl">
              <span className="csa-lbl-t">{L('אישור סיסמה', 'Confirm password')}</span>
              <span
                className={
                  'csa-field' + (matchState === 'ok' ? ' is-ok' : matchState === 'bad' ? ' is-bad' : '')
                }
              >
                <Lock size={18} aria-hidden="true" />
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={L('הקלד שוב את הסיסמה', 'Re-enter the password')}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  dir={confirm ? 'ltr' : undefined}
                  disabled={done}
                />
                {matchState === 'ok' && (
                  <span className="csa-field-ok" aria-hidden="true">
                    <Check size={19} />
                  </span>
                )}
              </span>
              {matchState === 'ok' && (
                <span className="rp-match">
                  <Check size={13} aria-hidden="true" /> {L('הסיסמאות תואמות', 'Passwords match')}
                </span>
              )}
              {matchState === 'bad' && (
                <span className="csa-err">{L('הסיסמאות אינן תואמות', "Passwords don't match")}</span>
              )}
            </label>

            {/* טעינה: הכפתור נשאר במקום, מתכהה ומקבל ספינר — בלי קפיצת לייאאוט */}
            {!done ? (
              <button
                type="submit"
                className={loading ? 'btn-primary is-busy' : 'btn-primary'}
                disabled={loading || matchState === 'bad'}
              >
                {loading ? (
                  <>
                    <span className="csa-spin" aria-hidden="true" />
                    {L('רגע...', 'One moment...')}
                  </>
                ) : (
                  L('עדכון סיסמה', 'Update password')
                )}
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={goHome}>
                {L('המשך לאתר', 'Continue to the site')}
              </button>
            )}

            {error && <div className="csa-note csa-note--danger" role="alert">{error}</div>}
            {message && <div className="csa-note csa-note--ok" role="status">{message}</div>}

            {!done && (
              <p className="rp-auto">
                {L(
                  'אחרי העדכון נכניס אותך לאפליקציה אוטומטית — בלי להקליד שוב.',
                  "Once it's updated we'll sign you in automatically — no need to type it again.",
                )}
              </p>
            )}

            {/* באנר אזהרה תחתון — קישור ישן, עם דרך יציאה */}
            {!done && (
              <div className="csa-note csa-note--warn rp-push">
                <AlertTriangle size={18} aria-hidden="true" />
                {/* הקישור יושב בתוך המשפט, לא ככפתור נפרד (1h בפרוטוטייפ) */}
                <span>
                  {L('הגעת לכאן מקישור ישן? קישורי איפוס תקפים לשעה ולשימוש אחד — נבקש חדש ב', 'Arrived from an old link? Reset links are valid for one hour and a single use — request a new one via ')}
                  <button type="button" className="link-button" onClick={goHome}>
                    {L('שכחת סיסמה', 'Forgot password')}
                  </button>
                  .
                </span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
