import { useState, useEffect, useCallback } from 'react'
import { Target, Plus, Trash2, Check, Minus, Trophy, CalendarRange } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { sendNotification } from './notify'
import { L } from './i18n'

export const PERIODS = [
  { id: 'week', label: ['השבוע', 'This week'], short: ['שבועי', 'Weekly'] },
  { id: 'month', label: ['החודש', 'This month'], short: ['חודשי', 'Monthly'] },
  { id: 'year', label: ['העונה', 'This season'], short: ['שנתי', 'Season'] },
]
const periodShort = (id) => { const p = PERIODS.find((x) => x.id === id); return p ? L(p.short[0], p.short[1]) : id }

// ---------- עורך מטרות (מאמן, בתוך חלון עריכת השחקן) ----------
export function PlayerGoalsEditor({ coachId, playerId, team, playerName }) {
  const [goals, setGoals] = useState(null)
  const [period, setPeriod] = useState('week')
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [unit, setUnit] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('player_goals').select('*').eq('coach_id', coachId).eq('player_id', playerId).order('created_at', { ascending: false })
    setGoals(data || [])
  }, [coachId, playerId])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    const tv = target ? Number(target) : null
    const { error } = await supabase.from('player_goals').insert({
      coach_id: coachId, player_id: playerId, team,
      period, title: title.trim(), target_value: tv, unit: unit.trim() || null,
      metric_type: tv ? 'count' : 'checkbox',
    })
    setBusy(false)
    if (error) { toast.error(L('ההוספה נכשלה', 'Failed to add')); return }
    setTitle(''); setTarget(''); setUnit('')
    sendNotification({ to: playerId, actor: coachId, type: 'message', content: L('המאמן הגדיר לך מטרה חדשה 🎯', 'Your coach set you a new goal 🎯'), nav: 'goals' })
    load()
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
      <span className="field-label"><Target size={15} /> {L('מטרות אישיות', 'Personal goals')}</span>
      <div className="pg-add">
        <div className="pg-add-row">
          <select className="finder-input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ maxWidth: 120 }}>
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{L(p.short[0], p.short[1])}</option>)}
          </select>
          <input className="finder-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L('לדוגמה: 200 עונשין', 'e.g. 200 free throws')} maxLength={120} />
        </div>
        <div className="pg-add-row">
          <input className="finder-input" dir="ltr" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))} placeholder={L('יעד (מספר, לא חובה)', 'Target (number, optional)')} style={{ maxWidth: 160 }} />
          <input className="finder-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={L('יחידה (זריקות/אימונים...)', 'Unit (shots/practices...)')} maxLength={20} />
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={add} disabled={!title.trim() || busy}><Plus size={15} /></button>
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

// ---------- מסך המטרות של השחקן ----------
export function MyGoals({ session, membership }) {
  const [goals, setGoals] = useState(null)

  useEffect(() => {
    ;(async () => {
      let q = supabase.from('player_goals').select('*').order('created_at', { ascending: false })
      // RLS מחזיר את המטרות האישיות של השחקן + מטרות לכל הקבוצה שלו
      const { data } = await q
      setGoals(data || [])
    })()
  }, [session.user.id])

  if (goals === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>
  const done = goals.filter((g) => g.status === 'done').length
  const total = goals.length
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <div className="pl-screen pl-narrow">
      <header className="pl-head tone-orange">
        <span className="pl-head-ic"><Target size={22} /></span>
        <div className="pl-head-txt">
          <h2>{L('המטרות שלי', 'My goals')}</h2>
          <p>{L('היעדים שהמאמן הציב לך — שבועי, חודשי ועונתי', 'Targets your coach set — weekly, monthly and season')}</p>
        </div>
        {total > 0 && (
          <div className="pl-goal-sum">
            <b>{done}<i>/{total}</i></b>
            <span>{L('הושגו', 'done')}</span>
          </div>
        )}
      </header>

      {total > 0 && (
        <div className="pl-goal-progress">
          <div className="pl-goal-progress-bar"><span style={{ width: `${pct}%` }} /></div>
          <span className="muted small">{pct}% {L('מהמטרות הושלמו', 'of goals completed')}</span>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><Target size={26} /></span>
          <div className="empty-title">{L('עוד אין מטרות', 'No goals yet')}</div>
          <p className="muted small">{L('המאמן יגדיר לך מטרות שבועיות, חודשיות ועונתיות — הן יופיעו כאן.', 'Your coach will set you weekly, monthly and season goals — they show up here.')}</p>
        </div>
      ) : (
        <>
          {PERIODS.map((p) => {
            const list = goals.filter((g) => g.period === p.id)
            if (list.length === 0) return null
            return (
              <section className="pl-block" key={p.id}>
                <p className="pl-section-label"><CalendarRange size={15} /> {L(p.label[0], p.label[1])}</p>
                <ul className="pl-goals">
                  {list.map((g) => {
                    const pct = g.target_value ? Math.min(100, Math.round(((g.progress_value || 0) / g.target_value) * 100)) : (g.status === 'done' ? 100 : 0)
                    const isDone = g.status === 'done'
                    return (
                      <li key={g.id} className={isDone ? 'pl-goal done' : 'pl-goal'}>
                        <span className="pl-goal-ic">{isDone ? <Trophy size={18} /> : <Target size={18} />}</span>
                        <div className="pl-goal-body">
                          <strong>{g.title}</strong>
                          {g.target_value ? (
                            <>
                              <div className="pl-goal-bar"><span style={{ width: `${pct}%` }} /></div>
                              <span className="muted small">{g.progress_value || 0}/{g.target_value}{g.unit ? ` ${g.unit}` : ''}{isDone ? ` · ${L('הושג! 🎉', 'Done! 🎉')}` : ''}</span>
                            </>
                          ) : (
                            <span className="muted small">{isDone ? L('הושג! 🎉', 'Done! 🎉') : L('בתהליך', 'In progress')}</span>
                          )}
                        </div>
                        {!g.player_id && <span className="pl-goal-team">{L('קבוצתי', 'Team')}</span>}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
