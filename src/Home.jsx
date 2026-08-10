import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dumbbell,
  ClipboardList,
  Users,
  ExternalLink,
  Newspaper,
  X,
  CalendarDays,
  Plus,
  Bookmark,
  UserCheck,
} from 'lucide-react'
import {
  NEWS_SOURCES,
  NEWS_COUNT,
  NEWS_HOME_COUNT,
  NEWS_CACHE_MINUTES,
  NEWS_CACHE_KEY,
  NEWS_FALLBACK_IMAGES,
  CONTENT_LINKS, COACHING_QUOTES, safeUrl } from './constants'
import { supabase } from './supabaseClient'
import { signedThumbUrls } from './storage'
import { L } from './i18n'
import { ChevronFwd } from './DirIcon'
import CourtArt from './CourtArt'
import { motionOff } from './anim'
import useReveal from './useReveal'
import CoachOfWeek from './CoachOfWeek'
import { useNetworkSmall } from './network'
import NextPractice from './NextPractice'
import PracticeRsvp from './PracticeRsvp'
import { TodayPlanCard, WeekSchedule, NeedsAttention } from './HomeSections'
import CoachTodo from './CoachTodo'
import { expandSlotsRange } from './sessionId'

const pad2 = (n) => String(n).padStart(2, '0')
const ymdLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// כל כמה זמן מתחלף הציטוט בהירו. היה הקצב של מחליף התמונות שהוסר —
// נשמר כאן כדי שהתחושה של ההירו לא תשתנה.
const QUOTE_HOLD_MS = 7000

// ספירה-למעלה של מספר סטטיסטיקה (לוח תוצאות, לא אקסל). מכבד reduced-motion.
function useCountUp(target, dur = 700) {
  const [val, setVal] = useState(target)
  useEffect(() => {
    if (typeof target !== 'number' || !isFinite(target)) { setVal(target); return }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.classList.contains('a11y-motion')) { setVal(target); return }
    let raf
    const t0 = performance.now()
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur)
      setVal(target * (1 - Math.pow(1 - p, 3))) // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return val
}

function StatNum({ value, decimals = 0 }) {
  const v = useCountUp(typeof value === 'number' ? value : null)
  if (typeof value !== 'number') return '—'
  return Number(v).toFixed(decimals)
}

// חלון הלו"ז המשותף לכל דף הבית — מכיל את כל מה שכל אחד מהמקטעים צריך:
// היום (תוכנית היום) · השבוע הקלנדרי (מונה האימונים) · +7 (השבוע) · +14 (האימון הבא)
// ו-10 ימים אחורה (האימון האחרון שנגמר, בדוח של NextPractice).
const HOME_PAST_DAYS = 10
const HOME_FUTURE_DAYS = 14
// חלון הנוכחות לחישוב האחוז. בלי תיחום נשלפה כל היסטוריית הנוכחות
// מאז ומעולם בכל טעינה של דף הבית — אלפי שורות אחרי שתי עונות.
const ATT_WINDOW_DAYS = 90

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

// סטטיסטיקות דף הבית — נשלפות פעם אחת, עם ברירת מחדל 0 אם אין נתונים.
// הלו"ז מגיע מ-useHomeSchedule ולא נשלף כאן שוב.
function useHomeStats(userId, sched) {
  // null = עדיין נטען / לא זמין (מוצג כ-"—"), מספר = ערך אמיתי.
  // כך שגיאת רשת חולפת לא מציגה אפסים מזויפים כאילו אין נתונים.
  const [s, setS] = useState({ attendance: null, plans: null, saved: null })
  useEffect(() => {
    if (!userId) return
    let alive = true
    ;(async () => {
      const attFrom = new Date(Date.now() - ATT_WINDOW_DAYS * 86400000)
      const [saved, plans, att] = await Promise.all([
        supabase.from('saved_drills').select('drill_id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('training_plans').select('id', { count: 'exact', head: true }).eq('created_by', userId),
        // אחוז הנוכחות הקבוצתי — אותה נוסחה כמו ב-Attendance.jsx:
        // כל מה שאינו 'absent' נספר כנוכחות. מתוחם לחלון האחרון.
        supabase.from('practice_attendance').select('status')
          .eq('coach_id', userId).gte('session_date', ymdLocal(attFrom)),
      ])
      if (!alive) return

      const rows = att.error ? null : (att.data || [])
      const attendance = rows && rows.length
        ? Math.round((rows.filter((r) => r.status !== 'absent').length / rows.length) * 100)
        : null

      setS({
        attendance,
        // בשגיאה משאירים null (—) במקום 0 מזויף
        plans: plans.error ? null : (plans.count || 0),
        saved: saved.error ? null : (saved.count || 0),
      })
    })()
    return () => { alive = false }
  }, [userId])

  // מונה האימונים בשבוע הקלנדרי — נגזר מהלו"ז המשותף, בלי שליפה נוספת
  const week = useMemo(() => {
    if (!sched.ready) return null
    if (sched.entriesError && sched.slotsError) return null
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()) // 0=ראשון
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
    const a = ymdLocal(weekStart), b = ymdLocal(weekEnd)
    const inWeek = sched.entries.filter((e) => e.date >= a && e.date <= b).length
    return inWeek + expandSlotsRange(sched.slots, weekStart, weekEnd).length
  }, [sched])

  return { ...s, week }
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

// במובייל כרטיס «האימון הקרוב» יורד מתוך הבאנר הנייבי אל הגלולה הלבנה:
// בתוך הבאנר הוא הוסיף 415px של נייבי לפני שהתחיל תוכן כלשהו.
function useNarrow(query = '(max-width: 640px)') {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = (e) => setNarrow(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return narrow
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
export default function Home({ session, profile, onNavigate, onOpenCoach }) {
  const netSmall = useNetworkSmall() // פיצ'רי רשת מוסתרים כשיש מעט מאמנים

  const name = profile?.first_name || L('מאמן', 'Coach')
  const { items, loading, error } = useNews()
  const narrow = useNarrow()
  // הלו"ז נשלף פעם אחת כאן ויורד כ-prop לכל מי שצריך אותו
  const sched = useHomeSchedule(profile?.id)
  const stats = useHomeStats(profile?.id, sched)
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

  // ארבעת המספרים לפי מסך 3a. ב-RTL הפריט הראשון ב-DOM הוא הימני ביותר,
  // ובעיצוב הימני הוא «נוכחות הקבוצה» והשמאלי «שמורים» (נמדד מהפרוטוטייפ:
  // 24 שמורים · 11 תוכניות · 3 אימונים · 87% נוכחות, משמאל לימין).
  const STAT_TILES = [
    { key: 'attendance', Icon: UserCheck, value: stats.attendance, dec: 0, label: L('נוכחות הקבוצה', 'Team attendance'), pct: true, c: 'green' },
    { key: 'week', Icon: CalendarDays, value: stats.week, dec: 0, label: L('אימונים', 'Practices'), c: 'blue' },
    { key: 'plans', Icon: ClipboardList, value: stats.plans, dec: 0, label: L('תוכניות', 'Plans'), c: 'purple' },
    { key: 'saved', Icon: Bookmark, value: stats.saved, dec: 0, label: L('שמורים', 'Saved'), c: 'orange' },
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
    { id: 'community', Icon: Users, title: L('הצטרף לקהילה', 'Join the community'), desc: L('שתף, שאל והעלה צילומים מהאימונים', 'Share, ask and post practice photos') },
    { id: 'drills', Icon: Dumbbell, title: L('גלה תרגילים', 'Discover drills'), desc: L('חפש ושמור את התרגיל הראשון שלך', 'Search and save your first drill') },
    { id: 'plans', Icon: ClipboardList, title: L('בנה תוכנית אימון', 'Build a practice plan'), desc: L('בנה אימון מלא על דף המחברת, חלק אחר חלק','Build a full practice on the notebook page, part by part') },
  ]

  // חשיפה בגלילה. התלויות הן מה שמוסיף מקטעים ל-DOM אחרי הרינדור הראשון —
  // בלעדיהן ה-observer לא היה רואה את הכתבות ואת טיזר הקהילה שהגיעו מאוחר יותר.
  useReveal(homeRef, [loading, communityPosts.length, showOnboarding, netSmall])

  return (
    <div className="home" ref={homeRef}>
      {/* הירו נייבי — ברכה + האימון הבא בכרטיס זכוכית (handoff).
          הצילום מהמאגר הוסר; חזרנו לדפוס הבית מ-DESIGN.md §2ב — סימן-מים
          של מגרש (CourtArt) על הגרדיאנט הנייבי, מתחת לאותו scrim.
          הגובה, הרדיוס והפריסה לא זזו: זו החלפת שכבת רקע בלבד. */}
      <header className="home-hero home-art-hero">
        <span className="home-hero-bg home-art-fill" aria-hidden="true">
          <CourtArt variant="home" />
        </span>
        <span className="home-hero-glow" aria-hidden="true" />
        {/* שתי הקשתות של הלוח — אותו סימן כמו בבית השחקן (7.8) */}
        <span className="plh-arc" aria-hidden="true" />
        <span className="plh-arc b" aria-hidden="true" />
        <div className="home-hero-text">
          <span className="home-greet-date">{dateLabel}</span>
          <h1 className="home-greet-title">
            {greet}, <span className="hero-title-accent">{name}</span>{' '}
            {/* דקורטיבי — aria-hidden כדי שקורא מסך לא יקרא "אימוג'י כדורסל" בכותרת */}
            
          </h1>
          <p className="home-hero-sub">
            {stats.week != null && stats.week > 0
              ? L(`${stats.week} אימונים בלו"ז השבוע — והקהילה מחכה לשמוע ממך.`, `${stats.week} practices this week — and the community wants to hear from you.`)
              : L('השבוע עוד פתוח — תכנן אימון והקהילה כבר מחכה לשמוע ממך.', 'The week is wide open — plan a practice; the community is waiting to hear from you.')}
          </p>
          <div className="home-greet-actions">
            <button className="btn-primary" onClick={() => onNavigate('plans')}>
              <Plus size={17} /> {L('תוכנית חדשה', 'New plan')}
            </button>
            {/* בעיצוב (3a) הכפתור השני הוא «הסגל שלי» — הלו״ז כבר יעד
                בסרגל, והסגל הוא מה שהבאנר מפנה אליו («שני שחקנים דורשים
                תשומת לב»). */}
            <button className="btn-heroghost" onClick={() => onNavigate('teams')}>
              <Users size={17} /> {L('הסגל שלי', 'My roster')}
            </button>
          </div>
        </div>
        {!narrow && (
          <div className="home-hero-card">
            <NextPractice session={session} schedule={sched} onNavigate={onNavigate} onEntry={setNextEntry} />
          </div>
        )}
        {/* רצועת אישורי ההגעה (מסך 3a) — נעלמת בשקט אם הטבלה טרם נוצרה
            או אם אין אימון קרוב עם קבוצה. בטלפון (10.8) הבאנר מצטמצם
            לברכה + לוח, והפס יורד לגור מתחת לכרטיס «האימון הבא». */}
        {!narrow && nextEntry?.team && <PracticeRsvp session={session} practice={{ ...nextEntry, session_id: nextEntry.id }} />}
        {/* הציטוט ממערכת הפתגמים הקיימת (COACHING_QUOTES), מתחלף לפי QUOTE_HOLD_MS.
            key={beat} — מרנדר מחדש כדי שאנימציית ההחלפה תתנגן. */}
        <p className="home-hero-quote" key={beat}>
          <span className="hhq-mark" aria-hidden="true">"</span>
          <span className="hhq-text">{L(quote.text, quote.text_en)}</span>
          <span className="hhq-author">— {L(quote.author, quote.author_en)}</span>
        </p>

        {/* לוח המספרים — בתוך הלוח, כשורת תוצאות עם קווים מפרידים (7.8).
            עד עכשיו ישב מתחת לבאנר ככרטיס לבן נפרד. */}
        <div className="home-stats">
          {STAT_TILES.map((t) => (
            <div key={t.key} className="stat-tile" data-c={t.c}>
              <span className="stat-tile-ic"><t.Icon size={17} /></span>
              {/* dir="ltr" — בלעדיו סימן האחוז נדחף לשמאל המספר ומתקבל «%87» */}
              <span className="stat-tile-num" dir="ltr">
                <StatNum value={t.value} decimals={t.dec} />
                {t.pct && typeof t.value === 'number' && <span className="stat-tile-pct">%</span>}
              </span>
              <span className="stat-tile-label">{t.label}</span>
            </div>
          ))}
        </div>
      </header>

      {/* סדר המוקאפ (עמוד 3): באנר → אישורי הגעה → ארבעת המספרים →
          האימון הקרוב. בדסקטופ הכרטיס יושב בתוך הבאנר, לצד הברכה. */}
      {narrow && (
        <div className="home-next-mobile">
          <NextPractice session={session} schedule={sched} onNavigate={onNavigate} onEntry={setNextEntry} />
          {nextEntry?.team && <PracticeRsvp session={session} practice={{ ...nextEntry, session_id: nextEntry.id }} />}
        </div>
      )}

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
          <h3 className="onboard-title">{L(`ברוכים הבאים, ${name}!`, `Welcome, ${name}!`)}</h3>
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

      {/* ===== העיתון (7.8) =====
          דסקטופ: טור ראשי (מה דורש אותי) + סרגל צד דביק (מה מתוכנן ומי סביבי),
          כמו בבית השחקן. במובייל שני העוטפים display:contents והסדר נשמר
          בדיוק כשהיה, דרך מחלקות hp-o-* עם order. */}
      <div className="hp-main">
        {/* 1.4 — «דברים לביצוע»: מחליף את באנר «האימון עוד פתוח» ומרחיב אותו לשש בדיקות */}
        <div className="hp-o-todo"><CoachTodo session={session} onNavigate={onNavigate} /></div>
        <div className="hp-o-today"><TodayPlanCard session={session} profile={profile} schedule={sched} onNavigate={onNavigate} /></div>
        <div className="hp-o-att"><NeedsAttention session={session} onNavigate={onNavigate} /></div>

        {/* חדש בקהילה — טיזר לפיד (מוצג רק כשיש פוסטים) */}
        {communityPosts.length > 0 && (
          <div className="hp-o-comm">
            <span className="sec-kicker">{L('קהילה', 'Community')}</span>
            <div className="home-community-head">
              <h2 className="section-title" style={{ margin: 0 }}>{L('חדש בקהילה', 'New in the community')}</h2>
              <button type="button" className="link-button" onClick={() => onNavigate('community')}>
                {L('לכל הפיד', 'Open the feed')} <ChevronFwd size={14} />
              </button>
            </div>
            <div className="home-community-grid reveal-up">
              {communityPosts.map((p) => {
                const author = p.author
                  ? `${p.author.first_name || ''} ${p.author.last_name || ''}`.trim() || L('מאמן', 'Coach')
                  : L('מאמן', 'Coach')
                const img = safeUrl(p.thumbUrl)
                return (
                  <button key={p.id} type="button" className="home-community-card" onClick={() => onNavigate('community')}>
                    {img && <span className="hc-thumb" style={{ backgroundImage: `url("${img.replace(/["\\)]/g, '')}")` }} />}
                    <span className="hc-body">
                      <span className="hc-author">{author}{p.author?.club ? ` · ${p.author.club}` : ''}</span>
                      <span className="hc-text">{p.content || L('שיתף צילומים מהאימון', 'Shared practice photos')}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="hp-side">
        <div className="hp-o-week"><WeekSchedule session={session} schedule={sched} onNavigate={onNavigate} /></div>

        {netSmall === false && (
          <div className="hp-o-cow">
            <CoachOfWeek onOpenCoach={(coach) => (onOpenCoach ? onOpenCoach(coach) : onNavigate('finder'))} />
          </div>
        )}

        <div className="hp-o-links">
          <h2 className="section-title" style={{ marginTop: 32 }}>
            {L('תוכן והשראה', 'Content & inspiration')}
          </h2>
          <div className="home-grid reveal-up">
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
      </div>

      {/* 2.2 — כתבות בתחתית הבית: 4 כתבות ממדורי כדורסל ישראליים,
          כותרת + תמונה + קישור החוצה למקור. לא מעתיקים תוכן. */}
      {SHOW_NEWS && <div className="hp-o-news">
      <span className="sec-kicker" style={{ marginTop: 24 }}>{L('מהתקשורת', 'From the press')}</span>
      <h2 className="section-title section-title--icon">
        <Newspaper size={18} />
        {L('כתבות כדורסל ישראלי', 'Israeli basketball news')}
      </h2>
      <p className="muted small" style={{ marginTop: -2, marginBottom: 4 }}>
        {L('ממדורי הכדורסל של אתרי הספורט הישראליים — לחיצה פותחת את הכתבה המלאה במקור.', 'From the basketball sections of Israeli sports sites — tap to open the full article at its source.')}
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
        <div className="news-grid reveal-up">
          {items.slice(0, NEWS_HOME_COUNT).map((a, i) => (
            <a key={i} className="news-card" href={safeUrl(a.link) || '#'} target="_blank" rel="noopener noreferrer">
              <div
                className="news-thumb"
                style={{ backgroundImage: `url("${newsImage(a)}")` }}
              >
                {a.source && <span className="news-source">{a.source}</span>}
              </div>
              <div className="news-body">
                {/* bdi — כותרות עם תוצאות ("79:66") מתהפכות בלי בידוד כיוון */}
                <span className="news-title"><bdi>{a.title}</bdi></span>
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
          {L('לא הצלחנו לטעון כתבות כרגע — ננסה שוב בכניסה הבאה.', "We couldn't load articles right now — we'll retry next visit.")}
        </p>
      )}
      </div>}
    </div>
  )
}
