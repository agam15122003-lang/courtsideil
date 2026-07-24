import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { L } from './i18n'

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
    // נשמר לקונסולה בלבד — כדי שאפשר יהיה לאבחן בלי לחשוף למשתמש
    console.error('[CourtSide] שגיאה במסך:', error, info?.componentStack)
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
