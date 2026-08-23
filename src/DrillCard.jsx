import { toast } from './toast'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Star, Bookmark, BookOpen, X, Clock, Users, Package, Gauge, Plus, Pencil, Share2, Send, PlayCircle } from 'lucide-react'
import { waShare, drillLink } from './share'
import { supabase } from './supabaseClient'
import { L, tr, trTeam , cnt } from './i18n'
import { PLAYER_SIDE } from './flags'
import { confirmDialog } from './confirm'
import { safeUrl } from './constants'
import { useSignedMediaUrl } from './SignedImg'
import TacticsBoard from './TacticsBoard'
import CourtDiagram from './CourtDiagram'
import NotebookPage from './NotebookPage'
import useFocusTrap from './useFocusTrap'

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
  onAddToPlan,
  onSend,
  onEdit,
}) {
  // ----- תגובות -----
  const [expanded, setExpanded] = useState(false) // תצוגה מלאה (מחברת + אנימציה) או קומפקטית
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [loadingC, setLoadingC] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [sendingC, setSendingC] = useState(false)

  // תמונת התרגיל מוגשת דרך signed URL, ורק כשהפאנל פתוח (אין טעם לחתום
  // תמונה שלא מוצגת). כשהחתימה נכשלת — התמונה פשוט לא מוצגת.
  const { url: imageSrc, onError: onImageError } = useSignedMediaUrl(
    expanded ? drill.image_url : null
  )

  // הפאנל הצף: Escape ומלכודת הפוקוס מגיעים מ-useFocusTrap (הפוקוס נשאר
  // בתוך הפאנל וחוזר לכפתור בסגירה), וכאן רק נעילת גלילת הרקע.
  const overlayRef = useFocusTrap(expanded, () => setExpanded(false))

  useEffect(() => {
    if (!expanded) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [expanded])

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
    if (!(await confirmDialog({ message: L('למחוק את התגובה?', 'Delete this comment?'), danger: true }))) return
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
    <>
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

      {/* תצוגה קומפקטית — נשארת ברשימה גם כשהפאנל הצף פתוח */}
      <div className="drill-compact">
          {/* מסך 5a — תרשים חצי-מגרש אמיתי כתמונה ממוזערת בקצה הכרטיס */}
          {hasBoard && (
            <span className="drill-thumb" aria-hidden="true">
              {/* portrait חייב לעבור: בלעדיו לוח «לאורך» צויר במערכת צירים
                  אחרת — השחקנים והדיו נחתו מחוץ למגרש בתמונה הממוזערת */}
              <CourtDiagram full={!!drill.board.fullCourt} portrait={!!drill.board.portrait} step={drill.board.steps[0]} index={0} />
            </span>
          )}
          <div className="drill-compact-head">
            <h3 className="drill-compact-title">{drill.title}</h3>
            {drill.category && (
              <span className="cat-badge" data-cat={drill.category}>{tr(drill.category)}</span>
            )}
            {/* מפרט המסמך: תג שמציין לוח טקטיקה מונפש ומספר השלבים */}
            {hasBoard && (
              <span className="board-badge">
                <PlayCircle size={12} aria-hidden="true" />
                {L(`לוח מונפש · ${drill.board.steps.length} שלבים`, `Animated board · ${drill.board.steps.length} steps`)}
              </span>
            )}
            {count > 0 && (
              <span className="drill-rating-pill" title={L(`ממוצע של ${cnt(count, 'דירוג אחד', 'דירוגים')}`, `Average of ${count} ratings`)}>
                <Star size={13} fill="currentColor" strokeWidth={0} />
                <bdi>{avg.toFixed(1)}</bdi>
              </span>
            )}
          </div>
          {(drill.duration_minutes || drill.players || drill.equipment || drill.difficulty) && (
            <div className="drill-meta-line">
              {drill.duration_minutes && (
                <span className="meta-item">
                  <Clock size={14} aria-hidden="true" />
                  <bdi>{drill.duration_minutes}</bdi> {L('דק׳', 'min')}
                </span>
              )}
              {drill.players && (
                <span className="meta-item">
                  <Users size={14} aria-hidden="true" /> {drill.players}
                </span>
              )}
              {drill.equipment && (
                <span className="meta-item">
                  <Package size={14} aria-hidden="true" /> {drill.equipment}
                </span>
              )}
              {drill.difficulty && (
                <span className="meta-item">
                  <Gauge size={14} aria-hidden="true" /> {tr(drill.difficulty)}
                </span>
              )}
            </div>
          )}
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
          {/* היררכיה: פתיחת התרגיל היא הפעולה הראשית (כתום מלא), והוספה לתוכנית
              ושליחה לשחקנים הן משניות. קודם לכן שני כפתורי outline כתומים זהים
              התחרו זה בזה, והכפתור הפחות חשוב היה הרחב מכולם. */}
          <div className="drill-foot">
            <button className="btn-primary btn-details" onClick={() => setExpanded(true)}>
              <BookOpen size={15} aria-hidden="true" /> {L('פתח תרגיל', 'Open drill')}
              
            </button>
            {onAddToPlan && (
              <button className="btn-toplan" onClick={() => onAddToPlan(drill)} title={L('הוספה לתוכנית אימון', 'Add to a training plan')}>
                <Plus size={15} /> {L('לתוכנית', 'To plan')}
              </button>
            )}
            {onSend && (
              /* צד המאמן בלבד: התרגיל נרשם כמשימה ברשימה של המאמן, לא «נשלח» */
              <button className="btn-toplan secondary" onClick={() => onSend(drill)} title={PLAYER_SIDE ? L('שליחה לשחקנים', 'Send to players') : L('רישום כמשימה לשחקנים', 'Log as a task for players')}>
                <Send size={15} /> {PLAYER_SIDE ? L('לשחקנים', 'To players') : L('כמשימה', 'As a task')}
              </button>
            )}
            <button
              className={isSaved ? 'drill-bookmark on' : 'drill-bookmark'}
              onClick={() => onToggleSave(drill.id, isSaved)}
              aria-label={isSaved ? L('הסר ממועדפים', 'Remove from favorites') : L('שמירה למועדפים', 'Save to favorites')}
              title={isSaved ? L('נשמר', 'Saved') : L('שמירה', 'Save')}
            >
              <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
    </div>

    {/* תצוגה מלאה — פאנל צף מעל הרשימה (מחברת + מגרש מונפש), במקום לנפח את הכרטיס */}
    {expanded && createPortal(
      <div className="drill-overlay" onClick={() => setExpanded(false)}>
        <div ref={overlayRef} className="drill-overlay-panel drill-card is-expanded" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={drill.title}>
          <button className="drill-overlay-x" onClick={() => setExpanded(false)} aria-label={L('סגור', 'Close')}>
            <X size={18} />
          </button>
          <div className={hasBoard ? 'drill-notebook-view' : ''}>
            <NotebookPage
              kind="drill"
              drill={drill}
              club={drill.author?.club}
              coachName={authorName}
            />
            {hasBoard && (
              <div className="dnv-court">
                <span className="detail-label">{L('על המגרש (נגן אנימציה)', 'On court (play animation)')}</span>
                <TacticsBoard value={drill.board} readOnly autoPlay />
              </div>
            )}
          </div>
          {imageSrc && (
            <a className="drill-image" href={imageSrc} target="_blank" rel="noopener noreferrer">
              <img src={imageSrc} alt={drill.title} loading="lazy" onError={onImageError} />
            </a>
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
          {drill.is_public !== false && (
            <button
              className="btn-ghost"
              onClick={() => waShare(L(
                `🏀 תרגיל מ-CourtSide: ${drill.title}\n${drillLink(drill.id)}`,
                `🏀 A drill from CourtSide: ${drill.title}\n${drillLink(drill.id)}`
              ))}
              title={L('שיתוף בוואטסאפ', 'Share on WhatsApp')}
            >
              <Share2 size={15} /> {L('שיתוף', 'Share')}
            </button>
          )}
          {isMine && onEdit && (
            <button className="btn-ghost" onClick={() => onEdit(drill)}>
              <Pencil size={15} /> {L('עריכה', 'Edit')}
            </button>
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
      </div>,
      document.body
    )}
    </>
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
