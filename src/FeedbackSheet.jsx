import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Check, Flame } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L } from './i18n'
import { expandSlots } from './sessionId'

// מצב הרוח בסוף האימון — כל אחד בצבע משלו
export const MOODS = [
  { key: 'great', label: ['מצוין', 'Great'], col: 'var(--c-green)' },
  { key: 'good', label: ['טוב', 'Good'], col: 'var(--accent)' },
  { key: 'ok', label: ['בסדר', 'OK'], col: 'var(--c-gold, #DFA23C)' },
  { key: 'tired', label: ['עייף', 'Tired'], col: 'var(--c-purple)' },
  { key: 'hard', label: ['קשה', 'Tough'], col: '#C85A4E' },
]
export const MOOD_BY_KEY = Object.fromEntries(MOODS.map((m) => [m.key, m]))

// על מה עבדת היום — רב-בחירה. נשמר כטקסט בעברית (השחקן והמאמן קוראים אותו ישירות)
export const FOCUS_OPTS = ['הגנה', 'כדרור', 'קליעה', 'מסירות', 'כושר', 'עונשין']

// גיליון סיכום אימון — נפתח מכפתור "מלא סיכום אימון".
// מזהה את האימון האחרון שטרם סוכם (או האחרון שסוכם — לעריכה), אוסף עומס+מצב רוח+פוקוס+מטרות+הערה,
// ושומר ל-session_effort + session_goal_marks. נראה למאמן.
export default function FeedbackSheet({ session, membership, open, onClose, onSent }) {
  const [pending, setPending] = useState(undefined) // undefined=טוען, null=אין
  const [busy, setBusy] = useState(false)
  const [effort, setEffort] = useState(7)
  const [mood, setMood] = useState(null)
  const [focus, setFocus] = useState([])
  const [note, setNote] = useState('')
  const [goals, setGoals] = useState([])
  const [marks, setMarks] = useState({})
  const me = session.user.id

  const load = useCallback(async () => {
    if (!membership) { setPending(null); return }
    const today = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
    const [{ data: slots }, { data: gm }, { data: gl }, { data: prevMarks }] = await Promise.all([
      supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
      supabase.from('team_games').select('id, game_date, opponent').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', from).lte('game_date', today).order('game_date', { ascending: false }),
      supabase.from('player_goals').select('id, title, period, status, target_value, progress_value, unit, player_id').in('period', ['session', 'week', 'month']),
      supabase.from('session_goal_marks').select('goal_id').eq('player_id', me),
    ])
    const cands = [
      ...expandSlots(slots || [], -3, 0).map((o) => ({ session_id: o.session_id, session_type: 'practice', session_date: o.date, title: L('אימון קבוצתי', 'Team practice') })),
      ...(gm || []).map((g) => ({ session_id: g.id, session_type: 'game', session_date: g.game_date, title: g.opponent ? L(`נגד ${g.opponent}`, `vs ${g.opponent}`) : L('משחק', 'Game') })),
    ].filter((c) => c.session_date).sort((a, b) => b.session_date.localeCompare(a.session_date))
    const p = cands[0] || null
    setPending(p)
    const markedEver = new Set((prevMarks || []).map((m) => m.goal_id))
    const order = { session: 0, week: 1, month: 2 }
    setGoals((gl || [])
      .filter((g) => !(g.period === 'session' && markedEver.has(g.id)))
      .sort((a, b) => (order[a.period] ?? 9) - (order[b.period] ?? 9)))
    if (p) {
      const [{ data: existingEff }, { data: existingMarks }] = await Promise.all([
        supabase.from('session_effort').select('effort, note, mood, focus').eq('session_id', p.session_id).eq('player_id', me).maybeSingle(),
        supabase.from('session_goal_marks').select('goal_id, met').eq('session_id', p.session_id).eq('player_id', me),
      ])
      if (existingEff) {
        setEffort(existingEff.effort || 7)
        setMood(existingEff.mood || null)
        setFocus(Array.isArray(existingEff.focus) ? existingEff.focus : [])
        setNote(existingEff.note || '')
      }
      const m = {}; for (const r of existingMarks || []) m[r.goal_id] = r.met; setMarks(m)
    }
  }, [membership, me])

  useEffect(() => { if (open) load() }, [open, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  const toggleFocus = (f) => setFocus((cur) => cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f])

  const submit = async () => {
    if (!pending || busy || !effort) return
    setBusy(true)
    const { error } = await supabase.from('session_effort').upsert({
      player_id: me, coach_id: membership.coach_id, team: membership.team,
      session_type: pending.session_type, session_id: pending.session_id, session_date: pending.session_date,
      effort, note: note.trim() || null, mood, focus: focus.length ? focus : null,
    }, { onConflict: 'session_id,player_id' })
    if (!error && goals.length) {
      const rows = goals.map((g) => ({
        player_id: me, coach_id: membership.coach_id, session_id: pending.session_id, goal_id: g.id, met: !!marks[g.id],
      }))
      await supabase.from('session_goal_marks').upsert(rows, { onConflict: 'session_id,goal_id,player_id' })
    }
    setBusy(false)
    if (error) { toast.error(L('השליחה נכשלה', 'Failed to send')); return }
    toast.success(L('הסיכום נשלח למאמן 🔥', 'Sent to your coach 🔥'))
    onSent?.()
    onClose()
  }

  if (!open) return null

  return createPortal(
    <div className="fbs-scrim" onClick={onClose}>
      <div className="fbs-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={L('סיכום האימון', 'Session summary')}>
        <span className="fbs-grip" />
        <button className="fbs-x" onClick={onClose} aria-label={L('סגור', 'Close')}><X size={18} /></button>
        <div className="fbs-title">{L('סיכום האימון', 'Session summary')}</div>
        <div className="fbs-sub">
          {pending === undefined ? L('טוען…', 'Loading…')
            : pending ? `${pending.title}${pending.session_date ? ` · ${new Date(pending.session_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })}` : ''}`
            : L('המשוב נשלח ישירות למאמן', 'Your feedback goes straight to your coach')}
        </div>

        {pending === null ? (
          <div className="fbs-empty">
            <span className="fbs-empty-ic"><Flame size={22} /></span>
            <strong>{L('אין אימון פתוח לסיכום', 'No session to summarize yet')}</strong>
            <p className="muted small">{L('אחרי האימון הקרוב תוכל למלא כאן סיכום — עומס, מטרות והרגשה.', 'After your next practice you can fill a summary here — load, goals and how you felt.')}</p>
          </div>
        ) : pending ? (
          <>
            <div className="fbs-q">{L('כמה השקעת היום?', 'How hard did you go?')} <b className="fbs-q-val">{effort}/10</b></div>
            <div className="fbs-effort">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} className={effort === n ? 'fbs-eff on' : 'fbs-eff'} onClick={() => setEffort(n)} aria-pressed={effort === n}>{n}</button>
              ))}
            </div>

            <div className="fbs-q">{L('איך הרגשת?', 'How did you feel?')}</div>
            <div className="fbs-moods">
              {MOODS.map((m) => (
                <button key={m.key} className={mood === m.key ? 'fbs-mood on' : 'fbs-mood'}
                  style={mood === m.key ? { background: m.col, borderColor: 'transparent', color: '#fff' } : undefined}
                  onClick={() => setMood((cur) => cur === m.key ? null : m.key)} aria-pressed={mood === m.key}>{L(m.label[0], m.label[1])}</button>
              ))}
            </div>

            <div className="fbs-q">{L('על מה עבדת היום?', 'What did you work on?')}</div>
            <div className="fbs-focus">
              {FOCUS_OPTS.map((f) => (
                <button key={f} className={focus.includes(f) ? 'fbs-pill on' : 'fbs-pill'} onClick={() => toggleFocus(f)} aria-pressed={focus.includes(f)}>{f}</button>
              ))}
            </div>

            {goals.length > 0 && (
              <>
                <div className="fbs-q">{L('עמדת במטרות היום?', 'Did you meet your goals?')}</div>
                <div className="fbs-checks">
                  {goals.map((g) => (
                    <button key={g.id} className="fbs-check" onClick={() => setMarks((m) => ({ ...m, [g.id]: !m[g.id] }))} aria-pressed={!!marks[g.id]}>
                      <span className={marks[g.id] ? 'fbs-check-box on' : 'fbs-check-box'}>{marks[g.id] ? <Check size={14} /> : null}</span>
                      <span className="fbs-check-txt">{g.title}{g.target_value ? ` · ${g.progress_value || 0}/${g.target_value}${g.unit ? ' ' + g.unit : ''}` : ''}</span>
                      {!g.player_id && <span className="fbs-check-team">{L('קבוצתי', 'Team')}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="fbs-q">{L('משהו לרשום למאמן?', 'Anything to tell your coach?')}</div>
            <textarea className="fbs-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
              placeholder={L('איך הרגשת, מה עבד, מה קשה…', 'How you felt, what worked, what was hard…')} />

            <button className="fbs-send" onClick={submit} disabled={busy || !effort}>
              <Send size={18} /> {busy ? L('שולח…', 'Sending…') : L('שליחה למאמן', 'Send to coach')}
            </button>
          </>
        ) : (
          <div className="fbs-empty"><div className="loader" /></div>
        )}
      </div>
    </div>,
    document.body
  )
}
