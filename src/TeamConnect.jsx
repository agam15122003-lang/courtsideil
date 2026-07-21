import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Copy, Check, X, Share2, KeyRound } from 'lucide-react'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { getOrCreateJoinCode, pendingRequests, decideMembership } from './players'
import { waShare } from './share'
import Avatar from './Avatar'

// פאנל "חיבור שחקנים" למאמן — קוד הצטרפות + אישור בקשות ממתינות.
// props: coachId, team, onApproved() — לרענון הסגל אחרי אישור
export default function TeamConnect({ coachId, team, onApproved }) {
  const [code, setCode] = useState(null)
  const [reqs, setReqs] = useState([])
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadReqs = useCallback(async () => {
    setReqs((await pendingRequests(coachId)).filter((r) => r.team === team))
  }, [coachId, team])

  useEffect(() => { loadReqs() }, [loadReqs])
  useEffect(() => {
    let alive = true
    ;(async () => {
      try { const c = await getOrCreateJoinCode(coachId, team); if (alive) setCode(c) }
      catch { /* טבלת הקודים עוד לא קיימת — לא מציגים */ }
    })()
    return () => { alive = false }
  }, [coachId, team])

  const playerName = (p) => p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('שחקן', 'Player') : L('שחקן', 'Player')

  const decide = async (m, approve) => {
    const res = await decideMembership({ ...m }, approve)
    if (!res.ok) { toast.error(L('הפעולה נכשלה: ', 'Action failed: ') + res.reason); return }
    toast.success(approve ? L('השחקן אושר והתווסף לסגל', 'Player approved and added to the roster') : L('הבקשה נדחתה', 'Request declined'))
    loadReqs()
    if (approve) onApproved?.()
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { /* ignore */ }
  }

  const shareText = L(
    `הצטרפו לקבוצה שלנו ב-CourtSide! פותחים את האפליקציה, נרשמים כשחקן ומזינים את הקוד: ${code}\n${window.location.origin}`,
    `Join our team on CourtSide! Open the app, sign up as a player and enter the code: ${code}\n${window.location.origin}`
  )

  if (!code && reqs.length === 0) return null

  return (
    <div className="tc-panel">
      <button className="tc-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="tc-head-l"><UserPlus size={16} /> {L('חיבור שחקנים לקבוצה', 'Connect players')}</span>
        <span className="tc-head-r">
          {reqs.length > 0 && <span className="tc-badge">{reqs.length}</span>}
          <span className="muted small">{open ? L('סגור', 'Hide') : L('הצג', 'Show')}</span>
        </span>
      </button>

      {open && (
        <div className="tc-body">
          {code && (
            <div className="tc-code-block">
              <span className="tc-code-label"><KeyRound size={14} /> {L(`קוד ההצטרפות ל${trTeam(team)}`, `Join code for ${trTeam(team)}`)}</span>
              <div className="tc-code-row">
                <span className="tc-code" dir="ltr">{code}</span>
                <button className="btn-ghost" onClick={copy}>{copied ? <><Check size={15} /> {L('הועתק', 'Copied')}</> : <><Copy size={15} /> {L('העתקה', 'Copy')}</>}</button>
                <button className="btn-soft" style={{ marginTop: 0 }} onClick={() => waShare(shareText)}><Share2 size={15} /> {L('שיתוף', 'Share')}</button>
              </div>
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                {L('שלחו את הקוד לשחקנים. הם נרשמים כשחקן, מזינים אותו — ואתם מאשרים כאן.', 'Send the code to your players. They sign up as a player, enter it — and you approve here.')}
              </p>
            </div>
          )}

          {reqs.length > 0 && (
            <div className="tc-reqs">
              <span className="tc-code-label">{L('בקשות הצטרפות', 'Join requests')}</span>
              {reqs.map((m) => (
                <div key={m.id} className="tc-req">
                  <Avatar name={playerName(m.player)} url={m.player?.avatar_url} size={34} />
                  <span className="tc-req-name">
                    {playerName(m.player)}
                    {m.player?.position ? <span className="muted small"> · {m.player.position}</span> : ''}
                    {m.player?.birth_year ? <span className="muted small"> · {m.player.birth_year}</span> : ''}
                  </span>
                  <button className="tc-approve" onClick={() => decide(m, true)} aria-label={L('אישור', 'Approve')}><Check size={16} /></button>
                  <button className="tc-reject" onClick={() => decide(m, false)} aria-label={L('דחייה', 'Decline')}><X size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
