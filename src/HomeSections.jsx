// HomeSections — ארבעת הסקשנים של מסך 3a («בית המאמן») ממסמך המסירה,
// בסדר שהוא מציג אותם: באנר אימון פתוח → תוכנית היום כמחברת → השבוע → הסגל.
//
// כל סקשן מביא את הנתונים שלו ו**נעלם בשקט** אם אין לו מה להציג או אם
// השאילתה נכשלה. זה מכוון: דף הבית לא אמור להראות שלד ריק של מסך שלם.
// לפי DESIGN.md §6 מצב שגיאה אינו "אין נתונים" — ולכן איפה שיש פעולה
// להתאושש איתה (למשל «נסה שוב») היא מוצגת, ולא טקסט ריק.

import { useEffect, useState } from 'react'
import { AlertTriangle, ClipboardCheck, NotebookPen, UserCheck } from 'lucide-react'
import { supabase } from './supabaseClient'
import { SkeletonCards, SkeletonRoster } from './Skeleton'
import { expandSlotsRange } from './sessionId'
import { ChevronFwd } from './DirIcon'
import { L, trTeam } from './i18n'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (t) => (t ? String(t).slice(0, 5) : '')
const DAYS = [['א', 'Su'], ['ב', 'Mo'], ['ג', 'Tu'], ['ד', 'We'], ['ה', 'Th'], ['ו', 'Fr'], ['ש', 'Sa']]

// כותרת סקשן: eyebrow + כותרת + קישור «הכל ←» בקצה.
// tone (7.8) — שפת הצבע של ההאנדוף: warm=תורך לפעול · cool=כבר נקבע.
// הצבע יושב על הריבוע שלפני התווית, לא על הטקסט.
export function SecHead({ eyebrow, title, linkLabel, onLink, tone }) {
  return (
    <div className="hp-sechead">
      <span className={tone ? `hp-eyebrow ${tone}` : 'hp-eyebrow'}>{eyebrow}</span>
      <h2 className="hp-title">{title}</h2>
      {onLink && (
        <button type="button" className="link-button hp-seclink" onClick={onLink}>
          {linkLabel} <ChevronFwd size={13} />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// 1. «האימון של יום ג׳ עוד פתוח» — נוכחות לא סומנה / שחקנים בלי משוב
// ---------------------------------------------------------------
export function OpenSessionBanner({ session, onNavigate }) {
  const me = session?.user?.id
  const [open, setOpen] = useState(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!me) return
    let alive = true
    ;(async () => {
      const today = new Date()
      const from = new Date(Date.now() - 10 * 86400000)
      const [entries, slots] = await Promise.all([
        supabase.from('schedule_entries').select('*').gte('date', ymd(from)).lte('date', ymd(today)).order('date'),
        supabase.from('team_practice_slots').select('*').eq('coach_id', me),
      ])
      if (!alive || (entries.error && slots.error)) return

      const occs = expandSlotsRange(slots.data || [], from, today)
        .map((o) => ({ id: o.session_id, date: o.date, start_time: o.start_time, end_time: o.end_time, team: o.team }))
      const all = [...(entries.data || []), ...occs]
        .filter((e) => e.team && !e.is_personal)
        .sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))

      const now = Date.now()
      const done = all.filter((e) => {
        const end = new Date(`${e.date}T${e.end_time || e.start_time || '23:59'}`).getTime()
        return !isNaN(end) && end < now
      })
      const last = done[done.length - 1]
      if (!last) return

      const [att, roster, fb] = await Promise.all([
        supabase.from('practice_attendance').select('id', { count: 'exact', head: true })
          .eq('coach_id', me).eq('team', last.team).eq('session_date', last.date),
        supabase.from('team_players').select('player_id').eq('coach_id', me).eq('team', last.team).not('player_id', 'is', null),
        supabase.from('player_feedback').select('player_id').eq('coach_id', me).eq('session_id', last.id),
      ])
      if (!alive) return

      const noAttendance = !att.error && (att.count || 0) === 0
      const rosterIds = roster.error ? [] : (roster.data || []).map((r) => r.player_id)
      const gave = new Set(fb.error ? [] : (fb.data || []).map((r) => r.player_id))
      const missing = rosterIds.filter((id) => !gave.has(id)).length

      // אין מה לדווח — הכל סומן והכל קיבל משוב
      if (!noAttendance && missing === 0) return
      setOpen({ ...last, noAttendance, missing })
    })()
    return () => { alive = false }
  }, [me])

  if (!open || hidden) return null
  const d = new Date(`${open.date}T00:00`)
  const dayName = isNaN(d) ? '' : L(DAYS[d.getDay()][0], DAYS[d.getDay()][1])

  const reasons = []
  if (open.noAttendance) reasons.push(L('נוכחות לא סומנה', 'attendance not marked'))
  if (open.missing > 0) reasons.push(L(`${open.missing} שחקנים בלי משוב`, `${open.missing} players without feedback`))

  return (
    <div className="hp-alert" role="status">
      <span className="hp-alert-ic" aria-hidden="true"><AlertTriangle size={18} /></span>
      <span className="hp-alert-tx">
        <b>{L(`האימון של יום ${dayName}׳ עוד פתוח`, `${dayName}'s practice is still open`)}</b>
        <span>{reasons.join(L(' · ', ' · '))}</span>
      </span>
      <span className="hp-alert-acts">
        <button type="button" className="hp-btn hp-btn--accent" onClick={() => onNavigate('teams')}>
          {L('סגור את האימון', 'Close the practice')}
        </button>
        <button type="button" className="hp-btn" onClick={() => setHidden(true)}>
          {L('אחר כך', 'Later')}
        </button>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------
// 2. «תוכנית האימון · היום» — כרטיס בשפת המחברת
// ---------------------------------------------------------------
// schedule — הלו"ז המשותף שנשלף פעם אחת ב-Home ({ ready, entries, slots, ... }).
// עד היום כל מקטע שלף את schedule_entries ואת team_practice_slots בעצמו,
// כך שאותה שאילתה בדיוק רצה שלוש פעמים בטעינה אחת של דף הבית.
export function TodayPlanCard({ session, profile, schedule, onNavigate }) {
  const me = session?.user?.id
  const [plan, setPlan] = useState(null)
  const ready = !!schedule?.ready
  const entries = schedule?.entries

  useEffect(() => {
    if (!me || !ready) return
    let alive = true
    ;(async () => {
      const today = ymd(new Date())
      const todays = (entries || [])
        .filter((e) => e.date === today && e.plan_id)
        .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
      if (!todays.length) return
      const entry = todays[0]

      const items = await supabase
        .from('plan_items')
        .select('*, drill:drills(title, category)')
        .eq('plan_id', entry.plan_id)
        .order('position')
      if (!alive || items.error) return

      setPlan({
        entry,
        // plan_items.title קיים בייצור אך לא באף מיגרציה — לכן fallback
        items: (items.data || []).map((it) => ({
          id: it.id,
          title: it.drill?.title || it.title || L('תרגיל', 'Drill'),
          min: it.duration_minutes || null,
        })),
      })
    })()
    return () => { alive = false }
  }, [me, ready, entries])

  if (!plan || !plan.items.length) return null
  const total = plan.items.reduce((s, i) => s + (i.min || 0), 0)
  const d = new Date(`${plan.entry.date}T00:00`)

  return (
    <>
      <SecHead tone="cool" eyebrow={L('היום', 'Today')} title={L('תוכנית האימון', "Today's plan")} />
      <div className="hp-nb">
        <div className="hp-nb-head">
          <span className="hp-nb-club">— {profile?.club || 'CourtSide'}</span>
          <span className="hp-nb-date" dir="ltr">{isNaN(d) ? plan.entry.date : `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`}</span>
          <h3 className="hp-nb-title">{plan.entry.plan?.name || L('מערך אימון', 'Practice plan')}</h3>
          <span className="hp-nb-pill">
            <bdi dir="ltr">{hm(plan.entry.start_time)}</bdi>
            {plan.entry.team ? ` · ${trTeam(plan.entry.team)}` : ''}
          </span>
        </div>
        <div className="hp-nb-body">
          <div className="hp-nb-total">
            <span>{L('מבנה האימון', 'Practice structure')}</span>
            <b dir="ltr">{total} {L('דק׳', 'min')}</b>
          </div>
          <ol className="hp-nb-rows">
            {plan.items.map((it, i) => (
              <li key={it.id}>
                <span className="hp-nb-n" aria-hidden="true">{i + 1}</span>
                <span className="hp-nb-name">{it.title}</span>
                {it.min != null && <b className="hp-nb-min" dir="ltr">{it.min} {L('דק׳', 'min')}</b>}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="hp-nb-acts">
        <button type="button" className="hp-btn hp-btn--navy" onClick={() => onNavigate(plan.entry?.plan_id ? `plans:${plan.entry.plan_id}` : 'plans')}>
          <NotebookPen size={15} aria-hidden="true" /> {L('למחברת המלאה', 'Open the full notebook')}
        </button>
        <button type="button" className="hp-btn" onClick={() => onNavigate('teams')}>
          <ClipboardCheck size={15} aria-hidden="true" /> {L('נוכחות', 'Attendance')}
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------
// 3. «השבוע · לו״ז»
// ---------------------------------------------------------------
export function WeekSchedule({ session, schedule, onNavigate }) {
  const me = session?.user?.id
  const [rows, setRows] = useState(null)
  const ready = !!schedule?.ready
  const entries = schedule?.entries
  const slots = schedule?.slots

  useEffect(() => {
    if (!me || !ready) return
    let alive = true
    ;(async () => {
      const today = new Date()
      const until = new Date(Date.now() + 7 * 86400000)
      const a = ymd(today), b = ymd(until)
      // הלו"ז והמשבצות מגיעים מוכנים מ-Home; רק המשחקים נשלפים כאן
      const games = await supabase.from('team_games').select('id, team, game_date, game_time, opponent, location')
        .eq('coach_id', me).gte('game_date', a).lte('game_date', b)
      if (!alive) return
      if (schedule.entriesError && schedule.slotsError && games.error) return

      const occs = expandSlotsRange(slots || [], today, until)
        .map((o) => ({ id: o.session_id, date: o.date, start_time: o.start_time, team: o.team, _slot: true }))
      const gs = (games.error ? [] : games.data || []).map((g) => ({
        id: g.id, date: g.game_date, start_time: g.game_time, team: g.team,
        _game: true, opponent: g.opponent, location: g.location,
      }))
      const all = [...(entries || []).filter((e) => e.date >= a && e.date <= b), ...occs, ...gs]
        .sort((x, y) => (x.date + (x.start_time || '')).localeCompare(y.date + (y.start_time || '')))
        .slice(0, 3)
      setRows(all)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, ready, entries, slots])

  // rows === null זה «עוד טוען», ולא «אין אימונים השבוע» — עד היום שניהם
  // נראו זהה, והסקשן פשוט קפץ פנימה כשהנתונים הגיעו.
  if (rows === null) {
    return (
      <>
        <SecHead tone="cool" eyebrow={L('לו״ז', 'Schedule')} title={L('השבוע', 'This week')} />
        <SkeletonCards count={3} lines={1} />
      </>
    )
  }
  if (!rows.length) return null

  return (
    <>
      <SecHead
        tone="cool"
        eyebrow={L('לו״ז', 'Schedule')}
        title={L('השבוע', 'This week')}
        linkLabel={L('כל הלו״ז', 'Full schedule')}
        onLink={() => onNavigate('teams')}
      />
      <div className="hp-week">
        {rows.map((r, i) => {
          const d = new Date(`${r.date}T00:00`)
          const day = isNaN(d) ? '' : L(DAYS[d.getDay()][0], DAYS[d.getDay()][1])
          const sub = r._game
            ? [L('משחק חוץ', 'Away game'), r.opponent].filter(Boolean).join(' · ')
            : r.plan?.name
              ? L(`תוכנית מוכנה · ${r.plan.name}`, `Plan ready · ${r.plan.name}`)
              : L('אין תוכנית — לבנות', 'No plan yet — build one')
          return (
            <button
              key={`${r.id}-${i}`}
              type="button"
              className={i === 0 ? 'hp-week-row is-next' : 'hp-week-row'}
              onClick={() => onNavigate(r._game ? 'teams' : 'plans')}
            >
              <span className="hp-week-day">
                <b>{day}׳</b>
                <span dir="ltr">{isNaN(d) ? '' : pad(d.getDate())}</span>
              </span>
              <span className="hp-week-tx">
                <b>{r.team ? trTeam(r.team) : L('אימון', 'Practice')}</b>
                <span className={!r._game && !r.plan?.name ? 'is-warn' : undefined}>{sub}</span>
              </span>
              <span className="hp-week-time" dir="ltr">{hm(r.start_time)}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

// ---------------------------------------------------------------
// 4. «דורש תשומת לב · הסגל»
// ---------------------------------------------------------------
export function NeedsAttention({ session, onNavigate }) {
  const me = session?.user?.id
  const [players, setPlayers] = useState(null)

  useEffect(() => {
    if (!me) return
    let alive = true
    ;(async () => {
      const monthAgo = new Date(Date.now() - 30 * 86400000)
      const [roster, att, fb] = await Promise.all([
        supabase.from('team_players').select('id, name, player_id, team').eq('coach_id', me),
        supabase.from('practice_attendance').select('player_id, status, session_date')
          .eq('coach_id', me).gte('session_date', ymd(monthAgo)),
        // §3 — משוב שנתתי בחודש האחרון, לזיהוי שחקנים שלא נסגר להם משוב.
        // המפתח כאן הוא profiles.id (בניגוד לנוכחות שמפתחה team_players.id).
        supabase.from('player_feedback').select('player_id')
          .eq('coach_id', me).gte('created_at', monthAgo.toISOString()),
      ])
      if (!alive || roster.error || !roster.data?.length) return

      // נוכחות חודשית לכל שחקן. המפתח כאן הוא team_players.id — בניגוד
      // ל-player_feedback שמפתחו הוא profiles.id. לא לערבב.
      const byPlayer = new Map()
      for (const r of att.error ? [] : att.data || []) {
        const cur = byPlayer.get(r.player_id) || { total: 0, present: 0 }
        cur.total++
        if (r.status !== 'absent') cur.present++
        byPlayer.set(r.player_id, cur)
      }

      // כמה משובים נתן המאמן לכל שחקן (לפי profiles.id) בחודש האחרון
      const fbBy = new Map()
      for (const r of fb.error ? [] : fb.data || []) fbBy.set(r.player_id, (fbBy.get(r.player_id) || 0) + 1)

      const flagged = []
      for (const p of roster.data) {
        const a = byPlayer.get(p.id)
        if (a && a.total >= 3) {
          const pct = Math.round((a.present / a.total) * 100)
          if (pct < 70) {
            flagged.push({ ...p, reason: L(`נוכחות ${pct}% בחודש`, `${pct}% attendance this month`), tone: 'warn' })
            continue
          }
        }
        // §3 — שחקן שנכח באימונים ולא קיבל ממני אף משוב בחודש
        if (a && a.present >= 3 && p.player_id && !fbBy.get(p.player_id)) {
          flagged.push({
            ...p,
            reason: L(`${a.present} אימונים בלי משוב`, `${a.present} practices without feedback`),
            tone: 'bad',
          })
        }
      }
      setPlayers(flagged.slice(0, 3))
    })()
    return () => { alive = false }
  }, [me])

  if (players === null) {
    return (
      <>
        <SecHead tone="warm" eyebrow={L('הסגל', 'Roster')} title={L('דורש תשומת לב', 'Needs attention')} />
        <SkeletonRoster count={3} />
      </>
    )
  }
  // §3 — הסקשן מופיע גם כשאין דגלים, עם שורת «הכול מסודר» במקום להיעלם
  if (!players.length) {
    return (
      <>
        <SecHead tone="warm" eyebrow={L('הסגל', 'Roster')} title={L('דורש תשומת לב', 'Needs attention')} />
        <p className="hp-att-clear">
          {L('כרגע אין שחקנים שדורשים תשומת לב — כולם עם נוכחות תקינה ומשוב עדכני.', 'No players need attention right now — everyone has solid attendance and recent feedback.')}
        </p>
      </>
    )
  }

  return (
    <>
      <SecHead
        tone="warm"
        eyebrow={L('הסגל', 'Roster')}
        title={L('דורש תשומת לב', 'Needs attention')}
        linkLabel={L('כל הסגל', 'Full roster')}
        onLink={() => onNavigate('teams')}
      />
      <div className="hp-att">
        {players.map((p) => (
          <div key={p.id} className="hp-att-row">
            <span className="hp-att-av" aria-hidden="true">{(p.name || '?').trim().charAt(0)}</span>
            <span className="hp-att-tx">
              <b>{p.name || L('שחקן', 'Player')}</b>
              <span className={p.tone === 'warn' ? 'is-warn' : 'is-bad'}>{p.reason}</span>
            </span>
            <button type="button" className="hp-btn hp-btn--sm" onClick={() => onNavigate('teams')}>
              <UserCheck size={14} aria-hidden="true" /> {L('פרופיל', 'Profile')}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
