import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  NEWS_SOURCES,
  NEWS_COUNT,
  NEWS_HOME_COUNT,
  NEWS_CACHE_MINUTES,
  NEWS_CACHE_KEY,
  NEWS_FALLBACK_IMAGES,
  COACHING_QUOTES, safeUrl } from './constants'
import { supabase } from './supabaseClient'
import { signedThumbUrls } from './storage'
import { L } from './i18n'
import { ChevronFwd } from './DirIcon'
import CourtArt from './CourtArt'
import Avatar from './Avatar'
import Notifications from './Notifications'
import { motionOff } from './anim'
import useReveal from './useReveal'
import NextPractice from './NextPractice'
import PracticeRsvp from './PracticeRsvp'
import HomeVideos from './HomeVideos'
import { WeekSchedule } from './HomeSections'
import CoachTodo from './CoachTodo'

const pad2 = (n) => String(n).padStart(2, '0')
const ymdLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// כל כמה זמן מתחלף הציטוט בהירו. היה הקצב של מחליף התמונות שהוסר —
// נשמר כאן כדי שהתחושה של ההירו לא תשתנה.
const QUOTE_HOLD_MS = 7000

// חלון הלו"ז המשותף לכל דף הבית — מכיל את כל מה שכל אחד מהמקטעים צריך:
// היום (תוכנית היום) · השבוע הקלנדרי (מונה האימונים) · +7 (השבוע) · +14 (האימון הבא)
// ו-10 ימים אחורה (האימון האחרון שנגמר, בדוח של NextPractice).
const HOME_PAST_DAYS = 10
const HOME_FUTURE_DAYS = 14
// שליפה אחת של הלו"ז והמשבצות הקבועות לכל דף הבית.
// עד היום team_practice_slots נשלפה שלוש פעמים ו-schedule_entries שלוש
// פעמים באותו רינדור — אותם נתונים בדיוק, שישה round-trips מיותרים.
// התוצאה יורדת כ-prop אל NextPractice ואל מקטעי HomeSections.
function useHomeSchedule(userId) {
  const [sched, setSched] = useState({ ready: false, entries: [], slots: [], entriesError: null, slotsError: null })
  useEffect(() => {
    let alive = true
    ;(async () => {
      const from = new Date(Date.now() - HOME_PAST_DAYS * 86400000)
      const until = new Date(Date.now() + HOME_FUTURE_DAYS * 86400000)
      const [entries, slots] = await Promise.all([
        // schedule_entries מסונן ב-RLS ולכן אין כאן eq על המאמן (כפי שהיה)
        supabase.from('schedule_entries')
          .select('*, plan:training_plans(id, name)')
          .gte('date', ymdLocal(from)).lte('date', ymdLocal(until))
          .order('date').order('start_time'),
        // אימונים מלוח קבוע אינם שורות ב-schedule_entries. בלעדיהם מאמן
        // שעובד בימים קבועים ראה "0 אימונים השבוע" בזמן שהלו"ז מלא.
        userId
          ? supabase.from('team_practice_slots').select('*').eq('coach_id', userId)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (!alive) return
      setSched({
        ready: true,
        entries: entries.error ? [] : (entries.data || []),
        slots: slots.error ? [] : (slots.data || []),
        entriesError: entries.error || null,
        slotsError: slots.error || null,
      })
    })()
    return () => { alive = false }
  }, [userId])
  return sched
}

// שלושת הפוסטים האחרונים מהקהילה — לטיזר בדף הבית.
// אם הטבלה עוד לא קיימת או שיש שגיאה — המקטע פשוט לא מוצג.
function useCommunityTeaser() {
  const [posts, setPosts] = useState([])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('id, content, image_urls, created_at, author:profiles!user_id(first_name, last_name, club, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(3)
      if (!alive || error || !data) return
      // התמונות מוגשות דרך signed URL — כאן בגודל תמונונת ולא ב-JPEG המלא.
      // אם החתימה נכשלת הכרטיס פשוט יוצג בלי תמונה.
      let thumbs = []
      try {
        thumbs = await signedThumbUrls(data.map((p) => p.image_urls?.[0] || null))
      } catch { /* בלי תמונה */ }
      if (!alive) return
      setPosts(data.map((p, i) => ({ ...p, thumbUrl: thumbs[i] || null })))
    })()
    return () => { alive = false }
  }, [])
  return posts
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

// כתבה בלי תמונה בפיד מקבלת תמונת כדורסל חופשית (Unsplash — רישיון חופשי
// גם לשימוש מסחרי). הבחירה דטרמיניסטית לפי הקישור, כך שאותה כתבה מקבלת
// תמיד את אותה תמונה. **חשוב שזה יקרה ברינדור ולא בשליפה** — אחרת כתבות
// שכבר שמורות ב-localStorage (בלי תמונה) ימשיכו להופיע ריקות עד שהקאש יפוג.
function newsImage(a) {
  if (a?.image) return a.image
  let h = 0
  for (const ch of String(a?.link || a?.title || '')) h = (h * 31 + ch.charCodeAt(0)) % 99991
  return NEWS_FALLBACK_IMAGES[h % NEWS_FALLBACK_IMAGES.length]
}

// המרת תאריך rss2json ("YYYY-MM-DD HH:MM:SS") לזמן תקין בכל הדפדפנים (כולל Safari/iOS,
// שמחזיר Invalid Date למחרוזת עם רווח במקום T).
function parseDate(d) {
  const x = new Date(String(d || '').replace(' ', 'T'))
  return isNaN(x) ? 0 : x.getTime()
}

// מסמך ההשקה 2.2 מחזיר את הכתבות — אבל בתחתית הבית (אחרי כל העבודה),
// 4 כתבות ממדורי כדורסל ישראליים בלבד, קישור החוצה למקור.
const SHOW_NEWS = true

// (useNarrow ירד ב-10.8 — «ריבוע אחד»: כרטיס האימון חי בתוך הבאנר
// בכל הרוחבים, אז אין יותר פיצול JSX לפי רוחב המסך.)

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
              // סיומת שנראית כדומיין ("site.sport5.co.il") — מציגים את שם המקור במקומה
              source: parsed.source && !parsed.source.includes('.') ? parsed.source : src.name,
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

      const items = mixed

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
export default function Home({ session, profile, onNavigate }) {
  const name = profile?.first_name || L('מאמן', 'Coach')
  const { items, loading, error } = useNews()
  // הלו"ז נשלף פעם אחת כאן ויורד כ-prop לכל מי שצריך אותו
  const sched = useHomeSchedule(profile?.id)
  const communityPosts = useCommunityTeaser()

  // פעימת הציטוט בהירו. קודם היא הגיעה מ-onTick של מחליף התמונות; מאז
  // שההירו הוא איור קבוע (CourtArt) הטיימר יושב כאן, באותו קצב.
  // נקודת ההתחלה אקראית כדי שלא יתקבל אותו ציטוט בכל טעינה.
  // חוזה הנגישות נשמר: תחת motionOff() (reduced-motion או html.a11y-motion)
  // הטיימר לא נדלק בכלל — תוכן שמתחלף מעצמו הוא בדיוק מה שהמשתמש ביקש לעצור.
  const [quoteStart] = useState(() => Math.floor(Math.random() * COACHING_QUOTES.length))
  const [beat, setBeat] = useState(0)
  const quote = COACHING_QUOTES[(quoteStart + beat) % COACHING_QUOTES.length]
  const homeRef = useRef(null)
  // האימון הקרוב, כפי ש-NextPractice חישב אותו — משמש את רצועת אישורי ההגעה
  const [nextEntry, setNextEntry] = useState(null)

  useEffect(() => {
    if (motionOff()) return
    const t = setInterval(() => setBeat((n) => n + 1), QUOTE_HOLD_MS)
    return () => clearInterval(t)
  }, [])

  const today = new Date()
  const dateLabel = today.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })
  const hour = today.getHours()
  const greet = hour < 12 ? L('בוקר טוב', 'Good morning') : hour < 18 ? L('צהריים טובים', 'Good afternoon') : L('ערב טוב', 'Good evening')

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

  // חשיפה בגלילה. התלויות הן מה שמוסיף מקטעים ל-DOM אחרי הרינדור הראשון —
  // בלעדיהן ה-observer לא היה רואה את הכתבות ואת טיזר הקהילה שהגיעו מאוחר יותר.
  useReveal(homeRef, [loading, communityPosts.length, showOnboarding])

  // ---------------------------------------------------------------------
  // 11.8.2026 — דף הבית נבנה מחדש לפי מסמך העיצוב «דפי בית», כיוון 3a
  // («מגרש מלא · מזוקק», בחירת הבעלים). מרחב שמות חדש nh-* במכוון:
  // ראה את ההסבר בראש הבלוק המקביל ב-index.css.
  //
  // סדר המסמך — מובייל: לוח → דברים לביצוע → חדש בקהילה → סרטונים →
  // כתבות. דסקטופ: לוח, ואז טור ראשי (דברים לביצוע + כתבות) וטור צד
  // (הלו״ז השבוע + חדש בקהילה + סרטונים). העוטפים nh-main/nh-side הם
  // display:contents במובייל, והסדר שם נקבע במחלקות nh-o-*.
  // ---------------------------------------------------------------------
  return (
    <div className="nh nh-coach" ref={homeRef}>
      <header className="nh-hero">
        <span className="nh-hero-art" aria-hidden="true"><CourtArt variant="home" /></span>

        <div className="nh-hero-top">
          <Avatar name={`${profile?.first_name || ''} ${profile?.last_name || ''}`} url={profile?.avatar_url} size={42} />
          <div className="nh-hero-who">
            <span className="nh-hero-date">{dateLabel}</span>
            <h1 className="nh-hero-greet">{greet}, {name}</h1>
          </div>
          {/* הפעמון של המסמך — במובייל הבאנר הוא הכותרת של המסך, ולכן
              ההתראות עוברות לכאן (הסרגל העליון מוסתר בבית) */}
          <span className="nh-hero-bell"><Notifications session={session} onNavigate={onNavigate} /></span>
        </div>

        <p className="nh-quote" key={beat}>
          <span className="nh-quote-mark" aria-hidden="true">״</span>
          <span className="nh-quote-tx">
            {L(quote.text, quote.text_en)}
            <span className="nh-quote-by"> — {L(quote.author, quote.author_en)}</span>
          </span>
        </p>

        {/* כרטיס האימון הקרוב חי בתוך הבאנר, עם שורת אישורי ההגעה בתחתיתו */}
        <NextPractice
          session={session}
          schedule={sched}
          onNavigate={onNavigate}
          onEntry={setNextEntry}
          variant="board"
          rsvp={nextEntry?.team
            ? <PracticeRsvp session={session} practice={{ ...nextEntry, session_id: nextEntry.id }} variant="board" />
            : null}
        />
      </header>

      {showOnboarding && (
        <div className="nh-welcome">
          <span>{L(`ברוכים הבאים, ${name}! טוב לראות אותך כאן.`, `Welcome, ${name}! Good to see you here.`)}</span>
          <button type="button" className="nh-welcome-x" onClick={dismissOnboarding} aria-label={L('סגירה', 'Close')}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="nh-cols">
        <div className="nh-main">
          <div className="nh-o-todo"><CoachTodo session={session} onNavigate={onNavigate} variant="card" /></div>

          {SHOW_NEWS && (
            <section className="nh-card nh-news nh-o-news">
              <div className="nh-card-head">
                <h2 className="nh-card-title">{L('כתבות כדורסל ישראלי', 'Israeli basketball news')}</h2>
                <span className="nh-card-note">{L('לחיצה פותחת את הכתבה במקור', 'Tap to open at the source')}</span>
              </div>

              {loading && (
                <div className="nh-news-grid">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="nh-news is-skeleton">
                      <span className="nh-news-thumb skeleton" />
                      <span className="skeleton skeleton-line" />
                    </div>
                  ))}
                </div>
              )}

              {!loading && !error && items.length > 0 && (
                <div className="nh-news-grid">
                  {items.slice(0, NEWS_HOME_COUNT).map((a, i) => (
                    <a key={i} className="nh-news" href={safeUrl(a.link) || '#'} target="_blank" rel="noopener noreferrer">
                      <span className="nh-news-thumb" style={{ backgroundImage: `url("${newsImage(a)}")` }}>
                        {a.source && <span className="nh-news-src">{a.source}</span>}
                      </span>
                      <span className="nh-news-title"><bdi>{a.title}</bdi></span>
                      <span className="nh-news-meta">{a.date ? formatDate(a.date) : a.source}</span>
                    </a>
                  ))}
                </div>
              )}

              {!loading && (error || items.length === 0) && (
                <p className="nh-empty">
                  {L('לא הצלחנו לטעון כתבות כרגע — ננסה שוב בכניסה הבאה.', "We couldn't load articles right now — we'll retry next visit.")}
                </p>
              )}
            </section>
          )}
        </div>

        <div className="nh-side">
          <div className="nh-o-week"><WeekSchedule session={session} schedule={sched} onNavigate={onNavigate} variant="card" /></div>

          <section className="nh-card nh-comm nh-o-comm">
            <div className="nh-card-head">
              <h2 className="nh-card-title">{L('חדש בקהילה', 'New in the community')}</h2>
              <button type="button" className="nh-link" onClick={() => onNavigate('community')}>
                {L('לכל הפיד', 'Open the feed')} <ChevronFwd size={14} aria-hidden="true" />
              </button>
            </div>
            {communityPosts.length === 0 ? (
              <p className="nh-empty">
                {L('עוד לא פורסם כלום היום — אתה מוזמן להיות הראשון.', 'Nothing posted yet today — you are welcome to be the first.')}
              </p>
            ) : (
              <div className="nh-rows">
                {communityPosts.slice(0, 2).map((p) => {
                  const author = p.author
                    ? `${p.author.first_name || ''} ${p.author.last_name || ''}`.trim() || L('מאמן', 'Coach')
                    : L('מאמן', 'Coach')
                  const img = safeUrl(p.thumbUrl)
                  return (
                    <button key={p.id} type="button" className="nh-row" onClick={() => onNavigate('community')}>
                      <span
                        className="nh-row-thumb"
                        style={img ? { backgroundImage: `url("${img.replace(/["\\)]/g, '')}")` } : undefined}
                        aria-hidden="true"
                      />
                      <span className="nh-row-tx">
                        <span className="nh-row-sub">{author}{p.author?.club ? ` · ${p.author.club}` : ''}</span>
                        <b>{p.content || L('שיתף צילומים מהאימון', 'Shared practice photos')}</b>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <div className="nh-o-videos">
            <HomeVideos onOpen={() => onNavigate('media')} heading={L('סרטונים מהמדיה', 'From the media')} />
          </div>
        </div>
      </div>

      {/* מרווח לגלולת הניווט הצפה במובייל */}
      <div className="nh-spacer" aria-hidden="true" />
    </div>
  )
}
