// bwUtil.js — עזרים משותפים לדפי עולם הכדורסל (bw-*).
// קובץ נפרד ולא בתוך BasketballWorld.jsx כדי שהרכיבים הפנימיים (הפיד,
// כרטיס האתגר) לא ייבאו את המעטפת שמייבאת אותם — בלי מעגלים.
import { useEffect, useState } from 'react'
import { L } from './i18n'
import { serverNow } from './game'

// ===== נעילת הרקע כששכבה מלאת-מסך פתוחה =====
// aria-hidden לבד מסתיר מקוראי מסך אבל משאיר את הכפתורים שמאחור לחיצים
// ובמסלול ה-Tab. inert על מעטפת האפליקציה (.layout) מוציא אותה משניהם.
// מונה, ולא דגל: כשמסך המשחק מתחלף במסך הסיום שתי השכבות חיות לרגע יחד.
// data-bw-inert הוא רשת ביטחון ל-WebView ישן בלי תמיכה ב-inert.
// ⚠ בטוח דווקא כי כל השכבות עוברות ב-createPortal ל-body — הן מחוץ ל-.layout.
let lockDepth = 0
function applyLock() {
  const el = document.querySelector('.layout') || document.getElementById('root')
  const on = lockDepth > 0
  if (el) {
    el.inert = on
    if (on) el.setAttribute('data-bw-inert', ''); else el.removeAttribute('data-bw-inert')
  }
  document.body.style.overflow = on ? 'hidden' : ''
}
export function lockApp() {
  lockDepth += 1
  applyLock()
  let released = false
  return () => { if (released) return; released = true; lockDepth = Math.max(0, lockDepth - 1); applyLock() }
}

// ===== טיימר גבול: רינדור אחד בדיוק ברגע שהחלון נפתח/נסגר =====
// בלי זה «נפתח בעוד שעה» נשאר נעול גם אחרי שהשעה עברה, ו«הגש» נשאר על
// המסך אחרי שהחלון נסגר — עד שהמשתמש מרענן. אין כאן אינטרוול של שנייה:
// טיימר אחד לגבול הקרוב, ואחריו עוד אחד.
export function useBoundaryTick(times) {
  const [n, setN] = useState(0)
  const key = (times || []).filter(Boolean).join('|')
  useEffect(() => {
    const now = serverNow().getTime()
    const next = (times || [])
      .map((t) => (t ? new Date(t).getTime() : NaN))
      .filter((t) => Number.isFinite(t) && t > now)
      .sort((a, b) => a - b)[0]
    if (next === undefined) return undefined
    // +250ms כדי שברינדור הבא הגבול באמת מאחורינו (אחרת לולאת טיימר-0),
    // וחסם עליון בגלל גלישת ה-32 ביט של setTimeout
    const t = setTimeout(() => setN((x) => x + 1), Math.min(next - now + 250, 2147483000))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n])
  return n
}

// '2026-08' → «אוגוסט 2026»
export function monthLabel(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return ''
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(L('he-IL', 'en-GB'), { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)))
}

// זמן יחסי קצר — «לפני שעה», «אתמול»
export function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const m = Math.floor(ms / 60000)
  if (m < 2) return L('לפני רגע', 'just now')
  if (m < 60) return L(`לפני ${m} דק׳`, `${m}m ago`)
  const h = Math.floor(m / 60)
  if (h < 24) return h === 1 ? L('לפני שעה', '1h ago') : h === 2 ? L('לפני שעתיים', '2h ago') : L(`לפני ${h} שע׳`, `${h}h ago`)
  const d = Math.floor(h / 24)
  if (d === 1) return L('אתמול', 'yesterday')
  if (d === 2) return L('לפני יומיים', '2d ago')
  return L(`לפני ${d} ימים`, `${d}d ago`)
}

// מפתח העונה הקודמת ('2026/2027' → '2025/2026'). game_my_points מסנן לפי
// עונה, וברצף ימים שחוצה את תחילת העונה הימים שלפניה נעלמים — לכן הבית
// מושך גם אותה (קריאה אחת, עד 200 שורות). null כשהמפתח לא בפורמט הצפוי.
// ⚠ game_my_points מוגבל ל-200 שורות (עד 8 ביום) — רצף ארוך מ~25 יום
//   ייספר בחסר עד שיהיה RPC ייעודי לימי משחק.
export function prevSeasonKey(keys) {
  const m = /^(\d{4})\/(\d{4})$/.exec(keys?.season || '')
  if (!m) return null
  return `${Number(m[1]) - 1}/${Number(m[2]) - 1}`
}

// תנועה מופחתת — שני המנגנונים של הפרויקט (העדפת מערכת + ווידג׳ט הנגישות)
export function reduced() {
  return (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    || document.documentElement.classList.contains('a11y-motion')
}

// תוצאה + יחידה: «17/20», «11 שלשות», «24.8 שנ׳» — בלי רווח לפני לוכסן/אחוז
export function withUnit(score, unit) {
  if (score === null || score === undefined || score === '') return '—'
  const u = String(unit || '').trim()
  if (!u) return String(score)
  return /^[/%]/.test(u) ? `${score}${u}` : `${score} ${u}`
}

// ראשי תיבות לאווטאר — «יובל שמש» → «יש»
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((s) => s[0]).join('') || '·'
}

// תאריך מקומי (ירושלים) כ-YYYY-MM-DD, כמו occurred_on בפנקס
function localDay(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function shiftDay(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

// רצף ימי חידון + מפת השבוע (א׳–ש׳) — נגזר מהפנקס (occurred_on), לא
// מ«רצף» שנשמר איפשהו: מה שאין בפנקס לא קרה.
export function quizStreak(rows) {
  const days = new Set((rows || []).map((r) => r.occurred_on).filter(Boolean))
  const today = localDay(serverNow())
  let cur = days.has(today) ? today : shiftDay(today, -1)
  let streak = 0
  while (days.has(cur)) { streak += 1; cur = shiftDay(cur, -1) }
  // השבוע הנוכחי מתחיל ביום ראשון
  const dow = new Date(today + 'T12:00:00Z').getUTCDay()
  const sunday = shiftDay(today, -dow)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = shiftDay(sunday, i)
    return { d, on: days.has(d), now: d === today, future: d > today }
  })
  return { streak, week, playedToday: days.has(today) }
}
