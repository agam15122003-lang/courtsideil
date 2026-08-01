import { useState } from 'react'
import { ClipboardList, Volleyball } from 'lucide-react'
import { ChevronBack, ChevronFwd } from './DirIcon'
import Logo from './Logo'
import { L } from './i18n'

// 1a · בחירת תפקיד — המסך הראשון בזרימת "לא מחובר": Landing → RolePicker → Auth.
// שני תפקידים בלבד (החלטת הבעלים: "הורה" ירד מהמסך). שחקן שנרשם בלי קוד קבוצה
// הוא משתמש מלא בלי קבוצה — אין מצב "ממתין לאישור".
export default function RolePicker({ onPick, onBack, onSignIn }) {
  // מאמן מסומן מראש — הקהל העיקרי, וגם ברירת מחדל אם המשתמש רק מסתכל
  const [role, setRole] = useState('coach')

  const roles = [
    {
      id: 'coach',
      Icon: ClipboardList,
      name: L('מאמן', 'Coach'),
      desc: L(
        'בונה תוכניות אימון, מנהל קבוצות, שולח לשחקנים',
        'Builds training plans, manages teams, sends work to players',
      ),
    },
    {
      id: 'player',
      Icon: Volleyball,
      name: L('שחקן', 'Player'),
      desc: L(
        'מקבל משימות מהמאמן ועוקב אחרי היעדים שלו',
        'Gets assignments from the coach and tracks their own goals',
      ),
      tag: L('צריך קוד מהמאמן', 'Needs a code from the coach'),
    },
  ]

  // הבחירה נשמרת לפני המעבר — Auth מקבל אותה כ-prop, ורענון באמצע ההרשמה לא מאבד אותה
  const choose = (id) => {
    setRole(id)
    try {
      localStorage.setItem('signup_role', id)
    } catch {
      /* ignore */
    }
    onPick?.(id)
  }

  return (
    <div className="auth-page auth-split csa csa-rp">
      {/* באנר — סימן-מים של מגרש מעל גרדיאנט נייבי (DESIGN.md §2ב, דפוס 1).
          במובייל הוא הבאנר העליון; מעל 861px הוא חוזר להיות פאנל צד. */}
      <aside className="auth-hero-panel csa-banner csa-banner--role">
        <img className="csa-banner-img" src="/auth-court.jpg" alt="" aria-hidden="true" />
        <div className="auth-hero-overlay csa-veil" aria-hidden="true" />

        <div className="auth-hero-content csa-banner-body">
          {onBack && (
            <button type="button" className="csa-back" onClick={onBack}>
              <ChevronBack size={17} /> {L('חזרה לדף הבית', 'Back to home')}
            </button>
          )}

          <div className="csa-brand" style={{ marginTop: 6 }}>
            <Logo size={34} />
            <span>CourtSide</span>
          </div>

          <span className="csa-eyebrow">{L('קהילת הכדורסל של ישראל', 'Israel’s basketball community')}</span>
          <h1 className="csa-title">
            {L('ברוכים הבאים', 'Welcome to')}
            <br />
            {L('לחדר המאמנים', 'the coaches’ room')}
          </h1>
          <p className="csa-sub">
            {L(
              'בוחרים איך נכנסים — וכל אחד מקבל מסך שנבנה לתפקיד שלו.',
              'Choose how you come in — and each role gets a screen built for it.',
            )}
          </p>
        </div>
      </aside>

      <div className="auth-form-panel csa-sheet">
        <div className="auth-card csa-sheet-in">
          <span className="csa-eyebrow csa-eyebrow--ink" id="csa-rp-q">
            {L('מי אתה במגרש?', 'Who are you on the court?')}
          </span>

          {/* כרטיסים אמיתיים מסוג button — נגישים למקלדת, ו-aria-pressed מדווח על הבחירה */}
          <div className="csa-roles" role="group" aria-labelledby="csa-rp-q">
            {roles.map(({ id, Icon, name, desc, tag }) => (
              <button
                key={id}
                type="button"
                className={role === id ? 'csa-role is-on' : 'csa-role'}
                aria-pressed={role === id}
                onClick={() => choose(id)}
              >
                <span className="csa-role-ic">
                  <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="csa-role-tx">
                  <b>{name}</b>
                  <span>{desc}</span>
                  {tag && <span className="csa-role-tag">{tag}</span>}
                </span>
                {/* "המשך" — חייב להצביע קדימה, ומתהפך לפי שפה */}
                <ChevronFwd size={16} />
              </button>
            ))}
          </div>

          <div className="csa-rp-foot">
            <div className="csa-swap">
              {L('כבר יש לך חשבון?', 'Already have an account?')}
              <button type="button" className="link-button" onClick={onSignIn}>
                {L('כניסה', 'Log in')}
              </button>
            </div>
            <p className="csa-fine">
              {L('בהמשך אתה מאשר את ', 'By continuing you agree to our ')}
              <a href="/terms.html" target="_blank" rel="noopener noreferrer">
                {L('תנאי השימוש', 'Terms of Use')}
              </a>
              {L(' ו', ' and ')}
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
                {L('מדיניות הפרטיות', 'Privacy Policy')}
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
