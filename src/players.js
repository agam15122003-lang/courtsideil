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
      const row = { coach_id: membership.coach_id, team: membership.team, name: nm || 'שחקן', status: 'active', player_id: membership.player_id }
      const { error: e2 } = await supabase.from('team_players').insert(row)
      if (e2 && /column .* does not exist/i.test(e2.message)) {
        // פרודקשן שעוד לא הריץ את המיגרציה של player_id — מוסיפים בלי העמודה
        const { player_id: _pid, ...basic } = row
        const { error: e3 } = await supabase.from('team_players').insert(basic)
        if (e3) reportError('decideMembership/roster-insert-basic', e3, L('השחקן אושר אך ההוספה לסגל נכשלה — נסו להוסיף ידנית.', 'The player was approved but adding to the roster failed — try adding manually.'))
      } else if (e2) {
        reportError('decideMembership/roster-insert', e2, L('השחקן אושר אך ההוספה לסגל נכשלה — נסו להוסיף ידנית.', 'The player was approved but adding to the roster failed — try adding manually.'))
      }
    }
    sendNotification({
      to: membership.player_id, actor: membership.coach_id, type: 'message',
      content: 'המאמן אישר אותך לקבוצה! 🎉', nav: 'drills',
    })
  }
  return { ok: true }
}

// בקשות ממתינות לכל הקבוצות של מאמן (עם פרטי השחקן).
// שים לב: אין כאן birth_year — privacy4 שלל את ההרשאה על העמודה הזו,
// והבקשה כולה הייתה מוחזרת כ-42501. גיל השחקן אינו נחוץ כדי לאשר בקשה;
// אם ייווצר צורך — דרך RPC ייעודי שמחזיר רק את מה שהמאמן באמת צריך.
export async function pendingRequests(coachId) {
  const { data, error } = await supabase
    .from('team_memberships')
    .select('*, player:profiles!player_id(first_name, last_name, position, avatar_url)')
    .eq('coach_id', coachId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (reportError('pendingRequests', error, L('טעינת בקשות ההצטרפות נכשלה — נסו לרענן.', 'Loading join requests failed — try refreshing.'))) return []
  return data || []
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
