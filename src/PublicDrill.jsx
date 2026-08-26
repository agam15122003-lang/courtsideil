import { useState, useEffect } from 'react'
import { Dumbbell, RefreshCw, WifiOff } from 'lucide-react'
import { supabase } from './supabaseClient'
import NotebookPage from './NotebookPage'
import TacticsBoard from './TacticsBoard'
import { L } from './i18n'
import Logo from './Logo'
import { ArrowFwd } from './DirIcon'

// 42P01 = relation does not exist · PGRST205 = הטבלה/התצוגה לא ב-schema cache.
// המשמעות: supabase_hardening_medium_3_8.sql עוד לא רץ בפרודקשן — נופלים לישן.
function isMissingRelation(error) {
  if (!error) return false
  if (['42P01', 'PGRST205', 'PGRST106'].includes(error.code)) return true
  return /relation .*does not exist|could not find the table|does not exist in the schema cache/i
    .test(String(error.message || ''))
}

// דף תרגיל ציבורי — נפתח מקישור משותף (וואטסאפ וכו') גם בלי חשבון.
// props: drillId, onJoin() — מעבר להרשמה/כניסה
export default function PublicDrill({ drillId, onJoin }) {
  const [drill, setDrill] = useState(null)
  const [state, setState] = useState('loading') // loading | ok | missing | error
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setState('loading')
      // קוראים מהתצוגה public_drills ולא מהטבלה: המדיניות האנונימית על drills
      // מחזירה גם את created_by, כלומר רשימת ה-UUID של כל המאמנים נחשפת לכל
      // גולש מנותק. התצוגה מחזירה בדיוק את שדות התצוגה, בלי created_by.
      let { data, error } = await supabase
        .from('public_drills')
        .select('*')
        .eq('id', drillId)
        .maybeSingle()
      if (error && isMissingRelation(error)) {
        // נפילה לאחור: מסד שטרם הריץ את המיגרציה
        console.warn('PublicDrill: public_drills לא זמינה — נופלים לטבלת drills')
        ;({ data, error } = await supabase
          .from('drills')
          .select('*')
          .eq('id', drillId)
          .maybeSingle())
      }
      if (!alive) return
      // שגיאת שאילתא אינה "לא נמצא" — מצב שגיאה נפרד עם ניסיון חוזר
      if (error) { console.error('PublicDrill:', error.message || error); setState('error') }
      else if (!data) setState('missing')
      else { setDrill(data); setState('ok') }
    })()
    return () => { alive = false }
  }, [drillId, reload])

  const hasBoard = drill?.board && drill.board.steps && drill.board.steps.length > 0

  return (
    <div className="pd-page" dir="rtl">
      <header className="pd-top">
        <Logo size={18} withWordmark />
        <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={onJoin}>
          {L('הצטרפות חינם', 'Join free')} <ArrowFwd size={16} />
        </button>
      </header>

      <main className="pd-main">
        {state === 'loading' ? (
          <div className="app-loading" style={{ padding: '64px 0' }}><div className="loader" /></div>
        ) : state === 'error' ? (
          <div className="empty-state" style={{ marginTop: 48 }}>
            <span className="empty-ic"><WifiOff size={26} /></span>
            <div className="empty-title">{L('טעינת התרגיל נכשלה', "Couldn't load the drill")}</div>
            <p className="muted small">
              {L('לא הצלחנו להביא את התרגיל כרגע. אפשר לנסות שוב.', 'We could not fetch the drill right now. You can try again.')}
            </p>
            <button type="button" className="btn-primary empty-cta" onClick={() => setReload((n) => n + 1)}>
              <RefreshCw size={16} /> {L('ניסיון חוזר', 'Try again')}
            </button>
          </div>
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
            <h1 className="sr-only">{drill.title}</h1>
            <p className="pd-eyebrow">
              {L('תרגיל מתוך ספריית הקהילה של CourtSide', "A drill from CourtSide's community library")}
            </p>
            <NotebookPage kind="drill" drill={drill} club="CourtSide" />
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
                {L('הצטרפות חינם ל-CourtSide', 'Join CourtSide free')} <ArrowFwd size={17} />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
