import { useEffect } from 'react'
import {
  Dumbbell,
  ClipboardList,
  Users,
  CalendarDays,
  MessageSquare,
  PencilRuler,
  PlayCircle,
  Star,
  ArrowLeft,
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { L } from './i18n'

// reveal-on-scroll — סקשנים נחשפים בגלילה (מכבד prefers-reduced-motion דרך ה-CSS)
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.land .reveal')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

// אילוסטרציית מגרש כדורסל מקורית (SVG) — משטח נייבי מרוסן עם כדור ככתם החום היחיד
function CourtArt() {
  return (
    <svg className="land-court" viewBox="0 0 360 460" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lc-bg" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#26385F" />
          <stop offset="1" stopColor="#141E36" />
        </linearGradient>
        <radialGradient id="lc-glow" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0" stopColor="rgba(232,118,58,0.16)" />
          <stop offset="1" stopColor="rgba(232,118,58,0)" />
        </radialGradient>
      </defs>
      {/* משטח המגרש */}
      <rect x="6" y="6" width="348" height="448" rx="22" fill="url(#lc-bg)" />
      <rect x="6" y="6" width="348" height="448" rx="22" fill="url(#lc-glow)" />
      {/* גוון חמים עדין באזורי הצבע */}
      <g fill="rgba(232,118,58,0.06)">
        <rect x="120" y="24" width="120" height="128" />
        <rect x="120" y="308" width="120" height="128" />
      </g>
      {/* קווי המגרש — הַיירליינים רגועים */}
      <g stroke="rgba(226,234,246,0.42)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="22" y="22" width="316" height="416" rx="10" />
        <line x1="22" y1="230" x2="338" y2="230" />
        <circle cx="180" cy="230" r="44" />
        <rect x="120" y="24" width="120" height="128" />
        <circle cx="180" cy="152" r="38" />
        <path d="M62 24 Q62 148 62 148 Q180 244 298 148 Q298 24 298 24" opacity="0.55" />
        <rect x="120" y="308" width="120" height="128" />
        <circle cx="180" cy="308" r="38" />
        <path d="M62 436 Q62 312 62 312 Q180 216 298 312 Q298 436 298 436" opacity="0.55" />
      </g>
      {/* הכדור — כתם החום המכוון היחיד */}
      <circle cx="180" cy="230" r="14.5" fill="var(--orange-500)" />
      <path d="M165.5 230 H194.5 M180 215.5 V244.5 M169.5 219.5 Q180 230 169.5 240.5 M190.5 219.5 Q180 230 190.5 240.5"
        stroke="rgba(20,29,52,0.9)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// דף נחיתה ציבורי — נראה למי שעדיין לא מחובר. onEnter פותח את מסך ההתחברות.
export default function Landing({ onEnter }) {
  useReveal()
  const FEATURES = [
    { Icon: Dumbbell, title: L('ספריית תרגילים', 'Drill Library'), desc: L('מאות תרגילים עם שדות עשירים, דירוג כוכבים, מועדפים ותגובות — ידע משותף של הקהילה.', 'Hundreds of drills with rich details, star ratings, favorites and comments — shared knowledge from the community.') },
    { Icon: ClipboardList, title: L('בונה אימונים', 'Practice Builder'), desc: L('הרכב אימון מלא בדקות — ידני או בנאי חכם אוטומטי לפי גיל, נושא וזמן יעד.', 'Build a full practice in minutes — manually or with the smart auto-builder by age, topic and target time.') },
    { Icon: PencilRuler, title: L('לוח טקטיקה', 'Tactics Board'), desc: L('שרטט מהלכים על מגרש דיגיטלי, הוסף חצי תנועה ומסירה, ונגן אנימציה שלב-אחרי-שלב.', 'Diagram plays on a digital court, add movement and passing arrows, and play back the animation step by step.') },
    { Icon: CalendarDays, title: L('לו"ז חכם', 'Smart Schedule'), desc: L('נהל את שבוע האימונים בלוח שנה — אימוני קבוצה ואישיים, עם תוכנית מצורפת לכל שעה.', 'Manage your training week on a calendar — team and individual sessions, with a plan attached to every slot.') },
    { Icon: Users, title: L('קהילת מאמנים', 'Coaches Community'), desc: L('מצא מאמנים, צפה בתרגילים שלהם, העתק תוכניות ששותפו ותאם משחקי אימון.', 'Find coaches, browse their drills, copy shared plans and arrange scrimmages.') },
    { Icon: MessageSquare, title: L('תקשורת', 'Messaging'), desc: L('הודעות פרטיות 1:1 וצ׳אט קבוצתי לכל קהילת המאמנים — הכול במקום אחד.', 'Private 1:1 messages and group chat for the whole coaching community — all in one place.') },
  ]

  const STEPS = [
    { n: '1', title: L('הקם פרופיל', 'Set Up Your Profile'), desc: L('מועדון, שכבות גיל ופרטים — והצטרף לקהילה.', 'Club, age groups and details — then join the community.') },
    { n: '2', title: L('בנה את הארסנל', 'Build Your Arsenal'), desc: L('שמור תרגילים, הרכב תוכניות ושרטט מהלכים.', 'Save drills, assemble plans and diagram plays.') },
    { n: '3', title: L('נהל את העונה', 'Run Your Season'), desc: L('סדר לו"ז, הרץ אימונים על המגרש ותתחבר למאמנים.', 'Set your schedule, run practices on the court and connect with coaches.') },
  ]

  const STATS = [
    { num: '7', label: L('כלים מקצועיים', 'pro tools') },
    { num: '5 דק׳', label: L('לבניית אימון מלא', 'to a full practice') },
    { num: L('חינם', 'Free'), label: L('לכל מאמן', 'for every coach') },
  ]

  return (
    <div className="land">
      <header className="land-nav">
        <div className="land-brand">
          <svg viewBox="0 0 100 100" width="30" height="30" aria-hidden="true">
            <circle cx="42" cy="55" r="22" fill="var(--accent)" />
            <circle cx="42" cy="55" r="9" fill="#fff" />
            <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="var(--accent)" />
            <circle cx="78" cy="30" r="6" fill="var(--accent)" />
          </svg>
          <span>CourtSide</span>
        </div>
        <div className="land-nav-actions">
          <ThemeToggle />
          <button className="btn-primary land-login" onClick={onEnter}>
            {L('התחברות / הרשמה', 'Log In / Sign Up')}
          </button>
        </div>
      </header>

      <section className="land-hero">
        <div className="land-hero-text">
          <span className="land-eyebrow">
            <Star size={14} /> {L('הפנקס הדיגיטלי של מאמן הכדורסל', "The basketball coach's digital playbook")}
          </span>
          <h1 className="land-title">
            {L('כל הידע של האימון שלך —', 'All your coaching knowledge —')}<br />
            <span className="land-title-accent">{L('במקום אחד.', 'in one place.')}</span>
          </h1>
          <p className="land-sub">
            {L('תרגילים, תוכניות אימון, לוח טקטיקה, לו"ז וקהילת מאמנים. פלטפורמה מקצועית שנבנתה לעברית מהיסוד — מהירה מספיק לשימוש תוך כדי אימון על המגרש.', 'Drills, practice plans, a tactics board, a schedule and a coaching community. A professional platform built Hebrew-first — fast enough to use right on the court during practice.')}
          </p>
          <div className="land-cta">
            <button className="btn-primary btn-lg" onClick={onEnter}>
              {L('התחל עכשיו — חינם', 'Start now — free')}
              <ArrowLeft size={18} />
            </button>
            <a className="btn-soft btn-lg" href="#features">
              <PlayCircle size={18} />
              {L('גלה את הכלים', 'Explore the tools')}
            </a>
          </div>
          <div className="land-stats">
            {STATS.map((s) => (
              <div key={s.label} className="land-stat">
                <span className="land-stat-num">{s.num}</span>
                <span className="land-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="land-hero-art">
          <CourtArt />
        </div>
      </section>

      <section className="land-section reveal" id="features">
        <span className="land-kicker">{L('הכלים', 'The Tools')}</span>
        <h2 className="land-h2">{L('כל מה שמאמן צריך', 'Everything a coach needs')}</h2>
        <p className="land-lead">{L('שבעה כלים מקצועיים שעובדים יחד, בלי לקפוץ בין אפליקציות.', 'Seven professional tools that work together — no jumping between apps.')}</p>
        <div className="land-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="land-feature">
              <span className="land-feature-ic">
                <f.Icon size={22} />
              </span>
              <h3 className="land-feature-title">{f.title}</h3>
              <p className="land-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-section land-steps-wrap reveal">
        <span className="land-kicker">{L('איך זה עובד', 'How It Works')}</span>
        <h2 className="land-h2">{L('מתחילים בשלוש דקות', 'Get started in three minutes')}</h2>
        <div className="land-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="land-step">
              <span className="land-step-n">{s.n}</span>
              <h3 className="land-feature-title">{s.title}</h3>
              <p className="land-feature-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-band reveal">
        <h2 className="land-band-title">{L('מוכן לסדר את עולם האימון שלך?', 'Ready to organize your coaching world?')}</h2>
        <p className="land-band-sub">{L('הצטרף לקהילת מאמני הכדורסל — בחינם, בעברית, מהמכשיר שכבר בכיס שלך.', 'Join the basketball coaching community — free, and right from the device already in your pocket.')}</p>
        <button className="btn-hero btn-lg" onClick={onEnter}>
          {L('הצטרפות חינם', 'Join free')}
          <ArrowLeft size={18} />
        </button>
      </section>

      <footer className="land-footer">
        <span>{L('CourtSide — הפלטפורמה המקצועית למאמני כדורסל בעברית.', 'CourtSide — the professional platform for basketball coaches.')}</span>
        <span className="muted small">© {new Date().getFullYear()} · {L('כל הזכויות שמורות', 'All rights reserved')}</span>
      </footer>
    </div>
  )
}
