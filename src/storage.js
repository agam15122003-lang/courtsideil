import { supabase } from './supabaseClient'

const BUCKET = 'media'

// דחיסת תמונה בצד הלקוח — צילום טלפון של 8MB הופך לקובץ של כמה מאות KB.
// מקטין לצלע מקסימלית של 1600px ומקודד JPEG; שומר על כיוון התמונה (EXIF).
// GIF/SVG או כשל דחיסה — מחזירים את הקובץ המקורי.
async function compressImage(file, maxDim = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    if (bmp.close) bmp.close()
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) return file
    // אם המקור ממילא קטן מהתוצאה — אין טעם להחליף
    if (blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// העלאת תמונה ל-bucket 'media' ומחזירה את **הנתיב** בתוך ה-bucket
// ("avatars/<uid>/<ts>.jpg") ולא URL ציבורי — התמונות מוגשות דרך signed URL
// בלבד (סקירת 3.8: תמונות פנים של קטינים בכתובת ציבורית קבועה).
// folder: 'avatars' / 'drills' / 'community'. userId משמש לארגון ולמדיניות ה-Storage.
export async function uploadImage(file, folder, userId) {
  if (!file) throw new Error('לא נבחר קובץ')
  if (!file.type.startsWith('image/')) throw new Error('יש לבחור קובץ תמונה')
  // מגבלה רכה לפני דחיסה — צילומי טלפון גדולים מתקבלים ונדחסים
  if (file.size > 25 * 1024 * 1024) throw new Error('התמונה גדולה מדי (מקסימום 25MB)')

  const compressed = await compressImage(file)
  if (compressed.size > 5 * 1024 * 1024) {
    throw new Error('גם אחרי דחיסה התמונה גדולה מדי — נסו תמונה קטנה יותר')
  }

  const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${folder}/${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    cacheControl: '3600',
    upsert: true,
    contentType: compressed.type,
  })
  if (error) throw error

  return path
}

// ===== הגשת מדיה דרך signed URLs =====
// כל תמונה במערכת מוגשת דרך createSignedUrl עם תפוגה, כדי שאחרי הפיכת ה-bucket
// ל-Private לא תישאר אף כתובת ציבורית קבועה לתמונת קטין. החתימה עובדת גם על
// bucket ציבורי, ולכן הקוד הזה תקין גם לפני שהמיגרציה רצה בפרודקשן — וגם על
// פרודקשן שלא הריץ אותה כלל (נפילה חזרה ל-URL הציבורי).

// ברירת מחדל: 6 שעות. מספיק לגלישה ארוכה, קצר מספיק כדי שקישור שדלף ימות.
export const SIGNED_TTL = 21600
// מרווח חידוש — חותמים מחדש כשנשארו פחות מ-5 דקות
const RENEW_MS = 5 * 60 * 1000

// גדלי תצוגה לרשימות (Supabase Image Transformations) — במקום להוריד את
// ה-JPEG המלא של 1600px לאווטאר של 44px או לתמונת פיד.
export const AVATAR_THUMB = { width: 160, quality: 70 }
export const FEED_THUMB = { width: 600, quality: 75 }

const SIGN_CACHE = new Map() // key -> { url, exp }
const INFLIGHT = new Map() // key -> Promise
// טרנספורמציות תמונה אינן זמינות בכל תוכנית של Supabase. אם ה-render endpoint
// נכשל פעם אחת — מכבים אותן לכל הסשן וחוזרים לתמונה המלאה, במקום להסתיר תמונות.
let transformsEnabled = true

const isHttp = (s) => /^https?:\/\//i.test(s)
const isInline = (s) => /^(blob:|data:)/i.test(s)

// כתובת שאינה בתוך ה-bucket שלנו (תמונת יוטיוב, blob של תצוגה מקדימה) —
// מוחזרת כמו שהיא ולא נחתמת.
function passthrough(s) {
  return isHttp(s) || isInline(s) ? s : null
}

// mediaPath — מקבל URL ציבורי ישן ("/object/public/media/<path>"), URL חתום,
// נתיב חשוף, או כתובת חיצונית. מחזיר את הנתיב בתוך ה-bucket, או null אם
// מדובר בכתובת חיצונית / קלט לא שמיש.
export function mediaPath(urlOrPath) {
  const s = String(urlOrPath || '').trim()
  if (!s) return null
  const markers = [
    `/object/public/${BUCKET}/`,
    `/object/sign/${BUCKET}/`,
    `/render/image/public/${BUCKET}/`,
    `/render/image/sign/${BUCKET}/`,
  ]
  for (const m of markers) {
    const at = s.indexOf(m)
    if (at !== -1) {
      const raw = s.slice(at + m.length).split('?')[0]
      try {
        return decodeURIComponent(raw) || null
      } catch {
        return raw || null
      }
    }
  }
  // כתובת חיצונית, blob/data או כל סכימה אחרת — לא נתיב שלנו
  if (isHttp(s) || isInline(s) || s.includes(':')) return null
  // נתיב חשוף בתוך ה-bucket
  const clean = s.replace(/^\/+/, '').split('?')[0]
  return clean || null
}

const cacheKey = (path, t) => `${path}|${t?.width || ''}|${t?.quality || ''}`

function cached(key) {
  const hit = SIGN_CACHE.get(key)
  if (hit && hit.exp - Date.now() > RENEW_MS) return hit.url
  return null
}

function remember(key, url, ttlMs) {
  SIGN_CACHE.set(key, { url, exp: Date.now() + ttlMs })
  return url
}

// נפילה חזרה: ה-URL הציבורי הישן. על bucket שעדיין ציבורי (או פרודקשן שלא
// הריץ את המיגרציה) זה ממשיך לעבוד; על bucket פרטי הוא יחזיר שגיאה
// והרכיב המציג יסתיר את התמונה / יציג ראשי תיבות.
function publicFallback(path) {
  try {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl || null
  } catch {
    return null
  }
}

async function signOne(path, expiresIn, transform) {
  const opts = transform && transformsEnabled ? { transform } : undefined
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresIn, opts)
    if (!error && data?.signedUrl) return { url: data.signedUrl, ttl: expiresIn * 1000 }
    // ייתכן שהטרנספורמציה היא זו שנדחתה — מנסים שוב בלעדיה
    if (opts) {
      const retry = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
      if (!retry.error && retry.data?.signedUrl) {
        return { url: retry.data.signedUrl, ttl: expiresIn * 1000 }
      }
    }
  } catch {
    /* רשת/הרשאה — נופלים לכתובת הציבורית */
  }
  // קאש קצר לנפילה, כדי לנסות שוב בעוד דקה ולא בכל רינדור
  return { url: publicFallback(path), ttl: RENEW_MS + 60 * 1000 }
}

// signedMediaUrl — הכתובת להצגה של תמונה בודדת.
// כתובת חיצונית מוחזרת ללא שינוי; קלט לא שמיש מחזיר null.
export async function signedMediaUrl(urlOrPath, expiresIn = SIGNED_TTL, transform = null) {
  const s = String(urlOrPath || '').trim()
  if (!s) return null
  const path = mediaPath(s)
  if (!path) return passthrough(s)

  const t = transform && transformsEnabled ? transform : null
  const key = cacheKey(path, t)
  const hit = cached(key)
  if (hit) return hit
  const pending = INFLIGHT.get(key)
  if (pending) return pending

  const p = signOne(path, expiresIn, t)
    .then(({ url, ttl }) => {
      INFLIGHT.delete(key)
      return url ? remember(key, url, ttl) : null
    })
    .catch(() => {
      INFLIGHT.delete(key)
      return null
    })
  INFLIGHT.set(key, p)
  return p
}

// signedMediaUrls — חתימת רשימה בקריאה אחת (פיד, סגל). מחזיר מערך באותו סדר
// ובאותו אורך של הקלט. createSignedUrls אינו תומך בטרנספורמציות, ולכן כאן
// נחתמת התמונה המלאה — לתצוגות רשימה עדיף signedMediaUrl עם FEED_THUMB.
export async function signedMediaUrls(list, expiresIn = SIGNED_TTL) {
  const items = (Array.isArray(list) ? list : []).map((raw) => {
    const s = String(raw || '').trim()
    const path = s ? mediaPath(s) : null
    return { path, url: path ? cached(cacheKey(path, null)) : passthrough(s) }
  })
  const need = [...new Set(items.filter((i) => i.path && !i.url).map((i) => i.path))]
  if (!need.length) return items.map((i) => i.url || null)

  const signed = new Map()
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(need, expiresIn)
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row && row.path && row.signedUrl && !row.error) {
          signed.set(row.path, remember(cacheKey(row.path, null), row.signedUrl, expiresIn * 1000))
        }
      }
    }
  } catch {
    /* נופלים לכתובות הציבוריות */
  }
  for (const path of need) {
    if (!signed.has(path)) {
      const fb = publicFallback(path)
      if (fb) signed.set(path, remember(cacheKey(path, null), fb, RENEW_MS + 60 * 1000))
    }
  }
  return items.map((i) => (i.url ? i.url : i.path ? signed.get(i.path) || null : null))
}

// signedThumbUrls — כמו signedMediaUrls, אבל עם טרנספורמציית גודל.
// createSignedUrls (הקריאה המרוכזת) אינו תומך ב-transform, ולכן כל תצוגת
// רשימה קיבלה עד היום את ה-JPEG המלא (1600px) גם לתמונונת של 600px.
// כאן חותמים דרך signedMediaUrl, שכבר מכיל קאש ו-dedup לפי מפתח, כך
// שכתובת שחוזרת ברשימה נחתמת פעם אחת בלבד. אם הטרנספורמציות כבויות
// (תוכנית Supabase בלי render endpoint) נופלים חזרה לחתימה המרוכזת.
export async function signedThumbUrls(list, transform = FEED_THUMB, expiresIn = SIGNED_TTL) {
  const arr = Array.isArray(list) ? list : []
  if (!arr.length) return []
  if (!transformsEnabled || !transform) return signedMediaUrls(arr, expiresIn)
  return Promise.all(arr.map((raw) => signedMediaUrl(raw, expiresIn, transform)))
}

// noteImageError — רכיב שנכשל בטעינת תמונה מדווח כאן. אם הכישלון הוא בכתובת
// טרנספורמציה, מכבים טרנספורמציות ומאפשרים ניסיון חוזר עם התמונה המלאה.
// מחזיר true אם כדאי לנסות שוב.
export function noteImageError(url) {
  if (!url || !String(url).includes('/render/image/')) return false
  // *כל* כתובת /render/image/ שנכשלה מזכה בניסיון חוזר — לא רק הראשונה.
  // קודם, אחרי שהתמונה הראשונה כיבתה את הדגל, כל שאר התמונות באותו מסך
  // (שכבר קיבלו כתובת טרנספורמציה ונכשלו גם הן) קיבלו false, סומנו broken
  // ונעלמו לגמרי עד remount — פוסט אחד עם תמונה ושבעה בלי.
  if (transformsEnabled) {
    // הכיבוי והניקוי קורים פעם אחת: מכאן והלאה signedMediaUrl חותם בלי transform
    transformsEnabled = false
    SIGN_CACHE.clear()
    INFLIGHT.clear()
  }
  // אין סכנת לולאה: הכתובת שתיחתם עכשיו אינה /render/image/, ולכן כשל נוסף
  // עליה יחזיר false ויסמן broken כמתוכנן.
  return true
}
