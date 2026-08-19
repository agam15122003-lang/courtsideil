import { useState, useEffect, useCallback } from 'react'
import { Dumbbell, ChevronDown, Check, Clock, Inbox, BellRing, Archive } from 'lucide-react'
import { supabase } from './supabaseClient'
import { sendNotification } from './notify'
import { toast } from './toast'
import { L } from './i18n'
import Avatar from './Avatar'
import { SkeletonCards } from './Skeleton'
import { ErrorState } from './states'

const taPad = (n) => String(n).padStart(2, '0')
const taToday = () => { const d = new Date(); return `${d.getFullYear()}-${taPad(d.getMonth() + 1)}-${taPad(d.getDate())}` }

// «מה נשלח ומי ביצע» (מסמך ההשקה 1.6) — רק משימות פעילות; ארכוב אוטומטי
// כשעבר התאריך או שכולם סיימו, סגירה ידנית של המאמן, ומסך «ארכיון משימות».
export default function TeamAssignments({ coachId, team }) {
  const [roster, setRoster] = useState([])
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [reminding, setReminding] = useState(null)
  const [view, setView] = useState('active') // 'active' | 'archive'

  const load = useCallback(async () => {
    const { data: rp } = await supabase
      .from('team_players')
      .select('id, name, number, player_id')
      .eq('coach_id', coachId).eq('team', team).order('number')
    const players = (rp || []).filter((p) => p.player_id) // מחוברים בלבד
    setRoster(players)
    const authIds = new Set(players.map((p) => p.player_id))

    const { data: asg, error: asgErr } = await supabase
      .from('player_assignments')
      .select('*, drill:drills(title), plan:training_plans(name)')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .limit(80)
    // כשל שליפה אינו «אין מטלות»: בלי ההפרדה הזו תקלת רשת הציגה בדיוק
    // את מצב הריק «עדיין לא שלחת מטלות לקבוצה הזו».
    if (asgErr) { setFailed(true); setItems([]); return }
    setFailed(false)
    const mine = (asg || []).filter((a) => a.team === team || authIds.has(a.player_id))
    if (mine.length === 0) { setItems([]); return }

    // בוצע = done_at מלא; שורה בלי done_at = התקדמות חלקית. fallback אם המיגרציה טרם רצה.
    let { data: compl, error } = await supabase
      .from('assignment_completions')
      .select('assignment_id, player_id, done_at, progress_value')
      .in('assignment_id', mine.map((a) => a.id))
    if (error) {
      const legacy = await supabase.from('assignment_completions')
        .select('assignment_id, player_id, done_at').in('assignment_id', mine.map((a) => a.id))
      compl = (legacy.data || []).map((c) => ({ ...c, progress_value: 0 }))
    }
    const doneBy = {}
    const progBy = {} // assignment_id -> { player_id: progress_value }
    for (const c of compl || []) {
      if (c.done_at) (doneBy[c.assignment_id] = doneBy[c.assignment_id] || new Set()).add(c.player_id)
      if (Number(c.progress_value) > 0) (progBy[c.assignment_id] = progBy[c.assignment_id] || {})[c.player_id] = Number(c.progress_value)
    }

    const rows = mine.map((a) => {
      const title = a.drill?.title || a.plan?.name || a.title || (a.video_url ? L('סרטון', 'Video') : L('משימה', 'Task'))
      const targets = a.player_id ? players.filter((p) => p.player_id === a.player_id) : players
      const doneSet = doneBy[a.id] || new Set()
      return { ...a, title, targets, doneSet, prog: progBy[a.id] || {}, done: targets.filter((p) => doneSet.has(p.player_id)).length, total: targets.length }
    })

    // 1.6 — ארכוב אוטומטי: עבר תאריך היעד, או שכל המקבלים סיימו.
    // הכתיבה סובלנית — אם עמודת status (supabase_tasks_launch.sql) טרם
    // נוספה, הסינון פשוט לא ישרוד רענון, והמסך ממשיך לעבוד.
    const todayStr = taToday()
    const toArchive = rows.filter((a) =>
      (a.status || 'active') === 'active' &&
      ((a.due_date && a.due_date < todayStr) || (a.total > 0 && a.done >= a.total)))
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
    const pending = a.targets.filter((p) => !a.doneSet.has(p.player_id))
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

  // סגירה ידנית — המאמן מארכב משימה פעילה
  const archiveNow = async (a) => {
    const { error } = await supabase.from('player_assignments').update({ status: 'archived' }).eq('id', a.id)
    if (error) { toast.error(L('הארכוב דורש את המיגרציה supabase_tasks_launch.sql', 'Archiving needs the supabase_tasks_launch.sql migration')); return }
    setItems((cur) => cur.map((x) => (x.id === a.id ? { ...x, status: 'archived' } : x)))
    toast.success(L('המשימה נסגרה והועברה לארכיון', 'Task closed and archived'))
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
      <h3 className="ta-title" style={{ marginTop: 18 }}><Dumbbell size={16} /> {L('מה נשלח ומי ביצע', 'Sent & done')}</h3>
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
            {L(`ביצוע כולל — ${doneAll} מתוך ${totalAll} שיגורים הושלמו`, `Overall completion — ${doneAll} of ${totalAll} deliveries done`)}
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
                      {a.player_id ? L('אישי', 'Individual') : L('לכל הקבוצה', 'Whole team')}
                      {a.due_date ? ` · ${L('עד', 'by')} ${new Date(a.due_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}` : ''}
                    </span>
                  </div>
                  <span className={pct >= 100 ? 'ta-ratio done' : 'ta-ratio'}>{a.done}/{a.total} ✓</span>
                  <ChevronDown size={16} className={isOpen ? 'ta-chev open' : 'ta-chev'} />
                </button>
                {isOpen && view === 'active' && (
                  <div className="ta-item-acts">
                    {a.done < a.total && (
                      <button
                        type="button"
                        className="btn-soft ta-remind"
                        disabled={reminding === a.id}
                        onClick={() => remindPending(a)}
                      >
                        <BellRing size={14} aria-hidden="true" />
                        {reminding === a.id
                          ? L('שולח...', 'Sending...')
                          : <>{L('תזכורת ל-', 'Remind ')}<bdi dir="ltr">{a.total - a.done}</bdi> {L('שטרם ביצעו', 'pending')}</>}
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
                      <li className="muted small" style={{ padding: '6px 4px' }}>{L('אין שחקנים מחוברים ליעד הזה.', 'No connected players for this target.')}</li>
                    ) : a.targets.map((p) => {
                      const done = a.doneSet.has(p.player_id)
                      const prog = done && a.target_value ? Number(a.target_value) : (a.prog[p.player_id] || 0)
                      const ppct = a.target_value ? Math.min(100, Math.round((prog / Number(a.target_value)) * 100)) : (done ? 100 : 0)
                      return (
                        <li key={p.id} className="ta-player">
                          {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={28} />}
                          <span className="ta-player-name">{p.name}</span>
                          {/* 1.6 — פס התקדמות ליעד מספרי, וי לסיום */}
                          {a.target_value ? (
                            <span className="ta-pwrap">
                              <span className="ta-pbar" aria-hidden="true"><i className={done ? 'done' : ''} style={{ width: `${ppct}%` }} /></span>
                              <span className="ta-partial" dir="ltr">{prog}/{a.target_value}</span>
                            </span>
                          ) : null}
                          <span className={done ? 'ta-status done' : 'ta-status'}>{done ? <><Check size={13} /> {L('ביצע', 'Done')}</> : <><Clock size={13} /> {L('ממתין', 'Pending')}</>}</span>
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
}
