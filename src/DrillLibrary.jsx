import { toast } from './toast'
import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { Dumbbell, Plus, X } from 'lucide-react'
import { supabase } from './supabaseClient'
import { AGE_GROUPS, DRILL_CATEGORIES } from './constants'
import { L, tr, trTeam } from './i18n'
import { cacheGet, cachePut, isNetErr } from './offline'
import { ErrorState } from './states'
import useFocusTrap from './useFocusTrap'
import { confirmDialog } from './confirm'
import DrillForm from './DrillForm'
import DrillCard from './DrillCard'
import SendToPlayers from './SendToPlayers.jsx'
import MultiSelect from './MultiSelect'
import { SkeletonCards } from './Skeleton'
import CourtArt from './CourtArt'

// עימוד הספרייה + רשימת עמודות מפורשת במקום select('*').
// ספריית תרגילים קהילתית גדלה בלי גבול — שליפה אחת של כל הטבלה עם שלושה
// joins (מחבר, כל הדירוגים, כל השמירות) הייתה מאטה את המסך ומנפחת egress.
const DRILLS_PAGE = 30
const DRILL_JOINS = 'author:profiles(first_name, last_name, club), drill_ratings(rating, user_id), saved_drills(user_id)'
const DRILL_BASE = 'id, title, description, category, age_groups, duration_minutes, equipment, video_url, players, difficulty, goal, reps, coach_notes, created_by, created_at'
const DRILL_COLS = `${DRILL_BASE}, tags, is_public, board, image_url, ${DRILL_JOINS}`
// מסד שטרם הריץ את supabase_launch_migration.sql — בלי tags/is_public/board/image_url
const DRILL_COLS_LEGACY = `${DRILL_BASE}, ${DRILL_JOINS}`

// "עוד לא נפרס בפרודקשן" — עמודה/פונקציה/טבלה שחסרות במסד
const notDeployed = (e) =>
  ['42703', '42883', '42P01', 'PGRST202'].includes(e?.code) ||
  /does not exist/i.test(e?.message || '')

// חיטוי מחרוזת חיפוש לפני הרכבת פילטר `or` של PostgREST. הפרסר מפרק את
// המחרוזת לפי פסיקים/סוגריים/נקודות, ו-% ו-_ הם תווי ג׳וקר של ilike — מאמן
// שיקליד «3 על 2 (חצי מגרש)» היה מקבל 400 ומסך שגיאה במקום תוצאות.
const safeSearch = (s) =>
  String(s || '')
    .trim()
    .replace(/[,()."'%_*\\:{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// כרטיס תרגיל ממומו: בלי memo כל הקלדה בשדה החיפוש רינדרה מחדש את כל
// הכרטיסים ברשת. ה-closure של המחיקה נוצר כאן ולא אצל ההורה, כך
// שכל ה-props שיורדים מלמעלה יציבים בין רינדורים.
const DrillCardRow = memo(function DrillCardRow({ drill, userId, onDelete, ...rest }) {
  const del = useCallback(() => onDelete(drill.id), [onDelete, drill.id])
  return <DrillCard drill={drill} userId={userId} onDelete={del} {...rest} />
})

// מסך "ספריית תרגילים" — מציג את כל התרגילים, עם חיפוש, סינון,
// הוספה, דירוג בכוכבים, שמירה למועדפים, ומחיקת תרגיל שלי.
// props:
//   session - המשתמש המחובר
export default function DrillLibrary({ session, profile, embedded, initialSource }) {
  // מלכודת פוקוס לבוררי "הוסף לתוכנית" / "שלח לשחקנים"
  const [drills, setDrills] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const [offlineList, setOfflineList] = useState(false) // הרשימה מהעותק השמור — אין רשת
  const [adding, setAdding] = useState(false) // האם מציגים את טופס ההוספה
  const [editingDrill, setEditingDrill] = useState(null) // תרגיל שנבחר לעריכה

  // ערכי הסינון
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('') // קטגוריה אחת, או ריק = הכול
  const [ageFilter, setAgeFilter] = useState([])
  const [tagFilter, setTagFilter] = useState('') // סינון לפי תגית
  const [onlySaved, setOnlySaved] = useState(false) // הצג רק מועדפים
  const [source, setSource] = useState(initialSource || '') // מקור התרגיל: '' הכול | 'mine' | 'community'
  const [sortBy, setSortBy] = useState('new') // 'new' = חדשים, 'rating' = מדורגים

  // בורר "הוספה לתוכנית"
  const [planPicker, setPlanPicker] = useState(null) // התרגיל שנבחר להוספה
  const [myPlans, setMyPlans] = useState([])
  const [newPlanName, setNewPlanName] = useState('')
  const [addingToPlan, setAddingToPlan] = useState(false)

  // בורר "שליחה לשחקנים" — קבוצות + שחקנים מחוברים
  const [sendPicker, setSendPicker] = useState(null) // התרגיל שנבחר לשליחה
  // fail-closed: כל עוד הפרופיל לא נטען אין הרשאות מאמן. קודם ברירת המחדל
  // הייתה 'coach', כך שכפתורי המאמן הבהבו לשחקן בכל טעינה (ה-RLS אמנם חוסם
  // בפועל, אבל כיוון ברירת המחדל היה הפוך מעקרון fail-safe).
  const isCoach = !!profile && profile.role !== 'player'

  // מלכודת פוקוס לבוררי "הוספה לתוכנית" / "שליחה לשחקנים" (רק אחד פתוח בכל רגע)
  const dlgRef = useFocusTrap(!!planPicker, () => setPlanPicker(null))

  // מזהה בקשה — עם debounce על החיפוש תגובה איטית של «קליע» עלולה לחזור
  // אחרי זו של «קליעה» ולדרוס אותה. רק התשובה של הבקשה האחרונה נכנסת ל-state.
  const reqRef = useRef(0)

  const openPlanPicker = useCallback(async (drill) => {
    setPlanPicker(drill)
    setNewPlanName('')
    const { data } = await supabase
      .from('training_plans')
      .select('id, name')
      .eq('created_by', session.user.id)
      .order('created_at', { ascending: false })
    setMyPlans(data || [])
  }, [session.user.id])

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

  // קישור plan_items לבדו אינו מופיע בשום מקום בדף המחברת, ולכן המאמן
  // פתח את התוכנית ולא ראה שינוי. מוסיפים לגוף הדף בדיוק את המקטע
  // ש«תרגיל מהספרייה» של המחברת בונה: שם + תיאור, מופרדים בשורת רווח.
  // body ריק/חסר (מסד ותיק, או תוכנית שנבנתה מפריטים) — לא נוגעים, הדף
  // נופל שם ממילא לפריטים.
  const appendDrillToBody = async (planId, drill) => {
    const { data, error } = await supabase
      .from('training_plans')
      .select('body')
      .eq('id', planId)
      .maybeSingle()
    if (error || !data || data.body == null) return
    const chunk = [drill.title || L('תרגיל', 'Drill'), (drill.description || '').trim()].filter(Boolean).join('\n')
    const before = String(data.body).replace(/\s+$/, '')
    const next = before + (before ? '\n\n' : '') + chunk + '\n'
    await supabase.from('training_plans').update({ body: next }).eq('id', planId)
  }

  const addDrillToPlan = async (planId) => {
    if (!planPicker || addingToPlan) return
    setAddingToPlan(true)
    const { error } = await insertItem(planId, planPicker)
    if (error) { setAddingToPlan(false); toast.error(L('ההוספה נכשלה: ', 'Failed to add: ') + error.message); return }
    await appendDrillToBody(planId, planPicker)
    setAddingToPlan(false)
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
  // opts.append — «טען עוד»: מוסיף את העמוד הבא במקום להחליף את הרשימה.
  // ברענון שקט נשמר מספר העמודים שכבר נטענו, כדי שדירוג/שמירה לא יקצצו
  // את הרשימה חזרה לעמוד הראשון.
  //
  // הסינון עבר למסד: קודם הוא רץ רק על העמוד שנטען, ולכן חיפוש של תרגיל
  // אמיתי שנמצא בעמוד 7 החזיר «אין תוצאות לסינון» — האפליקציה הצהירה שאין
  // דבר שקיים. פילטרים שקיימים רק אחרי supabase_launch_migration.sql
  // (tags/is_public) מוחלים רק בענף המודרני; בענף ה-legacy הם נשארים
  // לסינון הלקוח שלמטה, שנשאר כרשת ביטחון על מה שחזר.
  async function loadDrills(opts = {}) {
    const append = !!opts.append
    const from = append ? drills.length : 0
    const size = append ? DRILLS_PAGE : Math.max(DRILLS_PAGE, opts.silent ? drills.length : 0)
    const reqId = ++reqRef.current
    if (append) setLoadingMore(true)
    else if (!opts.silent) setLoading(true)

    // החיפוש עובר למסד רק אם החיטוי לא שינה את המחרוזת. אחרת נשארים עם
    // סינון הלקוח בלבד — כך שאילתה מחוטאת לעולם לא תחזיר שורה שרשת
    // הביטחון בלקוח (שמשווה למחרוזת המקורית) תזרוק מיד אחר כך.
    const rawQ = String(search || '').trim()
    const clean = safeSearch(search)
    const q = clean && clean === rawQ ? clean : ''
    const uid = session.user.id
    const page = (cols, modern) => {
      // onlySaved: !inner מצמצם לתרגילים שיש להם שורת saved_drills. ה-RLS על
      // saved_drills מחזיר רק את השורות שלי, ולכן זה בדיוק «המועדפים שלי».
      let sel = supabase
        .from('drills')
        .select(onlySaved ? cols.replace('saved_drills(', 'saved_drills!inner(') : cols)
      if (catFilter) sel = sel.eq('category', catFilter)
      if (ageFilter.length) sel = sel.overlaps('age_groups', ageFilter)
      if (source === 'mine') sel = sel.eq('created_by', uid)
      else if (source === 'community') {
        sel = sel.neq('created_by', uid)
        // is_public חסר (שורות ותיקות) נחשב משותף — כמו בסינון הלקוח
        if (modern) sel = sel.not('is_public', 'is', false)
      }
      // תגית עם פסיק/סוגריים תשבור את ליטרל המערך של PostgREST — כזו נשארת
      // לסינון הלקוח בלבד
      if (modern && tagFilter && !/[,{}"\\]/.test(tagFilter)) sel = sel.contains('tags', [tagFilter])
      if (q) {
        // חיפוש טקסט על שם/תיאור, ובענף המודרני גם על תגית מלאה
        // 18.8 — הקטגוריה היא מלל חופשי, ולכן החיפוש מכסה גם אותה
        const parts = [`title.ilike.%${q}%`, `description.ilike.%${q}%`, `category.ilike.%${q}%`]
        if (modern) parts.push(`tags.cs.{${q}}`)
        sel = sel.or(parts.join(','))
      }
      return sel.order('created_at', { ascending: false }).range(from, from + size - 1)
    }

    let { data, error } = await page(DRILL_COLS, true)
    // מסד שטרם הריץ את supabase_launch_migration.sql — חסרות עמודות
    if (error && notDeployed(error)) ({ data, error } = await page(DRILL_COLS_LEGACY, false))

    // מטמון אופליין. נשמר רק מתצוגת ברירת המחדל (העותק הוא הרשימה המלאה,
    // לא תוצאה מסוננת), עם המאמן במפתח — עותק של חשבון אחד לא מוגש לאחר
    // במכשיר משותף. נופלים אליו בכל כשל רשת, כולל עם חיפוש או פילטר
    // (29.8): רשת הביטחון בלקוח (filtered שלמטה) מסננת את העותק לפי מה
    // שפעיל עכשיו. אבל לא ברענון שקט (אחרי דירוג/שמירה/מחיקה) — החוזה
    // שלו הוא שכשל חולף לא נוגע ברשימה שעל המסך, והחלפה בעותק השמור
    // הייתה מעלימה את הכרטיס שהמאמן בדיוק דירג.
    const cacheable = !append && !q && !catFilter && !ageFilter.length && !tagFilter && !onlySaved && source !== 'mine' && source !== 'community'
    let offlineFallback = false
    if (error && isNetErr(error) && !append && !opts.silent) {
      const c = await cacheGet(`drills:list:${uid}`)
      if (c?.data) { data = c.data; error = null; offlineFallback = true }
    } else if (!error && cacheable) {
      cachePut(`drills:list:${uid}`, data || [])
    }

    // תגובה של חיפוש קודם שהגיעה מאוחר — אסור לה לדרוס תוצאה עדכנית.
    // דגלי הטעינה כן מתאפסים גם אז, אחרת שלד הטעינה היה יכול להיתקע לנצח.
    const stale = reqId !== reqRef.current
    if (!stale) {
      if (error) {
        if (append) toast.error(L('טעינת התרגילים הנוספים נכשלה', 'Failed to load more drills'))
        else if (!opts.silent) setError(L('שגיאה בטעינת התרגילים: ', 'Error loading drills: ') + error.message)
      } else {
        const rows = data || []
        setDrills((cur) => (append ? [...cur, ...rows] : rows))
        // מהעותק השמור אין «טען עוד» — הוא היה נכשל מיד; רשת חיה מנקה
        // את חיווי האופליין. הקביעה כאן, אחרי בדיקת ה-stale — תגובה
        // מאוחרת של חיפוש ישן לא מדליקה את הבאנר מעל תוצאות חיות.
        setHasMore(offlineFallback ? false : rows.length === size)
        setOfflineList(offlineFallback)
        setError(null) // רענון מוצלח מנקה שגיאה קודמת שנתקעה
      }
    }
    if (append) setLoadingMore(false)
    else if (!opts.silent) setLoading(false)
  }

  // ה-handlers למטה חייבים להישאר יציבים (memo על כרטיס התרגיל), ולכן
  // הם קוראים ל-loadDrills דרך ref במקום לתפוס אותו ב-closure.
  const loadRef = useRef(loadDrills)
  loadRef.current = loadDrills

  // כל שינוי סינון מריץ שליפה חדשה מהעמוד הראשון (כולל הטעינה הראשונה).
  // על החיפוש יש debounce קצר כדי לא לשלוח בקשה בכל הקלדה.
  useEffect(() => {
    const t = setTimeout(() => loadRef.current(), search ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, catFilter, ageFilter, tagFilter, onlySaved, source])

  // דירוג תרגיל (1–5). upsert = מוסיף דירוג חדש, או מעדכן אם כבר דירגתי.
  const handleRate = useCallback(async (drillId, rating) => {
    const { error } = await supabase
      .from('drill_ratings')
      .upsert(
        { drill_id: drillId, user_id: session.user.id, rating },
        { onConflict: 'drill_id,user_id' }
      )
    if (error) {
      toast.error(L('הדירוג נכשל: ', 'Rating failed: ') + error.message)
    } else {
      loadRef.current({ silent: true }) // מרענן ברקע — בלי לקרוס את הכרטיס המורחב
    }
  }, [session.user.id])

  // שמירה/הסרה ממועדפים (טוגל)
  const handleToggleSave = useCallback(async (drillId, currentlySaved) => {
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
    loadRef.current({ silent: true })
  }, [session.user.id])

  // מחיקת תרגיל (רק תרגיל של המשתמש עצמו — מאובטח גם במסד)
  const handleDelete = useCallback(async (id) => {
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
      loadRef.current({ silent: true })
    }
  }, [])

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
    setSource('')
  }

  const hasFilters = search || catFilter || ageFilter.length > 0 || tagFilter || onlySaved || source

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
      (d.category || '') +
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
    // מקור: שלי = מה שיצרתי; קהילה = תרגיל משותף של מאמן אחר.
    // is_public חסר (שורות ותיקות) נחשב משותף — כמו ב"התרגילים שלי" בפרופיל.
    const mine = d.created_by === session.user.id
    const sourceOk =
      source === '' || (source === 'mine' ? mine : !mine && d.is_public !== false)
    return searchOk && catOk && ageOk && tagOk && savedOk && sourceOk
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
      {/* embedded = בתוך מסך «אימונים ותרגילים»: הכותרת מגיעה מהבאנר של
          המסך המשותף, וכאן נשארת רק הפעולה. */}
      {embedded ? (
        <div className="dl-embed-acts">
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden="true" /> {L('הוספת תרגיל', 'Add drill')}
          </button>
        </div>
      ) : (
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('ספריית תרגילים', 'Drill library')}</div>
          <h1>{L('מאגר התרגילים', 'Drill collection')}</h1>
          <p className="page-desc">{L('חיפוש, דירוג ושמירת תרגילים מכל קהילת המאמנים.', 'Search, rate and save drills from the whole coaching community.')}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden="true" /> {L('הוספת תרגיל', 'Add drill')}
          </button>
        </div>
      </header>
      )}

      {/* כרטיס פוסטר — איור המגרש על גרדיאנט נייבי (DESIGN.md §2ב, דפוס 1),
          במקום צילום הסטוק שהיה כאן. הגובה, הרדיוס והצעיף לא השתנו.
          שורת הליווי אינה כותרת display (DESIGN.md §2: אחת למסך, וה-h1 שמעל תפס אותה). */}
      <div className="drill-poster">
        <span className="drill-poster-art" aria-hidden="true">
          <CourtArt variant="drills" />
        </span>
        <span className="drill-poster-line">
          {L('תרגיל טוב הוא כזה שהקבוצה זוכרת גם מחר.', 'A good drill is one the team still remembers tomorrow.')}
        </span>
      </div>

      {/* סרגל סינון אופקי — חיפוש, קטגוריה וגיל בשורה אחת */}
      <div className="filter-bar">
        <input
          className="finder-input filter-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={L('חיפוש בשם, בתיאור או בקטגוריה...', 'Search by name, description or category...')}
          aria-label={L('חיפוש תרגילים', 'Search drills')}
        />
        <select
          className="finder-input filter-select"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          aria-label={L('סינון לפי קטגוריה', 'Filter by category')}
        >
          <option value="">{L('כל הקטגוריות', 'All categories')}</option>
          {/* 18.8 — הקטגוריה היא מלל חופשי: לצד הקטגוריות המוכרות מוצגות גם
              אלה שמופיעות בתרגילים שנטענו */}
          {[...DRILL_CATEGORIES, ...[...new Set(drills.map((d) => (d.category || '').trim()).filter((c) => c && !DRILL_CATEGORIES.includes(c)))].sort((a, b) => a.localeCompare(b, 'he'))].map((cat) => (
            <option key={cat} value={cat}>{tr(cat)}</option>
          ))}
          {catFilter && !DRILL_CATEGORIES.includes(catFilter) && !drills.some((d) => (d.category || '').trim() === catFilter) && (
            <option value={catFilter}>{catFilter}</option>
          )}
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
        {/* בורר מקור — לראות רק את התרגילים שלי, רק את אלה שהקהילה שיתפה, או הכול */}
        <select
          className="finder-input filter-select"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label={L('סינון לפי מקור', 'Filter by source')}
        >
          <option value="">{L('כל התרגילים', 'All drills')}</option>
          <option value="mine">{L('התרגילים שלי', 'My drills')}</option>
          <option value="community">{L('תרגילים מהקהילה', 'Community drills')}</option>
        </select>
      </div>
      {offlineList && (
        <p className="alert alert-info" role="status">
          {L('אין חיבור לאינטרנט — מוצגים התרגילים השמורים במכשיר.', 'No internet connection — showing the drills saved on this device.')}
        </p>
      )}
      {/* סינון ומיון היו באותה שורת צ׳יפים ובאותו עיצוב — אי אפשר היה לדעת
          מה מצמצם את הרשימה ומה רק משנה סדר. עכשיו שתי קבוצות מסומנות. */}
      <div className="filter-chips-row">
        <span className="filter-group" role="group" aria-label={L('סינון', 'Filter')}>
          <span className="filter-group-label">{L('סינון', 'Filter')}</span>
          <button
            type="button"
            className={onlySaved ? 'chip selected' : 'chip'}
            onClick={() => setOnlySaved(!onlySaved)}
            aria-pressed={onlySaved}
          >
            {L('המועדפים שלי', 'My favorites')}
          </button>
          {/* «התרגילים שלי» עבר לבורר המקור שבסרגל למעלה — שני פקדים
              לאותו סינון היו יכולים לסתור זה את זה ולהחזיר רשימה ריקה. */}
        </span>
        <span className="filter-group" role="group" aria-label={L('סדר', 'Sort')}>
          <span className="filter-group-label">{L('סדר', 'Sort')}</span>
          <button
            type="button"
            className={sortBy === 'new' ? 'chip sort selected' : 'chip sort'}
            onClick={() => setSortBy('new')}
            aria-pressed={sortBy === 'new'}
          >
            {L('החדשים ביותר', 'Newest')}
          </button>
          <button
            type="button"
            className={sortBy === 'rating' ? 'chip sort selected' : 'chip sort'}
            onClick={() => setSortBy('rating')}
            aria-pressed={sortBy === 'rating'}
          >
            {L('דירוג גבוה', 'Highest rated')}
          </button>
        </span>
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
          <ErrorState message={error} onRetry={() => loadDrills()} />
        ) : results.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ic">
              <Dumbbell size={26} />
            </span>
            {/* הצהרה מוחלטת («עדיין לא שמרת תרגילים») מותרת רק כשאין עוד מה
                להביא. כשיש עוד עמוד — הניסוח מדויק: לא נמצא *במה שנטען*,
                ופעולת ההמשך היא «טען עוד» ולא «נקה סינון». */}
            <div className="empty-title">
              {offlineList
                ? L('לא נמצא בין התרגילים השמורים במכשיר', 'Not found among the drills saved on this device')
                : hasMore
                ? L('לא נמצאו תוצאות בין התרגילים שנטענו', 'No matches among the drills loaded so far')
                : onlySaved
                ? L('עדיין לא שמרת תרגילים', "You haven't saved any drills yet")
                : source === 'community'
                ? L('אין עדיין תרגילים מהקהילה', 'No community drills yet')
                : source === 'mine'
                ? L('עוד לא יצרת תרגילים', "You haven't created any drills yet")
                : drills.length === 0 && !hasFilters
                ? L('הספרייה עדיין ריקה', 'The library is still empty')
                : L('אין תוצאות לסינון', 'No results for this filter')}
            </div>
            <p className="muted small">
              {offlineList
                ? L('בלי רשת רואים רק את מה שנשמר במכשיר — ייתכן שיש עוד בספרייה. כשהרשת תחזור הכול יופיע.', 'Without a connection only the drills saved on this device are shown — there may be more in the library. Everything appears once the network is back.')
                : hasMore
                ? L(`נבדקו ${drills.length} תרגילים — יש עוד בספרייה. «טען עוד תרגילים» ימשיך לחפש.`, `${drills.length} drills checked — there are more in the library. “Load more” keeps searching.`)
                : onlySaved
                ? L('לחצו על אייקון הסימנייה בכרטיס תרגיל כדי לשמור אותו לכאן.', 'Tap the bookmark icon on a drill card to keep it here.')
                : source === 'community'
                ? L('כשמאמנים אחרים ישתפו תרגילים הם יופיעו כאן. בינתיים אפשר לעבור ל"כל התרגילים".', 'Drills other coaches share will show up here. Meanwhile, switch back to "All drills".')
                : source === 'mine'
                ? L('לחץ "הוסף תרגיל" כדי ליצור את התרגיל הראשון שלך.', 'Tap "Add drill" to create your first one.')
                : drills.length === 0 && !hasFilters
                ? L('לחץ "הוסף תרגיל" כדי להוסיף את התרגיל הראשון לספרייה.', 'Tap "Add drill" to add the first drill to the library.')
                : L('נסה לשנות את מילות החיפוש או לנקות את הסינון.', 'Try changing your search terms or clearing the filters.')}
            </p>
            {hasMore ? (
              <button type="button" className="btn-primary empty-cta" onClick={() => loadDrills({ append: true })} disabled={loadingMore}>
                {loadingMore ? L('טוען…', 'Loading…') : L('טען עוד תרגילים', 'Load more drills')}
              </button>
            ) : hasFilters ? (
              <button type="button" className="btn-soft empty-cta" onClick={clearFilters}>
                {L('נקה סינון', 'Clear filters')}
              </button>
            ) : (
              <button type="button" className="btn-primary empty-cta" onClick={() => setAdding(true)}>
                <Plus size={18} aria-hidden="true" /> {L('הוספת תרגיל', 'Add drill')}
              </button>
            )}
          </div>
        ) : (
          <div className="drill-grid">
            <p className="muted small results-count">
              {results.length === 1 ? L('תרגיל אחד', '1 drill') : L(`${results.length} תרגילים`, `${results.length} drills`)}
            </p>
            {results.map((drill) => (
              <DrillCardRow
                key={drill.id}
                drill={drill}
                userId={session.user.id}
                isMine={drill.created_by === session.user.id}
                onRate={handleRate}
                onToggleSave={handleToggleSave}
                onDelete={handleDelete}
                onTagClick={setTagFilter}
                onAddToPlan={openPlanPicker}
                onSend={isCoach ? setSendPicker : undefined}
                onEdit={setEditingDrill}
              />
            ))}
          </div>
        )}

        {/* «טען עוד» — הספרייה נטענת בעמודים. בזמן סינון פעיל מסבירים
            שהסינון חל על מה שכבר נטען. */}
        {!loading && !error && hasMore && (
          <div className="form-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button type="button" className="btn-soft" onClick={() => loadDrills({ append: true })} disabled={loadingMore}>
              {loadingMore ? L('טוען…', 'Loading…') : L('טען עוד תרגילים', 'Load more drills')}
            </button>
          </div>
        )}
        {/* המיון «דירוג גבוה» עדיין מחושב מהדירוגים של מה שנטען בלבד — אין
            avg(rating) במסד. אומרים זאת במקום להציג «הכי מדורג בספרייה». */}
        {!loading && !error && hasMore && sortBy === 'rating' && results.length > 0 && (
          <p className="muted small" style={{ textAlign: 'center', marginTop: 6 }}>
            {L('הסדר לפי דירוג מחושב על התרגילים שנטענו — «טען עוד» ידייק אותו.', 'The rating order is computed over the drills loaded so far — “Load more” refines it.')}
          </p>
        )}
      </div>

      {/* בורר תוכנית — הוספת תרגיל לתוכנית אימון קיימת או חדשה */}
      {planPicker && (
        <div className="tm-overlay" role="dialog" aria-modal="true" onClick={() => setPlanPicker(null)}>
          <div className="tm-modal" ref={dlgRef} onClick={(e) => e.stopPropagation()}>
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

      {/* שליחה לשחקנים — אותו מסך אחד של פריט 4 במסמך, עם התרגיל נעול
          מראש. עד היום נפתח כאן בורר-בזק ששלח מיד בלחיצה: בלי תאריך
          יעד, בלי לבקש משהו בחזרה ובלי אישור. */}
      {sendPicker && (
        <SendToPlayers
          session={session}
          variant="sheet"
          preset={{ kind: 'drill', id: sendPicker.id, title: sendPicker.title, sub: sendPicker.category }}
          onClose={() => setSendPicker(null)}
        />
      )}
    </div>
  )
}
