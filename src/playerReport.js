import { supabase } from './supabaseClient'
import { L, trTeam } from './i18n'

// א-6 — דוח התקדמות אישי לשחקן: דף אחד להדפסה / שמירה כ-PDF.
// נבנה מנתונים שכבר נאספים — נוכחות, משימות, יעדים, משוב — בלי backend חדש.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export async function printPlayerReport({ player, team, att }) {
  // המשוב, המשימות והיעדים — רק לשחקן מחובר (player_id = profiles.id)
  const pid = player.player_id
  const [fb, goals, asg, compl] = await Promise.all([
    pid
      ? supabase.from('player_feedback').select('content, rating, created_at').eq('player_id', pid).order('created_at', { ascending: false }).limit(3)
      : Promise.resolve({ data: [] }),
    pid
      ? supabase.from('player_goals').select('title, period, status, progress_value, target_value').eq('player_id', pid).limit(10)
      : Promise.resolve({ data: [] }),
    pid
      ? supabase.from('player_assignments').select('id, team, player_id').or(`player_id.eq.${pid},team.eq.${team}`)
      : Promise.resolve({ data: [] }),
    pid
      ? supabase.from('assignment_completions').select('assignment_id, done_at').eq('player_id', pid).not('done_at', 'is', null)
      : Promise.resolve({ data: [] }),
  ])

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
  <div class="stat"><b dir="ltr">${sentCount}</b><span>${L('משימות שנשלחו', 'Tasks assigned')}</span></div>
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
