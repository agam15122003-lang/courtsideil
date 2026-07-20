import { useState, useEffect } from 'react'
import { KeyRound, Check, ArrowRight } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { COACHING_QUOTES } from './constants'
import { L } from './i18n'

export default function Auth({ onBack }) {
  // 'signin' = התחברות בסיסמה, 'signup' = הרשמה, 'forgot' = איפוס, 'otp' = קוד חד-פעמי
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  // מצב OTP (מייל בלבד)
  const [otpStep, setOtpStep] = useState('request') // 'request' | 'verify'
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [cooldown, setCooldown] = useState(0) // השהיה (שניות) לפני שליחה חוזרת

  // ספירה לאחור לכפתור "שלח שוב" — מונע היחסמות במגבלת הקצב
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // ציטוט מתחלף בפאנל המותג — כל דקה (זמן מספיק לקרוא)
  const [qi, setQi] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setQi((i) => (i + 1) % COACHING_QUOTES.length), 60000)
    return () => clearInterval(t)
  }, [])
  const quote = COACHING_QUOTES[qi]

  const clearAlerts = () => {
    setError(null)
    setMessage(null)
  }

  const goMode = (m) => {
    setMode(m)
    clearAlerts()
    setOtpStep('request')
    setCode('')
  }

  // ---------- סיסמה / איפוס ----------
  const handleSubmit = async (e) => {
    e.preventDefault()
    clearAlerts()
    setLoading(true)

    if (mode === 'signup') {
      if (password.length < 8) {
        setError(L('הסיסמה חייבת להכיל לפחות 8 תווים.', 'Password must be at least 8 characters.'))
        setLoading(false)
        return
      }
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(translateError(error.message))
      } else if (data.user && (data.user.identities || []).length === 0) {
        // Supabase מחזיר "הצלחה" מזויפת למייל שכבר רשום (הגנת enumeration) —
        // מזהים לפי identities ריק ומכוונים להתחברות במקום להמתין למייל שלא יגיע.
        setError(L('המייל הזה כבר רשום. נסה להתחבר או לאפס סיסמה.', 'This email is already registered. Try logging in or resetting your password.'))
      } else {
        setMessage(L('נרשמת בהצלחה! בדוק את תיבת המייל לאישור החשבון, ואז התחבר.', 'Signed up successfully! Check your inbox to confirm your account, then log in.'))
      }
    } else if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(translateError(error.message))
    } else if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '?reset=true',
      })
      if (error) setError(translateError(error.message))
      else setMessage(L('אם המייל קיים במערכת, נשלח אליו קישור לאיפוס. בדוק גם בספאם.', "If the email exists in our system, a reset link has been sent. Check your spam folder too."))
    }

    setLoading(false)
  }

  // ---------- OTP: שליחת קוד למייל ----------
  const sendCode = async () => {
    clearAlerts()
    if (!email) {
      setError(L('הזן כתובת מייל.', 'Enter an email address.'))
      return
    }
    setLoading(true)
    const res = await supabase.auth.signInWithOtp({ email })
    setSentTo(email)
    setLoading(false)
    if (res.error) {
      console.error('OTP send error:', res.error)
      const msg = translateError(res.error.message)
      setError(msg)
      toast.error(msg)
    } else {
      setOtpStep('verify')
      setCooldown(60)
      setMessage(L('שלחנו קוד למייל (ואם מוגדר — גם קישור כניסה). הזן את הקוד או לחץ על הקישור.', 'We sent a code to your email (and a sign-in link, if enabled). Enter the code or click the link.'))
      toast.success(L('הקוד נשלח למייל', 'Code sent to your email'))
    }
  }

  // ---------- OTP: אימות הקוד ----------
  const verifyCode = async () => {
    clearAlerts()
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email: sentTo,
      token: code.trim(),
      type: 'email',
    })
    setLoading(false)
    if (error) {
      const msg = translateError(error.message)
      setError(msg)
      toast.error(msg)
    }
    // הצלחה → App.jsx יזהה את ה-session אוטומטית
  }

  return (
    <div className="auth-page auth-split">
      {/* פאנל קולנועי — תמונת מגרש אמיתית + שכבת כהות, באדג', ציטוט וקפסולות */}
      <aside className="auth-hero-panel" aria-hidden="true">
        <img className="auth-hero-court" src="/auth-court.jpg" alt="" loading="eager" />
        <div className="auth-hero-overlay" />
        <div className="auth-hero-content">
          <span className="auth-hero-badge"><span className="np-dot" /> {L('קהילת המאמנים של ישראל', "Israel's coaching community")}</span>
          <blockquote className="auth-hero-quote" key={qi}>“{L(quote.text, quote.text_en)}”</blockquote>
          <span className="auth-hero-cite">— {L('מתוך ציטוטי המגרש בקהילה', 'from the court quotes in the community')}</span>
          <ul className="auth-hero-caps">
            <li>{L('7 כלים מקצועיים', '7 pro tools')}</li>
            <li>{L('חינם לכל מאמן', 'Free for every coach')}</li>
          </ul>
        </div>
      </aside>

      <div className="auth-form-panel">
        <div className="auth-card">
          {onBack && (
            <button type="button" className="link-button auth-back" onClick={onBack}>
              <ArrowRight size={15} className="back-ic" /> {L('חזרה לדף הבית', 'Back to home')}
            </button>
          )}
          <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <circle cx="42" cy="55" r="22" fill="#E8763A" />
              <circle cx="42" cy="55" r="9" fill="#fff" />
              <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="#E8763A" />
              <circle cx="78" cy="30" r="6" fill="#E8763A" />
            </svg>
          </div>
          <h1>CourtSide</h1>
          <p className="tagline auth-welcome">{L('ברוך שובך למגרש — התחבר כדי להמשיך מאיפה שעצרת.', 'Welcome back to the court — log in to pick up where you left off.')}</p>
        </div>

        {(mode === 'signin' || mode === 'signup') && (
          <div className="tabs">
            <button
              className={mode === 'signin' ? 'tab active' : 'tab'}
              onClick={() => goMode('signin')}
            >
              {L('התחברות', 'Log In')}
            </button>
            <button
              className={mode === 'signup' ? 'tab active' : 'tab'}
              onClick={() => goMode('signup')}
            >
              {L('הרשמה', 'Sign Up')}
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <div className="forgot-header">
            <h2>{L('איפוס סיסמה', 'Reset Password')}</h2>
            <p className="muted small">{L('הזן את המייל שלך ונשלח אליך קישור ליצירת סיסמה חדשה.', "Enter your email and we'll send you a link to create a new password.")}</p>
          </div>
        )}

        {mode === 'otp' && (
          <div className="forgot-header">
            <h2>{L('כניסה עם קוד חד-פעמי', 'Sign in with a one-time code')}</h2>
            <p className="muted small">
              {L('נשלח אליך קוד אימות למייל. מתאים גם להרשמה וגם להתחברות — בלי סיסמה.', "We'll email you a verification code. Works for both signing up and logging in — no password needed.")}
            </p>
          </div>
        )}

        {/* ===== טופס סיסמה / איפוס ===== */}
        {mode !== 'otp' && (
          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              {L('כתובת מייל', 'Email address')}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coach@example.com"
                required
                autoComplete="email"
                dir="ltr"
              />
            </label>

            {mode !== 'forgot' && (
              <label>
                {L('סיסמה', 'Password')}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? L('לפחות 8 תווים', 'At least 8 characters') : L('הסיסמה שלך', 'Your password')}
                  required
                  minLength={mode === 'signup' ? 8 : 6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  dir="ltr"
                />
              </label>
            )}

            {mode === 'signin' && (
              <button type="button" className="link-button" onClick={() => goMode('forgot')}>
                {L('שכחת סיסמה?', 'Forgot password?')}
              </button>
            )}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading
                ? L('רגע...', 'One moment...')
                : mode === 'signup'
                  ? L('יצירת חשבון', 'Create account')
                  : mode === 'forgot'
                    ? L('שליחת קישור איפוס', 'Send reset link')
                    : L('כניסה', 'Log in')}
            </button>

            {mode === 'signup' && (
              <p className="auth-consent muted small">
                {L('בהרשמה אתה מאשר את ', 'By signing up you agree to our ')}
                <a href="/terms.html" target="_blank" rel="noopener noreferrer">{L('תנאי השימוש', 'Terms')}</a>
                {L(' ו', ' and ')}
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות הפרטיות', 'Privacy Policy')}</a>.
              </p>
            )}
          </form>
        )}

        {/* ===== טופס OTP ===== */}
        {mode === 'otp' && (
          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); otpStep === 'request' ? sendCode() : verifyCode() }}>
            {otpStep === 'request' ? (
              <>
                <label>
                  {L('כתובת מייל', 'Email address')}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="coach@example.com"
                    autoComplete="email"
                    dir="ltr"
                  />
                </label>

                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? L('שולח...', 'Sending...') : L('שליחת קוד למייל', 'Send code to email')}
                </button>
              </>
            ) : (
              <>
                <label>
                  {L('קוד האימות מהמייל', 'Verification code from email')}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder={L('הזן את הקוד', 'Enter the code')}
                    autoComplete="one-time-code"
                    dir="ltr"
                    className="otp-code"
                  />
                </label>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading || code.length < 4}
                >
                  {loading ? L('מאמת...', 'Verifying...') : L('אימות וכניסה', 'Verify & log in')}
                </button>
                <div className="otp-foot">
                  <button
                    type="button"
                    className="link-button"
                    disabled={cooldown > 0 || loading}
                    onClick={sendCode}
                  >
                    {cooldown > 0 ? L(`שליחה מחדש (${cooldown})`, `Resend (${cooldown})`) : L('שליחת קוד מחדש', 'Resend code')}
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setOtpStep('request')
                      setCode('')
                      clearAlerts()
                    }}
                  >
                    {L('שינוי כתובת מייל', 'Change email address')}
                  </button>
                </div>
              </>
            )}
          </form>
        )}

        {/* ===== מעבר בין שיטות ===== */}
        {(mode === 'signin' || mode === 'signup') && (
          <>
            <div className="auth-divider">
              <span>{L('או', 'or')}</span>
            </div>
            <button type="button" className="btn-soft auth-otp-btn" onClick={() => goMode('otp')}>
              <KeyRound size={16} /> {L('כניסה עם קוד למייל', 'Sign in with an email code')}
            </button>
          </>
        )}

        {(mode === 'forgot' || mode === 'otp') && (
          <button type="button" className="link-button center" onClick={() => goMode('signin')}>
            <ArrowRight size={15} className="back-ic" /> {L('חזרה להתחברות', 'Back to log in')}
          </button>
        )}

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {message && <div className="alert alert-success" role="status">{message}</div>}

          <ul className="auth-trust-inline">
            <li>
              <Check size={15} /> {L('חינם להתחלה', 'Free to start')}
            </li>
            <li>
              <Check size={15} /> {L('קהילת מאמנים', 'Coaching community')}
            </li>
            <li>
              <Check size={15} /> {L('מאובטח ופרטי', 'Secure & private')}
            </li>
          </ul>
        </div>

      </div>
    </div>
  )
}


function translateError(msg) {
  msg = String(msg || '')
  // שגיאה ריקה ({} / חסר) = כשל בשליחת מייל מצד Supabase (SMTP/מכסה)
  if (!msg || msg === '{}' || msg === '[object Object]' || msg === 'undefined') {
    return L('שליחת או אימות הקוד נכשלו — נסו שוב בעוד כמה דקות.', 'Sending or verifying the code failed — try again in a few minutes.')
  }
  if (msg.includes('Error sending') || msg.includes('confirmation email') || msg.includes('magic link email')) {
    return L('המייל לא נשלח — נסו שוב בעוד כמה דקות.', 'The email was not sent — try again in a few minutes.')
  }
  if (msg.includes('Invalid login credentials')) {
    return L('מייל או סיסמה שגויים. אם שכחת — אפשר לאפס דרך "שכחת סיסמה?".', 'Incorrect email or password. If you forgot it, you can reset via "Forgot password?".')
  }
  if (msg.includes('User already registered')) {
    return L('המייל הזה כבר רשום. נסה להתחבר במקום.', 'This email is already registered. Try logging in instead.')
  }
  if (msg.includes('Password should be at least')) {
    return L('הסיסמה חייבת להכיל לפחות 8 תווים.', 'Password must be at least 8 characters.')
  }
  if (msg.includes('Email not confirmed')) {
    return L('המייל עדיין לא אושר. בדוק את תיבת הדואר ולחץ על קישור האישור.', 'Your email is not confirmed yet. Check your inbox and click the confirmation link.')
  }
  if (msg.includes('Token has expired') || msg.includes('Invalid token') || msg.includes('expired or is invalid')) {
    return L('הקוד שגוי או פג תוקף. בקש קוד חדש.', 'The code is wrong or has expired. Request a new code.')
  }
  if (msg.toLowerCase().includes('sms') || msg.includes('phone provider') || msg.includes('Unsupported phone')) {
    return L('שליחת SMS לא זמינה כרגע (דורש הגדרת ספק SMS). בינתיים אפשר להתחבר עם מייל.', 'SMS sending is not available right now (requires an SMS provider). For now, you can log in with email.')
  }
  if (msg.includes('Signups not allowed')) {
    return L('ההרשמה בשיטה הזו כבויה. פנה למנהל המערכת.', 'Sign-up with this method is disabled. Contact the system administrator.')
  }
  if (msg.includes('rate limit') || msg.includes('Too many') || msg.includes('only request this after')) {
    return L('יותר מדי ניסיונות. המתן רגע ונסה שוב.', 'Too many attempts. Wait a moment and try again.')
  }
  return L('משהו השתבש: ', 'Something went wrong: ') + msg
}
