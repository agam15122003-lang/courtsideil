import { useState, useEffect } from 'react'
import {
  ShieldCheck, Flag, Users, BarChart3, Search, Check, Ban,
  AlertTriangle, X, RefreshCw, UserCheck, Trash2, Clock, FileText,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { NEWS_CACHE_KEY } from './constants'
import Avatar from './Avatar'
import { L, trTeam } from './i18n'
import { SkeletonStats, SkeletonRoster } from './Skeleton'
import { confirmDialog } from './confirm'
import {
  adminPendingMinors, adminConsentLog, adminRevokeConsent,
  adminDeletionRequests, adminMarkDeletionDone,
  CONSENT_TYPES, consentLabel, consentValueLabel,
} from './consent'

const REASON_HE = {
  impersonation: 'התחזות', inappropriate: 'תוכן לא הולם', spam: 'ספאם', other: 'אחר',
}

// מצב אחיד לרשימות של הלשונית החדשה: טעינה · לא-מותקן · שגיאה · ריק
function ListState({ loading, notDeployed, error, empty, icon, emptyTitle, emptyText, onRetry }) {
  if (loading) return <SkeletonRoster count={3} />
  if (notDeployed) {
    return (
      <div className="empty-state">
        <span className="empty-ic"><Clock size={26} /></span>
        <div className="empty-title">{L('הפיצ׳ר עדיין לא הותקן במסד', 'Not deployed to the database yet')}</div>
        <p className="muted small">
          {L('צריך להריץ את מיגרציית ההסכמות (supabase_parent_consent.sql) ואז לרענן.',
             'Run the consent migration (supabase_parent_consent.sql) and refresh.')}
        </p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="empty-state" role="alert">
        <span className="empty-ic"><AlertTriangle size={26} /></span>
        <div className="empty-title">{L('הטעינה נכשלה', 'Loading failed')}</div>
        {onRetry && <button type="button" className="btn-primary" onClick={onRetry}>{L('נסה שוב', 'Try again')}</button>}
      </div>
    )
  }
  if (empty) {
    return (
      <div className="empty-state">
        <span className="empty-ic">{icon}</span>
        <div className="empty-title">{emptyTitle}</div>
        {emptyText && <p className="muted small">{emptyText}</p>}
      </div>
    )
  }
  return null
}

// לוח ניהול — סקירה, מאמנים (אימות/חסימה + זיהוי התחזות), דיווחים.
export default function Admin({ session, profile }) {
  const [tab, setTab] = useState('overview')
  const [coaches, setCoaches] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    // admin_profiles() — נתיב אדמין מפורש; select('*') על profiles כבר לא כולל
    // phone/email (ההרשאה נשללה כדי להגן על PII של קטינים).
    const [pf, rp] = await Promise.all([
      supabase.rpc('admin_profiles'),
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
    ])
    let list = pf.error ? null : pf.data
    if (!list) {
      const legacy = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      list = legacy.error ? [] : legacy.data || []
    }
    setCoaches(list)
    setReports(rp.error ? [] : rp.data || [])
    // "אין דיווחים" ו"הטעינה נכשלה" נראו עד עכשיו זהים לחלוטין
    setLoadFailed(!!rp.error)
    if (rp.error) toast.error(L('טעינת הדיווחים נכשלה — רענן', 'Failed to load reports — refresh'))
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  // ===== לשונית «הסכמות ומחיקות» =====
  const [minors, setMinors] = useState({ loading: true, rows: [], notDeployed: false, error: false })
  const [dels, setDels] = useState({ loading: true, rows: [], notDeployed: false, error: false })
  const [openMinor, setOpenMinor] = useState(null) // id של הקטין שהלוג שלו פתוח
  const [log, setLog] = useState({ loading: false, rows: [], notDeployed: false, error: false })

  // ממיר את התשובה האחידה של consent.js למצב הרשימה
  const toListState = (res) => ({
    loading: false,
    rows: res.ok ? (res.rows || []) : [],
    notDeployed: !!res.notDeployed,
    error: !res.ok && !res.notDeployed,
  })

  async function loadConsent() {
    setMinors((s) => ({ ...s, loading: true }))
    setDels((s) => ({ ...s, loading: true }))
    const [m, d] = await Promise.all([adminPendingMinors(), adminDeletionRequests()])
    setMinors(toListState(m))
    setDels(toListState(d))
  }
  useEffect(() => {
    if (tab === 'consent') loadConsent()
    /* eslint-disable-next-line */
  }, [tab])

  const openLog = async (id) => {
    if (openMinor === id) { setOpenMinor(null); return }
    setOpenMinor(id)
    setLog({ loading: true, rows: [], notDeployed: false, error: false })
    setLog(toListState(await adminConsentLog(id)))
  }

  const revoke = async (minorId, type) => {
    const ok = await confirmDialog({
      title: L('לבטל את ההסכמה?', 'Revoke this consent?'),
      message: type === 'basic'
        ? L('ביטול ההסכמה הבסיסית משעה את חשבון השחקן לחלוטין.', 'Revoking the basic consent fully suspends the player account.')
        : L('ההרשאה תבוטל. אפשר יהיה לאשר אותה מחדש רק דרך ההורה.', 'The permission will be revoked. Only the guardian can grant it again.'),
      confirmText: L('בטלו', 'Revoke'),
      danger: true,
    })
    if (!ok) return
    const res = await adminRevokeConsent(minorId, type)
    if (res.ok) {
      toast.success(L('ההסכמה בוטלה', 'Consent revoked'))
      setLog(toListState(await adminConsentLog(minorId)))
      loadConsent()
    } else {
      toast.error(res.notDeployed
        ? L('הפעולה עדיין לא קיימת במסד', 'This action is not deployed yet')
        : L('הביטול נכשל', 'Revoke failed'))
    }
  }

  const markDone = async (id) => {
    const ok = await confirmDialog({
      title: L('לסמן את בקשת המחיקה כטופלה?', 'Mark this deletion request as done?'),
      message: L('סימון הבקשה מצהיר שהמחיקה בוצעה בפועל (חשבון, שורות סגל וקבצי מדיה).',
                 'Marking it states that the deletion was actually carried out (account, roster rows and media files).'),
      confirmText: L('סמן כטופל', 'Mark done'),
      danger: false,
    })
    if (!ok) return
    const res = await adminMarkDeletionDone(id)
    if (res.ok) {
      toast.success(L('סומן כטופל', 'Marked as done'))
      setDels(toListState(await adminDeletionRequests()))
    } else {
      toast.error(res.notDeployed
        ? L('הפעולה עדיין לא קיימת במסד', 'This action is not deployed yet')
        : L('העדכון נכשל', 'Update failed'))
    }
  }

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

  // "מאמנים" חייב להיות מאמנים בלבד: הסינון הקודם היה first_name && club, ולכן
  // חשבון שחקן עם מועדון נספר כמאמן והופיע ברשימת המאמנים עם כפתורי אימות/חסימה.
  const complete = coaches.filter((c) => c.first_name && c.club && (c.role || 'coach') !== 'player')
  const players = coaches.filter((c) => c.role === 'player')
  const stats = {
    total: complete.length,
    players: players.length,
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
      {/* אין כאן כותרת: Dashboard עוטף את המסך ב-<Page> שכבר נותן
          eyebrow, H1 ותת-כותרת. שתי כותרות = שני H1 באותו מסך. */}
      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={tab === 'overview' ? 'tab active' : 'tab'} onClick={() => setTab('overview')}><BarChart3 size={15} /> {L('סקירה', 'Overview')}</button>
        <button className={tab === 'coaches' ? 'tab active' : 'tab'} onClick={() => setTab('coaches')}><Users size={15} /> {L('מאמנים', 'Coaches')}</button>
        <button className={tab === 'reports' ? 'tab active' : 'tab'} onClick={() => setTab('reports')}>
          <Flag size={15} /> {L('דיווחים', 'Reports')}{stats.openReports > 0 ? ` (${stats.openReports})` : ''}
        </button>
        <button className={tab === 'consent' ? 'tab active' : 'tab'} onClick={() => setTab('consent')}>
          <UserCheck size={15} /> {L('הסכמות ומחיקות', 'Consents & deletions')}
        </button>
        <button
          className="icon-btn"
          style={{ marginInlineStart: 'auto' }}
          onClick={() => (tab === 'consent' ? loadConsent() : load())}
          aria-label={L('רענון', 'Refresh')}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {loading ? (
        tab === 'overview' ? <SkeletonStats count={6} /> : <SkeletonRoster count={6} />
      ) : tab === 'overview' ? (
        <div className="team-section">
          <div className="admin-stats">
            <div className="admin-stat"><span className="admin-stat-n">{stats.total}</span><span className="admin-stat-l">{L('מאמנים', 'Coaches')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.players}</span><span className="admin-stat-l">{L('שחקנים', 'Players')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.verified}</span><span className="admin-stat-l">{L('מאומתים', 'Verified')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.pending}</span><span className="admin-stat-l">{L('ממתינים', 'Pending')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.banned}</span><span className="admin-stat-l">{L('חסומים', 'Banned')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.openReports}</span><span className="admin-stat-l">{L('דיווחים פתוחים', 'Open reports')}</span></div>
            <div className="admin-stat"><span className="admin-stat-n">{stats.dupGroups}</span><span className="admin-stat-l">{L('חשד התחזות', 'Impersonation flags')}</span></div>
          </div>

          {/* 2.2 — רענון ידני של הכתבות: מרוקן את קאש ה-localStorage,
              והביקור הבא בדף הבית מושך פידים טריים */}
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn-soft"
              onClick={() => {
                try { localStorage.removeItem(NEWS_CACHE_KEY) } catch { /* לא קריטי */ }
                toast.success(L('קאש הכתבות נוקה — הבית ימשוך כתבות טריות בכניסה הבאה', 'News cache cleared — home fetches fresh articles next visit'))
              }}
            >
              <RefreshCw size={14} /> {L('רענון כתבות הבית', 'Refresh home articles')}
            </button>
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
      ) : tab === 'consent' ? (
        <div className="team-section adm-consent">
          {/* ----- קטינים שממתינים לאישור הורה ----- */}
          <h3 className="form-section-title"><UserCheck size={16} /> {L('קטינים שממתינים לאישור הורה', 'Minors awaiting parental approval')}</h3>
          <ListState
            loading={minors.loading}
            notDeployed={minors.notDeployed}
            error={minors.error}
            empty={minors.rows.length === 0}
            icon={<UserCheck size={26} />}
            emptyTitle={L('אין קטינים ממתינים', 'No minors are waiting')}
            emptyText={L('כל חשבונות הקטינים אושרו על ידי הורה.', 'Every minor account has parental approval.')}
            onRetry={loadConsent}
          />
          {!minors.loading && !minors.notDeployed && !minors.error && minors.rows.length > 0 && (
            <ul className="admin-list">
              {minors.rows.map((m) => (
                <li key={m.id} className="adm-minor">
                  <div className="adm-minor-main">
                    <strong>{m.first_name} {m.last_name}</strong>
                    <span className="muted small" dir="ltr">{m.guardian_email || '—'}</span>
                    {m.guardian_name && <span className="muted small">{m.guardian_name}</span>}
                    <span className="admin-report-meta">
                      <span className={`status-pill admin-status st-${m.approval_status === 'suspended' ? 'open' : 'pending'}`}>
                        {m.approval_status === 'suspended' ? L('מושעה', 'Suspended') : L('ממתין להורה', 'Awaiting parent')}
                      </span>
                      <span className="muted small" dir="ltr">{(m.created_at || '').split('T')[0]}</span>
                    </span>
                  </div>
                  <div className="admin-coach-actions">
                    <button type="button" className="chip" onClick={() => openLog(m.id)} aria-expanded={openMinor === m.id}>
                      <FileText size={13} /> {openMinor === m.id ? L('סגירת הלוג', 'Hide log') : L('לוג הסכמות', 'Consent log')}
                    </button>
                  </div>

                  {openMinor === m.id && (
                    <div className="adm-log">
                      <ListState
                        loading={log.loading}
                        notDeployed={log.notDeployed}
                        error={log.error}
                        empty={log.rows.length === 0}
                        icon={<FileText size={26} />}
                        emptyTitle={L('אין עדיין רשומות הסכמה', 'No consent records yet')}
                        emptyText={L('ההורה טרם פתח את הקישור.', 'The guardian has not opened the link yet.')}
                        onRetry={() => openLog(m.id)}
                      />
                      {!log.loading && !log.notDeployed && !log.error && log.rows.length > 0 && (
                        <ul className="adm-log-list">
                          {log.rows.map((row, i) => (
                            <li key={row.id || i}>
                              <span className="adm-log-type">{consentLabel(row.consent_type || row.type)}</span>
                              <span className={`status-pill adm-cv cv-${row.value}`}>{consentValueLabel(row.value)}</span>
                              <span className="muted small" dir="ltr">{(row.created_at || '').replace('T', ' ').slice(0, 16)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!log.notDeployed && (
                        <div className="adm-revoke">
                          <span className="muted small">{L('ביטול הסכמה בשם ההורה (לתיעוד פנייה):', 'Revoke a consent on the guardian’s behalf (for a documented request):')}</span>
                          <div className="admin-coach-actions">
                            {CONSENT_TYPES.map((t) => (
                              <button key={t} type="button" className="chip danger-on" onClick={() => revoke(m.id, t)}>
                                <Ban size={13} /> {consentLabel(t)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* ----- בקשות מחיקת חשבון ----- */}
          <h3 className="form-section-title" style={{ marginTop: 22 }}>
            <Trash2 size={16} /> {L('בקשות מחיקת חשבון', 'Account deletion requests')}
          </h3>
          <p className="muted small">
            {L('מדיניות הפרטיות מבטיחה מחיקה תוך 30 יום. סימון «טופל» מצהיר שהמחיקה בוצעה בפועל.',
               'The privacy policy promises deletion within 30 days. Marking “done” states the deletion was actually carried out.')}
          </p>
          <ListState
            loading={dels.loading}
            notDeployed={dels.notDeployed}
            error={dels.error}
            empty={dels.rows.length === 0}
            icon={<Trash2 size={26} />}
            emptyTitle={L('אין בקשות מחיקה', 'No deletion requests')}
            emptyText={L('כשמשתמש יבקש למחוק את החשבון, הבקשה תופיע כאן.', 'When a user asks to delete their account, the request shows up here.')}
            onRetry={loadConsent}
          />
          {!dels.loading && !dels.notDeployed && !dels.error && dels.rows.length > 0 && (
            <ul className="admin-list">
              {dels.rows.map((d) => (
                <li key={d.id} className={`admin-report status-${d.status}`}>
                  <div className="admin-report-main">
                    <strong>{d.first_name} {d.last_name}</strong>
                    {d.email_hint && <span className="muted small" dir="ltr">{d.email_hint}</span>}
                    {d.reason && <span className="muted small">{d.reason}</span>}
                    <span className="admin-report-meta">
                      <span className={`status-pill admin-status st-${d.status === 'done' ? 'resolved' : 'open'}`}>
                        {d.status === 'done' ? L('טופל', 'Done') : L('ממתין', 'Pending')}
                      </span>
                      <span className="muted small" dir="ltr">{(d.created_at || '').split('T')[0]}</span>
                    </span>
                  </div>
                  <div className="admin-report-actions">
                    {d.status !== 'done' && (
                      <button type="button" className="chip" onClick={() => markDone(d.id)}>
                        <Check size={13} /> {L('סמן כטופל', 'Mark done')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="team-section">
          {reports.length === 0 ? (
            <div className="empty-state" role={loadFailed ? 'alert' : undefined}>
              <span className="empty-ic"><Flag size={26} /></span>
              <div className="empty-title">
                {loadFailed ? L('טעינת הדיווחים נכשלה', 'Failed to load reports') : L('אין דיווחים', 'No reports')}
              </div>
              {loadFailed && (
                <button type="button" className="btn-primary" onClick={load}>{L('נסה שוב', 'Try again')}</button>
              )}
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
