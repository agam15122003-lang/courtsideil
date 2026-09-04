import { useState, useEffect, useCallback } from 'react'
import { SkeletonCards } from './Skeleton'
import {
  Send, Users, User, Dumbbell, ClipboardList, MonitorPlay, PencilLine,
  Search, Check, CalendarDays, Inbox, X, CheckCheck, Hash, Repeat2, BookOpen,
} from 'lucide-react'
import { toast } from './toast'
import { L, trTeam, cnt } from './i18n'
import { PLAYER_SIDE, COACH_LOGS } from './flags'
import { loadRoster, sendAssignments, loadSentFeed, pickId } from './sendToPlayersApi'
import Avatar from './Avatar'
import useFocusTrap from './useFocusTrap'

// ===== צד המאמן בלבד (22.8) =====
// אותו מסך, אבל המשימה לא «נשלחת» לאף אחד — היא נרשמת ברשימה של המאמן
// (על שורת הסגל), והמאמן מסמן «ביצע» אחרי שבדק עם השחקן באימון.
// כל הניסוחים של «שליחה» עוברים דרך הטבלה הזו, כדי שהמסך לא יבטיח
// התראה שאף שחקן לא יקבל.
//
// 3.9 — שתי אמיתות: הרשימה היא של המאמן (COACH_LOGS — כל הסגל, המשימה נרשמת
// על שורת הסגל), ולכן הניסוח הבסיסי הוא «רישום». מי שמחובר (תג «מחובר»)
// מקבל אותה גם על החשבון + התראה — וזה נאמר במסך האישור («נשלח ל-M מחוברים»).
// מצב הריק «אין שחקנים מחוברים» לא יכול להופיע יותר על סגל מלא.
const T = !COACH_LOGS ? {
  emptyTitle: () => L('אין עדיין שחקנים מחוברים', 'No connected players yet'),
  emptyText: () => L('שתפו את קוד ההצטרפות מ«הקבוצה שלי» — ברגע ששחקן מתחבר, אפשר לשלוח לו כאן.', 'Share the join code from “My team” — once a player connects, you can send to them here.'),
  emptyMini: () => L('אין שחקנים מחוברים עדיין — שתפו את קוד ההצטרפות מטאב "סגל".', 'No connected players yet — share the join code from the roster tab.'),
  what: () => L('מה שולחים?', 'What are you sending?'),
  whom: () => L('למי שולחים?', 'Send to whom?'),
  targetHintNum: () => L('השחקן ידווח התקדמות מול היעד — למשל 100 מתוך 200.', 'The player reports progress against the target — e.g. 100 of 200.'),
  targetHintTick: () => L('בלי מספר — השחקן פשוט יסמן «סיימתי».', 'Without a number the player just ticks “done”.'),
  repeatHint: () => L('אותה משימה תישלח לכל שבוע, עם תאריך יעד משלה', 'The task repeats weekly, each with its own due date'),
  notePh: () => L('הערה לשחקנים (לא חובה)', 'Note to players (optional)'),
  pick: () => L('בחרו מה לשלוח', 'Pick what to send'),
  sendN: (n) => L(`שלח ל-${n} שחקנים`, `Send to ${n} players`),
  sendBar: (n) => L(n === 1 ? 'שליחה לשחקן' : `שליחה ל-${n}`, n === 1 ? 'Send to 1 player' : `Send to ${n}`),
  // שורת הסיכום בסרגל השליחה — מנוסחת לפי הצד שפעיל
  sum: (n, tg, un) => L(
    `${cnt(n, 'מקבל אחד', 'מקבלים')} · ${Number(tg) > 0 ? `יעד ${tg} ${un || ''}`.trim() : 'סימון «סיימתי»'}`,
    `${n} recipients · ${Number(tg) > 0 ? `target ${tg} ${un || ''}`.trim() : 'a check'}`),
  sentTitle: (label) => L(`נשלח ל${label}`, `Sent to ${label}`),
  sentNext: () => L('השחקנים קיבלו התראה, וזה מופיע אצלם ב«המשימות שלי». ההתקדמות תופיע לך במעקב.', 'Your players got a notification, and it now shows under “My tasks”. Their progress appears in your tracking.'),
  again: () => L('שליחה נוספת', 'Send another'),
  sheetTitle: () => L('שליחה לשחקנים', 'Send to players'),
  toast: (label) => L(`נשלח ל-${label}`, `Sent to ${label}`),
  feedTitle: () => L('מה שלחתי לאחרונה', 'Recently sent'),
  feedEmpty: () => L('עוד לא שלחת תרגולים.', 'You haven’t sent any training yet.'),
  fail: () => L('השליחה נכשלה: ', 'Failed to send: '),
} : {
  emptyTitle: () => L('אין עדיין שחקנים בסגל', 'No players in the roster yet'),
  emptyText: () => L('הוסיפו שחקנים בטאב «סגל» של הקבוצה — ואז אפשר לרשום להם משימות כאן.', 'Add players in the team’s roster tab — then you can log tasks for them here.'),
  emptyMini: () => L('אין שחקנים בסגל עדיין — הוסיפו אותם בטאב "סגל".', 'No players in the roster yet — add them in the roster tab.'),
  what: () => L('מה המשימה?', 'What is the task?'),
  whom: () => L('למי?', 'For whom?'),
  targetHintNum: () => L('את ההתקדמות מול היעד תעדכן במעקב למטה — למשל 100 מתוך 200.', 'You update progress against the target in the tracking below — e.g. 100 of 200.'),
  targetHintTick: () => L('בלי מספר — תסמן «ביצע» אחרי שבדקת עם השחקן.', 'Without a number — tick “done” after checking with the player.'),
  repeatHint: () => L('אותה משימה תירשם לכל שבוע, עם תאריך יעד משלה', 'The task is logged weekly, each with its own due date'),
  notePh: () => L('הערה (לא חובה)', 'Note (optional)'),
  pick: () => L('כתבו את המשימה', 'Write the task'),
  sendN: (n) => L(`רישום ל-${n} שחקנים`, `Log for ${n} players`),
  sendBar: (n) => L(n === 1 ? 'רישום לשחקן' : `רישום ל-${n}`, n === 1 ? 'Log for 1 player' : `Log for ${n}`),
  // בצד המאמן בלבד אף אחד לא «מקבל» ואף אחד לא מסמן «סיימתי» — הרשימה
  // היא של המאמן, והוא זה שמסמן «ביצע».
  sum: (n, tg, un) => L(
    `${cnt(n, 'שחקן אחד', 'שחקנים')} · ${Number(tg) > 0 ? `יעד ${tg} ${un || ''}`.trim() : 'סימון «ביצע»'}`,
    `${n} players · ${Number(tg) > 0 ? `target ${tg} ${un || ''}`.trim() : 'a “done” tick'}`),
  sentTitle: (label) => L(`נרשם ל${label}`, `Logged for ${label}`),
  sentNext: () => L('המשימה שמורה ברשימה שלך. אחרי שתבדוק עם השחקן באימון — סמן «ביצע» במעקב למטה.', 'The task is saved to your list. After checking with the player at practice — tick “done” in the tracking below.'),
  again: () => L('משימה נוספת', 'Another task'),
  sheetTitle: () => L('משימה לשחקנים', 'Task for players'),
  toast: (label) => L(`נרשם ל-${label}`, `Logged for ${label}`),
  feedTitle: () => L('משימות אחרונות', 'Recent tasks'),
  feedEmpty: () => L('עוד לא רשמת משימות.', 'No tasks logged yet.'),
  fail: () => L('הרישום נכשל: ', 'Failed to log: '),
}

// «שלח לשחקנים» — פריט 4 במסמך המסירה.
//
// עד היום היו לזה **שתי דלתות שונות**: הטופס המלא (בתוך «הקבוצה שלי»)
// ובורר-בזק בכרטיס התרגיל ששלח מיד בלחיצה — בלי תאריך יעד, בלי לבקש
// משהו בחזרה ובלי אישור. המסמך מבקש מסך אחד שעונה על ארבע השאלות:
// **מה שולחים · למי · מה מבקשים בחזרה · עד מתי** — ואז מאשר מה קרה.
//
// **בקשת הבעלים (2.8): המסך הזה הוא מלל חופשי בלבד.** בורר המקורות
// (תרגיל / תוכנית / סרטון) הוסר — משימה נכתבת במילים, עם יעד מספרי
// אופציונלי ותאריך. שליחת תרגיל ממשיכה לעבוד מכרטיס התרגיל עצמו
// («לשחקנים»), שמגיע לכאן עם preset נעול.
//
// props:
//   embedded  - כרטיס קומפקטי בתוך מסך אחר
//   variant   - 'sheet' לפתיחה מעל מסך (מכרטיס התרגיל), אחרת מסך מלא
//   preset    - {kind,id,title,sub,url} תוכן נעול מראש (הגעת מכרטיס תרגיל)
//   onClose   - סגירת הגיליון

// תאריכי יעד מהירים — «עד מתי» בלחיצה אחת, בלי לפתוח לוח שנה
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
// תאריך בתצוגה ישראלית — הפיד מתחת מציג 5.8, והאישור הציג 2026-08-05
const ilDate = (str) => { if (!str) return ''; const d = new Date(str + 'T00:00'); return isNaN(d) ? str : d.toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' }) }
const endOfWeek = () => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return ymd(d) }

//   onSent    - נקרא אחרי רישום/שליחה שהצליחו (המסך שמסביב מרענן את המעקב)
export default function SendToPlayers({ session, embedded, initialTeam, variant, preset, onClose, onSent }) {
  const me = session.user.id
  const [roster, setRoster] = useState({ teams: [], players: [] })
  const [mode, setMode] = useState('team') // 'team' | 'players'
  const [team, setTeam] = useState('')
  const [picked, setPicked] = useState(new Set())
  const [pQuery, setPQuery] = useState('')

  // מלל חופשי הוא ברירת המחדל היחידה; preset (מכרטיס תרגיל) נשאר נעול
  const source = preset?.kind || 'task'
  const [taskTitle, setTaskTitle] = useState('')

  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [repeatWeeks, setRepeatWeeks] = useState(1) // א-2 — הקצאה חוזרת שבועית
  // 1.6 — בלי בורר סוגים: יעד מספרי אופציונלי. יש מספר → דיווח התקדמות;
  // אין מספר → השחקן פשוט מסמן «סיימתי».
  const [target, setTarget] = useState('')
  const [unit, setUnit] = useState('')
  // 18.8 — תוכנית: מה השחקנים יראו — רשימת התרגילים בלבד או הדף כולו
  const [planView, setPlanView] = useState('drills')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null) // אישור אחרי שליחה: {count, label}
  const [feed, setFeed] = useState(null)

  const refreshFeed = useCallback(async (r) => {
    setFeed(await loadSentFeed(me, r))
  }, [me])

  useEffect(() => {
    ;(async () => {
      const r = await loadRoster(me)
      setRoster(r)
      // בקבוצות שלי — הקבוצה הפעילה נבחרת מראש
      setTeam(initialTeam && r.teams.includes(initialTeam) ? initialTeam : (r.teams[0] || ''))
      if (!embedded && !variant) refreshFeed(r)
    })()
  }, [me, refreshFeed])

  const connectedInTeam = roster.players.filter((p) => p.team === team)
  const targetCount = mode === 'team' ? connectedInTeam.length : picked.size

  const lockedContent = preset || null
  const chosenItem = lockedContent
  const hasContent = source === 'task' ? taskTitle.trim().length > 0 : !!chosenItem
  const canSend = targetCount > 0 && hasContent && !sending

  const togglePick = (pid) => setPicked((cur) => { const n = new Set(cur); n.has(pid) ? n.delete(pid) : n.add(pid); return n })

  const buildContent = () => {
    if (source === 'task') return { kind: 'task', title: taskTitle.trim() }
    if (!chosenItem) return {}
    if (source === 'drill') return { kind: 'drill', drillId: chosenItem.id, title: chosenItem.title }
    if (source === 'plan') return { kind: 'plan', planId: chosenItem.id, title: chosenItem.title, planView }
    if (source === 'video') return { kind: 'video', videoUrl: chosenItem.url, title: chosenItem.title }
    return {}
  }

  const resetForm = () => {
    if (!preset) setTaskTitle('')
    setNote(''); setDueDate(''); setTarget(''); setUnit(''); setPicked(new Set())
  }

  const doSend = async () => {
    if (!canSend) return
    setSending(true)
    const res = await sendAssignments({
      coachId: me, mode, team,
      players: roster.players.filter((p) => picked.has(pickId(p))),
      content: buildContent(), note: note.trim(), dueDate: dueDate || null,
      target: Number(target) > 0 ? target : null, unit: Number(target) > 0 ? unit : '',
      repeatWeeks: dueDate ? repeatWeeks : 1,
    })
    setSending(false)
    if (!res.ok) { toast.error(T.fail() + res.error); return }
    if (res.warn) toast.error(res.warn)
    const label = mode === 'team' ? trTeam(team) : L(cnt(res.count, 'שחקן אחד', 'שחקנים'), `${res.count} players`)
    // אישור כמסך ולא כטוסט: השליחה היא סוף תהליך, וצריך לראות מה יצא
    // 3.9 — sentTo: כמה מחוברים קיבלו את המשימה גם על החשבון (0 = אף אחד; הרשימה אצלך)
    setSent({ count: res.count, sentTo: PLAYER_SIDE ? (res.sent || 0) : 0, label, title: buildContent().title, due: dueDate })
    resetForm()
    setRepeatWeeks(1)
    if (!embedded && !variant) refreshFeed(roster)
    if (embedded) toast.success(T.toast(label))
    onSent?.()
  }

  const noConnected = roster.players.length === 0
  // גיליון = דיאלוג: פוקוס נכנס פנימה, Tab לא בורח לרשת התרגילים מאחור,
  // ו-Escape סוגר. בלי זה aria-modal הוא הצהרה לא נכונה.
  const sheetRef = useFocusTrap(variant === 'sheet', onClose)

  // ---------- «יעד מספרי» (1.6 — בלי בורר סוגים) ----------
  // פונקציות שמחזירות JSX ולא רכיבים פנימיים: רכיב שנוצר מחדש בכל רינדור
  // מתחיל מאפס בכל הקלדה — והשדות היו מאבדים פוקוס אחרי כל תו.
  // יש מספר → דיווח התקדמות (100/200); אין → השחקן מסמן «סיימתי».
  const targetPicker = () => (
    <div className="sp-reply">
      <div className="sp-target-row">
        <input type="number" dir="ltr" min="1" className="finder-input sp-target-num" value={target}
          onChange={(e) => setTarget(e.target.value)} placeholder="200" aria-label={L('כמות יעד', 'Target amount')} />
        <input className="finder-input sp-target-unit" value={unit} onChange={(e) => setUnit(e.target.value)}
          placeholder={L('זריקות', 'shots')} maxLength={30} aria-label={L('יחידה', 'Unit')} />
      </div>
      <p className="muted small sp-target-hint">
        {Number(target) > 0 ? T.targetHintNum() : T.targetHintTick()}
      </p>
    </div>
  )

  // ---------- «עד מתי» ----------
  const duePicker = () => (
    <div className="sp-due">
      <div className="chips sp-due-chips">
        <button type="button" className={dueDate === plusDays(0) ? 'chip selected' : 'chip'} onClick={() => setDueDate(plusDays(0))}>{L('היום', 'Today')}</button>
        <button type="button" className={dueDate === plusDays(1) ? 'chip selected' : 'chip'} onClick={() => setDueDate(plusDays(1))}>{L('מחר', 'Tomorrow')}</button>
        <button type="button" className={dueDate === endOfWeek() ? 'chip selected' : 'chip'} onClick={() => setDueDate(endOfWeek())}>{L('סוף השבוע', 'End of week')}</button>
        {dueDate && <button type="button" className="link-button" onClick={() => setDueDate('')}>{L('בלי תאריך', 'No date')}</button>}
      </div>
      <input type="date" dir="ltr" className="finder-input sp-due-date" value={dueDate}
        onChange={(e) => setDueDate(e.target.value)} aria-label={L('תאריך יעד', 'Due date')} />
      {/* א-2 — חזרה שבועית: זמינה רק כשיש תאריך יעד */}
      {dueDate && (
        <div className="chips sp-repeat">
          {[[1, L('חד-פעמי', 'One-time')], [4, L('×4 שבועות', '×4 weeks')], [8, L('×8 שבועות', '×8 weeks')]].map(([n, lbl]) => (
            <button key={n} type="button" className={repeatWeeks === n ? 'chip selected' : 'chip'} onClick={() => setRepeatWeeks(n)}>
              {lbl}
            </button>
          ))}
          {repeatWeeks > 1 && <span className="muted small sp-repeat-hint">{T.repeatHint()}</span>}
        </div>
      )}
    </div>
  )

  // ---------- אישור ----------
  const sentPanel = () => (
    <div className="sp-sent-ok" role="status">
      <span className="sp-sent-ic"><CheckCheck size={34} /></span>
      <h2 className="sp-sent-title">
        {COACH_LOGS && PLAYER_SIDE
          /* 3.9 — «נרשם ל-N · נשלח ל-M מחוברים»: בלי חשבון לא מגיע כלום, הרשימה אצל המאמן */
          ? L(`נרשם ל-${sent.count} · נשלח ל-${sent.sentTo} מחוברים`, `Logged for ${sent.count} · sent to ${sent.sentTo} connected`)
          : T.sentTitle(sent.label)}
      </h2>
      <p className="muted">{sent.title}{sent.due ? L(` · עד ${ilDate(sent.due)}`, ` · by ${ilDate(sent.due)}`) : ''}</p>
      <p className="sp-sent-next muted small">
        {T.sentNext()}
        {COACH_LOGS && PLAYER_SIDE && sent.sentTo > 0 && ' ' + L('שחקנים מחוברים קיבלו התראה ורואים את המשימה אצלם ב«המשימות שלי».', 'Connected players got a notification and see the task under “My tasks”.')}
      </p>
      <div className="sp-sent-acts">
        <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={() => { setSent(null); onClose ? onClose() : null }}>
          {onClose ? L('סגירה', 'Close') : L('סיימתי', 'Done')}
        </button>
        <button type="button" className="btn-soft" style={{ marginTop: 0 }} onClick={() => setSent(null)}>
          <Repeat2 size={16} /> {T.again()}
        </button>
      </div>
    </div>
  )

  // ================= מצב מוטמע (בתוך «הקבוצה שלי») =================
  if (embedded) {
    if (sent) return <div className="sp-mini">{sentPanel()}</div>
    return (
      <div className="sp-mini">
        {noConnected ? (
          <p className="muted small">{T.emptyMini()}</p>
        ) : (
          <>
            {/* מלל חופשי בלבד (בקשת הבעלים) */}
            <span className="sp-lbl">{L('מה המשימה?', 'The task')}</span>
            <input className="finder-input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={L('לדוגמה: 100 זריקות עונשין', 'e.g. 100 free throws')} maxLength={120} />

            <div className="sp-mini-who">
              <button className={mode === 'team' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setMode('team')}><Users size={14} /> {L(`כל הקבוצה (${connectedInTeam.length})`, `Whole team (${connectedInTeam.length})`)}</button>
              <button className={mode === 'players' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setMode('players')}><User size={14} /> {L('שחקנים מסוימים', 'Specific players')}</button>
            </div>

            {mode === 'players' && (
              <ul className="sp-players sp-items-mini">
                {roster.players.filter((p) => p.team === team).map((p) => (
                  <li key={pickId(p)}>
                    <button className={picked.has(pickId(p)) ? 'sp-player on' : 'sp-player'} onClick={() => togglePick(pickId(p))}>
                      <span className="sp-check">{picked.has(pickId(p)) ? <Check size={14} /> : null}</span>
                      {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={28} />}
                      <span className="sp-player-name">{p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <span className="sp-lbl">{L('יעד מספרי (לא חובה)', 'Numeric target (optional)')}</span>
            {targetPicker()}
            <span className="sp-lbl">{L('עד מתי', 'By when')}</span>
            {duePicker()}
            <input className="finder-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('הערה (לא חובה)', 'Note (optional)')} maxLength={400} />

            <button className="btn-primary sp-send" onClick={doSend} disabled={!canSend} aria-busy={sending}>
              {sending && <span className="btn-spinner" aria-hidden="true" />}
              <Send size={17} /> {targetCount > 0 ? T.sendN(targetCount) : T.pick()}
            </button>
          </>
        )}
      </div>
    )
  }

  // ================= מסך מלא / גיליון מעל מסך =================
  const isSheet = variant === 'sheet'
  const body = (
    <>
      {noConnected ? (
        <div className="empty-state">
          <span className="empty-ic"><Users size={26} /></span>
          <div className="empty-title">{T.emptyTitle()}</div>
          <p className="muted small">{T.emptyText()}</p>
        </div>
      ) : sent ? (
        sentPanel()
      ) : (
        <>
          {/* 1 — מה שולחים */}
          <section className="sp-card">
            <h3 className="sp-h3"><Send size={16} /> {T.what()}</h3>

            {lockedContent ? (
              <>
                <div className="sp-locked">
                  <span className="sp-locked-ic">{source === 'plan' ? <BookOpen size={17} /> : <Dumbbell size={17} />}</span>
                  <span className="sp-locked-tx">
                    <strong>{lockedContent.title}</strong>
                    {lockedContent.sub && <span className="muted small">{lockedContent.sub}</span>}
                  </span>
                </div>
                {/* 18.8 — תוכנית מהמחברת: המאמן בוחר בכל שליחה מה השחקנים יראו
                    (צד שחקן פתוח בלבד — בלי שחקנים אין מה לבחור) */}
                {PLAYER_SIDE && source === 'plan' && (
                  <div className="sp-plan-view">
                    <span className="muted small">{L('מה השחקנים יראו?', 'What will the players see?')}</span>
                    <div className="sp-seg">
                      <button type="button" className={planView === 'drills' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setPlanView('drills')}>
                        {L('רשימת התרגילים בלבד', 'Drills list only')}
                      </button>
                      <button type="button" className={planView === 'page' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setPlanView('page')}>
                        {L('הדף כולו', 'The whole page')}
                      </button>
                    </div>
                    <p className="muted small sp-target-hint">
                      {planView === 'page'
                        ? L('השחקנים יראו את דף המחברת — הטקסט, כתב היד והמגרשים. הנוכחות לא נשלחת.', 'Players will see the notebook page — text, handwriting and courts. Attendance is not sent.')
                        : L('השחקנים יראו רק את התרגילים מהספרייה שבתוכנית (שם + תוכן).', 'Players will see only the library drills in the plan (name + content).')}
                    </p>
                  </div>
                )}
              </>
            ) : (
              /* מלל חופשי בלבד — בלי בורר תרגיל/תוכנית/סרטון (בקשת הבעלים) */
              <input className="finder-input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={L('לדוגמה: 100 זריקות עונשין', 'e.g. 100 free throws')} maxLength={120} />
            )}
          </section>

          {/* 2 — למי */}
          <section className="sp-card">
            <h3 className="sp-h3"><Users size={16} /> {T.whom()}</h3>
            <div className="sp-seg">
              <button className={mode === 'team' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setMode('team')}><Users size={15} /> {L('כל הקבוצה', 'Whole team')}</button>
              <button className={mode === 'players' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setMode('players')}><User size={15} /> {L('שחקנים ספציפיים', 'Specific players')}</button>
            </div>

            {mode === 'team' ? (
              <div className="chips sp-chips">
                {roster.teams.map((tm) => (
                  <button key={tm} className={team === tm ? 'chip selected' : 'chip'} onClick={() => setTeam(tm)}>
                    {trTeam(tm)} · {roster.players.filter((p) => p.team === tm).length}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="sp-search"><Search size={15} /><input className="finder-input" value={pQuery} onChange={(e) => setPQuery(e.target.value)} placeholder={L('חיפוש שחקן...', 'Search player...')} /></div>
                <ul className="sp-players">
                  {roster.players.filter((p) => !pQuery || p.name?.includes(pQuery)).map((p) => (
                    <li key={pickId(p)}>
                      <button className={picked.has(pickId(p)) ? 'sp-player on' : 'sp-player'} onClick={() => togglePick(pickId(p))}>
                        <span className="sp-check">{picked.has(pickId(p)) ? <Check size={14} /> : null}</span>
                        {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={30} />}
                        <span className="sp-player-name">{p.name}</span>
                        {/* 3.9 — מי שיש לו חשבון יקבל את המשימה גם אצלו + התראה */}
                        {PLAYER_SIDE && p.linked && <span className="mini-tag">{L('מחובר', 'Connected')}</span>}
                        <span className="muted small">{trTeam(p.team)}{p.position ? ` · ${p.position}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* 3 — יעד מספרי (1.6 — בלי בורר סוגים) */}
          <section className="sp-card">
            <h3 className="sp-h3"><Hash size={16} /> {L('יעד מספרי? (לא חובה)', 'Numeric target? (optional)')}</h3>
            {targetPicker()}
          </section>

          {/* 4 — עד מתי + הערה */}
          <section className="sp-card">
            <h3 className="sp-h3"><CalendarDays size={16} /> {L('עד מתי?', 'By when?')}</h3>
            {duePicker()}
            <textarea className="finder-input sp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.notePh()} rows={2} maxLength={400} />
          </section>
        </>
      )}
    </>
  )

  const sendBar = !noConnected && !sent && (
    <div className="sp-bar">
      <span className="sp-bar-sum">
        {hasContent ? T.sum(targetCount, target, unit) : T.pick()}
      </span>
      <button className="btn-primary sp-send" onClick={doSend} disabled={!canSend} aria-busy={sending}>
        {sending && <span className="btn-spinner" aria-hidden="true" />}
        <Send size={17} /> {T.sendBar(targetCount)}
      </button>
    </div>
  )

  if (isSheet) {
    return (
      /* לחיצה על הרקע הכהה סוגרת, בדיוק כמו במודאל שהוחלף כאן.
         Escape ומלכודת הפוקוס מגיעים מ-useFocusTrap על הגיליון עצמו. */
      <div className="sp-sheet-wrap" onClick={onClose}>
        <div className="sp-sheet" ref={sheetRef} role="dialog" aria-modal="true"
          aria-label={T.sheetTitle()} onClick={(e) => e.stopPropagation()}>
          <header className="sp-sheet-head">
            <button type="button" className="icon-btn" onClick={onClose} aria-label={L('סגירה', 'Close')}><X size={19} /></button>
            <h2>{T.sheetTitle()}</h2>
          </header>
          <div className="sp-sheet-body">{body}</div>
          {sendBar}
        </div>
      </div>
    )
  }

  return (
    <div className="sp-page">
      {body}
      {sendBar}

      {/* מה שלחתי לאחרונה */}
      <section className="sp-card sp-feed">
        <h3 className="sp-h3"><Inbox size={16} /> {T.feedTitle()}</h3>
        {feed === null ? (
          <SkeletonCards count={2} lines={1} />
        ) : feed.length === 0 ? (
          <p className="muted small">{T.feedEmpty()}</p>
        ) : (
          <ul className="sp-sent">
            {feed.map((f) => {
              const pct = f.total > 0 ? Math.round((f.done / f.total) * 100) : 0
              return (
                <li key={f.id} className="sp-sent-item">
                  <div className="sp-sent-main">
                    <strong>{f.title}</strong>
                    <span className="muted small">
                      {(f.player_id || f.roster_id) ? L('לשחקן', 'To a player') : `${trTeam(f.team)}`}
                      {f.due_date ? ` · ${L('עד', 'by')} ${new Date(f.due_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}` : ''}
                    </span>
                  </div>
                  <span className={pct >= 100 ? 'sp-ratio done' : 'sp-ratio'}>
                    {(f.player_id || f.roster_id) ? (f.done > 0 ? L('בוצע ✓', 'Done ✓') : L('ממתין', 'Pending')) : `${f.done}/${f.total} ✓`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
