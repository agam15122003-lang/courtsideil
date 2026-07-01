import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from './supabaseClient'
import { L } from './i18n'

// מסך זה מוצג כשהמשתמש מגיע מקישור איפוס הסיסמה במייל.
export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

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

  return (
    <div className="auth-page">
      <div className="auth-center">
        <div className="auth-card">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <circle cx="42" cy="55" r="22" fill="var(--accent)" />
              <circle cx="42" cy="55" r="9" fill="#fff" />
              <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="var(--accent)" />
              <circle cx="78" cy="30" r="6" fill="var(--accent)" />
            </svg>
          </div>
          <h1>CourtSide</h1>
        </div>

        <div className="forgot-header">
          <h2>{L('בחירת סיסמה חדשה', 'Choose a new password')}</h2>
          <p className="muted small">{L('הזן סיסמה חדשה לחשבון שלך.', 'Enter a new password for your account.')}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            {L('סיסמה חדשה', 'New password')}
            <div className="pw-field">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={L('לפחות 8 תווים', 'At least 8 characters')}
                required
                minLength={8}
                autoComplete="new-password"
                dir="ltr"
                disabled={done}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? L('הסתרת הסיסמה', 'Hide password') : L('הצגת הסיסמה', 'Show password')}
                tabIndex={-1}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label>
            {L('אישור סיסמה', 'Confirm password')}
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={L('הקלד שוב את הסיסמה', 'Re-enter the password')}
              required
              minLength={6}
              autoComplete="new-password"
              dir="ltr"
              disabled={done}
            />
            {matchState && (
              <span className={`pw-match ${matchState}`}>
                {matchState === 'ok' ? L('הסיסמאות תואמות ✓', 'Passwords match ✓') : L('הסיסמאות אינן תואמות', "Passwords don't match")}
              </span>
            )}
          </label>

          {!done ? (
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || (matchState === 'bad')}
            >
              {loading ? L('רגע...', 'One moment...') : L('עדכון סיסמה', 'Update password')}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={goHome}>
              {L('המשך לאתר', 'Continue to the site')}
            </button>
          )}
        </form>

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {message && <div className="alert alert-success" role="status">{message}</div>}
        </div>

        <footer className="auth-footer">{L('נבנה למען קהילת המאמנים', 'Built for the coaching community')}</footer>
      </div>
    </div>
  )
}
