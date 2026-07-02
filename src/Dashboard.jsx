import { useState, useEffect, lazy, Suspense } from 'react'
import { supabase } from './supabaseClient'
import ProfileForm from './ProfileForm'
import MyStats from './MyStats'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import Home from './Home'
import Avatar from './Avatar'
import QuoteStrip from './QuoteStrip'
import { useLang } from './i18n'

// מסכים כבדים נטענים רק בכניסה אליהם (code-splitting) — טעינה ראשונית מהירה
const CoachFinder = lazy(() => import('./CoachFinder'))
const DrillLibrary = lazy(() => import('./DrillLibrary'))
const TrainingPlans = lazy(() => import('./TrainingPlans'))
const Messages = lazy(() => import('./Messages'))
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
  CalendarDays,
  MonitorPlay,
  Shield,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react'

const NAV = [
  { id: 'home', key: 'nav.home', Icon: HomeIcon },
  { id: 'profile', key: 'nav.profile', Icon: User },
  { id: 'teams', key: 'nav.teams', Icon: Shield },
  { id: 'finder', key: 'nav.finder', Icon: Users },
  { id: 'drills', key: 'nav.drills', Icon: Dumbbell },
  { id: 'plans', key: 'nav.plans', Icon: ClipboardList },
  { id: 'schedule', key: 'nav.schedule', Icon: CalendarDays },
  { id: 'media', key: 'nav.media', Icon: MonitorPlay },
  { id: 'messages', key: 'nav.messages', Icon: MessageSquare },
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

  async function loadProfile() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (error) {
      console.error('שגיאה בטעינת הפרופיל:', error.message)
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // גלילה לראש העמוד וסגירת המגירה בכל מעבר מסך
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setDrawerOpen(false)
  }, [view])

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
            <circle cx="42" cy="55" r="22" fill="var(--orange-500, #E8763A)" />
            <circle cx="42" cy="55" r="9" fill="#fff" />
            <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="var(--orange-500, #E8763A)" />
            <circle cx="78" cy="30" r="6" fill="var(--orange-500, #E8763A)" />
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
            <circle cx="42" cy="55" r="22" fill="var(--orange-500, #E8763A)" />
            <circle cx="42" cy="55" r="9" fill="#fff" />
            <path d="M60 45 L82 38 L82 52 L62 58 Z" fill="var(--orange-500, #E8763A)" />
            <circle cx="78" cy="30" r="6" fill="var(--orange-500, #E8763A)" />
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
          {!loading && !showForm && <QuoteStrip />}
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
          ) : view === 'finder' ? (
            <CoachFinder session={session} initialCoach={initialCoach} onConsumeInitial={() => setInitialCoach(null)} />
          ) : view === 'drills' ? (
            <DrillLibrary session={session} />
          ) : view === 'plans' ? (
            <TrainingPlans session={session} />
          ) : view === 'schedule' ? (
            <Schedule session={session} />
          ) : view === 'teams' ? (
            <Teams session={session} profile={profile} />
          ) : view === 'admin' && profile?.is_admin ? (
            <Admin session={session} profile={profile} />
          ) : view === 'media' ? (
            <Media session={session} profile={profile} />
          ) : view === 'messages' ? (
            <Messages session={session} />
          ) : (
            <div className="welcome-card">
              <div className="welcome-badge">{t('profile.myProfile')}</div>
              <div className="profile-head">
                <Avatar
                  name={`${profile.first_name} ${profile.last_name}`}
                  url={profile.avatar_url}
                  size={64}
                />
                <h2 style={{ margin: 0 }}>
                  {profile.first_name} {profile.last_name}
                </h2>
              </div>

              <div className="profile-details">
                <div className="detail-row">
                  <span className="detail-label">{t('profile.club')}</span>
                  <span className="detail-value">{profile.club}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">{t('profile.email')}</span>
                  <span className="detail-value" dir="ltr">
                    {session.user.email}
                  </span>
                </div>
                {profile.phone && (
                  <div className="detail-row">
                    <span className="detail-label">{t('profile.phone')}</span>
                    <span className="detail-value" dir="ltr">
                      {profile.phone}
                      <span className="phone-tag">
                        {profile.phone_public
                          ? t('profile.shownToCoaches')
                          : t('profile.private')}
                      </span>
                    </span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-label">{t('profile.groups')}</span>
                  <span className="detail-value">
                    {profile.age_groups && profile.age_groups.length > 0 ? (
                      <span className="chips">
                        {profile.age_groups.map((g) => (
                          <span key={g} className="chip selected static">
                            {g}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="muted">{t('profile.notSpecified')}</span>
                    )}
                  </span>
                </div>
              </div>

              <button
                className="btn-ghost"
                style={{ marginTop: 24 }}
                onClick={() => setEditing(true)}
              >
                {t('action.editProfile')}
              </button>

              <MyStats session={session} />
            </div>
          )}
          </Suspense>
        </div>
      </main>
    </div>
  )
}
