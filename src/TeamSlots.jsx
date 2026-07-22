import { useState, useEffect, useCallback } from 'react'
import { CalendarClock, Plus, Trash2, MapPin, Clock, ClipboardCheck, CalendarDays, Info } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { WEEKDAYS, expandSlots } from './sessionId'

// לו"ז קבוע לקבוצה (מאמן) — ימי אימון + שעות. מופיע אוטומטית לשחקנים.
// כשאימון עבר, כאן נפתחת ה"סקירה" (רשימת שחקנים: עומס, הערת שחקן, הערת מאמן, מטרות).
// props: coachId, team, onReview(entry)
export default function TeamSlots({ coachId, team, onReview }) {
  const [slots, setSlots] = useState(null)
  const [weekday, setWeekday] = useState('0')
  const [start, setStart] = useState('18:00')
  const [end, setEnd] = useState('19:30')
  const [loc, setLoc] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('team_practice_slots')
      .select('*')
      .eq('coach_id', coachId).eq('team', team)
      .order('weekday').order('start_time')
    setSlots(data || [])
  }, [coachId, team])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (busy) return
    if (!start) { toast.error(L('בחר שעת התחלה.', 'Choose a start time.')); return }
    if (end && end <= start) { toast.error(L('שעת הסיום צריכה להיות אחרי ההתחלה.', 'End time must be after start.')); return }
    setBusy(true)
    const { error } = await supabase.from('team_practice_slots').insert({
      coach_id: coachId, team, weekday: Number(weekday), start_time: start, end_time: end || null, location: loc.trim() || null,
    })
    setBusy(false)
    if (error) { toast.error(L('ההוספה נכשלה', 'Failed to add')); return }
    setLoc('')
    toast.success(L('יום האימון נוסף — מופיע עכשיו לשחקנים', 'Practice day added — now visible to players'))
    load()
  }

  const del = async (id) => {
    if (!window.confirm(L('להסיר את יום האימון הקבוע?', 'Remove this fixed practice day?'))) return
    const { error } = await supabase.from('team_practice_slots').delete().eq('id', id)
    if (error) { toast.error(L('המחיקה נכשלה', 'Delete failed')); return }
    toast.success(L('יום האימון הוסר', 'Practice day removed'))
    load()
  }

  if (slots === null) return <div className="app-loading" style={{ padding: 30 }}><div className="loader" /></div>

  const recent = expandSlots(slots, -21, -1).reverse().slice(0, 8) // אימונים אחרונים (הכי חדש קודם)
  const upcoming = expandSlots(slots, 0, 20).slice(0, 6)

  return (
    <div className="team-section">
      <h3 className="ta-title"><CalendarClock size={16} /> {L('ימי אימון קבועים', 'Fixed practice days')} · {trTeam(team)}</h3>
      <p className="muted small" style={{ marginBottom: 12 }}>{L('קבע ימי אימון ושעות — הם מופיעים אוטומטית ומיד בלו״ז של כל שחקני הקבוצה, וקבועים עד שתשנה אותם.', 'Set practice days and times — they appear automatically in every player’s schedule, and stay fixed until you change them.')}</p>

      <div className="slot-add">
        <label className="slot-field">
          <span>{L('יום', 'Day')}</span>
          <select className="finder-input" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {WEEKDAYS.map((w, i) => <option key={i} value={i}>{L(w[0], w[1])}</option>)}
          </select>
        </label>
        <label className="slot-field">
          <span>{L('התחלה', 'Start')}</span>
          <input className="finder-input" type="time" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="slot-field">
          <span>{L('סיום', 'End')}</span>
          <input className="finder-input" type="time" dir="ltr" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="slot-field slot-field-loc">
          <span>{L('מיקום', 'Location')}</span>
          <input className="finder-input" type="text" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder={L('אולם / מגרש (לא חובה)', 'Gym / court (optional)')} />
        </label>
        <button className="btn-primary slot-add-btn" onClick={add} disabled={busy} aria-label={L('הוסף יום אימון', 'Add practice day')}><Plus size={16} /></button>
      </div>

      {slots.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 14 }}>
          <span className="empty-ic"><CalendarClock size={24} /></span>
          <div className="empty-title">{L('עדיין אין ימי אימון קבועים', 'No fixed practice days yet')}</div>
          <p className="muted small">{L('הוסף למעלה — לדוגמה: ראשון 18:00, חמישי 19:30.', 'Add above — e.g. Sunday 18:00, Thursday 19:30.')}</p>
        </div>
      ) : (
        <ul className="slot-list">
          {slots.map((s) => (
            <li key={s.id} className="slot-row">
              <span className="slot-day">{L(WEEKDAYS[s.weekday][0], WEEKDAYS[s.weekday][1])}</span>
              <span className="slot-time" dir="ltr"><Clock size={13} /> {String(s.start_time).slice(0, 5)}{s.end_time ? `–${String(s.end_time).slice(0, 5)}` : ''}</span>
              {s.location && <span className="slot-loc"><MapPin size={13} /> {s.location}</span>}
              <button className="icon-btn danger slot-del" onClick={() => del(s.id)} aria-label={L('הסר', 'Remove')}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}

      {upcoming.length > 0 && (
        <p className="muted small slot-next"><CalendarDays size={13} /> {L('הבא: ', 'Next: ')}{upcoming.slice(0, 3).map((o) => `${L(WEEKDAYS[o.weekday][0], WEEKDAYS[o.weekday][1])} ${o.start_time}`).join(' · ')}</p>
      )}

      {recent.length > 0 && (
        <div className="slot-recent">
          <h3 className="ta-title" style={{ marginTop: 22 }}><ClipboardCheck size={16} /> {L('אימונים אחרונים — סיכום ועומס', 'Recent practices — review & load')}</h3>
          <p className="muted small" style={{ marginBottom: 10 }}>{L('אחרי כל אימון — פתח את רשימת השחקנים: עומס שדירגו, מה שהם רשמו, מקום להערה, ומטרות.', 'After each practice — open the player list: rated load, their notes, a note field, and goals.')}</p>
          <ul className="slot-recent-list">
            {recent.map((o) => (
              <li key={o.session_id} className="slot-recent-row">
                <div className="slot-recent-main">
                  <strong>{L(WEEKDAYS[o.weekday][0], WEEKDAYS[o.weekday][1])} · {new Date(o.date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}</strong>
                  <span className="muted small" dir="ltr">{o.start_time}{o.end_time ? `–${o.end_time}` : ''}{o.location ? ` · ${o.location}` : ''}</span>
                </div>
                <button className="btn-soft slot-review-btn" style={{ marginTop: 0 }} onClick={() => onReview({ id: o.session_id, team, date: o.date, start_time: o.start_time, session_type: 'practice', location: o.location })}>
                  <ClipboardCheck size={15} /> {L('סיכום ומשוב', 'Review')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
