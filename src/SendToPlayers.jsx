import { useState, useEffect, useCallback } from 'react'
import {
  Send, Users, User, Dumbbell, ClipboardList, MonitorPlay, PencilLine,
  Search, Check, CalendarDays, Inbox, X, CheckCheck, Hash, Repeat2,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam, cnt } from './i18n'
import { loadRoster, sendAssignments, loadSentFeed } from './sendToPlayersApi'
import Avatar from './Avatar'
import useFocusTrap from './useFocusTrap'

// «שלח לשחקנים» — פריט 4 במסמך המסירה.
//
// עד היום היו לזה **שתי דלתות שונות**: הטופס המלא (בתוך «הקבוצה שלי»)
// ובורר-בזק בכרטיס התרגיל ששלח מיד בלחיצה — בלי תאריך יעד, בלי לבקש
// משהו בחזרה ובלי אישור. המסמך מבקש מסך אחד שעונה על ארבע השאלות:
// **מה שולחים · למי · מה מבקשים בחזרה · עד מתי** — ואז מאשר מה קרה.
//
// «מה מבקשים בחזרה» מתורגם לסכימה הקיימת בלי שינוי מסד:
//   וי  — אין target_value, השחקן מסמן «סיימתי» (MyAssignments).
//   מספר — target_value + unit, השחקן מדווח התקדמות (100/200 זריקות).
// דיווח בווידאו לא קיים בצד השחקן, ולכן אין כאן כפתור כזה — כפתור
// שעובד חצי הוא גרוע מכפתור שלא קיים.
//
// props:
//   embedded  - כרטיס קומפקטי בתוך מסך אחר
//   variant   - 'sheet' לפתיחה מעל מסך (מכרטיס התרגיל), אחרת מסך מלא
//   preset    - {kind,id,title,sub,url} תוכן נעול מראש (הגעת מכרטיס תרגיל)
//   onClose   - סגירת הגיליון
const SOURCES = [
  { id: 'drill', label: ['תרגיל', 'Drill'], Icon: Dumbbell, tone: 'blue' },
  { id: 'plan', label: ['תוכנית', 'Plan'], Icon: ClipboardList, tone: 'purple' },
  { id: 'video', label: ['סרטון', 'Video'], Icon: MonitorPlay, tone: 'green' },
  { id: 'task', label: ['משימה חופשית', 'Free task'], Icon: PencilLine, tone: 'orange' },
]

// תאריכי יעד מהירים — «עד מתי» בלחיצה אחת, בלי לפתוח לוח שנה
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
// תאריך בתצוגה ישראלית — הפיד מתחת מציג 5.8, והאישור הציג 2026-08-05
const ilDate = (str) => { if (!str) return ''; const d = new Date(str + 'T00:00'); return isNaN(d) ? str : d.toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' }) }
const endOfWeek = () => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return ymd(d) }

export default function SendToPlayers({ session, embedded, initialTeam, variant, preset, onClose }) {
  const me = session.user.id
  const [roster, setRoster] = useState({ teams: [], players: [] })
  const [mode, setMode] = useState('team') // 'team' | 'players'
  const [team, setTeam] = useState('')
  const [picked, setPicked] = useState(new Set())
  const [pQuery, setPQuery] = useState('')

  const [source, setSource] = useState(preset?.kind || 'drill')
  const [items, setItems] = useState({}) // {drill:[], plan:[], video:[]}
  const [contentId, setContentId] = useState(preset?.id || null)
  const [taskTitle, setTaskTitle] = useState('')
  const [sQuery, setSQuery] = useState('')
  const [swapping, setSwapping] = useState(false) // «החלפה» לתוכן שהגיע נעול

  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [reply, setReply] = useState('done') // 'done' | 'count'
  const [target, setTarget] = useState('')
  const [unit, setUnit] = useState('')
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

  // טעינת רשימת המקור לפי הטאב (פעם אחת לכל סוג)
  useEffect(() => {
    if (source === 'task' || items[source]) return
    ;(async () => {
      let data = []
      if (source === 'drill') {
        const res = await supabase.from('drills').select('id, title, category').eq('created_by', me).order('created_at', { ascending: false }).limit(200)
        data = (res.data || []).map((d) => ({ id: d.id, title: d.title, sub: d.category }))
      } else if (source === 'plan') {
        const res = await supabase.from('training_plans').select('id, name').eq('created_by', me).order('created_at', { ascending: false }).limit(200)
        data = (res.data || []).map((p) => ({ id: p.id, title: p.name }))
      } else if (source === 'video') {
        const res = await supabase.from('drill_videos').select('id, title, category, url').eq('created_by', me).order('created_at', { ascending: false }).limit(200)
        data = (res.data || []).map((v) => ({ id: v.id, title: v.title, sub: v.category, url: v.url }))
      }
      setItems((cur) => ({ ...cur, [source]: data }))
    })()
  }, [source, items, me])

  const connectedInTeam = roster.players.filter((p) => p.team === team)
  const targetCount = mode === 'team' ? connectedInTeam.length : picked.size

  const lockedContent = preset && !swapping ? preset : null
  const chosenItem = lockedContent || (source !== 'task' ? (items[source] || []).find((i) => i.id === contentId) : null)
  const hasContent = source === 'task' ? taskTitle.trim().length > 0 : !!chosenItem
  // «מספר» בלי מספר זה לא בקשה — זה סתם כותרת
  const replyOk = reply !== 'count' || Number(target) > 0
  const canSend = targetCount > 0 && hasContent && replyOk && !sending

  const togglePick = (pid) => setPicked((cur) => { const n = new Set(cur); n.has(pid) ? n.delete(pid) : n.add(pid); return n })

  const buildContent = () => {
    if (source === 'task') return { kind: 'task', title: taskTitle.trim() }
    if (!chosenItem) return {}
    if (source === 'drill') return { kind: 'drill', drillId: chosenItem.id, title: chosenItem.title }
    if (source === 'plan') return { kind: 'plan', planId: chosenItem.id, title: chosenItem.title }
    if (source === 'video') return { kind: 'video', videoUrl: chosenItem.url, title: chosenItem.title }
    return {}
  }

  const resetForm = () => {
    if (!preset) { setContentId(null); setTaskTitle('') }
    setNote(''); setDueDate(''); setReply('done'); setTarget(''); setUnit(''); setPicked(new Set())
  }

  const doSend = async () => {
    if (!canSend) return
    setSending(true)
    const res = await sendAssignments({
      coachId: me, mode, team,
      players: roster.players.filter((p) => picked.has(p.player_id)),
      content: buildContent(), note: note.trim(), dueDate: dueDate || null,
      target: reply === 'count' ? target : null, unit: reply === 'count' ? unit : '',
    })
    setSending(false)
    if (!res.ok) { toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + res.error); return }
    if (res.warn) toast.error(res.warn)
    const label = mode === 'team' ? trTeam(team) : L(cnt(res.count, 'שחקן אחד', 'שחקנים'), `${res.count} players`)
    // אישור כמסך ולא כטוסט: השליחה היא סוף תהליך, וצריך לראות מה יצא
    setSent({ count: res.count, label, title: buildContent().title, due: dueDate })
    resetForm()
    if (!embedded && !variant) refreshFeed(roster)
    if (embedded) toast.success(L(`נשלח ל-${label}`, `Sent to ${label}`))
  }

  const noConnected = roster.players.length === 0
  // גיליון = דיאלוג: פוקוס נכנס פנימה, Tab לא בורח לרשת התרגילים מאחור,
  // ו-Escape סוגר. בלי זה aria-modal הוא הצהרה לא נכונה.
  const sheetRef = useFocusTrap(variant === 'sheet', onClose)

  // ---------- «מה מבקשים בחזרה» ----------
  // פונקציות שמחזירות JSX ולא רכיבים פנימיים: רכיב שנוצר מחדש בכל רינדור
  // מתחיל מאפס בכל הקלדה — והשדות היו מאבדים פוקוס אחרי כל תו.
  const replyPicker = () => (
    <div className="sp-reply">
      <button type="button" className={reply === 'done' ? 'sp-reply-opt on' : 'sp-reply-opt'} onClick={() => setReply('done')}>
        <span className="sp-reply-ic"><CheckCheck size={17} /></span>
        <span className="sp-reply-tx">
          <strong>{L('«סיימתי»', 'A check')}</strong>
          <span className="muted small">{L('השחקן מסמן וי כשסיים', 'The player ticks it off when done')}</span>
        </span>
      </button>
      <button type="button" className={reply === 'count' ? 'sp-reply-opt on' : 'sp-reply-opt'} onClick={() => setReply('count')}>
        <span className="sp-reply-ic"><Hash size={17} /></span>
        <span className="sp-reply-tx">
          <strong>{L('מספר', 'A number')}</strong>
          <span className="muted small">{L('דיווח מצטבר מול יעד, למשל 200 זריקות', 'Progress against a target, e.g. 200 shots')}</span>
        </span>
      </button>
      {reply === 'count' && (
        <div className="sp-target-row">
          <input type="number" dir="ltr" min="1" className="finder-input sp-target-num" value={target}
            onChange={(e) => setTarget(e.target.value)} placeholder="200" aria-label={L('כמות יעד', 'Target amount')} />
          <input className="finder-input sp-target-unit" value={unit} onChange={(e) => setUnit(e.target.value)}
            placeholder={L('זריקות', 'shots')} maxLength={30} aria-label={L('יחידה', 'Unit')} />
        </div>
      )}
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
    </div>
  )

  // ---------- אישור ----------
  const sentPanel = () => (
    <div className="sp-sent-ok" role="status">
      <span className="sp-sent-ic"><CheckCheck size={34} /></span>
      <h2 className="sp-sent-title">{L(`נשלח ל${sent.label}`, `Sent to ${sent.label}`)}</h2>
      <p className="muted">{sent.title}{sent.due ? L(` · עד ${ilDate(sent.due)}`, ` · by ${ilDate(sent.due)}`) : ''}</p>
      <p className="sp-sent-next muted small">
        {L('השחקנים קיבלו התראה, וזה מופיע אצלם ב«המשימות שלי». ההתקדמות תופיע לך במעקב.',
           'Your players got a notification, and it now shows under “My tasks”. Their progress appears in your tracking.')}
      </p>
      <div className="sp-sent-acts">
        <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={() => { setSent(null); onClose ? onClose() : null }}>
          {onClose ? L('סגירה', 'Close') : L('סיימתי', 'Done')}
        </button>
        <button type="button" className="btn-soft" style={{ marginTop: 0 }} onClick={() => { setSent(null); setSwapping(!!preset) }}>
          <Repeat2 size={16} /> {L('שליחה נוספת', 'Send another')}
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
          <p className="muted small">{L('אין שחקנים מחוברים עדיין — שתפו את קוד ההצטרפות מטאב "סגל".', 'No connected players yet — share the join code from the roster tab.')}</p>
        ) : (
          <>
            <div className="sp-mini-src">
              {SOURCES.map((s) => (
                <button key={s.id} className={source === s.id ? `sp-src active ${s.tone}` : 'sp-src'} onClick={() => { setSource(s.id); setContentId(null) }}>
                  <s.Icon size={15} /> {L(s.label[0], s.label[1])}
                </button>
              ))}
            </div>

            {source === 'task' ? (
              <input className="finder-input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={L('מה המשימה? לדוגמה: 100 זריקות עונשין', 'The task, e.g. 100 free throws')} maxLength={120} />
            ) : (
              <ul className="sp-items sp-items-mini">
                {(items[source] || []).filter((i) => !sQuery || i.title?.includes(sQuery)).slice(0, 40).map((i) => (
                  <li key={i.id}>
                    <button className={contentId === i.id ? 'sp-item on' : 'sp-item'} onClick={() => setContentId(contentId === i.id ? null : i.id)}>
                      <span className="sp-check">{contentId === i.id ? <Check size={14} /> : null}</span>
                      <span className="sp-item-title">{i.title}</span>
                      {i.sub && <span className="muted small">{i.sub}</span>}
                    </button>
                  </li>
                ))}
                {(items[source] || []).length === 0 && <p className="muted small" style={{ padding: '6px 2px' }}>{L('אין פריטים עדיין.', 'Nothing here yet.')}</p>}
              </ul>
            )}

            <div className="sp-mini-who">
              <button className={mode === 'team' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setMode('team')}><Users size={14} /> {L(`כל הקבוצה (${connectedInTeam.length})`, `Whole team (${connectedInTeam.length})`)}</button>
              <button className={mode === 'players' ? 'sp-seg-btn active' : 'sp-seg-btn'} onClick={() => setMode('players')}><User size={14} /> {L('שחקנים מסוימים', 'Specific players')}</button>
            </div>

            {mode === 'players' && (
              <ul className="sp-players sp-items-mini">
                {roster.players.filter((p) => p.team === team).map((p) => (
                  <li key={p.player_id}>
                    <button className={picked.has(p.player_id) ? 'sp-player on' : 'sp-player'} onClick={() => togglePick(p.player_id)}>
                      <span className="sp-check">{picked.has(p.player_id) ? <Check size={14} /> : null}</span>
                      {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={28} />}
                      <span className="sp-player-name">{p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <span className="sp-lbl">{L('מה מבקשים בחזרה', 'What you ask back')}</span>
            {replyPicker()}
            <span className="sp-lbl">{L('עד מתי', 'By when')}</span>
            {duePicker()}
            <input className="finder-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('הערה (לא חובה)', 'Note (optional)')} maxLength={400} />

            <button className="btn-primary sp-send" onClick={doSend} disabled={!canSend} aria-busy={sending}>
              {sending && <span className="btn-spinner" aria-hidden="true" />}
              <Send size={17} /> {targetCount > 0 ? L(`שלח ל-${targetCount} שחקנים`, `Send to ${targetCount} players`) : L('בחרו מה לשלוח', 'Pick what to send')}
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
          <div className="empty-title">{L('אין עדיין שחקנים מחוברים', 'No connected players yet')}</div>
          <p className="muted small">{L('שתפו את קוד ההצטרפות מ«הקבוצה שלי» — ברגע ששחקן מתחבר, אפשר לשלוח לו כאן.', 'Share the join code from “My team” — once a player connects, you can send to them here.')}</p>
        </div>
      ) : sent ? (
        sentPanel()
      ) : (
        <>
          {/* 1 — מה שולחים */}
          <section className="sp-card">
            <h3 className="sp-h3"><Send size={16} /> {L('מה שולחים?', 'What are you sending?')}</h3>

            {lockedContent ? (
              <div className="sp-locked">
                <span className="sp-locked-ic"><Dumbbell size={17} /></span>
                <span className="sp-locked-tx">
                  <strong>{lockedContent.title}</strong>
                  {lockedContent.sub && <span className="muted small">{lockedContent.sub}</span>}
                </span>
                <button type="button" className="link-button" onClick={() => { setSwapping(true); setContentId(null) }}>
                  {L('החלפה', 'Change')}
                </button>
              </div>
            ) : (
              <>
                <div className="sp-source-tabs">
                  {SOURCES.map((s) => (
                    <button key={s.id} className={source === s.id ? `sp-src active ${s.tone}` : 'sp-src'} onClick={() => { setSource(s.id); setContentId(null) }}>
                      <s.Icon size={16} /> {L(s.label[0], s.label[1])}
                    </button>
                  ))}
                </div>

                {source === 'task' ? (
                  <input className="finder-input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={L('לדוגמה: 100 זריקות עונשין', 'e.g. 100 free throws')} maxLength={120} />
                ) : (
                  <>
                    <div className="sp-search"><Search size={15} /><input className="finder-input" value={sQuery} onChange={(e) => setSQuery(e.target.value)} placeholder={L('חיפוש...', 'Search...')} /></div>
                    <ul className="sp-items">
                      {(items[source] || []).filter((i) => !sQuery || i.title?.includes(sQuery)).slice(0, 60).map((i) => (
                        <li key={i.id}>
                          <button className={contentId === i.id ? 'sp-item on' : 'sp-item'} onClick={() => setContentId(i.id)}>
                            <span className="sp-check">{contentId === i.id ? <Check size={14} /> : null}</span>
                            <span className="sp-item-title">{i.title}</span>
                            {i.sub && <span className="muted small">{i.sub}</span>}
                          </button>
                        </li>
                      ))}
                      {(items[source] || []).length === 0 && <p className="muted small" style={{ padding: '8px 2px' }}>{L('אין פריטים להצגה.', 'Nothing to show.')}</p>}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>

          {/* 2 — למי */}
          <section className="sp-card">
            <h3 className="sp-h3"><Users size={16} /> {L('למי שולחים?', 'Send to whom?')}</h3>
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
                    <li key={p.player_id}>
                      <button className={picked.has(p.player_id) ? 'sp-player on' : 'sp-player'} onClick={() => togglePick(p.player_id)}>
                        <span className="sp-check">{picked.has(p.player_id) ? <Check size={14} /> : null}</span>
                        {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={30} />}
                        <span className="sp-player-name">{p.name}</span>
                        <span className="muted small">{trTeam(p.team)}{p.position ? ` · ${p.position}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* 3 — מה מבקשים בחזרה */}
          <section className="sp-card">
            <h3 className="sp-h3"><CheckCheck size={16} /> {L('מה מבקשים בחזרה?', 'What do you ask back?')}</h3>
            {replyPicker()}
          </section>

          {/* 4 — עד מתי + הערה */}
          <section className="sp-card">
            <h3 className="sp-h3"><CalendarDays size={16} /> {L('עד מתי?', 'By when?')}</h3>
            {duePicker()}
            <textarea className="finder-input sp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('הערה לשחקנים (לא חובה)', 'Note to players (optional)')} rows={2} maxLength={400} />
          </section>
        </>
      )}
    </>
  )

  const sendBar = !noConnected && !sent && (
    <div className="sp-bar">
      <span className="sp-bar-sum">
        {hasContent
          ? L(`${cnt(targetCount, 'מקבל אחד', 'מקבלים')} · ${reply === 'count' ? `יעד ${target || '—'} ${unit || ''}`.trim() : 'סימון «סיימתי»'}`,
              `${targetCount} recipients · ${reply === 'count' ? `target ${target || '—'} ${unit || ''}`.trim() : 'a check'}`)
          : L('בחרו מה לשלוח', 'Pick what to send')}
      </span>
      <button className="btn-primary sp-send" onClick={doSend} disabled={!canSend} aria-busy={sending}>
        {sending && <span className="btn-spinner" aria-hidden="true" />}
        <Send size={17} /> {L(targetCount === 1 ? 'שליחה לשחקן' : `שליחה ל-${targetCount}`, targetCount === 1 ? 'Send to 1 player' : `Send to ${targetCount}`)}
      </button>
    </div>
  )

  if (isSheet) {
    return (
      /* לחיצה על הרקע הכהה סוגרת, בדיוק כמו במודאל שהוחלף כאן.
         Escape ומלכודת הפוקוס מגיעים מ-useFocusTrap על הגיליון עצמו. */
      <div className="sp-sheet-wrap" onClick={onClose}>
        <div className="sp-sheet" ref={sheetRef} role="dialog" aria-modal="true"
          aria-label={L('שליחה לשחקנים', 'Send to players')} onClick={(e) => e.stopPropagation()}>
          <header className="sp-sheet-head">
            <button type="button" className="icon-btn" onClick={onClose} aria-label={L('סגירה', 'Close')}><X size={19} /></button>
            <h2>{L('שליחה לשחקנים', 'Send to players')}</h2>
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
        <h3 className="sp-h3"><Inbox size={16} /> {L('מה שלחתי לאחרונה', 'Recently sent')}</h3>
        {feed === null ? (
          <div className="app-loading" style={{ padding: 20 }}><div className="loader" /></div>
        ) : feed.length === 0 ? (
          <p className="muted small">{L('עוד לא שלחת תרגולים.', 'You haven’t sent any training yet.')}</p>
        ) : (
          <ul className="sp-sent">
            {feed.map((f) => {
              const pct = f.total > 0 ? Math.round((f.done / f.total) * 100) : 0
              return (
                <li key={f.id} className="sp-sent-item">
                  <div className="sp-sent-main">
                    <strong>{f.title}</strong>
                    <span className="muted small">
                      {f.player_id ? L('לשחקן', 'To a player') : `${trTeam(f.team)}`}
                      {f.due_date ? ` · ${L('עד', 'by')} ${new Date(f.due_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}` : ''}
                    </span>
                  </div>
                  <span className={pct >= 100 ? 'sp-ratio done' : 'sp-ratio'}>
                    {f.player_id ? (f.done > 0 ? L('בוצע ✓', 'Done ✓') : L('ממתין', 'Pending')) : `${f.done}/${f.total} ✓`}
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
