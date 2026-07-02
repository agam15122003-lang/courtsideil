import { useEffect, useState } from 'react'
import {
  Dumbbell,
  ClipboardList,
  Users,
  MessageSquare,
  ExternalLink,
  Newspaper,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  NEWS_SOURCES,
  NEWS_COUNT,
  NEWS_CACHE_MINUTES,
  NEWS_CACHE_KEY,
  NEWS_FALLBACK_IMAGES,
  CONTENT_LINKS, safeUrl } from './constants'
import { L } from './i18n'
import CoachOfWeek from './CoachOfWeek'
import Button from './ui/Button'
import EmptyState from './ui/EmptyState'

// ===== אגרגטור כתבות כדורסל (חוקי) =====
// כותרת מקורית + תמונה כשיש + שם המקור + קישור לכתבה המקורית. בלי העתקת תוכן.

// מחזיר תמונה לכתבה אם קיימת (thumbnail / enclosure / מתוך ה-HTML).
function pickImage(item) {
  if (item.thumbnail) return item.thumbnail
  if (item.enclosure && item.enclosure.link) return item.enclosure.link
  const m = (item.description || item.content || '').match(/<img[^>]+src="([^">]+)"/i)
  return m ? m[1] : null
}

// כותרת Google News מכילה " - שם המקור" — נחלץ מקור אמיתי ונקה את הכותרת.
function splitGoogleTitle(title) {
  const i = title.lastIndexOf(' - ')
  if (i > 0) return { title: title.slice(0, i).trim(), source: title.slice(i + 3).trim() }
  return { title, source: null }
}

// המרת תאריך rss2json ("YYYY-MM-DD HH:MM:SS") לזמן תקין בכל הדפדפנים (כולל Safari/iOS,
// שמחזיר Invalid Date למחרוזת עם רווח במקום T).
function parseDate(d) {
  const x = new Date(String(d || '').replace(' ', 'T'))
  return isNaN(x) ? 0 : x.getTime()
}

function useNews() {
  const [state, setState] = useState({ items: [], loading: true, error: false })
  const [attempt, setAttempt] = useState(0) // מונה ניסיונות — "נסו שוב" מפעיל שליפה מחדש

  useEffect(() => {
    let alive = true

    // 1) קאש: טרי → שימוש מיידי; ישן → נשמר כגיבוי אם השליפה תיכשל.
    let staleItems = null
    try {
      const raw = localStorage.getItem(NEWS_CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw)
        const ageMin = (Date.now() - cached.ts) / 60000
        if (cached.items?.length) {
          if (ageMin < NEWS_CACHE_MINUTES) {
            setState({ items: cached.items, loading: false, error: false })
            return
          }
          staleItems = cached.items // ישן אבל שמיש — גיבוי לכישלון שליפה
        }
      }
    } catch {
      /* קאש פגום — נתעלם ונשלוף מחדש */
    }

    // 2) שליפה טורית מכל המקורות (מקור ישיר קודם, כדי לא להיחנק בהגבלת קצב);
    //    פיד שנכשל פשוט מדולג.
    let anyOk = false // האם לפחות מקור אחד ענה תקין — מבדיל בין שגיאת רשת למצב ריק אמיתי
    const fetchSrc = (src) =>
      fetch(src.api)
        .then((r) => r.json())
        .then((data) => {
          if (data.status !== 'ok' || !Array.isArray(data.items)) return []
          anyOk = true
          return data.items.map((it) => {
            const parsed = src.google
              ? splitGoogleTitle(it.title)
              : { title: it.title, source: null }
            return {
              title: parsed.title,
              source: parsed.source || src.name,
              topic: src.topic,
              link: it.link,
              image: pickImage(it),
              date: it.pubDate,
            }
          })
        })
        .catch(() => [])

    ;(async () => {
      const lists = []
      for (const src of NEWS_SOURCES) {
        if (!alive) return
        lists.push(await fetchSrc(src))
      }
      if (!alive) return
      const all = lists.flat()

      // דדופ לפי כותרת מנורמלת
      const seen = new Set()
      const deduped = []
      for (const a of all) {
        const key = a.title.replace(/\s+/g, ' ').trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        deduped.push(a)
      }

      // שילוב מתחלף בין הנושאים (round-robin) — שלא יופיעו כמה כתבות על אותו נושא ברצף
      const byTopic = {}
      for (const a of deduped) {
        const k = a.topic || 'other'
        ;(byTopic[k] = byTopic[k] || []).push(a)
      }
      for (const k in byTopic) {
        byTopic[k].sort((x, y) => parseDate(y.date) - parseDate(x.date))
      }
      const topics = Object.keys(byTopic)
      const mixed = []
      let r = 0
      while (mixed.length < NEWS_COUNT && topics.some((t) => byTopic[t].length)) {
        const list = byTopic[topics[r % topics.length]]
        if (list.length) mixed.push(list.shift())
        r++
      }

      // תמונת גיבוי לכתבות בלי תמונה — מונה נפרד כדי שלא יחזרו תמונות זהות זו ליד זו
      let fb = 0
      const items = mixed.map((a) => ({
        ...a,
        image: a.image || NEWS_FALLBACK_IMAGES[fb++ % NEWS_FALLBACK_IMAGES.length],
      }))

      // אם השליפה לא החזירה כלום אבל יש קאש ישן — עדיף להציג אותו מאשר שגיאה
      if (items.length === 0 && staleItems) {
        setState({ items: staleItems, loading: false, error: false })
        return
      }

      setState({ items, loading: false, error: items.length === 0 && !anyOk })
      try {
        localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }))
      } catch {
        /* אחסון מלא — לא קריטי */
      }
    })()

    return () => {
      alive = false
    }
  }, [attempt])

  // ניסיון חוזר — חוזרים למצב טעינה ומפעילים את השליפה מחדש
  const retry = () => {
    setState({ items: [], loading: true, error: false })
    setAttempt((n) => n + 1)
  }

  return { ...state, retry }
}

function formatDate(d) {
  const t = parseDate(d)
  if (!t) return ''
  return new Date(t).toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'long' })
}

// דף הבית — מסך נחיתה: hero, קיצורי דרך, כתבות חיות, קישורי תוכן.
// props:
//   profile    - פרטי המאמן (לברכה אישית)
//   onNavigate - (viewId) => מעבר לטאב אחר
export default function Home({ profile, onNavigate, onOpenCoach }) {
  const name = profile?.first_name || L('מאמן', 'Coach')
  const { items, loading, error, retry } = useNews()

  // אונבורדינג — מוצג למשתמש חדש עד שסוגר
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !localStorage.getItem('onboarded_v1')
    } catch {
      return false
    }
  })
  const dismissOnboarding = () => {
    setShowOnboarding(false)
    try {
      localStorage.setItem('onboarded_v1', '1')
    } catch {
      /* אחסון חסום — לא קריטי */
    }
  }

  const onboardSteps = [
    { id: 'drills', Icon: Dumbbell, title: L('גלה תרגילים', 'Discover drills'), desc: L('חפש ושמור את התרגיל הראשון שלך', 'Search and save your first drill') },
    { id: 'plans', Icon: ClipboardList, title: L('בנה אימון', 'Build a practice'), desc: L('הרכב תוכנית אימון בדקות', 'Put together a practice plan in minutes') },
    { id: 'finder', Icon: Users, title: L('התחבר לקהילה', 'Connect to the community'), desc: L('מצא מאמנים ושתף ידע', 'Find coaches and share knowledge') },
  ]

  const shortcuts = [
    { id: 'drills', Icon: Dumbbell, title: L('ספריית תרגילים', 'Drill library'), desc: L('חיפוש, דירוג ושמירת תרגילים', 'Search, rate and save drills') },
    { id: 'plans', Icon: ClipboardList, title: L('בניית אימון', 'Practice builder'), desc: L('הרכבת אימון מלא בדקות', 'Build a full practice in minutes') },
    { id: 'finder', Icon: Users, title: L('קהילת מאמנים', 'Coaches community'), desc: L('חיבור ושיתוף ידע מקצועי', 'Connect and share professional knowledge') },
    { id: 'messages', Icon: MessageSquare, title: L('הודעות', 'Messages'), desc: L('שיחות אישיות וצ׳אט קבוצתי', 'Personal conversations and group chat') },
  ]

  return (
    <div className="home">
      <section className="hero hero--image">
        <div className="hero-content">
          <span className="hero-eyebrow">CourtSide</span>
          <h1 className="hero-title">
            {L('שלום, ', 'Hi, ')}
            <span className="hero-title-accent">{name}</span>
          </h1>
          <p className="hero-sub">
            {L('המרחב המקצועי שלך לניהול תרגילים, בניית אימונים וחיבור לקהילת המאמנים — הכול במקום אחד.', 'Your professional space to manage drills, build practices and connect with the coaching community — all in one place.')}
          </p>
          <div className="hero-actions">
            <button className="btn-hero" onClick={() => onNavigate('drills')}>
              {L('ספריית התרגילים', 'Drill library')}
            </button>
            <button className="btn-hero-outline" onClick={() => onNavigate('plans')}>
              {L('בניית אימון', 'Practice builder')}
            </button>
          </div>
        </div>
      </section>

      <CoachOfWeek onOpenCoach={(coach) => (onOpenCoach ? onOpenCoach(coach) : onNavigate('finder'))} />

      {showOnboarding && (
        <div className="onboard-card">
          <button
            type="button"
            className="onboard-close"
            onClick={dismissOnboarding}
            aria-label={L('סגירת ההדרכה', 'Close the tutorial')}
          >
            <X size={16} />
          </button>
          <h3 className="onboard-title">{L(`ברוך הבא, ${name}!`, `Welcome, ${name}!`)}</h3>
          <p className="muted small">{L('שלושה צעדים קצרים כדי להתחיל:', 'Three quick steps to get started:')}</p>
          <div className="onboard-steps">
            {onboardSteps.map((s, i) => (
              <button key={s.id} className="onboard-step" onClick={() => onNavigate(s.id)}>
                <span className="onboard-num">{i + 1}</span>
                <span className="onboard-ic">
                  <s.Icon size={18} />
                </span>
                <span className="onboard-step-body">
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <h2 className="section-title">
        {L('קיצורי דרך', 'Shortcuts')}
      </h2>
      <div className="home-grid">
        {shortcuts.map((s) => (
          <button key={s.id} className="home-card" onClick={() => onNavigate(s.id)}>
            <span className="home-ic">
              <s.Icon size={20} />
            </span>
            <span className="home-card-title">{s.title}</span>
            <span className="home-card-desc">{s.desc}</span>
          </button>
        ))}
      </div>

      <h2 className="section-title section-title--icon">
        <Newspaper size={18} />
        {L('כתבות כדורסל', 'Basketball news')}
      </h2>
      <p className="muted small news-sub">
        {L('מבחר כתבות כדורסל ממקורות ישראליים — לחיצה פותחת את הכתבה המלאה במקור.', 'A selection of basketball articles from Israeli sources — tap to open the full article at its source.')}
      </p>

      {loading && (
        <div className="news-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="news-card is-skeleton">
              <div className="news-thumb skeleton" />
              <div className="news-body">
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line short" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="news-grid">
          {items.map((a, i) => (
            <a key={i} className="news-card" href={safeUrl(a.link) || '#'} target="_blank" rel="noopener noreferrer">
              <div className="news-thumb">
                {a.image ? (
                  <img
                    src={a.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none' // תמונה שבורה — נשאר רקע הכרטיס
                    }}
                  />
                ) : (
                  <Newspaper size={22} />
                )}
                {a.source && <span className="news-source">{a.source}</span>}
              </div>
              <div className="news-body">
                <span className="news-title">{a.title}</span>
                <span className="news-meta">
                  {a.date ? formatDate(a.date) : a.source}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-error news-error" role="alert">
          <span>
            {L('לא הצלחנו לטעון כתבות כרגע. בינתיים — מקורות התוכן שלמטה.', "We couldn't load articles right now. In the meantime — the content sources below.")}
          </span>
          <Button variant="soft" onClick={retry}>
            <RefreshCw size={15} />
            {L('נסו שוב', 'Try again')}
          </Button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={Newspaper}
          title={L('אין כתבות חדשות כרגע', 'No new articles right now')}
          desc={L('המקורות לא החזירו כתבות. שווה לרענן או לחזור מאוחר יותר.', 'The sources returned no articles. Refresh or check back later.')}
          action={
            <Button variant="soft" onClick={retry}>
              <RefreshCw size={15} />
              {L('רענון', 'Refresh')}
            </Button>
          }
        />
      )}

      <h2 className="section-title">
        {L('תוכן והשראה', 'Content & inspiration')}
      </h2>
      <div className="home-grid">
        {CONTENT_LINKS.map((l) => (
          <a key={l.url} className="home-card" href={l.url} target="_blank" rel="noreferrer">
            <span className="home-card-title link-row">
              {l.title}
              <ExternalLink size={15} />
            </span>
            <span className="home-card-desc">{l.desc}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
