// כללי הייבוא מהאיגוד — פונקציות טהורות, בלי מסד, בלי רשת, בלי ייבוא.
//
// הופרדו מ-ibaImport.js בכוונה: אלה הכללים שמגנים על תוצאות ועל סיכומים
// של משחקים ששוחקו, והם החלק היחיד בזרימת הייבוא שאפשר לבדוק אוטומטית
// (הזרימה עצמה דורשת נתוני איגוד אמיתיים). הקובץ בלי תלויות כדי
// ש-scripts/test-iba-import.mjs יוכל לייבא אותו ישירות תחת Node.
//
// ⚠ החוזה, ואסור לשבור אותו:
//   · התאמה לפי תאריך+יריבה. שורה קיימת נשמרת עם ה-id שלה, ולכן התוצאה,
//     הסיכום, הנוכחות והסקירה של משחק ששוחק לא נמחקים לעולם.
//   · על שורה קיימת מתעדכנים **רק** שעה ומיקום.
//   · משחק שנעלם מלוח האיגוד נמחק רק אם הוא ריק לגמרי: בלי תוצאה, בלי
//     סיכום, ורק אם source='iba'. משחק שהוקלד ידנית לא נוגעים בו.
//     במסד בלי העמודה source הערך undefined — ואז לא נמחק כלום, וזו
//     ברירת המחדל הבטוחה.

// מפתח התאמה בין משחק בלוח של האיגוד למשחק ששמור אצלנו
export const gameKey = (dateStr, opponent) => `${dateStr}|${(opponent || '').trim()}`

const hhmm = (t) => (t ? String(t).slice(0, 5) : null)

// מחזירה { inserts, updates, deletes } — מה לכתוב, בלי לכתוב.
export function planIbaChanges(existing, games) {
  const rows = existing || []
  const feed = games || []
  const byKey = new Map(rows.map((g) => [gameKey(g.game_date, g.opponent), g]))
  const feedKeys = new Set()
  const inserts = []
  const updates = []

  for (const g of feed) {
    const key = gameKey(g.date, g.opponent)
    feedKeys.add(key)
    const cur = byKey.get(key)
    if (cur) {
      // רק שעה ומיקום — התוצאה והסיכום נשארים בדיוק כמו שהם
      if (hhmm(cur.game_time) === hhmm(g.time) && (cur.location || null) === (g.location || null)) continue
      updates.push({ id: cur.id, game_time: g.time || null, location: g.location || null })
    } else {
      inserts.push({
        game_date: g.date,
        game_time: g.time || null,
        opponent: g.opponent || null,
        location: g.location || null,
      })
    }
  }

  const deletes = rows.filter((g) =>
    g.source === 'iba' && !feedKeys.has(gameKey(g.game_date, g.opponent)) &&
    g.our_score == null && g.their_score == null && !(g.summary || '').trim())

  return { inserts, updates, deletes }
}
