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

// ============================================================
//  זכות עיון — «המידע שלי»
// ============================================================
// מדיניות הפרטיות כבר מבטיחה למשתמש לראות מה מוחזק עליו. עד היום לא הייתה
// לזה שום דרך באפליקציה. ה-RPC (supabase_my_data.sql) מחזיר jsonb אחד עם כל
// מה שקשור למשתמש, והשכבה כאן רק מנרמלת אותו ומכינה קבצים להורדה.
//
// למה נורמליזציה בכלל: הקובץ ה-SQL נכתב במקביל, ואי אפשר לדעת אם הוא מחזיר
// { ok:true, profile:{...} }, { ok:true, data:{...} } או פשוט { profile:{...} }.
// callRpc מחזיר אובייקט jsonb כמות שהוא, ולכן ייצוא בלי דגל ok היה נראה
// לקורא ככישלון. normalizeExport מיישר את שלוש הצורות לחוזה אחד:
// { ok:true, data:<הייצוא עצמו> }.

const EXPORT_ENVELOPE_KEYS = ['data', 'export', 'payload', 'result']

function normalizeExport(res) {
  if (!res || typeof res !== 'object') return { ok: false, reason: 'error' }
  if (res.ok === false) return res // כולל notDeployed — עובר כמו שהוא לקורא
  // setof במקום jsonb — עוטפים כדי שהקורא יקבל תמיד אובייקט
  if (Array.isArray(res.rows)) return { ok: true, data: { items: res.rows } }
  for (const k of EXPORT_ENVELOPE_KEYS) {
    const v = res[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ok: true, data: v }
  }
  const { ok: _ok, ...rest } = res
  return { ok: true, data: rest }
}

export async function myDataExport() {
  return normalizeExport(await callRpc('my_data_export'))
}

export async function adminDataExport(userId) {
  if (!userId) return { ok: false, reason: 'no_user' }
  return normalizeExport(await callRpc('admin_data_export', { p_user: userId }))
}

// גילוי-תכונה: ייתכן שהפונקציה הזו לא נוצרה כלל (ייצוא להורה דרך טוקן ניהול
// הוא החלטה פתוחה). notDeployed כאן אינו תקלה אלא «התכונה לא קיימת», והקורא
// פשוט לא מציג את הכפתור במקום להראות שגיאה.
export async function guardianDataExport(token) {
  if (!token) return { ok: false, reason: 'no_token' }
  return normalizeExport(await callRpc('guardian_data_export', { p_token: token }))
}

// ===== שמות בעברית =====
// המפתחות מגיעים מהמסד באנגלית. מילון קטן הופך אותם למשהו שילד בן 13 מבין;
// מפתח שלא מוכר מוצג כמו שהוא ולא נעלם — עדיף מפתח גולמי על מידע חסר.

const SECTION_LABELS = {
  profile: ['הפרטים שלי', 'My details'],
  account: ['החשבון', 'Account'],
  user: ['החשבון', 'Account'],
  guardians: ['ההורה או האחראי', 'Parent or guardian'],
  guardian: ['ההורה או האחראי', 'Parent or guardian'],
  consents: ['ההחלטות של ההורה', "My parent's decisions"],
  consent_requests: ['בקשות אישור שנשלחו', 'Approval requests sent'],
  consent_documents: ['גרסאות טופס ההסכמה', 'Consent form versions'],
  team_players: ['הכרטיס שהמאמן מנהל עליי', 'The card my coach keeps on me'],
  coach_records: ['הכרטיס שהמאמן מנהל עליי', 'The card my coach keeps on me'],
  team_memberships: ['הקבוצות שלי', 'My teams'],
  memberships: ['הקבוצות שלי', 'My teams'],
  teams: ['הקבוצות שלי', 'My teams'],
  attendance: ['נוכחות באימונים', 'Practice attendance'],
  practice_attendance: ['נוכחות באימונים', 'Practice attendance'],
  practice_rsvp: ['אישורי הגעה', 'RSVPs'],
  assignments: ['משימות', 'Assignments'],
  assignment_completions: ['משימות שסיימתי', 'Assignments I completed'],
  assignment_progress: ['התקדמות במשימות', 'Assignment progress'],
  goals: ['היעדים שלי', 'My goals'],
  player_goals: ['היעדים שלי', 'My goals'],
  goal_logs: ['תיעוד התקדמות ביעדים', 'Goal progress logs'],
  session_effort: ['דיווחי עומס', 'Effort reports'],
  feedback: ['משוב אחרי אימון', 'Post-practice feedback'],
  session_feedback: ['משוב אחרי אימון', 'Post-practice feedback'],
  ratings: ['דירוגים', 'Ratings'],
  game_reviews: ['סיכומי משחק', 'Game reviews'],
  posts: ['פוסטים שכתבתי', 'Posts I wrote'],
  comments: ['תגובות שכתבתי', 'Comments I wrote'],
  reactions: ['לייקים', 'Likes'],
  messages: ['הודעות', 'Messages'],
  chat_messages: ['הודעות', 'Messages'],
  notifications: ['התראות', 'Notifications'],
  admin_requests: ['פניות שלי למנהל', 'My requests to the admin'],
  account_deletion_requests: ['בקשות מחיקת חשבון', 'Account deletion requests'],
  counts: ['מה שנספר בלבד', 'Counted only'],
  items: ['פריטים', 'Items'],
}

const FIELD_LABELS = {
  id: ['מזהה', 'ID'],
  first_name: ['שם פרטי', 'First name'],
  last_name: ['שם משפחה', 'Last name'],
  name: ['שם', 'Name'],
  email: ['מייל', 'Email'],
  phone: ['טלפון', 'Phone'],
  phone_public: ['הטלפון גלוי לקבוצה', 'Phone visible to team'],
  club: ['מועדון', 'Club'],
  team: ['קבוצה', 'Team'],
  role: ['סוג חשבון', 'Account type'],
  position: ['תפקיד במגרש', 'Position'],
  number: ['מספר חולצה', 'Shirt number'],
  height: ['גובה', 'Height'],
  birth_year: ['שנת לידה', 'Birth year'],
  birth_date: ['תאריך לידה', 'Date of birth'],
  age_groups: ['שנתונים', 'Age groups'],
  avatar_url: ['תמונת פרופיל', 'Profile photo'],
  approval_status: ['מצב האישור', 'Approval status'],
  adult_confirmed_at: ['אישרתי שאני בגיר', 'Confirmed as adult at'],
  accepted_terms_at: ['אישרתי את התנאים', 'Terms accepted at'],
  terms_version: ['גרסת התנאים', 'Terms version'],
  guardian_name: ['שם ההורה', 'Guardian name'],
  guardian_email: ['מייל ההורה', 'Guardian email'],
  guardian_phone: ['טלפון ההורה', 'Guardian phone'],
  guardian_consent_at: ['מועד אישור ההורה', 'Guardian consent at'],
  consent_version: ['גרסת ההסכמה', 'Consent version'],
  relation: ['הקשר אליי', 'Relation to me'],
  type: ['סוג', 'Type'],
  kind: ['סוג', 'Type'],
  value: ['החלטה', 'Decision'],
  status: ['מצב', 'Status'],
  purpose: ['מטרה', 'Purpose'],
  message: ['תוכן', 'Content'],
  notes: ['הערות', 'Notes'],
  coach_notes: ['הערות המאמן', 'Coach notes'],
  injury_note: ['הערת פציעה', 'Injury note'],
  availability_since: ['זמין מתאריך', 'Available since'],
  effort: ['עומס', 'Effort'],
  mood: ['הרגשה', 'Mood'],
  title: ['כותרת', 'Title'],
  text: ['טקסט', 'Text'],
  count: ['כמות', 'Count'],
  verified: ['מאומת', 'Verified'],
  banned: ['חסום', 'Blocked'],
  is_admin: ['מנהל מערכת', 'Admin'],
  created_at: ['נוצר בתאריך', 'Created at'],
  updated_at: ['עודכן בתאריך', 'Updated at'],
  done_at: ['הושלם בתאריך', 'Completed at'],
  decided_at: ['הוכרע בתאריך', 'Decided at'],
  expires_at: ['תקף עד', 'Valid until'],
  sent_at: ['נשלח בתאריך', 'Sent at'],
  date: ['תאריך', 'Date'],
}

// המרה נעימה של key גולמי: team_players -> "Team players"
function humanizeKey(key) {
  return String(key).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function dataSectionLabel(key) {
  const pair = SECTION_LABELS[key]
  if (pair) return L(pair[0], pair[1])
  // מפתח מקונן כמו activity.goals — מנסים את החלק האחרון
  const tail = String(key).split('.').pop()
  const tailPair = SECTION_LABELS[tail]
  if (tailPair) return L(tailPair[0], tailPair[1])
  return humanizeKey(key)
}

export function dataFieldLabel(key) {
  const pair = FIELD_LABELS[key]
  if (pair) return L(pair[0], pair[1])
  if (/_count$/.test(key)) {
    const base = key.replace(/_count$/, '')
    return L(`${dataSectionLabel(base)} — כמות`, `${dataSectionLabel(base)} — count`)
  }
  return humanizeKey(key)
}

// ===== קיבוץ לארבע קבוצות =====
// הסדר הוא סדר התצוגה, והוא מסופר כסיפור: מי אני · מי מאשר עליי ·
// מה המאמן רושם · מה עשיתי.
const GROUP_DEFS = [
  { id: 'me', title: ['הפרטים שלי', 'My details'],
    keys: ['profile', 'account', 'user', 'auth', 'details', 'settings'] },
  { id: 'guardian', title: ['ההורה שלי והאישורים', 'My guardian and consents'],
    keys: ['guardians', 'guardian', 'consents', 'consent', 'consent_requests', 'consent_log', 'consent_documents'] },
  { id: 'coach', title: ['מה המאמן רושם עליי', 'What my coach records about me'],
    keys: ['team_players', 'coach_record', 'coach_records', 'roster', 'team_memberships', 'memberships', 'teams', 'ratings', 'game_reviews'] },
  { id: 'activity', title: ['הפעילות שלי', 'My activity'],
    keys: ['attendance', 'practice_attendance', 'practice_rsvp', 'rsvp', 'assignments', 'assignment_completions',
      'assignment_progress', 'goals', 'player_goals', 'goal_logs', 'session_effort', 'feedback', 'session_feedback',
      'posts', 'comments', 'reactions', 'messages', 'chat_messages', 'notifications', 'admin_requests',
      'account_deletion_requests', 'counts', 'activity'] },
]

// מפתחות שירות של הייצוא עצמו — לא «מידע עליי», ולכן לא מוצגים כסעיף
const EXPORT_META_KEYS = ['ok', 'success', 'generated_at', 'exported_at', 'generated', 'version', 'schema_version', 'export_version']

export function exportGeneratedAt(data) {
  if (!data || typeof data !== 'object') return ''
  return data.generated_at || data.exported_at || data.generated || ''
}

// מחזיר [{ id, title, entries:[{key, value}] }] — רק קבוצות שיש בהן משהו.
// כל מפתח שאינו מוכר נופל ל«עוד מידע» ולא נבלע: ייצוא שמסתיר חלק מעצמו
// מפספס בדיוק את המטרה.
export function groupDataSections(data) {
  if (!data || typeof data !== 'object') return []
  const groups = GROUP_DEFS.map((g) => ({ id: g.id, title: L(g.title[0], g.title[1]), entries: [] }))
  const other = { id: 'other', title: L('עוד מידע', 'More data'), entries: [] }

  for (const [key, value] of Object.entries(data)) {
    if (EXPORT_META_KEYS.includes(key)) continue
    if (value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue
    // חלק שהוא מונה בלבד לא מוצג כאן אלא בבלוק היושר — מספר בלי הסתייגות
    // לצדו נקרא כאילו זה כל התוכן שקיים
    if (isSummaryOnly(key, value)) continue
    const gi = GROUP_DEFS.findIndex((g) => g.keys.includes(key))
    const target = gi >= 0 ? groups[gi] : other
    target.entries.push({ key, value })
  }
  return [...groups, other].filter((g) => g.entries.length > 0)
}

// ===== מה שמוצג כמספר בלבד =====
// הייצוא מכוון מחזיר על הודעות מונה ולא תוכן. אם המסך יציג רק את המונה בלי
// לומר זאת, המשתמש יסיק שזה כל מה שיש — וזה בדיוק ההפך מזכות עיון.
// הכלל הוא לפי *הערך* ולא לפי שם המפתח: אם messages חזר כמערך שורות מלא, זה
// תוכן אמיתי ואסור להכריז עליו «מונה בלבד»; אם הוא חזר כמספר — זו ספירה.
export function isSummaryOnly(key, value) {
  const tail = String(key).split('.').pop()
  if (typeof value === 'number') return true
  if (/_count$/.test(tail)) return true
  if (tail === 'counts') return true
  // { count: 42 } — עטיפה של מונה בודד
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value)
    if (keys.length <= 2 && typeof value.count === 'number') return true
  }
  return false
}

// כל הפריטים שהוחזרו כמספר בלבד, כרשימה שטוחה לתצוגה
export function summaryOnlyItems(data) {
  const out = []
  if (!data || typeof data !== 'object') return out
  for (const [key, value] of Object.entries(data)) {
    if (EXPORT_META_KEYS.includes(key)) continue
    if (key === 'counts' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) out.push({ key: k, count: typeof v === 'number' ? v : null })
      continue
    }
    if (!isSummaryOnly(key, value)) continue
    const count = typeof value === 'number' ? value
      : Array.isArray(value) ? value.length
      : (value && typeof value === 'object' && typeof value.count === 'number') ? value.count
      : null
    out.push({ key, count })
  }
  return out
}

// ===== הצגת ערך בודד =====
const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

export function dataValueText(v) {
  if (v === null || v === undefined || v === '') return L('לא מולא', 'Not filled in')
  if (typeof v === 'boolean') return v ? L('כן', 'Yes') : L('לא', 'No')
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return L('לא מולא', 'Not filled in')
    return v.map((x) => dataValueText(x)).join(', ')
  }
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  if (ISO_RE.test(s)) {
    const d = new Date(s.length === 10 ? `${s}T00:00:00` : s)
    if (!Number.isNaN(d.getTime())) {
      return s.length === 10
        ? d.toLocaleDateString(L('he-IL', 'en-US'))
        : d.toLocaleString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
  }
  return s
}

// ===== קבצים להורדה =====
// שתי הפונקציות טהורות (מחרוזת נכנסת, מחרוזת יוצאת) כדי שיהיו ניתנות לבדיקה
// בלי DOM. ההורדה עצמה מופרדת ל-downloadTextFile.

export function exportToJsonText(data) {
  try {
    return JSON.stringify(data ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

// תא CSV אחד. שלושה דברים חייבים לעבוד כאן:
// 1. פסיק/מרכאות/שורה חדשה בתוך ערך (הערת מאמן חופשית) — ציטוט והכפלת מרכאות.
// 2. עברית — נפתר ב-BOM בראש הקובץ, אחרת Excel פותח ג'יבריש.
// 3. הזרקת נוסחאות: ערך שמתחיל ב-= + - @ מתפרש ב-Excel כנוסחה. מקדימים
//    גרש כדי שיישאר טקסט, אבל לא למספרים שליליים שהם באמת מספרים.
function csvCell(v) {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

function isRowObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function columnsOf(rows) {
  const cols = []
  for (const r of rows) {
    for (const k of Object.keys(r || {})) if (!cols.includes(k)) cols.push(k)
  }
  return cols
}

// שולף מהייצוא את כל החלקים הטבלאיים. מערך של אובייקטים = טבלה; אובייקט
// שטוח = טבלה בת שורה אחת; אובייקט מקונן נפתח רמה אחת ואז נשמר כ-JSON בתא.
export function exportTables(data, prefix = '', depth = 0) {
  const tables = []
  if (!isRowObject(data)) return tables
  const scalars = {}
  for (const [key, value] of Object.entries(data)) {
    if (EXPORT_META_KEYS.includes(key) && !prefix) continue
    const name = prefix ? `${prefix}.${key}` : key
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      const rows = value.every(isRowObject) ? value : value.map((x) => ({ value: x }))
      tables.push({ key: name, rows, columns: columnsOf(rows) })
    } else if (isRowObject(value)) {
      const flat = Object.values(value).every((x) => x === null || typeof x !== 'object')
      if (flat) tables.push({ key: name, rows: [value], columns: Object.keys(value) })
      else if (depth < 2) tables.push(...exportTables(value, name, depth + 1))
      else tables.push({ key: name, rows: [value], columns: Object.keys(value) })
    } else {
      scalars[key] = value
    }
  }
  if (Object.keys(scalars).length > 0) {
    tables.unshift({ key: prefix || L('כללי', 'General'), rows: [scalars], columns: Object.keys(scalars) })
  }
  return tables
}

export function exportToCsvText(data) {
  const tables = exportTables(data)
  const lines = []
  for (const t of tables) {
    lines.push(csvCell(`# ${dataSectionLabel(t.key)}`))
    lines.push(t.columns.map((c) => csvCell(dataFieldLabel(c))).join(','))
    for (const r of t.rows) lines.push(t.columns.map((c) => csvCell(r?.[c])).join(','))
    lines.push('')
  }
  // BOM = Excel מזהה UTF-8 ופותח עברית נכון · CRLF = סוף שורה שהוא מכבד.
  // השורה משתמשת ב-\uFEFF ולא בתו BOM ממשי — תו בלתי-נראה בקוד נעלם בעריכה הבאה.
  return `\uFEFF${lines.join('\r\n')}`
}

export function exportFileName(ext) {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `courtside-my-data-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`
}

// ההורדה עצמה. מחזיר false במקום לזרוק — ב-WebView של Capacitor התכונה
// download יכולה להיחסם, והקורא מציג הודעה במקום מסך לבן.
export function downloadTextFile(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: `${mime || 'text/plain'};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // ניקוי מושהה: ספארי מבטל את ההורדה אם ה-URL משוחרר מיד
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return true
  } catch {
    return false
  }
}
