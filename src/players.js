import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import { toast } from './toast'
import { L } from './i18n'

// כל שאילתה כאן מפרקת { data, error } ומדווחת — לא בולעת.
// הבליעה הקודמת (`const { data } = ...`) הסתירה שגיאת הרשאה 42501 על
// profiles.birth_year, ומסך אישור בקשות ההצטרפות של המאמן היה ריק תמיד
// בלי שום סימן לתקלה. שגיאה חייבת להיראות — לא להיראות כמו "אין נתונים".
function reportError(where, error, userMsg) {
  if (!error) return false
  console.error(`players.${where}:`, error.message || error)
  if (userMsg) toast.error(userMsg)
  return true
}

// יצירת קוד הצטרפות קריא (בלי תווים מבלבלים: 0/O, 1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function randomCode(len = 6) {
  let s = ''
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  for (let i = 0; i < len; i++) s += ALPHABET[arr[i] % ALPHABET.length]
  return s
}

// מחזיר את קוד ההצטרפות של קבוצה (יוצר אם אין). מפתח: (coach_id, team).
export async function getOrCreateJoinCode(coachId, team) {
  const { data: existing, error: readErr } = await supabase
    .from('team_join_codes')
    .select('code')
    .eq('coach_id', coachId)
    .eq('team', team)
    .maybeSingle()
  // שגיאת קריאה ≠ "אין קוד" — מדווחים ולא ממשיכים ליצור כפילות
  if (readErr && readErr.code !== 'PGRST116') {
    reportError('getOrCreateJoinCode/read', readErr)
    throw readErr
  }
  if (existing?.code) return existing.code

  // מנסים כמה פעמים למקרה של התנגשות קוד
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(6)
    const { error } = await supabase
      .from('team_join_codes')
      .insert({ code, coach_id: coachId, team })
    if (!error) return code
    // אם ההתנגשות היא על (coach_id, team) — מישהו יצר במקביל, נקרא שוב
    const { data: again, error: againErr } = await supabase
      .from('team_join_codes')
      .select('code').eq('coach_id', coachId).eq('team', team).maybeSingle()
    if (againErr && againErr.code !== 'PGRST116') reportError('getOrCreateJoinCode/retry', againErr)
    if (again?.code) return again.code
  }
  throw new Error('could not create join code')
}

// קודי שגיאה שמשמעותם "המיגרציה עוד לא רצה בפרודקשן" ולא "כשל אמיתי":
// PGRST202 = הפונקציה לא נמצאה ב-schema cache · 42883 = undefined_function.
// כל קריאה חדשה כאן חייבת לשרוד מסד שטרם הריץ את supabase_hardening_medium_3_8.sql.
function isMissingRpc(error) {
  if (!error) return false
  if (['PGRST202', 'PGRST106', '42883'].includes(error.code)) return true
  return /function .*does not exist|could not find the function|does not exist in the schema cache/i
    .test(String(error.message || ''))
}

// שחקן מזין קוד → מוצא את הקבוצה ויוצר בקשת הצטרפות ממתינה.
// מחזיר { ok, status, coach_id, team } או { ok:false, reason }.
//
// הנתיב המועדף הוא ה-RPC join_with_code (SECURITY DEFINER): הוא מפענח את הקוד
// *ויוצר את השורה* בשרת, ולכן אפשר לשלול מהלקוח INSERT ישיר על
// team_memberships — היום כל משתמש יכול להציף כל מאמן בבקשות לכל קבוצה
// שירצה, בלי להחזיק בכלל קוד. הנתיב הישן נשאר כנפילה לאחור עד שהמיגרציה
// תרוץ בפרודקשן (החוזה: supabase_hardening_medium_3_8.sql סעיף 9).
export async function requestJoinByCode(playerId, rawCode) {
  const code = (rawCode || '').trim().toUpperCase()
  if (code.length < 4) return { ok: false, reason: 'bad-code' }

  const { data: joined, error: joinErr } = await supabase
    .rpc('join_with_code', { p_code: code })
  if (!joinErr) {
    const res = joined || {}
    if (!res.ok) {
      // ה-UI מכיר 'not-found' בלבד; שאר הסיבות ('expired' / 'self' /
      // 'rate-limited' / 'auth') ממופות אליה כדי שלא תוצג ההודעה השגויה
      // "הקוד קצר מדי". הסיבה המקורית נשמרת ל-serverReason לתחקור.
      if (res.reason && res.reason !== 'not-found') {
        console.warn('players.requestJoinByCode: join_with_code סירב —', res.reason)
      }
      return { ok: false, reason: 'not-found', serverReason: res.reason || 'not-found' }
    }
    // התראה למאמן נשארת בצד הלקוח (כך גם בחוזה) — רק על בקשה חדשה
    if (res.status === 'pending' && !res.already) {
      sendNotification({
        to: res.coach_id, actor: playerId, type: 'message',
        content: 'שחקן ביקש להצטרף לקבוצה שלך', nav: 'teams',
      })
    }
    return res
  }
  if (!isMissingRpc(joinErr)) {
    reportError('requestJoinByCode/rpc', joinErr, L('ההצטרפות לקבוצה נכשלה — נסו שוב.', 'Joining the team failed — please try again.'))
    return { ok: false, reason: joinErr.message }
  }
  console.warn('players.requestJoinByCode: join_with_code לא זמין — נופלים לנתיב הישן')

  // ===== נתיב ישן (עד שהמיגרציה תרוץ): פענוח + insert מהלקוח =====
  // פענוח הקוד דרך RPC: כך אין צורך בהרשאת קריאה לכל טבלת הקודים
  // (קריאה חופשית שם אפשרה לשלוף את כל הקודים והקבוצות באפליקציה).
  let row = null
  const { data: rpc, error: rpcErr } = await supabase
    .rpc('resolve_join_code', { p_code: code })
  if (!rpcErr) {
    row = Array.isArray(rpc) ? rpc[0] : rpc
  } else {
    // נפילה לאחור למי שעוד לא הריץ את supabase_security3.sql
    console.warn('players.requestJoinByCode: resolve_join_code לא זמין —', rpcErr.message)
    const { data: legacy, error: legacyErr } = await supabase
      .from('team_join_codes')
      .select('coach_id, team')
      .eq('code', code)
      .maybeSingle()
    if (legacyErr && legacyErr.code !== 'PGRST116') {
      reportError('requestJoinByCode/legacy', legacyErr)
      return { ok: false, reason: legacyErr.message }
    }
    row = legacy
  }
  if (!row) return { ok: false, reason: 'not-found' }

  // כבר קיימת בקשה?
  const { data: existing, error: existErr } = await supabase
    .from('team_memberships')
    .select('status')
    .eq('coach_id', row.coach_id)
    .eq('team', row.team)
    .eq('player_id', playerId)
    .maybeSingle()
  if (existErr && existErr.code !== 'PGRST116') {
    reportError('requestJoinByCode/existing', existErr)
    return { ok: false, reason: existErr.message }
  }
  if (existing) return { ok: true, status: existing.status, ...row, already: true }

  const { error } = await supabase
    .from('team_memberships')
    .insert({ coach_id: row.coach_id, team: row.team, player_id: playerId, status: 'pending' })
  if (error) {
    reportError('requestJoinByCode/insert', error)
    return { ok: false, reason: error.message }
  }
  // מתריעים למאמן על בקשה חדשה
  sendNotification({
    to: row.coach_id, actor: playerId, type: 'message',
    content: 'שחקן ביקש להצטרף לקבוצה שלך', nav: 'teams',
  })
  return { ok: true, status: 'pending', ...row }
}

// מאמן מאשר/דוחה בקשת הצטרפות. באישור — מוסיף את השחקן לסגל (עם player_id) ומתריע לו.
export async function decideMembership(membership, approve) {
  const status = approve ? 'approved' : 'rejected'
  const { error } = await supabase
    .from('team_memberships')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', membership.id)
  if (error) {
    reportError('decideMembership/update', error)
    return { ok: false, reason: error.message }
  }

  if (approve) {
    // 3.9 — התראת האישור במקום אחד (הייתה משוכפלת בשלושה ענפים), ודרך L()
    const notifyApproved = () => sendNotification({
      to: membership.player_id, actor: membership.coach_id, type: 'message',
      content: L('המאמן אישר אותך לקבוצה! 🎉', 'Your coach approved you to the team! 🎉'), nav: 'drills',
    })
    // מוסיפים לסגל אם עדיין אין שורה מקושרת לשחקן הזה
    const { data: existing, error: existErr } = await supabase
      .from('team_players')
      .select('id')
      .eq('coach_id', membership.coach_id)
      .eq('team', membership.team)
      .eq('player_id', membership.player_id)
      .maybeSingle()
    if (existErr && existErr.code !== 'PGRST116') {
      reportError('decideMembership/roster-read', existErr)
      return { ok: false, reason: existErr.message }
    }
    if (!existing) {
      const nm = membership.player
        ? `${membership.player.first_name || ''} ${membership.player.last_name || ''}`.trim()
        : 'שחקן'
      // 3.9 — שתי אמיתות: רוב הילדים כבר יושבים בסגל כשורה שהמאמן הקליד ביד
      // (בלי player_id), וכל מה שנרשם עליהם (עומס, יעדים, משימות) יושב על השורה
      // הזו. הוספת שורה חדשה יצרה כפילות והשאירה את ההיסטוריה על הישנה.
      // לכן קודם מחפשים שורה **לא מקושרת** באותה קבוצה עם אותו שם (מנורמל) —
      // בדיוק אחת → מחברים אותה (player_id) ומספרים למאמן. אפס או יותר מאחת →
      // שורה חדשה כמו קודם, עם רמז לחבר ידנית בטאב סגל.
      const merged = await linkToExistingRosterRow(membership, nm)
      if (merged.linked) {
        notifyApproved()
        return { ok: true, linkedTo: merged.name, hint: L(`חובר לשורה הקיימת של ${merged.name}`, `Linked to the existing roster row of ${merged.name}`) }
      }
      const row = { coach_id: membership.coach_id, team: membership.team, name: nm || 'שחקן', status: 'active', player_id: membership.player_id }
      const { error: e2 } = await supabase.from('team_players').insert(row)
      if (e2 && /column .* does not exist/i.test(e2.message)) {
        // פרודקשן שעוד לא הריץ את המיגרציה של player_id — מוסיפים בלי העמודה
        const { player_id: _pid, ...basic } = row
        const { error: e3 } = await supabase.from('team_players').insert(basic)
        if (e3) reportError('decideMembership/roster-insert-basic', e3, L('השחקן אושר אך ההוספה לסגל נכשלה — נסו להוסיף ידנית.', 'The player was approved but adding to the roster failed — try adding manually.'))
      } else if (e2) {
        reportError('decideMembership/roster-insert', e2, L('השחקן אושר אך ההוספה לסגל נכשלה — נסו להוסיף ידנית.', 'The player was approved but adding to the roster failed — try adding manually.'))
      } else {
        notifyApproved()
        // רמז רק כשבאמת נוצרה שורה חדשה (ולא נמצאה שורה אחת מתאימה)
        return { ok: true, created: true, hint: L('נוצרה שורה חדשה — אם השחקן כבר בסגל, חבר אותו לשורה בטאב סגל', 'A new roster row was created — if the player is already on the roster, link him to that row in the roster tab') }
      }
    }
    notifyApproved()
  }
  return { ok: true }
}

// שם לצורך השוואה: רווחים מכווצים, בלי גרשיים/מקפים, בלי רישיות
const normName = (s) => String(s || '')
  .toLowerCase()
  .replace(/[׳״'"`\-–—]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

// 3.9 — מחבר חשבון שחקן לשורת סגל קיימת (לא מקושרת) עם אותו שם.
// מחזיר { linked: true, name } כשחוברה בדיוק שורה אחת; אחרת { linked: false }.
// בטוח לפרוד בלי העמודה player_id — כל שגיאת שליפה/עדכון = לא חוברה.
async function linkToExistingRosterRow(membership, fullName) {
  // 3.9 — בלי פרופיל אין שם אמיתי: fullName הוא אז «שחקן» הגנרי, ושורת סגל
  // שהוקלדה ביד עם השם הזה (יש כאלה) הייתה מתחברת לחשבון לא ידוע. לא מנחשים.
  if (!membership.player) return { linked: false }
  const cands = [fullName]
  const p = membership.player || {}
  // גם שם תצוגה/כינוי, אם הפרופיל מחזיק כזה (לא קיים היום — לא מזיק)
  for (const alt of [p.display_name, p.nickname, `${p.last_name || ''} ${p.first_name || ''}`]) if (alt) cands.push(alt)
  const wanted = new Set(cands.map(normName).filter((n) => n.length >= 2))
  if (wanted.size === 0) return { linked: false }
  const { data, error } = await supabase
    .from('team_players')
    .select('id, name, player_id')
    .eq('coach_id', membership.coach_id)
    .eq('team', membership.team)
    .is('player_id', null)
  if (error) { reportError('decideMembership/link-lookup', error); return { linked: false } }
  const matches = (data || []).filter((r) => wanted.has(normName(r.name)))
  if (matches.length !== 1) return { linked: false }
  const row = matches[0]
  const { error: upErr } = await supabase.from('team_players').update({ player_id: membership.player_id }).eq('id', row.id).is('player_id', null)
  if (upErr) { reportError('decideMembership/link-update', upErr); return { linked: false } }
  return { linked: true, name: row.name }
}

// קודי שגיאה שמשמעותם "העמודה/הטבלה עוד לא קיימת אצל המשתמש הזה" ולא כשל
// אמיתי: 42703 = undefined_column · 42501 = insufficient_privilege (עמודה בלי
// grant) · 42P01 = undefined_table · PGRST204 = העמודה לא ב-schema cache.
// שים לב: ב-PostgREST עמודה חסרה בתוך embed מפילה את *כל* השאילתה — בדיוק
// כך מסך אישור הבקשות היה ריק בפרודקשן. לכן נסיגה, ולא בליעה.
function isMissingColumn(error) {
  if (!error) return false
  if (['42703', '42501', '42P01', 'PGRST204'].includes(error.code)) return true
  return /column .* does not exist|permission denied for (column|table)|does not exist in the schema cache/i
    .test(String(error.message || ''))
}

const REQ_PLAYER_COLS = 'first_name, last_name, position, avatar_url'
const reqSelect = (withStatus) =>
  `*, player:profiles!player_id(${REQ_PLAYER_COLS}${withStatus ? ', approval_status' : ''})`

// בקשות ממתינות לכל הקבוצות של מאמן (עם פרטי השחקן והקשר ההסכמה).
//
// שים לב: אין כאן birth_year — privacy4 שלל את ההרשאה על העמודה הזו,
// והבקשה כולה הייתה מוחזרת כ-42501. גיל השחקן אינו נחוץ כדי לאשר בקשה.
//
// למה שני מקורות להקשר ההסכמה ולא אחד:
//   · approval_status (יש עליו grant מפורש ב-supabase_rls_hardening_3_8.sql,
//     ו-shares_team_with מתיר למאמן לקרוא את שורת הפרופיל של מי שיש לו אצלו
//     שורת חברות בכל סטטוס — כולל 'pending') אומר אם השער סגור, אבל
//     'active' לא מבדיל בין בגיר לבין קטין שההורה שלו כבר אישר.
//   · has_consent(minor,'basic') — SECURITY DEFINER, מוענק ל-authenticated —
//     הוא הסימן היחיד ל"הורה אישר" שהמאמן רשאי לראות. את guardian_* /
//     birth_date שללו במכוון ואין להחזיר אותם.
//
// חוזה החזרה: תמיד מערך (TeamConnect עושה עליו .filter). כשל טעינה מסומן
// בתכונה `loadError` על המערך, כדי שמסך יוכל להבדיל בין "אין בקשות" לבין
// "לא הצלחנו לטעון" — ריק בגלל שגיאה הוא בדיוק הבאג שכבר קרה כאן פעם.
// quiet=true: השגיאה נרשמת ללוג ומסומנת ב-loadError אבל בלי טוסט, למסך
// שמציג פס שגיאה אינליין משלו (שני טוסטים זהים על אותה תקלה זה רעש).
export async function pendingRequests(coachId, { quiet = false } = {}) {
  const run = (withStatus) => supabase
    .from('team_memberships')
    .select(reqSelect(withStatus))
    .eq('coach_id', coachId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  let { data, error } = await run(true)
  let hasStatus = true
  if (error && isMissingColumn(error)) {
    // מסד שטרם הריץ את supabase_parent_consent.sql — נסיגה מדויקת להתנהגות
    // של היום. בלי טוסט: זו לא תקלה של המאמן ולא "אין בקשות".
    console.warn('players.pendingRequests: approval_status לא זמין —', error.message || error)
    hasStatus = false
    ;({ data, error } = await run(false))
  }
  if (reportError('pendingRequests', error,
    quiet ? null : L('טעינת בקשות ההצטרפות נכשלה — נסו לרענן.', 'Loading join requests failed — try refreshing.'))) {
    const failed = []
    failed.loadError = true
    return failed
  }

  const rows = data || []
  if (!hasStatus || rows.length === 0) return rows

  return Promise.all(rows.map(async (r) => {
    const status = r.player?.approval_status
    // הפרופיל לא נקרא (או שהעמודה חזרה ריקה) — בדיוק כמו היום, בלי הקשר
    if (!status || !r.player_id) return r
    // רק 'active' דורש בירור: pending_parent/suspended = ההורה בוודאות לא אישר
    if (status !== 'active') return { ...r, approval_status: status, parent_approved: false }
    const { data: granted, error: cErr } = await supabase
      .rpc('has_consent', { p_minor: r.player_id, p_type: 'basic' })
    if (cErr) {
      // RPC חסר = המיגרציה טרם רצה; שגיאה אחרת נרשמת ללוג. בשני המקרים
      // parent_approved נשאר undefined — עדיף בלי תג מאשר תג שקרי.
      if (!isMissingRpc(cErr)) console.error('players.pendingRequests/has_consent:', cErr.message || cErr)
      return { ...r, approval_status: status }
    }
    return { ...r, approval_status: status, parent_approved: !!granted }
  }))
}

// ---------- הצלבת גיל: מה שרשום בסגל מול מה שהשחקן הצהיר ----------
// למה זה קיים: תאריך הלידה נאסף פעמיים ובאופן בלתי תלוי — המאמן מקליד אותו
// בשורת הסגל (team_players.birth_date), והשחקן מצהיר עליו בפרופיל שלו.
// כששני המקורות לא מסכימים אף אחד לא יודע מי צודק, ובמקרה הגרוע ההפרש הוא
// בדיוק הקו שבין קטין לבגיר — כלומר בין "נדרש אישור הורה" ל"לא נדרש".
// התפקיד של השכבה הזו הוא רק להביא את שני המספרים למאמן. היא לא מכריעה,
// לא מתקנת ולא מסמנת אשם — ההכרעה היא של האדם שמכיר את המשפחה.

// "המיגרציה עוד לא רצה" עבור הקריאות האלה: פונקציה חסרה (PGRST202/42883),
// טבלה או עמודה שהיא נשענת עליהן (42P01/42703), grant execute שלא ניתן
// (42501 — פריסה חלקית, לא תקלה של המאמן) או קאש PostgREST ישן (PGRST205).
// בכל אחד מאלה המסך חייב להיראות *בדיוק* כמו היום: בלי פאנל ובלי טוסט.
function isAgeRpcMissing(error) {
  if (!error) return false
  if (isMissingRpc(error) || isMissingColumn(error)) return true
  return error.code === 'PGRST205'
}

// סדר ההצגה. critical = שני המקורות חלוקים על עצם היות השחקן קטין.
const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 }

// חומרה שלא מוכרת לנו לא נבלעת ולא מוצגת כ"קטנה": עדיף להטריד את המאמן
// בפער אמיתי מאשר להחביא ממנו ערך חדש שהשרת התחיל להחזיר.
// hasOwnProperty ולא [s] === undefined: severity בשם 'toString' היה עובר
// דרך מפתחות ה-prototype ומגיע ל-UI כערך שלא קיים בטבלת התוויות.
const normSeverity = (s) => (Object.prototype.hasOwnProperty.call(SEVERITY_RANK, s) ? s : 'major')

// התאריך אמור לחזור כ-date ('YYYY-MM-DD'). אם השרת יחזיר timestamp מלא —
// חותכים ליום, כי הפורמטר בצד הלקוח מצפה בדיוק לצורה הזו. ערך שלא נראה
// כתאריך הופך ל-null: המסך יציג אז את הגיל בלבד, ולא מחרוזת ג׳יבריש.
const dateOnly = (v) => {
  if (!v) return null
  const s = String(v)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

// גיל/תאריך חוזרים מהשרת כמספר וכ-date. ממירים בזהירות: NaN בתצוגה גרוע
// יותר מ"אין נתון", ולכן ערך שלא ניתן להמרה הופך ל-null.
const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeMismatch(r) {
  return {
    player_id: r.player_id,
    name: r.name || '',
    team: r.team || '',
    coach_age: numOrNull(r.coach_age),
    player_age: numOrNull(r.player_age),
    coach_birth: dateOnly(r.coach_birth),
    player_birth: dateOnly(r.player_birth),
    severity: normSeverity(r.severity),
    approval_status: r.approval_status || null,
  }
}

// אי-התאמות הגיל של מאמן, בכל הקבוצות שלו, ממוינות לפי חומרה.
//
// חוזה החזרה זהה ל-pendingRequests ומאותה סיבה: תמיד מערך (הקורא עושה עליו
// .filter), וכשל טעינה מסומן בתכונה `loadError` — כדי שהמסך יבדיל בין
// "אין אי-התאמות" (מצב תקין ורצוי) לבין "לא הצלחנו לבדוק". ריק בגלל שגיאה
// הוא בדיוק הבאג שכבר הפיל את מסך הבקשות בפרודקשן.
// quiet=true: השגיאה נרשמת ומסומנת ב-loadError אבל בלי טוסט, למסך שמציג
// פס שגיאה אינליין משלו.
export async function ageMismatches(coachId, { quiet = false } = {}) {
  const { data, error } = await supabase
    .rpc('age_mismatches', { p_coach: coachId || null })
  if (error) {
    if (isAgeRpcMissing(error)) {
      // לא כשל — פשוט מסד שטרם הריץ את supabase_age_crosscheck.sql
      console.warn('players.ageMismatches: age_mismatches לא זמין —', error.message || error)
      return []
    }
    reportError('ageMismatches', error, quiet ? null : L(
      'בדיקת תאריכי הלידה בסגל נכשלה — נסו לרענן.',
      'Checking the roster birth dates failed — try refreshing.'))
    const failed = []
    failed.loadError = true
    return failed
  }
  // setof מוחזר כמערך; מגינים גם מפני צורה אחרת כדי שלא ניפול על .filter
  const rows = Array.isArray(data) ? data : (data ? [data] : [])
  return rows
    .filter((r) => r && r.player_id)
    .map(normalizeMismatch)
    .sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
      || String(a.name).localeCompare(String(b.name)))
}

// מונה בלבד, לתג/צ׳יפ במסך שלא צריך את השורות עצמן.
// בלי טוסט במכוון: זו קריאת רקע לתג, והמסך שמציג את הרשימה כבר מתריע על
// אותה תקלה — שני טוסטים זהים על אותה שגיאה זה רעש. 0 = "אין מה להראות",
// וזו גם התשובה כשהמיגרציה טרם רצה.
export async function ageMismatchCount() {
  const { data, error } = await supabase.rpc('age_mismatch_count')
  if (error) {
    if (!isAgeRpcMissing(error)) console.error('players.ageMismatchCount:', error.message || error)
    return 0
  }
  const n = numOrNull(Array.isArray(data) ? data[0] : data)
  return n == null || n < 0 ? 0 : n
}

// כל החברויות של שחקן (עם פרטי המאמן)
export async function myMemberships(playerId) {
  const { data, error } = await supabase
    .from('team_memberships')
    .select('*, coach:profiles!coach_id(first_name, last_name, club, avatar_url)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
  if (reportError('myMemberships', error, L('טעינת הקבוצות שלך נכשלה — נסו לרענן.', 'Loading your teams failed — try refreshing.'))) return []
  return data || []
}
