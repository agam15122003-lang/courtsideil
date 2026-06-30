import { supabase } from './supabaseClient'

// העלאת תמונה ל-bucket הציבורי 'media' ומחזיר URL ציבורי.
// folder: 'avatars' או 'drills'. userId משמש לארגון ולמדיניות RLS.
export async function uploadImage(file, folder, userId) {
  if (!file) throw new Error('לא נבחר קובץ')
  if (!file.type.startsWith('image/')) throw new Error('יש לבחור קובץ תמונה')
  if (file.size > 5 * 1024 * 1024) throw new Error('התמונה גדולה מדי (מקסימום 5MB)')

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${folder}/${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from('media').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type,
  })
  if (error) throw error

  const { data } = supabase.storage.from('media').getPublicUrl(path)
  return data.publicUrl
}
