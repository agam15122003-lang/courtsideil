import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Clapperboard,
  Upload,
  Scissors,
  Flag,
  Play,
  Pause,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  SkipBack,
  SkipForward,
  Download,
  Share2,
  RotateCcw,
  X,
  Film,
  Minus,
  Plus,
  Pencil,
  FolderOpen,
  PlaySquare,
  Keyboard,
} from 'lucide-react'
import { toast } from './toast'
import { L } from './i18n'
import { saveClip, listClips, getClipBlob, renameClip, deleteClip } from './clipStore'

// ============================================================
// עורך וידאו למאמן — סטודיו בהשראת DaVinci Resolve, הכול במכשיר.
// טוענים סרטון משחק → מסמנים קטעים על ציר זמן עם פילמסטריפ →
// מייצאים קליפ מחובר בשם שבחרתם → שומרים לספרייה מקומית (IndexedDB).
// ============================================================

// עיצוב זמן: 12:34.5 (דקות:שניות.עשיריות)
function fmt(t) {
  if (!Number.isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const d = Math.floor((t % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${d}`
}
const fmtShort = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

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
    } catch { /* דפדפן ישן — ננסה את הבא */ }
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

// צעד "עגול" לסרגל ציר הזמן — בערך 10 תוויות לכל אורך
function rulerStep(duration) {
  const target = duration / 10
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  for (const s of steps) if (s >= target) return s
  return 600
}

export default function VideoEditor() {
  const videoRef = useRef(null)
  const cancelRef = useRef(false)
  const tickRef = useRef(null)
  // כתובות ה-blob נשמרות גם ב-ref — כדי שניקוי ה-unmount יראה ערכים עדכניים
  const srcUrlRef = useRef(null)
  const resultUrlRef = useRef(null)
  const modalUrlRef = useRef(null)

  const [srcUrl, setSrcUrl] = useState(null)
  const [fileName, setFileName] = useState('')
  const [clipName, setClipName] = useState('')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [thumbs, setThumbs] = useState([])

  const [pendingStart, setPendingStart] = useState(null)
  const [segments, setSegments] = useState([]) // [{id, start, end}]
  const [selectedId, setSelectedId] = useState(null)

  const [exporting, setExporting] = useState(false)
  const [exportIndex, setExportIndex] = useState(0)
  const [result, setResult] = useState(null) // {url, ext, size, blob, saved}

  // ספריית הקליפים השמורים (IndexedDB)
  const [clips, setClips] = useState([])
  const [storageUsed, setStorageUsed] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const [playModal, setPlayModal] = useState(null) // {url, name}

  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  // ניקוי ביציאה — דרך refs (ה-state של הרינדור הראשון תמיד ריק)
  useEffect(() => {
    return () => {
      stopTick()
      if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current)
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
      if (modalUrlRef.current) URL.revokeObjectURL(modalUrlRef.current)
    }
  }, [])

  const refreshLibrary = useCallback(async () => {
    try {
      setClips(await listClips())
      const est = await navigator.storage?.estimate?.()
      if (est?.usage != null) setStorageUsed(est.usage)
    } catch { /* דפדפן בלי IndexedDB — הספרייה פשוט ריקה */ }
  }, [])
  useEffect(() => { refreshLibrary() }, [refreshLibrary])

  const setSource = (url) => { srcUrlRef.current = url; setSrcUrl(url) }
  const setResultClip = (r) => { resultUrlRef.current = r?.url || null; setResult(r) }

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
    setSelectedId(null)
    setPendingStart(null)
    setDuration(0)
    setCurrentTime(0)
    setThumbs([])
    setFileName(file.name)
    const base = file.name.replace(/\.[^.]+$/, '')
    setClipName(L(`${base} — קליפ`, `${base} — clip`))
    setSource(URL.createObjectURL(file))
  }

  const onDrop = (e) => { e.preventDefault(); loadFile(e.dataTransfer?.files?.[0]) }

  // --- פילמסטריפ: 12 פריימים מהסרטון על אלמנט וידאו נסתר ---
  useEffect(() => {
    if (!srcUrl || !duration || !Number.isFinite(duration)) return
    let alive = true
    const hv = document.createElement('video')
    ;(async () => {
      try {
        hv.src = srcUrl
        hv.muted = true
        hv.preload = 'auto'
        await new Promise((res) => {
          hv.onloadedmetadata = res
          hv.onerror = res
          setTimeout(res, 3000)
        })
        const N = 12, W = 120, H = 68
        const c = document.createElement('canvas')
        c.width = W; c.height = H
        const g = c.getContext('2d')
        const out = []
        for (let i = 0; i < N; i++) {
          if (!alive) return
          const t = ((i + 0.5) / N) * duration
          await new Promise((res) => {
            const on = () => { hv.removeEventListener('seeked', on); res() }
            hv.addEventListener('seeked', on)
            hv.currentTime = t
            setTimeout(res, 900)
          })
          try {
            g.drawImage(hv, 0, 0, W, H)
            out.push(c.toDataURL('image/jpeg', 0.5))
          } catch { out.push(null) }
        }
        if (alive) setThumbs(out)
      } catch { /* אין פילמסטריפ — פס כהה פשוט */ }
      finally { hv.removeAttribute('src'); hv.load?.() }
    })()
    return () => { alive = false }
  }, [srcUrl, duration])

  // --- שליטה בנגן ---
  const seekTo = useCallback((t) => {
    const v = videoRef.current
    if (!v || !duration || exporting) return
    v.currentTime = Math.min(Math.max(0, t), duration)
  }, [duration, exporting])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v || exporting) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [exporting])

  // --- סימון קטעים ---
  const markStart = useCallback(() => {
    if (exporting) return
    setPendingStart(videoRef.current?.currentTime ?? 0)
  }, [exporting])

  const markEnd = useCallback(() => {
    if (exporting) return
    const t = videoRef.current?.currentTime ?? 0
    setPendingStart((ps) => {
      if (ps == null) return ps
      if (t <= ps + 0.2) {
        toast.error(L('נקודת הסוף חייבת להיות אחרי ההתחלה.', 'The end point must come after the start.'))
        return ps
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setSegments((cur) => [...cur, { id, start: ps, end: t }])
      setSelectedId(id)
      toast.success(L('הקטע נוסף לקליפ', 'Segment added to the clip'))
      return null
    })
  }, [exporting])

  const removeSegment = (id) => {
    setSegments((cur) => cur.filter((s) => s.id !== id))
    setSelectedId((sid) => (sid === id ? null : sid))
  }

  const moveSegment = (idx, dir) =>
    setSegments((cur) => {
      const next = [...cur]
      const j = idx + dir
      if (j < 0 || j >= next.length) return cur
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })

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

  // ניגון עד נקודת סוף — כל קריאה עוצרת את הדגימה הקודמת; האינטרוול מזהה את עצמו
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

  const previewSegment = async (seg) => {
    const v = videoRef.current
    if (!v || exporting) return
    cancelRef.current = false
    stopTick()
    setSelectedId(seg.id)
    await awaitSeek(v, seg.start)
    await playUntil(seg.end)
  }

  // ניגון הקליפ כולו — כל הקטעים ברצף (תצוגה מקדימה של התוצאה)
  const previewProgram = async () => {
    const v = videoRef.current
    if (!v || exporting || segments.length === 0) return
    cancelRef.current = false
    stopTick()
    for (const seg of segments) {
      if (cancelRef.current) break
      setSelectedId(seg.id)
      await awaitSeek(v, seg.start)
      if (cancelRef.current) break
      await playUntil(seg.end)
    }
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

    stopTick()
    v.pause()
    cancelRef.current = false
    setExporting(true)
    setExportIndex(0)
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    setResultClip(null)

    // מסך דולק לאורך הייצוא (הקלטה בזמן אמת)
    let wakeLock = null
    try { wakeLock = await navigator.wakeLock?.request?.('screen') } catch { /* לא נתמך */ }

    try {
      // קופצים לתחילת הקטע הראשון *לפני* תחילת ההקלטה
      await awaitSeek(v, segments[0].start)

      const stream = capture.call(v)
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
      const chunks = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }
      const stopped = new Promise((res) => { rec.onstop = res })

      rec.start(250)
      await playUntil(segments[0].end)

      for (let i = 1; i < segments.length; i++) {
        if (cancelRef.current) break
        setExportIndex(i)
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
        setResultClip({ url: URL.createObjectURL(blob), ext, size: blob.size, blob, saved: false })
      }
    } catch (err) {
      toast.error(L('הייצוא נכשל: ', 'Export failed: ') + (err?.message || err))
    } finally {
      stopTick()
      setExporting(false)
      try { wakeLock?.release?.() } catch { /* שוחרר כבר */ }
    }
  }

  const cancelExport = () => { cancelRef.current = true }

  const exportName = (clipName || '').trim() || L('קליפ', 'clip')

  const saveResultToLibrary = async () => {
    if (!result?.blob || result.saved) return
    try {
      const est = await navigator.storage?.estimate?.()
      if (est?.quota && est?.usage != null && est.usage + result.blob.size * 1.2 > est.quota) {
        toast.error(L('אין מספיק מקום בדפדפן — הורד את הקליפ במקום.', 'Not enough browser storage — download the clip instead.'))
        return
      }
      const totalClipNow = segments.reduce((s, x) => s + (x.end - x.start), 0)
      await saveClip({ name: exportName, blob: result.blob, ext: result.ext, duration: totalClipNow })
      setResult((r) => (r ? { ...r, saved: true } : r))
      toast.success(L('הקליפ נשמר לספרייה', 'Clip saved to the library'))
      refreshLibrary()
    } catch (err) {
      toast.error(L('השמירה נכשלה: ', 'Save failed: ') + (err?.message || err))
    }
  }

  const shareBlob = async (blob, name, ext) => {
    const file = new File([blob], `${name}.${ext}`, { type: blob.type })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }) } catch { /* בוטל */ }
    } else {
      toast.error(L('שיתוף קבצים לא נתמך בדפדפן הזה — השתמש בהורדה.', 'File sharing is not supported here — use Download.'))
    }
  }

  // --- פעולות ספרייה ---
  const playLibraryClip = async (c) => {
    const rec = await getClipBlob(c.id)
    if (!rec) return
    if (modalUrlRef.current) URL.revokeObjectURL(modalUrlRef.current)
    const url = URL.createObjectURL(rec.blob)
    modalUrlRef.current = url
    setPlayModal({ url, name: rec.name })
  }
  const closeModal = () => {
    if (modalUrlRef.current) { URL.revokeObjectURL(modalUrlRef.current); modalUrlRef.current = null }
    setPlayModal(null)
  }
  const downloadLibraryClip = async (c) => {
    const rec = await getClipBlob(c.id)
    if (!rec) return
    const url = URL.createObjectURL(rec.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${rec.name}.${rec.ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  const shareLibraryClip = async (c) => {
    const rec = await getClipBlob(c.id)
    if (rec) await shareBlob(rec.blob, rec.name, rec.ext)
  }
  const commitRename = async () => {
    if (renamingId && renameVal.trim()) {
      await renameClip(renamingId, renameVal.trim())
      refreshLibrary()
    }
    setRenamingId(null)
  }
  const removeLibraryClip = async (c) => {
    if (!window.confirm(L(`למחוק את "${c.name}" מהספרייה?`, `Delete "${c.name}" from the library?`))) return
    await deleteClip(c.id)
    refreshLibrary()
  }

  // --- קיצורי מקלדת: רווח, I, O, חיצים (לא בתוך שדות טקסט) ---
  useEffect(() => {
    if (!srcUrl) return
    const h = (e) => {
      const t = e.target
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if (exporting) return
      const v = videoRef.current
      if (!v) return
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlay(); break
        case 'KeyI': e.preventDefault(); markStart(); break
        case 'KeyO': e.preventDefault(); markEnd(); break
        case 'ArrowRight': e.preventDefault(); seekTo(v.currentTime + (e.shiftKey ? 1 : 5)); break
        case 'ArrowLeft': e.preventDefault(); seekTo(v.currentTime - (e.shiftKey ? 1 : 5)); break
        case 'Home': e.preventDefault(); seekTo(0); break
        case 'End': e.preventDefault(); seekTo(duration); break
        case 'Escape': setPendingStart(null); break
        default: break
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [srcUrl, exporting, duration, togglePlay, markStart, markEnd, seekTo])

  // גרירת playhead (scrubber + ציר זמן) עם pointer capture
  const scrubFrom = (e, el) => {
    if (exporting) return
    const rect = el.getBoundingClientRect()
    const apply = (clientX) => {
      const x = Math.min(Math.max(0, clientX - rect.left), rect.width)
      seekTo((x / rect.width) * duration)
    }
    apply(e.clientX)
    const move = (ev) => apply(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const totalClip = segments.reduce((s, x) => s + (x.end - x.start), 0)
  const step = duration ? rulerStep(duration) : 10
  const ticks = []
  if (duration) for (let t = 0; t <= duration; t += step) ticks.push(t)

  const posPct = (t) => (duration ? (t / duration) * 100 : 0)

  return (
    <div className="welcome-card ve2-page">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('עריכת וידאו · הכול במכשיר שלך', 'Video editing · all on your device')}</div>
          <h2>{L('אולפן הווידאו', 'Video studio')}</h2>
          <p className="page-desc">
            {L('העלה צילום משחק, סמן קטעים על ציר הזמן, תן שם לקליפ — וייצא או שמור לספרייה. שום דבר לא עולה לשרת.', 'Load game footage, mark moments on the timeline, name your clip — then export or save to your library. Nothing is uploaded.')}
          </p>
        </div>
      </header>

      {!srcUrl ? (
        <>
          {/* ---- מצב ריק: העלאה + הספרייה השמורה ---- */}
          <label className="ve-drop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <span className="ve-drop-ic"><Clapperboard size={30} /></span>
            <strong>{L('גרור לכאן סרטון, או לחץ לבחירה', 'Drag a video here, or click to choose')}</strong>
            <span className="muted small">
              {L('הסרטון נשאר אצלך במכשיר — לא עולה לשום שרת.', 'The video stays on your device — nothing is uploaded.')}
            </span>
            <input type="file" accept="video/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
          </label>
          {clips.length > 0 && (
            <div className="pr-card ve2-lib" style={{ marginTop: 16 }}>
              <LibraryList
                clips={clips}
                storageUsed={storageUsed}
                renamingId={renamingId} renameVal={renameVal}
                setRenamingId={setRenamingId} setRenameVal={setRenameVal}
                commitRename={commitRename}
                onPlay={playLibraryClip} onDownload={downloadLibraryClip}
                onShare={shareLibraryClip} onDelete={removeLibraryClip}
              />
            </div>
          )}
        </>
      ) : (
        <div className="ve2-shell">
          {/* ---- שורת-על: שם הקליפ + פעולות ---- */}
          <div className="ve2-top">
            <input
              className="ve2-name"
              type="text"
              value={clipName}
              onChange={(e) => setClipName(e.target.value)}
              placeholder={L('שם הקליפ...', 'Clip name...')}
              aria-label={L('שם הקליפ', 'Clip name')}
              disabled={exporting}
            />
            <span className="ve2-src muted small" title={fileName}>{fileName}</span>
            <label className={exporting ? 'btn-soft ve-replace is-disabled' : 'btn-soft ve-replace'} aria-disabled={exporting}>
              <Upload size={15} /> <span className="ve2-top-lbl">{L('החלפה', 'Replace')}</span>
              <input type="file" accept="video/*" hidden disabled={exporting} onChange={(e) => loadFile(e.target.files?.[0])} />
            </label>
            <button
              className="btn-primary ve2-export"
              onClick={exportClip}
              disabled={exporting || segments.length === 0}
              aria-busy={exporting}
            >
              <Scissors size={15} />
              {exporting ? L('מייצא...', 'Exporting...') : L('ייצוא', 'Export')}
              {segments.length > 0 && !exporting && <span className="ve2-export-dur"><bdi>{fmt(totalClip)}</bdi></span>}
            </button>
          </div>

          <div className="ve2-body">
            {/* ---- הבמה: נגן, סקראבר, טרנספורט, ציר זמן ---- */}
            <div className="ve2-stage">
              <div className="ve-player-wrap">
                <video
                  ref={videoRef}
                  className="ve-player"
                  src={srcUrl}
                  playsInline
                  onClick={togglePlay}
                  onLoadedMetadata={(e) => {
                    const v = e.target
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
                {pendingStart != null && (
                  <span className="ve2-inchip" dir="ltr"><Flag size={12} /> IN {fmt(pendingStart)}</span>
                )}
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

              {/* סקראבר דק צמוד לנגן */}
              <div
                className={exporting ? 've2-scrub is-disabled' : 've2-scrub'}
                dir="ltr"
                tabIndex={0}
                role="slider"
                aria-label={L('מיקום בסרטון', 'Position in video')}
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(currentTime)}
                aria-disabled={exporting}
                onPointerDown={(e) => scrubFrom(e, e.currentTarget)}
                onKeyDown={(e) => {
                  if (exporting) return
                  if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(currentTime + (e.shiftKey ? 1 : 5)) }
                  else if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(currentTime - (e.shiftKey ? 1 : 5)) }
                }}
              >
                {segments.map((s) => (
                  <span key={s.id} className="ve2-scrub-seg" style={{ left: `${posPct(s.start)}%`, width: `${posPct(s.end - s.start)}%` }} />
                ))}
                {pendingStart != null && (
                  <span className="ve2-scrub-pending" style={{ left: `${posPct(pendingStart)}%`, width: `${posPct(Math.max(0, currentTime - pendingStart))}%` }} />
                )}
                <span className="ve2-scrub-handle" style={{ left: `${posPct(currentTime)}%` }} />
              </div>

              {/* טרנספורט בסגנון NLE */}
              <div className="ve2-transport" dir="ltr">
                <span className="ve2-tc"><bdi>{fmt(currentTime)}</bdi></span>
                <div className="ve2-tbtns">
                  <button className="ve2-tbtn" onClick={() => seekTo(0)} disabled={exporting} aria-label={L('לתחילת הסרטון', 'To start')}><SkipBack size={16} /></button>
                  <button className="ve2-tbtn" onClick={() => seekTo(currentTime - 5)} disabled={exporting} aria-label="-5s"><ChevronsLeft size={17} /></button>
                  <button className="ve2-play" onClick={togglePlay} disabled={exporting} aria-label={playing ? L('השהה', 'Pause') : L('נגן', 'Play')}>
                    {playing ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <button className="ve2-tbtn" onClick={() => seekTo(currentTime + 5)} disabled={exporting} aria-label="+5s"><ChevronsRight size={17} /></button>
                  <button className="ve2-tbtn" onClick={() => seekTo(duration)} disabled={exporting} aria-label={L('לסוף הסרטון', 'To end')}><SkipForward size={16} /></button>
                </div>
                <span className="ve2-tc ve2-tc-total"><bdi>{fmt(duration)}</bdi></span>
              </div>

              {/* כפתורי הסימון — הלולאה המרכזית של המאמן */}
              <div className="ve2-marks">
                <button className="btn-primary" onClick={markStart} disabled={exporting}>
                  <Flag size={16} /> {L('סמן התחלה', 'Mark start')} <kbd className="ve2-kbd">I</kbd>
                </button>
                <button className="btn-primary" onClick={markEnd} disabled={exporting || pendingStart == null}>
                  <Scissors size={16} /> {L('סמן סוף וחתוך', 'Mark end & cut')} <kbd className="ve2-kbd">O</kbd>
                </button>
                {pendingStart != null && (
                  <button className="btn-ghost" onClick={() => setPendingStart(null)} disabled={exporting}>
                    <X size={15} /> {L('ביטול סימון', 'Cancel mark')}
                  </button>
                )}
                <span className="ve2-kbd-hint muted small" title={L('קיצורים: רווח נגן/השהה · I התחלה · O סוף · חיצים ±5 שנ׳ · Shift+חץ ±1 שנ׳', 'Shortcuts: Space play/pause · I in · O out · arrows ±5s · Shift+arrow ±1s')}>
                  <Keyboard size={14} /> {L('רווח · I · O · חיצים', 'Space · I · O · arrows')}
                </span>
              </div>

              {/* ציר זמן עם פילמסטריפ, סרגל ופלייהד */}
              <div className="ve2-tl-wrap" dir="ltr">
                <div
                  className={exporting ? 've2-tl is-disabled' : 've2-tl'}
                  onPointerDown={(e) => scrubFrom(e, e.currentTarget)}
                >
                  <div className="ve2-ruler">
                    {ticks.map((t) => (
                      <span key={t} className="ve2-tick" style={{ left: `${posPct(t)}%` }}>
                        <i />{fmtShort(t)}
                      </span>
                    ))}
                  </div>
                  <div className="ve2-strip">
                    {(thumbs.length ? thumbs : Array.from({ length: 12 }, () => null)).map((th, i) => (
                      <span key={i} className="ve2-thumb" style={th ? { backgroundImage: `url(${th})` } : undefined} />
                    ))}
                    {segments.map((s, i) => (
                      <span
                        key={s.id}
                        className={selectedId === s.id ? 've2-tl-seg is-selected' : 've2-tl-seg'}
                        style={{ left: `${posPct(s.start)}%`, width: `${posPct(s.end - s.start)}%` }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); seekTo(s.start) }}
                        title={`${i + 1} · ${fmt(s.end - s.start)}`}
                      >
                        <b>{i + 1}</b>
                      </span>
                    ))}
                    {pendingStart != null && (
                      <span className="ve2-tl-pending" style={{ left: `${posPct(pendingStart)}%`, width: `${posPct(Math.max(0, currentTime - pendingStart))}%` }} />
                    )}
                  </div>
                  <span className="ve2-playhead" style={{ left: `${posPct(currentTime)}%` }}><i /></span>
                </div>
              </div>
            </div>

            {/* ---- צד: הקליפ הנוכחי + הספרייה ---- */}
            <aside className="ve2-side">
              <div className="pr-card">
                <h3 className="pr-card-title">
                  <Film size={16} /> {L('הקליפ הנוכחי', 'Current clip')}
                  {segments.length > 0 && <span className="ve-side-total"><bdi>{fmt(totalClip)}</bdi></span>}
                </h3>

                {segments.length === 0 ? (
                  <p className="muted small" style={{ margin: 0 }}>
                    {L('סמן התחלה וסוף בנגן — כל קטע יופיע כאן וכבלוק כתום על ציר הזמן.', 'Mark a start and end in the player — each segment shows here and as an orange block on the timeline.')}
                  </p>
                ) : (
                  <>
                    <ul className="ve-seglist">
                      {segments.map((s, i) => (
                        <li key={s.id} className={selectedId === s.id ? 've-seg is-selected' : 've-seg'} onClick={() => { setSelectedId(s.id); seekTo(s.start) }}>
                          <span className="ve-seg-num">{i + 1}</span>
                          <div className="ve-seg-body">
                            <span className="ve-seg-times" dir="ltr">
                              <bdi>{fmt(s.start)}</bdi> → <bdi>{fmt(s.end)}</bdi>
                              <em>({fmt(s.end - s.start)})</em>
                            </span>
                            <span className="ve-seg-nudges" dir="ltr">
                              <button onClick={(e) => { e.stopPropagation(); nudge(s.id, 'start', -0.5) }} disabled={exporting} aria-label={L('הקדם התחלה', 'Start earlier')}><Minus size={13} /></button>
                              <b>{L('התחלה', 'start')}</b>
                              <button onClick={(e) => { e.stopPropagation(); nudge(s.id, 'start', 0.5) }} disabled={exporting} aria-label={L('אחר התחלה', 'Start later')}><Plus size={13} /></button>
                              <i />
                              <button onClick={(e) => { e.stopPropagation(); nudge(s.id, 'end', -0.5) }} disabled={exporting} aria-label={L('הקדם סוף', 'End earlier')}><Minus size={13} /></button>
                              <b>{L('סוף', 'end')}</b>
                              <button onClick={(e) => { e.stopPropagation(); nudge(s.id, 'end', 0.5) }} disabled={exporting} aria-label={L('אחר סוף', 'End later')}><Plus size={13} /></button>
                            </span>
                          </div>
                          <div className="ve-seg-acts">
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); previewSegment(s) }} disabled={exporting} aria-label={L('נגן קטע', 'Play segment')}><Play size={14} /></button>
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); moveSegment(i, -1) }} disabled={exporting || i === 0} aria-label={L('הזז מעלה', 'Move up')}><ChevronUp size={14} /></button>
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); moveSegment(i, 1) }} disabled={exporting || i === segments.length - 1} aria-label={L('הזז מטה', 'Move down')}><ChevronDown size={14} /></button>
                            <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); removeSegment(s.id) }} disabled={exporting} aria-label={L('מחק קטע', 'Delete segment')}><Trash2 size={14} /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button className="btn-soft ve2-program-play" onClick={previewProgram} disabled={exporting}>
                      <PlaySquare size={16} /> {L('נגן את הקליפ כולו', 'Play the whole clip')}
                    </button>
                  </>
                )}
              </div>

              <div className="pr-card ve2-lib">
                <LibraryList
                  clips={clips}
                  storageUsed={storageUsed}
                  renamingId={renamingId} renameVal={renameVal}
                  setRenamingId={setRenamingId} setRenameVal={setRenameVal}
                  commitRename={commitRename}
                  onPlay={playLibraryClip} onDownload={downloadLibraryClip}
                  onShare={shareLibraryClip} onDelete={removeLibraryClip}
                />
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* ---- מודאל תוצאת ייצוא ---- */}
      {result && (
        <div className="tm-overlay" onClick={() => { /* נשאר פתוח — סגירה מפורשת */ }}>
          <div className="tm-modal ve2-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-head">
              <h3>{L('הקליפ מוכן!', 'Your clip is ready!')}</h3>
              <button className="tm-close" onClick={() => { if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current); setResultClip(null) }} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <p className="muted small" style={{ margin: '0 0 10px' }}>
              <strong>{exportName}</strong> · <bdi>{fmt(totalClip)}</bdi> · {Math.max(1, Math.round(result.size / 1024 / 1024))}MB
            </p>
            <video className="ve-result-player" src={result.url} controls playsInline />
            <div className="ve-result-acts">
              <button className="btn-primary" onClick={saveResultToLibrary} disabled={result.saved}>
                <FolderOpen size={16} /> {result.saved ? L('נשמר בספרייה ✓', 'Saved to library ✓') : L('שמור לספרייה', 'Save to library')}
              </button>
              <a className="btn-soft" href={result.url} download={`${exportName}.${result.ext}`}>
                <Download size={16} /> {L('הורדה', 'Download')}
              </a>
              <button className="btn-soft" onClick={() => shareBlob(result.blob, exportName, result.ext)}>
                <Share2 size={16} /> {L('שיתוף', 'Share')}
              </button>
              <button className="btn-ghost" onClick={() => { if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current); setResultClip(null) }}>
                <RotateCcw size={15} /> {L('המשך עריכה', 'Keep editing')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- מודאל ניגון קליפ שמור ---- */}
      {playModal && (
        <div className="tm-overlay" onClick={closeModal}>
          <div className="tm-modal ve2-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-head">
              <h3>{playModal.name}</h3>
              <button className="tm-close" onClick={closeModal} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <video className="ve-result-player" src={playModal.url} controls autoPlay playsInline />
          </div>
        </div>
      )}
    </div>
  )
}

// רשימת הספרייה — משותפת למצב הריק ולפאנל הצד
function LibraryList({ clips, storageUsed, renamingId, renameVal, setRenamingId, setRenameVal, commitRename, onPlay, onDownload, onShare, onDelete }) {
  return (
    <>
      <h3 className="pr-card-title"><FolderOpen size={16} /> {L('הספרייה שלי', 'My library')}
        {clips.length > 0 && <span className="ve-side-total">{clips.length}</span>}
      </h3>
      {clips.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {L('קליפים שתשמור אחרי ייצוא יופיעו כאן — זמינים גם אחרי סגירת הדפדפן.', 'Clips you save after export appear here — available even after closing the browser.')}
        </p>
      ) : (
        <ul className="ve2-cliplist">
          {clips.map((c) => (
            <li key={c.id} className="ve2-clip">
              <div className="ve2-clip-main">
                {renamingId === c.id ? (
                  <input
                    className="finder-input ve2-rename"
                    value={renameVal}
                    autoFocus
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                  />
                ) : (
                  <strong className="ve2-clip-name">{c.name}</strong>
                )}
                <span className="muted small ve2-clip-meta">
                  {c.duration != null && <><bdi>{fmt(c.duration)}</bdi> · </>}
                  {Math.max(1, Math.round((c.size || 0) / 1024 / 1024))}MB · {new Date(c.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                </span>
              </div>
              <div className="ve2-clip-acts">
                <button className="icon-btn" onClick={() => onPlay(c)} aria-label={L('נגן', 'Play')}><Play size={14} /></button>
                <button className="icon-btn" onClick={() => { setRenamingId(c.id); setRenameVal(c.name) }} aria-label={L('שינוי שם', 'Rename')}><Pencil size={13} /></button>
                <button className="icon-btn" onClick={() => onDownload(c)} aria-label={L('הורדה', 'Download')}><Download size={14} /></button>
                <button className="icon-btn" onClick={() => onShare(c)} aria-label={L('שיתוף', 'Share')}><Share2 size={14} /></button>
                <button className="icon-btn danger" onClick={() => onDelete(c)} aria-label={L('מחיקה', 'Delete')}><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {storageUsed != null && clips.length > 0 && (
        <p className="muted small ve2-storage">
          {L(`בשימוש: ${Math.round(storageUsed / 1024 / 1024)}MB מאחסון הדפדפן`, `Using ${Math.round(storageUsed / 1024 / 1024)}MB of browser storage`)}
        </p>
      )}
    </>
  )
}
