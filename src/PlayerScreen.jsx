import { Fragment, useState, useEffect } from 'react'
import { Sun, Moon } from 'lucide-react'
import { L } from './i18n'

// PlayerScreen — המעטפת המשותפת לשישה מסכי השחקן, לפי מסמך העיצוב
// PlayerScreens.dc.html: באנר בצבע המסך, ומעליו שורת שלושה מספרים
// ש«רוכבת» על תחתית הבאנר.
//
// ⚠ מה שהמסמך מצייר ו**לא** מיושם כאן: סרגל הצד וסרגל הטאבים התחתון
// שלו. לאתר כבר יש ניווט משלו (‎.sidebar בדסקטופ, PocketNav במובייל),
// והמסמך צויר כאפליקציה עצמאית. כל מסך יושב במקום שבו הוא כבר חי:
//   sched → 'schedule' · tasks → 'drills' · goals → 'goals'
//   coach → 'pcoach'   · media → 'videos' · profile → 'profile'
//
// הצבעים חיים ב-CSS (‎.ps[data-page]) ולא כאן — כך מצב כהה, ניגודיות
// והדפסה נשארים במקום אחד.

export const PS_PAGES = {
  sched:   { kicker: ['לו״ז', 'SCHEDULE'],            title: ['הלו״ז שלי', 'My schedule'] },
  tasks:   { kicker: ['משימות · שיעורי בית', 'TASKS'], title: ['המשימות שלי', 'My tasks'] },
  goals:   { kicker: ['יעדים', 'GOALS'],               title: ['היעדים שלי', 'My goals'] },
  coach:   { kicker: ['מאמן', 'COACH'],                title: ['המאמן האישי', 'Personal coach'] },
  media:   { kicker: ['מדיה', 'MEDIA'],                title: ['סרטוני לימוד', 'Media'] },
  profile: { kicker: ['פרופיל', 'PROFILE'],            title: ['פרופיל השחקן', 'My profile'] },
}

// ראשי תיבות לעיגול האווטאר — שם ריק לא יפיל את המסך
export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

// מתג בהיר/כהה — אותה מכניקה כמו ThemeToggle ו-DarkSwitch.
// ⚠ ‏state **וגם** מאזין ל-'themechange': התמה חיה על <html data-theme>
// ומשתנה גם ממסכים אחרים (הפרופיל, המגירה). קריאה מה-DOM בזמן רינדור בלי
// state נראתה נכונה ונשברה בלחיצה הראשונה — שום דבר לא גרם לרינדור מחדש,
// ולכן הערך נשאר תקוע והלחיצה השנייה חזרה על אותו כיוון (כהה→כהה).
function HeadTheme() {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark')
  useEffect(() => {
    const sync = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark')
    window.addEventListener('themechange', sync)
    return () => window.removeEventListener('themechange', sync)
  }, [])
  const toggle = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('theme', next) } catch { /* ignore */ }
    window.dispatchEvent(new Event('themechange'))
  }
  return (
    <button type="button" className="ps-hbtn" onClick={toggle} aria-label={L('מצב תצוגה', 'Display mode')}>
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  )
}

// שורת שלושה מספרים. פריט עם value===null יורד — עדיף שני מספרים אמיתיים
// על פני שלישי מומצא.
function Band({ items }) {
  const cells = (items || []).filter((s) => s && s.value !== null && s.value !== undefined)
  if (!cells.length) return null
  return (
    <div className="ps-band">
      {cells.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && <span className="ps-band-div" aria-hidden="true" />}
          <span className="ps-band-cell">
            <b className="ps-band-num" dir="ltr">{s.value}</b>
            <span className="ps-band-lbl">{s.label}</span>
          </span>
        </Fragment>
      ))}
    </div>
  )
}

export default function PlayerScreen({
  page, title, kicker, band, rider, coach, onCoach, bell, children,
}) {
  const meta = PS_PAGES[page] || PS_PAGES.sched
  return (
    <div className="ps" data-page={page}>
      {/* ⚠ בלי z-index על הבאנר: הקשר ערימה כאן כולא את פאנל ההתראות
          מתחת לשורת המספרים (‎.ps-band, z-index:2) */}
      <header className="ps-head">
        <span className="ps-head-ring" aria-hidden="true" />
        <div className="ps-head-row">
          <div className="ps-head-tx">
            <span className="ps-kicker">{kicker || L(meta.kicker[0], meta.kicker[1])}</span>
            <h1 className="ps-title">{title || L(meta.title[0], meta.title[1])}</h1>
          </div>
          <div className="ps-head-btns">
            {/* הפעמון חי כאן כי הסרגל העליון יורד במסכים האלה במובייל.
                מ-769 ומעלה הוא מוסתר ב-CSS — בדסקטופ יש פעמון בסרגל הצד. */}
            {bell ? <span className="ps-head-bell">{bell}</span> : null}
            <HeadTheme />
            {coach && onCoach && (
              <button type="button" className="ps-head-coach" onClick={onCoach}>
                <span className="ps-head-coach-av" aria-hidden="true">{initialsOf(coach)}</span>
                <span className="ps-head-coach-tx">
                  <b>{coach}</b>
                  <span>{L('המאמן שלי', 'My coach')}</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </header>
      {/* מה ש«רוכב» על תחתית הבאנר: שורת המספרים, או — במסך שיש בו
          לשוניות משנה — הגלולה שלהן, בדיוק כמו ב«עולם הכדורסל» */}
      {rider ? <div className="ps-rider">{rider}</div> : <Band items={band} />}
      <div className="ps-body">{children}</div>
    </div>
  )
}
