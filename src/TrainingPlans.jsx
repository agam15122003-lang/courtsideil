import { toast } from './toast'
import { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, ClipboardList, ArrowRight, BookOpen, Printer, Pencil, ListChecks, Clock, Globe2 } from 'lucide-react'
import { supabase } from './supabaseClient'
import PlanRunner from './PlanRunner'
import SmartBuilder from './SmartBuilder'
import NotebookPage from './NotebookPage'
import { SkeletonCards } from './Skeleton'
import { L, tr, trTeam } from './i18n'
import { safeUrl } from './constants'

// ממיר פריטי תוכנית לפורמט "דף מחברת" (כותרת, פרטים, הערה, ולוח טקטיקה לאנימציה)
export function planToNotebook(name, items) {
  return {
    name,
    parts: [
      {
        title: L('תרגילי האימון', 'Practice drills'),
        items: items.map((it) => {
          const d = it.drill || {}
          const bits = []
          if (it.duration_minutes) bits.push(L(`${it.duration_minutes} דק׳`, `${it.duration_minutes} min`))
          if (d.category) bits.push(tr(d.category))
          if (d.equipment) bits.push(L(`ציוד: ${d.equipment}`, `Equipment: ${d.equipment}`))
          if (d.players) bits.push(L(`שחקנים: ${d.players}`, `Players: ${d.players}`))
          return {
            title: d.title || it.title || L('תרגיל', 'Drill'),
            meta: bits.join(' · '),
            note: it.note || d.description || '',
            board: d.board || null,
          }
        }),
      },
    ],
  }
}

// בריחה מתווים מיוחדים כדי לבנות HTML בטוח להדפסה
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  )
}

// טאב "תוכניות" — רשימת תוכניות האימון של המאמן, ובתוך כל תוכנית
// בונה שמרכיב אימון מתרגילים ברצף (סדר, משך והערה לכל תרגיל),
// ולחיצה על תרגיל חושפת את כל הפרטים שלו.
// props:
//   session - המשתמש המחובר
export default function TrainingPlans({ session }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activePlanId, setActivePlanId] = useState(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [smartOpen, setSmartOpen] = useState(false) // בנאי אימון חכם
  const [viewingPlan, setViewingPlan] = useState(null) // תוכנית קהילה בתצוגת מחברת
  const me = session.user.id

  // העתקת תוכנית ששותפה אל "התוכניות שלי"
  const copyPlan = async (plan) => {
    const { data: pis, error: e1 } = await supabase
      .from('plan_items')
      .select('drill_id, position, duration_minutes, note, title, description')
      .eq('plan_id', plan.id)
      .order('position')
    if (e1) {
      toast.error(L('שגיאה: ', 'Error: ') + e1.message)
      return
    }
    const { data: np, error: e2 } = await supabase
      .from('training_plans')
      .insert({ name: plan.name + L(' (עותק)', ' (copy)'), created_by: me })
      .select()
      .single()
    if (e2) {
      toast.error(L('שגיאה: ', 'Error: ') + e2.message)
      return
    }
    if (pis && pis.length) {
      const rows = pis.map((it) => ({ ...it, plan_id: np.id }))
      const { error: e3 } = await supabase.from('plan_items').insert(rows)
      if (e3) {
        toast.error(L('שגיאה: ', 'Error: ') + e3.message)
        return
      }
    }
    toast.success(L('התוכנית הועתקה אל "התוכניות שלי".', 'Plan copied to "My Plans".'))
    setViewingPlan(null)
    loadPlans()
    setActivePlanId(np.id)
  }

  async function loadPlans() {
    setLoading(true)
    const { data, error } = await supabase
      .from('training_plans')
      .select('*, plan_items(id, duration_minutes)')
      .order('created_at', { ascending: false })
    if (error) {
      setError(L('שגיאה בטעינת התוכניות: ', 'Failed to load plans: ') + error.message)
    } else {
      setPlans(data || [])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadPlans()
  }, [])

  const createPlan = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const { data, error } = await supabase
      .from('training_plans')
      .insert({ name: newName.trim(), created_by: session.user.id })
      .select()
      .single()
    setCreating(false)
    if (error) {
      toast.error(L('יצירת התוכנית נכשלה: ', 'Failed to create plan: ') + error.message)
      return
    }
    setNewName('')
    toast.success(L('התוכנית נוצרה', 'Plan created'))
    await loadPlans()
    setActivePlanId(data.id) // נכנסים ישר לבנייה
  }

  const deletePlan = async (id) => {
    if (!window.confirm(L('למחוק את התוכנית? פעולה זו אינה הפיכה.', 'Delete this plan? This cannot be undone.'))) return
    const { error } = await supabase.from('training_plans').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
      return
    }
    toast.success(L('התוכנית נמחקה', 'Plan deleted'))
    loadPlans()
  }

  // שיתוף/ביטול שיתוף תוכנית לקהילה
  const toggleShare = async (p) => {
    const sharing = !p.is_public
    const { error } = await supabase
      .from('training_plans')
      .update({ is_public: sharing })
      .eq('id', p.id)
    if (error) {
      toast.error(L('העדכון נכשל: ', 'Update failed: ') + error.message)
      return
    }
    // כששיתפנו — מפרסמים גם את התרגילים שבתוכנית (שלי), כדי שהתוכן המלא
    // (שרטוטים, אנימציה, תיאורים) יעבור למאמנים אחרים. RLS מאפשר לעדכן רק את שלי.
    if (sharing) {
      const { data: pis } = await supabase
        .from('plan_items')
        .select('drill_id')
        .eq('plan_id', p.id)
      const ids = [...new Set((pis || []).map((x) => x.drill_id).filter(Boolean))]
      if (ids.length) {
        await supabase.from('drills').update({ is_public: true }).in('id', ids)
      }
    }
    toast.success(p.is_public ? L('השיתוף בוטל', 'Sharing turned off') : L('התוכנית שותפה לקהילה', 'Plan shared with the community'))
    loadPlans()
  }

  // אם נכנסנו לתוכנית — מציגים את הבונה
  if (activePlanId) {
    return (
      <PlanBuilder
        planId={activePlanId}
        plan={plans.find((p) => p.id === activePlanId)}
        onBack={() => {
          setActivePlanId(null)
          loadPlans()
        }}
      />
    )
  }

  if (smartOpen) {
    return (
      <SmartBuilder
        session={session}
        onCreated={async (id) => {
          setSmartOpen(false)
          await loadPlans()
          setActivePlanId(id)
        }}
        onCancel={() => setSmartOpen(false)}
      />
    )
  }

  if (viewingPlan) {
    return (
      <PlanViewer
        plan={viewingPlan}
        onBack={() => setViewingPlan(null)}
        onCopy={() => copyPlan(viewingPlan)}
      />
    )
  }

  const myPlans = plans.filter((p) => p.created_by === me)
  // כל התוכניות המשותפות (כולל שלך) — כך אתה רואה לאן השיתוף מגיע ומה מאמנים אחרים רואים
  const communityPlans = plans.filter((p) => p.is_public)

  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('תוכניות אימון', 'Training Plans')}</div>
          <h2>{L('התוכניות שלי', 'My Plans')}</h2>
          <p className="page-desc">{L('בנו תוכניות אימון מהתרגילים בספרייה, שתפו עם הקהילה וצרפו ללו"ז.', 'Build practice plans from library drills, share with the community and attach to your schedule.')}</p>
        </div>
      </header>

      {/* יצירת תוכנית חדשה */}
      <div className="field-group" style={{ marginTop: 18 }}>
        <span className="field-label">{L('תוכנית חדשה', 'New plan')}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            className="finder-input"
            style={{ flex: 1 }}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label={L('שם התוכנית', 'Plan name')}
            placeholder={L('שם התוכנית, למשל: אימון הגנה לנוער', 'Plan name, e.g. Defense practice for juniors')}
          />
          <button
            className="btn-primary"
            style={{ marginTop: 0, whiteSpace: 'nowrap' }}
            disabled={creating || !newName.trim()}
            onClick={createPlan}
          >
            {creating ? L('יוצר...', 'Creating...') : L('צור תוכנית', 'Create plan')}
          </button>
        </div>
      </div>

      <button
        className="btn-ghost"
        style={{ marginTop: 12 }}
        onClick={() => setSmartOpen(true)}
      >
        {L('בנייה אוטומטית של אימון', 'Auto-build a practice')}
      </button>

      <div className="finder-results">
        {loading ? (
          <SkeletonCards count={3} />
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : myPlans.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ic">
              <ClipboardList size={26} />
            </span>
            <div className="empty-title">{L('עדיין אין תוכניות אימון', 'No training plans yet')}</div>
            <p className="muted small">{L('צור את התוכנית הראשונה למעלה, או נסה את הבנאי החכם.', 'Create your first plan above, or try the smart builder.')}</p>
          </div>
        ) : (
          myPlans.map((p) => {
            const items = p.plan_items || []
            const total = items.reduce((s, it) => s + (it.duration_minutes || 0), 0)
            return (
              <div key={p.id} className="coach-card">
                <div className="drill-card-top">
                  <h3 className="coach-name">{p.name}</h3>
                  {p.is_public && (
                    <span className="plan-shared-badge">
                      <Globe2 size={12} /> {L('משותף', 'Shared')}
                    </span>
                  )}
                </div>
                <div className="plan-meta">
                  <span className="meta-item">
                    <ListChecks size={14} />
                    <bdi>{items.length}</bdi> {items.length === 1 ? L('תרגיל', 'drill') : L('תרגילים', 'drills')}
                  </span>
                  {total > 0 && (
                    <span className="meta-item">
                      <Clock size={14} />
                      <bdi>{total}</bdi> {L('דקות', 'min')}
                    </span>
                  )}
                </div>
                <div className="coach-card-actions">
                  <button
                    className="btn-primary"
                    style={{ marginTop: 0 }}
                    onClick={() => setActivePlanId(p.id)}
                  >
                    {L('פתח', 'Open')}
                  </button>
                  <button className="btn-ghost" onClick={() => toggleShare(p)}>
                    {p.is_public ? L('בטל שיתוף', 'Unshare') : L('שתף לקהילה', 'Share')}
                  </button>
                  <button className="btn-ghost danger" onClick={() => deletePlan(p.id)}>
                    {L('מחק', 'Delete')}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* תוכניות אימון שמאמנים אחרים שיתפו לקהילה */}
      {communityPlans.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 28 }}>
            {L('תוכניות הקהילה', 'Community plans')}
          </h3>
          <p className="muted small">
            {L('מערכי אימון משותפים — שלך ושל מאמנים אחרים. כאן מאמנים מגלים תוכניות. צפה כמחברת או העתק אליך.', 'Shared practice plans — yours and other coaches’. This is where coaches discover plans. View as a notebook or copy.')}
          </p>
          <div className="finder-results">
            {communityPlans.map((p) => {
              const items = p.plan_items || []
              const total = items.reduce((s, it) => s + (it.duration_minutes || 0), 0)
              const mine = p.created_by === me
              return (
                <div key={p.id} className="coach-card">
                  <div className="drill-card-top">
                    <h3 className="coach-name">{p.name}</h3>
                    {mine && <span className="cat-badge">{L('שלך', 'Yours')}</span>}
                  </div>
                  <div className="plan-meta">
                    <span className="meta-item">
                      <ListChecks size={14} />
                      <bdi>{items.length}</bdi> {items.length === 1 ? L('תרגיל', 'drill') : L('תרגילים', 'drills')}
                    </span>
                    {total > 0 && (
                      <span className="meta-item">
                        <Clock size={14} />
                        <bdi>{total}</bdi> {L('דקות', 'min')}
                      </span>
                    )}
                  </div>
                  <div className="coach-card-actions">
                    <button
                      className="btn-primary"
                      style={{ marginTop: 0 }}
                      onClick={() => setViewingPlan(p)}
                    >
                      {L('צפה כמערך אימון', 'View as practice sheet')}
                    </button>
                    {!mine && (
                      <button className="btn-ghost" onClick={() => copyPlan(p)}>
                        {L('העתק אלי', 'Copy to me')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// מסך בניית תוכנית — התרגילים ברצף, עם הוספה/סידור/עריכה, ופתיחת פרטים מלאים
function PlanBuilder({ planId, plan, onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [picking, setPicking] = useState(false)
  const [allDrills, setAllDrills] = useState([])
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [running, setRunning] = useState(false) // מצב הרצת אימון (טיימר)
  const [creatingDrill, setCreatingDrill] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [notebookView, setNotebookView] = useState(false) // תצוגת מערך-אימון כדף מחברת
  const [coach, setCoach] = useState({ club: '', name: '' })
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) return
      const { data: p } = await supabase
        .from('profiles')
        .select('first_name, last_name, club')
        .eq('id', data.user.id)
        .single()
      if (alive && p)
        setCoach({ club: p.club || '', name: `${p.first_name || ''} ${p.last_name || ''}`.trim() })
    })()
    return () => {
      alive = false
    }
  }, [])

  async function loadItems() {
    setLoading(true)
    const { data, error } = await supabase
      .from('plan_items')
      .select('*, drill:drills(*)') // כל פרטי התרגיל
      .eq('plan_id', planId)
      .order('position', { ascending: true })
    if (error) {
      setError(L('שגיאה בטעינת התוכנית: ', 'Failed to load plan: ') + error.message)
    } else {
      setItems(data || [])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  const toggleExpand = (id) => {
    setExpandedIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openPicker = async () => {
    setPicking(true)
    if (allDrills.length === 0) {
      const { data } = await supabase
        .from('drills')
        .select('id, title, category, duration_minutes')
        .order('title', { ascending: true })
      setAllDrills(data || [])
    }
  }

  const addDrill = async (drill) => {
    const nextPos =
      items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0
    const { error } = await supabase.from('plan_items').insert({
      plan_id: planId,
      drill_id: drill.id,
      position: nextPos,
      duration_minutes: drill.duration_minutes || null,
      note: null,
    })
    if (error) {
      toast.error(L('ההוספה נכשלה: ', 'Failed to add: ') + error.message)
      return
    }
    loadItems()
  }

  // יצירת תרגיל חדש ישירות בתוך האימון (פריט עם תוכן משלו, בלי drill_id)
  const addCustomItem = async () => {
    if (!newTitle.trim()) return
    const nextPos =
      items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0
    const { error } = await supabase.from('plan_items').insert({
      plan_id: planId,
      position: nextPos,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
    })
    if (error) {
      toast.error(L('ההוספה נכשלה: ', 'Failed to add: ') + error.message)
      return
    }
    setNewTitle('')
    setNewDesc('')
    setCreatingDrill(false)
    loadItems()
  }

  const removeItem = async (id) => {
    const { error } = await supabase.from('plan_items').delete().eq('id', id)
    if (error) {
      toast.error(L('ההסרה נכשלה: ', 'Failed to remove: ') + error.message)
      return
    }
    loadItems()
  }

  // עדכון מקומי של שדה בפריט (בזמן הקלדה)
  const updateLocal = (id, field, value) => {
    setItems((cur) =>
      cur.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    )
  }

  // שמירה למסד כשהשדה מאבד פוקוס
  const persist = async (id, field, value) => {
    const v =
      field === 'duration_minutes'
        ? value === '' || value === null
          ? null
          : Number(value)
        : value
    await supabase.from('plan_items').update({ [field]: v }).eq('id', id)
  }

  // הזזת פריט מעלה/מטה (החלפת position עם השכן)
  const move = async (index, dir) => {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const a = items[index]
    const b = items[target]
    await supabase.from('plan_items').update({ position: b.position }).eq('id', a.id)
    await supabase.from('plan_items').update({ position: a.position }).eq('id', b.id)
    loadItems()
  }

  // הדפסה / שמירה כ-PDF: פותח חלון נקי עם התוכנית בלבד ומדפיס אותו
  const printPlan = () => {
    const totalMin = items.reduce((s, it) => s + (it.duration_minutes || 0), 0)
    const durTotal = totalMin > 0 ? L(` · סה"כ ${totalMin} דקות`, ` · ${totalMin} min total`) : ''
    const name = escapeHtml(plan?.name || L('תוכנית אימון', 'Training Plan'))

    const rows = items
      .map((it) => {
        const d = it.drill || {}
        const title = d.title || it.title || L('תרגיל', 'Drill')
        const descText = d.description || it.description
        const dur = it.duration_minutes ? L(` — ${it.duration_minutes} דקות`, ` — ${it.duration_minutes} min`) : ''
        const cat = d.category ? ` (${escapeHtml(tr(d.category))})` : ''
        const note = it.note
          ? `<div style="color:#333;font-size:14px;margin-top:3px">${L('הערה: ', 'Note: ')}${escapeHtml(it.note)}</div>`
          : ''
        const desc = descText
          ? `<div style="color:#333;font-size:13px;margin-top:3px">${escapeHtml(descText)}</div>`
          : ''
        return `<li style="margin-bottom:14px"><strong>${escapeHtml(title)}</strong>${dur}${cat}${note}${desc}</li>`
      })
      .join('')

    const html =
      '<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">' +
      '<title>' + name + '</title>' +
      '<style>body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111}' +
      'h1{font-size:24px;margin:0 0 4px}.sub{color:#555;font-size:14px;margin-bottom:18px}' +
      'ol{padding-right:22px}li{font-size:15px}</style></head><body>' +
      '<h1>' + name + '</h1>' +
      '<div class="sub">' + items.length + L(' תרגילים', ' drills') + durTotal + '</div>' +
      '<ol>' + rows + '</ol>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>' +
      '</body></html>'

    // יוצרים קובץ HTML זמני ופותחים אותו ישירות — אמין יותר מ-document.write
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (!w) {
      toast.error(L('הדפדפן חסם חלון קופץ (popup). אשר חלונות קופצים לאתר ונסה שוב.', 'The browser blocked the popup. Allow popups for this site and try again.'))
      URL.revokeObjectURL(url)
      return
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  const total = items.reduce((s, it) => s + (it.duration_minutes || 0), 0)

  // פירוק זמן לפי קטגוריית התרגיל (למסך הסיכום, בסגנון מסך היעד)
  const catTotals = {}
  for (const it of items) {
    const cat = it.drill?.category || it.category
    if (!cat) continue
    catTotals[cat] = (catTotals[cat] || 0) + (it.duration_minutes || 0)
  }
  const CAT_COLORS = ['#E8763A', '#4663A0', '#1D7A4C', '#A97B12', '#8E5BB5']
  const breakdown = Object.entries(catTotals)
    .filter(([, m]) => m > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, min], i) => ({ cat, min, color: CAT_COLORS[i % CAT_COLORS.length] }))
  const breakdownMax = breakdown.reduce((m, b) => Math.max(m, b.min), 0)

  // מצב הרצת אימון — מסך טיימר נפרד
  if (running) {
    return (
      <PlanRunner
        items={items}
        planName={plan?.name}
        onExit={() => setRunning(false)}
      />
    )
  }

  // מערך האימון כדף מחברת — כל התרגילים על דף אחד עם הפרטים
  const nbPlan = planToNotebook(plan?.name, items)

  if (notebookView) {
    return (
      <div className="welcome-card">
        <div className="nb-actions">
          <button type="button" className="btn-ghost" onClick={() => setNotebookView(false)}>
            <Pencil size={16} /> {L('חזרה לעריכה', 'Back to editing')}
          </button>
          <button type="button" className="btn-soft" onClick={() => window.print()}>
            <Printer size={16} /> {L('הדפסה', 'Print')}
          </button>
        </div>
        <NotebookPage kind="plan" plan={nbPlan} club={coach.club} coachName={coach.name} noCourt />
      </div>
    )
  }

  return (
    <div className="welcome-card">
      <button className="link-button" onClick={onBack}>
        <ArrowRight size={15} className="back-ic" /> {L('כל התוכניות', 'All plans')}
      </button>

      <div className="welcome-badge" style={{ marginTop: 14 }}>
        {L('תוכנית אימון', 'Training Plan')}
      </div>
      <h2>{plan?.name || L('תוכנית', 'Plan')}</h2>
      <div className="pb-summary">
        <div className="pb-summary-head">
          <span className="pb-summary-label"><Clock size={14} /> {L('סה"כ זמן אימון', 'Total practice time')}</span>
          <span className="pb-summary-num">
            <bdi>{total}</bdi> <span className="pb-summary-unit">{L('דק׳', 'min')}</span>
          </span>
        </div>
        <div className="pb-summary-meta">
          <span className="builder-stat">
            <ListChecks size={14} />
            <strong><bdi>{items.length}</bdi></strong> {items.length === 1 ? L('תרגיל', 'drill') : L('תרגילים', 'drills')}
          </span>
        </div>
        {breakdown.length > 0 && (
          <ul className="pb-breakdown">
            {breakdown.map((b) => (
              <li key={b.cat} className="pb-breakdown-row">
                <span className="pb-dot" style={{ background: b.color }} aria-hidden="true" />
                <span className="pb-breakdown-cat">{tr(b.cat)}</span>
                <span className="pb-breakdown-track" aria-hidden="true">
                  <span style={{ width: `${breakdownMax ? Math.round((b.min / breakdownMax) * 100) : 0}%`, background: b.color }} />
                </span>
                <span className="pb-breakdown-min" dir="ltr"><bdi>{b.min}</bdi> {L('דק׳', 'min')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* גרסה להדפסה / שמירה כ-PDF (מוסתרת על המסך, מופיעה רק בהדפסה) */}
      <div className="print-area" dir="rtl">
        <h1>{plan?.name || L('תוכנית אימון', 'Training Plan')}</h1>
        <p className="print-sub">
          {items.length} {L('תרגילים', 'drills')}{total > 0 ? L(` · סה"כ ${total} דקות`, ` · ${total} min total`) : ''}
        </p>
        <ol>
          {items.map((it) => {
            const d = it.drill || {}
            const descText = d.description || it.description
            return (
              <li key={it.id}>
                <strong>{d.title || it.title || L('תרגיל', 'Drill')}</strong>
                {it.duration_minutes ? L(` — ${it.duration_minutes} דקות`, ` — ${it.duration_minutes} min`) : ''}
                {d.category ? ` (${tr(d.category)})` : ''}
                {it.note ? <div className="print-note">{L('הערה: ', 'Note: ')}{it.note}</div> : null}
                {descText ? <div className="print-desc">{descText}</div> : null}
              </li>
            )
          })}
        </ol>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button className="btn-primary" style={{ marginTop: 0 }} onClick={openPicker}>
          {L('הוספת תרגיל מהספרייה', 'Add drill from library')}
        </button>
        <button
          className="btn-ghost"
          onClick={() => setCreatingDrill(true)}
        >
          {L('תרגיל חדש', 'New drill')}
        </button>
        {items.length > 0 && (
          <button
            className="btn-soft"
            onClick={() => setNotebookView(true)}
          >
            <BookOpen size={16} /> {L('תצוגה כמערך אימון', 'View as practice sheet')}
          </button>
        )}
        {items.length > 0 && (
          <button
            className="btn-primary"
            style={{ marginTop: 0 }}
            onClick={() => setRunning(true)}
          >
            {L('הרצת אימון', 'Run practice')}
          </button>
        )}
        {items.length > 0 && (
          <button className="btn-ghost" onClick={printPlan}>
            {L('הדפסה / PDF', 'Print / PDF')}
          </button>
        )}
      </div>

      {/* יצירת תרגיל חדש בתוך האימון */}
      {creatingDrill && (
        <div className="picker">
          <div className="picker-head">
            <span className="field-label">{L('תרגיל חדש לאימון', 'New drill for this practice')}</span>
            <button className="link-button" onClick={() => setCreatingDrill(false)}>
              {L('סגור', 'Close')}
            </button>
          </div>
          <div className="auth-form">
            <label>
              {L('שם התרגיל', 'Drill name')}
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={L('לדוגמה: חימום ומתיחות', 'e.g. Warm-up and stretching')}
              />
            </label>
            <label>
              {L('תיאור', 'Description')}
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={3}
                placeholder={L('איך מבצעים את התרגיל...', 'How to run the drill...')}
              />
            </label>
            <button
              className="btn-primary"
              disabled={!newTitle.trim()}
              onClick={addCustomItem}
            >
              {L('הוסף לאימון', 'Add to practice')}
            </button>
          </div>
        </div>
      )}

      {/* בורר תרגילים מהספרייה */}
      {picking && (
        <div className="picker">
          <div className="picker-head">
            <span className="field-label">{L('בחר תרגיל להוספה', 'Pick a drill to add')}</span>
            <button className="link-button" onClick={() => setPicking(false)}>
              {L('סגור', 'Close')}
            </button>
          </div>
          {allDrills.length === 0 ? (
            <p className="muted small">{L('אין תרגילים בספרייה עדיין.', 'No drills in the library yet.')}</p>
          ) : (
            <div className="picker-list">
              {allDrills.map((d) => (
                <button
                  key={d.id}
                  className="picker-item"
                  onClick={() => addDrill(d)}
                >
                  <span>{d.title}</span>
                  {d.category && <span className="cat-badge">{tr(d.category)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* רצף התרגילים בתוכנית */}
      <div className="finder-results">
        {loading ? (
          <p className="muted">{L('טוען...', 'Loading...')}</p>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ic">
              <ClipboardList size={26} />
            </span>
            <div className="empty-title">{L('התוכנית ריקה', 'This plan is empty')}</div>
            <p className="muted small">{L('לחץ "הוסף תרגיל" כדי להתחיל לבנות את האימון.', 'Click "Add drill" to start building the practice.')}</p>
          </div>
        ) : (
          items.map((it, idx) => {
            const d = it.drill || {}
            const expanded = expandedIds.has(it.id)
            const detailMeta = [
              [L('רמת קושי', 'Difficulty'), tr(d.difficulty)],
              [L('משך מקורי', 'Original duration'), d.duration_minutes ? L(`${d.duration_minutes} דקות`, `${d.duration_minutes} min`) : null],
              [L('מטרה', 'Goal'), d.goal],
              [L('ציוד', 'Equipment'), d.equipment],
              [L('שחקנים', 'Players'), d.players],
              [L('חזרות/סטים', 'Reps/sets'), d.reps],
            ].filter(([, v]) => v)

            return (
              <div key={it.id} className="plan-item">
                <div className="plan-item-top">
                  <div className="plan-item-order">
                    <button
                      className="ord-btn"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      aria-label={L('הזז מעלה', 'Move up')}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <span className="ord-num">{idx + 1}</span>
                    <button
                      className="ord-btn"
                      onClick={() => move(idx, 1)}
                      disabled={idx === items.length - 1}
                      aria-label={L('הזז מטה', 'Move down')}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  <div style={{ flex: 1 }}>
                    <h3 className="coach-name">{d.title || it.title || L('תרגיל', 'Drill')}</h3>
                    {d.category && <span className="cat-badge">{tr(d.category)}</span>}
                    {!it.drill && it.description && (
                      <p className="drill-desc" style={{ marginTop: 6 }}>
                        {it.description}
                      </p>
                    )}
                  </div>

                  <button className="btn-ghost danger" onClick={() => removeItem(it.id)}>
                    {L('הסר', 'Remove')}
                  </button>
                </div>

                <div className="plan-item-fields">
                  <label className="plan-field">
                    {L('משך (דקות)', 'Duration (min)')}
                    <input
                      className="finder-input"
                      type="number"
                      min="1"
                      value={it.duration_minutes ?? ''}
                      onChange={(e) =>
                        updateLocal(it.id, 'duration_minutes', e.target.value)
                      }
                      onBlur={(e) =>
                        persist(it.id, 'duration_minutes', e.target.value)
                      }
                    />
                  </label>
                  <label className="plan-field">
                    {L('הערה', 'Note')}
                    <input
                      className="finder-input"
                      type="text"
                      value={it.note ?? ''}
                      onChange={(e) => updateLocal(it.id, 'note', e.target.value)}
                      onBlur={(e) => persist(it.id, 'note', e.target.value)}
                      placeholder={L('לדוגמה: דגש על תקשורת', 'e.g. focus on communication')}
                    />
                  </label>
                </div>

                {it.drill && (
                  <button
                    className="link-button"
                    style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => toggleExpand(it.id)}
                  >
                    {expanded ? (
                      <>
                        <ChevronUp size={15} /> {L('הסתר פרטים', 'Hide details')}
                      </>
                    ) : (
                      <>
                        <ChevronDown size={15} /> {L('הצג את כל פרטי התרגיל', 'Show all drill details')}
                      </>
                    )}
                  </button>
                )}

                {expanded && (
                  <div className="plan-item-details">
                    {d.age_groups && d.age_groups.length > 0 && (
                      <div className="chips" style={{ marginBottom: 10 }}>
                        {d.age_groups.map((g) => (
                          <span key={g} className="chip selected static">
                            {trTeam(g)}
                          </span>
                        ))}
                      </div>
                    )}

                    {d.description && (
                      <p className="drill-desc" style={{ marginTop: 0 }}>
                        {d.description}
                      </p>
                    )}

                    {detailMeta.length > 0 && (
                      <div className="drill-meta">
                        {detailMeta.map(([label, value]) => (
                          <div key={label} className="drill-meta-row">
                            <span className="detail-label">{label}</span>
                            <span className="detail-value">{value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {d.coach_notes && (
                      <div className="drill-notes">
                        <span className="detail-label">{L('דגשים למאמן', 'Coach notes')}</span>
                        <p>{d.coach_notes}</p>
                      </div>
                    )}

                    {safeUrl(d.video_url) && (
                      <a
                        className="btn-ghost"
                        style={{ marginTop: 12, display: 'inline-block' }}
                        href={safeUrl(d.video_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {L('סרטון', 'Video')}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// תצוגת תוכנית-קהילה כמחברת (קריאה בלבד) — לצפייה והעתקה
function PlanViewer({ plan, onBack, onCopy }) {
  const [items, setItems] = useState([])
  const [owner, setOwner] = useState({ club: '', name: '' })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('plan_items')
        .select('*, drill:drills(*)')
        .eq('plan_id', plan.id)
        .order('position', { ascending: true })
      const { data: pr } = await supabase
        .from('profiles')
        .select('first_name, last_name, club')
        .eq('id', plan.created_by)
        .single()
      if (!alive) return
      setItems(data || [])
      if (pr) setOwner({ club: pr.club || '', name: `${pr.first_name || ''} ${pr.last_name || ''}`.trim() })
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [plan.id])

  const nbPlan = planToNotebook(plan.name, items)

  return (
    <div className="welcome-card">
      <button className="link-button" onClick={onBack}>
        <ArrowRight size={15} className="back-ic" /> {L('חזרה לתוכניות', 'Back to plans')}
      </button>
      <div className="nb-actions" style={{ marginTop: 12 }}>
        <button className="btn-primary" style={{ marginTop: 0 }} onClick={onCopy}>
          {L('העתק אלי', 'Copy to me')}
        </button>
        <button className="btn-soft" onClick={() => window.print()}>
          <Printer size={16} /> {L('הדפסה', 'Print')}
        </button>
      </div>
      {loading ? (
        <SkeletonCards count={1} />
      ) : (
        <NotebookPage kind="plan" plan={nbPlan} club={owner.club} coachName={owner.name} noCourt />
      )}
    </div>
  )
}
