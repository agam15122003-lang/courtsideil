import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Clapperboard,
  Upload,
  Scissors,
  Flag,
  Play,
  Trash2,
  ChevronUp,
  ChevronDown,
  Download,
  Share2,
  RotateCcw,
  X,
  Film,
  Minus,
  Plus,
} from 'lucide-react'
import { toast } from './toast'
import { L } from './i18n'

// ============================================================
// עורך וידאו למאמן — הכול במכשיר, בלי העלאה לשרת.
// טוענים סרטון משחק → מסמנים קטעים (התחלה/סוף) → מייצאים קליפ
// אחד מחובר (הקלטת ההשמעה של הקטעים ברצף דרך MediaRecorder).
// ============================================================

// עיצוב זמן: 12:34.5 (דקות:שניות.עשיריות)
function fmt(t) {
  if (!Number.isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const d = Math.floor((t % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${d}`
}

// פורמט הקלטה נתמך — מעדיפים MP4 (נוח לשיתוף בוואטסאפ), אחרת WebM
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null
  const options = [
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const m of options) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* דפדפן ישן — ננסה את הבא */
    }
  }
  return null
}

// המתנה לסיום seek — מנקה את המאזין בכל מסלול (אירוע או timeout גיבוי)
function awaitSeek(v, t, timeout = 2500) {
  return new Promise((resolve) => {
    let done = false
    let timer = null
    const finish = () => {
      if (done) return
      done = true
      v.removeEventListener('seeked', finish)
      if (timer) clearTimeout(timer)
      resolve()
    }
    v.addEventListener('seeked', finish)
    timer = setTimeout(finish, timeout)
    v.currentTime = Math.max(0, t)
  })
}

export default function VideoEditor() {
  const videoRef = useRef(null)
  const cancelRef = useRef(false)
  const tickRef = useRef(null)
  // כתובות ה-blob נשמרות גם ב-ref — כדי שניקוי ה-unmount יראה את הערכים העדכניים
  const srcUrlRef = useRef(null)
  const resultUrlRef = useRef(null)

  const [srcUrl, setSrcUrl] = useState(null)
  const [fileName, setFileName] = useState('')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)

  const [pendingStart, setPendingStart] = useState(null) // נקודת "התחלה" שסומנה וממתינה ל"סוף"
  const [segments, setSegments] = useState([]) // [{id, start, end}]

  const [exporting, setExporting] = useState(false)
  const [exportIndex, setExportIndex] = useState(0)
  const [result, setResult] = useState(null) // {url, ext, size, blob}

  // עצירת דגימת ההשמעה הפעילה (אם יש)
  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  // ניקוי ביציאה מהעמוד — דרך refs (ה-state של הרינדור הראשון תמיד ריק)
  useEffect(() => {
    return () => {
      stopTick()
      if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current)
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    }
  }, [])

  const setSource = (url) => {
    srcUrlRef.current = url
    setSrcUrl(url)
  }
  const setResultClip = (r) => {
    resultUrlRef.current = r?.url || null
    setResult(r)
  }

  const loadFile = (file) => {
    if (!file || exporting) return
    if (!file.type.startsWith('video/')) {
      toast.error(L('הקובץ שנבחר אינו סרטון.', 'The selected file is not a video.'))
      return
    }
    stopTick()
    if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current)
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    setResultClip(null)
    setSegments([])
    setPendingStart(null)
    setDuration(0)
    setCurrentTime(0)
    setFileName(file.name)
    setSource(URL.createObjectURL(file))
  }

  const onDrop = (e) => {
    e.preventDefault()
    loadFile(e.dataTransfer?.files?.[0])
  }

  // --- שליטה בנגן ---
  const seekTo = (t) => {
    const v = videoRef.current
    if (!v || !duration || exporting) return
    v.currentTime = Math.min(Math.max(0, t), duration)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v || exporting) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  // מקלדת על ציר הזמן — חיצים לדילוג, רווח לניגון (נגישות)
  const onTrackKey = (e) => {
    if (exporting) return
    if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(currentTime + 5) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(currentTime - 5) }
    else if (e.key === 'Home') { e.preventDefault(); seekTo(0) }
    else if (e.key === 'End') { e.preventDefault(); seekTo(duration) }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay() }
  }

  // --- סימון קטעים ---
  const markStart = () => {
    setPendingStart(videoRef.current?.currentTime ?? 0)
  }

  const markEnd = () => {
    const t = videoRef.current?.currentTime ?? 0
    if (pendingStart == null) return
    if (t <= pendingStart + 0.2) {
      toast.error(L('נקודת הסוף חייבת להיות אחרי ההתחלה.', 'The end point must come after the start.'))
      return
    }
    setSegments((cur) => [
      ...cur,
      { id: `${Date.now()}-${cur.length}`, start: pendingStart, end: t },
    ])
    setPendingStart(null)
    toast.success(L('הקטע נוסף לקליפ', 'Segment added to the clip'))
  }

  const removeSegment = (id) => setSegments((cur) => cur.filter((s) => s.id !== id))

  const moveSegment = (idx, dir) =>
    setSegments((cur) => {
      const next = [...cur]
      const j = idx + dir
      if (j < 0 || j >= next.length) return cur
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })

  // כוונון עדין של גבולות קטע (±0.5 שנ׳)
  const nudge = (id, edge, delta) =>
    setSegments((cur) =>
      cur.map((s) => {
        if (s.id !== id) return s
        const next = { ...s }
        if (edge === 'start') next.start = Math.min(Math.max(0, s.start + delta), s.end - 0.2)
        else next.end = Math.max(Math.min(duration || s.end + delta, s.end + delta), s.start + 0.2)
        return next
      })
    )

  // ניגון עד נקודת סוף — כל קריאה עוצרת קודם את הדגימה הקודמת, ומזהה את
  // האינטרוול שלה עצמה (כדי שדגימה "יתומה" לא תוכל לחסל דגימה חדשה)
  const playUntil = useCallback((end) => {
    const v = videoRef.current
    if (!v) return Promise.resolve()
    stopTick()
    return new Promise((resolve) => {
      v.play()
        .then(() => {
          const my = setInterval(() => {
            if (cancelRef.current || v.currentTime >= end - 0.04 || v.ended) {
              clearInterval(my)
              if (tickRef.current === my) tickRef.current = null
              v.pause()
              resolve()
            }
          }, 40)
          tickRef.current = my
        })
        .catch(() => resolve())
    })
  }, [])

  // תצוגה מקדימה של קטע — לחיצה על קטע אחר פשוט מחליפה אותו
  const previewSegment = async (seg) => {
    const v = videoRef.current
    if (!v || exporting) return
    cancelRef.current = false
    stopTick()
    await awaitSeek(v, seg.start)
    await playUntil(seg.end)
  }

  // --- ייצוא: הקלטת השמעת כל הקטעים ברצף לקובץ אחד ---
  const exportClip = async () => {
    const v = videoRef.current
    if (!v || segments.length === 0 || exporting) return
    const capture = v.captureStream || v.mozCaptureStream
    const mime = pickMime()
    if (!capture || !mime) {
      toast.error(L('הדפדפן לא תומך בייצוא וידאו — נסה כרום מעודכן.', 'This browser cannot export video — try an up-to-date Chrome.'))
      return
    }

    // עוצרים כל תצוגה מקדימה פעילה לפני שמתחילים
    stopTick()
    v.pause()
    cancelRef.current = false
    setExporting(true)
    setExportIndex(0)
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    setResultClip(null)

    try {
      // קופצים לתחילת הקטע הראשון *לפני* תחילת ההקלטה —
      // כדי שהקפיצה והפריים הישן לא ייכנסו לקליפ
      await awaitSeek(v, segments[0].start)

      const stream = capture.call(v)
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
      const chunks = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }
      const stopped = new Promise((res) => {
        rec.onstop = res
      })

      rec.start(250)
      await playUntil(segments[0].end)

      for (let i = 1; i < segments.length; i++) {
        if (cancelRef.current) break
        setExportIndex(i)
        // בין קטעים: משהים את ההקלטה, מחכים שה-seek באמת יסתיים, וממשיכים
        if (rec.state === 'recording') rec.pause()
        await awaitSeek(v, segments[i].start)
        if (cancelRef.current) break
        if (rec.state === 'paused') rec.resume()
        await playUntil(segments[i].end)
      }

      rec.stop()
      v.pause()
      await stopped

      if (cancelRef.current) {
        toast.error(L('הייצוא בוטל', 'Export canceled'))
      } else {
        const blob = new Blob(chunks, { type: rec.mimeType || mime })
        const ext = (rec.mimeType || mime).includes('mp4') ? 'mp4' : 'webm'
        setResultClip({ url: URL.createObjectURL(blob), ext, size: blob.size, blob })
        toast.success(L('הקליפ מוכן!', 'Your clip is ready!'))
      }
    } catch (err) {
      toast.error(L('הייצוא נכשל: ', 'Export failed: ') + (err?.message || err))
    } finally {
      stopTick()
      setExporting(false)
    }
  }

  const cancelExport = () => {
    cancelRef.current = true
  }

  const shareClip = async () => {
    if (!result?.blob) return
    const base = (fileName || 'clip').replace(/\.[^.]+$/, '')
    const file = new File([result.blob], `${base}-קליפ.${result.ext}`, { type: result.blob.type })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
      } catch {
        /* המשתמש ביטל את השיתוף */
      }
    } else {
      toast.error(L('שיתוף קבצים לא נתמך בדפדפן הזה — השתמש בהורדה.', 'File sharing is not supported here — use Download.'))
    }
  }

  const totalClip = segments.reduce((s, x) => s + (x.end - x.start), 0)
  const baseName = (fileName || 'clip').replace(/\.[^.]+$/, '')

  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('עריכת וידאו · הכול במכשיר שלך', 'Video editing · all on your device')}</div>
          <h2>{L('עורך הווידאו', 'Video editor')}</h2>
          <p className="page-desc">
            {L('העלה צילום משחק או אימון, סמן את הקטעים החשובים, וחבר אותם לקליפ אחד — בלי להעלות כלום לשרת.', 'Load game or practice footage, mark the key moments, and join them into one clip — nothing is uploaded to a server.')}
          </p>
        </div>
        {srcUrl && (
          <div className="page-header-actions">
            <label className={exporting ? 'btn-soft ve-replace is-disabled' : 'btn-soft ve-replace'} aria-disabled={exporting}>
              <Upload size={16} /> {L('החלפת סרטון', 'Replace video')}
              <input type="file" accept="video/*" hidden disabled={exporting} onChange={(e) => loadFile(e.target.files?.[0])} />
            </label>
          </div>
        )}
      </header>

      {!srcUrl ? (
        /* ---- מצב ריק: אזור העלאה ---- */
        <label
          className="ve-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <span className="ve-drop-ic"><Clapperboard size={30} /></span>
          <strong>{L('גרור לכאן סרטון, או לחץ לבחירה', 'Drag a video here, or click to choose')}</strong>
          <span className="muted small">
            {L('הסרטון נשאר אצלך במכשיר — לא עולה לשום שרת.', 'The video stays on your device — nothing is uploaded.')}
          </span>
          <input type="file" accept="video/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
        </label>
      ) : (
        <div className="ve-layout">
          {/* ---- הנגן והציר ---- */}
          <div className="ve-main">
            <div className="ve-player-wrap">
              <video
                ref={videoRef}
                className="ve-player"
                src={srcUrl}
                playsInline
                onClick={togglePlay}
                onLoadedMetadata={(e) => {
                  const v = e.target
                  // קבצים מסוימים (למשל הקלטות דפדפן) מדווחים Infinity —
                  // הטריק המוכר: קפיצה לסוף מאלצת את הדפדפן לחשב משך אמיתי.
                  if (v.duration === Infinity) {
                    const onDur = () => {
                      if (Number.isFinite(v.duration)) {
                        v.removeEventListener('durationchange', onDur)
                        setDuration(v.duration)
                        v.currentTime = 0
                      }
                    }
                    v.addEventListener('durationchange', onDur)
                    v.currentTime = 1e10
                  } else {
                    setDuration(v.duration || 0)
                  }
                }}
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
              {exporting && (
                <div className="ve-export-shield">
                  <span className="ve-export-spin" aria-hidden="true" />
                  <strong>
                    {L(`מייצא קטע ${exportIndex + 1} מתוך ${segments.length}...`, `Exporting segment ${exportIndex + 1} of ${segments.length}...`)}
                  </strong>
                  <span className="small">
                    {L('הייצוא מתנגן בזמן אמת — השאר את הטאב פתוח.', 'Export plays in real time — keep this tab open.')}
                  </span>
                  <button className="btn-soft" onClick={cancelExport}>
                    <X size={15} /> {L('ביטול', 'Cancel')}
                  </button>
                </div>
              )}
            </div>

            {/* ציר זמן — LTR כמו בכל נגן וידאו; נגיש גם במקלדת */}
            <div
              className={exporting ? 've-track is-disabled' : 've-track'}
              dir="ltr"
              tabIndex={0}
              onKeyDown={onTrackKey}
              onClick={(e) => {
                if (exporting) return
                const r = e.currentTarget.getBoundingClientRect()
                seekTo(((e.clientX - r.left) / r.width) * duration)
              }}
              role="slider"
              aria-label={L('ציר זמן', 'Timeline')}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              aria-disabled={exporting}
            >
              {segments.map((s, i) => (
                <span
                  key={s.id}
                  className="ve-track-seg"
                  style={{
                    left: `${duration ? (s.start / duration) * 100 : 0}%`,
                    width: `${duration ? ((s.end - s.start) / duration) * 100 : 0}%`,
                  }}
                  title={`${i + 1}`}
                />
              ))}
              {pendingStart != null && (
                <span
                  className="ve-track-pending"
                  style={{
                    left: `${duration ? (pendingStart / duration) * 100 : 0}%`,
                    width: `${duration ? (Math.max(0, currentTime - pendingStart) / duration) * 100 : 0}%`,
                  }}
                />
              )}
              <span
                className="ve-track-head"
                style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>

            <div className="ve-transport" dir="ltr">
              <span className="ve-time"><bdi>{fmt(currentTime)}</bdi> / <bdi>{fmt(duration)}</bdi></span>
            </div>

            {/* ---- פעולות סימון ---- */}
            <div className="ve-actions">
              <button className="btn-soft" onClick={togglePlay} disabled={exporting}>
                <Play size={16} /> {playing ? L('השהה', 'Pause') : L('נגן', 'Play')}
              </button>
              <button className="btn-primary" onClick={markStart} disabled={exporting}>
                <Flag size={16} /> {L('סמן התחלה', 'Mark start')}
              </button>
              <button
                className="btn-primary"
                onClick={markEnd}
                disabled={exporting || pendingStart == null}
              >
                <Scissors size={16} /> {L('סמן סוף וחתוך', 'Mark end & cut')}
              </button>
              {pendingStart != null && (
                <button className="btn-ghost" onClick={() => setPendingStart(null)} disabled={exporting}>
                  <X size={15} /> {L(`ביטול (התחלה: ${fmt(pendingStart)})`, `Cancel (start: ${fmt(pendingStart)})`)}
                </button>
              )}
            </div>
            <p className="muted small ve-hint">
              {L('נגן עד הרגע הנכון, לחץ "סמן התחלה", המשך עד סוף הקטע ולחץ "סמן סוף וחתוך". חזור על זה לכל קטע.', 'Play to the right moment, tap "Mark start", continue to the end of the moment and tap "Mark end & cut". Repeat for every segment.')}
            </p>
          </div>

          {/* ---- רשימת הקטעים + ייצוא ---- */}
          <aside className="ve-side">
            <div className="pr-card">
              <h3 className="pr-card-title">
                <Film size={16} /> {L('הקטעים בקליפ', 'Clip segments')}
                {segments.length > 0 && (
                  <span className="ve-side-total"><bdi>{fmt(totalClip)}</bdi></span>
                )}
              </h3>

              {segments.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>
                  {L('עדיין אין קטעים — סמן התחלה וסוף בנגן כדי להוסיף את הראשון.', 'No segments yet — mark a start and end in the player to add the first one.')}
                </p>
              ) : (
                <ul className="ve-seglist">
                  {segments.map((s, i) => (
                    <li key={s.id} className="ve-seg">
                      <span className="ve-seg-num">{i + 1}</span>
                      <div className="ve-seg-body">
                        <span className="ve-seg-times" dir="ltr">
                          <bdi>{fmt(s.start)}</bdi> → <bdi>{fmt(s.end)}</bdi>
                          <em>({fmt(s.end - s.start)})</em>
                        </span>
                        <span className="ve-seg-nudges" dir="ltr">
                          <button onClick={() => nudge(s.id, 'start', -0.5)} disabled={exporting} title={L('התחלה מוקדם יותר', 'Start earlier')} aria-label={L('הקדם התחלה', 'Start earlier')}><Minus size={13} /></button>
                          <b>{L('התחלה', 'start')}</b>
                          <button onClick={() => nudge(s.id, 'start', 0.5)} disabled={exporting} title={L('התחלה מאוחר יותר', 'Start later')} aria-label={L('אחר התחלה', 'Start later')}><Plus size={13} /></button>
                          <i />
                          <button onClick={() => nudge(s.id, 'end', -0.5)} disabled={exporting} title={L('סוף מוקדם יותר', 'End earlier')} aria-label={L('הקדם סוף', 'End earlier')}><Minus size={13} /></button>
                          <b>{L('סוף', 'end')}</b>
                          <button onClick={() => nudge(s.id, 'end', 0.5)} disabled={exporting} title={L('סוף מאוחר יותר', 'End later')} aria-label={L('אחר סוף', 'End later')}><Plus size={13} /></button>
                        </span>
                      </div>
                      <div className="ve-seg-acts">
                        <button className="icon-btn" onClick={() => previewSegment(s)} disabled={exporting} aria-label={L('נגן קטע', 'Play segment')}><Play size={14} /></button>
                        <button className="icon-btn" onClick={() => moveSegment(i, -1)} disabled={exporting || i === 0} aria-label={L('הזז מעלה', 'Move up')}><ChevronUp size={14} /></button>
                        <button className="icon-btn" onClick={() => moveSegment(i, 1)} disabled={exporting || i === segments.length - 1} aria-label={L('הזז מטה', 'Move down')}><ChevronDown size={14} /></button>
                        <button className="icon-btn danger" onClick={() => removeSegment(s.id)} disabled={exporting} aria-label={L('מחק קטע', 'Delete segment')}><Trash2 size={14} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <button
                className="btn-primary ve-export-btn"
                onClick={exportClip}
                disabled={exporting || segments.length === 0}
                aria-busy={exporting}
              >
                <Scissors size={16} />
                {exporting
                  ? L('מייצא...', 'Exporting...')
                  : L(`חבר וייצא קליפ (${fmt(totalClip)})`, `Join & export clip (${fmt(totalClip)})`)}
              </button>
              {segments.length > 0 && !exporting && (
                <p className="muted small" style={{ margin: '8px 0 0' }}>
                  {L('הייצוא מתנגן בזמן אמת — משך הייצוא כמשך הקליפ.', 'Export plays in real time — it takes as long as the clip.')}
                </p>
              )}
            </div>

            {/* ---- תוצאה ---- */}
            {result && (
              <div className="pr-card ve-result">
                <h3 className="pr-card-title"><Download size={16} /> {L('הקליפ מוכן', 'Clip ready')}</h3>
                <video className="ve-result-player" src={result.url} controls playsInline />
                <div className="ve-result-acts">
                  <a
                    className="btn-primary"
                    href={result.url}
                    download={`${baseName}-קליפ.${result.ext}`}
                  >
                    <Download size={16} /> {L('הורדה', 'Download')}
                    <span className="ve-size">({Math.max(1, Math.round(result.size / 1024 / 1024))}MB)</span>
                  </a>
                  <button className="btn-soft" onClick={shareClip}>
                    <Share2 size={16} /> {L('שיתוף', 'Share')}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
                      setResultClip(null)
                    }}
                  >
                    <RotateCcw size={15} /> {L('עריכה מחדש', 'Edit again')}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
