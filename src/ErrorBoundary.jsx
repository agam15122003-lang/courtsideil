import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { L } from './i18n'
import { supabase } from './supabaseClient'

// שולח את השגיאה לטבלת client_errors (supabase_privacy4.sql) כדי שקריסה אצל
// מאמן בשדה לא תישאר סוד. נכשל בשקט אם הטבלה עוד לא קיימת.
async function report(error, info, screen) {
  try {
    const { data } = await supabase.auth.getUser()
    // supabase-js לא זורק על דחיית RLS/סשן שפג — בלי בדיקת השגיאה, דווקא
    // הקריסות שהכי חשוב לראות היו נעלמות בשקט.
    const { error: insErr } = await supabase.from('client_errors').insert({
      user_id: data?.user?.id || null,
      message: String(error?.message || error).slice(0, 500),
      stack: String(info?.componentStack || error?.stack || '').slice(0, 4000),
      // שם המסך מגיע כ-prop מהדשבורד. אין router באפליקציה, ולכן
      // location.pathname הוא תמיד "/" — העמודה הייתה חסרת ערך.
      screen: screen || window.location.hash || 'unknown',
      user_agent: navigator.userAgent.slice(0, 300),
    })
    if (insErr) console.warn('[CourtSide] דיווח הקריסה לא נשמר:', insErr.message)
  } catch {
    /* לא קריטי */
  }
}

// גדר בטיחות סביב מסך: שגיאה ברכיב אחד לא מוחקת את כל האפליקציה.
// React מחייב class component לשם כך (אין hook מקביל ל-componentDidCatch).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[CourtSide] שגיאה במסך:', error, info?.componentStack)
    report(error, info, this.props.screen)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="empty-state" role="alert">
        <span className="empty-ic"><AlertTriangle size={26} /></span>
        <div className="empty-title">{L('משהו נתקע במסך הזה', 'Something broke on this screen')}</div>
        <p className="muted small" style={{ maxWidth: 460 }}>
          {L(
            'שאר האפליקציה ממשיכה לעבוד — אפשר לעבור למסך אחר בתפריט, או לנסות לטעון את המסך מחדש.',
            'The rest of the app still works — switch screens from the menu, or try loading this screen again.'
          )}
        </p>
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn-primary" onClick={() => this.setState({ error: null })}>
            <RotateCcw size={16} /> {L('נסה שוב', 'Try again')}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 8, opacity: 0.75 }}>{String(error?.message || error)}</p>
      </div>
    )
  }
}
