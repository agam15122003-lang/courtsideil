import { useState, useEffect, useCallback } from 'react'
import {
  Home as HomeIcon, Dumbbell, MessageSquareHeart, MonitorPlay, Users, User,
  Menu, X, LogOut, Moon, Languages, Check, Clock, Star, CalendarDays,
  ShieldCheck, Hourglass, Trophy, ChevronLeft,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import Avatar from './Avatar'
import Notifications from './Notifications'
import ProfileForm from './ProfileForm'
import { requestJoinByCode, myMemberships } from './players'
import { safeUrl } from './constants'
import { getYouTubeId } from './youtube'

const coachName = (c) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || L('המאמן', 'Coach') : L('המאמן', 'Coach')

function timeAgo(ts) {
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (min < 60) return L(`לפני ${Math.max(1, min)} דק'`, `${Math.max(1, min)}m`)
  const hrs = Math.round(min / 60)
  if (hrs < 24) return L(`לפני ${hrs} שע'`, `${hrs}h`)
  return new Date(ts).toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })
}

// ---------- מסך הצטרפות לקבוצה (קוד מהמאמן) ----------
function JoinTeam({ session, onJoined }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState([])

  const load = useCallback(async () => {
    setPending(await myMemberships(session.user.id))
  }, [session.user.id])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    const res = await requestJoinByCode(session.user.id, code)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.reason === 'not-found'
        ? L('קוד לא נמצא — בדקו את הקוד עם המאמן', 'Code not found — check it with your coach')
        : L('הקוד קצר מדי', 'Code is too short'))
      return
    }
    setCode('')
    if (res.status === 'approved') { toast.success(L('כבר אושרת לקבוצה!', "You're already approved!")); onJoined() }
    else { toast.success(L('הבקשה נשלחה למאמן לאישור', 'Request sent to your coach')); load() }
  }

  const waiting = pending.filter((m) => m.status === 'pending')

  return (
    <div className="pl-join">
      <div className="pl-join-card">
        <span className="pl-join-ic"><ShieldCheck size={30} /></span>
        <h2>{L('מתחברים לקבוצה', 'Join your team')}</h2>
        <p className="muted">{L('הזינו את קוד ההצטרפות שקיבלתם מהמאמן.', 'Enter the join code your coach gave you.')}</p>
        <div className="pl-join-row">
          <input
            className="finder-input pl-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={L('קוד הקבוצה', 'Team code')}
            dir="ltr"
            aria-label={L('קוד הקבוצה', 'Team code')}
          />
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={submit} disabled={busy || code.length < 4}>
            {busy ? L('בודק...', 'Checking...') : L('הצטרפות', 'Join')}
          </button>
        </div>
        {waiting.length > 0 && (
          <div className="pl-waiting">
            <Hourglass size={16} />
            {L(`ממתין לאישור המאמן (${waiting[0].coach ? coachName(waiting[0].coach) : ''} · ${trTeam(waiting[0].team)})`,
               `Waiting for coach approval (${waiting[0].coach ? coachName(waiting[0].coach) : ''} · ${trTeam(waiting[0].team)})`)}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- כרטיס שיגור בודד ----------
function AssignmentCard({ a, doneSet, onToggleDone }) {
  const done = doneSet.has(a.id)
  const drill = a.drill
  const yt = a.video_url ? getYouTubeId(a.video_url) : null
  const title = drill?.title || a.title || (a.plan ? a.plan.name : L('תרגיל', 'Drill'))
  const cat = drill?.category
  const desc = drill?.description || a.note

  return (
    <article className={done ? 'pl-assign done' : 'pl-assign'}>
      <div className="pl-assign-main">
        <div className="pl-assign-head">
          <h3>{title}</h3>
          {cat && <span className="cat-badge" data-cat={cat}>{cat}</span>}
        </div>
        {desc && <p className="pl-assign-desc">{desc}</p>}
        <div className="pl-assign-meta">
          {drill?.duration_minutes && <span><Clock size={13} /> {drill.duration_minutes} {L("דק'", 'min')}</span>}
          {a.due_date && <span><CalendarDays size={13} /> {L('עד', 'by')} {new Date(a.due_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}</span>}
          <span className="pl-assign-from">{a.player_id ? L('נשלח אליך', 'Sent to you') : L('לכל הקבוצה', 'Whole team')} · {timeAgo(a.created_at)}</span>
        </div>
        {yt && (
          <a className="pl-assign-video" href={safeUrl(a.video_url) || '#'} target="_blank" rel="noopener noreferrer">
            <img src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" />
            <span className="pl-assign-play">▶</span>
          </a>
        )}
        {!yt && a.video_url && safeUrl(a.video_url) && (
          <a className="link-button" href={safeUrl(a.video_url)} target="_blank" rel="noopener noreferrer">{L('לצפייה בסרטון', 'Watch video')}</a>
        )}
      </div>
      <button
        className={done ? 'pl-done-btn is-done' : 'pl-done-btn'}
        onClick={() => onToggleDone(a.id, done)}
        aria-pressed={done}
      >
        <Check size={16} /> {done ? L('בוצע', 'Done') : L('סמן כבוצע', 'Mark done')}
      </button>
    </article>
  )
}

// ---------- מסך: התרגילים שלי ----------
function MyAssignments({ session, membership }) {
  const [items, setItems] = useState(null)
  const [doneSet, setDoneSet] = useState(new Set())

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('player_assignments')
      .select('*, drill:drills(id, title, category, description, duration_minutes), plan:training_plans(id, name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setItems(data || [])
    const { data: compl } = await supabase
      .from('assignment_completions')
      .select('assignment_id')
      .eq('player_id', session.user.id)
    setDoneSet(new Set((compl || []).map((c) => c.assignment_id)))
  }, [session.user.id])
  useEffect(() => { load() }, [load])

  const toggleDone = async (id, isDone) => {
    // עדכון אופטימי
    setDoneSet((cur) => { const n = new Set(cur); isDone ? n.delete(id) : n.add(id); return n })
    if (isDone) {
      await supabase.from('assignment_completions').delete().eq('assignment_id', id).eq('player_id', session.user.id)
    } else {
      await supabase.from('assignment_completions').upsert({ assignment_id: id, player_id: session.user.id })
      toast.success(L('כל הכבוד! 💪', 'Nice work! 💪'))
    }
  }

  if (items === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>
  const open = items.filter((a) => !doneSet.has(a.id))
  const done = items.filter((a) => doneSet.has(a.id))

  return (
    <div className="pl-screen">
      <h2 className="pl-h2">{L('התרגילים שלי', 'My drills')}</h2>
      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><Dumbbell size={26} /></span>
          <div className="empty-title">{L('עוד לא קיבלת תרגילים', 'No drills yet')}</div>
          <p className="muted small">{L('כשהמאמן ישלח לך תרגיל, הוא יופיע כאן.', 'When your coach sends you a drill, it shows up here.')}</p>
        </div>
      ) : (
        <>
          {open.length > 0 && <p className="pl-section-label">{L('לביצוע', 'To do')} · {open.length}</p>}
          {open.map((a) => <AssignmentCard key={a.id} a={a} doneSet={doneSet} onToggleDone={toggleDone} />)}
          {done.length > 0 && <p className="pl-section-label" style={{ marginTop: 18 }}>{L('בוצעו', 'Done')} · {done.length}</p>}
          {done.map((a) => <AssignmentCard key={a.id} a={a} doneSet={doneSet} onToggleDone={toggleDone} />)}
        </>
      )}
    </div>
  )
}

// ---------- מסך: המשוב שלי ----------
function MyFeedback({ session }) {
  const [items, setItems] = useState(null)
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('player_feedback')
        .select('*, coach:profiles!coach_id(first_name, last_name, avatar_url)')
        .eq('player_id', session.user.id)
        .order('created_at', { ascending: false })
      setItems(data || [])
    })()
  }, [session.user.id])

  if (items === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>
  return (
    <div className="pl-screen">
      <h2 className="pl-h2">{L('המשוב שלי', 'My feedback')}</h2>
      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><MessageSquareHeart size={26} /></span>
          <div className="empty-title">{L('עדיין אין משוב', 'No feedback yet')}</div>
          <p className="muted small">{L('אחרי אימון, המאמן יכול לכתוב לך כאן משוב אישי.', 'After practice, your coach can leave you personal feedback here.')}</p>
        </div>
      ) : (
        items.map((f) => (
          <article key={f.id} className="pl-fb">
            <Avatar name={coachName(f.coach)} url={f.coach?.avatar_url} size={38} />
            <div className="pl-fb-body">
              <div className="pl-fb-head">
                <strong>{coachName(f.coach)}</strong>
                <span className="muted small">{timeAgo(f.created_at)}</span>
              </div>
              {f.rating > 0 && (
                <div className="pl-fb-stars" aria-label={L(`${f.rating} מתוך 5`, `${f.rating} of 5`)}>
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={15} fill={n <= f.rating ? 'currentColor' : 'none'} />)}
                </div>
              )}
              <p className="pl-fb-text">{f.content}</p>
            </div>
          </article>
        ))
      )}
    </div>
  )
}

// ---------- מסך: הקבוצה שלי ----------
function MyTeam({ session, membership }) {
  const [teammates, setTeammates] = useState([])
  const [next, setNext] = useState(null)

  useEffect(() => {
    if (!membership) return
    ;(async () => {
      const { data: mates } = await supabase
        .from('team_players')
        .select('id, name, number, position')
        .eq('coach_id', membership.coach_id)
        .eq('team', membership.team)
        .order('number')
      setTeammates(mates || [])
      const today = new Date().toISOString().slice(0, 10)
      const { data: sched } = await supabase
        .from('schedule_entries')
        .select('*')
        .eq('created_by', membership.coach_id)
        .eq('team', membership.team)
        .gte('date', today)
        .order('date').order('start_time')
        .limit(1)
      setNext(sched && sched[0] ? sched[0] : null)
    })()
  }, [membership])

  if (!membership) return null
  return (
    <div className="pl-screen">
      <h2 className="pl-h2">{L('הקבוצה שלי', 'My team')}</h2>
      <div className="pl-team-hero">
        <span className="pl-team-badge"><Trophy size={20} /></span>
        <div>
          <strong>{trTeam(membership.team)}</strong>
          <span className="muted small">{L('מאמן: ', 'Coach: ')}{coachName(membership.coach)}{membership.coach?.club ? ` · ${membership.coach.club}` : ''}</span>
        </div>
      </div>

      {next && (
        <div className="pl-next">
          <span className="pl-next-label"><CalendarDays size={15} /> {L('האימון הבא', 'Next practice')}</span>
          <strong>{next.title || trTeam(membership.team)}</strong>
          <span className="muted small">
            {new Date(next.date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })}
            {next.start_time ? ` · ${next.start_time}` : ''}{next.location ? ` · ${next.location}` : ''}
          </span>
        </div>
      )}

      <p className="pl-section-label">{L('חברי הקבוצה', 'Teammates')} · {teammates.length}</p>
      {teammates.length === 0 ? (
        <p className="muted small">{L('הסגל יופיע כאן ברגע שהמאמן יוסיף שחקנים.', 'The roster shows up once your coach adds players.')}</p>
      ) : (
        <ul className="pl-mates">
          {teammates.map((p) => (
            <li key={p.id} className="pl-mate">
              {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={32} />}
              <span className="pl-mate-name">{p.name}</span>
              {p.position && <span className="muted small">{p.position}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- מסך: בית ----------
function PlayerHome({ session, profile, membership, setView }) {
  const [counts, setCounts] = useState({ open: null, fb: null })
  useEffect(() => {
    ;(async () => {
      const [{ data: assigns }, { data: compl }, { count: fbCount }] = await Promise.all([
        supabase.from('player_assignments').select('id'),
        supabase.from('assignment_completions').select('assignment_id').eq('player_id', session.user.id),
        supabase.from('player_feedback').select('id', { count: 'exact', head: true }).eq('player_id', session.user.id),
      ])
      const doneIds = new Set((compl || []).map((c) => c.assignment_id))
      const open = (assigns || []).filter((a) => !doneIds.has(a.id)).length
      setCounts({ open, fb: fbCount || 0 })
    })()
  }, [session.user.id])

  const hour = new Date().getHours()
  const greet = hour < 12 ? L('בוקר טוב', 'Good morning') : hour < 18 ? L('צהריים טובים', 'Good afternoon') : L('ערב טוב', 'Good evening')

  return (
    <div className="pl-screen">
      <header className="pl-hero">
        <span className="pl-hero-court" aria-hidden="true">🏀</span>
        <span className="pl-hero-date">{new Date().toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })}</span>
        <h1>{greet}, <span className="hero-title-accent">{profile.first_name}</span>!</h1>
        {membership && <p>{trTeam(membership.team)} · {coachName(membership.coach)}</p>}
      </header>

      <div className="pl-tiles">
        <button className="pl-tile" onClick={() => setView('drills')}>
          <span className="pl-tile-ic blue"><Dumbbell size={20} /></span>
          <span className="pl-tile-num">{counts.open ?? '—'}</span>
          <span className="pl-tile-label">{L('תרגילים לביצוע', 'Drills to do')}</span>
        </button>
        <button className="pl-tile" onClick={() => setView('feedback')}>
          <span className="pl-tile-ic green"><MessageSquareHeart size={20} /></span>
          <span className="pl-tile-num">{counts.fb ?? '—'}</span>
          <span className="pl-tile-label">{L('משובים', 'Feedback')}</span>
        </button>
        <button className="pl-tile" onClick={() => setView('team')}>
          <span className="pl-tile-ic orange"><Users size={20} /></span>
          <span className="pl-tile-num">{membership ? trTeam(membership.team) : '—'}</span>
          <span className="pl-tile-label">{L('הקבוצה שלי', 'My team')}</span>
        </button>
      </div>

      <button className="pl-cta" onClick={() => setView('drills')}>
        <Dumbbell size={18} /> {L('למסך התרגילים שלי', 'Open my drills')} <ChevronLeft size={16} />
      </button>
    </div>
  )
}

// ---------- מסך: וידאו ----------
function PlayerVideos({ session }) {
  const [videos, setVideos] = useState(null)
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('drill_videos')
        .select('id, title, category, url, note')
        .order('created_at', { ascending: false })
        .limit(60)
      setVideos(data || [])
    })()
  }, [])
  if (videos === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>
  return (
    <div className="pl-screen">
      <h2 className="pl-h2">{L('סרטוני תרגול', 'Training videos')}</h2>
      {videos.length === 0 ? (
        <p className="muted small">{L('אין סרטונים כרגע.', 'No videos right now.')}</p>
      ) : (
        <div className="pl-vid-grid">
          {videos.map((v) => {
            const yt = getYouTubeId(v.url)
            return (
              <a key={v.id} className="pl-vid" href={safeUrl(v.url) || '#'} target="_blank" rel="noopener noreferrer">
                <span className="pl-vid-thumb" style={yt ? { backgroundImage: `url("https://img.youtube.com/vi/${yt}/hqdefault.jpg")` } : undefined}>
                  <span className="pl-vid-play">▶</span>
                </span>
                <span className="pl-vid-body">
                  <span className="pl-vid-title">{v.title}</span>
                  {v.category && <span className="pl-vid-cat">{v.category}</span>}
                </span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// האפליקציה של השחקן — מעטפת + ניווט
// ============================================================
const PLAYER_NAV = [
  { id: 'home', label: ['בית', 'Home'], Icon: HomeIcon },
  { id: 'drills', label: ['התרגילים שלי', 'My drills'], Icon: Dumbbell },
  { id: 'feedback', label: ['משוב', 'Feedback'], Icon: MessageSquareHeart },
  { id: 'videos', label: ['סרטונים', 'Videos'], Icon: MonitorPlay },
  { id: 'team', label: ['הקבוצה שלי', 'My team'], Icon: Users },
  { id: 'profile', label: ['פרופיל', 'Profile'], Icon: User },
]
const PLAYER_BOTTOM = ['home', 'drills', 'feedback', 'team', 'profile']

export default function PlayerDashboard({ session, profile, onProfileReload }) {
  const [view, setView] = useState('home')
  const [drawer, setDrawer] = useState(false)
  const [editing, setEditing] = useState(false)
  const [memberships, setMemberships] = useState(null)

  const loadMemberships = useCallback(async () => {
    setMemberships(await myMemberships(session.user.id))
  }, [session.user.id])
  useEffect(() => { loadMemberships() }, [loadMemberships])

  useEffect(() => { window.scrollTo({ top: 0 }); setDrawer(false) }, [view])

  const approved = (memberships || []).filter((m) => m.status === 'approved')
  const membership = approved[0] || null
  const signOut = () => supabase.auth.signOut()

  // עדיין טוען חברויות
  if (memberships === null) {
    return <div className="center-screen"><div className="app-loading"><div className="loader" /></div></div>
  }

  // אין קבוצה מאושרת → מסך הצטרפות (אלא אם רוצים לערוך פרופיל)
  const needsTeam = approved.length === 0

  const nav = PLAYER_NAV
  const label = (item) => L(item.label[0], item.label[1])

  const renderView = () => {
    if (editing) {
      return (
        <ProfileForm
          session={session}
          profile={profile}
          onSaved={() => { setEditing(false); onProfileReload?.() }}
          onCancel={() => setEditing(false)}
        />
      )
    }
    if (needsTeam && view !== 'profile') {
      return <JoinTeam session={session} onJoined={loadMemberships} />
    }
    switch (view) {
      case 'drills': return <MyAssignments session={session} membership={membership} />
      case 'feedback': return <MyFeedback session={session} />
      case 'videos': return <PlayerVideos session={session} />
      case 'team': return <MyTeam session={session} membership={membership} />
      case 'profile': return (
        <div className="pl-screen">
          <div className="pl-profile-head">
            <Avatar name={`${profile.first_name} ${profile.last_name}`} url={profile.avatar_url} size={64} />
            <div>
              <h2 style={{ margin: 0 }}>{profile.first_name} {profile.last_name}</h2>
              <span className="muted small">
                {L('שחקן', 'Player')}
                {profile.position ? ` · ${profile.position}` : ''}
                {profile.birth_year ? ` · ${L('שנתון', 'b.')} ${profile.birth_year}` : ''}
              </span>
            </div>
          </div>
          <button className="btn-soft" onClick={() => setEditing(true)}>{L('עריכת פרטים', 'Edit details')}</button>

          <p className="pl-section-label" style={{ marginTop: 20 }}>{L('הקבוצות שלי', 'My teams')}</p>
          {memberships.length === 0 ? (
            <button className="btn-primary" onClick={() => { setView('home') }}>{L('הצטרפות לקבוצה', 'Join a team')}</button>
          ) : (
            <ul className="pl-memberships">
              {memberships.map((m) => (
                <li key={m.id} className={`pl-memb st-${m.status}`}>
                  <span className="pl-memb-team">{trTeam(m.team)}</span>
                  <span className="muted small">{coachName(m.coach)}</span>
                  <span className="pl-memb-status">
                    {m.status === 'approved' ? L('מאושר ✓', 'Approved ✓') : m.status === 'pending' ? L('ממתין', 'Pending') : L('נדחה', 'Declined')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button className="btn-soft" style={{ marginTop: 12 }} onClick={() => { setView('home') }}>
            {L('הצטרפות לקבוצה נוספת', 'Join another team')}
          </button>
        </div>
      )
      default: return <PlayerHome session={session} profile={profile} membership={membership} setView={setView} />
    }
  }

  return (
    <div className="layout pl-layout">
      <header className="mobile-topbar">
        <button className="drawer-toggle" onClick={() => setDrawer(true)} aria-label={L('תפריט', 'Menu')}><Menu size={22} /></button>
        <div className="sidebar-brand">
          <svg viewBox="0 0 100 100" width="26" height="26"><circle cx="42" cy="55" r="22" fill="#E8763A" /><circle cx="42" cy="55" r="9" fill="#fff" /><path d="M60 45 L82 38 L82 52 L62 58 Z" fill="#E8763A" /><circle cx="78" cy="30" r="6" fill="#E8763A" /></svg>
          <span>CourtSide</span>
        </div>
        <div className="topbar-actions">
          <Notifications session={session} onNavigate={(v) => setView(v === 'community' || v === 'messages' ? 'home' : 'drills')} />
          <LanguageToggle /><ThemeToggle />
        </div>
      </header>

      {drawer && <div className="drawer-overlay" onClick={() => setDrawer(false)} />}
      <aside className={drawer ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-brand">
          <svg viewBox="0 0 100 100" width="30" height="30"><circle cx="42" cy="55" r="22" fill="#E8763A" /><circle cx="42" cy="55" r="9" fill="#fff" /><path d="M60 45 L82 38 L82 52 L62 58 Z" fill="#E8763A" /><circle cx="78" cy="30" r="6" fill="#E8763A" /></svg>
          <span>CourtSide</span>
          <span className="sidebar-bell"><Notifications session={session} onNavigate={() => setView('drills')} /></span>
          <button className="drawer-close" onClick={() => setDrawer(false)} aria-label={L('סגור', 'Close')}><X size={20} /></button>
        </div>
        <span className="pl-role-chip"><Dumbbell size={13} /> {L('שחקן', 'Player')}</span>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <button key={item.id} className={view === item.id && !editing ? 'nav-item active' : 'nav-item'} onClick={() => { setEditing(false); setView(item.id) }}>
              <item.Icon size={18} /> {label(item)}
            </button>
          ))}
        </nav>
        <button className="sidebar-user" onClick={() => { setEditing(false); setView('profile') }}>
          <Avatar name={`${profile.first_name} ${profile.last_name || ''}`} url={profile.avatar_url} size={38} />
          <span className="sidebar-user-info">
            <strong>{profile.first_name} {profile.last_name}</strong>
            <span>{membership ? trTeam(membership.team) : L('שחקן', 'Player')}</span>
          </span>
        </button>
        <div className="sidebar-footer">
          <LanguageToggle /><ThemeToggle />
          <button className="btn-ghost" onClick={signOut}>{L('התנתקות', 'Sign out')}</button>
        </div>
      </aside>

      <main className="main-content" id="main">
        <div className="main-inner" key={editing ? 'edit' : view}>
          {renderView()}
        </div>
      </main>

      <nav className="bottom-nav" aria-label={L('ניווט', 'Navigation')}>
        {PLAYER_BOTTOM.map((id) => {
          const item = nav.find((n) => n.id === id)
          return (
            <button key={id} className={view === id && !editing ? 'bn-item active' : 'bn-item'} onClick={() => { setEditing(false); setView(id) }}>
              <span className="bn-ic"><item.Icon size={20} /></span>
              {label(item)}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
