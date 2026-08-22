import { Hourglass, LogOut } from 'lucide-react'
import { supabase } from './supabaseClient'
import Logo from './Logo'
import { L } from './i18n'

// מסך ההמתנה לחשבון שחקן בזמן שצד השחקן סגור (PLAYER_SIDE=false).
// לא מוחקים כלום ולא נוגעים בפרופיל — רק מסבירים ומציעים יציאה.
// נכון ל-22.8.2026 אין חשבונות שחקן אמיתיים בפרוד; המסך קיים כדי שלא
// יהיה מסך לבן אם בכל זאת מישהו כזה יתחבר.
export default function PlayerSideClosed() {
  return (
    <div className="center-screen">
      <div className="welcome-card pso-card" role="status">
        <div className="pso-brand"><Logo size={34} /><span>CourtSide</span></div>
        <span className="empty-ic pso-ic"><Hourglass size={26} /></span>
        <h2 className="pso-title">{L('צד השחקן ייפתח בקרוב', 'The player side opens soon')}</h2>
        <p className="muted">
          {L('בשלב הזה CourtSide פתוחה למאמנים בלבד. החשבון שלך שמור, ושום דבר לא נמחק — כשצד השחקן יעלה לאוויר תוכל להיכנס ולהמשיך מאותו מקום.',
             'Right now CourtSide is open to coaches only. Your account is kept and nothing was deleted — once the player side goes live you can sign in and pick up where you left off.')}
        </p>
        <button type="button" className="btn-soft" onClick={() => supabase.auth.signOut()}>
          <LogOut size={16} aria-hidden="true" /> {L('יציאה', 'Sign out')}
        </button>
      </div>
    </div>
  )
}
