import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, MapPin, Clock, PlayCircle, UserCheck, CalendarPlus, ClipboardCheck, Flame, Target, Trophy, Check as CheckLine, HeartPulse, X, Share2 } from 'lucide-react'
import { supabase } from './supabaseClient'
import { downloadIcs } from './ics'
import SessionDetail from './SessionDetail'
import { expandSlotsRange } from './sessionId'
import { L, trTeam } from './i18n'
// 4.9 — רצועת «מוכנות היום» מוצגת רק למאמני הפיילוט (PILOT_COACHES)
import { PLAYER_SIDE, PILOT_COACHES } from './flags'
// 4.9 — המילים והתאריך של הצ'ק-אין חיים בקובץ אחד, לא משוכפלים
import { localDate, SLEEP_RANGES, ENERGY_WORDS, BODY_WORDS, painAreaLabel } from './CheckinCard'
import useFocusTrap from './useFocusTrap'
import { waShare } from './share'
import { SITE_URL } from './constants'
import { toast } from './toast'

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
export default function NextPractice({ session, schedule, onNavigate, onEntry, variant, rsvp = null }) {
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
        // המכנה הוא כל הסגל (22.8) — וגם עם צד שחקן פתוח (2.9): המאמן ממשיך
        // לרשום עומס על שורת הסגל, ורוב הילדים עוד לא מחוברים
        const [effRes, rosterRes] = await Promise.all([
          // select('*'): העמודות source/roster_id (22.8) עשויות עוד לא להתקיים — כוכבית לא נופלת עליהן
          supabase.from('session_effort').select('*').eq('coach_id', me).eq('session_id', last.id),
          supabase.from('team_players').select('id, player_id').eq('coach_id', me).eq('team', last.team),
        ])
        if (!alive) return
        // שליפה שנכשלה (למשל בלי רשת) — לא מציגים רצועה חלולה שכל
        // המספרים בה אפס ו«פתח» שלה מוביל למסך שגיאה. אין נתונים = אין רצועה.
        if (effRes.error || rosterRes.error) { setLoading(false); return }
        const eff = effRes.data, roster = rosterRes.data
        // 2.9 — שתי האמיתות נספרות: מה שהמאמן רשם (roster_id) ומה שהשחקן
        // דיווח בעצמו (player_id). שחקן שיש לו גם וגם נספר פעם אחת.
        const rosterOfAuth = new Map((roster || []).filter((p) => p.player_id).map((p) => [p.player_id, p.id]))
        const rows = eff || []
        const who = new Set(rows.map((r) => (
          r.roster_id ? `r:${r.roster_id}` : rosterOfAuth.has(r.player_id) ? `r:${rosterOfAuth.get(r.player_id)}` : `p:${r.player_id}`
        )))
        const vals = rows.map((r) => Number(r.effort)).filter((n) => !Number.isNaN(n))
        // שורות המאמן נשארות בלי player_id לתמיד (README) — כל שורה עם player_id היא דיווח עצמי
        const self = rows.filter((r) => r.player_id).length
        setRecent({
          id: last.id, team: last.team, date: last.date, start_time: last.start_time, location: last.location,
          rated: who.size, total: (roster || []).length, self,
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
    return <div className={variant === 'board' ? 'nh-next nh-next-skeleton' : 'np-card np-skeleton'} aria-hidden="true" />
  }

  // דוח האימון האחרון — מוצג בשני המצבים
  const reportStrip = recent && (
    <button className="np-report" onClick={() => setReport({ id: recent.id, team: recent.team, date: recent.date, start_time: recent.start_time, session_type: 'practice' })}>
      <span className="np-report-ic"><ClipboardCheck size={17} /></span>
      <span className="np-report-body">
        <strong>{L('דוח האימון האחרון', 'Last practice report')} · {trTeam(recent.team)}</strong>
        <span className="np-report-meta">
          {recent.total > 0 && <span>{recent.rated}/{recent.total} {L('עומס נרשם', 'load logged')}</span>}
          {/* 2.9 — כמה מהם דיווחו בעצמם מהטלפון (צד שחקן פתוח) */}
          {PLAYER_SIDE && recent.self > 0 && <span>{recent.self} {L('דיווחו בעצמם', 'self-reported')}</span>}
          {recent.avg != null && <span className="np-report-avg"><Flame size={12} /> {L('עומס ממוצע', 'avg load')} {recent.avg.toFixed(1)}</span>}
          {recent.total > 0 && recent.rated === 0 && <span>{L('עוד לא נרשם עומס', 'no load logged yet')}</span>}
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
    if (variant === 'board') {
      return (
        <div className="nh-next nh-next-empty">
          <span className="nh-next-tag"><CalendarClock size={12} aria-hidden="true" /> {L('האימון הקרוב', 'Next practice')}</span>
          <h2 className="nh-next-title">{L('אין אימון קרוב בלו״ז', 'No upcoming practice')}</h2>
          {/* צד המאמן בלבד: אין שחקנים שיראו את הימים הקבועים */}
          <p className="nh-next-meta">{PLAYER_SIDE
            ? L('קבעו ימי אימון קבועים בקבוצות שלי — והם יופיעו כאן ואצל השחקנים.', 'Set fixed practice days in My teams — they show up here and for your players.')
            : L('קבעו ימי אימון קבועים בקבוצות שלי — והם יופיעו כאן ובלו״ז השבועי.', 'Set fixed practice days in My teams — they show up here and in your weekly schedule.')}</p>
          <div className="nh-next-acts">
            <button type="button" className="nh-btn nh-btn-primary" onClick={() => onNavigate('teams')}>
              <CalendarPlus size={16} aria-hidden="true" /> {L('קביעת ימי אימון', 'Set practice days')}
            </button>
          </div>
          {(reportStrip || gameStrip) && <div className="nh-next-strips">{reportStrip}{gameStrip}</div>}
          {report && <SessionDetail session={session} entry={report} onClose={() => setReport(null)} />}
        </div>
      )
    }
    return (
      <div className="np-card np-empty">
        <span className="np-eyebrow"><CalendarClock size={15} /> {L('האימון הבא', 'Next practice')}</span>
        <h3 className="np-empty-title">{L('אין אימון קרוב בלו"ז', 'No upcoming practice')}</h3>
        {/* צד המאמן בלבד: אין שחקנים שיראו את הימים הקבועים */}
        <p className="muted small">{PLAYER_SIDE
          ? L('קבע ימי אימון קבועים בקבוצות שלי — והם יופיעו כאן ואצל השחקנים.', 'Set fixed practice days in My teams — they show up here and for your players.')
          : L('קבע ימי אימון קבועים בקבוצות שלי — והם יופיעו כאן ובלו״ז השבועי.', 'Set fixed practice days in My teams — they show up here and in your weekly schedule.')}</p>
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

  // ---- גרסת «לוח» (11.8, מסמך העיצוב 3a) ----
  // אותה שליפה ואותם חישובים; מה שמשתנה הוא הקליפה: כרטיס זכוכית בתוך
  // הבאנר עם שם הקבוצה והשעה בשורה אחת, מצב התוכנית, שני כפתורים,
  // ושורת אישורי ההגעה (מגיעה מבחוץ כדי לא לשלוף את הסגל פעמיים).
  if (variant === 'board') {
    const timeText = hm(entry.start_time)
    const mins = entry.end_time && entry.start_time
      ? Math.round((new Date(`${entry.date}T${entry.end_time}`) - start) / 60000)
      : null
    return (
      <div className={isGame ? 'nh-next game' : 'nh-next'}>
        <div className="nh-next-top">
          <span className="nh-next-tag">
            <Clock size={12} aria-hidden="true" />
            {isGame ? L('המשחק הקרוב', 'Next game') : L('האימון הקרוב', 'Next practice')}
          </span>
          <span className="nh-next-when">{started ? L('מתקיים עכשיו', 'Happening now') : whenTag}</span>
        </div>

        <h2 className="nh-next-title">
          {isGame ? title : (entry.team ? trTeam(entry.team) : L('אימון', 'Practice'))}
          {timeText && <> · <span dir="ltr">{timeText}</span></>}
        </h2>
        <p className="nh-next-meta">
          {[entry.location, mins ? L(`${mins} דק׳`, `${mins} min`) : null, dayLabel].filter(Boolean).join(' · ')}
        </p>

        <p className={entry.plan ? 'nh-next-plan ready' : 'nh-next-plan'}>
          {entry.plan
            ? <><CheckLine size={13} aria-hidden="true" /> {L('תוכנית מוכנה', 'Plan ready')} · {entry.plan.name}</>
            : <><CalendarPlus size={13} aria-hidden="true" /> {L('עוד אין תוכנית לאימון הזה', 'No plan for this practice yet')}</>}
        </p>

        <div className="nh-next-acts">
          <button
            type="button"
            className="nh-btn nh-btn-primary"
            /* «סימון נוכחות» ניווט לטאב הסגל בקבוצה — מסך אחר לגמרי.
               עכשיו הוא פותח את גיליון הנוכחות והמשוב של האימון הקרוב עצמו;
               אימון אישי או אירוע בלי קבוצה נופלים ללו"ז, כמו קודם. */
            onClick={() => {
              if (entry.team && !entry.is_personal) {
                setReport({
                  id: entry.id, team: entry.team, date: entry.date, start_time: entry.start_time,
                  session_type: isGame ? 'game' : 'practice', opponent: entry.opponent,
                  location: entry.location,
                })
              } else {
                onNavigate('schedule')
              }
            }}
          >
            <UserCheck size={16} aria-hidden="true" /> {L('סימון נוכחות', 'Mark attendance')}
          </button>
          <button
            type="button"
            className="nh-btn nh-btn-ghost"
            onClick={() => onNavigate(entry.plan ? `plans:${entry.plan.id}` : 'work')}
          >
            {entry.plan ? L('לתוכנית', 'Open plan') : L('לבניית תוכנית', 'Build a plan')}
          </button>
        </div>

        {rsvp}
        {/* 4.9 — «מוכנות היום»: מי דיווח בצ'ק-אין הבוקר ומי צריך תשומת לב */}
        {entry.team && !entry.is_personal && <ReadinessStrip session={session} team={entry.team} />}
        {(reportStrip || gameStrip) && <div className="nh-next-strips">{reportStrip}{gameStrip}</div>}
        {report && <SessionDetail session={session} entry={report} onClose={() => setReport(null)} />}
      </div>
    )
  }

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

// ============================================================
// 4.9.2026 — «מוכנות היום»: רצועת הצ'ק-אין של הבוקר בכרטיס הלוח
// ============================================================
// «דיווחו N מתוך M · K לשים לב: <שמות>» — השמות על הכרטיס עצמו (החלטת
// הבעלים). טאפ פותח גיליון עם כל השורות: אדום (כאב שמפריע / חולה) →
// צהוב (שינה מתחת ל-7 שעות) → תקין → אפור (לא דיווח / «בלי שאלות» /
// ממתין לאישור הורה). M = שורות סגל עם חשבון מחובר ובלי wellness_off.
//
// הרצועה לא מרונדרת בכלל כשהטבלה חסרה (שגיאת שליפה), כשהסגל ריק, כשאין
// אף שחקן מחובר — או אצל מאמן שאינו בפיילוט (PILOT_COACHES).
function ReadinessStrip({ session, team }) {
  const me = session?.user?.id
  const inPilot = PILOT_COACHES.length === 0 || PILOT_COACHES.includes(session?.user?.email)
  const today = localDate()
  const [data, setData] = useState(null) // {roster, checkins, pending:Set}
  const [open, setOpen] = useState(false)
  const [ackedIds, setAckedIds] = useState(() => new Set())
  // 4.9 — כמו כל גיליון בפרויקט (FeedbackSheet): מלכודת פוקוס + Escape סוגר
  const sheetRef = useFocusTrap(open, () => setOpen(false))

  useEffect(() => {
    if (!me || !team || !inPilot) return
    let alive = true
    ;(async () => {
      // select('*') — סובלני למסד בלי wellness_off; שגיאה כלשהי = אין רצועה
      const [rosterRes, ckRes] = await Promise.all([
        supabase.from('team_players').select('*').eq('coach_id', me).eq('team', team),
        supabase.from('player_checkins').select('*').eq('coach_id', me).eq('team', team).eq('checkin_date', today),
      ])
      if (!alive) return
      if (rosterRes.error || ckRes.error) return
      // «ממתין לאישור הורה» — כשל כאן לא מפיל את הרצועה, רק את התווית
      let pending = new Set()
      try {
        const { data: mem, error } = await supabase.from('team_memberships')
          .select('player_id, status, player:profiles!player_id(approval_status)')
          .eq('coach_id', me).eq('team', team).eq('status', 'approved')
        if (!error) pending = new Set((mem || []).filter((m) => m.player?.approval_status === 'pending_parent').map((m) => m.player_id))
      } catch { /* בלי התווית */ }
      if (!alive) return
      setData({ roster: rosterRes.data || [], checkins: ckRes.data || [], pending })
    })()
    return () => { alive = false }
  }, [me, team, inPilot, today])

  if (!inPilot || !data) return null
  const { roster, checkins, pending } = data

  // שיוך דיווח לשורת סגל — לפי חשבון או לפי שורת הסגל (רישום מאמן, אם יהיה)
  const byAuth = new Map(checkins.filter((c) => c.player_id).map((c) => [c.player_id, c]))
  const byRoster = new Map(checkins.filter((c) => c.roster_id).map((c) => [c.roster_id, c]))
  const reportOf = (p) => byRoster.get(p.id) || (p.player_id ? byAuth.get(p.player_id) : null)

  const eligible = roster.filter((p) => p.player_id && !p.wellness_off)
  if (eligible.length === 0) return null

  const flagOf = (c) => {
    if (!c) return null
    if (c.sick || c.pain_blocks === true) return 'red'
    if (c.sleep_bucket != null && c.sleep_bucket <= 1) return 'yellow'
    return 'ok'
  }
  const reported = eligible.filter((p) => reportOf(p))
  const flagged = reported
    .map((p) => ({ p, c: reportOf(p), flag: flagOf(reportOf(p)) }))
    .filter((r) => r.flag === 'red' || r.flag === 'yellow')

  // ---- הגיליון ----
  const order = { red: 0, yellow: 1, ok: 2 }
  const rows = [
    ...reported
      .map((p) => ({ kind: 'report', p, c: reportOf(p), flag: flagOf(reportOf(p)) }))
      .sort((a, b) => order[a.flag] - order[b.flag] || String(a.p.name).localeCompare(String(b.p.name), 'he')),
    ...eligible.filter((p) => !reportOf(p)).map((p) => ({
      kind: 'grey', p,
      label: pending.has(p.player_id) ? L('ממתין לאישור הורה', 'Awaiting parent approval') : L('לא דיווח', 'No report'),
    })),
    ...roster.filter((p) => p.player_id && p.wellness_off).map((p) => ({
      kind: 'grey', p, label: L('בלי שאלות', 'Questions off'),
    })),
  ]

  const ackOne = async (row) => {
    const { error } = await supabase.rpc('ack_checkin', { p_id: row.c.id })
    if (error) { toast.error(L('הסימון נכשל', 'Failed to mark')); return }
    setAckedIds((cur) => new Set(cur).add(row.c.id))
  }
  const ackAll = async () => {
    const { error } = await supabase.rpc('ack_checkins', { p_team: team, p_date: today })
    if (error) { toast.error(L('הסימון נכשל', 'Failed to mark')); return }
    // הפונקציה מסמנת רק את השורות התקינות — משקפים את זה גם כאן
    setAckedIds((cur) => {
      const next = new Set(cur)
      for (const r of rows) if (r.kind === 'report' && r.flag === 'ok') next.add(r.c.id)
      return next
    })
    toast.success(L('סומן — ראית את כולם', 'Marked — all seen'))
  }
  const remind = () => waShare(L(
    `בוקר טוב חבר'ה! 🏀 אל תשכחו לענות על הצ'ק-אין של הבוקר — שלוש שאלות, פחות מחצי דקה:\n${SITE_URL}/#/checkin`,
    `Good morning! 🏀 Don't forget this morning's check-in — three questions, under half a minute:\n${SITE_URL}/#/checkin`
  ))

  // 4.9 — טווח השעות עטוף <bdi dir="ltr"> — אותה מוסכמה כמו הצ'יפים אצל
  // השחקן: בלי זה «10+» מתהפך בתוך שורה עברית (dir=ltr על מספרים)
  const words = (c) => {
    const parts = []
    if (c.sleep_bucket != null) parts.push(
      <span key="sleep"><bdi dir="ltr">{SLEEP_RANGES[c.sleep_bucket]}</bdi> {L('שעות', 'hours')}</span>
    )
    if (c.energy != null) parts.push(L(ENERGY_WORDS[c.energy - 1][0], ENERGY_WORDS[c.energy - 1][1]))
    if (c.body != null) {
      let b = L(BODY_WORDS[c.body - 1][0], BODY_WORDS[c.body - 1][1])
      if (c.body === 3 && Array.isArray(c.pain_area) && c.pain_area.length) b += ` (${c.pain_area.map(painAreaLabel).join(', ')})`
      parts.push(b)
    }
    return parts.flatMap((p, i) => (i ? [' · ', p] : [p]))
  }

  const names = flagged.map((r) => r.p.name).join(', ')
  const sheet = open && createPortal(
    <div className="sd-modal" onClick={() => setOpen(false)}>
      {/* 4.9 — role/aria-modal + ref המלכודת: בלעדיהם Tab יוצא אל המסך שמאחור */}
      <div className="sd-inner rd-sheet" ref={sheetRef} role="dialog" aria-modal="true"
        aria-label={L('מוכנות היום', 'Readiness today')} onClick={(e) => e.stopPropagation()}>
        <header className="sd-hero practice">
          <button className="icon-btn sd-close" onClick={() => setOpen(false)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
          <span className="sd-badge">{L('מוכנות היום', 'Readiness today')}</span>
          <h2>{trTeam(team)}</h2>
          <span className="sd-date">{L(`דיווחו ${reported.length} מתוך ${eligible.length}`, `${reported.length} of ${eligible.length} reported`)}</span>
        </header>
        <div className="sd-scroll">
          <ul className="rd-rows">
            {rows.map((r) => (
              <li key={r.p.id} className={'rd-row' + (r.kind === 'report' ? ` rd-${r.flag}` : ' rd-grey')}>
                {r.p.number ? <span className="pl-mate-num">{r.p.number}</span> : <span className="rd-dot" aria-hidden="true" />}
                <span className="rd-tx">
                  <b>{r.p.name}</b>
                  {r.kind === 'report' ? (
                    <span className="rd-detail">
                      {r.c.sick && <span className="rd-badge red">{L('חולה היום', 'Sick today')}</span>}
                      {r.c.pain_blocks === true && <span className="rd-badge red">{L('מפריע לשחק', 'Blocks play')}</span>}
                      {words(r.c)}
                    </span>
                  ) : (
                    <span className="rd-detail">{r.label}</span>
                  )}
                </span>
                {r.kind === 'report' && (r.flag === 'red' || r.flag === 'yellow') && (
                  (r.c.coach_ack_at || ackedIds.has(r.c.id))
                    ? <span className="rd-ack-done"><CheckLine size={13} aria-hidden="true" /> {L('ראיתי', 'Seen')}</span>
                    : <button type="button" className="rd-ack" onClick={() => ackOne(r)}>{L('ראיתי', 'Seen')}</button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <footer className="sd-foot rd-foot">
          <button type="button" className="btn-soft" onClick={ackAll}>
            <CheckLine size={15} /> {L('ראיתי את כולם', 'Seen everyone')}
          </button>
          <button type="button" className="btn-soft" onClick={remind}>
            <Share2 size={15} /> {L('תזכורת לקבוצה', 'Remind the team')}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )

  return (
    <>
      <button type="button" className="np-report rd-strip" onClick={() => setOpen(true)}>
        <span className="np-report-ic"><HeartPulse size={17} /></span>
        <span className="np-report-body">
          <strong>{L('מוכנות היום', 'Readiness today')} · {L(`דיווחו ${reported.length} מתוך ${eligible.length}`, `${reported.length} of ${eligible.length} reported`)}</strong>
          <span className="np-report-meta">
            {flagged.length > 0
              ? <span className="rd-attn">{L(`${flagged.length} לשים לב: ${names}`, `${flagged.length} to watch: ${names}`)}</span>
              : reported.length > 0
                ? <span>{L('הכול תקין', 'All good')}</span>
                : <span>{L('אין דיווחים עדיין הבוקר', 'No reports yet this morning')}</span>}
          </span>
        </span>
        <span className="np-report-cta">{L('פתח', 'Open')}</span>
      </button>
      {sheet}
    </>
  )
}
