import { useCallback, useEffect, useState } from 'react'
import { L, cnt } from './i18n'
import { board, myStanding, pastChallenges, challengeFeed, messageKit } from './game'
import { waShare } from './share'
import { Share2 } from 'lucide-react'
import ChallengeCard from './ChallengeCard'
import { withUnit } from './bwUtil'

// BwChallenge — דף האתגר של עולם הכדורסל (מסמך העיצוב BasketballWorldV2).
//
// כרטיס המקום שלי → האתגר השבועי (ChallengeCard: הגשה + הפיד החי) →
// טבלת האתגר (החודש / העונה) → ארכיון אתגרים. הכל מהשרת: המקום מגיע
// מ-game_my_standing, הטבלה מ-game_board, והארכיון מהאתגרים שהוכרעו.

const PERIODS = [
  { id: 'month',  label: ['החודש', 'This month'] },
  { id: 'season', label: ['העונה', 'Season'] },
]

export default function BwChallenge({ sum, reload, month, openRules }) {
  const [period, setPeriod] = useState('month')
  const [rows, setRows] = useState(null)
  const [mine, setMine] = useState(null)
  const [past, setPast] = useState(null)

  const loadBoard = useCallback(async () => {
    setRows(null)
    const [b, s] = await Promise.all([board({ scope: 'challenge', period }), myStanding({ scope: 'challenge', period })])
    setRows(b.ok ? (b.rows || []) : [])
    setMine(s.ok ? s.standing : null)
  }, [period])
  useEffect(() => { loadBoard() }, [loadBoard])

  // הארכיון: האתגרים שהוכרעו + השורה שלי בכל אחד (מהפיד — is_mine/place)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await pastChallenges(4)
      if (!r.ok) { if (alive) setPast([]); return }
      // האתגר המוצג למעלה (גם כשהוא כבר הוכרע ומוצג כ«אחרון») לא חוזר בארכיון
      const list = (r.rows || []).filter((c) => c.id !== sum.challenge?.id)
      const withMe = await Promise.all(list.map(async (c) => {
        const f = await challengeFeed(c.id)
        const me = f.ok ? (f.rows || []).find((x) => x.is_mine) : null
        return { ...c, me, total: f.ok ? (f.rows || []).length : 0 }
      }))
      if (alive) setPast(withMe)
    })()
    return () => { alive = false }
  }, [sum.challenge?.id])

  const st = sum.standing?.challenge
  const sub = sum.sub
  const ch = sum.challenge
  // רק הגשה חיה (על הפיד או מאומתת) היא «התוצאה שלי» — הגשה שהוסרה
  // כבר לא נספרת בטבלה, ולהציג אותה כתוצאה זה לשקר לשחקן
  const liveSub = sub && (sub.status === 'pending' || sub.status === 'approved') ? sub : null
  const myScore = liveSub ? (liveSub.approved_score ?? liveSub.reported_score) : null
  const seasonKey = sum.keys?.season
  const meInRows = (rows || []).some((r) => r.is_me)

  return (
    <div className="bw-page">
      {/* כרטיס המקום שלי */}
      <div className="bw-score bw-score--ch">
        <span className="bw-score-k">{L('המקום שלי באתגר', 'My challenge rank')}{month ? ` · ${month}` : ''}</span>
        <div className="bw-score-row bw-score-row--end">
          <span className="bw-score-big bw-score-big--xl">
            <b dir="ltr" className="bw-num">{st && st.listed && st.rank > 0 ? st.rank : '—'}</b>
            <span>{L('מקום', 'place')}</span>
          </span>
          <span className="bw-score-box bw-score-box--auto">
            <b className="bw-num"><bdi>{withUnit(myScore, ch?.metric_unit)}</bdi></b>
            <span>{L('התוצאה שלי', 'my score')}</span>
          </span>
          <span className="bw-score-box">
            <b dir="ltr" className="bw-num">{st?.points ?? 0}</b>
            <span>{L('נק׳ החודש', 'pts this month')}</span>
          </span>
        </div>
        <span className="bw-score-note bw-score-note--block">
          {st && st.listed && st.rank > 0
            ? st.rank === 1
              ? L(`מקום 1 מתוך ${st.total} · אתה בראש הטבלה 🔥`, `#1 of ${st.total} · you lead the board 🔥`)
              : st.ahead_of
                ? L(`מקום ${st.rank} מתוך ${st.total} · ${st.behind_by} נק׳ מאחורי ${st.ahead_of}`, `#${st.rank} of ${st.total} · ${st.behind_by} pts behind ${st.ahead_of}`)
                : L(`מקום ${st.rank} מתוך ${st.total}`, `#${st.rank} of ${st.total}`)
            : st && !st.listed
              ? L('עוד לא בטבלה — צריך פרופיל מלא ומאושר (ולקטינים — אישור הורה)', 'Not on the board yet — you need a complete, approved profile (minors: parental approval)')
              : L('הגשה אחת על הפיד מכניסה אותך לטבלה', 'One entry on the feed puts you on the board')}
        </span>
        {/* מנוע הצמיחה של הלולאה — היה ב-GameBoards וחזר לכאן */}
        {st && st.listed && st.rank > 0 && (
          <button type="button" className="bw-share" onClick={() => waShare(messageKit.standing(st.rank))}>
            <Share2 size={14} aria-hidden="true" /> {L('שיתוף המקום שלי בוואטסאפ', 'Share my rank on WhatsApp')}
          </button>
        )}
      </div>

      {/* האתגר השבועי — הגשה + הפיד החי */}
      <ChallengeCard onChanged={reload} />

      {/* טבלת האתגר */}
      <div className="bw-card">
        <div className="bw-card-head">
          <h2 className="bw-card-title">{L('טבלת האתגר', 'Challenge board')}{period === 'month' && month ? ` · ${month}` : period === 'season' && seasonKey ? ` · ${seasonKey}` : ''}</h2>
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
          <p className="bw-mut12">{L('הטבלה עוד ריקה — הגש את האתגר של השבוע ותהיה הראשון.', 'The board is still empty — submit this week’s challenge and be first.')}</p>
        )}
        {rows && rows.length > 0 && (
          <div className="bw-rows">
            <span className="bw-mut11">{L(`כל השחקנים · ${cnt(mine?.total || rows.length, 'אחד בטבלה', 'בטבלה')}`, `All players · ${mine?.total || rows.length} ranked`)}</span>
            {rows.slice(0, 8).map((r) => (
              <div key={r.rank + r.display_name} className={`bw-row${r.is_me ? ' is-mine' : ''}`}>
                <b dir="ltr" className="bw-rank">{r.rank}</b>
                <span className={`bw-grow ${r.is_me ? 'bw-txt13b' : 'bw-txt13'}`}>{r.display_name}{r.is_me ? ` (${L('אתה', 'you')})` : ''}{r.awards > 0 ? ` 🏆${r.awards > 1 ? r.awards : ''}` : ''}</span>
                <b dir="ltr" className={`bw-num13${r.is_me ? ' bw-num--ch' : ''}`}>{r.points}</b>
              </div>
            ))}
            {mine && mine.listed && mine.rank > 8 && !meInRows && (
              <div className="bw-row is-mine">
                <b dir="ltr" className="bw-rank">{mine.rank}</b>
                <span className="bw-grow bw-txt13b">{sum.me?.display_name || L('אתה', 'You')} ({L('אתה', 'you')})</span>
                <b dir="ltr" className="bw-num13 bw-num--ch">{mine.points}</b>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ארכיון */}
      <div className="bw-card">
        <h2 className="bw-card-title">{L('ארכיון אתגרים', 'Challenge archive')}</h2>
        {past === null && <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />}
        {past && past.length === 0 && <p className="bw-mut12">{L('זה האתגר הראשון — הארכיון מתחיל בשבוע הבא.', 'This is the first challenge — the archive starts next week.')}</p>}
        {past && past.map((c) => (
          <div key={c.id} className="bw-rowsoft">
            <span className="bw-txt13 bw-grow">{c.seq ? `#${c.seq} · ` : ''}{c.title}</span>
            <span className="bw-mut11">{c.me ? withUnit(c.me.score, c.metric_unit) : L('לא הגשת', 'no entry')}</span>
            <b className="bw-num bw-num--ch"><bdi>{c.me ? L(`מקום ${c.me.place}`, `#${c.me.place}`) : L(cnt(c.total || 0, 'הגשה אחת', 'הגשות'), `${c.total || 0} entries`)}</bdi></b>
          </div>
        ))}
        <button type="button" className="bw-ghost bw-ghost--ch" onClick={openRules}>{L('כללי האתגר והתקנון', 'Challenge rules')}</button>
      </div>
    </div>
  )
}
