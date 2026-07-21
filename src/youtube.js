// ===== ייבוא סרטונים אמיתיים מיוטיוב (YouTube Data API v3) =====
// משתמשים ב-Search API כדי לשלוף סרטוני כדורסל אמיתיים ועדכניים לכל נושא.
// המפתח נמצא ב-constants.js (YOUTUBE_API_KEY). השגה חינמית:
//   https://console.cloud.google.com → Enable "YouTube Data API v3" → Create API key.
import { YOUTUBE_API_KEY } from './constants'

export const ytConfigured = () => !!(YOUTUBE_API_KEY && YOUTUBE_API_KEY.trim())

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
export async function searchYouTube(query, max = 12) {
  if (!ytConfigured()) throw new Error('missing YOUTUBE_API_KEY')
  const url =
    'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video' +
    `&maxResults=${Math.min(max, 50)}&safeSearch=strict&relevanceLanguage=en` +
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
