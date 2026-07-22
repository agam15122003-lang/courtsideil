import { useEffect, useState } from 'react'
import { CalendarClock, MapPin, Clock, PlayCircle, UserCheck, CalendarPlus, ClipboardCheck, Flame, Target } from 'lucide-react'
import { supabase } from './supabaseClient'
import { downloadIcs } from './ics'
import SessionDetail from './SessionDetail'
import { expandSlotsRange } from './sessionId'
import { L, trTeam } from './i18n'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (t) => (t ? String(t).slice(0, 5) : '')

// הכרטיס החכם של המאמן — הזרימה מגיעה אליך:
// לפני אימון → ספירה לאחור + "מטרות לשחקנים"; אחרי אימון → דוח מצב (כמה מילאו, עומס ממוצע).
// props: session, onNavigate(viewId)
export default function NextPractice({ session, onNavigate }) {
  const me = session?.user?.id
  const [entry, setEntry] = useState(null)
  const [recent, setRecent] = useState(null) // {id, team, date, start_time, avg, rated, total}
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [report, setReport] = useState(null) // entry לפתיחת SessionDetail

  useEffect(() => {
    let alive = true
    ;(async () => {
      const today = new Date()
      const from = new Date(Date.now() - 2 * 86400000)
      const until = new Date(Date.now() + 14 * 86400000)
      const [{ data: entries }, { data: slots }] = await Promise.all([
        supabase.from('schedule_entries').select('*, plan:training_plans(id, name)').gte('date', ymd(from)).lte('date', ymd(until)).order('date').order('start_time'),
        me ? supabase.from('team_practice_slots').select('*').eq('coach_id', me) : Promise.resolve({ data: [] }),
      ])
      if (!alive) return
      const occs = expandSlotsRange(slots || [], from, until).map((o) => ({
        id: o.session_id, date: o.date, start_time: o.start_time, end_time: o.end_time,
        team: o.team, location: o.location, _recurring: true,
      }))
      const all = [...(entries || []), ...occs]
        .sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))
      const nowTs = Date.now()
      const endOf = (e) => new Date(`${e.date}T${e.end_time || e.start_time || '23:59'}`).getTime()

      // הבא: הראשון שעוד לא נגמר
      setEntry(all.find((e) => !isNaN(endOf(e)) && endOf(e) >= nowTs) || null)

      // האחרון שנגמר (קבוצתי בלבד) — לדוח המצב
      const done = all.filter((e) => e.team && !e.is_personal && !isNaN(endOf(e)) && endOf(e) < nowTs)
      const last = done[done.length - 1] || null
      if (last && me) {
        const [{ data: eff }, { data: roster }] = await Promise.all([
          supabase.from('session_effort').select('effort').eq('coach_id', me).eq('session_id', last.id),
          supabase.from('team_players').select('id').eq('coach_id', me).eq('team', last.team).not('player_id', 'is', null),
        ])
        if (!alive) return
        const vals = (eff || []).map((r) => r.effort)
        setRecent({
          id: last.id, team: last.team, date: last.date, start_time: last.start_time, location: last.location,
          rated: vals.length, total: (roster || []).length,
          avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null,
        })
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [me])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return <div className="np-card np-skeleton" aria-hidden="true" />
  }

  // דוח האימון האחרון — מוצג בשני המצבים
  const reportStrip = recent && (
    <button className="np-report" onClick={() => setReport({ id: recent.id, team: recent.team, date: recent.date, start_time: recent.start_time, session_type: 'practice' })}>
      <span className="np-report-ic"><ClipboardCheck size={17} /></span>
      <span className="np-report-body">
        <strong>{L('דוח האימון האחרון', 'Last practice report')} · {trTeam(recent.team)}</strong>
        <span className="np-report-meta">
          {recent.total > 0 && <span>{recent.rated}/{recent.total} {L('מילאו סיכום', 'checked in')}</span>}
          {recent.avg != null && <span className="np-report-avg"><Flame size={12} /> {L('עומס ממוצע', 'avg load')} {recent.avg.toFixed(1)}</span>}
          {recent.total > 0 && recent.rated === 0 && <span>{L('ממתין לשחקנים...', 'waiting for players...')}</span>}
        </span>
      </span>
      <span className="np-report-cta">{L('פתח', 'Open')}</span>
    </button>
  )

  if (!entry) {
    return (
      <div className="np-card np-empty">
        <span className="np-eyebrow"><CalendarClock size={15} /> {L('האימון הבא', 'Next practice')}</span>
        <h3 className="np-empty-title">{L('אין אימון קרוב בלו"ז', 'No upcoming practice')}</h3>
        <p className="muted small">{L('קבע ימי אימון קבועים בקבוצות שלי — והם יופיעו כאן ואצל השחקנים.', 'Set fixed practice days in My teams — they show up here and for your players.')}</p>
        <button className="btn-primary np-cta" onClick={() => onNavigate('teams')}>
          <CalendarPlus size={17} /> {L('קביעת ימי אימון', 'Set practice days')}
        </button>
        {reportStrip}
        {report && <SessionDetail session={session} entry={report} onClose={() => setReport(null)} />}
      </div>
    )
  }

  const start = new Date(`${entry.date}T${entry.start_time || '00:00'}`)
  const diff = start.getTime() - now
  const started = diff <= 0
  const totalSec = Math.max(0, Math.floor(diff / 1000))
  const days = Math.floor(totalSec / 86400)
  const hh = Math.floor((totalSec % 86400) / 3600)
  const mm = Math.floor((totalSec % 3600) / 60)
  const ss = totalSec % 60

  const title = entry.title || (entry.team ? trTeam(entry.team) : L('אימון', 'Practice'))

  return (
    <div className="np-card">
      <span className="np-eyebrow"><span className="np-dot" /> {L('האימון הבא', 'Next practice')}</span>
      <h3 className="np-title">{title}</h3>
      <div className="np-meta">
        <span><Clock size={14} /> {hm(entry.start_time)}{entry.end_time ? `–${hm(entry.end_time)}` : ''}</span>
        {entry.location && <span><MapPin size={14} /> {entry.location}</span>}
      </div>

      {started ? (
        <div className="np-live"><span className="np-live-dot" /> {L('מתקיים עכשיו', 'Happening now')}</div>
      ) : (
        <>
          <span className="np-count-label">{days > 0 ? L(`בעוד ${days} ימים · עד תחילת האימון`, `In ${days} days · until start`) : L('עד תחילת האימון', 'Until practice starts')}</span>
          <div className="np-timer" dir="ltr" aria-label={L('ספירה לאחור', 'Countdown')}>
            {pad(hh)}:{pad(mm)}:{pad(ss)}
          </div>
        </>
      )}

      <div className="np-actions">
        {entry.team && !entry.is_personal && (
          <button className="btn-primary" onClick={() => onNavigate('teams')}>
            <Target size={16} /> {L('מטרות לשחקנים', 'Player goals')}
          </button>
        )}
        <button className={entry.team && !entry.is_personal ? 'btn-soft' : 'btn-primary'} onClick={() => onNavigate(entry.plan ? 'plans' : 'schedule')}>
          <PlayCircle size={17} /> {entry.plan ? L('תוכנית האימון', 'Practice plan') : L('פתח בלו"ז', 'Open in schedule')}
        </button>
        <button
          className="btn-soft"
          onClick={() => downloadIcs({
            title: title,
            date: entry.date,
            start: entry.start_time,
            end: entry.end_time,
            location: entry.location,
            description: entry.plan ? entry.plan.name : '',
          })}
        >
          <CalendarPlus size={16} /> {L('ליומן', 'Calendar')}
        </button>
      </div>

      {reportStrip}
      {report && <SessionDetail session={session} entry={report} onClose={() => setReport(null)} />}
    </div>
  )
}
