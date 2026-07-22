import { useState, useEffect } from 'react'
import {
  History, Flame, Star, Crown, MessageSquareHeart, Target, Check, Minus,
  Dumbbell, Volleyball, StickyNote, CalendarDays, MapPin,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { L, trTeam } from './i18n'
import Avatar from './Avatar'
import { expandSlots } from './sessionId'

const ymdAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const coachName = (c) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || L('המאמן', 'Coach') : L('המאמן', 'Coach')
const heDate = (d) => new Date(d + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })

// ============================================================
// "האימונים שלי" — ציר זמן: כל אימון/משחק שעבר הוא כרטיס אחד
// שמרכז את הכל: נוכחות, עומס, מטרות ✓✗, משוב המאמן, סיכום, MVP.
// ============================================================
export default function PlayerTimeline({ session, membership }) {
  const [items, setItems] = useState(null)
  const [stats, setStats] = useState(null)
  const me = session.user.id

  useEffect(() => {
    if (!membership) return
    ;(async () => {
      const from = ymdAgo(90)
      const today = new Date().toISOString().slice(0, 10)
      const [slotsQ, schedQ, gamesQ, effQ, fbQ, revQ, marksQ, rosterQ] = await Promise.all([
        supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
        supabase.from('schedule_entries').select('id, date, start_time, end_time, location').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', from).lte('date', today),
        supabase.from('team_games').select('id, game_date, game_time, opponent, location').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', from).lte('game_date', today),
        supabase.from('session_effort').select('session_id, effort, note').eq('player_id', me),
        supabase.from('player_feedback').select('*, coach:profiles!coach_id(first_name, last_name, avatar_url)').eq('player_id', me).order('created_at', { ascending: false }),
        supabase.from('session_reviews').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('session_date', from),
        supabase.from('session_goal_marks').select('session_id, met, goal:player_goals(title)').eq('player_id', me),
        supabase.from('team_players').select('id').eq('coach_id', membership.coach_id).eq('team', membership.team).eq('player_id', me),
      ])
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

      // כל האימונים והמשחקים שהיו (לו"ז קבוע + חד-פעמיים + משחקים)
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
        // מציגים רק אימונים שקרה בהם משהו — בלי כרטיסים ריקים
        .filter((c) => c.eff || c.fb || c.review || c.marks.length > 0 || c.att)

      // משוב כללי (לא צמוד לאימון) — כרטיס "הודעה מהמאמן" בציר
      for (const f of general) {
        cards.push({ session_id: 'fb-' + f.id, type: 'note', date: (f.created_at || '').slice(0, 10), fb: f, marks: [] })
      }

      cards.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setItems(cards)

      const effVals = Object.values(effBy).map((r) => r.effort).filter(Boolean)
      setStats({
        sessions: cards.filter((c) => c.type !== 'note').length,
        avgEffort: effVals.length ? (effVals.reduce((s, v) => s + v, 0) / effVals.length) : null,
        mvps: cards.filter((c) => c.review && c.review.mvp_player_id === me).length,
      })
    })()
  }, [membership, me])

  if (!membership) return null
  if (items === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>

  return (
    <div className="pl-screen pl-narrow">
      <header className="pl-head tone-accent">
        <span className="pl-head-ic"><History size={22} /></span>
        <div className="pl-head-txt">
          <h2>{L('האימונים שלי', 'My sessions')}</h2>
          <p>{L('כל אימון ומשחק — המשוב, העומס והמטרות שלך במקום אחד', 'Every practice and game — your feedback, effort and goals in one place')}</p>
        </div>
      </header>

      {stats && stats.sessions > 0 && (
        <div className="pl-fb-stats">
          <div className="pl-fb-stat"><b>{stats.sessions}</b><span>{L('אימונים ומשחקים', 'sessions')}</span></div>
          <div className="pl-fb-stat"><b>{stats.avgEffort != null ? stats.avgEffort.toFixed(1) : '—'}<i>/10</i></b><span>{L('עומס ממוצע', 'avg effort')}</span></div>
          <div className="pl-fb-stat"><b>{stats.mvps}{stats.mvps > 0 ? ' 👑' : ''}</b><span>MVP</span></div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><History size={26} /></span>
          <div className="empty-title">{L('ההיסטוריה שלך תתחיל כאן', 'Your history starts here')}</div>
          <p className="muted small">{L('אחרי כל אימון — הדירוג שלך, המטרות והמשוב מהמאמן יישמרו כאן, אימון אחרי אימון.', 'After each practice — your rating, goals and coach feedback are saved here, session by session.')}</p>
        </div>
      ) : (
        <div className="tl">
          {items.map((c) => {
            const isMvp = c.review && c.review.mvp_player_id === me
            return (
              <article key={c.session_id} className={`tl-item ${c.type}${isMvp ? ' mvp' : ''}`}>
                <span className="tl-dot" aria-hidden="true">
                  {c.type === 'game' ? <Volleyball size={13} /> : c.type === 'note' ? <MessageSquareHeart size={13} /> : <Dumbbell size={13} />}
                </span>
                <div className="tl-card">
                  <header className="tl-head">
                    <span className={`tl-type ${c.type}`}>
                      {c.type === 'game' ? (c.opponent ? L(`משחק מול ${c.opponent}`, `Game vs ${c.opponent}`) : L('משחק', 'Game')) : c.type === 'note' ? L('הודעה מהמאמן', 'Note from coach') : L('אימון', 'Practice')}
                    </span>
                    <span className="tl-date"><CalendarDays size={12} /> {heDate(c.date)}{c.time ? ` · ${c.time}` : ''}</span>
                  </header>

                  {isMvp && (
                    <div className="tl-mvp"><Crown size={16} /> {L('נבחרת ל-MVP של האימון!', 'You were the MVP!')}</div>
                  )}

                  {(c.att || c.eff) && (
                    <div className="tl-chips">
                      {c.att && (
                        <span className={`tl-chip att-${c.att}`}>
                          {c.att === 'present' ? <><Check size={12} /> {L('נוכחת', 'Present')}</> : c.att === 'late' ? L('איחרת', 'Late') : L('נעדרת', 'Absent')}
                        </span>
                      )}
                      {c.eff && <span className="tl-chip eff"><Flame size={12} /> {L('העומס שלך', 'Your effort')} {c.eff.effort}/10</span>}
                    </div>
                  )}

                  {c.marks.length > 0 && (
                    <div className="tl-goals">
                      <span className="tl-lbl"><Target size={13} /> {L('המטרות שלך', 'Your goals')}</span>
                      <div className="tl-goal-chips">
                        {c.marks.map((m, i) => (
                          <span key={i} className={m.met ? 'tl-goal met' : 'tl-goal miss'}>
                            {m.met ? <Check size={12} /> : <Minus size={12} />} {m.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.fb && (c.fb.content || c.fb.rating > 0) && (
                    <div className="tl-fb">
                      <Avatar name={coachName(c.fb.coach)} url={c.fb.coach?.avatar_url} size={30} />
                      <div className="tl-fb-body">
                        <span className="tl-lbl">{coachName(c.fb.coach)} {L('כתב לך', 'wrote')}</span>
                        {c.fb.rating > 0 && (
                          <span className="pl-fb-stars">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} fill={n <= c.fb.rating ? 'currentColor' : 'none'} />)}</span>
                        )}
                        {c.fb.content && <p>{c.fb.content}</p>}
                      </div>
                    </div>
                  )}

                  {c.eff?.note && (
                    <p className="tl-mynote"><StickyNote size={12} /> {L('רשמת: ', 'You wrote: ')}{c.eff.note}</p>
                  )}

                  {c.review?.overall_note && (
                    <p className="tl-review">{L('סיכום המאמן: ', 'Coach summary: ')}{c.review.overall_note}</p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
