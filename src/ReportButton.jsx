import { useState } from 'react'
import { Flag, X, ShieldCheck } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L } from './i18n'

const REASONS = [
  { key: 'impersonation', he: 'התחזות (לא המאמן/מועדון האמיתי)', en: 'Impersonation (not the real coach/club)' },
  { key: 'inappropriate', he: 'תוכן לא הולם', en: 'Inappropriate content' },
  { key: 'spam', he: 'ספאם / פרסום', en: 'Spam / advertising' },
  { key: 'other', he: 'אחר', en: 'Other' },
]

// תג "מאמן מאומת" — אנטי-התחזות
export function VerifiedBadge({ verified }) {
  if (!verified) return null
  return (
    <span className="verified-badge" title={L('מאמן מאומת ע״י המערכת', 'Verified by the system')}>
      <ShieldCheck size={13} /> {L('מאומת', 'Verified')}
    </span>
  )
}

// כפתור דיווח כללי. props: session, targetType, targetId, targetLabel
export default function ReportButton({ session, targetType, targetId, targetLabel, className = 'link-button' }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('impersonation')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const { error } = await supabase.from('reports').insert({
      reporter_id: session.user.id, target_type: targetType, target_id: targetId ? String(targetId) : null,
      target_label: targetLabel || null, reason, details: details.trim() || null,
    })
    setBusy(false)
    if (error) { console.error('report:', error.message); toast.error(L('הדיווח נכשל — נסו שוב בעוד רגע.', 'Report failed — try again in a moment.')); return }
    toast.success(L('הדיווח נשלח לבדיקת המערכת. תודה!', 'Report sent for review. Thanks!'))
    setOpen(false); setDetails('')
  }

  return (
    <>
      <button className={className} onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        <Flag size={13} /> {L('דיווח', 'Report')}
      </button>
      {open && (
        <div className="tm-overlay" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-head">
              <strong>{L('דיווח', 'Report')}{targetLabel ? ` · ${targetLabel}` : ''}</strong>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <label className="pf-label">{L('סיבת הדיווח', 'Reason')}
              <select className="finder-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => <option key={r.key} value={r.key}>{L(r.he, r.en)}</option>)}
              </select>
            </label>
            <label className="pf-label" style={{ marginTop: 8 }}>{L('פירוט (לא חובה)', 'Details (optional)')}
              <textarea className="finder-input" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={L('ספר לנו מה קרה...', 'Tell us what happened...')} />
            </label>
            <div className="tm-modal-actions">
              <button className="btn-primary" onClick={submit} disabled={busy} aria-busy={busy}>{busy && <span className="btn-spinner" aria-hidden="true" />}{busy ? L('שולח...', 'Sending...') : L('שליחת דיווח', 'Send report')}</button>
              <button className="btn-ghost" onClick={() => setOpen(false)}>{L('ביטול', 'Cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
