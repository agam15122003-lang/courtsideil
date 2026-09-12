import { useState, useEffect, useCallback } from 'react'
import { Dumbbell, ChevronDown, Check, Clock, Inbox, BellRing, Archive, X } from 'lucide-react'
import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import { toast } from './toast'
import { L } from './i18n'
import { PLAYER_SIDE, COACH_LOGS } from './flags'
import Avatar from './Avatar'
import { SkeletonCards } from './Skeleton'
import { ErrorState } from './states'

const taPad = (n) => String(n).padStart(2, '0')
const taToday = () => { const d = new Date(); return `${d.getFullYear()}-${taPad(d.getMonth() + 1)}-${taPad(d.getDate())}` }

// ===== צד המאמן בלבד (22.8) =====
// עם צד שחקן פתוח: «מה נשלח ומי ביצע» — השחקן מסמן, המאמן רואה.
// בלי צד שחקן: אותה רשימה, אבל המאמן הוא שמסמן «ביצע» (אחרי שבדק עם
// השחקן באימון) — ב-assignment_coach_marks, על שורת הסגל (roster_id).
// מפתח השחקן בכל המפות: חשבון (player_id) בצד שחקן, שורת סגל (id) בצד מאמן.
//
// 3.9 — שתי אמיתות: המאמן מסמן «ביצע» תמיד על שורת הסגל (COACH_LOGS,
// assignment_coach_marks), וגם כשצד השחקן פתוח. «ביצעתי» של שחקן מחובר
// (assignment_completions, לפי player_id) ממופה לשורת הסגל שלו ומאוחד —
// כל אחד מהם מספיק כדי שהשורה תיחשב «בוצע», ותג קטן אומר מי סימן.
const COACH_MODE = COACH_LOGS
const keyOf = (p) => (COACH_MODE ? p.id : p.player_id)
const notDeployed = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(e.message || ''))
// 12.9 — עמודה חסרה (מסד שטרם הריץ מיגרציה) — 42703 בפוסטגרס, PGRST204 ב-PostgREST
const colMissing = (e) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(e.message || ''))

// «מה נשלח ומי ביצע» (מסמך ההשקה 1.6) — רק משימות פעילות; ארכוב אוטומטי
// כשעבר התאריך או שכולם סיימו, סגירה ידנית של המאמן, ומסך «ארכיון משימות».
export default function TeamAssignments({ coachId, team }) {
  const [roster, setRoster] = useState([])
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [reminding, setReminding] = useState(null)
  const [view, setView] = useState('active') // 'active' | 'archive'
  const [marksMissing, setMarksMissing] = useState(false) // הטבלה של 22.8 עוד לא קיימת
  const [progDraft, setProgDraft] = useState({}) // {`${assignmentId}:${rosterId}`: '120'}

  const load = useCallback(async () => {
    const { data: rp } = await supabase
      .from('team_players')
      .select('id, name, number, player_id')
      .eq('coach_id', coachId).eq('team', team).order('number')
    // צד שחקן: מחוברים בלבד. צד מאמן (3.9 — תמיד): כל הסגל.
    const players = COACH_MODE ? (rp || []) : (rp || []).filter((p) => p.player_id)
    setRoster(players)
    const authIds = new Set(players.map((p) => p.player_id).filter(Boolean))
    const rosterIds = new Set(players.map((p) => p.id))
    // חשבון → שורת סגל (3.9): «ביצעתי» של שחקן מחובר נספר על השורה שלו
    const rosterOfAuth = new Map(players.filter((p) => p.player_id).map((p) => [p.player_id, p.id]))

    // 12.9 — עד היום נשלפו 80 השורות האחרונות של **כל** הקבוצות של המאמן, ורק
    // אחר כך סוננה הקבוצה הפתוחה. מאמן עם שלוש קבוצות שרושם משימות יומיות ממצה
    // את 80 השורות תוך שבועיים — והמשימות הישנות של הקבוצה הזו פשוט נעלמו:
    // מהרשימה, מהארכיון, ומשורת «ביצוע כולל» (שספרה אחוז מתוך סך חלקי, כלומר
    // מספר לא נכון). הסינון עובר לשאילתה עצמה, ורק אז מוגבל ל-80.
    // שלוש שאילתות eq/in במקום .or עם שרשור מחרוזות — שם קבוצה עם פסיק או
    // סוגריים («נערים א' (בנים)») שובר את תחביר PostgREST (הלקח מ-playerReport.js).
    const asgSel = '*, drill:drills(title), plan:training_plans(name)'
    const asgQ = () => supabase.from('player_assignments').select(asgSel)
      .eq('coach_id', coachId).order('created_at', { ascending: false }).limit(80)
    const authList = [...authIds]
    const rosterList = [...rosterIds]
    const [byTeam, byAuth, byRoster] = await Promise.all([
      asgQ().eq('team', team),
      authList.length ? asgQ().in('player_id', authList) : Promise.resolve({ data: [], error: null }),
      rosterList.length ? asgQ().in('roster_id', rosterList) : Promise.resolve({ data: [], error: null }),
    ])
    // מסד שטרם הריץ את 22.8 — אין עמודת roster_id: ממשיכים עם שתי השאילתות האחרות
    const rosterErr = byRoster.error && !colMissing(byRoster.error) ? byRoster.error : null
    const asgErr = byTeam.error || byAuth.error || rosterErr
    // כשל שליפה אינו «אין מטלות»: בלי ההפרדה הזו תקלת רשת הציגה בדיוק
    // את מצב הריק «עדיין לא שלחת מטלות לקבוצה הזו».
    if (asgErr) { setFailed(true); setItems([]); return }
    setFailed(false)
    const seenAsg = new Set()
    const mine = []
    for (const a of [...(byTeam.data || []), ...(byAuth.data || []), ...(byRoster.data || [])]) {
      if (seenAsg.has(a.id)) continue
      seenAsg.add(a.id)
      mine.push(a)
    }
    mine.sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')))
    if (mine.length === 0) { setItems([]); return }

    // בוצע = done_at מלא; שורה בלי done_at = התקדמות חלקית. fallback אם המיגרציה טרם רצה.
    let compl = []
    if (COACH_MODE) {
      const ids = mine.map((a) => a.id)
      const { data, error } = await supabase
        .from('assignment_coach_marks')
        .select('assignment_id, roster_id, done_at, progress_value')
        .in('assignment_id', ids)
      // 12.9 — הפרט הטכני (שם המיגרציה) לקונסול; למסך נשאר נוסח בלי SQL
      if (error && notDeployed(error)) console.error('TeamAssignments: סימוני «ביצע» דורשים את supabase_coach_only_22_8.sql')
      setMarksMissing(!!error && notDeployed(error))
      compl = (data || []).map((c) => ({ ...c, who: c.roster_id, by: 'coach' }))
      // 3.9 — שתי אמיתות: גם «ביצעתי» שסימן שחקן מחובר (player_id → שורת הסגל).
      // הטבלה/העמודה עשויות להיות חסרות — שקט, נשארים עם סימוני המאמן.
      if (PLAYER_SIDE && rosterOfAuth.size > 0) {
        let { data: pc, error: pcErr } = await supabase
          .from('assignment_completions')
          .select('assignment_id, player_id, done_at, progress_value')
          .in('assignment_id', ids)
        if (pcErr) {
          const legacy = await supabase.from('assignment_completions').select('assignment_id, player_id, done_at').in('assignment_id', ids)
          pc = (legacy.data || []).map((c) => ({ ...c, progress_value: 0 }))
        }
        for (const c of pc || []) {
          const rid = rosterOfAuth.get(c.player_id)
          if (rid) compl.push({ ...c, who: rid, by: 'player' })
        }
      }
    } else {
      let { data, error } = await supabase
        .from('assignment_completions')
        .select('assignment_id, player_id, done_at, progress_value')
        .in('assignment_id', mine.map((a) => a.id))
      if (error) {
        const legacy = await supabase.from('assignment_completions')
          .select('assignment_id, player_id, done_at').in('assignment_id', mine.map((a) => a.id))
        data = (legacy.data || []).map((c) => ({ ...c, progress_value: 0 }))
      }
      compl = (data || []).map((c) => ({ ...c, who: c.player_id }))
    }
    const doneBy = {}
    const progBy = {} // assignment_id -> { who: progress_value }
    const whoBy = {}  // assignment_id -> { who: Set('coach'|'player') } — מי סימן «ביצע» (3.9)
    // 6.9 — assignment_id -> Set(who): שורת סימון של המאמן שאומרת «לא ביצע».
    // זו הדרך היחידה של המאמן לחלוק על «ביצעתי» שהילד סימן בטלפון.
    // ⚠ done_at ריק לבדו **אינו** שלילה: לפי הכלל שנקבע עם הטבלה
    // (supabase_coach_only_22_8.sql) done_at ריק + progress_value > 0 = «בתהליך»,
    // וזו בדיוק השורה ש-writeMark כותב כשהמאמן מקליד התקדמות חלקית ליעד
    // מספרי. שלילה = done_at ריק **וגם** בלי התקדמות.
    const deniedBy = {}
    for (const c of compl) {
      if (c.done_at) {
        ;(doneBy[c.assignment_id] = doneBy[c.assignment_id] || new Set()).add(c.who)
        if (c.by) {
          const w = (whoBy[c.assignment_id] = whoBy[c.assignment_id] || {})
          ;(w[c.who] = w[c.who] || new Set()).add(c.by)
        }
      } else if (c.by === 'coach' && !(Number(c.progress_value) > 0)) {
        ;(deniedBy[c.assignment_id] = deniedBy[c.assignment_id] || new Set()).add(c.who)
      }
      // התקדמות: כשיש שני ערכים לאותה שורה — הגבוה מביניהם
      if (Number(c.progress_value) > 0) {
        const cur = (progBy[c.assignment_id] = progBy[c.assignment_id] || {})[c.who] || 0
        progBy[c.assignment_id][c.who] = Math.max(cur, Number(c.progress_value))
      }
    }

    const rows = mine.map((a) => {
      const title = a.drill?.title || a.plan?.name || a.title || (a.video_url ? L('סרטון', 'Video') : L('משימה', 'Task'))
      // 3.9 — שורת הסגל קודמת לחשבון: מ-3.9 משימה אישית נושאת את שני המזהים,
      // ואם החשבון נותק/הוחלף בינתיים — הסינון לפי player_id מוצא אף אחד
      // והמשימה מוצגת 0/0. השורה בסגל שרירה תמיד (כמו ב-CoachTodo).
      const targets = a.roster_id
        ? players.filter((p) => p.id === a.roster_id)
        : a.player_id
          ? players.filter((p) => p.player_id === a.player_id)
          : players
      const who = whoBy[a.id] || {}
      const denied = deniedBy[a.id] || new Set()
      // 6.9 — סימון «לא ביצע» של המאמן גובר על «ביצעתי» של הילד
      const doneSet = new Set([...(doneBy[a.id] || [])].filter((k) => !denied.has(k)))
      return {
        ...a, title, targets, doneSet, denied, who, prog: progBy[a.id] || {},
        done: targets.filter((p) => doneSet.has(keyOf(p))).length,
        // כמה מהם **המאמן** סימן — זה מה שסוגר משימה (ראו הארכוב למטה)
        doneCoach: targets.filter((p) => (who[keyOf(p)] || new Set()).has('coach')).length,
        total: targets.length,
      }
    })

    // 1.6 — ארכוב אוטומטי: כשכל המקבלים סומנו «ביצע».
    // ⚠ בצד המאמן בלבד אין ארכוב לפי תאריך היעד: המאמן הוא שמסמן «ביצע»,
    //   והוא עושה את זה באימון הבא — כלומר אחרי שהתאריך כבר עבר. ארכוב
    //   בתאריך היה מעלים את המשימה מהטאב הפעיל לפני שהספיק לסמן. סגירה
    //   לפי תאריך נשארת בידיו, בכפתור «סגירה וארכוב».
    // הכתיבה סובלנית — אם עמודת status (supabase_tasks_launch.sql) טרם
    // נוספה, הסינון פשוט לא ישרוד רענון, והמסך ממשיך לעבוד.
    const todayStr = taToday()
    // 6.9 — בצד המאמן משימה נסגרת רק כשהמאמן עצמו סימן «ביצע» לכולם.
    // קודם «ביצעתי» שילד סימן בטלפון ארכב את המשימה לבד — והיא נעלמה
    // מ«פעילות» לפני שהמאמן בכלל הספיק לראות אותה.
    const toArchive = rows.filter((a) =>
      (a.status || 'active') === 'active' &&
      ((!COACH_MODE && a.due_date && a.due_date < todayStr) ||
        (a.total > 0 && (COACH_MODE ? a.doneCoach >= a.total : a.done >= a.total))))
    if (toArchive.length > 0) {
      supabase.from('player_assignments').update({ status: 'archived' })
        .in('id', toArchive.map((a) => a.id)).then(() => {})
      const ids = new Set(toArchive.map((a) => a.id))
      setItems(rows.map((a) => (ids.has(a.id) ? { ...a, status: 'archived', autoArchived: true } : a)))
    } else {
      setItems(rows)
    }
  }, [coachId, team])

  useEffect(() => { load() }, [load])

  // א-1 — תזכורת לכל מי שטרם ביצע, באותו מנגנון של אישורי ההגעה
  const remindPending = async (a) => {
    setReminding(a.id)
    // 3.9 — תזכורת רק למי שיש לו חשבון; שורת סגל בלי חשבון אין למי להודיע
    const pending = a.targets.filter((p) => p.player_id && !a.doneSet.has(keyOf(p)))
    await Promise.all(pending.map((p) => sendNotification({
      to: p.player_id,
      actor: coachId,
      type: 'event',
      content: L('תזכורת מהמאמן: «' + a.title + '» עוד מחכה לך', 'Coach reminder: "' + a.title + '" is still waiting'),
      nav: 'drills',
    })))
    setReminding(null)
    toast.success(L('התזכורת נשלחה', 'Reminder sent'))
  }

  // צד המאמן בלבד — סימון «ביצע» / התקדמות לשחקן, בשם המאמן
  const writeMark = async (a, p, { done, progress }) => {
    const target = Number(a.target_value) || 0
    // 6.9 — «לא ביצע» מפורש (done === false) מאפס גם את ההתקדמות. בלי זה
    // שורת השלילה הייתה נושאת את ההתקדמות שהילד רשם, ואי אפשר היה להבדיל
    // בינה לבין שורת «בתהליך» — שתיהן עם done_at ריק (ראו deniedBy למעלה).
    const prog = progress != null ? Math.max(0, progress) : (done ? target : 0)
    const isDone = done != null ? done : (target > 0 && prog >= target)
    const { error } = await supabase.from('assignment_coach_marks').upsert({
      assignment_id: a.id, roster_id: p.id, coach_id: coachId,
      done_at: isDone ? new Date().toISOString() : null,
      progress_value: isDone && target ? target : prog,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'assignment_id,roster_id' })
    if (error) {
      // 12.9 — שם קובץ המיגרציה הוא מידע לבעלים בלבד: PILOT_COACHES ריק, כלומר
      // כל מאמן יכול להיכנס, ומאמן שאינו הבעלים לא יכול «להריץ SQL בסופאבייס» —
      // בשבילו זו הודעה חסומה בלי מוצא. הפרט הטכני יורד לקונסול.
      console.error(notDeployed(error)
        ? 'TeamAssignments: סימון «ביצע» דורש את supabase_coach_only_22_8.sql'
        : `TeamAssignments.writeMark: ${error.message || error}`)
      toast.error(notDeployed(error)
        ? L('סימון «ביצע» עדיין לא פעיל בשרת — המשימות עצמן נשמרות. נסו שוב מאוחר יותר.',
            'Marking “done” is not active on the server yet — the tasks themselves are saved. Try again later.')
        : L('הסימון נכשל — נסה שוב', 'Failed to mark — try again'))
      return
    }
    // ביטול סימון של משימה שכבר בארכיון מחזיר אותה לפעילה: סימון בטעות של
    // המקבל האחרון ארכב אותה מיד, ובלי זה לא הייתה דרך חזרה.
    if (!isDone && (a.status || 'active') === 'archived') {
      const { error: unErr } = await supabase.from('player_assignments').update({ status: 'active' }).eq('id', a.id)
      if (unErr) toast.error(L('הסימון בוטל, אבל החזרת המשימה לפעילות נכשלה', 'The mark was cleared, but restoring the task to active failed'))
      else if (view === 'archive') toast.success(L('המשימה חזרה לרשימת המשימות הפעילות', 'The task is back in the active list'))
    }
    load()
  }

  if (items === null) return <SkeletonCards count={3} lines={2} />
  if (failed) return <ErrorState compact message={L('לא הצלחנו לטעון את המשימות של הקבוצה.', "We couldn't load this team's tasks.")} onRetry={load} />

  const activeItems = items.filter((a) => (a.status || 'active') !== 'archived')
  const archivedItems = items.filter((a) => (a.status || 'active') === 'archived')
  const shown = view === 'archive' ? archivedItems : activeItems

  // שורת הסיכום: כמה מהמשימות הפעילות בוצעו בסך הכול
  const open = activeItems.filter((a) => a.total > 0)
  const doneAll = open.reduce((s, a) => s + a.done, 0)
  const totalAll = open.reduce((s, a) => s + a.total, 0)
  const pctAll = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0

  return (
    <div className="team-section">
      <h3 className="ta-title" style={{ marginTop: 18 }}><Dumbbell size={16} /> {COACH_MODE ? L('המשימות ומי ביצע', 'Tasks & done') : L('מה נשלח ומי ביצע', 'Sent & done')}</h3>
      {COACH_MODE && marksMissing && (
        /* 12.9 — בלי שם קובץ SQL: מאמן שאינו הבעלים לא יכול להריץ מיגרציה,
           והפרט הטכני נרשם לקונסול בזמן הזיהוי (ראו load). */
        <p className="alert alert-error" style={{ marginBlockEnd: 10 }}>
          {L('סימון «ביצע» לשחקן עדיין לא פעיל בשרת. המשימות עצמן נשמרות ונשלחות כרגיל.',
             'Marking “done” per player is not active on the server yet. The tasks themselves are saved and sent as usual.')}
        </p>
      )}
      <div className="tabs ta-views">
        <button type="button" className={view === 'active' ? 'tab active' : 'tab'} onClick={() => setView('active')}>
          {L('פעילות', 'Active')}{activeItems.length > 0 && <> · <bdi dir="ltr">{activeItems.length}</bdi></>}
        </button>
        <button type="button" className={view === 'archive' ? 'tab active' : 'tab'} onClick={() => setView('archive')}>
          <Archive size={13} /> {L('ארכיון משימות', 'Task archive')}{archivedItems.length > 0 && <> · <bdi dir="ltr">{archivedItems.length}</bdi></>}
        </button>
      </div>
      {view === 'active' && totalAll > 0 && (
        <div className="ta-summary">
          <span className="ta-summary-pct" dir="ltr">{pctAll}%</span>
          <span className="ta-summary-tx">
            {COACH_MODE
              ? L(`ביצוע כולל — ${doneAll} מתוך ${totalAll} סומנו «ביצע»`, `Overall completion — ${doneAll} of ${totalAll} marked done`)
              : L(`ביצוע כולל — ${doneAll} מתוך ${totalAll} שיגורים הושלמו`, `Overall completion — ${doneAll} of ${totalAll} deliveries done`)}
          </span>
          <span className="ta-summary-bar" aria-hidden="true"><i style={{ width: `${pctAll}%` }} /></span>
        </div>
      )}
      {shown.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><Inbox size={26} /></span>
          <div className="empty-title">
            {view === 'archive' ? L('הארכיון ריק', 'The archive is empty') : L('אין משימות פעילות לקבוצה הזו', 'No active tasks for this team')}
          </div>
          <p className="muted small">
            {view === 'archive'
              ? L('משימות שנסגרו — אוטומטית או על ידך — יופיעו כאן.', 'Closed tasks — automatic or manual — show up here.')
              : COACH_MODE
                ? L('כתוב משימה למעלה — המעקב יופיע כאן.', 'Write a task above — tracking shows up here.')
                : L('בחר תרגיל למעלה ושלח — המעקב יופיע כאן.', 'Pick a drill above and send — tracking shows up here.')}
          </p>
        </div>
      ) : (
        <ul className="ta-list">
          {shown.map((a) => {
            const pct = a.total > 0 ? Math.round((a.done / a.total) * 100) : 0
            const isOpen = openId === a.id
            return (
              <li key={a.id} className="ta-item">
                <button className="ta-head" onClick={() => setOpenId(isOpen ? null : a.id)} aria-expanded={isOpen}>
                  <div className="ta-head-main">
                    <strong>{a.title}</strong>
                    <span className="muted small">
                      {(a.player_id || a.roster_id) ? L('אישי', 'Individual') : L('לכל הקבוצה', 'Whole team')}
                      {a.due_date ? ` · ${L('עד', 'by')} ${new Date(a.due_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}` : ''}
                    </span>
                  </div>
                  <span className={pct >= 100 ? 'ta-ratio done' : 'ta-ratio'}>{a.done}/{a.total} ✓</span>
                  <ChevronDown size={16} className={isOpen ? 'ta-chev open' : 'ta-chev'} />
                </button>
                {isOpen && view === 'active' && (
                  <div className="ta-item-acts">
                    {/* תזכורת — רק כשיש למי להודיע (צד שחקן פתוח) */}
                    {/* 3.9 — רק למי שיש חשבון שיקבל את ההתראה */}
                    {PLAYER_SIDE && a.targets.some((p) => p.player_id && !a.doneSet.has(keyOf(p))) && (
                      <button
                        type="button"
                        className="btn-soft ta-remind"
                        disabled={reminding === a.id}
                        onClick={() => remindPending(a)}
                      >
                        <BellRing size={14} aria-hidden="true" />
                        {reminding === a.id
                          ? L('שולח...', 'Sending...')
                          : <>{L('תזכורת ל-', 'Remind ')}<bdi dir="ltr">{a.targets.filter((p) => p.player_id && !a.doneSet.has(keyOf(p))).length}</bdi> {L('מחוברים שטרם ביצעו', 'connected pending')}</>}
                      </button>
                    )}
                    {/* 1.6 — סגירה ידנית של המאמן */}
                    <button type="button" className="btn-ghost ta-archive" onClick={() => archiveNow(a)}>
                      <Archive size={14} aria-hidden="true" /> {L('סגירה וארכוב', 'Close & archive')}
                    </button>
                  </div>
                )}
                {isOpen && (
                  <ul className="ta-players">
                    {a.targets.length === 0 ? (
                      <li className="muted small" style={{ padding: '6px 4px' }}>{COACH_MODE ? L('אין שחקנים ליעד הזה.', 'No players for this target.') : L('אין שחקנים מחוברים ליעד הזה.', 'No connected players for this target.')}</li>
                    ) : a.targets.map((p) => {
                      const k = keyOf(p)
                      const done = a.doneSet.has(k)
                      // 3.9 — מי סימן: המאמן («סימנת»), השחקן («סימן בעצמו»), או שניהם
                      const who = a.who[k] || new Set()
                      // 6.9 — המאמן סימן במפורש «לא ביצע» על מה שהילד סימן
                      const denied = (a.denied || new Set()).has(k)
                      const prog = done && a.target_value ? Number(a.target_value) : (a.prog[k] || 0)
                      const ppct = a.target_value ? Math.min(100, Math.round((prog / Number(a.target_value)) * 100)) : (done ? 100 : 0)
                      const dk = `${a.id}:${p.id}`
                      return (
                        <li key={p.id} className="ta-player">
                          {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={28} />}
                          <span className="ta-player-name">{p.name}</span>
                          {/* 6.9 — התג מוצג גם אחרי ביטול: הילד עדיין סימן «ביצעתי», וזה נאמר */}
                          {COACH_MODE && who.size > 0 && (
                            <span className="mini-tag" title={L('מי סימן «ביצע»', 'Who marked done')}>
                              {denied && who.has('player')
                                ? L('סימן בעצמו · ביטלת', 'He marked · you cleared')
                                : who.has('coach') && who.has('player')
                                  ? L('סימנת · סימן בעצמו', 'You · himself')
                                  : who.has('player') ? L('סימן בעצמו', 'Marked himself') : L('סימנת', 'You marked')}
                            </span>
                          )}
                          {/* 1.6 — פס התקדמות ליעד מספרי, וי לסיום */}
                          {a.target_value ? (
                            <span className="ta-pwrap">
                              <span className="ta-pbar" aria-hidden="true"><i className={done ? 'done' : ''} style={{ width: `${ppct}%` }} /></span>
                              {COACH_MODE && view === 'active' && !done ? (
                                /* המאמן מעדכן את ההתקדמות בעצמו — Enter או יציאה מהשדה שומרים */
                                <input className="finder-input ta-prog-in" dir="ltr" inputMode="numeric"
                                  value={progDraft[dk] ?? String(prog || '')}
                                  placeholder="0"
                                  aria-label={L(`התקדמות של ${p.name} מתוך ${a.target_value}`, `${p.name}'s progress of ${a.target_value}`)}
                                  onChange={(e) => setProgDraft((d) => ({ ...d, [dk]: e.target.value.replace(/[^0-9]/g, '') }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                  onBlur={() => {
                                    const v = progDraft[dk]
                                    if (v == null || v === '' || Number(v) === prog) return
                                    setProgDraft((d) => { const n = { ...d }; delete n[dk]; return n })
                                    writeMark(a, p, { progress: Number(v) })
                                  }} />
                              ) : null}
                              <span className="ta-partial" dir="ltr">{COACH_MODE && !done && view === 'active' ? `/${a.target_value}` : `${prog}/${a.target_value}`}</span>
                            </span>
                          ) : null}
                          {COACH_MODE ? (
                            /* המאמן מסמן «ביצע» בעצמו — לחיצה נוספת מבטלת.
                               גם בארכיון: ביטול שם מחזיר את המשימה לפעילה. */
                            /* 6.9 — הכפתור עושה בדיוק מה שכתוב עליו. כשהילד סימן
                               «ביצעתי» והמאמן עוד לא — הכיתוב הוא «אשר ביצוע»,
                               ולא «ביצע» שהטאפ עליו רשם בשקט אישור בשם המאמן. */
                            <>
                              <button type="button" className={done ? 'ta-status done ta-mark' : 'ta-status ta-mark'}
                                aria-pressed={who.has('coach')} onClick={() => writeMark(a, p, { done: !who.has('coach') })}>
                                {who.has('coach')
                                  ? <><Check size={13} /> {L('ביצע', 'Done')}</>
                                  : done
                                    ? <><Check size={13} /> {L('אשר ביצוע', 'Confirm done')}</>
                                    : <><Clock size={13} /> {L('סמן ביצע', 'Mark done')}</>}
                              </button>
                              {/* 6.9 — הילד סימן והמאמן יודע שזה לא קרה: ביטול מפורש */}
                              {done && !who.has('coach') && (
                                <button type="button" className="ta-status ta-mark"
                                  title={L('לא ביצע בפועל — ביטול הסימון של השחקן', "Not actually done — clear the player's mark")}
                                  onClick={() => writeMark(a, p, { done: false })}>
                                  <X size={13} /> {L('לא ביצע', 'Not done')}
                                </button>
                              )}
                            </>
                          ) : (
                            <span className={done ? 'ta-status done' : 'ta-status'}>{done ? <><Check size={13} /> {L('ביצע', 'Done')}</> : <><Clock size={13} /> {L('ממתין', 'Pending')}</>}</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  // סגירה ידנית — המאמן מארכב משימה פעילה
  async function archiveNow(a) {
    const { error } = await supabase.from('player_assignments').update({ status: 'archived' }).eq('id', a.id)
    if (error) {
      // 12.9 — שם המיגרציה לקונסול (לבעלים), ולמאמן נוסח שאומר מה קרה ומה עכשיו
      console.error(`TeamAssignments.archiveNow: ${error.message || error} (supabase_tasks_launch.sql)`)
      toast.error(L('סגירת משימה לארכיון עדיין לא פעילה בשרת — נסו שוב מאוחר יותר.',
        'Archiving a task is not active on the server yet — please try again later.'))
      return
    }
    setItems((cur) => cur.map((x) => (x.id === a.id ? { ...x, status: 'archived' } : x)))
    toast.success(L('המשימה נסגרה והועברה לארכיון', 'Task closed and archived'))
  }
}
