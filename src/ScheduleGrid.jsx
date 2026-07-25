import { Fragment } from 'react'
import { MapPin, X, Clock } from 'lucide-react'
import { WEEKDAYS } from './sessionId'
import { L, trTeam } from './i18n'

const hhmm = (t) => (t ? String(t).slice(0, 5) : '')

// צבע עקבי לקבוצה — כדי שמאמן עם כמה קבוצות יבחין ביניהן במבט
const TEAM_TONES = 4
const teamTone = (team) => {
  let h = 0
  for (const ch of String(team || '')) h = (h * 31 + ch.charCodeAt(0)) % 997
  return `t${h % TEAM_TONES}`
}

// טבלת לו״ז שבועית קבועה — כל שבעת הימים תמיד (גם הריקים), כדי שרואים במבט
// אחד מתי יש אימון ומתי לא. היום הנוכחי מודגש. משמש גם למאמן וגם לשחקן.
// props: slots [{id, weekday, start_time, end_time, location, team}], showTeam, onDelete?
export default function ScheduleGrid({ slots, showTeam = false, onDelete }) {
  if (!slots || slots.length === 0) return null
  const days = [0, 1, 2, 3, 4, 5, 6]
  const todayW = new Date().getDay()
  const timeKeys = [...new Set(slots.map((s) => `${hhmm(s.start_time)}|${hhmm(s.end_time)}`))]
    .sort((a, b) => a.localeCompare(b))
  const cell = {}
  for (const s of slots) {
    const k = `${s.weekday}|${hhmm(s.start_time)}|${hhmm(s.end_time)}`
    ;(cell[k] = cell[k] || []).push(s)
  }

  return (
    <div className="sg-wrap">
      <div className="sg" style={{ gridTemplateColumns: `auto repeat(${days.length}, minmax(76px, 1fr))` }}>
        <span className="sg-corner" aria-hidden="true" />
        {days.map((d) => (
          <span key={d} className={d === todayW ? 'sg-day today' : 'sg-day'}>
            {L(WEEKDAYS[d][0], WEEKDAYS[d][1])}
            {d === todayW && <em className="sg-today-tag">{L('היום', 'Today')}</em>}
          </span>
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
                const cls = ['sg-cell', items.length ? 'filled' : '', d === todayW ? 'todaycol' : '']
                  .filter(Boolean).join(' ')
                return (
                  <span key={d} className={cls}>
                    {items.map((s, i) => (
                      <span key={i} className={`sg-item ${teamTone(s.team)}`}>
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
