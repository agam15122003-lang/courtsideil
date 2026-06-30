import CourtDiagram from './CourtDiagram'
import TacticsBoard from './TacticsBoard'
import { L, tr, trTeam } from './i18n'

// תצוגת "דף מחברת אימון" — מציגה תרגיל בודד או תוכנית אימון מלאה בסגנון
// מערך-האימון הכתוב (כותרת נייבי, שם מועדון/מאמן, תוכן על שורות, ושרטוטי מגרש).
//
// props (תרגיל):  kind="drill"  drill={...}  club  coachName
// props (תוכנית): kind="plan"   plan={{name, parts:[{title, items:[{title, meta, note, board}]}]}}  club  coachName  date

function CourtColumn({ board }) {
  const steps = board && board.steps && board.steps.length ? board.steps : null
  const full = !!(board && board.fullCourt)
  // אם יש לוח עם תוכן — מצייר כל שלב; אחרת תבנית מגרש ריקה אחת
  const list =
    steps && steps.some((s) => (s.objects || []).length || (s.arrows || []).length)
      ? steps
      : [null]
  return (
    <div className="nb-courts">
      {list.map((step, i) => (
        <CourtDiagram key={i} full={full} step={step} />
      ))}
    </div>
  )
}

function DrillBlock({ drill }) {
  const meta = []
  if (drill.duration_minutes) meta.push(L(`זמן: ${drill.duration_minutes} דק׳`, `Time: ${drill.duration_minutes} min`))
  if (drill.equipment) meta.push(L(`ציוד: ${drill.equipment}`, `Equipment: ${drill.equipment}`))
  if (drill.players) meta.push(L(`שחקנים: ${drill.players}`, `Players: ${drill.players}`))
  if (drill.reps) meta.push(L(`חזרות: ${drill.reps}`, `Reps: ${drill.reps}`))
  if (drill.difficulty) meta.push(tr(drill.difficulty))
  if (drill.category) meta.push(tr(drill.category))
  return (
    <div className="nb-drill">
      {drill.title && <h3 className="nb-drill-name">{drill.title}</h3>}
      {meta.length > 0 && (
        <div className="nb-meta">
          {meta.map((m, i) => (
            <span key={i} className="nb-meta-item">{m}</span>
          ))}
        </div>
      )}
      {(drill.age_groups || []).length > 0 && (
        <div className="nb-tags">
          {drill.age_groups.map((g) => (
            <span key={g} className="nb-tag">{trTeam(g)}</span>
          ))}
        </div>
      )}
      {drill.goal && (
        <p className="nb-field">
          <span className="nb-field-k">{L('מטרה:', 'Goal:')}</span> {drill.goal}
        </p>
      )}
      {drill.description && (
        <div className="nb-writeblock">
          <div className="nb-writeblock-h">{L('תיאור וביצוע', 'Description & execution')}</div>
          <p className="nb-lines">{drill.description}</p>
        </div>
      )}
      {drill.coach_notes && (
        <div className="nb-writeblock">
          <div className="nb-writeblock-h">{L('דגשים למאמן', 'Coach notes')}</div>
          <p className="nb-lines">{drill.coach_notes}</p>
        </div>
      )}
    </div>
  )
}

export default function NotebookPage({ kind = 'drill', drill, plan, club, coachName, date, noCourt }) {
  return (
    <div className="notebook" dir="rtl">
      <div className="nb-header">
        <div className="nb-header-top">
          <span className="nb-club">{club || 'CourtSide'}</span>
          {date && <span className="nb-date">{date}</span>}
        </div>
        <h2 className="nb-title">{L('מערך אימון', 'Practice Plan')}</h2>
        {coachName && (
          <div className="nb-coach">{L('שם המאמן: ', 'Coach: ')}{coachName}</div>
        )}
      </div>

      {kind === 'drill' && drill && (
        <div className="nb-body">
          {!noCourt && <CourtColumn board={drill.board} />}
          <div className="nb-content">
            <DrillBlock drill={drill} />
          </div>
        </div>
      )}

      {kind === 'plan' && plan && (
        <div className="nb-body">
          {!noCourt && <CourtColumn board={plan.board} />}
          <div className="nb-content">
            {plan.name && <h3 className="nb-plan-name">{plan.name}</h3>}
            {plan.parts.map((part, pi) => (
              <section key={pi} className="nb-part">
                <div className="nb-part-h">
                  <span className="nb-part-n">{pi + 1}</span>
                  {part.title}
                </div>
                {part.items.length === 0 ? (
                  <p className="nb-empty-line">{L('—', '—')}</p>
                ) : (
                  <div className="nb-plan-drills">
                    {part.items.map((it, ii) => (
                      <div key={ii} className="nb-plan-drill">
                        <div className="nb-plan-drill-text">
                          <h4 className="nb-plan-drill-title">
                            <span className="nb-plan-drill-n">{ii + 1}</span>
                            {it.title}
                          </h4>
                          {it.meta && <div className="nb-plan-drill-meta">{it.meta}</div>}
                          {it.note && <p className="nb-plan-drill-note">{it.note}</p>}
                        </div>
                        {it.board && it.board.steps && it.board.steps.length > 0 && (
                          <div className="nb-plan-drill-court">
                            <span className="detail-label">{L('נגן אנימציה', 'Play animation')}</span>
                            <TacticsBoard value={it.board} readOnly />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
