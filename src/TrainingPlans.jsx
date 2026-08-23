import { toast } from './toast'
import { useState, useEffect, useRef } from 'react'
import { ClipboardList, BookOpen, Printer, ListChecks, Clock, Globe2, FileEdit, CalendarDays } from 'lucide-react'
// חצי «חזרה» מתהפכים לפי שפה — אסור לייבא ArrowRight ישירות מ-lucide
import { ArrowBack } from './DirIcon'
import { supabase } from './supabaseClient'
import PlanNotebook from './PlanNotebook'
import { PlanSheetById } from './PlanSheet'
import { SkeletonCards } from './Skeleton'
import { L, tr, trTeam } from './i18n'
import { ErrorState } from './states'
import { SITE_URL } from './constants'
import { waShare } from './share'
import { confirmDialog } from './confirm'

// יעד אורך אימון מלא. מוצג על כרטיס התוכנית ברשימה (13a) — לתוכנית ישנה
// שנבנתה מתרגילים עם משך; במחברת המלאה המשך הוא שדה ידני (duration_minutes).
export const PLAN_TARGET_MIN = 90

// עימוד רשימת התוכניות + רשימת עמודות מפורשת במקום select('*')
const PLANS_PAGE = 24
// הקטגוריה נדרשת לרצועת הזמן שבכרטיס (מסך 13a)
const PLAN_ITEMS_COLS = 'plan_items(id, duration_minutes, drill:drills(category))'
// 18.8 — המחברת המלאה: טיוטה, עודכן, קבוצה, תאריך ומשך על הכרטיס
const PLAN_COLS = `id, name, created_by, created_at, is_public, is_draft, updated_at, team, session_date, duration_minutes, ${PLAN_ITEMS_COLS}`
// מסד שטרם הריץ את supabase_notebook_18_8.sql — בלי עמודות המחברת
const PLAN_COLS_MID = `id, name, created_by, created_at, is_public, ${PLAN_ITEMS_COLS}`
// מסד שטרם הריץ את supabase_plans_community.sql — גם בלי עמודת is_public
const PLAN_COLS_LEGACY = `id, name, created_by, created_at, ${PLAN_ITEMS_COLS}`
const COLS_BY_TIER = [PLAN_COLS, PLAN_COLS_MID, PLAN_COLS_LEGACY]

// "עוד לא נפרס בפרודקשן" — עמודה/פונקציה/טבלה שחסרות במסד
const notDeployed = (e) =>
  ['42703', '42883', '42P01', 'PGRST202', 'PGRST204'].includes(e?.code) ||
  /does not exist|could not find/i.test(e?.message || '')

// טאב "תוכניות" — רשימת תוכניות האימון של המאמן, ובתוך כל תוכנית
// בונה שמרכיב אימון מתרגילים ברצף (סדר, משך והערה לכל תרגיל),
// ולחיצה על תרגיל חושפת את כל הפרטים שלו.
// props:
//   session - המשתמש המחובר
export default function TrainingPlans({ session, initialPlanId, onConsumeInitialPlan, initialSource }) {
  // שתי רשימות נפרדות עם עימוד משלהן. עד היום נשלף עמוד אחד מאוחד (שלי +
  // קהילה יחד, ממוין לפי created_at) והפיצול נעשה בלקוח — כך שדי ב-24
  // תוכניות קהילה חדשות כדי שהתוכניות של המאמן עצמו ייעלמו מהמסך שלו.
  const [minePlans, setMinePlans] = useState([])
  const [comPlans, setComPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMoreMine, setLoadingMoreMine] = useState(false)
  const [loadingMoreCom, setLoadingMoreCom] = useState(false)
  const [hasMoreMine, setHasMoreMine] = useState(false)
  const [hasMoreCom, setHasMoreCom] = useState(false)
  const [error, setError] = useState(null)
  const [comError, setComError] = useState(null) // כשל בשליפת הקהילה בלבד — לא מפיל את המסך
  const [activePlanId, setActivePlanId] = useState(null)
  const [source, setSource] = useState(initialSource || '') // מקור התוכניות: '' הכול | 'mine' | 'community'
  const [notebookNew, setNotebookNew] = useState(false) // יצירת תוכנית על מחברת
  const [viewingPlan, setViewingPlan] = useState(null) // תוכנית קהילה בתצוגת מחברת
  const me = session.user.id
  // באיזו «דרגה» המסד: 0 = מעודכן (המחברת המלאה), 1 = בלי עמודות המחברת
  // (טרם הריץ supabase_notebook_18_8.sql), 2 = גם בלי is_public (טרם הריץ
  // supabase_plans_community.sql). נזכר פעם אחת כדי שלא ננסה שוב ושוב.
  const tierRef = useRef(0)
  // האם כבר נטענה רשימת הקהילה (כדי לא לשלוף אותה כשהבורר על «שלי»)
  const comLoadedRef = useRef(false)

  // העתקת תוכנית ששותפה אל "התוכניות שלי" — כולל גוף המחברת (טקסט, דיו,
  // מגרשים, קבוצה ומשך). התאריך והנוכחות לא מועתקים — הם של האימון המקורי.
  // «שכפל» לא היה חסום: הקשה כפולה (רגילה במגע) יצרה שני עותקים
  const copyingRef = useRef(false)
  const copyPlan = async (plan) => {
    if (copyingRef.current) return
    copyingRef.current = true
    try {
      const { data: pis, error: e1 } = await supabase
        .from('plan_items')
        .select('drill_id, position, duration_minutes, note, title, description')
        .eq('plan_id', plan.id)
        .order('position')
      if (e1) {
        toast.error(L('שגיאה: ', 'Error: ') + e1.message)
        return
      }
      let extra = {}
      if (tierRef.current === 0) {
        const { data: src, error: es } = await supabase
          .from('training_plans').select('body, ink, courts, team, duration_minutes').eq('id', plan.id).maybeSingle()
        if (!es && src) extra = { body: src.body, ink: src.ink, courts: src.courts, team: src.team, duration_minutes: src.duration_minutes, is_draft: false }
      }
      let { data: np, error: e2 } = await supabase
        .from('training_plans')
        .insert({ name: plan.name + L(' (עותק)', ' (copy)'), created_by: me, ...extra })
        .select()
        .single()
      if (e2 && Object.keys(extra).length && notDeployed(e2)) {
        ;({ data: np, error: e2 } = await supabase
          .from('training_plans')
          .insert({ name: plan.name + L(' (עותק)', ' (copy)'), created_by: me })
          .select()
          .single())
      }
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
    } finally {
      copyingRef.current = false
    }
  }

  // עימוד: עד היום נשלפו *כל* התוכניות הנגישות (שלי + כל הקהילה) עם
  // ה-items המקוננים בשליפה אחת בלי גבול. הרשימה גדלה עם הקהילה.
  //
  // «התוכניות שלי» — שאילתה נפרדת עם עימוד משלה. `.eq('created_by', me)` עובד
  // גם על מסד ישן (העמודה קיימת מאז supabase_training_plans.sql), ולכן
  // המקטע הזה לעולם לא יכול להיחתך בגלל תוכניות של הקהילה.
  // ברענון (לא append) שומרים על מספר העמודות שכבר נטענו, כדי ש«מחיקה»/
  // «שיתוף» אחרי «טען עוד» לא יקצצו את הרשימה חזרה לעמוד הראשון.
  async function loadMine({ append = false } = {}) {
    const from = append ? minePlans.length : 0
    const size = append ? PLANS_PAGE : Math.max(PLANS_PAGE, minePlans.length)
    if (append) setLoadingMoreMine(true)
    else setLoading(true)

    const page = (cols) => supabase
      .from('training_plans')
      .select(cols)
      .eq('created_by', me)
      .order('created_at', { ascending: false })
      .range(from, from + size - 1)

    // מנסים מהדרגה הנוכחית ויורדים דרגה בכל «עמודה לא קיימת»
    let tier = tierRef.current
    let { data, error } = await page(COLS_BY_TIER[tier])
    while (error && notDeployed(error) && tier < COLS_BY_TIER.length - 1) {
      tier += 1
      tierRef.current = tier
      ;({ data, error } = await page(COLS_BY_TIER[tier]))
    }

    if (error) {
      if (!append) setError(L('שגיאה בטעינת התוכניות: ', 'Failed to load plans: ') + error.message)
      else toast.error(L('טעינת התוכניות הנוספות נכשלה', 'Failed to load more plans'))
    } else {
      const rows = data || []
      setMinePlans((cur) => (append ? [...cur, ...rows] : rows))
      setHasMoreMine(rows.length === size)
      setError(null)
    }
    setLoading(false)
    setLoadingMoreMine(false)
  }

  // «תוכניות הקהילה» — שאילתה נפרדת, ובמכוון כוללת גם את התוכניות שלי
  // שסימנתי «משותף» (כך המאמן רואה בדיוק מה מאמנים אחרים רואים; יש להן
  // תג «שלך»). על מסד בלי is_public הפילטר יחזיר 42703 — שם פשוט אין
  // שיתוף, ולכן המקטע נשאר ריק בלי הודעת שגיאה.
  async function loadCom({ append = false } = {}) {
    if (tierRef.current === 2) { setComPlans([]); setHasMoreCom(false); return }
    const from = append ? comPlans.length : 0
    const size = append ? PLANS_PAGE : Math.max(PLANS_PAGE, comPlans.length)
    if (append) setLoadingMoreCom(true)

    // אותה ירידת דרגות כמו ב-loadMine (שתי הקריאות רצות במקביל במאונט, ולכן
    // כל אחת חייבת לגלות לבד איזו דרגה המסד). טיוטות לא מוצגות בקהילה.
    const pageCom = (tier) => {
      let q = supabase.from('training_plans').select(COLS_BY_TIER[tier]).eq('is_public', true)
      if (tier === 0) q = q.eq('is_draft', false)
      return q.order('created_at', { ascending: false }).range(from, from + size - 1)
    }
    let tier = Math.min(tierRef.current, 1)
    let { data, error } = await pageCom(tier)
    while (error && notDeployed(error) && tier < 1) {
      tier += 1
      tierRef.current = Math.max(tierRef.current, tier)
      ;({ data, error } = await pageCom(tier))
    }

    if (error) {
      if (notDeployed(error)) {
        // המסד לא תומך בשיתוף — לא שגיאה מבחינת המשתמש
        tierRef.current = 2
        setComPlans([])
        setHasMoreCom(false)
        setComError(null)
      } else if (append) {
        toast.error(L('טעינת תוכניות הקהילה הנוספות נכשלה', 'Failed to load more community plans'))
      } else {
        setComError(L('שגיאה בטעינת תוכניות הקהילה: ', 'Failed to load community plans: ') + error.message)
      }
    } else {
      const rows = data || []
      comLoadedRef.current = true
      setComPlans((cur) => (append ? [...cur, ...rows] : rows))
      setHasMoreCom(rows.length === size)
      setComError(null)
    }
    setLoadingMoreCom(false)
  }

  // רענון אחרי פעולה (מחיקה/שיתוף/העתקה/חזרה מהבונה): שתי הרשימות יחד,
  // אבל רק אם רשימת הקהילה כבר נטענה — «שתף לקהילה» חייב להזיז גם אותה.
  async function loadPlans() {
    await loadMine()
    if (comLoadedRef.current) await loadCom()
  }

  useEffect(() => {
    loadMine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // רשימת הקהילה נשלפת רק כשהמקטע שלה באמת מוצג
  useEffect(() => {
    if (source === 'mine' || comLoadedRef.current || tierRef.current === 2) return
    loadCom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // תוכנית שהגיעה מדף הבית («למחברת המלאה» / «תוכנית האימון») נפתחת ישר,
  // ונצרכת פעם אחת כדי שכניסה רגילה למסך תציג את הרשימה.
  useEffect(() => {
    if (!initialPlanId) return
    setActivePlanId(initialPlanId)
    onConsumeInitialPlan?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlanId])


  const deletePlan = async (id) => {
    const ok = await confirmDialog({
      title: L('למחוק את התוכנית?', 'Delete this plan?'),
      message: L('הפעולה אינה הפיכה — התוכנית וכל התרגילים שבה יימחקו.', 'This cannot be undone — the plan and its drills will be deleted.'),
      confirmText: L('מחיקה', 'Delete'),
    })
    if (!ok) return
    const { error } = await supabase.from('training_plans').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
      return
    }
    toast.success(L('התוכנית נמחקה', 'Plan deleted'))
    loadPlans()
  }

  // שיתוף/ביטול שיתוף תוכנית לקהילה.
  // [1] תרגילים פרטיים לא מתפרסמים בשקט: מבקשים אישור לפני, וזוכרים אילו
  // תרגילים אנחנו פרסמנו כדי להחזיר אותם לפרטיים בביטול השיתוף.
  const SHARED_DRILLS_KEY = 'plan-shared-drills-v1'
  const toggleShare = async (p) => {
    const sharing = !p.is_public

    // אילו תרגילים בתוכנית עדיין פרטיים? (לפני שנוגעים במשהו)
    let privateIds = []
    if (sharing) {
      const { data: pis } = await supabase
        .from('plan_items')
        .select('drill_id')
        .eq('plan_id', p.id)
      const ids = [...new Set((pis || []).map((x) => x.drill_id).filter(Boolean))]
      if (ids.length) {
        const { data: priv } = await supabase
          .from('drills')
          .select('id')
          .in('id', ids)
          .eq('is_public', false)
          .eq('created_by', session.user.id)
        privateIds = (priv || []).map((d) => d.id)
      }
      if (privateIds.length > 0) {
        const ok = await confirmDialog({
          title: L('לשתף את התוכנית?', 'Share this plan?'),
          message: L(
            `בתוכנית יש ${privateIds.length === 1 ? 'תרגיל פרטי אחד' : `${privateIds.length} תרגילים פרטיים`} שיתפרסמו גם הם לקהילה.`,
            `This plan contains ${privateIds.length} private drill(s) that will also be published.`
          ),
          confirmText: L('שיתוף', 'Share'),
          danger: false,
        })
        if (!ok) return
      }
    }

    const { error } = await supabase
      .from('training_plans')
      .update({ is_public: sharing })
      .eq('id', p.id)
    if (error) {
      toast.error(L('העדכון נכשל: ', 'Update failed: ') + error.message)
      return
    }

    if (sharing) {
      // מפרסמים את התרגילים הפרטיים (באישור המשתמש) וזוכרים אותם להחזרה
      if (privateIds.length) {
        await supabase.from('drills').update({ is_public: true }).in('id', privateIds)
        try {
          const map = JSON.parse(localStorage.getItem(SHARED_DRILLS_KEY) || '{}')
          map[p.id] = privateIds
          localStorage.setItem(SHARED_DRILLS_KEY, JSON.stringify(map))
        } catch { /* אחסון חסום — לא קריטי */ }
      }
    } else {
      // ביטול שיתוף — מחזירים לפרטי את התרגילים שאנחנו פרסמנו עבור התוכנית הזו
      try {
        const map = JSON.parse(localStorage.getItem(SHARED_DRILLS_KEY) || '{}')
        const restore = map[p.id] || []
        if (restore.length) {
          await supabase.from('drills').update({ is_public: false }).in('id', restore)
          delete map[p.id]
          localStorage.setItem(SHARED_DRILLS_KEY, JSON.stringify(map))
          toast.success(L(`${restore.length === 1 ? 'תרגיל פרטי הוחזר' : `${restore.length} תרגילים פרטיים הוחזרו`} למצב פרטי`, 'Private drills were made private again'))
        }
      } catch { /* אחסון חסום — לא קריטי */ }
    }
    toast.success(p.is_public ? L('השיתוף בוטל', 'Sharing turned off') : L('התוכנית שותפה לקהילה', 'Plan shared with the community'))
    loadPlans()
  }

  // אם נכנסנו לתוכנית — המחברת המלאה (עריכה). השמירה משאירה את המחברת
  // פתוחה ומרעננת את הרשימה ברקע; «כל התוכניות» חוזר לרשימה.
  if (activePlanId) {
    return (
      <PlanNotebook
        key={activePlanId}
        session={session}
        planId={activePlanId}
        onSaved={() => loadPlans()}
        onCancel={() => {
          setActivePlanId(null)
          loadPlans()
        }}
      />
    )
  }

  if (notebookNew) {
    return (
      <PlanNotebook
        session={session}
        onSaved={() => loadPlans()}
        onCancel={() => {
          setNotebookNew(false)
          loadPlans()
        }}
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

  // שתי הרשימות מגיעות עכשיו משתי שאילתות נפרדות — אין יותר סינון לקוח
  // שיכול «לאבד» תוכניות שנשארו מחוץ לעמוד המאוחד.
  const myPlans = minePlans
  const communityPlans = comPlans
  // בורר המקור קובע אילו מקטעים מוצגים — שלי, של הקהילה, או שניהם
  const showMine = source !== 'community'
  const showCommunity = source !== 'mine'

  return (
    <div className="welcome-card">
      {/* אין כאן כותרת: Dashboard עוטף את המסך ב-<Page> שכבר נותן
          eyebrow, H1 ותת-כותרת. שתי כותרות = שני H1 באותו מסך. */}
      {/* דלת אחת לחדר: כותבים את האימון על דף המחברת. «בנה לי» (הבנאי
          האוטומטי) הוסר לבקשת הבעלים, ואיתו ההשלמה האוטומטית שבעורך. */}
      <div className="pn-doors single">
        <button className="pn-door" onClick={() => setNotebookNew(true)}>
          <span className="pn-door-ic"><BookOpen size={22} /></span>
          <span className="pn-door-body">
            <strong>{L('תוכנית חדשה', 'New plan')}</strong>
            <span>{L('דף מחברת שלם — הקלדה או עט, מגרשים לשרטוט, ונוכחות בתחתית', 'A full notebook page — type or write by hand, sketch on courts, mark attendance at the bottom')}</span>
          </span>
        </button>
      </div>

      {/* בורר מקור — לראות את התוכניות שלי, את אלה שהקהילה שיתפה, או הכול */}
      <div className="filter-bar">
        <select
          className="finder-input filter-select"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label={L('סינון לפי מקור', 'Filter by source')}
        >
          <option value="">{L('כל התוכניות', 'All plans')}</option>
          <option value="mine">{L('התוכניות שלי', 'My plans')}</option>
          <option value="community">{L('תוכניות מהקהילה', 'Community plans')}</option>
        </select>
      </div>

      {loading && (
        <div className="finder-results">
          <SkeletonCards count={3} />
        </div>
      )}
      {!loading && error && <ErrorState message={error} onRetry={loadPlans} />}

      {!loading && !error && showMine && (
        <>
          <h3 className="section-title" style={{ marginTop: 24 }}>
            {L('התוכניות שלי', 'My plans')}
          </h3>
          <div className="finder-results">
            {myPlans.length === 0 ? (
              <div className="empty-state">
                <span className="empty-ic">
                  <ClipboardList size={26} />
                </span>
                {/* «עדיין אין תוכניות» מוצג רק כשזו באמת האמת — כלומר כשאין
                    עוד עמוד להביא. אחרת מציעים להמשיך לטעון במקום להצהיר. */}
                <div className="empty-title">
                  {hasMoreMine
                    ? L('התוכניות שלך עדיין נטענות', 'Your plans are still loading')
                    : L('עדיין אין תוכניות אימון', 'No training plans yet')}
                </div>
                <p className="muted small">
                  {hasMoreMine
                    ? L('יש עוד תוכניות שלך במסד — לחצו «טען עוד» כדי להביא אותן.', 'There are more of your plans in the database — tap “Load more” to fetch them.')
                    : L('צור את התוכנית הראשונה למעלה — כותבים אותה ישר על דף המחברת.', 'Create your first plan above — write it right on the notebook page.')}
                </p>
                {hasMoreMine && (
                  <button type="button" className="btn-soft empty-cta" onClick={() => loadMine({ append: true })} disabled={loadingMoreMine}>
                    {loadingMoreMine ? L('טוען…', 'Loading…') : L('טען עוד תוכניות', 'Load more plans')}
                  </button>
                )}
              </div>
            ) : (
              myPlans.map((p) => {
                const items = p.plan_items || []
                const total = items.reduce((s, it) => s + (Number(it.duration_minutes) || 0), 0)
                // 18.8 — כרטיס של מחברת: תג טיוטה, קבוצה, תאריך האימון, משך ידני
                const sd = p.session_date ? new Date(p.session_date + 'T00:00') : null
                return (
                  <div key={p.id} className={p.is_draft ? 'coach-card is-draft' : 'coach-card'}>
                    <div className="drill-card-top">
                      <h3 className="coach-name">{p.name}</h3>
                      {p.is_draft && (
                        <span className="plan-draft-badge">
                          <FileEdit size={12} /> {L('טיוטה', 'Draft')}
                        </span>
                      )}
                      {p.is_public && (
                        <span className="plan-shared-badge">
                          <Globe2 size={12} /> {L('משותף', 'Shared')}
                        </span>
                      )}
                    </div>
                    <div className="plan-meta">
                      {p.team && (
                        <span className="meta-item">{trTeam(p.team)}</span>
                      )}
                      {sd && !Number.isNaN(sd.getTime()) && (
                        <span className="meta-item">
                          <CalendarDays size={14} />
                          <bdi dir="ltr">{sd.getDate()}.{sd.getMonth() + 1}</bdi>
                        </span>
                      )}
                      {p.duration_minutes ? (
                        <span className="meta-item">
                          <Clock size={14} />
                          <bdi>{p.duration_minutes}</bdi> {L('דק׳', 'min')}
                        </span>
                      ) : null}
                      {items.length > 0 && (
                        <span className="meta-item">
                          <ListChecks size={14} />
                          <bdi>{items.length}</bdi> {items.length === 1 ? L('תרגיל מהספרייה', 'library drill') : L('תרגילים מהספרייה', 'library drills')}
                        </span>
                      )}
                      {p.updated_at && (
                        <span className="meta-item">
                          {L('עודכן ', 'updated ')}
                          <bdi dir="ltr">
                            {new Date(p.updated_at).getDate()}.{new Date(p.updated_at).getMonth() + 1}
                          </bdi>
                        </span>
                      )}
                    </div>

                    {/* מסך 13a — פס היעד ורצועת הזמן לפי קטגוריה, על הכרטיס עצמו.
                        רק לתוכנית ישנה שנבנתה מתרגילים עם משך (למחברת יש משך ידני). */}
                    {total > 0 && !p.duration_minutes && (
                      <div className="plan-target">
                        <div className="plan-target-row">
                          <span className="plan-target-num" dir="ltr">
                            <b>{total}</b> / {PLAN_TARGET_MIN} {L('דק׳', 'min')}
                          </span>
                          <span className={total >= PLAN_TARGET_MIN ? 'pb-target-hint done' : 'pb-target-hint'}>
                            {total >= PLAN_TARGET_MIN
                              ? L('מוכן לאימון', 'Ready to run')
                              : L(`עוד ${PLAN_TARGET_MIN - total} דק׳ ליעד`, `${PLAN_TARGET_MIN - total} min to target`)}
                          </span>
                        </div>
                        <span
                          className={total >= PLAN_TARGET_MIN ? 'pb-target-bar done' : 'pb-target-bar'}
                          aria-hidden="true"
                        >
                          <span style={{ width: `${Math.min(100, Math.round((total / PLAN_TARGET_MIN) * 100))}%` }} />
                        </span>
                        {(() => {
                          // רצועת זמן: מקטע לכל קטגוריה, ברוחב יחסי לדקות שלה
                          const byCat = new Map()
                          for (const it of items) {
                            const m = Number(it.duration_minutes) || 0
                            if (!m) continue
                            const c = it.drill?.category || L('אחר', 'Other')
                            byCat.set(c, (byCat.get(c) || 0) + m)
                          }
                          if (byCat.size === 0) return null
                          return (
                            <span className="plan-cats" aria-hidden="true">
                              {[...byCat.entries()].map(([c, m]) => (
                                <span key={c} style={{ flex: m }}>
                                  <b>{tr(c)}</b>
                                  <i dir="ltr">{m}׳</i>
                                </span>
                              ))}
                            </span>
                          )
                        })()}
                      </div>
                    )}
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
                      <button className="btn-ghost" onClick={() => copyPlan(p)}>
                        {L('שכפל', 'Duplicate')}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => waShare(L(
                          `🏀 תוכנית אימון מ-CourtSide: "${p.name}" (${(p.plan_items || []).length} תרגילים). בונים ומשתפים תוכניות חינם:\n${SITE_URL}`,
                          `🏀 A practice plan from CourtSide: "${p.name}" (${(p.plan_items || []).length} drills). Build and share plans free:\n${SITE_URL}`
                        ))}
                      >
                        {L('וואטסאפ', 'WhatsApp')}
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
          {/* «טען עוד» של המקטע הזה — מתחת לתוכניות שלי ולא בתחתית העמוד,
              שם הוא נראה כאילו הוא שייך למקטע הקהילה */}
          {hasMoreMine && myPlans.length > 0 && (
            <div className="form-actions" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button type="button" className="btn-soft" onClick={() => loadMine({ append: true })} disabled={loadingMoreMine}>
                {loadingMoreMine ? L('טוען…', 'Loading…') : L('טען עוד מהתוכניות שלי', 'Load more of my plans')}
              </button>
            </div>
          )}
        </>
      )}

      {/* תוכניות אימון שמאמנים אחרים שיתפו לקהילה */}
      {!loading && !error && showCommunity && comError && (
        <p className="alert alert-error" style={{ marginTop: 20 }}>{comError}</p>
      )}
      {!loading && !error && showCommunity && communityPlans.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 28 }}>
            {L('תוכניות הקהילה', 'Community plans')}
          </h3>
          <p className="muted small">
            {L('מערכי אימון משותפים — שלך ושל מאמנים אחרים. כאן מאמנים מגלים תוכניות. צפה כמחברת או העתק אלייך.', 'Shared practice plans — yours and other coaches’. This is where coaches discover plans. View as a notebook or copy.')}
          </p>
          <div className="finder-results">
            {communityPlans.map((p) => {
              const items = p.plan_items || []
              const total = items.reduce((s, it) => s + (Number(it.duration_minutes) || 0), 0)
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
                        {L('העתק אליי', 'Copy to me')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* «טען עוד» של מקטע הקהילה בלבד — הרשימה הזו היא שגדלה בלי גבול */}
          {hasMoreCom && (
            <div className="form-actions" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button type="button" className="btn-soft" onClick={() => loadCom({ append: true })} disabled={loadingMoreCom}>
                {loadingMoreCom ? L('טוען…', 'Loading…') : L('טען עוד מהקהילה', 'Load more community plans')}
              </button>
            </div>
          )}
        </>
      )}

      {/* סוננו במפורש תוכניות קהילה ואין כאלה — לא משאירים מסך ריק בלי הסבר */}
      {!loading && !error && !comError && showCommunity && source === 'community' && communityPlans.length === 0 && (
        <div className="empty-state">
          <span className="empty-ic">
            <Globe2 size={26} />
          </span>
          <div className="empty-title">{L('אין עדיין תוכניות משותפות', 'No shared plans yet')}</div>
          <p className="muted small">
            {L('כשמאמנים ישתפו תוכניות לקהילה הן יופיעו כאן. אפשר להתחיל ולשתף תוכנית משלך בכפתור «שתף לקהילה».', 'When coaches share plans they will show up here. You can start by sharing one of yours with “Share”.')}
          </p>
        </div>
      )}
    </div>
  )
}

// תצוגת תוכנית-קהילה כדף מחברת (קריאה בלבד) — לצפייה והעתקה.
// 18.8 — הדף המלא (טקסט, דיו, מגרשים) דרך PlanSheetById; תוכנית ישנה
// (בלי גוף) מוצגת מהפריטים שלה.
function PlanViewer({ plan, onBack, onCopy }) {
  return (
    <div className="welcome-card">
      <button className="link-button" onClick={onBack}>
        <ArrowBack size={15} className="back-ic" /> {L('חזרה לתוכניות', 'Back to plans')}
      </button>
      <div className="nb-actions" style={{ marginTop: 12 }}>
        <button className="btn-primary" style={{ marginTop: 0 }} onClick={onCopy}>
          {L('העתק אליי', 'Copy to me')}
        </button>
        <button className="btn-soft" onClick={() => window.print()}>
          <Printer size={16} /> {L('הדפסה', 'Print')}
        </button>
      </div>
      <PlanSheetById planId={plan.id} />
    </div>
  )
}
