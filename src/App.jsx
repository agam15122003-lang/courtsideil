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
import { useLang, L } from './i18n'
// 22.8 — השקת צד המאמן בלבד: בלי בחירת תפקיד, בלי קוד קבוצה, בלי קישורי
// הצטרפות/מגרש. הכול נשאר בקוד ומאחורי המתג הזה.
// 2.9 — צד השחקן חזר לפיילוט; «עולם הכדורסל» (#/court, #/r) מוסתר במתג משלו.
import { PLAYER_SIDE, BASKETBALL_WORLD } from './flags'
import Logo from './Logo'

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
// 2.9 — כש«עולם הכדורסל» מוסתר (BASKETBALL_WORLD=false) הקישור הישן
// מוואטסאפ לא מוביל לשום מקום מיוחד: מנקים את ה-hash ונוחתים בדף הנחיתה
// הרגיל — בלי pending_view, בלי pending_ref ובלי לקפוץ להרשמה כשחקן.
// #/join ממשיך לעבוד כרגיל.
function captureCourtEntry() {
  const h = window.location.hash
  const ref = h.match(/^#\/r\/([A-Za-z0-9_-]{1,40})/)
  const court = /^#\/court\b/.test(h)
  if (!ref && !court) return false
  if (!BASKETBALL_WORLD) { window.location.hash = ''; return false }
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
  if (!PLAYER_SIDE) return 'coach' // צד המאמן בלבד — אין תפקיד אחר להירשם אליו
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
    // ניווט אל אותו מסך אינו "צעד" — דחיפת רשומה כזאת לשביל החזרה גרמה
    // ל«חזרה» לדרוש כמה הקשות עד שמשהו קרה.
    if (next !== authStep) setAuthTrail((trail) => [...trail, authStep])
    setAuthStep(next)
  }
  const backAuth = () => {
    setAuthStep(authTrail.length ? authTrail[authTrail.length - 1] : null)
    setAuthTrail((trail) => trail.slice(0, -1))
  }

  // תאימות לשער התרגיל הציבורי, שנשאר כפי שהיה: "פתיחת הדלת" = מסך בחירת התפקיד
  const setShowAuth = (open) => {
    if (open) goAuth(PLAYER_SIDE ? 'role' : 'auth')
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
    // צד המאמן בלבד: קישור הצטרפות/מגרש ישן (מוואטסאפ) לא מוביל לשום
    // הרשמת שחקן — מנקים את ה-hash ונוחתים בדף הנחיתה הרגיל.
    if (!PLAYER_SIDE) {
      if (/^#\/(join|court|r)\b/.test(window.location.hash)) window.location.hash = ''
      return
    }
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
      // צד המאמן בלבד: קישור הצטרפות/מגרש שהודבק אחרי הטעינה — מנקים גם כאן
      if (!PLAYER_SIDE && /^#\/(join|court|r)\b/.test(window.location.hash)) { window.location.hash = ''; return }
      // «עולם הכדורסל» מוסתר (2.9): קישור מגרש שהודבק אחרי הטעינה — מנקים גם כאן
      if (!BASKETBALL_WORLD && /^#\/(court|r)\b/.test(window.location.hash)) { window.location.hash = ''; return }
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
    // ---------- כניסה בלי רשת (30.8) ----------
    // הטוקן של Supabase פג אחרי שעה. בלי רשת אי אפשר לרענן אותו, ולכן
    // getSession מחזיר null — והמאמן שפתח את האפליקציה באולם בלי קליטה
    // נזרק למסך התחברות שהוא גם לא יכול לעבור. במקום זה: אם אין רשת ויש
    // סשן שמור במכשיר, נכנסים איתו. הטוקן הפג לא מפריע לעבודה בלי רשת —
    // הקריאות מוגשות מהמטמון והכתיבות נכנסות לתור ממילא — וכשהרשת חוזרת
    // supabase מרענן את הטוקן לבד ומחליף את הסשן באמיתי.
    const offlineStoredSession = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine !== false) return null
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (!/^sb-.*-auth-token$/.test(k)) continue
          const raw = JSON.parse(localStorage.getItem(k))
          const s = raw?.user ? raw : raw?.currentSession
          if (s?.user?.id) return s
        }
      } catch { /* אחסון חסום/פגום — נשארים במסך ההתחברות */ }
      return null
    }
    let settled = false
    const finish = (s) => {
      if (settled) return
      settled = true
      setSession(s ?? offlineStoredSession() ?? null)
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
      // בלי רשת, כשל רענון טוקן מדווח session=null — אסור לתת לזה לדרוס
      // את הכניסה-בלי-רשת ולזרוק את המאמן באמצע עבודה. null מתקבל רק
      // בהתנתקות מפורשת או כשיש רשת (ואז הוא באמת אומר «אין סשן»).
      if (session == null && event !== 'SIGNED_OUT' &&
          typeof navigator !== 'undefined' && navigator.onLine === false) return
      setSession(session)
      // יציאה מיד אחרי הרשמה באותו סשן נחתה על טופס «יצירת חשבון» —
      // authMode נשאר 'signup' מההרשמה. התנתקות מחזירה למסך הכניסה.
      if (event === 'SIGNED_OUT') setAuthMode('signin')
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
          <h2>{L('האתר לא זמין כרגע', 'The site is unavailable right now')}</h2>
          <p>
            {L('יש תקלה זמנית בהגדרות השרת. אנחנו כבר על זה — נסו שוב בעוד כמה דקות.',
               'There is a temporary server configuration problem. We are on it — please try again in a few minutes.')}
          </p>
          {/* ⚠ ההוראה למפעיל יורדת לקונסול בלבד: המסך הזה נראה על ידי
              משתמשים, ואין להם מה לעשות עם שמות משתני סביבה.
              לתיקון: Vercel → Project → Settings → Environment Variables →
              VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, ואז Redeploy. */}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="center-screen" role="status" aria-label="טוען / Loading">
        <div className="app-loading">
          <Logo size={40} />
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
          /* צד המאמן בלבד: «הרשמה» מדלגת על בחירת התפקיד ונוחתת ישר בהרשמת מאמן */
          onSignup={() => goAuth(PLAYER_SIDE ? 'role' : 'auth', 'signup')}
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
          /* צד המאמן בלבד: אין מסך בחירת תפקיד, ולכן אין לאן לנווט — בלי
             ה-prop הזה טאב «הרשמה» מחליף מצב בתוך Auth עצמו (goMode) במקום
             לנווט מחדש לאותו מסך ולא לעשות כלום. */
          onSignupFlow={PLAYER_SIDE ? () => goAuth('role', 'signup') : undefined}
        />
      )}

      {/* דיאלוג אישור מעוצב — מרונדר פעם אחת בענף הזה, כמו קודם */}
      <ConfirmHost />
    </div>
  )
}
