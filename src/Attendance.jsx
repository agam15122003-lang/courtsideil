import { useState, useEffect, useMemo } from 'react'
import {
  UserCheck, UserX, Clock3, CheckCheck, ChevronRight, ChevronLeft,
  RotateCcw, CalendarCheck2, TrendingUp,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L } from './i18n'

// ---- עזרי תאריך (תצוגה ישראלית) ----
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const ilDay = (str) => {
  const d = new Date(str + 'T00:00')
  return isNaN(d) ? str : d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })
}

const STATUS_META = [
  { key: 'present', he: 'נוכח', en: 'Present', Icon: UserCheck },
  { key: 'late', he: 'איחר', en: 'Late', Icon: Clock3 },
  { key: 'absent', he: 'חסר', en: 'Absent', Icon: UserX },
]

// מסך נוכחות — סימון בלחיצה אחת לכל שחקן, לכל תאריך אימון,
// עם סיכום עונתי (אחוז נוכחות לכל שחקן).
// props:
//   session - המשתמש המחובר
//   team    - הקבוצה הנבחרת (מגיע ממסך הקבוצות)
//   players - סגל הקבוצה (כבר נטען במסך הקבוצות)
export default function Attendance({ session, team, players }) {
  const me = session.user.id
  const [day, setDay] = useState(new Date())
  const [seasonRows, setSeasonRows] = useState([]) // כל רשומות העונה — גם ליום וגם לאחוזים
  const [loading, setLoading] = useState(true)
  const [sqlMissing, setSqlMissing] = useState(false)
  const date = ymd(day)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('practice_attendance')
      .select('*')
      .eq('coach_id', me)
      .eq('team', team)
    if (error) {
      // רק "טבלה לא קיימת" (42P01 / undefined_table) מציג את הסבר ה-SQL.
      // תקלת רשת/RLS חולפת מציגה שגיאה רגילה עם רענון — לא הוראות מפחידות.
      const missing = error.code === '42P01' || /relation .* does not exist|could not find the table/i.test(error.message || '')
      setSqlMissing(missing)
      if (!missing) toast.error(L('טעינת הנוכחות נכשלה — בדוק חיבור ורענן', 'Failed to load attendance — check your connection and refresh'))
      setSeasonRows([])
    } else {
      setSqlMissing(false)
      setSeasonRows(data || [])
    }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [team])

  // מפת הסטטוסים של היום הנבחר: player_id -> status
  const todays = useMemo(() => {
    const m = {}
    for (const r of seasonRows) if (r.session_date === date) m[r.player_id] = r.status
    return m
  }, [seasonRows, date])

  // סיכום עונתי לכל שחקן: כמה אימונים סומנו, בכמה נכח (נוכח/איחר)
  const seasonStats = useMemo(() => {
    const per = {}
    for (const r of seasonRows) {
      per[r.player_id] = per[r.player_id] || { present: 0, total: 0 }
      per[r.player_id].total += 1
      if (r.status !== 'absent') per[r.player_id].present += 1
    }
    return per
  }, [seasonRows])
  const sessionsCount = useMemo(
    () => new Set(seasonRows.map((r) => r.session_date)).size,
    [seasonRows]
  )

  const markedToday = players.filter((p) => todays[p.id]).length
  const presentToday = players.filter((p) => todays[p.id] && todays[p.id] !== 'absent').length

  // סימון סטטוס לשחקן. לחיצה חוזרת על אותו סטטוס — מבטלת את הסימון.
  const setStatus = async (playerId, status) => {
    if (todays[playerId] === status) {
      const { error } = await supabase
        .from('practice_attendance')
        .delete()
        .eq('coach_id', me).eq('team', team)
        .eq('session_date', date).eq('player_id', playerId)
      if (error) { toast.error(L('הביטול נכשל: ', 'Undo failed: ') + error.message); return }
      setSeasonRows((rs) => rs.filter((r) => !(r.session_date === date && r.player_id === playerId)))
      return
    }
    const { error } = await supabase
      .from('practice_attendance')
      .upsert(
        { coach_id: me, team, session_date: date, player_id: playerId, status },
        { onConflict: 'coach_id,team,session_date,player_id' }
      )
    if (error) { toast.error(L('השמירה נכשלה (הרצת את ה-SQL?): ', 'Save failed (ran the SQL?): ') + error.message); return }
    // עדכון מקומי מיידי — בלי לרענן את כל הרשימה בכל לחיצה
    setSeasonRows((rs) => [
      ...rs.filter((r) => !(r.session_date === date && r.player_id === playerId)),
      { coach_id: me, team, session_date: date, player_id: playerId, status },
    ])
  }

  // קיצור דרך: כל מי שעוד לא סומן היום — מסומן כנוכח
  const markAllPresent = async () => {
    const missing = players.filter((p) => !todays[p.id])
    if (missing.length === 0) { toast.success(L('כולם כבר מסומנים', 'Everyone is already marked')); return }
    const rows = missing.map((p) => ({
      coach_id: me, team, session_date: date, player_id: p.id, status: 'present',
    }))
    const { error } = await supabase
      .from('practice_attendance')
      .upsert(rows, { onConflict: 'coach_id,team,session_date,player_id' })
    if (error) { toast.error(L('השמירה נכשלה (הרצת את ה-SQL?): ', 'Save failed (ran the SQL?): ') + error.message); return }
    setSeasonRows((rs) => [...rs, ...rows])
    toast.success(L(`${rows.length} שחקנים סומנו כנוכחים`, `${rows.length} players marked present`))
  }

  if (loading) {
    return <p className="muted" style={{ marginTop: 16 }}>{L('טוען...', 'Loading...')}</p>
  }

  if (sqlMissing) {
    return (
      <div className="team-section">
        <div className="empty-state">
          <span className="empty-ic"><CalendarCheck2 size={26} /></span>
          <div className="empty-title">{L('נשאר צעד אחד להפעלת הנוכחות', 'One step left to enable attendance')}</div>
          <p className="muted small">
            {L('צריך להריץ את הקובץ supabase_attendance.sql ב-Supabase (SQL Editor → Run) פעם אחת, ואז לרענן את העמוד.',
               'Run supabase_attendance.sql once in Supabase (SQL Editor → Run), then refresh this page.')}
          </p>
          <button type="button" className="btn-soft empty-cta" onClick={load}>
            <RotateCcw size={15} /> {L('בדיקה מחדש', 'Check again')}
          </button>
        </div>
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div className="team-section">
        <div className="empty-state">
          <span className="empty-ic"><CalendarCheck2 size={26} /></span>
          <div className="empty-title">{L('אין עדיין שחקנים בסגל', 'No players in the roster yet')}</div>
          <p className="muted small">{L('הוסף שחקנים בלשונית "סגל" — ואז אפשר לסמן נוכחות בלחיצה.', 'Add players in the "Roster" tab — then mark attendance with one tap.')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="team-section">
      <p className="muted small">
        {L('בחר תאריך אימון וסמן נוכחות בלחיצה. לחיצה חוזרת מבטלת את הסימון.',
           'Pick a practice date and mark attendance with one tap. Tap again to clear.')}
      </p>

      {/* בורר יום */}
      <div className="att-toolbar">
        <div className="period-pill att-period">
          <button className="period-arrow" onClick={() => setDay((d) => addDays(d, -1))} aria-label={L('יום קודם', 'Previous day')}><ChevronRight size={17} /></button>
          <span className="period-text">{ilDay(date)}</span>
          <button className="period-arrow" onClick={() => setDay((d) => addDays(d, 1))} aria-label={L('יום הבא', 'Next day')}><ChevronLeft size={17} /></button>
        </div>
        <button className="period-today2" onClick={() => setDay(new Date())}>
          <RotateCcw size={13} /> {L('חזרה להיום', 'Back to today')}
        </button>
      </div>

      {/* סיכום היום + סמן את כולם */}
      <div className="att-day-bar">
        <span className="att-day-count">
          <UserCheck size={16} aria-hidden="true" />
          {markedToday === 0
            ? L('עוד לא סומנה נוכחות ליום זה', 'No attendance marked for this day yet')
            : L(`נוכחים ${presentToday} מתוך ${players.length}`, `${presentToday} of ${players.length} present`)}
        </span>
        <button className="btn-soft att-markall" onClick={markAllPresent}>
          <CheckCheck size={16} /> {L('סמן את כולם נוכחים', 'Mark everyone present')}
        </button>
      </div>

      {/* רשימת השחקנים */}
      <ul className="roster-list">
        {players.map((p) => {
          const cur = todays[p.id]
          return (
            <li key={p.id} className={cur ? `roster-row att-row att-marked-${cur}` : 'roster-row att-row'}>
              {p.number
                ? <span className="roster-jersey">{p.number}</span>
                : <span className="roster-jersey att-jersey-empty" aria-hidden="true">·</span>}
              <span className="roster-name">{p.name}</span>
              <div className="att-seg" role="group" aria-label={L(`נוכחות של ${p.name}`, `Attendance for ${p.name}`)}>
                {STATUS_META.map(({ key, he, en, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={cur === key ? `att-btn att-on-${key}` : 'att-btn'}
                    aria-pressed={cur === key}
                    onClick={() => setStatus(p.id, key)}
                  >
                    <Icon size={14} aria-hidden="true" /> {L(he, en)}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      {/* סיכום עונתי */}
      <div className="staff-block">
        <h3 className="staff-head"><TrendingUp size={16} /> {L('נוכחות העונה', 'Season attendance')}</h3>
        {sessionsCount === 0 ? (
          <p className="muted small">{L('אחרי שתסמן נוכחות באימון הראשון — יופיע כאן אחוז הנוכחות של כל שחקן.', 'After your first marked practice, each player’s attendance rate will appear here.')}</p>
        ) : (
          <>
            <p className="muted small">
              {sessionsCount === 1
                ? L('אימון אחד סומן עד כה', '1 practice marked so far')
                : L(`${sessionsCount} אימונים סומנו עד כה`, `${sessionsCount} practices marked so far`)}
            </p>
            <ul className="att-stats">
              {players.map((p) => {
                const s = seasonStats[p.id]
                const pct = s && s.total > 0 ? Math.round((s.present / s.total) * 100) : null
                return (
                  <li key={p.id} className="att-stat-row">
                    <span className="att-stat-name">{p.name}</span>
                    <span className="att-bar" aria-hidden="true">
                      <span style={{ width: `${pct ?? 0}%` }} />
                    </span>
                    <span className="att-stat-pct" dir="ltr">
                      {pct === null ? '—' : `${pct}%`}
                      {s && <span className="att-stat-frac"> ({s.present}/{s.total})</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
