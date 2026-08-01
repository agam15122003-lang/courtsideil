// ===== ייבוא סרטונים אמיתיים מיוטיוב (YouTube Data API v3) =====
// משתמשים ב-Search API כדי לשלוף סרטוני כדורסל אמיתיים ועדכניים לכל נושא.
// המפתח נמצא ב-constants.js (YOUTUBE_API_KEY). השגה חינמית:
//   https://console.cloud.google.com → Enable "YouTube Data API v3" → Create API key.
import { YOUTUBE_API_KEY } from './constants'

export const ytConfigured = () => !!(YOUTUBE_API_KEY && YOUTUBE_API_KEY.trim())

// כותרות יוטיוב מגיעות עם האשטגים ורעש ("... #nba #basketball #shorts") שלא אומרים כלום
// לשחקן, ומאריכים את הכרטיס לשלוש שורות. מנקים לתצוגה בלבד (במסד נשמרת הכותרת המקורית).
export function cleanVideoTitle(title) {
  return String(title || '')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')      // האשטגים
    .replace(/\s*[|·–-]\s*$/, '')           // מפריד שנשאר בסוף
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// חילוץ מזהה סרטון מקישור יוטיוב (watch / youtu.be / embed / shorts)
export function getYouTubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)
  return m ? m[1] : null
}

// פענוח ישויות HTML שמגיעות בכותרות של יוטיוב
const decode = (s) =>
  String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()

// חיפוש סרטונים. מחזיר [{ id, title, channel, url }]
// lang: 'he' / 'en' — מסמך ההשקה 2.3 מבקש שאילתות בשתי השפות לכל קטגוריה.
export async function searchYouTube(query, max = 12, lang = 'en') {
  if (!ytConfigured()) throw new Error('missing YOUTUBE_API_KEY')
  const url =
    'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video' +
    `&maxResults=${Math.min(max, 50)}&safeSearch=strict&relevanceLanguage=${lang === 'he' ? 'iw' : 'en'}` +
    `&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY.trim()}`
  const r = await fetch(url)
  const j = await r.json()
  if (j.error) throw new Error(j.error.message || 'YouTube API error')
  return (j.items || [])
    .filter((it) => it.id && it.id.videoId)
    .map((it) => ({
      id: it.id.videoId,
      title: decode(it.snippet?.title),
      channel: decode(it.snippet?.channelTitle),
      url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
    }))
}

// משך ISO8601 (PT12M34S) → דקות. null אם לא ניתן לפענח.
function isoMinutes(iso) {
  const m = String(iso || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  return (Number(m[1] || 0) * 60) + Number(m[2] || 0) + (Number(m[3] || 0) > 0 ? 1 : 0)
}

// פרטי סרטונים בבת אחת (עד 50) — משך, צפיות, והאם ניתן להטמעה.
// מחזיר Map: id → { minutes, views, embeddable }
export async function fetchVideoDetails(ids) {
  if (!ytConfigured()) throw new Error('missing YOUTUBE_API_KEY')
  const out = new Map()
  const list = [...new Set(ids)].filter(Boolean)
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50)
    const url =
      'https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,status' +
      `&id=${batch.join(',')}&key=${YOUTUBE_API_KEY.trim()}`
    const r = await fetch(url)
    const j = await r.json()
    if (j.error) throw new Error(j.error.message || 'YouTube API error')
    for (const it of j.items || []) {
      out.set(it.id, {
        minutes: isoMinutes(it.contentDetails?.duration),
        views: Number(it.statistics?.viewCount || 0),
        embeddable: it.status?.embeddable !== false,
      })
    }
  }
  return out
}
