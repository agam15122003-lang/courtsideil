import { supabase } from './supabaseClient'
// ייבוא הגנתי: SITE_URL נכנס לקובץ constants בגל הזה. ייבוא namespace לא נשבר
// גם אם הקבוע עדיין לא קיים שם (בניגוד ל-named import שמפיל את הבנייה).
import * as CONSTANTS from './constants'
import { L } from './i18n'

// ===== שכבת לקוח דקה מעל ה-RPC של הסכמת הורים =====
// כל קריאה כאן חייבת לשרוד מסד שעדיין לא הריץ את המיגרציה: פונקציה חסרה
// מוחזרת כ-{ ok:false, notDeployed:true } וכל קורא נופל בחזרה להתנהגות הישנה.

// PGRST202 = הפונקציה לא נמצאה ב-schema cache · 42883 = undefined_function
// 42P01 = undefined_table (כשה-RPC נשען על טבלה שטרם נוצרה)
// PGRST205 = הטבלה לא נמצאה ב-schema cache. זה המקרה של גישה ישירה לטבלה
// חדשה (admin_requests) לפני שהמיגרציה רצה — PostgREST עוצר עוד לפני פוסטגרס,
// ולכן הקוד הוא PGRST205 ולא 42P01, ובלעדיו הפנייה נראית כשגיאה אמיתית.
// 42703 = undefined_column, כשהטבלה קיימת אבל עמודה חדשה טרם נוספה לה.
const NOT_DEPLOYED_CODES = ['PGRST202', 'PGRST205', 'PGRST106', '42883', '42P01', '42703']

export function isNotDeployed(error) {
  if (!error) return false
  if (NOT_DEPLOYED_CODES.includes(error.code)) return true
  const msg = String(error.message || '')
  return /function .*does not exist|could not find the (function|table)|does not exist in the schema cache|relation .*does not exist|column .*does not exist/i.test(msg)
}

// עוטף קריאת RPC אחת ומחזיר תמיד אובייקט אחיד — בלי לזרוק
async function callRpc(fn, args) {
  let res
  try {
    res = await supabase.rpc(fn, args || {})
  } catch (err) {
    return { ok: false, reason: 'network', message: err?.message || '' }
  }
  const { data, error } = res
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true, reason: 'not_deployed' }
    return { ok: false, reason: 'error', message: error.message || '' }
  }
  // הפונקציות שמחזירות jsonb כבר מחזירות {ok:...}; אלה שמחזירות setof מוחזרות כמערך
  if (Array.isArray(data)) return { ok: true, rows: data }
  if (data && typeof data === 'object') return data
  return { ok: true, data }
}

// ===== בניית הקישור להורה =====
// בתוך Capacitor window.location.origin הוא capacitor://localhost — לינק מת אצל
// הנמען. לכן SITE_URL קודם, ורק בהיעדרו נופלים ל-origin של הדפדפן.
export function siteUrl() {
  const s = CONSTANTS.SITE_URL
  if (typeof s === 'string' && /^https?:\/\//i.test(s)) return s.replace(/\/+$/, '')
  return window.location.origin
}

export function consentLink(token) {
  return `${siteUrl()}/#/consent/${token}`
}

// הודעת הוואטסאפ שהקטין שולח להורה
export function consentShareText(minorName, link) {
  const name = (minorName || '').trim()
  return L(
    `היי! פתחתי חשבון${name ? ` בשם ${name}` : ''} באפליקציית CourtSide (אימוני כדורסל).\n` +
      'כדי שהחשבון יופעל צריך אישור שלך כהורה — הקישור מסביר בדיוק מה נאסף ומה מותר לפרסם, ולוקח דקה:\n' +
      `${link}\n` +
      'הקישור אישי וחד-פעמי, אין צורך לפתוח חשבון.',
    `Hi! I opened an account${name ? ` for ${name}` : ''} on CourtSide (basketball training app).\n` +
      'To activate it a parent has to approve — this link explains exactly what is collected and what may be published, and takes a minute:\n' +
      `${link}\n` +
      'The link is personal, one-time, and needs no account.'
  )
}

// ===== קריאות =====

// נקרא ע"י הקטין המחובר.
// שני חוזי-תשובה אפשריים, ושניהם חייבים להיתמך בו-זמנית:
//   { ok, token }   — המסירה בידי הקטין (שיתוף ידני), ואנחנו בונים ממנו link
//   { ok, sent_to } — הקישור נשלח בצד שרת למייל ההורה, והטוקן לא חוזר ללקוח
//                     (זו הצורה הבטוחה: הטוקן ביד הקטין = הקטין מאשר לעצמו)
// קורא שלא מכיר את הצורה השנייה היה מפרש { ok:true } בלי token ככישלון —
// ולכן כל קורא כאן חייב לבדוק link || sent_to, ולא רק link.
export async function createConsentRequest({ name, email, phone, relation, purpose } = {}) {
  const res = await callRpc('create_consent_request', {
    p_name: (name || '').trim() || null,
    p_email: (email || '').trim(),
    p_phone: (phone || '').trim() || null,
    p_relation: (relation || '').trim() || null,
    p_purpose: purpose || 'initial',
  })
  if (res.ok && res.token) return { ...res, link: consentLink(res.token) }
  return res
}

// נקרא ע"י ההורה — אנונימי, בלי חשבון
export async function getConsentRequest(token) {
  return callRpc('get_consent_request', { p_token: token })
}

export async function submitParentConsent(token, decisions) {
  const res = await callRpc('submit_parent_consent', { p_token: token, p_decisions: decisions })
  if (res.ok && res.manage_token) return { ...res, manageLink: consentLink(res.manage_token) }
  return res
}

export async function myConsentState() {
  return callRpc('my_consent_state')
}

// ===== הנפקה מחדש של קישור הניהול =====
// המבוי הסתום שזה סוגר: הורה שסירב פעם אחת לאחת ההרשאות האופציונליות לא יכול
// היה לחזור בו לעולם — create_consent_request דוחה purpose='manage' על הסף,
// ו-submit_parent_consent חוסם שדרוג מ-denied ל-granted דרך טוקן 'initial'.
// כלומר: הורה שאיבד (או מעולם לא קיבל) את קישור הניהול נעול על ההחלטה
// הראשונה שלו — בדיוק ההפך ממה שמערכת הסכמה אמורה להבטיח.
// זו אינה פרצת אבטחה: מייל האפוטרופוס ננעל ברגע שנרשמה הכרעה בסיסית ראשונה
// (גם ב-create_consent_request וגם בטריגר), ולכן קישור ניהול חדש חוזר תמיד
// לאותו הורה שכבר החליט פעם אחת. ההגנה האמיתית היא נעילת המייל, לא חסימת
// ההנפקה. תומך גם כאן בשתי צורות התשובה — token ביד הקטין או sent_to בצד שרת.
export async function requestManageLink() {
  const res = await callRpc('request_manage_link')
  if (res.ok && res.token) return { ...res, link: consentLink(res.token) }
  return res
}

// הודעת הוואטסאפ שהקטין שולח להורה יחד עם קישור הניהול
export function consentManageShareText(minorName, link) {
  const name = (minorName || '').trim()
  return L(
    `היי! זה קישור הניהול של החשבון שלי${name ? ` (${name})` : ''} ב-CourtSide.\n` +
      'דרכו אפשר לראות בכל רגע מה אישרת, לשנות הרשאות (למשל לאשר או לבטל פרסום תמונות) ולבטל את ההסכמה לגמרי:\n' +
      `${link}\n` +
      'כדאי לשמור את הקישור — הוא אישי ותקף לשנה.',
    `Hi! This is the management link for my CourtSide account${name ? ` (${name})` : ''}.\n` +
      'It lets you see what you approved, change permissions (for example allow or stop photo publishing) and revoke consent entirely:\n' +
      `${link}\n` +
      'Worth saving — it is personal and valid for a year.'
  )
}

export async function confirmAdult() {
  return callRpc('confirm_adult')
}

// גיל מדויק לשער הבגירות. יושב כאן ולא ב-Dashboard כי גם מסך ההמתנה צריך
// אותו: שחקן שהגיע ל-18 בזמן שחיכה לאישור הורה חייב מסלול יציאה משלו.
// עם תאריך לידה מלא — חישוב אמיתי; עם שנה בלבד (פרופיל שנוצר לפני
// המיגרציה) — חישוב שמרני, בגיר רק כשבוודאות מלאו 18.
export function isAdultPlayer(p) {
  if (p?.birth_date) {
    const d = new Date(`${p.birth_date}T00:00:00`)
    if (!Number.isNaN(d.getTime())) {
      const now = new Date()
      let a = now.getFullYear() - d.getFullYear()
      const m = now.getMonth() - d.getMonth()
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a -= 1
      return a >= 18
    }
  }
  if (p?.birth_year) return new Date().getFullYear() - Number(p.birth_year) - 1 >= 18
  return false
}

// ===== אדמין =====
export async function adminPendingMinors() { return callRpc('admin_pending_minors') }
export async function adminConsentLog(minorId) { return callRpc('admin_consent_log', { p_minor: minorId }) }
export async function adminRevokeConsent(minorId, type) {
  return callRpc('admin_revoke_consent', { p_minor: minorId, p_type: type })
}
// עד היום לאדמין הייתה רק דרך אחת — לבטל. הורה שהתקשר וביקש לאשר משהו
// שסירב לו בעבר נשאר בלי מענה, כי אין פונקציה שמעניקה הסכמה.
// value: 'granted' | 'denied' | 'revoked'
export async function adminSetConsent(minorId, type, value) {
  return callRpc('admin_set_consent', { p_minor: minorId, p_type: type, p_value: value })
}
export async function adminDeletionRequests() { return callRpc('admin_deletion_requests') }
export async function adminMarkDeletionDone(id) { return callRpc('admin_mark_deletion_done', { p_id: id }) }

// ===== ערוץ הפנייה לאדמין =====
// המבוי הסתום שזה סוגר: אמא שהחליפה מייל, הורים פרודים שהקישור הלך לאבא
// הלא-נכון, תאריך לידה שהוקלד הפוך — לאדמין כבר יש את הכלים לתקן את כל אלה,
// אבל למשתמש לא הייתה שום דרך *להגיע* אליו מתוך האפליקציה. הטבלה נגישה
// בכוונה גם לקטין מוגבל (היא לא נעולה מאחורי is_active_user), כי בדיוק מי
// שתקוע הוא זה שצריך לבקש עזרה.
export const ADMIN_REQUEST_KINDS = ['guardian_change', 'consent_change', 'age_correction', 'other']

// תקרת האורך זהה ל-CHECK במסד. חוסמים גם בלקוח כדי שהמשתמש יראה מונה
// ולא ישלח 1200 תווים ויקבל שגיאת 400 סתומה אחרי שכתב הכל.
export const ADMIN_REQUEST_MAX = 1000

export function adminRequestKindLabel(kind) {
  switch (kind) {
    case 'guardian_change':
      return L('החלפת ההורה הרשום', 'Change the registered guardian')
    case 'consent_change':
      return L('שינוי הרשאות', 'Change permissions')
    case 'age_correction':
      return L('תיקון תאריך לידה', 'Fix the date of birth')
    case 'other':
      return L('אחר', 'Something else')
    default:
      return kind
  }
}

// טקסט עזר לבורר בצד השחקן — כדי שהוא יבין איזו אפשרות מתאימה לו
export function adminRequestKindHelp(kind) {
  switch (kind) {
    case 'guardian_change':
      return L('הקישור נשלח להורה הלא-נכון, המייל השתנה, או שההורה שרשום כבר לא הכתובת הנכונה.',
        'The link went to the wrong parent, the email changed, or the registered guardian is no longer the right address.')
    case 'consent_change':
      return L('ההורה רוצה לאשר או לבטל הרשאה, ואין לו את קישור הניהול.',
        'Your parent wants to allow or cancel a permission and does not have the management link.')
    case 'age_correction':
      return L('תאריך הלידה בפרופיל שגוי, ולכן החשבון סווג לא נכון.',
        'The date of birth on the profile is wrong, so the account was classified incorrectly.')
    case 'other':
      return L('כל דבר אחר שתקוע — תארו במילים שלכם.', 'Anything else that is stuck — describe it in your own words.')
    default:
      return ''
  }
}

// פנייה לאדמין. INSERT ישיר ולא RPC — הטבלה מוגנת ב-RLS על user_id=auth.uid(),
// ואין כאן שום דבר שדורש הרשאות-על. מחזיר את אותו חוזה כמו callRpc, כך
// שהקורא מטפל ב-notDeployed בדיוק באותה דרך.
export async function fileAdminRequest({ kind, message } = {}) {
  if (!ADMIN_REQUEST_KINDS.includes(kind)) return { ok: false, reason: 'bad_kind' }
  // חיתוך ולא דחייה: המשתמש כבר כתב, וזריקת הטקסט שלו בגלל תו 1001 גרועה
  // מלשלוח את מה שנכנס. ה-UI ממילא מגביל את שדה הקלט לאותו אורך.
  const text = String(message || '').trim().slice(0, ADMIN_REQUEST_MAX)

  let user
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user
  } catch {
    return { ok: false, reason: 'network' }
  }
  if (!user) return { ok: false, reason: 'not_authenticated' }

  let error
  try {
    ;({ error } = await supabase.from('admin_requests').insert({
      user_id: user.id,
      kind,
      message: text || null,
    }))
  } catch (err) {
    return { ok: false, reason: 'network', message: err?.message || '' }
  }
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true, reason: 'not_deployed' }
    return { ok: false, reason: 'error', message: error.message || '' }
  }
  return { ok: true }
}

export async function adminRequests() { return callRpc('admin_requests_list') }
export async function adminMarkRequestDone(id) { return callRpc('admin_mark_request_done', { p_id: id }) }

// החלפת ההורה הרשום. זו הפעולה הרגישה ביותר בלוח האדמין: היא מעבירה את
// הפיקוח ההורי לאדם אחר, ולכן היא נעשית רק אחרי אימות מחוץ למערכת.
export async function adminSetGuardian(minorId, { name, email, phone, relation } = {}) {
  return callRpc('admin_set_guardian', {
    p_minor: minorId,
    p_name: (name || '').trim() || null,
    p_email: (email || '').trim(),
    p_phone: (phone || '').trim() || null,
    p_relation: (relation || '').trim() || null,
  })
}

// ===== סוגי ההסכמה =====
// הסדר כאן הוא סדר החוזה, וגם סדר התצוגה בטופס ההורה.
export const CONSENT_TYPES = ['basic', 'media_team', 'media_public', 'marketing']

export function consentLabel(type) {
  switch (type) {
    case 'basic':
      return L('פתיחת חשבון שחקן ושימוש בסיסי', 'Opening a player account and basic use')
    case 'media_team':
      return L('תמונות וסרטונים בתוך הקבוצה הסגורה', 'Photos and videos inside the closed team')
    case 'media_public':
      return L('פרסום תמונות/סרטונים מחוץ לקבוצה', 'Publishing photos/videos outside the team')
    case 'marketing':
      return L('עדכונים שיווקיים במייל', 'Marketing updates by email')
    default:
      return type
  }
}

export function consentHelp(type) {
  switch (type) {
    case 'basic':
      return L(
        'שם, שנת לידה, מועדון, קבוצה ותקשורת עם המאמן. בלי האישור הזה החשבון לא מופעל.',
        'Name, birth year, club, team and communication with the coach. Without this the account is not activated.'
      )
    case 'media_team':
      return L(
        'המאמן והשחקנים בקבוצה בלבד יראו תמונות וסרטונים מהאימונים. לא נדרש להפעלת החשבון.',
        'Only the coach and the players on the team see photos and videos from practice. Not required to activate the account.'
      )
    case 'media_public':
      return L(
        'פרסום שבו הילד/ה מזוהה מחוץ לקבוצה — פיד הקהילה, אתר או רשתות. אפשר לסרב ולהשאיר את החשבון פעיל.',
        'Publishing where the child is identifiable outside the team — community feed, website or social. You may refuse and keep the account active.'
      )
    case 'marketing':
      return L(
        'מיילים על תכונות חדשות ומבצעים. אפשר לסרב, וזה לא משפיע על השימוש.',
        'Emails about new features and offers. You may refuse; it does not affect use.'
      )
    default:
      return ''
  }
}

// הודעות הכשל של create_consent_request, בשפת המשתמש
export function consentRequestError(reason) {
  switch (reason) {
    case 'rate_limited':
      return L('נוצרו היום יותר מדי קישורים. אפשר להשתמש בקישור האחרון שכבר נשלח, או לנסות שוב מחר.',
        'Too many links were created today. Use the last link you sent, or try again tomorrow.')
    case 'email_locked':
      return L('אי אפשר לשנות את מייל ההורה אחרי שהתקבל אישור. פנו למאמן/ת.',
        'The parent email cannot be changed after an approval was given. Talk to your coach.')
    case 'guardian_email_required':
      return L('צריך למלא מייל של הורה או אחראי.', 'A parent or guardian email is required.')
    case 'no_guardian':
      return L('אין הורה רשום בחשבון. מלאו את פרטי ההורה בטופס הפרופיל.',
        'No guardian on this account. Fill in the parent details in the profile form.')
    case 'not_a_player':
      return L('רק חשבון שחקן יכול לבקש אישור הורה.', 'Only a player account can request parental approval.')
    case 'not_authenticated':
      return L('צריך להתחבר מחדש.', 'Please sign in again.')
    // הקטין רשם את המייל של עצמו כמייל ההורה — כלומר היה מאשר לעצמו.
    // השרת חוסם, והטופס חוסם גם הוא לפני השמירה.
    case 'guardian_email_is_self':
      return L('מייל ההורה חייב להיות שונה מהמייל שלך — ההורה הוא זה שמאשר, לא אתה.',
        "The parent email must differ from your own — your parent gives the approval, not you.")
    // בקשה מיותרת: כבר יש הסכמה בתוקף. לא כשל — הקוראים מטפלים בזה בשקט,
    // וההודעה כאן היא רק רשת ביטחון אם מישהו בכל זאת יציג אותה.
    case 'already_consented':
      return L('החשבון כבר אושר — אין צורך בקישור חדש.', 'The account is already approved — no new link is needed.')
    // request_manage_link: אין עדיין שום הכרעה של הורה, ולכן אין מה «לנהל».
    // המסלול הנכון הוא הקישור הראשוני, לא קישור הניהול.
    case 'no_prior_consent':
      return L('עוד לא ניתנה החלטה — שלחו קודם את קישור האישור הראשוני',
        'No decision has been made yet — send the initial approval link first')
    default:
      return L('יצירת הקישור נכשלה — נסו שוב.', 'Creating the link failed — please try again.')
  }
}

export function consentValueLabel(value) {
  if (value === 'granted') return L('אושר', 'Granted')
  if (value === 'denied') return L('נדחה', 'Denied')
  if (value === 'revoked') return L('בוטל', 'Revoked')
  return L('טרם נענה', 'No answer yet')
}
