import { supabase } from './supabaseClient'
import { cacheGet, cachePut } from './offline'

// ⚠ 12.9.2026 — PlanNotebook נטען כאן **עצלנית** בכוונה. הייבוא הסטטי של
// שני הייצואים הזעירים האלה (PLAN_SELECTS, notDeployed) גרר את כל המחברת
// לגרף הסינכרוני — planPrefetch מיובא מ-Home, ו-Home מ-Dashboard — ואיתה
// גם לוח הטקטיקה ו«שליחה לשחקנים»: 73KB raw / 21KB gzip בצ'אנק הפתיחה של
// **כל** מבקר, כולל אנונימי בדף הנחיתה שלעולם לא יפתח מחברת אימון.
// import() דינמי משאיר מקור אמת אחד (בלי העתקת רשימת ה-select) ומעביר את
// המחברת לצ'אנק משלה, שנטען רק כשבאמת צריך לשלוף תוכנית.
let planModule = null
const planApi = async () => (planModule ||= await import('./PlanNotebook'))

// הורדה מראש של תוכן תוכניות — 30.8.2026, אחרי תלונה אמיתית מהאולם:
// תוכנית שנכתבה במחשב הופיעה ברשימה בטאבלט (הרשימה נשמרת במכשיר), אבל
// התוכן שלה — הגוף, הדיו, המגרשים — יורד רק כשפותחים אותה בפועל. פתיחה
// ראשונה בלי רשת נתנה מסך שגיאה.
//
// הפתרון: אחרי כל טעינה מוצלחת של הרשימה (או של הלו״ז בבית), התוכן של
// התוכניות יורד ברקע לאותם מפתחות שהמסכים כבר נופלים אליהם בלי רשת:
// plan-edit (המחברת), plan-run (מסך האימון), plan-sheet (הדף מהלו״ז).
//
// ⚠ חיסכון: תוכנית שהעותק שלה עדכני (אותו updated_at) לא יורדת שוב.
//   כשאין updated_at ביד (הלו״ז מוסר רק id) — עותק שנשמר בשש השעות
//   האחרונות נחשב טרי; רענון מלא קורה בכניסה לרשימת התוכניות.
// ⚠ 12.9.2026 — אצווה אחת, לא לולאה. קודם רצה כאן שאילתה נפרדת לכל תוכנית
//   עם המתנה של 250ms ביניהן; עכשיו `.in('id', [...])` אחת לתוכן ואחת
//   לפרופילים של הכותבים — שני round-trips בסך הכול, בלי השהיות.

const FRESH_MS = 6 * 60 * 60 * 1000
const MAX_PLANS = 40

let running = false

export async function prefetchPlans(rows) {
  if (running) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  running = true
  try {
    // ---- שלב א: מי בכלל חסר? (מקומי בלבד, בלי רשת) ----
    const stale = []
    for (const row of (rows || []).slice(0, MAX_PLANS)) {
      if (!row?.id) continue
      // כבר יש עותק עדכני? בודקים גם את המחברת וגם את מסך האימון —
      // גרסה ישנה של האפליקציה שמרה רק אחד מהם.
      const [edit, run] = await Promise.all([
        cacheGet(`plan-edit:${row.id}`),
        cacheGet(`plan-run:${row.id}`),
      ])
      const fresh = (c) => {
        if (!c?.data) return false
        if (row.updated_at) return c.data.updated_at === row.updated_at
        return Date.now() - (c.at || 0) < FRESH_MS
      }
      if (!(fresh(edit) && fresh(run))) stale.push(row.id)
    }
    if (!stale.length) return

    // ---- שלב ב: שתי שאילתות, לא ארבעים ----
    // 12.9.2026 — עד היום הלולאה ירתה שאילתה נפרדת לכל תוכנית (ועד שלוש
    // אם המסד חסר עמודות), ועוד אחת לפרופיל המאמן, ובין סיבוב לסיבוב
    // המתינה 250ms: עד 40 round-trips סדרתיים שנמתחו על יותר מעשר שניות
    // של רשת ברקע, מיד אחרי שבית המאמן צויר. אצווה אחת עושה את אותו דבר.
    const { PLAN_SELECTS, notDeployed } = await planApi()
    let tier = 0
    let { data, error } = await supabase.from('training_plans').select(PLAN_SELECTS[0]).in('id', stale)
    // אותה ירידת דרגות כמו בטעינת המחברת (מסד שטרם הריץ מיגרציה) — עכשיו
    // פעם אחת לכל האצווה במקום פעם אחת לכל תוכנית
    while (error && notDeployed(error) && tier < PLAN_SELECTS.length - 1) {
      tier += 1
      ;({ data, error } = await supabase.from('training_plans').select(PLAN_SELECTS[tier]).in('id', stale))
    }
    if (error || !data?.length) return // רשת / הרשאה / נמחקו — בהזדמנות הבאה

    // פרטי המאמנים של כל התוכניות בשאילתה אחת
    const authorIds = [...new Set(data.map((p) => p.created_by).filter(Boolean))]
    const coachByUser = new Map()
    if (authorIds.length) {
      const { data: profs } = await supabase
        .from('profiles').select('id, first_name, last_name, club').in('id', authorIds)
      for (const pr of profs || []) {
        coachByUser.set(pr.id, { club: pr.club || '', name: `${pr.first_name || ''} ${pr.last_name || ''}`.trim() })
      }
    }

    // ---- שלב ג: כתיבה למטמון — מקומי, בלי רשת ובלי השהיות ----
    for (const plan of data) {
      const coach = coachByUser.get(plan.created_by) || {}
      cachePut(`plan-edit:${plan.id}`, plan)
      cachePut(`plan-run:${plan.id}`, { ...plan, coach })
      cachePut(`plan-sheet:${plan.id}`, { ...plan, coach })
    }
  } catch { /* הורדה ברקע — כשל שקט, המסכים לא תלויים בה */ } finally {
    running = false
  }
}
