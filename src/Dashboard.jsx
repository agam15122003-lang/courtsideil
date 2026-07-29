import { useState, useEffect, useRef, lazy, Suspense } from 'react'
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
import PlayerDashboard from './PlayerDashboard'
import ErrorBoundary from './ErrorBoundary'
import useNavMarker from './useNavMarker'
import { useLang, L } from './i18n'

// מסכים כבדים נטענים רק בכניסה אליהם (code-splitting) — טעינה ראשונית מהירה
const CoachFinder = lazy(() => import('./CoachFinder'))
const DrillLibrary = lazy(() => import('./DrillLibrary'))
const TrainingPlans = lazy(() => import('./TrainingPlans'))
const Messages = lazy(() => import('./Messages'))
const Community = lazy(() => import('./Community'))
const Schedule = lazy(() => import('./Schedule'))
const Teams = lazy(() => import('./Teams'))
const Admin = lazy(() => import('./Admin'))
const Media = lazy(() => import('./Media'))
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
  Send,
  Shield,
  ShieldCheck,
  Menu,
  X,
  Pencil,
  Moon,
  Languages,
  LogOut,
  Smartphone,
  Plus,
} from 'lucide-react'
import { ChevronFwd } from './DirIcon'
import Logo from './Logo'
import Page from './Page'

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
const BOTTOM_NAV = [
  { id: 'home', key: 'nav.home', Icon: HomeIcon },
  { id: 'community', key: 'nav.community', Icon: MessagesSquare },
  { id: 'work', key: 'nav.workShort', Icon: ClipboardList },
  { id: 'teams', key: 'nav.teamsShort', Icon: Shield },
  { id: 'messages', key: 'nav.messages', Icon: MessageSquare },
]
const ADMIN_NAV = { id: 'admin', key: 'nav.admin', Icon: ShieldCheck }

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
      : L('בונים מערך, מסדרים תרגילים לפי חלקים, ושולחים לשחקנים.', 'Build a session, order the drills by part, and send it to your players.'),
  }),
  schedule: () => ({
    eyebrow: L('העבודה שלי', 'My work'), eyebrowIcon: CalendarDays,
    title: L('הלו״ז שלי', 'My schedule'),
    subtitle: L('כל האימונים, המשחקים והפגישות שלך בשבוע אחד.', 'Every practice, game and meeting of yours in one week.'),
  }),
  teams: () => ({
    eyebrow: L('הקבוצות שלי', 'My teams'), eyebrowIcon: Shield,
    title: L('ניהול קבוצה', 'Team management'),
    subtitle: L('סגל, נוכחות, מטרות, משחקים וטבלת הליגה — לכל קבוצה שאתה מאמן.', 'Roster, attendance, goals, games and the league table — for every team you coach.'),
    size: 'lg',
  }),
  admin: () => ({
    eyebrow: L('מערכת', 'System'), eyebrowIcon: ShieldCheck,
    title: L('ניהול', 'Administration'),
    subtitle: L('מאמנים, דיווחים ומצב המערכת.', 'Coaches, reports and system status.'),
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
  const [workTab, setWorkTab] = useState('plans') // 'plans' | 'drills' במסך «אימונים ותרגילים»
  // מובייל: ההירו של הבית מקוצר והציטוט יורד ממנו — ולכן פס הציטוט העליון
  // חוזר גם בבית. מאזין ל-matchMedia ולא ל-resize (אפס עבודה בין מעברים).
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const onChange = (e) => setIsNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  // עורך הווידאו נשאר חי ברקע אחרי הביקור הראשון — יציאה מהעמוד לא מוחקת את העבודה

  const [loadError, setLoadError] = useState(false)

  // ניווט עם יעדי-עומק: 'community-chats' פותח את הקהילה על טאב הצ'אטים,
  // 'finder-games' פותח את המאתר על לוח משחקי האימון
  const navigate = (id) => {
    if (id === 'community-chats') { setCommunityTab('chats'); setView('community'); return }
    if (id === 'finder-games') { setFinderTab('games'); setView('finder'); return }
    // מהלו"ז אל ימי האימון הקבועים — עד היום זו הייתה הוראה בטקסט בלי קישור
    if (id === 'teams-practices') { setTeamsTab('practices'); setView('teams'); return }
    // «למחברת המלאה» / «תוכנית האימון» הבטיחו תוכנית מסוימת ונחתו על הרשימה
    if (typeof id === 'string' && id.startsWith('plans:')) { setPlanToOpen(id.slice(6)); setWorkTab('plans'); setView('work'); return }
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
    const mq = window.matchMedia('(max-width: 768px)')
    const apply = () => { el.inert = mq.matches && !drawerOpen }
    apply()
    mq.addEventListener('change', apply)
    return () => { mq.removeEventListener('change', apply); el.inert = false }
  }, [drawerOpen])

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

  // שחקן מלא → האפליקציה של השחקן (מעטפת נפרדת)
  if (!loading && !showForm && isPlayer) {
    return <PlayerDashboard session={session} profile={profile} onProfileReload={loadProfile} />
  }

  return (
    <div className="layout" style={{ '--bn-count': BOTTOM_NAV.length }}>
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
          {(profile?.is_admin ? [...NAV, ADMIN_NAV] : NAV).map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => {
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
            onClick={() => { setEditing(false); setView('profile'); setDrawerOpen(false) }}
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
        {/* key={view} — מרנדר מחדש בכל החלפת מסך כדי שאנימציית הכניסה תתנגן */}
        <div className="main-inner" key={showForm ? 'profile-form' : view}>
          {/* פס הציטוט — חלק מה-chrome הגלובלי, בכל עמוד (handoff §Global-2).
              חוץ מדף הבית: שם הציטוט יושב בתוך ההירו ומסונכרן להחלפת התמונה,
              והצגתו פעמיים באותו מסך נראית כמו תקלה. */}
          {/* בבית הציטוט יושב בתוך ההירו — חוץ ממובייל, שם ההירו מקוצר
              והציטוט חוזר לפס העליון (index.css: .home-hero-quote מוסתר). */}
          {!loading && !showForm && (view !== 'home' || isNarrow) && <QuoteStrip />}
          {/* גדר בטיחות: קריסה במסך בודד לא מוחקת את כל האפליקציה.
              ה-key על .main-inner גורם ל-boundary להתאפס בכל מעבר מסך. */}
          <ErrorBoundary screen={showForm ? 'coach:profile-form' : `coach:${view}`}>
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
                <button className={workTab === 'drills' ? 'tab active' : 'tab'} onClick={() => setWorkTab('drills')}>
                  <Dumbbell size={15} aria-hidden="true" /> {L('בניית תרגיל', 'Build a drill')}
                </button>
              </div>
              {workTab === 'drills'
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
          ) : view === 'teams' ? (
            /* לקבוצה יש באנר משלה — שם הקבוצה, המועדון ומספרי הסגל (מסך 4a),
               ולכן אין עטיפת Page כאן: שני hero על אותו מסך זה h1 כפול. */
            <Teams session={session} profile={profile} onNavigate={navigate} initialTab={teamsTab} onConsumeInitialTab={() => setTeamsTab(null)} />
          ) : view === 'send' ? (
            <Teams session={session} profile={profile} onNavigate={navigate} initialTab="tasks" />
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
                    <button type="button" className="pr-row pr-setting-row pr-signout" onClick={handleSignOut}>
                      <span className="pr-label"><LogOut size={15} aria-hidden="true" /> {t('action.signout')}</span>
                      <ChevronFwd size={16} />
                    </button>
                  </section>
                </aside>
              </div>

              {/* [15] התרגילים שיצרתי — במרוכז, לפי ה-handoff */}
              <MyDrills session={session} onNavigate={navigate} />
            </div>
            </Page>
          )}
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {/* תפריט תחתון — מובייל בלבד. שבעה יעדים לפי מוקאפ מסמך המסירה.
          התווית עטופה ב-.bn-lbl כדי שתוכל להיעלם במסכים צרים; aria-label על
          הכפתור שומר על השם הנגיש גם כשהיא מוסתרת. */}
      <nav className="bottom-nav" aria-label={L('ניווט תחתון', 'Bottom navigation')}>
        {BOTTOM_NAV.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? 'bn-item active' : 'bn-item'}
            aria-label={t(item.key)}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => { setEditing(false); setView(item.id); setDrawerOpen(false) }}
          >
            <span className="bn-ic">
              <item.Icon size={20} />
              {item.id === 'messages' && unread > 0 && (
                <span className="bn-badge" dir="ltr">{unread > 9 ? '9+' : unread}</span>
              )}
            </span>
            <span className="bn-lbl">{t(item.key)}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
