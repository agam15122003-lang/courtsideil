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
      '🏀 פתחתי לנו משהו חדש ב-CourtSide — *עולם הכדורסל*.\n\n' +
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

  // תזכורת פתיחת אתגר.
  // ⚠ המועד מגיע מהאתגר עצמו ואינו כתוב בקוד: הבעלים קובע יום ושעה לכל
  // אתגר בנפרד, והודעה שאומרת «עד שבת» כשהחלון נסגר בחמישי גרועה מכלום.
  challengeOpen: (title, closesAt, ref) => {
    const when = closesAt
      ? new Intl.DateTimeFormat('he-IL', {
          weekday: 'long', day: 'numeric', month: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
        }).format(new Date(closesAt))
      : null
    return L(
      `🔥 אתגר חדש: *${title}*\n` +
        (when ? `החלון פתוח עד ${when}.\n` : '') +
        'הגשה אחת, טייק אחד, והטיימר חייב להיראות בפריים.\n' +
        `${courtLink(ref)}`,
      `🔥 New challenge: *${title}*\n` +
        (when ? `Open until ${when}.\n` : '') +
        'One submission, one take, timer visible in frame.\n' +
        `${courtLink(ref)}`,
    )
  },

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
      `אני במקום ${rank} בעולם הכדורסל של CourtSide החודש 🏀\nנראה אותך עוקף:\n${courtLink(ref)}`,
      `I'm ranked ${rank} in the CourtSide basketball world this month 🏀\nSee if you can pass me:\n${courtLink(ref)}`,
    ),
}

// ===== אדמין: האתגר =====

export async function adminChallenges() {
  const { data, error } = await supabase
    .from('game_challenges')
    .select('id, seq, title, subtitle, metric_label, metric_unit, status, opens_at, closes_at, decide_at, prize, rules_url, min_entries_for_prize')
    .order('seq', { ascending: true, nullsFirst: false })
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true, rows: data || [] }
}

// חלון ברירת המחדל לפי ההגדרות — רק הצעה, האדמין משנה כרצונו
export async function defaultWindow(from) {
  const r = await callRpc('game_default_window', from ? { p_from: from } : {})
  if (!r.ok) return r
  return { ok: true, window: (r.rows && r.rows[0]) || null }
}

export async function openChallenge(id, opens, closes, decide) {
  return callRpc('game_open_challenge', {
    p_challenge: id, p_opens: opens || null, p_closes: closes || null, p_decide: decide || null,
  })
}

// שינוי תוך כדי — שולחים רק את מה שמשנים
export async function rescheduleChallenge(id, { opens, closes, decide } = {}) {
  return callRpc('game_reschedule_challenge', {
    p_challenge: id, p_opens: opens || null, p_closes: closes || null, p_decide: decide || null,
  })
}

export async function decideChallenge(id, redecide = false) {
  return callRpc('game_decide_challenge', { p_challenge: id, p_redecide: redecide })
}

// ===== אדמין: תור האישור =====

export async function reviewQueue(challengeId) {
  let q = supabase
    .from('game_challenge_submissions')
    .select('id, challenge_id, user_id, media_path, reported_score, status, version, allow_publish, no_others_in_frame, age_flagged, submitted_at')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })
  if (challengeId) q = q.eq('challenge_id', challengeId)
  const { data, error } = await q
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true, rows: data || [] }
}

// ⚠ version הוא חובה, וזו לא פורמליות: בלעדיו אתה מאשר סרטון שהוחלף
// בין הרגע שפתחת את הנגן לרגע שלחצת «אשר».
export async function reviewSubmission(id, version, action, score, reason) {
  return callRpc('game_review_submission', {
    p_id: id, p_version: version, p_action: action,
    p_score: score ?? null, p_reason: reason || null,
  })
}

export async function challengeTop5(challengeId) {
  return callRpc('game_challenge_top5', { p_challenge: challengeId })
}

// רישום פרסום — חובה לפני הורדת קליפ. בלי המרשם, בקשת הורה למחוק הכל
// אינה יכולה להצביע על הפוסט שכבר עלה.
export async function recordPublication({ submissionId, challengeId, userId, url, note }) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('game_publications').insert({
    submission_id: submissionId || null,
    challenge_id: challengeId || null,
    user_id: userId,
    platform: 'instagram',
    external_url: url || null,
    posted_by: u?.user?.id || null,
    note: note || null,
  })
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true }
}

// ===== שחקן: האתגר הפעיל =====

const CHALLENGE_COLS = 'id, title, subtitle, metric_label, metric_unit, metric_dir, rules_text, prize, sponsor_name, rules_url, opens_at, closes_at, decide_at, status'

// האתגר להצגה: הפתוח אם יש; אחרת האחרון שהוכרע — כדי שהפודיום
// והתוצאות יישארו על המסך גם אחרי ההכרזה, עד שנפתח אתגר חדש.
export async function activeChallenge() {
  let { data, error } = await supabase
    .from('game_challenges')
    .select(CHALLENGE_COLS)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  if (!data) {
    const last = await supabase
      .from('game_challenges')
      .select(CHALLENGE_COLS)
      .in('status', ['decided', 'closed'])
      .order('closes_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (!last.error) data = last.data
  }
  return { ok: true, challenge: data || null }
}

export async function mySubmission(challengeId) {
  const { data: u } = await supabase.auth.getUser()
  const uid = u?.user?.id
  if (!uid) return { ok: false, reason: 'no_session' }
  const { data, error } = await supabase
    .from('game_challenge_submissions')
    .select('id, status, reported_score, approved_score, reject_reason, version, allow_publish, no_others_in_frame, media_path')
    .eq('challenge_id', challengeId)
    .eq('user_id', uid)
    .maybeSingle()
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true, submission: data || null, uid }
}

export async function submitChallenge({ challengeId, uid, mediaPath, score, allowPublish, noOthers, existingId }) {
  const row = {
    challenge_id: challengeId,
    user_id: uid,
    media_path: mediaPath,
    reported_score: score,
    allow_publish: !!allowPublish,
    no_others_in_frame: !!noOthers,
  }
  const res = existingId
    ? await supabase.from('game_challenge_submissions').update(row).eq('id', existingId)
    : await supabase.from('game_challenge_submissions').insert(row)
  if (res.error) {
    const e = res.error
    if (isNotDeployed(e)) return { ok: false, notDeployed: true }
    if (e.code === '54000') return { ok: false, reason: 'too_many', message: e.message }
    if (e.code === '42501' || /row-level security/i.test(e.message || '')) {
      return { ok: false, reason: 'closed', message: 'חלון ההגשה נסגר, או שהחשבון עוד לא אושר.' }
    }
    return { ok: false, reason: 'error', message: e.message }
  }
  return { ok: true }
}

// ===== הפיד החי =====
// דרך RPC בלבד — לא קריאת טבלה. הסקירה האדוורסרית תפסה שמדיניות SELECT
// רחבה חושפת את כל העמודות (כולל age_flagged — החלטת מודרציה על קטין),
// כי PostgREST מכבד כל select= שהקורא שולח. ה-RPC מחזירה עמודות בטוחות
// בלבד, כבר ממוינות ועם שם התצוגה מוכן — גם אין יותר N+1 על השמות.
export async function challengeFeed(challengeId) {
  return callRpc('game_challenge_feed', { p_challenge: challengeId })
}

// שמות תצוגה לפיד — דרך game_display_name בשרת, בלי לגעת ב-profiles
const NAME_CACHE = new Map()
export async function displayNames(userIds) {
  const out = {}
  await Promise.all([...new Set(userIds)].map(async (id) => {
    if (NAME_CACHE.has(id)) { out[id] = NAME_CACHE.get(id); return }
    const r = await callRpc('game_display_name', { p_user: id })
    const name = r.ok ? (r.data || 'שחקן') : 'שחקן'
    NAME_CACHE.set(id, name)
    out[id] = name
  }))
  return out
}

export async function deleteMySubmission(challengeId) {
  const r = await callRpc('game_delete_my_submission', { p_challenge: challengeId })
  const d = r.data || {}
  // מחיקת הקובץ הפיזי — מחיקת שורה מ-storage.objects ב-SQL אינה מוחקת
  // את הקובץ עצמו. best-effort: כישלון משאיר בלוב יתום, לא באג פונקציונלי.
  if (r.ok && d.ok !== false && d.media_path) {
    try { await supabase.storage.from('media').remove([d.media_path]) } catch { /* ignore */ }
  }
  return r
}

// ===== חידונים =====

export async function weeklyQuiz() {
  const { data, error } = await supabase
    .from('game_quizzes')
    .select('id, title, kind, seconds_per_q, status, question_ids')
    .eq('kind', 'weekly')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true, quiz: data || null }
}

export async function myAttempt(quizId) {
  const { data: u } = await supabase.auth.getUser()
  const uid = u?.user?.id
  if (!uid) return { ok: false, reason: 'no_session' }
  const { data, error } = await supabase
    .from('game_quiz_attempts')
    .select('id, score, correct_count, finished_at')
    .eq('quiz_id', quizId).eq('user_id', uid)
    .maybeSingle()
  if (error) return { ok: false, reason: 'error', message: error.message }
  return { ok: true, attempt: data || null }
}

// חידון אישי שנבנה לבד — בחירת קושי ומשחקים. אין המתנה לאדמין.
export async function quizSolo(difficulty, count, seconds) {
  return callRpc('game_quiz_solo', {
    p_difficulty: difficulty || null,
    p_count: count || 8,
    p_seconds: seconds || 20,
  })
}

export async function quizStart(quizId, duelId) {
  return callRpc('game_quiz_start', { p_quiz: quizId, p_duel: duelId || null })
}
export async function quizNext(attemptId) {
  return callRpc('game_quiz_next', { p_attempt: attemptId })
}
export async function quizAnswer(attemptId, questionId, chosen) {
  return callRpc('game_quiz_answer', { p_attempt: attemptId, p_question: questionId, p_chosen: chosen })
}
export async function quizFinish(attemptId) {
  return callRpc('game_quiz_finish', { p_attempt: attemptId })
}

// ===== דו-קרב =====
export async function duelCreate(count, seconds) {
  return callRpc('game_duel_create', { p_count: count || 6, p_seconds: seconds || 20 })
}
export async function duelJoin(code) {
  return callRpc('game_duel_join', { p_code: code })
}
export async function myDuels() {
  const { data: u } = await supabase.auth.getUser()
  const uid = u?.user?.id
  if (!uid) return { ok: false, reason: 'no_session' }
  const { data, error } = await supabase
    .from('game_duels')
    .select('id, quiz_id, challenger_id, opponent_id, invite_code, status, winner_id, is_draw, created_at, expires_at')
    .or(`challenger_id.eq.${uid},opponent_id.eq.${uid}`)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true, rows: data || [], uid }
}

export const duelInvite = (code) =>
  L(
    `🏀 דו-קרב כדורסל! אותן שאלות, טיימר רץ — מי חכם יותר?\n` +
      `הקוד שלך: *${code}*\n` +
      `נכנסים לעולם הכדורסל ב-CourtSide, לוחצים «דו-קרב», מזינים את הקוד:\n${courtLink()}`,
    `🏀 Basketball duel! Same questions, clock running — who knows more?\n` +
      `Your code: *${code}*\n` +
      `Open the basketball world on CourtSide, tap "Duel", enter the code:\n${courtLink()}`,
  )

// ===== אדמין: חידונים =====
export async function adminQuizzes() {
  const { data, error } = await supabase
    .from('game_quizzes')
    .select('id, title, kind, status, seconds_per_q, question_ids, created_at')
    .eq('kind', 'weekly')
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) {
    if (isNotDeployed(error)) return { ok: false, notDeployed: true }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true, rows: data || [] }
}
export async function buildQuiz({ title, count, categories, difficulty, seconds }) {
  return callRpc('game_build_quiz', {
    p_title: title, p_count: count || 8,
    p_categories: categories || null, p_difficulty: difficulty || null,
    p_seconds: seconds || 20, p_kind: 'weekly',
  })
}
export async function setQuizStatus(id, status) {
  const { error } = await supabase.from('game_quizzes').update({ status }).eq('id', id)
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}
