import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Brain, Swords, Play, Check, X, Share2, Trophy, Sparkles, RefreshCw, Zap, Flame,
} from 'lucide-react'
import { ChevronFwd } from './DirIcon'
import { L } from './i18n'
import { toast } from './toast'
import { burstConfetti } from './confetti'
import { waShare } from './share'
import {
  quizSolo, quizStart, quizNext, quizAnswer, quizFinish, soloLeft,
  duelCreate, duelJoin, myDuels, duelInvite, gameMe, displayNames,
} from './game'

// QuizPlay — החידון והדו-קרב של עולם הכדורסל.
//
// השחקן בוחר רמה ומשחק **מיד** — החידון נבנה לבד מהמאגר, בלי שאיש יכין
// אותו מראש. משחקים כמה שרוצים; הנקודות נספרות לטבלה רק בשלושת
// החידונים הראשונים של היום (התקרה נאכפת בשרת, והמסך אומר אותה מראש).
//
// עקרון הברזל, נאכף בשרת: **התשובה הנכונה אינה במכשיר עד אחרי המענה**,
// והזמן שנספר הוא זמן השרת. הסטופר כאן הוא תצוגה בלבד.

const RING_R = 34
const RING_C = 2 * Math.PI * RING_R

const LEVELS = [
  { id: 'easy',   he: 'קל',     en: 'Easy',   Icon: Zap,   hint: ['לחימום', 'Warm-up'] },
  { id: 'medium', he: 'בינוני', en: 'Medium', Icon: Brain, hint: ['הרוב יידעו', 'Most will know'] },
  { id: 'hard',   he: 'קשה',    en: 'Hard',   Icon: Flame, hint: ['גם מאמן יתקשה', 'Even coaches sweat'] },
]

// טבעת הזמן — מתרוקנת עם השניות; מתחת ל-5 נצבעת אזהרה.
function TimerRing({ deadline, seconds, frozen }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (frozen) return undefined
    const t = setInterval(() => setLeft(Math.max(0, (deadline - Date.now()) / 1000)), 100)
    return () => clearInterval(t)
  }, [deadline, frozen])

  const frac = seconds > 0 ? Math.max(0, Math.min(1, left / seconds)) : 0
  const warn = left <= 5 && left > 0
  return (
    <div className={`qz-ring${warn ? ' is-warn' : ''}${left <= 0 ? ' is-out' : ''}`} role="timer"
      aria-label={L(`נותרו ${Math.ceil(left)} שניות`, `${Math.ceil(left)} seconds left`)}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle className="qz-ring-bg" cx="40" cy="40" r={RING_R} />
        <circle className="qz-ring-fg" cx="40" cy="40" r={RING_R}
          strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - frac)} />
      </svg>
      <span className="qz-ring-num" dir="ltr">{Math.ceil(left)}</span>
    </div>
  )
}

function PlayScreen({ attemptId, seconds, onDone, onExit }) {
  // onDone ב-ref: אילו היה בתלויות של pull, כל רינדור של ההורה היה מושך
  // שאלה מחדש ומוחק את מסך החשיפה באמצע.
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  const [q, setQ] = useState(null)
  const [failed, setFailed] = useState(false)
  const [deadline, setDeadline] = useState(0)
  const [picked, setPicked] = useState(null)
  const [reveal, setReveal] = useState(null)
  const [score, setScore] = useState(0)
  const [busy, setBusy] = useState(false)
  // מפתח האנימציה: משתנה בכל שאלה ומכריח רינדור מחדש של הבלוק, כדי
  // שאנימציית הכניסה תרוץ שוב במקום להישאר קפואה מהשאלה הקודמת.
  const [anim, setAnim] = useState(0)

  const pull = useCallback(async () => {
    const r = await quizNext(attemptId)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { setFailed(true); return }
    if (d.done) { onDoneRef.current?.(); return }
    setFailed(false)
    setQ(d)
    setPicked(null)
    setReveal(null)
    setAnim((n) => n + 1)
    setDeadline(Date.now() + (d.seconds || seconds) * 1000)
  }, [attemptId, seconds])

  useEffect(() => { pull() }, [pull])

  if (failed) {
    return (
      <div className="qz-play">
        <p>{L('החידון נתקע — כנראה החיבור. הניקוד שלך נשמר.', 'The quiz stalled — likely the connection. Your score is saved.')}</p>
        <div className="qz-actions">
          <button type="button" className="btn-primary" onClick={pull}>
            <RefreshCw size={15} aria-hidden="true" /> {L('נסה שוב', 'Try again')}
          </button>
          <button type="button" className="btn-ghost" onClick={() => onExit?.()}>{L('יציאה', 'Exit')}</button>
        </div>
      </div>
    )
  }
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

      {/* פס התקדמות דק — כמה נשאר, בלי לתפוס מקום */}
      <div className="qz-bar" aria-hidden="true">
        <span style={{ '--qz-w': `${(q.index / q.total) * 100}%` }} />
      </div>

      <div key={anim} className="qz-stage">
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
                style={{ '--qz-i': i }} onClick={() => answer(i)}>
                <span className="qz-answer-tx">{opt}</span>
                {reveal && i === reveal.correct_index && <Check size={17} aria-hidden="true" />}
                {reveal && i === picked && i !== reveal.correct_index && <X size={17} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
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
            {L('לשאלה הבאה', 'Next question')} <ChevronFwd size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function DoneScreen({ result, duel, onBack, onAgain }) {
  useEffect(() => {
    if (result?.perfect || (result?.total && result.correct >= result.total * 0.7)) burstConfetti()
  }, [result])
  return (
    <div className="qz-done">
      <Trophy size={34} aria-hidden="true" />
      <h3>{result?.perfect ? L('חידון מושלם! 🔥', 'Perfect quiz! 🔥') : L('סיימת!', 'Done!')}</h3>
      <p className="qz-done-score" dir="ltr">{result?.score ?? 0}</p>
      <p className="muted">
        {L(`${result?.correct ?? 0} מתוך ${result?.total ?? 0} נכונות`, `${result?.correct ?? 0} of ${result?.total ?? 0} correct`)}
      </p>
      {duel && <p className="muted small">{L('התוצאה נשלחה לדו-קרב — מחכים ליריב.', 'Sent to the duel — waiting for your rival.')}</p>}
      {!duel && result && result.scored === false && (
        <p className="muted small">
          {L('החידון הזה לא נספר לטבלה — צברת היום את המקסימום. אפשר להמשיך לשחק בכיף.',
             "This one doesn't count toward the board — you hit today's max. Keep playing for fun.")}
        </p>
      )}
      <div className="qz-actions">
        {onAgain && <button type="button" className="btn-primary" onClick={onAgain}>{L('עוד אחד', 'One more')}</button>}
        <button type="button" className="btn-secondary" onClick={onBack}>{L('חזרה', 'Back')}</button>
      </div>
    </div>
  )
}

export default function QuizPlay() {
  const [mode, setMode] = useState('cards')   // cards | playing | done
  const [attempt, setAttempt] = useState(null)
  const [result, setResult] = useState(null)
  const [lastLevel, setLastLevel] = useState(null)
  const [me, setMe] = useState(null)
  const [uid, setUid] = useState(null)
  const [duels, setDuels] = useState([])
  const [duelNames, setDuelNames] = useState({})
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [scoredLeft, setScoredLeft] = useState(null)

  const load = useCallback(async () => {
    const [m, d, left] = await Promise.all([gameMe(), myDuels(), soloLeft()])
    setMe(m.ok ? m.me : null)
    if (left !== null) setScoredLeft(left)
    if (d.ok) {
      setUid(d.uid)
      setDuels(d.rows || [])
      const ids = (d.rows || []).flatMap((x) => [x.challenger_id, x.opponent_id]).filter(Boolean)
      setDuelNames(await displayNames(ids))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const playLevel = async (level) => {
    setBusy(true)
    const r = await quizSolo(level)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) {
      toast.error(d.message || L('לא הצלחנו לפתוח חידון', "Couldn't start a quiz"))
      return
    }
    setLastLevel(level)
    setAttempt({ id: d.attempt_id, total: d.total, seconds: d.seconds_per_q, duelId: null })
    setMode('playing')
  }

  const beginDuel = async (quizId, duelId) => {
    setBusy(true)
    const r = await quizStart(quizId, duelId)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(d.message || L('אי אפשר להתחיל', "Can't start")); return }
    setAttempt({ id: d.attempt_id, total: d.total, seconds: d.seconds_per_q, duelId })
    setMode('playing')
  }

  const finish = useCallback(async () => {
    const r = await quizFinish(attempt.id)
    const d = r.data || {}
    if (!r.ok || d.ok === false) {
      // אין מסך סיום שקרי: הניסיון נשאר פתוח, ו-finish אידמפוטנטי.
      toast.error(L('הסיום לא נקלט — נסה שוב', "Couldn't finish — try again"))
      return
    }
    setResult(d)
    // המספר שחוזר מהסיום כבר כולל את החידון הזה — בלי זה הכרטיס היה
    // מבטיח «עוד 1 נספר» כשבפועל נשארו 0.
    if (typeof d.scored_left === 'number') setScoredLeft(d.scored_left)
    setMode('done')
    load()
  }, [attempt, load])

  const createDuel = async () => {
    setBusy(true)
    const r = await duelCreate()
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(d.message || L('יצירת הדו-קרב נכשלה', 'Duel creation failed')); return }
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
    beginDuel(d.quiz_id, d.duel_id)
  }

  if (mode === 'playing' && attempt) {
    return (
      <PlayScreen
        attemptId={attempt.id} seconds={attempt.seconds} onDone={finish}
        onExit={() => { setMode('cards'); setAttempt(null); load() }}
      />
    )
  }
  if (mode === 'done') {
    return (
      <DoneScreen
        result={result} duel={attempt?.duelId}
        onBack={() => { setMode('cards'); setAttempt(null) }}
        onAgain={attempt?.duelId ? null : () => playLevel(lastLevel)}
      />
    )
  }

  if (!me?.can_play) return null

  const openDuels = duels.filter((d) =>
    d.status !== 'done' && d.status !== 'expired'
    && !(d.status === 'pending' && d.expires_at && new Date(d.expires_at) < new Date()))
  const doneDuels = duels.filter((d) => d.status === 'done').slice(0, 3)

  return (
    <div className="qz-cards">
      {/* בחירת רמה — משחקים מיד, בלי שאיש מכין */}
      <div className="gm-chal qz-card">
        <div className="gm-chal-head">
          <span className="gm-chal-title"><Brain size={18} aria-hidden="true" /> <b>{L('חידון כדורסל', 'Basketball quiz')}</b></span>
          {scoredLeft !== null && (
            <span className="qz-meta">
              {scoredLeft > 0
                ? L(`עוד ${scoredLeft} נספרים היום`, `${scoredLeft} scored today`)
                : L('לכיף בלבד היום', 'Just for fun today')}
            </span>
          )}
        </div>
        <p className="muted small">{L('בוחרים רמה ומתחילים — שמונה שאלות, 20 שניות לכל אחת.', 'Pick a level and go — eight questions, 20 seconds each.')}</p>
        <div className="qz-levels">
          {LEVELS.map(({ id, he, en, Icon, hint }) => (
            <button key={id} type="button" className={`qz-level qz-level--${id}`} disabled={busy}
              onClick={() => playLevel(id)}>
              <Icon size={20} aria-hidden="true" />
              <b>{L(he, en)}</b>
              <span>{L(hint[0], hint[1])}</span>
            </button>
          ))}
        </div>
      </div>

      {/* דו-קרב */}
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

        {openDuels.map((d) => (
          <div key={d.id} className="qz-duel-row">
            <span className="muted small">
              {d.opponent_id
                ? L(`נגד ${duelNames[d.challenger_id === uid ? d.opponent_id : d.challenger_id] || 'יריב'}`,
                    `vs ${duelNames[d.challenger_id === uid ? d.opponent_id : d.challenger_id] || 'rival'}`)
                : L(`ממתין ליריב · קוד ${d.invite_code}`, `Waiting · code ${d.invite_code}`)}
            </span>
            {!d.opponent_id
              ? (
                <button type="button" className="btn-ghost" onClick={() => waShare(duelInvite(d.invite_code))}>
                  <Share2 size={13} aria-hidden="true" /> {L('שלח שוב', 'Share again')}
                </button>
              ) : (
                <button type="button" className="btn-ghost" onClick={() => beginDuel(d.quiz_id, d.id)}>
                  <Play size={13} aria-hidden="true" /> {L('שחק', 'Play')}
                </button>
              )}
          </div>
        ))}

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
    </div>
  )
}
