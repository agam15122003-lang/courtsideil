import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Flame, Crown, StickyNote, Save, Check, Minus } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { sendNotification } from './notify'
import Avatar from './Avatar'

const ATT = [
  { id: 'present', label: ['נוכח', 'Present'], tone: 'green' },
  { id: 'late', label: ['איחר', 'Late'], tone: 'orange' },
  { id: 'absent', label: ['נעדר', 'Absent'], tone: 'red' },
]

// דף סקירת אימון/משחק למאמן — נוכחות + משוב אישי + הערה כללית + MVP.
// המאמץ מדורג על ידי השחקנים בעצמם; כאן המאמן רואה דוח + ממוצע קבוצתי.
// props: session, entry {id, team, date, start_time, session_type?, opponent?}, onClose
export default function SessionDetail({ session, entry, onClose }) {
  const me = session.user.id
  const team = entry.team
  const sessionType = entry.session_type || 'practice'
  const sessionId = entry.id
  const sessionDate = entry.date
  const [roster, setRoster] = useState(null)
  const [att, setAtt] = useState({})        // {rosterId: status}
  const [efforts, setEfforts] = useState({}) // {rosterId: 1..10} — קריאה בלבד (דירוג עצמי של השחקן)
  const [playerNotes, setPlayerNotes] = useState({}) // {rosterId: מה שהשחקן רשם}
  const [goalMarks, setGoalMarks] = useState({})     // {rosterId: [{title, met}]}
  const [note, setNote] = useState({})      // {rosterId: text}
  const [openNote, setOpenNote] = useState({})
  const [fbId, setFbId] = useState({})      // {rosterId: existing feedback row id}
  const [mvp, setMvp] = useState(null)      // rosterId
  const [overall, setOverall] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: rp } = await supabase
      .from('team_players')
      .select('id, name, number, position, player_id')
      .eq('coach_id', me).eq('team', team).order('number')
    const players = rp || []
    setRoster(players)
    const byAuth = {}; for (const p of players) if (p.player_id) byAuth[p.player_id] = p.id

    const attP = sessionType === 'game'
      ? supabase.from('game_attendance').select('player_id, status').eq('game_id', sessionId)
      : supabase.from('practice_attendance').select('player_id, status').eq('coach_id', me).eq('team', team).eq('session_date', sessionDate)
    const [{ data: aRows }, { data: fRows }, { data: rev }, { data: eRows }, { data: gmRows }] = await Promise.all([
      attP,
      supabase.from('player_feedback').select('id, player_id, content').eq('coach_id', me).eq('session_id', sessionId),
      supabase.from('session_reviews').select('*').eq('coach_id', me).eq('session_type', sessionType).eq('session_id', sessionId).maybeSingle(),
      supabase.from('session_effort').select('player_id, effort, note').eq('coach_id', me).eq('session_id', sessionId),
      supabase.from('session_goal_marks').select('player_id, met, goal:player_goals(title)').eq('coach_id', me).eq('session_id', sessionId),
    ])
    const a = {}; for (const r of aRows || []) a[r.player_id] = r.status; setAtt(a)
    const nt = {}, fid = {}
    for (const r of fRows || []) {
      const rid = byAuth[r.player_id]; if (!rid) continue
      if (r.content) nt[rid] = r.content
      fid[rid] = r.id
    }
    setNote(nt); setFbId(fid)
    const ef = {}, pn = {}; for (const r of eRows || []) { const rid = byAuth[r.player_id]; if (rid) { ef[rid] = r.effort; if (r.note) pn[rid] = r.note } }
    setEfforts(ef); setPlayerNotes(pn)
    const gm = {}; for (const r of gmRows || []) { const rid = byAuth[r.player_id]; if (rid) (gm[rid] = gm[rid] || []).push({ title: r.goal?.title || L('מטרה', 'Goal'), met: r.met }) }
    setGoalMarks(gm)
    if (rev) {
      setOverall(rev.overall_note || '')
      if (rev.mvp_player_id && byAuth[rev.mvp_player_id]) setMvp(byAuth[rev.mvp_player_id])
    }
  }, [me, team, sessionDate, sessionId, sessionType])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setP = (setter) => (rid, val) => setter((c) => ({ ...c, [rid]: val }))

  const save = async () => {
    if (!roster) return
    setSaving(true)
    const byId = Object.fromEntries(roster.map((p) => [p.id, p]))

    // 1) נוכחות
    const marks = Object.entries(att).filter(([, s]) => s)
    if (marks.length) {
      if (sessionType === 'game') {
        await supabase.from('game_attendance').upsert(marks.map(([rid, status]) => ({ coach_id: me, team, game_id: sessionId, player_id: rid, status })), { onConflict: 'game_id,player_id' })
      } else {
        await supabase.from('practice_attendance').upsert(marks.map(([rid, status]) => ({ coach_id: me, team, session_date: sessionDate, player_id: rid, status })), { onConflict: 'coach_id,team,session_date,player_id' })
      }
    }

    // 2) משוב אישי (הערה) — לשחקנים מחוברים
    const notified = new Set()
    for (const p of roster) {
      if (!p.player_id) continue
      const nt = (note[p.id] || '').trim() || null
      if (!nt && !fbId[p.id]) continue
      const payload = {
        coach_id: me, player_id: p.player_id, content: nt,
        session_type: sessionType, session_id: sessionId, session_date: sessionDate,
        opponent: entry.opponent || null,
      }
      if (fbId[p.id]) await supabase.from('player_feedback').update(payload).eq('id', fbId[p.id])
      else {
        await supabase.from('player_feedback').insert(payload)
        if (nt) { sendNotification({ to: p.player_id, actor: me, type: 'message', content: L('המאמן כתב לך משוב מהאימון', 'Your coach left you session feedback'), nav: 'feedback' }); notified.add(p.player_id) }
      }
    }

    // 3) סקירת אימון (הערה כללית / MVP)
    const mvpP = mvp ? byId[mvp] : null
    await supabase.from('session_reviews').upsert({
      coach_id: me, team, session_type: sessionType, session_id: sessionId, session_date: sessionDate,
      overall_note: overall.trim() || null,
      mvp_name: mvpP ? mvpP.name : null, mvp_player_id: mvpP?.player_id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'coach_id,session_type,session_id' })
    if (mvpP?.player_id && !notified.has(mvpP.player_id)) {
      sendNotification({ to: mvpP.player_id, actor: me, type: 'message', content: L('נבחרת ל-MVP של האימון! 🏀', 'You were picked MVP of the session! 🏀'), nav: 'feedback' })
    }

    setSaving(false)
    toast.success(L('הסקירה נשמרה', 'Session saved'))
    onClose()
  }

  const present = Object.values(att).filter((s) => s && s !== 'absent').length
  const marked = Object.values(att).filter(Boolean).length
  const effVals = Object.values(efforts)
  const avgEffort = effVals.length ? (effVals.reduce((s, v) => s + v, 0) / effVals.length) : null

  const body = (
    <div className="sd-modal" onClick={onClose}>
      <div className="sd-inner" onClick={(e) => e.stopPropagation()}>
        <header className={`sd-hero ${sessionType}`}>
          <button className="icon-btn sd-close" onClick={onClose} aria-label={L('סגור', 'Close')}><X size={18} /></button>
          <span className="sd-badge">{sessionType === 'game' ? L('סקירת משחק', 'Game review') : L('סקירת אימון', 'Practice review')}</span>
          <h2>{sessionType === 'game' && entry.opponent ? `${trTeam(team)} — ${entry.opponent}` : trTeam(team)}</h2>
          <span className="sd-date">
            {sessionDate ? new Date(sessionDate + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' }) : ''}
            {entry.start_time ? ` · ${String(entry.start_time).slice(0, 5)}` : ''}
            {marked > 0 ? ` · ${L('נוכחות', 'Attendance')} ${present}/${marked}` : ''}
          </span>
          {avgEffort != null && (
            <span className="sd-avg"><Flame size={14} /> {L('מאמץ קבוצתי ממוצע', 'Team avg effort')} {avgEffort.toFixed(1)}/10 · {effVals.length} {L('דירגו', 'rated')}</span>
          )}
        </header>

        <div className="sd-scroll">
          <p className="sd-hint">{L('נוכחות, משוב אישי ו-MVP נקבעים על ידך. את המאמץ מדרגים השחקנים בעצמם בסוף האימון.', 'You set attendance, personal notes and MVP. Players rate their own effort after practice.')}</p>

          {roster === null ? (
            <div className="app-loading" style={{ padding: 30 }}><div className="loader" /></div>
          ) : roster.length === 0 ? (
            <p className="muted small">{L('אין שחקנים בסגל של הקבוצה הזו עדיין.', 'No players in this team roster yet.')}</p>
          ) : (
            <ul className="sd-roster">
              {roster.map((p) => {
                const connected = !!p.player_id
                const eff = efforts[p.id]
                return (
                  <li key={p.id} className="sd-row">
                    <div className="sd-row-top">
                      {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={30} />}
                      <span className="sd-name">{p.name}{!connected && <span className="muted small"> · {L('לא מחובר', 'not connected')}</span>}</span>
                      {connected && (
                        <span className={eff ? 'sd-eff-badge on' : 'sd-eff-badge'} title={L('מאמץ (דירוג עצמי)', 'Effort (self-rated)')}>
                          <Flame size={13} /> {eff ? `${eff}/10` : L('טרם דירג', '—')}
                        </span>
                      )}
                      <button className={mvp === p.id ? 'sd-mvp on' : 'sd-mvp'} onClick={() => setMvp(mvp === p.id ? null : p.id)} title={L('MVP', 'MVP')} aria-pressed={mvp === p.id}>
                        <Crown size={16} />
                      </button>
                    </div>
                    <div className="sd-row-ctl">
                      <div className="sd-att">
                        {ATT.map((a) => (
                          <button key={a.id} className={att[p.id] === a.id ? `sd-att-btn ${a.tone} on` : 'sd-att-btn'} onClick={() => setP(setAtt)(p.id, att[p.id] === a.id ? '' : a.id)}>
                            {L(a.label[0], a.label[1])}
                          </button>
                        ))}
                      </div>
                      {connected && (
                        <button className={openNote[p.id] || note[p.id] ? 'sd-note-btn on' : 'sd-note-btn'} onClick={() => setP(setOpenNote)(p.id, !openNote[p.id])} title={L('הערה אישית', 'Personal note')}>
                          <StickyNote size={15} />
                        </button>
                      )}
                    </div>
                    {connected && (openNote[p.id] || note[p.id]) && (
                      <input className="finder-input sd-note-input" value={note[p.id] || ''} onChange={(e) => setP(setNote)(p.id, e.target.value)} placeholder={L('מילה אישית לשחקן...', 'A personal line for the player...')} maxLength={300} />
                    )}
                    {connected && playerNotes[p.id] && (
                      <div className="sd-player-note"><span className="sd-player-note-lbl">{L('השחקן רשם:', 'Player wrote:')}</span> {playerNotes[p.id]}</div>
                    )}
                    {connected && goalMarks[p.id] && goalMarks[p.id].length > 0 && (
                      <div className="sd-goal-marks">
                        {goalMarks[p.id].map((g, i) => (
                          <span key={i} className={g.met ? 'sd-goal-mark met' : 'sd-goal-mark miss'}>
                            {g.met ? <Check size={12} /> : <Minus size={12} />} {g.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <label className="sd-overall">
            <span>{L('סיכום האימון (נשמר להיסטוריה, גלוי לשחקנים)', 'Session summary (saved to history, visible to players)')}</span>
            <textarea className="finder-input" value={overall} onChange={(e) => setOverall(e.target.value)} rows={3} placeholder={L('איך היה האימון? על מה עבדנו, מה בלט...', 'How was the session? What we worked on, what stood out...')} maxLength={2000} />
          </label>
        </div>

        <footer className="sd-foot">
          <button className="btn-primary sd-save" onClick={save} disabled={saving} aria-busy={saving}>
            {saving && <span className="btn-spinner" aria-hidden="true" />}
            <Save size={16} /> {L('שמירת הסקירה', 'Save review')}
          </button>
        </footer>
      </div>
    </div>
  )

  return createPortal(body, document.body)
}
