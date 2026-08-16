import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Zap, Target, Flame, Shuffle, Check, X, Share2, Play, Trophy } from 'lucide-react'
import { ChevronFwd } from './DirIcon'
import { L, cnt } from './i18n'
import { toast } from './toast'
import useFocusTrap from './useFocusTrap'
import { waShare } from './share'
import { playSound } from './bwSound'
import { initials, reduced, lockApp } from './bwUtil'
import {
  quizSolo, quizStart, quizNext, quizAnswer, quizFinish, soloLeft,
  duelCreate, duelJoin, myDuels, duelInvite, displayNames, board, myPoints, serverNow,
} from './game'

// BwQuiz — דף החידון של עולם הכדורסל (מסמך העיצוב BasketballWorldV2).
//
// הדף: כרטיס הניקוד (ניקוד החודש, מקום, רצף ימים) → בחירת רמה → דו-קרב
// → אלופי החודש (פודיום) → החידונים שלי. מסך המשחק ומסך הסיום הם שכבות
// על כל המסך (overlay) — כמו במסמך.
//
// עקרון הברזל נשאר כפי שהיה ב-QuizPlay: **התשובה הנכונה אינה במכשיר עד
// אחרי המענה**, והזמן שנספר הוא זמן השרת. הטבעת, הלהבה, ה-«+12» שעף
// והקונפטי הם תצוגה בלבד, על תשובות שהשרת כבר הכריע.

const RING_C = 2 * Math.PI * 30
const LETTERS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו']
const LETTERS_EN = ['A', 'B', 'C', 'D', 'E', 'F']
const DAYS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const DAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
// «החידונים שלי»: התווית לפי rule_key (השרת מחזיר reason בעברית בלבד);
// מפתח לא מוכר נופל ל-reason כמו שהוא.
const RULE_TX = {
  quiz_solo: ['חידון', 'Quiz'], quiz_correct: ['חידון שבועי', 'Weekly quiz'], quiz_perfect: ['חידון מושלם', 'Perfect quiz'],
  duel_win: ['ניצחון בדו-קרב', 'Duel win'], duel_draw: ['תיקו בדו-קרב', 'Duel draw'],
}

const LEVELS = [
  { id: 'mix',    he: 'מיקס · הרמה עולה', en: 'Mix · rising difficulty', hint: ['קל, בינוני וקשה מעורבים', 'Easy, medium and hard mixed'], Icon: Shuffle, hot: true },
  { id: 'easy',   he: 'קל',     en: 'Easy',   hint: ['לחימום', 'Warm-up'], Icon: Zap },
  { id: 'medium', he: 'בינוני', en: 'Medium', hint: ['הרוב יידעו', 'Most will know'], Icon: Target },
  { id: 'hard',   he: 'קשה',    en: 'Hard',   hint: ['גם מאמן יתקשה', 'Even coaches sweat'], Icon: Flame },
]
const LVL_TX = { mix: ['מיקס', 'Mix'], easy: ['קל', 'Easy'], medium: ['בינוני', 'Medium'], hard: ['קשה', 'Hard'], duel: ['דו-קרב', 'Duel'] }

const COLS_L = ['#2563EB', '#60A5FA', '#059669', '#F59E0B', '#DC2626']
const COLS_D = ['#60A5FA', '#93C5FD', '#34D399', '#FBBF24', '#F87171']
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark'

// פרץ ריבועים מהאמצע (רצף) — spans עם משתני CSS, בלי ספרייה.
// ⚠ memo + useMemo: ההורה מתרנדר בזמן שהחלקיקים באוויר (הספירה במסך הסיום
//   כל 40ms, ניקוי ה-fly/flash), ובלי זה כל חלקיק היה מקבל מסלול חדש
//   באמצע התעופה. ה-useMemo לפני ה-return המוקדם — סדר ה-hooks.
const Burst = memo(function Burst({ n = 14, seed }) {
  const parts = useMemo(() => Array.from({ length: n }, () => ({
    dx: Math.random() * 220 - 110, dy: -40 - Math.random() * 160, dur: 0.7 + Math.random() * 0.5,
  })), [n, seed])
  if (reduced()) return null
  const c = isDark() ? COLS_D : COLS_L
  return (
    <span className="bw-burst" aria-hidden="true">
      {parts.map((pt, i) => (
        <i key={`${seed}-${i}`} style={{
          width: 7 + (i % 3) * 3, height: 7 + ((i + 1) % 3) * 3, background: c[i % c.length],
          borderRadius: i % 2 ? '50%' : 2,
          '--dx': `${pt.dx}px`, '--dy': `${pt.dy}px`, animationDuration: `${pt.dur}s`,
        }} />
      ))}
    </span>
  )
})
// קונפטי נופל מלמעלה — מסך הסיום
const Confetti = memo(function Confetti({ n = 40, seed }) {
  const parts = useMemo(() => Array.from({ length: n }, () => ({
    left: Math.random() * 100, dx: Math.random() * 120 - 60, dur: 1.6 + Math.random() * 1.6, delay: Math.random() * 0.7,
  })), [n, seed])
  if (reduced()) return null
  const c = isDark() ? COLS_D : COLS_L
  return (
    <span className="bw-confetti" aria-hidden="true">
      {parts.map((pt, i) => (
        <i key={`${seed}-${i}`} style={{
          left: `${pt.left}%`, width: 7 + (i % 4) * 2, height: 10 + (i % 3) * 4,
          background: c[i % c.length], borderRadius: i % 3 ? 2 : '50%',
          '--dx': `${pt.dx}px`, animationDuration: `${pt.dur}s`, animationDelay: `${pt.delay}s`,
        }} />
      ))}
    </span>
  )
})

// טבעת הזמן — מהשרת (deadline) ולא מ-seconds; מתעדכנת מיד כשמשתנה
function TimerRing({ deadline, seconds, frozen }) {
  const calc = () => Math.max(0, (deadline - Date.now()) / 1000)
  const [left, setLeft] = useState(calc)
  useEffect(() => {
    setLeft(calc())
    if (frozen) return undefined
    const t = setInterval(() => setLeft(calc()), 100)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, frozen])
  const frac = seconds > 0 ? Math.max(0, Math.min(1, left / seconds)) : 0
  const warn = left <= 5 && !frozen
  return (
    <div className={`bw-ring${warn ? ' is-warn' : ''}`} role="timer" aria-label={L(`נותרו ${Math.ceil(left)} שניות`, `${Math.ceil(left)} seconds left`)}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle className="bw-ring-bg" cx="36" cy="36" r="30" />
        <circle className="bw-ring-fg" cx="36" cy="36" r="30" strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - frac)} />
      </svg>
      <span className="bw-ring-num" dir="ltr">{Math.ceil(left)}</span>
    </div>
  )
}

// ---------- מסך המשחק ----------
function PlayOverlay({ attemptId, seconds, level, onDone, onExit }) {
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  // ⚠ לפני useFocusTrap: ניקוי לפי סדר ההצהרה — שחרור ה-inert קודם, ורק
  //   אחריו החזרת הפוקוס (מיקוד בתוך עץ inert לא עובד).
  useEffect(() => {
    const release = lockApp()
    document.body.classList.add('bw-play')
    return () => { release(); document.body.classList.remove('bw-play') }
  }, [])
  // מלכודת פוקוס + Escape = יציאה (כמו כפתור ה-X). הפוקוס עובר לשאלה בכל
  // שאלה חדשה ולכפתור «הבא» בחשיפה — בלי זה Tab נופל למסך שמאחורי השכבה.
  const trapRef = useFocusTrap(true, onExit)
  const qRef = useRef(null)
  const nextRef = useRef(null)

  const [q, setQ] = useState(null)
  const [failed, setFailed] = useState(false)
  const [deadline, setDeadline] = useState(0)
  const [picked, setPicked] = useState(null)
  const [reveal, setReveal] = useState(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  // רצף השיא ב-ref: pull() נסגר על הערך הראשוני, וההודעה לסיום חייבת
  // את הערך העדכני
  const bestRef = useRef(0)
  const [busy, setBusy] = useState(false)
  const [anim, setAnim] = useState(0)
  const [fly, setFly] = useState(null)
  const [flash, setFlash] = useState(null)
  const [burst, setBurst] = useState(0)
  const timers = useRef({})
  const later = (k, fn, ms) => { clearTimeout(timers.current[k]); timers.current[k] = setTimeout(fn, ms) }
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  const pull = useCallback(async () => {
    const r = await quizNext(attemptId)
    const d = r.data || {}
    // ⚠ הניסיון כבר נסגר בשרת (רענון, לשונית שנייה) — זה לא «נתקע»: הולכים
    //   למסך התוצאות, אחרת השחקן תקוע מול «נסה שוב» שלעולם לא יצליח.
    if (!r.ok || d.ok === false) {
      if (d.reason === 'finished') { onDoneRef.current?.({ best: bestRef.current }); return }
      setFailed(true); return
    }
    if (d.done) { onDoneRef.current?.({ best: bestRef.current }); return }
    setFailed(false)
    setQ(d); setPicked(null); setReveal(null); setFly(null); setFlash(null)
    setAnim((n) => n + 1)
    setDeadline(Date.now() + (d.seconds || seconds) * 1000)
  }, [attemptId, seconds])
  useEffect(() => { pull() }, [pull])
  useEffect(() => { if (q && !reveal) qRef.current?.focus() }, [q, reveal])
  useEffect(() => { if (reveal) nextRef.current?.focus() }, [reveal])

  const answer = async (i) => {
    if (picked !== null || busy) return
    setBusy(true); setPicked(i)
    const r = await quizAnswer(attemptId, q.question_id, i)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) {
      // השרת אומר שזו כבר לא השאלה הנוכחית — ממשיכים במקום להיתקע
      if (d.reason === 'wrong_question') { pull(); return }
      toast.error(L('התשובה לא נקלטה — נסה שוב', "Answer didn't register — try again"))
      setPicked(null)
      return
    }
    setReveal(d)
    // ⚠ תשובה נכונה שאיחרה את הזמן מזכה ב-0 בשרת — היא לא ממשיכה רצף,
    //   לא מנגנת צליל ניצחון ולא מעיפה «+0».
    const scored = d.correct && !d.too_slow
    const nextStreak = scored ? streak + 1 : 0
    setStreak(nextStreak)
    bestRef.current = Math.max(bestRef.current, nextStreak)
    if (d.points > 0) setScore((s) => s + d.points)
    playSound(scored ? 'good' : 'bad', nextStreak)
    if (scored && d.points > 0) {
      setFly(`+${d.points}`)
      later('fly', () => setFly(null), 950)
      if (nextStreak >= 2) { setBurst((n) => n + 1); later('burst', () => setBurst(0), 1500) }
    }
    setFlash(scored ? 'good' : 'bad')
    later('flash', () => setFlash(null), 650)
  }

  const next = () => { playSound('click'); pull() }
  const total = q?.total || 0
  const done = q ? q.index - 1 + (reveal ? 1 : 0) : 0
  const flameN = Math.min(streak, 5)

  // ⚠ פורטל ל-body: .main-inner מסיים אנימציה עם transform:translateY(0),
  //   שיוצר containing block ל-fixed — בלי הפורטל השכבה נחתכת לרצועה.
  return createPortal(
    <div className="bw-overlay" role="dialog" aria-modal="true" aria-label={L('חידון', 'Quiz')} ref={trapRef} tabIndex={-1}>
      {failed ? (
        <div className="bw-ov-fail">
          <p>{L('החידון נתקע — כנראה החיבור. התשובות שכבר ענית רשומות בשרת.', 'The quiz stalled — likely the connection. The answers you already gave are recorded on the server.')}</p>
          <div className="bw-row-btns">
            <button type="button" className="bw-btn bw-btn--qz" onClick={pull}>{L('נסה שוב', 'Try again')}</button>
            <button type="button" className="bw-ghost bw-ghost--qz" onClick={() => onDoneRef.current?.({ best: bestRef.current })}>{L('סיים וראה תוצאות', 'Finish and see results')}</button>
            <button type="button" className="bw-ghost bw-ghost--qz" onClick={onExit}>{L('יציאה', 'Exit')}</button>
          </div>
        </div>
      ) : !q ? (
        <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />
      ) : (
        <>
          <div className="bw-ov-top">
            <button type="button" className="bw-ibtn" onClick={onExit} aria-label={L('יציאה', 'Exit')}><X size={16} aria-hidden="true" /></button>
            <span className="bw-mut13">{L('שאלה', 'Question')} <bdi dir="ltr">{q.index}/{total}</bdi></span>
            <TimerRing deadline={deadline} seconds={q.seconds || seconds} frozen={picked !== null} />
            <span dir="ltr" className="bw-scorepill"><span className="bw-sr">{L('ניקוד: ', 'Score: ')}</span>{score}</span>
          </div>
          <div className="bw-ov-prog">
            <div className="bw-prog"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            {streak >= 2 && (
              <span className={`bw-flame${flameN >= 3 ? ' is-hot' : ''}`} style={{ '--fl': flameN }}>
                <bdi dir="ltr">{streak}</bdi> {L('רצף', 'streak')}
              </span>
            )}
          </div>

          <div key={anim} className="bw-stage">
            <h3 className="bw-q" ref={qRef} tabIndex={-1}>{q.q}</h3>
            <div className="bw-opts" role="group">
              {(q.options || []).map((opt, i) => {
                let cls = 'bw-opt'
                if (reveal) {
                  if (i === reveal.correct_index) cls += ' is-right'
                  else if (i === picked) cls += ' is-wrong'
                  else cls += ' is-dim'
                } else if (picked === i) cls += ' is-picked'
                return (
                  <button key={i} type="button" className={cls} style={{ '--i': i }} disabled={reveal !== null || busy} onClick={() => answer(i)}>
                    <span className="bw-opt-badge" aria-hidden="true">{L(LETTERS_HE[i], LETTERS_EN[i]) || i + 1}</span>
                    <span className="bw-opt-tx">{opt}</span>
                    {reveal && i === reveal.correct_index && <span className="bw-sr"> {L('(התשובה הנכונה)', '(correct answer)')}</span>}
                    {reveal && i === picked && i !== reveal.correct_index && <span className="bw-sr"> {L('(הבחירה שלך)', '(your pick)')}</span>}
                    {reveal && i === reveal.correct_index && <Check size={18} strokeWidth={3} aria-hidden="true" />}
                    {reveal && i === picked && i !== reveal.correct_index && <X size={18} strokeWidth={3} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </div>

          {fly && <span dir="ltr" className="bw-fly" aria-hidden="true">{fly}</span>}
          {burst > 0 && <Burst seed={burst} />}
          {flash && <span className={`bw-flash is-${flash}`} aria-hidden="true" />}

          {reveal && (
            <div className="bw-sheet bw-sheet--reveal">
              {reveal.too_slow
                ? <b className="bw-rev bw-rev--slow">{L('הזמן נגמר', 'Time ran out')}</b>
                : reveal.correct
                  ? <b className="bw-rev bw-rev--good">{L('נכון!', 'Correct!')} <span dir="ltr" className="bw-num">+{reveal.points}</span></b>
                  : <b className="bw-rev bw-rev--bad">{L('לא מדויק — התשובה מסומנת בירוק', 'Not quite — the answer is marked green')}</b>}
              {reveal.speed_bonus > 0 && <span className="bw-mut12">{L(`מתוכם ${reveal.speed_bonus} בונוס מהירות`, `incl. ${reveal.speed_bonus} speed bonus`)}</span>}
              {reveal.explain && <p className="bw-ex">{reveal.explain}</p>}
              <button type="button" className="bw-btn bw-btn--ok" onClick={next} ref={nextRef}>
                {q.index >= total ? L('לתוצאות', 'Results') : L('לשאלה הבאה', 'Next question')} <ChevronFwd size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
      <span className="bw-sr" aria-live="polite">
        {reveal
          ? `${reveal.too_slow ? L('הזמן נגמר', 'Time ran out') : reveal.correct ? L('נכון', 'Correct') : L('לא נכון', 'Wrong')} · ${L('התשובה', 'Answer')}: ${(q?.options || [])[reveal.correct_index] || ''} · +${reveal.points || 0}${reveal.explain ? ` · ${reveal.explain}` : ''}`
          : ''}
      </span>
    </div>,
    document.body,
  )
}

// ---------- מסך הסיום ----------
function DoneOverlay({ result, duel, level, best, onAgain, onBack }) {
  const target = result?.score ?? 0
  const [shown, setShown] = useState(reduced() ? target : 0)
  useEffect(() => {
    const release = lockApp()
    document.body.classList.add('bw-play')
    return () => { release(); document.body.classList.remove('bw-play') }
  }, [])
  const trapRef = useFocusTrap(true, onBack)
  const titleRef = useRef(null)
  useEffect(() => { titleRef.current?.focus() }, [])
  useEffect(() => {
    playSound('finish')
    let iv = null
    if (reduced()) setShown(target)
    else {
      const t0 = Date.now()
      iv = setInterval(() => {
        const p = Math.min(1, (Date.now() - t0) / 900)
        setShown(Math.round(target * (1 - Math.pow(1 - p, 3))))
        if (p >= 1) clearInterval(iv)
      }, 40)
    }
    return () => { if (iv) clearInterval(iv) }
  }, [target])
  const perfect = !!result?.perfect
  return createPortal(
    <div className="bw-overlay bw-overlay--center" role="dialog" aria-modal="true" aria-label={L('תוצאות החידון', 'Quiz results')} ref={trapRef} tabIndex={-1}>
      <Confetti n={perfect ? 54 : 40} seed="done" />
      <span className="bw-trophy" aria-hidden="true"><Trophy size={36} /></span>
      <h2 className="bw-done-title" ref={titleRef} tabIndex={-1}>{perfect ? L('חידון מושלם!', 'Perfect quiz!') : L('כל הכבוד!', 'Well done!')}</h2>
      <div dir="ltr" className="bw-done-num" aria-hidden="true">{shown}</div>
      <span className="bw-sr" role="status">{L(`${target} נקודות · ${result?.correct ?? 0} מתוך ${result?.total ?? 0} נכונות`, `${target} points · ${result?.correct ?? 0} of ${result?.total ?? 0} correct`)}</span>
      <span className="bw-mut12">{L('נקודות לניקוד החידון', 'points to your quiz score')}</span>
      <span className="bw-txt14">{L(`${result?.correct ?? 0} מתוך ${result?.total ?? 0} ${(result?.correct ?? 0) === 1 ? 'נכונה' : 'נכונות'}`, `${result?.correct ?? 0} of ${result?.total ?? 0} correct`)}</span>
      <span className="bw-done-chip">{level === 'duel'
        ? L(`רצף שיא ${best} · דו-קרב`, `Best streak ${best} · Duel`)
        : L(`רצף שיא ${best} · רמה ${LVL_TX[level]?.[0] || ''}`, `Best streak ${best} · ${LVL_TX[level]?.[1] || ''}`)}</span>
      {duel && <span className="bw-mut12">{L('התוצאה נשלחה לדו-קרב — מחכים ליריב.', 'Sent to the duel — waiting for your rival.')}</span>}
      {!duel && result && result.scored === false && (
        <span className="bw-mut12">{L('לא נספר לטבלה — צברת היום את המקסימום. לכיף בלבד.', "Doesn't count toward the board — you hit today's max. Just for fun.")}</span>
      )}
      <div className="bw-row-btns">
        {onAgain && <button type="button" className="bw-btn bw-btn--qz" onClick={onAgain}>{L('עוד אחד', 'One more')}</button>}
        <button type="button" className="bw-ghost bw-ghost--qz" onClick={onBack}>{L('לדף החידון', 'Back to quiz')}</button>
      </div>
    </div>,
    document.body,
  )
}

function fmtDay(ymd) {
  if (!ymd) return ''
  const [, m, d] = ymd.split('-').map(Number)
  return `${d}.${m}`
}

// ---------- הדף ----------
export default function BwQuiz({ sum, reload, month, openRules }) {
  const [mode, setMode] = useState('cards')   // cards | playing | done
  const [attempt, setAttempt] = useState(null)
  const [result, setResult] = useState(null)
  const [best, setBest] = useState(0)
  const [lastLevel, setLastLevel] = useState('mix')
  const [uid, setUid] = useState(null)
  const [duels, setDuels] = useState([])
  const [duelNames, setDuelNames] = useState({})
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [scoredLeft, setScoredLeft] = useState(sum.scoredLeft)
  // דו-קרבות שהשרת כבר אמר עליהם «כבר שיחקת» — הכפתור מתחלף בהודעה
  const [playedDuels, setPlayedDuels] = useState([])
  const [rows, setRows] = useState(null)
  const [mine, setMine] = useState([])

  const load = useCallback(async () => {
    const [d, b, p, left] = await Promise.all([myDuels(), board({ scope: 'quiz' }), myPoints({ scope: 'quiz' }), soloLeft()])
    if (left !== null) setScoredLeft(left)
    if (b.ok) setRows(b.rows || [])
    if (p.ok) setMine(p.rows || [])
    if (d.ok) {
      setUid(d.uid); setDuels(d.rows || [])
      const ids = (d.rows || []).flatMap((x) => [x.challenger_id, x.opponent_id, x.winner_id]).filter(Boolean)
      setDuelNames(await displayNames(ids))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const me = sum.me
  const st = sum.standing?.quiz
  const streak = sum.streak || { streak: 0, week: [] }
  const qs = sum.qset || {}

  // הפוקוס חוזר לכפתור שפתח את החידון (Escape / X / «לדף החידון») — נלכד
  // לפני setBusy, כי כפתור שנעשה disabled מאבד פוקוס בפיירפוקס.
  const returnTo = useRef(null)
  useEffect(() => {
    if (mode !== 'cards' || !returnTo.current) return
    const el = returnTo.current; returnTo.current = null
    const target = document.contains(el) ? el : document.querySelector(`.bw-lvl--${lastLevel}`)
    target?.focus?.()
  }, [mode, lastLevel])

  const playLevel = async (level) => {
    returnTo.current = document.activeElement
    setBusy(true)
    const r = await quizSolo(level === 'mix' ? null : level)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) {
      returnTo.current = null   // לא נפתחה שכבה — אין למה להחזיר פוקוס
      toast.error(d.message || L('לא הצלחנו לפתוח חידון', "Couldn't start a quiz")); return
    }
    setLastLevel(level); setBest(0)
    setAttempt({ id: d.attempt_id, total: d.total, seconds: d.seconds_per_q, duelId: null })
    setMode('playing'); playSound('start')
  }
  const beginDuel = async (quizId, duelId) => {
    setBusy(true)
    const r = await quizStart(quizId, duelId)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) {
      returnTo.current = null
      // «כבר שיחקת את החידון הזה» — מסמנים את הדו-קרב כמשוחק כדי שהכפתור
      // לא יזמין את השחקן שוב לאותה שגיאה
      if (d.reason === 'already_done') setPlayedDuels((a) => (a.includes(duelId) ? a : [...a, duelId]))
      toast.error(d.message || L('אי אפשר להתחיל', "Can't start")); return
    }
    setLastLevel('duel'); setBest(0)
    setAttempt({ id: d.attempt_id, total: d.total, seconds: d.seconds_per_q, duelId })
    setMode('playing'); playSound('start')
  }
  const finish = useCallback(async ({ best: b } = {}) => {
    if (typeof b === 'number') setBest(b)
    const r = await quizFinish(attempt.id)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(L('הסיום לא נקלט — נסה שוב', "Couldn't finish — try again")); return }
    setResult((prev) => (d.already && prev ? { ...prev, ...d, correct: prev.correct, total: prev.total } : d))
    if (typeof d.scored_left === 'number') setScoredLeft(d.scored_left)
    setMode('done')
    load(); reload()
  }, [attempt, load, reload])
  const createDuel = async () => {
    setBusy(true)
    const r = await duelCreate()
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(d.message || L('יצירת הדו-קרב נכשלה', 'Duel creation failed')); return }
    playSound('click')
    waShare(duelInvite(d.code))
    load()
  }
  const joinDuel = async () => {
    if (!joinCode.trim()) { toast.info(L('הקלד קוד כדי להצטרף', 'Type a code to join')); return }
    returnTo.current = document.activeElement
    setBusy(true)
    const r = await duelJoin(joinCode)
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { returnTo.current = null; toast.error(d.message || L('הקוד לא נמצא', 'Code not found')); return }
    setJoinCode('')
    beginDuel(d.quiz_id, d.duel_id)
  }

  // השכבות מרונדרות **לצד** הדף ולא במקומו: הדף נשאר ב-DOM כדי שהפוקוס
  // יוכל לחזור אליו, והשכבה (fixed, z-index 70, אטומה) מכסה אותו ממילא.
  const overlay = mode === 'playing' && attempt
    ? <PlayOverlay attemptId={attempt.id} seconds={attempt.seconds} level={lastLevel} onDone={finish}
        onExit={() => { setMode('cards'); setAttempt(null); load() }} />
    : mode === 'done'
      ? <DoneOverlay result={result} duel={!!attempt?.duelId} level={lastLevel} best={best}
          onBack={() => { setMode('cards'); setAttempt(null) }}
          onAgain={attempt?.duelId || busy ? null : () => playLevel(lastLevel)} />
      : null

  // כש-game_me לא נטען (רשת) לא נועלים את המסך — השרת ממילא אוכף; ההסבר
  // על פרופיל/אישור הורה מוצג רק כשהשרת אמר במפורש can_play=false.
  const canPlay = !me || !!me.can_play
  const locked = !!me && !me.can_play
  // שעון השרת גם כאן — אותו כלל כמו בטיימר האתגר
  const now = serverNow().getTime()
  const openDuels = duels.filter((d) => d.status !== 'done' && d.status !== 'expired'
    && !(d.status === 'pending' && d.expires_at && new Date(d.expires_at).getTime() < now))
  const waiting = openDuels.find((d) => !d.opponent_id && d.challenger_id === uid)
  const doneDuels = duels.filter((d) => d.status === 'done')
  const rec = doneDuels.reduce((a, d) => {
    if (d.is_draw) a.d += 1; else if (d.winner_id === uid) a.w += 1; else a.l += 1
    return a
  }, { w: 0, l: 0, d: 0 })
  const rival = (d) => duelNames[d.challenger_id === uid ? d.opponent_id : d.challenger_id] || L('יריב', 'rival')

  const top = (rows || []).slice(0, 3)
  const rest = (rows || []).slice(3, 5)
  const meInTop = (rows || []).slice(0, 5).some((r) => r.is_me)
  const meLater = st && st.listed && st.rank > 5 && !meInTop

  return (
    <div className="bw-page">
      {overlay}
      {/* כרטיס הניקוד */}
      <div className="bw-score bw-score--qz">
        <div className="bw-score-row">
          <div className="bw-score-col">
            <span className="bw-score-k">{L('הניקוד שלי בחידון', 'My quiz score')}{month ? ` · ${month}` : ''}</span>
            <span className="bw-score-big"><b dir="ltr" className="bw-num">{st?.points ?? 0}</b><span>{L('נק׳', 'pts')}</span></span>
            <span className="bw-score-note">{L('ניקוד חידון בלבד · לא מתערבב עם אתגר או ניחושים', 'Quiz points only · never mixed with challenge or picks')}</span>
          </div>
          <span className="bw-score-box">
            <b dir="ltr" className="bw-num">{st && st.listed && st.rank > 0 ? `#${st.rank}` : '—'}</b>
            <span>{st?.total > 0 ? L(`מ-${st.total}`, `of ${st.total}`) : L('בטבלה', 'ranked')}</span>
          </span>
        </div>
        <div className="bw-streak" role="group" aria-label={L(`רצף ${streak.streak === 1 ? 'יום אחד' : `${streak.streak} ימים`}`, `${streak.streak}-day streak`)}>
          <span className="bw-score-k">{L('רצף:', 'Streak:')}</span>
          {streak.week.map((d, i) => (
            <span key={d.d} className={`bw-day${d.on ? ' is-on' : ''}${d.now ? ' is-now' : ''}`} aria-hidden="true">
              {L(DAYS_HE[i], DAYS_EN[i])}
            </span>
          ))}
          <span className="bw-streak-n">{L(cnt(streak.streak, 'יום אחד', 'ימים'), streak.streak === 1 ? '1 day' : `${streak.streak} days`)}</span>
        </div>
      </div>

      {/* בחירת רמה */}
      <div className="bw-card">
        <div className="bw-card-head">
          <h2 className="bw-card-title">{L('בחר רמה ושחק', 'Pick a level and play')}</h2>
          {typeof scoredLeft === 'number' && canPlay && (
            <span className="bw-chip bw-chip--qz">
              {scoredLeft > 0
                ? L(scoredLeft === 1 ? 'עוד אחד נספר היום' : `עוד ${scoredLeft} נספרים היום`, scoredLeft === 1 ? '1 more counts today' : `${scoredLeft} more count today`)
                : L('לכיף בלבד היום', 'Just for fun today')}
            </span>
          )}
        </div>
        <p className="bw-mut12">{L(`${qs.solo_questions ?? 8} שאלות · ${qs.solo_seconds ?? 20} שניות לשאלה · בונוס מהירות עד +${sum.rules?.quiz_speed ?? 5} לכל תשובה`, `${qs.solo_questions ?? 8} questions · ${qs.solo_seconds ?? 20}s each · speed bonus up to +${sum.rules?.quiz_speed ?? 5} per answer`)}</p>
        {locked && (
          <p className="bw-mut12 bw-locked">
            {L('כדי לשחק צריך פרופיל מלא (שם + תאריך לידה), ולקטינים — אישור הורה. הכל בעמוד הפרופיל.',
               'To play you need a complete profile (name + birth date), and minors need parental approval — all in your profile page.')}
          </p>
        )}
        {LEVELS.map(({ id, he, en, hint, Icon, hot }) => (
          <button key={id} type="button" className={`bw-lvl bw-lvl--${id}`} disabled={busy || !canPlay} onClick={() => playLevel(id)}>
            <span className="bw-lvl-ico" aria-hidden="true"><Icon size={18} /></span>
            <span className="bw-lvl-tx"><b>{L(he, en)}</b><span>{L(hint[0], hint[1])}</span></span>
            {hot ? <span className="bw-hot">{L('מומלץ', 'Recommended')}</span> : <ChevronFwd size={17} className="bw-chev" aria-hidden="true" />}
          </button>
        ))}
      </div>

      {/* דו-קרב */}
      <div className="bw-card">
        <div className="bw-card-head">
          <h2 className="bw-card-title">{L('דו-קרב מול חברים', 'Duel a friend')}</h2>
          {doneDuels.length > 0 && (
            <span className="bw-chip bw-chip--mut" dir="ltr">
              {rec.w}–{rec.l}{rec.d ? `–${rec.d}` : ''}
            </span>
          )}
        </div>
        <p className="bw-mut12">{L('אותן שאלות, טיימר רץ — מי חכם יותר? שלח קוד לחבר.', 'Same questions, clock running — who knows more? Send a friend the code.')}</p>
        <div className="bw-duel-row">
          <button type="button" className="bw-ghost bw-ghost--qz" disabled={busy || !canPlay} onClick={createDuel}>
            <Share2 size={14} aria-hidden="true" /> {L('פתח דו-קרב', 'Start a duel')}
          </button>
          <div className="bw-join">
            <input type="text" maxLength={6} dir="ltr" placeholder={L('קוד', 'Code')} value={joinCode} className="bw-input"
              aria-label={L('קוד דו-קרב', 'Duel code')} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} />
            <button type="button" className="bw-btn bw-btn--ok bw-btn--sm" disabled={busy || !canPlay} onClick={joinDuel}>{L('הצטרף', 'Join')}</button>
          </div>
        </div>
        {waiting && (
          <div className="bw-codebox">
            <span className="bw-mut12">{L('הקוד שלך:', 'Your code:')}</span>
            <b dir="ltr" className="bw-code">{waiting.invite_code}</b>
            <button type="button" className="bw-link" onClick={() => waShare(duelInvite(waiting.invite_code))}>
              <Share2 size={13} aria-hidden="true" /> {L('שלח שוב', 'Share again')}
            </button>
          </div>
        )}
        {openDuels.filter((d) => d.opponent_id).map((d) => (
          <div key={d.id} className="bw-rowsoft">
            <span className="bw-txt13 bw-grow">{L(`נגד ${rival(d)}`, `vs ${rival(d)}`)}</span>
            {playedDuels.includes(d.id)
              ? <span className="bw-mut11">{L('שיחקת — מחכים ליריב', 'You played — waiting for your rival')}</span>
              : (
                <button type="button" className="bw-link" onClick={() => beginDuel(d.quiz_id, d.id)}>
                  <Play size={13} aria-hidden="true" /> {L('שחק', 'Play')}
                </button>
              )}
          </div>
        ))}
        {doneDuels.length > 0 && (
          <div className="bw-scrollrow">
            {doneDuels.slice(0, 6).map((d) => (
              <span key={d.id} className={`bw-fr ${d.is_draw ? 'bw-fr--even' : d.winner_id === uid ? 'bw-fr--win' : 'bw-fr--lose'}`}>
                {rival(d)} · {d.is_draw ? L('תיקו', 'draw') : d.winner_id === uid ? L('ניצחת', 'won') : L('הפסד', 'lost')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* אלופי החודש */}
      <div className="bw-card">
        <div className="bw-card-head">
          <h2 className="bw-card-title">{L('אלופי החידון', 'Quiz champions')}{month ? ` · ${month}` : ''}</h2>
          <span className="bw-chip bw-chip--mut">{L('מתאפס בתחילת החודש', 'Resets monthly')}</span>
        </div>
        {rows === null && <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />}
        {rows && rows.length === 0 && (
          <p className="bw-mut12">{L('עוד אין אלופים החודש — שחק חידון ותהיה הראשון בטבלה.', 'No champions yet this month — play a quiz and be first on the board.')}</p>
        )}
        {rows && rows.length > 0 && (
          <>
            <div className="bw-podium">
              {[top[1], top[0], top[2]].map((r, i) => {
                const place = [2, 1, 3][i]
                if (!r) return <div key={place} className="bw-pod-col" />
                return (
                  <div key={place} className={`bw-pod-col bw-pod-col--${place}`}>
                    <span className={`bw-pod-av bw-pod-av--${place}`} aria-hidden="true">{initials(r.display_name)}</span>
                    {r.is_me && <span className="bw-you">{L('אתה', 'you')}</span>}
                    <b className="bw-txt12">{r.display_name}</b>
                    <b dir="ltr" className={`bw-num bw-pod-num--${place}`}>{r.points}</b>
                    <div className={`bw-pod bw-pod--${place}`}><span className="bw-sr">{L('מקום ', 'Place ')}</span>{place}</div>
                  </div>
                )
              })}
            </div>
            {rest.map((r) => (
              <div key={r.rank} className={`bw-row${r.is_me ? ' is-mine' : ''}`}>
                <b dir="ltr" className="bw-rank">{r.rank}</b>
                <span className="bw-txt13 bw-grow">{r.display_name}{r.is_me ? ` (${L('אתה', 'you')})` : ''}</span>
                <b dir="ltr" className="bw-num13">{r.points}</b>
              </div>
            ))}
            {meLater && (
              <div className="bw-row is-mine">
                <b dir="ltr" className="bw-rank">{st.rank}</b>
                <span className="bw-txt13 bw-grow">{me?.display_name || L('אתה', 'You')} ({L('אתה', 'you')})</span>
                <b dir="ltr" className="bw-num13">{st.points}</b>
              </div>
            )}
          </>
        )}
      </div>

      {/* החידונים שלי */}
      <div className="bw-card">
        <h2 className="bw-card-title">{L('החידונים שלי', 'My quizzes')}</h2>
        {mine.length === 0 && <p className="bw-mut12">{L('עוד לא שיחקת החודש — בחר רמה למעלה.', "You haven't played this month — pick a level above.")}</p>}
        {mine.slice(0, 5).map((r, i) => (
          <div key={`${r.occurred_on}-${i}`} className="bw-rowsoft">
            <span className="bw-txt13 bw-grow">{L(r.reason, RULE_TX[r.rule_key] ? `${RULE_TX[r.rule_key][1]}${/—\s*\d+\/\d+/.test(r.reason || '') ? ' ' + r.reason.slice(r.reason.indexOf('—')) : ''}` : r.reason)}</span>
            <span className="bw-mut11" dir="ltr">{fmtDay(r.occurred_on)}</span>
            <b dir="ltr" className="bw-num bw-num--qz">+{r.points}</b>
          </div>
        ))}
        <button type="button" className="bw-ghost bw-ghost--qz" onClick={openRules}>{L('כללי החידון והתקנון', 'Quiz rules')}</button>
      </div>
    </div>
  )
}
