// יצירת קובץ יומן (ICS) והורדתו — "הוסף ליומן" לאימון מהלו"ז.
// עובד עם יומן גוגל/אפל/אאוטלוק בלי שום שרת.

const pad = (n) => String(n).padStart(2, '0')

// תאריך+שעה מקומיים בפורמט ICS "צף" (בלי אזור זמן — נשאר בשעה המקומית)
function icsStamp(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh = 0, mm = 0] = (timeStr || '00:00').split(':').map(Number)
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`
}

const esc = (s) =>
  String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

// מוריד קובץ .ics לאירוע יחיד.
// {title, date:'YYYY-MM-DD', start:'HH:MM', end:'HH:MM'|null, location, description}
export function downloadIcs({ title, date, start, end, location, description }) {
  const dtStart = icsStamp(date, start)
  // בלי שעת סיום — שעה אחת כברירת מחדל
  let dtEnd
  if (end) {
    dtEnd = icsStamp(date, end)
  } else {
    const [hh = 0, mm = 0] = (start || '00:00').split(':').map(Number)
    dtEnd = icsStamp(date, `${pad(Math.min(23, hh + 1))}:${pad(mm)}`)
  }
  const uid = `${dtStart}-${Math.random().toString(36).slice(2)}@courtside`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CourtSide//HE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStart}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${esc(title)}`,
    location ? `LOCATION:${esc(location)}` : null,
    description ? `DESCRIPTION:${esc(description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(title || 'practice').replace(/[^\w֐-׿ -]/g, '')}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
