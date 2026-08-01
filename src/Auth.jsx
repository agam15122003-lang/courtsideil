import { useState, useEffect, useRef } from 'react'
import { Mail, Lock, Eye, EyeOff, KeyRound, Check, Clock, ChevronDown, MailCheck, AlertTriangle } from 'lucide-react'
import { ChevronBack } from './DirIcon'
import Logo from './Logo'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { COACHING_QUOTES, ISRAELI_CLUBS } from './constants'
import { passwordStrength } from './ResetPassword'
import { L } from './i18n'

// מייל בלי סיום דומיין — הודעת שדה ליד הקלט, לא באנר בתחתית המסך
const emailLooksWhole = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

// אורך הקוד החד-פעמי (1g) — שישה תאים נפרדים
const CODE_LEN = 6

// «פתיחת תיבת המייל» (1f): הספקים הנפוצים נפתחים ישירות בתיבה הנכונה.
// לדומיין שאינו מוכר נופלים ל-mailto: — פותח את אפליקציית המייל של המכשיר.
const MAILBOX_BY_DOMAIN = {
  'gmail.com': 'https://mail.google.com/mail/u/0/#inbox',
  'googlemail.com': 'https://mail.google.com/mail/u/0/#inbox',
  'outlook.com': 'https://outlook.live.com/mail/0/inbox',
  'hotmail.com': 'https://outlook.live.com/mail/0/inbox',
  'hotmail.co.il': 'https://outlook.live.com/mail/0/inbox',
  'live.com': 'https://outlook.live.com/mail/0/inbox',
  'msn.com': 'https://outlook.live.com/mail/0/inbox',
  'yahoo.com': 'https://mail.yahoo.com',
  'icloud.com': 'https://www.icloud.com/mail',
  'me.com': 'https://www.icloud.com/mail',
  'walla.com': 'https://mail.walla.co.il',
  'walla.co.il': 'https://mail.walla.co.il',
  'proton.me': 'https://mail.proton.me',
  'protonmail.com': 'https://mail.proton.me',
}
function openMailbox(address) {
  const domain = String(address || '').split('@')[1]
  const url = MAILBOX_BY_DOMAIN[(domain || '').trim().toLowerCase()]
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
  else window.location.href = 'mailto:'
}

// onSignupFlow — «הרשמה» מהטאבים מוביל לאותו מסלול בדיוק כמו מדף הנחיתה:
// בחירת תפקיד (מאמן/שחקן) ואז הרשמה. בלעדיו המשתמש היה נרשם בתפקיד
// שנשמר מקודם, בלי לדעת שיש בחירה בכלל.
export default function Auth({ onBack, role = 'coach', initialMode = 'signin', onSignupFlow }) {
  // 'signin' = התחברות בסיסמה, 'signup' = הרשמה, 'forgot' = איפוס, 'otp' = קוד חד-פעמי
  // מי שהגיע דרך בחירת תפקיד או קוד קבוצה נוחת ישר על ההרשמה (App.jsx קובע)
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  // שדות ההרשמה (1c) — שם ומועדון נשמרים ב-user_metadata, בלי שינוי סכימה
  const [fullName, setFullName] = useState('')
  const [club, setClub] = useState('')
  const [consent, setConsent] = useState(false)

  // 1f — «הקישור נשלח» הוא מסך מלא, לא באנר הצלחה
  const [sentStep, setSentStep] = useState(false)

  // מצב OTP (מייל בלבד)
  const [otpStep, setOtpStep] = useState('request') // 'request' | 'verify'
  // התאים נשמרים כמערך באורך קבוע ולא כמחרוזת דחוסה: ב-join('') תא ריק
  // באמצע מתקפל וכל הספרות שאחריו זזות אחורה — הקוד משתנה בשקט.
  const [codeCells, setCodeCells] = useState(() => Array(CODE_LEN).fill(''))
  const code = codeCells.join('')
  // מונע אימות אוטומטי כפול על אותו קוד. מתאפס יחד עם התאים — אחרת קוד
  // שנדחה, נמחק והוקלד שוב זהה לא היה נשלח שנית.
  const autoSent = useRef('')
  const clearCode = () => {
    setCodeCells(Array(CODE_LEN).fill(''))
    autoSent.current = ''
  }
  const [sentTo, setSentTo] = useState('')
  const [cooldown, setCooldown] = useState(0) // השהיה (שניות) לפני שליחה חוזרת

  // ספירה לאחור לכפתור "שלח שוב" — מונע היחסמות במגבלת הקצב
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // ציטוט מתחלף בפאנל המותג — כל 8 שניות
  const [qi, setQi] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setQi((i) => (i + 1) % COACHING_QUOTES.length), 8000)
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
    clearCode()
    setSentStep(false)
  }

  const emailBad = emailTouched && email.trim() !== '' && !emailLooksWhole(email)
  const isSignup = mode === 'signup'
  // מד החוזק הוא משוב בלבד — כלל הוואלידציה נשאר 8 תווים
  const strength = passwordStrength(password)

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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // שם מלא ומועדון נכנסים ל-user_metadata — אין טבלה חדשה ואין שינוי סכימה
        options: { data: { full_name: fullName.trim(), club: club.trim() || null } },
      })
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
      else {
        // הצלחה = מסך מלא (1f). הודעת ההגנה מפני enumeration עוברת לתחתית המסך.
        setSentTo(email)
        setSentStep(true)
        setCooldown(60)
      }
    }

    setLoading(false)
  }

  // ---------- 1f: שליחה חוזרת של קישור האיפוס (אותה קריאה, אחרי שההשהיה נגמרה) ----------
  const resendReset = async () => {
    clearAlerts()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(sentTo, {
      redirectTo: window.location.origin + '?reset=true',
    })
    setLoading(false)
    if (error) {
      setError(translateError(error.message))
      return
    }
    setCooldown(60)
    toast.success(L('שלחנו קישור נוסף', 'Another link is on its way'))
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

  // ---------- 1g: שישה תאי קוד ----------
  const codeRefs = useRef([])
  const focusCell = (i) => codeRefs.current[i]?.focus()
  const writeCode = (cells) => setCodeCells(cells.slice(0, CODE_LEN))

  // הקלדה בתא: ספרה מקדמת לתא הבא; כמה ספרות (הדבקה/מילוי אוטומטי) מתפזרות קדימה
  const onCodeInput = (i, raw) => {
    const digits = String(raw).replace(/\D/g, '')
    const cells = codeCells.slice()
    if (!digits) {
      cells[i] = ''
      writeCode(cells)
      return
    }
    for (let k = 0; k < digits.length && i + k < CODE_LEN; k++) cells[i + k] = digits[k]
    writeCode(cells)
    focusCell(Math.min(i + digits.length, CODE_LEN - 1))
  }

  // Backspace בתא ריק — מוחק את התא הקודם וחוזר אליו
  const onCodeKey = (i, e) => {
    if (e.key !== 'Backspace' || codeCells[i] || i === 0) return
    e.preventDefault()
    const cells = codeCells.slice()
    cells[i - 1] = ''
    writeCode(cells)
    focusCell(i - 1)
  }

  const onCodePaste = (i, e) => {
    const digits = ((e.clipboardData && e.clipboardData.getData('text')) || '').replace(/\D/g, '')
    if (!digits) return
    e.preventDefault()
    onCodeInput(i, digits)
  }

  // קוד מלא → אימות אוטומטי, פעם אחת לכל קוד (לא לולאה אחרי שגיאה)
  useEffect(() => {
    if (mode !== 'otp' || otpStep !== 'verify') return
    if (loading || code.length !== CODE_LEN || autoSent.current === code) return
    autoSent.current = code
    verifyCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, mode, otpStep, loading])

  // ---------- חלקים משותפים ----------
  // טעינה: הכפתור נשאר במקום, מתכהה, ומקבל ספינר — בלי קפיצת לייאאוט
  const busyLabel = (label) =>
    loading ? (
      <>
        <span className="csa-spin" aria-hidden="true" />
        {L('רגע...', 'One moment...')}
      </>
    ) : (
      label
    )

  const emailField = (
    <label className="csa-lbl">
      <span className="csa-lbl-t">{L('כתובת מייל', 'Email address')}</span>
      <span className={emailBad ? 'csa-field is-bad' : 'csa-field'}>
        <Mail size={18} aria-hidden="true" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          placeholder="coach@example.com"
          required
          autoComplete="email"
          dir="ltr"
        />
      </span>
      {emailBad && (
        <span className="csa-err">
          {L('כתובת המייל לא נראית שלמה — חסר סיום דומיין.', 'That email looks incomplete — the domain ending is missing.')}
        </span>
      )}
    </label>
  )

  // שם מלא (1c) — בלי אייקון, כמו בעיצוב
  const nameField = (
    <label className="csa-lbl">
      <span className="csa-lbl-t">{L('שם מלא', 'Full name')}</span>
      <span className="csa-field">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={L('יוסי לוי', 'Alex Cohen')}
          required
          autoComplete="name"
        />
      </span>
    </label>
  )

  // מועדון (1c) — אופציונלי, מתוך רשימת המועדונים בישראל
  const clubField = (
    <label className="csa-lbl">
      <span className="csa-lbl-t">
        {L('מועדון', 'Club')} <span className="csa-opt">· {L('אופציונלי', 'optional')}</span>
      </span>
      <span className="csa-field">
        <select value={club} onChange={(e) => setClub(e.target.value)}>
          <option value="">{L('בחירת מועדון', 'Choose a club')}</option>
          {ISRAELI_CLUBS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <ChevronDown size={17} aria-hidden="true" />
      </span>
    </label>
  )

  // הסכמה מפורשת (1c) — חוסמת את הכפתור הראשי עד לסימון
  const consentBox = (
    <label className="csa-consent">
      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
      <span className="csa-consent-box" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
      <span className="csa-consent-tx">
        {L('קראתי ואני מאשר את ', 'I have read and accept the ')}
        {/* stopPropagation — לחיצה על הקישור לא אמורה לסמן את הצ׳קבוקס */}
        <a href="/terms.html" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {L('תנאי השימוש', 'Terms of Use')}
        </a>
        {L(' ו', ' and ')}
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {L('מדיניות הפרטיות', 'Privacy Policy')}
        </a>
        {L(', כולל שמירת פרטי שחקנים בקבוצות שלי.', ', including storing my players’ details in my teams.')}
      </span>
    </label>
  )

  const passwordField = (
    <label className={isSignup ? 'csa-lbl csa-lbl--meter' : 'csa-lbl'}>
      {isSignup ? (
        <span className="csa-lbl-row">
          <span className="csa-lbl-t">{L('סיסמה', 'Password')}</span>
          <span className="csa-meter-t" data-lvl={strength.level}>
            {L('חוזק: ', 'Strength: ')}
            {strength.label}
          </span>
        </span>
      ) : (
        <span className="csa-lbl-t">{L('סיסמה', 'Password')}</span>
      )}
      <span className="csa-field">
        <Lock size={18} aria-hidden="true" />
        <input
          type={showPw ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'signup' ? L('לפחות 8 תווים', 'At least 8 characters') : L('הסיסמה שלך', 'Your password')}
          required
          minLength={mode === 'signup' ? 8 : 6}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          /* dir רק כשיש תוכן — placeholder עברי ב-dir="ltr" הוא באג מתועד (DESIGN.md §4) */
          dir={password ? 'ltr' : undefined}
        />
        <button
          type="button"
          className={showPw ? 'csa-eye is-on' : 'csa-eye'}
          onClick={() => setShowPw((s) => !s)}
          aria-label={showPw ? L('הסתרת הסיסמה', 'Hide password') : L('הצגת הסיסמה', 'Show password')}
          aria-pressed={showPw}
        >
          {showPw ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
      {isSignup && (
        <>
          <span className="csa-meter" data-lvl={strength.level} aria-hidden="true">
            <i style={{ width: strength.pct + '%' }} />
          </span>
          <span className="csa-hint">
            {L('לפחות 8 תווים. אות גדולה או מספר עושים את ההבדל.', 'At least 8 characters. A capital letter or a number makes the difference.')}
          </span>
        </>
      )}
    </label>
  )

  const alerts = (
    <>
      {error && <div className="csa-note csa-note--danger" role="alert">{error}</div>}
      {message && <div className="csa-note csa-note--ok" role="status">{message}</div>}
    </>
  )

  const otpButton = (
    <button type="button" className="btn-soft auth-otp-btn" onClick={() => goMode('otp')}>
      <KeyRound size={18} /> {L('כניסה עם קוד למייל', 'Sign in with an email code')}
    </button>
  )

  // ---------- הבאנר (= הפאנל הקולנועי) ----------
  const flatBanner = mode === 'forgot' || mode === 'otp'
  const sentScreen = mode === 'forgot' && sentStep
  const bannerClass =
    'auth-hero-panel csa-banner' +
    (mode === 'signup' ? ' csa-banner--signup' : flatBanner ? ' csa-banner--flat' : '')

  return (
    <div className="auth-page auth-split csa">
      {/* פאנל קולנועי — תמונת מגרש + גרדיאנט + ציטוט מתחלף.
          במובייל הוא הבאנר העליון; מעל 861px הוא פאנל צד, כמו קודם. */}
      <aside className={bannerClass}>
        {!flatBanner && (
          <>
            {/* תמונת המגרש היא הבאנר עצמו — ה-object-position משתנה לפי המסך
                דרך .csa-banner--role / --signup, כמו בפרוטוטייפ (42% / 38% / 30%) */}
            <img className="csa-banner-img" src="/auth-court.jpg" alt="" aria-hidden="true" />
            <div className="auth-hero-overlay csa-veil" aria-hidden="true" />
          </>
        )}

        <div className="auth-hero-content csa-banner-body">
          {mode === 'signin' && (
            <>
              {/* מסך ההתחברות נפתח עכשיו ישירות מדף הנחיתה, ולכן הוא חייב
                  דרך חזרה משלו — בלעדיה הנכנס בטעות נתקע בלי ניווט. */}
              {onBack && (
                <button type="button" className="csa-back csa-back--push" onClick={onBack}>
                  <ChevronBack size={17} /> {L('חזרה לדף הבית', 'Back to home')}
                </button>
              )}
              <div className="csa-brand" style={{ marginTop: 6 }}>
                <Logo size={30} />
                <span>CourtSide</span>
              </div>
              <h1 className="csa-title csa-title--push">{L('ברוך שובך למגרש', 'Welcome back to the court')}</h1>
              <p className="csa-quote" key={qi}>
                ״{L(quote.text, quote.text_en)}״ <cite>— {L(quote.author, quote.author_en)}</cite>
              </p>
              <ul className="auth-hero-caps">
                <li>{L('הבית של מאמנים ושחקנים', 'A home for coaches and players')}</li>
                <li>{L('ידע שמשתפים יחד', 'Knowledge shared together')}</li>
                <li>{L('קהילה שגדלה יחד', 'A community growing together')}</li>
              </ul>
            </>
          )}

          {mode === 'signup' && (
            <>
              {/* 1c — הקישור חוזר לבחירת התפקיד, לא להתחברות (README §1c) */}
              <button type="button" className="csa-back csa-back--push" onClick={onBack}>
                <ChevronBack size={17} /> {L('חזרה לבחירת תפקיד', 'Back to role selection')}
              </button>
              <h1 className="csa-title">
                {L('מצטרפים ל-CourtSide', 'Joining CourtSide')}
              </h1>
            </>
          )}

          {flatBanner && (
            <button type="button" className="csa-back csa-back--push" onClick={() => goMode('signin')}>
              <ChevronBack size={17} /> {L('חזרה להתחברות', 'Back to log in')}
            </button>
          )}
        </div>
      </aside>

      <div
        className={
          'auth-form-panel csa-sheet' +
          (flatBanner ? ' csa-sheet--flat csa-sheet--wide' : '') +
          (sentScreen ? ' csa-sheet--center' : '')
        }
      >
        <div className="auth-card csa-sheet-in">
          {/* ===== 1f · הקישור נשלח — מסך מלא במקום באנר הצלחה ===== */}
          {sentScreen && (
            <>
              <span className="csa-hero-ic" aria-hidden="true">
                <MailCheck size={34} />
              </span>
              <h1>{L('הקישור בדרך אליך', 'The link is on its way')}</h1>
              <p>
                {L('שלחנו קישור לאיפוס סיסמה ל-', 'We sent a password reset link to ')}
                <bdi dir="ltr">{sentTo}</bdi>
                {L(
                  '. פותחים את המייל, לוחצים על הכפתור, וממשיכים לבחירת סיסמה חדשה.',
                  '. Open the email, tap the button, and continue to choosing a new password.',
                )}
              </p>

              <button type="button" className="btn-primary" onClick={() => openMailbox(sentTo)}>
                {L('פתיחת תיבת המייל', 'Open your mailbox')}
              </button>

              {error && (
                <div className="csa-note csa-note--danger" role="alert">
                  <AlertTriangle size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="csa-card">
                <b>{L('לא הגיע?', 'Didn’t arrive?')}</b>
                <span className="csa-bullet">{L('בודקים בספאם ובקידומי מכירות.', 'Check the spam and promotions folders.')}</span>
                <span className="csa-bullet">{L('מוודאים שהמייל נכון — אפשר לשנות אותו כאן.', 'Make sure the address is right — you can change it here.')}</span>
                <div className="csa-card-acts">
                  <button type="button" disabled={cooldown > 0 || loading} onClick={resendReset}>
                    {cooldown > 0 ? (
                      <>
                        {L('שליחה מחדש', 'Resend')} <bdi dir="ltr">({cooldown})</bdi>
                      </>
                    ) : (
                      L('שליחה מחדש', 'Resend')
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSentStep(false)
                      clearAlerts()
                    }}
                  >
                    {L('שינוי המייל', 'Change email')}
                  </button>
                </div>
              </div>

              <p className="csa-fine">
                {L(
                  'מסיבות אבטחה אנחנו לא מגלים אם המייל קיים במערכת. אם אין חשבון — לא יישלח כלום.',
                  'For security reasons we don’t reveal whether the address exists in our system. If there is no account, nothing is sent.',
                )}
              </p>
            </>
          )}

          {/* מסילת הטאבים קיימת ב-1b בלבד; 1c מגיע מבחירת התפקיד ואין בו טאבים */}
          {!sentScreen && mode === 'signin' && (
            <div className="tabs">
              <button
                type="button"
                className={mode === 'signin' ? 'tab active' : 'tab'}
                onClick={() => goMode('signin')}
              >
                {L('התחברות', 'Log In')}
              </button>
              <button
                type="button"
                className={mode === 'signup' ? 'tab active' : 'tab'}
                onClick={() => (onSignupFlow ? onSignupFlow() : goMode('signup'))}
              >
                {L('הרשמה', 'Sign Up')}
              </button>
            </div>
          )}

          {mode === 'forgot' && !sentScreen && (
            <div className="csa-head">
              <h1>{L('שכחת סיסמה? קורה.', 'Forgot your password? It happens.')}</h1>
              <p>{L('מקלידים את המייל שנרשמת איתו ונשלח קישור ליצירת סיסמה חדשה.', "Enter the email you signed up with and we'll send a link to create a new password.")}</p>
            </div>
          )}

          {mode === 'otp' && (
            <div className="csa-head">
              {otpStep === 'verify' ? (
                /* 1g — הכותרת ושורת «שלחנו שש ספרות ל-» הן בלוק אחד מעל התאים */
                <>
                  <h1>{L('הקוד מהמייל', 'The code from your email')}</h1>
                  <p className="csa-code-hint">
                    {L('שלחנו שש ספרות ל־', 'We sent six digits to ')}
                    <bdi dir="ltr">{sentTo}</bdi>.{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setOtpStep('request')
                        clearCode()
                        clearAlerts()
                      }}
                    >
                      {L('שינוי כתובת', 'Change address')}
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <h1>{L('כניסה עם קוד למייל', 'Sign in with an email code')}</h1>
                  <p>{L('נשלח אליך קוד אימות למייל. מתאים גם להרשמה וגם להתחברות — בלי סיסמה.', "We'll email you a verification code. Works for both signing up and logging in — no password needed.")}</p>
                </>
              )}
            </div>
          )}

          {/* ===== טופס סיסמה / איפוס ===== */}
          {mode !== 'otp' && !sentScreen && (
            <form onSubmit={handleSubmit} className="csa-form">
              {isSignup && nameField}
              {emailField}
              {mode !== 'forgot' && passwordField}
              {isSignup && clubField}

              {mode === 'signin' && (
                <button type="button" className="link-button csa-forgot" onClick={() => goMode('forgot')}>
                  {L('שכחת סיסמה?', 'Forgot password?')}
                </button>
              )}

              {mode === 'forgot' && (
                <div className="csa-note csa-note--brand">
                  <Clock size={18} aria-hidden="true" />
                  <span>{L('הקישור תקף לשעה אחת ולשימוש חד-פעמי. אם הוא פג — פשוט מבקשים חדש.', 'The link is valid for one hour and for a single use. If it expires, just ask for a new one.')}</span>
                </div>
              )}

              {isSignup && consentBox}

              <button
                type="submit"
                className={loading ? 'btn-primary is-busy' : 'btn-primary'}
                disabled={loading || (isSignup && !consent)}
              >
                {busyLabel(
                  mode === 'signup'
                    ? L('יצירת חשבון', 'Create account')
                    : mode === 'forgot'
                      ? L('שליחת קישור איפוס', 'Send reset link')
                      : L('כניסה', 'Log in'),
                )}
              </button>

              {mode === 'forgot' && (
                <div className="csa-swap">
                  {L('נזכרת בסיסמה?', 'Remembered it?')}
                  <button type="button" className="link-button" onClick={() => goMode('signin')}>
                    {L('לכניסה', 'Log in')}
                  </button>
                </div>
              )}

              {alerts}

              {mode === 'signin' && (
                <>
                  <div className="auth-divider"><span>{L('או', 'or')}</span></div>
                  {otpButton}
                </>
              )}

              {isSignup && (
                <div className="csa-swap csa-swap--push">
                  {L('כבר רשום?', 'Already registered?')}
                  <button type="button" className="link-button" onClick={() => goMode('signin')}>
                    {L('לכניסה', 'Log in')}
                  </button>
                </div>
              )}

              {mode === 'signin' && (
                <ul className="auth-trust-inline">
                  <li><Check size={14} aria-hidden="true" /> {L('חינם להתחלה', 'Free to start')}</li>
                  <li><Check size={14} aria-hidden="true" /> {L('קהילת כדורסל', 'Basketball community')}</li>
                  <li><Check size={14} aria-hidden="true" /> {L('מאובטח ופרטי', 'Secure & private')}</li>
                </ul>
              )}

              {mode === 'forgot' && (
                <div className="csa-card csa-card--push">
                  <b>{L('נכנסת פעם עם קוד למייל?', 'Ever signed in with an email code?')}</b>
                  <p>{L('אם לא הגדרת סיסמה בכלל, אין מה לאפס — נכנסים עם קוד חד-פעמי.', "If you never set a password there's nothing to reset — sign in with a one-time code.")}</p>
                  <button type="button" className="link-button" onClick={() => goMode('otp')}>
                    {L('כניסה עם קוד למייל', 'Sign in with an email code')}
                  </button>
                </div>
              )}
            </form>
          )}

          {/* ===== טופס OTP ===== */}
          {mode === 'otp' && (
            <form
              className="csa-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (otpStep === 'request') sendCode()
                else verifyCode()
              }}
            >
              {otpStep === 'request' ? (
                <>
                  {emailField}
                  <button
                    type="submit"
                    className={loading ? 'btn-primary is-busy' : 'btn-primary'}
                    disabled={loading}
                  >
                    {busyLabel(L('שליחת קוד למייל', 'Send code to email'))}
                  </button>
                  {alerts}
                </>
              ) : (
                <>
                  <div
                    className="csa-code"
                    dir="ltr"
                    role="group"
                    aria-label={L('קוד בן שש ספרות', 'Six-digit code')}
                  >
                    {codeCells.map((ch, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          codeRefs.current[i] = el
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={CODE_LEN}
                        value={ch}
                        /* placeholder ריק-לעין — מפעיל את הגבול המקווקו של תא ריק */
                        placeholder=" "
                        aria-label={L(`ספרה ${i + 1}`, `Digit ${i + 1}`)}
                        onChange={(e) => onCodeInput(i, e.target.value)}
                        onKeyDown={(e) => onCodeKey(i, e)}
                        onPaste={(e) => onCodePaste(i, e)}
                        onFocus={(e) => e.target.select()}
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>

                  {error && (
                    <div className="csa-note csa-note--danger" role="alert">
                      <AlertTriangle size={18} aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className={loading ? 'btn-primary is-busy' : 'btn-primary'}
                    disabled={loading || code.length < 4}
                  >
                    {busyLabel(L('אימות וכניסה', 'Verify & log in'))}
                  </button>

                  <div className="csa-row-split">
                    <button
                      type="button"
                      className="link-button"
                      disabled={cooldown > 0 || loading}
                      onClick={sendCode}
                    >
                      {cooldown > 0 ? (
                        <>
                          {L('שליחה מחדש', 'Resend')} <bdi dir="ltr">({cooldown})</bdi>
                        </>
                      ) : (
                        L('שליחת קוד מחדש', 'Resend code')
                      )}
                    </button>
                    <button type="button" className="link-button" onClick={() => goMode('signin')}>
                      {L('כניסה עם סיסמה', 'Sign in with a password')}
                    </button>
                  </div>
                  <div className="csa-card csa-card--push">
                    <b>{L('גם הקישור במייל עובד', 'The link in the email works too')}</b>
                    <p>{L('אם פתחת את המייל בטלפון — לחיצה על «כניסה מהירה» מדלגת על הקלדת הקוד לגמרי.', 'If you opened the email on your phone, tapping “Quick sign-in” skips typing the code entirely.')}</p>
                  </div>
                </>
              )}
            </form>
          )}
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
