import { supabase } from './supabaseClient'
import { sendNotification } from './notify'

// יצירת קוד הצטרפות קריא (בלי תווים מבלבלים: 0/O, 1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function randomCode(len = 6) {
  let s = ''
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  for (let i = 0; i < len; i++) s += ALPHABET[arr[i] % ALPHABET.length]
  return s
}

// מחזיר את קוד ההצטרפות של קבוצה (יוצר אם אין). מפתח: (coach_id, team).
export async function getOrCreateJoinCode(coachId, team) {
  const { data: existing } = await supabase
    .from('team_join_codes')
    .select('code')
    .eq('coach_id', coachId)
    .eq('team', team)
    .maybeSingle()
  if (existing?.code) return existing.code

  // מנסים כמה פעמים למקרה של התנגשות קוד
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(6)
    const { error } = await supabase
      .from('team_join_codes')
      .insert({ code, coach_id: coachId, team })
    if (!error) return code
    // אם ההתנגשות היא על (coach_id, team) — מישהו יצר במקביל, נקרא שוב
    const { data: again } = await supabase
      .from('team_join_codes')
      .select('code').eq('coach_id', coachId).eq('team', team).maybeSingle()
    if (again?.code) return again.code
  }
  throw new Error('could not create join code')
}

// שחקן מזין קוד → מוצא את הקבוצה ויוצר בקשת הצטרפות ממתינה.
// מחזיר { ok, status, coach, team } או { ok:false, reason }.
export async function requestJoinByCode(playerId, rawCode) {
  const code = (rawCode || '').trim().toUpperCase()
  if (code.length < 4) return { ok: false, reason: 'bad-code' }

  const { data: row } = await supabase
    .from('team_join_codes')
    .select('coach_id, team')
    .eq('code', code)
    .maybeSingle()
  if (!row) return { ok: false, reason: 'not-found' }

  // כבר קיימת בקשה?
  const { data: existing } = await supabase
    .from('team_memberships')
    .select('status')
    .eq('coach_id', row.coach_id)
    .eq('team', row.team)
    .eq('player_id', playerId)
    .maybeSingle()
  if (existing) return { ok: true, status: existing.status, ...row, already: true }

  const { error } = await supabase
    .from('team_memberships')
    .insert({ coach_id: row.coach_id, team: row.team, player_id: playerId, status: 'pending' })
  if (error) return { ok: false, reason: error.message }
  // מתריעים למאמן על בקשה חדשה
  sendNotification({
    to: row.coach_id, actor: playerId, type: 'message',
    content: 'שחקן ביקש להצטרף לקבוצה שלך', nav: 'teams',
  })
  return { ok: true, status: 'pending', ...row }
}

// מאמן מאשר/דוחה בקשת הצטרפות. באישור — מוסיף את השחקן לסגל (עם player_id) ומתריע לו.
export async function decideMembership(membership, approve) {
  const status = approve ? 'approved' : 'rejected'
  const { error } = await supabase
    .from('team_memberships')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', membership.id)
  if (error) return { ok: false, reason: error.message }

  if (approve) {
    // מוסיפים לסגל אם עדיין אין שורה מקושרת לשחקן הזה
    const { data: existing } = await supabase
      .from('team_players')
      .select('id')
      .eq('coach_id', membership.coach_id)
      .eq('team', membership.team)
      .eq('player_id', membership.player_id)
      .maybeSingle()
    if (!existing) {
      const nm = membership.player
        ? `${membership.player.first_name || ''} ${membership.player.last_name || ''}`.trim()
        : 'שחקן'
      const row = { coach_id: membership.coach_id, team: membership.team, name: nm || 'שחקן', status: 'active', player_id: membership.player_id }
      const { error: e2 } = await supabase.from('team_players').insert(row)
      if (e2 && /column .* does not exist/i.test(e2.message)) {
        const { player_id: _pid, ...basic } = row
        await supabase.from('team_players').insert(basic)
      }
    }
    sendNotification({
      to: membership.player_id, actor: membership.coach_id, type: 'message',
      content: 'המאמן אישר אותך לקבוצה! 🎉', nav: 'drills',
    })
  }
  return { ok: true }
}

// בקשות ממתינות לכל הקבוצות של מאמן (עם פרטי השחקן)
export async function pendingRequests(coachId) {
  const { data } = await supabase
    .from('team_memberships')
    .select('*, player:profiles!player_id(first_name, last_name, birth_year, position, avatar_url)')
    .eq('coach_id', coachId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  return data || []
}

// כל החברויות של שחקן (עם פרטי המאמן)
export async function myMemberships(playerId) {
  const { data } = await supabase
    .from('team_memberships')
    .select('*, coach:profiles!coach_id(first_name, last_name, club, avatar_url)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
  return data || []
}
