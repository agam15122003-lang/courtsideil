// בדיקת כללי הייבוא מהאיגוד — החוזה שמגן על תוצאות ועל סיכומים של
// משחקים ששוחקו. אין כאן מסד ואין רשת: ibaRules.js הוא פונקציות טהורות
// בלי תלויות, בדיוק כדי שאפשר יהיה לבדוק אותו כך.
//
// הרצה:  node scripts/test-iba-import.mjs   (רץ גם ב-npm run check)
import { planIbaChanges } from '../src/ibaRules.js'

let pass = 0, fail = 0
const t = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name) } }

const played = { id:'A', game_date:'2026-09-01', opponent:'הפועל חיפה', source:'iba', our_score:78, their_score:70, game_time:'18:00', location:'ויתקין' }
const manual = { id:'B', game_date:'2026-09-05', opponent:'ידיד', source:null,  our_score:null, their_score:null, game_time:null, location:null }
const emptyIba = { id:'C', game_date:'2026-09-08', opponent:'מכבי', source:'iba', our_score:null, their_score:null, summary:'', game_time:'19:00', location:null }
const summarised = { id:'D', game_date:'2026-09-09', opponent:'אליצור', source:'iba', our_score:null, their_score:null, summary:'שיחקנו טוב', game_time:null, location:null }

console.log('כשהלוח באיגוד התרוקן לגמרי:')
{
  const r = planIbaChanges([played, manual, emptyIba, summarised], [])
  const ids = r.deletes.map(g=>g.id)
  t('משחק עם תוצאה לא נמחק', !ids.includes('A'))
  t('משחק שהוקלד ידנית לא נמחק', !ids.includes('B'))
  t('משחק ריק מהאיגוד כן נמחק', ids.includes('C'))
  t('משחק עם סיכום לא נמחק', !ids.includes('D'))
}

console.log('התאמה לפי תאריך+יריבה:')
{
  const feed = [{ date:'2026-09-01', opponent:'הפועל חיפה', time:'19:30', location:'אולם חדש' }]
  const r = planIbaChanges([played], feed)
  t('לא נוצר משחק כפול', r.inserts.length === 0)
  t('עודכן במקום', r.updates.length === 1 && r.updates[0].id === 'A')
  t('רק שעה ומיקום בעדכון', Object.keys(r.updates[0]).sort().join() === 'game_time,id,location')
  t('התוצאה לא נגעה', !('our_score' in r.updates[0]))
  t('המשחק לא נכנס לרשימת המחיקה', r.deletes.length === 0)
}

console.log('אין שינוי — אין כתיבה:')
{
  const feed = [{ date:'2026-09-01', opponent:'הפועל חיפה', time:'18:00', location:'ויתקין' }]
  const r = planIbaChanges([played], feed)
  t('בלי עדכון מיותר', r.updates.length === 0 && r.inserts.length === 0)
}

console.log('משחק חדש:')
{
  const feed = [{ date:'2026-10-01', opponent:'בני הרצליה', time:'20:00', location:'הרצליה' }]
  const r = planIbaChanges([], feed)
  t('נוסף', r.inserts.length === 1 && r.inserts[0].opponent === 'בני הרצליה')
}

console.log('מסד בלי עמודת source (undefined):')
{
  const noSource = { id:'E', game_date:'2026-09-01', opponent:'x', our_score:null, their_score:null }
  const r = planIbaChanges([noSource], [])
  t('לא נמחק כלום — ברירת המחדל הבטוחה', r.deletes.length === 0)
}

console.log(`\n${pass} עברו, ${fail} נכשלו`)
process.exit(fail ? 1 : 0)
