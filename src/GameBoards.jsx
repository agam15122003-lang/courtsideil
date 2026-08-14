import { useCallback, useEffect, useState } from 'react'
import { Trophy, Share2, RefreshCw, Medal, Lock, CalendarClock } from 'lucide-react'
import { L } from './i18n'
import { waShare } from './share'
import { board, myStanding, periodKeys, messageKit } from './game'
import ChallengeCard from './ChallengeCard'
import QuizPlay from './QuizPlay'

// GameBoards — הטבלאות של המגרש.
//
// שש הטבלאות שבאפיון (מחזור · חודשית · עונתית, לכל עולם) הן קריאה אחת
// לשרת עם פרמטרים אחרים, ולכן גם מסך אחד. הטבלה החודשית היא ברירת המחדל
// במכוון: היא הלב של האפיון — מי שבמקום 300 בעונה מקבל התחלה נקייה כל חודש.
//
// מרחב השמות של המחלקות החדשות הוא gm-*; הטבלה עצמה חוזרת על lt-*
// הקיים (LeagueTable) כדי שלא ייווצרו שתי שפות טבלה באפליקציה.

// ⚠ 'quiz' נוסף אחרי שהסקירה תפסה שנקודות החידונים נכתבות לפנקס
//   ואף מסך אינו קורא אותן — כלומר השחקן צובר לשום מקום, והתקרה
//   היומית שמרה על טבלה שלא הייתה קיימת.
const SCOPES = [
  { id: 'challenge',   label: ['האתגר', 'Challenge'] },
  { id: 'quiz',        label: ['החידונים', 'Quizzes'] },
  { id: 'predictions', label: ['הניחושים', 'Predictions'] },
]
const PERIODS = [
  { id: 'month',  label: ['החודש', 'This month'] },
  { id: 'season', label: ['העונה', 'Season'] },
]

export default function GameBoards() {
  const [scope, setScope] = useState('challenge')
  const [period, setPeriod] = useState('month')
  const [rows, setRows] = useState([])
  const [mine, setMine] = useState(null)
  const [keys, setKeys] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | empty | error | notDeployed
  const [seenAt, setSeenAt] = useState(null)

  const load = useCallback(async () => {
    setState('loading')
    const [b, s, k] = await Promise.all([
      board({ scope, period }),
      myStanding({ scope, period }),
      periodKeys(),
    ])

    if (b.notDeployed) { setState('notDeployed'); return }
    if (!b.ok) { setState('error'); return }

    setRows(b.rows || [])
    setMine(s.ok ? s.standing : null)
    setKeys(k.ok ? k.keys : null)
    setSeenAt(new Date())
    setState((b.rows || []).length ? 'ready' : 'empty')
  }, [scope, period])

  useEffect(() => { load() }, [load])

  // «עודכן לאחרונה» — קיים כדי שטבלה שלא זזה תיקרא כ«עוד לא הוזן»
  // ולא כ«האפליקציה נשברה». זה ההבדל בשבוע השני, כשההרגל עוד לא נקבע.
  const stamp = seenAt
    ? new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(seenAt)
    : null

  return (
    <div className="gm-boards">
      {/* סדר המסך לפי האפיון: למעלה האתגר (עם הפיד החי בפנים), באמצע
          החידון והדו-קרב, למטה הטבלאות והמיקום שלך */}
      <ChallengeCard />
      <QuizPlay />

      <div className="lt-head">
        <span className="lt-title">
          <Trophy size={15} /> {L('הטבלאות', 'Standings')}
          {keys && period === 'month' ? <span dir="ltr"> · {keys.month}</span> : null}
          {keys && period === 'season' ? <span dir="ltr"> · {keys.season}</span> : null}
        </span>
        <span className="lt-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={load}
            aria-label={L('רענון', 'Refresh')}
            disabled={state === 'loading'}
          >
            <RefreshCw size={15} className={state === 'loading' ? 'spin' : ''} />
          </button>
        </span>
      </div>

      <div className="tabs gm-tabs" role="tablist">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={scope === s.id}
            className={scope === s.id ? 'tab active' : 'tab'}
            onClick={() => setScope(s.id)}
          >
            {L(s.label[0], s.label[1])}
          </button>
        ))}
      </div>

      <div className="gm-periods">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={period === p.id ? 'gm-chip is-on' : 'gm-chip'}
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
          >
            {L(p.label[0], p.label[1])}
          </button>
        ))}
      </div>

      {/* המיקום שלי — כולל שורת היריב. זה הרכיב שמחזיר אנשים בשבוע השני:
          «אתה 3 נקודות מאחורי דניאל כ.» עושה יותר מכל טבלה. */}
      {mine && mine.listed && mine.rank > 0 && (
        <div className="gm-me">
          <div className="gm-me-main">
            <span className="gm-me-rank" dir="ltr">#{mine.rank}</span>
            <span className="gm-me-tx">
              <b>{L('המיקום שלך', 'Your rank')}</b>
              <span className="muted small">
                <bdi>{mine.points}</bdi> {L('נקודות', 'points')} · {L('מתוך', 'of')} <bdi>{mine.total}</bdi>
              </span>
            </span>
          </div>
          {mine.ahead_of && mine.behind_by > 0 && (
            <p className="gm-rival">
              {L(`אתה ${mine.behind_by} נקודות מאחורי ${mine.ahead_of}`,
                 `You're ${mine.behind_by} points behind ${mine.ahead_of}`)}
            </p>
          )}
          <button
            type="button"
            className="btn-ghost gm-share"
            onClick={() => waShare(messageKit.standing(mine.rank))}
          >
            <Share2 size={15} /> {L('שיתוף בוואטסאפ', 'Share on WhatsApp')}
          </button>
        </div>
      )}

      {/* קטין שממתין לאישור הורה — מסך ריק בלי הסבר הוא הדרך הבטוחה
          לאבד אותו. אומרים לו בדיוק למה, ומה נשאר לעשות. */}
      {mine && !mine.listed && (
        <div className="gm-locked">
          <Lock size={16} />
          <p>
            {L('אתה עוד לא מופיע בטבלה — נשאר רק אישור ההורה. שלח לו את הקישור ותופיע כאן מיד.',
               "You're not on the board yet — all that's left is a parent's approval. Send them the link and you'll appear here.")}
          </p>
        </div>
      )}

      {state === 'loading' && <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />}

      {state === 'notDeployed' && (
        <div className="empty-state">
          <CalendarClock size={26} />
          <b>{L('עולם הכדורסל עוד לא נפתח', 'The basketball world is not open yet')}</b>
          <p>{L('הטבלאות ייפתחו עם האתגר הראשון.', 'Standings open with the first challenge.')}</p>
        </div>
      )}

      {state === 'error' && (
        <div className="empty-state">
          <b>{L('לא הצלחנו לטעון את הטבלה', "Couldn't load the standings")}</b>
          <p>{L('בדוק חיבור ונסה שוב.', 'Check your connection and try again.')}</p>
          <button type="button" className="btn-secondary" onClick={load}>
            {L('נסה שוב', 'Try again')}
          </button>
        </div>
      )}

      {state === 'empty' && (
        <div className="empty-state">
          <Medal size={26} />
          <b>
            {scope === 'predictions'
              ? L('הניחושים ייפתחו עם פתיחת הליגה', 'Predictions open when the league starts')
              : scope === 'quiz'
                ? L('עוד לא שיחקת חידון', "You haven't played a quiz yet")
                : L('הטבלה עוד ריקה', 'The board is still empty')}
          </b>
          <p>
            {scope === 'predictions'
              ? L('עונת המשחקים עוד לא התחילה. עד אז — יש אתגר שבועי.',
                  'The season has not started yet. Until then — there is a weekly challenge.')
              : scope === 'quiz'
                ? L('בחר רמה למעלה ותתחיל — שלושת הראשונים ביום נספרים לטבלה.',
                    'Pick a level above and start — the first three each day count.')
                : L('תהיה הראשון: הגש את האתגר של השבוע ותיכנס לטבלה.',
                    'Be first: submit this week’s challenge and get on the board.')}
          </p>
        </div>
      )}

      {state === 'ready' && (
        <>
          <div className="lt-scroll">
            <table className="lt-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="lt-name">{L('שחקן', 'Player')}</th>
                  <th title={L('תארים', 'Titles')}>🏆</th>
                  <th title={L('נקודות', 'Points')}>{L('נק׳', 'Pts')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.rank}-${i}`} className={r.is_me ? 'lt-mine' : ''}>
                    <td className="lt-pos" dir="ltr">{r.rank}</td>
                    <td className="lt-name">{r.display_name}</td>
                    <td dir="ltr">{r.awards > 0 ? r.awards : ''}</td>
                    <td className="lt-pts" dir="ltr">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stamp && (
            <p className="muted small gm-stamp">
              {L('עודכן לאחרונה ב-', 'Last updated at ')}<bdi>{stamp}</bdi>
            </p>
          )}
        </>
      )}
    </div>
  )
}
