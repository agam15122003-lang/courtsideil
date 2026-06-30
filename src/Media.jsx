import { useState } from 'react'
import { Headphones, ExternalLink } from 'lucide-react'
import { PODCASTS } from './constants'
import Videos from './Videos'
import { L } from './i18n'

// עמוד "מדיה" — פודקסטים (פתיחה בספוטיפיי) + סרטוני יוטיוב משותפים.
// props: session
export default function Media({ session, profile }) {
  const [mode, setMode] = useState('podcasts') // 'podcasts' | 'videos'

  return (
    <div className="welcome-card">
      <div className="welcome-badge">{L('מדיה', 'Media')}</div>

      <div className="tabs" style={{ marginTop: 12 }}>
        <button
          className={mode === 'podcasts' ? 'tab active' : 'tab'}
          onClick={() => setMode('podcasts')}
        >
          {L('פודקסטים', 'Podcasts')}
        </button>
        <button
          className={mode === 'videos' ? 'tab active' : 'tab'}
          onClick={() => setMode('videos')}
        >
          {L('סרטונים', 'Videos')}
        </button>
      </div>

      {mode === 'podcasts' ? (
        <>
          <p className="muted small" style={{ marginTop: 12 }}>
            {L('פודקסטים נבחרים של כדורסל בעברית ובאנגלית — לחיצה פותחת ישירות בספוטיפיי.', 'Selected basketball podcasts in Hebrew and English — tap to open directly in Spotify.')}
          </p>
          <div className="podcast-grid">
            {PODCASTS.map((p) => (
              <a
                key={p.title}
                className="podcast-card"
                href={p.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="podcast-ic">
                  <Headphones size={20} />
                </span>
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
      ) : (
        <Videos session={session} profile={profile} />
      )}
    </div>
  )
}
