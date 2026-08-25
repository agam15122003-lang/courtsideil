import { useState, useEffect, useRef, useCallback, memo } from 'react'
import {
  Heart,
  MessageCircle,
  ImagePlus,
  Send,
  Trash2,
  X,
  UsersRound,
  Database,
  MessagesSquare,
  GraduationCap,
  Baby,
  Users,
  Trophy,
  Target,
  Search,
  Share2,
} from 'lucide-react'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { uploadImage, mediaPath, FEED_THUMB } from './storage'
import SignedImg from './SignedImg'
import { sendNotification } from './notify'
import { waShare, copyText, inviteText } from './share'
import Avatar from './Avatar'
import ChatWindow from './ChatWindow'
import CoachOfWeek from './CoachOfWeek'
import { ChevronBack, ChevronFwd } from './DirIcon'
import { SkeletonConvos, SkeletonFeed } from './Skeleton'
import { L , cnt } from './i18n'
import { confirmDialog } from './confirm'
import useFocusTrap from './useFocusTrap'
import { safeUrl } from './constants'
import CourtArt from './CourtArt'

const MAX_IMAGES = 4
// ההודעות האחרונות **בערוץ הפתוח**. עד היום נשלפו 300 הודעות מכל הערוצים
// יחד ואז פוצלו בלקוח, כך שדי בערוץ אחד עמוס כדי שכל שאר הערוצים יוצגו
// ריקים («עדיין שקט בערוץ…») למרות שיש בהם עשרות הודעות במסד.
const CHAT_LIMIT = 300
const CHAT_COLS = 'id, user_id, channel, content, created_at'

// יחס גובה-רוחב לתאי התמונות בפיד. ב-CSS כבר מוגדר 4/3 לתאים הקטנים; כאן
// משלימים את התאים שנשארו בלי יחס (תמונה בודדת, והתמונה הרחבה בפוסט של שלוש)
// כדי שטעינת תמונה לא תזיז את הפיד (CLS).
function cellRatio(total, i) {
  if (total === 1) return { aspectRatio: '4 / 3' }
  if (total === 3 && i === 0) return { aspectRatio: '16 / 9' }
  return undefined
}

// ערוצי הצ'אט של הקהילה — לפי קטגוריה. המזהה נשמר במסד בעברית.
const CHANNELS = [
  { id: 'כללי', en: 'General', desc: ['דיבור פתוח על כל דבר', 'Open talk about anything'], Icon: MessagesSquare },
  { id: 'בית ספר לכדורסל', en: 'Basketball school', desc: ['גילאי היסודי — יסודות, משחק וכיף', 'Elementary ages — fundamentals, play and fun'], Icon: GraduationCap },
  { id: 'קטסל וילדים', en: 'Mini-basket & kids', desc: ['קטסל א׳-ב׳ וילדים', 'Mini-basket and kids teams'], Icon: Baby },
  { id: 'נערים ונוער', en: 'Youth', desc: ['נערים, נערות ונוער', 'Boys, girls and youth teams'], Icon: Users },
  { id: 'בוגרים', en: 'Seniors', desc: ['ליגות בוגרים ובוגרות', 'Senior leagues'], Icon: Trophy },
  { id: 'טקטיקה ואימון', en: 'Tactics & training', desc: ['מערכים, הגנות ושיטות אימון', 'Sets, defenses and training methods'], Icon: Target },
]
const channelName = (c) => L(c.id, c.en)

// סוגי פוסטים — נשמרים בעברית, צבע לפי פלטת הקטגוריות של ה-handoff
const POST_TYPES = [
  { id: 'שאלה', en: 'Question', cls: 'blue' },
  { id: 'טיפ', en: 'Tip', cls: 'green' },
  { id: 'וידאו', en: 'Video', cls: 'purple' },
  { id: 'משרה', en: 'Job', cls: 'navy' },
  { id: 'סקר', en: 'Poll', cls: 'orange' },
]
const typeOf = (id) => POST_TYPES.find((t) => t.id === id) || null

// זמן יחסי בסגנון פיד — "לפני 5 דק'", "לפני שעתיים", ומעבר ליום — תאריך
function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return L('עכשיו', 'now')
  if (min < 60) return L(`לפני ${min} דק'`, `${min}m ago`)
  const hrs = Math.round(min / 60)
  if (hrs < 24) return L(`לפני ${hrs} שע'`, `${hrs}h ago`)
  return new Date(ts).toLocaleDateString(L('he-IL', 'en-US'), {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function coachName(p) {
  if (!p) return L('מאמן', 'Coach')
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || L('מאמן', 'Coach')
}

// שגיאת "טבלה חסרה" של PostgREST
const isMissingTable = (error) =>
  error.code === '42P01' ||
  /relation .* does not exist|could not find the table/i.test(error.message || '')
// שגיאת "עמודה חסרה" (למשל channel/post_type לפני הרצת ה-SQL)
const isMissingColumn = (error) =>
  error.code === '42703' || error.code === 'PGRST204' ||
  /column .* does not exist|could not find the .* column/i.test(error.message || '')

// כרטיס הsetup — מוצג כשחסר משהו במסד, עם שם הקובץ שצריך להריץ
// ⚠ המסך הזה נראה על ידי **מאמנים**, לא על ידי מי שמתחזק את המסד.
// עד 24.8 הוא הציג «פתח את Supabase → SQL Editor ולחץ Run» — הוראה
// שאין למאמן שום דרך לבצע, והיא נראית כמו אתר שבור. שם הקובץ נשאר,
// אבל בקונסול בלבד, למי שבאמת מטפל בזה.
function SetupCard({ file, onRetry }) {
  useEffect(() => { console.warn('CourtSide: חסרה מיגרציה —', file) }, [file])
  return (
    <div className="empty-state">
      <span className="empty-ic"><Database size={26} /></span>
      <div className="empty-title">{L('המסך הזה עדיין לא זמין', 'This screen is not available yet')}</div>
      <p className="muted small" style={{ maxWidth: 480 }}>
        {L('אנחנו עוד מסיימים להפעיל את החלק הזה. נסה שוב בעוד רגע — ואם זה נמשך, כתוב לנו ונטפל.',
           'We are still switching this part on. Try again in a moment — and if it persists, drop us a line.')}
      </p>
      <button type="button" className="btn-primary empty-cta" onClick={onRetry}>
        {L('בדוק שוב', 'Check again')}
      </button>
    </div>
  )
}

// ---------- תגובות לפוסט ----------
function Comments({ post, myId, onChanged }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    const val = text.trim()
    if (!val || sending) return
    setSending(true)
    const { error } = await supabase
      .from('community_post_comments')
      .insert({ post_id: post.id, user_id: myId, content: val })
    setSending(false)
    if (error) {
      toast.error(L('שליחת התגובה נכשלה: ', 'Failed to comment: ') + error.message)
      return
    }
    sendNotification({
      to: post.user_id,
      actor: myId,
      type: 'comment',
      content: L(`הגיב על הפוסט שלך: "${val.slice(0, 60)}"`, `commented on your post: "${val.slice(0, 60)}"`),
      nav: 'community',
    })
    setText('')
    onChanged()
  }

  const remove = async (id) => {
    // מחיקת תגובה הייתה מיידית ובלתי הפיכה — הכפתור שקוף וזעיר, ובמגע קל
    // לפגוע בו בטעות. אותו שער בדיוק כמו במחיקת פוסט.
    if (!(await confirmDialog({ message: L('למחוק את התגובה?', 'Delete this comment?'), danger: true }))) return
    const { error } = await supabase.from('community_post_comments').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Failed to delete: ') + error.message)
      return
    }
    onChanged()
  }

  const comments = [...(post.comments || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  )

  return (
    <div className="cm-comments">
      {comments.map((c) => (
        <div key={c.id} className="cm-comment">
          <Avatar name={coachName(c.author)} url={c.author?.avatar_url} size={28} />
          <div className="cm-comment-bubble">
            <span className="cm-comment-name">{coachName(c.author)}</span>
            <span className="cm-comment-text">{c.content}</span>
          </div>
          {c.user_id === myId && (
            <button
              type="button"
              className="cm-comment-del"
              onClick={() => remove(c.id)}
              aria-label={L('מחיקת תגובה', 'Delete comment')}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      <div className="cm-comment-composer">
        <input
          className="finder-input cm-comment-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          maxLength={500}
          placeholder={L('כתוב תגובה...', 'Write a comment...')}
          aria-label={L('כתיבת תגובה', 'Write a comment')}
        />
        <button
          type="button"
          className="btn-send cm-comment-send"
          onClick={send}
          disabled={sending || !text.trim()}
          aria-label={L('שליחת תגובה', 'Send comment')}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------- סקר בתוך פוסט ----------
function Poll({ post, myId, onChanged }) {
  const opts = post.poll_options || []
  const votes = post.poll_votes || []
  const myVote = votes.find((v) => v.user_id === myId)
  const total = votes.length

  const vote = async (idx) => {
    if (myVote && myVote.option_idx === idx) {
      // לחיצה חוזרת על הבחירה שלי — ביטול ההצבעה
      const { error } = await supabase
        .from('community_poll_votes')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', myId)
      if (error) { toast.error(L('הפעולה נכשלה: ', 'Action failed: ') + error.message); return }
    } else {
      const { error } = await supabase
        .from('community_poll_votes')
        .upsert({ post_id: post.id, user_id: myId, option_idx: idx }, { onConflict: 'post_id,user_id' })
      if (error) { toast.error(L('ההצבעה נכשלה: ', 'Vote failed: ') + error.message); return }
      if (!myVote) {
        sendNotification({
          to: post.user_id, actor: myId, type: 'poll',
          content: L('הצביע בסקר שלך', 'voted in your poll'), nav: 'community',
        })
      }
    }
    onChanged()
  }

  return (
    <div className="cm-poll" role="group" aria-label={L('סקר', 'Poll')}>
      {opts.map((opt, i) => {
        const count = votes.filter((v) => v.option_idx === i).length
        const pct = total ? Math.round((count / total) * 100) : 0
        const mine = myVote?.option_idx === i
        return (
          <button
            key={i}
            type="button"
            className={mine ? 'cm-poll-opt mine' : 'cm-poll-opt'}
            onClick={() => vote(i)}
            aria-pressed={mine}
          >
            <span className="cm-poll-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
            <span className="cm-poll-label">
              {mine && <span className="cm-poll-check" aria-hidden="true">✓</span>}
              {opt}
            </span>
            <span className="cm-poll-pct">{pct}%</span>
          </button>
        )
      })}
      <span className="cm-poll-total muted small">
        {total === 1 ? L('הצבעה אחת', '1 vote') : L(`${total} הצבעות`, `${total} votes`)}
        {myVote != null && ' · ' + L('לחיצה על הבחירה שלך מבטלת', 'tap your choice to undo')}
      </span>
    </div>
  )
}

// ---------- פוסט בודד ----------
// ממומו: בלי memo כל רענון שקט של הפיד (וכל שינוי סינון/מיון) רינדר מחדש
// את כל הכרטיסים — כולל התמונות, הסקרים והתגובות שבתוכם.
const PostCard = memo(function PostCard({ post, myId, onChanged, onDeleted }) {
  const [showComments, setShowComments] = useState(false)
  const [lightbox, setLightbox] = useState(null) // URL של תמונה מוגדלת
  // מלכודת פוקוס מלאה ללייטבוקס: Escape, Tab שנשאר בתוך הדיאלוג, והחזרת
  // הפוקוס לתמונה שממנה נפתח. קודם היה כאן פוקוס ידני + Escape בלבד,
  // כך ש-aria-modal="true" היה הצהרה לא נכונה (המקלדת המשיכה ברקע).
  const lightboxRef = useFocusTrap(!!lightbox, () => setLightbox(null))

  // [35] לייטבוקס נגיש — הפוקוס, Escape והלכידה מגיעים מ-useFocusTrap למעלה
  const likes = post.likes || []
  const iLiked = likes.some((l) => l.user_id === myId)
  const comments = post.comments || []
  const ptype = typeOf(post.post_type)

  // לייק אופטימי — הלב מגיב מיד, הרענון ברקע
  const [optimistic, setOptimistic] = useState(null) // null | {liked, delta}
  const liked = optimistic ? optimistic.liked : iLiked
  const likeCount = likes.length + (optimistic ? optimistic.delta : 0)

  const toggleLike = async () => {
    const next = !liked
    setOptimistic({ liked: next, delta: next === iLiked ? 0 : next ? 1 : -1 })
    const { error } = next
      ? await supabase.from('community_post_likes').insert({ post_id: post.id, user_id: myId })
      : await supabase
          .from('community_post_likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', myId)
    if (error) {
      setOptimistic(null)
      toast.error(L('הפעולה נכשלה: ', 'Action failed: ') + error.message)
      return
    }
    if (next) {
      sendNotification({
        to: post.user_id,
        actor: myId,
        type: 'like',
        content: L('אהב את הפוסט שלך ❤️', 'liked your post ❤️'),
        nav: 'community',
      })
    }
    await onChanged()
    setOptimistic(null)
  }

  const remove = async () => {
    if (!(await confirmDialog({ message: L('למחוק את הפוסט?', 'Delete this post?'), danger: true }))) return
    const { error } = await supabase.from('community_posts').delete().eq('id', post.id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Failed to delete: ') + error.message)
      return
    }
    toast.success(L('הפוסט נמחק', 'Post deleted'))
    onDeleted()
  }

  const share = async () => {
    const text = `${coachName(post.author)} — CourtSide:\n${post.content || ''}`.trim()
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        toast.success(L('הפוסט הועתק — אפשר להדביק בכל מקום', 'Copied — paste it anywhere'))
      }
    } catch { /* המשתמש ביטל — לא שגיאה */ }
  }

  // נתיב בתוך ה-bucket (חדש) או כתובת http(s) ישנה — הגנה מפני שורות
  // שהוזרקו ישירות ל-API. ההגשה עצמה נעשית ב-SignedImg דרך signed URL.
  const imgs = (post.image_urls || [])
    .map((u) => mediaPath(u) || safeUrl(u))
    .filter(Boolean)

  return (
    <article className="cm-post">
      <header className="cm-post-head">
        <Avatar name={coachName(post.author)} url={post.author?.avatar_url} size={42} />
        <div className="cm-post-who">
          <span className="cm-post-name">{coachName(post.author)}</span>
          <span className="cm-post-meta">
            {post.author?.club ? `${post.author.club} · ` : ''}
            {timeAgo(post.created_at)}
          </span>
        </div>
        {ptype && <span className={`cm-type-tag t-${ptype.cls}`}>{L(ptype.id, ptype.en)}</span>}
        {post.user_id === myId && (
          <button
            type="button"
            className="cm-post-del"
            onClick={remove}
            aria-label={L('מחיקת פוסט', 'Delete post')}
            title={L('מחיקה', 'Delete')}
          >
            <Trash2 size={15} />
          </button>
        )}
      </header>

      {post.content && <p className="cm-post-text">{post.content}</p>}

      {(post.poll_options || []).length >= 2 && (
        <Poll post={post} myId={myId} onChanged={onChanged} />
      )}

      {imgs.length > 0 && (
        <div className={`cm-post-imgs n${Math.min(imgs.length, 4)}`}>
          {imgs.slice(0, 4).map((u, i) => (
            <button
              key={i}
              type="button"
              className="cm-post-img"
              onClick={() => setLightbox(u)}
              aria-label={L('הגדלת תמונה', 'Enlarge photo')}
            >
              {/* יחס קבוע לתאים שאין להם יחס ב-CSS — התמונה לא מזיזה את הפיד בטעינה */}
              <SignedImg
                src={u}
                transform={FEED_THUMB}
                alt={L('תמונה מהאימון', 'Practice photo')}
                style={cellRatio(imgs.length, i)}
              />
            </button>
          ))}
        </div>
      )}

      <footer className="cm-post-actions">
        <button
          type="button"
          className={liked ? 'cm-action liked' : 'cm-action'}
          onClick={toggleLike}
        >
          <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
          {likeCount > 0 ? likeCount : L('אהבתי', 'Like')}
        </button>
        <button
          type="button"
          className={showComments ? 'cm-action open' : 'cm-action'}
          onClick={() => setShowComments((v) => !v)}
        >
          <MessageCircle size={17} />
          {comments.length > 0
            ? L(`${cnt(comments.length, 'תגובה אחת', 'תגובות')}`, `${comments.length} comments`)
            : L('תגובה', 'Comment')}
        </button>
        <button type="button" className="cm-action" onClick={share}>
          <Share2 size={16} />
          {L('שיתוף', 'Share')}
        </button>
      </footer>

      {showComments && <Comments post={post} myId={myId} onChanged={onChanged} />}

      {lightbox && (
        <div ref={lightboxRef} className="cm-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label={L('תמונה מוגדלת', 'Enlarged photo')}>
          <button
            type="button"
            className="cm-lightbox-close"
            onClick={() => setLightbox(null)}
            aria-label={L('סגירה', 'Close')}
          >
            <X size={22} />
          </button>
          <SignedImg
            src={lightbox}
            alt={L('תמונה מהאימון', 'Practice photo')}
            loading="eager"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </article>
  )
})

// ---------- קומפוזר — רכיב נפרד עם ה-state שלו ----------
// היה חלק מ-Feed, ולכן כל תו שהוקלד בתיבת הפוסט רינדר מחדש את כל הפיד
// (עד 100 כרטיסים עם תמונות, לייקים ותגובות). עכשיו ההקלדה נשארת כאן.
const Composer = memo(function Composer({ myId, profile, onPosted }) {
  const [text, setText] = useState('')
  const [ptype, setPtype] = useState('') // סוג הפוסט הנבחר (לא חובה)
  const [pollOpts, setPollOpts] = useState(['', '']) // אפשרויות סקר (עד 4)
  const [images, setImages] = useState([]) // [{file, url(preview)}]
  const [posting, setPosting] = useState(false)
  const fileRef = useRef(null)
  const taRef = useRef(null)

  const pickImages = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // מאפשר לבחור שוב את אותו קובץ
    const room = MAX_IMAGES - images.length
    if (files.length > room) {
      toast.error(L(`אפשר לצרף עד ${MAX_IMAGES} תמונות לפוסט`, `Up to ${MAX_IMAGES} photos per post`))
    }
    const next = files.slice(0, Math.max(0, room)).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }))
    setImages((cur) => [...cur, ...next])
  }

  const removeImage = (i) => {
    setImages((cur) => {
      URL.revokeObjectURL(cur[i]?.url)
      return cur.filter((_, x) => x !== i)
    })
  }

  const isPoll = ptype === 'סקר'
  const filledOpts = pollOpts.map((o) => o.trim()).filter(Boolean)

  const publish = async () => {
    const content = text.trim()
    if ((!content && images.length === 0) || posting) return
    if (isPoll && filledOpts.length < 2) {
      toast.error(L('סקר צריך לפחות שתי אפשרויות', 'A poll needs at least two options'))
      return
    }
    setPosting(true)
    try {
      const urls = []
      for (const img of images) {
        urls.push(await uploadImage(img.file, 'community', myId))
      }
      const row = {
        user_id: myId,
        content: content || null,
        image_urls: urls.length ? urls : null,
      }
      const extras = {}
      if (ptype) extras.post_type = ptype
      if (isPoll) extras.poll_options = filledOpts
      let { error } = await supabase
        .from('community_posts')
        .insert(Object.keys(extras).length ? { ...row, ...extras } : row)
      // עמודות חדשות עוד לא קיימות במסד — מפרסמים בלעדיהן במקום להיכשל
      if (error && Object.keys(extras).length && isMissingColumn(error)) {
        ;({ error } = await supabase.from('community_posts').insert(row))
        if (!error && isPoll) toast.error(L('הסקר פורסם כפוסט רגיל — הפעלת סקרים דורשת עדכון קטן במסד', 'Posted as a regular post — polls need a small DB update'))
      }
      if (error) throw error
      images.forEach((img) => URL.revokeObjectURL(img.url))
      setImages([])
      setText('')
      setPtype('')
      setPollOpts(['', ''])
      if (taRef.current) taRef.current.style.height = 'auto'
      toast.success(L('הפוסט פורסם לקהילה 🎉', 'Posted to the community 🎉'))
      onPosted()
    } catch (err) {
      toast.error(L('הפרסום נכשל: ', 'Failed to post: ') + (err.message || ''))
    } finally {
      setPosting(false)
    }
  }

  const firstName = profile?.first_name || L('מאמן', 'Coach')

  return (
    <div className="cm-composer">
      <Avatar
        name={`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || L('מאמן', 'Coach')}
        url={profile?.avatar_url}
        size={42}
      />
      <div className="cm-composer-main">
        <textarea
          ref={taRef}
          className="cm-composer-input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onInput={(e) => {
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
          }}
          maxLength={2000}
          placeholder={L(`מה קורה באימונים שלך, ${firstName}?`, `What's happening at practice, ${firstName}?`)}
          aria-label={L('כתיבת פוסט', 'Write a post')}
        />
        {images.length > 0 && (
          <div className="cm-composer-previews">
            {images.map((img, i) => (
              <div key={img.url} className="cm-preview">
                {/* תצוגה מקדימה מקומית (blob) — נטענת עצלה ובמידות קבועות */}
                <img src={img.url} alt="" loading="lazy" width={84} height={84} />
                <button
                  type="button"
                  className="cm-preview-x"
                  onClick={() => removeImage(i)}
                  aria-label={L('הסרת תמונה', 'Remove photo')}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* אפשרויות סקר — מופיעות כשבוחרים סוג "סקר" */}
        {isPoll && (
          <div className="cm-poll-editor">
            {pollOpts.map((opt, i) => (
              <input
                key={i}
                className="finder-input"
                value={opt}
                onChange={(e) => setPollOpts((cur) => cur.map((o, x) => (x === i ? e.target.value : o)))}
                placeholder={L(`אפשרות ${i + 1}${i < 2 ? '' : ' (לא חובה)'}`, `Option ${i + 1}${i < 2 ? '' : ' (optional)'}`)}
                maxLength={80}
              />
            ))}
            {pollOpts.length < 4 && (
              <button type="button" className="link-button" onClick={() => setPollOpts((cur) => [...cur, ''])}>
                + {L('הוספת אפשרות', 'Add option')}
              </button>
            )}
          </div>
        )}

        {/* סוג הפוסט — chips צבעוניים לפי הקטגוריה */}
        <div className="cm-type-row">
          {POST_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={ptype === t.id ? `cm-type-chip t-${t.cls} on` : 'cm-type-chip'}
              onClick={() => setPtype((cur) => (cur === t.id ? '' : t.id))}
            >
              {L(t.id, t.en)}
            </button>
          ))}
        </div>
        <div className="cm-composer-bar">
          <button
            type="button"
            className="cm-attach"
            onClick={() => fileRef.current?.click()}
            disabled={images.length >= MAX_IMAGES}
          >
            <ImagePlus size={18} />
            {L('צילומים מהאימון', 'Practice photos')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={pickImages}
          />
          <button
            type="button"
            className="btn-primary cm-publish"
            onClick={publish}
            disabled={posting || (!text.trim() && images.length === 0)}
            aria-busy={posting}
          >
            {posting && <span className="btn-spinner" aria-hidden="true" />}
            {posting ? L('מפרסם...', 'Posting...') : L('פרסום', 'Post')}
          </button>
        </div>
      </div>
    </div>
  )
})

// ---------- הפיד ----------
function Feed({ session, profile, search, onCount }) {
  const myId = session.user.id
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sqlMissing, setSqlMissing] = useState(false)
  const [filter, setFilter] = useState('') // '' = הכול, אחרת סוג פוסט
  const [sortBy, setSortBy] = useState('new') // 'new' | 'top' (לפי לייקים+תגובות)

  async function load(opts = {}) {
    if (!opts.silent) setLoading(true)
    // profiles!user_id — מציין את עמודת הקשר במפורש, כדי למנוע שגיאת
    // "more than one relationship" אם קיימים כמה מפתחות-זר בין הטבלאות
    const baseSelect =
      '*, author:profiles!user_id(first_name, last_name, club, avatar_url), likes:community_post_likes(user_id), comments:community_post_comments(id, user_id, content, created_at, author:profiles!user_id(first_name, last_name, avatar_url))'
    let { data, error } = await supabase
      .from('community_posts')
      .select(baseSelect + ', poll_votes:community_poll_votes(user_id, option_idx)')
      .order('created_at', { ascending: false })
      .limit(100)

    // טבלת הסקרים עוד לא נוצרה — הפיד ממשיך לעבוד בלעדיה
    if (error && isMissingTable(error)) {
      ;({ data, error } = await supabase
        .from('community_posts')
        .select(baseSelect)
        .order('created_at', { ascending: false })
        .limit(100))
    }

    if (error) {
      if (isMissingTable(error)) {
        setSqlMissing(true)
      } else if (!opts.silent) {
        setError(L('שגיאה בטעינת הקהילה: ', 'Failed to load the community: ') + error.message)
      }
      if (!opts.silent) setLoading(false)
      return
    }
    setSqlMissing(false)
    setError(null)
    setPosts(data || [])
    if (onCount) onCount((data || []).length)
    if (!opts.silent) setLoading(false)
  }

  // ה-props של הרכיבים הממומואים חייבים להישאר יציבים, ולכן load מגיע
  // אליהם דרך ref ולא ב-closure
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // רענון שקט יציב — יורד כ-prop לקומפוזר ולכרטיסי הפוסטים הממומואים
  const refresh = useCallback(() => { loadRef.current({ silent: true }) }, [])

  if (sqlMissing) return <SetupCard file="supabase_community.sql" onRetry={() => load()} />

  // סינון לפי חיפוש (מההירו) ולפי סוג הפוסט + מיון (חדש/מדובר)
  const q = (search || '').trim().toLowerCase()
  const engagement = (p) => (p.likes?.length || 0) + (p.comments?.length || 0) + (p.poll_votes?.length || 0)
  const visible = posts
    .filter((p) => {
      const typeOk = !filter || p.post_type === filter
      if (!typeOk) return false
      if (!q) return true
      const hay = `${p.content || ''} ${coachName(p.author)} ${p.author?.club || ''}`.toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) =>
      sortBy === 'top'
        ? engagement(b) - engagement(a) || new Date(b.created_at) - new Date(a.created_at)
        : 0
    )
  const countFor = (id) => posts.filter((p) => p.post_type === id).length

  return (
    <>
      {/* קומפוזר — פרסום פוסט חדש (רכיב נפרד: ההקלדה לא מרנדרת את הפיד) */}
      <Composer myId={myId} profile={profile} onPosted={refresh} />

      {/* מיון + chips סינון לפי סוג */}
      {posts.length > 1 && (
        <div className="cm-filter-row">
          <button
            type="button"
            className={sortBy === 'new' ? 'chip selected' : 'chip'}
            onClick={() => setSortBy('new')}
            aria-pressed={sortBy === 'new'}
          >
            {L('החדשים', 'Newest')}
          </button>
          <button
            type="button"
            className={sortBy === 'top' ? 'chip selected' : 'chip'}
            onClick={() => setSortBy('top')}
            aria-pressed={sortBy === 'top'}
          >
            {L('המדוברים', 'Top')}
          </button>
        </div>
      )}
      {posts.some((p) => p.post_type) && (
        <div className="cm-filter-row">
          <button
            type="button"
            className={!filter ? 'chip selected' : 'chip'}
            onClick={() => setFilter('')}
          >
            {L('הכל', 'All')} · {posts.length}
          </button>
          {POST_TYPES.filter((t) => countFor(t.id) > 0).map((t) => (
            <button
              key={t.id}
              type="button"
              className={filter === t.id ? 'chip selected' : 'chip'}
              onClick={() => setFilter((cur) => (cur === t.id ? '' : t.id))}
            >
              {L(t.id, t.en)} · {countFor(t.id)}
            </button>
          ))}
        </div>
      )}

      {/* הפיד */}
      <div className="cm-feed">
        {loading ? (
          <SkeletonFeed count={3} />
        ) : error ? (
          <div className="alert alert-error">
            {error}
            <button type="button" className="link-button" style={{ marginTop: 8 }} onClick={() => load()}>
              {L('נסה שוב', 'Try again')}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ic"><UsersRound size={26} /></span>
            <div className="empty-title">
              {posts.length === 0
                ? L('הקהילה מחכה לפוסט הראשון', 'The community is waiting for its first post')
                : L('אין תוצאות לסינון', 'No results for this filter')}
            </div>
            <p className="muted small">
              {posts.length === 0
                ? L('שתפו תובנה מאימון, שאלה מקצועית או תמונה מהמגרש.', 'Share a practice insight, a coaching question or a photo from the court.')
                : L('נסו לשנות את החיפוש או הסינון.', 'Try changing the search or filter.')}
            </p>
          </div>
        ) : (
          visible.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              myId={myId}
              onChanged={refresh}
              onDeleted={refresh}
            />
          ))
        )}
      </div>
    </>
  )
}

// ---------- צ'אטים לפי קטגוריה ----------
function ChatsHub({ session, initialChannel, onConsumeInitial }) {
  const myId = session.user.id
  const [messages, setMessages] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [needsSql, setNeedsSql] = useState(false) // עמודת channel חסרה
  const [active, setActive] = useState(initialChannel || null) // ערוץ פתוח (id)
  const [sending, setSending] = useState(false)
  // תקציר לכל ערוץ לרשת הכרטיסים: { [channelId]: { last, fresh } }
  const [summary, setSummary] = useState({})
  // ה-handler של ה-Realtime נרשם פעם אחת ולכן אינו רואה state מתעדכן
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    if (initialChannel) {
      setActive(initialChannel)
      if (onConsumeInitial) onConsumeInitial()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChannel])

  // מיפוי שגיאת מסד לכרטיס ה-setup המתאים (טבלה/עמודה חסרה → קובץ SQL להרצה)
  function handleChatError(error, opts) {
    if (isMissingTable(error)) setNeedsSql('supabase_community_chat.sql')
    // רשימת עמודות מפורשת → עמודת channel חסרה מחזירה שגיאה במקום
    // שורות בלי השדה. אותו יעד בדיוק: מפנים להרצת ה-SQL.
    else if (isMissingColumn(error)) setNeedsSql('supabase_community2.sql')
    else if (!opts.silent) setError(L("שגיאה בטעינת הצ'אטים: ", 'Failed to load chats: ') + error.message)
    if (!opts.silent) setLoading(false)
  }

  // ---- ערוץ פתוח: שליפה מסוננת לערוץ הזה בלבד ----
  // ascending:false + limit = ההודעות ה*אחרונות*. עם ascending:true ה-limit
  // חתך את ההודעות הראשונות, וברגע שהטבלה עברה אותן הודעות חדשות פשוט
  // הפסיקו להופיע. הסינון ל-channel נעשה במסד, אחרת ה-limit מתמלא בערוץ אחר.
  async function loadChannel(ch, opts = {}) {
    if (!opts.silent) setLoading(true)
    const { data, error } = await supabase
      .from('community_messages')
      .select(CHAT_COLS)
      .eq('channel', ch)
      .order('created_at', { ascending: false })
      .limit(CHAT_LIMIT)

    if (error) { handleChatError(error, opts); return }

    const msgs = (data || []).reverse() // חזרה לסדר כרונולוגי לתצוגה
    // אם אין עמודת channel — ההודעות יגיעו בלעדיה; מפנים להרצת ה-SQL
    if (msgs.length > 0 && msgs[0].channel === undefined) {
      setNeedsSql('supabase_community2.sql')
      if (!opts.silent) setLoading(false)
      return
    }
    setNeedsSql(false)
    setMessages(msgs)
    setError(null)
    await fillProfiles(msgs.map((m) => m.user_id))
    if (!opts.silent) setLoading(false)
  }

  // ---- רשת הערוצים: הודעה אחרונה + מונה «חדש מאז הביקור» לכל ערוץ ----
  // שתי שאילתות זעירות לכל ערוץ (שורה אחת + count עם head) במקום שליפה של
  // 300 שורות עם תוכן. מספר הערוצים קבוע וקטן, ולכן זה זול יותר מהקודם.
  async function loadSummary(opts = {}) {
    if (!opts.silent) setLoading(true)
    const seen = readSeen()
    const results = await Promise.all(
      CHANNELS.map(async (c) => {
        const lastQ = supabase
          .from('community_messages')
          .select(CHAT_COLS)
          .eq('channel', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
        let countQ = supabase
          .from('community_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel', c.id)
        // בלי חותמת ביקור — «חדש» הוא כל מה שיש בערוץ
        if (seen[c.id]) countQ = countQ.gt('created_at', seen[c.id])
        const [lastRes, cntRes] = await Promise.all([lastQ, countQ])
        return {
          id: c.id,
          last: lastRes.data?.[0] || null,
          fresh: cntRes.count || 0,
          error: lastRes.error || cntRes.error || null,
        }
      })
    )

    const failed = results.find((r) => r.error)
    if (failed) { handleChatError(failed.error, opts); return }

    const next = {}
    for (const r of results) next[r.id] = { last: r.last, fresh: r.fresh }
    setNeedsSql(false)
    setSummary(next)
    setError(null)
    await fillProfiles(results.map((r) => r.last?.user_id).filter(Boolean))
    if (!opts.silent) setLoading(false)
  }

  // נקודת כניסה אחת: מה שנטען תלוי במה שמוצג כרגע
  async function load(opts = {}) {
    if (activeRef.current) return loadChannel(activeRef.current, opts)
    return loadSummary(opts)
  }
  // ה-polling וה-Realtime נרשמים פעם אחת — קוראים ל-load דרך ref כדי
  // שהם תמיד יריצו את הגרסה שמתאימה לערוץ הפתוח הנוכחי.
  const loadRef = useRef(load)
  loadRef.current = load

  // השלמת פרופילים רק למי שעוד לא ראינו — קודם נשלפו כל הפרופילים מחדש
  // בכל poll ובכל הודעה חדשה של מישהו אחר.
  const profilesRef = useRef({})
  async function fillProfiles(ids) {
    const missing = [...new Set(ids)].filter((id) => id && !profilesRef.current[id])
    if (!missing.length) return
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', missing)
    const next = { ...profilesRef.current }
    for (const p of profs || []) next[p.id] = p
    profilesRef.current = next
    setProfilesById(next)
  }

  // כניסה לערוץ / חזרה לרשת = שליפה אחרת לגמרי, ולכן טוענים מחדש בכל שינוי
  useEffect(() => {
    setMessages([]) // לא מציגים את ההודעות של הערוץ הקודם בזמן הטעינה
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // זמן-אמת: הודעה חדשה בערוץ מופיעה מיד (Realtime); polling איטי כגיבוי.
  // ה-INSERT מצרף את השורה מה-payload במקום לטעון את כל הצ'אט מחדש,
  // וה-polling עוצר כשהטאב ברקע (סוללה ו-egress).
  useEffect(() => {
    let channel = null
    try {
      channel = supabase
        .channel('community-messages-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'community_messages' },
          (p) => {
            const row = p.new
            const open = activeRef.current
            // ברשת הערוצים אין מה לצרף — מרעננים את התקצירים
            if (!open) { loadRef.current({ silent: true }); return }
            if (!row?.id) { loadRef.current({ silent: true }); return }
            // חובה לסנן: ה-state מחזיק עכשיו את הערוץ הפתוח בלבד, והודעה
            // מערוץ אחר הייתה נכנסת אליו ודוחפת ממנו הודעות אמיתיות.
            if ((row.channel || 'כללי') !== open) return
            setMessages((cur) => (cur.some((m) => m.id === row.id) ? cur : [...cur, row].slice(-CHAT_LIMIT)))
            fillProfiles([row.user_id])
          }
        )
        .subscribe()
    } catch { /* realtime לא זמין — ה-polling מכסה */ }
    const poll = () => { if (document.visibilityState === 'visible') loadRef.current({ silent: true }) }
    const t = setInterval(poll, 30000)
    const onVis = () => { if (document.visibilityState === 'visible') loadRef.current({ silent: true }) }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      if (channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // [38] "חדשות מאז הביקור האחרון" — נשמר פר-ערוץ ב-localStorage
  const SEEN_KEY = 'community-chan-seen-v1'
  const readSeen = () => {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} }
  }
  useEffect(() => {
    if (!active) return
    try {
      const seen = readSeen()
      seen[active] = new Date().toISOString()
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
    } catch { /* אחסון חסום — לא קריטי */ }
  }, [active, messages.length])

  const nameOf = (id) => coachName(profilesById[id])

  const send = async (text) => {
    setSending(true)
    const { error } = await supabase
      .from('community_messages')
      .insert({ user_id: myId, content: text, channel: active })
    setSending(false)
    if (error) {
      if (isMissingColumn(error)) {
        toast.error(L('הערוצים עוד לא הופעלו במערכת — נסו שוב מאוחר יותר.', 'Channels are not enabled yet — try again later.'))
      } else {
        toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + error.message)
      }
      return false
    }
    load({ silent: true })
    return true
  }

  const remove = async (id) => {
    if (!(await confirmDialog({ message: L('למחוק את ההודעה?', 'Delete this message?'), danger: true }))) return
    const { error } = await supabase.from('community_messages').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Failed to delete: ') + error.message)
      return
    }
    load({ silent: true })
  }

  if (needsSql) return <SetupCard file={needsSql} onRetry={() => load()} />
  if (loading) return <SkeletonConvos count={5} />
  if (error) {
    return (
      <div className="alert alert-error">
        {error}
        <button type="button" className="link-button" style={{ marginTop: 8 }} onClick={() => load()}>
          {L('נסה שוב', 'Try again')}
        </button>
      </div>
    )
  }

  // ---- ערוץ פתוח — צ'אט מלא ----
  if (active) {
    const ch = CHANNELS.find((c) => c.id === active) || CHANNELS[0]
    const norm = messages
      .filter((m) => (m.channel || 'כללי') === active)
      .map((m) => ({
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        senderId: m.user_id,
        senderName: nameOf(m.user_id),
      }))
    return (
      <ChatWindow
        messages={norm}
        myId={myId}
        onSend={send}
        onDelete={remove}
        sending={sending}
        loading={false}
        error={null}
        showAuthor
        header={
          <>
            <button
              type="button"
              className="chat-back"
              onClick={() => setActive(null)}
              aria-label={L('חזרה לכל הערוצים', 'Back to all channels')}
              title={L('חזרה', 'Back')}
            >
              <ChevronBack size={20} />
            </button>
            <span className="ch-chat-ic"><ch.Icon size={19} /></span>
            <span className="chat-header-text">
              <h2 className="chat-title">{channelName(ch)}</h2>
              <span className="chat-status">{L(ch.desc[0], ch.desc[1])}</span>
            </span>
          </>
        }
        empty={
          <div className="empty-state">
            <span className="empty-ic"><ch.Icon size={26} /></span>
            <div className="empty-title">{L(`עדיין שקט בערוץ ${ch.id}`, `It's quiet in ${ch.en} so far`)}</div>
            <p className="muted small">{L('כתבו את ההודעה הראשונה.', 'Write the first message.')}</p>
          </div>
        }
      />
    )
  }

  // ---- רשימת הערוצים ----
  // התקציר מגיע משאילתה לכל ערוץ (הודעה אחרונה + count מאז הביקור), ולא
  // מפיצול של חלון הודעות משותף — ערוץ שקט כבר לא נדחק החוצה בידי ערוץ עמוס.
  return (
    <div className="ch-grid">
      {CHANNELS.map((c) => {
        const s = summary[c.id] || {}
        const last = s.last || null
        // [38] מונה = הודעות חדשות מאז הביקור האחרון בערוץ (לא סך הכול, שמטעה)
        const fresh = s.fresh || 0
        return (
          <button key={c.id} type="button" className="ch-card" onClick={() => setActive(c.id)}>
            <span className="ch-ic"><c.Icon size={22} /></span>
            <span className="ch-body">
              <span className="ch-head">
                <span className="ch-name">{channelName(c)}</span>
                {last && <span className="ch-time">{timeAgo(last.created_at)}</span>}
              </span>
              <span className="ch-preview">
                {last
                  ? `${nameOf(last.user_id)}: ${last.content}`
                  : L(c.desc[0], c.desc[1])}
              </span>
            </span>
            {fresh > 0 && (
              <span className="ch-count ch-count-new" aria-label={L(`${fresh} הודעות חדשות`, `${fresh} new messages`)}>
                {fresh > 99 ? '99+' : fresh}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------- אירועים ומפגשים (סייד-בר) ----------
function EventsCard({ session }) {
  const myId = session.user.id
  const [events, setEvents] = useState(null) // null = בטעינה/לא זמין
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', event_date: '', event_time: '', location: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('community_events')
      .select('*, rsvps:community_event_rsvps(user_id)')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(5)
    if (error) { setEvents(null); return } // טבלה חסרה — הכרטיס פשוט לא מוצג
    setEvents(data || [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleRsvp = async (ev) => {
    const mine = (ev.rsvps || []).some((r) => r.user_id === myId)
    const { error } = mine
      ? await supabase.from('community_event_rsvps').delete().eq('event_id', ev.id).eq('user_id', myId)
      : await supabase.from('community_event_rsvps').insert({ event_id: ev.id, user_id: myId })
    if (error) { toast.error(L('הפעולה נכשלה: ', 'Action failed: ') + error.message); return }
    if (!mine) {
      sendNotification({
        to: ev.created_by, actor: myId, type: 'event',
        content: L(`נרשם לאירוע "${ev.title}"`, `RSVP'd to "${ev.title}"`), nav: 'community',
      })
    }
    load()
  }

  const addEvent = async () => {
    if (!form.title.trim() || !form.event_date || saving) return
    setSaving(true)
    const { error } = await supabase.from('community_events').insert({
      created_by: myId,
      title: form.title.trim(),
      event_date: form.event_date,
      event_time: form.event_time || null,
      location: form.location.trim() || null,
    })
    setSaving(false)
    if (error) { toast.error(L('היצירה נכשלה: ', 'Failed to create: ') + error.message); return }
    toast.success(L('האירוע פורסם לקהילה', 'Event published'))
    setForm({ title: '', event_date: '', event_time: '', location: '' })
    setAdding(false)
    load()
  }

  const removeEvent = async (ev) => {
    if (!(await confirmDialog({ message: L('למחוק את האירוע?', 'Delete this event?'), danger: true }))) return
    const { error } = await supabase.from('community_events').delete().eq('id', ev.id)
    if (error) { toast.error(L('המחיקה נכשלה: ', 'Failed to delete: ') + error.message); return }
    load()
  }

  const dateLabel = (d) => {
    const x = new Date(d + 'T00:00')
    return isNaN(x) ? d : `${x.getDate()}.${x.getMonth() + 1}`
  }

  if (events === null) return null

  return (
    <div className="cm-aside-card">
      <div className="cm-aside-head">
        <h3 className="cm-aside-title">{L('אירועים ומפגשים', 'Events & meetups')}</h3>
        <button type="button" className="link-button" onClick={() => setAdding((v) => !v)}>
          {adding ? L('ביטול', 'Cancel') : '+ ' + L('אירוע', 'Event')}
        </button>
      </div>

      {adding && (
        <div className="cm-event-form">
          <input
            className="finder-input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={L('שם האירוע (השתלמות, טורניר...)', 'Event name (clinic, tournament...)')}
          />
          <div className="cm-event-form-row">
            <input
              className="finder-input"
              type="date"
              value={form.event_date}
              onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
              aria-label={L('תאריך', 'Date')}
            />
            <input
              className="finder-input"
              type="time"
              value={form.event_time}
              onChange={(e) => setForm((f) => ({ ...f, event_time: e.target.value }))}
              aria-label={L('שעה', 'Time')}
            />
          </div>
          <input
            className="finder-input"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder={L('מיקום (לא חובה)', 'Location (optional)')}
          />
          <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={addEvent} disabled={saving || !form.title.trim() || !form.event_date}>
            {saving ? L('מפרסם...', 'Publishing...') : L('פרסום האירוע', 'Publish event')}
          </button>
        </div>
      )}

      {events.length === 0 ? (
        !adding && (
          <p className="muted small" style={{ margin: 0 }}>
            {L('אין אירועים קרובים — פרסמו השתלמות, מחנה או מפגש מאמנים.', 'No upcoming events — post a clinic, camp or coaches meetup.')}
          </p>
        )
      ) : (
        <ul className="cm-events">
          {events.map((ev) => {
            const going = (ev.rsvps || []).length
            const mine = (ev.rsvps || []).some((r) => r.user_id === myId)
            return (
              <li key={ev.id} className="cm-event">
                <span className="cm-event-date" aria-hidden="true">{dateLabel(ev.event_date)}</span>
                <span className="cm-event-body">
                  <span className="cm-event-title">{ev.title}</span>
                  <span className="cm-event-meta">
                    {ev.event_time ? ev.event_time.slice(0, 5) + ' · ' : ''}
                    {ev.location || ''}
                    {going > 0 ? (ev.location || ev.event_time ? ' · ' : '') + L(`${going} נרשמו`, `${going} going`) : ''}
                  </span>
                </span>
                <span className="cm-event-actions">
                  <button
                    type="button"
                    className={mine ? 'chip selected' : 'chip'}
                    onClick={() => toggleRsvp(ev)}
                    aria-pressed={mine}
                  >
                    {mine ? L('רשום ✓', 'Going ✓') : L('אגיע', 'RSVP')}
                  </button>
                  {ev.created_by === myId && (
                    <button type="button" className="cm-event-del" onClick={() => removeEvent(ev)} aria-label={L('מחיקת אירוע', 'Delete event')}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------- העמוד הראשי: הירו + פיד (עם סייד-בר) + צ'אטים ----------
// props: session, profile (לאווטאר בקומפוזר), onOpenCoach (למאמן השבוע),
//        initialTab/onConsumeInitialTab — ניתוב עומק (למשל "לצ'אטים" מעמוד ההודעות)
export default function Community({ session, profile, onOpenCoach, initialTab, onConsumeInitialTab }) {
  const [tab, setTab] = useState(initialTab || 'feed') // 'feed' | 'chats'
  useEffect(() => {
    if (initialTab) {
      setTab(initialTab)
      if (onConsumeInitialTab) onConsumeInitialTab()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab])
  const [search, setSearch] = useState('')
  const [postCount, setPostCount] = useState(null)
  const [coachCount, setCoachCount] = useState(null)
  const [chatChannel, setChatChannel] = useState(null) // deep-link מהסייד-בר

  useEffect(() => {
    let alive = true
    ;(async () => {
      // ספירה מ-coach_directory ולא מ-profiles: הכותרת אומרת "מאמנים", אבל
      // profiles כולל גם שחקנים וגם פרופילים שלא הושלמו — הוצג "6 מאמנים"
      // כשבפועל היו 3.
      // אותו תנאי שלמות שמאתר המאמנים מסנן לפיו, כדי שהמספר בכותרת יתאים
      // למספר המאמנים שאפשר בפועל למצוא ולפנות אליהם.
      let { count } = await supabase
        .from('coach_directory')
        .select('id', { count: 'exact', head: true })
        .not('first_name', 'is', null)
        .not('club', 'is', null)
      if (count == null) {
        const legacy = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'coach')
        count = legacy.count
      }
      if (alive && count != null) setCoachCount(count)
    })()
    return () => { alive = false }
  }, [])

  const openChannel = (id) => {
    setChatChannel(id)
    setTab('chats')
  }

  return (
    <div className="welcome-card cm-page">
      {/* הירו ממורכז — כותרת, סטטיסטיקות חיות וחיפוש */}
      <header className="cm-hero cm-art-hero">
        {/* סימן-מים של מגרש מתחת ל-scrim הנייבי — דפוס הבית (DESIGN.md §2ב), לא צילום סטוק */}
        <span className="cm-hero-bg cm-art-fill" aria-hidden="true">
          <CourtArt variant="community" />
        </span>
        <div className="welcome-badge">{L('הקהילה', 'Community')}</div>
        <h1>{L('המגרש הביתי של המאמנים', 'The coaches’ home court')}</h1>
        <p className="cm-hero-sub">{L('שאלות, טיפים, סרטונים וצילומים — הכול במקום אחד.', 'Questions, tips, videos and photos — all in one place.')}</p>
        <div className="cm-hero-stats" dir="rtl">
          <span className="cm-stat"><strong>{coachCount ?? '—'}</strong> {L('מאמנים', 'coaches')}</span>
          <span className="cm-stat-sep" aria-hidden="true" />
          <span className="cm-stat"><strong>{postCount ?? '—'}</strong> {L('פוסטים', 'posts')}</span>
          <span className="cm-stat-sep" aria-hidden="true" />
          <span className="cm-stat"><strong>{CHANNELS.length}</strong> {L("ערוצי צ'אט", 'chat channels')}</span>
        </div>
        {/* [24] החיפוש מסנן את הפיד — בטאב הצ'אטים הוא מוסתר כדי לא להטעות */}
        {tab === 'feed' && (
          <div className="cm-hero-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={L('חיפוש בפיד...', 'Search the feed...')}
              aria-label={L('חיפוש בפיד', 'Search the feed')}
            />
          </div>
        )}
      </header>

      <div className="tabs">
        <button className={tab === 'feed' ? 'tab active' : 'tab'} onClick={() => setTab('feed')}>
          {L('הפיד', 'Feed')}
        </button>
        <button className={tab === 'chats' ? 'tab active' : 'tab'} onClick={() => setTab('chats')}>
          {L("צ'אטים לפי קטגוריה", 'Topic chats')}
        </button>
      </div>

      {tab === 'feed' ? (
        <div className="cm-layout">
          <div className="cm-main">
            <Feed session={session} profile={profile} search={search} onCount={setPostCount} />
          </div>
          {/* סייד-בר — נצמד בגלילה בדסקטופ, יורד מתחת במובייל */}
          <aside className="cm-aside">
            <EventsCard session={session} />
            <div className="cm-aside-card cm-invite">
              <h3 className="cm-aside-title">{L('מכירים מאמן שחייב להיות כאן?', 'Know a coach who belongs here?')}</h3>
              <p className="muted small" style={{ margin: '0 0 10px' }}>
                {L('כל מאמן שמצטרף מוסיף תרגילים, ידע וניסיון לקהילה.', 'Every coach who joins adds drills, knowledge and experience.')}
              </p>
              <div className="cm-invite-btns">
                <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={() => waShare(inviteText())}>
                  {L('הזמנה בוואטסאפ', 'Invite on WhatsApp')}
                </button>
                <button type="button" className="btn-soft" onClick={() => copyText(inviteText(), L('טקסט ההזמנה הועתק', 'Invite copied'))}>
                  {L('העתקת קישור', 'Copy link')}
                </button>
              </div>
            </div>
            <div className="cm-aside-card">
              <h3 className="cm-aside-title">{L("ערוצי צ'אט", 'Chat channels')}</h3>
              <div className="cm-aside-channels">
                {CHANNELS.map((c) => (
                  <button key={c.id} type="button" className="cm-aside-ch" onClick={() => openChannel(c.id)}>
                    <c.Icon size={15} />
                    <span>{channelName(c)}</span>
                    <ChevronFwd size={14} className="cm-aside-chev" />
                  </button>
                ))}
              </div>
            </div>
            <CoachOfWeek onOpenCoach={onOpenCoach} />
          </aside>
        </div>
      ) : (
        <ChatsHub
          session={session}
          initialChannel={chatChannel}
          onConsumeInitial={() => setChatChannel(null)}
        />
      )}
    </div>
  )
}
