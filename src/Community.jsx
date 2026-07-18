import { useState, useEffect, useRef } from 'react'
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
  ChevronRight,
} from 'lucide-react'
import { toast } from './toast'
import { supabase } from './supabaseClient'
import { uploadImage } from './storage'
import Avatar from './Avatar'
import ChatWindow from './ChatWindow'
import { SkeletonCards } from './Skeleton'
import { L } from './i18n'

const MAX_IMAGES = 4

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
// שגיאת "עמודה חסרה" (למשל channel לפני הרצת ה-SQL)
const isMissingColumn = (error) =>
  error.code === '42703' ||
  /column .* does not exist|could not find the .* column/i.test(error.message || '')

// כרטיס הsetup — מוצג כשחסר משהו במסד, עם שם הקובץ שצריך להריץ
function SetupCard({ file, onRetry }) {
  return (
    <div className="empty-state">
      <span className="empty-ic"><Database size={26} /></span>
      <div className="empty-title">{L('נשאר צעד אחד להפעלה', 'One step left to enable this')}</div>
      <p className="muted small" style={{ maxWidth: 480 }}>
        {L(
          `פתח את Supabase → SQL Editor, הדבק את התוכן של הקובץ ${file} מהפרויקט ולחץ Run. אחרי זה חזור לכאן.`,
          `Open Supabase → SQL Editor, paste the contents of ${file} from the project and click Run. Then come back here.`
        )}
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
    setText('')
    onChanged()
  }

  const remove = async (id) => {
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

// ---------- פוסט בודד ----------
function PostCard({ post, myId, onChanged, onDeleted }) {
  const [showComments, setShowComments] = useState(false)
  const [lightbox, setLightbox] = useState(null) // URL של תמונה מוגדלת
  const likes = post.likes || []
  const iLiked = likes.some((l) => l.user_id === myId)
  const comments = post.comments || []

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
    await onChanged()
    setOptimistic(null)
  }

  const remove = async () => {
    if (!window.confirm(L('למחוק את הפוסט?', 'Delete this post?'))) return
    const { error } = await supabase.from('community_posts').delete().eq('id', post.id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Failed to delete: ') + error.message)
      return
    }
    toast.success(L('הפוסט נמחק', 'Post deleted'))
    onDeleted()
  }

  const imgs = post.image_urls || []

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
              <img src={u} alt={L('תמונה מהאימון', 'Practice photo')} loading="lazy" />
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
            ? L(`${comments.length} תגובות`, `${comments.length} comments`)
            : L('תגובה', 'Comment')}
        </button>
      </footer>

      {showComments && <Comments post={post} myId={myId} onChanged={onChanged} />}

      {lightbox && (
        <div className="cm-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label={L('תמונה מוגדלת', 'Enlarged photo')}>
          <button type="button" className="cm-lightbox-close" aria-label={L('סגירה', 'Close')}>
            <X size={22} />
          </button>
          <img src={lightbox} alt={L('תמונה מהאימון', 'Practice photo')} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </article>
  )
}

// ---------- הפיד ----------
function Feed({ session, profile }) {
  const myId = session.user.id
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sqlMissing, setSqlMissing] = useState(false)

  // קומפוזר
  const [text, setText] = useState('')
  const [images, setImages] = useState([]) // [{file, url(preview)}]
  const [posting, setPosting] = useState(false)
  const fileRef = useRef(null)
  const taRef = useRef(null)

  async function load(opts = {}) {
    if (!opts.silent) setLoading(true)
    // profiles!user_id — מציין את עמודת הקשר במפורש, כדי למנוע שגיאת
    // "more than one relationship" אם קיימים כמה מפתחות-זר בין הטבלאות
    const { data, error } = await supabase
      .from('community_posts')
      .select(
        '*, author:profiles!user_id(first_name, last_name, club, avatar_url), likes:community_post_likes(user_id), comments:community_post_comments(id, user_id, content, created_at, author:profiles!user_id(first_name, last_name, avatar_url))'
      )
      .order('created_at', { ascending: false })
      .limit(100)

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
    if (!opts.silent) setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const publish = async () => {
    const content = text.trim()
    if ((!content && images.length === 0) || posting) return
    setPosting(true)
    try {
      const urls = []
      for (const img of images) {
        urls.push(await uploadImage(img.file, 'community', myId))
      }
      const { error } = await supabase.from('community_posts').insert({
        user_id: myId,
        content: content || null,
        image_urls: urls.length ? urls : null,
      })
      if (error) throw error
      images.forEach((img) => URL.revokeObjectURL(img.url))
      setImages([])
      setText('')
      if (taRef.current) taRef.current.style.height = 'auto'
      toast.success(L('הפוסט פורסם לקהילה 🎉', 'Posted to the community 🎉'))
      load({ silent: true })
    } catch (err) {
      toast.error(L('הפרסום נכשל: ', 'Failed to post: ') + (err.message || ''))
    } finally {
      setPosting(false)
    }
  }

  const firstName = profile?.first_name || L('מאמן', 'Coach')

  if (sqlMissing) return <SetupCard file="supabase_community.sql" onRetry={() => load()} />

  return (
    <>
      {/* קומפוזר — פרסום פוסט חדש */}
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
            placeholder={L(`מה קורה באימונים שלך, ${firstName}?`, `What's happening at practice, ${firstName}?`)}
            aria-label={L('כתיבת פוסט', 'Write a post')}
          />
          {images.length > 0 && (
            <div className="cm-composer-previews">
              {images.map((img, i) => (
                <div key={img.url} className="cm-preview">
                  <img src={img.url} alt="" />
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

      {/* הפיד */}
      <div className="cm-feed">
        {loading ? (
          <SkeletonCards count={3} />
        ) : error ? (
          <div className="alert alert-error">
            {error}
            <button type="button" className="link-button" style={{ marginTop: 8 }} onClick={() => load()}>
              {L('נסה שוב', 'Try again')}
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ic"><UsersRound size={26} /></span>
            <div className="empty-title">{L('הקהילה מחכה לפוסט הראשון', 'The community is waiting for its first post')}</div>
            <p className="muted small">
              {L('שתף תובנה מאימון, שאלה מקצועית או תמונה מהמגרש.', 'Share a practice insight, a coaching question or a photo from the court.')}
            </p>
          </div>
        ) : (
          posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              myId={myId}
              onChanged={() => load({ silent: true })}
              onDeleted={() => load({ silent: true })}
            />
          ))
        )}
      </div>
    </>
  )
}

// ---------- צ'אטים לפי קטגוריה ----------
function ChatsHub({ session }) {
  const myId = session.user.id
  const [messages, setMessages] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [needsSql, setNeedsSql] = useState(false) // עמודת channel חסרה
  const [active, setActive] = useState(null) // ערוץ פתוח (id)
  const [sending, setSending] = useState(false)

  async function load(opts = {}) {
    if (!opts.silent) setLoading(true)
    const { data, error } = await supabase
      .from('community_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(500)

    if (error) {
      if (isMissingTable(error)) setNeedsSql('supabase_community_chat.sql')
      else if (!opts.silent) setError(L("שגיאה בטעינת הצ'אטים: ", 'Failed to load chats: ') + error.message)
      if (!opts.silent) setLoading(false)
      return
    }

    const msgs = data || []
    // אם אין עמודת channel — ההודעות יגיעו בלעדיה; מפנים להרצת ה-SQL
    if (msgs.length > 0 && msgs[0].channel === undefined) {
      setNeedsSql('supabase_community2.sql')
      if (!opts.silent) setLoading(false)
      return
    }
    setNeedsSql(false)
    setMessages(msgs)
    setError(null)

    const ids = [...new Set(msgs.map((m) => m.user_id))]
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', ids)
      const map = {}
      for (const p of profs || []) map[p.id] = p
      setProfilesById(map)
    }
    if (!opts.silent) setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nameOf = (id) => coachName(profilesById[id])

  const send = async (text) => {
    setSending(true)
    const { error } = await supabase
      .from('community_messages')
      .insert({ user_id: myId, content: text, channel: active })
    setSending(false)
    if (error) {
      if (isMissingColumn(error)) {
        toast.error(L('צריך להריץ את supabase_community2.sql כדי להפעיל ערוצים', 'Run supabase_community2.sql to enable channels'))
      } else {
        toast.error(L('השליחה נכשלה: ', 'Failed to send: ') + error.message)
      }
      return false
    }
    load({ silent: true })
    return true
  }

  const remove = async (id) => {
    if (!window.confirm(L('למחוק את ההודעה?', 'Delete this message?'))) return
    const { error } = await supabase.from('community_messages').delete().eq('id', id)
    if (error) {
      toast.error(L('המחיקה נכשלה: ', 'Failed to delete: ') + error.message)
      return
    }
    load({ silent: true })
  }

  if (needsSql) return <SetupCard file={needsSql} onRetry={() => load()} />
  if (loading) return <SkeletonCards count={3} />
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
              <ChevronRight size={20} />
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
            <p className="muted small">{L('כתוב את ההודעה הראשונה.', 'Write the first message.')}</p>
          </div>
        }
      />
    )
  }

  // ---- רשימת הערוצים ----
  const byChannel = {}
  for (const m of messages) {
    const k = m.channel || 'כללי'
    ;(byChannel[k] = byChannel[k] || []).push(m)
  }

  return (
    <div className="ch-grid">
      {CHANNELS.map((c) => {
        const list = byChannel[c.id] || []
        const last = list[list.length - 1]
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
            {list.length > 0 && <span className="ch-count">{list.length}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ---------- העמוד הראשי: קהילה = פיד + צ'אטים לפי קטגוריה ----------
// props: session, profile (לאווטאר בקומפוזר)
export default function Community({ session, profile }) {
  const [tab, setTab] = useState('feed') // 'feed' | 'chats'

  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('הקהילה', 'Community')}</div>
          <h2>{L('קהילת המאמנים', 'Coaches community')}</h2>
          <p className="page-desc">
            {L(
              'המגרש המרכזי של כולנו — פיד שיתופים וצ׳אטים מקצועיים לפי קטגוריה.',
              "Everyone's home court — a shared feed and topic chats by category."
            )}
          </p>
        </div>
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
        <Feed session={session} profile={profile} />
      ) : (
        <ChatsHub session={session} />
      )}
    </div>
  )
}
