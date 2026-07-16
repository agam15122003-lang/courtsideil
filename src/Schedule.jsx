import { toast } from './toast'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ChevronRight, ChevronLeft, X, ArrowRight, Check } from 'lucide-react'
import { supabase } from './supabaseClient'
import { SkeletonCards } from './Skeleton'
import NotebookPage from './NotebookPage'
import { planToNotebook } from './TrainingPlans'
import { L, trTeam } from './i18n'

// טווח השעות המוצג בלוח, וגובה שורת-שעה בפיקסלים
const START_HOUR = 6
const END_HOUR = 23
const ROW_H = 44

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
// יום ראשון של השבוע שבו נמצא התאריך (השבוע בישראל מתחיל בראשון)
const sundayOf = (d) => {
  const x = new Date(d)
  x.setDate(x.getDate() - x.getDay())
  x.setHours(0, 0, 0, 0)
  return x
}
const hoursOf = (t) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h + (m || 0) / 60
}
// תאריך בפורמט ישראלי מלא — "יום ראשון, 28 ביוני 2026"
const ilDate = (str) => {
  if (!str) return ''
  const d = new Date(str + 'T00:00')
  if (isNaN(d)) return str
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// לו"ז שבועי בסגנון Outlook — ימים בעמודות, שעות בשורות, אימונים כבלוקים.
// props: session
export default function Schedule({ session }) {
  const me = session.user.id
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))
  const [entries, setEntries] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [planView, setPlanView] = useState(null) // {plan, items} — צפייה בתוכנית המצורפת

  const openPlan = async (plan) => {
    const { data } = await supabase
      .from('plan_items')
      .select('*, drill:drills(*)')
      .eq('plan_id', plan.id)
      .order('position', { ascending: true })
    setPlanView({ plan, items: data || [] })
  }

  // טופס הוספה
  const [adding, setAdding] = useState(false)
  const [formDate, setFormDate] = useState(ymd(new Date()))
  const [startTime, setStartTime] = useState('18:00')
  const [endTime, setEndTime] = useState('19:30')
  const [isPersonal, setIsPersonal] = useState(false)
  const [team, setTeam] = useState('')
  const [planId, setPlanId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // זימון מאמן אחר לפגישה
  const [meetings, setMeetings] = useState([])
  const [coaches, setCoaches] = useState([])
  const [inviting, setInviting] = useState(false)
  const [invTo, setInvTo] = useState('')
  const [invTopic, setInvTopic] = useState('')
  const [invDate, setInvDate] = useState(ymd(new Date()))
  const [invStart, setInvStart] = useState('18:00')
  const [invEnd, setInvEnd] = useState('19:00')
  const [invNote, setInvNote] = useState('')
  const [invSaving, setInvSaving] = useState(false)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = addDays(weekStart, 6)
  const hours = []
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h)
  const todayStr = ymd(new Date())
  const calRef = useRef(null)

  async function load() {
    setLoading(true)
    // ארבע השאילתות רצות במקביל — טעינת המסך מהירה פי 3-4
    const [entriesRes, plansRes, meetingsRes, coachesRes] = await Promise.all([
      supabase
        .from('schedule_entries')
        .select('*, plan:training_plans(id, name)')
        .gte('date', ymd(weekStart))
        .lte('date', ymd(weekEnd)),
      supabase
        .from('training_plans')
        .select('id, name')
        .order('created_at', { ascending: false }),
      // פגישות עם מאמנים אחרים (RLS מסנן לפגישות שאני צד בהן). אם הטבלה עוד לא קיימת — מתעלמים.
      supabase
        .from('coach_meetings')
        .select('*, from_p:profiles!coach_meetings_from_coach_fkey(first_name,last_name), to_p:profiles!coach_meetings_to_coach_fkey(first_name,last_name)')
        .gte('date', ymd(weekStart))
        .lte('date', ymd(weekEnd)),
      // רשימת מאמנים לזימון (כל מי שאינו אני)
      supabase
        .from('profiles')
        .select('id, first_name, last_name, club')
        .neq('id', me),
    ])
    if (entriesRes.error) {
      setError(L('שגיאה בטעינת הלו"ז: ', 'Error loading schedule: ') + entriesRes.error.message)
      setLoading(false)
      return
    }
    setError(null)
    setEntries(entriesRes.data || [])
    setPlans(plansRes.data || [])
    setMeetings(meetingsRes.error ? [] : meetingsRes.data || [])
    setCoaches((coachesRes.data || []).filter((c) => c.first_name && c.last_name))
    setLoading(false)
  }

  const sendInvite = async () => {
    if (!invTo) {
      toast.error(L('בחר מאמן לזמן.', 'Choose a coach to invite.'))
      return
    }
    if (!invTopic.trim()) {
      toast.error(L('כתוב נושא לפגישה.', 'Add a topic for the meeting.'))
      return
    }
    if (!invStart || !invEnd || invEnd <= invStart) {
      toast.error(L('בדוק את שעות הפגישה.', 'Check the meeting times.'))
      return
    }
    setInvSaving(true)
    const { error } = await supabase.from('coach_meetings').insert({
      from_coach: me,
      to_coach: invTo,
      date: invDate,
      start_time: invStart,
      end_time: invEnd,
      topic: invTopic.trim(),
      note: invNote.trim() || null,
      status: 'pending',
    })
    setInvSaving(false)
    if (error) {
      toast.error(L('הזימון נכשל (ודא שהרצת את ה-SQL): ', 'Invite failed (make sure the SQL ran): ') + error.message)
      return
    }
    setInviting(false)
    setInvTopic('')
    setInvNote('')
    toast.success(L('הזימון נשלח למאמן', 'Invite sent to the coach'))
    load()
  }

  const respondMeeting = async (m, status) => {
    const { error } = await supabase.from('coach_meetings').update({ status }).eq('id', m.id)
    if (error) {
      toast.error(L('העדכון נכשל: ', 'Update failed: ') + error.message)
      return
    }
    setSelected(null)
    toast.success(status === 'accepted' ? L('הפגישה אושרה', 'Meeting accepted') : L('הפגישה נדחתה', 'Meeting declined'))
    load()
  }

  const removeMeeting = async (id) => {
    if (!window.confirm(L('למחוק את הפגישה?', 'Delete this meeting?'))) return
    const { error } = await supabase.from('coach_meetings').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
      return
    }
    setSelected(null)
    toast.success(L('הפגישה נמחקה', 'Meeting deleted'))
    load()
  }

  const coachName = (c) => (c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '')

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  const openAdd = (dateStr, hour) => {
    setFormDate(dateStr || todayStr)
    setStartTime(hour != null ? `${pad(hour)}:00` : '18:00')
    setEndTime(hour != null ? `${pad(Math.min(hour + 1, 23))}:00` : '19:30')
    setIsPersonal(false)
    setTeam('')
    setPlanId('')
    setNote('')
    setSelected(null)
    setAdding(true)
  }

  const saveEntry = async () => {
    if (!startTime || !endTime) {
      toast.error(L('בחר שעת התחלה ושעת סיום.', 'Choose a start and end time.'))
      return
    }
    if (endTime <= startTime) {
      toast.error(L('שעת הסיום צריכה להיות אחרי שעת ההתחלה.', 'The end time must be after the start time.'))
      return
    }
    if (!isPersonal && !team.trim()) {
      toast.error(L('בחר קבוצה או סמן "אימון אישי".', 'Choose a team or mark "Personal practice".'))
      return
    }
    setSaving(true)
    const { error } = await supabase.from('schedule_entries').insert({
      created_by: me,
      date: formDate,
      start_time: startTime,
      end_time: endTime,
      hour: parseInt(startTime.split(':')[0], 10),
      is_personal: isPersonal,
      team: isPersonal ? null : team.trim(),
      plan_id: planId || null,
      note: note.trim() || null,
    })
    setSaving(false)
    if (error) {
      toast.error(L('השמירה נכשלה: ', 'Save failed: ') + error.message)
      return
    }
    setAdding(false)
    toast.success(L('האימון נוסף ללו"ז', 'Practice added to schedule'))
    load()
  }

  const removeEntry = async (id) => {
    if (!window.confirm(L('למחוק את האימון מהלו"ז?', 'Remove this practice from the schedule?'))) return
    const { error } = await supabase.from('schedule_entries').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
      return
    }
    setSelected(null)
    toast.success(L('האימון הוסר', 'Practice removed'))
    load()
  }

  const locale = 'he-IL' // תאריכים תמיד בפורמט ישראלי (יום · חודש · שנה)
  // פורמט מספרי ישראלי (יום.חודש.שנה) — אין בלבול RTL עם שמות חודשים
  const weekLabel =
    `${weekStart.getDate()}.${weekStart.getMonth() + 1}` +
    ' – ' +
    `${weekEnd.getDate()}.${weekEnd.getMonth() + 1}.${weekEnd.getFullYear()}`

  if (planView) {
    return (
      <div className="welcome-card">
        <button className="link-button" onClick={() => setPlanView(null)}>
          <ArrowRight size={15} className="back-ic" /> {L('חזרה ללו"ז', 'Back to schedule')}
        </button>
        <NotebookPage
          kind="plan"
          plan={planToNotebook(planView.plan.name, planView.items)}
          noCourt
        />
      </div>
    )
  }

  // גלילה אוטומטית לעמודת היום במובייל (RTL עלול להסתיר אותה)
  useEffect(() => {
    if (loading) return
    calRef.current?.querySelector('.cal-dayhead.today')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [loading, weekStart])


  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('לו"ז', 'Schedule')}</div>
          <h2>{L('הלו"ז השבועי', 'Weekly schedule')}</h2>
          <p className="page-desc">{L('כל האימונים והפגישות שלך בתצוגה שבועית אחת.', 'All your practices and meetings in one weekly view.')}</p>
        </div>
      </header>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button
            className="icon-btn"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label={L('שבוע קודם', 'Previous week')}
          >
            <ChevronRight size={18} />
          </button>
          <button className="btn-ghost cal-today" onClick={() => setWeekStart(sundayOf(new Date()))}>
            {L('היום', 'Today')}
          </button>
          <button
            className="icon-btn"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label={L('שבוע הבא', 'Next week')}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="cal-weeklabel" dir="ltr">{weekLabel}</span>
        </div>
        <div className="cal-actions">
          <button className="btn-soft" onClick={() => { setInviting(true); setSelected(null); setAdding(false) }}>
            {L('זמן מאמן', 'Invite coach')}
          </button>
          <button className="btn-primary cal-add" style={{ marginTop: 0 }} onClick={() => openAdd()}>
            <Plus size={18} /> {L('הוסף אימון', 'Add')}
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonCards count={2} />
      ) : error ? (
        <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>
      ) : (
        <div className="cal-scroll" ref={calRef}>
          <div className="cal-grid">
            <div className="cal-corner" />
            {days.map((d, i) => {
              const ds = ymd(d)
              return (
                <div key={i} className={'cal-dayhead' + (ds === todayStr ? ' today' : '')}>
                  <span className="cal-dayname">
                    {d.toLocaleDateString(locale, { weekday: 'short' })}
                  </span>
                  <span className="cal-daynum">{d.getDate()}</span>
                </div>
              )
            })}

            <div className="cal-gutter">
              {hours.map((h) => (
                <div key={h} className="cal-hour" style={{ height: ROW_H }}>
                  <span dir="ltr">{pad(h)}:00</span>
                </div>
              ))}
            </div>

            {days.map((d, i) => {
              const ds = ymd(d)
              const dayEntries = entries.filter((e) => e.date === ds)
              return (
                <div
                  key={i}
                  className={'cal-daycol' + (ds === todayStr ? ' today' : '')}
                  style={{ height: hours.length * ROW_H }}
                  onClick={(ev) => {
                    const rect = ev.currentTarget.getBoundingClientRect()
                    const y = ev.clientY - rect.top
                    const hour = Math.min(END_HOUR, START_HOUR + Math.floor(y / ROW_H))
                    openAdd(ds, hour)
                  }}
                >
                  {dayEntries.map((e) => {
                    const s = hoursOf(e.start_time) ?? (e.hour || 18)
                    const en = hoursOf(e.end_time) ?? s + 1
                    const top = (s - START_HOUR) * ROW_H
                    const height = Math.max(28, (en - s) * ROW_H - 2)
                    return (
                      <button
                        key={e.id}
                        className={'cal-event' + (e.is_personal ? ' personal' : '')}
                        style={{ top, height }}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setSelected(e)
                        }}
                      >
                        <span className="cal-event-time" dir="ltr">
                          {e.start_time}
                          {e.end_time ? '–' + e.end_time : ''}
                        </span>
                        <span className="cal-event-title">
                          {e.is_personal ? L('אימון אישי', 'Personal') : trTeam(e.team)}
                        </span>
                        {e.plan && <span className="cal-event-plan">{e.plan.name}</span>}
                      </button>
                    )
                  })}

                  {meetings.filter((m) => m.date === ds).map((m) => {
                    const s = hoursOf(m.start_time) ?? 18
                    const en = hoursOf(m.end_time) ?? s + 1
                    const top = (s - START_HOUR) * ROW_H
                    const height = Math.max(28, (en - s) * ROW_H - 2)
                    const other = m.from_coach === me ? m.to_p : m.from_p
                    return (
                      <button
                        key={'m' + m.id}
                        className={'cal-event meeting' + (m.status === 'pending' ? ' pending' : '')}
                        style={{ top, height }}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setSelected({ ...m, _meeting: true })
                        }}
                      >
                        <span className="cal-event-time" dir="ltr">
                          {m.start_time}
                          {m.end_time ? '–' + m.end_time : ''}
                        </span>
                        <span className="cal-event-title">{m.topic}</span>
                        <span className="cal-event-plan">
                          {coachName(other)}
                          {m.status === 'pending' ? L(' · ממתין', ' · pending') : ''}
                        </span>
                      </button>
                    )
                  })}

                  {ds === todayStr && (() => {
                    const now = new Date()
                    const nowH = now.getHours() + now.getMinutes() / 60
                    if (nowH < START_HOUR || nowH > END_HOUR + 1) return null
                    return <div className="cal-nowline" style={{ top: (nowH - START_HOUR) * ROW_H }} aria-hidden="true" />
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="muted small" style={{ marginTop: 10 }}>
        {L('לחיצה על משבצת ריקה מוסיפה אימון באותה שעה.', 'Tap an empty slot to add a practice at that time.')}
      </p>

      {/* פרטי פגישה שנבחרה */}
      {selected && selected._meeting && (
        <div className="cal-detail">
          <div className="cal-detail-head">
            <strong>{L('פגישה: ', 'Meeting: ')}{selected.topic}</strong>
            <button className="icon-btn" onClick={() => setSelected(null)} aria-label={L('סגור', 'Close')}>
              <X size={16} />
            </button>
          </div>
          <div className="cal-detail-row" dir="ltr">
            {selected.start_time}
            {selected.end_time ? '–' + selected.end_time : ''}
          </div>
          <div className="cal-detail-plan">
            {selected.to_coach === me ? L('מ: ', 'From: ') : L('עם: ', 'With: ')}
            {coachName(selected.from_coach === me ? selected.to_p : selected.from_p)}
          </div>
          <div className={'cal-status cal-status-' + selected.status}>
            {selected.status === 'pending'
              ? L('ממתין לאישור', 'Pending')
              : selected.status === 'accepted'
                ? <><Check size={14} aria-hidden="true" /> {L('אושר', 'Accepted')}</>
                : L('נדחה', 'Declined')}
          </div>
          {selected.note && <p className="muted small" style={{ marginTop: 8 }}>{selected.note}</p>}
          {selected.to_coach === me && selected.status === 'pending' && (
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => respondMeeting(selected, 'accepted')}>
                {L('אישור', 'Accept')}
              </button>
              <button className="btn-ghost" onClick={() => respondMeeting(selected, 'declined')}>
                {L('דחייה', 'Decline')}
              </button>
            </div>
          )}
          <button className="btn-ghost danger" style={{ marginTop: 12 }} onClick={() => removeMeeting(selected.id)}>
            <Trash2 size={15} /> {L('מחיקת הפגישה', 'Delete meeting')}
          </button>
        </div>
      )}

      {/* פרטי אימון שנבחר */}
      {selected && !selected._meeting && (
        <div className="cal-detail">
          <div className="cal-detail-head">
            <strong>
              {selected.is_personal ? L('אימון אישי', 'Personal practice') : trTeam(selected.team)}
            </strong>
            <button className="icon-btn" onClick={() => setSelected(null)} aria-label={L('סגור', 'Close')}>
              <X size={16} />
            </button>
          </div>
          <div className="cal-detail-row" dir="ltr">
            {selected.start_time}
            {selected.end_time ? '–' + selected.end_time : ''}
          </div>
          {selected.plan && (
            <button
              className="btn-primary cal-open-plan"
              style={{ marginTop: 8 }}
              onClick={() => openPlan(selected.plan)}
            >
              {L('פתח את תוכנית האימון', 'Open training plan')} · {selected.plan.name}
            </button>
          )}
          {selected.note && <p className="muted small" style={{ marginTop: 8 }}>{selected.note}</p>}
          <button
            className="btn-ghost danger"
            style={{ marginTop: 12 }}
            onClick={() => removeEntry(selected.id)}
          >
            <Trash2 size={15} /> {L('מחיקת האימון', 'Delete practice')}
          </button>
        </div>
      )}

      {/* טופס הוספה */}
      {adding && (
        <div className="cal-form">
          <div className="cal-form-head">
            <span className="field-label">{L('אימון חדש', 'New practice')}</span>
            <button className="icon-btn" onClick={() => setAdding(false)} aria-label={L('סגור', 'Close')}>
              <X size={16} />
            </button>
          </div>

          <label className="pf-label">
            {L('תאריך', 'Date')}
            <input
              className="finder-input"
              type="date"
              value={formDate}
              dir="ltr"
              onChange={(e) => setFormDate(e.target.value)}
            />
            <span className="muted small cal-il-date">{ilDate(formDate)}</span>
          </label>

          <div className="form-grid-2" style={{ marginTop: 10 }}>
            <label className="pf-label">
              {L('שעת התחלה', 'Start time')}
              <input
                className="finder-input"
                type="time"
                value={startTime}
                dir="ltr"
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="pf-label">
              {L('שעת סיום', 'End time')}
              <input
                className="finder-input"
                type="time"
                value={endTime}
                dir="ltr"
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>

          <div className="chips" style={{ marginTop: 12 }}>
            <button
              type="button"
              className={!isPersonal ? 'chip selected' : 'chip'}
              onClick={() => setIsPersonal(false)}
            >
              {L('אימון קבוצה', 'Team practice')}
            </button>
            <button
              type="button"
              className={isPersonal ? 'chip selected' : 'chip'}
              onClick={() => setIsPersonal(true)}
            >
              {L('אימון אישי', 'Personal practice')}
            </button>
          </div>

          {!isPersonal && (
            <input
              className="finder-input"
              type="text"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              aria-label={L('שם הקבוצה', 'Team name')}
              placeholder={L('שם הקבוצה (לדוגמה: נערים א׳ בנים)', 'Team name (e.g. Youth A Boys)')}
              style={{ marginTop: 10 }}
            />
          )}

          <select
            className="finder-input"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            aria-label={L('תוכנית אימון מצורפת', 'Attached training plan')}
            style={{ marginTop: 10 }}
          >
            <option value="">{L('— ללא תוכנית אימון מצורפת —', '— No attached training plan —')}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input
            className="finder-input"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={L('הערה לאימון', 'Practice note')}
            placeholder={L('הערה (לא חובה)', 'Note (optional)')}
            style={{ marginTop: 10 }}
          />

          <div className="form-actions">
            <button className="btn-primary" disabled={saving} onClick={saveEntry}>
              {saving ? L('שומר...', 'Saving...') : L('שמירת האימון', 'Save practice')}
            </button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>
              {L('ביטול', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      {/* טופס זימון מאמן */}
      {inviting && (
        <div className="cal-form">
          <div className="cal-form-head">
            <span className="field-label">{L('זימון מאמן לפגישה', 'Invite a coach to a meeting')}</span>
            <button className="icon-btn" onClick={() => setInviting(false)} aria-label={L('סגור', 'Close')}>
              <X size={16} />
            </button>
          </div>

          <label className="pf-label">
            {L('מאמן', 'Coach')}
            <select className="finder-input" value={invTo} onChange={(e) => setInvTo(e.target.value)}>
              <option value="">{L('— בחר מאמן —', '— Choose a coach —')}</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {coachName(c)}{c.club ? ` · ${c.club}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="pf-label" style={{ marginTop: 10 }}>
            {L('נושא הפגישה', 'Meeting topic')}
            <input
              className="finder-input"
              type="text"
              value={invTopic}
              onChange={(e) => setInvTopic(e.target.value)}
              placeholder={L('לדוגמה: תיאום משחק ידידות', 'e.g. Arrange a friendly game')}
            />
          </label>

          <label className="pf-label" style={{ marginTop: 10 }}>
            {L('תאריך', 'Date')}
            <input className="finder-input" type="date" dir="ltr" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
            <span className="muted small cal-il-date">{ilDate(invDate)}</span>
          </label>

          <div className="form-grid-2" style={{ marginTop: 10 }}>
            <label className="pf-label">
              {L('שעת התחלה', 'Start time')}
              <input className="finder-input" type="time" dir="ltr" value={invStart} onChange={(e) => setInvStart(e.target.value)} />
            </label>
            <label className="pf-label">
              {L('שעת סיום', 'End time')}
              <input className="finder-input" type="time" dir="ltr" value={invEnd} onChange={(e) => setInvEnd(e.target.value)} />
            </label>
          </div>

          <input
            className="finder-input"
            type="text"
            value={invNote}
            onChange={(e) => setInvNote(e.target.value)}
            aria-label={L('הערה', 'Note')}
            placeholder={L('הערה (לא חובה)', 'Note (optional)')}
            style={{ marginTop: 10 }}
          />

          <div className="form-actions">
            <button className="btn-primary" disabled={invSaving} onClick={sendInvite}>
              {invSaving ? L('שולח...', 'Sending...') : L('שליחת זימון', 'Send invite')}
            </button>
            <button className="btn-ghost" onClick={() => setInviting(false)}>
              {L('ביטול', 'Cancel')}
            </button>
          </div>
          {coaches.length === 0 && (
            <p className="muted small" style={{ marginTop: 8 }}>
              {L('אין עדיין מאמנים אחרים במערכת.', 'No other coaches in the system yet.')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
