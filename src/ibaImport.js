import { supabase } from './supabaseClient'
import { L } from './i18n'
import { planIbaChanges } from './ibaRules'

export { gameKey, planIbaChanges } from './ibaRules'

// ייבוא לוח המשחקים מהאיגוד — לוגיקה אחת לשני מקומות הקריאה:
// מסך «משחקים וטבלה» ומודאל הקישור שבטופס הפרופיל.
//
// עד היום הקוד הזה חי רק בתוך TeamGames, ולכן מאמן שקישר קבוצה בפרופיל
// קיבל חצי תוצאה: הוא עשה את העבודה הקשה — מצא את הקבוצה שלו בין מאות —
// והופנה למסך אחר כדי למשוך את המשחקים. עכשיו זו משימה אחת.
//
// ⚠ הייבוא אינו הרסני, וזה החוזה החשוב של הקובץ הזה:
//   · התאמה לפי תאריך+יריבה. שורה שכבר קיימת נשמרת עם ה-id שלה, ולכן
//     התוצאה, הסיכום, הנוכחות והסקירה של משחק ששוחק לא נמחקים לעולם.
//   · על שורה קיימת מתעדכנים רק שעה ומיקום.
//   · משחק שנעלם מהלוח של האיגוד נמחק **רק** אם הוא ריק לגמרי: בלי
//     תוצאה, בלי סיכום, ורק אם source='iba'. משחק שהוקלד ידנית לא נגלע.
//     במסד שאין בו את העמודה source הערך undefined — ואז לא נמחק כלום,
//     וזו ברירת המחדל הבטוחה.


// שמירת הקישור לליגה (team_iba). מוחזר גם כדי שמסך המשחקים יוכל לעדכן
// את המצב המקומי שלו בלי שליפה נוספת.
export async function saveIbaLink({ coachId, team, leagueId, leagueName, ibaTeamId, ibaTeamName, extra = {} }) {
  const row = {
    coach_id: coachId,
    team,
    league_id: String(leagueId),
    league_name: leagueName,
    iba_team_id: ibaTeamId ? String(ibaTeamId) : null,
    iba_team_name: ibaTeamName || null,
    ...extra,
  }
  const { error } = await supabase.from('team_iba').upsert(row, { onConflict: 'coach_id,team' })
  if (error) {
    console.error('iba link:', error.message)
    return { ok: false, row: null, error }
  }
  return { ok: true, row, error: null }
}

// ייבוא המשחקים עצמם. מחזיר { ok, added, updated, row, message } —
// הקריאה אחראית להציג את ההודעה, כי כל מסך מציג טוסטים אחרת.
export async function importIbaGames({ coachId, team, games, leagueId, leagueName, ibaTeamId, ibaTeamName }) {
  const link = { coachId, team, leagueId, leagueName, ibaTeamId, ibaTeamName }

  // בלי משחקים — עדיין שומרים את הליגה, כי הטבלה נשענת עליה
  if (!games || !games.length) {
    const res = await saveIbaLink(link)
    return res.ok
      ? { ok: true, added: 0, updated: 0, row: res.row, message: L('הליגה נשמרה לטבלה', 'League saved for the table') }
      : { ok: false, added: 0, updated: 0, row: null, message: L('שמירת הליגה נכשלה — נסו שוב בעוד רגע.', 'Saving the league failed — try again in a moment.') }
  }

  const { data: existing, error: exErr } = await supabase.from('team_games')
    .select('*').eq('coach_id', coachId).eq('team', team)
  if (exErr) {
    console.error('games import read:', exErr.message)
    return {
      ok: false, added: 0, updated: 0, row: null,
      message: L('לא הצלחנו לקרוא את המשחקים הקיימים — הייבוא בוטל כדי לא לפגוע בהם.',
                 'We could not read the existing games — the import was cancelled so nothing is harmed.'),
    }
  }

  const { inserts, updates, deletes } = planIbaChanges(existing, games)
  let added = 0
  let updated = 0

  for (const u of updates) {
    const { error } = await supabase.from('team_games')
      .update({ game_time: u.game_time, location: u.location }).eq('id', u.id)
    if (error) {
      console.error('games import update:', error.message)
      return { ok: false, added, updated, row: null, message: L('עדכון אחד המשחקים נכשל — נסו שוב בעוד רגע.', 'Updating one of the games failed — try again in a moment.') }
    }
    updated++
  }

  for (const ins of inserts) {
    const { error } = await supabase.from('team_games').insert({ coach_id: coachId, team, ...ins })
    if (error) {
      console.error('games import insert:', error.message)
      return { ok: false, added, updated, row: null, message: L('הייבוא נכשל — נסו שוב בעוד רגע.', 'Import failed — try again in a moment.') }
    }
    added++
  }

  if (deletes.length > 0) {
    const { error } = await supabase.from('team_games').delete().in('id', deletes.map((g) => g.id))
    if (error) console.error('games import cleanup:', error.message)
  }

  const res = await saveIbaLink(link)
  return {
    ok: true,
    added,
    updated,
    row: res.row,
    message: added || updated
      ? L(`${added} משחקים חדשים · ${updated} עודכנו · הליגה נשמרה`, `${added} new games · ${updated} updated · league saved`)
      : L('לוח המשחקים כבר מעודכן · הליגה נשמרה', 'The fixture list is already up to date · league saved'),
  }
}
