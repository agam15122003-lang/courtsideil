// רצועת הסרטונים של דף הבית — משותפת לשני העולמות (11.8, מסמך העיצוב 3a).
// עד היום היא חיה רק בתוך PlayerDashboard כפונקציה פרטית; בית המאמן קיבל
// «סרטונים מהמדיה» באותו מסמך, וכפילות של השליפה הייתה גוררת גם כפילות
// של הנפילה־לאחור על עמודת featured שאולי טרם נוצרה.
import { useEffect, useState } from 'react'
import { MonitorPlay } from 'lucide-react'
import { supabase } from './supabaseClient'
import { getYouTubeId, cleanVideoTitle } from './youtube'
import { ChevronFwd } from './DirIcon'
import { L } from './i18n'

export default function HomeVideos({ onOpen, heading, cta, limit = 4 }) {
  const [vids, setVids] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      let { data, error } = await supabase.from('drill_videos')
        .select('id, title, url, featured').order('created_at', { ascending: false }).limit(30)
      if (error) {
        // עמודת featured עוד לא קיימת (ה-SQL טרם רץ) — נפילה לשליפה הישנה
        const legacy = await supabase.from('drill_videos')
          .select('id, title, url').order('created_at', { ascending: false }).limit(30)
        data = legacy.data
      }
      if (!alive) return
      const rows = data || []
      const featured = rows.filter((v) => v.featured)
      setVids((featured.length >= limit ? featured : rows).slice(0, limit))
    })()
    return () => { alive = false }
  }, [limit])

  if (!vids || vids.length === 0) return null

  return (
    <section className="nh-card nh-vids">
      <div className="nh-card-head">
        <h2 className="nh-card-title">{heading || L('סרטונים מהמדיה', 'From the media')}</h2>
        <button type="button" className="nh-link" onClick={onOpen}>
          {cta || L('למדיה', 'All media')} <ChevronFwd size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="nh-vid-rail">
        {vids.map((v) => {
          const yt = getYouTubeId(v.url)
          return (
            <button key={v.id} type="button" className="nh-vid" onClick={onOpen}>
              <span
                className="nh-vid-thumb"
                style={yt ? { backgroundImage: `url("https://img.youtube.com/vi/${yt}/hqdefault.jpg")` } : undefined}
                aria-hidden="true"
              >
                <span className="nh-vid-play"><MonitorPlay size={15} aria-hidden="true" /></span>
              </span>
              <span className="nh-vid-title" dir="auto">{cleanVideoTitle(v.title)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
