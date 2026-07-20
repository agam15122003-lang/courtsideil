import { useState, useEffect } from 'react'
import { supabase, supabaseConfigured } from './supabaseClient'
import Auth from './Auth'
import Dashboard from './Dashboard'
import ResetPassword from './ResetPassword'
import Landing from './Landing'
import PublicDrill from './PublicDrill'
import { useLang } from './i18n'

// קישור ציבורי לתרגיל: #/drill/<id> — נפתח גם בלי חשבון
function publicDrillId() {
  const m = window.location.hash.match(/^#\/drill\/([0-9a-f-]{10,})/i)
  return m ? m[1] : null
}

export default function App() {
  useLang() // מנוי לשפה — החלפת שפה מרעננת את כל עץ הרכיבים
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isRecoveryMode, setRecoveryMode] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [sharedDrill, setSharedDrill] = useState(publicDrillId)

  // מעקב אחרי שינויי hash (ניווט קדימה/אחורה)
  useEffect(() => {
    const onHash = () => setSharedDrill(publicDrillId())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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
