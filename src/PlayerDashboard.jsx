import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Home as HomeIcon, Dumbbell, MessageSquareHeart, MonitorPlay, Users, User,
  Menu, X, Check, Clock, Star, CalendarDays, Users2, MessageSquare, MessagesSquare, Send,
  ShieldCheck, Hourglass, Trophy, ChevronLeft, Flame, Lock, Newspaper,
  Sparkles, Zap, Crown, CalendarCheck, Timer, Target, Play, ClipboardList,
  MapPin, Volleyball, ArrowLeft,
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
import { requestJoinByCode, myMemberships } from './players'
import { playerProgress, computeStreak } from './gamify'
import { expandSlots } from './sessionId'
import { safeUrl, COACHING_QUOTES, NEWS_SOURCES, NEWS_FALLBACK_IMAGES, NEWS_CACHE_KEY, VIDEO_CATEGORIES } from './constants'
import { getYouTubeId } from './youtube'

const BADGE_ICONS = { Sparkles, Flame, Zap, Crown, CalendarCheck, Trophy, ShieldCheck }
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

// קיבוץ פריטים לפי קרבה בזמן (מהחדש לישן) — לרשימת המשוב
function timeBucket(ts) {
  const d = new Date(ts)
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((start - dayStart) / 86400000)
  if (diff <= 0) return { key: 'today', label: L('היום', 'Today') }
  if (diff === 1) return { key: 'yesterday', label: L('אתמול', 'Yesterday') }
  if (diff <= 7) return { key: 'week', label: L('השבוע האחרון', 'This week') }
  if (diff <= 31) return { key: 'month', label: L('החודש האחרון', 'This month') }
  return { key: 'older', label: L('מוקדם יותר', 'Earlier') }
}
const BUCKET_ORDER = ['today', 'yesterday', 'week', 'month', 'older']

// הקשר האימון/משחק שממנו הגיע המשוב — לתגית צבעונית
function sessionContext(f) {
  const date = f.session_date ? ` · ${new Date(f.session_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })}` : ''
  if (f.session_type === 'game') return { tone: 'game', label: (f.opponent ? L(`מהמשחק מול ${f.opponent}`, `Game vs ${f.opponent}`) : L('מהמשחק', 'From the game')) + date }
  if (f.session_type === 'practice') return { tone: 'practice', label: L('מהאימון', 'From practice') + date }
  return null
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
      const { data } = await supabase
        .from('schedule_entries')
        .select('*, plan:training_plans(id, name)')
        .eq('created_by', membership.coach_id)
        .eq('team', membership.team)
        .gte('date', today)
        .order('date').order('start_time')
        .limit(10)
      const nowTs = Date.now()
      const pick = (data || []).find((e) => {
        const end = new Date(`${e.date}T${e.end_time || e.start_time || '23:59'}`)
        return !isNaN(end) && end.getTime() >= nowTs
      })
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

// ---------- רצועת רמה + XP + רצף ----------
function LevelStrip({ progress }) {
  const pct = Math.round(progress.progress * 100)
  return (
    <div className="pl-level">
      <span className="pl-level-badge" aria-hidden="true">{progress.level}</span>
      <div className="pl-level-body">
        <div className="pl-level-top">
          <strong>{L(`רמה ${progress.level}`, `Level ${progress.level}`)} · {L(progress.title[0], progress.title[1])}</strong>
          {progress.streak > 0 && (
            <span className="pl-streak" title={L('רצף ימים', 'Day streak')}><Flame size={14} /> {progress.streak}</span>
          )}
        </div>
        <div className="pl-xp-bar"><span style={{ width: `${pct}%` }} /></div>
        <span className="muted small">{L(`עוד ${progress.xpToNext} XP לרמה הבאה`, `${progress.xpToNext} XP to next level`)}</span>
      </div>
    </div>
  )
}

function BadgeRow({ badges }) {
  return (
    <div className="pl-badges">
      {badges.map((b) => {
        const Ic = BADGE_ICONS[b.icon] || Sparkles
        return (
          <div key={b.id} className={b.earned ? 'pl-badge earned' : 'pl-badge'} title={L(b.hint[0], b.hint[1])}>
            <span className="pl-badge-ic"><Ic size={18} /></span>
            <span className="pl-badge-lbl">{L(b.label[0], b.label[1])}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- כרטיס המשימה השבועית ----------
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
    <div className="pl-screen">
      <h2 className="pl-h2">{L('התרגילים שלי', 'My drills')}</h2>
      {items.length > 0 && (
        <div className="pl-progress-head">
          <div className="pl-progress-bar"><span style={{ width: `${pct}%` }} /></div>
          <span className="muted small">{L(`בוצעו ${doneCount} מתוך ${items.length}`, `${doneCount} of ${items.length} done`)}</span>
        </div>
      )}
      {items.length > 0 && (
        <div className="pl-filter-tabs">
          {[['open', L('לביצוע', 'To do'), openCount], ['done', L('בוצעו', 'Done'), doneCount], ['all', L('הכל', 'All'), items.length]].map(([k, lbl, n]) => (
            <button key={k} className={filter === k ? 'pl-tab active' : 'pl-tab'} onClick={() => setFilter(k)}>{lbl} · {n}</button>
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
  const rated = items.filter((f) => f.rating > 0)
  const avg = rated.length ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length) : null

  // קיבוץ לפי זמן — הכי חדש למעלה, מסודר בקבוצות ברורות
  const groupMap = {}
  for (const f of items) {
    const b = timeBucket(f.created_at)
    ;(groupMap[b.key] = groupMap[b.key] || { ...b, list: [] }).list.push(f)
  }
  const groups = BUCKET_ORDER.filter((k) => groupMap[k]).map((k) => groupMap[k])

  return (
    <div className="pl-screen pl-narrow">
      <PlHead Icon={MessageSquareHeart} tone="green"
        title={L('המשוב שלי', 'My feedback')}
        subtitle={L('מה שהמאמן כתב לך אחרי אימונים ומשחקים', 'What your coach wrote after practices and games')} />

      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><MessageSquareHeart size={26} /></span>
          <div className="empty-title">{L('עדיין אין משוב', 'No feedback yet')}</div>
          <p className="muted small">{L('אחרי אימון או משחק, המאמן יכתוב לך כאן משוב אישי — והוא יופיע מסודר לפי תאריך.', 'After a practice or game, your coach leaves personal feedback here — sorted by date.')}</p>
        </div>
      ) : (
        <>
          <div className="pl-fb-stats">
            <div className="pl-fb-stat"><b>{items.length}</b><span>{L('משובים', 'notes')}</span></div>
            {avg != null && (
              <div className="pl-fb-stat">
                <b>{avg.toFixed(1)}<i>/5</i></b>
                <span>{L('דירוג ממוצע', 'avg rating')}</span>
              </div>
            )}
            <div className="pl-fb-stat"><b>{items.filter((f) => f.session_type === 'game').length}</b><span>{L('ממשחקים', 'from games')}</span></div>
          </div>

          {groups.map((g) => (
            <section className="pl-fb-group" key={g.key}>
              <p className="pl-section-label">{g.label}</p>
              {g.list.map((f) => {
                const ctx = sessionContext(f)
                return (
                  <article key={f.id} className={`pl-fb ${ctx ? 'tone-' + ctx.tone : 'tone-accent'}`}>
                    <Avatar name={coachName(f.coach)} url={f.coach?.avatar_url} size={40} />
                    <div className="pl-fb-body">
                      <div className="pl-fb-head">
                        <strong>{coachName(f.coach)}</strong>
                        <span className="muted small">{timeAgo(f.created_at)}</span>
                      </div>
                      {ctx && (
                        <span className={`pl-fb-session ${ctx.tone}`}>
                          {ctx.tone === 'game' ? <Volleyball size={12} /> : <Dumbbell size={12} />} {ctx.label}
                        </span>
                      )}
                      {f.rating > 0 && (
                        <div className="pl-fb-stars" aria-label={L(`${f.rating} מתוך 5`, `${f.rating} of 5`)}>
                          {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={15} fill={n <= f.rating ? 'currentColor' : 'none'} />)}
                        </div>
                      )}
                      {f.content
                        ? <p className="pl-fb-text">{f.content}</p>
                        : <p className="pl-fb-text muted">{L('המאמן סימן נוכחות/דירוג לאימון הזה.', 'Your coach logged this session.')}</p>}
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
        </>
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
      const { data: sched } = await supabase
        .from('schedule_entries')
        .select('*')
        .eq('created_by', membership.coach_id)
        .eq('team', membership.team)
        .gte('date', today)
        .order('date').order('start_time')
        .limit(1)
      setNext(sched && sched[0] ? sched[0] : null)
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
    <div className="pl-screen">
      <h2 className="pl-h2">{L('הקבוצה שלי', 'My team')}</h2>
      <div className="pl-team-hero">
        <span className="pl-team-badge"><Trophy size={20} /></span>
        <div style={{ flex: 1 }}>
          <strong>{trTeam(membership.team)}</strong>
          <span className="muted small">{L('מאמן: ', 'Coach: ')}{coachName(membership.coach)}{membership.coach?.club ? ` · ${membership.coach.club}` : ''}</span>
        </div>
        <div className="pl-team-actions">
          <button className="btn-soft" style={{ marginTop: 0 }} onClick={() => onNavigate?.('teamchat')}><MessagesSquare size={15} /> {L('צ׳אט הקבוצה', 'Team chat')}</button>
          <button className="btn-soft" style={{ marginTop: 0 }} onClick={() => onNavigate?.('coach')}><MessageSquare size={15} /> {L('למאמן', 'Coach')}</button>
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

function PlayerSchedule({ membership }) {
  const [items, setItems] = useState(null)

  const load = useCallback(async () => {
    if (!membership) return
    const today = new Date().toISOString().slice(0, 10)
    const [{ data: slots }, { data: pr }, { data: gm }] = await Promise.all([
      supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
      supabase.from('schedule_entries').select('*, plan:training_plans(id, name)').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', today).order('date').order('start_time').limit(40),
      supabase.from('team_games').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', today).order('game_date').limit(40),
    ])
    const list = [
      // לו"ז קבוע (ימי אימון) — נגזר ל-30 הימים הקרובים
      ...expandSlots(slots || [], 0, 30).map((o) => ({ kind: 'practice', id: 's' + o.session_id, date: o.date, time: o.start_time, end: o.end_time, title: L('אימון', 'Practice'), location: o.location })),
      // אימונים חד-פעמיים/מיוחדים
      ...(pr || []).filter((e) => e.date).map((e) => ({ kind: 'practice', id: 'p' + e.id, date: e.date, time: e.start_time, end: e.end_time, title: e.plan?.name || L('אימון', 'Practice'), location: e.location })),
      ...(gm || []).map((g) => ({ kind: 'game', id: 'g' + g.id, date: g.game_date, time: g.game_time, title: g.opponent ? L(`נגד ${g.opponent}`, `vs ${g.opponent}`) : L('משחק', 'Game'), location: g.location })),
    ].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    setItems(list)
  }, [membership])

  useEffect(() => { load() }, [load])

  if (items === null) return <div className="app-loading" style={{ padding: 40 }}><div className="loader" /></div>

  const next = items[0] || null
  const rest = items.slice(1)
  // קיבוץ שאר האירועים לפי יום, בסדר עולה
  const dayMap = {}
  for (const it of rest) (dayMap[it.date] = dayMap[it.date] || []).push(it)
  const days = Object.keys(dayMap).sort()

  const evTime = (t) => {
    if (!t) return { h: '•', m: '' }
    const [h, m] = String(t).slice(0, 5).split(':')
    return { h, m: m ? `:${m}` : '' }
  }

  return (
    <div className="pl-screen pl-narrow">
      <PlHead Icon={CalendarDays} tone="blue"
        title={L('הלו״ז שלי', 'My schedule')}
        subtitle={L('כל האימונים והמשחקים הקרובים של הקבוצה', 'Your team’s upcoming practices and games')} />

      {items.length === 0 ? (
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
            <section className="pl-day-group" key={d}>
              <p className="pl-section-label"><CalendarDays size={14} /> {dayLabel(d)}</p>
              <ul className="pl-sched">
                {dayMap[d].map((it) => {
                  const t = evTime(it.time)
                  return (
                    <li key={it.id} className={`pl-ev ${it.kind}`}>
                      <span className="pl-ev-time"><b>{t.h}</b>{t.m && <i>{t.m}</i>}</span>
                      <div className="pl-ev-body">
                        <strong>{it.title}</strong>
                        {it.location && <span className="muted small"><MapPin size={12} /> {it.location}</span>}
                      </div>
                      <span className={`pl-sched-tag ${it.kind}`}>{it.kind === 'game' ? L('משחק', 'Game') : L('אימון', 'Practice')}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
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
    <div className="pl-screen">
      <h2 className="pl-h2">{L('סרטוני תרגול', 'Training videos')}</h2>
      {videos.length === 0 ? (
        <p className="muted small">{L('אין סרטונים כרגע.', 'No videos right now.')}</p>
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
                    <span className="pl-vid-play"><Play size={16} fill="#fff" /></span>
                  </span>
                  <span className="pl-vid-body">
                    <span className="pl-vid-title">{v.title}</span>
                    {v.category && <span className="pl-vid-cat" data-cat={v.category}>{v.category}</span>}
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
      const [{ data: slots }, { data: gm }, { data: se }, { data: gl }] = await Promise.all([
        supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
        supabase.from('team_games').select('id, game_date, opponent').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', from).lte('game_date', today).order('game_date', { ascending: false }),
        supabase.from('session_effort').select('session_id').eq('player_id', session.user.id),
        supabase.from('player_goals').select('id, title, period, status, target_value, progress_value, unit, player_id').in('period', ['week', 'month']),
      ])
      const rated = new Set((se || []).map((r) => r.session_id))
      const cands = [
        // מופעי הלו"ז הקבוע ב-3 הימים האחרונים (כולל היום)
        ...expandSlots(slots || [], -3, 0).map((o) => ({ session_id: o.session_id, session_type: 'practice', session_date: o.date, title: L('אימון', 'Practice') })),
        ...(gm || []).map((g) => ({ session_id: g.id, session_type: 'game', session_date: g.game_date, title: g.opponent ? L(`נגד ${g.opponent}`, `vs ${g.opponent}`) : L('משחק', 'Game') })),
      ].filter((c) => c.session_date && !rated.has(c.session_id)).sort((a, b) => b.session_date.localeCompare(a.session_date))
      const p = cands[0] || null
      setPending(p)
      setGoals(gl || [])
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
      const [asg, compl, fbCount, fbLatest, att, gatt] = await Promise.all([
        supabase.from('player_assignments').select('id'),
        supabase.from('assignment_completions').select('assignment_id, done_at').eq('player_id', session.user.id),
        supabase.from('player_feedback').select('id', { count: 'exact', head: true }).eq('player_id', session.user.id),
        supabase.from('player_feedback').select('content, rating, created_at, coach:profiles!coach_id(first_name, last_name, avatar_url)').eq('player_id', session.user.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('practice_attendance').select('status'),
        supabase.from('game_attendance').select('status'),
      ])
      const doneRows = compl.data || []
      const doneIds = new Set(doneRows.map((c) => c.assignment_id))
      const open = (asg.data || []).filter((a) => !doneIds.has(a.id)).length
      const attRows = [...(att.data || []), ...(gatt.data || [])]
      const attTotal = attRows.length
      const attPresent = attRows.filter((r) => r.status && r.status !== 'absent').length
      const attendancePct = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : null
      const weekly = doneRows.filter((c) => c.done_at && withinDays(c.done_at, 7)).length
      setStats({
        open, fb: fbCount.count || 0, attendancePct, weekly,
        latestFb: (fbLatest.data && fbLatest.data[0]) || null,
        progress: playerProgress({
          completedCount: doneRows.length,
          completionDates: doneRows.map((c) => c.done_at).filter(Boolean),
          attendancePct,
        }),
      })
    })()
  }, [session.user.id])

  const hour = new Date().getHours()
  const greet = hour < 12 ? L('בוקר טוב', 'Good morning') : hour < 18 ? L('צהריים טובים', 'Good afternoon') : L('ערב טוב', 'Good evening')
  const progress = stats?.progress || playerProgress({})

  return (
    <div className="pl-screen pl-home-rich">
      <header className="pl-hero pl-stagger">
        <span className="pl-hero-court" aria-hidden="true">🏀</span>
        <span className="pl-hero-date">{new Date().toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' })}</span>
        <h1>{greet}, <span className="hero-title-accent">{profile.first_name}</span>!</h1>
        {membership
          ? <p>{trTeam(membership.team)} · {coachName(membership.coach)}</p>
          : <p>{L('ברוך הבא לקורטסייד 🏀', 'Welcome to CourtSide 🏀')}</p>}
        <LevelStrip progress={progress} />
      </header>

      {!membership && (
        <div className="pl-stagger"><JoinTeam session={session} onJoined={onJoined} compact /></div>
      )}

      <div className="pl-stagger"><Countdown membership={membership} onNavigate={setView} /></div>

      {membership && <div className="pl-stagger"><EffortPrompt session={session} membership={membership} /></div>}

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

      <section className="pl-block pl-stagger">
        <p className="pl-section-label"><Trophy size={15} /> {L('ההישגים שלי', 'My badges')}</p>
        <BadgeRow badges={progress.badges} />
      </section>

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
      const progress = playerProgress({ completedCount: doneRows.length, completionDates: doneRows.map((c) => c.done_at).filter(Boolean), attendancePct })
      setSt({ done: doneRows.length, streak: computeStreak(doneRows.map((c) => c.done_at).filter(Boolean)), attendancePct, progress, earned: progress.badges.filter((b) => b.earned).length })
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
        <div className="pl-stat-grid">
          <div className="pl-stat"><b>{st.progress.level}</b><span>{L('רמה', 'Level')}</span></div>
          <div className="pl-stat"><b>{st.done}</b><span>{L('תרגילים', 'Drills')}</span></div>
          <div className="pl-stat"><b>{st.streak}🔥</b><span>{L('רצף', 'Streak')}</span></div>
          <div className="pl-stat"><b>{st.attendancePct != null ? `${st.attendancePct}%` : '—'}</b><span>{L('נוכחות', 'Attend.')}</span></div>
        </div>
      )}

      <button className="btn-soft" onClick={onEdit}>{L('עריכת פרטים', 'Edit details')}</button>

      {st && (
        <>
          <p className="pl-section-label" style={{ marginTop: 20 }}><Trophy size={15} /> {L(`הישגים · ${st.earned}/${st.progress.badges.length}`, `Badges · ${st.earned}/${st.progress.badges.length}`)}</p>
          <BadgeRow badges={st.progress.badges} />
        </>
      )}

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
  { id: 'teamchat', label: ['צ׳אט קבוצה', 'Team chat'], Icon: MessagesSquare, team: true },
  { id: 'feedback', label: ['משוב', 'Feedback'], Icon: MessageSquareHeart, team: true },
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
          ? <MyFeedback session={session} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('המשוב שלי', 'My feedback')}
              desc={L('משוב אישי מגיע מהמאמן שלך. הצטרפו לקבוצה כדי לקבל משוב.', 'Personal feedback comes from your coach. Join a team to receive feedback.')} />
      case 'goals':
        return hasTeam
          ? <MyGoals session={session} membership={membership} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('המטרות שלי', 'My goals')}
              desc={L('המאמן יגדיר לך מטרות ברגע שתצטרף לקבוצה. הצטרפו עם קוד מהמאמן.', 'Your coach sets goals once you join a team. Join with a code from your coach.')} />
      case 'schedule':
        return hasTeam
          ? <PlayerSchedule membership={membership} />
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
