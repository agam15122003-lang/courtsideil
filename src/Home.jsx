import { useEffect, useState } from 'react'
import {
  Dumbbell,
  ClipboardList,
  Users,
  MessageSquare,
  ExternalLink,
  Newspaper,
  X,
  Star,
  CalendarDays,
  Plus,
  Bookmark,
  ChevronLeft,
} from 'lucide-react'
import {
  NEWS_SOURCES,
  NEWS_COUNT,
  NEWS_CACHE_MINUTES,
  NEWS_CACHE_KEY,
  NEWS_FALLBACK_IMAGES,
  CONTENT_LINKS, safeUrl } from './constants'
import { supabase } from './supabaseClient'
import { L } from './i18n'
import CoachOfWeek from './CoachOfWeek'
import NextPractice from './NextPractice'

const pad2 = (n) => String(n).padStart(2, '0')
const ymdLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// סטטיסטיקות דף הבית — נשלפות פעם אחת, עם ברירת מחדל 0 אם אין נתונים.
function useHomeStats(userId) {
  // null = עדיין נטען / לא זמין (מוצג כ-"—"), מספר = ערך אמיתי.
  // כך שגיאת רשת חולפת לא מציגה אפסים מזויפים כאילו אין נתונים.
  const [s, setS] = useState({ rating: null, week: null, plans: null, saved: null })
  useEffect(() => {
    if (!userId) return
    let alive = true
    ;(async () => {
      const now = new Date()
      const day = now.getDay() // 0=ראשון
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - day)
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
      const [saved, plans, week, myDrills] = await Promise.all([
        supabase.from('saved_drills').select('drill_id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('training_plans').select('id', { count: 'exact', head: true }).eq('created_by', userId),
        supabase.from('schedule_entries').select('id', { count: 'exact', head: true }).gte('date', ymdLocal(weekStart)).lte('date', ymdLocal(weekEnd)),
        supabase.from('drills').select('drill_ratings(rating)').eq('created_by', userId),
      ])
      if (!alive) return
      let sum = 0, cnt = 0
      for (const d of myDrills.data || []) for (const r of d.drill_ratings || []) { sum += r.rating; cnt++ }
      setS({
        rating: cnt ? (sum / cnt) : null,
        // בשגיאה משאירים null (—) במקום 0 מזויף
        week: week.error ? null : (week.count || 0),
        plans: plans.error ? null : (plans.count || 0),
        saved: saved.error ? null : (saved.count || 0),
      })
    })()
    return () => { alive = false }
  }, [userId])
  return s
}

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
    const fetchSrc = (src) =>
      fetch(src.api)
        .then((r) => r.json())
        .then((data) => {
          if (data.status !== 'ok' || !Array.isArray(data.items)) return []
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

      setState({ items, loading: false, error: items.length === 0 })
      try {
        localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }))
      } catch {
        /* אחסון מלא — לא קריטי */
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  return state
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
  const { items, loading, error } = useNews()
  const stats = useHomeStats(profile?.id)

  const today = new Date()
  const dateLabel = today.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })
  const hour = today.getHours()
  const greet = hour < 12 ? L('בוקר טוב', 'Good morning') : hour < 18 ? L('צהריים טובים', 'Good afternoon') : L('ערב טוב', 'Good evening')

  const STAT_TILES = [
    { key: 'rating', Icon: Star, num: stats.rating != null ? stats.rating.toFixed(1) : '—', label: L('דירוג התרגילים שלך', 'Your drills rating'), star: true },
    { key: 'week', Icon: CalendarDays, num: stats.week ?? '—', label: L('אימונים השבוע', 'Practices this week') },
    { key: 'plans', Icon: ClipboardList, num: stats.plans ?? '—', label: L('תוכניות אימון', 'Practice plans') },
    { key: 'saved', Icon: Bookmark, num: stats.saved ?? '—', label: L('תרגילים שמורים', 'Saved drills') },
  ]

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
      {/* ברכה */}
      <header className="home-greet">
        <div className="home-greet-text">
          <span className="home-greet-date">{dateLabel}</span>
          <h1 className="home-greet-title">
            {greet}, <span className="hero-title-accent">{name}</span>
          </h1>
        </div>
        <div className="home-greet-actions">
          <button className="btn-soft" onClick={() => onNavigate('schedule')}>
            <CalendarDays size={17} /> {L('לו"ז השבוע', 'This week')}
          </button>
          <button className="btn-primary" onClick={() => onNavigate('plans')}>
            <Plus size={17} /> {L('אימון חדש', 'New practice')}
          </button>
        </div>
      </header>

      {/* האימון הבא */}
      <div className="home-duo home-duo--single">
        <NextPractice onNavigate={onNavigate} />
      </div>

      {/* סטטיסטיקות */}
      <div className="home-stats">
        {STAT_TILES.map((t) => (
          <div key={t.key} className="stat-tile">
            <span className="stat-tile-ic"><t.Icon size={16} /></span>
            <span className="stat-tile-num">
              {t.star && <Star size={15} className="stat-star" aria-hidden="true" />}
              <bdi>{t.num}</bdi>
            </span>
            <span className="stat-tile-label">{t.label}</span>
          </div>
        ))}
      </div>

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

      <h2 className="section-title" style={{ marginTop: 32 }}>
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
            <ChevronLeft size={16} className="home-card-chev" aria-hidden="true" />
          </button>
        ))}
      </div>

      <h2 className="section-title section-title--icon" style={{ marginTop: 32 }}>
        <Newspaper size={18} />
        {L('כתבות כדורסל', 'Basketball news')}
      </h2>
      <p className="muted small" style={{ marginTop: -2, marginBottom: 4 }}>
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
              <div
                className="news-thumb"
                style={a.image ? { backgroundImage: `url("${a.image}")` } : undefined}
              >
                {!a.image && <Newspaper size={22} />}
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

      {!loading && (error || items.length === 0) && (
        <p className="muted small" style={{ marginTop: 8 }}>
          {L('לא הצלחנו לטעון כתבות כרגע. בינתיים — מקורות התוכן שלמטה.', "We couldn't load articles right now. In the meantime — the content sources below.")}
        </p>
      )}

      <h2 className="section-title" style={{ marginTop: 32 }}>
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
