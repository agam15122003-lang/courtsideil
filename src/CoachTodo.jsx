// «דברים לביצוע» (מסמך ההשקה 1.4) — צ'קליסט המאמן בדף הבית, מעל הלו"ז.
// שש בדיקות: אימונים שלא נסגרו · שחקנים בלי יעד פעיל · אין יעדים חודשיים ·
// משימות שפג תוקפן · 3+ חיסורים רצופים · בקשות הצטרפות ממתינות.
// כל שורה מנווטת למסך התיקון. מצב ריק: "הכול סגור, מאמן 🏀".
// כל שאילתה סובלנית לשגיאה/טבלה חסרה — כלל שנכשל פשוט לא מציג שורה.

import { useEffect, useState } from 'react'
import {
  ClipboardCheck, Target, CalendarDays, Hourglass, AlertTriangle, Users2, CheckCircle2,
  Shield, Check, Rocket,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { expandSlotsRange } from './sessionId'
import { L, trTeam, cnt } from './i18n'
import { PLAYER_SIDE, COACH_LOGS } from './flags'
import { ChevronFwd } from './DirIcon'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const dm = (dateStr) => { const d = new Date(dateStr + 'T00:00'); return `${d.getDate()}.${d.getMonth() + 1}` }

export default function CoachTodo({ session, profile, onNavigate, variant }) {
  const me = session?.user?.id
  const [rows, setRows] = useState(null) // null=טוען, []=הכול סגור
  // חשבון חדש לגמרי: אין קבוצות, אין סגל ואין ימי אימון. בלי ההבחנה הזו
  // כל שש הבדיקות לא מחזירות כלום, והמאמן שעוד לא עשה כלום קיבל
  // «הכול סגור, מאמן 🏀» — בדיוק ההפך ממה שהוא צריך לראות.
  const [fresh, setFresh] = useState(null) // null=טוען, אחרת {teams, roster, slots}

  useEffect(() => {
    if (!me) return
    let alive = true
    ;(async () => {
      const now = new Date()
      const todayStr = ymd(now)
      const from7 = addDays(now, -7)
      const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`

      const [entriesRes, slotsRes, attRes, revRes, rosterRes, goalsRes, tgRes, asgRes, pendRes] = await Promise.all([
        supabase.from('schedule_entries').select('id, team, date, start_time, end_time, is_personal')
          .gte('date', ymd(from7)).lte('date', todayStr),
        supabase.from('team_practice_slots').select('*').eq('coach_id', me),
        supabase.from('practice_attendance').select('team, session_date, player_id, status')
          .eq('coach_id', me).gte('session_date', ymd(addDays(now, -60))),
        supabase.from('session_reviews').select('session_id').eq('coach_id', me).eq('session_type', 'practice'),
        supabase.from('team_players').select('id, name, team, player_id').eq('coach_id', me),
        // select('*') — roster_id (22.8) עלול עוד לא להתקיים במסד
        supabase.from('player_goals').select('*').eq('coach_id', me).neq('status', 'done'),
        supabase.from('team_goals').select('team, content').eq('coach_id', me)
          .eq('period', 'month').eq('period_key', monthKey),
        supabase.from('player_assignments').select('*')
          .eq('coach_id', me).not('due_date', 'is', null).lt('due_date', todayStr),
        // צד המאמן בלבד: אין בקשות הצטרפות — לא שולפים
        PLAYER_SIDE
          ? supabase.from('team_memberships').select('id', { count: 'exact', head: true })
              .eq('coach_id', me).eq('status', 'pending')
          : Promise.resolve({ error: null, count: 0 }),
      ])
      if (!alive) return

      const roster = rosterRes.error ? [] : rosterRes.data || []
      // צד המאמן (22.8): כל הסגל — היעדים והמשימות נרשמים על שורת הסגל, ולכן
      // «מפתח» השחקן הוא מזהה השורה.
      // 3.9 — שתי אמיתות: תמיד כל הסגל ומפתח = שורת הסגל (COACH_LOGS); מה
      // שנרשם על player_id ממופה לשורה דרך byAuth. לא נגזר מ-PLAYER_SIDE.
      const linked = COACH_LOGS ? roster : roster.filter((p) => p.player_id)
      const keyOf = (p) => (COACH_LOGS ? p.id : p.player_id)
      const byAuth = new Map(roster.filter((p) => p.player_id).map((p) => [p.player_id, p.id]))
      // שורת סגל → חשבון מקושר (למצב מתג דלוק: שורות שנרשמו על roster_id כשהמתג היה כבוי)
      const authOfRoster = new Map(roster.filter((p) => p.player_id).map((p) => [p.id, p.player_id]))
      const teams = [...new Set(roster.map((p) => p.team).filter(Boolean))]
      const out = []

      // 1 — אימונים שהסתיימו ולא נסגרו (נוכחות או סיכום חסרים)
      {
        const slots = slotsRes.error ? [] : slotsRes.data || []
        const occs = expandSlotsRange(slots, from7, now)
          .map((o) => ({ id: o.session_id, team: o.team, date: o.date, start_time: o.start_time, end_time: o.end_time }))
        const entries = (entriesRes.error ? [] : entriesRes.data || []).filter((e) => e.team && !e.is_personal)
        const ended = [...entries, ...occs].filter((s) => {
          const end = new Date(`${s.date}T${s.end_time || s.start_time || '23:59'}`).getTime()
          return !isNaN(end) && end < now.getTime()
        })
        const attSet = new Set((attRes.error ? [] : attRes.data || []).map((r) => `${r.team}|${r.session_date}`))
        const revSet = new Set((revRes.error ? [] : revRes.data || []).map((r) => r.session_id))
        const open = ended
          .filter((s) => !attSet.has(`${s.team}|${s.date}`) || !revSet.has(s.id))
          .sort((a, b) => b.date.localeCompare(a.date))
        for (const s of open.slice(0, 3)) {
          const noAtt = !attSet.has(`${s.team}|${s.date}`)
          out.push({
            key: 'open' + s.id, Icon: ClipboardCheck, tone: 'warn', nav: 'schedule',
            title: L(`האימון של ${trTeam(s.team)} (${dm(s.date)}) עוד פתוח`, `${trTeam(s.team)}'s practice (${dm(s.date)}) is still open`),
            sub: noAtt ? L('נוכחות לא סומנה', 'Attendance not marked') : L('חסר סיכום אימון', 'Session summary missing'),
          })
        }
      }

      // 2 — שחקנים מחוברים בלי יעד פעיל
      {
        const withGoal = new Set((goalsRes.error ? [] : goalsRes.data || [])
          .map((g) => (COACH_LOGS ? (g.roster_id || (g.player_id && byAuth.get(g.player_id))) : (g.player_id || (g.roster_id && authOfRoster.get(g.roster_id)))))
          .filter(Boolean))
        const missing = linked.filter((p) => !withGoal.has(keyOf(p)))
        if (missing.length > 0) {
          const names = missing.slice(0, 3).map((p) => p.name).join(', ')
          out.push({
            key: 'nogoal', Icon: Target, tone: 'warn', nav: 'teams',
            title: cnt(missing.length, L('שחקן אחד בלי יעד פעיל', 'One player without an active goal'), L('שחקנים בלי יעד פעיל', 'players without an active goal')),
            sub: names + (missing.length > 3 ? '…' : ''),
          })
        }
      }

      // 3 — לא הוגדרו יעדים חודשיים לחודש הנוכחי
      {
        const has = new Set((tgRes.error ? [] : tgRes.data || [])
          .filter((r) => r.content && r.content.trim()).map((r) => r.team))
        const missing = teams.filter((t) => !has.has(t))
        if (!tgRes.error && missing.length > 0) {
          out.push({
            key: 'monthly', Icon: CalendarDays, tone: 'info', nav: 'teams',
            title: L('לא הוגדרו יעדים חודשיים לחודש הנוכחי', 'No monthly goals set for this month'),
            sub: missing.map(trTeam).join(' · '),
          })
        }
      }

      // 4 — משימות שעבר תאריך היעד שלהן וממתינות לסגירה
      {
        // משימה שכבר אורכבה (ידנית או אוטומטית) נסגרה — אין עליה מה לעשות,
        // והיא נשארה כאן לנצח. סינון בצד הלקוח ולא בשאילתה: עמודת status
        // (supabase_tasks_launch.sql) עלולה עוד לא להתקיים במסד.
        const overdue = (asgRes.error ? [] : asgRes.data || []).filter((a) => (a.status || 'active') !== 'archived')
        if (overdue.length > 0) {
          let comps = []
          // 3.9 — שתי אמיתות: הסימונים של המאמן (assignment_coach_marks, לפי שורת סגל)
          // וגם «ביצעתי» של שחקן מחובר (assignment_completions, player_id → שורת הסגל)
          const { data: cData, error: cErr } = await supabase
            .from('assignment_coach_marks')
            .select('assignment_id, roster_id, done_at')
            .in('assignment_id', overdue.map((a) => a.id))
          if (!cErr) comps = cData || []
          if (!alive) return
          const doneBy = new Map()
          const markDone = (aid, who) => { if (!who) return; if (!doneBy.has(aid)) doneBy.set(aid, new Set()); doneBy.get(aid).add(who) }
          for (const c of comps) if (c.done_at) markDone(c.assignment_id, c.roster_id)
          // צד שחקן פתוח: גם «ביצעתי» של השחקן סוגר את המשימה (הטבלה עשויה לא להתקיים — שקט)
          if (PLAYER_SIDE) {
            const pc = await supabase.from('assignment_completions').select('assignment_id, player_id, done_at').in('assignment_id', overdue.map((a) => a.id))
            if (!alive) return
            for (const c of pc.error ? [] : pc.data || []) if (c.done_at) markDone(c.assignment_id, byAuth.get(c.player_id))
          }
          const stillOpen = overdue.filter((a) => {
            // נמענים לפי שורת סגל: roster_id ישירות, player_id דרך byAuth
            const recipients = a.roster_id
              ? [a.roster_id]
              : a.player_id
                ? [byAuth.get(a.player_id)].filter(Boolean)
                : linked.filter((p) => p.team === a.team).map(keyOf)
            if (recipients.length === 0) return false
            const done = doneBy.get(a.id) || new Set()
            return recipients.some((id) => !done.has(id))
          })
          if (stillOpen.length > 0) {
            out.push({
              key: 'overdue', Icon: Hourglass, tone: 'warn', nav: 'teams',
              title: cnt(stillOpen.length, L('משימה אחת שעבר זמנה ממתינה לסגירה', 'One overdue task awaits closing'), L('משימות שעבר זמנן ממתינות לסגירה', 'overdue tasks await closing')),
              sub: stillOpen.slice(0, 2).map((a) => a.title || L('משימה', 'Task')).join(' · '),
            })
          }
        }
      }

      // 5 — שחקן עם 3+ חיסורים רצופים (לפי סימוני הנוכחות האחרונים)
      {
        const byPlayer = new Map() // team_players.id → [{date, status}]
        for (const r of attRes.error ? [] : attRes.data || []) {
          if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, [])
          byPlayer.get(r.player_id).push(r)
        }
        const nameOf = new Map(roster.map((p) => [p.id, p.name]))
        const streaks = []
        for (const [pid, list] of byPlayer) {
          list.sort((a, b) => b.session_date.localeCompare(a.session_date))
          let run = 0
          for (const r of list) {
            if (r.status === 'absent') run++
            else break
          }
          if (run >= 3) streaks.push({ name: nameOf.get(pid) || L('שחקן', 'Player'), run })
        }
        for (const s of streaks.slice(0, 3)) {
          out.push({
            key: 'streak' + s.name, Icon: AlertTriangle, tone: 'bad', nav: 'teams',
            title: L(`${s.name} החסיר ${s.run} אימונים ברצף`, `${s.name} missed ${s.run} practices in a row`),
            sub: L('שווה שיחה אישית', 'Worth a personal chat'),
          })
        }
      }

      // 6 — בקשות הצטרפות ממתינות
      if (!pendRes.error && (pendRes.count || 0) > 0) {
        out.push({
          key: 'joins', Icon: Users2, tone: 'info', nav: 'teams',
          title: cnt(pendRes.count, L('בקשת הצטרפות אחת ממתינה לאישור', 'One join request awaits approval'), L('בקשות הצטרפות ממתינות לאישור', 'join requests await approval')),
          sub: L('אישור מהיר — והשחקן בפנים', 'Quick approve — and the player is in'),
        })
      }

      if (alive) {
        setRows(out)
        setFresh({
          teams: (profile?.age_groups || []).length > 0,
          roster: roster.length > 0,
          slots: !slotsRes.error && (slotsRes.data || []).length > 0,
        })
      }
    })()
    return () => { alive = false }
  }, [me, profile?.age_groups])

  if (rows === null) return null

  // שלושת צעדי הפתיחה. הסף הוא **קבוצה + סגל**, לא שלושת הצעדים:
  // מאמן שיש לו קבוצה ושחקנים כבר מסודר, גם אם בחר לא להגדיר ימי אימון
  // קבועים (יש מי שמוסיף כל אימון בנפרד) — ולו «בוא נתחיל» לנצח היה שקר.
  const setup = fresh && !(fresh.teams && fresh.roster) ? [
    { key: 'su-team', done: fresh.teams, Icon: Shield, nav: 'profile-edit',
      title: L('הוסף את הקבוצות שאתה מאמן', 'Add the teams you coach'),
      sub: L('בפרופיל, «הקבוצות שאני מאמן» — זה מה שפותח את מסך הקבוצה ואת הלו״ז', 'In your profile — this is what opens the team screen and the schedule') },
    { key: 'su-roster', done: fresh.roster, Icon: Users2, nav: 'teams',
      title: L('הוסף שחקנים לסגל', 'Add players to the roster'),
      sub: L('שם ומספר לכל שחקן — ומיד אפשר לסמן נוכחות ולהציב יעדים', 'A name and a number each — then you can mark attendance and set goals') },
    { key: 'su-slots', done: fresh.slots, Icon: CalendarDays, nav: 'teams-practices',
      title: L('קבע ימי אימון קבועים', 'Set your fixed practice days'),
      sub: L('הם ייכנסו ללו״ז לבד, וכל אימון ייפתח לסקירה בסופו', 'They fill the schedule by themselves, and each practice opens for review when it ends') },
  ] : null
  const setupLeft = setup ? setup.filter((x) => !x.done).length : 0

  // רשימת צעדי הפתיחה (משותפת לשתי הגרסאות). צעד שכבר נעשה נשאר מוצג
  // עם וי — כדי שהמאמן יראה שהוא מתקדם, ולא שהשורה פשוט נעלמה.
  const setupList = (cls) => (
    <div className={cls}>
      {setup.map((r) => (
        r.done ? (
          <div key={r.key} className="ctd-setup-done">
            <span className="ctd-setup-ic ok" aria-hidden="true"><Check size={15} /></span>
            <span className="ctd-setup-tx"><b>{r.title}</b></span>
          </div>
        ) : (
          <button key={r.key} type="button" className={cls === 'nh-rows' ? 'nh-row' : 'ctd-row'} onClick={() => onNavigate && onNavigate(r.nav)}>
            <span className={(cls === 'nh-rows' ? 'nh-row-ic' : 'ctd-ic') + ' info'} aria-hidden="true"><r.Icon size={16} /></span>
            <span className={cls === 'nh-rows' ? 'nh-row-tx' : 'ctd-tx'}>
              <b>{r.title}</b>
              <span>{r.sub}</span>
            </span>
            <ChevronFwd size={15} className={cls === 'nh-rows' ? 'nh-row-go' : 'ctd-go'} aria-hidden="true" />
          </button>
        )
      ))}
    </div>
  )


  // ---- גרסת «כרטיס» (11.8, מסמך העיצוב 3a): כותרת + תג מונה בתוך קליפה ----
  if (variant === 'card') {
    return (
      <section className="nh-card nh-todo">
        <div className="nh-card-head">
          <h2 className="nh-card-title">{setup ? L('בוא נתחיל', 'Let’s get started') : L('דברים לביצוע', 'To do')}</h2>
          {setup ? (
            <span className="nh-chip info">
              <bdi>{cnt(setupLeft, L('צעד אחד', 'one step'), L('צעדים', 'steps'))}</bdi>
            </span>
          ) : rows.length > 0 && (
            <span className="nh-chip warn">
              {/* cnt מחזיר גם את המספר — «אחד פתוח» / «4 פתוחים» */}
              <bdi>{cnt(rows.length, L('אחד פתוח', 'one open'), L('פתוחים', 'open'))}</bdi>
            </span>
          )}
        </div>
        {setup ? (
          <>
            <p className="ctd-setup-lede">
              {L('שלושה דברים והאפליקציה מוכנה לאימון הראשון שלך.', 'Three things and the app is ready for your first practice.')}
            </p>
            {setupList('nh-rows')}
          </>
        ) : rows.length === 0 ? (
          <div className="ctd-clear">
            <CheckCircle2 size={18} aria-hidden="true" />
            {L('הכול סגור, מאמן 🏀', 'All done, coach 🏀')}
          </div>
        ) : (
          <div className="nh-rows">
            {rows.map((r) => (
              <button key={r.key} type="button" className="nh-row" onClick={() => onNavigate && onNavigate(r.nav)}>
                <span className={'nh-row-ic ' + r.tone} aria-hidden="true"><r.Icon size={16} /></span>
                <span className="nh-row-tx">
                  <b>{r.title}</b>
                  {r.sub && <span>{r.sub}</span>}
                </span>
                <ChevronFwd size={15} className="nh-row-go" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="ctd">
      <span className="sec-kicker warm">
        {setup ? <><Rocket size={13} aria-hidden="true" /> {L('בוא נתחיל', 'Let’s get started')}</> : L('דברים לביצוע', 'To do')}
      </span>
      {setup ? (
        <>
          <p className="ctd-setup-lede">
            {L('שלושה דברים והאפליקציה מוכנה לאימון הראשון שלך.', 'Three things and the app is ready for your first practice.')}
          </p>
          {setupList('ctd-list')}
        </>
      ) : rows.length === 0 ? (
        <div className="ctd-clear">
          <CheckCircle2 size={18} aria-hidden="true" />
          {L('הכול סגור, מאמן 🏀', 'All done, coach 🏀')}
        </div>
      ) : (
        <div className="ctd-list">
          {rows.map((r) => (
            <button key={r.key} type="button" className="ctd-row" onClick={() => onNavigate && onNavigate(r.nav)}>
              <span className={'ctd-ic ' + r.tone} aria-hidden="true"><r.Icon size={16} /></span>
              <span className="ctd-tx">
                <b>{r.title}</b>
                {r.sub && <span>{r.sub}</span>}
              </span>
              <ChevronFwd size={16} className="ctd-go" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
