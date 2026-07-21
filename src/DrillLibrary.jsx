import { toast } from './toast'
import { useState, useEffect } from 'react'
import { Dumbbell, Plus, X } from 'lucide-react'
import { supabase } from './supabaseClient'
import { AGE_GROUPS, DRILL_CATEGORIES } from './constants'
import { L, tr, trTeam } from './i18n'
import { confirmDialog } from './confirm'
import DrillForm from './DrillForm'
import { sendNotification } from './notify'
import DrillCard from './DrillCard'
import MultiSelect from './MultiSelect'
import { SkeletonCards } from './Skeleton'

// מסך "ספריית תרגילים" — מציג את כל התרגילים, עם חיפוש, סינון,
// הוספה, דירוג בכוכבים, שמירה למועדפים, ומחיקת תרגיל שלי.
// props:
//   session - המשתמש המחובר
export default function DrillLibrary({ session, profile }) {
  const [drills, setDrills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false) // האם מציגים את טופס ההוספה
  const [editingDrill, setEditingDrill] = useState(null) // תרגיל שנבחר לעריכה

  // ערכי הסינון
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('') // קטגוריה אחת, או ריק = הכול
  const [ageFilter, setAgeFilter] = useState([])
  const [tagFilter, setTagFilter] = useState('') // סינון לפי תגית
  const [onlySaved, setOnlySaved] = useState(false) // הצג רק מועדפים
  const [onlyMine, setOnlyMine] = useState(false) // הצג רק תרגילים שיצרתי
  const [sortBy, setSortBy] = useState('new') // 'new' = חדשים, 'rating' = מדורגים

  // בורר "הוספה לתוכנית"
  const [planPicker, setPlanPicker] = useState(null) // התרגיל שנבחר להוספה
  const [myPlans, setMyPlans] = useState([])
  const [newPlanName, setNewPlanName] = useState('')
  const [addingToPlan, setAddingToPlan] = useState(false)

  // בורר "שליחה לשחקנים" — קבוצות + שחקנים מחוברים
  const [sendPicker, setSendPicker] = useState(null) // התרגיל שנבחר לשליחה
  const [sendTargets, setSendTargets] = useState({ teams: [], players: [] })
  const [sending, setSending] = useState(false)
  const isCoach = (profile?.role || 'coach') !== 'player'

  const openSendPicker = async (drill) => {
    setSendPicker(drill)
    const { data } = await supabase
      .from('team_players')
      .select('id, name, team, player_id')
      .eq('coach_id', session.user.id)
    const rows = data || []
    const teams = [...new Set(rows.map((r) => r.team))]
    const players = rows.filter((r) => r.player_id)
    setSendTargets({ teams, players })
  }

  const sendTo = async ({ team, player }) => {
    if (!sendPicker || sending) return
    setSending(true)
    const row = { coach_id: session.user.id, drill_id: sendPicker.id }
    if (team) row.team = team
    if (player) { row.player_id = player.player_id }
    const { error } = await supabase.from('player_assignments').insert(row)
    setSending(false)
    if (error) { toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + error.message); return }
    if (player?.player_id) {
      sendNotification({ to: player.player_id, actor: session.user.id, type: 'message', content: 'המאמן שלח לך תרגיל חדש', nav: 'drills' })
    }
    toast.success(team ? L('נשלח לכל הקבוצה', 'Sent to the whole team') : L('נשלח לשחקן', 'Sent to the player'))
    setSendPicker(null)
  }

  const openPlanPicker = async (drill) => {
    setPlanPicker(drill)
    setNewPlanName('')
    const { data } = await supabase
      .from('training_plans')
      .select('id, name')
      .eq('created_by', session.user.id)
      .order('created_at', { ascending: false })
    setMyPlans(data || [])
  }

  const insertItem = async (planId, drill) => {
    const { data: last } = await supabase
      .from('plan_items')
      .select('position')
      .eq('plan_id', planId)
      .order('position', { ascending: false })
      .limit(1)
    const nextPos = last && last[0] ? last[0].position + 1 : 0
    return supabase.from('plan_items').insert({
      plan_id: planId,
      drill_id: drill.id,
      position: nextPos,
      duration_minutes: drill.duration_minutes || null,
      note: null,
    })
  }

  const addDrillToPlan = async (planId) => {
    if (!planPicker || addingToPlan) return
    setAddingToPlan(true)
    const { error } = await insertItem(planId, planPicker)
    setAddingToPlan(false)
    if (error) { toast.error(L('ההוספה נכשלה: ', 'Failed to add: ') + error.message); return }
    toast.success(L('התרגיל נוסף לתוכנית', 'Drill added to the plan'))
    setPlanPicker(null)
  }

  const createPlanWithDrill = async () => {
    if (!newPlanName.trim() || !planPicker || addingToPlan) return
    setAddingToPlan(true)
    const { data: plan, error } = await supabase
      .from('training_plans')
      .insert({ name: newPlanName.trim(), created_by: session.user.id })
      .select('id')
      .single()
    if (error || !plan) { setAddingToPlan(false); toast.error(L('יצירת התוכנית נכשלה: ', 'Failed to create plan: ') + (error?.message || '')); return }
    const { error: e2 } = await insertItem(plan.id, planPicker)
    setAddingToPlan(false)
    if (e2) { toast.error(L('ההוספה נכשלה: ', 'Failed to add: ') + e2.message); return }
    toast.success(L('נוצרה תוכנית עם התרגיל', 'Plan created with the drill'))
    setPlanPicker(null)
  }

  // טוען את כל התרגילים, יחד עם: שם המאמן, הדירוגים, והאם שמרתי אותם.
  // opts.silent — רענון אחרי דירוג/שמירה/מחיקה: לא מציגים שלד (כדי לא לקרוס
  // כרטיס מורחב), ולא מאבדים את הרשימה על שגיאה חולפת.
  async function loadDrills(opts = {}) {
    if (!opts.silent) setLoading(true)
    const { data, error } = await supabase
      .from('drills')
      .select(
        '*, author:profiles(first_name, last_name, club), drill_ratings(rating, user_id), saved_drills(user_id)'
      )
      .order('created_at', { ascending: false })

    if (error) {
      if (!opts.silent) setError(L('שגיאה בטעינת התרגילים: ', 'Error loading drills: ') + error.message)
    } else {
      setDrills(data || [])
      setError(null) // רענון מוצלח מנקה שגיאה קודמת שנתקעה
    }
    if (!opts.silent) setLoading(false)
  }

  useEffect(() => {
    loadDrills()
  }, [])

  // דירוג תרגיל (1–5). upsert = מוסיף דירוג חדש, או מעדכן אם כבר דירגתי.
  const handleRate = async (drillId, rating) => {
    const { error } = await supabase
      .from('drill_ratings')
      .upsert(
        { drill_id: drillId, user_id: session.user.id, rating },
        { onConflict: 'drill_id,user_id' }
      )
    if (error) {
      toast.error(L('הדירוג נכשל: ', 'Rating failed: ') + error.message)
    } else {
      loadDrills({ silent: true }) // מרענן ברקע — בלי לקרוס את הכרטיס המורחב
    }
  }

  // שמירה/הסרה ממועדפים (טוגל)
  const handleToggleSave = async (drillId, currentlySaved) => {
    if (currentlySaved) {
      const { error } = await supabase
        .from('saved_drills')
        .delete()
        .eq('drill_id', drillId)
        .eq('user_id', session.user.id)
      if (error) {
        toast.error(L('ההסרה מהמועדפים נכשלה: ', 'Removing from favorites failed: ') + error.message)
        return
      }
    } else {
      const { error } = await supabase
        .from('saved_drills')
        .insert({ drill_id: drillId, user_id: session.user.id })
      if (error) {
        toast.error(L('השמירה נכשלה: ', 'Save failed: ') + error.message)
        return
      }
    }
    loadDrills({ silent: true })
  }

  // מחיקת תרגיל (רק תרגיל של המשתמש עצמו — מאובטח גם במסד)
  const handleDelete = async (id) => {
    const ok = await confirmDialog({
      title: L('למחוק את התרגיל?', 'Delete this drill?'),
      message: L('הפעולה אינה הפיכה — התרגיל יימחק לצמיתות.', 'This cannot be undone — the drill will be permanently deleted.'),
      confirmText: L('מחיקה', 'Delete'),
    })
    if (!ok) return
    const { error } = await supabase.from('drills').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
    } else {
      toast.success(L('התרגיל נמחק', 'Drill deleted'))
      loadDrills({ silent: true })
    }
  }

  const toggleAge = (group) => {
    setAgeFilter((current) =>
      current.includes(group)
        ? current.filter((g) => g !== group)
        : [...current, group]
    )
  }

  const clearFilters = () => {
    setSearch('')
    setCatFilter('')
    setAgeFilter([])
    setTagFilter('')
    setOnlySaved(false)
    setOnlyMine(false)
  }

  const hasFilters = search || catFilter || ageFilter.length > 0 || tagFilter || onlySaved || onlyMine

  // ממוצע דירוג של תרגיל (לצורך מיון)
  const avgOf = (d) => {
    const r = d.drill_ratings || []
    return r.length ? r.reduce((s, x) => s + x.rating, 0) / r.length : 0
  }

  // מסננים לפי החיפוש הנוכחי
  const filtered = drills.filter((d) => {
    const text = (
      d.title +
      ' ' +
      (d.description || '') +
      ' ' +
      (d.tags || []).join(' ')
    ).toLowerCase()
    const searchOk =
      search.trim() === '' || text.includes(search.trim().toLowerCase())
    const catOk = catFilter === '' || d.category === catFilter
    const ageOk =
      ageFilter.length === 0 ||
      (d.age_groups || []).some((g) => ageFilter.includes(g))
    const tagOk = tagFilter === '' || (d.tags || []).includes(tagFilter)
    const savedOk = !onlySaved || (d.saved_drills || []).length > 0
    const mineOk = !onlyMine || d.created_by === session.user.id
    return searchOk && catOk && ageOk && tagOk && savedOk && mineOk
  })

  // ממיינים: לפי דירוג (גבוה→נמוך) או לפי החדשים ביותר (סדר ברירת המחדל)
  const results =
    sortBy === 'rating'
      ? [...filtered].sort((a, b) => {
          const diff = avgOf(b) - avgOf(a)
          if (diff !== 0) return diff
          return (b.drill_ratings?.length || 0) - (a.drill_ratings?.length || 0)
        })
      : filtered

  // אם פתחנו את טופס ההוספה/העריכה — מציגים רק אותו
  if (adding || editingDrill) {
    return (
      <DrillForm
        drill={editingDrill}
        onSaved={() => {
          setAdding(false)
          setEditingDrill(null)
          loadDrills()
        }}
        onCancel={() => { setAdding(false); setEditingDrill(null) }}
      />
    )
  }

  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('ספריית תרגילים', 'Drill library')}</div>
          <h2>{L('מאגר התרגילים', 'Drill collection')}</h2>
          <p className="page-desc">{L('חיפוש, דירוג ושמירת תרגילים מכל קהילת המאמנים.', 'Search, rate and save drills from the whole coaching community.')}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden="true" /> {L('הוספת תרגיל', 'Add drill')}
          </button>
        </div>
      </header>

      {/* סרגל סינון אופקי — חיפוש, קטגוריה וגיל בשורה אחת */}
      <div className="filter-bar">
        <input
          className="finder-input filter-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={L('חיפוש בשם או בתיאור...', 'Search by name or description...')}
          aria-label={L('חיפוש תרגילים', 'Search drills')}
        />
        <select
          className="finder-input filter-select"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          aria-label={L('סינון לפי קטגוריה', 'Filter by category')}
        >
          <option value="">{L('כל הקטגוריות', 'All categories')}</option>
          {DRILL_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{tr(cat)}</option>
          ))}
        </select>
        <div className="filter-ms">
          <MultiSelect
            options={AGE_GROUPS}
            selected={ageFilter}
            onToggle={toggleAge}
            renderLabel={trTeam}
            placeholder={L('כל הגילאים', 'All age groups')}
          />
        </div>
      </div>
      <div className="filter-chips-row">
        <button
          type="button"
          className={onlySaved ? 'chip selected' : 'chip'}
          onClick={() => setOnlySaved(!onlySaved)}
        >
          {L('המועדפים שלי', 'My favorites')}
        </button>
        <button
          type="button"
          className={onlyMine ? 'chip selected' : 'chip'}
          onClick={() => setOnlyMine(!onlyMine)}
          aria-pressed={onlyMine}
        >
          {L('התרגילים שלי', 'My drills')}
        </button>
        <span className="filter-chips-sep" aria-hidden="true" />
        <button
          type="button"
          className={sortBy === 'new' ? 'chip selected' : 'chip'}
          onClick={() => setSortBy('new')}
        >
          {L('החדשים ביותר', 'Newest')}
        </button>
        <button
          type="button"
          className={sortBy === 'rating' ? 'chip selected' : 'chip'}
          onClick={() => setSortBy('rating')}
        >
          {L('הכי מדורגים', 'Top rated')}
        </button>
      </div>

      {tagFilter && (
        <div className="active-tag">
          <span>{L('מסונן לפי תגית:', 'Filtered by tag:')}</span>
          <button type="button" className="chip selected tag-chip" onClick={() => setTagFilter('')}>
            #{tagFilter} <X size={12} />
          </button>
        </div>
      )}

      {hasFilters && (
        <button
          className="link-button"
          style={{ marginTop: 14 }}
          onClick={clearFilters}
        >
          {L('נקה סינון', 'Clear filters')}
        </button>
      )}

      {/* רשימת התרגילים */}
      <div className="finder-results">
        {loading ? (
          <SkeletonCards count={3} />
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ic">
              <Dumbbell size={26} />
            </span>
            <div className="empty-title">
              {onlySaved
                ? L('עדיין לא שמרת תרגילים', "You haven't saved any drills yet")
                : drills.length === 0
                ? L('הספרייה עדיין ריקה', 'The library is still empty')
                : L('אין תוצאות לסינון', 'No results for this filter')}
            </div>
            <p className="muted small">
              {onlySaved
                ? L('לחץ על "שמירה" בכרטיס תרגיל כדי לשמור אותו לכאן.', 'Tap "Save" on a drill card to keep it here.')
                : drills.length === 0
                ? L('לחץ "הוסף תרגיל" כדי להוסיף את התרגיל הראשון לספרייה.', 'Tap "Add drill" to add the first drill to the library.')
                : L('נסה לשנות את מילות החיפוש או לנקות את הסינון.', 'Try changing your search terms or clearing the filters.')}
            </p>
            {drills.length === 0 ? (
              <button type="button" className="btn-primary empty-cta" onClick={() => setAdding(true)}>
                <Plus size={18} aria-hidden="true" /> {L('הוספת תרגיל', 'Add drill')}
              </button>
            ) : (
              <button type="button" className="btn-soft empty-cta" onClick={clearFilters}>
                {L('נקה סינון', 'Clear filters')}
              </button>
            )}
          </div>
        ) : (
          <div className="drill-grid">
            <p className="muted small results-count">
              {results.length === 1 ? L('תרגיל אחד', '1 drill') : L(`${results.length} תרגילים`, `${results.length} drills`)}
            </p>
            {results.map((drill) => (
              <DrillCard
                key={drill.id}
                drill={drill}
                userId={session.user.id}
                isMine={drill.created_by === session.user.id}
                onRate={handleRate}
                onToggleSave={handleToggleSave}
                onDelete={() => handleDelete(drill.id)}
                onTagClick={setTagFilter}
                onAddToPlan={openPlanPicker}
                onSend={isCoach ? openSendPicker : undefined}
                onEdit={setEditingDrill}
              />
            ))}
          </div>
        )}
      </div>

      {/* בורר תוכנית — הוספת תרגיל לתוכנית אימון קיימת או חדשה */}
      {planPicker && (
        <div className="tm-overlay" role="dialog" aria-modal="true" onClick={() => setPlanPicker(null)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-head">
              <h3>{L('הוספה לתוכנית', 'Add to a plan')}</h3>
              <button className="tm-close" onClick={() => setPlanPicker(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <p className="muted small" style={{ margin: '0 0 12px' }}>
              {L('בחר תוכנית קיימת, או צור חדשה עם התרגיל הזה.', 'Pick an existing plan, or create a new one with this drill.')}
            </p>
            <div className="plan-pick-new">
              <input
                className="finder-input"
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                placeholder={L('שם תוכנית חדשה...', 'New plan name...')}
                onKeyDown={(e) => e.key === 'Enter' && createPlanWithDrill()}
              />
              <button className="btn-primary" style={{ marginTop: 0 }} onClick={createPlanWithDrill} disabled={addingToPlan}>
                <Plus size={16} /> {L('צור', 'Create')}
              </button>
            </div>
            {myPlans.length > 0 && (
              <ul className="plan-pick-list">
                {myPlans.map((p) => (
                  <li key={p.id}>
                    <button className="plan-pick-item" onClick={() => addDrillToPlan(p.id)} disabled={addingToPlan}>
                      <span>{p.name}</span>
                      <Plus size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* בורר שליחה לשחקנים — קבוצה שלמה או שחקן מחובר */}
      {sendPicker && (
        <div className="tm-overlay" role="dialog" aria-modal="true" onClick={() => setSendPicker(null)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-head">
              <h3>{L('שליחת התרגיל לשחקנים', 'Send drill to players')}</h3>
              <button className="tm-close" onClick={() => setSendPicker(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <p className="muted small" style={{ margin: '0 0 12px' }}>{sendPicker.title}</p>

            {sendTargets.teams.length === 0 && sendTargets.players.length === 0 ? (
              <p className="muted small">{L('אין עדיין קבוצות/שחקנים. הוסיפו שחקנים בטאב "הקבוצות שלי".', 'No teams/players yet. Add players in "My Teams".')}</p>
            ) : (
              <>
                {sendTargets.teams.length > 0 && (
                  <>
                    <span className="field-label">{L('לכל הקבוצה', 'Whole team')}</span>
                    <div className="chips" style={{ marginBottom: 12 }}>
                      {sendTargets.teams.map((tm) => (
                        <button key={tm} type="button" className="chip" disabled={sending} onClick={() => sendTo({ team: tm })}>
                          {trTeam(tm)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {sendTargets.players.length > 0 && (
                  <>
                    <span className="field-label">{L('לשחקן מסוים', 'A specific player')}</span>
                    <ul className="plan-pick-list">
                      {sendTargets.players.map((p) => (
                        <li key={p.id}>
                          <button className="plan-pick-item" disabled={sending} onClick={() => sendTo({ player: p })}>
                            <span>{p.name} · {trTeam(p.team)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
