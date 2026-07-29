import { useState } from 'react'
import { Headphones, ExternalLink, PlayCircle } from 'lucide-react'
import { PODCASTS } from './constants'
import Videos from './Videos'
import { L } from './i18n'

// עמוד "מדיה" — מסך 14a/14b במסמך המסירה: שני טאבים, סרטונים ופודקאסטים.
//
// שני שינויים מול הגרסה הקודמת, שניהם לפי המוקאפ:
// 1. אין יותר page-header כאן. Dashboard עוטף את המסך ב-<Page> שכבר מספק
//    באנר נייבי עם eyebrow, כותרת ותת-כותרת — הכותרת הפנימית הייתה כפילות.
// 2. טאב הסרטונים לא מציג יותר כרטיס-צד של פודקאסטים. במוקאפ הפודקאסטים
//    הם טאב עצמאי, וכרטיס הצד רק שכפל אותו וגזל רוחב מרשת הסרטונים.
//
// props: session, profile
export default function Media({ session, profile }) {
  const [mode, setMode] = useState('videos') // 'videos' | 'podcasts'

  return (
    <div className="md-screen">
      <div className="tabs md-tabs">
        <button
          type="button"
          className={mode === 'videos' ? 'tab active' : 'tab'}
          aria-pressed={mode === 'videos'}
          onClick={() => setMode('videos')}
        >
          <PlayCircle size={15} aria-hidden="true" /> {L('סרטונים', 'Videos')}
        </button>
        <button
          type="button"
          className={mode === 'podcasts' ? 'tab active' : 'tab'}
          aria-pressed={mode === 'podcasts'}
          onClick={() => setMode('podcasts')}
        >
          <Headphones size={15} aria-hidden="true" /> {L('פודקאסטים', 'Podcasts')}
        </button>
      </div>

      {mode === 'videos' ? (
        <Videos session={session} profile={profile} />
      ) : (
        <>
          <p className="md-lede">
            {L('פודקאסטים נבחרים של כדורסל בעברית ובאנגלית — לחיצה פותחת ישירות בספוטיפיי.', 'Selected basketball podcasts in Hebrew and English — tap to open directly in Spotify.')}
          </p>
          <div className="podcast-grid podcast-grid-full">
            {PODCASTS.map((p) => (
              <a key={p.title} className="podcast-card" href={p.url} target="_blank" rel="noreferrer">
                <span className="podcast-ic"><Headphones size={20} aria-hidden="true" /></span>
                <div className="podcast-body">
                  <div className="podcast-top">
                    <span className="podcast-title">{p.title}</span>
                    <span className="podcast-lang">{p.lang}</span>
                  </div>
                  <span className="podcast-desc">{p.desc}</span>
                  <span className="podcast-open">
                    {L('פתח בספוטיפיי', 'Open in Spotify')} <ExternalLink size={13} aria-hidden="true" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
