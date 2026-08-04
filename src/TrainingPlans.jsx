import { toast } from './toast'
import { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, ClipboardList, BookOpen, Printer, Pencil, ListChecks, Clock, Globe2, PlayCircle, Plus } from 'lucide-react'
// חצי «חזרה» מתהפכים לפי שפה — אסור לייבא ArrowRight ישירות מ-lucide
import { ArrowBack } from './DirIcon'
import { supabase } from './supabaseClient'
import PlanRunner from './PlanRunner'
import PlanNotebook from './PlanNotebook'
import NotebookPage from './NotebookPage'
import CourtDiagram from './CourtDiagram'
import { SkeletonCards } from './Skeleton'
import { L, tr, trTeam } from './i18n'
import { ErrorState } from './states'
import { safeUrl, SITE_URL } from './constants'
import { waShare } from './share'
import { confirmDialog } from './confirm'
// הקובץ שמגיש את Rubik בעברית — ?url מחזיר את הנתיב הסופי (עם ה-hash)
// אחרי build, כדי שמסמך ההדפסה יטען את אותו פונט שהאפליקציה משתמשת בו.
import rubikFont from '@fontsource/rubik/files/rubik-hebrew-400-normal.woff2?url'

// יעד אורך אימון מלא. מוצג גם בעורך התוכנית וגם על כרטיס התוכנית ברשימה (13a).
export const PLAN_TARGET_MIN = 90

// עימוד רשימת התוכניות + רשימת עמודות מפורשת במקום select('*')
const PLANS_PAGE = 24
// הקטגוריה נדרשת לרצועת הזמן שבכרטיס (מסך 13a)
const PLAN_ITEMS_COLS = 'plan_items(id, duration_minutes, drill:drills(category))'
const PLAN_COLS = `id, name, created_by, created_at, is_public, ${PLAN_ITEMS_COLS}`
// מסד שטרם הריץ את supabase_plans_community.sql — בלי עמודת is_public
const PLAN_COLS_LEGACY = `id, name, created_by, created_at, ${PLAN_ITEMS_COLS}`

// "עוד לא נפרס בפרודקשן" — עמודה/פונקציה/טבלה שחסרות במסד
const notDeployed = (e) =>
  ['42703', '42883', '42P01', 'PGRST202'].includes(e?.code) ||
  /does not exist/i.test(e?.message || '')

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
export default function TrainingPlans({ session, initialPlanId, onConsumeInitialPlan }) {
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
  const [source, setSource] = useState('') // מקור התוכניות: '' הכול | 'mine' | 'community'
  const [notebookNew, setNotebookNew] = useState(false) // יצירת תוכנית על מחברת
  const [viewingPlan, setViewingPlan] = useState(null) // תוכנית קהילה בתצוגת מחברת
  const me = session.user.id
  // מסד שטרם הריץ את supabase_plans_community.sql — אין בו עמודת is_public.
  // נזכר פעם אחת כדי שלא ננסה שוב ושוב את השאילתה המודרנית.
  const legacyDbRef = useRef(false)
  // האם כבר נטענה רשימת הקהילה (כדי לא לשלוף אותה כשהבורר על «שלי»)
  const comLoadedRef = useRef(false)

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

    const wasLegacy = legacyDbRef.current
    let { data, error } = await page(wasLegacy ? PLAN_COLS_LEGACY : PLAN_COLS)
    // מסד שטרם הריץ את supabase_plans_community.sql — אין עמודת is_public
    if (error && !wasLegacy && notDeployed(error)) {
      legacyDbRef.current = true
      ;({ data, error } = await page(PLAN_COLS_LEGACY))
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
    if (legacyDbRef.current) { setComPlans([]); setHasMoreCom(false); return }
    const from = append ? comPlans.length : 0
    const size = append ? PLANS_PAGE : Math.max(PLANS_PAGE, comPlans.length)
    if (append) setLoadingMoreCom(true)

    const { data, error } = await supabase
      .from('training_plans')
      .select(PLAN_COLS)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(from, from + size - 1)

    if (error) {
      if (notDeployed(error)) {
        // המסד לא תומך בשיתוף — לא שגיאה מבחינת המשתמש
        legacyDbRef.current = true
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
    if (source === 'mine' || comLoadedRef.current || legacyDbRef.current) return
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

  // אם נכנסנו לתוכנית — מציגים את הבונה
  if (activePlanId) {
    return (
      <PlanBuilder
        planId={activePlanId}
        plan={minePlans.find((p) => p.id === activePlanId) || comPlans.find((p) => p.id === activePlanId)}
        onBack={() => {
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
        onDone={async (id) => {
          setNotebookNew(false)
          await loadPlans()
          setActivePlanId(id)
        }}
        onCancel={() => setNotebookNew(false)}
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
            <span>{L('כותבים את מבנה האימון ישר על דף המחברת', 'Write the practice outline right on the notebook page')}</span>
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
                      {p.updated_at && (
                        <span className="meta-item">
                          <Clock size={14} />
                          {L('עודכן ', 'updated ')}
                          <bdi dir="ltr">
                            {new Date(p.updated_at).getDate()}.{new Date(p.updated_at).getMonth() + 1}
                          </bdi>
                        </span>
                      )}
                    </div>

                    {/* מסך 13a — פס היעד ורצועת הזמן לפי קטגוריה, על הכרטיס עצמו.
                        עד עכשיו הם היו רק בתוך עורך התוכנית. */}
                    {total > 0 && (
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

// מסך בניית תוכנית — התרגילים ברצף, עם הוספה/סידור/עריכה, ופתיחת פרטים מלאים
function PlanBuilder({ planId, plan, onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [picking, setPicking] = useState(false)
  const [pickQuery, setPickQuery] = useState('') // 1.10 — חיפוש בבורר שבתוך הדף
  const [allDrills, setAllDrills] = useState([])
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [running, setRunning] = useState(false) // מצב הרצת אימון (טיימר)
  const [creatingDrill, setCreatingDrill] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  // 1.10 — התוכנית בנויה מחלקים: נפתחת עם «חלק 1» בלבד, ואפשר להוסיף/למחוק
  const [partCount, setPartCount] = useState(1)
  const [targetPart, setTargetPart] = useState(1) // לאיזה חלק הבורר מוסיף
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
      // 1.10 — מיון לפי חלק ואז מיקום; לפני המיגרציה part חסר → הכול חלק 1
      const rows = (data || []).slice().sort((a, b) => ((a.part || 1) - (b.part || 1)) || (a.position - b.position))
      setItems(rows)
      setPartCount((c) => Math.max(c, 1, ...rows.map((r) => r.part || 1)))
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

  const openPicker = async (part) => {
    setTargetPart(part || 1)
    setPicking(true)
    setPickQuery('')
    if (allDrills.length === 0) {
      const { data } = await supabase
        .from('drills')
        .select('id, title, category, duration_minutes')
        .order('title', { ascending: true })
      setAllDrills(data || [])
    }
  }

  // הוספה עם fallback: אם עמודת part (supabase_plan_parts.sql) טרם נוספה —
  // שומרים בלי חלק, והתוכנית ממשיכה לעבוד כחלק אחד.
  const insertItem = async (row, part) => {
    let { error } = await supabase.from('plan_items').insert({ ...row, part: part || 1 })
    if (error) ({ error } = await supabase.from('plan_items').insert(row))
    return error
  }

  const addDrill = async (drill) => {
    const nextPos =
      items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0
    const error = await insertItem({
      plan_id: planId,
      drill_id: drill.id,
      position: nextPos,
      duration_minutes: drill.duration_minutes || null,
      note: null,
    }, targetPart)
    if (error) {
      toast.error(L('ההוספה נכשלה: ', 'Failed to add: ') + error.message)
      return
    }
    loadItems()
  }

  // שורת טקסט חופשי בתוך חלק (פריט עם תוכן משלו, בלי drill_id)
  const addCustomItem = async () => {
    if (!newTitle.trim()) return
    const nextPos =
      items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0
    const error = await insertItem({
      plan_id: planId,
      position: nextPos,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
    }, targetPart)
    if (error) {
      toast.error(L('ההוספה נכשלה: ', 'Failed to add: ') + error.message)
      return
    }
    setNewTitle('')
    setNewDesc('')
    setCreatingDrill(false)
    loadItems()
  }

  // 1.10 — מחיקת חלק: מוחקת את הפריטים שבו ומזיזה את החלקים שאחריו
  const deletePart = async (pn) => {
    const inPart = items.filter((it) => (it.part || 1) === pn)
    const ok = await confirmDialog({
      message: inPart.length > 0
        ? L(`למחוק את חלק ${pn} כולל ${inPart.length} הפריטים שבו?`, `Delete part ${pn} with its ${inPart.length} items?`)
        : L(`למחוק את חלק ${pn}?`, `Delete part ${pn}?`),
      danger: true,
    })
    if (!ok) return
    if (inPart.length > 0) {
      const { error } = await supabase.from('plan_items').delete().in('id', inPart.map((i) => i.id))
      if (error) { toast.error(L('המחיקה נכשלה', 'Delete failed')); return }
    }
    // הזזת החלקים הבאים מקום אחד אחורה. קודם רץ כאן UPDATE נפרד לכל פריט
    // (N+1), וכשל באמצע השאיר מספרי חלקים לא עקביים בלי דרך לשחזר.
    // עכשיו: עדכון אחד לכל ערך part (מספר קטן וקבוע של קריאות), במקביל,
    // ובדיקת כשל אחת בסוף. סובלני אם עמודת part עוד לא נוספה במסד.
    const after = items.filter((it) => (it.part || 1) > pn)
    if (after.length) {
      const byPart = new Map()
      for (const it of after) {
        const p = it.part || 1
        if (!byPart.has(p)) byPart.set(p, [])
        byPart.get(p).push(it.id)
      }
      const results = await Promise.all(
        [...byPart.entries()].map(([p, ids]) =>
          supabase.from('plan_items').update({ part: p - 1 }).in('id', ids)
        )
      )
      const failed = results.filter((r) => r.error)
      if (failed.length && !notDeployed(failed[0].error)) {
        // כשל חלקי — מרעננים כדי שהמסך יציג את המצב האמיתי במסד
        toast.error(L('חלק מהחלקים לא עודכנו — רענן ובדוק את מספרי החלקים', 'Some parts were not renumbered — refresh and check the part numbers'))
        loadItems()
        return
      }
    }
    setPartCount((c) => Math.max(1, c - 1))
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

  // שמירה למסד כשהשדה מאבד פוקוס — אם השמירה נכשלה, מודיעים למאמן (לא בולעים בשקט)
  const persist = async (id, field, value) => {
    const v =
      field === 'duration_minutes'
        ? value === '' || value === null
          ? null
          : Number(value)
        : value
    const { error } = await supabase.from('plan_items').update({ [field]: v }).eq('id', id)
    if (error) toast.error(L('השמירה נכשלה — בדוק חיבור ונסה שוב', 'Save failed — check your connection and try again'))
  }

  // הזזת פריט מעלה/מטה בתוך החלק שלו (החלפת position עם השכן)
  const move = async (it, dir) => {
    const arr = items.filter((x) => (x.part || 1) === (it.part || 1))
    const index = arr.findIndex((x) => x.id === it.id)
    const target = index + dir
    if (target < 0 || target >= arr.length) return
    const b = arr[target]
    await supabase.from('plan_items').update({ position: b.position }).eq('id', it.id)
    await supabase.from('plan_items').update({ position: it.position }).eq('id', b.id)
    loadItems()
  }

  // הדפסה / שמירה כ-PDF: פותח חלון נקי עם התוכנית בלבד ומדפיס אותו
  const printPlan = () => {
    const totalMin = items.reduce((s, it) => s + (Number(it.duration_minutes) || 0), 0)
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
          ? `<div class="note">${L('הערה: ', 'Note: ')}${escapeHtml(it.note)}</div>`
          : ''
        const desc = descText
          ? `<div class="desc">${escapeHtml(descText)}</div>`
          : ''
        return `<li><strong>${escapeHtml(title)}</strong>${dur}${cat}${note}${desc}</li>`
      })
      .join('')

    // מסמך ההדפסה הוא מסמך נפרד ולכן אין בו משתני CSS — הצבעים כאן הם
    // ערכי הטוקנים עצמם (--text, --text-muted, --navy) כדי שהפלט המודפס
    // ייראה כמו המותג.
    //
    // הפונט: עד 4.8.2026 נטען כאן מ-fonts.googleapis.com. מאז שהפונטים
    // עברו לאחסון עצמי, ה-CSP כבר לא מתיר את הדומיין הזה — ומסמך blob:
    // יורש את ה-CSP של הדף שיצר אותו, כך שהקישור פשוט נחסם והפלט המודפס
    // נפל ל-Arial. עכשיו טוענים את אותו קובץ שהאפליקציה כבר מגישה
    // מהשרת שלנו (font-src 'self'), דרך ?url של Vite כדי שהנתיב יכלול
    // את ה-hash הנכון אחרי build. new URL(...) הופך אותו לכתובת מוחלטת,
    // כי בתוך blob: נתיב יחסי חסר משמעות.
    const rubikUrl = new URL(rubikFont, window.location.origin).href
    const html =
      '<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">' +
      '<title>' + name + '</title>' +
      '<style>' +
      "@font-face{font-family:'Rubik';font-style:normal;font-weight:400 700;" +
      "font-display:swap;src:url('" + rubikUrl + "') format('woff2')}" +
      "body{font-family:'Rubik',Arial,Helvetica,sans-serif;padding:28px;color:#0F1F33}" + // --text
      'h1{font-size:24px;font-weight:700;margin:0 0 4px;color:#152238}' + // --navy
      '.sub{color:#55647A;font-size:14px;margin-bottom:18px}' + // --text-muted
      'ol{padding-right:22px}li{font-size:15px;margin-bottom:14px}' +
      '.note,.desc{color:#55647A;margin-top:3px}.note{font-size:14px}.desc{font-size:13px}' +
      '</style></head><body>' +
      '<h1>' + name + '</h1>' +
      '<div class="sub">' + items.length + L(' תרגילים', ' drills') + durTotal + '</div>' +
      '<ol>' + rows + '</ol>' +
      '</body></html>'

    // יוצרים קובץ HTML זמני ופותחים אותו ישירות — אמין יותר מ-document.write.
    // ההדפסה מופעלת מהחלון *הפותח*: מסמך blob יורש את ה-CSP של הדף
    // (script-src 'self' בלי unsafe-inline), ולכן הסקריפט המוטבע שהיה כאן
    // נחסם בפרודקשן וההדפסה האוטומטית פשוט לא רצה.
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (!w) {
      toast.error(L('הדפדפן חסם חלון קופץ (popup). אשר חלונות קופצים לאתר ונסה שוב.', 'The browser blocked the popup. Allow popups for this site and try again.'))
      URL.revokeObjectURL(url)
      return
    }
    let printed = false
    const doPrint = () => {
      if (printed) return
      printed = true
      try { w.focus(); w.print() } catch { /* החלון נסגר / חסום — המשתמש ידפיס ידנית */ }
    }
    // blob: הוא same-origin, ולכן מותר להאזין ל-load של החלון הנפתח.
    try { w.addEventListener('load', doPrint) } catch { /* נפילה לטיימר */ }
    setTimeout(doPrint, 800) // רשת אטית / load שכבר קרה
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  // Number() חשוב — קלט מהמשתמש נשמר כמחרוזת, ו-"15"+"20" היה משרשר ל-"1520"
  const total = items.reduce((s, it) => s + (Number(it.duration_minutes) || 0), 0)
  const TARGET_MIN = PLAN_TARGET_MIN

  // פירוק זמן לפי קטגוריית התרגיל (למסך הסיכום, בסגנון מסך היעד)
  const catTotals = {}
  for (const it of items) {
    const cat = it.drill?.category || it.category
    if (!cat) continue
    catTotals[cat] = (catTotals[cat] || 0) + (Number(it.duration_minutes) || 0)
  }
  // צבע קבוע לכל קטגוריה (פלטת ה-handoff) — הצבעים לא מתחלפים כשהסדר משתנה
  const CAT_COLOR = {
    'יסודות': 'var(--c-green)',
    'הגנה': 'var(--c-blue)',
    'התקפה': 'var(--c-orange)',
    'ניהול אימון': 'var(--c-purple)',
    'ניהול משחק': 'var(--c-navy)',
    'פיתוח שחקן': 'var(--c-red)',
  }
  const catColor = (cat) => CAT_COLOR[cat] || 'var(--c-navy)'
  const breakdown = Object.entries(catTotals)
    .filter(([, m]) => m > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, min]) => ({ cat, min, color: catColor(cat) }))
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
        <ArrowBack size={15} className="back-ic" /> {L('כל התוכניות', 'All plans')}
      </button>

      <header className="pb-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('בונה האימונים · טיוטה נשמרת אוטומטית', 'Practice builder · draft saved automatically')}</div>
          {/* h2 ולא h1: הבאנר של המסך (Page) הוא הכותרת הראשית, וזו כותרת המשנה של הבונה */}
          <h2 className="pb-title">{plan?.name || L('תוכנית', 'Plan')}</h2>
        </div>
        <div className="pb-header-actions">
          {items.length > 0 && (
            <button className="btn-primary pb-run" onClick={() => setRunning(true)}>
              <PlayCircle size={17} /> {L('הרץ אימון', 'Run practice')}
            </button>
          )}
          {/* [25] כפתור "שמור" הוסר — השמירה אוטומטית באמת, וה-badge בכותרת כבר אומר זאת */}
        </div>
      </header>

      <div className="pb-layout">
      <aside className="pb-aside">
      <div className="pb-summary">
        <div className="pb-summary-head">
          <span className="pb-summary-label"><Clock size={14} /> {L('סה"כ זמן אימון', 'Total practice time')}</span>
          <span className="pb-summary-num">
            <bdi>{total}</bdi> <span className="pb-summary-unit">/ {TARGET_MIN} {L('דק׳', 'min')}</span>
          </span>
        </div>
        <span className={total >= TARGET_MIN ? 'pb-target-bar done' : 'pb-target-bar'} aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.round((total / TARGET_MIN) * 100))}%` }} />
        </span>
        <div className="pb-summary-meta">
          <span className="builder-stat">
            <ListChecks size={14} />
            <strong><bdi>{items.length}</bdi></strong> {items.length === 1 ? L('תרגיל', 'drill') : L('תרגילים', 'drills')}
          </span>
          <span className={total >= TARGET_MIN ? 'pb-target-hint done' : 'pb-target-hint'}>
            {total >= TARGET_MIN
              ? L('הגעת ליעד האימון ✓', 'Practice target reached ✓')
              : L(`עוד ${TARGET_MIN - total} דק׳ ליעד`, `${TARGET_MIN - total} min to target`)}
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

      {items.length > 0 && (
        <div className="pb-aside-actions">
          <button className="btn-soft" onClick={() => setNotebookView(true)}>
            <BookOpen size={16} /> {L('תצוגה כמערך', 'Practice sheet')}
          </button>
          <button className="btn-soft" onClick={printPlan}>
            <Printer size={16} /> {L('ייצוא PDF', 'Export PDF')}
          </button>
        </div>
      )}
      </aside>

      <div className="pb-main">

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

      {/* שורת טקסט חופשי בתוך חלק */}
      {creatingDrill && (
        <div className="picker">
          <div className="picker-head">
            <span className="field-label">{L(`שורה חופשית — חלק ${targetPart}`, `Free-text row — part ${targetPart}`)}</span>
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

      {/* 1.10 — בורר תרגילים בתוך הדף: חיפוש, בחירה, נכנס לחלק שנבחר */}
      {picking && (
        <div className="picker">
          <div className="picker-head">
            <span className="field-label">{L(`בחר תרגיל לחלק ${targetPart}`, `Pick a drill for part ${targetPart}`)}</span>
            <button className="link-button" onClick={() => setPicking(false)}>
              {L('סגור', 'Close')}
            </button>
          </div>
          <input
            className="finder-input"
            style={{ marginBottom: 8 }}
            value={pickQuery}
            onChange={(e) => setPickQuery(e.target.value)}
            placeholder={L('חיפוש תרגיל…', 'Search drills…')}
          />
          {allDrills.length === 0 ? (
            <p className="muted small">{L('אין תרגילים בספרייה עדיין.', 'No drills in the library yet.')}</p>
          ) : (
            <div className="picker-list">
              {allDrills
                .filter((d) => !pickQuery || (d.title || '').includes(pickQuery))
                .slice(0, 60)
                .map((d) => (
                  <button
                    key={d.id}
                    className="picker-item"
                    onClick={() => addDrill(d)}
                  >
                    <span>{d.title}</span>
                    {d.duration_minutes && <span className="muted small" dir="ltr">{d.duration_minutes} {L('דק׳', 'min')}</span>}
                    {d.category && <span className="cat-badge">{tr(d.category)}</span>}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 1.10 — התוכנית בחלקים: כל חלק עם הפריטים שלו וכפתורי הוספה משלו */}
      <div className="finder-results">
        {loading ? (
          <SkeletonCards count={4} lines={2} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadItems} />
        ) : (
          Array.from({ length: partCount }, (_, i) => i + 1).map((pn) => {
            const partItems = items.filter((x) => (x.part || 1) === pn)
            const partMin = partItems.reduce((s, x) => s + (Number(x.duration_minutes) || 0), 0)
            return (
              <section key={pn} className="pb-part">
                <div className="pb-part-hd">
                  <b>{L(`חלק ${pn}`, `Part ${pn}`)}</b>
                  {partMin > 0 && <span className="muted small" dir="ltr">{partMin} {L('דק׳', 'min')}</span>}
                  {partCount > 1 && (
                    <button type="button" className="link-button danger pb-part-del" onClick={() => deletePart(pn)}>
                      {L('מחיקת חלק', 'Delete part')}
                    </button>
                  )}
                </div>
                {partItems.length === 0 && (
                  <p className="muted small pb-part-empty">
                    {L('חלק ריק — הוסיפו תרגיל מהספרייה או שורה חופשית.', 'Empty part — add a drill from the library or a free-text row.')}
                  </p>
                )}
                {partItems.map((it, idx) => {
            const d = it.drill || {}
            const expanded = expandedIds.has(it.id)
            const detailMeta = [
              [L('רמת קושי', 'Difficulty'), tr(d.difficulty)],
              [L('משך מקורי', 'Original duration'), d.duration_minutes ? L(`${d.duration_minutes} דקות`, `${d.duration_minutes} min`) : null],
              [L('יעד', 'Goal'), d.goal],
              [L('ציוד', 'Equipment'), d.equipment],
              [L('שחקנים', 'Players'), d.players],
              [L('חזרות/סטים', 'Reps/sets'), d.reps],
            ].filter(([, v]) => v)

            return (
              <div key={it.id} className="plan-item" style={{ '--item-c': catColor(d.category) }}>
                <div className="plan-item-top">
                  <div className="plan-item-order">
                    <button
                      className="ord-btn"
                      onClick={() => move(it, -1)}
                      disabled={idx === 0}
                      aria-label={L('הזז מעלה', 'Move up')}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <span className="ord-num">{idx + 1}</span>
                    <button
                      className="ord-btn"
                      onClick={() => move(it, 1)}
                      disabled={idx === partItems.length - 1}
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

                    {/* 1.10 — מגרש מוקטן בכרטיס המשולב */}
                    {d.board?.steps?.length > 0 && (
                      <div className="pb-mini-court" aria-hidden="true">
                        <CourtDiagram step={d.board.steps[0]} full={!!d.board.full} />
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
          })}
                <div className="pb-add-row">
                  <button className="pb-add-dashed" onClick={() => openPicker(pn)}>
                    <Plus size={17} /> {L('הוסף תרגיל מהספרייה', 'Add drill from library')}
                  </button>
                  <button className="btn-ghost" onClick={() => { setTargetPart(pn); setCreatingDrill(true) }}>
                    {L('שורה חופשית', 'Free-text row')}
                  </button>
                </div>
              </section>
            )
          })
        )}
        {!loading && !error && (
          <button type="button" className="btn-soft pb-add-part" onClick={() => setPartCount((c) => Math.min(20, c + 1))}>
            <Plus size={16} /> {L('הוסף חלק', 'Add part')}
          </button>
        )}
      </div>
      </div>
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
      {loading ? (
        <SkeletonCards count={1} />
      ) : (
        <NotebookPage kind="plan" plan={nbPlan} club={owner.club} coachName={owner.name} noCourt />
      )}
    </div>
  )
}
