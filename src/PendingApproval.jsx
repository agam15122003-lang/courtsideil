import { useState } from 'react'
import {
  ShieldAlert, Clock, Mail, MessageCircle, Copy, RefreshCw, Pencil, LogOut, UserCheck,
} from 'lucide-react'
import Logo from './Logo'
import { L } from './i18n'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { waShare, copyText } from './share'
import { createConsentRequest, consentShareText, consentRequestError, confirmAdult } from './consent'

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
    if (!guardianEmail) {
      toast.error(L('אין מייל של הורה בפרופיל — צריך להוסיף אותו קודם', 'No parent email on the profile — add one first'))
      return
    }
    setSending(true)
    const res = await createConsentRequest({
      name: guardianName,
      email: guardianEmail,
      phone: profile?.guardian_phone || '',
      relation: profile?.guardian_relation || '',
      purpose: 'initial',
    })
    setSending(false)
    // link = הקטין משתף ידנית · sent_to = השרת שלח למייל ההורה (בלי טוקן ללקוח)
    if (res.ok && (res.link || res.sent_to)) {
      setLink(res.link || '')
      setSentTo(res.sent_to || '')
      toast.success(res.link
        ? L('נוצר קישור חדש להורה', 'A new parent link was created')
        : L('שלחנו קישור אישור למייל של ההורה', "We emailed an approval link to your parent"))
    } else if (res.ok) {
      // הצלחה בלי קישור ובלי כתובת — אין מה להציג, וגם אין כאן כישלון
      toast.success(L('הבקשה נשלחה', 'The request was sent'))
    } else if (res.notDeployed) {
      toast.error(L('מנגנון האישור עדיין לא פעיל בשרת — פנו למאמן', 'The approval mechanism is not live yet — contact your coach'))
    } else if (res.reason === 'already_consented') {
      // ההורה אישר בינתיים והשרת דחה בקשה מיותרת — בשורה טובה, לא תקלה
      toast.success(L('ההורה כבר אישר — מרעננים את הסטטוס', 'Your parent already approved — refreshing your status'))
      await onRecheck?.()
    } else {
      toast.error(consentRequestError(res.reason))
    }
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
      </main>
    </div>
  )
}
