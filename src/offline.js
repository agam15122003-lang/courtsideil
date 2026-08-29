import { supabase } from './supabaseClient'

// עבודה בלי אינטרנט — 29.8.2026, לבקשת הבעלים («גם לרשום בלי רשת»).
//
// שני חצאים, שניהם ב-IndexedDB (localStorage קטן מדי לדיו ולמגרשים):
//
//   מטמון קריאה  — כל שליפה מוצלחת נשמרת במכשיר. כשהרשת נופלת, המסך
//                  מקבל את העותק השמור במקום שגיאה, ומסמן שזה עותק.
//   תור יציאה    — כתיבה שנכשלה ברשת נכנסת לתור, ומנוגנת מחדש ברגע
//                  שהרשת חוזרת (אירוע online) או בכניסה הבאה לאפליקציה.
//
// ⚠ סדר הניגון נשמר (תור, לא סל): שמירת תוכנית ואז עדכון נוכחות חייבים
//   להגיע למסד באותו סדר.
// ⚠ פעולה שנדחתה על ידי השרת (לא בעיית רשת — הרשאות, אילוץ) נזרקת מהתור
//   עם אזהרה בקונסול. אחרת פעולה רעילה אחת הייתה חוסמת את כל התור לנצח.
// ⚠ שני מכשירים שערכו בלי רשת: האחרון שמסתנכרן קובע (last-write-wins).
//   זה מסד של מאמן יחיד — העימות היחיד הוא בין המכשירים של עצמו.

const DB_NAME = 'courtside-offline'
const DB_VER = 1

let dbPromise = null
function db() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no idb')); return }
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache')
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const tx = async (store, mode, fn) => {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode)
    const s = t.objectStore(store)
    const out = fn(s)
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : undefined)
    t.onerror = () => reject(t.error)
  })
}

// ---------- זיהוי «אין רשת» ----------
// supabase-js מחזיר כשל fetch כ-error עם הודעת רשת; בנוסף navigator.onLine.
export const isNetErr = (e) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = String(e?.message || e || '')
  // 'timeout' בדיוק — הזקיף של מרוצי ה-Promise.race שלנו (8 שניות מול
  // תקיעה). «canceling statement due to statement timeout» של פוסטגרס הוא
  // כשל שרת, לא רשת — מאמן מחובר קיבל ממנו באנר «אין אינטרנט» כוזב.
  if (m === 'timeout') return true
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet/i.test(m)
}

// «עוד לא נפרס בפרודקשן» — עותק מקומי של הבדיקה מ-PlanNotebook. לא מייבאים
// משם: זה היה יוצר מעגל מודולים (PlanNotebook מייבא את offline).
const notDeployed = (e) =>
  ['42703', '42883', '42P01', 'PGRST202', 'PGRST204'].includes(e?.code) ||
  /does not exist|could not find/i.test(e?.message || '')

// ---------- מטמון קריאה ----------
export async function cachePut(key, data) {
  try { await tx('cache', 'readwrite', (s) => s.put({ at: Date.now(), data }, key)) } catch { /* אין IDB — בלי מטמון */ }
}
export async function cacheGet(key) {
  try {
    const d = await db()
    const rec = await new Promise((resolve, reject) => {
      const t = d.transaction('cache', 'readonly')
      const rq = t.objectStore('cache').get(key)
      rq.onsuccess = () => resolve(rq.result)
      rq.onerror = () => reject(rq.error)
    })
    return rec ? { data: rec.data, at: rec.at } : null
  } catch { return null }
}

// עטיפה לשליפה: מנסים חי; הצלחה נשמרת במטמון, כשל רשת נופל לעותק השמור.
// run() חייב להחזיר { data, error } (צורת supabase).
export async function cachedRead(key, run) {
  try {
    const { data, error } = await run()
    if (!error) {
      if (data != null) cachePut(key, data)
      return { data, error: null, fromCache: false }
    }
    if (isNetErr(error)) {
      const c = await cacheGet(key)
      if (c) return { data: c.data, error: null, fromCache: true, cachedAt: c.at }
    }
    return { data, error, fromCache: false }
  } catch (e) {
    const c = await cacheGet(key)
    if (c) return { data: c.data, error: null, fromCache: true, cachedAt: c.at }
    return { data: null, error: e, fromCache: false }
  }
}

// ---------- תור היציאה ----------
export async function enqueue(op) {
  try {
    await tx('outbox', 'readwrite', (s) => s.add({ ...op, at: Date.now() }))
    notifyPending()
    return true
  } catch {
    return false // אין IDB — הקריאה תטפל בכשל כרגיל
  }
}

async function outboxEntries() {
  try {
    const d = await db()
    return await new Promise((resolve, reject) => {
      const t = d.transaction('outbox', 'readonly')
      const s = t.objectStore('outbox')
      const keysRq = s.getAllKeys()
      const valsRq = s.getAll()
      t.oncomplete = () => resolve(keysRq.result.map((k, i) => [k, valsRq.result[i]]))
      t.onerror = () => reject(t.error)
    })
  } catch { return [] }
}
const outboxDel = (key) => tx('outbox', 'readwrite', (s) => s.delete(key))

export async function pendingCount() {
  return (await outboxEntries()).length
}

// מאזינים לשינויים בתור (להצגת «ממתין לסנכרון» בממשק)
const listeners = new Set()
export const onPendingChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
async function notifyPending() {
  const n = await pendingCount()
  listeners.forEach((fn) => { try { fn(n) } catch { /* לא קריטי */ } })
}

// ---------- ניגון פעולה אחת ----------
async function playOp(op) {
  switch (op.kind) {
    case 'plan-save': {
      let { error } = await supabase.from('training_plans')
        .upsert({ id: op.id, created_by: op.me, ...op.payload }, { onConflict: 'id' })
      // מסד שטרם הריץ את מיגרציית המחברת — אותה נפילה לאחור כמו בשמירה
      // החיה: לפחות השם נשמר, במקום שהתוכנית כולה תיזרק מהתור.
      if (error && notDeployed(error)) {
        ;({ error } = await supabase.from('training_plans')
          .upsert({ id: op.id, created_by: op.me, name: op.payload?.name }, { onConflict: 'id' }))
      }
      if (error) return error
      if (Array.isArray(op.items)) {
        // אותה לוגיקה כמו בשמירה החיה: מוחקים רק פריטים מקושרים ומכניסים מחדש.
        // ⚠ כשל המחיקה נבדק: אם היא נכשלה וההכנסה הייתה מצליחה, כל התרגילים
        //   המקושרים היו מוכפלים — והפעולה נזרקת מהתור, כלומר קלקול קבוע.
        const del = await supabase.from('plan_items').delete().eq('plan_id', op.id).not('drill_id', 'is', null)
        if (del.error) return del.error
        if (op.items.length) {
          const rows = op.items.map((it, i) => ({ plan_id: op.id, drill_id: it.drill_id, position: i, duration_minutes: it.duration_minutes || null }))
          let r = await supabase.from('plan_items').insert(rows.map((x) => ({ ...x, part: 1 })))
          if (r.error) r = await supabase.from('plan_items').insert(rows)
          if (r.error) return r.error
        }
      }
      return null
    }
    case 'att-upsert': {
      let { error } = await supabase.from('practice_attendance')
        .upsert(op.rows, { onConflict: 'coach_id,team,session_date,player_id' })
      if (error && /reason/.test(String(error.message))) {
        ;({ error } = await supabase.from('practice_attendance')
          .upsert(op.rows.map(({ reason, ...r }) => r), { onConflict: 'coach_id,team,session_date,player_id' }))
      }
      return error
    }
    case 'lineups-upsert': {
      const { error } = await supabase.from('plan_lineups').upsert(op.row)
      return error
    }
    default:
      return null // סוג לא מוכר (גרסה ישנה?) — נזרק
  }
}

// ---------- ניגון התור ----------
// ⚠ מחזיקים את ההבטחה שבטיסה, לא דגל: `if (flushing) return` החזיר
//   undefined, ו-await flushOutbox() בתחילת שמירת מחברת — שכל תפקידו
//   לחכות שהתור יתרוקן — המשיך מיד בזמן שהניגון עוד רץ ברקע.
let flushPromise = null
export function flushOutbox() {
  if (flushPromise) return flushPromise
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(0)
  flushPromise = doFlush().finally(() => { flushPromise = null })
  return flushPromise
}
async function doFlush() {
  const entries = await outboxEntries()
  let played = 0
  for (const [key, op] of entries) {
    const error = await playOp(op)
    if (error && isNetErr(error)) break // הרשת נפלה שוב — נמשיך בפעם הבאה
    if (error) console.warn('[offline] פעולה נדחתה על ידי השרת ונזרקה:', op.kind, error.message)
    await outboxDel(key)
    if (!error) played++
  }
  if (played > 0) notifyPending()
  return played
}

// חיבור אוטומטי: הרשת חזרה → מנגנים. נרשם פעם אחת ברמת המודול.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushOutbox() })
  // ⚠ אירוע online לבדו לא מספיק: באולם עם WiFi «מחובר» בלי אינטרנט אמיתי
  //   navigator.onLine נשאר true כל הזמן, האירוע לא יורה לעולם — והקשות
  //   שנכנסו לתור היו יושבות ימים. לכן גם: חזרה לאפליקציה (visibility)
  //   ודופק כל דקה — שניהם זולים כשאין מה לנגן (התור נבדק לפני רשת).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flushOutbox()
  })
  setInterval(() => {
    pendingCount().then((n) => { if (n > 0) flushOutbox() })
  }, 60000)
  // אחסון עמיד: בלי הבקשה הזו אנדרואיד רשאי לפנות את IndexedDB בלחץ
  // אחסון — כולל תור היציאה שמחזיק את העותק היחיד של נוכחות שסומנה
  // בלי רשת. best-effort: דפדפן שמסרב פשוט משאיר את המצב כמו היום.
  try { navigator.storage?.persist?.() } catch { /* לא קריטי */ }
}
