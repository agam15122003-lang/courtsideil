import { CalendarDays, MapPin, ClipboardList, ClipboardCheck, RotateCw, Plus } from 'lucide-react'
import { L, trTeam, cnt } from './i18n'
import { teamTone } from './ScheduleGrid'

// רכיב הלו"ז המשותף (מסמך ההשקה 1.2) — רשימה שבועית: כותרת יום, ומתחתיה
// כרטיסי אירועים בסדר כרונולוגי. משמש גם את המאמן (עם צ'יפים) וגם את השחקן.
//
// props:
//   days        — [{ date: 'YYYY-MM-DD', items: [ev] }] שבעה ימים; ימים ריקים מדולגים
//   isCoach     — מציג את שורת הצ'יפים (תוכנית / נוכחות / אישורי הגעה)
//   attMarked   — Set של `${team}|${date}` שנוכחותם סומנה
//   rsvpYes     — { [session_id]: מספר שאישרו }
//   rosterCount — { [team]: מספר שחקנים מחוברים }
//   onOpen(ev) / onOpenPlan(ev) / onBuildPlan(ev) / onAttendance(ev)
//   renderActions(ev) — תוספות מתחת לכרטיס (למשל אישור הגעה של שחקן)
//
// צורת אירוע (ev): { key, session_id, kind: 'practice'|'game'|'meeting'|'personal',
//   date, start_time, end_time, team, location, plan, recurring, opponent, topic, raw }

const hm = (t) => (t ? String(t).slice(0, 5) : '')
const pad = (n) => String(n).padStart(2, '0')
const ymdToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function evTitle(ev) {
  if (ev.kind === 'meeting') return ev.topic || L('פגישה', 'Meeting')
  if (ev.kind === 'game') return ev.opponent ? L(`נגד ${ev.opponent}`, `vs ${ev.opponent}`) : L('משחק', 'Game')
  if (ev.kind === 'personal') return L('אימון אישי', 'Personal practice')
  return ev.team ? trTeam(ev.team) : L('אימון קבוצתי', 'Team practice')
}

export default function WeekList({
  days, isCoach,
  attMarked, rsvpYes, rosterCount,
  onOpen, onOpenPlan, onBuildPlan, onAttendance,
  renderActions,
}) {
  const todayStr = ymdToday()
  const nonEmpty = (days || []).filter((d) => d.items?.length > 0)

  if (nonEmpty.length === 0) {
    return (
      <div className="empty-state" style={{ marginTop: 14 }}>
        <span className="empty-ic"><CalendarDays size={26} /></span>
        <div className="empty-title">{L('שבוע ריק', 'An empty week')}</div>
        <p className="muted small">
          {isCoach
            ? L('אין אימונים או משחקים בשבוע הזה. אפשר להוסיף אימון בכפתור למעלה.', 'No practices or games this week. Add one with the button above.')
            : L('אין אימונים או משחקים בשבוע הזה. כשהמאמן יוסיף — הם יופיעו כאן.', 'No practices or games this week. When your coach adds one, it shows up here.')}
        </p>
      </div>
    )
  }

  return (
    <div className="wl">
      {nonEmpty.map(({ date, items }) => {
        const d = new Date(date + 'T00:00')
        const sorted = [...items].sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
        return (
          <section className="wl-day" key={date}>
            <p className="wl-day-hd">
              <b>
                {d.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long' })}
                {' · '}
                <bdi dir="ltr">{`${d.getDate()}.${d.getMonth() + 1}`}</bdi>
              </b>
              {date === todayStr && <em className="wl-today">{L('היום', 'Today')}</em>}
              <span className="wl-day-n">{cnt(sorted.length, L('מועד אחד', 'one session'), L('מועדים', 'sessions'))}</span>
            </p>
            {sorted.map((ev) => {
              const attDone = attMarked?.has(`${ev.team}|${ev.date}`)
              const yes = rsvpYes?.[ev.session_id] || 0
              const total = rosterCount?.[ev.team] || 0
              const showChips = isCoach && (ev.kind === 'practice' || ev.kind === 'personal')
              const isPast = ev.date < todayStr
              return (
                <div className={'wl-card' + (ev.kind === 'game' ? ' game' : '') + (ev.kind === 'meeting' ? ' meeting' : '')} key={ev.key}>
                  <button type="button" className="wl-head" onClick={onOpen ? () => onOpen(ev) : undefined} disabled={!onOpen}>
                    <span className="wl-time" dir="ltr">
                      <b>{hm(ev.start_time) || '—'}</b>
                      {ev.end_time && <span>{hm(ev.end_time)}</span>}
                    </span>
                    <span className={'wl-dot ' + teamTone(ev.team)} aria-hidden="true" />
                    <span className="wl-main">
                      <b className="wl-title">
                        {evTitle(ev)}
                        {ev.kind === 'game' && <span className="wl-tag">{L('משחק', 'Game')}</span>}
                        {ev.recurring && <RotateCw size={12} className="wl-rec" aria-hidden="true" />}
                      </b>
                      {(ev.location || (!isCoach && ev.plan?.name)) && (
                        <span className="wl-sub">
                          {ev.location && <><MapPin size={12} aria-hidden="true" /> {ev.location}</>}
                          {!isCoach && ev.plan?.name && <>{ev.location ? ' · ' : ''}{L('תוכנית: ', 'Plan: ')}{ev.plan.name}</>}
                        </span>
                      )}
                    </span>
                  </button>
                  {showChips && (
                    <div className="wl-chips">
                      {ev.plan ? (
                        <button type="button" className="wl-chip ok" onClick={() => onOpenPlan?.(ev)}>
                          <ClipboardList size={13} /> {L('יש תוכנית', 'Plan ready')}
                        </button>
                      ) : (
                        <button type="button" className="wl-chip build" onClick={() => onBuildPlan?.(ev)}>
                          <Plus size={13} /> {L('לבנות תוכנית', 'Build a plan')}
                        </button>
                      )}
                      {ev.kind === 'practice' && (
                        <button type="button" className={'wl-chip' + (attDone ? ' ok' : ' warn')} onClick={() => onAttendance?.(ev)}>
                          <ClipboardCheck size={13} /> {attDone ? L('נוכחות סומנה', 'Attendance done') : L('נוכחות', 'Attendance')}
                        </button>
                      )}
                      {ev.kind === 'practice' && !isPast && total > 0 && (
                        <button type="button" className="wl-chip soft" onClick={onOpen ? () => onOpen(ev) : undefined}>
                          <bdi dir="ltr">{yes}/{total}</bdi> {L('אישרו', 'confirmed')}
                        </button>
                      )}
                    </div>
                  )}
                  {renderActions && <div className="wl-extra">{renderActions(ev)}</div>}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
