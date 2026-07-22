// ============================================================
// זהות אימון־חוזר: לוח קבוע (team_practice_slots) לא מייצר שורות DB לכל מופע.
// כל מופע = (משבצת, תאריך) מקבל UUID דטרמיניסטי (UUIDv5) — כך שהדירוג של השחקן
// והסקירה של המאמן חולקים בדיוק את אותו session_id בלי צורך ליצור רשומה מראש.
// ============================================================

// SHA-1 סינכרוני על Uint8Array → Uint8Array(20). מימוש תקני.
function sha1(msg) {
  const ml = msg.length * 8
  const total = (((msg.length + 8) >> 6) + 1) << 6
  const bytes = new Uint8Array(total)
  bytes.set(msg)
  bytes[msg.length] = 0x80
  const dv = new DataView(bytes.buffer)
  dv.setUint32(total - 4, ml >>> 0, false)
  dv.setUint32(total - 8, Math.floor(ml / 0x100000000), false)
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  const w = new Int32Array(80)
  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getInt32(i + j * 4, false)
    for (let j = 16; j < 80; j++) { const n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16]; w[j] = (n << 1) | (n >>> 31) }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let j = 0; j < 80; j++) {
      let f, k
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999 }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1 }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc }
      else { f = b ^ c ^ d; k = 0xca62c1d6 }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0
  }
  const out = new Uint8Array(20); const odv = new DataView(out.buffer)
  odv.setInt32(0, h0, false); odv.setInt32(4, h1, false); odv.setInt32(8, h2, false); odv.setInt32(12, h3, false); odv.setInt32(16, h4, false)
  return out
}

// UUIDv5 (namespace DNS) — דטרמיניסטי לכל מחרוזת מפתח
const NS = [0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8]
export function uuidv5(name) {
  const nameBytes = new TextEncoder().encode(name)
  const buf = new Uint8Array(NS.length + nameBytes.length)
  buf.set(NS); buf.set(nameBytes, NS.length)
  const h = sha1(buf)
  h[6] = (h[6] & 0x0f) | 0x50 // version 5
  h[8] = (h[8] & 0x3f) | 0x80 // variant RFC4122
  const hex = Array.from(h.slice(0, 16)).map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

// session_id יציב למופע אימון־חוזר (משבצת + תאריך)
export function occurrenceId(slotId, dateStr) {
  return uuidv5(`slot:${slotId}:${dateStr}`)
}

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const WEEKDAYS = [
  ['ראשון', 'Sun'], ['שני', 'Mon'], ['שלישי', 'Tue'], ['רביעי', 'Wed'], ['חמישי', 'Thu'], ['שישי', 'Fri'], ['שבת', 'Sat'],
]

// הרחבת משבצות קבועות למופעים מתוארכים בטווח [fromOffsetDays .. toOffsetDays] יחסית להיום.
// slots: [{id, weekday, start_time, end_time, location, team, coach_id}]
// מחזיר רשימה ממוינת לפי תאריך+שעה, כל פריט עם session_id דטרמיניסטי.
// הרחבה לטווח תאריכים אבסולוטי [fromDate .. toDate] (אובייקטי Date, כולל).
export function expandSlotsRange(slots, fromDate, toDate) {
  if (!slots || slots.length === 0) return []
  const from = new Date(fromDate); from.setHours(0, 0, 0, 0)
  const to = new Date(toDate); to.setHours(0, 0, 0, 0)
  const out = []
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay(); const dateStr = ymd(d)
    for (const s of slots) {
      if (Number(s.weekday) !== wd) continue
      out.push({
        slot_id: s.id, session_id: occurrenceId(s.id, dateStr), coach_id: s.coach_id, team: s.team,
        date: dateStr, weekday: wd,
        start_time: s.start_time ? String(s.start_time).slice(0, 5) : null,
        end_time: s.end_time ? String(s.end_time).slice(0, 5) : null,
        location: s.location || null,
      })
    }
  }
  return out
}

export function expandSlots(slots, fromOffsetDays, toOffsetDays) {
  if (!slots || slots.length === 0) return []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const out = []
  for (let off = fromOffsetDays; off <= toOffsetDays; off++) {
    const d = new Date(today); d.setDate(d.getDate() + off)
    const wd = d.getDay()
    const dateStr = ymd(d)
    for (const s of slots) {
      if (Number(s.weekday) !== wd) continue
      out.push({
        slot_id: s.id,
        session_id: occurrenceId(s.id, dateStr),
        coach_id: s.coach_id,
        team: s.team,
        date: dateStr,
        weekday: wd,
        start_time: s.start_time ? String(s.start_time).slice(0, 5) : null,
        end_time: s.end_time ? String(s.end_time).slice(0, 5) : null,
        location: s.location || null,
      })
    }
  }
  return out.sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))
}
