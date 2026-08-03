import { useState, useEffect, createElement, Fragment } from 'react'
import {
  ShieldCheck, Check, X, Clock, Link2, Copy, MessageCircle,
  AlertTriangle, RefreshCw, FileText,
} from 'lucide-react'
import Logo from './Logo'
import { L } from './i18n'
import { toast } from './toast'
import { waShare, copyText } from './share'
import { confirmDialog } from './confirm'
import {
  getConsentRequest, submitParentConsent,
  CONSENT_TYPES, consentLabel, consentHelp, consentValueLabel,
} from './consent'

// ===== מסך ההורה =====
// עמוד עצמאי לחלוטין: ההורה מגיע מקישור בוואטסאפ, בלי חשבון ובלי התחברות.
// שני מצבים: purpose='initial' (אישור ראשוני) ו-purpose='manage' (פיקוח מתמשך).

// ---- רינדור בטוח של המסמך המשפטי ----
// ה-HTML מגיע מ-consent_documents ונכתב בשרת, אבל אנחנו לא מכניסים אותו
// ל-dangerouslySetInnerHTML: בקוד הזה אין ולו sink אחד כזה, וה-CSP אוסר סקריפט
// inline — שומרים על השורה הנקייה. במקום זה מפרקים ל-DOM ומרנדרים רק מה שמותר.
const ALLOWED_TAGS = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br']
// תגים שנזרקים על התוכן שלהם — אין שום סיבה שיגיעו ממסמך משפטי
const DROP_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'link', 'meta', 'form', 'input', 'img']

function renderNodes(nodes, keyPrefix) {
  const out = []
  nodes.forEach((node, i) => {
    const key = `${keyPrefix}.${i}`
    if (node.nodeType === 3) {
      if (node.nodeValue) out.push(node.nodeValue)
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.tagName.toLowerCase()
    if (DROP_TAGS.includes(tag)) return
    if (tag === 'br') { out.push(<br key={key} />); return }
    const kids = renderNodes(Array.from(node.childNodes), key)
    if (!ALLOWED_TAGS.includes(tag)) {
      // תג לא מוכר (div/span/a): מוותרים על התג ושומרים את הטקסט שבתוכו,
      // כדי שעטיפה טכנית לא תמחק חצי ממסמך משפטי. שום מאפיין לא מועתק.
      out.push(<Fragment key={key}>{kids}</Fragment>)
      return
    }
    out.push(createElement(tag, { key }, kids))
  })
  return out
}

function SafeDoc({ html }) {
  if (!html) return null
  let body
  try {
    body = new DOMParser().parseFromString(String(html), 'text/html').body
  } catch {
    return <p>{String(html).replace(/<[^>]*>/g, ' ')}</p>
  }
  return <>{renderNodes(Array.from(body.childNodes), 'd')}</>
}

// ---- מסך מצב (לא נמצא / פג / נוצל) — כל אחד עם המשך ברור, בלי מבוי סתום ----
function DeadEnd({ icon, title, text, onRetry }) {
  return (
    <div className="pc-state" role="alert">
      <span className="pc-state-ic">{icon}</span>
      <h2 className="pc-state-title">{title}</h2>
      <p className="pc-state-text">{text}</p>
      <div className="pc-actions">
        {onRetry && (
          <button type="button" className="btn-soft" onClick={onRetry}>
            <RefreshCw size={16} /> {L('בדיקה שוב', 'Check again')}
          </button>
        )}
        <a className="btn-primary" href="/">{L('לעמוד הבית של CourtSide', 'Go to the CourtSide home page')}</a>
      </div>
    </div>
  )
}

export default function ParentConsent({ token }) {
  const [loading, setLoading] = useState(true)
  const [req, setReq] = useState(null)
  const [failure, setFailure] = useState(null) // 'not_found' | 'expired' | 'used' | 'not_deployed' | 'error'
  const [checks, setChecks] = useState({ basic: false, media_team: false, media_public: false, marketing: false })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null) // { state, manage_token, manageLink }

  async function load() {
    setLoading(true)
    setFailure(null)
    const res = await getConsentRequest(token)
    if (res.ok) {
      setReq(res)
      // במצב פיקוח מתחילים מהמצב הקיים; באישור ראשוני הכל כבוי מלבד מה שההורה
      // יסמן עכשיו. עד היום הקוד סתר את ההערה הזו וסימן גם בקישור initial לפי
      // ה-state הישן — כלומר הציג להורה החלטות שהוא לא קיבל במסך הזה.
      const st = (res.purpose === 'manage' && res.state) || {}
      setChecks({
        basic: st.basic === 'granted',
        media_team: st.media_team === 'granted',
        media_public: st.media_public === 'granted',
        marketing: st.marketing === 'granted',
      })
    } else {
      setFailure(res.notDeployed ? 'not_deployed' : res.reason || 'error')
    }
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token])

  const isManage = req?.purpose === 'manage'

  const toggle = async (type, next) => {
    // ביטול ההסכמה הבסיסית = השעיית החשבון של הילד. אישור קשיח לפני.
    if (type === 'basic' && !next && isManage && (req?.state?.basic === 'granted')) {
      const ok = await confirmDialog({
        title: L('לבטל את ההסכמה הבסיסית?', 'Revoke the basic consent?'),
        message: L(
          'ביטול ההסכמה הבסיסית משעה את חשבון השחקן: הילד/ה לא יוכל/תוכל להיכנס לקבוצה, לראות אימונים או לתקשר עם המאמן, עד שתאשרו מחדש.',
          'Revoking the basic consent suspends the player account: the child will not be able to access the team, see practices or talk to the coach, until you approve again.'
        ),
        confirmText: L('כן, בטלו את ההסכמה', 'Yes, revoke it'),
        danger: true,
      })
      if (!ok) return
    }
    setChecks((c) => ({ ...c, [type]: next }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!checks.basic && !isManage) return
    setSaving(true)
    const decisions = {}
    for (const t of CONSENT_TYPES) {
      const prev = req?.state?.[t]
      if (checks[t]) decisions[t] = 'granted'
      // במצב פיקוח: מה שהיה מאושר ובוטל עכשיו נרשם כ-revoked, ולא כ-denied.
      // בקישור initial אסור לשלוח 'revoked' בכלל — submit_parent_consent דוחה
      // אותו עם revoke_not_allowed וחוסם את כל הטופס, כולל האישור הבסיסי.
      else decisions[t] = (isManage && prev === 'granted') ? 'revoked' : 'denied'
    }
    const res = await submitParentConsent(token, decisions)
    setSaving(false)
    if (res.ok) {
      setDone(res)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (res.notDeployed) {
      setFailure('not_deployed')
    } else {
      // שגיאת חוזה מול השרת אינה תקלת רשת, ו«נסו שוב» עליה הוא לולאה סגורה:
      // שום ניסיון חוזר לא ישנה דבר. לכן לכל reason יש כאן הסבר שאומר
      // להורה מה בדיוק לעשות.
      toast.error(
        res.reason === 'expired' ? L('הקישור פג תוקף', 'The link has expired')
          : res.reason === 'used' ? L('הקישור כבר נוצל', 'This link was already used')
          : res.reason === 'revoke_not_allowed'
            ? L('בקישור הזה אפשר רק לאשר או לסרב, לא לבטל הרשאה קיימת. לביטול השתמשו בקישור הפיקוח.',
                'This link can only approve or refuse, not revoke an existing permission. Use your oversight link to revoke.')
          : res.reason === 'basic_required'
            ? L('צריך לסמן או לסרב במפורש את הסעיף הראשון.', 'The first item must be explicitly approved or refused.')
          : res.reason === 'bad_value' || res.reason === 'bad_type' || res.reason === 'bad_decisions'
            ? L('אירעה שגיאה בטופס — רעננו את הדף ונסו שוב.', 'Something went wrong with the form — refresh the page and try again.')
          : L('השמירה נכשלה — נסו שוב', 'Saving failed — please try again')
      )
      if (res.reason === 'expired' || res.reason === 'used') setFailure(res.reason)
    }
  }

  const shell = (children) => (
    <div className="pc-page">
      <header className="pc-head">
        <Logo size={30} />
        <span className="pc-brand">CourtSide</span>
      </header>
      <main className="pc-card">{children}</main>
      <footer className="pc-foot">
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות פרטיות', 'Privacy policy')}</a>
        <span aria-hidden="true"> · </span>
        <a href="/terms.html" target="_blank" rel="noopener noreferrer">{L('תנאי שימוש', 'Terms of use')}</a>
      </footer>
    </div>
  )

  // ---- טעינה ----
  if (loading) {
    return shell(
      <div className="pc-skel" aria-busy="true" aria-label={L('טוען...', 'Loading...')}>
        <div className="skeleton skeleton-line" style={{ width: '60%', height: 22 }} />
        <div className="skeleton skeleton-line" style={{ width: '85%' }} />
        <div className="skeleton skeleton-line" style={{ width: '75%' }} />
        <div className="skeleton skeleton-line" style={{ width: '92%', height: 120 }} />
      </div>
    )
  }

  // ---- כשלים ----
  if (failure === 'not_found') {
    return shell(
      <DeadEnd
        icon={<AlertTriangle size={26} />}
        title={L('הקישור לא נמצא', 'Link not found')}
        text={L(
          'ייתכן שהקישור הועתק חלקית. בקשו מהילד/ה לשלוח שוב את הקישור מתוך האפליקציה — זה לוקח שנייה ולא פוגע בשום דבר.',
          'The link may have been copied only partly. Ask your child to send the link again from the app — it takes a second and breaks nothing.'
        )}
        onRetry={load}
      />
    )
  }
  if (failure === 'expired') {
    return shell(
      <DeadEnd
        icon={<Clock size={26} />}
        title={L('הקישור פג תוקף', 'The link has expired')}
        text={L(
          'קישורי אישור תקפים לזמן מוגבל מטעמי אבטחה. בקשו מהילד/ה ללחוץ על «שליחה מחדש של הקישור להורה» באפליקציה, ותקבלו קישור חדש.',
          'Approval links expire for security reasons. Ask your child to tap “Re-send the link to my parent” in the app and you will get a fresh link.'
        )}
        onRetry={load}
      />
    )
  }
  if (failure === 'used') {
    return shell(
      <DeadEnd
        icon={<Check size={26} />}
        title={L('הקישור הזה כבר נוצל', 'This link was already used')}
        text={L(
          'האישור כבר נרשם. אם שמרתם את «קישור הפיקוח» שקיבלתם בסיום — אפשר לפתוח אותו כדי לראות ולשנות את ההרשאות. אחרת בקשו מהילד/ה לשלוח קישור פיקוח חדש.',
          'The approval is already recorded. If you saved the “oversight link” you received at the end, open it to review or change permissions. Otherwise ask your child to send a new oversight link.'
        )}
        onRetry={load}
      />
    )
  }
  if (failure === 'not_deployed') {
    return shell(
      <DeadEnd
        icon={<Clock size={26} />}
        title={L('המערכת עדיין בהקמה', 'This is not live yet')}
        text={L(
          'מנגנון אישור ההורים עדיין לא הופעל בשרת. אין צורך לעשות דבר — נסו שוב מאוחר יותר, או פנו למאמן.',
          'The parental approval mechanism is not enabled on the server yet. Nothing to do — try again later, or contact the coach.'
        )}
        onRetry={load}
      />
    )
  }
  if (failure) {
    return shell(
      <DeadEnd
        icon={<AlertTriangle size={26} />}
        title={L('לא הצלחנו לטעון את הבקשה', 'We could not load the request')}
        text={L('ייתכן שיש תקלת רשת זמנית. אפשר לנסות שוב.', 'This may be a temporary network problem. You can try again.')}
        onRetry={load}
      />
    )
  }

  // ---- סיום מוצלח ----
  if (done) {
    const link = done.manageLink
    return shell(
      <div className="pc-done">
        <span className="pc-done-ic"><ShieldCheck size={28} /></span>
        <h1 className="pc-title">{L('תודה — האישור נרשם', 'Thank you — your decision is recorded')}</h1>
        <p className="pc-lead">
          {checks.basic
            ? L('חשבון השחקן מופעל עכשיו. ההרשאות שבחרתם נשמרו והן שלכם לשנות בכל רגע.',
                'The player account is active now. The permissions you chose are saved and you can change them at any time.')
            : L('החשבון לא מופעל, לפי בחירתכם. אפשר לשנות את ההחלטה בכל רגע דרך הקישור הבא.',
                'The account is not activated, as you chose. You can change that at any time through the link below.')}
        </p>

        <ul className="pc-summary">
          {CONSENT_TYPES.map((t) => (
            <li key={t} className={checks[t] ? 'on' : 'off'}>
              {checks[t] ? <Check size={15} /> : <X size={15} />}
              <span>{consentLabel(t)}</span>
            </li>
          ))}
        </ul>

        {link && (
          <div className="pc-manage">
            <h2 className="pc-sub"><Link2 size={16} /> {L('קישור הפיקוח שלכם — כדאי לשמור', 'Your oversight link — worth saving')}</h2>
            <p className="muted small">
              {L('דרך הקישור הזה תוכלו לראות בכל עת מה אישרתם, לבטל הרשאות ולהשעות את החשבון. הוא אישי — אל תשתפו אותו.',
                 'This link lets you see what you approved, revoke permissions and suspend the account at any time. It is personal — do not share it.')}
            </p>
            <code className="pc-link" dir="ltr">{link}</code>
            <div className="pc-actions">
              <button type="button" className="btn-primary" onClick={() => copyText(link, L('קישור הפיקוח הועתק', 'Oversight link copied'))}>
                <Copy size={16} /> {L('העתקת הקישור', 'Copy link')}
              </button>
              <button
                type="button"
                className="btn-soft"
                onClick={() => waShare(L(
                  `קישור הפיקוח שלי על חשבון CourtSide (לשמירה, לא לשיתוף):\n${link}`,
                  `My CourtSide oversight link (keep it, don't share):\n${link}`
                ))}
              >
                <MessageCircle size={16} /> {L('שליחה לעצמי בוואטסאפ', 'Send to myself on WhatsApp')}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---- הטופס ----
  const doc = req.doc || {}
  const minorName = (req.minor_name || '').trim()
  const guardianName = (req.guardian_name || '').trim()
  const expires = (req.expires_at || '').split('T')[0]

  return shell(
    <form className="pc-form" onSubmit={submit}>
      <span className="pc-badge"><ShieldCheck size={14} /> {L('אישור הורה', 'Parental approval')}</span>
      <h1 className="pc-title">
        {isManage
          ? L('ניהול ההרשאות של הילד/ה', "Manage your child's permissions")
          : L('נדרש אישור שלכם לפתיחת חשבון', 'Your approval is needed to open the account')}
      </h1>
      <p className="pc-lead">
        {guardianName ? L(`שלום ${guardianName}, `, `Hello ${guardianName}, `) : ''}
        {minorName
          ? L(`${minorName} ביקש/ה לפתוח חשבון שחקן ב-CourtSide ורשם/ה אתכם כהורה או אחראי.`,
              `${minorName} asked to open a player account on CourtSide and listed you as the parent or guardian.`)
          : L('נרשמתם כהורה או אחראי של שחקן/ית ב-CourtSide.',
              'You were listed as the parent or guardian of a player on CourtSide.')}
      </p>
      {expires && !isManage && (
        <p className="muted small">
          {L('הקישור תקף עד ', 'This link is valid until ')}<bdi dir="ltr">{expires}</bdi>
        </p>
      )}

      {(doc.body_html || doc.title) && (
        <section className="pc-doc" aria-label={L('המסמך המלא', 'The full document')}>
          <h2 className="pc-sub"><FileText size={16} /> {doc.title || L('טופס הסכמת הורה', 'Parental consent form')}</h2>
          <div className="pc-doc-body">
            <SafeDoc html={doc.body_html} />
          </div>
          {doc.version && (
            <p className="muted small">{L('גרסת המסמך: ', 'Document version: ')}<bdi dir="ltr">{doc.version}</bdi></p>
          )}
        </section>
      )}

      <section className="pc-choices">
        <h2 className="pc-sub">{L('מה אתם מאשרים?', 'What do you approve?')}</h2>
        <p className="muted small">
          {L('הסעיף הראשון חובה להפעלת החשבון. שלושת האחרים נפרדים לחלוטין — אפשר לסרב לכל אחד מהם והחשבון יישאר פעיל.',
             'The first item is required to activate the account. The other three are entirely separate — you may refuse each one and the account stays active.')}
        </p>

        {CONSENT_TYPES.map((t) => {
          const cur = req.state?.[t]
          return (
            <label key={t} className={checks[t] ? 'pc-check on' : 'pc-check'}>
              <input
                type="checkbox"
                checked={checks[t]}
                onChange={(e) => toggle(t, e.target.checked)}
              />
              <span className="pc-check-body">
                <strong>
                  {consentLabel(t)}
                  {t === 'basic' && <span className="pc-req">{L(' · חובה', ' · required')}</span>}
                </strong>
                <span className="muted small">{consentHelp(t)}</span>
                {isManage && (
                  <span className="pc-cur">{L('כרגע: ', 'Currently: ')}{consentValueLabel(cur)}</span>
                )}
              </span>
            </label>
          )
        })}
      </section>

      <section className="pc-legal">
        <p className="muted small">
          {L('בשליחת הטופס אתם מאשרים שקראתם ואתם מסכימים, בשם הילד/ה, ל',
             'By submitting you confirm that you have read and agree, on behalf of your child, to the ')}
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">{L('תנאי השימוש', 'terms of use')}</a>
          {L(' ול', ' and the ')}
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{L('מדיניות הפרטיות', 'privacy policy')}</a>
          {req.terms_version || req.privacy_version ? (
            <>
              {L(' (גרסאות ', ' (versions ')}
              <bdi dir="ltr">{[req.terms_version, req.privacy_version].filter(Boolean).join(' · ')}</bdi>
              {')'}
            </>
          ) : null}
          {L('.', '.')}
        </p>
      </section>

      {!checks.basic && !isManage && (
        <p className="pc-hint" role="status">
          {L('כדי להפעיל את החשבון צריך לסמן את הסעיף הראשון.', 'To activate the account, tick the first item.')}
        </p>
      )}

      <div className="pc-actions">
        <button type="submit" className="btn-primary" disabled={saving || (!checks.basic && !isManage)} aria-busy={saving}>
          {saving && <span className="btn-spinner" aria-hidden="true" />}
          {saving
            ? L('שומר...', 'Saving...')
            : isManage ? L('שמירת השינויים', 'Save changes') : L('אישור ושליחה', 'Approve and send')}
        </button>
      </div>
    </form>
  )
}
