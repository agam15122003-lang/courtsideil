import { useEffect, useState } from 'react'
import { VideoOff } from 'lucide-react'
import { L } from './i18n'
import { signedVideoUrl } from './storage'

// נגן לקליפ אתגר. הקישור נחתם מחדש בכל הצגה ופג אחרי רבע שעה.
//
// ⚠ אין כאן שום נפילה לכתובת ציבורית: כשל חתימה מציג «לא נמצא» ולא
// מנסה מסלול אחר. זה קליפ של קטין — כשל צריך להיות כשל.
export default function SignedVideo({ path, poster, className }) {
  const [url, setUrl] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    setUrl(null)
    if (!path) { setState('empty'); return () => { alive = false } }
    signedVideoUrl(path).then((u) => {
      if (!alive) return
      if (!u) { setState('error'); return }
      setUrl(u)
      setState('ready')
    })
    return () => { alive = false }
  }, [path])

  if (state === 'loading') return <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />

  if (state !== 'ready') {
    return (
      <div className="gm-video-missing">
        <VideoOff size={20} aria-hidden="true" />
        <span>{L('הקליפ אינו זמין', 'Clip unavailable')}</span>
      </div>
    )
  }

  return (
    <video
      className={className || 'gm-video'}
      src={url}
      poster={poster || undefined}
      controls
      playsInline
      preload="metadata"
    />
  )
}
