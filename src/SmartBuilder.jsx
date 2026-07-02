import { useState } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { AGE_GROUPS, DRILL_CATEGORIES } from './constants'
import { L, tr, trTeam } from './i18n'
import MultiSelect from './MultiSelect'
import Button from './ui/Button'

const DEFAULT_DRILL_MINUTES = 10 // משך ברירת מחדל לתרגיל בלי משך מוגדר

// ערבוב רשימה (לגיוון בכל בנייה)
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// בנאי אימון חכם — מרכיב תוכנית אוטומטית מהתרגילים בספרייה לפי קריטריונים.
// props:
//   session         - המשתמש המחובר
//   onCreated(id)    - נקרא אחרי יצירת תוכנית (פותח אותה)
//   onCancel         - חזרה
export default function SmartBuilder({ session, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [ageGroup, setAgeGroup] = useState('')
  const [cats, setCats] = useState([])
  const [targetMinutes, setTargetMinutes] = useState('60')
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // סיכום הבנייה — { planId, count, minutes, target }

  const toggleCat = (c) => {
    setCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))
  }

  const build = async () => {
    setError(null)
    const target = Number(targetMinutes) || 0
    if (!name.trim()) {
      setError(L('יש לתת שם לתוכנית.', 'Please give the plan a name.'))
      return
    }
    if (target <= 0) {
      setError(L('יש להזין זמן יעד בדקות.', 'Please enter a target time in minutes.'))
      return
    }

    setBuilding(true)

    // 1) טוען את כל התרגילים
    const { data: drills, error: dErr } = await supabase
      .from('drills')
      .select('id, age_groups, category, duration_minutes')
    if (dErr) {
      setError(L('שגיאה בטעינת תרגילים: ', 'Failed to load drills: ') + dErr.message)
      setBuilding(false)
      return
    }

    // 2) מסננים לפי שכבת גיל ונושאים
    let pool = (drills || []).filter((d) => {
      const ageOk = !ageGroup || (d.age_groups || []).includes(ageGroup)
      const catOk = cats.length === 0 || cats.includes(d.category)
      return ageOk && catOk
    })

    if (pool.length === 0) {
      setError(L('לא נמצאו תרגילים שמתאימים לסינון. נסה פחות מסננים, או הוסף תרגילים לספרייה.', 'No drills match the filters. Try fewer filters, or add drills to the library.'))
      setBuilding(false)
      return
    }

    // 3) בוחרים תרגילים (בערבוב) עד שמגיעים לזמן היעד
    pool = shuffle(pool)
    const chosen = []
    let totalMin = 0
    for (const d of pool) {
      if (totalMin >= target) break
      chosen.push(d)
      totalMin += d.duration_minutes || DEFAULT_DRILL_MINUTES
    }

    // 4) יוצרים את התוכנית
    const { data: plan, error: pErr } = await supabase
      .from('training_plans')
      .insert({ name: name.trim(), created_by: session.user.id })
      .select()
      .single()
    if (pErr) {
      setError(L('יצירת התוכנית נכשלה: ', 'Failed to create plan: ') + pErr.message)
      setBuilding(false)
      return
    }

    // 5) מוסיפים את התרגילים שנבחרו (בבת אחת)
    const rows = chosen.map((d, i) => ({
      plan_id: plan.id,
      drill_id: d.id,
      position: i,
      duration_minutes: d.duration_minutes || null,
      note: null,
    }))
    const { error: iErr } = await supabase.from('plan_items').insert(rows)
    setBuilding(false)
    if (iErr) {
      setError(L('הוספת התרגילים נכשלה: ', 'Failed to add drills: ') + iErr.message)
      return
    }

    // סיכום תוצאה — שקיפות (כמה תרגילים, כמה דקות מול היעד).
    // במקום לקפוץ ישר לתוכנית מציגים שורת סיכום, והמאמן פותח כשהוא מוכן.
    toast.success(L(`נבנו ${chosen.length} תרגילים · כ-${totalMin} דקות`, `Built ${chosen.length} drills · about ${totalMin} min`))
    setResult({ planId: plan.id, count: chosen.length, minutes: totalMin, target })
  }

  return (
    <div className="welcome-card">
      <button className="link-button" onClick={onCancel}>
        <ArrowRight size={15} className="back-ic" /> {L('חזרה לתוכניות', 'Back to plans')}
      </button>

      <div className="welcome-badge" style={{ marginTop: 14 }}>
        {L('בנאי אימון חכם', 'Smart Practice Builder')}
      </div>
      <h2>{L('בנה לי אימון', 'Build me a practice')}</h2>
      <p className="muted small">
        {L('בחר קריטריונים, והמערכת תרכיב אימון אוטומטית מהתרגילים בספרייה.', 'Pick your criteria and the system will auto-build a practice from your drill library.')}
      </p>

      {result ? (
        /* סיכום קומפקטי אחרי הבנייה — כמה תרגילים ודקות יצאו מול היעד */
        <div className="sb-result" role="status">
          <div className="alert alert-success sb-result-line">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>
              {L(
                `נבנו ${result.count} תרגילים · כ-${result.minutes} דקות (יעד: ${result.target} דקות)`,
                `Built ${result.count} drills · about ${result.minutes} min (target: ${result.target} min)`
              )}
            </span>
          </div>
          {result.minutes < result.target && (
            <p className="muted small">
              {L('האימון קצר מהיעד — לא נמצאו מספיק תרגילים מתאימים. אפשר להוסיף ידנית בתוך התוכנית.', 'The practice is shorter than the target — not enough matching drills. You can add more manually inside the plan.')}
            </p>
          )}
          <div className="form-actions">
            <Button onClick={() => onCreated(result.planId)}>
              {L('פתח את התוכנית', 'Open the plan')}
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              {L('בנה אימון נוסף', 'Build another')}
            </Button>
          </div>
        </div>
      ) : (
      <form
        className="auth-form"
        style={{ marginTop: 20 }}
        onSubmit={(e) => {
          e.preventDefault()
          build()
        }}
      >
        <label>
          {L('שם התוכנית', 'Plan name')}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={L('לדוגמה: אימון אוטומטי לנוער', 'e.g. Auto practice for juniors')}
            required
          />
        </label>

        <label>
          {L('זמן יעד (דקות)', 'Target time (min)')}
          <input
            type="number"
            min="5"
            dir="ltr"
            value={targetMinutes}
            onChange={(e) => setTargetMinutes(e.target.value)}
          />
        </label>

        <div className="field-group">
          <span className="field-label">{L('שכבת גיל (לא חובה)', 'Age group (optional)')}</span>
          <div className="chips">
            {AGE_GROUPS.map((g) => (
              <button
                type="button"
                key={g}
                className={ageGroup === g ? 'chip selected' : 'chip'}
                onClick={() => setAgeGroup(ageGroup === g ? '' : g)}
              >
                {trTeam(g)}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">{L('נושאים (לא חובה)', 'Topics (optional)')}</span>
          <MultiSelect
            options={DRILL_CATEGORIES}
            selected={cats}
            onToggle={toggleCat}
            renderLabel={tr}
            placeholder={L('כל הנושאים', 'All topics')}
          />
        </div>

        {/* שגיאות ולידציה/שרת — מעל כפתור הבנייה, בדיוק איפה שהעין נמצאת (ממצא #23) */}
        {error && (
          <div className="alert alert-error sb-error" role="alert">
            {error}
          </div>
        )}

        <div className="form-actions">
          <Button type="submit" loading={building}>
            {building ? L('בונה...', 'Building...') : L('בניית אימון', 'Build practice')}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={building}>
            {L('ביטול', 'Cancel')}
          </Button>
        </div>
      </form>
      )}
    </div>
  )
}
