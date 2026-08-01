import { useEffect } from 'react'
import {
  Dumbbell,
  ClipboardList,
  Users,
  CalendarDays,
  MessageSquare,
  PlayCircle,
  Star,
  Target,
  CalendarCheck,
  ListChecks,
  BarChart3,
  Zap,
  Quote,
  ChevronDown,
  Send,
  Eye,
  LogIn,
  UserPlus,
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { L } from './i18n'
import { ArrowFwd } from './DirIcon'
import { COACHING_QUOTES } from './constants'

// reveal-on-scroll — סקשנים נחשפים בגלילה (מכבד prefers-reduced-motion דרך ה-CSS)
function useReveal() {
  useEffect(() => {
    // מפעילים את מצב ה"מוסתר עד גלילה" רק כשה-JS באמת רץ — אחרת הכול גלוי
    document.querySelector('.land')?.classList.add('js-reveal')
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

// דף נחיתה ציבורי — נראה למי שעדיין לא מחובר.
// onLogin  — ישר למסך ההתחברות (אין צורך בבחירת תפקיד כדי להתחבר)
// onSignup — מסלול ההרשמה (בחירת תפקיד ← הרשמה)
// onEnter  — תאימות לאחור: אם לא הועברו השניים, שניהם נופלים לכאן
export default function Landing({ onEnter, onLogin, onSignup }) {
  useReveal()
  const goLogin = onLogin || onEnter
  const goSignup = onSignup || onEnter
  const FEATURES = [
    { Icon: Target, title: L('הצבת יעדים', 'Goal Setting'), desc: L('מציבים יעדים מוגדרים בזמן, שנשמרים וניתן לעקוב אחריהם.', 'Set time-bound goals that are saved and easy to track.') },
    { Icon: ClipboardList, title: L('משימות אישיות', 'Personal Tasks'), desc: L('מתאימים לכל שחקן משימות אישיות שמתאימות בדיוק לו — כי לכל אחד מגיע יחס אישי.', 'Tailor personal tasks that fit each player exactly — because everyone deserves personal attention.') },
    { Icon: CalendarDays, title: L('לו"ז מותאם אישית', 'Personalized Schedule'), desc: L('המאמן מסדר את הלו"ז, השחקנים רואים בזמן אמת את שעות האימונים והמשחק הבא — ואפילו מקבלים תזכורת.', 'The coach sets the schedule, players see practice times and the next game in real time — and even get a reminder.') },
    { Icon: MessageSquare, title: L('תקשורת נוחה', 'Easy Communication'), desc: L('אחרי כל אימון או משחק השחקן מסמן אם ביצע את המשימות ויכול לכתוב הודעה אישית למאמן. המאמן מקבל דוח סיכום ויכול לשלוח הודעה לכולם — ומשוב אישי לכל שחקן.', 'After every practice or game the player marks completed tasks and can message the coach. The coach gets a summary report and can message everyone — plus personal feedback for each player.') },
    { Icon: Dumbbell, title: L('ספריית תרגילים', 'Drill Library'), desc: L('ספריית תרגילים בעברית שגדלה כל שבוע — עם הסבר מלא, דירוג ומועדפים.', 'A Hebrew drill library that grows every week — with full explanations, ratings and favorites.') },
    { Icon: PlayCircle, title: L('אזור מדיה', 'Media Zone'), desc: L('סרטונים מסוננים לפי קטגוריות — בלי לחפש שעות באינטרנט. רוצים לעבוד על יכולות אישיות? מסננים, ועשרות סרטונים מוכנים מופיעים.', 'Videos filtered by category — no more hours of searching. Want to work on individual skills? Filter, and dozens of ready videos appear.') },
  ]

  const STEPS = [
    { n: '1', title: L('מקימים פרופיל', 'Set up a profile'), desc: L('נרשמים כמאמן או כשחקן וממלאים את הפרטים. מאמנים פשוט מתחברים; שחקנים מצטרפים לקבוצה עם קוד מהמאמן.', 'Sign up as a coach or a player and fill in your details. Coaches just log in; players join a team with a code from the coach.') },
    { n: '2', title: L('אתם בפנים', "You're in"), desc: L('חוקרים את האפליקציה וממלאים את החלקים: יעדים, לו"ז ומשימות.', 'Explore the app and fill in the parts: goals, schedule and tasks.') },
    { n: '3', title: L('נהנים', 'Enjoy'), desc: L('מנצלים את CourtSide כדי להשתפר ולנהל את העונה בצורה הכי נוחה ומקצועית.', 'Use CourtSide to improve and run the season in the most convenient, professional way.') },
  ]

  const STATS = [
    { num: L('הכל במקום אחד', 'All in one place'), label: L('כל מה ששחקן ומאמן צריכים', 'everything a player and a coach need') },
    { num: L('קהילה', 'Community'), label: L('של מאמנים שמשתפים ידע', 'of coaches sharing knowledge') },
    { num: L('בעברית', 'In Hebrew'), label: L('בנוי לכדורסל הישראלי', 'built for Israeli basketball') },
  ]

  // "למה CourtSide" — רצועת ערך בין ההירו לפיצ'רים (דפוס ההמרה מהסקיל: Hero → Value → Features → Social Proof → CTA)
  const WHY = [
    { Icon: Zap, title: L('נוח לשימוש', 'Easy to use'), desc: L('הדרך הקלה ביותר לעקוב אחרי הקבוצה ואחרי כל שחקן באופן אישי: לראות התקדמות, לשלוח יעדים מותאמים אישית ולעקוב אחריהם.', 'The easiest way to follow the team and every player personally: see progress, send personalized goals and track them.') },
    { Icon: ClipboardList, title: L('תוכניות אימון ותרגילים', 'Practice plans & drills'), desc: L('כל תרגיל ותוכנית שאתם רושמים נשמרים אצלכם: רואים על מה עבדתם, חוזרים לתרגיל שלא ישב טוב, ומשלבים תרגילים שמורים לתוכנית חדשה. אין דרך קלה יותר לשמור את הידע שלכם.', 'Every drill and plan you write is saved: see what you worked on, revisit a drill that didn’t sit right, and combine saved drills into a new plan. There is no easier way to keep your knowledge.') },
    { Icon: Users, title: L('קהילה וצבירת ידע', 'Community & knowledge'), desc: L('אין דבר חשוב יותר למאמן מהרחבת הידע. ב-CourtSide קהילת מאמנים שלמה שאפשר להתייעץ איתה על הכל: תרגיל חדש, קביעת משחק אימון או סתם לדבר כדורסל. רואים תרגילים של מאמנים אחרים, שואלים ומיישמים.', 'Nothing matters more to a coach than growing knowledge. CourtSide has a whole community of coaches to consult about anything: a new drill, arranging a scrimmage or just talking basketball. See other coaches’ drills, ask and apply.') },
  ]

  // שאלות נפוצות — תשובות אמיתיות מהמוצר בלבד, בלי הבטחות מומצאות
  const FAQ = [
    { q: L('כמה זה עולה?', 'How much does it cost?'), a: L('אפשר להתחיל בחינם ולהשתמש בכלים המרכזיים. בהמשך ייפתחו מסלולים מתקדמים למאמנים ולמועדונים — ומי שמצטרף עכשיו ייהנה מתנאי מייסדים.', 'You can start for free and use the core tools. Advanced plans for coaches and clubs will open later — and early joiners enjoy founders’ terms.') },
    { q: L('למי הפלטפורמה מיועדת?', 'Who is the platform for?'), a: L('למאמני כדורסל בכל הרמות: מחוגים ובתי ספר, דרך מחלקות נוער ועד קבוצות בוגרים — וגם למאמנים אישיים שרוצים סדר בארסנל שלהם.', 'Basketball coaches at every level: youth programs and schools, academy departments and senior teams — plus individual trainers who want their arsenal organized.') },
    { q: L('האם זה עובד בנייד, על המגרש?', 'Does it work on mobile, on the court?'), a: L('כן. הממשק נבנה קודם כול לטלפון, כך שמריצים אימון מהמכשיר שכבר בכיס — בלי התקנה, ישירות בדפדפן.', 'Yes. The interface is built phone-first, so you run practice from the device already in your pocket — no install, straight in the browser.') },
    {
      q: L('מה קורה עם הנתונים שלי?', 'What happens to my data?'),
      a: (
        <>
          {L('התרגילים והתוכניות שלך שמורים בחשבון האישי שלך וזמינים מכל מכשיר. אתה בוחר מה לשתף עם הקהילה ומה נשאר פרטי. לפרטים המלאים ראו את ', 'Your drills and plans are stored in your personal account and available on any device. You choose what to share with the community and what stays private. For full details see the ')}
          <a href="/privacy.html">{L('מדיניות הפרטיות', 'privacy policy')}</a>.
        </>
      ),
    },
    { q: L('איך מצטרפים?', 'How do I join?'), a: L('לוחצים "מתחילים בחינם", נרשמים עם אימייל ומקימים פרופיל — מאמן או שחקן. וזהו, אתם בפנים.', 'Click "Start free", sign up with your email and set up a profile — coach or player. That’s it, you’re in.') },
    { q: L('חייבים לשתף את התרגילים שלי עם כולם?', 'Do I have to share my drills with everyone?'), a: L('לא. אפשר לעבוד לגמרי באופן פרטי, ולשתף עם קהילת המאמנים רק את מה שתבחר — כשתבחר.', 'No. You can work fully privately and share with the coaching community only what you choose — when you choose.') },
  ]

  // "ציטוטים מהמגרש" — ציטוטי אימון מפורסמים שכבר קיימים ב-constants.js. אסור להמציא המלצות/שמות.
  const QUOTE_ROWS = [COACHING_QUOTES.slice(0, 11), COACHING_QUOTES.slice(11)]

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
          <button className="btn-primary land-login" onClick={goLogin}>
            {L('התחברות', 'Log in')}
          </button>
        </div>
      </header>

      <section className="land-hero land-hero-night">
        <span className="lhn-glow" aria-hidden="true" />
        <div className="land-hero-text">
          <span className="land-eyebrow">
            <Star size={14} /> {L('בעברית · למאמנים ולשחקנים', 'In Hebrew · for coaches & players')}
          </span>
          <h1 className="land-title">
            <span className="land-title-accent">CourtSide</span><br />
            {L('הבית של מאמני ושחקני הכדורסל הישראלי.', 'The home of Israeli basketball coaches and players.')}
          </h1>
          <p className="land-sub">
            <strong>{L('כל מה שמאמן ושחקן צריכים במקום אחד.', 'Everything a coach and a player need in one place.')}</strong><br />
            {L("שיתוף תרגילים, יעדים, משוב על אימונים ומשחקים, לו\"ז שבועי — ועוד מגוון רחב של פיצ'רים.", 'Drill sharing, goals, feedback on practices and games, a weekly schedule — and a wide range of extra features.')}
          </p>
          {/* שני כפתורים בולטים — התחברות ראשונה, הרשמה אחריה (בקשת הבעלים).
              «גלה את הכלים» ירד לקישור עדין מתחתם כדי לא להתחרות בהם. */}
          <div className="land-cta land-cta-auth">
            <button className="btn-primary btn-lg land-cta-login" onClick={goLogin}>
              <LogIn size={18} />
              {L('התחברות', 'Log in')}
            </button>
            <button className="btn-lg land-cta-signup" onClick={goSignup}>
              <UserPlus size={18} />
              {L('הרשמה', 'Sign up')}
              <ArrowFwd size={18} />
            </button>
          </div>
          <a className="land-cta-explore" href="#features">
            <PlayCircle size={16} />
            {L('או גלו קודם את הכלים', 'Or explore the tools first')}
          </a>
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

      {/* הלולאה מאמן↔שחקן — הבידול של CourtSide, הסיפור שהעיצוב צועק */}
      <section className="land-section land-loop reveal">
        <h2 className="land-h2">{L('הקשר בין מאמן לשחקן מעולם לא היה נוח יותר.', 'The coach–player connection has never been easier.')}</h2>
        <div className="land-loop-grid">
          <div className="land-loop-step">
            <span className="lls-ic orange"><Send size={22} /></span>
            <h3 className="land-feature-title">{L('המאמן שולח משימה', 'The coach sends a task')}</h3>
            <p className="land-feature-desc">{L('לכל הקבוצה או לשחקן ספציפי.', 'To the whole team or a specific player.')}</p>
          </div>
          <div className="land-loop-step">
            <span className="lls-ic green"><Dumbbell size={22} /></span>
            <h3 className="land-feature-title">{L('השחקן מסמן את ההתקדמות שלו', 'The player marks their progress')}</h3>
            <p className="land-feature-desc">{L('מהטלפון.', 'Straight from the phone.')}</p>
          </div>
          <div className="land-loop-step">
            <span className="lls-ic navy"><Eye size={22} /></span>
            <h3 className="land-feature-title">{L('המאמן רואה את ההתקדמות', 'The coach sees the progress')}</h3>
            <p className="land-feature-desc">{L('ונותן משוב.', 'And gives feedback.')}</p>
          </div>
        </div>
      </section>

      {/* יום אימון עם CourtSide — שלושת הרגעים של יום אימון */}
      <section className="land-section land-why reveal">
        <h2 className="land-h2">{L('יום אימון עם CourtSide', 'A practice day with CourtSide')}</h2>
        <div className="land-why-grid">
          <div className="land-why-item">
            <span className="land-why-ic"><CalendarCheck size={22} /></span>
            <h3 className="land-feature-title">{L('לפני האימון', 'Before practice')}</h3>
            <p className="land-feature-desc">{L('השחקן מאשר הגעה ורואה את היעדים שהמאמן הציב לו.', 'The player confirms attendance and sees the goals the coach set for them.')}</p>
          </div>
          <div className="land-why-item">
            <span className="land-why-ic"><ListChecks size={22} /></span>
            <h3 className="land-feature-title">{L('אחרי האימון', 'After practice')}</h3>
            <p className="land-feature-desc">{L('מסמן מה ביצע ומוסיף משוב אישי על האימון.', 'Marks what they did and adds personal feedback on the practice.')}</p>
          </div>
          <div className="land-why-item">
            <span className="land-why-ic"><BarChart3 size={22} /></span>
            <h3 className="land-feature-title">{L('המאמן', 'The coach')}</h3>
            <p className="land-feature-desc">{L('מקבל דוח קבוצתי: כמה האימון היה קשה, מי ביצע את המשימות, אחוז הנוכחות ומי מחסיר ברצף — ומגיב.', 'Gets a team report: how hard the practice felt, who completed the tasks, the attendance rate and who keeps missing — and responds.')}</p>
          </div>
        </div>
      </section>

      <section className="land-section land-why reveal">
        <h2 className="land-h2">{L('למה כדאי להשתמש ב-CourtSide?', 'Why use CourtSide?')}</h2>
        <div className="land-why-grid">
          {WHY.map((w) => (
            <div key={w.title} className="land-why-item">
              <span className="land-why-ic">
                <w.Icon size={22} />
              </span>
              <h3 className="land-feature-title">{w.title}</h3>
              <p className="land-feature-desc">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-section reveal" id="features">
        <h2 className="land-h2">{L('כל מה שהקבוצה שלכם צריכה כדי להתקדם', 'Everything your team needs to move forward')}</h2>
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
        <p className="land-lead">{L("ויש עוד הרבה פיצ'רים מעולים — שנשאיר לכם לגלות לבד :)", 'And plenty more great features — we’ll let you discover them yourself :)')}</p>
      </section>

      <section className="land-section land-steps-wrap reveal" id="how">
        <h2 className="land-h2">{L('איך מתחילים?', 'How do you start?')}</h2>
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

      <section className="land-section land-quotes-wrap reveal">
        <h2 className="land-h2">{L('ציטוטים מהמגרש', 'Quotes from the court')}</h2>
        <p className="land-lead">{L('מהפילוסופיה של גדולי המאמנים — ישר אל האימון הבא שלך.', 'From the philosophy of the great coaches — straight into your next practice.')}</p>
        <div className="land-quotes">
          {QUOTE_ROWS.map((row, i) => (
            <div key={i} className={`land-quotes-row${i === 1 ? ' is-reverse' : ''}`}>
              <div className="land-quotes-track">
                {[0, 1].map((copy) => (
                  <ul key={copy} className="land-quotes-list" aria-hidden={copy === 1 || undefined}>
                    {row.map((q) => (
                      <li key={q.text_en} className="land-quote-card">
                        <Quote size={15} aria-hidden="true" />
                        <p className="land-quote-text">{L(q.text, q.text_en)}</p>
                        <span className="land-quote-author">{L(q.author, q.author_en)}</span>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="land-section land-faq-wrap reveal" id="faq">
        <h2 className="land-h2">{L('יש שאלות? יש תשובות', 'Questions? Answers')}</h2>
        <div className="land-faq">
          {FAQ.map((f, i) => (
            <details key={i} className="land-faq-item">
              <summary className="land-faq-q">
                {f.q}
                <ChevronDown size={18} className="land-faq-chev" aria-hidden="true" />
              </summary>
              <div className="land-faq-a">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <section className="land-band reveal">
        <h2 className="land-band-title">{L('יאללה, מתחילים.', 'Let’s get started.')}</h2>
        <p className="land-band-sub">{L('בעברית, ישר מהדפדפן. נרשמים, מקימים קבוצה ומזמינים את השחקנים בקוד.', 'In Hebrew, straight from the browser. Sign up, create a team and invite your players with a code.')}</p>
        <button className="btn-hero btn-lg" onClick={goSignup}>
          {L('מתחילים בחינם', 'Start free')}
          <ArrowFwd size={18} />
        </button>
      </section>

      <footer className="land-footer land-footer-rich">
        <div className="land-footer-grid">
          <div className="land-footer-brand">
            <div className="land-brand">
              <svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true">
                <circle cx="42" cy="55" r="22" fill="var(--accent)" />
                <circle cx="42" cy="55" r="9" fill="#fff" />
                <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="var(--accent)" />
                <circle cx="78" cy="30" r="6" fill="var(--accent)" />
              </svg>
              <span>CourtSide</span>
            </div>
            <p className="land-footer-tag">{L('הפלטפורמה המקצועית למאמני כדורסל בעברית — תרגילים, אימונים, טקטיקה וקהילה.', 'The professional platform for basketball coaches — drills, practices, tactics and community.')}</p>
          </div>
          <nav className="land-footer-col" aria-label={L('מוצר', 'Product')}>
            <h3>{L('מוצר', 'Product')}</h3>
            <a href="#features">{L('הכלים', 'The tools')}</a>
            <a href="#how">{L('איך זה עובד', 'How it works')}</a>
            <a href="#faq">{L('שאלות נפוצות', 'FAQ')}</a>
          </nav>
          <nav className="land-footer-col" aria-label={L('משפטי', 'Legal')}>
            <h3>{L('משפטי', 'Legal')}</h3>
            <a href="/privacy.html">{L('מדיניות פרטיות', 'Privacy Policy')}</a>
            <a href="/terms.html">{L('תנאי שימוש', 'Terms of Use')}</a>
            <a href="/accessibility.html">{L('הצהרת נגישות', 'Accessibility')}</a>
          </nav>
          <nav className="land-footer-col" aria-label={L('הצטרפות', 'Get started')}>
            <h3>{L('הצטרפות', 'Get started')}</h3>
            <button type="button" className="land-footer-cta" onClick={goSignup}>{L('מתחילים בחינם', 'Start free')}</button>
            <a href="#features">{L('סיור בכלים', 'Tour the tools')}</a>
          </nav>
        </div>
        <div className="land-footer-bottom">
          © {new Date().getFullYear()} CourtSide · {L('כל הזכויות שמורות', 'All rights reserved')}
        </div>
      </footer>
    </div>
  )
}
