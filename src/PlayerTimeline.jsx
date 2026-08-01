import { useState, useEffect, useCallback } from 'react'
import {
  History, Flame, Star, Crown, MessageSquareHeart, Check, Minus,
  Dumbbell, Volleyball, StickyNote, Send, TrendingUp, Share2,
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
  return (
    <div className="plt-trend">
      <div className="plt-trend-head">
        <span><TrendingUp size={15} /> {L('מגמת עומס', 'Load trend')}</span>
        <span className="muted small">{L(`${cnt(n, 'האימון האחרון', 'אימונים אחרונים')}`, `last ${n} sessions`)}</span>
      </div>
      <svg viewBox="0 0 300 110" className="plt-trend-svg" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pltTrend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="10" y1="100" x2="290" y2="100" stroke="var(--border)" strokeWidth="1" />
        <path d={area} fill="url(#pltTrend)" />
        <path className="plt-trend-line" d={line} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2.5" />
      </svg>
    </div>
  )
}

// תגובת אמוג'י על משוב מהמאמן — טאפ אחד שסוגר את המעגל בחזרה אליו.
// דורש את react_to_feedback() מ-supabase_engagement2.sql; אם ה-RPC חסר —
// הכפתורים פשוט לא ישנו כלום והשגיאה תוצג בטוסט.
const REACTIONS = ['👍', '🔥', '💪', '🙏']
export function FbReact({ fb, coachId, me }) {
  const [chosen, setChosen] = useState(fb?.player_reaction || null)
  if (!fb?.id) return null
  if (chosen) return <span className="th-react-done">{chosen} {L('הגבת', 'You reacted')}</span>
  return (
    <span className="th-react">
      {REACTIONS.map((r) => (
        <button key={r} type="button" onClick={async () => {
          const { error } = await supabase.rpc('react_to_feedback', { p_id: fb.id, p_reaction: r })
          if (error) { toast.error(L('התגובה לא נשלחה', 'Reaction failed')); return }
          setChosen(r)
          sendNotification({ to: coachId, actor: me, type: 'message', content: L(`השחקן הגיב ${r} על המשוב שלך`, `Player reacted ${r} to your feedback`), nav: 'teams' })
        }} aria-label={L(`הגב ${r}`, `React ${r}`)}>{r}</button>
      ))}
    </span>
  )
}

// ============================================================
// "האימונים שלי" — CTA לסיכום, שלישיית סטטיסטיקה, גרף מגמת עומס,
// וציר זמן: כל אימון/משחק שעבר הוא כרטיס אחד שמרכז נוכחות, עומס,
// מטרות ✓✗, משוב המאמן, סיכום, MVP.
// ============================================================
export default function PlayerTimeline({ session, membership }) {
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
      supabase.from('schedule_entries').select('id, date, start_time, end_time, location').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', from).lte('date', today),
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
    const marksBy = {}; for (const m of marksQ.data || []) (marksBy[m.session_id] = marksBy[m.session_id] || []).push({ title: m.goal?.title || L('מטרה', 'Goal'), met: m.met })
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
  if (items === null) return <SkeletonCards count={4} lines={2} />

  return (
    <div className="pl-screen pl-narrow">
      <header className="pl-head tone-accent">
        <span className="pl-head-ic"><History size={22} /></span>
        <div className="pl-head-txt">
          <h2>{L('האימונים שלי', 'My sessions')}</h2>
          <p>{L('המשוב, העומס והמטרות שלך במקום אחד', 'Your feedback, effort and goals in one place')}</p>
        </div>
      </header>

      <button className="plt-cta" onClick={() => setFbOpen(true)}>
        <Send size={18} /> {L('מלא סיכום אימון', 'Log session summary')}
      </button>

      {/* 1.8 — המשוב המלא מהאימון האחרון, למעלה */}
      {latestFb && (
        <div className="plt-lastfb">
          <p className="pl-section-label">{L('המשוב האחרון מהמאמן', "Coach's latest feedback")}</p>
          <div className="plt-lastfb-card">
            <span className="muted small">
              {latestFb.created_at ? new Date(latestFb.created_at).toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' }) : ''}
            </span>
            <p>{latestFb.content}</p>
          </div>
        </div>
      )}

      {stats && (
        <div className="plt-trio">
          <div className="plt-stat"><b className="green">{stats.attendancePct != null ? `${stats.attendancePct}%` : '—'}</b><span>{L('נוכחות', 'Attendance')}</span></div>
          <div className="plt-stat"><b>{stats.tasksDone}</b><span>{L('משימות שבוצעו', 'Tasks done')}</span></div>
          <div className="plt-stat"><b className="brand">{stats.avgEffort != null ? stats.avgEffort.toFixed(1) : '—'}</b><span>{L('עומס ממוצע', 'Avg load')}</span></div>
        </div>
      )}

      {stats && stats.series && stats.series.length >= 2 && <LoadTrend series={stats.series} />}

      {/* סיכום שבועי להורים — טקסט מוכן לוואטסאפ מהנתונים שכבר על המסך */}
      {stats && stats.sessions > 0 && (
        <button className="plt-share" onClick={() => {
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
          <Share2 size={15} /> {L('שיתוף סיכום להורים', 'Share recap with parents')}
        </button>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><History size={26} /></span>
          <div className="empty-title">{L('ההיסטוריה שלך תתחיל כאן', 'Your history starts here')}</div>
          <p className="muted small">{L('אחרי כל אימון — הדירוג שלך, המטרות והמשוב מהמאמן יישמרו כאן, אימון אחרי אימון.', 'After each practice — your rating, goals and coach feedback are saved here, session by session.')}</p>
        </div>
      ) : (
        <>
          <p className="pl-section-label" style={{ marginTop: 18 }}>{L('ארכיון אימונים', 'Session archive')}</p>
          <div className="thist">
            {items.map((c) => {
              const isMvp = c.review && c.review.mvp_player_id === me
              // כרטיס "הודעה מהמאמן" — ירקרק, ללא אימון צמוד
              if (c.type === 'note') {
                return (
                  <div key={c.session_id} className="th-msg">
                    <div className="th-msg-head">
                      <span className="th-msg-ic"><MessageSquareHeart size={15} /></span>
                      <strong>{L('הודעה מהמאמן', 'Message from coach')}</strong>
                      <span className="th-date">{heDate(c.date)}</span>
                    </div>
                    {c.fb?.rating > 0 && (
                      <span className="pl-fb-stars">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} fill={n <= c.fb.rating ? 'currentColor' : 'none'} />)}</span>
                    )}
                    {c.fb?.content && <p className="th-msg-txt">{c.fb.content}</p>}
                    <FbReact fb={c.fb} coachId={membership.coach_id} me={me} />
                  </div>
                )
              }
              // כרטיס סיכום אימון/משחק
              const isOpen = (openId ?? items.find((x) => x.type !== 'note')?.session_id) === c.session_id
              return (
                <div key={c.session_id} className={(isMvp ? 'th-card mvp' : 'th-card') + (isOpen ? '' : ' is-folded')}>
                  <button type="button" className="th-card-head th-fold" onClick={() => setOpenId(isOpen ? '-' : c.session_id)} aria-expanded={isOpen}>
                    <span className="th-title">
                      {c.type === 'game'
                        ? <><Volleyball size={15} /> {c.opponent ? L(`משחק מול ${c.opponent}`, `Game vs ${c.opponent}`) : L('משחק', 'Game')}</>
                        : <><Dumbbell size={15} /> {L('אימון קבוצתי', 'Team practice')}</>}
                    </span>
                    <span className="th-date">{heDate(c.date)}{c.time ? ` · ${c.time}` : ''}</span>
                  </button>
                  {isOpen && (<>

                  {isMvp && <div className="th-mvp"><Crown size={15} /> {L('נבחרת ל-MVP של האימון!', 'You were the MVP!')}</div>}

                  {(c.eff || c.att || c.marks.length > 0) && (
                    <div className="th-pills">
                      {c.eff && <span className="th-pill load"><Flame size={12} /> {L('עומס', 'Load')} {c.eff.effort}/10</span>}
                      {c.att && (
                        <span className={`th-pill att-${c.att}`}>
                          {c.att === 'present' ? <><Check size={12} /> {L('נכחת', 'Present')}</> : c.att === 'late' ? L('איחרת', 'Late') : L('נעדרת', 'Absent')}
                        </span>
                      )}
                      {c.marks.map((m, i) => (
                        <span key={i} className={m.met ? 'th-pill goal met' : 'th-pill goal miss'}>
                          {m.met ? <Check size={12} /> : <Minus size={12} />} {m.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {c.eff?.note && <p className="th-quote">״{c.eff.note}״</p>}

                  {c.fb && (c.fb.content || c.fb.rating > 0) && (
                    <div className="th-coach">
                      <Avatar name={coachName(c.fb.coach)} url={c.fb.coach?.avatar_url} size={28} />
                      <div className="th-coach-body">
                        <span className="th-coach-lbl">{L('המאמן כתב לך', 'Coach wrote')}</span>
                        {c.fb.rating > 0 && (
                          <span className="pl-fb-stars">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} fill={n <= c.fb.rating ? 'currentColor' : 'none'} />)}</span>
                        )}
                        {c.fb.content && <p>{c.fb.content}</p>}
                        <FbReact fb={c.fb} coachId={membership.coach_id} me={me} />
                      </div>
                    </div>
                  )}

                  {c.review?.overall_note && (
                    <p className="th-summary"><StickyNote size={12} /> {L('סיכום המאמן: ', 'Coach summary: ')}{c.review.overall_note}</p>
                  )}
                  </>)}
                </div>
              )
            })}
          </div>
        </>
      )}

      <FeedbackSheet session={session} membership={membership} open={fbOpen}
        onClose={() => setFbOpen(false)} onSent={load} />
    </div>
  )
}
