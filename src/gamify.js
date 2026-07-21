// gamify.js — לוגיקת המשחוק של השחקן (רמות, רצף, תגים).
// פונקציות טהורות בלבד — קל לבדוק, בלי תלות ב-DB.

const XP_PER_DRILL = 15
const XP_PER_LEVEL = 120 // ~8 תרגילים לרמה

// כותרות לרמות (נבחר לפי מספר הרמה, חוזר חלילה מהאחרונה)
const LEVEL_TITLES = [
  ['מתחיל', 'Rookie'],
  ['שחקן קבוצתי', 'Team Player'],
  ['סקורר', 'Scorer'],
  ['סטארטר', 'Starter'],
  ['כוכב עולה', 'Rising Star'],
  ['אול-סטאר', 'All-Star'],
  ['אגדה', 'Legend'],
]

// yyyy-mm-dd מקומי מתוך תאריך/מחרוזת
function dayKey(d) {
  const dt = new Date(d)
  if (isNaN(dt)) return null
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// רצף ימים רצוף שמסתיים היום או אתמול (אחרת 0 — הרצף נשבר)
export function computeStreak(dates) {
  const days = new Set()
  for (const d of dates || []) {
    const k = dayKey(d)
    if (k) days.add(k)
  }
  if (days.size === 0) return 0
  const oneDay = 86400000
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const has = (dt) => days.has(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)

  // הרצף נחשב רק אם יש פעילות היום או אתמול
  let cursor = new Date(today)
  if (!has(cursor)) {
    cursor = new Date(today.getTime() - oneDay)
    if (!has(cursor)) return 0
  }
  let streak = 0
  while (has(cursor)) {
    streak += 1
    cursor = new Date(cursor.getTime() - oneDay)
  }
  return streak
}

// מצב המשחוק המלא של השחקן
export function playerProgress({ completedCount = 0, completionDates = [], attendancePct = null } = {}) {
  const xp = completedCount * XP_PER_DRILL
  const level = Math.floor(xp / XP_PER_LEVEL) + 1
  const xpIntoLevel = xp % XP_PER_LEVEL
  const progress = Math.max(0, Math.min(1, xpIntoLevel / XP_PER_LEVEL))
  const xpToNext = XP_PER_LEVEL - xpIntoLevel
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)]
  const streak = computeStreak(completionDates)

  const badges = [
    { id: 'first', icon: 'Sparkles', label: ['צעד ראשון', 'First step'], earned: completedCount >= 1, hint: ['בצע תרגיל אחד', 'Do 1 drill'] },
    { id: 'five', icon: 'Flame', label: ['חמש בסל', 'High five'], earned: completedCount >= 5, hint: ['5 תרגילים', '5 drills'] },
    { id: 'ten', icon: 'Zap', label: ['עשר נקי', 'Perfect ten'], earned: completedCount >= 10, hint: ['10 תרגילים', '10 drills'] },
    { id: 'twentyfive', icon: 'Crown', label: ['אלוף אימונים', 'Grind master'], earned: completedCount >= 25, hint: ['25 תרגילים', '25 drills'] },
    { id: 'streak3', icon: 'CalendarCheck', label: ['רצף 3', '3-day streak'], earned: streak >= 3, hint: ['3 ימים ברצף', '3 days in a row'] },
    { id: 'streak7', icon: 'Trophy', label: ['שבוע מושלם', 'Perfect week'], earned: streak >= 7, hint: ['7 ימים ברצף', '7 days in a row'] },
    { id: 'attend', icon: 'ShieldCheck', label: ['נוכחות ברזל', 'Iron attendance'], earned: attendancePct != null && attendancePct >= 80, hint: ['80% נוכחות', '80% attendance'] },
  ]

  return { xp, level, progress, xpIntoLevel, xpToNext, xpPerLevel: XP_PER_LEVEL, title, streak, badges }
}
