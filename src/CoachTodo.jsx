// «דברים לביצוע» (מסמך ההשקה 1.4) — צ'קליסט המאמן בדף הבית, מעל הלו"ז.
// שש בדיקות: אימונים שלא נסגרו · שחקנים בלי יעד פעיל · אין יעדים חודשיים ·
// משימות שפג תוקפן · 3+ חיסורים רצופים · בקשות הצטרפות ממתינות.
// כל שורה מנווטת למסך התיקון. מצב ריק: "הכול סגור, מאמן 🏀".
// כל שאילתה סובלנית לשגיאה/טבלה חסרה — כלל שנכשל פשוט לא מציג שורה.

import { useEffect, useState } from 'react'
import {
  ClipboardCheck, Target, CalendarDays, Hourglass, AlertTriangle, Users2, CheckCircle2,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { expandSlotsRange } from './sessionId'
import { L, trTeam, cnt } from './i18n'
import { ChevronFwd } from './DirIcon'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const dm = (dateStr) => { const d = new Date(dateStr + 'T00:00'); return `${d.getDate()}.${d.getMonth() + 1}` }

export default function CoachTodo({ session, onNavigate }) {
  const me = session?.user?.id
  const [rows, setRows] = useState(null) // null=טוען, []=הכול סגור

  useEffect(() => {
    if (!me) return
    let alive = true
    ;(async () => {
      const now = new Date()
      const todayStr = ymd(now)
      const from7 = addDays(now, -7)
      const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`

      const [entriesRes, slotsRes, attRes, revRes, rosterRes, goalsRes, tgRes, asgRes, pendRes] = await Promise.all([
        supabase.from('schedule_entries').select('id, team, date, start_time, end_time, is_personal')
          .gte('date', ymd(from7)).lte('date', todayStr),
        supabase.from('team_practice_slots').select('*').eq('coach_id', me),
        supabase.from('practice_attendance').select('team, session_date, player_id, status')
          .eq('coach_id', me).gte('session_date', ymd(addDays(now, -60))),
        supabase.from('session_reviews').select('session_id').eq('coach_id', me).eq('session_type', 'practice'),
        supabase.from('team_players').select('id, name, team, player_id').eq('coach_id', me),
        supabase.from('player_goals').select('player_id, status').eq('coach_id', me).neq('status', 'done'),
        supabase.from('team_goals').select('team, content').eq('coach_id', me)
          .eq('period', 'month').eq('period_key', monthKey),
        supabase.from('player_assignments').select('id, team, player_id, due_date, title')
          .eq('coach_id', me).not('due_date', 'is', null).lt('due_date', todayStr),
        supabase.from('team_memberships').select('id', { count: 'exact', head: true })
          .eq('coach_id', me).eq('status', 'pending'),
      ])
      if (!alive) return

      const roster = rosterRes.error ? [] : rosterRes.data || []
      const linked = roster.filter((p) => p.player_id)
      const teams = [...new Set(roster.map((p) => p.team).filter(Boolean))]
      const out = []

      // 1 — אימונים שהסתיימו ולא נסגרו (נוכחות או סיכום חסרים)
      {
        const slots = slotsRes.error ? [] : slotsRes.data || []
        const occs = expandSlotsRange(slots, from7, now)
          .map((o) => ({ id: o.session_id, team: o.team, date: o.date, start_time: o.start_time, end_time: o.end_time }))
        const entries = (entriesRes.error ? [] : entriesRes.data || []).filter((e) => e.team && !e.is_personal)
        const ended = [...entries, ...occs].filter((s) => {
          const end = new Date(`${s.date}T${s.end_time || s.start_time || '23:59'}`).getTime()
          return !isNaN(end) && end < now.getTime()
        })
        const attSet = new Set((attRes.error ? [] : attRes.data || []).map((r) => `${r.team}|${r.session_date}`))
        const revSet = new Set((revRes.error ? [] : revRes.data || []).map((r) => r.session_id))
        const open = ended
          .filter((s) => !attSet.has(`${s.team}|${s.date}`) || !revSet.has(s.id))
          .sort((a, b) => b.date.localeCompare(a.date))
        for (const s of open.slice(0, 3)) {
          const noAtt = !attSet.has(`${s.team}|${s.date}`)
          out.push({
            key: 'open' + s.id, Icon: ClipboardCheck, tone: 'warn', nav: 'schedule',
            title: L(`האימון של ${trTeam(s.team)} (${dm(s.date)}) עוד פתוח`, `${trTeam(s.team)}'s practice (${dm(s.date)}) is still open`),
            sub: noAtt ? L('נוכחות לא סומנה', 'Attendance not marked') : L('חסר סיכום אימון', 'Session summary missing'),
          })
        }
      }

      // 2 — שחקנים מחוברים בלי יעד פעיל
      {
        const withGoal = new Set((goalsRes.error ? [] : goalsRes.data || []).map((g) => g.player_id).filter(Boolean))
        const missing = linked.filter((p) => !withGoal.has(p.player_id))
        if (missing.length > 0) {
          const names = missing.slice(0, 3).map((p) => p.name).join(', ')
          out.push({
            key: 'nogoal', Icon: Target, tone: 'warn', nav: 'teams',
            title: cnt(missing.length, L('שחקן אחד בלי יעד פעיל', 'One player without an active goal'), L('שחקנים בלי יעד פעיל', 'players without an active goal')),
            sub: names + (missing.length > 3 ? '…' : ''),
          })
        }
      }

      // 3 — לא הוגדרו יעדים חודשיים לחודש הנוכחי
      {
        const has = new Set((tgRes.error ? [] : tgRes.data || [])
          .filter((r) => r.content && r.content.trim()).map((r) => r.team))
        const missing = teams.filter((t) => !has.has(t))
        if (!tgRes.error && missing.length > 0) {
          out.push({
            key: 'monthly', Icon: CalendarDays, tone: 'info', nav: 'teams',
            title: L('לא הוגדרו יעדים חודשיים לחודש הנוכחי', 'No monthly goals set for this month'),
            sub: missing.map(trTeam).join(' · '),
          })
        }
      }

      // 4 — משימות שעבר תאריך היעד שלהן וממתינות לסגירה
      {
        const overdue = asgRes.error ? [] : asgRes.data || []
        if (overdue.length > 0) {
          let comps = []
          const { data: cData, error: cErr } = await supabase
            .from('assignment_completions')
            .select('assignment_id, player_id, done_at')
            .in('assignment_id', overdue.map((a) => a.id))
          if (!cErr) comps = cData || []
          if (!alive) return
          const doneBy = new Map()
          for (const c of comps) if (c.done_at) {
            if (!doneBy.has(c.assignment_id)) doneBy.set(c.assignment_id, new Set())
            doneBy.get(c.assignment_id).add(c.player_id)
          }
          const stillOpen = overdue.filter((a) => {
            const recipients = a.player_id
              ? [a.player_id]
              : linked.filter((p) => p.team === a.team).map((p) => p.player_id)
            if (recipients.length === 0) return false
            const done = doneBy.get(a.id) || new Set()
            return recipients.some((id) => !done.has(id))
          })
          if (stillOpen.length > 0) {
            out.push({
              key: 'overdue', Icon: Hourglass, tone: 'warn', nav: 'teams',
              title: cnt(stillOpen.length, L('משימה אחת שעבר זמנה ממתינה לסגירה', 'One overdue task awaits closing'), L('משימות שעבר זמנן ממתינות לסגירה', 'overdue tasks await closing')),
              sub: stillOpen.slice(0, 2).map((a) => a.title || L('משימה', 'Task')).join(' · '),
            })
          }
        }
      }

      // 5 — שחקן עם 3+ חיסורים רצופים (לפי סימוני הנוכחות האחרונים)
      {
        const byPlayer = new Map() // team_players.id → [{date, status}]
        for (const r of attRes.error ? [] : attRes.data || []) {
          if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, [])
          byPlayer.get(r.player_id).push(r)
        }
        const nameOf = new Map(roster.map((p) => [p.id, p.name]))
        const streaks = []
        for (const [pid, list] of byPlayer) {
          list.sort((a, b) => b.session_date.localeCompare(a.session_date))
          let run = 0
          for (const r of list) {
            if (r.status === 'absent') run++
            else break
          }
          if (run >= 3) streaks.push({ name: nameOf.get(pid) || L('שחקן', 'Player'), run })
        }
        for (const s of streaks.slice(0, 3)) {
          out.push({
            key: 'streak' + s.name, Icon: AlertTriangle, tone: 'bad', nav: 'teams',
            title: L(`${s.name} החסיר ${s.run} אימונים ברצף`, `${s.name} missed ${s.run} practices in a row`),
            sub: L('שווה שיחה אישית', 'Worth a personal chat'),
          })
        }
      }

      // 6 — בקשות הצטרפות ממתינות
      if (!pendRes.error && (pendRes.count || 0) > 0) {
        out.push({
          key: 'joins', Icon: Users2, tone: 'info', nav: 'teams',
          title: cnt(pendRes.count, L('בקשת הצטרפות אחת ממתינה לאישור', 'One join request awaits approval'), L('בקשות הצטרפות ממתינות לאישור', 'join requests await approval')),
          sub: L('אישור מהיר — והשחקן בפנים', 'Quick approve — and the player is in'),
        })
      }

      if (alive) setRows(out)
    })()
    return () => { alive = false }
  }, [me])

  if (rows === null) return null

  return (
    <section className="ctd">
      <span className="sec-kicker">{L('דברים לביצוע', 'To do')}</span>
      {rows.length === 0 ? (
        <div className="ctd-clear">
          <CheckCircle2 size={18} aria-hidden="true" />
          {L('הכול סגור, מאמן 🏀', 'All done, coach 🏀')}
        </div>
      ) : (
        <div className="ctd-list">
          {rows.map((r) => (
            <button key={r.key} type="button" className="ctd-row" onClick={() => onNavigate && onNavigate(r.nav)}>
              <span className={'ctd-ic ' + r.tone} aria-hidden="true"><r.Icon size={16} /></span>
              <span className="ctd-tx">
                <b>{r.title}</b>
                {r.sub && <span>{r.sub}</span>}
              </span>
              <ChevronFwd size={16} className="ctd-go" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
