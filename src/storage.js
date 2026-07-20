import { supabase } from './supabaseClient'

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

// העלאת תמונה ל-bucket הציבורי 'media' ומחזיר URL ציבורי.
// folder: 'avatars' / 'drills' / 'community'. userId משמש לארגון ולמדיניות RLS.
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

  const { error } = await supabase.storage.from('media').upload(path, compressed, {
    cacheControl: '3600',
    upsert: true,
    contentType: compressed.type,
  })
  if (error) throw error

  const { data } = supabase.storage.from('media').getPublicUrl(path)
  return data.publicUrl
}
