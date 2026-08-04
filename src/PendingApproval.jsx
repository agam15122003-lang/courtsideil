import { useState } from 'react'
import {
  ShieldAlert, Clock, Mail, MessageCircle, Copy, RefreshCw, Pencil, LogOut, UserCheck,
  LifeBuoy, Send, Check,
} from 'lucide-react'
import Logo from './Logo'
import { L } from './i18n'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { waShare, copyText } from './share'
import { createConsentRequest, consentShareText, consentRequestError, confirmAdult } from './consent'
// ערוץ הפנייה לאדמין נולד בגל הזה בקובץ אחר. ייבוא-namespace ולא ייבוא בשם:
// ייצוא בשם שעדיין לא נחת מפיל את ה-build כולו, ואילו consentApi.x?.() פשוט
// לא קיים לרגע — והמסך ממשיך לעבוד בדיוק כמו אתמול.
import * as consentApi from './consent'

// שליחת קישור האישור להורה. הלוגיקה יושבת כאן ולא בתוך הקומפוננטה כי גם
// מסך הנעילה, גם הבאנר המצומצם וגם ההסברים שליד פעולה חסומה בדשבורד
// שולחים את אותו קישור — וחייבים להגיב בדיוק אותו דבר לכל תשובה של השרת.
// מחזירה { link, sentTo } כשיש מה להציג, ו-null כשאין (או שנכשל).
export async function sendParentLink(profile, onRecheck) {
  const guardianEmail = (profile?.guardian_email || '').trim()
  if (!guardianEmail) {
    toast.error(L('אין מייל של הורה בפרופיל — צריך להוסיף אותו קודם', 'No parent email on the profile — add one first'))
    return null
  }
  const res = await createConsentRequest({
    name: (profile?.guardian_name || '').trim(),
    email: guardianEmail,
    phone: profile?.guardian_phone || '',
    relation: profile?.guardian_relation || '',
    purpose: 'initial',
  })
  // link = הקטין משתף ידנית · sent_to = השרת שלח למייל ההורה (בלי טוקן ללקוח)
  if (res.ok && (res.link || res.sent_to)) {
    toast.success(res.link
      ? L('נוצר קישור חדש להורה', 'A new parent link was created')
      : L('שלחנו קישור אישור למייל של ההורה', 'We emailed an approval link to your parent'))
    return { link: res.link || '', sentTo: res.sent_to || '' }
  }
  // הצלחה בלי קישור ובלי כתובת — אין מה להציג, וגם אין כאן כישלון
  if (res.ok) {
    toast.success(L('הבקשה נשלחה', 'The request was sent'))
    return { link: '', sentTo: '' }
  }
  if (res.notDeployed) {
    toast.error(L('מנגנון האישור עדיין לא פעיל בשרת — פנו למאמן', 'The approval mechanism is not live yet — contact your coach'))
    return null
  }
  if (res.reason === 'already_consented') {
    // ההורה אישר בינתיים והשרת דחה בקשה מיותרת — בשורה טובה, לא תקלה
    toast.success(L('ההורה כבר אישר — מרעננים את הסטטוס', 'Your parent already approved — refreshing your status'))
    await onRecheck?.()
    return null
  }
  toast.error(consentRequestError(res.reason))
  return null
}

// המסך המלא שרואה קטין בזמן שהחשבון ממתין לאישור הורה (או מושעה).
// props:
//   profile       - שורת הפרופיל (למייל ההורה ולשם)
//   status        - 'pending_parent' | 'suspended'
//   canSelfConfirm- השחקן כבר בגיר וממתין לאישור הורה: מציעים לו לאשר בעצמו
//   onEditProfile - פותח את טופס הפרופיל (להחלפת מייל ההורה)
//   onRecheck     - טוען מחדש את הפרופיל
export default function PendingApproval({
  profile, status = 'pending_parent', canSelfConfirm = false, onEditProfile, onRecheck,
}) {
  const [sending, setSending] = useState(false)
  const [link, setLink] = useState('')
  // הקישור נשלח בצד שרת למייל ההורה — מוחזרת רק כתובת ממוסכת, בלי טוקן
  const [sentTo, setSentTo] = useState('')
  const [checking, setChecking] = useState(false)
  const [agree, setAgree] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // confirm_adult() עוד לא קיימת בשרת — חוזרים להציע את מסלול ההורה, אחרת
  // הבגיר נשאר בלי שום פעולה אפשרית במסך
  const [selfBlocked, setSelfBlocked] = useState(false)
  const suspended = status === 'suspended'
  const showSelf = canSelfConfirm && !suspended && !selfBlocked

  const guardianEmail = (profile?.guardian_email || '').trim()
  const guardianName = (profile?.guardian_name || '').trim()
  const minorName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()

  const resend = async () => {
    setSending(true)
    const out = await sendParentLink(profile, onRecheck)
    setSending(false)
    if (out) { setLink(out.link); setSentTo(out.sentTo) }
  }

  const recheck = async () => {
    setChecking(true)
    await onRecheck?.()
    setChecking(false)
  }

  // בגיר שנתקע בהמתנה לאישור הורה — משחרר את עצמו. אותה ראיית הסכמה
  // שה-confirm_adult רושמת דורשת שהוא יאשר כאן תנאים ופרטיות במפורש.
  const selfConfirm = async () => {
    if (!agree) return
    setConfirming(true)
    const res = await confirmAdult()
    setConfirming(false)
    if (res.ok) {
      toast.success(L('תודה — החשבון עודכן לחשבון בוגר ונפתח', 'Thanks — your account is now an adult account and it is open'))
      await onRecheck?.() // approval_status חזר ל-'active', והשער בדשבורד נפתח
      return
    }
    if (res.notDeployed) {
      setSelfBlocked(true)
      toast.error(L('המנגנון עדיין לא פעיל בשרת — פנו למאמן', 'This is not live on the server yet — contact your coach'))
      return
    }
    toast.error(res.reason === 'not_adult'
      ? L('לפי תאריך הלידה שבפרופיל עוד לא מלאו 18. אפשר לתקן אותו ב«שינוי הפרטים».',
          'By the birth date on your profile you are not 18 yet. You can fix it under “Change details”.')
      : L('העדכון נכשל — נסו שוב', 'Update failed — please try again'))
  }

  const signOut = async () => { await supabase.auth.signOut() }

  return (
    <div className="pend-page">
      <header className="pend-head">
        <Logo size={30} />
        <span className="pend-brand">CourtSide</span>
      </header>

      <main className="pend-card">
        <span className={suspended ? 'pend-ic danger' : 'pend-ic'}>
          {suspended ? <ShieldAlert size={28} /> : showSelf ? <UserCheck size={28} /> : <Clock size={28} />}
        </span>

        <h1 className="pend-title">
          {suspended
            ? L('החשבון מושעה', 'The account is suspended')
            : showSelf
            ? L('כבר מלאו לך 18', 'You are already 18')
            : L('ממתינים לאישור של ההורה', "Waiting for your parent's approval")}
        </h1>

        <p className="pend-lead">
          {suspended
            ? L('ההורה או האחראי ביטל את ההסכמה, ולכן החשבון מושעה כרגע. אפשר לשלוח קישור חדש כדי לבקש אישור מחדש — עד אז אין גישה לקבוצה ולאימונים.',
                'Your parent or guardian revoked the consent, so the account is suspended. You can send a new link to ask for approval again — until then there is no access to the team or practices.')
            : showSelf
            ? L('פתחת את החשבון כשהיית קטין, ולכן הוא חיכה לאישור של הורה. לפי תאריך הלידה שבפרופיל כבר מלאו לך 18 — האישור הוא שלך עכשיו, ואפשר לפתוח את החשבון כאן ומיד. פרטי ההורה יימחקו מהחשבון.',
                'You opened the account as a minor, so it waited for a parent to approve it. By the birth date on your profile you are already 18 — the approval is yours now, and you can open the account right here. Your parent’s details will be removed from the account.')
            : L('פתחתם חשבון שחקן, ולפי החוק צריך אישור של הורה או אחראי לפני שהוא מופעל. שלחנו לכם קישור אישי לשלוח להורה — ברגע שההורה מאשר, החשבון נפתח אוטומטית.',
                'You opened a player account, and by law a parent or guardian must approve it before it is activated. Send them the personal link below — the moment they approve, the account opens automatically.')}
        </p>

        {showSelf && (
          <div className="pend-row">
            <UserCheck size={16} aria-hidden="true" />
            <span className="pend-row-body">
              <strong>{L('אישור עצמי ופתיחת החשבון', 'Confirm yourself and open the account')}</strong>
              <label className="adc-check" style={{ marginBlockStart: 'var(--space-3)' }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>
                  {L('קראתי ואני מסכים/ה ל', 'I have read and I agree to the ')}
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer">{L('תנאי השימוש', 'terms of use')}</a>
                  {L(' ול', ' and the ')}
                  <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות הפרטיות', 'privacy policy')}</a>
                  {L('.', '.')}
                </span>
              </label>
              <button
                type="button"
                className="btn-primary"
                style={{ marginBlockStart: 'var(--space-3)', justifyContent: 'center' }}
                onClick={selfConfirm}
                disabled={!agree || confirming}
                aria-busy={confirming}
              >
                {confirming && <span className="btn-spinner" aria-hidden="true" />}
                <UserCheck size={16} /> {L('כבר מלאו לי 18 — פתחו את החשבון', "I'm already 18 — open my account")}
              </button>
              <span className="muted small" style={{ marginBlockStart: 'var(--space-2)' }}>
                {L('לא נכון? אפשר לתקן את תאריך הלידה ב«שינוי הפרטים» למטה.',
                   'Not right? You can fix your birth date under “Change details” below.')}
              </span>
            </span>
          </div>
        )}

        {/* מסלול ההורה נעלם כשהשחקן כבר בגיר: create_consent_request עוד
            תייצר לו קישור, אבל אין לו למי לשלוח אותו. */}
        {!showSelf && (
          <>
            <div className="pend-row">
              <Mail size={16} aria-hidden="true" />
              <span className="pend-row-body">
                <span className="muted small">{L('המייל של ההורה שרשום אצלנו', 'The parent email we have on record')}</span>
                <strong dir="ltr">{guardianEmail || L('לא הוזן', 'Not provided')}</strong>
                {guardianName && <span className="muted small">{guardianName}</span>}
              </span>
            </div>

            <ol className="pend-steps">
              <li>
                {sentTo
                  ? L('ההורה מקבל מאיתנו מייל עם קישור אישי.', 'Your parent gets an email from us with a personal link.')
                  : L('שולחים להורה את הקישור (וואטסאפ או העתקה).', 'Send your parent the link (WhatsApp or copy).')}
              </li>
              <li>{L('ההורה קורא את הטופס ומסמן מה מאושר.', 'They read the form and tick what they approve.')}</li>
              <li>{L('לוחצים כאן על «בדיקת סטטוס» והחשבון נפתח.', 'Tap “Check status” here and the account opens.')}</li>
            </ol>

            {(link || sentTo) && (
              <div className="pend-link-box">
                <span className="muted small">
                  {sentTo ? L('שלחנו קישור אישור אל:', 'We sent an approval link to:') : L('הקישור להורה:', 'The parent link:')}
                </span>
                <code className="pend-link" dir="ltr">{sentTo || link}</code>
              </div>
            )}

            <div className="pend-actions">
              <button type="button" className="btn-primary" onClick={resend} disabled={sending} aria-busy={sending}>
                {sending && <span className="btn-spinner" aria-hidden="true" />}
                <RefreshCw size={16} /> {(link || sentTo)
                  ? L('שליחה מחדש', 'Send again')
                  : L('שליחת הקישור להורה', 'Send the link to my parent')}
              </button>
              {/* כפתורי השיתוף רק כשהטוקן באמת ביד הקטין; במסירה בצד שרת
                  אין מה להעתיק ואין מה לשלוח. */}
              {link && (
                <>
                  <button type="button" className="btn-soft" onClick={() => waShare(consentShareText(minorName, link))}>
                    <MessageCircle size={16} /> {L('שליחה בוואטסאפ', 'Send on WhatsApp')}
                  </button>
                  <button type="button" className="btn-soft" onClick={() => copyText(link, L('הקישור הועתק', 'Link copied'))}>
                    <Copy size={16} /> {L('העתקת הקישור', 'Copy link')}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        <div className="pend-actions secondary">
          <button type="button" className="btn-soft" onClick={recheck} disabled={checking} aria-busy={checking}>
            <RefreshCw size={16} className={checking ? 'spin' : ''} /> {L('בדיקת סטטוס', 'Check status')}
          </button>
          <button type="button" className="btn-soft" onClick={() => onEditProfile?.()}>
            <Pencil size={16} />{' '}
            {showSelf
              ? L('שינוי הפרטים שלי', 'Change my details')
              : L('שינוי הפרטים של ההורה', "Change my parent's details")}
          </button>
          <button type="button" className="btn-ghost" onClick={signOut}>
            <LogOut size={16} /> {L('התנתקות', 'Sign out')}
          </button>
        </div>

        <p className="muted small pend-foot">
          {L('שאלות? אפשר לפנות למאמן/ת של הקבוצה, או לקרוא את ', 'Questions? Talk to your team coach, or read the ')}
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות הפרטיות', 'privacy policy')}</a>
          {L('.', '.')}
        </p>

        <AdminRequestPanel />
      </main>
    </div>
  )
}

// ---------- פנייה לאדמין ----------
// המבוי הסתום שזה פותח: מייל הורה שכבר לא בשימוש, הורים פרודים שהקישור הלך
// לצד הלא-נכון, תאריך לידה שהוקלד הפוך. לאדמין יש כלים לתקן את כל אלה —
// מה שחסר היה *הדרך להגיע אליו* מתוך האפליקציה. הטבלה מוחרגת בכוונה משער
// הכתיבה בשרת, ולכן גם חשבון תקוע יכול לשלוח כאן.
export function AdminRequestPanel({ compact = false }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('guardian_change')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  // כל מה שמגיע מ-consent.js נקרא הגנתית: הייצוא נוחת בגל הזה, ואם הוא
  // מאחר בדקה — המסך עדיין נטען, רק בלי הפאנל.
  const kinds = consentApi.ADMIN_REQUEST_KINDS
  const maxLen = consentApi.ADMIN_REQUEST_MAX || 1000
  const kindLabel = (k) => consentApi.adminRequestKindLabel?.(k) || k
  const kindHelp = (k) => consentApi.adminRequestKindHelp?.(k) || ''
  if (!Array.isArray(kinds) || !consentApi.fileAdminRequest) return null

  const send = async () => {
    setSending(true)
    const res = await consentApi.fileAdminRequest({ kind, message })
    setSending(false)
    if (res.ok) {
      setSent(true)
      setMessage('')
      toast.success(L('הפנייה נשלחה — נחזור אליכם', 'Your request was sent — we will get back to you'))
      return
    }
    if (res.notDeployed) {
      toast.error(L('ערוץ הפניות עדיין לא פעיל בשרת — פנו למאמן/ת', 'The request channel is not live yet — talk to your coach'))
      return
    }
    toast.error(L('השליחה נכשלה — נסו שוב', 'Sending failed — please try again'))
  }

  return (
    <div className={compact ? 'adq adq-compact' : 'adq'}>
      <button
        type="button"
        className="adq-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <LifeBuoy size={15} aria-hidden="true" />
        {L('משהו תקוע? שלחו פנייה למנהל המערכת', 'Stuck? Send a request to the administrator')}
      </button>

      {open && (
        sent ? (
          <div className="adq-sent" role="status">
            <Check size={16} aria-hidden="true" />
            <span>
              {L('הפנייה אצלנו. נחזור אליכם למייל של החשבון.', 'We have your request. We will reply to your account email.')}
            </span>
            <button type="button" className="btn-ghost adq-again" onClick={() => setSent(false)}>
              {L('שליחת פנייה נוספת', 'Send another request')}
            </button>
          </div>
        ) : (
          <div className="adq-form">
            <span className="adq-legend">{L('מה תקוע?', 'What is stuck?')}</span>
            <div className="adq-kinds" role="radiogroup" aria-label={L('סוג הפנייה', 'Request type')}>
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  className={kind === k ? 'adq-kind on' : 'adq-kind'}
                  onClick={() => setKind(k)}
                >
                  {kindLabel(k)}
                </button>
              ))}
            </div>
            {kindHelp(kind) && <p className="muted small adq-help">{kindHelp(kind)}</p>}

            <label className="adq-label" htmlFor="adq-msg">
              {L('בכמה מילים — מה קרה?', 'In a few words — what happened?')}
            </label>
            <textarea
              id="adq-msg"
              className="adq-text"
              rows={3}
              maxLength={maxLen}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={L('למשל: המייל של אמא השתנה ולא הגיע אליה הקישור', 'For example: my mum changed her email and never got the link')}
            />
            <div className="adq-foot">
              <span className="muted small" aria-hidden="true">
                <bdi dir="ltr">{message.length}/{maxLen}</bdi>
              </span>
              <button type="button" className="btn-primary adq-send" onClick={send} disabled={sending} aria-busy={sending}>
                {sending && <span className="btn-spinner" aria-hidden="true" />}
                <Send size={15} /> {L('שליחת הפנייה', 'Send the request')}
              </button>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ---------- הבאנר של המצב המוגבל ----------
// הווריאנט המצומצם של המסך שלמעלה, לקטין שההורה שלו עוד לא ענה. החלטת
// הבעלים: החשבון *לא* ננעל — השחקן מסתובב באפליקציה ובעיקר מצטרף לקבוצה
// עם קוד, כי המאמן הוא שומר הסף האנושי. הבאנר קבוע בכל מסך אבל לא עוין:
// משפט אחד על מה מחכה, המייל של ההורה, כפתור לשלוח, ודרך לפנות לאדמין.
export function PendingBanner({ profile, canSelfConfirm = false, onEditProfile, onRecheck }) {
  const [sending, setSending] = useState(false)
  const [link, setLink] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [checking, setChecking] = useState(false)
  const [more, setMore] = useState(false)
  const [agree, setAgree] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [selfBlocked, setSelfBlocked] = useState(false)

  const guardianEmail = (profile?.guardian_email || '').trim()
  const guardianName = (profile?.guardian_name || '').trim()
  const minorName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
  const showSelf = canSelfConfirm && !selfBlocked

  const resend = async () => {
    setSending(true)
    const out = await sendParentLink(profile, onRecheck)
    setSending(false)
    if (out) { setLink(out.link); setSentTo(out.sentTo) }
  }

  const recheck = async () => {
    setChecking(true)
    await onRecheck?.()
    setChecking(false)
  }

  // אותו מסלול בדיוק כמו במסך המלא — שחקן שהגיע ל-18 בזמן ההמתנה משחרר
  // את עצמו, בכפוף לאישור מפורש של התנאים והפרטיות.
  const selfConfirm = async () => {
    if (!agree) return
    setConfirming(true)
    const res = await confirmAdult()
    setConfirming(false)
    if (res.ok) {
      toast.success(L('תודה — החשבון עודכן לחשבון בוגר ונפתח', 'Thanks — your account is now an adult account and it is open'))
      await onRecheck?.()
      return
    }
    if (res.notDeployed) {
      setSelfBlocked(true)
      toast.error(L('המנגנון עדיין לא פעיל בשרת — פנו למאמן', 'This is not live on the server yet — contact your coach'))
      return
    }
    toast.error(res.reason === 'not_adult'
      ? L('לפי תאריך הלידה שבפרופיל עוד לא מלאו 18. אפשר לתקן אותו ב«עריכת פרטים».',
          'By the birth date on your profile you are not 18 yet. You can fix it under “Edit details”.')
      : L('העדכון נכשל — נסו שוב', 'Update failed — please try again'))
  }

  return (
    <section className="pbn" role="status">
      <span className="pbn-ic" aria-hidden="true"><Clock size={18} /></span>
      <div className="pbn-body">
        <strong className="pbn-title">
          {L('החשבון שלך פתוח — מחכים רק לאישור של ההורה',
             'Your account is open — we are only waiting for your parent')}
        </strong>
        <p className="pbn-lead">
          {L('אפשר להסתובב באפליקציה, לתקן את הפרטים ולהצטרף לקבוצה עם קוד מהמאמן. עד שההורה יאשר אי אפשר להעלות תמונות, לכתוב בקהילה ובצ׳אטים או לשלוח הודעות.',
             'You can look around, fix your details and join a team with a code from your coach. Until your parent approves, you cannot upload photos, post in the community or the chats, or send messages.')}
        </p>

        <span className="pbn-mail">
          <Mail size={14} aria-hidden="true" />
          <span className="muted small">{L('המייל של ההורה שרשום אצלנו:', 'The parent email we have on record:')}</span>
          <strong dir="ltr">{guardianEmail || L('לא הוזן', 'Not provided')}</strong>
          {guardianName && <span className="muted small">{guardianName}</span>}
        </span>

        <div className="pbn-actions">
          <button type="button" className="btn-primary" onClick={resend} disabled={sending} aria-busy={sending}>
            {sending && <span className="btn-spinner" aria-hidden="true" />}
            <RefreshCw size={15} /> {(link || sentTo)
              ? L('שליחה מחדש להורה', 'Send to my parent again')
              : L('שליחת הקישור להורה', 'Send the link to my parent')}
          </button>
          <button type="button" className="btn-soft" onClick={recheck} disabled={checking} aria-busy={checking}>
            <RefreshCw size={15} className={checking ? 'spin' : ''} /> {L('בדיקת סטטוס', 'Check status')}
          </button>
          <button type="button" className="btn-ghost pbn-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            {more ? L('פחות', 'Less') : L('עוד אפשרויות', 'More options')}
          </button>
        </div>

        {(link || sentTo) && (
          <div className="pbn-link-box">
            <span className="muted small">
              {sentTo ? L('שלחנו קישור אישור אל:', 'We sent an approval link to:') : L('הקישור להורה:', 'The parent link:')}
            </span>
            <code className="pbn-link" dir="ltr">{sentTo || link}</code>
            {/* כפתורי השיתוף רק כשהטוקן באמת ביד הקטין; במסירה בצד שרת
                אין מה להעתיק ואין מה לשלוח. */}
            {link && (
              <div className="pbn-actions">
                <button type="button" className="btn-soft" onClick={() => waShare(consentShareText(minorName, link))}>
                  <MessageCircle size={15} /> {L('שליחה בוואטסאפ', 'Send on WhatsApp')}
                </button>
                <button type="button" className="btn-soft" onClick={() => copyText(link, L('הקישור הועתק', 'Link copied'))}>
                  <Copy size={15} /> {L('העתקת הקישור', 'Copy link')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* בגיר שנתקע בהמתנה — הפעולה שמשחררת אותו לא נחבאת מאחורי «עוד» */}
        {showSelf && (
          <div className="pbn-self">
            <UserCheck size={15} aria-hidden="true" />
            <div className="pbn-self-body">
              <strong>{L('כבר מלאו לך 18?', 'Already 18?')}</strong>
              <span className="muted small">
                {L('האישור הוא שלך עכשיו — אפשר לפתוח את החשבון כאן. פרטי ההורה יימחקו מהחשבון.',
                   'The approval is yours now — you can open the account right here. Your parent’s details will be removed from the account.')}
              </span>
              <label className="adc-check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>
                  {L('קראתי ואני מסכים/ה ל', 'I have read and I agree to the ')}
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer">{L('תנאי השימוש', 'terms of use')}</a>
                  {L(' ול', ' and the ')}
                  <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות הפרטיות', 'privacy policy')}</a>
                  {L('.', '.')}
                </span>
              </label>
              <button type="button" className="btn-primary" onClick={selfConfirm} disabled={!agree || confirming} aria-busy={confirming}>
                {confirming && <span className="btn-spinner" aria-hidden="true" />}
                <UserCheck size={15} /> {L('פתחו לי את החשבון', 'Open my account')}
              </button>
            </div>
          </div>
        )}

        {more && (
          <div className="pbn-more-box">
            {onEditProfile && (
              <button type="button" className="btn-soft" onClick={() => onEditProfile()}>
                <Pencil size={15} /> {L('שינוי הפרטים של ההורה', "Change my parent's details")}
              </button>
            )}
            <AdminRequestPanel compact />
            <p className="muted small pbn-foot">
              {L('אפשר גם לשאול את המאמן/ת של הקבוצה, או לקרוא את ', 'You can also ask your team coach, or read the ')}
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות הפרטיות', 'privacy policy')}</a>
              {L('.', '.')}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
