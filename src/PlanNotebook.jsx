import { useState, useEffect, useRef } from 'react'
import { Plus, X, Clock, Target, Users, Check, ArrowRight, GripVertical } from 'lucide-react'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { L } from './i18n'

// יצירת תוכנית אימון על "מחברת המאמן" — כותבים ישר על הדף, כמו יצירת תרגיל,
// אבל לתוכנית מלאה: שם, מיקוד, קבוצה, ורשימת חלקי האימון (שם + דקות) על שורות המחברת.
// props:
//   session  - המשתמש המחובר
//   onDone(planId) - נקרא אחרי יצירה מוצלחת (נכנסים לבנייה המלאה)
//   onCancel - חזרה לרשימה
export default function PlanNotebook({ session, onDone, onCancel }) {
  const me = session.user.id
  const DRAFT_KEY = 'plan-notebook-draft-v1'

  const [name, setName] = useState('')
  const [team, setTeam] = useState('')
  const [focus, setFocus] = useState('')
  // כל שורה: חלק באימון — שם + דקות (name ריק = שורה שעדיין לא מולאה)
  const [segments, setSegments] = useState([{ name: '', min: '' }, { name: '', min: '' }, { name: '', min: '' }])
  const [saving, setSaving] = useState(false)
  const [coach, setCoach] = useState({ club: '', name: '' })

  // פרטי המאמן לכותרת הדף
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) return
      const { data: p } = await supabase
        .from('profiles').select('first_name, last_name, club').eq('id', data.user.id).single()
      if (alive && p) setCoach({ club: p.club || '', name: `${p.first_name || ''} ${p.last_name || ''}`.trim() })
    })()
    return () => { alive = false }
  }, [])

  // ---- טיוטה: יציאה מהעמוד לא מוחקת את מה שכתבת ----
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (d && (d.name || (d.segments || []).some((s) => s.name))) {
        setName(d.name || '')
        setTeam(d.team || '')
        setFocus(d.focus || '')
        if (d.segments?.length) setSegments(d.segments)
        toast.success(L('הטיוטה שוחזרה — המשך מאיפה שהפסקת', 'Draft restored — pick up where you left off'))
      }
    } catch { /* טיוטה פגומה — מתעלמים */ }
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (name.trim() || segments.some((s) => s.name.trim())) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, team, focus, segments }))
        }
      } catch { /* אחסון מלא — לא קריטי */ }
    }, 400)
    return () => clearTimeout(t)
  }, [name, team, focus, segments])

  const setSeg = (i, key, val) =>
    setSegments((cur) => cur.map((s, x) => (x === i ? { ...s, [key]: val } : s)))
  const addSeg = () => setSegments((cur) => [...cur, { name: '', min: '' }])
  const removeSeg = (i) => setSegments((cur) => cur.length > 1 ? cur.filter((_, x) => x !== i) : cur)
  const moveSeg = (i, dir) => setSegments((cur) => {
    const j = i + dir
    if (j < 0 || j >= cur.length) return cur
    const next = [...cur]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const filled = segments.filter((s) => s.name.trim())
  const totalMin = filled.reduce((sum, s) => sum + (Number(s.min) || 0), 0)

  const dateLabel = new Date().toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric', year: 'numeric' })

  const save = async () => {
    if (!name.trim()) { toast.error(L('תנו שם לתוכנית', 'Give the plan a name')); return }
    setSaving(true)
    // 1) יוצרים את התוכנית
    const { data: plan, error } = await supabase
      .from('training_plans')
      .insert({ name: name.trim(), created_by: me })
      .select('id').single()
    if (error || !plan) {
      setSaving(false)
      toast.error(L('יצירת התוכנית נכשלה: ', 'Failed to create plan: ') + (error?.message || ''))
      return
    }
    // 2) כל חלק שמולא הופך לפריט בתוכנית (פריט חופשי — שם + משך + מיקוד כהערה)
    if (filled.length) {
      const rows = filled.map((s, i) => ({
        plan_id: plan.id,
        position: i,
        title: s.name.trim(),
        duration_minutes: s.min ? Number(s.min) : null,
        note: i === 0 && focus.trim() ? L(`מיקוד: ${focus.trim()}`, `Focus: ${focus.trim()}`) : null,
      }))
      const { error: e2 } = await supabase.from('plan_items').insert(rows)
      if (e2 && !/column .* does not exist/i.test(e2.message)) {
        // גיבוי: אם עמודת title לא קיימת ב-plan_items — יוצרים בלי כותרת (רק משך)
        await supabase.from('plan_items').insert(
          filled.map((s, i) => ({ plan_id: plan.id, position: i, duration_minutes: s.min ? Number(s.min) : null }))
        )
      }
    }
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* לא קריטי */ }
    setSaving(false)
    toast.success(L('התוכנית נוצרה — אפשר להוסיף תרגילים מהספרייה', 'Plan created — add library drills next'))
    onDone(plan.id)
  }

  return (
    <div className="welcome-card">
      <button className="link-button" onClick={onCancel}>
        <ArrowRight size={15} className="back-ic" /> {L('כל התוכניות', 'All plans')}
      </button>

      <div className="drillform-head" style={{ marginTop: 6 }}>
        <h2 style={{ margin: 0 }}>{L('תוכנית אימון חדשה', 'New practice plan')}</h2>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {L('כותבים את מבנה האימון ישר על המחברת — אחר כך אפשר להוסיף תרגילים מהספרייה לכל חלק.', 'Write the practice outline straight on the notebook — then add library drills to each part.')}
      </p>

      {/* המחברת */}
      <div className="notebook nb-edit" dir="rtl" style={{ marginTop: 16 }}>
        <div className="nb-header">
          <div className="nb-header-top">
            <span className="nb-club">{coach.club || 'CourtSide'}</span>
            <span className="nb-date">{dateLabel}</span>
          </div>
          <h2 className="nb-title">{L('מערך אימון', 'Practice Plan')}</h2>
          {coach.name && <div className="nb-coach">{L('שם המאמן: ', 'Coach: ')}{coach.name}</div>}
        </div>

        <div className="nb-edit-body">
          <input
            className="nb-write nb-write-title"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={L('שם התוכנית...', 'Plan name...')}
            aria-label={L('שם התוכנית', 'Plan name')}
            maxLength={120}
          />

          <div className="nb-edit-meta">
            <label className="nb-slot">
              <Users size={14} aria-hidden="true" />
              <span className="nb-slot-k">{L('קבוצה', 'Team')}</span>
              <input
                className="nb-write nb-slot-in"
                type="text"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder={L('נוער / נערים...', 'Juniors / youth...')}
                aria-label={L('קבוצה', 'Team')}
              />
            </label>
            <label className="nb-slot">
              <Clock size={14} aria-hidden="true" />
              <span className="nb-slot-k">{L('סה"כ', 'Total')}</span>
              <span className="nb-slot-in" style={{ borderBottom: 'none' }}>
                <bdi>{totalMin}</bdi> {L("דק'", 'min')}
              </span>
            </label>
          </div>

          <label className="nb-slot nb-goal">
            <Target size={15} aria-hidden="true" />
            <span className="nb-slot-k">{L('מיקוד האימון', 'Practice focus')}</span>
            <input
              className="nb-write nb-slot-in nb-grow"
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder={L('מה המטרה המרכזית של האימון...', 'The main goal of this practice...')}
              aria-label={L('מיקוד האימון', 'Practice focus')}
            />
          </label>

          {/* חלקי האימון — שורות ממוספרות על המחברת */}
          <div className="nb-writeblock">
            <div className="nb-writeblock-h">{L('מבנה האימון', 'Practice structure')}</div>
            <ul className="pn-segs">
              {segments.map((s, i) => (
                <li key={i} className="pn-seg">
                  <span className="pn-seg-n">{i + 1}</span>
                  <input
                    className="nb-write pn-seg-name"
                    type="text"
                    value={s.name}
                    onChange={(e) => setSeg(i, 'name', e.target.value)}
                    placeholder={L('חלק באימון — למשל: חימום ומסירות', 'Practice part — e.g. warm-up & passing')}
                    aria-label={L(`חלק ${i + 1}`, `Part ${i + 1}`)}
                  />
                  <input
                    className="nb-write pn-seg-min"
                    type="number"
                    min="0"
                    dir="ltr"
                    value={s.min}
                    onChange={(e) => setSeg(i, 'min', e.target.value)}
                    placeholder="10"
                    aria-label={L(`דקות לחלק ${i + 1}`, `Minutes for part ${i + 1}`)}
                  />
                  <span className="pn-seg-unit">{L("דק'", 'min')}</span>
                  <span className="pn-seg-tools">
                    <button type="button" onClick={() => moveSeg(i, -1)} disabled={i === 0} aria-label={L('הזז מעלה', 'Move up')}>↑</button>
                    <button type="button" onClick={() => moveSeg(i, 1)} disabled={i === segments.length - 1} aria-label={L('הזז מטה', 'Move down')}>↓</button>
                    <button type="button" onClick={() => removeSeg(i)} aria-label={L('הסר חלק', 'Remove part')} className="pn-seg-del"><X size={13} /></button>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-soft pn-add" onClick={addSeg}>
              <Plus size={15} /> {L('הוספת חלק', 'Add part')}
            </button>
          </div>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={save} disabled={saving || !name.trim()} aria-busy={saving}>
          {saving ? <span className="btn-spinner" aria-hidden="true" /> : <Check size={16} />}
          {saving ? L('יוצר...', 'Creating...') : L('יצירת התוכנית והוספת תרגילים', 'Create & add drills')}
        </button>
        <button className="btn-ghost" onClick={onCancel} disabled={saving}>
          {L('ביטול', 'Cancel')}
        </button>
      </div>
    </div>
  )
}
