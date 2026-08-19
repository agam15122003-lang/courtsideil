// כרטיס שחקן מלא (מסמך ההשקה 1.7) — מסך מאמן שנפתח מלחיצה על שחקן בסגל.
// פרטים יבשים · זמינות · נוכחות (אחוז, מגמה, חיסורים רצופים) · ממוצע קושי ·
// היעדים שלו · משימות פעילות · ציר זמן המשובים · הערות מאמן פרטיות.
// המאמן עורך הכול. הערות המאמן יושבות ב-coach_notes — למאמן בלבד (RLS).

import { useState, useEffect, useCallback } from 'react'
import {
  User, Phone, Ruler, Cake, Hash, HeartPulse, Flame, ClipboardList,
  MessageSquare, Lock, Send, Trash2, Save, TrendingUp, TrendingDown, Minus,
  FolderOpen,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { sendNotification } from './notify'
import Avatar from './Avatar'
import { ChevronBack } from './DirIcon'
import { PlayerGoalsEditor } from './PlayerGoals'
import { SkeletonCards } from './Skeleton'

const pad = (n) => String(n).padStart(2, '0')
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const ilShort = (s) => { if (!s) return ''; const d = new Date(s + 'T00:00'); return isNaN(d) ? s : `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}` }
const ageOf = (birthDate, birthYear) => {
  if (birthDate) {
    const b = new Date(birthDate + 'T00:00')
    if (!isNaN(b)) { const n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a }
  }
  if (birthYear) return new Date().getFullYear() - birthYear
  return null
}

const AVAIL = [
  { id: 'active', label: ['כשיר', 'Fit'], tone: 'ok' },
  { id: 'injured', label: ['פצוע', 'Injured'], tone: 'bad' },
  { id: 'sick', label: ['חולה', 'Sick'], tone: 'warn' },
]

export default function PlayerCard({ coachId, team, player, onBack, onOpenDossier }) {
  const rosterId = player.id
  const authId = player.player_id || null

  // ---------- פרטים יבשים (עריכה ישירה) ----------
  const [det, setDet] = useState({
    name: player.name || '', number: player.number || '', position: player.position || '',
    birth_date: player.birth_date || '', height: player.height || '', phone: player.phone || '',
  })
  const [savingDet, setSavingDet] = useState(false)
  const saveDetails = async () => {
    setSavingDet(true)
    const base = {
      name: det.name.trim() || player.name, number: det.number || null,
      position: det.position || null, phone: det.phone || null,
    }
    const extra = { birth_date: det.birth_date || null, height: det.height ? parseInt(det.height, 10) : null }
    // fallback — אם עמודות 1.7 (supabase_player_card.sql) טרם נוספו
    let { error } = await supabase.from('team_players').update({ ...base, ...extra }).eq('id', rosterId)
    if (error) ({ error } = await supabase.from('team_players').update(base).eq('id', rosterId))
    setSavingDet(false)
    if (error) { toast.error(L('השמירה נכשלה', 'Save failed')); return }
    toast.success(L('הפרטים נשמרו', 'Details saved'))
  }

  // ---------- זמינות ----------
  const [avail, setAvail] = useState(player.status === 'injured' || player.status === 'sick' ? player.status : 'active')
  const [availNote, setAvailNote] = useState(player.injury_note || '')
  const [availSince, setAvailSince] = useState(player.availability_since || null)
  const saveAvail = async (nextStatus, note) => {
    const row = { status: nextStatus, injury_note: note?.trim() || null }
    let { error } = await supabase.from('team_players')
      .update({ ...row, availability_since: todayYmd() }).eq('id', rosterId)
    if (error) ({ error } = await supabase.from('team_players').update(row).eq('id', rosterId))
    if (error) { toast.error(L('עדכון הזמינות נכשל', 'Availability update failed')); return }
    setAvail(nextStatus); setAvailSince(todayYmd())
    toast.success(L('הזמינות עודכנה', 'Availability updated'))
  }

  // ---------- נוכחות + קושי ----------
  const [stats, setStats] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [attRes, effRes] = await Promise.all([
        supabase.from('practice_attendance').select('status, session_date')
          .eq('coach_id', coachId).eq('player_id', rosterId).order('session_date', { ascending: false }),
        authId
          ? supabase.from('session_effort').select('effort, session_date')
              .eq('coach_id', coachId).eq('player_id', authId).order('session_date', { ascending: false })
          : Promise.resolve({ data: [] }),
      ])
      if (!alive) return
      const att = attRes.data || []
      const present = att.filter((a) => a.status && a.status !== 'absent').length
      // מגמה — חמשת הסימונים האחרונים מול החמישה שלפניהם
      const pctOf = (rows) => rows.length ? Math.round(rows.filter((a) => a.status !== 'absent').length / rows.length * 100) : null
      const recentPct = pctOf(att.slice(0, 5))
      const prevPct = pctOf(att.slice(5, 10))
      // חיסורים רצופים — מהאימון האחרון אחורה
      let run = 0
      for (const a of att) { if (a.status === 'absent') run++; else break }
      const effs = (effRes.data || []).map((r) => r.effort)
      setStats({
        attPct: att.length ? Math.round((present / att.length) * 100) : null,
        attCount: att.length,
        trend: recentPct != null && prevPct != null ? Math.sign(recentPct - prevPct) : null,
        absentRun: run,
        avgEffort: effs.length ? (effs.reduce((s, v) => s + v, 0) / effs.length).toFixed(1) : null,
        recentEff: (effRes.data || []).slice(0, 4),
      })
    })()
    return () => { alive = false }
  }, [coachId, rosterId, authId])

  // ---------- משימות פעילות ----------
  const [tasks, setTasks] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: asg } = await supabase.from('player_assignments')
        .select('*, drill:drills(title), plan:training_plans(name)')
        .eq('coach_id', coachId).order('created_at', { ascending: false }).limit(60)
      const mine = (asg || []).filter((a) =>
        (a.status || 'active') !== 'archived' && (a.player_id === authId || (!a.player_id && a.team === team)))
      let compl = []
      if (mine.length && authId) {
        const { data } = await supabase.from('assignment_completions')
          .select('assignment_id, done_at, progress_value')
          .eq('player_id', authId).in('assignment_id', mine.map((a) => a.id))
        compl = data || []
      }
      if (!alive) return
      const by = new Map(compl.map((c) => [c.assignment_id, c]))
      setTasks(mine.slice(0, 6).map((a) => ({
        id: a.id,
        title: a.drill?.title || a.plan?.name || a.title || L('משימה', 'Task'),
        target: Number(a.target_value) || null, unit: a.unit || '',
        done: !!by.get(a.id)?.done_at, prog: Number(by.get(a.id)?.progress_value) || 0,
      })))
    })()
    return () => { alive = false }
  }, [coachId, team, authId])

  // ---------- ציר זמן משובים ----------
  const [feedback, setFeedback] = useState(null)
  const [fbText, setFbText] = useState('')
  const loadFeedback = useCallback(async () => {
    if (!authId) { setFeedback([]); return }
    const { data } = await supabase.from('player_feedback')
      .select('id, content, rating, created_at, session_date, session_type')
      .eq('coach_id', coachId).eq('player_id', authId)
      .order('created_at', { ascending: false }).limit(50)
    setFeedback(data || [])
  }, [coachId, authId])
  useEffect(() => { loadFeedback() }, [loadFeedback])
  const sendFeedback = async () => {
    if (!authId || !fbText.trim()) return
    const { error } = await supabase.from('player_feedback').insert({ coach_id: coachId, player_id: authId, content: fbText.trim() })
    if (error) { toast.error(L('שליחת המשוב נכשלה', 'Failed to send feedback')); return }
    sendNotification({ to: authId, actor: coachId, type: 'message', content: 'קיבלת משוב חדש מהמאמן', nav: 'feedback' })
    setFbText('')
    loadFeedback()
    toast.success(L('המשוב נשלח לשחקן', 'Feedback sent'))
  }

  // ---------- הערות מאמן (פרטיות) ----------
  const [notes, setNotes] = useState(null) // null=טוען, false=טבלה חסרה
  const [noteText, setNoteText] = useState('')
  const loadNotes = useCallback(async () => {
    const { data, error } = await supabase.from('coach_notes')
      .select('id, content, created_at').eq('coach_id', coachId).eq('roster_id', rosterId)
      .order('created_at', { ascending: false })
    setNotes(error ? false : data || [])
  }, [coachId, rosterId])
  useEffect(() => { loadNotes() }, [loadNotes])
  const addNote = async () => {
    if (!noteText.trim()) return
    const { error } = await supabase.from('coach_notes').insert({ coach_id: coachId, roster_id: rosterId, content: noteText.trim() })
    if (error) { toast.error(L('השמירה נכשלה — צריך להריץ את supabase_player_card.sql', 'Save failed — run supabase_player_card.sql')); return }
    setNoteText('')
    loadNotes()
  }
  const delNote = async (id) => {
    await supabase.from('coach_notes').delete().eq('id', id)
    setNotes((cur) => (cur || []).filter((n) => n.id !== id))
  }

  const age = ageOf(det.birth_date, player.birth_year)
  const minor = age != null && age < 18

  return (
    <div className="team-section pc-screen">
      <div className="tg-screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label={L('חזרה לסגל', 'Back to the roster')}>
          <ChevronBack size={20} />
        </button>
        <h1 className="ta-title tg-screen-title">
          <User size={17} /> {player.name} · {trTeam(team)}
        </h1>
        {/* 18.8 — התיק שעובר עם השחקן משנה לשנה (דירוגים, מדידות, רקע) */}
        {onOpenDossier && (
          <button type="button" className="btn-soft pc-dossier-btn" onClick={() => onOpenDossier(player)}>
            <FolderOpen size={15} /> {L('תיק שחקן', 'Player dossier')}
          </button>
        )}
      </div>

      {/* ---------- פרטים יבשים ---------- */}
      <section className="pc-sec">
        <div className="pc-head">
          <Avatar name={player.name} size={44} />
          <div className="pc-head-tx">
            <b>{det.name || player.name}</b>
            <span className="muted small">
              {[det.position, det.number && L(`מס' ${det.number}`, `#${det.number}`), age != null && L(`גיל ${age}`, `age ${age}`)]
                .filter(Boolean).join(' · ') || L('פרטים חסרים', 'Details missing')}
            </span>
          </div>
        </div>
        <div className="pc-grid">
          <label className="pc-field"><span>{L('שם', 'Name')}</span>
            <input className="finder-input" value={det.name} onChange={(e) => setDet({ ...det, name: e.target.value })} maxLength={80} /></label>
          <label className="pc-field"><span><Hash size={12} /> {L('מספר גופייה', 'Jersey number')}</span>
            <input className="finder-input" dir="ltr" value={det.number} onChange={(e) => setDet({ ...det, number: e.target.value })} maxLength={3} /></label>
          <label className="pc-field"><span>{L('עמדה', 'Position')}</span>
            <input className="finder-input" value={det.position} onChange={(e) => setDet({ ...det, position: e.target.value })} maxLength={30} /></label>
          <label className="pc-field"><span><Cake size={12} /> {L('תאריך לידה', 'Birth date')}</span>
            <input className="finder-input" type="date" value={det.birth_date} onChange={(e) => setDet({ ...det, birth_date: e.target.value })} /></label>
          <label className="pc-field"><span><Ruler size={12} /> {L('גובה (ס"מ)', 'Height (cm)')}</span>
            <input className="finder-input" dir="ltr" inputMode="numeric" value={det.height} onChange={(e) => setDet({ ...det, height: e.target.value.replace(/[^0-9]/g, '') })} maxLength={3} /></label>
          <label className="pc-field"><span><Phone size={12} /> {minor ? L('טלפון הורה', "Parent's phone") : L('טלפון', 'Phone')}</span>
            <input className="finder-input" dir="ltr" value={det.phone} onChange={(e) => setDet({ ...det, phone: e.target.value })} maxLength={20} /></label>
        </div>
        <button type="button" className="btn-soft pc-save" onClick={saveDetails} disabled={savingDet}>
          <Save size={14} /> {savingDet ? L('שומר…', 'Saving…') : L('שמירת פרטים', 'Save details')}
        </button>
      </section>

      {/* ---------- זמינות ---------- */}
      <section className="pc-sec">
        <h3 className="ta-title"><HeartPulse size={16} /> {L('זמינות', 'Availability')}</h3>
        <div className="pc-avail">
          {AVAIL.map((a) => (
            <button key={a.id} type="button"
              className={'pc-avail-btn ' + a.tone + (avail === a.id ? ' on' : '')}
              onClick={() => saveAvail(a.id, a.id === 'active' ? '' : availNote)}
              aria-pressed={avail === a.id}>
              {L(a.label[0], a.label[1])}
            </button>
          ))}
        </div>
        {avail !== 'active' && (
          <div className="pc-avail-note">
            <input className="finder-input" value={availNote} maxLength={200}
              onChange={(e) => setAvailNote(e.target.value)}
              placeholder={L('פירוט (למשל: נקע בקרסול, שבועיים)', 'Details (e.g. sprained ankle, two weeks)')} />
            <button type="button" className="btn-soft" onClick={() => saveAvail(avail, availNote)}>{L('עדכון', 'Update')}</button>
          </div>
        )}
        {availSince && avail !== 'active' && (
          <p className="muted small">{L('מאז ', 'Since ')}{ilShort(availSince)}</p>
        )}
      </section>

      {/* ---------- נוכחות + קושי ---------- */}
      <section className="pc-sec">
        <h3 className="ta-title"><Flame size={16} /> {L('נוכחות ועומס', 'Attendance & load')}</h3>
        {!stats ? <SkeletonCards count={1} lines={1} /> : (
          <>
            <div className="gb-stats">
              <span className="gb-stat">
                {L('נוכחות', 'Attendance')} <b dir="ltr">{stats.attPct != null ? `${stats.attPct}%` : '—'}</b>
                {stats.trend === 1 && <TrendingUp size={13} className="pc-trend up" aria-label={L('במגמת שיפור', 'Improving')} />}
                {stats.trend === -1 && <TrendingDown size={13} className="pc-trend down" aria-label={L('במגמת ירידה', 'Declining')} />}
                {stats.trend === 0 && <Minus size={13} className="pc-trend" aria-hidden="true" />}
              </span>
              <span className="gb-stat">{L('ממוצע קושי', 'Avg load')} <b dir="ltr">{stats.avgEffort ?? '—'}</b></span>
              <span className="gb-stat">{L('חיסורים רצופים', 'Absent streak')} <b dir="ltr">{stats.absentRun}</b></span>
            </div>
            {stats.absentRun >= 3 && (
              <p className="pc-warn">{L('שלושה חיסורים רצופים ומעלה — שווה שיחה אישית.', '3+ consecutive absences — worth a personal chat.')}</p>
            )}
            {stats.recentEff.length > 0 && (
              <p className="muted small">
                {L('דיווחי הקושי האחרונים: ', 'Recent load reports: ')}
                {stats.recentEff.map((r) => `${r.session_date ? ilShort(r.session_date).slice(0, -5) : ''} ${r.effort}/10`).join(' · ')}
              </p>
            )}
          </>
        )}
      </section>

      {/* ---------- היעדים שלו ---------- */}
      <section className="pc-sec">
        <h3 className="ta-title"><ClipboardList size={16} /> {L('היעדים שלו', 'Their goals')}</h3>
        {authId
          ? <PlayerGoalsEditor coachId={coachId} playerId={authId} team={team} playerName={player.name} />
          : <p className="muted small">{L('השחקן עוד לא חיבר חשבון — יעדים יהיו זמינים כשיצטרף בקוד.', 'The player has no linked account yet — goals unlock when they join with a code.')}</p>}
      </section>

      {/* ---------- משימות פעילות ---------- */}
      <section className="pc-sec">
        <h3 className="ta-title"><ClipboardList size={16} /> {L('משימות פעילות', 'Active tasks')}</h3>
        {tasks === null ? <SkeletonCards count={1} lines={1} /> : tasks.length === 0 ? (
          <p className="muted small">{L('אין משימות פעילות לשחקן הזה.', 'No active tasks for this player.')}</p>
        ) : (
          <ul className="pc-tasks">
            {tasks.map((t) => (
              <li key={t.id} className="pc-task">
                <span className="pc-task-title">{t.title}</span>
                {t.target ? (
                  <span className="ta-pwrap">
                    <span className="ta-pbar" aria-hidden="true"><i className={t.done ? 'done' : ''} style={{ width: `${Math.min(100, Math.round(((t.done ? t.target : t.prog) / t.target) * 100))}%` }} /></span>
                    <span className="ta-partial" dir="ltr">{t.done ? t.target : t.prog}/{t.target}</span>
                  </span>
                ) : (
                  <span className={t.done ? 'ta-status done' : 'ta-status'}>{t.done ? L('בוצע', 'Done') : L('ממתין', 'Pending')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- ציר זמן משובים ---------- */}
      <section className="pc-sec">
        <h3 className="ta-title"><MessageSquare size={16} /> {L('משובים', 'Feedback')}</h3>
        {authId ? (
          <>
            <div className="pc-fb-add">
              <input className="finder-input" value={fbText} maxLength={2000}
                onChange={(e) => setFbText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendFeedback()}
                placeholder={L('משוב אישי לשחקן…', 'Personal feedback…')} />
              <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={sendFeedback} disabled={!fbText.trim()} aria-label={L('שליחה', 'Send')}>
                <Send size={15} />
              </button>
            </div>
            {feedback === null ? <SkeletonCards count={1} lines={1} /> : feedback.length === 0 ? (
              <p className="muted small">{L('עוד לא נשלחו משובים לשחקן הזה.', 'No feedback sent to this player yet.')}</p>
            ) : (
              <ul className="pc-fb-list">
                {feedback.map((f) => (
                  <li key={f.id} className="pc-fb">
                    <span className="muted small pc-fb-when">
                      {ilShort((f.created_at || '').slice(0, 10))}
                      {f.session_type === 'game' ? ` · ${L('משחק', 'Game')}` : f.session_id ? ` · ${L('אימון', 'Practice')}` : ''}
                    </span>
                    <span className="pc-fb-tx">{f.content}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="muted small">{L('משובים נשלחים רק לשחקן עם חשבון מחובר.', 'Feedback needs a linked player account.')}</p>
        )}
      </section>

      {/* ---------- הערות מאמן — פרטיות ---------- */}
      <section className="pc-sec">
        <h3 className="ta-title"><Lock size={16} /> {L('הערות מאמן', 'Coach notes')}</h3>
        <p className="muted small">{L('נראה רק לך — השחקן לא רואה את זה לעולם.', 'Visible only to you — the player never sees this.')}</p>
        <div className="pc-fb-add">
          <input className="finder-input" value={noteText} maxLength={2000}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNote()}
            placeholder={L('הערה פרטית…', 'Private note…')} />
          <button type="button" className="btn-soft" style={{ marginTop: 0 }} onClick={addNote} disabled={!noteText.trim()}>
            {L('הוספה', 'Add')}
          </button>
        </div>
        {notes === false ? (
          <p className="muted small">{L('הערות פרטיות יהיו זמינות אחרי הרצת supabase_player_card.sql.', 'Private notes unlock after running supabase_player_card.sql.')}</p>
        ) : notes === null ? null : notes.length > 0 && (
          <ul className="pc-notes">
            {notes.map((n) => (
              <li key={n.id} className="pc-note">
                <span className="muted small">{ilShort((n.created_at || '').slice(0, 10))}</span>
                <span className="pc-note-tx">{n.content}</span>
                <button type="button" className="icon-btn danger" onClick={() => delNote(n.id)} aria-label={L('מחיקה', 'Delete')}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
