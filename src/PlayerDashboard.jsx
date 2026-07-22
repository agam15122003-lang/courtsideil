import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Home as HomeIcon, Dumbbell, MessageSquareHeart, MonitorPlay, Users, User,
  Menu, X, Check, Clock, Star, CalendarDays, Users2, MessageSquare, MessagesSquare, Send,
  ShieldCheck, Hourglass, Trophy, ChevronLeft, Flame, Lock, Newspaper,
  Sparkles, Zap, Crown, CalendarCheck, Timer, Target, Play, ClipboardList,
  MapPin, Volleyball, ArrowLeft, Eye,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import Avatar from './Avatar'
import Notifications from './Notifications'
import ProfileForm from './ProfileForm'
import PlayerCommunity from './PlayerCommunity'
import CoachChat from './CoachChat'
import TeamChat from './TeamChat'
import { MyGoals } from './PlayerGoals'
import PlayerTimeline from './PlayerTimeline'
import { requestJoinByCode, myMemberships } from './players'
import { computeStreak, playerProgress } from './gamify'
import { expandSlots } from './sessionId'
import { safeUrl, COACHING_QUOTES, NEWS_SOURCES, NEWS_FALLBACK_IMAGES, NEWS_CACHE_KEY, VIDEO_CATEGORIES } from './constants'
import { getYouTubeId } from './youtube'

const WEEKLY_TARGET = 4 // תרגילים ליעד השבועי

const coachName = (c) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || L('המאמן', 'Coach') : L('המאמן', 'Coach')

function timeAgo(ts) {
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (min < 60) return L(`לפני ${Math.max(1, min)} דק'`, `${Math.max(1, min)}m`)
  const hrs = Math.round(min / 60)
  if (hrs < 24) return L(`לפני ${hrs} שע'`, `${hrs}h`)
  return new Date(ts).toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })
}

function withinDays(ts, days) {
  return (Date.now() - new Date(ts).getTime()) <= days * 86400000
}

// כותרת מסך אחידה ומעוצבת לשחקן — אייקון צבעוני + כותרת + תת-כותרת (+ סיכום אופציונלי מימין)
function PlHead({ Icon, tone = 'accent', title, subtitle, children }) {
  return (
    <header className={`pl-head tone-${tone}`}>
      <span className="pl-head-ic"><Icon size={22} /></span>
      <div className="pl-head-txt">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}


// ---------- מסך/כרטיס הצטרפות לקבוצה (קוד מהמאמן) ----------
function JoinTeam({ session, onJoined, compact }) {
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
    <div className={compact ? 'pl-join pl-join-compact' : 'pl-join'}>
      <div className="pl-join-card">
        <span className="pl-join-ic"><ShieldCheck size={compact ? 24 : 30} /></span>
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

// ---------- מסך נעול (פיצ'ר שדורש קבוצה) ----------
function LockedFeature({ session, title, desc, onJoined }) {
  return (
    <div className="pl-screen">
      <h2 className="pl-h2">{title}</h2>
      <div className="pl-locked">
        <span className="pl-locked-ic"><Lock size={22} /></span>
        <p className="muted">{desc}</p>
      </div>
      <JoinTeam session={session} onJoined={onJoined} compact />
    </div>
  )
}

// ---------- טיימר ספירה לאחור לאימון הבא ----------
function Countdown({ membership, onNavigate }) {
  const [next, setNext] = useState(undefined)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!membership) { setNext(null); return }
    ;(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const [{ data }, { data: slots }] = await Promise.all([
        supabase.from('schedule_entries').select('*, plan:training_plans(id, name)').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', today).order('date').order('start_time').limit(10),
        supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
      ])
      const nowTs = Date.now()
      const cands = [
        ...(data || []),
        ...expandSlots(slots || [], 0, 30).map((o) => ({ date: o.date, start_time: o.start_time, end_time: o.end_time })),
      ]
      const pick = cands
        .filter((e) => { const end = new Date(`${e.date}T${e.end_time || e.start_time || '23:59'}`); return !isNaN(end) && end.getTime() >= nowTs })
        .sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))[0]
      setNext(pick || null)
    })()
  }, [membership])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  if (next === undefined) return null
  if (!next) {
    return (
      <div className="pl-count pl-count-empty">
        <span className="pl-count-label"><Timer size={16} /> {L('האימון הבא', 'Next practice')}</span>
        <strong>{membership ? L('אין אימון קרוב בלו״ז', 'No upcoming practice') : L('הצטרפו לקבוצה', 'Join a team')}</strong>
        <span className="muted small">{membership ? L('המאמן יוסיף אימונים ללו״ז', 'Your coach will add practices') : L('כדי לראות את האימון הבא', 'to see your next practice')}</span>
      </div>
    )
  }

  const start = new Date(`${next.date}T${next.start_time || '00:00'}`)
  const diff = Math.max(0, start.getTime() - now)
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  const started = diff <= 0
  const when = start.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })

  const Unit = ({ v, lbl }) => (
    <span className="pl-count-unit"><b>{String(v).padStart(2, '0')}</b><i>{lbl}</i></span>
  )

  return (
    <button className="pl-count" onClick={() => onNavigate?.('team')}>
      <span className="pl-count-label"><Timer size={16} /> {started ? L('האימון עכשיו! 🔥', 'Practice now! 🔥') : L('האימון הבא', 'Next practice')}</span>
      {!started ? (
        <div className="pl-count-clock">
          {d > 0 && <Unit v={d} lbl={L('ימים', 'days')} />}
          <Unit v={h} lbl={L('שע׳', 'hrs')} />
          <Unit v={m} lbl={L('דק׳', 'min')} />
          <Unit v={s} lbl={L('שנ׳', 'sec')} />
        </div>
      ) : (
        <strong className="pl-count-live">{L('בהצלחה באימון!', 'Have a great practice!')}</strong>
      )}
      <span className="muted small">{next.plan?.name || trTeam(membership.team)} · {when}{next.start_time ? ` · ${next.start_time.slice(0, 5)}` : ''}</span>
    </button>
  )
}

// ---------- טבעת נוכחות ----------
function AttendanceRing({ pct, size = 62 }) {
  const has = pct != null
  const val = has ? pct : 0
  const r = 26, c = 2 * Math.PI * r
  const off = c * (1 - val / 100)
  const tone = val >= 80 ? 'var(--c-green)' : val >= 50 ? 'var(--c-orange)' : 'var(--c-red)'
  return (
    <div className="pl-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="pl-ring-bg" />
        <circle cx="32" cy="32" r={r} className="pl-ring-fg" style={{ stroke: has ? tone : 'var(--border)', strokeDasharray: c, strokeDashoffset: has ? off : c }} />
      </svg>
      <span className="pl-ring-val">{has ? `${val}%` : '—'}</span>
    </div>
  )
}

function WeeklyMission({ done }) {
  const pct = Math.min(100, Math.round((done / WEEKLY_TARGET) * 100))
  const complete = done >= WEEKLY_TARGET
  return (
    <section className="pl-block">
      <div className={complete ? 'pl-mission done' : 'pl-mission'}>
        <span className="pl-mission-ic"><Target size={22} /></span>
        <div className="pl-mission-body">
          <div className="pl-mission-top">
            <strong>{L('המשימה השבועית', 'Weekly mission')}</strong>
            <span>{done}/{WEEKLY_TARGET}</span>
          </div>
          <div className="pl-mission-bar"><span style={{ width: `${pct}%` }} /></div>
          <span className="muted small">
            {complete ? L('כל הכבוד! השלמת את המשימה 🎉', 'Awesome! Mission complete 🎉')
                      : L(`בצעו ${WEEKLY_TARGET} תרגילים השבוע — נשארו ${WEEKLY_TARGET - done}`, `Do ${WEEKLY_TARGET} drills this week — ${WEEKLY_TARGET - done} to go`)}
          </span>
        </div>
      </div>
    </section>
  )
}

// ---------- כתבות כדורסל (קומפקטי) ----------
function PlayerNews() {
  const [items, setItems] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const raw = localStorage.getItem(NEWS_CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.items?.length) { if (alive) setItems(parsed.items.slice(0, 4)); return }
        }
      } catch { /* ignore */ }
      try {
        const out = []
        for (const src of NEWS_SOURCES.slice(0, 2)) {
          const res = await fetch(src.api).then((r) => r.json()).catch(() => null)
          if (res?.status === 'ok' && Array.isArray(res.items)) {
            res.items.slice(0, 3).forEach((it, i) => {
              const t = String(it.title || '').split(' - ')
              out.push({
                title: t[0], source: t[1] || src.name, link: it.link,
                image: it.thumbnail || it.enclosure?.link || NEWS_FALLBACK_IMAGES[(out.length + i) % NEWS_FALLBACK_IMAGES.length],
              })
            })
          }
          if (out.length >= 4) break
        }
        if (alive) setItems(out.slice(0, 4))
      } catch { if (alive) setItems([]) }
    })()
    return () => { alive = false }
  }, [])

  if (items === null || items.length === 0) return null
  return (
    <section className="pl-block">
      <p className="pl-section-label"><Newspaper size={15} /> {L('כתבות כדורסל', 'Basketball news')}</p>
      <div className="pl-news">
        {items.map((n, i) => (
          <a key={i} className="pl-news-card" href={safeUrl(n.link) || '#'} target="_blank" rel="noopener noreferrer">
            <span className="pl-news-thumb" style={{ backgroundImage: `url("${n.image}")` }} />
            <span className="pl-news-body">
              <span className="pl-news-title">{n.title}</span>
              <span className="pl-news-src">{n.source}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}

// ---------- ציטוט מתחלף ----------
function PlayerQuote() {
  const [i, setI] = useState(() => Math.floor((Date.now() / 60000) % COACHING_QUOTES.length))
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % COACHING_QUOTES.length), 8000)
    return () => clearInterval(t)
  }, [])
  const q = COACHING_QUOTES[i]
  return (
    <section className="pl-block">
      <blockquote className="pl-quote" key={i}>
        <span className="pl-quote-mark">״</span>
        <p>{L(q.text, q.text_en)}</p>
        <cite>— {L(q.author, q.author_en)}</cite>
      </blockquote>
    </section>
  )
}

// ---------- כרטיס שיגור בודד ----------
function AssignmentCard({ a, doneSet, onToggleDone }) {
  const done = doneSet.has(a.id)
  const drill = a.drill
  const yt = a.video_url ? getYouTubeId(a.video_url) : null
  const vidUrl = a.video_url ? safeUrl(a.video_url) : null
  const title = drill?.title || a.title || (a.plan ? a.plan.name : L('תרגיל', 'Drill'))
  const cat = drill?.category
  const desc = drill?.description || a.note

  if (done) {
    return (
      <button className="pla done" onClick={() => onToggleDone(a.id, true)} aria-pressed="true">
        <span className="pla-check on"><Check size={16} /></span>
        <span className="pla-done-body">
          <span className="pla-done-title">{title}{cat && <span className="cat-badge" data-cat={cat}>{cat}</span>}</span>
          <span className="muted small">{L('בוצע · כל הכבוד', 'Done · nice work')}</span>
        </span>
        <span className="pla-done-badge">{L('בוצע', 'Done')}</span>
      </button>
    )
  }

  return (
    <article className="pla">
      <div className="pla-head">
        <h3>{title}</h3>
        {cat && <span className="cat-badge" data-cat={cat}>{cat}</span>}
      </div>
      {desc && <p className="pla-desc">{desc}</p>}
      <div className="pla-meta">
        {drill?.duration_minutes && <span><Clock size={13} /> {drill.duration_minutes} {L("דק'", 'min')}</span>}
        {a.due_date && <span><CalendarDays size={13} /> {L('עד', 'by')} {new Date(a.due_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}</span>}
        <span>{a.player_id ? L('נשלח אליך אישית', 'Sent to you') : L('לכל הקבוצה', 'Whole team')}</span>
      </div>
      {yt && (
        <a className="pla-video" href={vidUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ backgroundImage: `url("https://img.youtube.com/vi/${yt}/hqdefault.jpg")` }}>
          <span className="pla-play"><Play size={22} fill="#fff" /></span>
          <span className="pla-video-tag">{L('סרטון הדגמה · YouTube', 'Demo · YouTube')}</span>
        </a>
      )}
      {!yt && vidUrl && (
        <a className="pla-video no-thumb" href={vidUrl} target="_blank" rel="noopener noreferrer">
          <span className="pla-play"><Play size={22} fill="#fff" /></span>
          <span className="pla-video-tag">{L('לצפייה בסרטון', 'Watch video')}</span>
        </a>
      )}
      <button className="btn-primary pla-mark" onClick={() => onToggleDone(a.id, false)}>
        <Check size={17} /> {L('סמן כבוצע', 'Mark done')}
      </button>
    </article>
  )
}

// ---------- מסך: התרגילים שלי (עם סינון והתקדמות) ----------
function MyAssignments({ session }) {
  const [items, setItems] = useState(null)
  const [doneSet, setDoneSet] = useState(new Set())
  const [filter, setFilter] = useState('open') // open | all | done

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
    setDoneSet((cur) => { const n = new Set(cur); isDone ? n.delete(id) : n.add(id); return n })
    if (isDone) {
      await supabase.from('assignment_completions').delete().eq('assignment_id', id).eq('player_id', session.user.id)
    } else {
      await supabase.from('assignment_completions').upsert({ assignment_id: id, player_id: session.user.id })
      toast.success(L('כל הכבוד! 💪', 'Nice work! 💪'))
    }
  }

  if (items === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>
  const openCount = items.filter((a) => !doneSet.has(a.id)).length
  const doneCount = items.length - openCount
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0
  const shown = items.filter((a) => filter === 'all' ? true : filter === 'done' ? doneSet.has(a.id) : !doneSet.has(a.id))

  return (
    <div className="pl-screen pl-narrow">
      <PlHead Icon={Dumbbell} tone="green"
        title={L('התרגילים שלי', 'My drills')}
        subtitle={L('מה שהמאמן שלח לך לתרגל בבית', 'What your coach sent you to practice at home')} />
      {items.length > 0 && (
        <div className="pla-progress">
          <div className="pla-progress-top">
            <span>{L('ההתקדמות שלך', 'Your progress')}</span>
            <b>{doneCount}/{items.length}</b>
          </div>
          <div className="pla-progress-bar"><span style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {items.length > 0 && (
        <div className="pla-tabs">
          {[['open', L('לביצוע', 'To do'), openCount], ['done', L('בוצעו', 'Done'), doneCount], ['all', L('הכל', 'All'), items.length]].map(([k, lbl, n]) => (
            <button key={k} className={filter === k ? 'pla-tab active' : 'pla-tab'} onClick={() => setFilter(k)}>{lbl} · {n}</button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><Dumbbell size={26} /></span>
          <div className="empty-title">{L('עוד לא קיבלת תרגילים', 'No drills yet')}</div>
          <p className="muted small">{L('כשהמאמן ישלח לך תרגיל, הוא יופיע כאן.', 'When your coach sends you a drill, it shows up here.')}</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted small" style={{ padding: '10px 2px' }}>{filter === 'done' ? L('עוד לא סימנת תרגילים כבוצעו.', 'No drills marked done yet.') : L('אין תרגילים פתוחים — כל הכבוד! 💪', 'No open drills — nice! 💪')}</p>
      ) : (
        shown.map((a) => <AssignmentCard key={a.id} a={a} doneSet={doneSet} onToggleDone={toggleDone} />)
      )}
    </div>
  )
}

// ---------- מסך: הקבוצה שלי ----------
const MOOD_EMOJI = { tough: '😤', good: '💪', great: '🔥' }

function MyTeam({ membership, onNavigate }) {
  const [teammates, setTeammates] = useState([])
  const [next, setNext] = useState(null)
  const [reviews, setReviews] = useState([])

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
      const [{ data: sched }, { data: slots }] = await Promise.all([
        supabase.from('schedule_entries').select('*').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', today).order('date').order('start_time').limit(5),
        supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
      ])
      const merged = [
        ...(sched || []),
        ...expandSlots(slots || [], 0, 30).map((o) => ({ id: o.session_id, date: o.date, start_time: o.start_time, title: null })),
      ].sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))
      setNext(merged[0] || null)
      const { data: revs } = await supabase
        .from('session_reviews')
        .select('*')
        .eq('coach_id', membership.coach_id)
        .eq('team', membership.team)
        .order('session_date', { ascending: false })
        .limit(8)
      setReviews(revs || [])
    })()
  }, [membership])

  if (!membership) return null
  return (
    <div className="pl-screen pl-narrow">
      <PlHead Icon={Users} tone="accent"
        title={L('הקבוצה שלי', 'My team')}
        subtitle={L('הסגל, האימון הבא והסיכומים של הקבוצה', 'Your squad, next practice and recaps')} />
      <div className="plt-hero">
        <span className="plt-hero-court" aria-hidden="true">🏀</span>
        <div className="plt-hero-top">
          <span className="plt-badge"><Trophy size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{trTeam(membership.team)}</strong>
            <span className="plt-hero-sub">{coachName(membership.coach)}{membership.coach?.club ? ` · ${membership.coach.club}` : ''} · {teammates.length} {L('שחקנים', 'players')}</span>
          </div>
        </div>
        <div className="plt-hero-actions">
          <button className="plt-hero-btn" onClick={() => onNavigate?.('teamchat')}><MessagesSquare size={15} /> {L('צ׳אט הקבוצה', 'Team chat')}</button>
          <button className="plt-hero-btn" onClick={() => onNavigate?.('coach')}><MessageSquare size={15} /> {L('הודעה למאמן', 'Message coach')}</button>
        </div>
      </div>

      {next && (
        <div className="pl-next">
          <span className="pl-next-label"><CalendarDays size={15} /> {L('האימון הבא', 'Next practice')}</span>
          <strong>{next.title || trTeam(membership.team)}</strong>
          <span className="muted small">
            {new Date(next.date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })}
            {next.start_time ? ` · ${next.start_time.slice(0, 5)}` : ''}{next.location ? ` · ${next.location}` : ''}
          </span>
        </div>
      )}

      {reviews.length > 0 && (
        <>
          <p className="pl-section-label" style={{ marginTop: 18 }}><ClipboardList size={15} /> {L('סיכומי אימונים', 'Session recaps')}</p>
          <ul className="pl-recaps">
            {reviews.map((r) => {
              const isMvp = r.mvp_player_id && r.mvp_player_id === membership.player_id
              return (
                <li key={r.id} className={isMvp ? 'pl-recap mvp' : 'pl-recap'}>
                  <div className="pl-recap-head">
                    <span className="pl-recap-date">
                      {r.mood ? `${MOOD_EMOJI[r.mood] || ''} ` : ''}
                      {r.session_type === 'game' ? L('משחק', 'Game') : L('אימון', 'Practice')}
                      {r.session_date ? ` · ${new Date(r.session_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'short', day: 'numeric', month: 'numeric' })}` : ''}
                    </span>
                    {isMvp ? <span className="pl-recap-mvp">🏆 {L('היית ה-MVP!', "You were MVP!")}</span>
                      : r.mvp_name ? <span className="muted small">{L('MVP: ', 'MVP: ')}{r.mvp_name}</span> : null}
                  </div>
                  {r.overall_note && <p className="pl-recap-note">{r.overall_note}</p>}
                </li>
              )
            })}
          </ul>
        </>
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

// ---------- מסך: לו״ז (אימונים + משחקים של הקבוצה, גלוי לשחקן) ----------
function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff === 0) return L('היום', 'Today')
  if (diff === 1) return L('מחר', 'Tomorrow')
  return d.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })
}

function PlayerSchedule({ session, membership }) {
  const [items, setItems] = useState(null)
  const [past, setPast] = useState([])
  const me = session.user.id

  const load = useCallback(async () => {
    if (!membership) return
    const today = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
    const [{ data: slots }, { data: pr }, { data: gm }, { data: pastPr }, { data: pastGm }, { data: eff }, { data: marks }] = await Promise.all([
      supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
      supabase.from('schedule_entries').select('*, plan:training_plans(id, name)').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', today).order('date').order('start_time').limit(40),
      supabase.from('team_games').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', today).order('game_date').limit(40),
      supabase.from('schedule_entries').select('id, date, start_time').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', from).lt('date', today),
      supabase.from('team_games').select('id, game_date, opponent').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', from).lt('game_date', today),
      supabase.from('session_effort').select('session_id, effort').eq('player_id', me),
      supabase.from('session_goal_marks').select('session_id, met, goal:player_goals(title)').eq('player_id', me),
    ])
    const list = [
      ...expandSlots(slots || [], 0, 30).map((o) => ({ kind: 'practice', id: 's' + o.session_id, date: o.date, time: o.start_time, end: o.end_time, title: L('אימון קבוצתי', 'Team practice'), location: o.location })),
      ...(pr || []).filter((e) => e.date).map((e) => ({ kind: 'practice', id: 'p' + e.id, date: e.date, time: e.start_time, end: e.end_time, title: e.plan?.name || L('אימון קבוצתי', 'Team practice'), location: e.location })),
      ...(gm || []).map((g) => ({ kind: 'game', id: 'g' + g.id, date: g.game_date, time: g.game_time, title: g.opponent ? L(`נגד ${g.opponent}`, `vs ${g.opponent}`) : L('משחק', 'Game'), location: g.location })),
    ].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    setItems(list)

    // אימונים שהיו — מתוך הדירוגים של השחקן ב-14 הימים האחרונים
    const effBy = {}; for (const r of eff || []) effBy[r.session_id] = r.effort
    const marksBy = {}; for (const m of marks || []) (marksBy[m.session_id] = marksBy[m.session_id] || []).push({ title: m.goal?.title || L('מטרה', 'Goal'), met: m.met })
    const pastSessions = [
      ...expandSlots(slots || [], -14, -1).map((o) => ({ session_id: o.session_id, date: o.date, title: L('אימון קבוצתי', 'Team practice') })),
      ...(pastPr || []).map((e) => ({ session_id: e.id, date: e.date, title: L('אימון', 'Practice') })),
      ...(pastGm || []).map((g) => ({ session_id: g.id, date: g.game_date, title: g.opponent ? L(`נגד ${g.opponent}`, `vs ${g.opponent}`) : L('משחק', 'Game') })),
    ]
    const seen = new Set()
    setPast(pastSessions
      .filter((s) => { if (seen.has(s.session_id)) return false; seen.add(s.session_id); return effBy[s.session_id] != null || marksBy[s.session_id] })
      .map((s) => ({ ...s, effort: effBy[s.session_id], marks: marksBy[s.session_id] || [] }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3))
  }, [membership, me])

  useEffect(() => { load() }, [load])

  if (items === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>

  const next = items[0] || null
  const todayStr = new Date().toISOString().slice(0, 10)
  const dayMap = {}
  for (const it of items) (dayMap[it.date] = dayMap[it.date] || []).push(it)
  const days = Object.keys(dayMap).sort()

  return (
    <div className="pl-screen pl-narrow">
      <PlHead Icon={CalendarDays} tone="blue"
        title={L('הלו״ז שלי', 'My schedule')}
        subtitle={L('אימונים ומשחקים · החודש הקרוב', 'Practices and games · the month ahead')} />

      {items.length === 0 && past.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><CalendarDays size={26} /></span>
          <div className="empty-title">{L('אין אירועים קרובים', 'Nothing coming up')}</div>
          <p className="muted small">{L('ברגע שהמאמן יוסיף אימונים ומשחקים ללו״ז — הם יופיעו כאן אוטומטית.', 'When your coach adds practices and games, they show up here automatically.')}</p>
        </div>
      ) : (
        <>
          {next && (
            <div className={`pl-next-up ${next.kind}`}>
              <span className="pl-next-up-court" aria-hidden="true">🏀</span>
              <span className="pl-next-up-label">{next.kind === 'game' ? <Volleyball size={13} /> : <Flame size={13} />} {L('הבא בתור', 'Next up')}</span>
              <h3>{next.title}</h3>
              <div className="pl-next-up-meta">
                <span><CalendarDays size={15} /> {dayLabel(next.date)}</span>
                {next.time && <span><Clock size={15} /> {String(next.time).slice(0, 5)}</span>}
                {next.location && <span><MapPin size={15} /> {next.location}</span>}
                <span className="pl-next-up-kind">{next.kind === 'game' ? L('משחק', 'Game') : L('אימון', 'Practice')}</span>
              </div>
            </div>
          )}

          {days.map((d) => (
            <section className="pls-day" key={d}>
              <p className="pls-day-head">
                {new Date(d + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long' })} · {new Date(d + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}
                {d === todayStr && <em className="pls-today">{L('היום', 'Today')}</em>}
              </p>
              {dayMap[d].map((it) => (
                <div key={it.id} className={`pls-ev ${it.kind}`}>
                  <div className="pls-ev-body">
                    <strong>{it.title}{it.kind === 'game' && <span className="pls-ev-tag">{L('משחק', 'Game')}</span>}</strong>
                    {it.location && <span className="muted small"><MapPin size={12} /> {it.location}</span>}
                  </div>
                  <span className="pls-ev-time" dir="ltr">{it.time ? String(it.time).slice(0, 5) : '—'}</span>
                </div>
              ))}
            </section>
          ))}

          {past.length > 0 && (
            <section className="pls-day" style={{ marginTop: 6 }}>
              <p className="pl-section-label">{L('אימונים שהיו', 'Past sessions')}</p>
              {past.map((s) => (
                <div key={s.session_id} className="pls-past">
                  <div className="pls-past-head">
                    <strong>{s.title} · {new Date(s.date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })}</strong>
                    {s.effort != null && <span className="pls-load"><Flame size={13} /> {L('עומס', 'Load')} {s.effort}/10</span>}
                  </div>
                  {s.marks.map((m, i) => (
                    <div key={i} className="pls-past-goal">
                      <span className={m.met ? 'pls-mark on' : 'pls-mark'}>{m.met ? <Check size={12} /> : null}</span>
                      {m.title}{m.met ? L(' — עמדתי במטרה', ' — met') : L(' — נמשיך באימון הבא', ' — next time')}
                    </div>
                  ))}
                  <div className="pls-past-note"><Eye size={12} /> {L('המאמן רואה את הסיכום והעומס שלך', 'Your coach sees your summary and load')}</div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ---------- מסך: וידאו (סינון לפי קטגוריה + נגן מוטמע) ----------
function PlayerVideos() {
  const [videos, setVideos] = useState(null)
  const [cat, setCat] = useState('all')
  const [playing, setPlaying] = useState(null) // {id(yt), title}

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('drill_videos')
        .select('id, title, category, url, note')
        .order('created_at', { ascending: false })
        .limit(120)
      setVideos(data || [])
    })()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setPlaying(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (videos === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>

  const cats = ['all', ...VIDEO_CATEGORIES.filter((c) => videos.some((v) => v.category === c))]
  const shown = cat === 'all' ? videos : videos.filter((v) => v.category === cat)

  return (
    <div className="pl-screen pl-narrow">
      <PlHead Icon={MonitorPlay} tone="blue"
        title={L('סרטוני תרגול', 'Training videos')}
        subtitle={L('סרטונים שהמאמן בחר בשבילך', 'Videos your coach picked for you')} />
      {videos.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><MonitorPlay size={26} /></span>
          <div className="empty-title">{L('אין סרטונים כרגע', 'No videos yet')}</div>
          <p className="muted small">{L('המאמן יוסיף כאן סרטוני תרגול — לפי קטגוריות.', 'Your coach will add training videos here, by category.')}</p>
        </div>
      ) : (
        <>
          <div className="pl-cat-chips">
            {cats.map((c) => (
              <button key={c} className={cat === c ? 'pl-chip active' : 'pl-chip'} onClick={() => setCat(c)}>
                {c === 'all' ? L('הכל', 'All') : c}
              </button>
            ))}
          </div>
          <div className="pl-vid-grid">
            {shown.map((v) => {
              const yt = getYouTubeId(v.url)
              return (
                <button key={v.id} className="pl-vid" onClick={() => yt ? setPlaying({ id: yt, title: v.title }) : window.open(safeUrl(v.url) || '#', '_blank')}>
                  <span className="pl-vid-thumb" style={yt ? { backgroundImage: `url("https://img.youtube.com/vi/${yt}/hqdefault.jpg")` } : undefined}>
                    <span className="pl-vid-play"><Play size={18} fill="#fff" /></span>
                  </span>
                  <span className="pl-vid-body">
                    <span className="pl-vid-title">{v.title}</span>
                    {v.category && <span className="cat-badge" data-cat={v.category}>{v.category}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {playing && createPortal(
        <div className="pl-video-modal" onClick={() => setPlaying(null)}>
          <div className="pl-video-inner" onClick={(e) => e.stopPropagation()}>
            <div className="pl-video-bar">
              <span>{playing.title}</span>
              <button className="icon-btn" onClick={() => setPlaying(null)} aria-label={L('סגור', 'Close')}><X size={18} /></button>
            </div>
            <div className="pl-video-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playing.id}?autoplay=1&rel=0`}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ---------- המטרות לאימון הקרוב — מופיעות בבית לפני האימון ----------
function PrePracticeGoals({ session, membership }) {
  const [goals, setGoals] = useState([])
  useEffect(() => {
    if (!membership) return
    ;(async () => {
      const [{ data: gl }, { data: marks }] = await Promise.all([
        supabase.from('player_goals').select('id, title, period, status, player_id').eq('period', 'session').eq('status', 'active'),
        supabase.from('session_goal_marks').select('goal_id').eq('player_id', session.user.id),
      ])
      const marked = new Set((marks || []).map((m) => m.goal_id))
      setGoals((gl || []).filter((g) => !marked.has(g.id)))
    })()
  }, [membership, session.user.id])

  if (!membership || goals.length === 0) return null
  return (
    <section className="pl-block">
      <div className="pl-pregoals">
        <span className="pl-pregoals-ic"><Target size={18} /></span>
        <div className="pl-pregoals-body">
          <strong>{L('המטרות שלך לאימון הקרוב 🎯', 'Your goals for the next practice 🎯')}</strong>
          <span className="muted small">{L('תגיע לאימון כשאתה יודע על מה אתה עובד. בסוף האימון תסמן אם עמדת בהן.', 'Arrive knowing what you’re working on. Mark them at wrap-up.')}</span>
          <div className="pl-pregoals-chips">
            {goals.map((g) => <span key={g.id} className="pl-pregoal">{g.title}</span>)}
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------- דירוג מאמץ עצמי (בסוף אימון/משחק) ----------
function EffortPrompt({ session, membership }) {
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [effort, setEffort] = useState(0)
  const [note, setNote] = useState('')
  const [goals, setGoals] = useState([])
  const [marks, setMarks] = useState({}) // {goalId: boolean}

  useEffect(() => {
    if (!membership) return
    ;(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const from = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
      const [{ data: slots }, { data: gm }, { data: se }, { data: gl }, { data: prevMarks }] = await Promise.all([
        supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
        supabase.from('team_games').select('id, game_date, opponent').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', from).lte('game_date', today).order('game_date', { ascending: false }),
        supabase.from('session_effort').select('session_id').eq('player_id', session.user.id),
        supabase.from('player_goals').select('id, title, period, status, target_value, progress_value, unit, player_id').in('period', ['session', 'week', 'month']),
        supabase.from('session_goal_marks').select('goal_id').eq('player_id', session.user.id),
      ])
      const rated = new Set((se || []).map((r) => r.session_id))
      // מטרה "לאימון" שכבר סומנה באימון קודם — לא חוזרת שוב
      const markedEver = new Set((prevMarks || []).map((m) => m.goal_id))
      const cands = [
        // מופעי הלו"ז הקבוע ב-3 הימים האחרונים (כולל היום)
        ...expandSlots(slots || [], -3, 0).map((o) => ({ session_id: o.session_id, session_type: 'practice', session_date: o.date, title: L('אימון', 'Practice') })),
        ...(gm || []).map((g) => ({ session_id: g.id, session_type: 'game', session_date: g.game_date, title: g.opponent ? L(`נגד ${g.opponent}`, `vs ${g.opponent}`) : L('משחק', 'Game') })),
      ].filter((c) => c.session_date && !rated.has(c.session_id)).sort((a, b) => b.session_date.localeCompare(a.session_date))
      const p = cands[0] || null
      setPending(p)
      // סדר: קודם מטרות "לאימון", אחר כך שבועיות/חודשיות
      const order = { session: 0, week: 1, month: 2 }
      setGoals((gl || [])
        .filter((g) => !(g.period === 'session' && markedEver.has(g.id)))
        .sort((a, b) => (order[a.period] ?? 9) - (order[b.period] ?? 9)))
      if (p) {
        const { data: existing } = await supabase.from('session_goal_marks').select('goal_id, met').eq('session_id', p.session_id).eq('player_id', session.user.id)
        const m = {}; for (const r of existing || []) m[r.goal_id] = r.met; setMarks(m)
      }
    })()
  }, [membership, session.user.id])

  const submit = async () => {
    if (!pending || busy || !effort) return
    setBusy(true)
    const { error } = await supabase.from('session_effort').insert({
      player_id: session.user.id, coach_id: membership.coach_id, team: membership.team,
      session_type: pending.session_type, session_id: pending.session_id, session_date: pending.session_date,
      effort, note: note.trim() || null,
    })
    if (!error && goals.length) {
      const rows = goals.map((g) => ({
        player_id: session.user.id, coach_id: membership.coach_id, session_id: pending.session_id, goal_id: g.id, met: !!marks[g.id],
      }))
      await supabase.from('session_goal_marks').upsert(rows, { onConflict: 'session_id,goal_id,player_id' })
    }
    setBusy(false)
    if (error) { toast.error(L('השליחה נכשלה', 'Failed to send')); return }
    setDone(true)
    toast.success(L('תודה! נשלח למאמן 💪', 'Thanks! Sent to your coach 💪'))
  }

  if (!membership || (!pending && !done)) return null
  return (
    <section className="pl-block">
      <div className="pl-effort-ask">
        <div className="pl-effort-ask-head">
          <span className="pl-effort-ic"><Flame size={20} /></span>
          <div>
            <strong>{done ? L('תודה! הסיכום נשלח למאמן 🔥', 'Thanks! Sent to your coach 🔥') : L('סיכום האימון — כמה השקעת?', 'Session wrap-up — how hard did you go?')}</strong>
            {!done && pending && <span className="muted small">{pending.title}{pending.session_date ? ` · ${new Date(pending.session_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}` : ''}</span>}
          </div>
        </div>

        {!done && (
          <>
            <span className="pl-effort-lbl">{L('רמת העומס שלך (1–10)', 'Your effort (1–10)')}</span>
            <div className="pl-effort-scale" role="group" aria-label={L('דירוג מאמץ 1 עד 10', 'Effort 1 to 10')}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} className={effort === n ? 'pl-effort-btn on' : 'pl-effort-btn'} onClick={() => setEffort(n)} aria-pressed={effort === n} aria-label={String(n)}>{n}</button>
              ))}
            </div>

            <textarea className="finder-input pl-effort-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500}
              placeholder={L('משהו לרשום למאמן? (איך הרגשת, כאב, מה עבד...) — לא חובה', 'Anything to tell your coach? (how you felt, pain, what worked...) — optional')} />

            {goals.length > 0 && (
              <div className="pl-effort-goals">
                <span className="pl-effort-lbl">{L('עמדת במטרות שלך היום?', 'Did you meet your goals today?')}</span>
                {goals.map((g) => (
                  <button key={g.id} className={marks[g.id] ? 'pl-goal-check on' : 'pl-goal-check'} onClick={() => setMarks((m) => ({ ...m, [g.id]: !m[g.id] }))} aria-pressed={!!marks[g.id]}>
                    <span className="pl-goal-check-box">{marks[g.id] ? <Check size={14} /> : null}</span>
                    <span className="pl-goal-check-txt">{g.title}{g.target_value ? ` · ${g.progress_value || 0}/${g.target_value}${g.unit ? ' ' + g.unit : ''}` : ''}</span>
                    {!g.player_id && <span className="pl-goal-check-team">{L('קבוצתי', 'Team')}</span>}
                  </button>
                ))}
              </div>
            )}

            <button className="pl-cta pl-effort-submit" onClick={submit} disabled={busy || !effort}>
              {busy ? L('שולח...', 'Sending...') : L('שליחה למאמן', 'Send to coach')}
            </button>
          </>
        )}
      </div>
    </section>
  )
}

// ---------- מסך: בית (עשיר, ממוקד שחקן) ----------
function PlayerHome({ session, profile, membership, setView, onJoined }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    ;(async () => {
      const [asg, compl, fbCount, fbLatest, att, gatt, roster] = await Promise.all([
        supabase.from('player_assignments').select('id'),
        supabase.from('assignment_completions').select('assignment_id, done_at').eq('player_id', session.user.id),
        supabase.from('player_feedback').select('id', { count: 'exact', head: true }).eq('player_id', session.user.id),
        supabase.from('player_feedback').select('content, rating, created_at, coach:profiles!coach_id(first_name, last_name, avatar_url)').eq('player_id', session.user.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('practice_attendance').select('status'),
        supabase.from('game_attendance').select('status'),
        supabase.from('team_players').select('number, position').eq('player_id', session.user.id).limit(1),
      ])
      const doneRows = compl.data || []
      const doneIds = new Set(doneRows.map((c) => c.assignment_id))
      const open = (asg.data || []).filter((a) => !doneIds.has(a.id)).length
      const attRows = [...(att.data || []), ...(gatt.data || [])]
      const attTotal = attRows.length
      const attPresent = attRows.filter((r) => r.status && r.status !== 'absent').length
      const attendancePct = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : null
      const weekly = doneRows.filter((c) => c.done_at && withinDays(c.done_at, 7)).length
      const r = roster.data && roster.data[0]
      setStats({
        open, fb: fbCount.count || 0, attendancePct, weekly,
        latestFb: (fbLatest.data && fbLatest.data[0]) || null,
        number: r?.number || null, position: r?.position || null,
        progress: playerProgress({ completedCount: doneRows.length, completionDates: doneRows.map((c) => c.done_at).filter(Boolean), attendancePct }),
      })
    })()
  }, [session.user.id])

  const hour = new Date().getHours()
  const greet = hour < 12 ? L('בוקר טוב', 'Good morning') : hour < 18 ? L('צהריים טובים', 'Good afternoon') : L('ערב טוב', 'Good evening')
  const progress = stats?.progress
  const initial = (profile.first_name || '?').trim().charAt(0)

  return (
    <div className="pl-screen pl-home-rich">
      <header className="plh-top pl-stagger">
        <Avatar name={`${profile.first_name} ${profile.last_name || ''}`} url={profile.avatar_url} size={52} />
        <div className="plh-greet">
          <h1>{greet}, <span className="hero-title-accent">{profile.first_name}</span></h1>
          <span className="plh-sub">
            {membership ? `${trTeam(membership.team)} · ${coachName(membership.coach)}` : L('ברוך הבא לקורטסייד', 'Welcome to CourtSide')}
          </span>
        </div>
      </header>

      {membership && (
        <div className="plh-card pl-stagger">
          <span className="plh-court" aria-hidden="true">🏀</span>
          <span className="plh-jersey">{stats?.number || initial}</span>
          <div className="plh-card-body">
            <strong>{progress ? L(`רמה ${progress.level}`, `Level ${progress.level}`) : L('רמה —', 'Level —')}{stats?.position ? ` · ${stats.position}` : ''}</strong>
            <span className="plh-sub2">{trTeam(membership.team)} · {coachName(membership.coach)}</span>
          </div>
          {progress && (
            <span className="plh-streak" title={L('רצף ימים', 'Day streak')}><Flame size={15} /> {progress.streak}</span>
          )}
        </div>
      )}

      {!membership && (
        <div className="pl-stagger"><JoinTeam session={session} onJoined={onJoined} compact /></div>
      )}

      <div className="pl-stagger"><Countdown membership={membership} onNavigate={setView} /></div>

      {membership && <div className="pl-stagger"><EffortPrompt session={session} membership={membership} /></div>}

      {membership && <div className="pl-stagger"><PrePracticeGoals session={session} membership={membership} /></div>}

      <div className="pl-tiles pl-stagger">
        <button className="pl-tile" onClick={() => setView('drills')}>
          <span className="pl-tile-ic blue"><Dumbbell size={20} /></span>
          <span className="pl-tile-num">{stats ? stats.open : '—'}</span>
          <span className="pl-tile-label">{L('תרגילים לביצוע', 'Drills to do')}</span>
        </button>
        <button className="pl-tile" onClick={() => setView('team')}>
          <span className="pl-tile-ring"><AttendanceRing pct={stats?.attendancePct ?? null} /></span>
          <span className="pl-tile-label">{L('נוכחות', 'Attendance')}</span>
        </button>
        <button className="pl-tile" onClick={() => setView('feedback')}>
          <span className="pl-tile-ic green"><MessageSquareHeart size={20} /></span>
          <span className="pl-tile-num">{stats ? stats.fb : '—'}</span>
          <span className="pl-tile-label">{L('משובים', 'Feedback')}</span>
        </button>
      </div>

      <div className="pl-stagger"><WeeklyMission done={stats?.weekly || 0} /></div>

      {membership && (
        <button className="pl-coach-cta pl-stagger" onClick={() => setView('coach')}>
          <Avatar name={coachName(membership.coach)} url={membership.coach?.avatar_url} size={40} />
          <span className="pl-coach-cta-body">
            <strong>{L('שלח הודעה למאמן', 'Message your coach')}</strong>
            <span className="muted small">{coachName(membership.coach)}</span>
          </span>
          <Send size={18} />
        </button>
      )}

      {stats?.latestFb && (
        <button className="pl-fb-preview pl-stagger" onClick={() => setView('feedback')}>
          <span className="pl-fb-preview-label"><MessageSquareHeart size={14} /> {L('משוב אחרון מהמאמן', 'Latest coach feedback')}</span>
          {stats.latestFb.rating > 0 && (
            <span className="pl-fb-stars">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} fill={n <= stats.latestFb.rating ? 'currentColor' : 'none'} />)}</span>
          )}
          <p>{stats.latestFb.content}</p>
        </button>
      )}

      <div className="pl-stagger"><PlayerQuote /></div>

      {membership && (
        <button className="pl-cta pl-cta-ghost pl-stagger" onClick={() => setView('goals')}>
          <Target size={18} /> {L('המטרות שלי', 'My goals')} <ChevronLeft size={16} />
        </button>
      )}

      <button className="pl-cta pl-stagger" onClick={() => setView('community')}>
        <Users size={18} /> {L('לקהילת השחקנים', 'Players community')} <ChevronLeft size={16} />
      </button>

      <div className="pl-stagger"><PlayerNews /></div>

      <button className="pl-cta pl-cta-ghost pl-stagger" onClick={() => setView('videos')}>
        <MonitorPlay size={18} /> {L('סרטוני תרגול', 'Training videos')} <ChevronLeft size={16} />
      </button>
    </div>
  )
}

// ---------- מסך: פרופיל (עם סטטיסטיקות) ----------
function PlayerProfile({ session, profile, memberships, onEdit, onJoined, setView }) {
  const [st, setSt] = useState(null)
  useEffect(() => {
    ;(async () => {
      const [compl, att] = await Promise.all([
        supabase.from('assignment_completions').select('assignment_id, done_at').eq('player_id', session.user.id),
        supabase.from('practice_attendance').select('status'),
      ])
      const doneRows = compl.data || []
      const attRows = att.data || []
      const attTotal = attRows.length
      const attPresent = attRows.filter((r) => r.status && r.status !== 'absent').length
      const attendancePct = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : null
      setSt({ done: doneRows.length, streak: computeStreak(doneRows.map((c) => c.done_at).filter(Boolean)), attendancePct })
    })()
  }, [session.user.id])

  return (
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

      {st && (
        <div className="pl-stat-grid pl-stat-grid3">
          <div className="pl-stat"><b>{st.done}</b><span>{L('תרגילים שבוצעו', 'Drills done')}</span></div>
          <div className="pl-stat"><b>{st.streak}🔥</b><span>{L('רצף ימים', 'Day streak')}</span></div>
          <div className="pl-stat"><b>{st.attendancePct != null ? `${st.attendancePct}%` : '—'}</b><span>{L('נוכחות', 'Attend.')}</span></div>
        </div>
      )}

      <button className="btn-soft" onClick={onEdit}>{L('עריכת פרטים', 'Edit details')}</button>

      <p className="pl-section-label" style={{ marginTop: 20 }}>{L('הקבוצות שלי', 'My teams')}</p>
      {memberships.length === 0 ? (
        <JoinTeam session={session} onJoined={onJoined} compact />
      ) : (
        <>
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
          <button className="btn-soft" style={{ marginTop: 12 }} onClick={() => setView('home')}>
            {L('הצטרפות לקבוצה נוספת', 'Join another team')}
          </button>
        </>
      )}
    </div>
  )
}

// ---------- מסך: וידאו (רכיב עזר לניווט) ----------
// (PlayerVideos מוגדר למעלה)

// ============================================================
// האפליקציה של השחקן — מעטפת + ניווט
// ============================================================
const PLAYER_NAV = [
  { id: 'home', label: ['בית', 'Home'], Icon: HomeIcon },
  { id: 'drills', label: ['התרגילים שלי', 'My drills'], Icon: Dumbbell },
  { id: 'goals', label: ['המטרות שלי', 'My goals'], Icon: Target, team: true },
  { id: 'schedule', label: ['לו״ז', 'Schedule'], Icon: CalendarDays, team: true },
  { id: 'coach', label: ['המאמן שלי', 'My coach'], Icon: MessageSquare, team: true },
  { id: 'feedback', label: ['האימונים שלי', 'My sessions'], Icon: MessageSquareHeart, team: true },
  { id: 'videos', label: ['סרטונים', 'Videos'], Icon: MonitorPlay },
  { id: 'community', label: ['קהילה', 'Community'], Icon: Users2 },
  { id: 'team', label: ['הקבוצה שלי', 'My team'], Icon: Users, team: true },
  { id: 'profile', label: ['פרופיל', 'Profile'], Icon: User },
]
const PLAYER_BOTTOM = ['home', 'drills', 'coach', 'community', 'profile']

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
  const hasTeam = approved.length > 0
  const coach = membership ? { ...membership.coach, id: membership.coach_id } : null
  const signOut = () => supabase.auth.signOut()

  if (memberships === null) {
    return <div className="center-screen"><div className="app-loading"><div className="loader" /></div></div>
  }

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
    switch (view) {
      case 'drills': return <MyAssignments session={session} />
      case 'coach':
        return hasTeam
          ? <CoachChat session={session} coach={coach} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('המאמן שלי', 'My coach')}
              desc={L('כדי לכתוב למאמן צריך קודם להצטרף לקבוצה שלו.', 'To message your coach, join their team first.')} />
      case 'feedback':
        return hasTeam
          ? <PlayerTimeline session={session} membership={membership} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('האימונים שלי', 'My sessions')}
              desc={L('ההיסטוריה שלך — משוב, עומס ומטרות לכל אימון — נפתחת ברגע שתצטרף לקבוצה.', 'Your history — feedback, effort and goals per session — opens once you join a team.')} />
      case 'goals':
        return hasTeam
          ? <MyGoals session={session} membership={membership} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('המטרות שלי', 'My goals')}
              desc={L('המאמן יגדיר לך מטרות ברגע שתצטרף לקבוצה. הצטרפו עם קוד מהמאמן.', 'Your coach sets goals once you join a team. Join with a code from your coach.')} />
      case 'schedule':
        return hasTeam
          ? <PlayerSchedule session={session} membership={membership} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('לוח האימונים והמשחקים', 'Schedule')}
              desc={L('לו״ז האימונים והמשחקים של הקבוצה יופיע כאן. הצטרפו לקבוצה עם קוד מהמאמן.', 'Your team’s practices and games appear here. Join a team with a code from your coach.')} />
      case 'videos': return <PlayerVideos />
      case 'teamchat':
        return hasTeam
          ? <TeamChat session={session} coachId={membership.coach_id} team={membership.team} isCoach={false} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('צ׳אט הקבוצה', 'Team chat')}
              desc={L('צ׳אט הקבוצה נפתח ברגע שהמאמן מאשר אתכם. הצטרפו עם קוד מהמאמן.', 'Team chat opens once your coach approves you. Join with a code from your coach.')} />
      case 'community': return <PlayerCommunity session={session} profile={profile} />
      case 'team':
        return hasTeam
          ? <MyTeam membership={membership} onNavigate={setView} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('הקבוצה שלי', 'My team')}
              desc={L('כאן תראו את חברי הקבוצה והאימון הבא. הצטרפו לקבוצה עם קוד מהמאמן.', 'See your teammates and next practice here. Join a team with a code from your coach.')} />
      case 'profile':
        return <PlayerProfile session={session} profile={profile} memberships={memberships} onEdit={() => setEditing(true)} onJoined={loadMemberships} setView={setView} />
      default: return <PlayerHome session={session} profile={profile} membership={membership} setView={setView} onJoined={loadMemberships} />
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
          <Notifications session={session} onNavigate={(v) => setView(['coach', 'goals', 'feedback', 'community', 'drills', 'teamchat'].includes(v) ? v : v === 'messages' ? 'coach' : 'drills')} />
          <LanguageToggle /><ThemeToggle />
        </div>
      </header>

      {drawer && <div className="drawer-overlay" onClick={() => setDrawer(false)} />}
      <aside className={drawer ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-brand">
          <svg viewBox="0 0 100 100" width="30" height="30"><circle cx="42" cy="55" r="22" fill="#E8763A" /><circle cx="42" cy="55" r="9" fill="#fff" /><path d="M60 45 L82 38 L82 52 L62 58 Z" fill="#E8763A" /><circle cx="78" cy="30" r="6" fill="#E8763A" /></svg>
          <span>CourtSide</span>
          <span className="sidebar-bell"><Notifications session={session} onNavigate={() => setView('coach')} /></span>
          <button className="drawer-close" onClick={() => setDrawer(false)} aria-label={L('סגור', 'Close')}><X size={20} /></button>
        </div>
        <span className="pl-role-chip"><Dumbbell size={13} /> {L('שחקן', 'Player')}</span>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <button key={item.id} className={view === item.id && !editing ? 'nav-item active' : 'nav-item'} onClick={() => { setEditing(false); setView(item.id) }}>
              <item.Icon size={18} /> {label(item)}
              {item.team && !hasTeam && <Lock size={13} className="nav-lock" />}
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
