// ============================================================
// ספריית קליפים במכשיר — שמירת קליפים מיוצאים ב-IndexedDB.
// הכול מקומי בדפדפן: אין שרת, אין העלאה, אין תלות בחבילות.
// רשומה: { id, name, blob, ext, size, duration, createdAt }
// ============================================================

const DB_NAME = 'courtside-clips'
const DB_VERSION = 1
const STORE = 'clips'

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    const out = fn(store)
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : undefined)
    t.onerror = () => reject(t.error || new Error('IndexedDB transaction failed'))
    t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'))
  })
}

// שמירת קליפ חדש — מחזיר את הרשומה שנשמרה (בלי ה-blob, לתצוגה)
export async function saveClip({ name, blob, ext, duration }) {
  const db = await openDB()
  const rec = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: (name || '').trim() || 'קליפ ללא שם',
    blob,
    ext,
    size: blob.size,
    duration: Number.isFinite(duration) ? duration : null,
    createdAt: Date.now(),
  }
  await tx(db, 'readwrite', (s) => s.put(rec))
  db.close()
  const { blob: _omit, ...meta } = rec
  return meta
}

// כל הקליפים השמורים — מטא-נתונים בלבד (בלי ה-blobs, מהחדש לישן)
export async function listClips() {
  const db = await openDB()
  const all = await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly')
    const req = t.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
  db.close()
  return all
    .map(({ blob, ...meta }) => ({ ...meta, size: meta.size ?? blob?.size ?? 0 }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

// שליפת ה-blob של קליפ (להורדה/שיתוף/ניגון)
export async function getClipBlob(id) {
  const db = await openDB()
  const rec = await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly')
    const req = t.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return rec ? { blob: rec.blob, name: rec.name, ext: rec.ext } : null
}

// שינוי שם קליפ
export async function renameClip(id, name) {
  const db = await openDB()
  await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    const store = t.objectStore(STORE)
    const req = store.get(id)
    req.onsuccess = () => {
      const rec = req.result
      if (rec) {
        rec.name = (name || '').trim() || rec.name
        store.put(rec)
      }
    }
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
  db.close()
}

// מחיקת קליפ
export async function deleteClip(id) {
  const db = await openDB()
  await tx(db, 'readwrite', (s) => s.delete(id))
  db.close()
}
