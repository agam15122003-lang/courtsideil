import { useCallback, useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { L } from './i18n'
import { board, myStanding } from './game'

// BwPred — דף הניחושים של עולם הכדורסל (מסמך העיצוב BasketballWorldV2).
//
// ⚠ הניחושים עצמם (משחקי המחזור, בחירת מנצחת ותוצאה, נעילה בשריקה) הם
//   מיגרציות 42–43 שנכתבות לפני פתיחת העונה — אין להן עדיין שרת. הדף
//   מציג את מה שכן קיים (הניקוד, הטבלה, כללי הניקוד מהשרת) ואומר בכנות
//   ש«משחקי השבוע» ייפתחו עם הליגה. בלי משחקי דמה.

const PERIODS = [
  { id: 'month',  label: ['החודש', 'This month'] },
  { id: 'season', label: ['העונה', 'Season'] },
]

export default function BwPred({ sum, month, openRules }) {
  const [period, setPeriod] = useState('month')
  const [rows, setRows] = useState(null)
  const [mine, setMine] = useState(null)

  const load = useCallback(async () => {
    setRows(null)
    const [b, s] = await Promise.all([board({ scope: 'predictions', period }), myStanding({ scope: 'predictions', period })])
    setRows(b.ok ? (b.rows || []) : [])
    setMine(s.ok ? s.standing : null)
  }, [period])
  useEffect(() => { load() }, [load])

  const st = sum.standing?.pred
  const r = sum.rules || {}
  const meInRows = (rows || []).some((x) => x.is_me)

  return (
    <div className="bw-page">
      <div className="bw-score bw-score--pr">
        <span className="bw-score-k">{L('הניקוד שלי בניחושים', 'My picks score')}{month ? ` · ${month}` : ''}</span>
        <div className="bw-score-row bw-score-row--end">
          <span className="bw-score-big bw-score-big--xl">
            <b dir="ltr" className="bw-num">{st?.points ?? 0}</b>
            <span>{L('נק׳', 'pts')}</span>
          </span>
          <span className="bw-score-box bw-score-box--auto">
            <b dir="ltr" className="bw-num">{st && st.listed && st.rank > 0 ? `#${st.rank}` : '—'}</b>
            <span>{st?.total > 0 ? L(`מ-${st.total}`, `of ${st.total}`) : L('בטבלה', 'ranked')}</span>
          </span>
        </div>
        <div className="bw-legend">
          <span className="bw-leg">{L('כיוון נכון', 'Direction')} <bdi dir="ltr">+{r.pred_direction ?? 3}</bdi></span>
          <span className="bw-leg">{L('תוצאה בול', 'Exact')} <bdi dir="ltr">+{r.pred_exact ?? 5}</bdi></span>
          <span className="bw-leg">{L('מחזור מושלם', 'Perfect round')} <bdi dir="ltr">+{r.pred_perfect_round ?? 10}</bdi></span>
        </div>
      </div>

      <div className="bw-card">
        <div className="bw-card-head">
          <h2 className="bw-card-title">{L('משחקי השבוע', 'This week’s games')}</h2>
          <span className="bw-chip bw-chip--pr">{L('ננעל בשריקה', 'Locks at tip-off')}</span>
        </div>
        <div className="bw-empty">
          <CalendarClock size={26} aria-hidden="true" />
          <b>{L('הניחושים ייפתחו עם פתיחת הליגה', 'Picks open when the league starts')}</b>
          <p className="bw-mut12">
            {L('בכל מחזור: בוחרים מנצחת (אין תיקו בכדורסל) ואפשר להוסיף תוצאה מדויקת. הניחוש ננעל בשריקת הפתיחה — ואז נפתחים ניחושי החברים. עד אז יש אתגר שבועי וחידון.',
               'Each round: pick a winner (no draws in basketball) and optionally an exact score. Picks lock at tip-off — then friends’ picks open. Until then there is a weekly challenge and a quiz.')}
          </p>
        </div>
      </div>

      <div className="bw-card">
        <div className="bw-card-head">
          <h2 className="bw-card-title">{L('טבלת הניחושים', 'Picks board')}{period === 'month' && month ? ` · ${month}` : period === 'season' && sum.keys?.season ? ` · ${sum.keys.season}` : ''}</h2>
          <span className="bw-chip bw-chip--mut">{period === 'month' ? L('מתאפס בתחילת החודש', 'Resets monthly') : L('כל העונה', 'Whole season')}</span>
        </div>
        <div className="bw-seg" role="group" aria-label={L('תקופה', 'Period')}>
          {PERIODS.map((p) => (
            <button key={p.id} type="button" aria-pressed={period === p.id}
              className={period === p.id ? 'bw-seg-btn is-on' : 'bw-seg-btn'} onClick={() => setPeriod(p.id)}>
              {L(p.label[0], p.label[1])}
            </button>
          ))}
        </div>
        {rows === null && <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />}
        {rows && rows.length === 0 && (
          <p className="bw-mut12">{L('הטבלה תתמלא מהמחזור הראשון של העונה.', 'The board fills from the first round of the season.')}</p>
        )}
        {rows && rows.length > 0 && (
          <div className="bw-rows">
            {rows.slice(0, 8).map((x) => (
              <div key={x.rank + x.display_name} className={`bw-row${x.is_me ? ' is-mine' : ''}`}>
                <b dir="ltr" className="bw-rank">{x.rank}</b>
                <span className={`bw-grow ${x.is_me ? 'bw-txt13b' : 'bw-txt13'}`}>{x.display_name}{x.is_me ? ` (${L('אתה', 'you')})` : ''}</span>
                <b dir="ltr" className={`bw-num13${x.is_me ? ' bw-num--pr' : ''}`}>{x.points}</b>
              </div>
            ))}
            {mine && mine.listed && mine.rank > 8 && !meInRows && (
              <div className="bw-row is-mine">
                <b dir="ltr" className="bw-rank">{mine.rank}</b>
                <span className="bw-grow bw-txt13b">{sum.me?.display_name || L('אתה', 'You')} ({L('אתה', 'you')})</span>
                <b dir="ltr" className="bw-num13 bw-num--pr">{mine.points}</b>
              </div>
            )}
          </div>
        )}
        <button type="button" className="bw-ghost bw-ghost--pr" onClick={openRules}>{L('כללי הניחושים והתקנון', 'Picks rules')}</button>
      </div>
    </div>
  )
}
