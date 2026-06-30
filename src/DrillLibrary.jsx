import { toast } from './toast'
import { useState, useEffect } from 'react'
import { Dumbbell, X } from 'lucide-react'
import { supabase } from './supabaseClient'
import { AGE_GROUPS, DRILL_CATEGORIES } from './constants'
import { L, tr, trTeam } from './i18n'
import DrillForm from './DrillForm'
import DrillCard from './DrillCard'
import MultiSelect from './MultiSelect'
import { SkeletonCards } from './Skeleton'

// מסך "ספריית תרגילים" — מציג את כל התרגילים, עם חיפוש, סינון,
// הוספה, דירוג בכוכבים, שמירה למועדפים, ומחיקת תרגיל שלי.
// props:
//   session - המשתמש המחובר
export default function DrillLibrary({ session }) {
  const [drills, setDrills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false) // האם מציגים את טופס ההוספה

  // ערכי הסינון
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('') // קטגוריה אחת, או ריק = הכול
  const [ageFilter, setAgeFilter] = useState([])
  const [tagFilter, setTagFilter] = useState('') // סינון לפי תגית
  const [onlySaved, setOnlySaved] = useState(false) // הצג רק מועדפים
  const [sortBy, setSortBy] = useState('new') // 'new' = חדשים, 'rating' = מדורגים

  // טוען את כל התרגילים, יחד עם: שם המאמן, הדירוגים, והאם שמרתי אותם
  async function loadDrills() {
    setLoading(true)
    const { data, error } = await supabase
      .from('drills')
      .select(
        '*, author:profiles(first_name, last_name, club), drill_ratings(rating, user_id), saved_drills(user_id)'
      )
      .order('created_at', { ascending: false })

    if (error) {
      setError(L('שגיאה בטעינת התרגילים: ', 'Error loading drills: ') + error.message)
    } else {
      setDrills(data || [])
    }
    setLoading(false)
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
      loadDrills() // מרענן כדי לעדכן את הממוצע
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
    loadDrills()
  }

  // מחיקת תרגיל (רק תרגיל של המשתמש עצמו — מאובטח גם במסד)
  const handleDelete = async (id) => {
    if (!window.confirm(L('למחוק את התרגיל? פעולה זו אינה הפיכה.', 'Delete this drill? This action cannot be undone.'))) return
    const { error } = await supabase.from('drills').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
    } else {
      toast.success(L('התרגיל נמחק', 'Drill deleted'))
      loadDrills()
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
  }

  const hasFilters = search || catFilter || ageFilter.length > 0 || tagFilter || onlySaved

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
    return searchOk && catOk && ageOk && tagOk && savedOk
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

  // אם פתחנו את טופס ההוספה — מציגים רק אותו
  if (adding) {
    return (
      <DrillForm
        onSaved={() => {
          setAdding(false)
          loadDrills()
        }}
        onCancel={() => setAdding(false)}
      />
    )
  }

  return (
    <div className="welcome-card">
      <div className="library-header">
        <div>
          <div className="welcome-badge">{L('ספריית תרגילים', 'Drill library')}</div>
          <h2>{L('מאגר התרגילים', 'Drill collection')}</h2>
        </div>
        <button className="btn-primary library-add" onClick={() => setAdding(true)}>
          {L('הוספת תרגיל', 'Add drill')}
        </button>
      </div>

      {/* טוגל המועדפים שלי */}
      <div className="field-group" style={{ marginTop: 18 }}>
        <button
          type="button"
          className={onlySaved ? 'chip selected' : 'chip'}
          onClick={() => setOnlySaved(!onlySaved)}
        >
          {L('המועדפים שלי', 'My favorites')}
        </button>
      </div>

      {/* חיפוש חופשי */}
      <div className="field-group" style={{ marginTop: 16 }}>
        <input
          className="finder-input"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={L('חיפוש בשם או בתיאור...', 'Search by name or description...')}
        />
      </div>

      {/* סינון לפי קטגוריה */}
      <div className="field-group" style={{ marginTop: 16 }}>
        <span className="field-label">{L('קטגוריה', 'Category')}</span>
        <select className="finder-input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">{L('כל הקטגוריות', 'All categories')}</option>
          {DRILL_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{tr(cat)}</option>
          ))}
        </select>
      </div>

      {/* סינון לפי שכבת גיל */}
      <div className="field-group" style={{ marginTop: 16 }}>
        <span className="field-label">{L('שכבת גיל', 'Age group')}</span>
        <MultiSelect
          options={AGE_GROUPS}
          selected={ageFilter}
          onToggle={toggleAge}
          renderLabel={trTeam}
          placeholder={L('כל הגילאים', 'All age groups')}
        />
      </div>

      {/* מיון */}
      <div className="field-group" style={{ marginTop: 16 }}>
        <span className="field-label">{L('מיון', 'Sort')}</span>
        <div className="chips">
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
          </div>
        ) : (
          <>
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
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
