import { useState, useEffect } from 'react'
import { UserPlus, Send, Check, X, Lock, Clock, ShieldAlert, Link2, Copy } from 'lucide-react'
import { supabase } from './supabaseClient'
import { siteUrl } from './consent'
import { toast } from './toast'
import { confirmDialog } from './confirm'
import { SkeletonCards } from './Skeleton'
import { L } from './i18n'

// מסך «מתאמנים אישיים» של המאמן.
//
// מה שכבר קיים ולא נבנה כאן: מנוע המשימות (player_assignments) וסימון
// הביצוע (assignment_completions) — שניהם מ-supabase_players.sql. המסך
// הזה רק מחבר אליהם קשר מסוג חדש.
//
// ⚠ הקשר עצמו מגיע מ-supabase_personal_training_4_8.sql. עד שהמיגרציה
// תרוץ, הטבלה חסרה — ואז המסך מציג הסבר במקום ליפול. זה הכלל של
// CLAUDE.md: הקוד חייב לשרוד מסד שטרם הריץ מיגרציה.

const STATUS = {
  pending_coach: () => ({
    label: L('ממתין לאישור שלך', 'Waiting for you'),
    cls: 'cv-denied',
    Icon: Clock,
  }),
  pending_parent: () => ({
    label: L('ממתין לאישור הורה', 'Waiting for a parent'),
    cls: 'cv-revoked',
    Icon: Lock,
  }),
  active: () => ({ label: L('פעיל', 'Active'), cls: 'cv-granted', Icon: Check }),
  ended: () => ({ label: L('הסתיים', 'Ended'), cls: 'cv-denied', Icon: X }),
}

// שגיאות שמשמעותן «המיגרציה עוד לא רצה», ולא «משהו נשבר»
const notDeployed = (e) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist/i.test(e.message || ''))

// הפקת קישור האישור להורה — אצל המאמן.
// הוא לא מקבל שום פרט על ההורה, רק טוקן, ומעביר אותו בערוץ שכבר קיים
// בינו לבין המשפחה. עדיף שמבוגר יפנה להורה מאשר שהילד יהיה השליח.
function ParentLink({ playerId, playerName }) {
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)

  const make = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('coach_trainee_consent_link', { p_player: playerId })
    setBusy(false)
    if (error || !data?.ok) {
      toast.error(
        error?.code === 'PGRST202'
          ? L('צריך להריץ את supabase_trainee_consent_4_8.sql', 'Run supabase_trainee_consent_4_8.sql')
          : data?.reason === 'need_guardian'
            ? L('אין הורה רשום בחשבון של המתאמן. הוא צריך להשלים קודם את אישור ההורה הבסיסי.',
                'No guardian on file for this trainee. They must complete the basic parent approval first.')
            : L('לא הצלחנו לייצר קישור: ', 'Could not create a link: ') + (error?.message || data?.reason || ''),
      )
      return
    }
    if (data.reason === 'already_active') { toast.success(L('הקשר כבר פעיל', 'Already active')); return }
    setLink(`${siteUrl()}/#/consent/${data.token}`)
  }

  const share = () => {
    const text = L(
      `שלום, ${playerName} מבקש/ת להתאמן איתי אישית. נדרש אישורך — הקישור כאן: ${link}`,
      `Hello, ${playerName} asked to train with me one-on-one. Your approval is needed: ${link}`,
    )
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener')
  }

  if (!link) {
    return (
      <button type="button" className="chip" onClick={make} disabled={busy}>
        <Link2 size={13} /> {busy ? L('רגע...', 'One moment...') : L('קישור אישור להורה', 'Parent approval link')}
      </button>
    )
  }

  return (
    <div className="pt-link">
      <input className="finder-input" readOnly value={link} dir="ltr" onFocus={(e) => e.target.select()} />
      <div className="pt-actions" style={{ marginBlockStart: 7 }}>
        <button type="button" className="chip" onClick={share}>
          <Send size={13} /> {L('שליחה בוואטסאפ', 'Send on WhatsApp')}
        </button>
        <button
          type="button"
          className="chip"
          onClick={async () => {
            try { await navigator.clipboard.writeText(link); toast.success(L('הקישור הועתק', 'Link copied')) }
            catch { toast.error(L('ההעתקה נכשלה — סמן והעתק', 'Copy failed — select and copy')) }
          }}
        >
          <Copy size={13} /> {L('העתקה', 'Copy')}
        </button>
      </div>
      <p className="muted small" style={{ margin: '6px 0 0' }}>
        {L('תקף 14 יום. מיועד להורה בלבד — אל תשלח אותו למתאמן.',
           'Valid for 14 days. Meant for a parent only — do not send it to the trainee.')}
      </p>
    </div>
  )
}

export default function PersonalTrainees({ session }) {
  const me = session.user.id
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState(null)
  const [sendTo, setSendTo] = useState(null)   // השורה שפותחים לה טופס משימה
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('personal_trainees')
      // ⚠ רק עמודות מהרשימה המותרת של supabase_privacy4.sql. הגרסה
      // הראשונה ביקשה גם birth_year — שאינה שם — וכל השאילתה נפלה על
      // «permission denied for table profiles». זו הרשאה ברמת עמודה,
      // לא RLS: עמודה אחת אסורה מפילה את הכל.
      // הרשימה: id, first_name, last_name, club, age_groups, avatar_url,
      //          verified, banned, role, position, phone_public, is_admin,
      //          created_at, updated_at
      // גיל אינו ניתן לקריאה כאן במכוון. הסטטוס «ממתין לאישור הורה» הוא
      // ממילא הסימן היחיד שצריך במסך הזה.
      // avatar_url לא נשלף אף שהוא מותר: לשחקנים אין תמונת פרופיל
      // (supabase_no_player_avatars.sql), והוא היה חוזר null תמיד.
      .select('*, player:profiles!personal_trainees_player_id_fkey(id, first_name, last_name)')
      .eq('coach_id', me)
      .order('requested_at', { ascending: false })
    if (err) {
      if (notDeployed(err)) { setMissing(true); setError(null) }
      else setError(err.message)
      setRows([])
    } else {
      setMissing(false)
      setError(null)
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [me])

  const name = (r) =>
    `${r.player?.first_name || ''} ${r.player?.last_name || ''}`.trim() || L('שחקן', 'Player')

  // אישור המאמן. הטריגר במסד הוא שמחליט אם זה נהיה active או נשאר
  // תקוע ב-pending_parent — הלקוח לא מכריע בזה, ובכוונה.
  const approve = async (r) => {
    const { error: err } = await supabase
      .from('personal_trainees')
      .update({ status: 'active', approved_at: new Date().toISOString() })
      .eq('id', r.id)
    if (err) { toast.error(L('האישור נכשל: ', 'Approve failed: ') + err.message); return }
    await load()
    toast.success(L('הבקשה אושרה', 'Request approved'))
  }

  const end = async (r) => {
    if (!(await confirmDialog({
      message: L(`לסיים את הקשר עם ${name(r)}? המשימות שכבר נשלחו נשארות אצלו.`,
                 `End the connection with ${name(r)}? Tasks already sent stay with them.`),
      danger: true,
    }))) return
    const { error: err } = await supabase
      .from('personal_trainees')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', r.id)
    if (err) { toast.error(L('הפעולה נכשלה: ', 'Failed: ') + err.message); return }
    await load()
    toast.success(L('הקשר הסתיים', 'Connection ended'))
  }

  const openSend = (r) => { setSendTo(r); setTitle(''); setNote(''); setDue('') }

  const sendTask = async () => {
    if (!title.trim()) { toast.error(L('כתוב מה המשימה', 'Write what the task is')); return }
    setSaving(true)
    const { error: err } = await supabase.from('player_assignments').insert({
      coach_id: me,
      player_id: sendTo.player_id,
      title: title.trim(),
      note: note.trim() || null,
      due_date: due || null,
    })
    setSaving(false)
    if (err) {
      // המדיניות במסד חוסמת שיגור למי שאינו שלי — כולל קטין שההורה
      // שלו טרם אישר. ההודעה מסבירה את זה במקום להציג קוד שגיאה.
      toast.error(/row-level security|policy/i.test(err.message || '')
        ? L('אי אפשר לשלוח — הקשר עדיין לא פעיל.', 'Cannot send — the connection is not active yet.')
        : L('השליחה נכשלה: ', 'Send failed: ') + err.message)
      return
    }
    setSendTo(null)
    toast.success(L('המשימה נשלחה', 'Task sent'))
    // רענון «מה שלחתי» — rows לא השתנו, ולכן ה-effect לא ירוץ מעצמו
    setRows((cur) => [...cur])
  }

  // הקוד האישי — נוצר בפעם הראשונה שנכנסים למסך. RPC ולא קריאה לעמודה:
  // הרשאת קריאה על personal_code הייתה מאפשרת למפות קודים של אחרים.
  const [code, setCode] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error: err } = await supabase.rpc('personal_code_mine')
      if (alive && !err) setCode(data)
    })()
    return () => { alive = false }
  }, [])

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success(L('הקוד הועתק', 'Code copied'))
    } catch {
      toast.error(L('ההעתקה נכשלה — סמן והעתק ידנית', 'Copy failed — select and copy manually'))
    }
  }

  // ---- מה שלחתי לכל מתאמן — משימות ויעדים, כאן ולא במסך הקבוצה ----
  // בקשת הבעלים (17.8): המאמן רואה את מה שהוא שלח למתאמן האישי **בדף
  // הזה**, ולא מעורבב עם המשימות הכלליות של הקבוצה. הכלל שמאפשר את זה:
  // מאמן אף פעם אינו גם מאמן הקבוצה וגם המאמן האישי של אותו שחקן — ולכן
  // כל משימה/יעד שלי לשחקן שהוא מתאמן אישי שלי הם, בהגדרה, אישיים.
  const [sent, setSent] = useState({}) // player_id -> { tasks:[], goals:[] }
  const [openFor, setOpenFor] = useState(null) // איזה מתאמן פרוש
  useEffect(() => {
    const ids = rows.filter((r) => r.status !== 'ended').map((r) => r.player_id).filter(Boolean)
    if (!ids.length) { setSent({}); return }
    let alive = true
    ;(async () => {
      const [aQ, gQ] = await Promise.all([
        supabase.from('player_assignments')
          .select('id, player_id, title, note, due_date, target_value, unit, status, created_at, drill:drills(title)')
          .eq('coach_id', me).in('player_id', ids).order('created_at', { ascending: false }).limit(200),
        supabase.from('player_goals')
          .select('id, player_id, title, target_value, progress_value, status, period, due_date, created_at')
          .eq('coach_id', me).in('player_id', ids).order('created_at', { ascending: false }).limit(200),
      ])
      if (!alive) return
      const tasks = (aQ.data || []).filter((a) => (a.status || 'active') !== 'archived')
      // מי סיים — completions לכל המשימות שנשלחו
      let done = {}
      if (tasks.length) {
        const cQ = await supabase.from('assignment_completions')
          .select('assignment_id, player_id, done_at, progress_value')
          .in('assignment_id', tasks.map((t) => t.id))
        for (const c of cQ.data || []) done[c.assignment_id] = c
      }
      if (!alive) return
      const by = {}
      for (const t of tasks) (by[t.player_id] = by[t.player_id] || { tasks: [], goals: [] }).tasks.push({ ...t, compl: done[t.id] || null })
      for (const g of gQ.data || []) (by[g.player_id] = by[g.player_id] || { tasks: [], goals: [] }).goals.push(g)
      setSent(by)
    })().catch(() => { /* טבלה חסרה / רשת — הקטע פשוט לא מוצג */ })
    return () => { alive = false }
  }, [rows, me])

  if (loading) return <div className="welcome-card"><SkeletonCards count={2} /></div>

  if (missing) {
    return (
      <div className="welcome-card">
        <div className="empty-state">
          <span className="empty-ic"><ShieldAlert size={26} /></span>
          <div className="empty-title">{L('הפיצ׳ר עוד לא הופעל במסד', 'Not enabled in the database yet')}</div>
          <p className="muted small" style={{ maxWidth: 480 }}>
            {L('צריך להריץ פעם אחת את supabase_personal_training_4_8.sql ואז לרענן. עד אז אין מה להציג — ושום דבר לא נשבר.',
               'Run supabase_personal_training_4_8.sql once and refresh. Until then there is nothing to show — and nothing is broken.')}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="welcome-card">
        <div className="alert alert-error" role="alert">{error}</div>
        <button className="btn-soft" onClick={load}>{L('נסה שוב', 'Try again')}</button>
      </div>
    )
  }

  const live = rows.filter((r) => r.status !== 'ended')

  return (
    <div className="welcome-card">
      {code && (
        <div className="pt-code">
          <div>
            <span className="field-label">{L('הקוד האישי שלך', 'Your personal code')}</span>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              {L('תן אותו למי שאתה מאמן אישית. הוא מזין אותו אצלו, ואתה מאשר כאן. זה לא קוד הקבוצה.',
                 'Give it to whoever you train one-on-one. They enter it, you approve here. This is not the team code.')}
            </p>
          </div>
          <button type="button" className="pt-code-val" onClick={copyCode} title={L('העתקה', 'Copy')}>
            <span dir="ltr">{code}</span>
          </button>
        </div>
      )}

      {live.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><UserPlus size={26} /></span>
          <div className="empty-title">{L('עוד אין מתאמנים אישיים', 'No personal trainees yet')}</div>
          <p className="muted small" style={{ maxWidth: 480 }}>
            {L('שחקן מבקש להתחבר אליך מהפרופיל שלך, ואתה מאשר. אי אפשר להוסיף שחקן מכאן — הבקשה תמיד מתחילה אצלו.',
               'A player requests you from your profile, and you approve. You cannot add a player from here — the request always starts with them.')}
          </p>
        </div>
      ) : (
        <ul className="pt-list">
          {live.map((r) => {
            const st = (STATUS[r.status] || STATUS.ended)()
            const locked = r.status !== 'active'
            return (
              <li key={r.id} className="pt-row">
                <div className="pt-main">
                  <b>{name(r)}</b>
                  <span className={'status-pill adm-cv ' + st.cls}>
                    <st.Icon size={12} aria-hidden="true" /> {st.label}
                  </span>
                </div>

                {r.status === 'pending_parent' && (
                  <div className="pt-note">
                    <p className="muted small" style={{ margin: '0 0 8px' }}>
                      {L('הקשר נעול עד שההורה יאשר אותך אישית. עד אז אי אפשר לשלוח משימות.',
                         'Locked until a parent approves you personally. No tasks can be sent until then.')}
                    </p>
                    <ParentLink playerId={r.player_id} playerName={name(r)} />
                  </div>
                )}

                <div className="pt-actions">
                  {r.status === 'pending_coach' && (
                    <button type="button" className="chip" onClick={() => approve(r)}>
                      <Check size={13} /> {L('אישור הבקשה', 'Approve')}
                    </button>
                  )}
                  <button type="button" className="chip" disabled={locked} onClick={() => openSend(r)}>
                    <Send size={13} /> {L('שיגור משימה', 'Send a task')}
                  </button>
                  <button type="button" className="chip danger-on" onClick={() => end(r)}>
                    {L('סיום הקשר', 'End')}
                  </button>
                </div>

                {/* מה שלחתי למתאמן הזה — מקופל, נפתח בלחיצה. כאן ולא
                    במסך הקבוצה: אלה משימות ויעדים אישיים. */}
                {(() => {
                  const s = sent[r.player_id]
                  const n = (s?.tasks.length || 0) + (s?.goals.length || 0)
                  if (!n) return null
                  const open = openFor === r.id
                  const doneN = (s.tasks || []).filter((t) => t.compl?.done_at).length
                  return (
                    <div className="pt-sent">
                      <button type="button" className="pt-sent-toggle" onClick={() => setOpenFor(open ? null : r.id)} aria-expanded={open}>
                        <span>
                          {L('מה שלחתי', 'What I sent')} · {s.tasks.length ? L(`${s.tasks.length} משימות`, `${s.tasks.length} tasks`) : null}
                          {s.tasks.length && s.goals.length ? ' · ' : ''}
                          {s.goals.length ? L(`${s.goals.length} יעדים`, `${s.goals.length} goals`) : null}
                          {s.tasks.length ? <span className="muted"> · {L(`${doneN} בוצעו`, `${doneN} done`)}</span> : null}
                        </span>
                        <span className="pt-sent-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
                      </button>
                      {open && (
                        <div className="pt-sent-body">
                          {s.tasks.length > 0 && (
                            <>
                              <span className="field-label">{L('משימות', 'Tasks')}</span>
                              <ul className="pt-sent-list">
                                {s.tasks.map((t) => {
                                  const isDone = !!t.compl?.done_at
                                  const prog = Number(t.compl?.progress_value) || 0
                                  const tv = Number(t.target_value) || 0
                                  return (
                                    <li key={t.id} className={isDone ? 'pt-sent-row done' : 'pt-sent-row'}>
                                      <span className="pt-sent-title">{t.drill?.title || t.title || L('משימה', 'Task')}</span>
                                      <span className="pt-sent-meta">
                                        {isDone
                                          ? <span className="status-pill adm-cv cv-granted"><Check size={11} aria-hidden="true" /> {L('בוצע', 'Done')}</span>
                                          : tv > 0
                                            ? <bdi dir="ltr">{prog}/{tv}{t.unit ? ` ${t.unit}` : ''}</bdi>
                                            : <span className="status-pill adm-cv cv-denied">{L('פתוח', 'Open')}</span>}
                                        {t.due_date && <span className="muted small"> · {L('עד', 'by')} <bdi dir="ltr">{t.due_date.slice(8, 10)}.{t.due_date.slice(5, 7)}</bdi></span>}
                                      </span>
                                    </li>
                                  )
                                })}
                              </ul>
                            </>
                          )}
                          {s.goals.length > 0 && (
                            <>
                              <span className="field-label" style={{ marginTop: 10 }}>{L('יעדים', 'Goals')}</span>
                              <ul className="pt-sent-list">
                                {s.goals.map((g) => {
                                  const tv = Number(g.target_value) || 0
                                  const isDone = g.status === 'done'
                                  return (
                                    <li key={g.id} className={isDone ? 'pt-sent-row done' : 'pt-sent-row'}>
                                      <span className="pt-sent-title">{g.title}</span>
                                      <span className="pt-sent-meta">
                                        {isDone
                                          ? <span className="status-pill adm-cv cv-granted"><Check size={11} aria-hidden="true" /> {L('הושג', 'Reached')}</span>
                                          : tv > 0
                                            ? <bdi dir="ltr">{Number(g.progress_value) || 0}/{tv}</bdi>
                                            : <span className="status-pill adm-cv cv-denied">{L('פעיל', 'Active')}</span>}
                                      </span>
                                    </li>
                                  )
                                })}
                              </ul>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {sendTo && sendTo.id === r.id && (
                  <div className="pt-form">
                    <input
                      className="finder-input"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      aria-label={L('מה המשימה', 'What is the task')}
                      placeholder={L('למשל: 200 זריקות מהפינה', 'e.g. 200 corner shots')}
                    />
                    <input
                      className="finder-input"
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      aria-label={L('פירוט', 'Details')}
                      placeholder={L('פירוט (לא חובה)', 'Details (optional)')}
                      style={{ marginTop: 8 }}
                    />
                    <label className="pf-label" style={{ marginTop: 8 }}>
                      {L('עד מתי', 'Due')}
                      <input
                        className="finder-input"
                        type="date"
                        dir="ltr"
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </label>
                    <div className="form-actions">
                      <button className="btn-primary" disabled={saving} onClick={sendTask}>
                        {saving ? L('שולח...', 'Sending...') : L('שליחה', 'Send')}
                      </button>
                      <button className="btn-ghost" onClick={() => setSendTo(null)}>
                        {L('ביטול', 'Cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
