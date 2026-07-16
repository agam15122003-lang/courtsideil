import { useState, useEffect } from 'react'
import {
  ShieldCheck, Flag, Users, BarChart3, Search, Check, Ban,
  AlertTriangle, X, RefreshCw,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import Avatar from './Avatar'
import { L, trTeam } from './i18n'

const REASON_HE = {
  impersonation: 'התחזות', inappropriate: 'תוכן לא הולם', spam: 'ספאם', other: 'אחר',
}

// לוח ניהול — סקירה, מאמנים (אימות/חסימה + זיהוי התחזות), דיווחים.
export default function Admin({ session, profile }) {
  const [tab, setTab] = useState('overview')
  const [coaches, setCoaches] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    const [pf, rp] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
    ])
    setCoaches(pf.error ? [] : pf.data || [])
    setReports(rp.error ? [] : rp.data || [])
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  const setFlag = async (id, patch) => {
    const extra = patch.verified !== undefined && patch.verified
      ? { verified_at: new Date().toISOString(), verified_by: session.user.id } : {}
    const { error } = await supabase.from('profiles').update({ ...patch, ...extra }).eq('id', id)
    if (error) { toast.error(L('עדכון נכשל: ', 'Update failed: ') + error.message); return }
    setCoaches((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch, ...extra } : c)))
    toast.success(L('עודכן', 'Updated'))
  }
  const resolveReport = async (id, status) => {
    const { error } = await supabase.from('reports').update({
      status, resolved_by: session.user.id, resolved_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) { toast.error(L('עדכון נכשל: ', 'Update failed: ') + error.message); return }
    setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)))
  }

  // אנטי-התחזות: זיהוי כמה מאמנים שטוענים לאותו מועדון+שכבה
  const dupKeys = {}
  coaches.forEach((c) => {
    ;(c.age_groups || []).forEach((g) => {
      const k = `${(c.club || '').trim()}|${g}`
      ;(dupKeys[k] = dupKeys[k] || []).push(c)
    })
  })
  const duplicates = Object.entries(dupKeys).filter(([, arr]) => arr.length > 1)

  const complete = coaches.filter((c) => c.first_name && c.club)
  const stats = {
    total: complete.length,
    verified: complete.filter((c) => c.verified).length,
    pending: complete.filter((c) => !c.verified && !c.banned).length,
    banned: complete.filter((c) => c.banned).length,
    openReports: reports.filter((r) => r.status === 'open').length,
    dupGroups: duplicates.length,
  }

  const filtered = complete.filter((c) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return `${c.first_name} ${c.last_name} ${c.club}`.toLowerCase().includes(s)
  })
  const coachById = (id) => coaches.find((c) => c.id === id)

  return (
    <div className="welcome-card">
      <div className="welcome-badge">{L('ניהול מערכת', 'Administration')}</div>
      <h2><ShieldCheck size={20} style={{ verticalAlign: '-3px' }} /> {L('לוח ניהול', 'Admin panel')}</h2>
      <p className="muted small">{L('מאמנים, אימות (אנטי-התחזות) ודיווחים.', 'Coaches, verification (anti-impersonation), and reports.')}</p>

      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={tab === 'overview' ? 'tab active' : 'tab'} onClick={() => setTab('overview')}><BarChart3 size={15} /> {L('סקירה', 'Overview')}</button>
        <button className={tab === 'coaches' ? 'tab active' : 'tab'} onClick={() => setTab('coaches')}><Users size={15} /> {L('מאמנים', 'Coaches')}</button>
        <button className={tab === 'reports' ? 'tab active' : 'tab'} onClick={() => setTab('reports')}>
          <Flag size={15} /> {L('דיווחים', 'Reports')}{stats.openReports > 0 ? ` (${stats.openReports})` : ''}
        </button>
        <button className="icon-btn" style={{ marginInlineStart: 'auto' }} onClick={load} aria-label={L('רענון', 'Refresh')}><RefreshCw size={15} className={loading ? 'spin' : ''} /></button>
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>{L('טוען...', 'Loading...')}</p>
      ) : tab === 'overview' ? (
        <div className="team-section">
          <div className="admin-stats">
            <div className="admin-stat"><span className="admin-stat-n">{stats.total}</span><span className="admin-stat-l">{L('מאמנים', 'Coaches')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.verified}</span><span className="admin-stat-l">{L('מאומתים', 'Verified')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.pending}</span><span className="admin-stat-l">{L('ממתינים', 'Pending')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.banned}</span><span className="admin-stat-l">{L('חסומים', 'Banned')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.openReports}</span><span className="admin-stat-l">{L('דיווחים פתוחים', 'Open reports')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.dupGroups}</span><span className="admin-stat-l">{L('חשד התחזות', 'Impersonation flags')}</span></div>
          </div>

          {duplicates.length > 0 && (
            <div className="admin-dup">
              <h3 className="form-section-title"><AlertTriangle size={16} /> {L('חשד להתחזות — אותו מועדון+שכבה ליותר ממאמן אחד', 'Possible impersonation — same club+age claimed by multiple coaches')}</h3>
              {duplicates.map(([key, arr]) => {
                const [club, grp] = key.split('|')
                return (
                  <div key={key} className="admin-dup-row">
                    <div className="admin-dup-key">{club} · {trTeam(grp)}</div>
                    <div className="admin-dup-coaches">
                      {arr.map((c) => (
                        <span key={c.id} className={c.verified ? 'chip selected static' : 'chip static'}>
                          {c.first_name} {c.last_name}
                          {c.verified && <ShieldCheck size={12} />}
                          {c.banned && <Ban size={12} />}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : tab === 'coaches' ? (
        <div className="team-section">
          <div className="field-group">
            <div className="finder-search">
              <Search size={16} />
              <input className="finder-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('חיפוש מאמן או מועדון...', 'Search coach or club...')} />
            </div>
          </div>
          <ul className="admin-list">
            {filtered.map((c) => (
              <li key={c.id} className={c.banned ? 'admin-coach banned' : 'admin-coach'}>
                <Avatar name={`${c.first_name} ${c.last_name}`} url={c.avatar_url} size={40} />
                <div className="admin-coach-info">
                  <strong>{c.first_name} {c.last_name}{c.verified && <span className="verified-badge"><ShieldCheck size={12} /> {L('מאומת', 'Verified')}</span>}</strong>
                  <span className="muted small">{c.club}{(c.age_groups || []).length ? ' · ' + c.age_groups.map(trTeam).join(', ') : ''}</span>
                </div>
                <div className="admin-coach-actions">
                  <button className={c.verified ? 'chip selected' : 'chip'} onClick={() => setFlag(c.id, { verified: !c.verified })} title={L('אימות מאמן', 'Verify coach')}>
                    <Check size={13} /> {c.verified ? L('בטל אימות', 'Unverify') : L('אמת', 'Verify')}
                  </button>
                  <button className={c.banned ? 'chip danger-on' : 'chip'} onClick={() => setFlag(c.id, { banned: !c.banned })} title={L('חסימת מאמן', 'Ban coach')}>
                    <Ban size={13} /> {c.banned ? L('בטל חסימה', 'Unban') : L('חסום', 'Ban')}
                  </button>
                </div>
              </li>
            ))}
            {filtered.length === 0 && <p className="muted small">{L('לא נמצאו מאמנים.', 'No coaches found.')}</p>}
          </ul>
        </div>
      ) : (
        <div className="team-section">
          {reports.length === 0 ? (
            <div className="empty-state">
              <span className="empty-ic"><Flag size={26} /></span>
              <div className="empty-title">{L('אין דיווחים', 'No reports')}</div>
            </div>
          ) : (
            <ul className="admin-list">
              {reports.map((r) => {
                const tgt = r.target_type === 'coach' ? coachById(r.target_id) : null
                return (
                  <li key={r.id} className={`admin-report status-${r.status}`}>
                    <div className="admin-report-main">
                      <span className={`report-reason reason-${r.reason}`}>{REASON_HE[r.reason] ? L(REASON_HE[r.reason], r.reason) : r.reason}</span>
                      <strong>{r.target_label || (tgt ? `${tgt.first_name} ${tgt.last_name}` : r.target_type)}</strong>
                      {r.details && <span className="muted small">{r.details}</span>}
                      <span className="admin-report-meta">
                        <span className={`status-pill admin-status st-${r.status}`}>
                          {r.status === 'open' ? L('פתוח', 'Open') : r.status === 'resolved' ? L('טופל', 'Resolved') : L('נדחה', 'Dismissed')}
                        </span>
                        <span className="muted small" dir="ltr">{(r.created_at || '').split('T')[0]}</span>
                      </span>
                    </div>
                    <div className="admin-report-actions">
                      {tgt && !tgt.banned && (
                        <button className="chip danger-on" onClick={() => setFlag(tgt.id, { banned: true })}><Ban size={13} /> {L('חסום מאמן', 'Ban coach')}</button>
                      )}
                      {r.status === 'open' && (
                        <>
                          <button className="chip" onClick={() => resolveReport(r.id, 'resolved')}><Check size={13} /> {L('טופל', 'Resolve')}</button>
                          <button className="chip" onClick={() => resolveReport(r.id, 'dismissed')}><X size={13} /> {L('דחה', 'Dismiss')}</button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
