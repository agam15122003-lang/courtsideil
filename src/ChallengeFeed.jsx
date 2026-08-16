import { useCallback, useEffect, useState } from 'react'
import { Play, ChevronDown, ChevronUp, Trash2, Crown, ShieldCheck } from 'lucide-react'
import { L, cnt } from './i18n'
import { toast } from './toast'
import { confirmDialog } from './confirm'
import ReportButton from './ReportButton'
import SignedVideo from './SignedVideo'
import { challengeFeed, deleteMySubmission } from './game'
import { relTime, initials } from './bwUtil'

// ChallengeFeed — הפיד החי של האתגר (כרטיס «הפיד · N הגשות», מתקפל).
//
// הנתונים מגיעים מ-RPC בטוח-עמודות (game_challenge_feed) שכבר ממוין
// ומחזיר שם תצוגה — לא מהטבלה עצמה: מדיניות SELECT רחבה הייתה חושפת
// עמודות מודרציה (age_flagged) והעדפות הורים לכל שחקן סקרן.
// הסרטון נפתח בלחיצה בלבד. **אין תגובות, בכוונה.**
// כשהאתגר הוכרע — שלושת הראשונים הופכים לפודיום.

const MEDALS = ['🥇', '🥈', '🥉']
const AV = ['bw-av--0', 'bw-av--1', 'bw-av--2', 'bw-av--3']

export default function ChallengeFeed({ challenge, myUid, onChanged }) {
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)
  const [openClip, setOpenClip] = useState(null)   // submission id
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(true)

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
  const decided = challenge.status === 'decided'
  const n = rows?.length || 0

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
    <div className="bw-card">
      {/* הכותרת עוטפת את הכפתור (דפוס disclosure) — כפתור בתוך h2 חוקי, h2 בתוך כפתור לא */}
      <h2 className="bw-card-title">
        <button type="button" className="bw-rowbtn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>
            {decided ? L('התוצאות 🏆', 'Results 🏆') : L('הפיד', 'The feed')}
            {rows !== null && <> · {L(cnt(n, 'הגשה אחת', 'הגשות'), n === 1 ? '1 entry' : `${n} entries`)}</>}
          </span>
          <span className="bw-rowbtn-ic" aria-hidden="true">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </button>
      </h2>

      {open && (
        <div className="bw-feed">
          {failed && !rows?.length && (
            <>
              <p className="bw-mut12">{L('הפיד לא נטען — בדוק חיבור.', "Feed didn't load — check your connection.")}</p>
              <button type="button" className="bw-ghost bw-ghost--ch" onClick={load}>{L('נסה שוב', 'Try again')}</button>
            </>
          )}
          {rows === null && !failed && <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />}
          {rows && rows.length === 0 && (
            <p className="bw-mut12">{L('עוד אין הגשות — תהיה הראשון שעולה לפיד 🔥', 'No entries yet — be first on the feed 🔥')}</p>
          )}
          {rows && rows.map((s, i) => {
            const isOpen = openClip === s.id
            return (
              <div key={s.id} className={`bw-feedrow${s.is_mine ? ' is-mine' : ''}${decided && s.place === 1 ? ' is-winner' : ''}`}>
                <div className="bw-feedmain">
                  <span className={`bw-av ${AV[i % AV.length]}`} aria-hidden="true">
                    {decided && s.place <= 3 ? MEDALS[s.place - 1] : initials(s.display_name)}
                  </span>
                  <span className="bw-feedwho">
                    <b className="bw-txt13">
                      {s.display_name || L('שחקן', 'Player')}{s.is_mine ? ` · ${L('אתה', 'you')}` : ''}
                      {decided && s.place === 1 && <span className="bw-champ"><Crown size={12} aria-hidden="true" /> {L('אלוף האתגר', 'Champion')}</span>}
                    </b>
                    <span className="bw-mut11">
                      <bdi dir="ltr">#{s.place}</bdi> · {relTime(s.submitted_at)}
                      {s.verified
                        ? <> · <span className="bw-verified"><ShieldCheck size={11} aria-hidden="true" /> {L('אומת', 'verified')}</span></>
                        : <> · {L('באוויר', 'live')}</>}
                    </span>
                  </span>
                  <b dir="ltr" className="bw-num15">{s.score}</b>
                  {s.media_path && (
                    <button type="button" className="bw-ibtn" aria-label={isOpen ? L('סגור סרטון', 'Close video') : L('צפה בסרטון', 'Watch video')}
                      aria-expanded={isOpen} onClick={() => setOpenClip(isOpen ? null : s.id)}>
                      {isOpen ? <ChevronUp size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="bw-feedclip">
                    <SignedVideo path={s.media_path} />
                    <div className="bw-feedclip-foot">
                      {s.is_mine && !decided && (
                        <button type="button" className="bw-link bw-link--danger" onClick={doDelete} disabled={busy}>
                          <Trash2 size={13} aria-hidden="true" /> {L('מחק את ההגשה שלי', 'Delete my entry')}
                        </button>
                      )}
                      {!s.is_mine && myUid && (
                        <ReportButton targetType="challenge_clip" targetId={s.id}
                          targetLabel={`${s.display_name || ''} · ${challenge.title}`} session={{ user: { id: myUid } }} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
