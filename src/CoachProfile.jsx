import { toast } from './toast'
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { L, trTeam } from './i18n'
import DrillCard from './DrillCard'
import Avatar from './Avatar'
import { Dumbbell, ArrowRight } from 'lucide-react'
import { SkeletonCards } from './Skeleton'

// פרופיל מאמן — מציג את פרטי המאמן, אפשרות לשלוח לו הודעה,
// ואת כל התרגילים שהוא שיתף.
// props:
//   coach          - אובייקט המאמן (id, first_name, last_name, club, age_groups, email)
//   session        - המשתמש המחובר
//   onBack         - חזרה למאתר המאמנים
//   startComposing - האם לפתוח את תיבת ההודעה מיד (כשמגיעים דרך "שלח הודעה")
export default function CoachProfile({ coach, session, onBack, startComposing }) {
  const [drills, setDrills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // מצב תיבת ההודעה
  const [composing, setComposing] = useState(!!startComposing)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [plans, setPlans] = useState([]) // תוכניות ששותפו ע"י המאמן

  // טוען רק את התרגילים שהמאמן הזה יצר
  async function loadCoachDrills() {
    setLoading(true)
    const { data, error } = await supabase
      .from('drills')
      .select(
        '*, author:profiles(first_name, last_name, club), drill_ratings(rating, user_id), saved_drills(user_id)'
      )
      .eq('created_by', coach.id)
      .order('created_at', { ascending: false })

    if (error) {
      setError(L('שגיאה בטעינת התרגילים: ', 'Error loading drills: ') + error.message)
    } else {
      setDrills(data || [])
    }

    const { data: pl } = await supabase
      .from('training_plans')
      .select('*, plan_items(id)')
      .eq('created_by', coach.id)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
    setPlans(pl || [])

    setLoading(false)
  }

  useEffect(() => {
    loadCoachDrills()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach])

  // שליחת הודעה למאמן
  const sendMessage = async () => {
    if (!messageText.trim()) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      sender_id: session.user.id,
      recipient_id: coach.id,
      content: messageText.trim(),
    })
    setSending(false)
    if (error) {
      toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + error.message)
      return
    }
    setMessageText('')
    setComposing(false)
    setSent(true)
  }

  // דירוג (אפשר לדרג גם תרגילים של מאמנים אחרים)
  const handleRate = async (drillId, rating) => {
    const { error } = await supabase
      .from('drill_ratings')
      .upsert(
        { drill_id: drillId, user_id: session.user.id, rating },
        { onConflict: 'drill_id,user_id' }
      )
    if (error) {
      toast.error(L('הדירוג נכשל: ', 'Rating failed: ') + error.message)
    } else {
      loadCoachDrills()
    }
  }

  // שמירה/הסרה ממועדפים
  const handleToggleSave = async (drillId, currentlySaved) => {
    if (currentlySaved) {
      const { error } = await supabase
        .from('saved_drills')
        .delete()
        .eq('drill_id', drillId)
        .eq('user_id', session.user.id)
      if (error) {
        toast.error(L('ההסרה מהמועדפים נכשלה: ', 'Failed to remove from favorites: ') + error.message)
        return
      }
    } else {
      const { error } = await supabase
        .from('saved_drills')
        .insert({ drill_id: drillId, user_id: session.user.id })
      if (error) {
        toast.error(L('השמירה נכשלה: ', 'Failed to save: ') + error.message)
        return
      }
    }
    loadCoachDrills()
  }

  // העתקת תוכנית ששותפה אל "התוכניות שלי"
  const copyPlan = async (plan) => {
    const { data: items, error: e1 } = await supabase
      .from('plan_items')
      .select('drill_id, position, duration_minutes, note')
      .eq('plan_id', plan.id)
      .order('position')
    if (e1) {
      toast.error(L('שגיאה: ', 'Error: ') + e1.message)
      return
    }
    const { data: np, error: e2 } = await supabase
      .from('training_plans')
      .insert({ name: plan.name + L(' (עותק)', ' (copy)'), created_by: session.user.id })
      .select()
      .single()
    if (e2) {
      toast.error(L('שגיאה: ', 'Error: ') + e2.message)
      return
    }
    if (items && items.length) {
      const rows = items.map((it) => ({ ...it, plan_id: np.id }))
      const { error: e3 } = await supabase.from('plan_items').insert(rows)
      if (e3) {
        toast.error(L('שגיאה: ', 'Error: ') + e3.message)
        return
      }
    }
    toast.success(L('התוכנית הועתקה אל "התוכניות שלי".', 'Plan copied to "My Plans".'))
  }

  const fullName = `${coach.first_name || ''} ${coach.last_name || ''}`.trim()

  return (
    <div className="welcome-card coach-profile">
      <button className="link-button" onClick={onBack}>
        <ArrowRight size={15} className="back-ic" /> {L('חזרה למאתר המאמנים', 'Back to Coach Finder')}
      </button>

      <div className="welcome-badge" style={{ marginTop: 14 }}>
        {L('פרופיל מאמן', 'Coach Profile')}
      </div>
      <div className="coach-profile-head">
        <Avatar name={fullName} url={coach.avatar_url} size={64} />
        <h2 style={{ margin: 0 }}>{fullName}</h2>
      </div>

      <div className="profile-details">
        <div className="detail-row">
          <span className="detail-label">{L('מועדון', 'Club')}</span>
          <span className="detail-value">{coach.club}</span>
        </div>

        {coach.phone_public && coach.phone && (
          <div className="detail-row">
            <span className="detail-label">{L('טלפון', 'Phone')}</span>
            <span className="detail-value" dir="ltr">
              <a className="phone-link" href={`tel:${coach.phone}`}>
                {coach.phone}
              </a>
            </span>
          </div>
        )}

        {coach.age_groups && coach.age_groups.length > 0 && (
          <div className="detail-row">
            <span className="detail-label">{L('קבוצות', 'Teams')}</span>
            <span className="detail-value">
              <span className="chips">
                {coach.age_groups.map((g) => (
                  <span key={g} className="chip selected static">
                    {trTeam(g)}
                  </span>
                ))}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* שליחת הודעה דרך האפליקציה */}
      <div style={{ marginTop: 18 }}>
        {!composing ? (
          <button
            className="btn-primary coach-contact"
            onClick={() => {
              setComposing(true)
              setSent(false)
            }}
          >
            {L('שליחת הודעה', 'Send message')}
          </button>
        ) : (
          <div>
            <textarea
              className="finder-input"
              rows={3}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={L(`כתוב הודעה ל${coach.first_name}...`, `Write a message to ${coach.first_name}...`)}
            />
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button
                className="btn-primary"
                style={{ marginTop: 0 }}
                disabled={sending || !messageText.trim()}
                onClick={sendMessage}
              >
                {sending ? L('שולח...', 'Sending...') : L('שלח', 'Send')}
              </button>
              <button
                className="btn-ghost"
                onClick={() => setComposing(false)}
                disabled={sending}
              >
                {L('ביטול', 'Cancel')}
              </button>
            </div>
          </div>
        )}

        {sent && (
          <div className="alert alert-success" style={{ marginTop: 12 }}>
            {L('ההודעה נשלחה! תוכל לראות את השיחה בטאב "הודעות".', 'Message sent! You can see the conversation in the "Messages" tab.')}
          </div>
        )}
      </div>

      <h3 className="section-title">{L(`התרגילים של ${coach.first_name}`, `${coach.first_name}'s drills`)}</h3>

      <div className="finder-results">
        {loading ? (
          <SkeletonCards count={2} />
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : drills.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ic">
              <Dumbbell size={26} />
            </span>
            <div className="empty-title">{L('אין עדיין תרגילים משותפים', 'No shared drills yet')}</div>
            <p className="muted small">{L('כשהמאמן ישתף תרגילים, הם יופיעו כאן.', 'When this coach shares drills, they will appear here.')}</p>
          </div>
        ) : (
          <>
            <p className="muted small results-count">
              {drills.length === 1 ? L('תרגיל אחד', '1 drill') : L(`${drills.length} תרגילים`, `${drills.length} drills`)}
            </p>
            {drills.map((drill) => (
              <DrillCard
                key={drill.id}
                drill={drill}
                userId={session.user.id}
                isMine={drill.created_by === session.user.id}
                onRate={handleRate}
                onToggleSave={handleToggleSave}
                onDelete={() => {}}
              />
            ))}
          </>
        )}
      </div>

      {plans.length > 0 && (
        <>
          <h3 className="section-title">{L('תוכניות אימון ששיתף', 'Shared training plans')}</h3>
          <div className="finder-results">
            {plans.map((p) => (
              <div key={p.id} className="coach-card">
                <div className="drill-card-top">
                  <h3 className="coach-name">{p.name}</h3>
                </div>
                <p className="coach-club">
                  {L(`${(p.plan_items || []).length} תרגילים`, `${(p.plan_items || []).length} drills`)}
                </p>
                <div className="coach-card-actions">
                  <button
                    className="btn-primary"
                    style={{ marginTop: 0 }}
                    onClick={() => copyPlan(p)}
                  >
                    {L('העתק אלי', 'Copy to me')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
