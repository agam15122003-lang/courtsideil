import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Check, Flame, WifiOff } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L } from './i18n'
import { expandSlots } from './sessionId'
import useFocusTrap from './useFocusTrap'
// 6.9 — «אין אימון פתוח לסיכום» מול «לא הצלחנו לשאול»: שני מצבים שונים
import { isNetErr } from './offline'

// מצב הרוח בסוף האימון — כל אחד בצבע משלו.
// כל הערכים טוקנים בלבד (בלי hex גולמי): הצבע משמש גם כטקסט על רקע בהיר
// (PlayerDashboard, SessionDetail) וגם כרקע לצ'יפ הנבחר, ולכן חייב להיות
// טוקן שמתאים את עצמו למצב כהה. --c-gold ו---on-color מוגדרים ב-index.css.
export const MOODS = [
  { key: 'great', label: ['מצוין', 'Great'], col: 'var(--c-green)' },
  { key: 'good', label: ['טוב', 'Good'], col: 'var(--accent-strong)' },
  { key: 'ok', label: ['בסדר', 'OK'], col: 'var(--c-gold)' },
  { key: 'tired', label: ['עייף', 'Tired'], col: 'var(--c-purple)' },
  { key: 'hard', label: ['קשה', 'Tough'], col: 'var(--c-red)' },
]
export const MOOD_BY_KEY = Object.fromEntries(MOODS.map((m) => [m.key, m]))

// על מה עבדת היום — רב-בחירה. נשמר כטקסט בעברית (השחקן והמאמן קוראים אותו ישירות)
export const FOCUS_OPTS = ['הגנה', 'כדרור', 'קליעה', 'מסירות', 'כושר', 'עונשין']
// 12.9.2026 (rtl-i18n-10) — הצ'יפים האלה היו המקום היחיד בגיליון שנשאר עברית
// במצב English (ארבע שורות מעליהם מצבי הרוח כן מתורגמים דרך L). התווית
// בלבד מתורגמת — **הערך שנשמר למסד נשאר עברית**, כי המאמן קורא אותו ישירות
// וכל ההיסטוריה כתובה כך.
// המילון כאן ולא ב-i18n.js: הקובץ ההוא מחוץ לחבילה הזו, ובלאו הכי «עונשין»
// חסר שם — כלומר ‎tr() לבדה הייתה משאירה מילה אחת בעברית.
const FOCUS_EN = {
  'הגנה': 'Defense', 'כדרור': 'Dribbling', 'קליעה': 'Shooting',
  'מסירות': 'Passing', 'כושר': 'Conditioning', 'עונשין': 'Free throws',
}
const focusLabel = (f) => L(f, FOCUS_EN[f] || f)

// גיליון סיכום אימון — נפתח מכפתור "מלא סיכום אימון".
// מזהה את האימון האחרון שטרם סוכם (או האחרון שסוכם — לעריכה), אוסף עומס+מצב רוח+פוקוס+יעדים+הערה,
// ושומר ל-session_effort + session_goal_marks. נראה למאמן.
export default function FeedbackSheet({ session, membership, open, onClose, onSent }) {
  const [pending, setPending] = useState(undefined) // undefined=טוען, null=אין
  // 6.9 — מצב שלישי: השאילתות נכשלו ברשת. בלעדיו הגיליון הצהיר «אין אימון
  // פתוח לסיכום» גם כשפשוט לא הייתה קליטה באולם, והנער סגר ולא חזר.
  const [offline, setOffline] = useState(false)
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
    setOffline(false)
    const qs = await Promise.all([
      supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
      supabase.from('team_games').select('id, game_date, game_time, opponent').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', from).lte('game_date', today).order('game_date', { ascending: false }),
      supabase.from('player_goals').select('id, title, period, status, target_value, progress_value, unit, player_id').in('period', ['session', 'week', 'month']),
      supabase.from('session_goal_marks').select('goal_id').eq('player_id', me),
      // 1.8 — גם אימונים חד-פעמיים מהלו"ז הם מועמדים לסיכום, לא רק הקבועים
      // 12.9.2026 — select('*') ולא רשימת עמודות: צריך גם את שעת הסיום (ראו
      // הסינון למטה), ועמודה שחסרה במסד מפילה ב-PostgREST את **כל** השאילתה
      // ומעלימה את האימונים לגמרי (אותה מלכודת שכבר תועדה ב-PlayerTimeline).
      supabase.from('schedule_entries').select('*').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', from).lte('date', today),
    ])
    // ⚠ כשל רשת = לא יודעים. עוצרים כאן במקום להסיק «אין אימון» מ-data ריק.
    if (qs.some((q) => q.error && isNetErr(q.error))) { setOffline(true); setPending(null); return }
    const [{ data: slots }, { data: gm }, { data: gl }, { data: prevMarks }, { data: pr }] = qs
    // 12.9.2026 (player-flow-12) — המועמדים נבחרו עד היום לפי **תאריך בלבד**,
    // ולכן אימון קבוע של היום ב-19:00 נכנס לרשימה כבר ב-08:00 בבוקר: הנער
    // נשאל «כמה קשה היה האימון היום?» שמונה שעות לפני שהאימון התחיל, והתשובה
    // נשמרה ל-session_effort עם ה-session_id שלו. מסננים לפי שעת הסיום, בדיוק
    // כמו רצועת הבית (PlayerDashboard.HomeHero). בלי שעה — 23:59, כלומר
    // האירוע נחשב כמסתיים בסוף היום שלו, ולא מוקדם יותר.
    const nowTs = Date.now()
    const ended = (date, time) => {
      const end = new Date(`${date}T${time || '23:59'}`)
      return !isNaN(end) && end.getTime() <= nowTs
    }
    const cands = [
      ...expandSlots(slots || [], -3, 0).map((o) => ({ session_id: o.session_id, session_type: 'practice', session_date: o.date, end_at: o.end_time || o.start_time, title: L('אימון קבוצתי', 'Team practice') })),
      ...(pr || []).map((e) => ({ session_id: e.id, session_type: 'practice', session_date: e.date, end_at: e.end_time || e.start_time || null, title: L('אימון קבוצתי', 'Team practice') })),
      ...(gm || []).map((g) => ({ session_id: g.id, session_type: 'game', session_date: g.game_date, end_at: g.game_time || null, title: g.opponent ? L(`נגד ${g.opponent}`, `vs ${g.opponent}`) : L('משחק', 'Game') })),
    ].filter((c) => c.session_date && ended(c.session_date, c.end_at ? String(c.end_at).slice(0, 5) : null))
      .sort((a, b) => b.session_date.localeCompare(a.session_date))
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

  // Escape ומלכודת הפוקוס מגיעים מ-useFocusTrap על הגיליון עצמו —
  // כאן נשאר רק נעילת הגלילה של הרקע.
  const sheetRef = useFocusTrap(open, onClose)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

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
    if (error) {
      // 6.9 — «נכשלה» סתמית שלחה את הנער לנסות שוב עכשיו, בדיוק כשאין רשת.
      // ⚠ הסיכום עדיין אינו נכנס לתור היציאה (offline.enqueue) — נשאר פתוח.
      console.error('FeedbackSheet.submit:', error.message || error)
      toast.error(isNetErr(error)
        ? L('אין חיבור — הסיכום לא נשלח. הגיליון נשאר פתוח, נסו שוב כשהרשת חוזרת.',
            "No connection — the summary wasn't sent. The sheet stays open, try again when you're back online.")
        : L('השליחה נכשלה', 'Failed to send'))
      return
    }
    toast.success(L('הסיכום נשלח למאמן 🔥', 'Sent to your coach 🔥'))
    onSent?.()
    onClose()
  }

  if (!open) return null

  return createPortal(
    <div className="fbs-scrim" onClick={onClose}>
      <div ref={sheetRef} className="fbs-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={L('סיכום האימון', 'Session summary')}>
        <span className="fbs-grip" />
        <button className="fbs-x" onClick={onClose} aria-label={L('סגור', 'Close')}><X size={18} /></button>
        <div className="fbs-title">{L('סיכום האימון', 'Session summary')}</div>
        {/* 12.9.2026 (copy-ux-2-13) — כשאין אימון לסכם הופיעה כאן הכותרת
            «המשוב נשלח ישירות למאמן», מעל מצב ריק שאומר «אין אימון פתוח
            לסיכום»: שום דבר לא נשלח ואין מה לשלוח. היא גם ערבבה «משוב» עם
            «סיכום», שהוא המונח בכל שאר הגיליון. במצב הזה פשוט אין כותרת
            משנה — המצב הריק שמתחת כבר אומר את הכול. */}
        {pending !== null && (
          <div className="fbs-sub">
            {pending === undefined ? L('טוען…', 'Loading…')
              : `${pending.title}${pending.session_date ? ` · ${new Date(pending.session_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })}` : ''}`}
          </div>
        )}

        {pending === null && offline ? (
          <div className="fbs-empty">
            <span className="fbs-empty-ic"><WifiOff size={22} /></span>
            <strong>{L('אין חיבור לאינטרנט', 'No internet connection')}</strong>
            <p className="muted small">{L('לא הצלחנו לבדוק אם יש אימון לסיכום. נסו שוב כשהרשת חוזרת — הסיכום לא הלך לאיבוד.', "We couldn't check whether there's a session to summarize. Try again when you're back online.")}</p>
            <button className="fbs-send" onClick={load}>{L('נסו שוב', 'Try again')}</button>
          </div>
        ) : pending === null ? (
          <div className="fbs-empty">
            <span className="fbs-empty-ic"><Flame size={22} /></span>
            <strong>{L('אין אימון פתוח לסיכום', 'No session to summarize yet')}</strong>
            <p className="muted small">{L('אחרי האימון הקרוב תוכל למלא כאן סיכום — עומס, יעדים והרגשה.', 'After your next practice you can fill a summary here — load, goals and how you felt.')}</p>
          </div>
        ) : pending ? (
          <>
            {/* 12.9.2026 (a11y-13) — ‎.fbs-q הוא div רגיל, לא <label>, ולא היה
                מקושר לשום פקד: קורא מסך שמע עשרה כפתורים «עומס 3 מתוך 10»
                בלי לדעת שהשאלה היא «כמה קשה היה האימון». כל מיכל מקבל role
                ו-aria-labelledby אל השאלה שמעליו. העומס הוא בחירה יחידה —
                radiogroup/radio, בדיוק כמו הדפוס שכבר קיים ב-PendingApproval
                וב-PlayerGoals; מצב רוח (ניתן לביטול), פוקוס ויעדים הם
                רב-בחירה ולכן role="group" עם aria-pressed. */}
            <div className="fbs-q" id="fbs-q-effort">{L('כמה קשה היה האימון היום?', 'How hard was practice today?')} <b className="fbs-q-val">{effort}/10</b></div>
            <div className="fbs-effort" role="radiogroup" aria-labelledby="fbs-q-effort">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} className={effort === n ? 'fbs-eff on' : 'fbs-eff'} onClick={() => setEffort(n)}
                  role="radio" aria-checked={effort === n} aria-label={L(`עומס ${n} מתוך 10`, `Load ${n} out of 10`)}>{n}</button>
              ))}
            </div>

            <div className="fbs-q" id="fbs-q-mood">{L('איך הרגשת?', 'How did you feel?')}</div>
            <div className="fbs-moods" role="group" aria-labelledby="fbs-q-mood">
              {MOODS.map((m) => (
                <button key={m.key} className={mood === m.key ? 'fbs-mood on' : 'fbs-mood'}
                  style={mood === m.key ? { background: m.col, borderColor: 'transparent', color: 'var(--on-color)' } : undefined}
                  onClick={() => setMood((cur) => cur === m.key ? null : m.key)} aria-pressed={mood === m.key}>{L(m.label[0], m.label[1])}</button>
              ))}
            </div>

            <div className="fbs-q" id="fbs-q-focus">{L('על מה עבדת היום?', 'What did you work on?')}</div>
            <div className="fbs-focus" role="group" aria-labelledby="fbs-q-focus">
              {FOCUS_OPTS.map((f) => (
                <button key={f} className={focus.includes(f) ? 'fbs-pill on' : 'fbs-pill'} onClick={() => toggleFocus(f)} aria-pressed={focus.includes(f)}>{focusLabel(f)}</button>
              ))}
            </div>

            {goals.length > 0 && (
              <>
                <div className="fbs-q" id="fbs-q-goals">{L('עמדת ביעדים היום?', 'Did you meet your goals?')}</div>
                <div className="fbs-checks" role="group" aria-labelledby="fbs-q-goals">
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

            <div className="fbs-q" id="fbs-q-note">{L('משהו לרשום למאמן?', 'Anything to tell your coach?')}</div>
            {/* 12.9.2026 (a11y-8) — השדה היחיד בגיליון שהתווית שלו הייתה
                placeholder בלבד, שנעלם ברגע ההקלדה (WCAG 3.3.2) */}
            <textarea className="fbs-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
              aria-labelledby="fbs-q-note"
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
