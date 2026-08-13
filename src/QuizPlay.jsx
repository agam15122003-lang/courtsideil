import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Brain, Swords, Play, Check, X, Share2, ChevronLeft, Timer, Trophy, Sparkles,
} from 'lucide-react'
import { L } from './i18n'
import { toast } from './toast'
import { burstConfetti } from './confetti'
import { waShare } from './share'
import {
  weeklyQuiz, myAttempt, quizStart, quizNext, quizAnswer, quizFinish,
  duelCreate, duelJoin, myDuels, duelInvite, gameMe, displayNames,
} from './game'

// QuizPlay — החידון והדו-קרב של המגרש.
//
// עקרון הברזל (נאכף בשרת, כאן רק משתקף): **התשובה הנכונה לא נמצאת
// במכשיר עד אחרי המענה**, והזמן שנספר הוא זמן השרת. הסטופר על המסך הוא
// תצוגה — מי שמזייף אותו מרמה רק את העיניים של עצמו.
//
// שלושה מצבים: כרטיסי הפתיחה (חידון שבועי · דו-קרב) → מסך המשחק
// (טבעת זמן, שאלה, ארבע תשובות, חשיפה + הסבר) → מסך סיום (ניקוד,
// קונפטי, שיתוף).

const RING_R = 34
const RING_C = 2 * Math.PI * RING_R

// טבעת הזמן — SVG שמתרוקן עם הזמן שנותר. מתחת ל-5 שניות נצבעת אזהרה.
function TimerRing({ deadline, seconds, frozen }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (frozen) return undefined
    const t = setInterval(() => {
      setLeft(Math.max(0, (deadline - Date.now()) / 1000))
    }, 100)
    return () => clearInterval(t)
  }, [deadline, frozen])

  const frac = seconds > 0 ? Math.max(0, Math.min(1, left / seconds)) : 0
  const warn = left <= 5 && left > 0
  return (
    <div className={`qz-ring${warn ? ' is-warn' : ''}${left <= 0 ? ' is-out' : ''}`} role="timer"
      aria-label={L(`נותרו ${Math.ceil(left)} שניות`, `${Math.ceil(left)} seconds left`)}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle className="qz-ring-bg" cx="40" cy="40" r={RING_R} />
        <circle
          className="qz-ring-fg" cx="40" cy="40" r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - frac)}
        />
      </svg>
      <span className="qz-ring-num" dir="ltr">{Math.ceil(left)}</span>
    </div>
  )
}

// מסך המשחק עצמו — משותף לחידון השבועי ולדו-קרב
function PlayScreen({ attemptId, total, seconds, onDone }) {
  const [q, setQ] = useState(null)          // השאלה הנוכחית מהשרת
  const [deadline, setDeadline] = useState(0)
  const [picked, setPicked] = useState(null)
  const [reveal, setReveal] = useState(null) // תשובת השרת אחרי מענה
  const [score, setScore] = useState(0)
  const [busy, setBusy] = useState(false)

  const pull = useCallback(async () => {
    const r = await quizNext(attemptId)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(L('משהו השתבש', 'Something broke')); return }
    if (d.done) { onDone(); return }
    setQ(d)
    setPicked(null)
    setReveal(null)
    setDeadline(Date.now() + (d.seconds || seconds) * 1000)
  }, [attemptId, seconds, onDone])

  useEffect(() => { pull() }, [pull])

  if (!q) return <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />

  const answer = async (i) => {
    if (picked !== null || busy) return
    setBusy(true)
    setPicked(i)
    const r = await quizAnswer(attemptId, q.question_id, i)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) {
      toast.error(L('התשובה לא נקלטה — נסה שוב', "Answer didn't register — try again"))
      setPicked(null)
      return
    }
    setReveal(d)
    if (d.points > 0) setScore((s) => s + d.points)
  }

  return (
    <div className="qz-play">
      <div className="qz-top">
        <span className="qz-progress">
          {L('שאלה', 'Question')} <bdi>{q.index}/{q.total}</bdi>
        </span>
        <TimerRing deadline={deadline} seconds={q.seconds || seconds} frozen={picked !== null} />
        <span className="qz-score" dir="ltr" aria-label={L('ניקוד', 'Score')}>
          <Sparkles size={14} aria-hidden="true" /> {score}
        </span>
      </div>

      <h3 className="qz-question">{q.q}</h3>

      <div className="qz-answers" role="group">
        {(q.options || []).map((opt, i) => {
          let cls = 'qz-answer'
          if (reveal) {
            if (i === reveal.correct_index) cls += ' is-right'
            else if (i === picked) cls += ' is-wrong'
            else cls += ' is-dim'
          } else if (picked === i) cls += ' is-picked'
          return (
            <button key={i} type="button" className={cls} disabled={reveal !== null || busy}
              onClick={() => answer(i)}>
              <span className="qz-answer-tx">{opt}</span>
              {reveal && i === reveal.correct_index && <Check size={17} aria-hidden="true" />}
              {reveal && i === picked && i !== reveal.correct_index && <X size={17} aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {reveal && (
        <div className={`qz-reveal${reveal.correct ? ' is-good' : ''}`}>
          <div className="qz-reveal-head">
            {reveal.too_slow
              ? <b>{L('הזמן נגמר ⏱', 'Time ran out ⏱')}</b>
              : reveal.correct
                ? <b>{L('נכון!', 'Correct!')} <span className="qz-pts" dir="ltr">+{reveal.points}</span>
                    {reveal.speed_bonus > 0 && <span className="qz-speed">{L(`מתוכם ${reveal.speed_bonus} בונוס מהירות`, `incl. ${reveal.speed_bonus} speed bonus`)}</span>}
                  </b>
                : <b>{L('לא נכון', 'Not quite')}</b>}
          </div>
          {reveal.explain && <p className="qz-explain">{reveal.explain}</p>}
          <button type="button" className="btn-primary qz-next" onClick={pull}>
            {L('לשאלה הבאה', 'Next question')} <ChevronLeft size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}

// מסך הסיום
function DoneScreen({ result, duel, onBack }) {
  useEffect(() => { if (result?.perfect || result?.correct >= (result?.total || 0) * 0.7) burstConfetti() }, [result])
  return (
    <div className="qz-done">
      <Trophy size={34} aria-hidden="true" />
      <h3>{result?.perfect ? L('חידון מושלם! 🔥', 'Perfect quiz! 🔥') : L('סיימת!', 'Done!')}</h3>
      <p className="qz-done-score" dir="ltr">{result?.score ?? 0}</p>
      <p className="muted">
        {L(`${result?.correct ?? 0} מתוך ${result?.total ?? 0} נכונות`, `${result?.correct ?? 0} of ${result?.total ?? 0} correct`)}
      </p>
      {duel && <p className="muted small">{L('התוצאה נשלחה לדו-קרב — מחכים ליריב.', 'Sent to the duel — waiting for your rival.')}</p>}
      <div className="gm-adm-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>{L('חזרה למגרש', 'Back to the Court')}</button>
      </div>
    </div>
  )
}

// כרטיסי הפתיחה + ניהול הזרימה
export default function QuizPlay() {
  const [mode, setMode] = useState('cards')   // cards | playing | done
  const [quiz, setQuiz] = useState(null)
  const [attempt, setAttempt] = useState(null)   // {id, total, seconds, duelId}
  const [result, setResult] = useState(null)
  const [played, setPlayed] = useState(null)
  const [me, setMe] = useState(null)
  const [uid, setUid] = useState(null)
  const [duels, setDuels] = useState([])
  const [duelNames, setDuelNames] = useState({})
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState('loading')

  const load = useCallback(async () => {
    const [w, m, d] = await Promise.all([weeklyQuiz(), gameMe(), myDuels()])
    if (w.notDeployed) { setState('notDeployed'); return }
    setQuiz(w.ok ? w.quiz : null)
    setMe(m.ok ? m.me : null)
    if (d.ok) {
      setUid(d.uid)
      setDuels(d.rows || [])
      const ids = (d.rows || []).flatMap((x) => [x.challenger_id, x.opponent_id]).filter(Boolean)
      setDuelNames(await displayNames(ids))
    }
    if (w.ok && w.quiz) {
      const a = await myAttempt(w.quiz.id)
      setPlayed(a.ok && a.attempt?.finished_at ? a.attempt : null)
    }
    setState('ready')
  }, [])

  useEffect(() => { load() }, [load])

  const begin = async (quizId, duelId) => {
    setBusy(true)
    const r = await quizStart(quizId, duelId)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) {
      toast.error(d.message || L('אי אפשר להתחיל כרגע', "Can't start right now"))
      return
    }
    setAttempt({ id: d.attempt_id, total: d.total, seconds: d.seconds_per_q, duelId: duelId || null })
    setMode('playing')
  }

  const finish = async () => {
    const r = await quizFinish(attempt.id)
    const d = r.data || {}
    setResult(d.ok !== false ? d : null)
    setMode('done')
    load()
  }

  const createDuel = async () => {
    setBusy(true)
    const r = await duelCreate()
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(L('יצירת הדו-קרב נכשלה', 'Duel creation failed')); return }
    waShare(duelInvite(d.code))
    load()
  }

  const joinDuel = async () => {
    if (!joinCode.trim()) return
    setBusy(true)
    const r = await duelJoin(joinCode)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(d.message || L('הקוד לא נמצא', 'Code not found')); return }
    setJoinCode('')
    begin(d.quiz_id, d.duel_id)
  }

  if (state === 'loading') return null
  if (state === 'notDeployed') return null
  if (!me?.can_play && mode === 'cards' && !quiz) return null

  if (mode === 'playing' && attempt) {
    return <PlayScreen attemptId={attempt.id} total={attempt.total} seconds={attempt.seconds} onDone={finish} />
  }
  if (mode === 'done') {
    return <DoneScreen result={result} duel={attempt?.duelId} onBack={() => { setMode('cards'); setAttempt(null) }} />
  }

  const openDuels = duels.filter((d) => d.status !== 'done' && d.status !== 'expired')
  const doneDuels = duels.filter((d) => d.status === 'done').slice(0, 3)

  return (
    <div className="qz-cards">
      {/* החידון השבועי */}
      <div className="gm-chal qz-card">
        <div className="gm-chal-head">
          <span className="gm-chal-title"><Brain size={18} aria-hidden="true" /> <b>{quiz ? quiz.title : L('החידון השבועי', 'Weekly quiz')}</b></span>
          {quiz && <span className="qz-meta" dir="ltr"><Timer size={13} /> {quiz.seconds_per_q}s</span>}
        </div>
        {!quiz && <p className="muted small">{L('החידון הבא נפתח בקרוב.', 'Next quiz opens soon.')}</p>}
        {quiz && played && (
          <p className="muted small">
            {L(`שיחקת — צברת ${played.score} נקודות (${played.correct_count} נכונות).`,
               `Played — you scored ${played.score} (${played.correct_count} correct).`)}
          </p>
        )}
        {quiz && !played && me?.can_play && (
          <button type="button" className="btn-primary gm-chal-join" disabled={busy}
            onClick={() => begin(quiz.id, null)}>
            <Play size={15} aria-hidden="true" /> {L('שחק עכשיו', 'Play now')}
          </button>
        )}
      </div>

      {/* דו-קרב */}
      {me?.can_play && (
        <div className="gm-chal qz-card">
          <div className="gm-chal-head">
            <span className="gm-chal-title"><Swords size={18} aria-hidden="true" /> <b>{L('דו-קרב', 'Duel')}</b></span>
          </div>
          <p className="muted small">
            {L('אותן שאלות, טיימר רץ — מי חכם יותר? שלח קוד לחבר.', 'Same questions, clock running. Send a friend the code.')}
          </p>
          <div className="qz-duel-actions">
            <button type="button" className="btn-secondary" disabled={busy} onClick={createDuel}>
              <Share2 size={14} aria-hidden="true" /> {L('פתח דו-קרב', 'Start a duel')}
            </button>
            <div className="qz-join">
              <input type="text" value={joinCode} maxLength={6} dir="ltr" placeholder={L('קוד', 'Code')}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())} />
              <button type="button" className="btn-ghost" disabled={busy || !joinCode.trim()} onClick={joinDuel}>
                {L('הצטרף', 'Join')}
              </button>
            </div>
          </div>

          {openDuels.map((d) => {
            return (
              <div key={d.id} className="qz-duel-row">
                <span className="muted small">
                  {d.opponent_id
                    ? L(`נגד ${duelNames[d.challenger_id === uid ? d.opponent_id : d.challenger_id] || 'יריב'}`,
                        `vs ${duelNames[d.challenger_id === uid ? d.opponent_id : d.challenger_id] || 'rival'}`)
                    : L(`ממתין ליריב · קוד ${d.invite_code}`, `Waiting · code ${d.invite_code}`)}
                </span>
                {!d.opponent_id && (
                  <button type="button" className="btn-ghost" onClick={() => waShare(duelInvite(d.invite_code))}>
                    <Share2 size={13} aria-hidden="true" /> {L('שלח שוב', 'Share again')}
                  </button>
                )}
                {d.opponent_id && (
                  <button type="button" className="btn-ghost" onClick={() => begin(d.quiz_id, d.id)}>
                    <Play size={13} aria-hidden="true" /> {L('שחק', 'Play')}
                  </button>
                )}
              </div>
            )
          })}

          {doneDuels.map((d) => (
            <div key={d.id} className="qz-duel-row is-done">
              <span className="muted small">
                {d.is_draw
                  ? L('תיקו 🤝', 'Draw 🤝')
                  : d.winner_id === uid
                    ? L('ניצחת! 🏆', 'You won! 🏆')
                    : L(`ניצח ${duelNames[d.winner_id] || 'היריב'}`, `${duelNames[d.winner_id] || 'Rival'} won`)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
