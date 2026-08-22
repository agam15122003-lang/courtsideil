import { supabase } from './supabaseClient'
import { L, trTeam } from './i18n'
import { PLAYER_SIDE } from './flags'
import { toast } from './toast'

// א-6 — דוח התקדמות אישי לשחקן: דף אחד להדפסה / שמירה כ-PDF.
// נבנה מנתונים שכבר נאספים — נוכחות, משימות, יעדים, משוב — בלי backend חדש.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// שיגורים שרלוונטיים לשחקן: אישיים אליו + כאלה שנשלחו לכל הקבוצה.
// בעבר זה נעשה בפילטר אחד — .or(`player_id.eq.${pid},team.eq.${team}`) — ושם
// הקבוצה שורשר ישירות לתוך תחביר PostgREST. שם עם פסיק או סוגריים (למשל
// "נערים א' (בנים)") שובר את הפילטר או מרחיב אותו, וספירת "משימות שנשלחו"
// יוצאת שגויה. שתי שאילתות eq נפרדות + איחוד לפי מזהה — בלי תחביר להישבר בו.
async function loadAssignments(pid, team) {
  const cols = 'id, team, player_id'
  const [mine, byTeam] = await Promise.all([
    supabase.from('player_assignments').select(cols).eq('player_id', pid),
    team
      ? supabase.from('player_assignments').select(cols).eq('team', team)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (mine.error) console.error('playerReport assignments (player):', mine.error.message)
  if (byTeam.error) console.error('playerReport assignments (team):', byTeam.error.message)
  const seen = new Set()
  const rows = []
  for (const r of [...(mine.data || []), ...(byTeam.data || [])]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    rows.push(r)
  }
  return { data: rows }
}

// צד המאמן בלבד (22.8): אותו דוח, אבל הכול נקרא לפי שורת הסגל (roster_id)
async function loadAssignmentsByRoster(rid, team) {
  const cols = 'id, team, roster_id'
  const [mine, byTeam] = await Promise.all([
    supabase.from('player_assignments').select(cols).eq('roster_id', rid),
    team
      ? supabase.from('player_assignments').select(cols).eq('team', team)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (mine.error) console.error('playerReport assignments (roster):', mine.error.message)
  if (byTeam.error) console.error('playerReport assignments (team):', byTeam.error.message)
  const seen = new Set()
  const rows = []
  for (const r of [...(mine.data || []), ...(byTeam.data || [])]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    rows.push(r)
  }
  return { data: rows, error: mine.error || null }
}

// שגיאה שמשמעותה «המיגרציה של 22.8 עוד לא רצה» (עמודה/טבלה חסרה)
const missing22_8 = (e) => !!e && (e.code === '42703' || e.code === '42P01' || e.code === 'PGRST205' || /roster_id|does not exist|could not find the table/i.test(e.message || ''))

export async function printPlayerReport({ player, team, att }) {
  // המשוב, המשימות והיעדים — לשחקן מחובר (player_id = profiles.id);
  // בצד המאמן בלבד — לכל שורת סגל (roster_id).
  const pid = player.player_id
  const rid = player.id
  const byRoster = !PLAYER_SIDE && !!rid
  const [fb, goals, asg, compl] = await Promise.all([
    byRoster
      ? supabase.from('player_feedback').select('content, rating, created_at').eq('roster_id', rid).order('created_at', { ascending: false }).limit(3)
      : pid
        ? supabase.from('player_feedback').select('content, rating, created_at').eq('player_id', pid).order('created_at', { ascending: false }).limit(3)
        : Promise.resolve({ data: [] }),
    byRoster
      ? supabase.from('player_goals').select('title, period, status, progress_value, target_value').eq('roster_id', rid).limit(10)
      : pid
        ? supabase.from('player_goals').select('title, period, status, progress_value, target_value').eq('player_id', pid).limit(10)
        : Promise.resolve({ data: [] }),
    byRoster ? loadAssignmentsByRoster(rid, team) : pid ? loadAssignments(pid, team) : Promise.resolve({ data: [] }),
    byRoster
      ? supabase.from('assignment_coach_marks').select('assignment_id, done_at').eq('roster_id', rid).not('done_at', 'is', null)
      : pid
        ? supabase.from('assignment_completions').select('assignment_id, done_at').eq('player_id', pid).not('done_at', 'is', null)
        : Promise.resolve({ data: [] }),
  ])
  // דוח עם אפסים מזויפים גרוע מאין דוח: כשל שליפה נאמר, לא מודפס
  const errs = [fb.error, goals.error, asg.error, compl.error].filter(Boolean)
  if (errs.length) {
    toast.error(byRoster && errs.some(missing22_8)
      ? L('כדי להפיק דוח התקדמות צריך להריץ את supabase_coach_only_22_8.sql', 'The progress report needs supabase_coach_only_22_8.sql')
      : L('הפקת הדוח נכשלה: ', 'Report failed: ') + errs[0].message)
    return
  }

  const attPct = att && att.total ? Math.round((att.present / att.total) * 100) : null
  const doneCount = (compl.data || []).length
  const sentCount = (asg.data || []).length
  const goalRows = (goals.data || [])
    .map((g) => {
      const prog = g.target_value
        ? `${g.progress_value || 0} / ${g.target_value}`
        : g.status === 'done' ? L('הושלמה', 'Done') : L('בתהליך', 'In progress')
      return `<tr><td>${esc(g.title)}</td><td dir="ltr">${esc(prog)}</td></tr>`
    })
    .join('')
  const fbRows = (fb.data || [])
    .map((f) => {
      const d = new Date(f.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
      const stars = f.rating > 0 ? '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) + ' · ' : ''
      return `<div class="fb"><span class="fb-meta">${stars}${d}</span><p>${esc(f.content || '')}</p></div>`
    })
    .join('')

  const today = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>${esc(player.name)} — ${L('דוח התקדמות', 'Progress report')}</title>
<style>
  body{font-family:'Rubik','Heebo',system-ui,sans-serif;margin:32px;color:#0E1B2E}
  h1{font-size:24px;margin:0}
  .sub{color:#5B6B82;font-size:13px;margin:4px 0 20px}
  .stats{display:flex;gap:12px;margin:0 0 22px}
  .stat{flex:1;border:1px solid #E3EAF3;border-radius:12px;padding:12px;text-align:center}
  .stat b{display:block;font-size:26px;font-weight:900}
  .stat span{font-size:11.5px;color:#5B6B82}
  h2{font-size:15px;margin:20px 0 8px;border-bottom:1px solid #E3EAF3;padding-bottom:5px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:6px 4px;border-bottom:1px dashed #E3EAF3}
  td:last-child{text-align:left;font-weight:700}
  .fb{margin:0 0 10px}
  .fb-meta{font-size:11.5px;color:#A8491A;font-weight:700}
  .fb p{margin:2px 0 0;font-size:13px;line-height:1.6}
  .empty{color:#5B6B82;font-size:12.5px}
  .foot{margin-top:28px;font-size:11px;color:#8B99AC;text-align:center}
  @media print{body{margin:12mm}}
</style></head><body>
<h1>${esc(player.name)}${player.number ? ` · #${esc(player.number)}` : ''}</h1>
<p class="sub">${esc(trTeam(team))} · ${L('דוח התקדמות', 'Progress report')} · ${esc(today)}</p>
<div class="stats">
  <div class="stat"><b dir="ltr">${attPct == null ? '—' : attPct + '%'}</b><span>${L('נוכחות עונתית', 'Season attendance')}</span></div>
  <div class="stat"><b dir="ltr">${doneCount}</b><span>${L('משימות שבוצעו', 'Tasks completed')}</span></div>
  <div class="stat"><b dir="ltr">${sentCount}</b><span>${byRoster ? L('משימות שנרשמו', 'Tasks logged') : L('משימות שנשלחו', 'Tasks assigned')}</span></div>
</div>
<h2>${L('יעדים', 'Goals')}</h2>
${goalRows ? `<table>${goalRows}</table>` : `<p class="empty">${L('אין יעדים רשומים.', 'No goals on record.')}</p>`}
<h2>${L('המשוב האחרון מהמאמן', 'Latest coach feedback')}</h2>
${fbRows || `<p class="empty">${L('אין עדיין משוב.', 'No feedback yet.')}</p>`}
<p class="foot">CourtSide · ${esc(today)}</p>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`

  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const w = window.open(url, '_blank')
  if (!w) URL.revokeObjectURL(url)
}
