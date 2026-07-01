import { toast } from './toast'
import { useState } from 'react'
import { Star, Bookmark, BookOpen, ChevronUp } from 'lucide-react'
import { supabase } from './supabaseClient'
import { L, tr, trTeam } from './i18n'
import { safeUrl } from './constants'
import TacticsBoard from './TacticsBoard'
import NotebookPage from './NotebookPage'

// כרטיס תרגיל לשימוש חוזר — מציג תרגיל אחד עם דירוג, שמירה, מחיקה ותגובות.
// בשימוש גם ב-DrillLibrary וגם ב-CoachProfile.
// props:
//   drill        - אובייקט התרגיל (כולל drill_ratings, saved_drills, author)
//   userId       - מזהה המשתמש המחובר (לדעת מה הדירוג שלי / אם שמרתי / תגובות שלי)
//   isMine       - האם זה תרגיל שאני יצרתי (מציג כפתור מחיקה)
//   onRate       - (drillId, rating) => לדרג
//   onToggleSave - (drillId, isSaved) => לשמור/להסיר ממועדפים
//   onDelete     - () => למחוק
export default function DrillCard({
  drill,
  userId,
  isMine,
  onRate,
  onToggleSave,
  onDelete,
  onTagClick,
}) {
  // ----- תגובות -----
  const [expanded, setExpanded] = useState(false) // תצוגה מלאה (מחברת + אנימציה) או קומפקטית
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [loadingC, setLoadingC] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [sendingC, setSendingC] = useState(false)

  const loadComments = async () => {
    setLoadingC(true)
    const { data } = await supabase
      .from('drill_comments')
      .select('*, user:profiles(first_name, last_name)')
      .eq('drill_id', drill.id)
      .order('created_at', { ascending: true })
    setComments(data || [])
    setLoadingC(false)
  }

  const toggleComments = () => {
    const open = !showComments
    setShowComments(open)
    if (open) loadComments()
  }

  const addComment = async () => {
    if (!newComment.trim()) return
    setSendingC(true)
    const { error } = await supabase
      .from('drill_comments')
      .insert({ drill_id: drill.id, user_id: userId, content: newComment.trim() })
    setSendingC(false)
    if (error) {
      toast.error(L('שליחת התגובה נכשלה: ', 'Sending comment failed: ') + error.message)
      return
    }
    setNewComment('')
    loadComments()
  }

  const deleteComment = async (id) => {
    if (!window.confirm(L('למחוק את התגובה?', 'Delete this comment?'))) return
    const { error } = await supabase.from('drill_comments').delete().eq('id', id)
    if (error) {
      toast.error(L('מחיקת התגובה נכשלה: ', 'Deleting comment failed: ') + error.message)
      return
    }
    toast.success(L('התגובה נמחקה', 'Comment deleted'))
    loadComments()
  }

  // ----- דירוג -----
  const ratings = drill.drill_ratings || []
  const count = ratings.length
  const avg = count
    ? ratings.reduce((sum, r) => sum + r.rating, 0) / count
    : 0
  const myRating = ratings.find((r) => r.user_id === userId)?.rating || 0

  // האם שמרתי את התרגיל הזה למועדפים
  const isSaved = (drill.saved_drills || []).length > 0

  const authorName = drill.author
    ? `${drill.author.first_name || ''} ${drill.author.last_name || ''}`.trim()
    : ''

  // יש לוח טקטיקה? אם כן — מציגים כתוב + מגרש מונפש צד-בצד
  const hasBoard = drill.board && drill.board.steps && drill.board.steps.length > 0

  return (
    <div className="drill-card">
      {/* תגיות + סטטוס פרטי (הכותרת והפרטים כבר בתוך המחברת) */}
      {(drill.is_public === false || (drill.tags && drill.tags.length > 0)) && (
        <div className="drill-toprow">
          {drill.is_public === false && (
            <span className="cat-badge private-badge">{L('פרטי', 'Private')}</span>
          )}
          {(drill.tags || []).map((t) =>
            onTagClick ? (
              <button
                key={t}
                type="button"
                className="chip tag-pill"
                onClick={() => onTagClick(t)}
              >
                #{t}
              </button>
            ) : (
              <span key={t} className="chip tag-pill static">
                #{t}
              </span>
            )
          )}
        </div>
      )}

      {!expanded ? (
        /* תצוגה קומפקטית — כותרת, קטגוריה, שכבות, וקצה מהתיאור */
        <div className="drill-compact">
          <div className="drill-compact-head">
            <h3 className="drill-compact-title">{drill.title}</h3>
            {drill.category && <span className="cat-badge">{tr(drill.category)}</span>}
          </div>
          {drill.age_groups && drill.age_groups.length > 0 && (
            <div className="drill-compact-ages">
              {drill.age_groups.map((g) => (
                <span key={g} className="mini-tag">{trTeam(g)}</span>
              ))}
            </div>
          )}
          {(drill.description || drill.goal) && (
            <p className="drill-compact-desc">{drill.description || drill.goal}</p>
          )}
          <button className="btn-soft drill-expand-btn" onClick={() => setExpanded(true)}>
            <BookOpen size={15} /> {L('פתח תרגיל מלא', 'Open full drill')}
            {hasBoard && L(' + אנימציה', ' + animation')}
          </button>
        </div>
      ) : (
        /* תצוגה מלאה — מחברת המאמן (ימין) + מגרש מונפש (שמאל) */
        <>
          <button className="link-button" onClick={() => setExpanded(false)}>
            <ChevronUp size={15} /> {L('הסתר', 'Collapse')}
          </button>
          <div className={hasBoard ? 'drill-notebook-view' : ''}>
            <NotebookPage
              kind="drill"
              drill={drill}
              club={drill.author?.club}
              coachName={authorName}
              noCourt
            />
            {hasBoard && (
              <div className="dnv-court">
                <span className="detail-label">{L('על המגרש (נגן אנימציה)', 'On court (play animation)')}</span>
                <TacticsBoard value={drill.board} readOnly />
              </div>
            )}
          </div>
          {safeUrl(drill.image_url) && (
            <a className="drill-image" href={safeUrl(drill.image_url)} target="_blank" rel="noopener noreferrer">
              <img src={safeUrl(drill.image_url)} alt={drill.title} loading="lazy" />
            </a>
          )}
        </>
      )}

      {/* דירוג: ממוצע + הדירוג האישי שלי */}
      <div className="drill-rating">
        <div className="rating-summary">
          {count > 0 ? (
            <>
              <span className="rating-avg">
                <Star size={15} fill="currentColor" strokeWidth={0} /> {avg.toFixed(1)}
              </span>
              <span className="muted small">
                ({count} {count === 1 ? L('דירוג', 'rating') : L('דירוגים', 'ratings')})
              </span>
            </>
          ) : (
            <span className="muted small">{L('עדיין אין דירוגים', 'No ratings yet')}</span>
          )}
        </div>
        <div className="rating-mine">
          <span className="muted small">{L('הדירוג שלי:', 'My rating:')}</span>
          <StarRating value={myRating} onRate={(n) => onRate(drill.id, n)} />
        </div>
      </div>

      <div className="drill-card-footer">
        <span className="muted small">
          {authorName ? L(`נוסף ע״י ${authorName}`, `Added by ${authorName}`) : L('מאמן לא ידוע', 'Unknown coach')}
        </span>
        <div className="drill-actions">
          <button
            className={isSaved ? 'btn-ghost save saved' : 'btn-ghost save'}
            onClick={() => onToggleSave(drill.id, isSaved)}
          >
            <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
            {isSaved ? L('נשמר', 'Saved') : L('שמירה', 'Save')}
          </button>
          {safeUrl(drill.video_url) && (
            <a
              className="btn-ghost"
              href={safeUrl(drill.video_url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {L('סרטון', 'Video')}
            </a>
          )}
          {isMine && (
            <button className="btn-ghost danger" onClick={onDelete}>
              {L('מחק', 'Delete')}
            </button>
          )}
        </div>
      </div>

      {/* תגובות */}
      <div className="drill-comments">
        <button className="link-button" onClick={toggleComments}>
          {showComments ? L('הסתר תגובות', 'Hide comments') : L('תגובות', 'Comments')}
        </button>

        {showComments && (
          <div className="comments-panel">
            {loadingC ? (
              <p className="muted small">{L('טוען תגובות...', 'Loading comments...')}</p>
            ) : comments.length === 0 ? (
              <p className="muted small">{L('אין עדיין תגובות. היה הראשון להגיב!', 'No comments yet. Be the first to comment!')}</p>
            ) : (
              comments.map((c) => {
                const author = c.user
                  ? `${c.user.first_name || ''} ${c.user.last_name || ''}`.trim()
                  : ''
                return (
                  <div key={c.id} className="comment">
                    <div className="comment-head">
                      <span className="comment-author">{author || L('מאמן', 'Coach')}</span>
                      {c.user_id === userId && (
                        <button
                          className="comment-del"
                          onClick={() => deleteComment(c.id)}
                        >
                          {L('מחק', 'Delete')}
                        </button>
                      )}
                    </div>
                    <p className="comment-text">{c.content}</p>
                  </div>
                )
              })
            )}

            <div className="comment-add">
              <input
                className="finder-input"
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={L('כתוב תגובה...', 'Write a comment...')}
              />
              <button
                className="btn-primary"
                style={{ marginTop: 0 }}
                disabled={sendingC || !newComment.trim()}
                onClick={addComment}
              >
                {L('שלח', 'Send')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// שורת כוכבים שאפשר ללחוץ עליה (1 עד 5)
function StarRating({ value, onRate }) {
  return (
    <div className="stars" role="group" aria-label={L('הדירוג שלי', 'My rating')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          className={n <= value ? 'star on' : 'star'}
          onClick={() => onRate(n)}
          aria-label={L(`${n} כוכבים`, `${n} stars`)}
        >
          <Star size={18} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}
