// game.js — שכבת הלקוח היחידה מעל עולם המשחק (האתגר והניחושים).
//
// כל קריאה מחזירה אובייקט אחיד `{ ok, rows?, data?, notDeployed?, reason? }`
// ולעולם אינה זורקת. הסיבה: המסכים של עולם המשחק נטענים גם בפרוד שטרם
// הריץ את המיגרציות 38–43, וחייבים להציג מצב «עוד לא פרוס» ולא מסך שבור.
//
// ⚠ אין כאן שום חישוב נקודות. הנקודות נכתבות ונקראות אך ורק בשרת —
// ללקוח יש grant select על הפנקס וזהו. ראה supabase_game_core_12_8.sql §3.

import { supabase } from './supabaseClient'
import { isNotDeployed } from './consent'
import { L } from './i18n'
import { SITE_URL } from './constants'

// ===== קריאה אחידה =====
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
    return { ok: false, reason: 'error', message: error.message || '', code: error.code }
  }
  if (Array.isArray(data)) return { ok: true, rows: data }
  if (data && typeof data === 'object') return { ok: true, data }
  return { ok: true, data }
}

// ===== שעון השרת =====
// כל טיימר וכל נעילה נמדדים מול שעון השרת, לא מול שעון המכשיר. בלי זה
// הילד רואה «נותרו 3 שניות», לוחץ, ומקבל «המשחק כבר התחיל» — והוא צודק
// לפי השעון שלו. offsetMs נמדד פעם אחת לכל טעינה.
let offsetMs = 0
let offsetReady = false

export async function syncServerClock() {
  const t0 = Date.now()
  const r = await callRpc('server_now')
  if (!r.ok || !r.data) return false
  const server = new Date(r.data).getTime()
  if (!Number.isFinite(server)) return false
  // מפחיתים חצי סיבוב הלוך-חזור — קירוב טוב דיו לשניות
  offsetMs = server - (t0 + (Date.now() - t0) / 2)
  offsetReady = true
  return true
}

export function serverNow() {
  return new Date(Date.now() + offsetMs)
}

export function clockSynced() {
  return offsetReady
}

// ===== מי אני בעולם המשחק =====
export async function gameMe() {
  const r = await callRpc('game_me')
  if (!r.ok) return r
  const row = Array.isArray(r.rows) ? r.rows[0] : r.data
  return { ok: true, me: row || null }
}

export async function gameSettings() {
  const { data, error } = await supabase
    .from('game_settings')
    .select('challenge_rules, video_max_seconds, video_max_mb, prizes_enabled, rules_url')
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true, settings: data || null }
}

// ===== «אני בפנים» =====
export async function joinCourt(source) {
  const { data: u } = await supabase.auth.getUser()
  const uid = u?.user?.id
  if (!uid) return { ok: false, reason: 'no_session' }
  const { error } = await supabase
    .from('game_participants')
    .insert({ user_id: uid, source: source || null })
  // כבר בפנים — לא שגיאה מבחינת המשתמש
  if (error && error.code === '23505') return { ok: true, already: true }
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true }
}

// ===== הטבלאות =====
// כל שש הטבלאות הן הקריאה הזו עם פרמטרים אחרים.
//   scope : 'challenge' | 'predictions'
//   period: 'month' | 'season' | 'round'
//   key   : מפתח התקופה ('2026-08' / '2026/2027' / מזהה מחזור). null = הנוכחית.
export async function board({ scope = 'challenge', period = 'month', key = null, league = null, limit = 50, offset = 0 } = {}) {
  return callRpc('game_board', {
    p_scope: scope, p_period: period, p_key: key,
    p_league: league, p_limit: limit, p_offset: offset,
  })
}

export async function myStanding({ scope = 'challenge', period = 'month', key = null, league = null } = {}) {
  const r = await callRpc('game_my_standing', {
    p_scope: scope, p_period: period, p_key: key, p_league: league,
  })
  if (!r.ok) return r
  return { ok: true, standing: (r.rows && r.rows[0]) || null }
}

export async function myPoints({ scope = 'challenge', period = 'month', key = null } = {}) {
  return callRpc('game_my_points', { p_scope: scope, p_period: period, p_key: key })
}

export async function periodKeys() {
  const r = await callRpc('game_period_keys')
  if (!r.ok) return r
  return { ok: true, keys: (r.rows && r.rows[0]) || null }
}

// ===== אדמין =====
export async function kpis() {
  const r = await callRpc('game_kpis')
  if (!r.ok) return r
  return { ok: true, kpis: (r.rows && r.rows[0]) || null }
}

// ===== ערכת ההודעות לוואטסאפ =====
//
// הבעלים בחר להביא את השחקנים דרך לינק בקבוצת הוואטסאפ, ולכן איכות
// ההודעה היא לא קישוט — היא המשפך עצמו. הקישור מוביל ל-#/court, שמדלג
// על בחירת התפקיד ועל מסך קוד-הקבוצה ונוחת ישר על המגרש.

export function courtLink(ref) {
  const base = `${SITE_URL}/#/court`
  return ref ? `${SITE_URL}/#/r/${encodeURIComponent(ref)}` : base
}

export const messageKit = {
  // הודעת הפתיחה לקבוצת הקבוצה
  invite: (ref) =>
    L(
      '🏀 פתחתי לנו משהו חדש ב-CourtSide — *המגרש*.\n\n' +
        'כל שבוע אתגר כדורסל אחד: מצלמים, מעלים, ומי שהכי טוב עולה לעמוד האינסטגרם.\n' +
        'ההרשמה לוקחת דקה, וזה חינם:\n' +
        `${courtLink(ref)}\n\n` +
        'מי שמתחת לגיל 18 — בסוף ההרשמה תקבלו קישור קצר לשלוח להורים לאישור.',
      '🏀 Something new on CourtSide — *the Court*.\n\n' +
        'One basketball challenge every week: film it, upload it, and the best go up on Instagram.\n' +
        'Signing up takes a minute, and it is free:\n' +
        `${courtLink(ref)}\n\n` +
        'Under 18 — at the end you will get a short link to send your parents for approval.',
    ),

  // תזכורת פתיחת אתגר
  challengeOpen: (title, ref) =>
    L(
      `🔥 אתגר חדש במגרש: *${title}*\n` +
        'החלון פתוח עד שבת בצהריים. הגשה אחת, טייק אחד, והטיימר חייב להיראות בפריים.\n' +
        `${courtLink(ref)}`,
      `🔥 New challenge on the Court: *${title}*\n` +
        'Open until Saturday noon. One submission, one take, timer visible in frame.\n' +
        `${courtLink(ref)}`,
    ),

  // דחיית הגשה — נשלחת מהתור, כדי שדחייה לא תיראה כהתעלמות
  rejected: (name, reason) =>
    L(
      `היי ${name || ''}, ראיתי את הקליפ 🙏\n` +
        `לא אישרתי אותו כי: ${reason}\n` +
        'אפשר לצלם שוב ולהעלות — החלון עוד פתוח, וההגשה האחרונה היא זו שנספרת.',
      `Hi ${name || ''}, I watched your clip 🙏\n` +
        `I could not approve it because: ${reason}\n` +
        'You can film again and re-upload — the window is still open, and the last submission counts.',
    ),

  // שיתוף מקום בטבלה — מנוע הצמיחה של הלולאה
  standing: (rank, ref) =>
    L(
      `אני במקום ${rank} במגרש של CourtSide החודש 🏀\nנראה אותך עוקף:\n${courtLink(ref)}`,
      `I'm ranked ${rank} on the CourtSide Court this month 🏀\nSee if you can pass me:\n${courtLink(ref)}`,
    ),
}
