import { useState, useEffect, lazy, Suspense } from 'react'
import { supabase } from './supabaseClient'
import ProfileForm from './ProfileForm'
import MyStats from './MyStats'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import Home from './Home'
import Avatar from './Avatar'
import QuoteStrip from './QuoteStrip'
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
const VideoEditor = lazy(() => import('./VideoEditor'))
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
  Clapperboard,
  Shield,
  ShieldCheck,
  Menu,
  X,
  Pencil,
  Moon,
  Languages,
  LogOut,
  ChevronLeft,
} from 'lucide-react'

// "קהילה תחילה" — הקהילה, המאמנים וההודעות למעלה; כלי העבודה אחריהם
const NAV = [
  { id: 'home', key: 'nav.home', Icon: HomeIcon },
  { id: 'community', key: 'nav.community', Icon: MessagesSquare },
  { id: 'finder', key: 'nav.finder', Icon: Users },
  { id: 'messages', key: 'nav.messages', Icon: MessageSquare },
  { id: 'drills', key: 'nav.drills', Icon: Dumbbell },
  { id: 'plans', key: 'nav.plans', Icon: ClipboardList },
  { id: 'teams', key: 'nav.teams', Icon: Shield },
  { id: 'schedule', key: 'nav.schedule', Icon: CalendarDays },
  { id: 'media', key: 'nav.media', Icon: MonitorPlay },
  { id: 'video', key: 'nav.video', Icon: Clapperboard },
  { id: 'profile', key: 'nav.profile', Icon: User },
]
const ADMIN_NAV = { id: 'admin', key: 'nav.admin', Icon: ShieldCheck }

export default function Dashboard({ session }) {
  const { t } = useLang()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [view, setView] = useState('home')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [initialCoach, setInitialCoach] = useState(null) // מאמן לפתוח ישירות (למשל מ"מאמן השבוע")
  // עורך הווידאו נשאר חי ברקע אחרי הביקור הראשון — יציאה מהעמוד לא מוחקת את העבודה
  const [videoVisited, setVideoVisited] = useState(false)
  useEffect(() => { if (view === 'video') setVideoVisited(true) }, [view])

  const [loadError, setLoadError] = useState(false)

  async function loadProfile() {
    setLoading(true)
    setLoadError(false)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const isComplete =
    profile && profile.first_name && profile.last_name && profile.club
  const showForm = editing || (!loading && !isComplete)

  return (
    <div className="layout">
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
          <svg viewBox="0 0 100 100" width="26" height="26">
            <circle cx="42" cy="55" r="22" fill="#E8763A" />
            <circle cx="42" cy="55" r="9" fill="#fff" />
            <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="#E8763A" />
            <circle cx="78" cy="30" r="6" fill="#E8763A" />
          </svg>
          <span>CourtSide</span>
        </div>
        <div className="topbar-actions">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}

      <aside className={drawerOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-brand">
          <svg viewBox="0 0 100 100" width="30" height="30">
            <circle cx="42" cy="55" r="22" fill="#E8763A" />
            <circle cx="42" cy="55" r="9" fill="#fff" />
            <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="#E8763A" />
            <circle cx="78" cy="30" r="6" fill="#E8763A" />
          </svg>
          <span>CourtSide</span>
          <button
            className="drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label={t('common.closeMenu')}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
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
          {!loading && !showForm && view === 'home' && <QuoteStrip />}
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
            <ProfileForm
              session={session}
              profile={profile}
              onSaved={() => {
                setEditing(false)
                loadProfile()
              }}
              onCancel={isComplete ? () => setEditing(false) : undefined}
            />
          ) : view === 'home' ? (
            <Home
              profile={profile}
              onNavigate={setView}
              onOpenCoach={(coach) => { setInitialCoach(coach); setView('finder') }}
            />
          ) : view === 'community' ? (
            <Community session={session} profile={profile} />
          ) : view === 'finder' ? (
            <CoachFinder session={session} initialCoach={initialCoach} onConsumeInitial={() => setInitialCoach(null)} />
          ) : view === 'drills' ? (
            <DrillLibrary session={session} />
          ) : view === 'plans' ? (
            <TrainingPlans session={session} />
          ) : view === 'schedule' ? (
            <Schedule session={session} />
          ) : view === 'teams' ? (
            <Teams session={session} profile={profile} onNavigate={setView} />
          ) : view === 'admin' && profile?.is_admin ? (
            <Admin session={session} profile={profile} />
          ) : view === 'media' ? (
            <Media session={session} profile={profile} />
          ) : view === 'video' ? (
            null /* מרונדר בנפרד למטה כדי לשמור על מצב העריכה */
          ) : view === 'messages' ? (
            <Messages session={session} onNavigate={setView} />
          ) : (
            <div className="profile-page">
              <header className="page-header">
                <div className="page-header-text">
                  <div className="welcome-badge">{L('החשבון שלי', 'My account')}</div>
                  <h2>{L('הפרופיל שלי', 'My profile')}</h2>
                </div>
                <div className="page-header-actions">
                  <button className="btn-soft" onClick={() => setEditing(true)}>
                    <Pencil size={15} aria-hidden="true" /> {L('עריכת פרטים', 'Edit details')}
                  </button>
                </div>
              </header>

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
                      <ChevronLeft size={16} aria-hidden="true" />
                    </button>
                  </section>
                </aside>
              </div>
            </div>
          )}
          </Suspense>
        </div>
        {/* עורך הווידאו — מחוץ לעטיפה עם key={view}, כדי שמעבר עמוד לא ימחק את העריכה */}
        {videoVisited && !loading && !showForm && (
          <div className="main-inner" style={{ display: view === 'video' ? undefined : 'none' }}>
            <Suspense
              fallback={
                <div className="app-loading" style={{ padding: '48px 0' }}>
                  <div className="loader" />
                </div>
              }
            >
              <VideoEditor active={view === 'video'} />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  )
}
