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
// 12.9.2026 — מי המשתמש המחובר, במשתנה ברמת המודול.
//
// ⚠ למה **לא** await supabase.auth.getSession() בתוך enqueue (הגרסה הראשונה
//   של החתימה עשתה בדיוק את זה, וזו הייתה רגרסיה במסלול שהיא באה להגן עליו):
//   getSession בודק אם טוקן הגישה פג, ואם כן הוא יוצא לרשת לרענון — עם
//   ניסיונות חוזרים ובלי זקיף זמן. באולם עם WiFi «מחובר בלי אינטרנט»
//   (navigator.onLine נשאר true) הבקשה הזו **תלויה**, וכל הקוראים של enqueue
//   ממתינים לה — כלומר הכתיבה ל-IndexedDB, שכל תפקידה להציל את העבודה מיד,
//   נדחית בשניות. מאמן שסוגר את האפליקציה בחלון הזה מאבד את הנוכחות לגמרי.
//   וגרוע מזה: אחרי כשעה בלי רשת הרענון נכשל, getSession מחזיר session:null
//   (הנפילה-אחורה לסשן השמור תקפה רק כשטוקן הגישה בתוקף), הפעולה נחתמת בלי
//   בעלים — והשומר לא חל דווקא בסבב הארוך שבגללו הוא נכתב.
//
// לכן: הכתיבה לתור לעולם אינה ממתינה לשכבת ה-auth. ה-uid מוחזק כאן,
// מתעדכן מאירועי ההתחברות, ונשמר גם כמראה סינכרונית ב-localStorage כדי
// שגם ההקשה הראשונה אחרי רענון דף בלי רשת תיחתם נכון.
const UID_MIRROR = 'cs_outbox_uid'
let cachedUid = (() => { try { return localStorage.getItem(UID_MIRROR) || null } catch { return null } })()

function setUid(id) {
  cachedUid = id || null
  try {
    if (id) localStorage.setItem(UID_MIRROR, id)
    else localStorage.removeItem(UID_MIRROR)
  } catch { /* אחסון חסום (ספארי פרטי) — נשארים עם הזיכרון בלבד */ }
}

// המנוי הזה יורה גם בעלייה (INITIAL_SESSION), ולכן אין צורך בקריאת
// getSession נוספת. מנקים רק על SIGNED_OUT מפורש: כשל רענון רגעי בלי רשת
// מגיע כסשן ריק, ואסור שימחק את הבעלים מהפעולות הבאות.
try {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') setUid(null)
    else if (session?.user?.id) setUid(session.user.id)
  })
} catch { /* לקוח placeholder בלי הגדרות — נשארים עם המראה */ }

// לניגון בלבד: מאשרים מול שכבת ה-auth (שם ההמתנה רצה ברקע), אבל עם זקיף
// של 3 שניות כמו בכל קריאת אחסון אחרת — PlanNotebook עושה
// `await flushOutbox()` לפני שמירה, ואסור שהוא ייתקע על רענון טוקן תלוי.
async function flushUid() {
  let t
  try {
    const res = await Promise.race([
      supabase.auth.getSession().finally(() => clearTimeout(t)),
      new Promise((resolve) => { t = setTimeout(() => resolve(null), 3000) }),
    ])
    // תשובה מפורשת «אין סשן» מכבדים: זו בדיוק הסיבה שהניגון עוצר.
    if (res) return res.data?.session?.user?.id || null
  } catch { /* נופלים לערך השמור */ }
  return cachedUid
}

export async function enqueue(op) {
  try {
    // 12.9.2026 — חותמת בעלים על כל פעולה. לבעלים שני חשבונות מאמן על אותו
    // טלפון: הניגון רץ ברמת המודול (online / visibility / דופק דקה) גם
    // במסך הכניסה, גם אחרי התנתקות וגם כשחשבון אחר מחובר — ואז הפעולה
    // נדחית ב-RLS, נחשבת «שגיאת שרת» ונמחקת בשקט. נוכחות ומחברת שנרשמו
    // באולם בלי רשת פשוט נעלמו.
    // סינכרוני במכוון — ראו ההערה הארוכה למעלה. הכתיבה יוצאת מיד.
    const uid = op.uid || cachedUid
    await tx('outbox', 'readwrite', (s) => s.add({ ...op, uid, at: Date.now() }))
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
  // 12.9.2026 — בלי משתמש מחובר אין למי לנגן: כל כתיבה תידחה ב-RLS, ועד
  // היום הדחייה הזו הייתה מוחקת את הפעולה מהתור לצמיתות. במסך הכניסה,
  // אחרי התנתקות ובזמן שחשבון אחר מחובר — התור פשוט ממתין.
  const uid = await flushUid()
  if (!uid) return 0
  const entries = await outboxEntries()
  let played = 0
  for (const [key, op] of entries) {
    // פעולה של החשבון השני על אותו מכשיר — מדלגים בלי למחוק. היא תנוגן
    // כשהבעלים שלה יתחבר. (op.uid חסר = פעולה מגרסה ישנה, מתנהגת כקודם.)
    if (op.uid && op.uid !== uid) continue
    const error = await playOp(op)
    if (error && isNetErr(error)) break // הרשת נפלה שוב — נמשיך בפעם הבאה
    if (error) {
      // 12.9.2026 — לא מוחקים על הכישלון הראשון. דחייה חד-פעמית (סשן
      // שנתפס באמצע רענון טוקן, אילוץ זמני) הייתה מספיקה כדי לאבד עבודה
      // שנרשמה באולם. מונים ניסיונות, ועוצרים את הסבב כדי לא לשבור את
      // סדר התור — הניסיון הבא קורה בדופק הבא.
      const tries = (op.tries || 0) + 1
      if (tries < 2) {
        console.warn('[offline] פעולה נדחתה — ננסה שוב בסבב הבא:', op.kind, error.message)
        try { await tx('outbox', 'readwrite', (s) => s.put({ ...op, tries }, key)) } catch { /* לא קריטי */ }
        break
      }
      console.warn('[offline] פעולה נדחתה על ידי השרת פעמיים ונזרקה:', op.kind, error.message)
    }
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
