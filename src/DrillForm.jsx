import { useState, useEffect, useRef } from 'react'
import {
  Camera, X, BookOpen, Printer, Pencil, Check, ClipboardList,
  SlidersHorizontal, Globe2, Clock, Users, Package, Repeat, Target,
} from 'lucide-react'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { uploadImage } from './storage'
import { AGE_GROUPS, DRILL_CATEGORIES, DIFFICULTY_LEVELS } from './constants'
import { L, tr, trTeam } from './i18n'
import TacticsBoard from './TacticsBoard'
import NotebookPage from './NotebookPage'
import MultiSelect from './MultiSelect'

// טקסטריה שנצמדת לשורות המחברת — גובה אוטומטי לפי התוכן
function NbLines({ value, onChange, placeholder, ariaLabel }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      className="nb-write nb-write-lines"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      rows={3}
    />
  )
}

// טופס להוספת/עריכת תרגיל בספרייה.
// ברירת המחדל: כתיבה ישירות על "מחברת המאמן" — כמו במציאות. יש גם טופס מלא.
// props:
//   onSaved  - מופעל אחרי שמירה מוצלחת (חוזרים לרשימה)
//   onCancel - מופעל בלחיצה על "ביטול"
//   drill    - (אופציונלי) תרגיל קיים לעריכה. אם קיים — הטופס נטען מלא ומעדכן במקום להוסיף.
export default function DrillForm({ onSaved, onCancel, drill }) {
  const editing = !!drill?.id
  const [mode, setMode] = useState('notebook') // 'notebook' (ברירת מחדל) | 'form'
  // שדות הבסיס — נטענים מהתרגיל הקיים בעריכה
  const [title, setTitle] = useState(drill?.title || '')
  const [description, setDescription] = useState(drill?.description || '')
  const [category, setCategory] = useState(drill?.category || '')
  const [ageGroups, setAgeGroups] = useState(drill?.age_groups || [])
  const [tags, setTags] = useState(drill?.tags || [])
  const [tagInput, setTagInput] = useState('')

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }
  const removeTag = (t) => setTags(tags.filter((x) => x !== t))

  // פרטים נוספים (אופציונליים) — נטענים מהתרגיל הקיים בעריכה
  const [difficulty, setDifficulty] = useState(drill?.difficulty || '')
  const [duration, setDuration] = useState(drill?.duration_minutes != null ? String(drill.duration_minutes) : '')
  const [goal, setGoal] = useState(drill?.goal || '')
  const [equipment, setEquipment] = useState(drill?.equipment || '')
  const [players, setPlayers] = useState(drill?.players || '')
  const [reps, setReps] = useState(drill?.reps || '')
  const [videoUrl, setVideoUrl] = useState(drill?.video_url || '')
  const [coachNotes, setCoachNotes] = useState(drill?.coach_notes || '')
  const [isPublic, setIsPublic] = useState(drill?.is_public !== false) // שיתוף לקהילה / פרטי
  const [board, setBoard] = useState(drill?.board || null) // שלבי לוח הטקטיקה
  const [imageUrl, setImageUrl] = useState(drill?.image_url || '')
  const [uploadingImage, setUploadingImage] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // ---- טיוטה אוטומטית (תרגיל חדש בלבד): יציאה מהעמוד לא מוחקת את מה שכתבת ----
  const DRAFT_KEY = 'drill-draft-v1'
  const draftLoaded = useRef(false)
  useEffect(() => {
    if (editing || draftLoaded.current) return
    draftLoaded.current = true
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (d && (d.title || d.description || d.category)) {
        setTitle(d.title || '')
        setDescription(d.description || '')
        setCategory(d.category || '')
        setAgeGroups(d.ageGroups || [])
        setTags(d.tags || [])
        setDifficulty(d.difficulty || '')
        setDuration(d.duration || '')
        setGoal(d.goal || '')
        setEquipment(d.equipment || '')
        setPlayers(d.players || '')
        setReps(d.reps || '')
        setVideoUrl(d.videoUrl || '')
        setCoachNotes(d.coachNotes || '')
        if (typeof d.isPublic === 'boolean') setIsPublic(d.isPublic)
        if (d.board) setBoard(d.board)
        if (d.imageUrl) setImageUrl(d.imageUrl)
        toast.success(L('הטיוטה שוחזרה — המשך מאיפה שהפסקת', 'Draft restored — pick up where you left off'))
      }
    } catch { /* טיוטה פגומה — מתעלמים */ }
  }, [editing])
  useEffect(() => {
    if (editing) return
    const t = setTimeout(() => {
      try {
        if (title.trim() || description.trim() || category) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({
            title, description, category, ageGroups, tags, difficulty, duration,
            goal, equipment, players, reps, videoUrl, coachNotes, isPublic, board, imageUrl,
          }))
        }
      } catch { /* אחסון מלא — לא קריטי */ }
    }, 400)
    return () => clearTimeout(t)
  }, [editing, title, description, category, ageGroups, tags, difficulty, duration, goal, equipment, players, reps, videoUrl, coachNotes, isPublic, board, imageUrl])

  // תצוגת "דף מחברת" + פרטי המאמן לכותרת הדף
  const [preview, setPreview] = useState(false)
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
      if (alive && p) {
        setCoach({
          club: p.club || '',
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // אובייקט תרגיל מהשדות הנוכחיים — לתצוגת המחברת
  const previewDrill = {
    title,
    description,
    category,
    age_groups: ageGroups,
    duration_minutes: duration ? Number(duration) : null,
    equipment,
    players,
    reps,
    goal,
    coach_notes: coachNotes,
    board,
  }

  const onImagePick = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const { data } = await supabase.auth.getUser()
      const url = await uploadImage(file, 'drills', data.user.id)
      setImageUrl(url)
      toast.success(L('התמונה הועלתה', 'Image uploaded'))
    } catch (err) {
      toast.error(L('העלאת התמונה נכשלה: ', 'Image upload failed: ') + err.message)
    } finally {
      setUploadingImage(false)
    }
  }

  // מסמן/מבטל שכבת גיל
  const toggleAgeGroup = (group) => {
    setAgeGroups((current) =>
      current.includes(group)
        ? current.filter((g) => g !== group)
        : [...current, group]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // קטגוריה היא חובה (השם נבדק אוטומטית כי הוא required)
    if (!category) {
      setError(L('יש לבחור קטגוריה לתרגיל.', 'Please choose a category for the drill.'))
      toast.error(L('יש לבחור קטגוריה לתרגיל.', 'Please choose a category for the drill.'))
      return
    }

    setSaving(true)

    // שומרים את שכבות הגיל בסדר הקבוע
    const orderedGroups = AGE_GROUPS.filter((g) => ageGroups.includes(g))

    // בונים את הרשומה. שדות ריקים נשמרים כ-null כדי לא ללכלך את המסד.
    // created_by ו-created_at מתמלאים אוטומטית במסד הנתונים.
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      age_groups: orderedGroups,
      tags: tags.length ? tags : null,
      difficulty: difficulty || null,
      duration_minutes: duration ? Number(duration) : null,
      goal: goal.trim() || null,
      equipment: equipment.trim() || null,
      players: players.trim() || null,
      reps: reps.trim() || null,
      video_url: videoUrl.trim() || null,
      coach_notes: coachNotes.trim() || null,
      image_url: imageUrl || null,
      is_public: isPublic,
      board: board,
    }

    // עריכה → עדכון הרשומה הקיימת (RLS מתיר רק לבעל התרגיל); אחרת → הוספה חדשה
    const { error } = editing
      ? await supabase.from('drills').update(payload).eq('id', drill.id)
      : await supabase.from('drills').insert(payload)

    setSaving(false)

    if (error) {
      setError(L('שמירה נכשלה: ', 'Save failed: ') + error.message)
      toast.error(L('שמירה נכשלה: ', 'Save failed: ') + error.message)
    } else {
      if (!editing) {
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* לא קריטי */ }
      }
      toast.success(editing ? L('התרגיל עודכן', 'Drill updated') : L('התרגיל נשמר בספרייה', 'Drill saved to the library'))
      onSaved()
    }
  }

  // ---- בלוקים משותפים לשני המצבים (מוגדרים כ-JSX, לא כקומפוננטות — שומר פוקוס) ----
  const difficultyField = (
    <div className="field-group">
      <span className="field-label">{L('רמת קושי', 'Difficulty')}</span>
      <select className="finder-input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
        <option value="">{L('— בחר רמה —', '— Choose a level —')}</option>
        {DIFFICULTY_LEVELS.map((level) => (
          <option key={level} value={level}>{tr(level)}</option>
        ))}
      </select>
    </div>
  )

  const tagsField = (
    <div className="field-group">
      <span className="field-label">{L('תגיות (לסינון חופשי)', 'Tags (for free filtering)')}</span>
      {tags.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {tags.map((t) => (
            <button
              type="button"
              key={t}
              className="chip selected tag-chip"
              onClick={() => removeTag(t)}
              aria-label={L(`הסרת התגית ${t}`, `Remove tag ${t}`)}
            >
              {t} <X size={12} />
            </button>
          ))}
        </div>
      )}
      <div className="tag-add">
        <input
          type="text"
          className="finder-input"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={L('לדוגמה: חימום, 3 נגד 3, פיק אנד רול', 'e.g. warm-up, 3-on-3, pick and roll')}
          aria-label={L('הוספת תגית', 'Add tag')}
        />
        <button type="button" className="btn-ghost" onClick={addTag}>
          {L('הוסף', 'Add')}
        </button>
      </div>
    </div>
  )

  const videoField = (
    <label>
      {L('קישור לסרטון', 'Video link')}
      <input
        type="url"
        value={videoUrl}
        onChange={(e) => setVideoUrl(e.target.value)}
        placeholder="https://youtube.com/..."
        dir="ltr"
      />
    </label>
  )

  const imageField = (
    <div className="field-group">
      <span className="field-label">{L('תמונת התרגיל (לא חובה)', 'Drill image (optional)')}</span>
      {imageUrl ? (
        <div className="img-preview">
          <img src={imageUrl} alt={L('תצוגה מקדימה של התרגיל', 'Drill preview')} />
          <button
            type="button"
            className="img-remove"
            onClick={() => setImageUrl('')}
            aria-label={L('הסרת תמונה', 'Remove image')}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <label className="btn-soft img-pick">
          <Camera size={16} />
          {uploadingImage ? L('מעלה...', 'Uploading...') : L('צילום או העלאת תמונה', 'Take or upload a photo')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onImagePick}
            disabled={uploadingImage}
            hidden
          />
        </label>
      )}
    </div>
  )

  const visibilityField = (
    <div className="field-group">
      <span className="field-label">{L('נראות', 'Visibility')}</span>
      <div className="chips">
        <button
          type="button"
          className={isPublic ? 'chip selected' : 'chip'}
          onClick={() => setIsPublic(true)}
        >
          {L('שיתוף לקהילה', 'Share with community')}
        </button>
        <button
          type="button"
          className={!isPublic ? 'chip selected' : 'chip'}
          onClick={() => setIsPublic(false)}
        >
          {L('פרטי (רק אני)', 'Private (only me)')}
        </button>
      </div>
    </div>
  )

  if (preview) {
    const hasBoard = board && board.steps && board.steps.length > 0
    return (
      <div className="welcome-card">
        <div className="nb-actions">
          <button type="button" className="btn-ghost" onClick={() => setPreview(false)}>
            <Pencil size={16} /> {L('חזרה לעריכה', 'Back to editing')}
          </button>
          <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={handleSubmit} disabled={saving} aria-busy={saving}>
            {saving ? <span className="btn-spinner" aria-hidden="true" /> : <Check size={16} />}
            {saving ? L('שומר...', 'Saving...') : editing ? L('שמירת השינויים', 'Save changes') : L('שמירת התרגיל', 'Save drill')}
          </button>
          <button type="button" className="btn-soft" onClick={() => window.print()}>
            <Printer size={16} /> {L('הדפסה', 'Print')}
          </button>
        </div>
        <div className="drill-notebook-view">
          <NotebookPage kind="drill" drill={previewDrill} club={coach.club} coachName={coach.name} noCourt />
          {hasBoard && (
            <div className="dnv-court">
              <span className="detail-label">{L('על המגרש (נגן אנימציה)', 'On court (play animation)')}</span>
              <TacticsBoard value={board} readOnly />
            </div>
          )}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
      </div>
    )
  }

  const dateLabel = new Date().toLocaleDateString(L('he-IL', 'en-US'), {
    day: 'numeric', month: 'numeric', year: 'numeric',
  })

  return (
    <div className="welcome-card">
      <div className="drillform-head">
        <h2 style={{ margin: 0 }}>{editing ? L('עריכת תרגיל', 'Edit drill') : L('תרגיל חדש', 'New drill')}</h2>
        <div className="chips nb-mode-toggle">
          <button
            type="button"
            className={mode === 'notebook' ? 'chip selected' : 'chip'}
            onClick={() => setMode('notebook')}
          >
            <BookOpen size={14} /> {L('מחברת מאמן', 'Coach notebook')}
          </button>
          <button
            type="button"
            className={mode === 'form' ? 'chip selected' : 'chip'}
            onClick={() => setMode('form')}
          >
            <ClipboardList size={14} /> {L('טופס מלא', 'Full form')}
          </button>
        </div>
      </div>
      {mode === 'notebook' && (
        <p className="muted small" style={{ marginTop: 6 }}>
          {L('כותבים ישר על המחברת — בדיוק כמו במציאות. רק שם וקטגוריה חובה.', 'Write straight on the notebook — just like the real thing. Only a name and category are required.')}
        </p>
      )}

      <form onSubmit={handleSubmit} className={mode === 'form' ? 'auth-form' : undefined} style={{ marginTop: 18 }}>
        {mode === 'notebook' ? (
          <>
            {/* ===== המחברת — כותבים ישירות על הדף ===== */}
            <div className="notebook nb-edit" dir="rtl">
              <div className="nb-header">
                <div className="nb-header-top">
                  <span className="nb-club">{coach.club || 'CourtSide'}</span>
                  <span className="nb-date">{dateLabel}</span>
                </div>
                <h2 className="nb-title">{L('דף תרגיל', 'Drill sheet')}</h2>
                {coach.name && (
                  <div className="nb-coach">{L('שם המאמן: ', 'Coach: ')}{coach.name}</div>
                )}
              </div>

              <div className="nb-edit-body">
                <input
                  className="nb-write nb-write-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={L('שם התרגיל...', 'Drill name...')}
                  aria-label={L('שם התרגיל', 'Drill name')}
                  required
                />

                {/* שורת הפרטים — כמו משבצות בשולי מחברת אמיתית */}
                <div className="nb-edit-meta">
                  <label className="nb-slot">
                    <Clock size={14} aria-hidden="true" />
                    <span className="nb-slot-k">{L('זמן', 'Time')}</span>
                    <input
                      className="nb-write nb-slot-in nb-slot-num"
                      type="number"
                      min="1"
                      dir="ltr"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="10"
                      aria-label={L('משך בדקות', 'Duration in minutes')}
                    />
                    <span className="nb-slot-unit">{L("דק'", 'min')}</span>
                  </label>
                  <label className="nb-slot">
                    <Users size={14} aria-hidden="true" />
                    <span className="nb-slot-k">{L('שחקנים', 'Players')}</span>
                    <input
                      className="nb-write nb-slot-in"
                      type="text"
                      value={players}
                      onChange={(e) => setPlayers(e.target.value)}
                      placeholder={L('זוגות / 5+', 'pairs / 5+')}
                      aria-label={L('מספר שחקנים', 'Number of players')}
                    />
                  </label>
                  <label className="nb-slot">
                    <Package size={14} aria-hidden="true" />
                    <span className="nb-slot-k">{L('ציוד', 'Gear')}</span>
                    <input
                      className="nb-write nb-slot-in"
                      type="text"
                      value={equipment}
                      onChange={(e) => setEquipment(e.target.value)}
                      placeholder={L('כדורים, קונוסים', 'balls, cones')}
                      aria-label={L('ציוד נדרש', 'Equipment needed')}
                    />
                  </label>
                  <label className="nb-slot">
                    <Repeat size={14} aria-hidden="true" />
                    <span className="nb-slot-k">{L('חזרות', 'Reps')}</span>
                    <input
                      className="nb-write nb-slot-in"
                      type="text"
                      value={reps}
                      onChange={(e) => setReps(e.target.value)}
                      placeholder={L('3×10', '3×10')}
                      aria-label={L('חזרות / סטים', 'Reps / sets')}
                    />
                  </label>
                </div>

                <label className="nb-slot nb-goal">
                  <Target size={15} aria-hidden="true" />
                  <span className="nb-slot-k">{L('מטרה', 'Goal')}</span>
                  <input
                    className="nb-write nb-slot-in nb-grow"
                    type="text"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder={L('מה רוצים להשיג בתרגיל...', 'What the drill should achieve...')}
                    aria-label={L('מטרת התרגיל', 'Drill goal')}
                  />
                </label>

                <div className="nb-edit-chips">
                  <span className="nb-slot-k">
                    {L('קטגוריה', 'Category')} <span className="req-star" aria-hidden="true">*</span>
                  </span>
                  <div className="chips">
                    {DRILL_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={category === cat ? 'chip selected' : 'chip'}
                        onClick={() => setCategory(cat)}
                      >
                        {tr(cat)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="nb-edit-chips">
                  <span className="nb-slot-k">{L('שכבות גיל', 'Age groups')}</span>
                  <div className="chips">
                    {AGE_GROUPS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={ageGroups.includes(g) ? 'chip selected' : 'chip'}
                        onClick={() => toggleAgeGroup(g)}
                      >
                        {trTeam(g)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="nb-writeblock">
                  <div className="nb-writeblock-h">{L('תיאור וביצוע', 'Description & execution')}</div>
                  <NbLines
                    value={description}
                    onChange={setDescription}
                    placeholder={L('איך מבצעים את התרגיל — שלב אחרי שלב...', 'How the drill runs — step by step...')}
                    ariaLabel={L('תיאור התרגיל', 'Drill description')}
                  />
                </div>

                <div className="nb-writeblock">
                  <div className="nb-writeblock-h">{L('דגשים למאמן', 'Coach notes')}</div>
                  <NbLines
                    value={coachNotes}
                    onChange={setCoachNotes}
                    placeholder={L('נקודות חשובות לשים לב אליהן...', 'Key points to watch for...')}
                    ariaLabel={L('דגשים למאמן', 'Coach notes')}
                  />
                </div>
              </div>
            </div>

            {/* אפשרויות נוספות — מקופל כדי שהמחברת תישאר נקייה */}
            <details className="nb-more">
              <summary>
                <SlidersHorizontal size={15} aria-hidden="true" />
                {L('עוד אפשרויות — קושי, תגיות, וידאו, תמונה ושיתוף', 'More options — difficulty, tags, video, image & sharing')}
              </summary>
              <div className="nb-more-body auth-form">
                {difficultyField}
                {tagsField}
                {videoField}
                {imageField}
                {visibilityField}
              </div>
            </details>

            {/* לוח טקטיקה — שרטוט התרגיל על המגרש */}
            <section className="form-section" style={{ marginTop: 16 }}>
              <TacticsBoard value={board} onChange={setBoard} />
            </section>
          </>
        ) : (
          <>
            {/* ===== טופס מלא — למי שמעדיף שדות קלאסיים ===== */}
            <section className="form-section">
              <h3 className="form-section-title">
                <ClipboardList size={16} /> {L('פרטי בסיס', 'Basics')}
              </h3>
              <label>
                {L('שם התרגיל', 'Drill name')} <span className="req-star" aria-hidden="true">*</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={L('לדוגמה: כדרור בין קונוסים', 'e.g. Dribbling between cones')}
                  required
                />
              </label>

              <label>
                {L('תיאור', 'Description')}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={L('איך מבצעים את התרגיל...', 'How the drill is performed...')}
                  rows={3}
                />
              </label>

              <div className="field-group">
                <span className="field-label">{L('קטגוריה', 'Category')} <span className="req-star" aria-hidden="true">*</span></span>
                <select className="finder-input" value={category} onChange={(e) => setCategory(e.target.value)} required>
                  <option value="">{L('— בחר קטגוריה —', '— Choose a category —')}</option>
                  {DRILL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{tr(cat)}</option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <span className="field-label">{L('שכבות גיל מתאימות', 'Suitable age groups')}</span>
                <MultiSelect
                  options={AGE_GROUPS}
                  selected={ageGroups}
                  onToggle={toggleAgeGroup}
                  renderLabel={trTeam}
                  placeholder={L('בחר שכבות גיל...', 'Select age groups...')}
                />
              </div>

              {tagsField}
            </section>

            <section className="form-section">
              <h3 className="form-section-title">
                <SlidersHorizontal size={16} /> {L('פרטים נוספים', 'Additional details')}
                <span className="form-section-hint">{L('לא חובה', 'optional')}</span>
              </h3>

              {difficultyField}

              <div className="form-grid-2">
                <label>
                  {L('משך (בדקות)', 'Duration (minutes)')}
                  <input
                    type="number"
                    min="1"
                    dir="ltr"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder={L('לדוגמה: 10', 'e.g. 10')}
                  />
                </label>
                <label>
                  {L('מטרת התרגיל', 'Drill goal')}
                  <input
                    type="text"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder={L('לדוגמה: שיפור דיוק במסירה', 'e.g. improve passing accuracy')}
                  />
                </label>
              </div>

              <div className="form-grid-2">
                <label>
                  {L('ציוד נדרש', 'Equipment needed')}
                  <input
                    type="text"
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    placeholder={L('לדוגמה: כדורים, קונוסים', 'e.g. balls, cones')}
                  />
                </label>
                <label>
                  {L('מספר שחקנים', 'Number of players')}
                  <input
                    type="text"
                    value={players}
                    onChange={(e) => setPlayers(e.target.value)}
                    placeholder={L('לדוגמה: זוגות, או 5+', 'e.g. pairs, or 5+')}
                  />
                </label>
              </div>

              <label>
                {L('חזרות / סטים', 'Reps / sets')}
                <input
                  type="text"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  placeholder={L('לדוגמה: 3 סטים של 10', 'e.g. 3 sets of 10')}
                />
              </label>

              {videoField}

              <label>
                {L('דגשים למאמן', 'Coach notes')}
                <textarea
                  value={coachNotes}
                  onChange={(e) => setCoachNotes(e.target.value)}
                  placeholder={L('נקודות חשובות לשים לב אליהן...', 'Key points to watch for...')}
                  rows={2}
                />
              </label>

              {imageField}
            </section>

            <section className="form-section">
              <TacticsBoard value={board} onChange={setBoard} />
            </section>

            <section className="form-section">
              <h3 className="form-section-title">
                <Globe2 size={16} /> {L('נראות', 'Visibility')}
              </h3>
              {visibilityField}
            </section>
          </>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving} aria-busy={saving}>
            {saving && <span className="btn-spinner" aria-hidden="true" />}
            {saving ? L('שומר...', 'Saving...') : editing ? L('שמירת השינויים', 'Save changes') : L('שמירת התרגיל', 'Save drill')}
          </button>
          <button
            type="button"
            className="btn-soft"
            onClick={() => setPreview(true)}
            disabled={!title.trim()}
          >
            <BookOpen size={16} /> {L('תצוגה מקדימה', 'Preview')}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onCancel}
            disabled={saving}
          >
            {L('ביטול', 'Cancel')}
          </button>
        </div>
      </form>

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  )
}
