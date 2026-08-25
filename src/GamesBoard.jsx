import { toast } from './toast'
import { useState, useEffect } from 'react'
import { CalendarClock, MapPin, XCircle } from 'lucide-react'
import { supabase } from './supabaseClient'
import { AGE_GROUPS } from './constants'
import { L, tr } from './i18n'
import { confirmDialog } from './confirm'
import { SkeletonCards } from './Skeleton'
import { sendNotification } from './notify'

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}

// שמונת האזורים של מסמך ההשקה (2.1)
export const REGIONS = ['צפון', 'חיפה', 'שרון', 'מרכז', 'תל אביב', 'ירושלים', 'שפלה', 'דרום']
const HOME_AWAY = [
  { id: 'home', label: ['אצלנו', 'Home'] },
  { id: 'away', label: ['אצלם', 'Away'] },
  { id: 'either', label: ['לא משנה', 'Either'] },
]
const homeAwayLabel = (id) => { const h = HOME_AWAY.find((x) => x.id === id); return h ? L(h.label[0], h.label[1]) : '' }

// לוח משחקי אימון (מסמך ההשקה 2.1) — מאמנים מפרסמים בקשה (שכבת גיל, אזור,
// טווח תאריכים, בית/חוץ), מסננים לפי אזור ושכבה, ויוצרים קשר בהודעות.
// props:
//   session - המשתמש המחובר
export default function GamesBoard({ session }) {
  const myId = session.user.id
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // טופס פרסום
  const [ageGroup, setAgeGroup] = useState('')
  const [region, setRegion] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [homeAway, setHomeAway] = useState('either')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)

  // סינון הלוח
  const [fRegion, setFRegion] = useState('')
  const [fAge, setFAge] = useState('')

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
    if (dateFrom && dateTo && dateTo < dateFrom) {
      toast.error(L('טווח התאריכים הפוך.', 'Date range is reversed.'))
      return
    }
    setPosting(true)
    const base = {
      created_by: myId,
      age_group: ageGroup,
      game_date: dateFrom || null,
      location: location.trim() || null,
      note: note.trim() || null,
    }
    // עמודות 2.1 (supabase_stage2_launch.sql) — fallback בלעדיהן עד שהמיגרציה תרוץ
    let { error } = await supabase.from('game_requests').insert({
      ...base, region: region || null, date_from: dateFrom || null, date_to: dateTo || null, home_away: homeAway,
    })
    if (error) ({ error } = await supabase.from('game_requests').insert(base))
    setPosting(false)
    if (error) {
      toast.error(L('הפרסום נכשל: ', 'Posting failed: ') + error.message)
      return
    }
    setAgeGroup(''); setRegion(''); setDateFrom(''); setDateTo(''); setHomeAway('either')
    setLocation('')
    setNote('')
    toast.success(L('הבקשה פורסמה', 'Request posted'))
    load()
  }

  const remove = async (id) => {
    if (!(await confirmDialog({ message: L('למחוק את הבקשה?', 'Delete this request?'), danger: true }))) return
    const { error } = await supabase.from('game_requests').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message)
      return
    }
    toast.success(L('הבקשה נמחקה', 'Request deleted'))
    load()
  }

  // 2.1 — סגירת בקשה (נשארת בלוח כהיסטוריה אצל הבעלים, נעלמת מהלוח הפתוח)
  const closeReq = async (id) => {
    const { error } = await supabase.from('game_requests').update({ status: 'closed' }).eq('id', id)
    if (error) {
      toast.error(L('הסגירה דורשת את המיגרציה supabase_stage2_launch.sql', 'Closing needs the supabase_stage2_launch.sql migration'))
      return
    }
    toast.success(L('הבקשה נסגרה', 'Request closed'))
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
    // התראה לנמען — בלי זה ההודעה שוכבת בלשונית «הודעות» עד שהוא נכנס במקרה.
    // שתי הכניסות האחרות לאותה טבלה (הודעות, פרופיל מאמן) כבר עושות את זה.
    sendNotification({ to: recipientId, actor: myId, type: 'message', content: L('שלח לך הודעה על משחק אימון', 'messaged you about a scrimmage'), nav: 'messages' })
    setMsgText('')
    setMsgFor(null)
    toast.success(L('ההודעה נשלחה! אפשר לראות אותה בלשונית "הודעות".', 'Message sent! You can see it in the "Messages" tab.'))
  }

  return (
    <>
      {/* טופס פרסום בקשה — «הצעת הקבוצה שלי למשחק אימון» */}
      <section className="form-section" style={{ marginTop: 16 }}>
        <h3 className="form-section-title">
          <CalendarClock size={16} /> {L('הצע את הקבוצה שלך למשחק אימון', 'Offer your team for a scrimmage')}
        </h3>
        <p className="muted small" style={{ marginTop: -4, marginBottom: 10 }}>
          {L('הבקשה תופיע לכל המאמנים — הם יסננו לפי אזור ושכבת גיל וישלחו לך הודעה.',
            'Your request appears to every coach — they filter by region and age group and message you.')}
        </p>
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

        <div className="field-group" style={{ marginTop: 10 }}>
          <span className="field-label">{L('אזור', 'Region')}</span>
          <div className="chips">
            {REGIONS.map((r) => (
              <button type="button" key={r} className={region === r ? 'chip selected' : 'chip'}
                onClick={() => setRegion(region === r ? '' : r)}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group" style={{ marginTop: 10 }}>
          <span className="field-label">{L('בית או חוץ?', 'Home or away?')}</span>
          <div className="chips">
            {HOME_AWAY.map((h) => (
              <button type="button" key={h.id} className={homeAway === h.id ? 'chip selected' : 'chip'}
                onClick={() => setHomeAway(h.id)}>
                {L(h.label[0], h.label[1])}
              </button>
            ))}
          </div>
        </div>

        <div className="auth-form" style={{ marginTop: 12 }}>
          <div className="form-grid-2">
            <label>
              {L('מתאריך (לא חובה)', 'From date (optional)')}
              <input type="date" dir="ltr" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              {L('עד תאריך (לא חובה)', 'To date (optional)')}
              <input type="date" dir="ltr" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
          <label>
            {L('מיקום (לא חובה)', 'Location (optional)')}
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={L('לדוגמה: אולם רמת גן', 'e.g. Ramat Gan gym')}
            />
          </label>
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

      {/* רשימת הבקשות + סינון לפי אזור ושכבת גיל (2.1) */}
      <h3 className="section-title" style={{ marginTop: 24 }}>
        {L('בקשות פתוחות', 'Open requests')}
      </h3>
      <div className="chips" style={{ marginTop: 8 }}>
        <button type="button" className={!fRegion ? 'chip selected' : 'chip'} onClick={() => setFRegion('')}>{L('כל הארץ', 'All regions')}</button>
        {REGIONS.map((r) => (
          <button type="button" key={r} className={fRegion === r ? 'chip selected' : 'chip'} onClick={() => setFRegion(fRegion === r ? '' : r)}>{r}</button>
        ))}
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        <button type="button" className={!fAge ? 'chip selected' : 'chip'} onClick={() => setFAge('')}>{L('כל השכבות', 'All ages')}</button>
        {AGE_GROUPS.map((g) => (
          <button type="button" key={g} className={fAge === g ? 'chip selected' : 'chip'} onClick={() => setFAge(fAge === g ? '' : g)}>{tr(g)}</button>
        ))}
      </div>
      <div className="finder-results">
        {loading ? (
          <SkeletonCards count={2} />
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : (() => {
          // פתוחות בלבד (לפני המיגרציה אין status — הכול נחשב פתוח), ואז הסינון
          const open = games.filter((g) => (g.status || 'open') === 'open')
          const shown = open.filter((g) =>
            (!fRegion || g.region === fRegion) && (!fAge || g.age_group === fAge))
          if (shown.length === 0) return (
            <div className="empty-state">
              <span className="empty-ic">
                <CalendarClock size={26} />
              </span>
              <div className="empty-title">
                {open.length === 0 ? L('אין בקשות פתוחות כרגע', 'No open requests right now') : L('אין בקשות בסינון הזה', 'No requests match this filter')}
              </div>
              <p className="muted small">
                {open.length === 0
                  ? L('פרסם את בקשת המשחק הראשונה והמאמנים יוכלו ליצור קשר.', 'Post the first game request and coaches will be able to reach out.')
                  : L('נסו אזור או שכבה אחרים.', 'Try another region or age group.')}
              </p>
            </div>
          )
          return shown.map((g) => {
            const mine = g.created_by === myId
            const range = g.date_from
              ? `${fmtDate(g.date_from)}${g.date_to && g.date_to !== g.date_from ? ` – ${fmtDate(g.date_to)}` : ''}`
              : (g.game_date ? fmtDate(g.game_date) : '')
            return (
              <div key={g.id} className="coach-card">
                <div className="drill-card-top">
                  <h3 className="coach-name">{nameOf(g)}</h3>
                  {g.age_group && <span className="cat-badge">{tr(g.age_group)}</span>}
                  {g.region && <span className="cat-badge"><MapPin size={11} /> {g.region}</span>}
                  {g.home_away && <span className="cat-badge">{homeAwayLabel(g.home_away)}</span>}
                </div>

                {(range || g.location) && (
                  <div className="drill-meta" style={{ marginTop: 10 }}>
                    {range && (
                      <div className="drill-meta-row">
                        <span className="detail-label">{L('מתי', 'When')}</span>
                        <span className="detail-value" dir="ltr">{range}</span>
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
                    <>
                      <button className="btn-soft" style={{ marginTop: 0 }} onClick={() => closeReq(g.id)}>
                        <XCircle size={14} /> {L('סגירת הבקשה', 'Close request')}
                      </button>
                      <button className="btn-ghost danger" onClick={() => remove(g.id)}>
                        {L('מחק', 'Delete')}
                      </button>
                    </>
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
        })()}
      </div>
    </>
  )
}
