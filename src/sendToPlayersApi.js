import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import { L } from './i18n'
import { PLAYER_SIDE } from './flags'

// מודול משותף לשליחת תרגולים לשחקנים (אישי + קבוצתי).
// player_assignments תומך: coach_id, team, player_id, drill_id, plan_id, video_url, title, note, due_date.

// טוען את הסגל של המאמן: קבוצות + שחקנים מחוברים (עם חשבון)
export async function loadRoster(coachId) {
  const { data } = await supabase
    .from('team_players')
    .select('id, name, number, team, position, player_id')
    .eq('coach_id', coachId)
    .order('team').order('number')
  const rows = data || []
  const teams = [...new Set(rows.map((r) => r.team))]
  // צד שחקן פתוח: רק מי שחיבר חשבון. צד המאמן בלבד (22.8): כל הסגל —
  // המשימה נרשמת על שורת הסגל (roster_id) והמאמן מסמן ביצוע בעצמו.
  const players = PLAYER_SIDE ? rows.filter((r) => r.player_id) : rows
  return { teams, players }
}

// מזהה הבחירה של שחקן ברשימות: חשבון (צד שחקן) או שורת סגל (צד מאמן)
export const pickId = (p) => (PLAYER_SIDE ? p.player_id : p.id)

// שולח שיגור אחד או יותר.
// opts: { coachId, mode:'team'|'players', team, players:[{player_id,...}], content:{drillId,planId,videoUrl,title,kind}, note, dueDate, target, unit }
export async function sendAssignments({ coachId, mode, team, players = [], content = {}, note, dueDate, target, unit, repeatWeeks = 1 }) {
  const base = { coach_id: coachId }
  if (content.drillId) base.drill_id = content.drillId
  if (content.planId) base.plan_id = content.planId
  // 18.8 — תוכנית: מה השחקן רואה ('drills' | 'page'); העמודה מ-supabase_notebook_18_8.sql
  if (content.planId && content.planView) base.plan_view = content.planView
  if (content.videoUrl) base.video_url = content.videoUrl
  if (content.title) base.title = content.title
  if (note) base.note = note
  if (dueDate) base.due_date = dueDate
  // יעד כמותי (למשל 200 זריקות) — שיגור קבוצתי הוא שורה אחת, אז היעד אחיד לכולם
  if (Number(target) > 0) { base.target_value = Number(target); base.unit = (unit || '').trim() || null }

  const label = content.title || L('תרגיל', 'a drill')
  let rows = []
  let recipients = []

  if (mode === 'team') {
    rows = [{ ...base, team }]
    // התראה לכל שחקן מחובר בקבוצה (שיגור קבוצתי מוסיף שורה אחת בלבד — משדרים ידנית)
    const { data } = await supabase
      .from('team_players')
      .select('player_id, team')
      .eq('coach_id', coachId)
      .eq('team', team)
    recipients = (data || []).map((r) => r.player_id).filter(Boolean)
  } else {
    // צד המאמן בלבד: שורת הסגל היא הנמען (roster_id); חשבון — אם יש
    rows = players.map((p) => (PLAYER_SIDE
      ? { ...base, player_id: p.player_id }
      : { ...base, player_id: p.player_id || null, roster_id: p.id }))
    recipients = players.map((p) => p.player_id).filter(Boolean)
  }

  // א-2 — הקצאה חוזרת: עותק לכל שבוע, עם תאריך יעד שנדחף ב-7 ימים.
  // דורש תאריך יעד — בלעדיו אין למחזור משמעות (ה-UI אוכף את זה).
  if (repeatWeeks > 1 && dueDate) {
    const addWeeks = (d, k) => {
      const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + 7 * k)
      const pad = (n) => String(n).padStart(2, '0')
      return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate())
    }
    rows = Array.from({ length: repeatWeeks }, (_, k) => rows.map((r) => ({ ...r, due_date: addWeeks(dueDate, k) }))).flat()
  }

  let { error } = await supabase.from('player_assignments').insert(rows)
  let warn = null
  // PostgREST מציין את **שם** העמודה החסרה בהודעה (PGRST204 / 42703), ומדווח
  // עמודה אחת בכל ניסיון. לכן כל ענף נפילה-לאחור בודק את ההודעה ולא את
  // הקוד — אחרת plan_view/target_value חסרים היו נתפסים כ«אין roster_id».
  const mentions = (e, re) => !!e && re.test(e.message || '')
  const rosterOnly = (list) => list.some((r) => r.roster_id && !r.player_id)
  const NEED_22_8 = () => L('צריך להריץ את supabase_coach_only_22_8.sql כדי לרשום משימות לשחקנים', 'Run supabase_coach_only_22_8.sql to log tasks for players')
  // מסד שטרם הריץ supabase_coach_only_22_8.sql: אין עמודת roster_id.
  // לשחקן בלי חשבון אין לאן לרשום — זו שגיאה ברורה, לא «נשלח» מזויף.
  if (error && rows.some((r) => r.roster_id) && mentions(error, /roster_id/i)) {
    if (rosterOnly(rows)) return { ok: false, error: NEED_22_8() }
    rows = rows.map(({ roster_id: _r, ...r }) => r)
    ;({ error } = await supabase.from('player_assignments').insert(rows))
  }
  // מדיניות ה-insert (assign_coach_write מ-4.8) שעוד לא מכירה שורת-סגל-בלבד
  // מחזירה 42501 — גם זה «צריך להריץ את 22.8», לא תקלת הרשאות סתומה.
  if (error && error.code === '42501' && rosterOnly(rows)) return { ok: false, error: NEED_22_8() }
  // עמודות שאולי טרם נוספו בפרוד: target_value/unit (supabase_assignments_progress.sql)
  // ו-plan_view (supabase_notebook_18_8.sql). מסירים אותן **במצטבר** — קודם
  // כל אחת ניסתה בנפרד, וכשחסרו שתיהן כל הניסיונות נכשלו והשיגור «נכשל»
  // למרות שהוא היה עובר בלי שתיהן.
  let payload = rows
  const strip = (fn) => { payload = payload.map(fn) }
  if (error && base.target_value != null && mentions(error, /target_value|unit/i)) {
    strip(({ target_value: _t, unit: _u, ...r }) => r)
    const retry = await supabase.from('player_assignments').insert(payload)
    if (!retry.error) {
      error = null
      warn = PLAYER_SIDE
        ? L('נשלח בלי היעד הכמותי — צריך להריץ את מיגרציית ה-SQL החדשה', 'Sent without the target — the new SQL migration must be run')
        : L('נרשם בלי היעד הכמותי — צריך להריץ את supabase_assignments_progress.sql', 'Logged without the target — run supabase_assignments_progress.sql')
    } else {
      error = retry.error
    }
  }
  // מסד שטרם הריץ supabase_notebook_18_8.sql — בלי plan_view. שולחים בלי,
  // והשחקן יראה את ברירת המחדל (רשימת התרגילים).
  if (error && base.plan_view && mentions(error, /plan_view/i)) {
    strip(({ plan_view: _v, ...r }) => r)
    const retry = await supabase.from('player_assignments').insert(payload)
    if (!retry.error) {
      error = null
      if (base.plan_view === 'page') warn = PLAYER_SIDE
        ? L('נשלח כרשימת תרגילים — צריך להריץ את מיגרציית ה-SQL של המחברת (supabase_notebook_18_8.sql)', 'Sent as a drills list — the notebook SQL migration must be run (supabase_notebook_18_8.sql)')
        : L('נרשם כרשימת תרגילים — צריך להריץ את supabase_notebook_18_8.sql', 'Logged as a drills list — run supabase_notebook_18_8.sql')
    } else {
      error = retry.error
    }
  }
  // roster_id שצף רק אחרי ההסרות (PostgREST מדווח עמודה אחת בכל פעם)
  if (error && mentions(error, /roster_id/i) && rosterOnly(payload)) return { ok: false, error: NEED_22_8() }
  if (error && error.code === '42501' && rosterOnly(payload)) return { ok: false, error: NEED_22_8() }
  if (error) return { ok: false, error: error.message }

  for (const to of recipients) {
    sendNotification({ to, actor: coachId, type: 'message', content: L('המאמן שלח לך תרגול חדש', 'Your coach sent you new training'), nav: 'drills' })
  }
  // מספר הנמענים, לא מספר השורות: משימה חוזרת ל-2 שחקנים ×4 שבועות היא
  // 8 שורות — והמסך דיווח «נרשם ל-8 שחקנים».
  return { ok: true, count: mode === 'team' ? recipients.length : players.length, warn }
}

// טוען את השיגורים האחרונים של המאמן + כמה סימנו בוצע
export async function loadSentFeed(coachId, roster) {
  const { data: asg } = await supabase
    .from('player_assignments')
    .select('*, drill:drills(title), plan:training_plans(name)')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })
    .limit(20)
  const rows = asg || []
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  // בוצע = done_at מלא; שורה עם done_at=null היא התקדמות חלקית בלבד.
  // צד המאמן בלבד: הסימונים של המאמן (assignment_coach_marks), לא של השחקן.
  const { data: compl } = await supabase
    .from(PLAYER_SIDE ? 'assignment_completions' : 'assignment_coach_marks')
    .select('assignment_id, done_at')
    .in('assignment_id', ids)
  const doneBy = {}
  for (const c of compl || []) if (c.done_at) doneBy[c.assignment_id] = (doneBy[c.assignment_id] || 0) + 1

  // גודל קבוצה = כמה שחקנים (מחוברים, או כל הסגל בצד המאמן) בקבוצה — למכנה של אחוז הביצוע
  const teamSize = {}
  for (const p of (roster?.players || [])) teamSize[p.team] = (teamSize[p.team] || 0) + 1

  return rows.map((r) => ({
    ...r,
    title: r.drill?.title || r.plan?.name || r.title || (r.video_url ? L('סרטון', 'Video') : L('משימה', 'Task')),
    done: doneBy[r.id] || 0,
    total: (r.player_id || r.roster_id) ? 1 : (teamSize[r.team] || 0),
  }))
}
