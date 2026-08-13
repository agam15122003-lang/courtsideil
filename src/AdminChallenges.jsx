import { useCallback, useEffect, useState } from 'react'
import {
  Trophy, CalendarClock, Check, X, ShieldAlert, Ban, Send, RefreshCw, Download, Play, Brain,
} from 'lucide-react'
import { L } from './i18n'
import { toast } from './toast'
import { waShare, copyText } from './share'
import SignedVideo from './SignedVideo'
import {
  adminChallenges, defaultWindow, openChallenge, rescheduleChallenge, decideChallenge,
  reviewQueue, reviewSubmission, challengeTop5, recordPublication, messageKit,
  adminQuizzes, buildQuiz, setQuizStatus,
} from './game'

// AdminChallenges — מסך הניהול של האתגר השבועי.
//
// שלוש לשוניות שהן שלושת הרגעים של הבעלים בשבוע:
//   · הבנק      — ראשון בערב: בוחר אתגר, קובע תאריכים, מפרסם.
//   · תור האישור — שוטף: צופה בקליפ, מאשר או דוחה.
//   · הכרזה     — בסוף: טופ-5, מי מותר לפרסום, וייצוא.

// ===== המרה בין ISO לשדה datetime-local =====
// שדה datetime-local עובד בשעון המכשיר. הבעלים בישראל, ולכן זה זהה
// לשעון שהשרת מחשב לפיו. אם אי פעם ינוהל מחו"ל — כאן המקום לתקן.
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v) => {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d) ? null : d.toISOString()
}
const fmt = (iso) =>
  iso
    ? new Intl.DateTimeFormat('he-IL', {
        weekday: 'short', day: 'numeric', month: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
      }).format(new Date(iso))
    : '—'

const STATUS_HE = {
  draft: 'טיוטה', scheduled: 'מתוזמן', open: 'פתוח', closed: 'נסגר', decided: 'הוכרז',
}

// ארבע סיבות הדחייה שחוזרות בפועל, ככפתורים — כדי שדחייה תיקח שניות
const REJECT_REASONS = [
  'הטיימר לא נראה בפריים',
  'הסל לא נראה בפריים',
  'יש יותר מטייק אחד',
  'מופיעים אנשים נוספים בפריים',
]

// ===== לשונית 1: הבנק והתאריכים =====
function BankTab({ rows, onReload }) {
  const [editing, setEditing] = useState(null)   // id
  const [form, setForm] = useState({ opens: '', closes: '', decide: '' })
  const [busy, setBusy] = useState(false)

  const startPublish = async (c) => {
    setEditing(c.id)
    const w = await defaultWindow()
    setForm({
      opens: toLocalInput(c.opens_at || new Date().toISOString()),
      closes: toLocalInput(c.closes_at || w.window?.closes_at),
      decide: toLocalInput(c.decide_at || w.window?.decide_at),
    })
  }

  const save = async (c, mode) => {
    setBusy(true)
    const args = {
      opens: fromLocalInput(form.opens),
      closes: fromLocalInput(form.closes),
      decide: fromLocalInput(form.decide),
    }
    const r = mode === 'publish'
      ? await openChallenge(c.id, args.opens, args.closes, args.decide)
      : await rescheduleChallenge(c.id, args)
    setBusy(false)

    if (!r.ok || r.data?.ok === false) {
      const d = r.data || r
      toast.error(d.message || L('לא הצלחנו לשמור', "Couldn't save"))
      return
    }
    toast.success(mode === 'publish' ? L('האתגר פורסם', 'Challenge published') : L('התאריכים עודכנו', 'Dates updated'))
    setEditing(null)
    onReload()
  }

  return (
    <div className="gm-adm-list">
      {rows.map((c) => (
        <div key={c.id} className="gm-adm-card">
          <div className="gm-adm-head">
            <span className="gm-adm-title">
              {c.seq ? <span className="gm-adm-seq" dir="ltr">{c.seq}</span> : null}
              <b>{c.title}</b>
              <span className={`gm-badge gm-badge--${c.status}`}>{STATUS_HE[c.status] || c.status}</span>
            </span>
            <span className="muted small">{c.metric_label}</span>
          </div>

          {c.status !== 'draft' && (
            <p className="muted small gm-adm-dates">
              {L('נפתח', 'Opens')}: {fmt(c.opens_at)} · {L('נסגר', 'Closes')}: {fmt(c.closes_at)} ·{' '}
              {L('הכרזה', 'Announce')}: {fmt(c.decide_at)}
            </p>
          )}

          {editing === c.id ? (
            <div className="gm-adm-form">
              <label>
                {L('נפתח', 'Opens')}
                <input type="datetime-local" value={form.opens}
                  onChange={(e) => setForm({ ...form, opens: e.target.value })} />
              </label>
              <label>
                {L('נסגר', 'Closes')}
                <input type="datetime-local" value={form.closes}
                  onChange={(e) => setForm({ ...form, closes: e.target.value })} />
              </label>
              <label>
                {L('מכריזים זוכה', 'Winner announced')}
                <input type="datetime-local" value={form.decide}
                  onChange={(e) => setForm({ ...form, decide: e.target.value })} />
              </label>
              <div className="gm-adm-actions">
                <button type="button" className="btn-primary" disabled={busy}
                  onClick={() => save(c, c.status === 'draft' ? 'publish' : 'reschedule')}>
                  {c.status === 'draft' ? L('פרסם', 'Publish') : L('שמור שינויים', 'Save changes')}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                  {L('ביטול', 'Cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="gm-adm-actions">
              {c.status === 'draft' && (
                <button type="button" className="btn-primary" onClick={() => startPublish(c)}>
                  <CalendarClock size={15} /> {L('קבע תאריכים ופרסם', 'Set dates & publish')}
                </button>
              )}
              {(c.status === 'open' || c.status === 'closed') && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => startPublish(c)}>
                    <CalendarClock size={15} /> {L('שינוי תאריכים', 'Change dates')}
                  </button>
                  <button type="button" className="btn-ghost"
                    onClick={() => waShare(messageKit.challengeOpen(c.title, c.closes_at))}>
                    <Send size={15} /> {L('הודעה לוואטסאפ', 'WhatsApp message')}
                  </button>
                  <button type="button" className="btn-ghost" onClick={async () => {
                    const r = await decideChallenge(c.id)
                    const d = r.data || r
                    if (d.ok === false) { toast.error(d.message || d.reason); return }
                    toast.success(L('הוכרז זוכה', 'Winner announced')); onReload()
                  }}>
                    <Trophy size={15} /> {L('הכרז עכשיו', 'Announce now')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ===== לשונית 2: תור האישור =====
function QueueTab({ rows, onReload }) {
  const [busy, setBusy] = useState(null)
  const [reasonFor, setReasonFor] = useState(null)
  const [freeText, setFreeText] = useState('')

  const act = async (s, action, reason) => {
    setBusy(s.id)
    // ⚠ version נשלח תמיד: אם השחקן החליף קליפ מאז שהמסך נטען, השרת
    //   יסרב — ואנחנו נבקש רענון במקום לאשר סרטון שלא נצפה.
    const r = await reviewSubmission(s.id, s.version, action, null, reason)
    setBusy(null)
    const d = r.data || r
    if (d.ok === false) {
      if (d.reason === 'stale') {
        toast.error(L('ההגשה הוחלפה מאז שצפית — רענן ובדוק שוב', 'Submission changed since you viewed it — refresh'))
        onReload()
        return
      }
      toast.error(d.message || d.reason || L('הפעולה נכשלה', 'Action failed'))
      return
    }
    toast.success(
      action === 'approve' ? L('אושר', 'Approved')
        : action === 'flag_age' ? L('סומן לבדיקת גיל', 'Flagged for age check')
        : action === 'block' ? L('נחסם', 'Blocked') : L('נדחה', 'Rejected'),
    )
    setReasonFor(null)
    setFreeText('')
    onReload()
  }

  if (!rows.length) {
    return (
      <div className="empty-state">
        <Check size={26} />
        <b>{L('אין הגשות חדשות לבקרה', 'Nothing new to review')}</b>
        <p>{L('ההגשות עולות לפיד מיד; כאן עוברים עליהן אחרי — מאמתים תוצאה, מסירים מה שלא תקין.', 'Entries go live instantly; here you spot-check after — verify scores, remove what breaks the rules.')}</p>
      </div>
    )
  }

  return (
    <div className="gm-adm-list">
      {rows.map((s) => (
        <div key={s.id} className="gm-adm-card">
          <SignedVideo path={s.media_path} />

          <div className="gm-adm-reported">
            <span className="gm-adm-num" dir="ltr">{s.reported_score}</span>
            <span className="muted small">{L('התוצאה שהשחקן דיווח', 'Score the player reported')}</span>
          </div>

          {!s.no_others_in_frame && (
            <p className="gm-adm-warn">
              <ShieldAlert size={15} /> {L('המגיש לא הצהיר שהוא לבד בפריים — אין לייצא את הקליפ.',
                'Submitter did not declare they are alone in frame — do not export.')}
            </p>
          )}

          <div className="gm-adm-actions">
            <button type="button" className="btn-primary" disabled={busy === s.id}
              onClick={() => act(s, 'approve')}>
              <Check size={16} /> {L('אמת תוצאה ✓', 'Verify score ✓')}
            </button>
            <button type="button" className="btn-secondary" disabled={busy === s.id}
              onClick={() => setReasonFor(reasonFor === s.id ? null : s.id)}>
              <X size={16} /> {L('הסר מהפיד', 'Remove from feed')}
            </button>
            <button type="button" className="btn-ghost" disabled={busy === s.id}
              onClick={() => act(s, 'flag_age')} title={L('נראה צעיר מהגיל המוצהר', 'Looks younger than declared')}>
              <ShieldAlert size={15} /> {L('בדיקת גיל', 'Age check')}
            </button>
            <button type="button" className="btn-ghost gm-danger" disabled={busy === s.id}
              onClick={() => act(s, 'block', 'תוכן לא ראוי')}>
              <Ban size={15} /> {L('חסום ושמור', 'Block & keep')}
            </button>
          </div>

          {reasonFor === s.id && (
            <div className="gm-adm-reasons">
              {REJECT_REASONS.map((r) => (
                <button key={r} type="button" className="gm-chip" onClick={() => act(s, 'reject', r)}>
                  {r}
                </button>
              ))}
              <div className="gm-adm-free">
                <input type="text" value={freeText} placeholder={L('סיבה אחרת…', 'Other reason…')}
                  onChange={(e) => setFreeText(e.target.value)} maxLength={200} />
                <button type="button" className="btn-secondary" disabled={!freeText.trim()}
                  onClick={() => act(s, 'reject', freeText.trim())}>
                  {L('דחה', 'Reject')}
                </button>
              </div>
              {/* דחייה שאינה מוסברת נקראת כהתעלמות. ההודעה מוכנה להעתקה. */}
              <button type="button" className="btn-ghost"
                onClick={() => copyText(messageKit.rejected('', freeText.trim() || REJECT_REASONS[0]),
                  L('ההודעה הועתקה', 'Message copied'))}>
                <Send size={15} /> {L('העתק הודעת דחייה', 'Copy rejection message')}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ===== לשונית 3: טופ-5 וייצוא =====
function ExportTab({ rows }) {
  const decided = rows.filter((c) => c.status === 'decided')
  const [pick, setPick] = useState(decided[0]?.id || null)
  const [top, setTop] = useState([])
  const [confirmed, setConfirmed] = useState({})

  useEffect(() => {
    if (!pick) { setTop([]); return }
    challengeTop5(pick).then((r) => setTop(r.ok ? (r.rows || []) : []))
  }, [pick])

  if (!decided.length) {
    return (
      <div className="empty-state">
        <Trophy size={26} />
        <b>{L('עוד לא הוכרז אתגר', 'No challenge announced yet')}</b>
        <p>{L('אחרי ההכרזה תופיע כאן רשימת הטופ-5 לייצוא.', 'After the announcement the top-5 export list shows here.')}</p>
      </div>
    )
  }

  return (
    <div className="gm-adm-list">
      <label className="gm-adm-pick">
        {L('אתגר', 'Challenge')}
        <select value={pick || ''} onChange={(e) => setPick(e.target.value)}>
          {decided.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>

      {top.map((t) => (
        <div key={`${t.place}-${t.user_id}`} className="gm-adm-card">
          <div className="gm-adm-head">
            <span className="gm-adm-title">
              <span className="gm-adm-seq" dir="ltr">{t.place}</span>
              <b>{t.display_name}</b>
              <span dir="ltr" className="muted">{t.score}</span>
            </span>
          </div>

          {t.can_publish ? (
            <>
              <label className="gm-adm-confirm">
                <input type="checkbox" checked={!!confirmed[t.user_id]}
                  onChange={(e) => setConfirmed({ ...confirmed, [t.user_id]: e.target.checked })} />
                {L('צפיתי בקליפ — בפריים רק המגיש', 'I watched it — only the submitter is in frame')}
              </label>
              <div className="gm-adm-actions">
                <button type="button" className="btn-primary" disabled={!confirmed[t.user_id]}
                  onClick={async () => {
                    // ⚠ ההורדה **חייבת** לרשום שורה במרשם. בלי רישום, בקשת
                    //   הורה למחוק הכל אינה יכולה להצביע על הפוסט שעלה.
                    const rec = await recordPublication({
                      challengeId: pick, userId: t.user_id, note: 'ייצוא לאינסטגרם',
                    })
                    if (!rec.ok) { toast.error(L('לא הצלחנו לרשום את הפרסום', "Couldn't record")); return }
                    const { signedVideoUrl } = await import('./storage')
                    const url = await signedVideoUrl(t.media_path)
                    if (!url) { toast.error(L('הקליפ אינו זמין', 'Clip unavailable')); return }
                    window.open(url, '_blank', 'noopener')
                  }}>
                  <Download size={15} /> {L('הורדה לייצוא', 'Download for export')}
                </button>
              </div>
            </>
          ) : (
            <p className="gm-adm-warn">
              <ShieldAlert size={15} />
              {t.publish_reason === 'minor_no_media_public' && L('אין אישור הורה לפרסום', 'No parental publishing consent')}
              {t.publish_reason === 'consent_predates_doc' && L('אישור ההורה ניתן על נוסח ישן — צריך אישור מחדש', 'Consent predates the current document')}
              {t.publish_reason === 'self_submitted' && L('האישור נשלח מהמכשיר של הקטין — לא ניתן לפרסם', 'Consent came from the minor’s own device')}
              {t.publish_reason === 'adult_not_opted_in' && L('המשתמש לא סימן הסכמה לפרסום', 'User did not opt in')}
              {t.publish_reason === 'submitter_opted_out' && L('המגיש ביקש לא לפרסם', 'Submitter opted out')}
              {t.publish_reason === 'others_in_frame_not_declared' && L('לא הוצהר שבפריים רק המגיש', 'Not declared alone in frame')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ===== לשונית 4: חידונים =====
// בניית חידון שבועי: המערכת מגרילה שאלות מהמאגר (320 מאומתות), האדמין
// פותח וסוגר. שאלה שכבר שיחקו עליה לא «נשרפת» — ההגרלה אקראית בכל בנייה.
// לשונית החידונים — **אופציונלית מאז 13.8**: השחקנים בונים לעצמם חידון
// בלחיצה (game_quiz_solo), ואינם ממתינים לאיש. מה שנשאר כאן הוא «חידון
// שבועי» רשמי — אחד בשבוע שנספר בלי תקרה יומית, למי שרוצה אירוע.
function QuizTab() {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', count: 8, difficulty: '', seconds: 20 })

  const load = useCallback(async () => {
    const r = await adminQuizzes()
    setRows(r.ok ? (r.rows || []) : [])
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    setBusy(true)
    const r = await buildQuiz({
      title: form.title.trim() || L('החידון השבועי', 'Weekly quiz'),
      count: Number(form.count) || 8,
      difficulty: form.difficulty || null,
      seconds: Number(form.seconds) || 20,
    })
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(d.message || L('הבנייה נכשלה', 'Build failed')); return }
    toast.success(L(`נבנה חידון עם ${d.questions} שאלות — עכשיו פתח אותו`, `Built with ${d.questions} questions — now open it`))
    setForm({ ...form, title: '' })
    load()
  }

  const setStatus = async (id, status) => {
    const r = await setQuizStatus(id, status)
    if (!r.ok) { toast.error(r.message || L('נכשל', 'Failed')); return }
    toast.success(status === 'open' ? L('החידון פתוח לשחקנים', 'Quiz is live') : L('החידון נסגר', 'Quiz closed'))
    load()
  }

  return (
    <div className="gm-adm-list">
      <div className="gm-adm-card">
        <b>{L('חידון שבועי רשמי', 'Official weekly quiz')}</b>
        <p className="muted small">
          {L('לא חובה — השחקנים בונים לעצמם חידון בכל רגע. זה כאן בשביל אירוע שבועי שנספר בלי תקרה.',
             "Optional — players build their own any time. This is for a weekly event that counts without a daily cap.")}
        </p>
        <div className="gm-adm-form">
          <label>
            {L('שם (לא חובה)', 'Title (optional)')}
            <input type="text" value={form.title} maxLength={60}
              placeholder={L('החידון השבועי', 'Weekly quiz')}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            {L('מספר שאלות', 'Questions')}
            <input type="number" min="3" max="15" dir="ltr" value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value })} />
          </label>
          <label>
            {L('קושי', 'Difficulty')}
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option value="">{L('מעורב (מומלץ)', 'Mixed (recommended)')}</option>
              <option value="easy">{L('קל', 'Easy')}</option>
              <option value="medium">{L('בינוני', 'Medium')}</option>
              <option value="hard">{L('קשה', 'Hard')}</option>
            </select>
          </label>
          <label>
            {L('שניות לשאלה', 'Seconds per question')}
            <input type="number" min="5" max="120" dir="ltr" value={form.seconds}
              onChange={(e) => setForm({ ...form, seconds: e.target.value })} />
          </label>
          <div className="gm-adm-actions">
            <button type="button" className="btn-primary" disabled={busy} onClick={create}>
              <Brain size={15} /> {L('בנה חידון', 'Build quiz')}
            </button>
          </div>
        </div>
      </div>

      {rows.map((z) => (
        <div key={z.id} className="gm-adm-card">
          <div className="gm-adm-head">
            <span className="gm-adm-title">
              <b>{z.title}</b>
              <span className={`gm-badge gm-badge--${z.status === 'open' ? 'open' : z.status === 'closed' ? 'closed' : 'draft'}`}>
                {z.status === 'open' ? L('פתוח', 'Open') : z.status === 'closed' ? L('נסגר', 'Closed') : L('טיוטה', 'Draft')}
              </span>
            </span>
            <span className="muted small" dir="ltr">{(z.question_ids || []).length} · {z.seconds_per_q}s</span>
          </div>
          <div className="gm-adm-actions">
            {z.status !== 'open' && (
              <button type="button" className="btn-primary" onClick={() => setStatus(z.id, 'open')}>
                <Play size={14} /> {L('פתח לשחקנים', 'Open to players')}
              </button>
            )}
            {z.status === 'open' && (
              <button type="button" className="btn-secondary" onClick={() => setStatus(z.id, 'closed')}>
                {L('סגור', 'Close')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== המסך =====
export default function AdminChallenges() {
  const [tab, setTab] = useState('bank')
  const [rows, setRows] = useState([])
  const [queue, setQueue] = useState([])
  const [state, setState] = useState('loading')

  const load = useCallback(async () => {
    setState('loading')
    const [c, q] = await Promise.all([adminChallenges(), reviewQueue()])
    if (c.notDeployed) { setState('notDeployed'); return }
    if (!c.ok) { setState('error'); return }
    setRows(c.rows || [])
    setQueue(q.ok ? (q.rows || []) : [])
    setState('ready')
  }, [])

  useEffect(() => { load() }, [load])

  if (state === 'loading') return <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />
  if (state === 'notDeployed') {
    return (
      <div className="empty-state">
        <CalendarClock size={26} />
        <b>{L('עולם המשחק עוד לא הותקן', 'The game world is not installed yet')}</b>
        <p>{L('צריך להריץ את קובצי ה-SQL של האתגר.', 'Run the challenge SQL migrations first.')}</p>
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="empty-state">
        <b>{L('שגיאה בטעינה', 'Loading error')}</b>
        <button type="button" className="btn-secondary" onClick={load}>{L('נסה שוב', 'Try again')}</button>
      </div>
    )
  }

  return (
    <div className="gm-admin">
      <div className="gm-adm-top">
        <h2><Trophy size={19} aria-hidden="true" /> {L('עולם הכדורסל', 'Basketball world')}</h2>
        <button type="button" className="icon-btn" onClick={load} aria-label={L('רענון', 'Refresh')}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'bank'}
          className={tab === 'bank' ? 'tab active' : 'tab'} onClick={() => setTab('bank')}>
          {L('הבנק', 'Bank')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'queue'}
          className={tab === 'queue' ? 'tab active' : 'tab'} onClick={() => setTab('queue')}>
          <Play size={13} /> {L('בקרה', 'Review')}
          {queue.length > 0 && <span className="gm-count" dir="ltr">{queue.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'export'}
          className={tab === 'export' ? 'tab active' : 'tab'} onClick={() => setTab('export')}>
          {L('טופ-5', 'Top 5')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'quiz'}
          className={tab === 'quiz' ? 'tab active' : 'tab'} onClick={() => setTab('quiz')}>
          <Brain size={13} /> {L('חידונים', 'Quizzes')}
        </button>
      </div>

      {tab === 'bank'   && <BankTab rows={rows} onReload={load} />}
      {tab === 'queue'  && <QueueTab rows={queue} onReload={load} />}
      {tab === 'export' && <ExportTab rows={rows} />}
      {tab === 'quiz'   && <QuizTab />}
    </div>
  )
}
