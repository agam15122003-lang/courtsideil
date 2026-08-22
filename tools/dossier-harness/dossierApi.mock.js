// הרנס ויזואלי ל«תיק שחקן» — תחליף ל-src/dossierApi.js עם נתוני דמה.
// בלי Supabase, בלי חשבון: מרנדרים את המסך האמיתי ומצלמים אותו.
// (tools/dossier-harness — לא חלק מהאפליקציה)
import { L } from '../../src/i18n'

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms))
export const notDeployed = () => false
export const today = () => '2026-08-22'
const ME = 'coach-me'

const CATS = [
  ['fund', 'יסודות', [['ball', 'שליטה בכדור'], ['pass', 'מסירה'], ['fin', 'סיומות'], ['shot', 'זריקה מבחוץ'], ['ft', 'זריקות חופשיות']]],
  ['def', 'הגנה', [['onball', 'הגנת כדור'], ['help', 'עזרה וחזרה'], ['reb', 'ריבאונד']]],
  ['mind', 'ראש ומחויבות', [['iq', 'הבנת משחק'], ['commit', 'מחויבות'], ['coach', 'קשב להדרכה'], ['lead', 'מנהיגות']]],
  ['body', 'גוף ואתלטיות', [['ath', 'אתלטיות'], ['speed', 'מהירות'], ['endur', 'סבולת'], ['coord', 'קואורדינציה']]],
]
const MEASURES = [
  ['height', 'גובה', 'ס"מ', false], ['weight', 'משקל', 'ק"ג', false], ['jump', 'זינוק', 'ס"מ', false], ['sprint', 'ריצת 20 מ׳', 'שנ׳', true],
]
export async function loadCatalog() {
  const rows = []
  let sort = 10
  for (const [cat, catLabel, ms] of CATS) for (const [key, label] of ms) rows.push({ id: key, club: null, key, label, cat, cat_label: catLabel, kind: 'rating', unit: null, lower_is_better: false, sort: (sort += 10), active: true })
  for (const [key, label, unit, lower] of MEASURES) rows.push({ id: key, club: null, key, label, cat: 'measure', cat_label: 'מדידות', kind: 'number', unit, lower_is_better: lower, sort: (sort += 10), active: true })
  const all = rows
  const ratings = all.filter((m) => m.kind === 'rating')
  const measures = all.filter((m) => m.kind === 'number')
  const cats = []
  for (const m of ratings) {
    let c = cats.find((x) => x.key === m.cat)
    if (!c) { c = { key: m.cat, label: m.cat_label, metrics: [] }; cats.push(c) }
    c.metrics.push(m)
  }
  return { rows, all, ratings, measures, cats }
}

const PLAYERS = [
  ['7', 'איתי לוי', 'רכז', 2011], ['33', 'עומר דגן', 'סנטר', 2010], ['4', 'יונתן שרון', 'כנף', 2011], ['11', 'נועם ברק', 'קלעי', 2010],
  ['15', 'דניאל שוורץ', 'פורוורד', 2011], ['23', 'אורי כהן', 'סנטר', 2010], ['9', 'רן אלמוג', 'רכז', 2011], ['2', 'אלון פרץ', 'קלעי', 2011],
]
const roster = PLAYERS.map(([number, name, position, birth_year], i) => ({
  id: `r${i}`, name, number, team: 'נערים א׳', position, status: 'active', birth_year, person_id: `p${i}`, player_id: i < 5 ? `u${i}` : null, coach_id: ME,
}))
export async function loadTeams() { await wait(); return { teams: ['נערים א׳', 'נערים ב׳'], roster } }
export const sortRoster = (rows) => rows.slice()
export async function openDossier(rid) { return { personId: rid.replace('r', 'p') } }
export async function openMany(rows) { return { map: Object.fromEntries(rows.map((r) => [r.id, r.person_id])) } }

// ערכים: שני סבבים (אפריל + היום) לכל שחקן, עם פיזור דטרמיניסטי
const entriesStore = {}
const seed = (pi, key, shift) => { const h = [...(key + pi)].reduce((a, c) => a + c.charCodeAt(0), 0); return Math.max(1, Math.min(5, 2 + ((h + shift) % 4))) }
for (let i = 0; i < PLAYERS.length; i++) {
  const pid = `p${i}`
  entriesStore[pid] = {}
  for (const [, , ms] of CATS) for (const [key] of ms) entriesStore[pid][key] = [
    { on: '2026-04-19', value: seed(i, key, 0) }, { on: '2026-08-22', value: seed(i, key, i % 2 ? 1 : 2) },
  ]
  const base = { height: 172 + i * 2, weight: 62 + i * 3, jump: 44 + i, sprint: 3.6 - i * 0.04 }
  for (const [key] of MEASURES) entriesStore[pid][key] = [
    { on: '2025-10-12', value: Math.round((base[key] - 4 * (key === 'sprint' ? -0.03 : 1)) * 100) / 100 },
    { on: '2025-12-03', value: Math.round((base[key] - 3 * (key === 'sprint' ? -0.02 : 1)) * 100) / 100 },
    { on: '2026-01-28', value: Math.round((base[key] - 2 * (key === 'sprint' ? -0.02 : 1)) * 100) / 100 },
    { on: '2026-04-19', value: Math.round((base[key] - 1 * (key === 'sprint' ? -0.01 : 1)) * 100) / 100 },
    { on: '2026-08-22', value: base[key] },
  ]
}
export async function loadEntries(ids) { await wait(); return { byPerson: Object.fromEntries(ids.map((id) => [id, entriesStore[id] || {}])) } }
export async function saveEntry({ personId, metricKey, value, on }) {
  const arr = (entriesStore[personId][metricKey] || []).filter((e) => e.on !== on)
  entriesStore[personId][metricKey] = [...arr, { on, value }].sort((a, b) => (a.on < b.on ? -1 : 1))
  await wait(120); return {}
}
export async function clearEntry({ personId, metricKey, on }) {
  entriesStore[personId][metricKey] = (entriesStore[personId][metricKey] || []).filter((e) => e.on !== on)
  await wait(120); return {}
}

let notes = [
  { id: 'n1', kind: 'שיחה', content: 'דיברנו על התפקיד ברביע הרביעי. מבין שהוא לא הפותח, מבקש דקות בסיום צמוד — להחזיר אליו בעוד שבועיים.', on_date: '2026-08-14', coach_id: ME, coach: { first_name: 'דור', last_name: 'אביב' } },
  { id: 'n2', kind: 'רקע', content: 'אח גדול משחק בנוער של המועדון. הגיע מחוג, בלי רקע תחרותי.', on_date: '2024-09-09', coach_id: 'other', coach: { first_name: 'רועי', last_name: 'שדה' } },
  { id: 'n3', kind: 'פציעה', content: 'נקע בקרסול שמאל, חזר לאימון מלא אחרי שבועיים. עדיין נמנע מנחיתות על רגל אחת.', on_date: '2026-03-02', coach_id: ME, coach: { first_name: 'דור', last_name: 'אביב' } },
]
export async function loadNotes() { await wait(); return { notes } }
export async function addNote({ kind, content, on, coachId }) { const note = { id: `n${Date.now()}`, kind, content, on_date: on, coach_id: coachId, created_at: new Date().toISOString() }; notes = [note, ...notes]; return { note } }
export async function removeNote(id) { notes = notes.filter((n) => n.id !== id); return {} }
export async function loadPerson(id) { return { person: { id, club: 'מכבי הדר', full_name: 'איתי לוי', birth_year: 2011 } } }
export async function loadHistory() {
  await wait()
  return { history: [
    { id: 'r0', team: 'נערים א׳', coach_id: ME, created_at: '2026-08-01T00:00:00Z', coachName: 'דור אביב' },
    { id: 'h2', team: 'נערים ב׳', coach_id: ME, created_at: '2025-08-01T00:00:00Z', coachName: 'דור אביב' },
    { id: 'h1', team: 'ילדים א׳', coach_id: 'other', created_at: '2024-08-01T00:00:00Z', coachName: 'רועי שדה' },
  ] }
}
export async function findDuplicates() { return { candidates: [] } }
export async function mergePeople() { return {} }
export async function loadAccess() { return { access: [{ coach_id: 'fit', level: 'view', name: 'איל רם' }] } }
export async function grantAccess() { return {} }
export async function revokeAccess() { return {} }
export async function loadClubRoles() {
  return { roles: [
    // המאמן של ההרנס הוא גם מנהל המועדון — כדי שטאבי «המועדון» ו«הקטלוג» יופיעו
    { id: 'c0', club: 'מכבי הדר', user_id: ME, role: 'club_manager', name: 'דור אביב' },
    { id: 'c1', club: 'מכבי הדר', user_id: 'mgr', role: 'club_manager', name: 'נועה קידר' },
    { id: 'c2', club: 'מכבי הדר', user_id: 'dir', role: 'technical_director', name: 'יואב שגב' },
    { id: 'c3', club: 'מכבי הדר', user_id: ME, role: 'coach', name: 'דור אביב' },
    { id: 'c4', club: 'מכבי הדר', user_id: 'other', role: 'coach', name: 'רועי שדה' },
  ] }
}
export async function loadClubCoaches() { return { coaches: [{ id: 'other', name: 'רועי שדה' }, { id: 'fit', name: 'איל רם' }, { id: 'ml', name: 'מיכל לוין' }] } }
export async function addClubRole() { return {} }
export async function removeClubRole() { return {} }
export async function loadAutoStats() { await wait(); return { stats: { attendance: 94, sessions: 34, effort: 7.4, tasks: 18 } } }
export async function saveClubMetric() { return { id: 'x' } }
export async function deleteClubMetric() { return {} }
export const newMetricKey = () => 'm_' + Math.random().toString(36).slice(2, 8)
export { L }
