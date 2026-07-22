import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import { L } from './i18n'

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
  const players = rows.filter((r) => r.player_id) // רק מי שחיבר חשבון
  return { teams, players }
}

// שולח שיגור אחד או יותר.
// opts: { coachId, mode:'team'|'players', team, players:[{player_id,...}], content:{drillId,planId,videoUrl,title,kind}, note, dueDate }
export async function sendAssignments({ coachId, mode, team, players = [], content = {}, note, dueDate }) {
  const base = { coach_id: coachId }
  if (content.drillId) base.drill_id = content.drillId
  if (content.planId) base.plan_id = content.planId
  if (content.videoUrl) base.video_url = content.videoUrl
  if (content.title) base.title = content.title
  if (note) base.note = note
  if (dueDate) base.due_date = dueDate

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
    rows = players.map((p) => ({ ...base, player_id: p.player_id }))
    recipients = players.map((p) => p.player_id).filter(Boolean)
  }

  const { error } = await supabase.from('player_assignments').insert(rows)
  if (error) return { ok: false, error: error.message }

  for (const to of recipients) {
    sendNotification({ to, actor: coachId, type: 'message', content: L('המאמן שלח לך תרגול חדש', 'Your coach sent you new training'), nav: 'drills' })
  }
  return { ok: true, count: mode === 'team' ? recipients.length : rows.length }
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
  const { data: compl } = await supabase
    .from('assignment_completions')
    .select('assignment_id')
    .in('assignment_id', ids)
  const doneBy = {}
  for (const c of compl || []) doneBy[c.assignment_id] = (doneBy[c.assignment_id] || 0) + 1

  // גודל קבוצה = כמה שחקנים מחוברים בקבוצה (למכנה של אחוז הביצוע)
  const teamSize = {}
  for (const p of (roster?.players || [])) teamSize[p.team] = (teamSize[p.team] || 0) + 1

  return rows.map((r) => ({
    ...r,
    title: r.drill?.title || r.plan?.name || r.title || (r.video_url ? L('סרטון', 'Video') : L('משימה', 'Task')),
    done: doneBy[r.id] || 0,
    total: r.player_id ? 1 : (teamSize[r.team] || 0),
  }))
}
