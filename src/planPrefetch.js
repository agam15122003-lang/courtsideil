import { supabase } from './supabaseClient'
import { cacheGet, cachePut, isNetErr } from './offline'
import { PLAN_SELECTS, notDeployed } from './PlanNotebook'

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
// ⚠ בזה אחר זה עם הפסקה קצרה, לא במקביל — שלא להעמיס על שרת או סוללה.

const FRESH_MS = 6 * 60 * 60 * 1000
const MAX_PLANS = 40

let running = false

export async function prefetchPlans(rows) {
  if (running) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  running = true
  try {
    const coachByUser = new Map() // פרטי המאמן — שליפה אחת לכל מזהה
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
      if (fresh(edit) && fresh(run)) continue

      // אותה ירידת דרגות כמו בטעינת המחברת (מסד שטרם הריץ מיגרציה)
      let tier = 0
      let { data, error } = await supabase.from('training_plans').select(PLAN_SELECTS[0]).eq('id', row.id).single()
      while (error && notDeployed(error) && tier < PLAN_SELECTS.length - 1) {
        tier += 1
        ;({ data, error } = await supabase.from('training_plans').select(PLAN_SELECTS[tier]).eq('id', row.id).single())
      }
      if (error && isNetErr(error)) break // הרשת נפלה — נמשיך בהזדמנות הבאה
      if (error || !data) continue // תוכנית שנמחקה / אין הרשאה — מדלגים

      cachePut(`plan-edit:${row.id}`, data)

      if (!coachByUser.has(data.created_by)) {
        const { data: pr } = await supabase
          .from('profiles').select('first_name, last_name, club').eq('id', data.created_by).maybeSingle()
        coachByUser.set(data.created_by, pr
          ? { club: pr.club || '', name: `${pr.first_name || ''} ${pr.last_name || ''}`.trim() }
          : {})
      }
      const coach = coachByUser.get(data.created_by)
      cachePut(`plan-run:${row.id}`, { ...data, coach })
      cachePut(`plan-sheet:${row.id}`, { ...data, coach })

      await new Promise((r) => setTimeout(r, 250))
    }
  } catch { /* הורדה ברקע — כשל שקט, המסכים לא תלויים בה */ } finally {
    running = false
  }
}
