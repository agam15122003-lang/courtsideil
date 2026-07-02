import { useState, useEffect } from 'react'
import { supabase, supabaseConfigured } from './supabaseClient'
import Auth from './Auth'
import Dashboard from './Dashboard'
import ResetPassword from './ResetPassword'
import Landing from './Landing'
import { useLang } from './i18n'

// מסך הגדרה למחשב חדש — מוצג במקום מסך לבן כש-.env.local חסר (הקובץ לא עולה לגיט)
function MissingConfig() {
  return (
    <div className="center-screen">
      <div className="welcome-card" style={{ maxWidth: 560 }}>
        <h2>⚙️ חסר קובץ הגדרות</h2>
        <p style={{ marginTop: 8 }}>
          האפליקציה לא מוצאת את פרטי החיבור ל-Supabase. זה קורה במחשב חדש כי הקובץ{' '}
          <code dir="ltr">.env.local</code> לא נשמר בגיט (הוא מכיל מפתחות).
        </p>
        <ol style={{ marginTop: 12, paddingInlineStart: 20, lineHeight: 1.9 }}>
          <li>העתק את <code dir="ltr">.env.local.example</code> לקובץ חדש בשם <code dir="ltr">.env.local</code> בתיקיית הפרויקט.</li>
          <li>מלא בו את שני הערכים — העתק מהמחשב הראשי או מ-Supabase → Settings → API.</li>
          <li>עצור את השרת והרץ שוב <code dir="ltr">npm run dev</code>.</li>
        </ol>
      </div>
    </div>
  )
}

export default function App() {
  useLang() // מנוי לשפה — החלפת שפה מרעננת את כל עץ הרכיבים
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isRecoveryMode, setRecoveryMode] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    // החלת מצב תצוגה שמור (כהה/בהיר) — גם לפני התחברות
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    }

    // בלי חיבור מוגדר אין מה לשאול את Supabase — מסך ההגדרה יוצג
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }

    // בודק אם הגענו מקישור איפוס סיסמה (יש "?reset=true" בכתובת)
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === 'true') {
      setRecoveryMode(true)
    }

    // בודק אם המשתמש כבר מחובר כשהאתר נטען
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

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

    return () => subscription.unsubscribe()
  }, [])

  if (!supabaseConfigured) {
    return <MissingConfig />
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

  if (session) {
    return (
      <div className="app">
        <Dashboard session={session} />
      </div>
    )
  }

  // לא מחובר: דף נחיתה ציבורי → לחיצה על "התחברות" פותחת את מסך ה-Auth
  return (
    <div className="app">
      {showAuth ? (
        <Auth onBack={() => setShowAuth(false)} />
      ) : (
        <Landing onEnter={() => setShowAuth(true)} />
      )}
    </div>
  )
}
