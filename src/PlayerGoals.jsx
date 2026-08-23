import { useState, useEffect, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { Target, Plus, Trash2, Check, Minus, X, TrendingUp, ChevronDown } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { sendNotification } from './notify'
import { L } from './i18n'
import { PLAYER_SIDE } from './flags'
import { confirmDialog } from './confirm'
import { burstConfetti } from './confetti'
import { SkeletonCards } from './Skeleton'
import useFocusTrap from './useFocusTrap'
import PlayerScreen from './PlayerScreen'

// מסך שמופנה לקטינים — כישלון שליפה חייב להיראות כשגיאה עם «נסה שוב»,
// לא כ«אין יעדים». העוזר הזה מרכז את הבדיקה לכל קריאות ה-update/delete.
const failToast = () => toast.error(L('העדכון נכשל — נסה שוב', 'Update failed — try again'))

// ארבעת הטווחים של מסמך ההשקה (1.5), בסדר הקבוע. 'week' נשאר לתצוגת
// יעדים ישנים בלבד (legacy) — לא מוצע ביצירת יעד חדש.
export const PERIODS = [
  { id: 'session', label: ['לאימון הקרוב', 'Next practice'], short: ['לאימון הקרוב', 'Next practice'] },
  { id: 'month', label: ['החודש', 'This month'], short: ['חודשי', 'Monthly'] },
  { id: 'half_year', label: ['חצי שנה', 'Half a year'], short: ['חצי-שנתי', 'Half-year'] },
  { id: 'year', label: ['השנה', 'This year'], short: ['שנתי', 'Yearly'] },
  { id: 'week', label: ['השבוע', 'This week'], short: ['שבועי', 'Weekly'], legacy: true },
]
const periodShort = (id) => { const p = PERIODS.find((x) => x.id === id); return p ? L(p.short[0], p.short[1]) : id }
const dueLabel = (d) => { const x = new Date(d + 'T00:00'); return isNaN(x) ? '' : `${x.getDate()}.${x.getMonth() + 1}` }

// ---------- עורך יעדים (מאמן, בתוך חלון עריכת השחקן) ----------
// טופס נקי לפי מסמך ההשקה (1.5): טווח · מה היעד · עד מתי. בלי הצעות
// אוטומטיות ובלי נתוני עומס — רק היעד עצמו.
// rosterId (22.8, צד המאמן בלבד): היעדים נשמרים על שורת הסגל ולא על חשבון
// השחקן — וכך יש יעדים גם לשחקן בלי חשבון. עם צד שחקן פתוח, playerId מנצח
// ו-roster_id נכתב לצידו כדי שהשורה תחזיק את שני המזהים.
// onChange (לא חובה) — נקרא אחרי כל שינוי שנשמר, כדי שמסך שמציג סיכום
// יעדים מסביב לעורך (לוח היעדים) יתרענן ולא יישאר עם מספרים ישנים.
export function PlayerGoalsEditor({ coachId, playerId, rosterId, team, playerName, onChange }) {
  const byRoster = !PLAYER_SIDE && !!rosterId
  const [goals, setGoals] = useState(null)
  const [progDraft, setProgDraft] = useState({}) // {goalId: '120'} — הקלדה ישירה של התקדמות
  const [period, setPeriod] = useState('session')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  // בקשת הבעלים (2.8): אפשרות להציב יעד ידני מדיד — מספר + יחידה.
  // בלי מספר היעד נשאר «וי» רגיל, בדיוק כמו קודם.
  const [target, setTarget] = useState('')
  const [unit, setUnit] = useState('')
  const [busy, setBusy] = useState(false)
  // גרף ההתקדמות שהשחקן רואה — עכשיו גם אצל המאמן (pgl_coach_read קיימת)
  const [chartId, setChartId] = useState(null)
  const [logsBy, setLogsBy] = useState({})
  const [loadErr, setLoadErr] = useState(null)

  const load = useCallback(async () => {
    // בלי בדיקת error כישלון שליפה נראה כמו «אין יעדים» — בדיוק ההיפוך המסוכן
    const base = () => supabase.from('player_goals').select('*').eq('coach_id', coachId).order('created_at', { ascending: false })
    // צד שחקן פתוח + שני המזהים ידועים: גם יעדים שנרשמו על שורת הסגל כשהמתג
    // היה כבוי (roster_id בלי player_id) שייכים לאותו שחקן
    let { data, error } = await (byRoster
      ? base().eq('roster_id', rosterId)
      : rosterId && playerId
        ? base().or(`player_id.eq.${playerId},roster_id.eq.${rosterId}`)
        : base().eq('player_id', playerId))
    if (error && !byRoster && rosterId && playerId && /roster_id/i.test(error.message || '')) ({ data, error } = await base().eq('player_id', playerId))
    if (error) { setLoadErr(error); setGoals([]); setLogsBy({}); return }
    setLoadErr(null)
    setGoals(data || [])
    const ids = (data || []).filter((g) => g.target_value).map((g) => g.id)
    if (ids.length) {
      const { data: logs } = await supabase.from('player_goal_logs')
        .select('goal_id, value, log_date, created_at').in('goal_id', ids).order('created_at', { ascending: true })
      const by = {}
      for (const r of logs || []) (by[r.goal_id] = by[r.goal_id] || []).push(r)
      setLogsBy(by)
    } else setLogsBy({})
  }, [coachId, playerId, rosterId, byRoster])
  useEffect(() => { load() }, [load])

  const insertGoal = async (goalTitle) => {
    if (!goalTitle.trim() || busy) return false
    setBusy(true)
    const tv = Number(target) > 0 ? Number(target) : null
    const row = {
      coach_id: coachId, player_id: playerId || null, team,
      period, title: goalTitle.trim(), due_date: dueDate || null,
      target_value: tv, unit: tv ? (unit.trim() || null) : null,
      metric_type: tv ? 'count' : 'checkbox',
    }
    // roster_id (supabase_coach_only_22_8.sql) נכתב תמיד כשהוא ידוע
    if (rosterId) row.roster_id = rosterId
    // created_by (supabase_goals_launch.sql) — אם העמודה טרם נוספה, שומרים בלעדיה
    let { error } = await supabase.from('player_goals').insert({ ...row, created_by: coachId })
    if (error) ({ error } = await supabase.from('player_goals').insert(row))
    // מסד בלי roster_id: לשחקן מחובר שומרים כמו פעם; בלי חשבון — אין לאן
    if (error && row.roster_id && /roster_id/i.test(error.message || '')) {
      if (playerId) ({ error } = await supabase.from('player_goals').insert({ ...row, roster_id: undefined }))
      else { setBusy(false); toast.error(L('כדי לשמור יעדים צריך להריץ את supabase_coach_only_22_8.sql', 'Saving goals needs supabase_coach_only_22_8.sql')); return false }
    }
    setBusy(false)
    if (error) { toast.error(L('ההוספה נכשלה', 'Failed to add')); return false }
    if (playerId) sendNotification({ to: playerId, actor: coachId, type: 'message', content: period === 'session' ? L('המאמן הגדיר לך יעד לאימון הקרוב 🎯', 'Your coach set you a goal for the next practice 🎯') : L('המאמן הגדיר לך יעד חדש 🎯', 'Your coach set you a new goal 🎯'), nav: 'goals' })
    load()
    onChange?.()
    return true
  }

  const add = async () => {
    const ok = await insertGoal(title)
    if (ok) { setTitle(''); setDueDate(''); setTarget(''); setUnit('') }
  }

  // כל העדכונים בודקים error — קודם כישלון (RLS/רשת) חזר בשקט והכפתור «עבד»
  // למראית עין עד הטעינה הבאה.
  // מסלול עדכון אחד ל-‎+/-‎ ולהקלדה ישירה — אחרת שתי דרכים לאותו מספר
  // היו נבדלות בבדיקת «הושג» וביומן הגרף.
  const applyProgress = async (g, value) => {
    const next = Math.max(0, Number(value) || 0)
    const done = g.target_value ? next >= g.target_value : g.status === 'done'
    const { error } = await supabase.from('player_goals').update({ progress_value: next, status: done ? 'done' : 'active', updated_at: new Date().toISOString() }).eq('id', g.id)
    if (error) { failToast(); return }
    // יומן ההתקדמות — ממנו נבנה הגרף. היום ל-player_goal_logs יש רק מדיניות
    // כתיבה של השחקן (pgl_player_all), ולכן כתיבה של המאמן עשויה להידחות —
    // נכשלת בשקט, כדי שההתקדמות עצמה (שכן נשמרה) לא תיראה ככישלון.
    if (g.target_value && playerId) {
      await supabase.from('player_goal_logs').insert({ goal_id: g.id, player_id: playerId, value: next })
    }
    if (done && g.status !== 'done' && playerId) sendNotification({ to: playerId, actor: coachId, type: 'message', content: L('השלמת יעד! 🎉', 'Goal completed! 🎉'), nav: 'goals' })
    load()
    onChange?.()
  }
  const bump = (g, delta) => applyProgress(g, (g.progress_value || 0) + delta)
  const toggleDone = async (g) => {
    const done = g.status !== 'done'
    const { error } = await supabase.from('player_goals').update({ status: done ? 'done' : 'active', updated_at: new Date().toISOString() }).eq('id', g.id)
    if (error) { failToast(); return }
    if (done && playerId) sendNotification({ to: playerId, actor: coachId, type: 'message', content: L('השלמת יעד! 🎉', 'Goal completed! 🎉'), nav: 'goals' })
    load()
    onChange?.()
  }
  const del = async (id) => {
    // פח האשפה יושב ליד סימון «הושג» — לחיצה בטעות מחקה יעד ואת כל
    // ההתקדמות שנרשמה עליו, ולכן שואלים קודם.
    const ok = await confirmDialog({
      title: L('למחוק את היעד?', 'Delete this goal?'),
      message: L('היעד יימחק, ואיתו כל ההתקדמות שנרשמה עליו והגרף שלה. אי אפשר לשחזר.',
                 'The goal will be deleted, and with it all the progress logged for it and its chart. This cannot be undone.'),
      confirmText: L('מחיקת היעד', 'Delete the goal'),
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('player_goals').delete().eq('id', id)
    if (error) { toast.error(L('המחיקה נכשלה — נסה שוב', 'Failed to delete — try again')); return }
    load()
    onChange?.()
  }

  return (
    <div className="pg-editor">
      <div className="pg-periods">
        {PERIODS.filter((p) => !p.legacy).map((p) => (
          <button key={p.id} type="button" className={period === p.id ? 'pg-period on' : 'pg-period'} onClick={() => setPeriod(p.id)}>
            {L(p.short[0], p.short[1])}
          </button>
        ))}
      </div>
      <div className="pg-add">
        <div className="pg-add-row">
          <input className="finder-input" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={L('מה היעד? לדוגמה: שיפור ביד שמאל', "What's the goal? e.g. improve the weak hand")} maxLength={120} />
          <input className="finder-input pg-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label={L('עד מתי', 'Due date')} />
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={add} disabled={!title.trim() || busy} aria-label={L('הוסף יעד', 'Add goal')}><Plus size={15} /></button>
        </div>
        {/* יעד ידני מדיד (בקשת הבעלים): מספר + יחידה — בלי מספר זה יעד «וי» */}
        <div className="pg-add-row pg-target-row">
          <input className="finder-input pg-target" dir="ltr" inputMode="numeric" value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={L('יעד מספרי (לא חובה)', 'Numeric target (optional)')} />
          <input className="finder-input pg-unit" value={unit} onChange={(e) => setUnit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={L('יחידה — זריקות', 'Unit — shots')} maxLength={30} />
        </div>
        <p className="muted small pg-due-line">
          {Number(target) > 0
            ? (byRoster
                ? L(`תעדכן כאן את ההתקדמות עד ${target} ${unit.trim()}`.trim(), `You update the progress here up to ${target} ${unit.trim()}`.trim())
                : L(`השחקן ידווח התקדמות עד ${target} ${unit.trim()}`.trim(), `The player logs progress up to ${target} ${unit.trim()}`.trim()))
            : (byRoster
                ? L('בלי מספר — מסמנים ✓ כשהיעד הושג.', 'Without a number — tick it when the goal is met.')
                : L('בלי מספר — השחקן פשוט מסמן שהיעד הושג.', 'Without a number the player just ticks the goal off.'))}
          {dueDate ? L(` · עד ${dueLabel(dueDate)}`, ` · due ${dueLabel(dueDate)}`) : ''}
        </p>
      </div>

      {/* שלושת המצבים: טעינה · שגיאה עם «נסה שוב» · רשימה */}
      {goals === null && !loadErr && <SkeletonCards count={2} lines={1} />}
      {loadErr && (
        <div className="empty-state" role="alert">
          <span className="empty-ic"><Target size={26} /></span>
          <div className="empty-title">{L('לא הצלחנו לטעון את היעדים', 'Could not load the goals')}</div>
          <p className="muted small">
            {byRoster && /roster_id/i.test(loadErr.message || '')
              ? L('צריך להריץ את supabase_coach_only_22_8.sql — עד אז אין איפה לשמור יעדים לשחקן בלי חשבון.', 'Run supabase_coach_only_22_8.sql — until then there is nowhere to keep goals for a player without an account.')
              : L('היעדים לא נמחקו — זו תקלת טעינה.', 'No goals were deleted — this is a loading error.')}
          </p>
          <button type="button" className="btn-soft empty-cta" onClick={() => { setGoals(null); setLoadErr(null); load() }}>
            {L('נסה שוב', 'Try again')}
          </button>
        </div>
      )}
      {goals && goals.length > 0 && (
        <ul className="pg-list">
          {goals.map((g) => (
            <li key={g.id} className={g.status === 'done' ? 'pg-item done' : 'pg-item'}>
              <div className="pg-item-main">
                <span className="pg-per">{periodShort(g.period)}</span>
                <strong>{g.title}</strong>
                {g.target_value ? <span className="muted small" dir="ltr">{g.progress_value || 0}/{g.target_value}{g.unit ? ` ${g.unit}` : ''}</span> : null}
                {g.due_date && <span className="muted small">{L('עד ', 'due ')}{dueLabel(g.due_date)}</span>}
              </div>
              {g.target_value ? (
                <div className="pg-ctl">
                  {(logsBy[g.id] || []).length >= 2 && (
                    <button className={chartId === g.id ? 'icon-btn pg-chart-btn on' : 'icon-btn pg-chart-btn'}
                      onClick={() => setChartId(chartId === g.id ? null : g.id)}
                      aria-expanded={chartId === g.id} aria-label={L('גרף התקדמות', 'Progress chart')}>
                      <TrendingUp size={14} />
                    </button>
                  )}
                  {/* ⚠ היה כאן disabled={restricted} — משתנה שקיים רק ב-MyGoals (השחקן).
                      בעורך של המאמן הוא לא מוגדר, וכל יעד מספרי הפיל את כרטיס
                      השחקן ב-ReferenceError (נתפס בבוחן 22.8). המאמן אינו «מוגבל». */}
                  <button className="icon-btn" onClick={() => bump(g, -1)} aria-label="-"><Minus size={14} /></button>
                  <button className="icon-btn" onClick={() => bump(g, 1)} aria-label="+"><Plus size={14} /></button>
                  {/* הקלדה ישירה — ‎100 זריקות לא נרשמות ב-100 לחיצות על ‎+ */}
                  <input className="finder-input ta-prog-in" dir="ltr" inputMode="numeric" placeholder="0"
                    value={progDraft[g.id] ?? String(g.progress_value || '')}
                    aria-label={L(`התקדמות מתוך ${g.target_value}`, `Progress out of ${g.target_value}`)}
                    onChange={(e) => setProgDraft((d) => ({ ...d, [g.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    onBlur={() => {
                      const v = progDraft[g.id]
                      setProgDraft((d) => { const n = { ...d }; delete n[g.id]; return n })
                      if (v == null || v === '' || Number(v) === (g.progress_value || 0)) return
                      applyProgress(g, Number(v))
                    }} />
                </div>
              ) : (
                <button className={g.status === 'done' ? 'pg-check on' : 'pg-check'} onClick={() => toggleDone(g)} aria-label={L('הושג', 'Done')}><Check size={14} /></button>
              )}
              <button className="icon-btn danger" onClick={() => del(g.id)} aria-label={L('מחק', 'Delete')}><Trash2 size={14} /></button>
              {chartId === g.id && (logsBy[g.id] || []).length >= 2 && (
                <div className="pg-chart-wrap">
                  <GoalChart logs={logsBy[g.id]} target={g.target_value} goalId={g.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


// ---------- גיליון "יעד חדש" (השחקן מוסיף יעד אישי) ----------
function AddGoalSheet({ open, onClose, onAdd }) {
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [period, setPeriod] = useState('month')
  const [busy, setBusy] = useState(false)
  // מלכודת פוקוס: Escape, Tab שנשאר בתוך הגיליון, והחזרת הפוקוס לכפתור הפותח.
  // בלי זה aria-modal הייתה הצהרה לא נכונה — המקלדת המשיכה לטייל ברקע.
  const sheetRef = useFocusTrap(!!open, () => onClose?.())

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    const ok = await onAdd(title.trim(), target ? Math.max(1, parseInt(target, 10)) : null, period)
    setBusy(false)
    if (ok) { setTitle(''); setTarget(''); onClose() }
  }

  if (!open) return null
  return createPortal(
    <div className="fbs-scrim" onClick={onClose}>
      <div ref={sheetRef} className="fbs-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={L('יעד חדש', 'New goal')}>
        <span className="fbs-grip" />
        <button className="fbs-x" onClick={onClose} aria-label={L('סגור', 'Close')}><X size={18} /></button>
        <div className="fbs-title">{L('יעד חדש', 'New goal')}</div>
        <div className="fbs-sub">{L('יעד אישי שלך — המאמן יראה אותו מסומן «אישי»', 'Your personal goal — your coach sees it marked “personal”')}</div>
        <div className="fbs-q">{L('לאיזה טווח?', 'For when?')}</div>
        <div className="pg-periods">
          {PERIODS.filter((p) => !p.legacy).map((p) => (
            <button key={p.id} type="button" className={period === p.id ? 'pg-period on' : 'pg-period'} onClick={() => setPeriod(p.id)}>
              {L(p.short[0], p.short[1])}
            </button>
          ))}
        </div>
        <div className="fbs-q">{L('מה היעד?', "What's the goal?")}</div>
        <input className="plg2-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
          placeholder={L('למשל: 100 זריקות ליום', 'e.g. 100 shots a day')} />
        <div className="fbs-q">{L('יעד (מספר) — לא חובה', 'Target (number) — optional')}</div>
        <input className="plg2-input" dir="ltr" inputMode="numeric" value={target}
          onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))} placeholder={L('למשל: 100', 'e.g. 100')} />
        <button className="fbs-send" onClick={submit} disabled={!title.trim() || busy}>
          <Plus size={18} /> {busy ? L('מוסיף…', 'Adding…') : L('הוסף יעד', 'Add goal')}
        </button>
      </div>
    </div>,
    document.body
  )
}

// גרף התקדמות למטרה ספציפית — קו+שטח של ההתקדמות לאורך זמן, עם קו יעד מקווקו
// (מיוצא — דף הבית של השחקן מציג אותו בכרטיסי היעדים)
function GoalChart({ logs, target, goalId }) {
  const series = logs.map((l) => Number(l.value))
  if (series.length < 2) return null
  const W = 280, H = 64, p = 6, n = series.length
  const maxV = Math.max(target || 0, ...series, 1)
  const xs = (i) => p + i * ((W - 2 * p) / (n - 1))
  const ys = (v) => H - p - (v / maxV) * (H - 2 * p)
  const pts = series.map((v, i) => [xs(i), ys(v)])
  const line = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ')
  const area = `${line} L ${xs(n - 1).toFixed(1)} ${H - p} L ${xs(0).toFixed(1)} ${H - p} Z`
  const ty = target ? ys(target) : null
  const last = pts[n - 1]
  const gid = `plgGrad-${goalId}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="plg2-chart" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {ty != null && <line x1={p} y1={ty} x2={W - p} y2={ty} stroke="var(--c-green)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.75" />}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  )
}

// ---------- מסך היעדים של השחקן — עם תיעוד עצמי ----------
export function MyGoals({ session, membership, restricted = false, personalIds = [], scope = 'team', bell, coachName, onCoach }) {
  // allGoals = כל מה שהשרת החזיר; goals (למטה) = אחרי הורדת המאמן האישי
  const [allGoals, setGoals] = useState(null)
  const [logsBy, setLogsBy] = useState({})
  const [openId, setOpenId] = useState(null)
  const [amtInput, setAmtInput] = useState({})
  const [addOpen, setAddOpen] = useState(false)
  const [loadErr, setLoadErr] = useState(null)
  const me = session.user.id

  const load = useCallback(async () => {
    // בלי בדיקת error שגיאת שליפה הוצגה לשחקן (לרוב קטין) כ«עוד אין יעדים»
    const { data, error } = await supabase.from('player_goals').select('*').order('created_at', { ascending: false })
    if (error) { setLoadErr(error); setGoals([]); setLogsBy({}); return }
    setLoadErr(null)
    setGoals(data || [])
    const ids = (data || []).map((g) => g.id)
    if (ids.length) {
      const { data: logs } = await supabase.from('player_goal_logs')
        .select('goal_id, value, log_date, created_at').in('goal_id', ids).order('created_at', { ascending: true })
      const by = {}; for (const r of logs || []) (by[r.goal_id] = by[r.goal_id] || []).push(r)
      setLogsBy(by)
    } else setLogsBy({})
  }, [])
  useEffect(() => { load() }, [load])

  const goalFrac = (g) => g.target_value ? Math.min(1, (g.progress_value || 0) / g.target_value) : (g.status === 'done' ? 1 : 0)

  // שומר "צילום מצב" ליומן — כדי לצייר את גרף ההתקדמות
  const recordLog = async (goalId, value) => {
    setLogsBy((cur) => ({ ...cur, [goalId]: [...(cur[goalId] || []), { value, log_date: null, created_at: 'x' }] }))
    await supabase.from('player_goal_logs').insert({ goal_id: goalId, player_id: me, value })
  }

  const applyProgress = async (g, next) => {
    const done = next >= g.target_value
    const prev = { progress_value: g.progress_value, status: g.status }
    setGoals((cur) => cur.map((x) => x.id === g.id ? { ...x, progress_value: next, status: done ? 'done' : 'active' } : x))
    const { error } = await supabase.from('player_goals').update({ progress_value: next, status: done ? 'done' : 'active', updated_at: new Date().toISOString() }).eq('id', g.id)
    // כישלון החזיר עד עכשיו 204 בשקט — הכפתור «עבד» וההתקדמות נעלמה בטעינה הבאה
    if (error) {
      setGoals((cur) => cur.map((x) => x.id === g.id ? { ...x, ...prev } : x))
      failToast()
      return
    }
    await recordLog(g.id, next)
    if (done && g.status !== 'done') { toast.success(L('הושלם יעד! 🎉', 'Goal completed! 🎉')); burstConfetti() }
  }

  const bump = async (g, dir) => {
    if (!g.target_value) return
    const step = Math.max(1, Math.round(g.target_value / 20))
    const next = Math.max(0, Math.min(g.target_value, (g.progress_value || 0) + dir * step))
    await applyProgress(g, next)
  }

  const logAmount = async (g) => {
    const amt = parseInt(amtInput[g.id], 10)
    if (!amt || !g.target_value) return
    const next = Math.max(0, Math.min(g.target_value, (g.progress_value || 0) + amt))
    setAmtInput((m) => ({ ...m, [g.id]: '' }))
    await applyProgress(g, next)
  }

  const toggleDone = async (g) => {
    const done = g.status !== 'done'
    const prevStatus = g.status
    setGoals((cur) => cur.map((x) => x.id === g.id ? { ...x, status: done ? 'done' : 'active' } : x))
    const { error } = await supabase.from('player_goals').update({ status: done ? 'done' : 'active', updated_at: new Date().toISOString() }).eq('id', g.id)
    if (error) {
      setGoals((cur) => cur.map((x) => x.id === g.id ? { ...x, status: prevStatus } : x))
      failToast()
      return
    }
    if (done) toast.success(L('כל הכבוד! 💪', 'Nice! 💪'))
  }

  const addGoal = async (title, target, period) => {
    const row = {
      coach_id: membership?.coach_id, player_id: me, team: membership?.team || null,
      period: period || 'month', title, target_value: target, metric_type: target ? 'count' : 'checkbox',
    }
    // created_by = השחקן — מסמן את היעד כ«אישי» (supabase_goals_launch.sql)
    let { error } = await supabase.from('player_goals').insert({ ...row, created_by: me })
    if (error) ({ error } = await supabase.from('player_goals').insert(row))
    if (error) { toast.error(L('ההוספה נכשלה', 'Failed to add')); return false }
    toast.success(L('היעד נוסף', 'Goal added'))
    load()
    return true
  }

  // ⚠ גם הטעינה וגם השגיאה עטופות ב-PlayerScreen: הקנבס החדש מוריד את
  // הסרגל העליון במובייל, ומסך בלי באנר נשאר בלי כותרת ובלי פעמון.
  if (allGoals === null) {
    if (scope === 'personal') return <SkeletonCards count={2} lines={2} />
    return (
      <PlayerScreen page="goals" bell={bell} coach={coachName} onCoach={onCoach}>
        <SkeletonCards count={3} lines={2} />
      </PlayerScreen>
    )
  }

  // 17.8 — יעדים שהמאמן האישי הציב חיים בדף שלו ולא מתערבבים כאן.
  // ⚠ סינון בזמן רינדור ולא בתוך load(): personalIds הוא מערך חדש בכל
  //   רינדור של ההורה, ובתוך ה-useCallback הוא היה או תלות שמריצה טעינה
  //   אינסופית, או ערך תקוע מהרינדור הראשון.
  // scope='personal' = מוטמע בדף המאמן האישי ומציג רק את שלו
  const goals = allGoals.filter((g) =>
    scope === 'personal' ? personalIds.includes(g.coach_id) : !personalIds.includes(g.coach_id))
  // בהטמעה אין באנר משלנו — הדף כבר הביא אחד
  const Shell = scope === 'personal' ? Fragment : PlayerScreen
  const shellOf = (extra) => (scope === 'personal' ? {} : { page: 'goals', bell, coach: coachName, onCoach, ...extra })

  // מצב שגיאה — לא «אין יעדים». הסבר מרגיע + «נסה שוב».
  if (loadErr) {
    return (
      <Shell {...shellOf()}>
        <div className="ps-card">
          <div className="ps-empty" role="alert">
            <span className="ps-empty-ic"><Target size={20} aria-hidden="true" /></span>
            <b>{L('לא הצלחנו לטעון את היעדים', 'Could not load your goals')}</b>
            <p>{L('היעדים שלך לא נמחקו — זו תקלת טעינה. בדקו את החיבור ונסו שוב.', 'Your goals were not deleted — this is a loading error. Check your connection and try again.')}</p>
            <button type="button" className="ps-btn" onClick={() => { setGoals(null); setLoadErr(null); load() }}>
              {L('נסה שוב', 'Try again')}
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  const total = goals.length
  const overallPct = total ? Math.round(goals.reduce((a, g) => a + goalFrac(g), 0) / total * 100) : 0

  // מקור היעד — טקסט אחד שמשמש גם בכרטיס וגם בבאנר
  const originTx = (g) => !g.player_id
    ? L('קבוצתי', 'Team')
    : g.created_by === me ? L('אישי', 'Personal') : L('מהמאמן', 'From coach')

  // ⚠ הפילוח לפי status ולא לפי goalFrac, וזה לא ניואנס.
  //   goalFrac של יעד מספרי נגזר מ-progress_value, ולכן ברגע שהוא נוגע
  //   ביעד הוא **נעול** על 1. אילו כרטיס «הושג» היה נקבע לפיו, ביטול היה
  //   כותב status='active' בלי להזיז את המספר — היעד היה נשאר בכרטיס
  //   ההישגים, הלחיצה הייתה no-op שקט, והספירה אצל המאמן (CoachTodo,
  //   ‏.neq('status','done')) הייתה מתעדכנת בלי שהשחקן רואה כלום.
  //   לפי status הביטול מחזיר את היעד לרשימה, שם יש לו מינוס לתיקון.
  const isAchieved = (g) => g.status === 'done'
  const doneCount = goals.filter(isAchieved).length

  // הבאנר של המסמך הוא יעד אחד גדול עם מונה ויומן. בוחרים את היעד הפעיל
  // הקרוב ביותר שהשחקן באמת יכול לתעד: שלו (RLS), מספרי, ולא הושלם.
  const heroGoal = goals.find((g) => g.player_id && g.target_value && !isAchieved(g)) || null
  const heroLogs = heroGoal ? (logsBy[heroGoal.id] || []).slice(-5) : []
  const heroPct = heroGoal ? Math.min(100, Math.round(((heroGoal.progress_value || 0) / heroGoal.target_value) * 100)) : 0
  const heroPeriod = heroGoal ? PERIODS.find((p) => p.id === heroGoal.period) : null

  // 1.5 — סדר קבוע: לאימון הקרוב · חודשי · חצי-שנתי · שנתי (+שבועי ישן אם קיים)
  // הבאנר יוצא מהרשימה כדי שלא יופיע פעמיים, וההישגים יורדים לכרטיס משלהם.
  // ⚠ בהטמעה בדף המאמן האישי מציגים רק טווחים שיש בהם יעד — ארבע שורות
  //   «אין יעדים לטווח הזה» מתחת ליעד אחד הן רעש, לא מידע.
  const groups = PERIODS
    .map((p) => ({
      ...p,
      items: goals.filter((g) => g.period === p.id && g !== heroGoal && !isAchieved(g)),
    }))
    .filter((p) => p.items.length > 0 || (!p.legacy && scope !== 'personal'))
  const achieved = goals.filter(isAchieved)

  const band = [
    { value: total, label: L('יעדים', 'Goals') },
    { value: `${overallPct}%`, label: L('התקדמות', 'Progress') },
    { value: doneCount, label: L('הושגו', 'Achieved') },
  ]

  const amtRow = (g) => (
    <div className="ps-form">
      <input
        className="ps-in" dir="ltr" inputMode="numeric"
        placeholder={L('כמה ביצעת היום?', 'How much today?')}
        value={amtInput[g.id] || ''}
        onChange={(e) => setAmtInput((m) => ({ ...m, [g.id]: e.target.value.replace(/[^0-9]/g, '') }))}
        onKeyDown={(e) => e.key === 'Enter' && logAmount(g)}
        aria-label={L('כמה ביצעת היום?', 'How much today?')}
      />
      <button type="button" className="ps-add" onClick={() => logAmount(g)} disabled={restricted || !amtInput[g.id]}>
        <Plus size={14} aria-hidden="true" /> {L('רישום', 'Log')}
      </button>
    </div>
  )

  return (
    <Shell {...shellOf({ band: total ? band : null })}>
      {heroGoal && (
        <div className="ps-hero">
          <div className="ps-hero-row">
            <b className="ps-hero-kick">
              {heroPeriod ? L(heroPeriod.label[0], heroPeriod.label[1]) : L('יעד', 'Goal')} · {originTx(heroGoal)}
            </b>
            {heroGoal.due_date && (
              <span className="ps-hero-pill">{L('עד ', 'due ')}{dueLabel(heroGoal.due_date)}</span>
            )}
          </div>
          <b className="ps-hero-title">{heroGoal.title}</b>
          <div className="ps-hero-nums">
            <b className="ps-hero-num" dir="ltr">{heroGoal.progress_value || 0}</b>
            <span className="ps-hero-sub">{L(`מתוך ${heroGoal.target_value} · היעד שלך`, `of ${heroGoal.target_value} · your target`)}</span>
          </div>
          <div className="ps-hero-track"><span className="ps-hero-bar" style={{ inlineSize: `${heroPct}%` }} /></div>
          {heroLogs.length > 0 && (
            <div className="ps-hero-log">
              {heroLogs.map((r, i) => (
                <span key={i} className="ps-hero-cell" dir="ltr">{r.value}</span>
              ))}
              <span className="ps-hero-note">{L('התיעודים האחרונים', 'Your latest logs')}</span>
            </div>
          )}
          <div className="ps-hero-acts">
            <input
              className="ps-hero-in" dir="ltr" inputMode="numeric"
              placeholder={L('כמה היום?', 'Today?')}
              value={amtInput[heroGoal.id] || ''}
              onChange={(e) => setAmtInput((m) => ({ ...m, [heroGoal.id]: e.target.value.replace(/[^0-9]/g, '') }))}
              onKeyDown={(e) => e.key === 'Enter' && logAmount(heroGoal)}
              aria-label={L('כמה ביצעת היום?', 'How much today?')}
            />
            <button type="button" className="ps-hero-btn" onClick={() => logAmount(heroGoal)} disabled={restricted || !amtInput[heroGoal.id]}>
              {L('רישום', 'Log')}
            </button>
            {/* ⚠ גם מינוס, ולא רק פלוס: היעד הזה לא מופיע ברשימה למטה, ולכן
                זו נקודת התיקון היחידה שלו. רישום של 200 במקום 20 היה נתקע. */}
            <button type="button" className="ps-hero-chip" onClick={() => bump(heroGoal, -1)} disabled={restricted} aria-label={L('הפחתת צעד', 'Step down')}>
              <Minus size={14} aria-hidden="true" />
            </button>
            <button type="button" className="ps-hero-chip" onClick={() => bump(heroGoal, 1)} disabled={restricted} aria-label={L('הוספת צעד', 'Add a step')}>
              <Plus size={14} aria-hidden="true" />
            </button>
            <button type="button" className="ps-hero-chip" onClick={() => setOpenId(openId === heroGoal.id ? null : heroGoal.id)}
              aria-expanded={openId === heroGoal.id} aria-controls={`plg-chart-${heroGoal.id}`}>
              <TrendingUp size={14} aria-hidden="true" /> {L('גרף', 'Chart')}
            </button>
            <span className="ps-hero-note">{L('ממלאים אחרי האימון', 'Fill it in after practice')}</span>
          </div>
          {openId === heroGoal.id && (
            <div id={`plg-chart-${heroGoal.id}`} className="ps-hero-done">
              {(logsBy[heroGoal.id] || []).length >= 2
                ? <GoalChart logs={logsBy[heroGoal.id]} target={heroGoal.target_value} goalId={heroGoal.id} />
                : <p className="ps-mut">{L('רשום כמה ביצעת — והגרף יתחיל להתמלא', 'Log your progress — the chart will start filling up')}</p>}
            </div>
          )}
        </div>
      )}

      {total === 0 && (
        <div className="ps-card">
          <div className="ps-empty">
            <span className="ps-empty-ic"><Target size={20} aria-hidden="true" /></span>
            <b>{L('עוד אין יעדים', 'No goals yet')}</b>
            <p>{L('המאמן יגדיר לך יעדים — או שתוכל להוסיף יעד אישי משלך למטה.', 'Your coach will set you goals — or add a personal one below.')}</p>
          </div>
        </div>
      )}

      {/* 1.5 — סדר קבוע לפי טווח, בלי טאבים של סינון.
          ⚠ התווית יושבת **מחוץ** ל-‎.ps-cols: פריט שפורש על כל העמודות בתוך
          הרשת מונע מ-auto-fit לכווץ עמודות ריקות, וטווח עם יעד אחד היה
          משאיר חצי שורה ריקה בדסקטופ. */}
      {groups.map((grp) => (
        <section key={grp.id}>
          <p className="ps-group-lbl">{L(grp.label[0], grp.label[1])}</p>
          {grp.items.length === 0 ? (
            <p className="ps-mut">{L('אין יעדים לטווח הזה עדיין.', 'No goals for this horizon yet.')}</p>
          ) : (
          <div className="ps-cols">
            {grp.items.map((g) => {
            const isCount = !!g.target_value
            const pct = isCount ? Math.min(100, Math.round(((g.progress_value || 0) / g.target_value) * 100)) : (g.status === 'done' ? 100 : 0)
            return (
              <article key={g.id} className="ps-card">
                <div className="ps-card-head">
                  <h2 className="ps-h">{g.title}</h2>
                  <span className="ps-chip ps-chip--acc">
                    {originTx(g)}{g.due_date ? ` · ${L('עד ', 'due ')}${dueLabel(g.due_date)}` : ''}
                  </span>
                </div>
                {isCount && (
                  <>
                    <div className="ps-hero-nums">
                      <b className="ps-num ps-num--acc" dir="ltr">{g.progress_value || 0}</b>
                      <span className="ps-mut">{L(`מתוך ${g.target_value}`, `of ${g.target_value}`)}</span>
                    </div>
                    <div className="ps-track"><span style={{ inlineSize: `${pct}%` }} /></div>
                  </>
                )}
                {/* מיקוד קבוצתי (player_id = null): ה-RLS מתיר לשחקן לעדכן רק את
                    השורות שלו, ולכן +/- ו"סמן שבוצע" היו מסננים 0 שורות ומחזירים
                    204 — הכפתור "עבד" למראית עין וחזר לאחור בטעינה הבאה.
                    את המיקוד הקבוצתי מסמנים בסיכום האימון. */}
                {!g.player_id ? (
                  <p className="ps-mut">{L('מיקוד של כל הקבוצה — סמן אותו בסיכום האימון בסוף האימון.', 'A whole-team focus — mark it in your post-practice summary.')}</p>
                ) : (
                  <>
                    {isCount && amtRow(g)}
                    <div className="ps-steps">
                      {isCount && (
                        <>
                          <button type="button" className="ps-add" onClick={() => bump(g, -1)} disabled={restricted} aria-label={L('הפחתת צעד', 'Step down')}>
                            <Minus size={16} aria-hidden="true" />
                          </button>
                          <button type="button" className="ps-add" onClick={() => bump(g, 1)} disabled={restricted} aria-label={L('הוספת צעד', 'Step up')}>
                            <Plus size={16} aria-hidden="true" />
                          </button>
                        </>
                      )}
                      <button type="button" className="ps-add" onClick={() => toggleDone(g)} disabled={restricted}>
                        <Check size={14} aria-hidden="true" /> {g.status === 'done' ? L('בוצע', 'Done') : L('סמן שבוצע', 'Mark done')}
                      </button>
                    </div>
                  </>
                )}
                {isCount && (
                  <>
                    <button type="button" className="ps-linkrow" onClick={() => setOpenId(openId === g.id ? null : g.id)}
                      aria-expanded={openId === g.id} aria-controls={`plg-chart-${g.id}`}>
                      <TrendingUp size={13} aria-hidden="true" />
                      <span className="ps-grow ps-t13">{L('גרף התקדמות', 'Progress chart')}</span>
                      <ChevronDown size={14} aria-hidden="true" className={openId === g.id ? 'plg2-chev open' : 'plg2-chev'} />
                    </button>
                    {openId === g.id && (
                      <div id={`plg-chart-${g.id}`} className="plg2-prog">
                        {(logsBy[g.id] || []).length >= 2
                          ? <GoalChart logs={logsBy[g.id]} target={g.target_value} goalId={g.id} />
                          : <p className="ps-mut">{L('רשום כמה ביצעת — והגרף יתחיל להתמלא', 'Log your progress — the chart will start filling up')}</p>}
                      </div>
                    )}
                  </>
                )}
              </article>
              )
            })}
          </div>
          )}
        </section>
      ))}

      {achieved.length > 0 && (
        <div className="ps-card">
          <b className="ps-h">{L('היעדים שהושגו', 'Goals achieved')}</b>
          {/* ⚠ השורה לחיצה ומחזירה את היעד לפעיל. בלי זה סימון בטעות היה
              בלתי הפיך: היעד יורד מרשימת הפעילים, ואיתו כל הפקדים שלו. */}
          {achieved.map((g) => {
            const own = !!g.player_id
            const Row = own ? 'button' : 'div'
            return (
              <Row
                key={g.id}
                {...(own ? { type: 'button', onClick: () => toggleDone(g), disabled: restricted, className: 'ps-linkrow ps-row--ok' } : { className: 'ps-row ps-row--ok' })}
              >
                <span className="ps-okdot" aria-hidden="true"><Check size={14} /></span>
                <span className="ps-grow ps-t13b">{g.title}</span>
                <span className="ps-chip ps-chip--ok">{own ? L('הושלם · לביטול', 'Done · tap to undo') : L('הושלם', 'Done')}</span>
              </Row>
            )
          })}
        </div>
      )}

      {/* ⚠ לא בדף המאמן האישי: «יעד חדש» יוצר יעד אישי של השחקן ומשייך
          אותו למאמן **הקבוצה** (membership.coach_id) — כלומר הוא היה
          נשמר ומופיע במסך היעדים הראשי, לא כאן. יעד מהמאמן האישי מגיע
          רק ממנו. */}
      {scope !== 'personal' && (
        <>
          <button type="button" className="ps-btn-ghost" onClick={() => setAddOpen(true)} disabled={restricted}>
            <Plus size={18} aria-hidden="true" /> {L('יעד חדש', 'New goal')}
          </button>
          <AddGoalSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={addGoal} />
        </>
      )}
    </Shell>
  )
}
