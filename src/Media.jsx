import { useState } from 'react'
import { Headphones, ExternalLink, PlayCircle } from 'lucide-react'
import { PODCASTS } from './constants'
import Videos from './Videos'
import { L } from './i18n'

// עמוד "מדיה" — ספריית סרטונים מדורגת + פודקאסטים נבחרים בכרטיס צד (מסך היעד 10).
// props: session, profile
export default function Media({ session, profile }) {
  const [mode, setMode] = useState('videos') // 'videos' | 'podcasts'

  const podcastsCard = (
    <aside className="media-podcasts pr-card">
      <h3 className="pr-card-title"><Headphones size={17} /> {L('פודקאסטים נבחרים', 'Selected podcasts')}</h3>
      <p className="muted small" style={{ margin: '0 0 10px' }}>
        {L('לחיצה פותחת ישירות בספוטיפיי.', 'Tap to open directly in Spotify.')}
      </p>
      <div className="podcast-grid">
        {PODCASTS.slice(0, 3).map((p) => (
          <a key={p.title} className="podcast-card" href={p.url} target="_blank" rel="noreferrer">
            <span className="podcast-ic"><Headphones size={20} /></span>
            <div className="podcast-body">
              <div className="podcast-top">
                <span className="podcast-title">{p.title}</span>
                <span className="podcast-lang">{p.lang}</span>
              </div>
              <span className="podcast-desc">{p.desc}</span>
              <span className="podcast-open">
                {L('פתח בספוטיפיי', 'Open in Spotify')} <ExternalLink size={13} />
              </span>
            </div>
          </a>
        ))}
      </div>
      <button type="button" className="link-button" style={{ marginTop: 10 }} onClick={() => setMode('podcasts')}>
        {L('לכל הפודקאסטים', 'All podcasts')}
      </button>
    </aside>
  )

  return (
    <div className="welcome-card">
      <header className="page-header">
        <div className="page-header-text">
          <div className="welcome-badge">{L('מדיה', 'Media')}</div>
          <h2>{L('סרטונים ופודקאסטים', 'Videos & podcasts')}</h2>
          <p className="page-desc">{L('ספריית סרטוני אימון משותפת ופודקאסטים נבחרים — הכול במקום אחד.', 'A shared training-video library and selected podcasts — all in one place.')}</p>
        </div>
      </header>

      <div className="tabs">
        <button
          className={mode === 'videos' ? 'tab active' : 'tab'}
          onClick={() => setMode('videos')}
        >
          <PlayCircle size={15} aria-hidden="true" /> {L('סרטונים', 'Videos')}
        </button>
        <button
          className={mode === 'podcasts' ? 'tab active' : 'tab'}
          onClick={() => setMode('podcasts')}
        >
          <Headphones size={15} aria-hidden="true" /> {L('פודקאסטים', 'Podcasts')}
        </button>
      </div>

      {mode === 'videos' ? (
        <div className="media-split">
          <div className="media-main">
            <Videos session={session} profile={profile} />
          </div>
          {podcastsCard}
        </div>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 12 }}>
            {L('פודקאסטים נבחרים של כדורסל בעברית ובאנגלית — לחיצה פותחת ישירות בספוטיפיי.', 'Selected basketball podcasts in Hebrew and English — tap to open directly in Spotify.')}
          </p>
          <div className="podcast-grid podcast-grid-full">
            {PODCASTS.map((p) => (
              <a key={p.title} className="podcast-card" href={p.url} target="_blank" rel="noreferrer">
                <span className="podcast-ic"><Headphones size={20} /></span>
                <div className="podcast-body">
                  <div className="podcast-top">
                    <span className="podcast-title">{p.title}</span>
                    <span className="podcast-lang">{p.lang}</span>
                  </div>
                  <span className="podcast-desc">{p.desc}</span>
                  <span className="podcast-open">
                    {L('פתח בספוטיפיי', 'Open in Spotify')} <ExternalLink size={13} />
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
