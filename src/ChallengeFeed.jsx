import { useCallback, useEffect, useState } from 'react'
import { Play, ChevronUp, Trash2, Crown, ShieldCheck } from 'lucide-react'
import { L } from './i18n'
import { toast } from './toast'
import { confirmDialog } from './confirm'
import ReportButton from './ReportButton'
import SignedVideo from './SignedVideo'
import { challengeFeed, deleteMySubmission } from './game'

// ChallengeFeed — הפיד החי של האתגר.
//
// הנתונים מגיעים מ-RPC בטוח-עמודות (game_challenge_feed) שכבר ממוין
// ומחזיר שם תצוגה — לא מהטבלה עצמה: מדיניות SELECT רחבה הייתה חושפת
// עמודות מודרציה (age_flagged) והעדפות הורים לכל שחקן סקרן.
// הסרטון נפתח בלחיצה בלבד. **אין תגובות, בכוונה.**
// כשהאתגר הוכרע — שלושת הראשונים הופכים לפודיום.

const MEDALS = ['🥇', '🥈', '🥉']

export default function ChallengeFeed({ challenge, myUid, onChanged }) {
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)
  const [openClip, setOpenClip] = useState(null)   // submission id
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!challenge?.id) return
    const r = await challengeFeed(challenge.id)
    if (r.notDeployed) { setRows([]); setFailed(false); return }
    if (!r.ok) { setFailed(true); return }   // שגיאה ≠ פיד ריק — לא דורסים מה שכבר מוצג
    setFailed(false)
    setRows(r.rows || [])
  }, [challenge?.id])

  useEffect(() => { load() }, [load])

  if (!challenge) return null

  if (failed && !rows?.length) {
    return (
      <div className="gm-feed">
        <p className="muted small">{L('הפיד לא נטען — בדוק חיבור.', "Feed didn't load — check your connection.")}</p>
        <button type="button" className="btn-secondary" onClick={load}>{L('נסה שוב', 'Try again')}</button>
      </div>
    )
  }
  if (rows === null) return null
  if (!rows.length) {
    return (
      <p className="muted small gm-feed-empty">
        {L('עוד אין הגשות — תהיה הראשון שעולה לפיד 🔥', 'No entries yet — be first on the feed 🔥')}
      </p>
    )
  }

  const decided = challenge.status === 'decided'

  const doDelete = async () => {
    const ok = await confirmDialog({
      title: L('למחוק את ההגשה שלך?', 'Delete your entry?'),
      message: L('הקליפ, התוצאה והנקודות של האתגר הזה יימחקו. אי אפשר לבטל.',
        'Your clip, score and points for this challenge will be removed. This cannot be undone.'),
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    const r = await deleteMySubmission(challenge.id)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(d.message || L('המחיקה נכשלה', 'Delete failed')); return }
    toast.success(L('ההגשה נמחקה', 'Entry deleted'))
    load()
    onChanged?.()
  }

  return (
    <div className="gm-feed">
      <h3 className="gm-feed-title">
        {decided ? L('התוצאות 🏆', 'Results 🏆') : L('הפיד — דירוג חי', 'Live feed')}
      </h3>

      <ul className="gm-feed-list">
        {rows.map((s) => {
          const isOpen = openClip === s.id
          return (
            <li key={s.id} className={`gm-feed-row${s.is_mine ? ' is-mine' : ''}${decided && s.place === 1 ? ' is-winner' : ''}`}>
              <div className="gm-feed-main">
                <span className="gm-feed-rank" dir="ltr">
                  {decided && s.place <= 3 ? MEDALS[s.place - 1] : s.place}
                </span>
                <span className="gm-feed-who">
                  <b>{s.display_name || 'שחקן'}</b>
                  {decided && s.place === 1 && <span className="gm-feed-champ"><Crown size={13} /> {L('אלוף האתגר', 'Champion')}</span>}
                  {s.verified && (
                    <span className="gm-feed-verified" title={L('התוצאה אומתה על ידי המאמן', 'Score verified by the coach')}>
                      <ShieldCheck size={13} />
                    </span>
                  )}
                </span>
                <span className="gm-feed-score" dir="ltr">{s.score}</span>
                {s.media_path && (
                  <button
                    type="button" className="icon-btn"
                    aria-label={isOpen ? L('סגור סרטון', 'Close video') : L('צפה בסרטון', 'Watch video')}
                    aria-expanded={isOpen}
                    onClick={() => setOpenClip(isOpen ? null : s.id)}
                  >
                    {isOpen ? <ChevronUp size={16} /> : <Play size={16} />}
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="gm-feed-clip">
                  <SignedVideo path={s.media_path} />
                  <div className="gm-feed-clip-foot">
                    {s.is_mine && !decided && (
                      <button type="button" className="btn-ghost gm-danger" onClick={doDelete} disabled={busy}>
                        <Trash2 size={14} /> {L('מחק את ההגשה שלי', 'Delete my entry')}
                      </button>
                    )}
                    {!s.is_mine && myUid && (
                      <ReportButton
                        targetType="challenge_clip"
                        targetId={s.id}
                        targetLabel={`${s.display_name || ''} · ${challenge.title}`}
                        session={{ user: { id: myUid } }}
                      />
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
