import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Home, Globe, Sparkles, Sun, Moon, Volume2, VolumeX, X } from 'lucide-react'
import { L } from './i18n'
import useFocusTrap from './useFocusTrap'
import { soundOn, setSound, playSound } from './bwSound'
import {
  gameMe, myStanding, myPoints, soloLeft, periodKeys,
  scoringRules, quizSettings, syncServerClock,
} from './game'
import { monthLabel, quizStreak, prevSeasonKey, reduced, lockApp } from './bwUtil'
import BwQuiz from './BwQuiz'
import BwPred from './BwPred'

// BasketballWorld — «עולם הכדורסל» של השחקן, לפי מסמך העיצוב
// BasketballWorldV2. במקור ארבעה דפים; **האתגר השבועי הוסר ב-19.8**
// יחד עם העלאת הווידאו, ונשארו שלושה: בית · חידון · ניחושים.
//
// כל דף עם הזרקור (באנר בצבע שלו) והניקוד שלו — חידון וניחושים אינם
// מתערבבים, כמו בפנקס בשרת. הבית הוא כרטיס אישי.
//
// מרחב השמות bw-* חדש במכוון (index.css הוא append-only; ראה nh-*/pkn-*).
//
// ⚠ אין כאן שום נתון מומצא: כל מספר על המסך מגיע מ-game.js. פיצ׳ר שאין
//   לו עדיין שרת (ניחושים לפני פתיחת הליגה, «חברים») מוצג במצב ריק כן
//   או מחובר לנתון הקרוב ביותר — לא לנתוני דמה.

export const BW_PAGES = {
  home:      { kicker: ['COURTSIDE', 'COURTSIDE'], title: ['עולם הכדורסל', 'Basketball world'], sub: ['הכרטיס שלי · שלושה משחקים · מתאפס כל חודש', 'My card · three games · resets monthly'] },
  quiz:      { kicker: ['QUIZ · חידון', 'QUIZ'], title: ['חידון כדורסל', 'Basketball quiz'], sub: ['ניקוד חידון בלבד · לא מתערבב עם הניחושים', 'Quiz points only · never mixed with picks'] },
  pred:      { kicker: ['PICKS · ניחושים', 'PICKS'], title: ['ניחושי השבוע', 'Weekly picks'], sub: ['מנצחת ותוצאה מדויקת · אין תיקו', 'Winner and exact score · no draws'] },
}

const TABS = [
  { id: 'home',      Icon: Home,     label: ['בית', 'Home'] },
  { id: 'quiz',      Icon: Globe,    label: ['חידון', 'Quiz'] },
  { id: 'pred',      Icon: Sparkles, label: ['ניחושים', 'Picks'] },
]

// ---------- טעינת הסיכום המשותף (הבית + כותרות הדפים) ----------
function useBwSummary() {
  const [sum, setSum] = useState({ state: 'loading' })
  const load = useCallback(async () => {
    syncServerClock()
    const [me, k, sQz, sPr, left, ptsQz, rules, qset] = await Promise.all([
      gameMe(), periodKeys(),
      myStanding({ scope: 'quiz' }), myStanding({ scope: 'predictions' }),
      soloLeft(), myPoints({ scope: 'quiz', period: 'season' }), scoringRules(), quizSettings(),
    ])
    if (me.notDeployed) { setSum({ state: 'notDeployed' }); return }
    // ⚠ שתי קריאות שונות שנכשלו — זו תקלת רשת, לא מסך ריק. מצב ריק
    //   בטוח-בעצמו הוא שקר: השחקן חושב שאין לו נקודות בכלל.
    if (!me.ok && !sQz.ok) { setSum({ state: 'error' }); return }
    // הרצף נגזר מהפנקס של העונה; ב-1 בספטמבר מפתח העונה מתחלף וכל הימים
    // שלפניו נעלמים — לכן מצרפים גם את העונה הקודמת (רק בחודש הראשון שלה,
    // כשזה בכלל משנה).
    let prevRows = []
    const prevKey = k.ok ? prevSeasonKey(k.keys) : null
    const prev = prevKey ? await myPoints({ scope: 'quiz', period: 'season', key: prevKey }) : null
    if (prev?.ok) prevRows = prev.rows || []
    setSum({
      state: 'ready',
      me: me.ok ? me.me : null,
      keys: k.ok ? k.keys : null,
      standing: { quiz: sQz.ok ? sQz.standing : null, pred: sPr.ok ? sPr.standing : null },
      scoredLeft: left,
      streak: quizStreak([...(ptsQz.ok ? ptsQz.rows : []), ...prevRows]),
      rules, qset,
    })
  }, [])
  useEffect(() => { load() }, [load])
  return [sum, load]
}

// ---------- הבאנר ----------
function Hero({ page, dark, onTheme, sound, onSound, bell }) {
  const p = BW_PAGES[page]
  return (
    <header className="bw-hero">
      <span className="bw-hero-ring" aria-hidden="true" />
      <div className="bw-hero-row">
        <div className="bw-hero-tx">
          <span className="bw-kicker">{L(p.kicker[0], p.kicker[1])}</span>
          <h1 className="bw-title">{L(p.title[0], p.title[1])}</h1>
          <span className="bw-sub">{L(p.sub[0], p.sub[1])}</span>
        </div>
        <div className="bw-hero-btns">
          {/* הפעמון חי כאן כי הסרגל העליון יורד במסך הזה במובייל — בלעדיו
              השחקן מאבד את ההתראות בדיוק במסך שמייצר אותן */}
          {bell ? <span className="bw-hero-bell">{bell}</span> : null}
          <button type="button" className="bw-hbtn" onClick={onTheme} aria-label={L('מצב תצוגה', 'Display mode')} title={L('מצב כהה / בהיר', 'Dark / light')}>
            {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
          </button>
          <button type="button" className="bw-hbtn" onClick={onSound} aria-pressed={sound} aria-label={L('צלילים', 'Sounds')}>
            {sound ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  )
}

// ---------- ניווט הדפים ----------
function SubNav({ page, onPage }) {
  return (
    <nav className="bw-tabs" aria-label={L('דפי עולם הכדורסל', 'Basketball world pages')}>
      {TABS.map(({ id, Icon, label }) => (
        <button
          key={id} type="button"
          className={page === id ? 'bw-tab is-on' : 'bw-tab'}
          aria-current={page === id ? 'page' : undefined}
          onClick={() => onPage(id)}
        >
          <Icon size={19} aria-hidden="true" />
          <span>{L(label[0], label[1])}</span>
        </button>
      ))}
    </nav>
  )
}

// ---------- גיליון התקנון ----------
// ⚠ כל מספר כאן מגיע מהשרת (game_scoring_rules + game_settings) — התקנון
//   על המסך והפנקס בפועל חייבים להסכים. מה שהשרת לא עושה לא נכתב כאן:
//   אין מחיקת קליפים אחרי שבוע (מדיניות השמירה היא 180 יום, ידנית),
//   הנקודות באתגר נרשמות כבר להגשה שעל הפיד (המאמן רשאי להסיר — ואז הן
//   יורדות), ודו-קרב **כן** נספר לטבלת החידון (ניצחון/תיקו, עד תקרה יומית).
function rulesFor(page, r, qs) {
  const soloTx = qs.solo_scored_per_day === 1
    ? 'החידון הראשון ביום נספר לטבלה'
    : `${qs.solo_scored_per_day} החידונים הראשונים ביום נספרים לטבלה`
  const soloTxEn = qs.solo_scored_per_day === 1
    ? 'the first quiz a day counts toward the board'
    : `the first ${qs.solo_scored_per_day} quizzes a day count toward the board`
  const q = L(
    `+${r.quiz_correct} לתשובה נכונה · בונוס מהירות עד +${r.quiz_speed} לפי הזמן שנשאר · חידון מושלם +${r.quiz_perfect} · ${soloTx}, השאר לכיף · רצף הימים נספר מהפנקס: יום שבו נרשמו לך נקודות חידון (חידון שנספר לטבלה, או דו-קרב שניצחת או סיימת בתיקו) · דו-קרב נספר לטבלת החידון: ניצחון +${r.duel_win}, תיקו +${r.duel_draw}, עד ${qs.duel_scored_per_day} ביום.`,
    `+${r.quiz_correct} per correct answer · speed bonus up to +${r.quiz_speed} by time left · perfect quiz +${r.quiz_perfect} · ${soloTxEn}, the rest are for fun · day streak comes from the ledger: a day you were credited quiz points (a counted quiz, or a duel you won or drew) · duels count toward the quiz board: win +${r.duel_win}, draw +${r.duel_draw}, up to ${qs.duel_scored_per_day} a day.`,
  )
  const p = L(
    `אין תיקו בכדורסל — בוחרים קבוצה מנצחת · כיוון נכון +${r.pred_direction} · תוצאה מדויקת עוד +${r.pred_exact} · מחזור מושלם +${r.pred_perfect_round} (לפחות ${r.pred_perfect_round_min} משחקים) · הניחוש ננעל בשריקת הפתיחה ואז נפתחים ניחושי החברים · הניחושים נפתחים עם פתיחת הליגה.`,
    `No draws in basketball — pick a winner · right direction +${r.pred_direction} · exact score another +${r.pred_exact} · perfect round +${r.pred_perfect_round} (at least ${r.pred_perfect_round_min} games) · picks lock at tip-off, then friends' picks open · picks open with the league season.`,
  )
  const h = L(
    'כל אזור מנהל ניקוד משלו — נכנסים לדף של החידון או של הניחושים כדי לראות את הניקוד והטבלה שלו.',
    'Each area keeps its own points — open the quiz or picks page to see its score and board.',
  )
  return { home: h, quiz: q, pred: p }[page]
}

function RulesSheet({ page, rules, qset, onClose }) {
  // ⚠ לפני useFocusTrap בכוונה: ניקוי אפקטים רץ לפי סדר ההצהרה, והפוקוס
  //   חייב לחזור אחרי שחרור ה-inert (מיקוד בתוך עץ inert הוא no-op שקט).
  useEffect(() => {
    const release = lockApp()
    document.body.classList.add('bw-modal')
    return () => { release(); document.body.classList.remove('bw-modal') }
  }, [])
  const trapRef = useFocusTrap(true, onClose)
  const p = BW_PAGES[page]
  // פורטל ל-body — ראה ההערה על ה-overlay ב-BwQuiz (transform ב-.main-inner)
  return createPortal(
    <div className="bw-sheet-wrap" data-page={page} role="presentation">
      <button type="button" className="bw-scrim" aria-label={L('סגירה', 'Close')} onClick={onClose} />
      <div className="bw-sheet" role="dialog" aria-modal="true" aria-labelledby="bw-rules-title" ref={trapRef}>
        <div className="bw-sheet-head">
          <h2 id="bw-rules-title" className="bw-sheet-title">{L('תקנון · ', 'Rules · ')}{L(p.title[0], p.title[1])}</h2>
          <button type="button" className="bw-ibtn" onClick={onClose} aria-label={L('סגירה', 'Close')}><X size={15} aria-hidden="true" /></button>
        </div>
        <p className="bw-sheet-body">{rulesFor(page, rules, qset)}</p>
        {(rules._fromServer === false || (page === 'quiz' && qset._fromServer === false)) && (
          <p className="bw-mut11">{L('המספרים לא נטענו מהשרת כרגע — מוצגות ברירות המחדל.', 'Numbers did not load from the server — defaults shown.')}</p>
        )}
        <b className="bw-sheet-sub">{L('כללי לכל עולם הכדורסל', 'For the whole basketball world')}</b>
        <p className="bw-sheet-body">
          {L('כל משחק מנהל ניקוד נפרד — חידון וניחושים לא מתערבבים · הטבלאות מתאפסות בתחילת כל חודש (ויש גם טבלת עונה) · קטינים משתתפים באישור הורה · שפה מכבדת בלבד · תקלה טכנית מזכה בניסיון חוזר.',
             'Every game keeps separate points — quiz and picks never mix · boards reset at the start of each month (there is a season board too) · minors play with parental approval · respectful language only · a technical failure earns a retry.')}
        </p>
      </div>
    </div>,
    document.body,
  )
}

// ---------- הבית ----------
function BwHome({ sum, onPage }) {
  const st = sum.standing || {}
  const rankOf = (s) => (s && s.listed && s.rank > 0 ? `#${s.rank}` : '—')
  const streak = sum.streak?.streak ?? 0

  const qzSub = () => {
    const s = st.quiz
    if (s && s.listed && s.rank > 0) {
      if (s.rank === 1) return L('מקום 1 · אתה בראש הטבלה', '#1 · you lead the board')
      if (s.ahead_of) return L(`#${s.rank} · ${s.behind_by} נק׳ מ${s.ahead_of}`, `#${s.rank} · ${s.behind_by} pts behind ${s.ahead_of}`)
      return L(`#${s.rank} · ${s.points} נק׳ החודש`, `#${s.rank} · ${s.points} pts this month`)
    }
    // null = לא נטען (רשת / RPC לא פרוס) — לא ממציאים «המקסימום נצבר»
    if (typeof sum.scoredLeft !== 'number') return L('בחר רמה ושחק', 'Pick a level and play')
    if (sum.scoredLeft > 0) return L(sum.scoredLeft === 1 ? 'עוד אחד נספר היום' : `עוד ${sum.scoredLeft} נספרים היום`, sum.scoredLeft === 1 ? '1 more counts today' : `${sum.scoredLeft} more count today`)
    return L('לכיף בלבד היום · המקסימום נצבר', 'For fun today · daily max reached')
  }
  const nQ = sum.qset?.solo_questions

  return (
    <div className="bw-page bw-home">
      <div className="bw-stats">
        <div className="bw-stat bw-stat--qz"><span className="bw-stat-emoji">🔥</span><b dir="ltr" className="bw-stat-num">{streak}</b><span className="bw-stat-lbl">{L('ימים ברצף בחידון', 'quiz day streak')}</span></div>
        <div className="bw-stat bw-stat--pr"><span className="bw-stat-emoji">🎯</span><b dir="ltr" className="bw-stat-num">{rankOf(st.pred)}</b><span className="bw-stat-lbl">{L('בטבלת הניחושים', 'on the picks board')}</span></div>
      </div>

      <span className="bw-lbl">{L('המשחקים שלי', 'MY GAMES')}</span>

      <button type="button" className="bw-game" onClick={() => onPage('pred')}>
        <span className="bw-tile bw-tile--pr" aria-hidden="true">🔮</span>
        <span className="bw-game-tx">
          <b>{L('ניחושים', 'Picks')}</b>
          <span>{L('ייפתחו עם פתיחת הליגה · מנצחת ותוצאה מדויקת', 'Open with the league season · winner and exact score')}</span>
        </span>
        <span className="bw-pill bw-pill--pr">{L('בקרוב', 'Soon')}</span>
      </button>

      <button type="button" className="bw-game" onClick={() => onPage('quiz')}>
        <span className="bw-tile bw-tile--qz" aria-hidden="true">🧠</span>
        <span className="bw-game-tx">
          <b>{streak > 0 ? L('חידון · שמור על הרצף', 'Quiz · keep the streak') : L('חידון · התחל רצף', 'Quiz · start a streak')}</b>
          <span>{qzSub()}</span>
        </span>
        <span className="bw-pill bw-pill--qz">{nQ ? L(`${nQ} שאלות`, `${nQ} questions`) : L('חידון', 'Quiz')}</span>
      </button>

    </div>
  )
}

// ---------- המעטפת ----------
export default function BasketballWorld({ bell = null }) {
  const [page, setPage] = useState('home')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [sound, setSoundState] = useState(soundOn)
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')
  const [sum, reload] = useBwSummary()

  useEffect(() => {
    const syncTheme = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark')
    const syncSound = () => setSoundState(soundOn())
    window.addEventListener('themechange', syncTheme)
    window.addEventListener('bw-sound', syncSound)
    return () => { window.removeEventListener('themechange', syncTheme); window.removeEventListener('bw-sound', syncSound) }
  }, [])

  const onTheme = () => {
    const next = !dark
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('theme', next ? 'dark' : 'light')
    window.dispatchEvent(new Event('themechange'))
    playSound('click')
  }
  const onSound = () => { const next = !sound; setSound(next); if (next) playSound('click') }
  const go = useCallback((id) => {
    setPage(id)
    playSound('click')
    window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })
  }, [])
  const openRules = useCallback(() => { setRulesOpen(true); playSound('click') }, [])

  // בלי useMemo — התווית תלויה גם בשפה (L), והחלפת שפה לא משנה את sum.keys
  const month = monthLabel(sum.keys?.month)
  const ctx = { sum, reload, month, openRules, onPage: go }

  return (
    <div className="bw" data-page={page}>
      <span className="bw-glow" aria-hidden="true" />
      <Hero page={page} dark={dark} onTheme={onTheme} sound={sound} onSound={onSound} bell={bell} />
      <SubNav page={page} onPage={go} />

      <div className="bw-body" key={page}>
        {sum.state === 'loading' && <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />}
        {sum.state === 'notDeployed' && (
          <div className="bw-card bw-empty">
            <b>{L('עולם הכדורסל עוד לא נפתח', 'The basketball world is not open yet')}</b>
            <p className="bw-mut12">{L('הטבלאות ייפתחו עם החידון הראשון.', 'Standings open with the first quiz.')}</p>
          </div>
        )}
        {sum.state === 'error' && (
          <div className="bw-card bw-empty">
            <b>{L('לא הצלחנו לטעון את עולם הכדורסל', "Couldn't load the basketball world")}</b>
            <p className="bw-mut12">{L('בדוק חיבור ונסה שוב — הנקודות שלך שמורות בשרת.', 'Check your connection and try again — your points are safe on the server.')}</p>
            <button type="button" className="bw-ghost bw-ghost--qz" onClick={reload}>{L('נסה שוב', 'Try again')}</button>
          </div>
        )}
        {sum.state === 'ready' && page === 'home' && <BwHome sum={sum} onPage={go} />}
        {sum.state === 'ready' && page === 'quiz' && <BwQuiz {...ctx} />}
        {sum.state === 'ready' && page === 'pred' && <BwPred {...ctx} />}
      </div>

      {rulesOpen && <RulesSheet page={page} rules={sum.rules || {}} qset={sum.qset || {}} onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
