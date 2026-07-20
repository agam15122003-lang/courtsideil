import { useEffect, useState } from 'react'
import { CalendarClock, MapPin, Clock, PlayCircle, UserCheck, CalendarPlus } from 'lucide-react'
import { supabase } from './supabaseClient'
import { downloadIcs } from './ics'
import { L, trTeam } from './i18n'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (t) => (t ? String(t).slice(0, 5) : '')

// כרטיס "האימון הבא" — שולף את האימון הקרוב ביותר מהלו"ז ומראה ספירה לאחור חיה.
// props: onNavigate(viewId)
export default function NextPractice({ onNavigate }) {
  const [entry, setEntry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    ;(async () => {
      const today = ymd(new Date())
      const { data } = await supabase
        .from('schedule_entries')
        .select('*, plan:training_plans(id, name)')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(10)
      if (!alive) return
      // האימון הקרוב שעדיין לא הסתיים
      const nowTs = Date.now()
      const pick = (data || []).find((e) => {
        const end = new Date(`${e.date}T${e.end_time || e.start_time || '23:59'}`)
        return !isNaN(end) && end.getTime() >= nowTs
      })
      setEntry(pick || null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return <div className="np-card np-skeleton" aria-hidden="true" />
  }

  if (!entry) {
    return (
      <div className="np-card np-empty">
        <span className="np-eyebrow"><CalendarClock size={15} /> {L('האימון הבא', 'Next practice')}</span>
        <h3 className="np-empty-title">{L('אין אימון קרוב בלו"ז', 'No upcoming practice')}</h3>
        <p className="muted small">{L('קבע את האימון הבא כדי לראות כאן ספירה לאחור ותוכנית מוכנה.', 'Schedule your next practice to see a live countdown and a ready plan here.')}</p>
        <button className="btn-primary np-cta" onClick={() => onNavigate('schedule')}>
          <CalendarPlus size={17} /> {L('קביעת אימון', 'Schedule a practice')}
        </button>
      </div>
    )
  }

  const start = new Date(`${entry.date}T${entry.start_time || '00:00'}`)
  const diff = start.getTime() - now
  const started = diff <= 0
  const totalSec = Math.max(0, Math.floor(diff / 1000))
  const hh = Math.floor(totalSec / 3600)
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
          <span className="np-count-label">{L('עד תחילת האימון', 'Until practice starts')}</span>
          <div className="np-timer" dir="ltr" aria-label={L('ספירה לאחור', 'Countdown')}>
            {pad(hh)}:{pad(mm)}:{pad(ss)}
          </div>
        </>
      )}

      <div className="np-actions">
        <button className="btn-primary" onClick={() => onNavigate(entry.plan ? 'plans' : 'schedule')}>
          <PlayCircle size={17} /> {entry.plan ? L('פתח את תוכנית האימון', 'Open practice plan') : L('פתח בלו"ז', 'Open in schedule')}
        </button>
        <button className="btn-soft" onClick={() => onNavigate('teams')}>
          <UserCheck size={16} /> {L('נוכחות שחקנים', 'Player attendance')}
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
          <CalendarPlus size={16} /> {L('הוסף ליומן', 'Add to calendar')}
        </button>
      </div>
    </div>
  )
}
