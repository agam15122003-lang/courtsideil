import { useState, useEffect } from 'react'
import {
  ShieldCheck, Flag, Users, BarChart3, Search, Check, Ban,
  AlertTriangle, X, RefreshCw, UserCheck, Trash2, Clock, FileText,
  Inbox, UserCog, Eye, ShieldAlert,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { NEWS_CACHE_KEY } from './constants'
import Avatar from './Avatar'
import { L, trTeam } from './i18n'
import { SkeletonStats, SkeletonRoster } from './Skeleton'
import { confirmDialog } from './confirm'
import {
  adminPendingMinors, adminConsentLog, adminRevokeConsent, adminSetConsent,
  adminDeletionRequests, adminMarkDeletionDone,
  adminRequests, adminMarkRequestDone, adminSetGuardian, adminRequestKindLabel,
  CONSENT_TYPES, consentLabel, consentValueLabel, isNotDeployed,
} from './consent'

const REASON_HE = {
  impersonation: 'התחזות', inappropriate: 'תוכן לא הולם', spam: 'ספאם', other: 'אחר',
}

// קרבת האפוטרופוס — הערכים חייבים להיות בדיוק אלה שה-RPC מקבל
// ('parent' | 'guardian' | 'other'). מוגדר כאן ולא מיובא מטופס הפרופיל
// כי שם הוא פרטי לקובץ.
const RELATIONS = [
  { value: 'parent', label: () => L('הורה', 'Parent') },
  { value: 'guardian', label: () => L('אפוטרופוס/ית', 'Legal guardian') },
  { value: 'other', label: () => L('אחר', 'Other') },
]

// ===== מחיקת חשבון בפועל =====
// מה הפונקציה עושה לכל טבלה. השמות בעברית/אנגלית כאן ולא בשרת, כי ה-RPC
// מחזיר קודים ולא טקסט מתורגם.
const DEL_ACTION = {
  delete: () => L('נמחק', 'Deleted'),
  anonymise: () => L('אנונימיזציה', 'Anonymised'),
  unlink: () => L('הקישור מנותק', 'Link cleared'),
  blocker: () => L('חוסם מחיקה', 'Blocks deletion'),
}

// סירובים מכוונים של הפונקציה. res.message מהשרת הוא עברית בלבד, ולכן
// הניסוח הדו-לשוני נשמר כאן ונופל אליו רק כברירת מחדל.
const DEL_REASON = {
  user_not_found: () => L('לא נמצא חשבון עם המזהה הזה.', 'No account exists with that id.'),
  refuse_self: () => L('זה החשבון שאיתם אתם מחוברים — אי אפשר למחוק אותו מהמסך הזה.',
                       'That is the account you are signed in with — it cannot be deleted from here.'),
  refuse_admin: () => L('זה חשבון מנהל. הסירו ממנו את הרשאת הניהול ורק אז מחקו.',
                        'This is an admin account. Remove its admin flag first.'),
  fk_blocker: () => L('יש קשרים במסד שחוסמים את המחיקה — הפירוט בדוח.',
                      'Database constraints block the deletion — see the report.'),
  no_user: () => L('חסר מזהה משתמש.', 'Missing user id.'),
}

const delReason = (res) =>
  (DEL_REASON[res?.reason] ? DEL_REASON[res.reason]() : null) || res?.message || null

const fmtNum = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—')

// מצב אחיד לרשימות של הלשונית החדשה: טעינה · לא-מותקן · שגיאה · ריק
function ListState({ loading, notDeployed, error, empty, icon, emptyTitle, emptyText, onRetry, notDeployedText }) {
  if (loading) return <SkeletonRoster count={3} />
  if (notDeployed) {
    return (
      <div className="empty-state">
        <span className="empty-ic"><Clock size={26} /></span>
        <div className="empty-title">{L('הפיצ׳ר עדיין לא הותקן במסד', 'Not deployed to the database yet')}</div>
        <p className="muted small">
          {notDeployedText || L('צריך להריץ את מיגרציית ההסכמות (supabase_parent_consent.sql) ואז לרענן.',
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

  // ----- פניות לאדמין -----
  // מצב נפרד לגמרי מרשימת הקטינים, כולל לוג משלו: אותו אדם יכול להופיע גם
  // כקטין ממתין וגם כפונה, ומצב פתיחה משותף היה פותח את שתי הכרטיסיות יחד.
  const [reqs, setReqs] = useState({ loading: true, rows: [], notDeployed: false, error: false })
  const [openReq, setOpenReq] = useState(null) // id של הפנייה שהלוג שלה פתוח
  const [reqLog, setReqLog] = useState({ loading: false, rows: [], notDeployed: false, error: false })
  // טופס החלפת ההורה — פתוח לפנייה אחת בכל רגע
  const [gForm, setGForm] = useState(null) // { reqId, name, email, phone, relation }
  const [gSaving, setGSaving] = useState(false)

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
    setReqs((s) => ({ ...s, loading: true }))
    const [m, d, r] = await Promise.all([adminPendingMinors(), adminDeletionRequests(), adminRequests()])
    setMinors(toListState(m))
    setDels(toListState(d))
    setReqs(toListState(r))
  }
  useEffect(() => {
    if (tab === 'consent') loadConsent()
    /* eslint-disable-next-line */
  }, [tab])

  // מושך את לוג ההסכמות של מזהה כלשהו לתוך setter נתון — משותף לשתי
  // הרשימות (הקטינים הממתינים והפניות), כדי שלא יהיו שתי גרסאות שנפרדות בזמן.
  const fetchLog = async (id, setter) => {
    setter({ loading: true, rows: [], notDeployed: false, error: false })
    setter(toListState(await adminConsentLog(id)))
  }

  const openLog = async (id) => {
    if (openMinor === id) { setOpenMinor(null); return }
    setOpenMinor(id)
    await fetchLog(id, setLog)
  }

  // ההכרעה האחרונה שנרשמה לכל סוג, נגזרת מהלוג עצמו (מסודר created_at desc).
  // בלי זה האדמין לוחץ «אשר» על משהו שכבר מאושר, ואין לו שום מושג מה המצב.
  const latestInLog = (type) => {
    const row = log.rows.find((r) => (r.consent_type || r.type) === type)
    return row ? row.value : null
  }

  // עד היום לאדמין הייתה רק דרך אחת — לבטל. הורה שהתקשר וביקש לאשר משהו
  // שסירב לו בעבר (למשל פרסום תמונות) נשאר בלי מענה: create_consent_request
  // מסרב להנפיק קישור ניהול, ו-submit_parent_consent חוסם שדרוג מ-denied
  // ל-granted דרך קישור ראשוני. admin_set_consent הוא הנתיב האנושי לזה.
  const setConsent = async (minorId, type, value) => {
    const basic = type === 'basic'
    const message = value === 'granted'
      ? (basic
        ? L('רישום ההסכמה הבסיסית כמאושרת מפעיל מחדש את חשבון השחקן, ומבטל בקשת מחיקה פתוחה אם נפתחה בעקבות ביטול קודם.',
            'Recording the basic consent as granted reactivates the player account and cancels an open deletion request, if a previous revocation opened one.')
        : L('ההרשאה תירשם כמאושרת בשם ההורה. עשו זאת רק אחרי פנייה מתועדת של ההורה — זו הסכמה משפטית שהוא נותן, לא אתם.',
            'The permission will be recorded as granted on the guardian’s behalf. Do this only after a documented request from them — this is their legal consent, not yours.'))
      : basic
        ? L('ביטול ההסכמה הבסיסית משעה את חשבון השחקן לחלוטין ופותח בקשת מחיקת חשבון, לפי מדיניות הפרטיות.',
            'Removing the basic consent fully suspends the player account and opens an account-deletion request, per the privacy policy.')
        : L('ההרשאה תוסר. תוכן שכבר פורסם על סמך ההרשאה הזו לא יורד מעצמו — צריך לטפל בו בנפרד.',
            'The permission will be removed. Content already published under it is not taken down automatically — handle it separately.')
    const ok = await confirmDialog({
      title: value === 'granted'
        ? L('לרשום אישור בשם ההורה?', 'Record an approval on the guardian’s behalf?')
        : value === 'denied'
          ? L('לרשום סירוב בשם ההורה?', 'Record a refusal on the guardian’s behalf?')
          : L('לבטל את ההסכמה?', 'Revoke this consent?'),
      // .cf-msg הוא פסקה רגילה (בלי white-space: pre-line), ולכן שורות חדשות
      // היו נבלעות — המשפט נבנה כאן כטקסט רץ עם מפרידים.
      message: `«${consentLabel(type)}» ← ${consentValueLabel(value)}. ${message} ` +
        L('הפעולה נרשמת ביומן ההסכמות ומסומנת כפעולת אדמין.',
          'The action is written to the consent log and marked as an admin action.'),
      confirmText: value === 'granted' ? L('רשמו אישור', 'Record approval') : L('אישור', 'Confirm'),
      danger: value !== 'granted',
    })
    if (!ok) return

    let res = await adminSetConsent(minorId, type, value)
    // מסד שטרם הריץ את מיגרציית קישור הניהול: ביטול עדיין אפשרי בנתיב הישן,
    // ולכן לא מאבדים יכולת קיימת רק כי הפונקציה החדשה עוד לא הותקנה.
    if (res.notDeployed && value === 'revoked') res = await adminRevokeConsent(minorId, type)

    if (res.ok) {
      toast.success(L('ההסכמה עודכנה', 'Consent updated'))
      setLog(toListState(await adminConsentLog(minorId)))
      loadConsent()
      return
    }
    toast.error(res.notDeployed
      ? L('הפעולה עדיין לא קיימת במסד — צריך להריץ את מיגרציית קישור הניהול',
          'This action is not deployed yet — run the management-link migration')
      : L('העדכון נכשל', 'Update failed'))
  }

  // ----- מחיקת חשבון בפועל -----
  //
  // שני שלבים, ואי אפשר לדלג על הראשון: אין כאן כפתור אחד שמוחק. קודם
  // admin_execute_deletion במצב יבש מחזיר דוח (מי זה, מה יימחק, כמה
  // שורות), ורק אחרי שהוא על המסך נפתח כפתור המחיקה — ודיאלוג האישור
  // מצטט את המספרים שהדוח החזיר, כדי שהאישור יהיה על מה שנראה בעין.
  // purge = { userId, loading, notDeployed, report, running, result }
  const [purge, setPurge] = useState(null)

  // supabase.rpc ישירות ולא דרך consent.js: callRpc שם אינו מיוצא, ו-
  // admin_execute_deletion מחזירה jsonb עם ok:false לגיטימי (סירוב מכוון),
  // שאסור להתבלבל בינו לבין שגיאת רשת.
  const callDeletion = async (userId, dryRun) => {
    let res
    try {
      res = await supabase.rpc('admin_execute_deletion', { p_user: userId, p_dry_run: dryRun })
    } catch (err) {
      return { ok: false, message: err?.message || '' }
    }
    if (res.error) {
      return { ok: false, notDeployed: isNotDeployed(res.error), message: res.error.message || '' }
    }
    return res.data && typeof res.data === 'object' ? res.data : { ok: false }
  }

  const previewDeletion = async (d) => {
    if (purge?.userId === d.user_id && !purge.loading) { setPurge(null); return }
    setPurge({ userId: d.user_id, loading: true })
    const res = await callDeletion(d.user_id, true)
    if (res.notDeployed) { setPurge({ userId: d.user_id, notDeployed: true }); return }
    if (!res.ok) {
      setPurge(null)
      toast.error(delReason(res) || L('הפקת הדוח נכשלה', 'Generating the report failed'))
      return
    }
    setPurge({ userId: d.user_id, report: res })
  }

  const runDeletion = async (d) => {
    const rep = purge?.userId === d.user_id ? purge.report : null
    if (!rep) return // הכפתור לא מרונדר בלי דוח; זו חגורה נוספת
    const id = rep.identity || {}
    const name = `${id.first_name || ''} ${id.last_name || ''}`.trim() || d.user_id
    const rows = fmtNum(rep.rows_to_delete)
    const files = rep.storage?.readable ? fmtNum(rep.storage.objects) : L('לא ידוע', 'unknown')
    const roster = fmtNum(rep.roster_to_anonymise)

    const ok = await confirmDialog({
      title: L('למחוק את החשבון לצמיתות?', 'Permanently delete this account?'),
      // הדיאלוג מצטט את הדוח במפורש — אישור על מספרים, לא על תחושה.
      message:
        `${name}${id.email ? ` · ${id.email}` : ''}. ` +
        L(`יימחקו ${rows} שורות ו-${files} קבצים, ו-${roster} שורות סגל יעברו אנונימיזציה `
          + '(השם והפרטים מוסרים, נתוני הנוכחות של המאמן נשארים). ',
          `${rows} rows and ${files} files will be deleted, and ${roster} roster rows will be anonymised `
          + '(name and details removed, the coach’s attendance data kept). ') +
        L('יומן ההסכמות נשמר כראיה שההורה אישר. הפעולה אינה הפיכה ואין ממנה שחזור.',
          'The consent log is kept as evidence that a guardian approved. This cannot be undone or restored.'),
      confirmText: L('מחק לצמיתות', 'Delete permanently'),
      danger: true,
    })
    if (!ok) return

    setPurge((s) => ({ ...s, running: true }))
    const res = await callDeletion(d.user_id, false)
    setPurge((s) => ({ ...s, running: false, result: res }))

    if (res.ok) {
      // שלב ידני שנשאר פתוח הוא לא "הצלחה" — במיוחד משתמש הזדהות ששרד.
      const manual = (res.manual_steps || []).length
      if (manual > 0) toast.error(L('המחיקה בוצעה חלקית — יש שלב ידני', 'Partly deleted — a manual step is required'))
      else toast.success(L('החשבון נמחק', 'The account was deleted'))
      loadConsent()
      return
    }
    toast.error(delReason(res) || L('המחיקה נכשלה', 'The deletion failed'))
  }

  const markDone = async (id) => {
    const ok = await confirmDialog({
      title: L('לסמן את בקשת המחיקה כטופלה?', 'Mark this deletion request as done?'),
      message: L('סימון הבקשה מצהיר שהמחיקה בוצעה בפועל (חשבון, שורות סגל וקבצי מדיה). '
                 + 'אם עוד לא מחקתם — השתמשו ב«מה יימחק?» ובמחיקה עצמה, ולא בסימון הזה.',
                 'Marking it states that the deletion was actually carried out (account, roster rows and media files). '
                 + 'If you have not deleted yet, use “What will be deleted?” and the deletion itself instead.'),
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

  // ----- פניות לאדמין: פתיחת לוג, סימון כטופל, והחלפת ההורה בפועל -----

  const NOT_DEPLOYED_REQS = L(
    'צריך להריץ את מיגרציית ערוץ הפניות (הקובץ החדש supabase_*.sql) ואז לרענן. עד אז אין פניות להציג, וזו לא תקלה.',
    'Run the requests-channel migration (the new supabase_*.sql file) and refresh. Until then there is nothing to show, and this is not a fault.'
  )

  const openReqLog = async (req) => {
    if (openReq === req.id) { setOpenReq(null); return }
    setOpenReq(req.id)
    setGForm(null) // טופס פתוח של פנייה אחרת לא ממשיך לרחף מעל פנייה חדשה
    await fetchLog(req.user_id, setReqLog)
  }

  const markRequestDone = async (id) => {
    const ok = await confirmDialog({
      title: L('לסמן את הפנייה כטופלה?', 'Mark this request as handled?'),
      message: L('סימון מצהיר שטיפלת בפנייה — הפונה לא מקבל הודעה אוטומטית, כדאי לעדכן אותו.',
                 'Marking states that you handled it — the person is not notified automatically, so update them.'),
      confirmText: L('סמן כטופל', 'Mark done'),
      danger: false,
    })
    if (!ok) return
    const res = await adminMarkRequestDone(id)
    if (res.ok) {
      toast.success(L('סומן כטופל', 'Marked as done'))
      setReqs(toListState(await adminRequests()))
      return
    }
    toast.error(res.notDeployed
      ? L('הפעולה עדיין לא קיימת במסד', 'This action is not deployed yet')
      : L('העדכון נכשל', 'Update failed'))
  }

  // הפעולה הרגישה ביותר במסך: היא מעבירה את הפיקוח ההורי לאדם אחר.
  // לכן אימות מחוץ למערכת לפני, ודיאלוג שאומר את זה במפורש.
  const saveGuardian = async (req) => {
    const email = (gForm?.email || '').trim()
    if (!email) { toast.error(L('צריך למלא מייל של ההורה', 'A guardian email is required')); return }
    const ok = await confirmDialog({
      title: L('להחליף את ההורה הרשום?', 'Change the registered guardian?'),
      message: L(
        `ההורה הרשום של ${req.first_name || ''} ${req.last_name || ''} יוחלף ל-${email}. מרגע זה כל הפיקוח ההורי — קישורי האישור, השינוי וביטול ההסכמה — עובר לאדם הזה. עשו זאת רק אחרי שאימתתם את הפנייה מחוץ למערכת, למשל בשיחת טלפון. ההחלטות שכבר נרשמו נשמרות ביומן ההסכמות.`,
        `The registered guardian of ${req.first_name || ''} ${req.last_name || ''} will be changed to ${email}. From now on all parental oversight — the approval, change and revocation links — moves to that person. Do this only after verifying the request out of band, for example by phone. Decisions already recorded stay in the consent log.`
      ),
      confirmText: L('החלף הורה', 'Change guardian'),
      danger: true,
    })
    if (!ok) return
    setGSaving(true)
    const res = await adminSetGuardian(req.user_id, {
      name: gForm?.name, email, phone: gForm?.phone, relation: gForm?.relation,
    })
    setGSaving(false)
    if (res.ok) {
      toast.success(L('ההורה הרשום הוחלף', 'The registered guardian was changed'))
      setGForm(null)
      await fetchLog(req.user_id, setReqLog)
      loadConsent()
      return
    }
    // ההודעות של consentRequestError כתובות בקולו של השחקן ("פנו למאמן/ת"),
    // ולכן כאן ניסוח נפרד — האדמין צריך לדעת מה לתקן, לא למי לפנות.
    toast.error(res.notDeployed
      ? L('החלפת ההורה עדיין לא קיימת במסד — צריך להריץ את המיגרציה החדשה',
          'Changing the guardian is not deployed yet — run the new migration')
      : res.reason === 'guardian_email_is_self'
        ? L('מייל ההורה זהה למייל של השחקן — אז השחקן היה מאשר לעצמו.',
            'The guardian email equals the player’s own — they would be approving for themselves.')
        : res.reason === 'not_a_player'
          ? L('החשבון הזה אינו חשבון שחקן.', 'This account is not a player account.')
          : L('החלפת ההורה נכשלה', 'Changing the guardian failed'))
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
  // כמה פניות עדיין פתוחות — נספר מהשורות שכבר נטענו, בלי קריאה נוספת
  const openReqCount = reqs.rows.filter((r) => r.status !== 'done').length

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
                      {/* שינוי ההסכמה יושב מתחת ללוג בכוונה: קודם רואים את
                          ההיסטוריה, ורק אחר כך משנים. הכפתורים מוצגים גם כשהלוג
                          ריק (הורה שטרם החליט), אבל לא כשהוא כלל לא מותקן. */}
                      {!log.notDeployed && !log.loading && !log.error && (
                        <div className="adm-set">
                          <span className="muted small">
                            {L('שינוי הסכמה בשם ההורה — רק לתיעוד פנייה ישירה שלו (טלפון או מייל):',
                               'Change a consent on the guardian’s behalf — only to record a direct request from them (phone or email):')}
                          </span>
                          {CONSENT_TYPES.map((t) => {
                            const cur = latestInLog(t)
                            return (
                              <div key={t} className="adm-set-row">
                                <span className="adm-set-label">
                                  <span className="adm-log-type">{consentLabel(t)}</span>
                                  <span className={`status-pill adm-cv cv-${cur || 'none'}`}>{consentValueLabel(cur)}</span>
                                </span>
                                <div className="admin-coach-actions">
                                  <button type="button" className="chip" disabled={cur === 'granted'}
                                    onClick={() => setConsent(m.id, t, 'granted')}>
                                    <Check size={13} /> {L('אישור', 'Grant')}
                                  </button>
                                  <button type="button" className="chip" disabled={cur === 'denied'}
                                    onClick={() => setConsent(m.id, t, 'denied')}>
                                    <X size={13} /> {L('סירוב', 'Deny')}
                                  </button>
                                  <button type="button" className="chip danger-on" disabled={cur === 'revoked'}
                                    onClick={() => setConsent(m.id, t, 'revoked')}>
                                    <Ban size={13} /> {L('ביטול', 'Revoke')}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* ----- פניות לאדמין -----
              זה הערוץ שסוגר את המבוי הסתום: קטין שההורה שלו לא זמין, מייל
              הורה שהשתנה, תאריך לידה שהוקלד הפוך. הכלים לתקן כבר היו כאן —
              מה שחסר היה הדרך של המשתמש להגיע אליהם. */}
          <h3 className="form-section-title" style={{ marginBlockStart: 22 }}>
            <Inbox size={16} /> {L('פניות לאדמין', 'Requests to the admin')}
            {openReqCount > 0 && <> (<bdi>{openReqCount}</bdi>)</>}
          </h3>
          <p className="muted small">
            {L('פניות שנשלחו מתוך האפליקציה על ידי שחקנים או הורים שנתקעו. לפני כל פעולה — אימות מחוץ למערכת, בטלפון.',
               'Requests filed from inside the app by players or parents who got stuck. Before acting — verify out of band, by phone.')}
          </p>
          <ListState
            loading={reqs.loading}
            notDeployed={reqs.notDeployed}
            error={reqs.error}
            empty={reqs.rows.length === 0}
            icon={<Inbox size={26} />}
            emptyTitle={L('אין פניות', 'No requests')}
            emptyText={L('כשמישהו יבקש עזרה מתוך האפליקציה, הפנייה תופיע כאן.',
                         'When someone asks for help from inside the app, the request shows up here.')}
            onRetry={loadConsent}
            notDeployedText={NOT_DEPLOYED_REQS}
          />
          {!reqs.loading && !reqs.notDeployed && !reqs.error && reqs.rows.length > 0 && (
            <ul className="admin-list">
              {reqs.rows.map((r) => {
                const done = r.status === 'done'
                const st = r.approval_status
                const editing = gForm?.reqId === r.id
                return (
                  <li key={r.id} className={`admin-report adm-minor status-${done ? 'resolved' : 'open'}`}>
                    <div className="adm-minor-main">
                      <strong>{r.first_name} {r.last_name}</strong>
                      <span className="adm-log-type">{adminRequestKindLabel(r.kind)}</span>
                      {r.message && <span className="muted small">{r.message}</span>}
                      <span className="muted small" dir="ltr">{r.guardian_email || '—'}</span>
                      <span className="admin-report-meta">
                        <span className={`status-pill admin-status st-${st === 'suspended' ? 'open' : st === 'pending_parent' ? 'pending' : 'resolved'}`}>
                          {st === 'suspended'
                            ? L('מושעה', 'Suspended')
                            : st === 'pending_parent'
                              ? L('ממתין להורה', 'Awaiting parent')
                              : L('פעיל', 'Active')}
                        </span>
                        <span className={`status-pill admin-status st-${done ? 'resolved' : 'open'}`}>
                          {done ? L('טופל', 'Done') : L('פתוח', 'Open')}
                        </span>
                        <span className="muted small" dir="ltr">{(r.created_at || '').replace('T', ' ').slice(0, 16)}</span>
                      </span>
                    </div>
                    <div className="admin-report-actions">
                      <button type="button" className="chip" onClick={() => openReqLog(r)} aria-expanded={openReq === r.id}>
                        <FileText size={13} /> {openReq === r.id ? L('סגירת הפרטים', 'Hide details') : L('פתיחה וטיפול', 'Open and handle')}
                      </button>
                      {!done && (
                        <button type="button" className="chip" onClick={() => markRequestDone(r.id)}>
                          <Check size={13} /> {L('סמן כטופל', 'Mark done')}
                        </button>
                      )}
                    </div>

                    {openReq === r.id && (
                      <div className="adm-log">
                        {/* קודם ההיסטוריה, אחר כך הפעולה — אותו סדר כמו אצל
                            הקטינים הממתינים, כדי שאף אחד לא יחליף הורה בלי
                            לראות מה כבר הוכרע בשמו. */}
                        <ListState
                          loading={reqLog.loading}
                          notDeployed={reqLog.notDeployed}
                          error={reqLog.error}
                          empty={reqLog.rows.length === 0}
                          icon={<FileText size={26} />}
                          emptyTitle={L('אין עדיין רשומות הסכמה', 'No consent records yet')}
                          emptyText={L('לא נרשמה שום הכרעה של הורה בחשבון הזה.', 'No guardian decision was ever recorded on this account.')}
                          onRetry={() => fetchLog(r.user_id, setReqLog)}
                        />
                        {!reqLog.loading && !reqLog.notDeployed && !reqLog.error && reqLog.rows.length > 0 && (
                          <ul className="adm-log-list">
                            {reqLog.rows.map((row, i) => (
                              <li key={row.id || i}>
                                <span className="adm-log-type">{consentLabel(row.consent_type || row.type)}</span>
                                <span className={`status-pill adm-cv cv-${row.value}`}>{consentValueLabel(row.value)}</span>
                                <span className="muted small" dir="ltr">{(row.created_at || '').replace('T', ' ').slice(0, 16)}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="adm-set">
                          <span className="muted small">
                            {L('החלפת ההורה הרשום מעבירה את הפיקוח ההורי לאדם אחר — קישורי האישור, השינוי והביטול יגיעו אליו מעתה. רק אחרי אימות טלפוני.',
                               'Changing the registered guardian moves parental oversight to a different person — the approval, change and revocation links will reach them from now on. Only after verifying by phone.')}
                          </span>
                          {!editing ? (
                            <div className="admin-coach-actions">
                              <button
                                type="button"
                                className="chip"
                                onClick={() => setGForm({
                                  reqId: r.id, name: r.guardian_name || '', email: '', phone: '', relation: 'parent',
                                })}
                              >
                                <UserCog size={13} /> {L('החלפת ההורה הרשום', 'Change the registered guardian')}
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="form-grid-2">
                                <label className="pf-label">
                                  {L('שם ההורה החדש', 'New guardian name')}
                                  <input
                                    type="text" value={gForm.name}
                                    onChange={(e) => setGForm({ ...gForm, name: e.target.value })}
                                    placeholder={L('שם מלא', 'Full name')}
                                  />
                                </label>
                                <label className="pf-label">
                                  {L('מייל ההורה החדש', 'New guardian email')}
                                  <input
                                    type="email" dir="ltr" required value={gForm.email}
                                    onChange={(e) => setGForm({ ...gForm, email: e.target.value })}
                                    placeholder="parent@example.com"
                                  />
                                </label>
                                <label className="pf-label">
                                  {L('טלפון ההורה', 'Guardian phone')}
                                  <input
                                    type="tel" dir="ltr" maxLength={20} value={gForm.phone}
                                    onChange={(e) => setGForm({ ...gForm, phone: e.target.value })}
                                    placeholder="050-0000000"
                                  />
                                </label>
                                <label className="pf-label">
                                  {L('הקרבה לשחקן', 'Relation to the player')}
                                  <select value={gForm.relation} onChange={(e) => setGForm({ ...gForm, relation: e.target.value })}>
                                    {RELATIONS.map((rel) => (
                                      <option key={rel.value} value={rel.value}>{rel.label()}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <div className="admin-coach-actions">
                                <button
                                  type="button" className="chip danger-on"
                                  disabled={gSaving || !gForm.email.trim()}
                                  onClick={() => saveGuardian(r)}
                                >
                                  <UserCog size={13} /> {gSaving ? L('מחליף...', 'Changing...') : L('החלף הורה', 'Change guardian')}
                                </button>
                                <button type="button" className="chip" disabled={gSaving} onClick={() => setGForm(null)}>
                                  <X size={13} /> {L('ביטול', 'Cancel')}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {/* ----- בקשות מחיקת חשבון ----- */}
          <h3 className="form-section-title" style={{ marginTop: 22 }}>
            <Trash2 size={16} /> {L('בקשות מחיקת חשבון', 'Account deletion requests')}
          </h3>
          <p className="muted small">
            {L('מדיניות הפרטיות מבטיחה מחיקה תוך 30 יום. «מה יימחק?» מפיק דוח מלא בלי לגעת בכלום, '
               + 'ורק אחריו נפתחת המחיקה עצמה.',
               'The privacy policy promises deletion within 30 days. “What will be deleted?” produces a full report '
               + 'without touching anything, and only then does the deletion itself unlock.')}
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
