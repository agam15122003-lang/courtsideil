import { ShieldAlert, Mail, LogOut } from 'lucide-react'
import { supabase } from './supabaseClient'
import Logo from './Logo'
import { L } from './i18n'
import { CONTACT_EMAIL } from './constants'

// מסך «החשבון הושעה» למאמן.
//
// עד 24.8 מאמן שהושעה (profiles.banned) נכנס לאפליקציה כרגיל, ראה הכול,
// וכל ניסיון שמירה נכשל בטוסט סתמי — בלי לדעת למה ובלי דרך לפנות.
// המדיניות בשרת (supabase_consent_enforcement.sql) חוסמת ממילא כל כתיבה;
// המסך הזה רק אומר את זה בקול, ונותן דרך לענות.
export default function AccountBlocked({ email }) {
  const subject = encodeURIComponent('CourtSide — ערעור על השעיית חשבון')
  const body = encodeURIComponent(`שלום,\n\nהחשבון שלי (${email || ''}) מושעה ואשמח להבין למה.\n\nתודה,\n`)
  return (
    <div className="center-screen">
      <div className="welcome-card abk-card" role="alert">
        <div className="abk-brand"><Logo size={32} /><span>CourtSide</span></div>
        <span className="empty-ic abk-ic"><ShieldAlert size={26} /></span>
        <h2 className="abk-title">{L('החשבון שלך מושעה', 'Your account is suspended')}</h2>
        <p className="muted">
          {L('בשלב הזה אי אפשר להיכנס לאפליקציה. שום דבר לא נמחק — הנתונים שלך שמורים, והם יחזרו ברגע שההשעיה תוסר.',
             'You cannot use the app right now. Nothing was deleted — your data is kept and returns the moment the suspension is lifted.')}
        </p>
        <p className="muted small">
          {L('אם זה נראה לך טעות, כתוב לנו ונבדוק. אנחנו עונים תוך כמה ימים.',
             'If this looks like a mistake, write to us and we will look into it. We reply within a few days.')}
        </p>
        <div className="abk-acts">
          <a className="btn-primary" href={`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`}>
            <Mail size={16} aria-hidden="true" /> {L('פנייה אלינו', 'Contact us')}
          </a>
          <button type="button" className="btn-soft" onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} aria-hidden="true" /> {L('יציאה', 'Sign out')}
          </button>
        </div>
      </div>
    </div>
  )
}
