import { supabase } from './supabaseClient'
import { L } from './i18n'
import { PLAYER_SIDE } from './flags'

// כל הקריאות והכתיבות של «תיק שחקן» במקום אחד.
// המסך (PlayerDossier.jsx) לא מדבר עם המסד ישירות — כך גם קל להחליף
// שאילתה בלי לגעת בתצוגה, וגם יש מקום אחד לזיהוי «המיגרציה עוד לא רצה».
//
// הטבלאות: dossier_people · dossier_metrics · dossier_entries ·
// dossier_notes · dossier_access · club_roles  (supabase_dossier_18_8.sql)

// המסד טרם הריץ את המיגרציה — הטבלה/הפונקציה לא קיימות
export const notDeployed = (e) =>
  ['42P01', '42883', 'PGRST202', 'PGRST205', '42703', 'PGRST204'].includes(e?.code) ||
  /does not exist|could not find|schema cache/i.test(e?.message || '')

export const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ---------- הקטלוג ----------
// ברירות מחדל גלובליות + שורות המועדון. שורת מועדון עם אותו key דורסת
// את ברירת המחדל (כולל כיבוי), ולכן המיזוג נעשה כאן ולא בשאילתה.
export async function loadCatalog() {
  const { data, error } = await supabase
    .from('dossier_metrics')
    .select('id, club, key, label, cat, cat_label, kind, unit, lower_is_better, sort, active')
    .order('sort', { ascending: true })
  if (error) return { error }
  const byKey = new Map()
  for (const row of data || []) {
    const cur = byKey.get(row.key)
    // שורת מועדון (club לא null) מנצחת את הגלובלית
    if (!cur || (row.club && !cur.club)) byKey.set(row.key, row)
  }
  const rows = data || []
  const all = [...byKey.values()].filter((m) => m.active).sort((a, b) => a.sort - b.sort)
  const ratings = all.filter((m) => m.kind === 'rating')
  const measures = all.filter((m) => m.kind === 'number')
  // קיבוץ לתחומים, בסדר שבו הם הופיעו
  const cats = []
  for (const m of ratings) {
    let c = cats.find((x) => x.key === m.cat)
    if (!c) { c = { key: m.cat, label: m.cat_label, metrics: [] }; cats.push(c) }
    c.metrics.push(m)
  }
  return { rows, all, ratings, measures, cats }
}

// ---------- עריכת הקטלוג (מנהל מועדון בלבד) ----------
// המדיניות במסד (dossier_metrics_write) מתירה כתיבה רק לשורות עם
// club = המועדון שלי. שינוי של שורה גלובלית נעשה כאן כ«שורת מועדון» עם
// אותו key — היא דורסת את הגלובלית במיזוג שב-loadCatalog, ומחיקתה
// מחזירה את ברירת המחדל. כך אף מועדון לא משנה לאחרים את הסולם.
export async function saveClubMetric(row) {
  const { id, ...fields } = row
  if (id) {
    const { error } = await supabase.from('dossier_metrics').update(fields).eq('id', id)
    return { error }
  }
  const { data, error } = await supabase.from('dossier_metrics').insert(fields).select('id').single()
  return { id: data?.id, error }
}

export async function deleteClubMetric(id) {
  const { error } = await supabase.from('dossier_metrics').delete().eq('id', id)
  return { error }
}

// מזהה למדד חדש: המסד דורש ^[a-z0-9_]{2,32}$, ולכן לא אפשר לגזור אותו
// מהשם בעברית. מזהה אקראי קצר — השם למסך יושב ב-label.
export const newMetricKey = () => {
  const a = new Uint8Array(6)
  globalThis.crypto?.getRandomValues?.(a)
  const hex = [...a].map((n) => n.toString(16).padStart(2, '0')).join('')
  return `m_${hex && !/^0+$/.test(hex) ? hex : Date.now().toString(36)}`
}

// ---------- הקבוצות והסגל ----------
export async function loadTeams(coachId) {
  const { data, error } = await supabase
    .from('team_players')
    .select('id, name, number, team, position, status, birth_year, person_id, player_id')
    .eq('coach_id', coachId)
    .order('team')
  if (error) return { error }
  const rows = data || []
  const teams = [...new Set(rows.map((r) => r.team))]
  return { teams, roster: rows }
}

const byNumberThenName = (a, b) => {
  const na = parseInt(a.number, 10), nb = parseInt(b.number, 10)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
  if (!Number.isNaN(na) && Number.isNaN(nb)) return -1
  if (Number.isNaN(na) && !Number.isNaN(nb)) return 1
  return (a.name || '').localeCompare(b.name || '', 'he')
}
export const sortRoster = (rows) => rows.slice().sort(byNumberThenName)

// פתיחת תיק לשורת סגל — יוצר את האדם בפעם הראשונה (RPC)
export async function openDossier(rosterId) {
  const { data, error } = await supabase.rpc('dossier_open', { p_roster: rosterId })
  if (error) return { error }
  return { personId: data }
}

// פתיחת תיקים לכל הסגל בבת אחת (סבב דירוג)
export async function openMany(rosterRows) {
  const out = {}
  for (const r of rosterRows) {
    if (r.person_id) { out[r.id] = r.person_id; continue }
    const { personId, error } = await openDossier(r.id)
    if (error) return { error }
    out[r.id] = personId
  }
  return { map: out }
}

// ---------- הערכים ----------
// מחזיר { [personId]: { [metricKey]: [{ on, value }] } } ממוין בזמן
export async function loadEntries(personIds) {
  if (!personIds.length) return { byPerson: {} }
  const { data, error } = await supabase
    .from('dossier_entries')
    .select('person_id, metric_key, value, measured_on, note')
    .in('person_id', personIds)
    .order('measured_on', { ascending: true })
  if (error) return { error }
  const byPerson = {}
  for (const r of data || []) {
    const p = (byPerson[r.person_id] ||= {})
    ;(p[r.metric_key] ||= []).push({ on: r.measured_on, value: Number(r.value), note: r.note })
  }
  return { byPerson }
}

// שמירת ערך אחד. אותו יום + אותו מדד + אותו מאמן = עדכון, לא נקודה חדשה.
export async function saveEntry({ personId, metricKey, value, on, note, coachId }) {
  const row = {
    person_id: personId,
    metric_key: metricKey,
    value,
    measured_on: on || today(),
    coach_id: coachId,
  }
  if (note !== undefined) row.note = note || null
  const { error } = await supabase
    .from('dossier_entries')
    .upsert(row, { onConflict: 'person_id,metric_key,measured_on,coach_id' })
  return { error }
}

// ביטול דירוג (לחיצה על אותה נקודה) — מוחקים את הערך של היום
export async function clearEntry({ personId, metricKey, on, coachId }) {
  const { error } = await supabase
    .from('dossier_entries')
    .delete()
    .eq('person_id', personId)
    .eq('metric_key', metricKey)
    .eq('measured_on', on || today())
    .eq('coach_id', coachId)
  return { error }
}

// ---------- הערות ----------
export async function loadNotes(personId) {
  const { data, error } = await supabase
    .from('dossier_notes')
    .select('id, kind, content, on_date, coach_id, created_at, coach:profiles!dossier_notes_coach_id_fkey(first_name, last_name)')
    .eq('person_id', personId)
    .order('on_date', { ascending: false })
  if (error) {
    // מסד בלי שם ה-FK הצפוי — שולפים בלי שם המאמן
    const plain = await supabase
      .from('dossier_notes')
      .select('id, kind, content, on_date, coach_id, created_at')
      .eq('person_id', personId)
      .order('on_date', { ascending: false })
    if (plain.error) return { error: plain.error }
    return { notes: plain.data || [] }
  }
  return { notes: data || [] }
}

export async function addNote({ personId, kind, content, on, coachId }) {
  const { data, error } = await supabase
    .from('dossier_notes')
    .insert({ person_id: personId, kind, content, on_date: on || today(), coach_id: coachId })
    .select('id, kind, content, on_date, coach_id, created_at')
    .single()
  return { note: data, error }
}

export async function removeNote(id) {
  const { error } = await supabase.from('dossier_notes').delete().eq('id', id)
  return { error }
}

// ---------- האדם ----------
export async function loadPerson(personId) {
  const { data, error } = await supabase
    .from('dossier_people')
    .select('id, club, full_name, birth_year, birth_date, player_id, created_by, created_at')
    .eq('id', personId)
    .maybeSingle()
  return { person: data, error }
}

// כל שורות הסגל שתלויות על האדם — «השנים שהתיק עבר איתן».
// שם המאמן מגיע מ-profiles; מאמן אחר שאני לא רשאי לראות יופיע בלי שם.
export async function loadHistory(personId) {
  const { data, error } = await supabase
    .from('team_players')
    .select('id, team, coach_id, created_at')
    .eq('person_id', personId)
    .order('created_at', { ascending: false })
  if (error) return { error }
  const rows = data || []
  const ids = [...new Set(rows.map((r) => r.coach_id))]
  let names = {}
  if (ids.length) {
    const { data: pr } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids)
    for (const p of pr || []) names[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim()
  }
  return { history: rows.map((r) => ({ ...r, coachName: names[r.coach_id] || L('מאמן אחר', 'Another coach') })) }
}

// ---------- כפילויות («זה אותו שחקן») ----------
export async function findDuplicates(personId) {
  const { data, error } = await supabase.rpc('dossier_duplicates', { p_person: personId })
  if (error) return { error }
  return { candidates: data || [] }
}

export async function mergePeople(fromId, intoId) {
  const { error } = await supabase.rpc('dossier_merge', { p_from: fromId, p_into: intoId })
  return { error }
}

// ---------- הרשאות ----------
export async function loadAccess(personId) {
  const { data, error } = await supabase
    .from('dossier_access')
    .select('coach_id, level, created_at')
    .eq('person_id', personId)
  if (error) return { error }
  const rows = data || []
  let names = {}
  if (rows.length) {
    const { data: pr } = await supabase
      .from('profiles').select('id, first_name, last_name, club').in('id', rows.map((r) => r.coach_id))
    for (const p of pr || []) names[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim()
  }
  return { access: rows.map((r) => ({ ...r, name: names[r.coach_id] || '—' })) }
}

export async function grantAccess({ personId, coachId, level, byId }) {
  const { error } = await supabase
    .from('dossier_access')
    .upsert({ person_id: personId, coach_id: coachId, level: level || 'view', granted_by: byId },
            { onConflict: 'person_id,coach_id' })
  return { error }
}

export async function revokeAccess({ personId, coachId }) {
  const { error } = await supabase
    .from('dossier_access').delete().eq('person_id', personId).eq('coach_id', coachId)
  return { error }
}

// ---------- המבנה במועדון ----------
export async function loadClubRoles(club) {
  if (!club) return { roles: [] }
  const { data, error } = await supabase
    .from('club_roles')
    .select('id, club, user_id, role, created_at')
    .eq('club', club)
  if (error) return { error }
  const rows = data || []
  let names = {}
  if (rows.length) {
    const { data: pr } = await supabase
      .from('profiles').select('id, first_name, last_name').in('id', rows.map((r) => r.user_id))
    for (const p of pr || []) names[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim()
  }
  return { roles: rows.map((r) => ({ ...r, name: names[r.user_id] || '—' })) }
}

// ---------- ניהול העץ (מנהל מועדון) ----------
// המדיניות club_roles_manager מתירה למנהל להוסיף/להסיר 'coach' ו-
// 'technical_director' במועדון שלו בלבד. מנהל מועדון נוסף — אדמין בלבד.
export async function addClubRole({ club, userId, role, byId }) {
  const { error } = await supabase
    .from('club_roles')
    .upsert({ club, user_id: userId, role, approved_by: byId }, { onConflict: 'club,user_id,role' })
  return { error }
}

export async function removeClubRole(id) {
  const { error } = await supabase.from('club_roles').delete().eq('id', id)
  return { error }
}

// מאמנים אחרים באותו מועדון — למתן גישה
export async function loadClubCoaches(club, meId) {
  if (!club) return { coaches: [] }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role, club')
    .eq('club', club)
    .neq('id', meId)
  if (error) return { error }
  return {
    coaches: (data || [])
      .filter((p) => p.role !== 'player')
      .map((p) => ({ id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—' })),
  }
}

// ---------- מה שנאסף לבד ----------
// נוכחות עונתית + מאמץ ממוצע + משימות שבוצעו, לשורת סגל אחת.
// הכול «מיטב המאמץ»: כשטבלה חסרה פשוט לא מציגים את המספר.
export async function loadAutoStats({ rosterId, playerId, coachId, team }) {
  const out = {}
  const att = await supabase
    .from('practice_attendance')
    .select('status')
    .eq('coach_id', coachId)
    .eq('team', team)
    .eq('player_id', rosterId)
  if (!att.error && (att.data || []).length) {
    const rows = att.data
    const here = rows.filter((r) => r.status !== 'absent').length
    out.attendance = Math.round((here / rows.length) * 100)
    out.sessions = rows.length
  }
  // צד המאמן בלבד (22.8): העומס והמשימות נרשמים על שורת הסגל (roster_id),
  // לא על חשבון השחקן. מסד שטרם הריץ supabase_coach_only_22_8.sql מחזיר
  // שגיאה על העמודה — ואז פשוט לא מציגים את המספר (כמו כל השאר כאן).
  if (!PLAYER_SIDE && rosterId) {
    // עומס מדווח הוא 1–10 (supabase_effort.sql), לא 1–5
    const ef = await supabase.from('session_effort').select('effort').eq('roster_id', rosterId).limit(200)
    if (!ef.error && (ef.data || []).length) {
      const v = ef.data.map((r) => Number(r.effort)).filter((n) => !Number.isNaN(n))
      if (v.length) out.effort = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10
    }
    const done = await supabase
      .from('assignment_coach_marks')
      .select('assignment_id', { count: 'exact', head: true })
      .eq('roster_id', rosterId).not('done_at', 'is', null)
    if (!done.error && typeof done.count === 'number') out.tasks = done.count
  } else if (playerId) {
    // עומס מדווח הוא 1–10 (supabase_effort.sql), לא 1–5
    const ef = await supabase.from('session_effort').select('effort').eq('player_id', playerId).limit(200)
    if (!ef.error && (ef.data || []).length) {
      const v = ef.data.map((r) => Number(r.effort)).filter((n) => !Number.isNaN(n))
      if (v.length) out.effort = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10
    }
    const done = await supabase
      .from('assignment_completions')
      .select('assignment_id', { count: 'exact', head: true })
      .eq('player_id', playerId)
    if (!done.error && typeof done.count === 'number') out.tasks = done.count
  }
  return { stats: out }
}
