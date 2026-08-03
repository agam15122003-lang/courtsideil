import { useEffect, useRef, useState } from 'react'
import { CalendarClock, MapPin, Clock, PlayCircle, UserCheck, CalendarPlus, ClipboardCheck, Flame, Target, Trophy } from 'lucide-react'
import { supabase } from './supabaseClient'
import { downloadIcs } from './ics'
import SessionDetail from './SessionDetail'
import { expandSlotsRange } from './sessionId'
import { L, trTeam } from './i18n'

const pad = (n) => String(n).padStart(2, '0')
const ilNum = (str) => { if (!str) return ''; const d = new Date(str + 'T00:00'); return isNaN(d) ? str : d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear() }
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (t) => (t ? String(t).slice(0, 5) : '')

// הכרטיס החכם של המאמן — הזרימה מגיעה אליך:
// לפני אימון → ספירה לאחור + "יעדים לשחקנים"; אחרי אימון → דוח מצב (כמה מילאו, עומס ממוצע).
// props: session, onNavigate(viewId), onEntry(entry|null)
//
// onEntry מדווח את האימון הקרוב כלפי מעלה, כדי שרצועת אישורי ההגעה בבית
// המאמן תשתמש באותו מופע בדיוק — בלי לשכפל את מיזוג שלושת המקורות שכאן.
//
// schedule — הלו"ז המשותף שנשלף פעם אחת ב-Home ({ ready, entries, slots }).
// עד היום schedule_entries ו-team_practice_slots נשלפו כאן שוב, למרות
// שאותן שתי שאילתות בדיוק כבר רצו במקטעים האחרים של אותו מסך.
export default function NextPractice({ session, schedule, onNavigate, onEntry }) {
  const me = session?.user?.id
  const schedReady = !!schedule?.ready
  const schedEntries = schedule?.entries
  const schedSlots = schedule?.slots
  const [entry, setEntry] = useState(null)
  const [recent, setRecent] = useState(null) // {id, team, date, start_time, avg, rated, total}
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [report, setReport] = useState(null) // entry לפתיחת SessionDetail
  const [pendingGame, setPendingGame] = useState(null) // משחק מהשבוע בלי סיכום

  // דיווח האימון הקרוב כלפי מעלה. ב-ref כדי שהחלפת הפונקציה בהורה
  // לא תפעיל את האפקט מחדש בכל רינדור.
  const onEntryRef = useRef(onEntry)
  onEntryRef.current = onEntry
  useEffect(() => { onEntryRef.current?.(entry) }, [entry])

  useEffect(() => {
    if (!schedReady) return
    let alive = true
    ;(async () => {
      const today = new Date()
      const from = new Date(Date.now() - 2 * 86400000)
      const until = new Date(Date.now() + 14 * 86400000)
      const entries = schedEntries || []
      const slots = schedSlots || []
      const { data: upGames } = me
        ? await supabase.from('team_games').select('id, team, game_date, game_time, opponent, location').eq('coach_id', me).gte('game_date', ymd(today)).lte('game_date', ymd(until)).order('game_date')
        : { data: [] }
      if (!alive) return
      const occs = expandSlotsRange(slots || [], from, until).map((o) => ({
        id: o.session_id, date: o.date, start_time: o.start_time, end_time: o.end_time,
        team: o.team, location: o.location, _recurring: true,
      }))
      // גם משחקים נכנסים לספירה — "המשחק הבא" מנצח אימון אם הוא קודם.
      // אין שעת סיום למשחק — שעתיים סינתטיות כדי שיישאר "מתקיים עכשיו" בזמן המשחק.
      const gEnd = (t) => {
        if (!t) return null
        const [h, m] = String(t).slice(0, 5).split(':').map(Number)
        return `${String(Math.min(23, h + 2)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      }
      const gameOccs = (upGames || []).map((g) => ({
        id: g.id, date: g.game_date, start_time: g.game_time ? String(g.game_time).slice(0, 5) : null,
        end_time: gEnd(g.game_time), team: g.team, location: g.location, _game: true, opponent: g.opponent,
      }))
      const all = [...(entries || []), ...occs, ...gameOccs]
        .sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))
      const nowTs = Date.now()
      const endOf = (e) => new Date(`${e.date}T${e.end_time || e.start_time || '23:59'}`).getTime()

      // הבא: הראשון שעוד לא נגמר
      setEntry(all.find((e) => !isNaN(endOf(e)) && endOf(e) >= nowTs) || null)

      // משחק מהשבוע האחרון שעדיין בלי סיכום — קודם היה אפשר לסכם רק אימונים,
      // ומשחקים נעלמו מהכרטיס בבית לגמרי.
      if (me) {
        const weekAgo = new Date(Date.now() - 7 * 86400000)
        const [{ data: games }, { data: reviews }] = await Promise.all([
          supabase.from('team_games').select('id, team, game_date, game_time, opponent')
            .eq('coach_id', me).gte('game_date', ymd(weekAgo)).lte('game_date', ymd(today))
            .order('game_date', { ascending: false }),
          supabase.from('session_reviews').select('session_id').eq('coach_id', me).eq('session_type', 'game'),
        ])
        if (!alive) return
        const reviewed = new Set((reviews || []).map((r) => r.session_id))
        const g = (games || []).find((x) => !reviewed.has(x.id) &&
          new Date(`${x.game_date}T${x.game_time || '23:59'}`).getTime() < nowTs)
        setPendingGame(g || null)
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, schedReady, schedEntries, schedSlots])

  // טיקר מסתגל: כשנשארה יותר משעה הכרטיס מציג רק «בעוד X שעות/ימים»,
  // ולכן פעימה בדקה מספיקה. ספירת שניות נדלקת רק בשעה האחרונה — שם
  // באמת מוצגות שניות (np-count-label). קודם זה היה setInterval של שנייה
  // כל עוד דף הבית פתוח, גם כשהאימון בעוד שבוע.
  useEffect(() => {
    if (!entry) return
    const startTs = new Date(`${entry.date}T${entry.start_time || '00:00'}`).getTime()
    const periodFor = (t) => {
      if (Number.isNaN(startTs)) return 60000
      const left = startTs - t
      return left <= 3600000 && left > -60000 ? 1000 : 60000
    }
    let id = setTimeout(function tick() {
      const t = Date.now()
      setNow(t)
      id = setTimeout(tick, periodFor(t))
    }, periodFor(Date.now()))
    return () => clearTimeout(id)
  }, [entry])

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

  // משחק שממתין לסיכום — פס נפרד, אותו דפוס בדיוק
  const gameStrip = pendingGame && (
    <button className="np-report np-game" onClick={() => setReport({ id: pendingGame.id, team: pendingGame.team, date: pendingGame.game_date, start_time: pendingGame.game_time, session_type: 'game', opponent: pendingGame.opponent })}>
      <span className="np-report-ic"><Trophy size={17} /></span>
      <span className="np-report-body">
        <strong>{L('משחק ממתין לסיכום', 'Game awaiting review')} · {trTeam(pendingGame.team)}</strong>
        <span className="np-report-meta">
          {pendingGame.opponent ? `${L('נגד', 'vs')} ${pendingGame.opponent} · ` : ''}{ilNum(pendingGame.game_date)}
        </span>
      </span>
      <span className="np-report-cta">{L('סכם', 'Review')}</span>
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
        {gameStrip}
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

  const isGame = !!entry._game
  const title = isGame
    ? (entry.opponent ? L(`נגד ${entry.opponent}`, `vs ${entry.opponent}`) : L('משחק', 'Game')) + (entry.team ? ` · ${trTeam(entry.team)}` : '')
    : entry.title || (entry.team ? trTeam(entry.team) : L('אימון', 'Practice'))

  // מפרט המסמך: שעה גדולה + תג "בעוד X" — בהיר יותר מספירה מפוצלת HH:MM:SS
  const whenTag = days > 1
    ? L(`בעוד ${days} ימים`, `in ${days} days`)
    : days === 1
      ? L('מחר', 'tomorrow')
      : hh >= 1
        ? L(`בעוד ${hh} שעות`, `in ${hh} hours`)
        : L(`בעוד ${mm} דקות`, `in ${mm} min`)
  const dayLabel = start.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })

  return (
    <div className={isGame ? 'np-card game' : 'np-card'}>
      <span className="np-eyebrow"><span className="np-dot" /> {isGame ? L('המשחק הבא', 'Next game') : L('האימון הבא', 'Next practice')}</span>
      <h3 className="np-title">{title}</h3>
      <div className="np-meta">
        <span><Clock size={14} /> {hm(entry.start_time)}{entry.end_time ? `–${hm(entry.end_time)}` : ''}</span>
        {entry.location && <span><MapPin size={14} /> {entry.location}</span>}
      </div>

      {started ? (
        <div className="np-live"><span className="np-live-dot" /> {isGame ? L('המשחק עכשיו!', 'Game time!') : L('מתקיים עכשיו', 'Happening now')}</div>
      ) : (
        <>
          {/* מפרט המסמך: שעה גדולה + תג "בעוד X" במקום ספירה מפוצלת.
              הספירה המדויקת נשארת כטקסט משני לשעה הקרובה. */}
          <div className="np-when">
            <div className="np-timer" dir="ltr">{hm(entry.start_time) || '—'}</div>
            <span className="np-when-tag">{whenTag}</span>
          </div>
          <span className="np-count-label">
            {dayLabel}
            {days === 0 && hh < 1 && ` · ${pad(mm)}:${pad(ss)}`}
          </span>
        </>
      )}

      <div className="np-actions">
        {entry.team && !entry.is_personal && (
          <button className="btn-primary" onClick={() => onNavigate('teams')}>
            <Target size={16} /> {L('יעדים לשחקנים', 'Player goals')}
          </button>
        )}
        <button className={entry.team && !entry.is_personal ? 'btn-soft' : 'btn-primary'} onClick={() => onNavigate(entry.plan ? `plans:${entry.plan.id}` : 'schedule')}>
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
      {gameStrip}
      {report && <SessionDetail session={session} entry={report} onClose={() => setReport(null)} />}
    </div>
  )
}
