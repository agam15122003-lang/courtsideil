import { useState, useEffect, useRef, lazy, Suspense, Component } from 'react'
import { supabase } from './supabaseClient'
import ProfileForm from './ProfileForm'
import MyStats from './MyStats'
import MyDrills from './MyDrills'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import Home from './Home'
import Avatar from './Avatar'
import QuoteStrip from './QuoteStrip'
import Notifications from './Notifications'
import PendingApproval from './PendingApproval'
import AdultConfirm from './AdultConfirm'
import ErrorBoundary from './ErrorBoundary'
import useNavMarker from './useNavMarker'
import PocketNav from './PocketNav'
import { useLang, L } from './i18n'
// שמירה על עבודה פתוחה (המחברת) לפני מעבר מסך — ראו src/unsavedGuard.js
import { confirmLeave } from './unsavedGuard'
// isAdultPlayer עבר ל-consent.js: גם מסך ההמתנה צריך אותו כדי לזהות שחקן
// שהגיע ל-18 בזמן שחיכה לאישור הורה.
import { isAdultPlayer } from './consent'

// ===== טעינה עצלה שעומדת בדפלוי באמצע סשן =====
// אחרי דפלוי לוורסל הנכסים עם ה-hash הישן נמחקים, ו-import() של chunk ישן
// מחזיר 404. React מטמין את הדחייה בתוך lazy(): מרגע שה-thenable נדחה, כל
// רינדור חוזר זורק את אותה שגיאה — ולכן «נסה שוב» של ErrorBoundary הוא no-op.
// המסקנה: הניסיון החוזר חייב לקרות כאן, בתוך ה-factory, לפני ש-React בכלל
// רואה דחייה.
const CHUNK_FLAG = 'cs-chunk-reload'
// גישה ל-sessionStorage זורקת בגלישה פרטית/עוגיות חסומות — כל נגיעה עטופה
const chunkFlag = {
  read() {
    try {
      // ⚠ כש-sessionStorage זמין הוא הסימן **היחיד**, ויוצאים כאן.
      // הגרסה הקודמת נפלה מכאן הלאה גם כשהוא עבד, ואז בדיקת סוג הניווט
      // ספרה **רענון ידני של המשתמש** כ«כבר ניסינו לרענן» — ומרגע
      // שהמשתמש הקיש Ctrl+Shift+R, ההתאוששות האוטומטית הושבתה לכל אורך
      // חיי הדף. דפלוי שיצא אחר כך הקפיץ לו מסך שגיאה במקום לרענן.
      // בדיוק זה קרה ב-6.8.2026.
      return sessionStorage.getItem(CHUNK_FLAG) === '1'
    } catch { /* מצב פרטיות — אין אחסון, נופלים לבדיקה שלמטה */ }
    // גיבוי כשאין sessionStorage בכלל: אם הטעינה הנוכחית היא כבר רענון, רענון
    // נוסף לא יביא נכסים חדשים יותר — הוא רק ייצור לולאת רענונים.
    try { return performance.getEntriesByType('navigation')[0]?.type === 'reload' } catch { return false }
  },
  mark() { try { sessionStorage.setItem(CHUNK_FLAG, '1') } catch { /* מצב פרטיות */ } },
  clear() { try { sessionStorage.removeItem(CHUNK_FLAG) } catch { /* מצב פרטיות */ } },
}

function lazyRetry(factory) {
  // טעינה מוצלחת מנקה את הדגל, כדי שדפלוי נוסף באותו טאב עדיין יזכה לרענון
  const ok = (mod) => { chunkFlag.clear(); return mod }
  return () => factory().then(ok).catch(() => new Promise((resolve, reject) => {
    // נפילת רשת רגעית (סלולרי) — ניסיון שני שקט לפני שמקפיצים את המשתמש
    setTimeout(() => {
      factory().then((mod) => resolve(ok(mod))).catch((err) => {
        // נכשל גם בשנייה: כמעט תמיד דפלוי חדש. רענון אחד מביא index.html
        // עדכני עם ה-hash הנוכחי; הדגל מונע לולאת רענונים אינסופית.
        if (!chunkFlag.read()) { chunkFlag.mark(); window.location.reload(); return }
        reject(err)
      })
    }, 800)
  }))
}

// כשל טעינה של chunk, על פני הדפדפנים (הודעת השגיאה אינה מתוקננת)
const isChunkError = (e) =>
  /dynamically imported module|module script failed|loading chunk|chunkloaderror|failed to fetch/i
    .test(String(e?.message || e))

// גדר ייעודית לכשל טעינה במסלול השחקן: שם אין תפריט ואין מסך אחר לעבור אליו,
// והטקסט של ErrorBoundary («אפשר לעבור למסך אחר בתפריט») מבטיח מוצא שלא קיים.
// כל שגיאה שאינה כשל טעינה נזרקת הלאה, כדי ש-ErrorBoundary החיצוני יתפוס
// וידווח עליה כרגיל.
class ChunkGate extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (!isChunkError(error)) throw error
    return (
      <div className="empty-state" role="alert">
        <span className="empty-ic"><AlertTriangle size={26} /></span>
        <div className="empty-title">{L('צריך לרענן את הדף', 'The page needs a refresh')}</div>
        <p className="muted small" style={{ maxWidth: 460 }}>
          {L('יצאה גרסה חדשה של CourtSide בזמן שהאפליקציה הייתה פתוחה, ולכן המסך לא נטען. רענון אחד פותר את זה — שום דבר לא נמחק.',
             'A new version of CourtSide shipped while the app was open, so the screen could not load. One refresh fixes it — nothing is lost.')}
        </p>
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn-primary" onClick={() => { chunkFlag.clear(); window.location.reload() }}>
            <RotateCcw size={16} /> {L('רענון הדף', 'Refresh the page')}
          </button>
        </div>
      </div>
    )
  }
}

// מסכים כבדים נטענים רק בכניסה אליהם (code-splitting) — טעינה ראשונית מהירה.
// PlayerDashboard גורר איתו את כל עולם השחקן (~2000 שורות + מסכי המשנה שלו);
// כשהוא היה import רגיל כל מאמן הוריד מסכים שלעולם לא יראה. חשוב: אסור
// לייבא אף אחד מהם גם באופן רגיל — ייבוא כפול מבטל בשקט את כל הפיצול.
const PlayerDashboard = lazy(lazyRetry(() => import('./PlayerDashboard')))
const CoachFinder = lazy(lazyRetry(() => import('./CoachFinder')))
const DrillLibrary = lazy(lazyRetry(() => import('./DrillLibrary')))
const TrainingPlans = lazy(lazyRetry(() => import('./TrainingPlans')))
const Messages = lazy(lazyRetry(() => import('./Messages')))
const Community = lazy(lazyRetry(() => import('./Community')))
const Schedule = lazy(lazyRetry(() => import('./Schedule')))
const PersonalTrainees = lazy(lazyRetry(() => import('./PersonalTrainees')))
const Teams = lazy(lazyRetry(() => import('./Teams')))
const Admin = lazy(lazyRetry(() => import('./Admin')))
const PlayerDossier = lazy(lazyRetry(() => import('./PlayerDossier')))
// 10a — הצד הציבורי של הפרופיל הוא בדיוק המסך שמאמן אחר רואה
const CoachProfile = lazy(lazyRetry(() => import('./CoachProfile')))
const Media = lazy(lazyRetry(() => import('./Media')))
import {
  Home as HomeIcon,
  User,
  Users,
  Dumbbell,
  ClipboardList,
  MessageSquare,
  MessagesSquare,
  CalendarDays,
  MonitorPlay,
  Shield,
  ShieldCheck,
  FolderOpen,
  Menu,
  X,
  Pencil,
  Moon,
  Languages,
  LogOut,
  Smartphone,
  Plus,
  Eye,
  AlertTriangle,
  RotateCcw,
  UserPlus,
} from 'lucide-react'
import { ChevronFwd } from './DirIcon'
import Logo from './Logo'
import Page from './Page'
import ChangePassword from './ChangePassword'

// "קהילה תחילה" (סדר לפי ה-handoff) — הפרופיל יושב בכרטיס המשתמש למטה
const NAV = [
  { id: 'home', key: 'nav.home', Icon: HomeIcon },
  { id: 'community', key: 'nav.community', Icon: MessagesSquare },
  { id: 'finder', key: 'nav.finder', Icon: Users },
  { id: 'messages', key: 'nav.messages', Icon: MessageSquare },
  // «תרגילים» ו«תוכניות» היו שני יעדים לאותה עבודה. מסך 13a במסמך מראה
  // אותם כמסך אחד עם שני טאבים: «בניית תוכנית» / «בניית תרגיל».
  { id: 'work', key: 'nav.work', Icon: ClipboardList },
  { id: 'teams', key: 'nav.teams', Icon: Shield },
  // מתחת ל«הקבוצות שלי» במכוון: שניהם ניהול אנשים, וזה ההבדל ביניהם —
  // קבוצה מול יחיד.
  { id: 'trainees', key: 'nav.trainees', Icon: UserPlus },
  { id: 'schedule', key: 'nav.schedule', Icon: CalendarDays },
  { id: 'media', key: 'nav.media', Icon: MonitorPlay },
]

// התפריט התחתון במובייל — **חמישה יעדים**, לפי מסקנת הביקורת בעמוד 22
// במסמך המסירה («תפריט תחתון של 5 בשני העולמות במקום 11 יעדים»).
// חמשת אלה הם הלולאה היומית של המאמן, לפי מספר הקישורים הנכנסים אליהם
// מהמסכים עצמם: הקבוצה (7 קישורים) · תוכניות (5) · קהילה (3) · בית · הודעות
// (היחיד עם badge חי). מדיה, תרגילים, לו״ז, מאתר המאמנים והפרופיל נשארים
// במגירה — ולפרופיל יש גם כרטיס משתמש בתחתית המגירה.
// הרוחב מונע ע"י --bn-count על .layout.
// ניווט־הכיס (11.8, מסמך העיצוב 3a): ארבעה יעדים בגלולה — בית, קהילה,
// הקבוצה, הודעות — והכפתור הכתום שביניהם פותח את כל השאר בגיליון.
// «אימונים ותרגילים» ירד מהארבעה כי הוא בגיליון וגם בכפתור הראשי של הבית.
const POCKET_NAV = [
  { id: 'home', key: 'nav.home', Icon: HomeIcon },
  { id: 'community', key: 'nav.community', Icon: MessagesSquare },
  { id: 'teams', key: 'nav.teamsShort', Icon: Shield },
  { id: 'messages', key: 'nav.messages', Icon: MessageSquare },
]
const ADMIN_NAV = { id: 'admin', key: 'nav.admin', Icon: ShieldCheck }
// «תיק שחקן» — תצוגה מוקדמת על נתוני דוגמה, גלויה למנהלי מערכת בלבד
// עד שהמסכים יאושרו ויחוברו למסד.
const DOSSIER_NAV = { id: 'dossier', key: 'nav.dossier', Icon: FolderOpen }
// הפרופיל לא ב-NAV (הוא כרטיס המשתמש בסרגל) — בגיליון הוא פריט ככל השאר
const PROFILE_NAV = { id: 'profile', key: 'nav.profile', Icon: User }

// כותרות הבאנר לכל מסך (החלטת הבעלים: באנר נייבי בכל מסך).
// פונקציות ולא אובייקט קפוא — L() חייב להיקרא בזמן רינדור כדי שהחלפת
// שפה תעדכן גם את הבאנר.
// מסכים שכבר יש להם hero משלהם (בית, קהילה, תרגילים) לא נכנסים לכאן.
const PAGE_META = {
  finder: () => ({
    eyebrow: L('הקהילה', 'Community'), eyebrowIcon: Users,
    title: L('מאתר המאמנים', 'Coach finder'),
    subtitle: L('מוצאים מאמנים לפי מועדון ושכבת גיל, ומתחילים שיחה.', 'Find coaches by club and age group, and start a conversation.'),
  }),
  media: () => ({
    eyebrow: L('צפייה', 'Watch'), eyebrowIcon: MonitorPlay,
    title: L('מדיה', 'Media'),
    subtitle: L('סרטוני אימון ופודקאסטים שהקהילה דירגה.', 'Training videos and podcasts, ranked by the community.'),
  }),
  // מסך 13a — «בניית אימון»: תוכניות ותרגילים תחת באנר אחד
  work: (tab) => ({
    eyebrow: L('העבודה שלי', 'My work'), eyebrowIcon: ClipboardList,
    title: L('בניית אימון', 'Build a practice'),
    subtitle: tab === 'drills'
      ? L('מאגר התרגילים של הקהילה — חיפוש, דירוג ושליחה לשחקנים.', "The community's drill collection — search, rate and send to players.")
      : tab === 'community'
        ? L('תוכניות ותרגילים שמאמנים אחרים שיתפו — צופים, מעתיקים אליכם וממשיכים משם.', "Plans and drills other coaches shared — browse, copy to your library and build on them.")
        : L('בונים מערך, מסדרים תרגילים לפי חלקים, ושולחים לשחקנים.', 'Build a session, order the drills by part, and send it to your players.'),
  }),
  schedule: () => ({
    eyebrow: L('העבודה שלי', 'My work'), eyebrowIcon: CalendarDays,
    title: L('הלו״ז שלי', 'My schedule'),
    subtitle: L('כל האימונים, המשחקים והפגישות שלך בשבוע אחד.', 'Every practice, game and meeting of yours in one week.'),
  }),
  trainees: () => ({
    eyebrow: L('העבודה שלי', 'My work'), eyebrowIcon: UserPlus,
    title: L('מתאמנים אישיים', 'Personal trainees'),
    subtitle: L('השחקנים שאתה מאמן אישית, והמשימות שאתה שולח להם.', 'The players you train one-on-one, and the tasks you send them.'),
  }),
  teams: () => ({
    eyebrow: L('הקבוצות שלי', 'My teams'), eyebrowIcon: Shield,
    title: L('ניהול קבוצה', 'Team management'),
    subtitle: L('סגל, נוכחות, יעדים, משחקים וטבלת הליגה — לכל קבוצה שאתה מאמן.', 'Roster, attendance, goals, games and the league table — for every team you coach.'),
    size: 'lg',
  }),
  admin: () => ({
    eyebrow: L('מערכת', 'System'), eyebrowIcon: ShieldCheck,
    title: L('ניהול', 'Administration'),
    subtitle: L('מאמנים, דיווחים ומצב המערכת.', 'Coaches, reports and system status.'),
  }),
  dossier: () => ({
    eyebrow: L('העבודה שלי', 'My work'), eyebrowIcon: FolderOpen,
    title: L('תיק שחקן', 'Player dossier'),
    subtitle: L('התיק שעובר עם השחקן משנה לשנה — דירוגים, מדידות, רקע וגרף התקדמות. סגור: אתה, המנהלים מעליך, ומי שנתת לו גישה.', 'The dossier that follows the player year to year — ratings, measurements, background and a progress chart. Private to you, your managers and anyone you grant access.'),
    size: 'lg',
  }),
  // מסך 7a: eyebrow «הודעות», כותרת «השיחות שלי», וכפתור «שיחה חדשה»
  // בתוך הבאנר עצמו — לא שורת פעולות נפרדת מתחתיו.
  messages: (nav) => ({
    eyebrow: L('הודעות', 'Messages'), eyebrowIcon: MessageSquare,
    title: L('השיחות שלי', 'My chats'),
    actions: nav && (
      <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => nav('finder')}>
        <Plus size={16} aria-hidden="true" /> {L('שיחה חדשה', 'New chat')}
      </button>
    ),
  }),
  profile: () => ({
    eyebrow: L('החשבון שלי', 'My account'), eyebrowIcon: User,
    title: L('הפרופיל שלי', 'My profile'),
    subtitle: L('הפרטים שלך, המספרים שלך וההגדרות.', 'Your details, your numbers and your settings.'),
  }),
}

export default function Dashboard({ session }) {
  const { t } = useLang()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  // מסך 10a — מתג «כך רואים אותך»: הצד הפרטי מול התצוגה הציבורית
  const [profileTab, setProfileTab] = useState('private')
  const [view, setView] = useState('home')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sidebarRef = useRef(null)
  // המפתח כולל is_admin כי הוא מוסיף פריט לרשימה ומזיז את כל מה שמתחתיו
  const [navRef, navBox] = useNavMarker(`${view}:${profile?.is_admin}`)
  const [initialCoach, setInitialCoach] = useState(null) // מאמן לפתוח ישירות (למשל מ"מאמן השבוע")
  const [communityTab, setCommunityTab] = useState(null) // טאב לפתיחה בקהילה ('chats' מכפתור בהודעות)
  const [finderTab, setFinderTab] = useState(null) // לשונית לפתיחה במאתר ('games' מהקבוצות)
  const [teamsTab, setTeamsTab] = useState(null) // טאב לפתיחה בקבוצה ('practices' מהלו"ז)
  const [planToOpen, setPlanToOpen] = useState(null) // תוכנית לפתוח ישירות (מדף הבית)
  const [dossierRoster, setDossierRoster] = useState(null) // תיק שחקן לפתוח ישירות (מכרטיס השחקן)
  const [workTab, setWorkTab] = useState('plans') // 'plans' | 'drills' | 'community' במסך «אימונים ותרגילים»
  const [communityKind, setCommunityKind] = useState('plans') // בטאב «מהקהילה»: 'plans' | 'drills'
  // (7.8) isNarrow ירד: הלוח המעוגל נושא את הציטוט שלו בכל רוחב מסך,
  // ולכן פס הציטוט העליון כבר לא נחוץ בבית — גם לא במובייל.
  // עורך הווידאו נשאר חי ברקע אחרי הביקור הראשון — יציאה מהעמוד לא מוחקת את העבודה

  const [loadError, setLoadError] = useState(false)
  // המודל של אישור הבגירות נסגר לסשן הזה (אישור או «אחר כך»)
  const [adultDone, setAdultDone] = useState(false)

  // ניווט עם יעדי-עומק: 'community-chats' פותח את הקהילה על טאב הצ'אטים,
  // 'finder-games' פותח את המאתר על לוח משחקי האימון
  const navigate = async (id) => {
    // מסך עם עבודה שלא נשמרה (המחברת) מקבל הזדמנות לעצור את המעבר
    if (!(await confirmLeave())) return
    if (id === 'community-chats') { setCommunityTab('chats'); setView('community'); return }
    if (id === 'finder-games') { setFinderTab('games'); setView('finder'); return }
    // מהלו"ז אל ימי האימון הקבועים — עד היום זו הייתה הוראה בטקסט בלי קישור
    if (id === 'teams-practices') { setTeamsTab('practices'); setView('teams'); return }
    // «למחברת המלאה» / «תוכנית האימון» הבטיחו תוכנית מסוימת ונחתו על הרשימה
    if (typeof id === 'string' && id.startsWith('plans:')) { setPlanToOpen(id.slice(6)); setWorkTab('plans'); setView('work'); return }
    // «תיק שחקן» מכרטיס השחקן — נוחתים על התיק של אותה שורת סגל
    if (typeof id === 'string' && id.startsWith('dossier:')) { setDossierRoster(id.slice(8)); setView('dossier'); return }
    // «תרגילים» ו«תוכניות» הם עכשיו שני טאבים במסך אחד — הקישורים הישנים נשמרים
    if (id === 'drills') { setWorkTab('drills'); setView('work'); return }
    if (id === 'plans') { setWorkTab('plans'); setView('work'); return }
    setView(id)
  }

  // מונה הודעות שלא נקראו — ל-badge בניווט (מתרענן במעבר מסך ואחת לדקה)
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let alive = true
    const loadUnread = async () => {
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', session.user.id)
        .is('read_at', null)
      if (alive && !error) setUnread(count || 0)
    }
    loadUnread()
    const t = setInterval(loadUnread, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [session.user.id, view])

  async function loadProfile() {
    setLoading(true)
    setLoadError(false)
    // דרך RPC ולא select('*'): הרשאת הקריאה על phone/email נשללה מ-authenticated
    // (supabase_privacy4.sql) כדי שאיש לא יוכל לשלוף PII של משתמשים אחרים.
    // my_profile() מחזירה את השורה המלאה של המשתמש עצמו בלבד.
    let { data, error } = await supabase.rpc('my_profile').maybeSingle()
    if (error) {
      // נפילה לאחור עד שה-SQL ירוץ
      const legacy = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      data = legacy.data
      error = legacy.error
    }

    // PGRST116 = אין שורה (פרופיל חדש שטרם מולא) — זה מצב תקין, לא שגיאה.
    // כל שגיאה אחרת (רשת/timeout, נפוץ במובייל) לא מתחזה ל"פרופיל ריק"
    // כדי לא להציג טופס הרשמה שידרוס פרופיל קיים.
    if (error && error.code !== 'PGRST116') {
      console.error('שגיאה בטעינת הפרופיל:', error.message)
      setLoadError(true)
    } else {
      setProfile(data || null)
    }
    setLoading(false)
  }

  // טוענים פרופיל רק כשמשתמש מתחלף — לא בכל רענון-טוקן אוטומטי (כל ~שעה),
  // שאחרת היה מפעיל loading=true ומאפס את המסך והעבודה שבתהליך.
  useEffect(() => {
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id])

  // גלילה לראש העמוד וסגירת המגירה בכל מעבר מסך
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setDrawerOpen(false)
  }, [view])

  // מגירת מובייל פתוחה: נועלים גלילת רקע וסוגרים ב-Escape
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  // המגירה במובייל מוסרת מסדר ה-Tab וממקורא המסך כשהיא סגורה (inert),
  // ובדסקטופ הסרגל תמיד פעיל.
  useEffect(() => {
    const el = sidebarRef.current
    if (!el) return
    // עד 840 — גם אייפד עומד (19.8) מקבל את המגירה. ברוחבים שמעל, המגירה
    // קיימת רק בזמן עריכה, ושם visibility:hidden על המגירה החונה (CSS) מוציא
    // אותה מסדר ה-Tab ומעץ הנגישות בלי צורך ב-inert.
    const mq = window.matchMedia('(max-width: 840px)')
    const apply = () => { el.inert = mq.matches && !drawerOpen }
    apply()
    mq.addEventListener('change', apply)
    return () => { mq.removeEventListener('change', apply); el.inert = false }
  }, [drawerOpen])

  // ===== שומר ה-Back של אנדרואיד =====
  // עד היום כפתור ה-Back החומרתי סגר את האפליקציה מכל מסך פנימי ומכל מגירה
  // פתוחה. כאן דוחפים רשומת היסטוריה אחת כשיש "משהו לסגור", ו-popstate סוגר
  // אותו במקום לצאת. בחזרה לבית הרשומה נצרכת, כך שההיסטוריה לא מתנפחת.
  const backGuardRef = useRef(0)
  useEffect(() => {
    const needGuard = drawerOpen || view !== 'home'
    if (needGuard && backGuardRef.current === 0) {
      try { window.history.pushState({ csGuard: 'screen' }, '') } catch { /* ignore */ }
      backGuardRef.current = 1
    } else if (!needGuard && backGuardRef.current === 1) {
      backGuardRef.current = 0
      try { window.history.back() } catch { /* ignore */ }
    }
  }, [drawerOpen, view])

  useEffect(() => {
    const onPop = () => {
      if (backGuardRef.current === 0) return // הרשומה שלנו כבר נצרכה
      backGuardRef.current = 0
      if (drawerOpen) { setDrawerOpen(false); return }
      if (view !== 'home') setView('home')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [drawerOpen, view])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  // PWA — כפתור "התקן את האפליקציה" כשהדפדפן מציע התקנה
  const [installEvt, setInstallEvt] = useState(null)
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  const installApp = async () => {
    if (!installEvt) return
    installEvt.prompt()
    const { outcome } = await installEvt.userChoice
    if (outcome === 'accepted') setInstallEvt(null)
  }

  const isPlayer = profile?.role === 'player'
  // שחקן: מספיק שם. מאמן: שם + מועדון.
  const isComplete =
    profile && profile.first_name && profile.last_name && (isPlayer || profile.club)
  const showForm = editing || (!loading && !isComplete)

  // אנימציית כניסת מסך בלי remount: במקום key על .main-inner (שפירק את כל
  // עץ המסך בכל ניווט) מפעילים מחדש את אנימציית ה-CSS הקיימת — ניקוי
  // ה-animation, reflow אחד, והחזרה לערך מהגיליון. prefers-reduced-motion
  // ממשיך לכבות אותה בגיליון עצמו, ולכן אין כאן שום התנהגות שצריך לשכפל.
  const mainInnerRef = useRef(null)
  const viewKey = showForm ? 'profile-form' : view
  const firstViewRef = useRef(true)
  useEffect(() => {
    if (firstViewRef.current) { firstViewRef.current = false; return } // המסך הראשון כבר מונפש מעצמו
    const el = mainInnerRef.current
    if (!el) return
    el.style.animation = 'none'
    void el.offsetWidth // reflow — בלעדיו הדפדפן מאחד את שני השינויים ולא מפעיל מחדש
    el.style.animation = ''
  }, [viewKey])

  // ===== שער אישור ההורה =====
  // approval_status שלא קיים בשורה (מסד שטרם הריץ את המיגרציה) נחשב 'active' —
  // בשום מצב לא נועלים משתמש קיים בגלל עמודה חסרה.
  const approvalStatus = profile?.approval_status || 'active'
  // שני מצבים שאסור לבלבל ביניהם:
  //  suspended      = ההורה ביטל הסכמה בפועל (או אדמין השעה) → נעילה מלאה.
  //                   זו החלטה אנושית מפורשת, ואסור שיהיה לה מעקף.
  //  pending_parent = פשוט עוד לא הגיעה תשובה → החשבון נפתח במצב מוגבל.
  //                   החלטת הבעלים: המאמן הוא שומר הסף, והדרך להגיע אליו
  //                   היא הצטרפות עם קוד קבוצה — ולכן נעילה מלאה כאן סוגרת
  //                   בדיוק את הדלת שדרכה הפיקוח האנושי נכנס. השרת
  //                   (supabase_consent_enforcement.sql) חוסם ממילא כתיבה,
  //                   וה-UI רק משקף את זה.
  const suspended = isPlayer && approvalStatus === 'suspended'
  const restricted = isPlayer && approvalStatus === 'pending_parent'

  // שחקן שהגיע ל-18 בזמן ההמתנה נשאר 'pending_parent' לנצח: הסטטוס מחושב
  // מחדש רק ב-UPDATE על profiles, ולכן «בדיקת סטטוס» לבדה לא תשחרר אותו לעולם.
  // confirm_adult() קיימת בדיוק בשביל זה — כאן נותנים לה קורא.
  // רק 'pending_parent': ב-'suspended' (אדמין השעה, או ההורה ביטל הסכמה)
  // אסור שהמשתמש ישחרר את עצמו — confirm_adult קובעת 'active' ללא תנאי.
  const canSelfConfirm = isPlayer && approvalStatus === 'pending_parent' && isAdultPlayer(profile)

  // בלי תלות ב-loading: «בדיקת סטטוס» מפעילה loading=true לרגע, ובלעדי זה
  // המסך היה מהבהב אל מעטפת המאמן בכל לחיצה. הפרופיל הישן נשאר ב-state
  // עד שהטעינה מסתיימת, ולכן השער עדיין מחושב על נתונים אמיתיים.
  if (!loadError && isComplete && suspended) {
    // «שינוי הפרטים של ההורה» — טופס הפרופיל לבדו, בלי המעטפת של המאמן
    if (editing) {
      return (
        <div className="center-screen">
          <ProfileForm
            session={session}
            profile={profile}
            onSaved={() => { setEditing(false); loadProfile() }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )
    }
    return (
      <PendingApproval
        profile={profile}
        status="suspended"
        onEditProfile={() => setEditing(true)}
        onRecheck={loadProfile}
      />
    )
  }

  // בגיר שעדיין לא אישר בעצמו: המודל מוצג רק כשהעמודה קיימת בשורה (אחרת
  // המסד טרם עודכן), רק כשיש פרטי הורה לנקות, ורק פעם אחת בסשן.
  // !restricted: עד היום שחקן ממתין-הורה נעצר בנעילה המלאה ומעולם לא הגיע
  // לכאן. עכשיו הוא כן מגיע — והבאנר כבר מציע לו בדיוק את אותו אישור עצמי,
  // ולכן מודל שקופץ מעליו הוא כפילות ולא עזרה.
  const adultNeedsConfirm =
    isPlayer &&
    !restricted &&
    !adultDone &&
    !!profile &&
    Object.prototype.hasOwnProperty.call(profile, 'adult_confirmed_at') &&
    !profile.adult_confirmed_at &&
    isAdultPlayer(profile) &&
    !!(profile.guardian_email || profile.guardian_name || profile.guardian_consent_at)

  // שחקן מלא → האפליקציה של השחקן (מעטפת נפרדת)
  if (!loading && !showForm && isPlayer) {
    return (
      <>
        {/* נטען עצלנית — ולכן חייב Suspense + גדר בטיחות משלו כאן.
            ChunkGate יושב בפנים ומטפל רק בכשל טעינת ה-chunk (שם «נסה שוב»
            חסר משמעות); כל שאר השגיאות ממשיכות ל-ErrorBoundary ומדווחות. */}
        <ErrorBoundary screen="player:root">
          <ChunkGate>
            <Suspense
              fallback={(
                <div className="app-loading" style={{ padding: '48px 0' }}>
                  <div className="loader" />
                </div>
              )}
            >
              {/* restricted יורד כאן ולא מחושב שוב בפנים: מי שמכריע מיהו
                  שחקן מוגבל הוא השער היחיד שלמעלה, ולא שני חישובים
                  שעלולים להיפרד. canSelfConfirm מגיע איתו כדי שהבאנר
                  יציע לבגיר שנתקע לשחרר את עצמו. */}
              <PlayerDashboard
                session={session}
                profile={profile}
                onProfileReload={loadProfile}
                restricted={restricted}
                canSelfConfirm={canSelfConfirm}
              />
            </Suspense>
          </ChunkGate>
        </ErrorBoundary>
        <AdultConfirm
          open={adultNeedsConfirm}
          onDone={() => { setAdultDone(true); loadProfile() }}
          onClose={() => setAdultDone(true)}
        />
      </>
    )
  }

  // data-view על המעטפת מכבה את הסרגל העליון בבית במובייל (11.8).
  // showForm/loading רצים כש-view עדיין 'home' — ובלי ההבחנה הזאת גם
  // טופס השלמת הפרופיל היה נשאר בלי סרגל ובלי ריפוד עליון.
  return (
    <div
      className="layout"
      data-view={showForm || loading || loadError ? 'form' : view}
      style={{ '--bn-count': POCKET_NAV.length }}
    >
      <a href="#main" className="skip-link">
        {t('skip.toContent')}
      </a>
      {/* סרגל עליון — מובייל בלבד (המבורגר + מותג + מצב כהה) */}
      <header className="mobile-topbar">
        <button
          className="drawer-toggle"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('common.openMenu')}
        >
          <Menu size={22} />
        </button>
        <div className="sidebar-brand">
          <Logo size={26} />
          <span>CourtSide</span>
        </div>
        <div className="topbar-actions">
          <Notifications session={session} onNavigate={navigate} />
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}

      {/* inert כשהמגירה סגורה במובייל: אחרת 16 הפריטים שלה נשארים בסדר ה-Tab
          ובעץ של קורא המסך גם כשהיא מחוץ למסך. */}
      <aside ref={sidebarRef} className={drawerOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-brand">
          <Logo size={30} />
          <span>CourtSide</span>
          <span className="sidebar-bell">
            <Notifications session={session} onNavigate={navigate} />
          </span>
          <button
            className="drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label={t('common.closeMenu')}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav" ref={navRef}>
          {/* פס אחד שגולש בין הפריטים — מחליף את ה-::before שקפץ */}
          {navBox && (
            <span
              className="nav-marker"
              aria-hidden="true"
              style={{ '--nm-y': `${navBox.y}px`, '--nm-h': `${navBox.h}px` }}
            />
          )}
          {(profile?.is_admin ? [...NAV, DOSSIER_NAV, ADMIN_NAV] : NAV).map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={async () => {
                if (!(await confirmLeave())) return
                setView(item.id)
                setDrawerOpen(false)
              }}
            >
              <item.Icon size={18} />
              {t(item.key)}
              {item.id === 'messages' && unread > 0 && (
                <span className="nav-badge">{unread > 9 ? '9+' : unread}</span>
              )}
            </button>
          ))}
        </nav>

        {profile?.first_name && (
          <button
            className="sidebar-user"
            onClick={async () => { if (!(await confirmLeave())) return; setEditing(false); setView('profile'); setDrawerOpen(false) }}
            title={t('action.editProfile')}
          >
            <Avatar
              name={`${profile.first_name} ${profile.last_name || ''}`}
              url={profile.avatar_url}
              size={38}
            />
            <span className="sidebar-user-info">
              <strong>{profile.first_name} {profile.last_name}</strong>
              <span>
                {L('מאמן', 'Coach')}
                {(profile.age_groups?.[0] || profile.club) ? ` · ${profile.age_groups?.[0] || profile.club}` : ''}
              </span>
            </span>
          </button>
        )}

        {installEvt && (
          <button type="button" className="btn-soft install-btn" onClick={installApp}>
            {/* היה אמוג'י 📲 — בניגוד לכלל של הפרויקט עצמו: אייקונים מ-lucide בלבד */}
            <Smartphone size={16} aria-hidden="true" /> {L('התקן את CourtSide בטלפון', 'Install CourtSide')}
          </button>
        )}
        <div className="sidebar-footer">
          <LanguageToggle />
          <ThemeToggle />
          <button className="btn-ghost" onClick={handleSignOut}>
            {t('action.signout')}
          </button>
        </div>
      </aside>

      <main className="main-content" id="main">
        {/* היה כאן key={view}: כל החלפת מסך פירקה ובנתה מחדש את כל המכולה
            (כולל QuoteStrip) רק כדי שאנימציית הכניסה תתנגן שוב. עכשיו
            האנימציה מופעלת מחדש ב-JS (viewAnimRef למטה) והמכולה יציבה. */}
        {/* data-view — נקודת אחיזה ל-CSS למסך יחיד. הלו"ז השבועי הוא לוח
            של שבע עמודות, ותקרת ה-1000px של .main-inner חונקת אותו במסך
            רחב. ההרחבה חלה רק על המסך הזה ורק מעל נקודת השבירה. */}
        <div className="main-inner" data-view={view} ref={mainInnerRef}>
          {/* פס הציטוט — חלק מה-chrome הגלובלי, בכל עמוד (handoff §Global-2).
              חוץ מדף הבית: שם הציטוט יושב בתוך הלוח (בכל רוחב מסך, 7.8),
              והצגתו פעמיים באותו מסך נראית כמו תקלה. */}
          {!loading && !showForm && view !== 'home' && <QuoteStrip />}
          {/* גדר בטיחות: קריסה במסך בודד לא מוחקת את כל האפליקציה.
              ה-key ירד מ-.main-inner ולכן הוא יושב כאן — בלעדיו מסך שקרס
              היה משאיר את הודעת השגיאה גם אחרי מעבר למסך אחר. */}
          {/* ChunkGate גם כאן, לא רק במסלול השחקן: מסכי המאמן נטענים
              עצלנית בדיוק כמוהו, וכשיוצא דפלוי בזמן שהאפליקציה פתוחה הם
              נכשלו על «משהו נתקע במסך הזה» — הודעת קריסה כללית, במקום
              ההסבר שכבר כתוב ומכוון בדיוק למצב הזה. */}
          <ErrorBoundary key={viewKey} screen={showForm ? 'coach:profile-form' : `coach:${view}`}>
          <ChunkGate key={'cg-' + viewKey}>
          <Suspense
            fallback={
              <div className="app-loading" style={{ padding: '48px 0' }}>
                <div className="loader" />
              </div>
            }
          >
          {loading ? (
            <div className="welcome-card">
              <div className="app-loading" style={{ padding: '24px 0' }}>
                <div className="loader" />
                <p className="muted small" style={{ margin: 0 }}>{t('common.loadingProfile')}</p>
              </div>
            </div>
          ) : loadError ? (
            <div className="welcome-card" style={{ textAlign: 'center' }}>
              <h2 style={{ marginTop: 0 }}>{L('לא הצלחנו לטעון את הפרופיל', "Couldn't load your profile")}</h2>
              <p className="muted">{L('כנראה בעיית רשת רגעית. נסה שוב.', 'Probably a temporary network issue. Try again.')}</p>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={loadProfile}>
                {L('נסה שוב', 'Try again')}
              </button>
            </div>
          ) : showForm ? (
            <>
              {/* [11] פרופיל חדש שטרם הושלם — מסבירים למה כל ניווט מוביל לכאן */}
              {!isComplete && (
                <div className="alert alert-success" role="status" style={{ marginBottom: 14 }}>
                  {L('עוד רגע ואתם בפנים — נשלים כמה פרטים קצרים ואפשר להיכנס לכל האפליקציה.', "Almost in — complete a few quick details and the whole app opens up.")}
                </div>
              )}
              <ProfileForm
                session={session}
                profile={profile}
                onSaved={() => {
                  setEditing(false)
                  loadProfile()
                }}
                onCancel={isComplete ? () => setEditing(false) : undefined}
              />
            </>
          ) : view === 'home' ? (
            <Home
              session={session}
              profile={profile}
              onNavigate={navigate}
              onOpenCoach={(coach) => { setInitialCoach(coach); setView('finder') }}
            />
          ) : view === 'community' ? (
            <Community
              session={session}
              profile={profile}
              initialTab={communityTab}
              onConsumeInitialTab={() => setCommunityTab(null)}
              onOpenCoach={(coach) => { setInitialCoach(coach); setView('finder') }}
            />
          ) : view === 'finder' ? (
            <Page {...PAGE_META.finder()}>
              <CoachFinder
                session={session}
                initialCoach={initialCoach}
                onConsumeInitial={() => setInitialCoach(null)}
                initialTab={finderTab}
                onConsumeInitialTab={() => setFinderTab(null)}
              />
            </Page>
          ) : view === 'work' ? (
            /* מסך אחד לשתי העבודות (מסך 13a): באנר אחד, שני טאבים.
               המדיה נשארת מסך נפרד — החלטת הבעלים 25.7 ו-29.7. */
            <Page {...PAGE_META.work(workTab)}>
              <div className="tabs work-tabs">
                <button className={workTab === 'plans' ? 'tab active' : 'tab'} onClick={() => setWorkTab('plans')}>
                  <ClipboardList size={15} aria-hidden="true" /> {L('בניית תוכנית', 'Build a plan')}
                </button>
                <button className={workTab === 'drills' ? 'tab active' : 'tab'} onClick={async () => { if (await confirmLeave()) setWorkTab('drills') }}>
                  <Dumbbell size={15} aria-hidden="true" /> {L('בניית תרגיל', 'Build a drill')}
                </button>
                <button className={workTab === 'community' ? 'tab active' : 'tab'} onClick={async () => { if (await confirmLeave()) setWorkTab('community') }}>
                  <Users size={15} aria-hidden="true" /> {L('מהקהילה', 'From the community')}
                </button>
              </div>
              {workTab === 'community' ? (
                /* תוכן מהקהילה (9.8) — אותם שני מסכים, פתוחים ישר על סינון
                   «קהילה»: רואים מה מאמנים אחרים שיתפו, צופים ומעתיקים.
                   ה-key מרענן את המסך במעבר תוכניות⇄תרגילים. */
                <>
                  <div className="cw-kind" role="tablist" aria-label={L('סוג תוכן', 'Content kind')}>
                    <button role="tab" aria-selected={communityKind === 'plans'}
                      className={communityKind === 'plans' ? 'cw-kind-btn active' : 'cw-kind-btn'}
                      onClick={() => setCommunityKind('plans')}>
                      <ClipboardList size={14} aria-hidden="true" /> {L('תוכניות', 'Plans')}
                    </button>
                    <button role="tab" aria-selected={communityKind === 'drills'}
                      className={communityKind === 'drills' ? 'cw-kind-btn active' : 'cw-kind-btn'}
                      onClick={() => setCommunityKind('drills')}>
                      <Dumbbell size={14} aria-hidden="true" /> {L('תרגילים', 'Drills')}
                    </button>
                  </div>
                  {communityKind === 'drills'
                    ? <DrillLibrary key="community-drills" session={session} profile={profile} embedded initialSource="community" />
                    : <TrainingPlans key="community-plans" session={session} initialSource="community" />}
                </>
              ) : workTab === 'drills'
                ? <DrillLibrary session={session} profile={profile} embedded />
                : <TrainingPlans session={session} initialPlanId={planToOpen} onConsumeInitialPlan={() => setPlanToOpen(null)} />}
            </Page>
          ) : view === 'media' ? (
            <Page {...PAGE_META.media()}>
              <Media session={session} profile={profile} />
            </Page>
          ) : view === 'schedule' ? (
            <Page {...PAGE_META.schedule()}>
              <Schedule session={session} onNavigate={navigate} />
            </Page>
          ) : view === 'trainees' ? (
            <Page {...PAGE_META.trainees()}>
              <PersonalTrainees session={session} />
            </Page>
          ) : view === 'teams' ? (
            /* לקבוצה יש באנר משלה — שם הקבוצה, המועדון ומספרי הסגל (מסך 4a),
               ולכן אין עטיפת Page כאן: שני hero על אותו מסך זה h1 כפול. */
            <Teams session={session} profile={profile} onNavigate={navigate} initialTab={teamsTab} onConsumeInitialTab={() => setTeamsTab(null)} />
          ) : view === 'send' ? (
            <Teams session={session} profile={profile} onNavigate={navigate} initialTab="tasks" />
          ) : view === 'dossier' && profile?.is_admin ? (
            <Page {...PAGE_META.dossier()}>
              <PlayerDossier
                session={session}
                profile={profile}
                initialRosterId={dossierRoster}
                onConsumeInitial={() => setDossierRoster(null)}
              />
            </Page>
          ) : view === 'admin' && profile?.is_admin ? (
            <Page {...PAGE_META.admin()}>
              <Admin session={session} profile={profile} />
            </Page>
          ) : view === 'messages' ? (
            <Page {...PAGE_META.messages(navigate)}>
              <Messages session={session} profile={profile} onNavigate={navigate} />
            </Page>
          ) : (
            /* הפרופיל היה המסך היחיד בלי באנר ובלי H1 — PAGE_META.profile
               היה מוגדר ולא בשימוש. עכשיו הוא באותה מעטפת כמו כל השאר,
               ו«עריכת פרטים» יושב בתוך הבאנר. */
            <Page
              {...PAGE_META.profile()}
              actions={(
                <button className="btn-soft" style={{ marginTop: 0 }} onClick={() => setEditing(true)}>
                  <Pencil size={15} aria-hidden="true" /> {L('עריכת פרטים', 'Edit details')}
                </button>
              )}
            >
            <div className="profile-page">
              {/* 10a — שני צדדים לאותו פרופיל: מה שאתה רואה, ומה שמאמן אחר רואה */}
              <div className="tabs pr-tabs">
                <button
                  type="button"
                  className={profileTab === 'private' ? 'tab active' : 'tab'}
                  onClick={() => setProfileTab('private')}
                >
                  {L('הפרופיל שלי', 'My profile')}
                </button>
                <button
                  type="button"
                  className={profileTab === 'public' ? 'tab active' : 'tab'}
                  onClick={() => setProfileTab('public')}
                >
                  <Eye size={15} aria-hidden="true" /> {L('כך רואים אותך', 'How others see you')}
                </button>
              </div>

              {profileTab === 'public' ? (
                <CoachProfile coach={profile} session={session} />
              ) : (
              <div className="profile-grid">
                {/* עמודה ראשית — כרטיס פרטי המאמן */}
                <section className="pr-card pr-main">
                  <div className="pr-head">
                    <Avatar
                      name={`${profile.first_name} ${profile.last_name}`}
                      url={profile.avatar_url}
                      size={72}
                    />
                    <div className="pr-head-text">
                      <h3>{profile.first_name} {profile.last_name}</h3>
                      <p className="muted">{profile.club} · {L('מאמן', 'Coach')}</p>
                      {profile.age_groups && profile.age_groups.length > 0 && (
                        <div className="chips pr-chips">
                          {profile.age_groups.map((g, i) => (
                            <span key={g} className={i === 0 ? 'chip selected static' : 'chip static'}>{g}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pr-rows">
                    <div className="pr-row">
                      <span className="pr-label">{t('profile.email')}</span>
                      <span className="pr-value" dir="ltr">{session.user.email}</span>
                    </div>
                    {profile.phone && (
                      <div className="pr-row">
                        <span className="pr-label">{t('profile.phone')}</span>
                        <span className="pr-value" dir="ltr">
                          {profile.phone}
                          <span className="phone-tag">
                            {profile.phone_public ? t('profile.shownToCoaches') : t('profile.private')}
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="pr-row">
                      <span className="pr-label">{t('profile.club')}</span>
                      <span className="pr-value">{profile.club}</span>
                    </div>
                  </div>
                </section>

                {/* עמודת צד — מספרים, רמה והגדרות */}
                <aside className="pr-side">
                  <MyStats session={session} />
                  <section className="pr-card pr-settings">
                    <h3 className="pr-card-title">{L('הגדרות', 'Settings')}</h3>
                    <div className="pr-row pr-setting-row">
                      <span className="pr-label"><Moon size={15} aria-hidden="true" /> {L('מצב כהה', 'Dark mode')}</span>
                      <ThemeToggle />
                    </div>
                    <div className="pr-row pr-setting-row">
                      <span className="pr-label"><Languages size={15} aria-hidden="true" /> {L('שפה', 'Language')}</span>
                      <LanguageToggle />
                    </div>
                    {/* שינוי סיסמה מתוך הפרופיל (TODO §13) */}
                    <ChangePassword />
                    <button type="button" className="pr-row pr-setting-row pr-signout" onClick={handleSignOut}>
                      <span className="pr-label"><LogOut size={15} aria-hidden="true" /> {t('action.signout')}</span>
                      <ChevronFwd size={16} />
                    </button>
                  </section>
                </aside>
              </div>
              )}

              {/* [15] התרגילים שיצרתי — במרוכז, לפי ה-handoff.
                  בצד הציבורי CoachProfile כבר מציג את התרגילים כפי שאחרים
                  רואים אותם, ולכן הרשימה הזו שייכת לצד הפרטי בלבד. */}
              {profileTab === 'private' && <MyDrills session={session} onNavigate={navigate} />}
            </div>
            </Page>
          )}
          </Suspense>
          </ChunkGate>
          </ErrorBoundary>
        </div>
      </main>

      {/* ניווט־הכיס (11.8) — הגלולה הצפה של מסמך העיצוב 3a במקום שורת
          הניווט התחתונה: ארבעה יעדים יומיים וכפתור מרכזי שפותח גיליון
          עם כל הפיצ׳רים (כולל מה שהיה רק במגירת הסרגל). */}
      <PocketNav
        activeId={editing ? null : view}
        onNavigate={async (id) => { if (!(await confirmLeave())) return; setEditing(false); setView(id); setDrawerOpen(false) }}
        label={L('ניווט תחתון', 'Bottom navigation')}
        items={POCKET_NAV.map((item) => ({
          id: item.id,
          label: t(item.key),
          Icon: item.Icon,
          badge: item.id === 'messages' ? unread : 0,
        }))}
        all={[...NAV, ...(profile?.is_admin ? [DOSSIER_NAV, ADMIN_NAV] : []), PROFILE_NAV].map((item) => ({
          id: item.id,
          label: t(item.key),
          Icon: item.Icon,
          badge: item.id === 'messages' ? unread : 0,
        }))}
        footer={
          <>
            {profile?.first_name && (
              <span className="pkn-who">
                <Avatar
                  name={`${profile.first_name} ${profile.last_name || ''}`}
                  url={profile.avatar_url}
                  size={34}
                />
                <span>
                  <span className="pkn-who-nm">{profile.first_name} {profile.last_name}</span>
                  <span className="pkn-who-sub">
                    {L('מאמן', 'Coach')}
                    {(profile.age_groups?.[0] || profile.club) ? ` · ${profile.age_groups?.[0] || profile.club}` : ''}
                  </span>
                </span>
              </span>
            )}
            <span className="pkn-tools">
              <LanguageToggle />
              <ThemeToggle />
              <button className="btn-ghost" onClick={handleSignOut} aria-label={t('action.signout')}>
                <LogOut size={15} aria-hidden="true" />
              </button>
            </span>
          </>
        }
      />
    </div>
  )
}
