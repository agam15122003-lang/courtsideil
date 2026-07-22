import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Flame, Crown, Check, Clock, UserX, StickyNote, Save } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { sendNotification } from './notify'
import Avatar from './Avatar'

const MOODS = [
  { id: 'tough', emoji: '😤', label: ['קשה', 'Tough'] },
  { id: 'good', emoji: '💪', label: ['טוב', 'Good'] },
  { id: 'great', emoji: '🔥', label: ['מעולה', 'Great'] },
]
const ATT = [
  { id: 'present', label: ['נוכח', 'Present'], tone: 'green' },
  { id: 'late', label: ['איחר', 'Late'], tone: 'orange' },
  { id: 'absent', label: ['נעדר', 'Absent'], tone: 'red' },
]

// דף סקירת אימון/משחק למאמן — נוכחות + מאמץ + משוב אישי + הערה כללית + MVP.
// props: session, entry {id, team, date, start_time, plan, session_type?, opponent?}, onClose
export default function SessionDetail({ session, entry, onClose }) {
  const me = session.user.id
  const team = entry.team
  const sessionType = entry.session_type || 'practice'
  const sessionId = entry.id
  const sessionDate = entry.date
  const [roster, setRoster] = useState(null)
  const [att, setAtt] = useState({})       // {rosterId: status}
  const [effort, setEffort] = useState({}) // {rosterId: 1..5}
  const [note, setNote] = useState({})     // {rosterId: text}
  const [openNote, setOpenNote] = useState({}) // {rosterId: bool}
  const [fbId, setFbId] = useState({})     // {rosterId: existing feedback row id}
  const [mvp, setMvp] = useState(null)     // rosterId
  const [mood, setMood] = useState(null)
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

    const [{ data: aRows }, { data: fRows }, { data: rev }] = await Promise.all([
      supabase.from('practice_attendance').select('player_id, status').eq('coach_id', me).eq('team', team).eq('session_date', sessionDate),
      supabase.from('player_feedback').select('id, player_id, content, effort').eq('coach_id', me).eq('session_id', sessionId),
      supabase.from('session_reviews').select('*').eq('coach_id', me).eq('session_type', sessionType).eq('session_id', sessionId).maybeSingle(),
    ])
    const a = {}; for (const r of aRows || []) a[r.player_id] = r.status; setAtt(a)
    const ef = {}, nt = {}, fid = {}
    for (const r of fRows || []) {
      const rid = byAuth[r.player_id]; if (!rid) continue
      if (r.effort) ef[rid] = r.effort
      if (r.content) nt[rid] = r.content
      fid[rid] = r.id
    }
    setEffort(ef); setNote(nt); setFbId(fid)
    if (rev) {
      setOverall(rev.overall_note || ''); setMood(rev.mood || null)
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
  const cycleEffort = (rid) => setEffort((c) => ({ ...c, [rid]: c[rid] === 5 ? 0 : (c[rid] || 0) + 1 }))

  const save = async () => {
    if (!roster) return
    setSaving(true)
    const byId = Object.fromEntries(roster.map((p) => [p.id, p]))

    // 1) נוכחות — לכל מי שסומן
    const attRows = Object.entries(att).filter(([, s]) => s).map(([rid, status]) => ({
      coach_id: me, team, session_date: sessionDate, player_id: rid, status,
    }))
    if (attRows.length) {
      await supabase.from('practice_attendance').upsert(attRows, { onConflict: 'coach_id,team,session_date,player_id' })
    }

    // 2) משוב אישי + מאמץ — לשחקנים מחוברים בלבד
    const notified = new Set()
    for (const p of roster) {
      if (!p.player_id) continue
      const ef = effort[p.id] || null
      const nt = (note[p.id] || '').trim() || null
      if (!ef && !nt && !fbId[p.id]) continue
      const payload = {
        coach_id: me, player_id: p.player_id, content: nt, effort: ef,
        session_type: sessionType, session_id: sessionId, session_date: sessionDate,
        opponent: entry.opponent || null,
      }
      if (fbId[p.id]) {
        await supabase.from('player_feedback').update(payload).eq('id', fbId[p.id])
      } else {
        await supabase.from('player_feedback').insert(payload)
        if (nt || ef) { sendNotification({ to: p.player_id, actor: me, type: 'message', content: L('המאמן כתב לך משוב מהאימון', 'Your coach left you session feedback'), nav: 'feedback' }); notified.add(p.player_id) }
      }
    }

    // 3) סקירת אימון (הערה כללית / מצב רוח / MVP)
    const mvpP = mvp ? byId[mvp] : null
    await supabase.from('session_reviews').upsert({
      coach_id: me, team, session_type: sessionType, session_id: sessionId, session_date: sessionDate,
      overall_note: overall.trim() || null, mood: mood || null,
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

  const body = (
    <div className="sd-modal" onClick={onClose}>
      <div className="sd-inner" onClick={(e) => e.stopPropagation()}>
        <header className={`sd-hero ${sessionType}`}>
          <button className="icon-btn sd-close" onClick={onClose} aria-label={L('סגור', 'Close')}><X size={18} /></button>
          <span className="sd-badge">{sessionType === 'game' ? L('סקירת משחק', 'Game review') : L('סקירת אימון', 'Practice review')}</span>
          <h2>{sessionType === 'game' && entry.opponent ? `${trTeam(team)} — ${entry.opponent}` : trTeam(team)}</h2>
          <span className="sd-date">
            {sessionDate ? new Date(sessionDate + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' }) : ''}
            {entry.start_time ? ` · ${entry.start_time.slice(0, 5)}` : ''}
            {marked > 0 ? ` · ${L('נוכחות', 'Attendance')} ${present}/${marked}` : ''}
          </span>
        </header>

        <div className="sd-scroll">
          {/* מצב רוח כללי */}
          <div className="sd-mood">
            {MOODS.map((m) => (
              <button key={m.id} className={mood === m.id ? 'sd-mood-btn on' : 'sd-mood-btn'} onClick={() => setMood(mood === m.id ? null : m.id)}>
                <span className="sd-mood-emoji">{m.emoji}</span>{L(m.label[0], m.label[1])}
              </button>
            ))}
          </div>

          <p className="sd-hint">{L('נוכחות נשמרת לכל הסגל · מאמץ ומשוב אישי נשמרים לשחקנים מחוברים.', 'Attendance saves for the whole roster · effort & personal notes save for connected players.')}</p>

          {roster === null ? (
            <div className="app-loading" style={{ padding: 30 }}><div className="loader" /></div>
          ) : roster.length === 0 ? (
            <p className="muted small">{L('אין שחקנים בסגל של הקבוצה הזו עדיין.', 'No players in this team roster yet.')}</p>
          ) : (
            <ul className="sd-roster">
              {roster.map((p) => {
                const connected = !!p.player_id
                return (
                  <li key={p.id} className="sd-row">
                    <div className="sd-row-top">
                      {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={30} />}
                      <span className="sd-name">{p.name}{!connected && <span className="muted small"> · {L('לא מחובר', 'not connected')}</span>}</span>
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
                        <>
                          <button className="sd-effort" onClick={() => cycleEffort(p.id)} title={L('סולם מאמץ', 'Effort')}>
                            {[1, 2, 3, 4, 5].map((n) => <Flame key={n} size={15} fill={n <= (effort[p.id] || 0) ? 'currentColor' : 'none'} className={n <= (effort[p.id] || 0) ? 'on' : ''} />)}
                          </button>
                          <button className={openNote[p.id] || note[p.id] ? 'sd-note-btn on' : 'sd-note-btn'} onClick={() => setP(setOpenNote)(p.id, !openNote[p.id])} title={L('הערה אישית', 'Personal note')}>
                            <StickyNote size={15} />
                          </button>
                        </>
                      )}
                    </div>
                    {connected && (openNote[p.id] || note[p.id]) && (
                      <input className="finder-input sd-note-input" value={note[p.id] || ''} onChange={(e) => setP(setNote)(p.id, e.target.value)} placeholder={L('מילה אישית לשחקן...', 'A personal line for the player...')} maxLength={300} />
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
