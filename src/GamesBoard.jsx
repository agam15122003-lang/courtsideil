import { toast } from './toast'
import { useState, useEffect } from 'react'
import { CalendarClock } from 'lucide-react'
import { supabase } from './supabaseClient'
import { AGE_GROUPS } from './constants'
import { L, tr } from './i18n'
import { SkeletonCards } from './Skeleton'

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}

// לוח משחקים — מאמנים מפרסמים בקשה למשחק אימון, ואחרים יכולים לשלוח הודעה.
// props:
//   session - המשתמש המחובר
export default function GamesBoard({ session }) {
  const myId = session.user.id
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // טופס פרסום
  const [ageGroup, setAgeGroup] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)

  // תיבת הודעה (לאיזו בקשה היא פתוחה)
  const [msgFor, setMsgFor] = useState(null)
  const [msgText, setMsgText] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('game_requests')
      .select('*, creator:profiles(first_name, last_name)')
      .order('created_at', { ascending: false })
    if (error) {
      setError(L('שגיאה בטעינת הלוח: ', 'Error loading the board: ') + error.message)
    } else {
      setGames(data || [])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const nameOf = (g) =>
    g.creator
      ? `${g.creator.first_name || ''} ${g.creator.last_name || ''}`.trim() || L('מאמן', 'Coach')
      : L('מאמן', 'Coach')

  const post = async () => {
    if (!ageGroup) {
      toast.error(L('בחר שכבת גיל למשחק.', 'Select an age group for the game.'))
      return
    }
    setPosting(true)
    const { error } = await supabase.from('game_requests').insert({
      created_by: myId,
      age_group: ageGroup,
      game_date: date || null,
      location: location.trim() || null,
      note: note.trim() || null,
    })
    setPosting(false)
    if (error) {
      toast.error(L('הפרסום נכשל: ', 'Posting failed: ') + error.message)
      return
    }
    setAgeGroup('')
    setDate('')
    setLocation('')
    setNote('')
    toast.success(L('הבקשה פורסמה', 'Request posted'))
    load()
  }

  const remove = async (id) => {
    if (!window.confirm(L('למחוק את הבקשה?', 'Delete this request?'))) return
    const { error } = await supabase.from('game_requests').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
      return
    }
    toast.success(L('הבקשה נמחקה', 'Request deleted'))
    load()
  }

  const sendMessage = async (recipientId) => {
    if (!msgText.trim()) return
    setSendingMsg(true)
    const { error } = await supabase.from('messages').insert({
      sender_id: myId,
      recipient_id: recipientId,
      content: msgText.trim(),
    })
    setSendingMsg(false)
    if (error) {
      toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + error.message)
      return
    }
    setMsgText('')
    setMsgFor(null)
    toast.success(L('ההודעה נשלחה! אפשר לראות אותה בטאב "הודעות".', 'Message sent! You can see it in the "Messages" tab.'))
  }

  return (
    <>
      {/* טופס פרסום בקשה */}
      <section className="form-section" style={{ marginTop: 16 }}>
        <h3 className="form-section-title">
          <CalendarClock size={16} /> {L('פרסום בקשה למשחק אימון', 'Post a scrimmage request')}
        </h3>
        <div className="field-group">
          <span className="field-label">{L('שכבת גיל (חובה)', 'Age group (required)')}</span>
          <div className="chips">
            {AGE_GROUPS.map((g) => (
              <button
                type="button"
                key={g}
                className={ageGroup === g ? 'chip selected' : 'chip'}
                onClick={() => setAgeGroup(ageGroup === g ? '' : g)}
              >
                {tr(g)}
              </button>
            ))}
          </div>
        </div>

        <div className="auth-form" style={{ marginTop: 12 }}>
          <div className="form-grid-2">
            <label>
              {L('תאריך (לא חובה)', 'Date (optional)')}
              <input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              {L('מיקום (לא חובה)', 'Location (optional)')}
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={L('לדוגמה: אולם רמת גן', 'e.g. Ramat Gan gym')}
              />
            </label>
          </div>
          <label>
            {L('פרטים (לא חובה)', 'Details (optional)')}
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={L('לדוגמה: מחפש משחק ידידות לנוער', 'e.g. Looking for a friendly game for juniors')}
            />
          </label>
          <button className="btn-primary" disabled={posting || !ageGroup} onClick={post}>
            {posting ? L('מפרסם...', 'Posting...') : L('פרסום בקשה', 'Post request')}
          </button>
          {!ageGroup && <span className="muted small">{L('בחר שכבת גיל כדי לפרסם.', 'Select an age group to post.')}</span>}
        </div>
      </section>

      {/* רשימת הבקשות */}
      <h3 className="section-title" style={{ marginTop: 24 }}>
        {L('בקשות פתוחות', 'Open requests')}
      </h3>
      <div className="finder-results">
        {loading ? (
          <SkeletonCards count={2} />
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ic">
              <CalendarClock size={26} />
            </span>
            <div className="empty-title">{L('אין בקשות פתוחות כרגע', 'No open requests right now')}</div>
            <p className="muted small">{L('פרסם את בקשת המשחק הראשונה והמאמנים יוכלו ליצור קשר.', 'Post the first game request and coaches will be able to reach out.')}</p>
          </div>
        ) : (
          games.map((g) => {
            const mine = g.created_by === myId
            return (
              <div key={g.id} className="coach-card">
                <div className="drill-card-top">
                  <h3 className="coach-name">{nameOf(g)}</h3>
                  {g.age_group && <span className="cat-badge">{tr(g.age_group)}</span>}
                </div>

                {(g.game_date || g.location) && (
                  <div className="drill-meta" style={{ marginTop: 10 }}>
                    {g.game_date && (
                      <div className="drill-meta-row">
                        <span className="detail-label">{L('תאריך', 'Date')}</span>
                        <span className="detail-value">{fmtDate(g.game_date)}</span>
                      </div>
                    )}
                    {g.location && (
                      <div className="drill-meta-row">
                        <span className="detail-label">{L('מיקום', 'Location')}</span>
                        <span className="detail-value">{g.location}</span>
                      </div>
                    )}
                  </div>
                )}

                {g.note && <p className="drill-desc">{g.note}</p>}

                <div className="coach-card-actions">
                  {mine ? (
                    <button className="btn-ghost danger" onClick={() => remove(g.id)}>
                      {L('מחק', 'Delete')}
                    </button>
                  ) : (
                    <button
                      className="btn-primary"
                      style={{ marginTop: 0 }}
                      onClick={() => {
                        setMsgFor(msgFor === g.id ? null : g.id)
                        setMsgText('')
                      }}
                    >
                      {L('שליחת הודעה', 'Send message')}
                    </button>
                  )}
                </div>

                {msgFor === g.id && !mine && (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      className="finder-input"
                      rows={2}
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      placeholder={L(`הודעה ל${nameOf(g)}...`, `Message to ${nameOf(g)}...`)}
                    />
                    <div className="form-actions" style={{ marginTop: 8 }}>
                      <button
                        className="btn-primary"
                        style={{ marginTop: 0 }}
                        disabled={sendingMsg || !msgText.trim()}
                        onClick={() => sendMessage(g.created_by)}
                      >
                        {L('שלח', 'Send')}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => setMsgFor(null)}
                        disabled={sendingMsg}
                      >
                        {L('ביטול', 'Cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
