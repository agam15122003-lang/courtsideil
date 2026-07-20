import { toast } from './toast'
import { useState, useEffect } from 'react'
import { Plus, PlayCircle, Trash2, ExternalLink, Star, DownloadCloud } from 'lucide-react'
import { supabase } from './supabaseClient'
import { VIDEO_CATEGORIES, VIDEO_TOPIC_EN, YT_IMPORT_PER_CATEGORY, safeUrl } from './constants'
import { searchYouTube, ytConfigured } from './youtube'
import { SkeletonCards } from './Skeleton'
import { L, tr } from './i18n'

// מזהה סרטון יוטיוב מתוך קישור (לבניית תמונה ממוזערת)
function ytId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)
  return m ? m[1] : null
}

// ספריית סרטונים משותפת — ממוינת לפי דירוג המשתמשים (הגבוה ביותר למעלה).
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

  // ייבוא אוטומטי של סרטונים אמיתיים מיוטיוב — נושא אחר נושא (אדמין בלבד)
  const importFromYouTube = async () => {
    if (!ytConfigured()) {
      toast.error(L('הייבוא האוטומטי לא זמין כרגע — אפשר להוסיף סרטון עם קישור יוטיוב.', 'Auto-import is unavailable right now — you can add a video with a YouTube link.'))
      return
    }
    setImporting(true)
    const seen = new Set(videos.map((v) => ytId(v.url)).filter(Boolean))
    let added = 0
    for (const cat of VIDEO_CATEGORIES) {
      let found = []
      try {
        found = await searchYouTube('basketball ' + (VIDEO_TOPIC_EN[cat] || cat) + ' coaching drills', YT_IMPORT_PER_CATEGORY)
      } catch (e) {
        toast.error(L('שגיאת יוטיוב: ', 'YouTube error: ') + e.message)
        break
      }
      const rows = found
        .filter((v) => v.id && !seen.has(v.id))
        .map((v) => { seen.add(v.id); return { created_by: me, title: v.title.slice(0, 140), category: cat, url: v.url, note: v.channel || null } })
      if (rows.length) {
        const { error } = await supabase.from('drill_videos').insert(rows)
        if (!error) added += rows.length
      }
    }
    setImporting(false)
    toast.success(L(`${added} סרטונים אמיתיים יובאו מיוטיוב`, `${added} real videos imported from YouTube`))
    load()
  }

  const remove = async (id) => {
    if (!window.confirm(L('למחוק את הסרטון?', 'Delete this video?'))) return
    const { error } = await supabase.from('drill_videos').delete().eq('id', id)
    if (error) { toast.error(L('המחיקה נכשלה: ', 'Delete failed: ') + error.message); return }
    toast.success(L('הסרטון נמחק', 'Video deleted')); load()
  }

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
        <button type="button" className={!filterCat ? 'chip selected' : 'chip'} onClick={() => setFilterCat('')}>{L('הכל', 'All')}</button>
        {VIDEO_CATEGORIES.map((c) => (
          <button type="button" key={c} className={filterCat === c ? 'chip selected' : 'chip'} onClick={() => setFilterCat(c)}>{tr(c)}</button>
        ))}
      </div>

      <input className="finder-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
        aria-label={L('חיפוש סרטונים', 'Search videos')} placeholder={L('חיפוש חופשי בסרטונים...', 'Search videos...')} style={{ marginTop: 12 }} />

      {loading ? (
        <SkeletonCards count={3} />
      ) : error ? (
        <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><PlayCircle size={26} /></span>
          <div className="empty-title">{L('אין סרטונים מתאימים', 'No matching videos')}</div>
          <p className="muted small">{L('הוסף את הסרטון הראשון, או נסה סינון אחר.', 'Add the first video, or try a different filter.')}</p>
          {!adding && (
            <button type="button" className="btn-primary empty-cta" onClick={() => setAdding(true)}>
              <Plus size={18} aria-hidden="true" /> {L('הוסף סרטון', 'Add video')}
            </button>
          )}
        </div>
      ) : (
        <div className="video-grid">
          {results.map((v) => {
            const id = ytId(v.url)
            const r = ratings[v.id] || { avg: 0, count: 0, mine: 0 }
            return (
              <div key={v.id} className="video-card">
                <a className="video-thumb" href={safeUrl(v.url) || undefined} target="_blank" rel="noopener noreferrer" aria-label={L(`צפייה בסרטון: ${v.title}`, `Watch video: ${v.title}`)}>
                  {id ? <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" /> : <PlayCircle size={28} />}
                  <span className="video-play"><PlayCircle size={18} /></span>
                  {r.count > 0 && <span className="video-rank-badge"><Star size={11} /> {r.avg.toFixed(1)}</span>}
                </a>
                <div className="video-body">
                  <span className="cat-badge">{tr(v.category)}</span>
                  <span className="video-title">{v.title}</span>
                  {v.note && <span className="muted small">{v.note}</span>}

                  {/* דירוג משתמשים */}
                  <div className="video-rate">
                    <span className="video-rate-stars" role="radiogroup" aria-label={L('דרג סרטון', 'Rate video')}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" className="vstar-btn" onClick={() => rate(v.id, n)}
                          aria-label={L(`${n} כוכבים`, `${n} stars`)} title={L(`דרג ${n}`, `Rate ${n}`)}>
                          <Star size={17} className={n <= (r.mine || Math.round(r.avg)) ? (r.mine ? 'vstar mine' : 'vstar avg') : 'vstar'} />
                        </button>
                      ))}
                    </span>
                    <span className="muted small video-rate-meta">
                      {r.count > 0 ? L(`${r.avg.toFixed(1)} · ${r.count} דירוגים`, `${r.avg.toFixed(1)} · ${r.count} ratings`) : L('עדיין לא דורג', 'Not rated yet')}
                    </span>
                  </div>

                  <div className="video-actions">
                    <a className="btn-soft video-watch" href={safeUrl(v.url) || undefined} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> {L('צפה ביוטיוב', 'Watch on YouTube')}</a>
                    {v.created_by === me && (
                      <button type="button" className="msg-del" onClick={() => remove(v.id)} aria-label={L('מחיקת סרטון', 'Delete video')} title={L('מחיקת סרטון', 'Delete video')}><Trash2 size={16} /></button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
