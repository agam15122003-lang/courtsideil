import { Fragment } from 'react'
import { MapPin, X, Clock } from 'lucide-react'
import { WEEKDAYS } from './sessionId'
import { L, trTeam } from './i18n'

const hhmm = (t) => (t ? String(t).slice(0, 5) : '')

// טבלת לו״ז שבועית קבועה — הימים למעלה, טורי שעות בצד (התחלה–סיום),
// ובכל משבצת שם הקבוצה (אופציונלי) + מיקום. משמש גם למאמן וגם לשחקן.
// props: slots [{id, weekday, start_time, end_time, location, team}], showTeam, onDelete?
export default function ScheduleGrid({ slots, showTeam = false, onDelete }) {
  if (!slots || slots.length === 0) return null
  const days = [...new Set(slots.map((s) => s.weekday))].sort((a, b) => a - b)
  const timeKeys = [...new Set(slots.map((s) => `${hhmm(s.start_time)}|${hhmm(s.end_time)}`))]
    .sort((a, b) => a.localeCompare(b))
  const cell = {}
  for (const s of slots) {
    const k = `${s.weekday}|${hhmm(s.start_time)}|${hhmm(s.end_time)}`
    ;(cell[k] = cell[k] || []).push(s)
  }

  return (
    <div className="sg-wrap">
      <div className="sg" style={{ gridTemplateColumns: `auto repeat(${days.length}, minmax(84px, 1fr))` }}>
        <span className="sg-corner" aria-hidden="true" />
        {days.map((d) => (
          <span key={d} className="sg-day">{L(WEEKDAYS[d][0], WEEKDAYS[d][1])}</span>
        ))}
        {timeKeys.map((tk) => {
          const [st, en] = tk.split('|')
          return (
            <Fragment key={tk}>
              <span className="sg-time">
                <Clock size={12} aria-hidden="true" />
                <b dir="ltr">{st}</b>
                {en && <i dir="ltr">{en}</i>}
              </span>
              {days.map((d) => {
                const items = cell[`${d}|${tk}`] || []
                return (
                  <span key={d} className={items.length ? 'sg-cell filled' : 'sg-cell'}>
                    {items.map((s, i) => (
                      <span key={i} className="sg-item">
                        {showTeam && <b className="sg-team">{trTeam(s.team)}</b>}
                        <span className={s.location ? 'sg-loc' : 'sg-loc muted'}>
                          <MapPin size={11} aria-hidden="true" /> {s.location || L('אימון', 'Practice')}
                        </span>
                        {onDelete && (
                          <button className="sg-del" onClick={() => onDelete(s.id)} aria-label={L('הסר', 'Remove')}><X size={11} /></button>
                        )}
                      </span>
                    ))}
                  </span>
                )
              })}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
