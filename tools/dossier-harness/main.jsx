// הרנס ויזואלי ל«תיק שחקן»: המסך האמיתי, ה-CSS האמיתי, נתוני דמה.
// בנייה: node tools/dossier-harness/shoot.mjs   (בונה, מצלם בגודלי מחשב/אייפד/טלפון)
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import PlayerDossier from '../../src/PlayerDossier.jsx'

function App() {
  useEffect(() => {
    document.documentElement.setAttribute('dir', 'rtl')
    document.documentElement.setAttribute('lang', 'he')
  }, [])
  const session = { user: { id: 'coach-me' } }
  const profile = { id: 'coach-me', first_name: 'דור', last_name: 'אביב', club: 'מכבי הדר', is_admin: true }
  return (
    <div className="layout" data-view="dossier">
      <main className="main-content" id="main">
        <div className="main-inner" data-view="dossier">
          <PlayerDossier session={session} profile={profile} />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
