import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Copy, Check, X, Share2, KeyRound, QrCode } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { getOrCreateJoinCode, pendingRequests, decideMembership } from './players'
import { waShare } from './share'
import Avatar from './Avatar'

// פאנל "חיבור שחקנים" למאמן — לינק/קוד הצטרפות, QR לסריקה בסוף אימון,
// מד "כמה מהסגל כבר מחוברים", ואישור בקשות ממתינות.
// props: coachId, team, onApproved() — לרענון הסגל אחרי אישור
export default function TeamConnect({ coachId, team, onApproved }) {
  const [code, setCode] = useState(null)
  const [reqs, setReqs] = useState([])
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [meter, setMeter] = useState(null) // {connected, total}

  const loadReqs = useCallback(async () => {
    setReqs((await pendingRequests(coachId)).filter((r) => r.team === team))
  }, [coachId, team])

  useEffect(() => { loadReqs() }, [loadReqs])
  useEffect(() => {
    let alive = true
    ;(async () => {
      try { const c = await getOrCreateJoinCode(coachId, team); if (alive) setCode(c) }
      catch { /* טבלת הקודים עוד לא קיימת — לא מציגים */ }
      // מד מחוברים: כמה משורות הסגל כבר מקושרות לחשבון שחקן
      const { data } = await supabase.from('team_players')
        .select('id, player_id').eq('coach_id', coachId).eq('team', team)
      if (alive && data) setMeter({ connected: data.filter((p) => p.player_id).length, total: data.length })
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

  // לינק הצטרפות: פותח את האפליקציה עם הקוד כבר בפנים — צעד אחד במקום חמישה
  const joinUrl = code ? `${window.location.origin}/#/join/${code}` : ''
  // QR דרך שירות תמונות ציבורי (ה-CSP מתיר img-src https:) — בלי ספרייה חדשה
  const qrUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(joinUrl)}`
    : ''

  const copy = async () => {
    try { await navigator.clipboard.writeText(joinUrl || code); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { /* ignore */ }
  }

  const shareText = L(
    `הצטרפו לקבוצה שלנו ב-CourtSide! לוחצים על הלינק ונרשמים כשחקן — הקוד כבר בפנים:\n${joinUrl}`,
    `Join our team on CourtSide! Tap the link and sign up as a player — the code is already in:\n${joinUrl}`
  )

  if (!code && reqs.length === 0) return null

  return (
    <div className="tc-panel tc-open">
      <div className="tc-head tc-head-static">
        <span className="tc-head-l"><UserPlus size={16} /> {L('חיבור שחקנים לקבוצה', 'Connect players')}</span>
        <span className="tc-head-r">
          {meter && meter.total > 0 && (
            <span className={meter.connected === meter.total ? 'tc-meter full' : 'tc-meter'}>
              {L(`${meter.connected} מתוך ${meter.total} מחוברים`, `${meter.connected} of ${meter.total} connected`)}
            </span>
          )}
          {reqs.length > 0 && <span className="tc-badge">{reqs.length}</span>}
        </span>
      </div>

      <div className="tc-body">
          {code && (
            <div className="tc-code-block">
              <span className="tc-code-label"><KeyRound size={14} /> {L(`קוד ההצטרפות ל${trTeam(team)}`, `Join code for ${trTeam(team)}`)}</span>
              <div className="tc-code-row">
                <span className="tc-code" dir="ltr">{code}</span>
                <button className="btn-ghost" onClick={copy}>{copied ? <><Check size={15} /> {L('הועתק', 'Copied')}</> : <><Copy size={15} /> {L('העתקת לינק', 'Copy link')}</>}</button>
                <button className="btn-soft" style={{ marginTop: 0 }} onClick={() => waShare(shareText)}><Share2 size={15} /> {L('שיתוף', 'Share')}</button>
                <button className="btn-ghost" onClick={() => setQrOpen((v) => !v)} aria-expanded={qrOpen}>
                  <QrCode size={15} /> {L('QR', 'QR')}
                </button>
              </div>
              {qrOpen && (
                <div className="tc-qr">
                  <img src={qrUrl} width="220" height="220" alt={L('קוד QR להצטרפות לקבוצה', 'Team join QR code')} loading="lazy" />
                  <p className="muted small">{L('מציגים את המסך בסוף האימון — השחקנים סורקים ונרשמים במקום.', 'Show this at the end of practice — players scan and sign up on the spot.')}</p>
                </div>
              )}
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                {L('שולחים את הלינק (או סורקים את ה-QR) — השחקן נרשם, הקוד כבר בפנים, ואתם מאשרים כאן.', 'Send the link (or scan the QR) — the player signs up with the code pre-filled, and you approve here.')}
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
    </div>
  )
}
