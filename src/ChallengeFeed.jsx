import { useCallback, useEffect, useState } from 'react'
import { Play, ChevronUp, Trash2, Crown, Medal, ShieldCheck } from 'lucide-react'
import { L } from './i18n'
import { toast } from './toast'
import { confirmDialog } from './confirm'
import ReportButton from './ReportButton'
import SignedVideo from './SignedVideo'
import { challengeFeed, displayNames, deleteMySubmission } from './game'

// ChallengeFeed — הפיד החי של האתגר.
//
// כל הגשה מופיעה מיד, ממוינת כדירוג חי לפי התוצאה המדווחת. הסרטון נפתח
// בלחיצה (לא נטען אוטומטית — 20 קליפים בפיד = 20 קישורים חתומים בחינם).
// אם מדיניות המחסן לא מרשה לצפות (קטין בלי הסכמת מדיה) — הנגן פשוט
// מציג «לא זמין», והשם והתוצאה נשארים. **אין תגובות, בכוונה.**
//
// כשהאתגר הוכרע — שלושת הראשונים הופכים לפודיום.

const MEDALS = ['🥇', '🥈', '🥉']

export default function ChallengeFeed({ challenge, myUid, metricDir = 'desc', onChanged }) {
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState({})
  const [openClip, setOpenClip] = useState(null)   // submission id
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!challenge?.id) return
    const r = await challengeFeed(challenge.id)
    if (!r.ok) { setRows([]); return }
    // דירוג חי: התוצאה הטובה קודם; שוויון — מי שהגיש קודם
    const sorted = [...(r.rows || [])].sort((a, b) => {
      const sa = Number(a.approved_score ?? a.reported_score)
      const sb = Number(b.approved_score ?? b.reported_score)
      if (sa !== sb) return metricDir === 'asc' ? sa - sb : sb - sa
      return new Date(a.submitted_at) - new Date(b.submitted_at)
    })
    setRows(sorted)
    setNames(await displayNames(sorted.map((x) => x.user_id)))
  }, [challenge?.id, metricDir])

  useEffect(() => { load() }, [load])

  if (!challenge || rows === null) return null
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
      confirmLabel: L('מחק', 'Delete'),
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    const r = await deleteMySubmission(challenge.id)
    setBusy(false)
    const d = r.data || r
    if (d.ok === false) { toast.error(d.message || L('המחיקה נכשלה', 'Delete failed')); return }
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
        {rows.map((s, i) => {
          const mine = s.user_id === myUid
          const score = s.approved_score ?? s.reported_score
          const isOpen = openClip === s.id
          return (
            <li key={s.id} className={`gm-feed-row${mine ? ' is-mine' : ''}${decided && i === 0 ? ' is-winner' : ''}`}>
              <div className="gm-feed-main">
                <span className="gm-feed-rank" dir="ltr">
                  {decided && i < 3 ? MEDALS[i] : i + 1}
                </span>
                <span className="gm-feed-who">
                  <b>{names[s.user_id] || 'שחקן'}</b>
                  {decided && i === 0 && <span className="gm-feed-champ"><Crown size={13} /> {L('אלוף האתגר', 'Champion')}</span>}
                  {s.status === 'approved' && (
                    <span className="gm-feed-verified" title={L('התוצאה אומתה על ידי המאמן', 'Score verified by the coach')}>
                      <ShieldCheck size={13} />
                    </span>
                  )}
                </span>
                <span className="gm-feed-score" dir="ltr">{score}</span>
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
                    {mine && !decided && (
                      <button type="button" className="btn-ghost gm-danger" onClick={doDelete} disabled={busy}>
                        <Trash2 size={14} /> {L('מחק את ההגשה שלי', 'Delete my entry')}
                      </button>
                    )}
                    {!mine && (
                      <ReportButton
                        targetType="challenge_clip"
                        targetId={s.id}
                        targetLabel={`${names[s.user_id] || ''} · ${challenge.title}`}
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
