import { useState, useEffect } from 'react'
import { Dumbbell, ArrowLeft } from 'lucide-react'
import { supabase } from './supabaseClient'
import NotebookPage from './NotebookPage'
import TacticsBoard from './TacticsBoard'
import { L } from './i18n'

// דף תרגיל ציבורי — נפתח מקישור משותף (וואטסאפ וכו') גם בלי חשבון.
// props: drillId, onJoin() — מעבר להרשמה/כניסה
export default function PublicDrill({ drillId, onJoin }) {
  const [drill, setDrill] = useState(null)
  const [state, setState] = useState('loading') // loading | ok | missing

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('drills')
        .select('*')
        .eq('id', drillId)
        .maybeSingle()
      if (!alive) return
      if (error || !data) setState('missing')
      else { setDrill(data); setState('ok') }
    })()
    return () => { alive = false }
  }, [drillId])

  const hasBoard = drill?.board && drill.board.steps && drill.board.steps.length > 0

  return (
    <div className="pd-page" dir="rtl">
      <header className="pd-top">
        <div className="land-brand">
          <svg viewBox="0 0 100 100" width="28" height="28" aria-hidden="true">
            <circle cx="42" cy="55" r="22" fill="#E8763A" />
            <circle cx="42" cy="55" r="9" fill="#fff" />
            <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="#E8763A" />
            <circle cx="78" cy="30" r="6" fill="#E8763A" />
          </svg>
          <span>CourtSide</span>
        </div>
        <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={onJoin}>
          {L('הצטרפות חינם', 'Join free')} <ArrowLeft size={16} />
        </button>
      </header>

      <main className="pd-main">
        {state === 'loading' ? (
          <div className="app-loading" style={{ padding: '64px 0' }}><div className="loader" /></div>
        ) : state === 'missing' ? (
          <div className="empty-state" style={{ marginTop: 48 }}>
            <span className="empty-ic"><Dumbbell size={26} /></span>
            <div className="empty-title">{L('התרגיל לא נמצא', 'Drill not found')}</div>
            <p className="muted small">
              {L('ייתכן שהתרגיל הוסר או שהוא פרטי. בתוך CourtSide מחכים מאות תרגילים נוספים.', 'It may have been removed or set to private. Hundreds more drills are waiting inside CourtSide.')}
            </p>
            <button type="button" className="btn-primary empty-cta" onClick={onJoin}>
              {L('לספריית התרגילים המלאה', 'Open the full drill library')}
            </button>
          </div>
        ) : (
          <>
            <p className="pd-eyebrow">
              {L('תרגיל מתוך ספריית הקהילה של CourtSide', "A drill from CourtSide's community library")}
            </p>
            <NotebookPage kind="drill" drill={drill} club="CourtSide" noCourt />
            {hasBoard && (
              <div className="pd-court">
                <span className="detail-label">{L('על המגרש (נגן אנימציה)', 'On court (play animation)')}</span>
                <TacticsBoard value={drill.board} readOnly />
              </div>
            )}
            <div className="pd-cta">
              <h3>{L('רוצים עוד כאלה?', 'Want more like this?')}</h3>
              <p className="muted">
                {L('מאות תרגילים, בונה תוכניות אימון, לוח טקטיקה וקהילת מאמנים — חינם.', 'Hundreds of drills, a practice-plan builder, a tactics board and a coaching community — free.')}
              </p>
              <button type="button" className="btn-primary btn-lg" onClick={onJoin}>
                {L('הצטרפות חינם ל-CourtSide', 'Join CourtSide free')} <ArrowLeft size={17} />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
