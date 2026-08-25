import { toast } from './toast'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, PlayCircle, Trash2, ExternalLink, Star, DownloadCloud, X, Check } from 'lucide-react'
import { supabase } from './supabaseClient'
import {
  VIDEO_CATEGORIES, VIDEO_CATEGORIES_CORE, VIDEO_TOPIC_EN, YT_IMPORT_PER_CATEGORY,
  YT_MIN_VIEWS, YT_MIN_MINUTES, YT_MAX_MINUTES, safeUrl,
} from './constants'
import { searchYouTube, fetchVideoDetails, ytConfigured, cleanVideoTitle } from './youtube'
import { SkeletonMedia } from './Skeleton'
import { L, tr } from './i18n'
import { PLAYER_SIDE } from './flags'
import { ErrorState } from './states'
import { confirmDialog } from './confirm'

// מזהה סרטון יוטיוב מתוך קישור (לבניית תמונה ממוזערת)
function ytId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)
  return m ? m[1] : null
}

// ספריית סרטונים משותפת — ממוינת לפי דירוג המשתמשים (הגבוה ביותר למעלה).
// מסך 14a מציג שלושה סרטונים ואז «עוד סרטונים (N)» — כרטיס מוביל ושתי שורות.
const PAGE = 3

export default function Videos({ session, profile }) {
  const me = session.user.id
  const isAdmin = !!profile?.is_admin
  const [videos, setVideos] = useState([])
  const [ratings, setRatings] = useState({}) // id -> { avg, count, mine }
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState(null)

  const [filterCat, setFilterCat] = useState('')
  const [search, setSearch] = useState('')
  // כל כרטיס סרטון הוא ~30 אלמנטים (כולל 5 כוכבי דירוג); 106 סרטונים = 4,300 אלמנטים
  // ומסך שנתקע בטלפון. מציגים 12 ומרחיבים לפי בקשה.
  const [limit, setLimit] = useState(PAGE)
  const [playing, setPlaying] = useState(null) // {id(yt), title} — נגן בתוך האפליקציה (§5)

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(VIDEO_CATEGORIES[0])
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadRatings() {
    const { data, error } = await supabase.from('video_ratings').select('video_id, user_id, rating')
    if (error) return // טבלה אולי לא קיימת עדיין — לא קריטי
    const agg = {}
    for (const r of data || []) {
      const a = (agg[r.video_id] = agg[r.video_id] || { sum: 0, count: 0, mine: 0 })
      a.sum += r.rating; a.count += 1
      if (r.user_id === me) a.mine = r.rating
    }
    const out = {}
    for (const id in agg) out[id] = { avg: agg[id].sum / agg[id].count, count: agg[id].count, mine: agg[id].mine }
    setRatings(out)
  }

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('drill_videos').select('*')
    if (error) setError(L('שגיאה בטעינת הסרטונים: ', 'Error loading videos: ') + error.message)
    else { setVideos(data || []); setError(null) }
    await loadRatings()
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setPlaying(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rate = async (videoId, value) => {
    // עדכון אופטימי מיידי
    setRatings((rs) => {
      const cur = rs[videoId] || { avg: 0, count: 0, mine: 0 }
      const hadMine = cur.mine > 0
      const sum = cur.avg * cur.count - (hadMine ? cur.mine : 0) + value
      const count = cur.count + (hadMine ? 0 : 1)
      return { ...rs, [videoId]: { avg: sum / count, count, mine: value } }
    })
    const { error } = await supabase.from('video_ratings').upsert(
      { video_id: videoId, user_id: me, rating: value }, { onConflict: 'video_id,user_id' }
    )
    if (error) { console.error('video rating:', error.message); toast.error(L('הדירוג נכשל — נסו שוב בעוד רגע.', 'Rating failed — try again in a moment.')); loadRatings(); return }
    loadRatings()
  }

  const save = async () => {
    if (!title.trim()) { toast.error(L('הוסף כותרת לסרטון.', 'Add a title for the video.')); return }
    if (!ytId(url)) { toast.error(L('הדבק קישור יוטיוב תקין.', 'Paste a valid YouTube link.')); return }
    setSaving(true)
    const { error } = await supabase.from('drill_videos').insert({ created_by: me, title: title.trim(), category, url: url.trim(), note: note.trim() || null })
    setSaving(false)
    if (error) { toast.error(L('ההוספה נכשלה: ', 'Adding failed: ') + error.message); return }
    setAdding(false); setTitle(''); setUrl(''); setNote('')
    toast.success(L('הסרטון נוסף', 'Video added')); load()
  }

  // ייבוא אוטומטי מיוטיוב (מסמך ההשקה 2.3, אדמין בלבד):
  // שאילתות בעברית ובאנגלית לכל קטגוריית ליבה, ואז סינון איכות דרך
  // videos.list — ניתן להטמעה, משך 3–30 דק' (פודקאסטים בלי תקרה),
  // וסף צפיות מינימלי. דה-דופליקציה מול הקיים ובתוך הריצה.
  const importFromYouTube = async () => {
    if (!ytConfigured()) {
      toast.error(L('הייבוא האוטומטי לא זמין כרגע — אפשר להוסיף סרטון עם קישור יוטיוב.', 'Auto-import is unavailable right now — you can add a video with a YouTube link.'))
      return
    }
    setImporting(true)
    const seen = new Set(videos.map((v) => ytId(v.url)).filter(Boolean))
    let added = 0
    let skipped = 0
    for (const cat of VIDEO_CATEGORIES_CORE) {
      const isPodcast = cat === 'פודקאסטים'
      let found = []
      try {
        const [he, en] = await Promise.all([
          searchYouTube(isPodcast ? 'פודקאסט כדורסל' : `כדורסל ${cat} אימון`, YT_IMPORT_PER_CATEGORY, 'he'),
          searchYouTube('basketball ' + (VIDEO_TOPIC_EN[cat] || cat), YT_IMPORT_PER_CATEGORY, 'en'),
        ])
        found = [...he, ...en]
      } catch (e) {
        toast.error(L('שגיאת יוטיוב: ', 'YouTube error: ') + e.message)
        break
      }
      const fresh = found.filter((v) => v.id && !seen.has(v.id))
      fresh.forEach((v) => seen.add(v.id))
      if (fresh.length === 0) continue

      // מסנני האיכות — סרטון בלי פרטים לא עובר
      let details = new Map()
      try {
        details = await fetchVideoDetails(fresh.map((v) => v.id))
      } catch (e) {
        toast.error(L('שגיאת יוטיוב: ', 'YouTube error: ') + e.message)
        break
      }
      const rows = fresh
        .filter((v) => {
          const d = details.get(v.id)
          const ok = d && d.embeddable && d.views >= YT_MIN_VIEWS &&
            d.minutes != null && d.minutes >= YT_MIN_MINUTES &&
            (isPodcast || d.minutes <= YT_MAX_MINUTES)
          if (!ok) skipped++
          return ok
        })
        .map((v) => ({ created_by: me, title: v.title.slice(0, 140), category: cat, url: v.url, note: v.channel || null }))
      if (rows.length) {
        const { error } = await supabase.from('drill_videos').insert(rows)
        if (!error) added += rows.length
      }
    }
    setImporting(false)
    toast.success(L(`${added} סרטונים איכותיים יובאו (${skipped} נפסלו בסינון)`, `${added} quality videos imported (${skipped} filtered out)`))
    load()
  }

  const remove = async (v) => {
    if (!(await confirmDialog({ message: L('למחוק את הסרטון?', 'Delete this video?'), danger: true }))) return
    // אדמין מוחק סרטון של אחרים דרך RPC (supabase_stage2_launch.sql);
    // סרטון של עצמך — מחיקה רגילה דרך ה-RLS הקיים.
    const { error } = v.created_by === me
      ? await supabase.from('drill_videos').delete().eq('id', v.id)
      : await supabase.rpc('admin_delete_video', { p_id: v.id })
    if (error) { toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message); return }
    toast.success(L('הסרטון נמחק', 'Video deleted')); load()
  }

  // "המאמן ממליץ" — סימון כוכב שמרים סרטון למדף אצל השחקנים (supabase_engagement2.sql)
  const toggleFeatured = async (v) => {
    const next = v.featured !== true
    const { error } = await supabase.rpc('set_video_featured', { p_id: v.id, p_featured: next })
    if (error) { toast.error(L('העדכון נכשל: ', 'Update failed: ') + error.message); return }
    toast.success(next ? L('נוסף למדף "המאמן ממליץ"', 'Added to the recommended shelf') : L('הוסר מהמדף', 'Removed from the shelf'))
    load()
  }

  // אישור סרטון לשחקנים (אדמין בלבד; נאכף גם ב-RLS — supabase_privacy4.sql)
  const toggleApproved = async (v) => {
    const next = v.approved !== true // undefined (עמודה חסרה) => לאשר, לא לבטל
    const { error } = await supabase.rpc('set_video_approved', { p_id: v.id, p_approved: next })
    if (error) { toast.error(L('העדכון נכשל: ', 'Update failed: ') + error.message); return }
    toast.success(next ? (PLAYER_SIDE ? L('הסרטון אושר לשחקנים', 'Video approved') : L('הסרטון אושר', 'Video approved')) : L('האישור בוטל', 'Approval removed'))
    load()
  }

  // האם המשתמש בכלל סינן? בלי ההבחנה הזו ספרייה ריקה נראתה כמו סינון שבור
  const filtered = !!filterCat || !!search.trim()
  const results = videos
    .filter((v) => {
      const catOk = !filterCat || v.category === filterCat
      const q = search.trim().toLowerCase()
      const textOk = !q || v.title.toLowerCase().includes(q) || (v.note || '').toLowerCase().includes(q)
      return catOk && textOk
    })
    .sort((a, b) => {
      const ra = ratings[a.id] || { avg: 0, count: 0 }
      const rb = ratings[b.id] || { avg: 0, count: 0 }
      return rb.avg - ra.avg || rb.count - ra.count || (b.created_at || '').localeCompare(a.created_at || '')
    })

  return (
    <>
      <div className="library-header" style={{ marginTop: 4 }}>
        <p className="muted small" style={{ margin: 0 }}>
          {L('ספריית סרטונים משותפת — ממוינת לפי דירוג המאמנים. דרגו סרטונים והכי טובים יעלו למעלה.', 'Shared video library — ranked by coaches’ ratings. Rate videos and the best rise to the top.')}
        </p>
        <div className="video-header-actions">
          {isAdmin && (
            <button className="btn-soft yt-import-btn" onClick={importFromYouTube} disabled={importing}>
              <DownloadCloud size={17} /> {importing ? L('מייבא מיוטיוב...', 'Importing...') : L('ייבוא סרטונים מיוטיוב', 'Import from YouTube')}
            </button>
          )}
          {!adding && (
            <button className="btn-primary sched-add-btn" onClick={() => setAdding(true)}>
              <Plus size={18} /> {L('הוסף סרטון', 'Add video')}
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="sched-form" style={{ marginTop: 12 }}>
          <label className="pf-label">{L('כותרת', 'Title')}
            <input className="finder-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L('לדוגמה: תרגיל הגנה אזורית 2-3', 'e.g. 2-3 zone defense drill')} />
          </label>
          <label className="pf-label" style={{ marginTop: 10 }}>{L('קטגוריה', 'Category')}
            <select className="finder-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {VIDEO_CATEGORIES.map((c) => <option key={c} value={c}>{tr(c)}</option>)}
            </select>
          </label>
          <label className="pf-label" style={{ marginTop: 10 }}>{L('קישור יוטיוב', 'YouTube link')}
            <input className="finder-input" type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
          </label>
          <input className="finder-input" type="text" value={note} onChange={(e) => setNote(e.target.value)} aria-label={L('הערה לסרטון', 'Video note')} placeholder={L('הערה (לא חובה)', 'Note (optional)')} style={{ marginTop: 10 }} />
          <div className="form-actions">
            <button className="btn-primary" disabled={saving} onClick={save}>{saving ? L('מוסיף...', 'Adding...') : L('הוספת סרטון', 'Add video')}</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>{L('ביטול', 'Cancel')}</button>
          </div>
        </div>
      )}

      <div className="chips" style={{ marginTop: 16 }}>
        <button type="button" className={!filterCat ? 'chip selected' : 'chip'} onClick={() => { setFilterCat(''); setLimit(PAGE) }}>{L('הכל', 'All')}</button>
        {VIDEO_CATEGORIES.map((c) => (
          <button type="button" key={c} className={filterCat === c ? 'chip selected' : 'chip'} onClick={() => { setFilterCat(c); setLimit(PAGE) }}>{tr(c)}</button>
        ))}
      </div>

      <input className="finder-input" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE) }}
        aria-label={L('חיפוש סרטונים', 'Search videos')} placeholder={L('חיפוש חופשי בסרטונים...', 'Search videos...')} style={{ marginTop: 12 }} />

      {loading ? (
        <SkeletonMedia count={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : results.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><PlayCircle size={26} /></span>
          {/* «אין סרטונים מתאימים» נשמע כמו סינון שבור כשהספרייה עצמה ריקה */}
          <div className="empty-title">
            {filtered ? L('אין סרטונים מתאימים', 'No matching videos') : L('הספרייה עדיין ריקה', 'The library is still empty')}
          </div>
          <p className="muted small">
            {filtered
              ? L('נסה סינון אחר, או הוסף סרטון משלך.', 'Try a different filter, or add your own video.')
              : L('כל סרטון שתוסיף יופיע כאן ויהיה זמין לכל המאמנים — מספיק להדביק קישור מיוטיוב.',
                  'Every video you add shows up here for all coaches — just paste a YouTube link.')}
          </p>
          {!adding && (
            <button type="button" className="btn-primary empty-cta" onClick={() => setAdding(true)}>
              <Plus size={18} aria-hidden="true" /> {L('הוסף סרטון', 'Add video')}
            </button>
          )}
        </div>
      ) : (
        <div className="pl-vid-grid">
          {/* §5 — אותה שפה כמו מסך הסרטונים של השחקן: שורות אחידות עם
              תמונה, נגן בתוך האפליקציה, דירוג קטן ופעולות כאייקונים. */}
          {results.slice(0, limit).map((v) => {
            const id = ytId(v.url)
            const r = ratings[v.id] || { avg: 0, count: 0, mine: 0 }
            return (
              <div key={v.id} className="pl-vid vco-row">
                <button
                  type="button"
                  className="vco-open"
                  onClick={() => (id ? setPlaying({ id, title: v.title }) : window.open(safeUrl(v.url) || '#', '_blank'))}
                  aria-label={L(`צפייה בסרטון: ${v.title}`, `Watch video: ${v.title}`)}
                >
                  <span className="pl-vid-thumb" style={id ? { backgroundImage: `url("https://img.youtube.com/vi/${id}/hqdefault.jpg")` } : undefined}>
                    <span className="pl-vid-play"><PlayCircle size={18} /></span>
                    {v.featured && <span className="vco-star"><Star size={11} fill="currentColor" /></span>}
                  </span>
                  <span className="pl-vid-body">
                    <span className="pl-vid-title" dir="auto">{cleanVideoTitle(v.title)}</span>
                    <span className="vco-meta">
                      {v.category && <span className="cat-badge" data-cat={v.category}>{tr(v.category)}</span>}
                      {/* 1.11 — הערוץ (נשמר ב-note בייבוא) מוצג על הכרטיס */}
                      {v.note && <span className="vco-channel muted small" dir="auto">{v.note}</span>}
                      {r.count > 0 && <span className="vco-avg"><Star size={11} fill="currentColor" /> {r.avg.toFixed(1)} · {r.count}</span>}
                      {v.approved === false && <span className="video-pending">{L('ממתין לאישור', 'Pending approval')}</span>}
                    </span>
                  </span>
                </button>
                <span className="vco-acts">
                  <span className="video-rate-stars" role="radiogroup" aria-label={L('דרג סרטון', 'Rate video')}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" className="vstar-btn" onClick={() => rate(v.id, n)}
                        aria-label={L(`${n} כוכבים`, `${n} stars`)}>
                        <Star size={14} className={n <= (r.mine || Math.round(r.avg)) ? (r.mine ? 'vstar mine' : 'vstar avg') : 'vstar'} />
                      </button>
                    ))}
                  </span>
                  <a className="icon-btn" href={safeUrl(v.url) || undefined} target="_blank" rel="noopener noreferrer" title={L('פתיחה ביוטיוב', 'Open on YouTube')}><ExternalLink size={15} /></a>
                  {isAdmin && (
                    <button type="button" className={v.featured ? 'icon-btn vco-on' : 'icon-btn'} onClick={() => toggleFeatured(v)}
                      title={PLAYER_SIDE ? L('מדף «המאמן ממליץ» אצל השחקנים', "Players' recommended shelf") : L('מדף «המאמן ממליץ»', 'Recommended shelf')}>
                      <Star size={15} fill={v.featured ? 'currentColor' : 'none'} />
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" className="icon-btn" onClick={() => toggleApproved(v)}
                      title={v.approved === false ? (PLAYER_SIDE ? L('אישור לשחקנים', 'Approve for players') : L('אישור הסרטון', 'Approve video')) : L('ביטול אישור', 'Unapprove')}>
                      {v.approved === false ? <Check size={15} /> : <X size={15} />}
                    </button>
                  )}
                  {/* 2.3 — גם אדמין מוחק (הסרה ידנית מהפאנל, דרך RPC) */}
                  {(v.created_by === me || isAdmin) && (
                    <button type="button" className="icon-btn" onClick={() => remove(v)} title={L('מחיקת סרטון', 'Delete video')}><Trash2 size={15} /></button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {playing && createPortal(
        <div className="pl-video-modal" onClick={() => setPlaying(null)}>
          <div className="pl-video-inner" onClick={(e) => e.stopPropagation()}>
            <div className="pl-video-bar">
              <span dir="auto">{playing.title}</span>
              <button className="icon-btn" onClick={() => setPlaying(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <div className="pl-video-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playing.id}?autoplay=1&rel=0`}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>,
        document.body
      )}
      {results.length > limit && (
        <button type="button" className="pl-more" onClick={() => setLimit((l) => l + 12)}>
          {L(`עוד סרטונים (${results.length - limit})`, `More videos (${results.length - limit})`)}
        </button>
      )}
    </>
  )
}
