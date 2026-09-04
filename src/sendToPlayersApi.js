import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import { L } from './i18n'
import { PLAYER_SIDE, COACH_LOGS } from './flags'

// מודול משותף לשליחת תרגולים לשחקנים (אישי + קבוצתי).
// player_assignments תומך: coach_id, team, player_id, drill_id, plan_id, video_url, title, note, due_date.

// טוען את הסגל של המאמן: קבוצות + כל שורות הסגל, עם דגל linked למי שיש חשבון.
// 3.9 — שתי אמיתות: המשימה נרשמת תמיד על שורת הסגל (COACH_LOGS); שחקן מחובר
// (linked) מקבל אותה גם על החשבון + התראה. לא מסננים לפי PLAYER_SIDE יותר —
// אחרת סגל שלם של ילדים בלי חשבון נעלם מהמסך ברגע שהמתג נדלק.
export async function loadRoster(coachId) {
  const { data } = await supabase
    .from('team_players')
    .select('id, name, number, team, position, player_id')
    .eq('coach_id', coachId)
    .order('team').order('number')
  const rows = (data || []).map((r) => ({ ...r, linked: !!r.player_id }))
  const teams = [...new Set(rows.map((r) => r.team))]
  const players = COACH_LOGS ? rows : rows.filter((r) => r.player_id)
  return { teams, players }
}

// מזהה הבחירה של שחקן ברשימות: שורת הסגל (3.9 — תמיד; קיימת עם חשבון או בלי)
export const pickId = (p) => (COACH_LOGS ? p.id : p.player_id)

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
  let teamSize = 0

  if (mode === 'team') {
    rows = [{ ...base, team }]
    // התראה לכל שחקן מחובר בקבוצה (שיגור קבוצתי מוסיף שורה אחת בלבד — משדרים ידנית)
    const { data } = await supabase
      .from('team_players')
      .select('id, player_id, team')
      .eq('coach_id', coachId)
      .eq('team', team)
    recipients = PLAYER_SIDE ? (data || []).map((r) => r.player_id).filter(Boolean) : []
    // ⚠ הנמענים הם רק מי שיש לו **חשבון**. בצד־המאמן־בלבד אין כאלה, ולכן
    //   ספירה לפיהם החזירה תמיד 0 — «נשלח ל־0 שחקנים» על משימה שכן נשלחה.
    //   מה שנשלח באמת הוא לכל שורות הסגל בקבוצה, וזה מה שנספר.
    teamSize = (data || []).length
  } else {
    // 3.9 — שני המזהים תמיד: שורת הסגל היא הרשומה של המאמן (roster_id), והחשבון —
    // אם יש — כדי שהשחקן יראה אותה אצלו (assign_coach_write מתיר שורה עם שניהם)
    rows = players.map((p) => (COACH_LOGS
      ? { ...base, player_id: p.player_id || null, roster_id: p.id }
      : { ...base, player_id: p.player_id }))
    recipients = PLAYER_SIDE ? players.map((p) => p.player_id).filter(Boolean) : []
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
  // 3.9 — sent: כמה מהם מחוברים וקיבלו את המשימה גם על החשבון (והתראה)
  return { ok: true, count: mode === 'team' ? teamSize : players.length, sent: recipients.length, warn }
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
  // 3.9 — שתי אמיתות: סימוני המאמן (assignment_coach_marks, לפי roster_id) וגם
  // «ביצעתי» של שחקנים מחוברים (assignment_completions, player_id → שורת הסגל),
  // מאוחדים לפי (משימה, שורת סגל) כדי שנמען שסומן פעמיים ייספר פעם אחת.
  // טבלה חסרה — שקט (כמו ב-CoachTodo).
  const rosterOfAuth = new Map((roster?.players || []).filter((p) => p.player_id).map((p) => [p.player_id, p.id]))
  const [cm, pc] = await Promise.all([
    supabase.from('assignment_coach_marks').select('assignment_id, roster_id, done_at').in('assignment_id', ids),
    PLAYER_SIDE
      ? supabase.from('assignment_completions').select('assignment_id, player_id, done_at').in('assignment_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ])
  const doneKeys = new Set()
  for (const c of cm.error ? [] : cm.data || []) if (c.done_at) doneKeys.add(`${c.assignment_id}:${c.roster_id}`)
  // 3.9 — «ביצעתי» של חשבון שכבר לא בסגל לא נספר (כמו ב-TeamAssignments):
  // מפתח סינתטי לפי החשבון היה מנפח את המונה מעבר למכנה («2/1»).
  for (const c of pc.error ? [] : pc.data || []) if (c.done_at) { const rid = rosterOfAuth.get(c.player_id); if (rid) doneKeys.add(`${c.assignment_id}:${rid}`) }
  const doneBy = {}
  for (const k of doneKeys) { const aid = k.slice(0, k.indexOf(':')); doneBy[aid] = (doneBy[aid] || 0) + 1 }

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
