import { useState, useEffect, useCallback } from 'react'
import {
  History, Flame, Star, Crown, MessageSquareHeart, Check, Minus,
  Dumbbell, StickyNote, Send, TrendingUp, Share2, ChevronDown,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { sendNotification } from './notify'
import { L , cnt } from './i18n'
import Avatar from './Avatar'
import { expandSlots } from './sessionId'
import { waShare } from './share'
import FeedbackSheet from './FeedbackSheet'
import { SkeletonCards } from './Skeleton'
import BasketballIcon from './BasketballIcon'
import PlayerScreen from './PlayerScreen'

const ymdAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const coachName = (c) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || L('המאמן', 'Coach') : L('המאמן', 'Coach')
const heDate = (d) => new Date(d + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })

// גרף מגמת עומס — שטח+קו מונפשים על 8 האימונים האחרונים, עם נקודה על האחרון
function LoadTrend({ series }) {
  const W = 300, H = 110, p = 10, n = series.length
  if (n < 2) return null
  const xs = (i) => p + i * ((W - 2 * p) / (n - 1))
  const ys = (v) => H - p - (v / 10) * (H - 2 * p)
  const pts = series.map((v, i) => [xs(i), ys(v)])
  const line = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ')
  const area = `${line} L ${xs(n - 1).toFixed(1)} ${H - p} L ${xs(0).toFixed(1)} ${H - p} Z`
  const last = pts[n - 1]
  const avg = series.reduce((s, v) => s + v, 0) / n
  const top = Math.max(...series)
  return (
    <div className="ps-card">
      <div className="ps-card-head">
        <b className="ps-h"><TrendingUp size={15} aria-hidden="true" /> {L('מגמת עומס', 'Load trend')}</b>
        <span className="ps-chip ps-chip--mut">{L(cnt(n, 'האימון האחרון', 'אימונים אחרונים'), `last ${n} sessions`)}</span>
      </div>
      {/* ⚠ צבועים ב---ps-acc ולא ב---accent: הגרף חי עכשיו בתוך מסך ps,
          ולכל מסך שם יש צבע משלו */}
      <svg viewBox="0 0 300 110" className="ps-trend" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pltTrend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ps-acc)" stopOpacity="0.3" />
            <stop offset="1" stopColor="var(--ps-acc)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="10" y1="100" x2="290" y2="100" stroke="var(--ps-hair)" strokeWidth="1" />
        <path d={area} fill="url(#pltTrend)" />
        <path d={line} fill="none" stroke="var(--ps-acc)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="5.5" fill="var(--ps-acc)" />
      </svg>
      <div className="ps-steps">
        <span className="ps-chip ps-chip--acc">{L(`ממוצע ${avg.toFixed(1)} מתוך 10`, `Avg ${avg.toFixed(1)} of 10`)}</span>
        <span className="ps-lbl">{L(`האימון האחרון: ${series[n - 1]} · הגבוה בתקופה: ${top}`, `Last: ${series[n - 1]} · period high: ${top}`)}</span>
      </div>
    </div>
  )
}

// תגובת אמוג'י על משוב מהמאמן — טאפ אחד שסוגר את המעגל בחזרה אליו.
// דורש את react_to_feedback() מ-supabase_engagement2.sql; אם ה-RPC חסר —
// הכפתורים פשוט לא ישנו כלום והשגיאה תוצג בטוסט.
const REACTIONS = ['👍', '🔥', '💪', '🙏']
export function FbReact({ fb, coachId, me, hero = false }) {
  const [chosen, setChosen] = useState(fb?.player_reaction || null)
  if (!fb?.id) return null

  const react = async (r) => {
    const { error } = await supabase.rpc('react_to_feedback', { p_id: fb.id, p_reaction: r })
    if (error) { toast.error(L('התגובה לא נשלחה', 'Reaction failed')); return }
    setChosen(r)
    sendNotification({ to: coachId, actor: me, type: 'message', content: L(`השחקן הגיב ${r} על המשוב שלך`, `Player reacted ${r} to your feedback`), nav: 'teams' })
  }

  // בבאנר של «האימונים שלי» — שורת האמוג׳י של המסמך, על הגרדיאנט
  if (hero) {
    return (
      <>
        <span className="ps-hero-note">{L('להגיב:', 'React:')}</span>
        {REACTIONS.map((r) => (
          <button
            key={r} type="button"
            className={chosen === r ? 'ps-react is-on' : 'ps-react'}
            aria-pressed={chosen === r}
            disabled={!!chosen}
            onClick={() => react(r)}
            aria-label={L(`הגב ${r}`, `React ${r}`)}
          >{r}</button>
        ))}
        <span className="ps-hero-note ps-end">
          {chosen ? L('הגבת — המאמן רואה', 'Sent — your coach sees it') : L('טאפ אחד וזה מגיע אליו', 'One tap and it reaches them')}
        </span>
      </>
    )
  }

  if (chosen) return <span className="th-react-done">{chosen} {L('הגבת', 'You reacted')}</span>
  return (
    <span className="th-react">
      {REACTIONS.map((r) => (
        <button key={r} type="button" onClick={() => react(r)} aria-label={L(`הגב ${r}`, `React ${r}`)}>{r}</button>
      ))}
    </span>
  )
}

// ============================================================
// "האימונים שלי" — CTA לסיכום, שלישיית סטטיסטיקה, גרף מגמת עומס,
// וציר זמן: כל אימון/משחק שעבר הוא כרטיס אחד שמרכז נוכחות, עומס,
// יעדים ✓✗, משוב המאמן, סיכום, MVP.
// ============================================================
export default function PlayerTimeline({ session, membership, bell, coachName: coachNameProp, onCoach }) {
  // §12 — «אימונים שהיו» כסטאק: כרטיס אחד פתוח, השאר שורות מקופלות
  const [openId, setOpenId] = useState(null)
  const [items, setItems] = useState(null)
  const [stats, setStats] = useState(null)
  const [fbOpen, setFbOpen] = useState(false)
  const [latestFb, setLatestFb] = useState(null) // 1.8 — המשוב המלא האחרון
  const me = session.user.id

  const load = useCallback(async () => {
    if (!membership) return
    const from = ymdAgo(90)
    const today = new Date().toISOString().slice(0, 10)
    const [slotsQ, schedQ, gamesQ, effQ, fbQ, revQ, marksQ, rosterQ, complQ] = await Promise.all([
      supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
      // select('*') ולא רשימת עמודות: הרשימה כללה `location`, שלא הייתה
      // קיימת בטבלה — PostgREST מחזיר 42703 ומפיל את **כל** השאילתה, כלומר
      // הלו"ז נעלם מהציר של השחקן. `*` מחזיר את העמודה כשהיא קיימת
      // (supabase_schedule_board_4_8.sql) ומדלג עליה כשלא, בלי לשבור.
      supabase.from('schedule_entries').select('*').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', from).lte('date', today),
      supabase.from('team_games').select('id, game_date, game_time, opponent, location').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', from).lte('game_date', today),
      supabase.from('session_effort').select('session_id, effort, note, session_date').eq('player_id', me),
      supabase.from('player_feedback').select('*, coach:profiles!coach_id(first_name, last_name, avatar_url)').eq('player_id', me).order('created_at', { ascending: false }),
      supabase.from('session_reviews').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('session_date', from),
      supabase.from('session_goal_marks').select('session_id, met, goal:player_goals(title)').eq('player_id', me),
      supabase.from('team_players').select('id').eq('coach_id', membership.coach_id).eq('team', membership.team).eq('player_id', me),
      // 1.8 — «משימות שבוצעו» בסיכום הכללי
      supabase.from('assignment_completions').select('assignment_id, done_at').eq('player_id', me),
    ])
    // 1.8 — המשוב המלא האחרון מהמאמן, מוצג למעלה
    setLatestFb((fbQ.data || []).find((r) => r.content) || null)
    const rosterId = rosterQ.data?.[0]?.id || null
    const [attQ, gattQ] = rosterId ? await Promise.all([
      supabase.from('practice_attendance').select('session_date, status').eq('coach_id', membership.coach_id).eq('team', membership.team).eq('player_id', rosterId),
      supabase.from('game_attendance').select('game_id, status').eq('player_id', rosterId),
    ]) : [{ data: [] }, { data: [] }]

    const effBy = {}; for (const r of effQ.data || []) effBy[r.session_id] = r
    const fbBy = {}; const general = []
    for (const f of fbQ.data || []) (f.session_id ? (fbBy[f.session_id] = f) : general.push(f))
    const revBy = {}; for (const r of revQ.data || []) revBy[r.session_id] = r
    const marksBy = {}; for (const m of marksQ.data || []) (marksBy[m.session_id] = marksBy[m.session_id] || []).push({ title: m.goal?.title || L('יעד', 'Goal'), met: m.met })
    const attBy = {}; for (const a of attQ.data || []) attBy[a.session_date] = a.status
    const gattBy = {}; for (const a of gattQ.data || []) gattBy[a.game_id] = a.status

    const seen = new Set()
    const sessions = []
    for (const s of [
      ...expandSlots(slotsQ.data || [], -90, 0).map((o) => ({ session_id: o.session_id, type: 'practice', date: o.date, time: o.start_time, location: o.location })),
      ...(schedQ.data || []).map((e) => ({ session_id: e.id, type: 'practice', date: e.date, time: e.start_time ? String(e.start_time).slice(0, 5) : null, location: e.location })),
      ...(gamesQ.data || []).map((g) => ({ session_id: g.id, type: 'game', date: g.game_date, time: g.game_time ? String(g.game_time).slice(0, 5) : null, opponent: g.opponent, location: g.location })),
    ]) {
      if (seen.has(s.session_id)) continue
      seen.add(s.session_id)
      sessions.push(s)
    }

    const cards = sessions
      .map((s) => ({
        ...s,
        eff: effBy[s.session_id] || null,
        fb: fbBy[s.session_id] || null,
        review: revBy[s.session_id] || null,
        marks: marksBy[s.session_id] || [],
        att: s.type === 'game' ? gattBy[s.session_id] : attBy[s.date],
      }))
      .filter((c) => c.eff || c.fb || c.review || c.marks.length > 0 || c.att)

    for (const f of general) {
      cards.push({ session_id: 'fb-' + f.id, type: 'note', date: (f.created_at || '').slice(0, 10), fb: f, marks: [] })
    }

    cards.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    setItems(cards)

    // מגמת עומס — עד 8 האימונים האחרונים לפי סדר כרונולוגי
    const effRows = (effQ.data || []).filter((r) => r.effort != null)
      .sort((a, b) => (a.session_date || '').localeCompare(b.session_date || ''))
    const series = effRows.slice(-8).map((r) => r.effort)
    const effVals = effRows.map((r) => r.effort)
    // נוכחות
    const attRows = cards.filter((c) => c.att)
    const present = attRows.filter((c) => c.att && c.att !== 'absent').length
    setStats({
      sessions: cards.filter((c) => c.type !== 'note').length,
      tasksDone: (complQ.data || []).filter((c) => c.done_at).length,
      avgEffort: effVals.length ? (effVals.reduce((s, v) => s + v, 0) / effVals.length) : null,
      attendancePct: attRows.length ? Math.round((present / attRows.length) * 100) : null,
      series,
    })
  }, [membership, me])

  useEffect(() => { load() }, [load])

  if (!membership) return null
  if (items === null) {
    return (
      <PlayerScreen page="sessions" bell={bell} coach={coachNameProp} onCoach={onCoach}>
        <SkeletonCards count={4} lines={2} />
      </PlayerScreen>
    )
  }

  const band = stats ? [
    { value: stats.attendancePct != null ? `${stats.attendancePct}%` : '—', label: L('נוכחות', 'Attendance') },
    { value: stats.sessions, label: L('אימונים', 'Sessions') },
    { value: stats.avgEffort != null ? stats.avgEffort.toFixed(1) : '—', label: L('עומס ממוצע', 'Avg load') },
  ] : null

  return (
    <PlayerScreen page="sessions" band={band} bell={bell} coach={coachNameProp} onCoach={onCoach}>
      {/* המסמך פותח בבאנר עם המשוב האחרון והתגובה אליו — לא בכפתור */}
      {latestFb ? (
        <div className="ps-hero">
          <div className="ps-hero-row">
            <b className="ps-hero-kick">
              {L('המשוב האחרון מ', "Coach's latest feedback · ")}{coachName(latestFb.coach)}
              {latestFb.created_at ? ` · ${new Date(latestFb.created_at).toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}` : ''}
            </b>
            {latestFb.rating > 0 && (
              <span className="ps-hero-pill" aria-label={L(`דירוג ${latestFb.rating} מתוך 5`, `Rated ${latestFb.rating} of 5`)}>
                {'★'.repeat(latestFb.rating)}{'☆'.repeat(5 - latestFb.rating)}
              </span>
            )}
          </div>
          <span className="ps-hero-quote">״{latestFb.content}״</span>
          <div className="ps-hero-acts">
            <FbReact fb={latestFb} coachId={membership.coach_id} me={me} hero />
          </div>
        </div>
      ) : (
        <div className="ps-hero">
          <b className="ps-hero-kick">{L('האימונים שלי', 'My sessions')}</b>
          <b className="ps-hero-title">{L('כאן נשמר כל אימון', 'Every session is kept here')}</b>
          <span className="ps-hero-sub">{L('המשוב, העומס והיעדים שלך — אימון אחרי אימון.', 'Your feedback, effort and goals — session by session.')}</span>
        </div>
      )}

      <div className="ps-cols">
        {stats && stats.series && stats.series.length >= 2 && <LoadTrend series={stats.series} />}

        <div className="ps-card">
          <b className="ps-h">{L('מלא סיכום אימון', 'Log session summary')}</b>
          <p className="ps-mut">
            {L('איך הרגשת באימון האחרון? העומס והפתק שלך נשמרים בציר ונשלחים למאמן.',
               'How did the last session feel? Your load and note are saved to your timeline and sent to your coach.')}
          </p>
          <button type="button" className="ps-btn" onClick={() => setFbOpen(true)}>
            <Send size={17} aria-hidden="true" /> {L('מלא סיכום אימון', 'Log session summary')}
          </button>
        </div>
      </div>

      {/* סיכום שבועי להורים — טקסט מוכן לוואטסאפ מהנתונים שכבר על המסך */}
      {stats && stats.sessions > 0 && (
        <button type="button" className="ps-btn-ghost" onClick={() => {
          const week = items.filter((c) => c.type !== 'note' && c.date >= ymdAgo(7))
          const weekEff = week.map((c) => c.eff?.effort).filter((v) => v != null)
          const mvpCard = week.find((c) => c.review && c.review.mvp_player_id === me)
          const latestFb = items.find((c) => c.fb?.content)
          const lines = [
            L('סיכום שבועי מ-CourtSide 🏀', 'Weekly recap from CourtSide 🏀'),
            L(`אימונים ומשחקים השבוע: ${week.length}`, `Sessions this week: ${week.length}`),
            stats.attendancePct != null ? L(`נוכחות עונתית: ${stats.attendancePct}%`, `Season attendance: ${stats.attendancePct}%`) : null,
            weekEff.length ? L(`עומס ממוצע השבוע: ${(weekEff.reduce((s, v) => s + v, 0) / weekEff.length).toFixed(1)}/10`, `Avg load this week: ${(weekEff.reduce((s, v) => s + v, 0) / weekEff.length).toFixed(1)}/10`) : null,
            mvpCard ? L('⭐ נבחר/ה ל-MVP של אימון השבוע!', '⭐ Picked as MVP this week!') : null,
            latestFb ? L(`מהמאמן: "${latestFb.fb.content.slice(0, 120)}"`, `From coach: "${latestFb.fb.content.slice(0, 120)}"`) : null,
          ].filter(Boolean)
          waShare(lines.join('\n'))
        }}>
          <Share2 size={15} aria-hidden="true" /> {L('שיתוף סיכום שבועי להורים', 'Share weekly recap with parents')}
        </button>
      )}

      {items.length === 0 ? (
        <div className="ps-card">
          <div className="ps-empty">
            <span className="ps-empty-ic"><History size={20} aria-hidden="true" /></span>
            <b>{L('ההיסטוריה שלך תתחיל כאן', 'Your history starts here')}</b>
            <p>{L('אחרי כל אימון — הדירוג שלך, היעדים והמשוב מהמאמן יישמרו כאן, אימון אחרי אימון.', 'After each practice — your rating, goals and coach feedback are saved here, session by session.')}</p>
          </div>
        </div>
      ) : (
        <div className="ps-card">
          <div className="ps-card-head">
            <b className="ps-h">{L('ארכיון אימונים', 'Session archive')}</b>
            <span className="ps-chip ps-chip--mut">{L(cnt(items.length, 'רשומה אחת', 'רשומות'), `${items.length} entries`)}</span>
          </div>
          {/* ארכיון האימונים במרקאפ של המסמך: שורה מתקפלת עם אייקון, כותרת,
              תאריך, MVP ועומס — ואחריה הפרטים. */}
          {items.map((c) => {
            const isMvp = c.review && c.review.mvp_player_id === me
            // "הודעה מהמאמן" — משוב שלא צמוד לאימון מסוים
            if (c.type === 'note') {
              return (
                <div key={c.session_id} className="ps-card ps-card--sub">
                  <div className="ps-card-head">
                    <span className="ps-jersey" aria-hidden="true"><MessageSquareHeart size={15} /></span>
                    <b className="ps-t13b">{L('הודעה מהמאמן', 'Message from coach')}</b>
                    <span className="ps-chip ps-chip--mut">{heDate(c.date)}</span>
                  </div>
                  {c.fb?.rating > 0 && (
                    <span className="ps-lbl" aria-label={L(`דירוג ${c.fb.rating} מתוך 5`, `Rated ${c.fb.rating} of 5`)}>
                      {'★'.repeat(c.fb.rating)}{'☆'.repeat(5 - c.fb.rating)}
                    </span>
                  )}
                  {c.fb?.content && <p className="ps-quote">״{c.fb.content}״</p>}
                  <div className="ps-steps"><FbReact fb={c.fb} coachId={membership.coach_id} me={me} /></div>
                </div>
              )
            }
            // כרטיס סיכום אימון/משחק
            const isOpen = (openId ?? items.find((x) => x.type !== 'note')?.session_id) === c.session_id
            return (
              <div key={c.session_id} className="ps-card ps-card--sub">
                <button
                  type="button" className="ps-linkrow ps-row--bare"
                  onClick={() => setOpenId(isOpen ? '-' : c.session_id)}
                  aria-expanded={isOpen} aria-controls={`ps-se-${c.session_id}`}
                >
                  <span className="ps-jersey" aria-hidden="true">
                    {c.type === 'game' ? <BasketballIcon size={15} /> : <Dumbbell size={15} />}
                  </span>
                  <span className="ps-row-main">
                    <b className="ps-t13b">
                      {c.type === 'game'
                        ? (c.opponent ? L(`משחק מול ${c.opponent}`, `Game vs ${c.opponent}`) : L('משחק', 'Game'))
                        : L('אימון קבוצתי', 'Team practice')}
                    </b>
                    <span className="ps-lbl">{heDate(c.date)}{c.time ? ` · ${c.time}` : ''}</span>
                  </span>
                  {isMvp && <span className="ps-mvp"><Crown size={12} aria-hidden="true" /> MVP</span>}
                  {c.eff && <span className="ps-chip ps-chip--acc" dir="ltr">{c.eff.effort}/10</span>}
                  <ChevronDown size={16} aria-hidden="true" className={isOpen ? 'ps-chev is-open' : 'ps-chev'} />
                </button>

                {isOpen && (
                  <div id={`ps-se-${c.session_id}`} className="ps-fold">
                    {(c.eff || c.att || c.marks.length > 0) && (
                      <div className="ps-steps">
                        {c.eff && <span className="ps-chip ps-chip--acc"><Flame size={12} aria-hidden="true" /> {L('עומס', 'Load')} <bdi dir="ltr">{c.eff.effort}/10</bdi></span>}
                        {c.att && (
                          <span className={c.att === 'present' ? 'ps-chip ps-chip--ok' : c.att === 'late' ? 'ps-chip ps-chip--warn' : 'ps-chip ps-chip--bad'}>
                            {c.att === 'present' ? <><Check size={12} aria-hidden="true" /> {L('נכחת', 'Present')}</> : c.att === 'late' ? L('איחרת', 'Late') : L('נעדרת', 'Absent')}
                          </span>
                        )}
                        {c.marks.map((m, i) => (
                          <span key={i} className={m.met ? 'ps-chip ps-chip--ok' : 'ps-chip ps-chip--mut'}>
                            {m.met ? <Check size={12} aria-hidden="true" /> : <Minus size={12} aria-hidden="true" />} {m.title}
                          </span>
                        ))}
                      </div>
                    )}

                    {c.eff?.note && <p className="ps-quote">״{c.eff.note}״</p>}

                    {c.fb && (c.fb.content || c.fb.rating > 0) && (
                      <div className="ps-row">
                        <Avatar name={coachName(c.fb.coach)} url={c.fb.coach?.avatar_url} size={28} />
                        <span className="ps-row-main">
                          <span className="ps-lbl">
                            {L('המאמן כתב לך', 'Coach wrote')}
                            {c.fb.rating > 0 && ` · ${'★'.repeat(c.fb.rating)}${'☆'.repeat(5 - c.fb.rating)}`}
                          </span>
                          {c.fb.content && <span className="ps-quote">{c.fb.content}</span>}
                          <span className="ps-steps"><FbReact fb={c.fb} coachId={membership.coach_id} me={me} /></span>
                        </span>
                      </div>
                    )}

                    {c.review?.overall_note && (
                      <p className="ps-lbl"><StickyNote size={12} aria-hidden="true" /> {L('סיכום המאמן: ', 'Coach summary: ')}{c.review.overall_note}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <FeedbackSheet session={session} membership={membership} open={fbOpen}
        onClose={() => setFbOpen(false)} onSent={load} />
    </PlayerScreen>
  )
}
