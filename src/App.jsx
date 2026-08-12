import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase, supabaseConfigured } from './supabaseClient'
import Auth from './Auth'
import RolePicker from './RolePicker'
import JoinWithCode from './JoinWithCode'
import Dashboard from './Dashboard'
import ResetPassword from './ResetPassword'
import Landing from './Landing'
import PublicDrill from './PublicDrill'
import { ConfirmHost } from './confirm'
import { useLang } from './i18n'

// מסך ההורה נטען רק כשמגיעים אליו — הוא לא חלק מהאפליקציה של המשתמשים
const ParentConsent = lazy(() => import('./ParentConsent'))

// קישור ציבורי לתרגיל: #/drill/<id> — נפתח גם בלי חשבון
function publicDrillId() {
  const m = window.location.hash.match(/^#\/drill\/([0-9a-f-]{10,})/i)
  return m ? m[1] : null
}

// קישור אישור הורה: #/consent/<TOKEN> — ההורה מגיע מוואטסאפ, בלי חשבון
// ובלי התחברות, ולכן המסך הזה מרונדר לפני כל בדיקת session.
function consentTokenFromHash() {
  const m = window.location.hash.match(/^#\/consent\/([A-Za-z0-9_.-]{8,})/)
  return m ? m[1] : null
}

// לינק הצטרפות לקבוצה: #/join/<code> — שומר את הקוד, והשחקן שנרשם מגיע
// עם הקוד כבר בפנים (JoinTeam קורא אותו). צעד אחד במקום חמישה.
function captureJoinCode() {
  const m = window.location.hash.match(/^#\/join\/([A-Z0-9]{4,10})/i)
  if (!m) return false
  try { localStorage.setItem('pending_join_code', m[1].toUpperCase()) } catch { /* ignore */ }
  window.location.hash = ''
  return true
}

// לינק המגרש: #/court (ו-#/r/<קוד> עם ייחוס) — זה הקישור שנשלח בקבוצת
// הוואטסאפ ובאינסטגרם. מי שמגיע ממנו כבר הצהיר לאיזה עולם הוא שייך, ולכן
// מדלגים על בחירת התפקיד **וגם** על מסך קוד-הקבוצה: שחקן שמגיע לאתגר לא
// בהכרח שייך לאיזו קבוצה, ומסך קוד באמצע הוא בדיוק המקום שבו ילד נושר.
// pending_view גורם ל-PlayerDashboard לפתוח את המגרש ולא את הבית הכללי.
function captureCourtEntry() {
  const h = window.location.hash
  const ref = h.match(/^#\/r\/([A-Za-z0-9_-]{1,40})/)
  const court = /^#\/court\b/.test(h)
  if (!ref && !court) return false
  try {
    localStorage.setItem('pending_view', 'boards')
    if (ref) localStorage.setItem('pending_ref', ref[1])
  } catch { /* ignore */ }
  window.location.hash = ''
  return true
}

// תפקיד ההרשמה (מסך בחירת התפקיד) — שני תפקידים בלבד, "הורה" הוסר מהמסך.
// נשמר ב-localStorage כדי שרענון באמצע ההרשמה לא יאבד את הבחירה.
const ROLES = ['coach', 'player']
function readRole() {
  try {
    const saved = localStorage.getItem('signup_role')
    return ROLES.includes(saved) ? saved : 'coach'
  } catch {
    return 'coach'
  }
}
function saveRole(id) {
  try { localStorage.setItem('signup_role', id) } catch { /* ignore */ }
}

export default function App() {
  useLang() // מנוי לשפה — החלפת שפה מרעננת את כל עץ הרכיבים
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isRecoveryMode, setRecoveryMode] = useState(false)
  const [sharedDrill, setSharedDrill] = useState(publicDrillId)
  const [consentToken, setConsentToken] = useState(consentTokenFromHash)

  // מסכי הדלת (לפני session): null = דף נחיתה · 'role' = בחירת תפקיד ·
  // 'join' = קוד קבוצה לשחקן · 'auth' = הרשמה/כניסה
  const [authStep, setAuthStep] = useState(null)
  // המסכים שעברנו בדרך — כך "חזרה" עובדת מכל שלב ובסוף תמיד נוחתים בדף הנחיתה
  const [authTrail, setAuthTrail] = useState([])
  const [role, setRole] = useState(readRole)
  // באיזה מצב ייפתח Auth: מי שבחר תפקיד או הזין קוד קבוצה מצהיר שהוא נרשם,
  // ולכן נוחת על ההרשמה. רק "כבר יש לך חשבון?" מוביל ל-signin.
  const [authMode, setAuthMode] = useState('signin')

  const goAuth = (next, mode) => {
    if (mode) setAuthMode(mode)
    setAuthTrail((trail) => [...trail, authStep])
    setAuthStep(next)
  }
  const backAuth = () => {
    setAuthStep(authTrail.length ? authTrail[authTrail.length - 1] : null)
    setAuthTrail((trail) => trail.slice(0, -1))
  }

  // תאימות לשער התרגיל הציבורי, שנשאר כפי שהיה: "פתיחת הדלת" = מסך בחירת התפקיד
  const setShowAuth = (open) => {
    if (open) goAuth('role')
    else {
      setAuthStep(null)
      setAuthTrail([])
    }
  }

  // בחירת תפקיד שייכת למסלול ההרשמה בלבד (מי שמתחבר לא צריך לבחור תפקיד —
  // הוא כבר קיים במסד). המצב נקבע בכניסה למסלול ולכן לא נדרס כאן.
  const pickRole = (id) => {
    setRole(id)
    goAuth(id === 'player' ? 'join' : 'auth')
  }

  // הגעה מלינק הצטרפות: הקוד כבר נשמר, והמשתמש כבר הוכיח לאיזה צינור הוא שייך —
  // מדלגים על בחירת התפקיד ועל מסך הקוד ונכנסים ישר להרשמה כשחקן
  useEffect(() => {
    // שני הקישורים נבדקים בנפרד — #/join מצרף לקבוצה, #/court רק למגרש —
    // אבל שניהם מובילים לאותה נחיתה: הרשמה כשחקן, בלי מסכי ביניים.
    const fromJoin  = captureJoinCode()
    const fromCourt = captureCourtEntry()
    if ((fromJoin || fromCourt) && !session) {
      saveRole('player')
      setRole('player')
      setAuthMode('signup')
      setAuthStep('auth')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // מעקב אחרי שינויי hash (ניווט קדימה/אחורה)
  useEffect(() => {
    const onHash = () => {
      setSharedDrill(publicDrillId())
      setConsentToken(consentTokenFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // ===== שומר ה-Back של אנדרואיד =====
  // הניווט לפני ההתחברות מבוסס state בלבד, ולכן כפתור ה-Back החומרתי סגר את
  // האפליקציה מכל מסך פנימי. הפתרון: כשנפתח מסך פנימי דוחפים רשומת היסטוריה
  // אחת, ו-popstate סוגר את המסך במקום לצאת. הרשומה נצרכת בחזרה למסך הבית,
  // כך שההיסטוריה לא מתנפחת. אין כאן שום נגיעה ב-hash — #/join ו-#/drill
  // ממשיכים לעבוד בדיוק כמו קודם.
  const backGuardRef = useRef(0)
  useEffect(() => {
    if (authStep !== null && backGuardRef.current === 0) {
      try { window.history.pushState({ csGuard: 'auth' }, '') } catch { /* ignore */ }
      backGuardRef.current = 1
    } else if (authStep === null && backGuardRef.current === 1) {
      backGuardRef.current = 0
      try { window.history.back() } catch { /* ignore */ }
    }
  }, [authStep])

  useEffect(() => {
    const onPop = () => {
      // אין לנו רשומה פתוחה — לא מתערבים בניווט של הדפדפן
      if (backGuardRef.current === 0) return
      backGuardRef.current = 0
      setAuthStep(authTrail.length ? authTrail[authTrail.length - 1] : null)
      setAuthTrail((trail) => trail.slice(0, -1))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [authTrail])

  useEffect(() => {
    // החלת מצב תצוגה שמור (כהה/בהיר) — גם לפני התחברות
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    }

    // ללא הגדרות Supabase אין טעם לנסות להתחבר — מפסיקים את הטעינה ומציגים הודעה
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }

    // בודק אם הגענו מקישור איפוס סיסמה (יש "?reset=true" בכתובת)
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === 'true') {
      setRecoveryMode(true)
    }

    // בודק אם המשתמש כבר מחובר כשהאתר נטען.
    //
    // ⚠ אין להחזיר את זה ל-.then() חשוף. setLoading(false) קיים רק כאן
    // ובשורה 157, ולכן כל מסך האפליקציה תלוי בכך שההבטחה הזו תיפתר.
    // בדפדפן היא תמיד נפתרת; באפליקציה הנייטיבית היא נתקעה על קריאה
    // לאחסון של המערכת — שלא נכשלה, פשוט לא ענתה — והאפליקציה נתקעה על
    // ספינר לנצח בלי שום דרך להתאושש (4.8.2026).
    //
    // settle-once: הראשון שמגיע קובע. הגרוע ביותר הוא מסך התחברות,
    // ו-onAuthStateChange שלמטה מתקן את הסשן אם התשובה מגיעה באיחור.
    let settled = false
    const finish = (s) => {
      if (settled) return
      settled = true
      setSession(s ?? null)
      setLoading(false)
    }
    const bail = setTimeout(() => finish(null), 8000)
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => finish(session))
      .catch(() => finish(null))
      .finally(() => clearTimeout(bail))

    // מאזין לשינויים בהתחברות/התנתקות
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      // אם Supabase מזהה אירוע של שחזור סיסמה — מציג את מסך הסיסמה החדשה
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
      }
    })

    return () => {
      clearTimeout(bail)
      subscription.unsubscribe()
    }
  }, [])

  // חסרים פרטי חיבור ל-Supabase — מסך הסבר במקום מסך ריק
  if (!supabaseConfigured) {
    return (
      <div className="center-screen">
        <div className="config-error" role="alert">
          <h1>CourtSide</h1>
          <h2>האתר כמעט מוכן — חסרה הגדרה אחת</h2>
          <p>
            לא הוגדר מפתח החיבור לבסיס הנתונים (<code>VITE_SUPABASE_ANON_KEY</code>).
            בלעדיו האתר לא יכול להתחבר לנתונים.
          </p>
          <p className="config-error-fix">
            <strong>לתיקון:</strong> Netlify → Site settings → Environment variables →
            הוסף את <code>VITE_SUPABASE_ANON_KEY</code> (המפתח <em>anon public</em> מ-Supabase),
            ואז Deploys → Trigger deploy → <em>Clear cache and deploy site</em>.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="center-screen" role="status" aria-label="טוען / Loading">
        <div className="app-loading">
          <svg viewBox="0 0 100 100" width="40" height="40" aria-hidden="true">
            <circle cx="42" cy="55" r="22" fill="var(--accent)" />
            <circle cx="42" cy="55" r="9" fill="#fff" />
            <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="var(--accent)" />
            <circle cx="78" cy="30" r="6" fill="var(--accent)" />
          </svg>
          <span className="app-loading-name">CourtSide</span>
          <div className="loader" />
        </div>
      </div>
    )
  }

  // אם הגענו מקישור איפוס סיסמה — מציג את מסך בחירת הסיסמה החדשה
  if (isRecoveryMode) {
    return (
      <div className="app">
        <ResetPassword />
      </div>
    )
  }

  // קישור אישור ההורה — לפני בדיקת ה-session: להורה אין חשבון, ומי שכן
  // מחובר (למשל הקטין עצמו במכשיר) עדיין צריך לראות את מסך ההורה ולא את שלו.
  if (consentToken) {
    return (
      <div className="app">
        <Suspense
          fallback={
            <div className="center-screen" role="status" aria-label="טוען / Loading">
              <div className="app-loading"><div className="loader" /></div>
            </div>
          }
        >
          <ParentConsent token={consentToken} />
        </Suspense>
        {/* דיאלוג האישור נדרש כאן: ביטול הסכמה במצב פיקוח עובר דרכו */}
        <ConfirmHost />
      </div>
    )
  }

  // קישור ציבורי לתרגיל — נפתח יפה גם למי שאין לו חשבון (ולמחוברים)
  if (sharedDrill) {
    return (
      <div className="app">
        <PublicDrill
          drillId={sharedDrill}
          onJoin={() => {
            window.location.hash = ''
            setSharedDrill(null)
            if (!session) setShowAuth(true)
          }}
        />
      </div>
    )
  }

  if (session) {
    return (
      <div className="app">
        <Dashboard session={session} />
        {/* דיאלוג אישור מעוצב — חייב להיות מרונדר פעם אחת בשורש */}
        <ConfirmHost />
      </div>
    )
  }

  // לא מחובר: דף נחיתה ציבורי → בחירת תפקיד → (שחקן) קוד קבוצה → הרשמה/כניסה.
  // כל מסך מקבל "חזרה" משלו, והשרשרת נגמרת תמיד בדף הנחיתה.
  return (
    <div className="app">
      {/* שני מסלולים נפרדים מדף הנחיתה (בקשת הבעלים):
          «התחברות» → ישר למסך הכניסה · «הרשמה» → בחירת תפקיד ← הרשמה */}
      {authStep === null && (
        <Landing
          onLogin={() => goAuth('auth', 'signin')}
          onSignup={() => goAuth('role', 'signup')}
        />
      )}

      {authStep === 'role' && (
        <RolePicker onPick={pickRole} onBack={backAuth} onSignIn={() => goAuth('auth', 'signin')} />
      )}

      {authStep === 'join' && (
        <JoinWithCode
          onJoin={() => goAuth('auth', 'signup')}
          onBack={backAuth}
          onSkip={() => {
            // "אין לי קוד" — נרשם כמשתמש מלא בלי קבוצה. מנקים קוד ישן שנשאר
            // מסשן קודם, כדי שלא יצרף אותו לקבוצה שלא ביקש.
            try { localStorage.removeItem('pending_join_code') } catch { /* ignore */ }
            goAuth('auth', 'signup')
          }}
        />
      )}

      {authStep === 'auth' && (
        <Auth
          role={role}
          initialMode={authMode}
          onBack={backAuth}
          onSignupFlow={() => goAuth('role', 'signup')}
        />
      )}

      {/* דיאלוג אישור מעוצב — מרונדר פעם אחת בענף הזה, כמו קודם */}
      <ConfirmHost />
    </div>
  )
}
