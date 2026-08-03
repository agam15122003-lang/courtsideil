import { useState, useEffect } from 'react'
import { RefreshCw, Trophy, Share2 } from 'lucide-react'
import { leagueStandings, clubCore } from './iba'
import { waShare } from './share'
import { L } from './i18n'
import { SITE_URL } from './constants'

// טבלת ליגה חיה מהאיגוד — נבנית מנתונים אמיתיים ומתעדכנת בכל טעינה.
// props: leagueId, leagueName, highlight (שם/ליבת-שם הקבוצה של המאמן להדגשה)
export default function LeagueTable({ leagueId, leagueName, highlight }) {
  const [state, setState] = useState({ loading: true, hasTable: false, title: '', rows: [], failed: false })

  const load = async () => {
    if (!leagueId) return
    setState((s) => ({ ...s, loading: true, failed: false }))
    try {
      const r = await leagueStandings(leagueId)
      setState({ loading: false, failed: false, ...r })
    } catch {
      // כישלון רשת/פענוח ≠ "אין טבלה" — מבדילים ומציעים רענון
      setState({ loading: false, hasTable: false, title: '', rows: [], failed: true })
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  const mine = clubCore(highlight || '')
  const isMine = (name) => mine && (name.includes(mine) || mine.includes(clubCore(name)))

  if (!leagueId) return null

  return (
    <div className="lt-wrap">
      <div className="lt-head">
        <span className="lt-title">
          <Trophy size={15} /> {L('טבלת הליגה', 'League table')}
          {leagueName ? ` · ${leagueName}` : ''}
        </span>
        <span className="lt-actions">
          {/* שיתוף "מקום X בליגה" — גאוות קבוצה שנוסעת בוואטסאפ של ההורים */}
          {state.hasTable && (() => {
            const myRow = state.rows.find((r) => isMine(r.name))
            if (!myRow) return null
            return (
              <button className="icon-btn" aria-label={L('שיתוף מצב בליגה', 'Share league standing')}
                title={L('שיתוף בוואטסאפ', 'Share on WhatsApp')}
                /* SITE_URL ולא origin — באפליקציה נייטיבית ה-origin הוא capacitor://localhost */
                onClick={() => waShare(L(
                  `🏀 ${myRow.name} — מקום ${myRow.pos} ב${leagueName || 'ליגה'}!\n${myRow.w} ניצחונות · ${myRow.l} הפסדים · ${myRow.pts} נק׳\n${SITE_URL}`,
                  `🏀 ${myRow.name} — #${myRow.pos} in ${leagueName || 'the league'}!\n${myRow.w}W · ${myRow.l}L · ${myRow.pts} pts\n${SITE_URL}`
                ))}>
                <Share2 size={15} />
              </button>
            )
          })()}
          <button className="icon-btn" onClick={load} aria-label={L('רענון', 'Refresh')} disabled={state.loading}>
            <RefreshCw size={15} className={state.loading ? 'spin' : ''} />
          </button>
        </span>
      </div>

      {state.loading ? (
        <p className="muted small" style={{ marginTop: 10 }}>{L('טוען טבלה מהאיגוד...', 'Loading table from the association...')}</p>
      ) : state.failed ? (
        <p className="muted small" style={{ marginTop: 10 }}>
          {L('לא הצלחנו לטעון את הטבלה כרגע — בדוק חיבור ולחץ רענון.', "Couldn't load the table right now — check your connection and tap refresh.")}
        </p>
      ) : !state.hasTable ? (
        <p className="muted small" style={{ marginTop: 10 }}>
          {L('לליגה הזו אין טבלה מתפרסמת באיגוד (נפוץ בשכבות הצעירות).', 'This league has no published table at the association (common for younger ages).')}
        </p>
      ) : (
        <div className="lt-scroll">
          <table className="lt-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="lt-name">{L('קבוצה', 'Team')}</th>
                <th title={L('משחקים', 'Games')}>{L('מש׳', 'GP')}</th>
                <th title={L('ניצחונות', 'Wins')}>{L('נצ׳', 'W')}</th>
                <th title={L('הפסדים', 'Losses')}>{L('הפ׳', 'L')}</th>
                <th title={L('הפרש', 'Diff')}>+/−</th>
                <th title={L('נקודות', 'Points')}>{L('נק׳', 'Pts')}</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.id} className={isMine(r.name) ? 'lt-mine' : ''}>
                  <td className="lt-pos">{r.pos}</td>
                  <td className="lt-name">{r.name}</td>
                  <td>{r.gp}</td>
                  <td>{r.w}</td>
                  <td>{r.l}</td>
                  <td dir="ltr">{r.bd > 0 ? `+${r.bd}` : r.bd}</td>
                  <td className="lt-pts">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
