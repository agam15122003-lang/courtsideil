import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Target, Plus, Trash2, Check, Minus, X, TrendingUp, ChevronDown } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { sendNotification } from './notify'
import { L } from './i18n'

export const PERIODS = [
  { id: 'session', label: ['לאימון הקרוב', 'Next practice'], short: ['לאימון', 'Session'] },
  { id: 'week', label: ['השבוע', 'This week'], short: ['שבועי', 'Weekly'] },
  { id: 'month', label: ['החודש', 'This month'], short: ['חודשי', 'Monthly'] },
  { id: 'year', label: ['העונה', 'This season'], short: ['שנתי', 'Season'] },
]
const periodShort = (id) => { const p = PERIODS.find((x) => x.id === id); return p ? L(p.short[0], p.short[1]) : id }

// מטרות נפוצות — טאפ אחד מוסיף, בלי להקליד
const GOAL_CHIPS = [
  ['יד שמאל', 'Weak hand'], ['עונשין', 'Free throws'], ['הגנה אישית', '1v1 defense'],
  ['ריבאונד', 'Rebounds'], ['ראיית מגרש', 'Court vision'], ['תקשורת בהגנה', 'Talk on D'],
  ['תנועה בלי כדור', 'Off-ball movement'], ['חיטוט', 'Steals'],
]

// ---------- עורך מטרות (מאמן, בתוך חלון עריכת השחקן) ----------
export function PlayerGoalsEditor({ coachId, playerId, team, playerName }) {
  const [goals, setGoals] = useState(null)
  const [period, setPeriod] = useState('session')
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [unit, setUnit] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('player_goals').select('*').eq('coach_id', coachId).eq('player_id', playerId).order('created_at', { ascending: false })
    setGoals(data || [])
  }, [coachId, playerId])
  useEffect(() => { load() }, [load])

  const insertGoal = async (goalTitle, tv) => {
    if (!goalTitle.trim() || busy) return false
    setBusy(true)
    const { error } = await supabase.from('player_goals').insert({
      coach_id: coachId, player_id: playerId, team,
      period, title: goalTitle.trim(), target_value: tv || null,
      metric_type: tv ? 'count' : 'checkbox',
    })
    setBusy(false)
    if (error) { toast.error(L('ההוספה נכשלה', 'Failed to add')); return false }
    sendNotification({ to: playerId, actor: coachId, type: 'message', content: period === 'session' ? L('המאמן הגדיר לך מטרה לאימון הקרוב 🎯', 'Your coach set you a goal for the next practice 🎯') : L('המאמן הגדיר לך מטרה חדשה 🎯', 'Your coach set you a new goal 🎯'), nav: 'goals' })
    load()
    return true
  }

  const add = async () => {
    const ok = await insertGoal(title, target ? Number(target) : null)
    if (ok) { setTitle(''); setTarget(''); setUnit('') }
  }

  const bump = async (g, delta) => {
    const next = Math.max(0, (g.progress_value || 0) + delta)
    const done = g.target_value ? next >= g.target_value : g.status === 'done'
    await supabase.from('player_goals').update({ progress_value: next, status: done ? 'done' : 'active', updated_at: new Date().toISOString() }).eq('id', g.id)
    if (done && g.status !== 'done') sendNotification({ to: playerId, actor: coachId, type: 'message', content: L('השלמת מטרה! 🎉', 'Goal completed! 🎉'), nav: 'goals' })
    load()
  }
  const toggleDone = async (g) => {
    const done = g.status !== 'done'
    await supabase.from('player_goals').update({ status: done ? 'done' : 'active', updated_at: new Date().toISOString() }).eq('id', g.id)
    if (done) sendNotification({ to: playerId, actor: coachId, type: 'message', content: L('השלמת מטרה! 🎉', 'Goal completed! 🎉'), nav: 'goals' })
    load()
  }
  const del = async (id) => { await supabase.from('player_goals').delete().eq('id', id); load() }

  return (
    <div className="pg-editor">
      <div className="pg-periods">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" className={period === p.id ? 'pg-period on' : 'pg-period'} onClick={() => setPeriod(p.id)}>
            {L(p.short[0], p.short[1])}
          </button>
        ))}
      </div>
      <div className="pg-chips">
        {GOAL_CHIPS.map(([he, en]) => (
          <button key={he} type="button" className="pg-chip" disabled={busy} onClick={() => insertGoal(L(he, en), null)}>
            <Plus size={12} /> {L(he, en)}
          </button>
        ))}
      </div>
      <div className="pg-add">
        <div className="pg-add-row">
          <input className="finder-input" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={L('מטרה משלך... לדוגמה: 200 עונשין', 'Your own goal... e.g. 200 free throws')} maxLength={120} />
          <input className="finder-input pg-target" dir="ltr" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))} placeholder={L('יעד', 'Nr.')} />
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={add} disabled={!title.trim() || busy} aria-label={L('הוסף מטרה', 'Add goal')}><Plus size={15} /></button>
        </div>
      </div>

      {goals && goals.length > 0 && (
        <ul className="pg-list">
          {goals.map((g) => (
            <li key={g.id} className={g.status === 'done' ? 'pg-item done' : 'pg-item'}>
              <div className="pg-item-main">
                <span className="pg-per">{periodShort(g.period)}</span>
                <strong>{g.title}</strong>
                {g.target_value ? <span className="muted small">{g.progress_value || 0}/{g.target_value}{g.unit ? ` ${g.unit}` : ''}</span> : null}
              </div>
              {g.target_value ? (
                <div className="pg-ctl">
                  <button className="icon-btn" onClick={() => bump(g, -1)} aria-label="-"><Minus size={14} /></button>
                  <button className="icon-btn" onClick={() => bump(g, 1)} aria-label="+"><Plus size={14} /></button>
                </div>
              ) : (
                <button className={g.status === 'done' ? 'pg-check on' : 'pg-check'} onClick={() => toggleDone(g)} aria-label={L('הושג', 'Done')}><Check size={14} /></button>
              )}
              <button className="icon-btn danger" onClick={() => del(g.id)} aria-label={L('מחק', 'Delete')}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const periodTag = (id) => { const p = PERIODS.find((x) => x.id === id); return p ? L(p.short[0], p.short[1]) : '' }

// ---------- גיליון "מטרה חדשה" (השחקן מוסיף מטרה אישית) ----------
function AddGoalSheet({ open, onClose, onAdd }) {
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    const ok = await onAdd(title.trim(), target ? Math.max(1, parseInt(target, 10)) : null)
    setBusy(false)
    if (ok) { setTitle(''); setTarget(''); onClose() }
  }

  if (!open) return null
  return createPortal(
    <div className="fbs-scrim" onClick={onClose}>
      <div className="fbs-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={L('מטרה חדשה', 'New goal')}>
        <span className="fbs-grip" />
        <button className="fbs-x" onClick={onClose} aria-label={L('סגור', 'Close')}><X size={18} /></button>
        <div className="fbs-title">{L('מטרה חדשה', 'New goal')}</div>
        <div className="fbs-sub">{L('הגדר יעד אישי למעקב', 'Set a personal target to track')}</div>
        <div className="fbs-q">{L('שם המטרה', 'Goal name')}</div>
        <input className="plg2-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
          placeholder={L('למשל: 100 זריקות ליום', 'e.g. 100 shots a day')} />
        <div className="fbs-q">{L('יעד (מספר) — לא חובה', 'Target (number) — optional')}</div>
        <input className="plg2-input" dir="ltr" inputMode="numeric" value={target}
          onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))} placeholder={L('למשל: 100', 'e.g. 100')} />
        <button className="fbs-send" onClick={submit} disabled={!title.trim() || busy}>
          <Plus size={18} /> {busy ? L('מוסיף…', 'Adding…') : L('הוסף מטרה', 'Add goal')}
        </button>
      </div>
    </div>,
    document.body
  )
}

// גרף התקדמות למטרה ספציפית — קו+שטח של ההתקדמות לאורך זמן, עם קו יעד מקווקו
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

// ---------- מסך המטרות של השחקן — עם תיעוד עצמי ----------
export function MyGoals({ session, membership }) {
  const [goals, setGoals] = useState(null)
  const [logsBy, setLogsBy] = useState({})
  const [openId, setOpenId] = useState(null)
  const [amtInput, setAmtInput] = useState({})
  const [addOpen, setAddOpen] = useState(false)
  const me = session.user.id

  const load = useCallback(async () => {
    const { data } = await supabase.from('player_goals').select('*').order('created_at', { ascending: false })
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
    setGoals((cur) => cur.map((x) => x.id === g.id ? { ...x, progress_value: next, status: done ? 'done' : 'active' } : x))
    await supabase.from('player_goals').update({ progress_value: next, status: done ? 'done' : 'active', updated_at: new Date().toISOString() }).eq('id', g.id)
    await recordLog(g.id, next)
    if (done && g.status !== 'done') toast.success(L('הושלמה מטרה! 🎉', 'Goal completed! 🎉'))
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
    setGoals((cur) => cur.map((x) => x.id === g.id ? { ...x, status: done ? 'done' : 'active' } : x))
    await supabase.from('player_goals').update({ status: done ? 'done' : 'active', updated_at: new Date().toISOString() }).eq('id', g.id)
    if (done) toast.success(L('כל הכבוד! 💪', 'Nice! 💪'))
  }

  const addGoal = async (title, target) => {
    const { error } = await supabase.from('player_goals').insert({
      coach_id: membership?.coach_id, player_id: me, team: membership?.team || null,
      period: 'week', title, target_value: target, metric_type: target ? 'count' : 'checkbox',
    })
    if (error) { toast.error(L('ההוספה נכשלה', 'Failed to add')); return false }
    toast.success(L('המטרה נוספה', 'Goal added'))
    load()
    return true
  }

  if (goals === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>

  const total = goals.length
  const inProg = goals.filter((g) => goalFrac(g) < 1).length
  const overallPct = total ? Math.round(goals.reduce((a, g) => a + goalFrac(g), 0) / total * 100) : 0

  return (
    <div className="pl-screen pl-narrow">
      <header className="pl-head tone-orange">
        <span className="pl-head-ic"><Target size={22} /></span>
        <div className="pl-head-txt">
          <h2>{L('המטרות שלי', 'My goals')}</h2>
          <p>{total === 0 ? L('היעדים שלך — מהמאמן וגם שלך', 'Your targets — from your coach and your own')
            : inProg > 0 ? L(`${inProg} מתוך ${total} מטרות בתהליך`, `${inProg} of ${total} goals in progress`)
            : L('כל המטרות הושלמו — כל הכבוד 🎉', 'All goals complete — nice work 🎉')}</p>
        </div>
      </header>

      {total > 0 && (
        <div className="plg2-hero">
          <span className="plg2-hero-glow" aria-hidden="true" />
          <span className="plg2-hero-lbl">{L('התקדמות כללית', 'Overall progress')}</span>
          <strong className="plg2-hero-pct">{overallPct}%</strong>
          <div className="plg2-hero-bar"><span style={{ width: `${overallPct}%` }} /></div>
        </div>
      )}

      {total === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><Target size={26} /></span>
          <div className="empty-title">{L('עוד אין מטרות', 'No goals yet')}</div>
          <p className="muted small">{L('המאמן יגדיר לך מטרות — או שתוכל להוסיף מטרה אישית משלך למטה.', 'Your coach will set you goals — or add a personal one below.')}</p>
        </div>
      ) : (
        <ul className="plg2-list">
          {goals.map((g) => {
            const isCount = !!g.target_value
            const pct = isCount ? Math.min(100, Math.round(((g.progress_value || 0) / g.target_value) * 100)) : (g.status === 'done' ? 100 : 0)
            const isDone = goalFrac(g) >= 1
            return (
              <li key={g.id} className={isDone ? 'plg2-card done' : 'plg2-card'}>
                <div className="plg2-top">
                  <div className="plg2-title">
                    <strong>{g.title}</strong>
                    <span className="plg2-tag">{periodTag(g.period)}{!g.player_id ? ` · ${L('קבוצתי', 'Team')}` : ''}</span>
                  </div>
                  {isDone
                    ? <span className="plg2-donepill"><Check size={12} /> {L('הושלם', 'Done')}</span>
                    : isCount ? <span className="plg2-pct">{pct}%</span> : null}
                </div>
                <div className="plg2-bar"><span className={isDone ? 'done' : ''} style={{ width: `${pct}%` }} /></div>
                <div className="plg2-log">
                  {isCount ? (
                    <div className="plg2-step">
                      <button className="plg2-step-btn minus" onClick={() => bump(g, -1)} aria-label="-"><Minus size={16} /></button>
                      <span className="plg2-count"><b>{g.progress_value || 0}</b> / {g.target_value}</span>
                      <button className="plg2-step-btn plus" onClick={() => bump(g, 1)} aria-label="+"><Plus size={16} /></button>
                    </div>
                  ) : <span />}
                  <button className={g.status === 'done' ? 'plg2-donebtn on' : 'plg2-donebtn'} onClick={() => toggleDone(g)}>
                    <Check size={14} /> {g.status === 'done' ? L('בוצע', 'Done') : L('סמן שבוצע', 'Mark done')}
                  </button>
                </div>

                {isCount && (
                  <button className="plg2-more" onClick={() => setOpenId(openId === g.id ? null : g.id)} aria-expanded={openId === g.id}>
                    <TrendingUp size={13} /> {L('גרף התקדמות', 'Progress chart')}
                    <ChevronDown size={14} className={openId === g.id ? 'plg2-chev open' : 'plg2-chev'} />
                  </button>
                )}
                {isCount && openId === g.id && (
                  <div className="plg2-prog">
                    {(logsBy[g.id] || []).length >= 2
                      ? <GoalChart logs={logsBy[g.id]} target={g.target_value} goalId={g.id} />
                      : <p className="muted small plg2-prog-empty">{L('רשום כמה ביצעת — והגרף יתחיל להתמלא 📈', 'Log your progress — the chart will start filling up 📈')}</p>}
                    <div className="plg2-amt">
                      <input className="plg2-amt-input" dir="ltr" inputMode="numeric"
                        placeholder={L('כמה ביצעת?', 'How much?')}
                        value={amtInput[g.id] || ''}
                        onChange={(e) => setAmtInput((m) => ({ ...m, [g.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                        onKeyDown={(e) => e.key === 'Enter' && logAmount(g)} />
                      <button className="plg2-amt-btn" onClick={() => logAmount(g)} disabled={!amtInput[g.id]}>
                        <Plus size={14} /> {L('רישום', 'Log')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <button className="plg2-add" onClick={() => setAddOpen(true)}>
        <Plus size={18} /> {L('מטרה חדשה', 'New goal')}
      </button>

      <AddGoalSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={addGoal} />
    </div>
  )
}
