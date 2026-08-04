import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import {
  Home as HomeIcon, Dumbbell, MessageSquareHeart, MonitorPlay, Users, User,
  Menu, X, Check, Clock, Star, CalendarDays, Users2, MessageSquare, MessagesSquare, Send,
  ShieldCheck, Hourglass, Trophy, Flame, Lock, Newspaper,
  Sparkles, Zap, Crown, CalendarCheck, Timer, Target, Play, ClipboardList,
  MapPin, ArrowLeft, Eye, Moon, Globe, LogOut, Pencil, UserCheck,
  MessageCircle, Copy, Link2, RefreshCw, AlertTriangle, Mail,
  Database, Download, FileJson, FileSpreadsheet, Info, ChevronDown,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam, cnt } from './i18n'
import useNavMarker from './useNavMarker'
import { ArrowFwd, ChevronFwd, ChevronBack } from './DirIcon'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import Avatar from './Avatar'
import Notifications from './Notifications'
import ProfileForm from './ProfileForm'
import ChangePassword from './ChangePassword'
import { FbReact } from './PlayerTimeline'
import PlayerCommunity from './PlayerCommunity'
import ErrorBoundary from './ErrorBoundary'
import DrillText from './DrillText'
import PlayerTeamHub from './PlayerTeamHub'
import { MyGoals, GoalChart } from './PlayerGoals'
import PlayerTimeline from './PlayerTimeline'
import FeedbackSheet, { MOOD_BY_KEY } from './FeedbackSheet'
import WeekList from './WeekList'
import BasketballIcon from './BasketballIcon'
import { requestJoinByCode, myMemberships } from './players'
import { waShare, copyText } from './share'
import {
  myConsentState, requestManageLink, isAdultPlayer, consentRequestError,
  consentManageShareText, CONSENT_TYPES, consentLabel, consentHelp, consentValueLabel,
  myDataExport, groupDataSections, summaryOnlyItems, exportGeneratedAt,
  dataSectionLabel, dataFieldLabel, dataValueText,
  exportToJsonText, exportToCsvText, exportFileName, downloadTextFile,
} from './consent'
import { computeStreak } from './gamify'
import { burstConfetti } from './confetti'
import { expandSlots, expandSlotsRange } from './sessionId'
import { safeUrl, COACHING_QUOTES, NEWS_SOURCES, NEWS_CACHE_KEY, VIDEO_CATEGORIES, PODCASTS } from './constants'
import { getYouTubeId, cleanVideoTitle } from './youtube'
import Logo from './Logo'
import { SkeletonCards, SkeletonMedia } from './Skeleton'
import { PendingBanner, sendParentLink } from './PendingApproval'

const WEEKLY_TARGET = 4 // תרגילים ליעד השבועי

// ============================================================
//  מצב מוגבל — קטין שההורה שלו עוד לא אישר
// ============================================================
// החשבון פתוח: אפשר להסתובב, לתקן פרטים ובעיקר להצטרף לקבוצה עם קוד —
// כי המאמן, שמכיר את המשפחה, הוא שומר הסף האנושי.
//
// מה שחסום הוא כתיבת *תוכן*, וזה נאכף בשרת ב-supabase_consent_enforcement.sql:
// מדיניות RESTRICTIVE על INSERT לכל טבלאות התוכן, עם is_active_user().
// מה שמוחרג שם במפורש — team_memberships, profiles, account_deletion_requests,
// client_errors וטבלאות ההסכמה — הוא בדיוק דרך המילוט, ולכן חייב להישאר
// פתוח גם כאן. הכלל בשני הכיוונים: לא להציע פעולה שהשרת ידחה (הילד יקבל
// שגיאת RLS גולמית), ולא לחסום פעולה שהשרת מתיר (נסגרת דרך המילוט).
export function isRestricted(profile) {
  return profile?.approval_status === 'pending_parent'
}

// ההקשר חוסך השחלת prop דרך עשר קומפוננטות מקוננות (כרטיס משימה, אישור
// הגעה, רצועת המשימות בבית) רק כדי להגיע לאותה שורת הסבר.
const RESTRICTED_OFF = { restricted: false, sendLink: () => {}, sending: false }
const RestrictedCtx = createContext(RESTRICTED_OFF)
function useRestricted() { return useContext(RestrictedCtx) }

// הסבר קצר לצד פעולה חסומה. תמיד עם אותו מוצא — שליחת הקישור להורה —
// כדי שהמסר יהיה «ככה פותחים את זה» ולא «אסור לך».
function RestrictedNote({ children, block = false }) {
  const { sendLink, sending } = useRestricted()
  const Tag = block ? 'div' : 'p'
  return (
    <Tag className={block ? 'rstr-note rstr-block' : 'rstr-note'} role="note">
      <Lock size={13} aria-hidden="true" />
      <span className="rstr-txt">
        {children}{' '}
        <button type="button" className="rstr-cta" onClick={sendLink} disabled={sending} aria-busy={sending}>
          {L('שליחת הקישור להורה', 'Send the link to my parent')}
        </button>
      </span>
    </Tag>
  )
}

// הסבר ברמת מסך, למסכים שהכתיבה בהם חיה בקומפוננטות אחרות (הצ'אטים,
// הקהילה, היעדים, מרכז הקבוצה). התוכן עצמו נשאר גלוי — *קריאה* מותרת.
const RESTRICTED_SCREEN = {
  coach: () => L('אפשר לקרוא כאן הכול, אבל שליחת הודעה למאמן נפתחת רק אחרי אישור ההורה.',
    'You can read everything here, but messaging your coach opens only after your parent approves.'),
  teamchat: () => L('אפשר לקרוא את צ׳אט הקבוצה, אבל הכתיבה בו נפתחת רק אחרי אישור ההורה.',
    'You can read the team chat, but writing in it opens only after your parent approves.'),
  community: () => L('אפשר לקרוא את הקהילה, אבל פרסום פוסט, תגובה או לייק נפתחים רק אחרי אישור ההורה.',
    'You can read the community, but posting, commenting and liking open only after your parent approves.'),
  goals: () => L('אפשר לראות את היעדים שלך, אבל הוספה ותיעוד התקדמות נפתחים רק אחרי אישור ההורה.',
    'You can see your goals, but adding one and logging progress open only after your parent approves.'),
  schedule: () => L('אפשר לראות את הקבוצה והלו״ז, אבל אישור הגעה וכתיבה בצ׳אט נפתחים רק אחרי אישור ההורה.',
    'You can see your team and schedule, but confirming attendance and chatting open only after your parent approves.'),
}
RESTRICTED_SCREEN.team = RESTRICTED_SCREEN.schedule

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

  // הגעה מלינק הצטרפות (#/join/CODE): הקוד כבר נשמר — שולחים את הבקשה לבד
  useEffect(() => {
    let pendingCode = null
    try { pendingCode = localStorage.getItem('pending_join_code') } catch { /* ignore */ }
    if (!pendingCode) return
    try { localStorage.removeItem('pending_join_code') } catch { /* ignore */ }
    setCode(pendingCode)
    ;(async () => {
      setBusy(true)
      const res = await requestJoinByCode(session.user.id, pendingCode)
      setBusy(false)
      if (res.ok) {
        setCode('')
        toast.success(res.status === 'approved'
          ? L('כבר אושרת לקבוצה!', "You're already approved!")
          : L('הבקשה נשלחה למאמן לאישור', 'Request sent to your coach'))
        if (res.status === 'approved') onJoined()
        else load()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id])

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
      <span className="pl-count-label"><Timer size={16} /> {started ? L('האימון עכשיו', 'Practice now') : L('האימון הבא', 'Next practice')}</span>
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
// תרגיל עם target_value מציג פס התקדמות ורישום הדרגתי (100 מתוך 200);
// תרגיל בלי יעד נשאר בוצע/לא-בוצע. compl = השורה שלי מ-assignment_completions.
function AssignmentCard({ a, compl, onToggleDone, onProgress }) {
  const [custom, setCustom] = useState('') // קלט "כמה עשיתי?"
  const [customOpen, setCustomOpen] = useState(false)
  // assignment_completions נמצאת ברשימת השערים בשרת — כל רישום ביצוע
  // או התקדמות יידחה ב-RLS, ולכן הכפתורים מושבתים ולא «נכשלים».
  const { restricted } = useRestricted()
  const done = compl?.done_at != null
  const prog = Number(compl?.progress_value) || 0
  const hasTarget = Number(a.target_value) > 0
  const drill = a.drill
  const yt = a.video_url ? getYouTubeId(a.video_url) : null
  const vidUrl = a.video_url ? safeUrl(a.video_url) : null
  const title = drill?.title || a.title || (a.plan ? a.plan.name : L('תרגיל', 'Drill'))
  const cat = drill?.category
  const desc = drill?.description || a.note
  const unitStr = a.unit ? ` ${a.unit}` : ''

  const logCustom = () => {
    const n = Number(custom)
    if (n > 0) onProgress(a, n)
    setCustom(''); setCustomOpen(false)
  }

  if (done) {
    return (
      <button className="pla done" onClick={() => onToggleDone(a.id, true)} aria-pressed="true" disabled={restricted}>
        <span className="pla-check on"><Check size={16} /></span>
        <span className="pla-done-body">
          <span className="pla-done-title">{title}{cat && <span className="cat-badge" data-cat={cat}>{cat}</span>}</span>
          <span className="muted small">
            {hasTarget
              ? L(`בוצע · ${prog}/${a.target_value}${unitStr} · אלוף!`, `Done · ${prog}/${a.target_value}${unitStr} · champ!`)
              : L('בוצע · כל הכבוד', 'Done · nice work')}
          </span>
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
      {desc && <DrillText text={desc} className="pla-desc" />}
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
      {hasTarget ? (
        <div className="pla-prog">
          <div className="pla-prog-top">
            <span>{L('ההתקדמות שלך', 'Your progress')}</span>
            <b dir="ltr">{prog}/{a.target_value}{unitStr}</b>
          </div>
          <div className="pla-prog-bar"><span style={{ width: `${Math.min(100, Math.round((prog / a.target_value) * 100))}%` }} /></div>
          <div className="pla-quick">
            <button onClick={() => onProgress(a, 10)} disabled={restricted}>+10</button>
            <button onClick={() => onProgress(a, 25)} disabled={restricted}>+25</button>
            {customOpen ? (
              <span className="pla-quick-custom">
                <input type="number" dir="ltr" min="1" autoFocus value={custom} onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') logCustom() }} placeholder="50" aria-label={L('כמה ביצעת?', 'How many did you do?')} />
                <button className="on" onClick={logCustom} aria-label={L('שמירת ערך', 'Save value')}><Check size={14} /></button>
              </span>
            ) : (
              <button onClick={() => setCustomOpen(true)} disabled={restricted}>{L('כמה עשיתי?', 'Log amount')}</button>
            )}
          </div>
          {/* תרגיל שנפתח מחדש כשההתקדמות כבר על היעד — דרך מפורשת לסמן שוב בוצע */}
          {prog >= Number(a.target_value) && (
            <button className="btn-primary pla-mark" onClick={() => onToggleDone(a.id, false)} disabled={restricted}>
              <Check size={17} /> {L('סמן כבוצע', 'Mark done')}
            </button>
          )}
        </div>
      ) : (
        <button className="btn-primary pla-mark" onClick={() => onToggleDone(a.id, false)} disabled={restricted}>
          <Check size={17} /> {L('סמן כבוצע', 'Mark done')}
        </button>
      )}
      {restricted && (
        <RestrictedNote>
          {L('אפשר לקרוא את התרגיל ולבצע אותו — רישום הביצוע באפליקציה נפתח אחרי שההורה יאשר.',
             'You can read the drill and do it — logging it in the app opens once your parent approves.')}
        </RestrictedNote>
      )}
    </article>
  )
}

// ---------- מסך: התרגילים שלי (עם סינון והתקדמות, כולל התקדמות חלקית) ----------
function MyAssignments({ session }) {
  const [items, setItems] = useState(null)
  const [complBy, setComplBy] = useState({}) // assignment_id -> { progress_value, done_at }
  const [filter, setFilter] = useState('open') // open | all | done

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('player_assignments')
      .select('*, drill:drills(id, title, category, description, duration_minutes), plan:training_plans(id, name)')
      .order('created_at', { ascending: false })
      .limit(100)
    // 1.6 — משימות מאורכבות יורדות מהמסך של השחקן (סובלני אם העמודה חסרה)
    setItems((data || []).filter((a) => (a.status || 'active') !== 'archived'))
    // fallback לסכמה ישנה (לפני supabase_assignments_progress.sql): בלי progress_value
    let { data: compl, error } = await supabase
      .from('assignment_completions')
      .select('assignment_id, done_at, progress_value')
      .eq('player_id', session.user.id)
    if (error) {
      const legacy = await supabase.from('assignment_completions')
        .select('assignment_id, done_at').eq('player_id', session.user.id)
      compl = (legacy.data || []).map((c) => ({ ...c, progress_value: 0 }))
    }
    const by = {}
    for (const c of compl || []) by[c.assignment_id] = { progress_value: Number(c.progress_value) || 0, done_at: c.done_at }
    setComplBy(by)
  }, [session.user.id])
  useEffect(() => { load() }, [load])

  const isDone = (a) => complBy[a.id]?.done_at != null
  // תרגיל שסומן בוצע נספר 1 גם אם progress נמוך מהיעד (למשל סימון מגרסה ישנה של האפליקציה)
  const frac = (a) => isDone(a) ? 1 : (Number(a.target_value) > 0
    ? Math.min(1, (complBy[a.id]?.progress_value || 0) / a.target_value)
    : 0)

  // תרגיל בוצע/לא-בוצע (בלי יעד), או פתיחה מחדש של תרגיל עם יעד (שומרת את ההתקדמות)
  const toggleDone = async (id, wasDone) => {
    const a = items.find((x) => x.id === id)
    const keepProgress = Number(a?.target_value) > 0
    if (wasDone) {
      setComplBy((m) => ({ ...m, [id]: { progress_value: keepProgress ? (m[id]?.progress_value || 0) : 0, done_at: null } }))
      if (keepProgress) {
        await supabase.from('assignment_completions').upsert({ assignment_id: id, player_id: session.user.id, done_at: null })
      } else {
        await supabase.from('assignment_completions').delete().eq('assignment_id', id).eq('player_id', session.user.id)
      }
    } else {
      setComplBy((m) => ({ ...m, [id]: { progress_value: m[id]?.progress_value || 0, done_at: 'x' } }))
      await supabase.from('assignment_completions').upsert({ assignment_id: id, player_id: session.user.id, done_at: new Date().toISOString() })
      toast.success(L('כל הכבוד! 💪', 'Nice work! 💪'))
      burstConfetti()
    }
  }

  // רישום התקדמות הדרגתי — delta חיובי, נחתך ליעד; בהגעה ליעד מסומן בוצע אוטומטית.
  // כשכבר עומדים על היעד (תרגיל שנפתח מחדש) אסור לצאת מוקדם — הלחיצה מסמנת שוב בוצע.
  const addProgress = async (a, delta) => {
    const cur = complBy[a.id]?.progress_value || 0
    const next = Math.max(0, Math.min(Number(a.target_value), cur + delta))
    const reached = next >= Number(a.target_value)
    if (next === cur && !reached) return
    const done_at = reached ? new Date().toISOString() : null
    setComplBy((m) => ({ ...m, [a.id]: { progress_value: next, done_at } }))
    const { error } = await supabase.from('assignment_completions')
      .upsert({ assignment_id: a.id, player_id: session.user.id, progress_value: next, done_at })
    if (error) { toast.error(L('השמירה נכשלה', 'Save failed')); load(); return }
    if (reached) { toast.success(L('סיימת את התרגיל! 🎉', 'Drill complete! 🎉')); burstConfetti() }
    else toast.success(L(`נרשם! ${next}/${a.target_value}`, `Logged! ${next}/${a.target_value}`))
  }

  // שלד תואם-צורה במקום ספינר — הרשימה לא קופצת מריק למלא
  if (items === null) return <SkeletonCards count={3} lines={2} />
  const openCount = items.filter((a) => !isDone(a)).length
  const doneCount = items.length - openCount
  // האחוז מחשיב גם התקדמות חלקית — 100 מתוך 200 שווה חצי תרגיל
  const pct = items.length ? Math.round((items.reduce((s, a) => s + frac(a), 0) / items.length) * 100) : 0
  const shown = items.filter((a) => filter === 'all' ? true : filter === 'done' ? isDone(a) : !isDone(a))

  return (
    <div className="pl-screen pl-narrow">
      <PlHead Icon={Dumbbell} tone="green"
        title={L('המשימות שלי', 'My tasks')}
        subtitle={L('מה שהמאמן שלח לך · תרגילים, סרטונים ויעדים', 'What your coach sent you · drills, videos and goals')} />
      {items.length > 0 && (
        <div className="pla-progress">
          <div className="pla-progress-top">
            <span>{L('ההתקדמות שלך', 'Your progress')}</span>
            {/* X/Y בתוך טקסט עברי — dir="ltr" כדי שהסלאש לא יתהפך (חוק RTL) */}
            <b dir="ltr">{doneCount}/{items.length}</b>
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
        <p className="muted small" style={{ padding: '10px 2px' }}>{filter === 'done' ? L('עוד לא סימנת תרגילים כבוצעו.', 'No drills marked done yet.') : L('אין תרגילים פתוחים — כל הכבוד!', 'No open drills — nice!')}</p>
      ) : (
        shown.map((a) => <AssignmentCard key={a.id} a={a} compl={complBy[a.id]} onToggleDone={toggleDone} onProgress={addProgress} />)
      )}
    </div>
  )
}

// ---------- מסך: הקבוצה שלי ----------
const MOOD_LABEL = { tough: ['קשה', 'Tough'], good: ['טוב', 'Good'], great: ['מצוין', 'Great'] }

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
                      {r.mood && MOOD_LABEL[r.mood] ? `${L(MOOD_LABEL[r.mood][0], MOOD_LABEL[r.mood][1])} · ` : ''}
                      {r.session_type === 'game' ? L('משחק', 'Game') : L('אימון', 'Practice')}
                      {r.session_date ? ` · ${new Date(r.session_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'short', day: 'numeric', month: 'numeric' })}` : ''}
                    </span>
                    {isMvp ? <span className="pl-recap-mvp"><Trophy size={14} /> {L('היית ה-MVP!', "You were MVP!")}</span>
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

// עזרי שבוע לרשימה השבועית (1.2) — מקומיים, בלי UTC כדי לא לזלוג יום
const wkPad = (n) => String(n).padStart(2, '0')
const wkYmd = (d) => `${d.getFullYear()}-${wkPad(d.getMonth() + 1)}-${wkPad(d.getDate())}`
const wkSunday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x }
const wkAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// 1.3 — אישור הגעה על כרטיס אימון ברשימה השבועית. אותה טבלה (practice_rsvp)
// כמו הרצועה בבית — היעדר שורה = טרם ענה; 'לא אגיע' פותח שדה סיבה.
function RsvpButtons({ session, membership, sessionId, sessionDate }) {
  const [mine, setMine] = useState(undefined) // undefined=טוען/לא זמין, null=טרם ענה
  const [busy, setBusy] = useState(false)
  const [askReason, setAskReason] = useState(false)
  const [reason, setReason] = useState('')
  // practice_rsvp ברשימת השערים בשרת — תשובת הגעה של חשבון מוגבל תידחה
  const { restricted } = useRestricted()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('practice_rsvp')
        .select('response').eq('session_id', sessionId).eq('player_id', session.user.id).maybeSingle()
      if (!alive) return
      // הטבלה טרם נוצרה — הכפתורים לא מוצגים, כמו שאר הפיצ'רים התלויים ב-SQL
      if (error) { setMine(undefined); return }
      setMine(data?.response || null)
    })()
    return () => { alive = false }
  }, [sessionId, session.user.id])

  const answer = async (response, withReason) => {
    if (busy) return
    setBusy(true)
    const row = {
      coach_id: membership.coach_id, team: membership.team,
      session_id: sessionId, session_date: sessionDate,
      player_id: session.user.id, response,
    }
    let { error } = await supabase.from('practice_rsvp')
      .upsert({ ...row, reason: response === 'no' ? (withReason || null) : null }, { onConflict: 'session_id,player_id' })
    if (error) ({ error } = await supabase.from('practice_rsvp').upsert(row, { onConflict: 'session_id,player_id' }))
    setBusy(false)
    if (error) { toast.error(L('לא הצלחנו לשמור — נסה שוב', "Couldn't save — try again")); return }
    setMine(response)
    setAskReason(false)
    toast.success(response === 'yes'
      ? L('רשמנו שאתה מגיע', "You're marked as coming")
      : L('רשמנו שלא תגיע — המאמן יראה', "You're marked as not coming — your coach will see"))
  }

  if (!membership || mine === undefined) return null
  return (
    <div className="wl-rsvp">
      <span className="wl-rsvp-q">
        {mine === 'yes' ? L('אישרת הגעה', "You're coming")
          : mine === 'no' ? L('הודעת שלא תגיע', "You're not coming")
          : L('מגיע לאימון?', 'Coming to practice?')}
      </span>
      <div className="plh-rsvp-btns">
        <button type="button" className={mine === 'yes' ? 'plh-rsvp-btn yes on' : 'plh-rsvp-btn yes'}
          onClick={() => answer('yes')} disabled={busy || restricted} aria-pressed={mine === 'yes'}>
          {L('מגיע', 'Coming')}
        </button>
        <button type="button" className={mine === 'no' ? 'plh-rsvp-btn no on' : 'plh-rsvp-btn no'}
          onClick={() => setAskReason((v) => !v)} disabled={busy || restricted} aria-pressed={mine === 'no'}>
          {L('לא אגיע', "Can't make it")}
        </button>
      </div>
      {restricted && (
        <RestrictedNote>
          {L('אישור הגעה נשמר אצל המאמן, ולכן הוא נפתח רק אחרי אישור ההורה.',
             'Your attendance answer is saved with your coach, so it opens only after your parent approves.')}
        </RestrictedNote>
      )}
      {askReason && (
        <div className="plh-rsvp-reason">
          <input
            type="text"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder={L('למה? (לא חובה) — למשל: שיעור, פציעה...', 'Why? (optional) — e.g. class, injury...')}
            onKeyDown={(e) => { if (e.key === 'Enter') answer('no', reason.trim()) }}
          />
          <button type="button" className="plh-rsvp-btn no" disabled={busy} onClick={() => answer('no', reason.trim())}>
            {L('שליחה', 'Send')}
          </button>
        </div>
      )}
    </div>
  )
}

function PlayerSchedule({ session, membership }) {
  const [items, setItems] = useState(null)
  const [slotRows, setSlotRows] = useState([])
  const [weekStart, setWeekStart] = useState(() => wkSunday(new Date()))
  const [weekData, setWeekData] = useState({ entries: [], games: [] })
  const me = session.user.id

  // אירועי השבוע המוצג — נטענים מחדש בניווט בין שבועות
  useEffect(() => {
    if (!membership) return
    ;(async () => {
      const from = wkYmd(weekStart)
      const to = wkYmd(wkAdd(weekStart, 6))
      const [{ data: pr }, { data: gm }] = await Promise.all([
        supabase.from('schedule_entries').select('*, plan:training_plans(id, name)').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', from).lte('date', to),
        supabase.from('team_games').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', from).lte('game_date', to),
      ])
      setWeekData({ entries: pr || [], games: gm || [] })
    })()
  }, [membership, weekStart])

  const load = useCallback(async () => {
    if (!membership) return
    const today = new Date().toISOString().slice(0, 10)
    const [{ data: slots }, { data: pr }, { data: gm }] = await Promise.all([
      supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
      supabase.from('schedule_entries').select('*, plan:training_plans(id, name)').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', today).order('date').order('start_time').limit(40),
      supabase.from('team_games').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', today).order('game_date').limit(40),
    ])
    const list = [
      ...expandSlots(slots || [], 0, 30).map((o) => ({ kind: 'practice', id: 's' + o.session_id, date: o.date, time: o.start_time, end: o.end_time, title: L('אימון קבוצתי', 'Team practice'), location: o.location })),
      ...(pr || []).filter((e) => e.date).map((e) => ({ kind: 'practice', id: 'p' + e.id, date: e.date, time: e.start_time, end: e.end_time, title: e.plan?.name || L('אימון קבוצתי', 'Team practice'), location: e.location })),
      ...(gm || []).map((g) => ({ kind: 'game', id: 'g' + g.id, date: g.game_date, time: g.game_time, title: g.opponent ? L(`נגד ${g.opponent}`, `vs ${g.opponent}`) : L('משחק', 'Game'), location: g.location })),
    ].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    setItems(list)
    setSlotRows(slots || [])
  }, [membership])

  useEffect(() => { load() }, [load])

  if (items === null) return <SkeletonCards count={3} lines={1} />

  const next = items[0] || null

  // 1.2 — כל אירועי השבוע המוצג, מנורמלים לרכיב הרשימה המשותף
  const weekOccs = expandSlotsRange(slotRows, weekStart, wkAdd(weekStart, 6))
  const weekDays = Array.from({ length: 7 }, (_, i) => wkAdd(weekStart, i)).map((d) => {
    const ds = wkYmd(d)
    return {
      date: ds,
      items: [
        ...weekOccs.filter((o) => o.date === ds).map((o) => ({
          key: 's' + o.session_id, session_id: o.session_id, kind: 'practice', date: ds,
          start_time: o.start_time, end_time: o.end_time, team: o.team, location: o.location, plan: null, recurring: true,
        })),
        ...weekData.entries.filter((e) => e.date === ds).map((e) => ({
          key: 'e' + e.id, session_id: e.id, kind: 'practice', date: ds,
          start_time: e.start_time, end_time: e.end_time, team: e.team, location: e.location, plan: e.plan,
        })),
        ...weekData.games.filter((g) => g.game_date === ds).map((g) => ({
          key: 'g' + g.id, session_id: g.id, kind: 'game', date: ds,
          start_time: g.game_time, end_time: null, team: g.team, location: g.location, opponent: g.opponent,
        })),
      ],
    }
  })
  const wkA = weekStart
  const wkB = wkAdd(weekStart, 6)
  const weekLabel = `${wkA.getDate()}.${wkA.getMonth() + 1} – ${wkB.getDate()}.${wkB.getMonth() + 1}.${wkB.getFullYear()}`

  return (
    <div className="pl-screen pl-narrow">
      <PlHead Icon={CalendarDays} tone="blue"
        title={L('הלו״ז שלי', 'My schedule')}
        subtitle={L('אימונים ומשחקים · שבוע אחרי שבוע', 'Practices and games · week by week')} />

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
              
              <span className="pl-next-up-label">{next.kind === 'game' ? <BasketballIcon size={13} /> : <Flame size={13} />} {L('הבא בתור', 'Next up')}</span>
              <h3>{next.title}</h3>
              <div className="pl-next-up-meta">
                <span><CalendarDays size={15} /> {dayLabel(next.date)}</span>
                {next.time && <span><Clock size={15} /> {String(next.time).slice(0, 5)}</span>}
                {next.location && <span><MapPin size={15} /> {next.location}</span>}
                <span className="pl-next-up-kind">{next.kind === 'game' ? L('משחק', 'Game') : L('אימון', 'Practice')}</span>
              </div>
            </div>
          )}

          {/* 1.2 — הרשימה השבועית המשותפת, עם ניווט בין שבועות */}
          <section className="pls-grid-sec">
            <div className="wl-nav">
              <button type="button" className="icon-btn" onClick={() => setWeekStart(wkAdd(weekStart, -7))} aria-label={L('שבוע קודם', 'Previous week')}>
                <ChevronBack size={18} />
              </button>
              <button type="button" className="btn-ghost wl-nav-today" onClick={() => setWeekStart(wkSunday(new Date()))}>
                {L('היום', 'Today')}
              </button>
              <button type="button" className="icon-btn" onClick={() => setWeekStart(wkAdd(weekStart, 7))} aria-label={L('שבוע הבא', 'Next week')}>
                <ChevronFwd size={18} />
              </button>
              <span className="wl-nav-label" dir="ltr">{weekLabel}</span>
            </div>
            <WeekList
              days={weekDays}
              isCoach={false}
              renderActions={(ev) =>
                ev.kind === 'practice' && ev.date >= wkYmd(new Date()) ? (
                  <RsvpButtons session={session} membership={membership} sessionId={ev.session_id} sessionDate={ev.date} />
                ) : null
              }
            />
          </section>

          {/* 1.8 — «אימונים שהיו» ירד מהלו"ז הפעיל; הארכיון המלא נמצא
              ב«האימונים שלי» (PlayerTimeline). */}
        </>
      )}

    </div>
  )
}

// ---------- מסך: וידאו (סינון לפי קטגוריה + נגן מוטמע) ----------
const PAGE = 12 // כמה סרטונים מוצגים בכל פעם

function PlayerVideos() {
  const [videos, setVideos] = useState(null)
  const [cat, setCat] = useState('all')
  const [playing, setPlaying] = useState(null) // {id(yt), title}
  const [limit, setLimit] = useState(PAGE) // הצגה מדורגת — 40 סרטונים בבת אחת זה קיר
  const [allOpen, setAllOpen] = useState(false) // false = מדף המומלצים (אם יש)
  const [mediaMode, setMediaMode] = useState('videos') // 1.11 — מתג סרטונים/פודקאסטים

  useEffect(() => {
    ;(async () => {
      let { data, error } = await supabase
        .from('drill_videos')
        .select('id, title, category, url, note, featured')
        .order('created_at', { ascending: false })
        .limit(120)
      if (error) {
        // עמודת featured עוד לא קיימת (SQL לא רץ) — נופלים לשליפה הישנה
        const legacy = await supabase.from('drill_videos')
          .select('id, title, category, url, note')
          .order('created_at', { ascending: false }).limit(120)
        data = legacy.data
      }
      setVideos(data || [])
    })()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setPlaying(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (videos === null) return <SkeletonMedia count={6} />

  // מדף "המאמן ממליץ": אם יש סרטונים מסומנים בכוכב, ברירת המחדל היא המדף
  // הקטן — לא קיר של 106 סרטונים. "כל הסרטונים" פותח את הספרייה המלאה.
  const featured = videos.filter((v) => v.featured)
  const shelfMode = featured.length > 0 && !allOpen && cat === 'all'
  const cats = ['all', ...VIDEO_CATEGORIES.filter((c) => videos.some((v) => v.category === c))]
  const pool = shelfMode ? featured : videos
  const shown = cat === 'all' ? pool : pool.filter((v) => v.category === cat)
  const visible = shelfMode ? shown : shown.slice(0, limit)

  return (
    <div className="pl-screen pl-narrow">
      <PlHead Icon={MonitorPlay} tone="blue"
        title={L('מדיה', 'Media')}
        subtitle={L('סרטונים ופודקאסטים שנבחרו בשבילך', 'Videos and podcasts picked for you')} />
      {/* 1.11 — מתג סרטונים/פודקאסטים, אותה פריסה כמו אצל המאמן */}
      <div className="tabs md-tabs">
        <button type="button" className={mediaMode === 'videos' ? 'tab active' : 'tab'}
          aria-pressed={mediaMode === 'videos'} onClick={() => setMediaMode('videos')}>
          <Play size={15} aria-hidden="true" /> {L('סרטונים', 'Videos')}
        </button>
        <button type="button" className={mediaMode === 'podcasts' ? 'tab active' : 'tab'}
          aria-pressed={mediaMode === 'podcasts'} onClick={() => setMediaMode('podcasts')}>
          {L('פודקאסטים', 'Podcasts')}
        </button>
      </div>
      {mediaMode === 'podcasts' ? (
        <div className="podcast-grid podcast-grid-full" style={{ marginTop: 12 }}>
          {PODCASTS.map((p) => (
            <a key={p.title} className="podcast-card" href={p.url} target="_blank" rel="noreferrer">
              <div className="podcast-body">
                <div className="podcast-top">
                  <span className="podcast-title">{p.title}</span>
                  <span className="podcast-lang">{p.lang}</span>
                </div>
                <span className="podcast-desc">{p.desc}</span>
                <span className="podcast-open">{L('פתח בספוטיפיי', 'Open in Spotify')}</span>
              </div>
            </a>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <span className="empty-ic"><MonitorPlay size={26} /></span>
          <div className="empty-title">{L('אין סרטונים כרגע', 'No videos yet')}</div>
          <p className="muted small">{L('המאמן יוסיף כאן סרטוני תרגול — לפי קטגוריות.', 'Your coach will add training videos here, by category.')}</p>
        </div>
      ) : (
        <>
          {shelfMode ? (
            <p className="pl-shelf-label"><Star size={14} fill="currentColor" /> {L('המאמן ממליץ', 'Coach recommends')}</p>
          ) : (
            <div className="pl-cat-chips">
              {cats.map((c) => (
                <button key={c} className={cat === c ? 'pl-chip active' : 'pl-chip'}
                  onClick={() => { setCat(c); setLimit(PAGE) }}>
                  {c === 'all' ? L('הכל', 'All') : c}
                </button>
              ))}
            </div>
          )}
          <div className="pl-vid-grid">
            {visible.map((v) => {
              const yt = getYouTubeId(v.url)
              return (
                <button key={v.id} className="pl-vid" onClick={() => yt ? setPlaying({ id: yt, title: v.title }) : window.open(safeUrl(v.url) || '#', '_blank')}>
                  <span className="pl-vid-thumb" style={yt ? { backgroundImage: `url("https://img.youtube.com/vi/${yt}/hqdefault.jpg")` } : undefined}>
                    <span className="pl-vid-play"><Play size={18} fill="#fff" /></span>
                  </span>
                  <span className="pl-vid-body">
                    {/* dir=auto — כותרות באנגלית בתוך עמוד RTL הציגו סימני פיסוק בצד הלא נכון */}
                    <span className="pl-vid-title" dir="auto">{cleanVideoTitle(v.title)}</span>
                    {v.category && <span className="cat-badge" data-cat={v.category}>{v.category}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          {shelfMode ? (
            <button type="button" className="pl-more" onClick={() => setAllOpen(true)}>
              {L(`לכל הסרטונים (${videos.length})`, `All videos (${videos.length})`)}
            </button>
          ) : (
            <>
              {featured.length > 0 && (
                <button type="button" className="pl-more pl-back-shelf" onClick={() => { setAllOpen(false); setCat('all') }}>
                  <Star size={14} fill="currentColor" /> {L('חזרה למומלצים של המאמן', "Back to coach's picks")}
                </button>
              )}
              {shown.length > limit && (
                <button type="button" className="pl-more" onClick={() => setLimit((l) => l + PAGE)}>
                  {L(`עוד סרטונים (${shown.length - limit})`, `More videos (${shown.length - limit})`)}
                </button>
              )}
            </>
          )}
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

// ---------- היעדים לאימון הקרוב — מופיעות בבית לפני האימון ----------
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
          <strong>{L('היעדים שלך לאימון הקרוב', 'Your goals for the next practice')}</strong>
          <span className="muted small">{L('תגיע לאימון כשאתה יודע על מה אתה עובד. בסוף האימון תסמן אם עמדת בהן.', 'Arrive knowing what you’re working on. Mark them at wrap-up.')}</span>
          <div className="pl-pregoals-chips">
            {goals.map((g) => <span key={g.id} className="pl-pregoal">{g.title}</span>)}
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------- בית: כרטיס-הירו עם ספירה לאחור לאימון הבא + CTA לסיכום ----------
// ---------- בית: אישור הגעה לאימון הבא (מסך 3b) ----------
// כותב ל-practice_rsvp: היעדר שורה = «טרם ענה», ולכן אין מה ליצור מראש.
function HomeRsvp({ session, membership, next }) {
  const [mine, setMine] = useState(undefined) // undefined=טוען/לא זמין, null=טרם ענה
  const [busy, setBusy] = useState(false)
  // §6 — «לא אוכל» פותח שדה סיבה במלל חופשי שהמאמן רואה
  const [askReason, setAskReason] = useState(false)
  const [reason, setReason] = useState('')
  // אותו שער כמו ב-RsvpButtons — practice_rsvp חסומה לחשבון מוגבל
  const { restricted } = useRestricted()
  const sessionId = next?.session_id

  useEffect(() => {
    if (!sessionId) { setMine(undefined); return }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('practice_rsvp')
        .select('response').eq('session_id', sessionId).eq('player_id', session.user.id).maybeSingle()
      if (!alive) return
      // הטבלה טרם נוצרה — הבלוק פשוט לא מוצג, כמו שאר הפיצ'רים התלויים ב-SQL
      if (error) { setMine(undefined); return }
      setMine(data?.response || null)
    })()
    return () => { alive = false }
  }, [sessionId, session.user.id])

  const answer = async (response, withReason) => {
    if (!sessionId || busy) return
    setBusy(true)
    const row = {
      coach_id: membership.coach_id, team: membership.team,
      session_id: sessionId, session_date: next.date,
      player_id: session.user.id, response,
    }
    // הסיבה נשלחת רק אם העמודה קיימת (supabase_todo_31_7.sql). אם השמירה
    // איתה נכשלת — מנסים בלעדיה, כדי שהתשובה עצמה לא תלך לאיבוד.
    let { error } = await supabase.from('practice_rsvp')
      .upsert({ ...row, reason: response === 'no' ? (withReason || null) : null }, { onConflict: 'session_id,player_id' })
    if (error) ({ error } = await supabase.from('practice_rsvp').upsert(row, { onConflict: 'session_id,player_id' }))
    setBusy(false)
    if (error) { toast.error(L('לא הצלחנו לשמור — נסה שוב', "Couldn't save — try again")); return }
    setMine(response)
    setAskReason(false)
    toast.success(response === 'yes'
      ? L('רשמנו שאתה מגיע', "You're marked as coming")
      : L('רשמנו שלא תגיע — המאמן יראה', "You're marked as not coming — your coach will see"))
  }

  if (!membership || !sessionId || mine === undefined) return null
  return (
    <div className="plh-rsvp">
      <div className="plh-rsvp-tx">
        {/* «מגיע היום?» / «מגיע מחר?» / «מגיע יום שלישי, 5.8?» — העיצוב
            מנסח את השאלה ביחס ליום האימון, לא כשאלה כללית על «האימון הבא». */}
        <strong>{L(`מגיע ${dayLabel(next.date)}?`, `Coming ${dayLabel(next.date)}?`)}</strong>
        <span>{L('המאמן רואה את התשובה מיד', 'Your coach sees the answer right away')}</span>
      </div>
      <div className="plh-rsvp-btns">
        <button type="button" className={mine === 'yes' ? 'plh-rsvp-btn yes on' : 'plh-rsvp-btn yes'}
          onClick={() => answer('yes')} disabled={busy || restricted} aria-pressed={mine === 'yes'}>
          {L('מגיע', 'Coming')}
        </button>
        <button type="button" className={mine === 'no' ? 'plh-rsvp-btn no on' : 'plh-rsvp-btn no'}
          onClick={() => setAskReason((v) => !v)} disabled={busy || restricted} aria-pressed={mine === 'no'}>
          {L('לא אוכל', "Can't make it")}
        </button>
      </div>
      {restricted && (
        <RestrictedNote>
          {L('אישור הגעה נשמר אצל המאמן, ולכן הוא נפתח רק אחרי אישור ההורה.',
             'Your attendance answer is saved with your coach, so it opens only after your parent approves.')}
        </RestrictedNote>
      )}
      {askReason && (
        <div className="plh-rsvp-reason">
          <input
            type="text"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder={L('למה? (לא חובה) — למשל: שיעור, פציעה...', 'Why? (optional) — e.g. class, injury...')}
            onKeyDown={(e) => { if (e.key === 'Enter') answer('no', reason.trim()) }}
          />
          <button type="button" className="plh-rsvp-btn no" disabled={busy} onClick={() => answer('no', reason.trim())}>
            {L('שליחה', 'Send')}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- בית: ארבעת המספרים בתוך הבאנר (מסך 3b) ----------
function HeroStats({ stats, setView }) {
  // ב-RTL הפריט הראשון ב-DOM הוא הימני ביותר. בעיצוב הימני הוא «נוכחות»
  // והשמאלי «משובים» — לכן הסדר כאן הפוך מסדר הקריאה במסך.
  const tiles = [
    { k: 'att', num: stats?.attendancePct != null ? stats.attendancePct + '%' : '—', lbl: L('נוכחות', 'Attendance'), go: 'schedule' },
    { k: 'load', num: stats?.avgLoad ?? '—', lbl: L('עומס ממוצע', 'Avg load'), go: 'feedback' },
    { k: 'open', num: stats?.open ?? 0, lbl: L('משימות', 'Tasks'), go: 'drills', hot: true },
    { k: 'fb', num: stats?.fbCount ?? 0, lbl: L('משובים', 'Feedback'), go: 'feedback' },
  ]
  return (
    <div className="plh-stats">
      {tiles.map((t) => (
        <button key={t.k} type="button" className="plh-stat" onClick={() => setView(t.go)}>
          <b className={t.hot ? 'hot' : ''} dir="ltr">{t.num}</b>
          <span>{t.lbl}</span>
        </button>
      ))}
    </div>
  )
}

// ---------- בית: «השבוע שלי» — שלושת האירועים הבאים (מסך 3b) ----------
// 1.12 — הלו"ז השבועי הגדול בבית: רכיב הרשימה המשותף (1.2) לשבוע הנוכחי,
// כולל כפתורי אישור הגעה על אימונים קרובים.
function HomeWeek({ session, membership, setView }) {
  const [days, setDays] = useState(null)
  useEffect(() => {
    if (!membership) return
    let alive = true
    ;(async () => {
      const ws = wkSunday(new Date())
      const from = wkYmd(ws)
      const to = wkYmd(wkAdd(ws, 6))
      const [{ data: slots }, { data: pr }, { data: gm }] = await Promise.all([
        supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
        supabase.from('schedule_entries').select('*, plan:training_plans(id, name)').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', from).lte('date', to),
        supabase.from('team_games').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', from).lte('game_date', to),
      ])
      if (!alive) return
      const occs = expandSlotsRange(slots || [], ws, wkAdd(ws, 6))
      setDays(Array.from({ length: 7 }, (_, i) => wkAdd(ws, i)).map((d) => {
        const ds = wkYmd(d)
        return {
          date: ds,
          items: [
            ...occs.filter((o) => o.date === ds).map((o) => ({
              key: 's' + o.session_id, session_id: o.session_id, kind: 'practice', date: ds,
              start_time: o.start_time, end_time: o.end_time, team: o.team, location: o.location, plan: null, recurring: true,
            })),
            ...(pr || []).filter((e) => e.date === ds).map((e) => ({
              key: 'e' + e.id, session_id: e.id, kind: 'practice', date: ds,
              start_time: e.start_time, end_time: e.end_time, team: e.team, location: e.location, plan: e.plan,
            })),
            ...(gm || []).filter((g) => g.game_date === ds).map((g) => ({
              key: 'g' + g.id, session_id: g.id, kind: 'game', date: ds,
              start_time: g.game_time, end_time: null, team: g.team, location: g.location, opponent: g.opponent,
            })),
          ],
        }
      }))
    })()
    return () => { alive = false }
  }, [membership])

  if (!membership || !days) return null
  return (
    <section className="pl-block">
      <div className="plhg-head">
        <p className="pl-section-label"><CalendarDays size={15} /> {L('הלו״ז השבועי', 'This week')}</p>
        <button className="plhg-all" onClick={() => setView('schedule')}>{L('ללו״ז המלא', 'Full schedule')} <ArrowFwd size={14} /></button>
      </div>
      <WeekList
        days={days}
        isCoach={false}
        renderActions={(ev) =>
          ev.kind === 'practice' && ev.date >= wkYmd(new Date()) ? (
            <RsvpButtons session={session} membership={membership} sessionId={ev.session_id} sessionDate={ev.date} />
          ) : null
        }
      />
    </section>
  )
}

// 1.12 — רצועת סרטונים בתחתית הבית: 4–6 מובילים מהמדיה, לחיצה מובילה למדיה
function HomeVideos({ setView }) {
  const [vids, setVids] = useState(null)
  useEffect(() => {
    ;(async () => {
      let { data, error } = await supabase.from('drill_videos')
        .select('id, title, url, featured').order('created_at', { ascending: false }).limit(30)
      if (error) {
        const legacy = await supabase.from('drill_videos')
          .select('id, title, url').order('created_at', { ascending: false }).limit(30)
        data = legacy.data
      }
      const rows = data || []
      const featured = rows.filter((v) => v.featured)
      setVids((featured.length >= 4 ? featured : rows).slice(0, 6))
    })()
  }, [])
  if (!vids || vids.length === 0) return null
  return (
    <section className="pl-block">
      <div className="plhg-head">
        <p className="pl-section-label"><MonitorPlay size={15} /> {L('סרטונים', 'Videos')}</p>
        <button className="plhg-all" onClick={() => setView('videos')}>{L('לכל המדיה', 'All media')} <ArrowFwd size={14} /></button>
      </div>
      <div className="plhv-strip">
        {vids.map((v) => {
          const yt = getYouTubeId(v.url)
          return (
            <button key={v.id} type="button" className="plhv-card" onClick={() => setView('videos')}>
              <span className="plhv-thumb" style={yt ? { backgroundImage: `url("https://img.youtube.com/vi/${yt}/hqdefault.jpg")` } : undefined} aria-hidden="true" />
              <span className="plhv-title" dir="auto">{cleanVideoTitle(v.title)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// 1.12 — יעד האימון הקרוב, בתוך כרטיס האימון הבא (שאר היעדים במסך היעדים)
function NextPracticeGoal({ session, membership }) {
  const [goals, setGoals] = useState([])
  useEffect(() => {
    if (!membership) return
    ;(async () => {
      const [{ data: gl }, { data: marks }] = await Promise.all([
        supabase.from('player_goals').select('id, title, player_id').eq('period', 'session').neq('status', 'done'),
        supabase.from('session_goal_marks').select('goal_id').eq('player_id', session.user.id),
      ])
      const marked = new Set((marks || []).map((m) => m.goal_id))
      setGoals((gl || []).filter((g) => !marked.has(g.id)).slice(0, 3))
    })()
  }, [membership, session.user.id])
  if (goals.length === 0) return null
  return (
    <div className="plh-nextgoal">
      <Target size={14} aria-hidden="true" />
      <span>
        {L('היעד שלך לאימון: ', 'Your goal for practice: ')}
        <b>{goals.map((g) => g.title).join(' · ')}</b>
      </span>
    </div>
  )
}

function HomeHero({ profile, membership, onFeedback, refreshKey, session, stats, setView }) {
  const [next, setNext] = useState(undefined)
  const [now, setNow] = useState(Date.now())
  // סיכום האימון נכתב ל-session_effort ו-session_goal_marks — שתיהן ברשימת
  // השערים, ולכן ה-CTA לא נפתח לחשבון מוגבל במקום להיכשל בתוך הגיליון.
  const { restricted } = useRestricted()
  // 'ask' = היה אימון היום ואין עדיין סיכום → ההירו שואל "איך היה?"
  // 'done' = הסיכום של היום כבר נשלח → שורת אישור קטנה
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    if (!membership) { setNext(null); return }
    ;(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const [{ data }, { data: slots }, { data: games }] = await Promise.all([
        supabase.from('schedule_entries').select('*, plan:training_plans(id, name)').eq('created_by', membership.coach_id).eq('team', membership.team).gte('date', today).order('date').order('start_time').limit(10),
        supabase.from('team_practice_slots').select('*').eq('coach_id', membership.coach_id).eq('team', membership.team),
        supabase.from('team_games').select('id, game_date, game_time, opponent, location').eq('coach_id', membership.coach_id).eq('team', membership.team).gte('game_date', today).order('game_date').limit(10),
      ])
      const nowTs = Date.now()
      // למשחק אין שעת סיום — נותנים שעתיים כדי שיישאר "עכשיו" בזמן המשחק
      const gameEnd = (t) => {
        if (!t) return null
        const [h, m] = String(t).slice(0, 5).split(':').map(Number)
        return `${String(Math.min(23, h + 2)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      }
      const cands = [
        ...(data || []).map((e) => ({ kind: 'practice', session_id: e.id, date: e.date, start_time: e.start_time, end_time: e.end_time, title: e.plan?.name || null, location: e.location })),
        ...expandSlots(slots || [], 0, 30).map((o) => ({ kind: 'practice', session_id: o.session_id, date: o.date, start_time: o.start_time, end_time: o.end_time, title: null, location: o.location })),
        ...(games || []).map((g) => ({
          kind: 'game', session_id: g.id, date: g.game_date, start_time: g.game_time ? String(g.game_time).slice(0, 5) : null,
          end_time: gameEnd(g.game_time), location: g.location,
          title: g.opponent ? L(`משחק נגד ${g.opponent}`, `Game vs ${g.opponent}`) : L('משחק', 'Game'),
        })),
      ]
      const pick = cands
        .filter((e) => { const end = new Date(`${e.date}T${e.end_time || e.start_time || '23:59'}`); return !isNaN(end) && end.getTime() >= nowTs })
        .sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))[0]
      setNext(pick || null)

      // הבית מתחלף אחרי אימון: אם אימון של היום כבר הסתיים — בודקים אם נשלח סיכום
      const endedToday = cands.find((e) => {
        if (e.date !== today) return false
        const end = new Date(`${e.date}T${e.end_time || e.start_time || '23:59'}`)
        return !isNaN(end) && end.getTime() < nowTs
      })
      if (!endedToday) { setSummary(null); return }
      const { data: eff } = await supabase.from('session_effort')
        .select('id').eq('player_id', profile.id).eq('session_date', today).limit(1)
      setSummary(eff && eff.length ? { state: 'done' } : { state: 'ask', kind: endedToday.kind })
    })()
  }, [membership, profile.id, refreshKey])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const hour = new Date().getHours()
  const greet = hour < 12 ? L('בוקר טוב', 'Good morning') : hour < 18 ? L('צהריים טובים', 'Good afternoon') : L('ערב טוב', 'Good evening')

  let dd = '00', hh = '00', mm = '00', ss = '00', started = false, whenStr = '', titleStr = ''
  if (next) {
    const start = new Date(`${next.date}T${next.start_time || '00:00'}`)
    const diff = Math.max(0, start.getTime() - now)
    started = start.getTime() - now <= 0 && new Date(`${next.date}T${next.end_time || next.start_time || '23:59'}`).getTime() >= now
    const pad = (n) => String(n).padStart(2, '0')
    dd = pad(Math.floor(diff / 86400000)); hh = pad(Math.floor((diff % 86400000) / 3600000)); mm = pad(Math.floor((diff % 3600000) / 60000)); ss = pad(Math.floor((diff % 60000) / 1000))
    // «מחר · 18:00 · אולם ויתקין» — dayLabel נותן «היום»/«מחר» וכל השאר
    // נופל לשם היום. קודם הוצג התאריך המלא, שהעיצוב לא מציג.
    whenStr = dayLabel(next.date) + (next.start_time ? ` · ${next.start_time.slice(0, 5)}` : '') + (next.location ? ` · ${next.location}` : '')
    titleStr = next.title || L('אימון קבוצתי', 'Team practice')
  }
  const isGame = next?.kind === 'game'

  return (
    <div className={isGame ? 'plh-hero game pl-stagger' : 'plh-hero pl-stagger'}>
      {/* מסך 3b בנוי משלוש רצועות: תמונה בגובה 292 עם התוכן עליה,
          רצועת «מגיע?» מתחתיה, ופס ארבעת המספרים אחרון. */}
      {/* העיצוב מראה כאן צילום של השחקן באימון. אין לזה עמודה בסכימה,
          והחלטת הבעלים היא גרדיאנט עד שתהיה דרך להעלות צילום אמיתי. */}
      <div className="plh-hero-media">
        <span className="plh-hero-glow" aria-hidden="true" />
        {/* סימן-מים של מגרש (דפוס 1 במסמך העיצוב) — מחליף את אימוג'י הכדור */}
        <svg className="plh-hero-court" viewBox="0 0 400 200" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="4" y="4" width="392" height="192" rx="8" />
          <line x1="200" y1="4" x2="200" y2="196" />
          <circle cx="200" cy="100" r="34" />
          <rect x="4" y="58" width="76" height="84" />
          <rect x="320" y="58" width="76" height="84" />
          <path d="M80 4 A96 96 0 0 1 80 196" />
          <path d="M320 4 A96 96 0 0 0 320 196" />
        </svg>
        <div className="plh-hero-bottom">
      {next && (
        <div className={started ? 'plh-next live' : 'plh-next'}>
          <span className="plh-next-tag">
            {started
              ? (isGame ? L('עכשיו', 'Now') : L('האימון עכשיו', 'Practice now'))
              : (isGame ? L('המשחק הבא', 'Next game') : L('האימון הבא', 'Next practice'))}
          </span>
          <span className="plh-next-when">{whenStr}</span>
        </div>
      )}

      <div className="plh-hero-head">
        <h1 className="plh-hero-title-big">
          <span className="plh-hero-greet">{greet},</span>{' '}
          <span className="plh-hero-name" dir="auto">{profile.first_name}</span>
        </h1>
        {/* שורה אחת שאומרת מה מחכה לך — במקום שם הקבוצה והמאמן, שכבר
            מופיעים בפס למעלה ובסרגל הניווט. */}
        <p className="plh-hero-sub">
          {!membership
            ? L('מצטרפים לקבוצה עם קוד מהמאמן ומתחילים', 'Join your team with a code from your coach')
            : [
                stats?.open > 0 ? L(cnt(stats.open, 'משימה פתוחה אחת', 'משימות פתוחות'), stats.open + ' open tasks') : null,
                summary?.state === 'ask' ? L('נשאר לסכם את האימון של היום', "today's practice still needs a summary") : null,
                next ? (isGame ? L('ומשחק בדרך', 'and a game coming up') : null) : L('אין אימון קרוב בלו״ז', 'no upcoming practice'),
              ].filter(Boolean).join(' · ') || L('הכול מסודר — נתראה באימון', "You're all set — see you at practice")}
        </p>
      </div>
        </div>
      </div>

      <div className="plh-hero-foot">
        {summary?.state === 'ask' && (
          /* היה אימון היום ואין סיכום — זה הרגע היחיד שנער באמת פותח את האפליקציה */
          <div className="plh-ask">
            <strong className="plh-ask-title">{summary.kind === 'game' ? L('איך היה המשחק היום?', 'How was the game today?') : L('איך היה האימון היום?', 'How was practice today?')}</strong>
            <button className="plh-hero-cta plh-ask-cta" onClick={onFeedback} disabled={restricted}>
              <Send size={18} /> {L('מלא סיכום אימון', 'Log session summary')}
            </button>
            {restricted && (
              <RestrictedNote>
                {L('הסיכום נשלח למאמן, ולכן הוא נפתח אחרי אישור ההורה.',
                   'The summary goes to your coach, so it opens after your parent approves.')}
              </RestrictedNote>
            )}
          </div>
        )}
        {summary?.state === 'done' && (
          <span className="plh-done"><Check size={14} /> {L('הסיכום של היום אצל המאמן', "Today's summary is with your coach")}</span>
        )}
        {!membership && (
          <strong className="plh-hero-title">{L('הצטרפו לקבוצה', 'Join a team')}</strong>
        )}
        {/* 1.12 — יעד האימון הקרוב חי בתוך כרטיס האימון */}
        {next && membership && !isGame && <NextPracticeGoal session={session} membership={membership} />}
        {/* אישור הגעה — הפעולה היחידה בבאנר, לפי מסך 3b */}
        {next && session && <HomeRsvp session={session} membership={membership} next={next} />}
      </div>
      {/* ארבעת המספרים חיים בתוך הבאנר (מסך 3b), ולא כשלישייה צבעונית בהמשך */}
      {membership && <HeroStats stats={stats} setView={setView} />}
    </div>
  )
}

// הסיכום הקבוצתי האחרון מהמאמן — מוצג בבית במקום החדשות (sr_member_read קיימת)
function LastTeamReview({ membership, me }) {
  const [rev, setRev] = useState(null)
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('session_reviews')
        .select('overall_note, mvp_name, mvp_player_id, session_date, session_type')
        .eq('coach_id', membership.coach_id).eq('team', membership.team)
        .not('overall_note', 'is', null)
        .order('session_date', { ascending: false }).limit(1)
      setRev((data && data[0]) || null)
    })()
  }, [membership])
  if (!rev) return null
  const when = rev.session_date ? new Date(rev.session_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' }) : ''
  return (
    <section className="pl-block plr-card">
      <p className="pl-section-label">
        {rev.session_type === 'game' ? L('סיכום המשחק האחרון', 'Last game recap') : L('סיכום האימון האחרון', 'Last practice recap')}
        {when ? ` · ${when}` : ''}
      </p>
      <p className="plr-note">{rev.overall_note}</p>
      {rev.mvp_name && (
        <span className={rev.mvp_player_id === me ? 'plr-mvp me' : 'plr-mvp'}>
          <Trophy size={13} /> MVP: {rev.mvp_player_id === me ? L('אתה!', 'You!') : rev.mvp_name}
        </span>
      )}
    </section>
  )
}

// ---------- מסך: בית (עשיר, ממוקד שחקן) ----------
// §7 — «המשימות שלי» בבית: עד שלוש משימות פתוחות אמיתיות מהמאמן, עם פס
// התקדמות ורישום מהיר. עד עכשיו הסקשן «המשימות» בבית הציג רק יעדים.
function HomeTasks({ session, setView }) {
  const me = session.user.id
  const [rows, setRows] = useState(null)
  // אותה טבלה כמו במסך המשימות (assignment_completions) — ולכן אותו שער
  const { restricted } = useRestricted()

  const load = useCallback(async () => {
    const [{ data: asg }, { data: compl }] = await Promise.all([
      supabase.from('player_assignments').select('*, drill:drills(title)').order('created_at', { ascending: false }),
      supabase.from('assignment_completions').select('assignment_id, progress_value, done_at').eq('player_id', me),
    ])
    const by = new Map((compl || []).map((c) => [c.assignment_id, c]))
    setRows(
      (asg || [])
        .filter((a) => !by.get(a.id)?.done_at && (a.status || 'active') !== 'archived')
        .slice(0, 3)
        .map((a) => ({ a, prog: Number(by.get(a.id)?.progress_value) || 0 })),
    )
  }, [me])
  useEffect(() => { load() }, [load])

  // רישום מהיר: אותו מודל בדיוק כמו addProgress במסך המשימות
  const quick = async (a, prog) => {
    const target = Number(a.target_value)
    const step = Math.max(1, Math.round(target / 20))
    const next = Math.min(target, prog + step)
    const done_at = next >= target ? new Date().toISOString() : null
    const { error } = await supabase.from('assignment_completions')
      .upsert({ assignment_id: a.id, player_id: me, progress_value: next, done_at })
    if (error) { toast.error(L('השמירה נכשלה', 'Save failed')); return }
    if (done_at) { toast.success(L('סיימת את התרגיל! 🎉', 'Drill complete! 🎉')); burstConfetti() }
    load()
  }

  if (rows === null || rows.length === 0) return null
  return (
    <section className="pl-block plht">
      <div className="plhg-head">
        <p className="pl-section-label"><Dumbbell size={15} /> {L('משימות לתרגול', 'Tasks to practice')}</p>
        <button className="plhg-all" onClick={() => setView('drills')}>{L('הכל', 'All')} <ArrowFwd size={14} /></button>
      </div>
      <div className="plht-rows">
        {rows.map(({ a, prog }) => {
          const target = Number(a.target_value)
          const title = a.drill?.title || a.title || (a.plan ? a.plan.name : L('תרגיל', 'Drill'))
          return (
            <div key={a.id} className="plht-row">
              <button type="button" className="plht-body" onClick={() => setView('drills')}>
                <b>{title}</b>
                {target > 0 ? (
                  <>
                    <span className="plht-nums" dir="ltr">{prog}/{target}{a.unit ? ` ${a.unit}` : ''}</span>
                    <span className="plht-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round((prog / target) * 100))}%` }} /></span>
                  </>
                ) : (
                  <span className="plht-free">{a.note || L('משימה מהמאמן', 'Task from your coach')}</span>
                )}
              </button>
              {target > 0 && (
                <button type="button" className="plht-quick" onClick={() => quick(a, prog)} disabled={restricted}>
                  +{Math.max(1, Math.round(target / 20))}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {restricted && (
        <RestrictedNote>
          {L('רישום ההתקדמות נשמר אצל המאמן, ולכן הוא נפתח אחרי אישור ההורה.',
             'Your progress is saved with your coach, so logging it opens after your parent approves.')}
        </RestrictedNote>
      )}
    </section>
  )
}

// ---------- בית: המשוב מהאימון האחרון — מה מילאתי + מה המאמן אמר ----------
function LastPracticeFeedback({ session, membership, setView }) {
  const [data, setData] = useState(null) // { eff, fb, marks }
  const me = session.user.id
  useEffect(() => {
    if (!membership) return
    ;(async () => {
      // select('*') בכוונה — coach_ack נוסף במיגרציה מאוחרת ואולי חסר בפרוד
      const [{ data: effRows }, { data: fbRows }] = await Promise.all([
        supabase.from('session_effort').select('*').eq('player_id', me).order('session_date', { ascending: false }).limit(1),
        supabase.from('player_feedback').select('*').eq('player_id', me).order('created_at', { ascending: false }).limit(1),
      ])
      const eff = effRows?.[0] || null
      const fb = fbRows?.[0] || null
      let marks = []
      if (eff) {
        const { data: mk } = await supabase.from('session_goal_marks')
          .select('met, goal:player_goals(title)').eq('player_id', me).eq('session_id', eff.session_id)
        marks = (mk || []).filter((m) => m.goal?.title)
      }
      setData({ eff, fb, marks })
    })()
  }, [membership, me])

  if (!membership || !data || (!data.eff && !data.fb)) return null
  const { eff, fb, marks } = data
  const mood = eff?.mood ? MOOD_BY_KEY[eff.mood] : null
  const dateStr = eff?.session_date ? new Date(eff.session_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' }) : null

  // §8 — לפי מסך 3b: המשוב של המאמן הוא הכרטיס הראשי (כוכבים → טקסט →
  // תגובה באמוג'י), והסיכום שמילאת הוא שורה משנית מתחתיו — לא שני חצאים
  // שווי-משקל עם פס כתום.
  const fbDate = fb?.created_at
    ? new Date(fb.created_at).toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })
    : null
  return (
    <section className="pl-block plfb">
      <div className="plhg-head">
        <p className="pl-section-label"><MessageSquareHeart size={15} /> {L('משוב אחרון', 'Latest feedback')}</p>
        <button className="plhg-all" onClick={() => setView('feedback')}>{L('כל המשובים', 'All feedback')} <ArrowFwd size={14} /></button>
      </div>

      {fb ? (
        <div className="plfb2">
          {fb.rating > 0 && (
            <span className="pl-fb-stars">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} fill={n <= fb.rating ? 'currentColor' : 'none'} />)}</span>
          )}
          {fb.content && <p className="plfb2-txt">{fb.content}</p>}
          <span className="plfb2-meta">
            {L('המאמן', 'Coach')}{fbDate && <> · <bdi dir="ltr">{fbDate}</bdi></>}
          </span>
          <FbReact fb={fb} coachId={membership?.coach_id} me={me} />
        </div>
      ) : (
        <p className="plfb2-none">{L('עוד אין משוב מהמאמן — אחרי האימון הבא הוא יופיע כאן.', 'No coach feedback yet — after the next practice it shows up here.')}</p>
      )}

      {eff && (
        <div className="plfb2-mine">
          <Flame size={15} aria-hidden="true" />
          <span>
            {L('הסיכום שלך', 'Your summary')}{dateStr && <> · <bdi dir="ltr">{dateStr}</bdi></>}: <b dir="ltr">{eff.effort}/10</b>
            {mood && <span style={{ color: mood.col }}> · {L(mood.label[0], mood.label[1])}</span>}
            {/* X/Y בתוך טקסט עברי — עטוף ב-bdi כדי שלא יתהפך (חוק RTL) */}
            {marks.length > 0 && <> · <bdi dir="ltr">{marks.filter((m) => m.met).length}/{marks.length}</bdi> {L('יעדים', 'goals')}</>}
          </span>
          {eff.coach_ack && <span className="plfb2-ack"><Eye size={13} aria-hidden="true" /> {L('המאמן ראה', 'Seen')}</span>}
        </div>
      )}
    </section>
  )
}

function PlayerHome({ session, profile, membership, setView, onJoined }) {
  const [stats, setStats] = useState(null)
  const { restricted } = useRestricted()
  const [fbOpen, setFbOpen] = useState(false)
  const [fbRefresh, setFbRefresh] = useState(0) // מרענן את ההירו אחרי שליחת סיכום

  const loadStats = useCallback(async () => {
    const [asg, compl, att, gatt, eff, glogs, fbc] = await Promise.all([
      supabase.from('player_assignments').select('id'),
      supabase.from('assignment_completions').select('assignment_id, done_at').eq('player_id', session.user.id),
      supabase.from('practice_attendance').select('status'),
      supabase.from('game_attendance').select('status'),
      supabase.from('session_effort').select('effort, created_at').eq('player_id', session.user.id),
      supabase.from('player_goal_logs').select('created_at').eq('player_id', session.user.id),
      supabase.from('player_feedback').select('id', { count: 'exact', head: true }).eq('player_id', session.user.id),
    ])
    const doneRows = compl.data || []
    // בוצע = done_at מלא; שורה בלי done_at היא רק התקדמות חלקית
    const doneIds = new Set(doneRows.filter((c) => c.done_at).map((c) => c.assignment_id))
    const open = (asg.data || []).filter((a) => !doneIds.has(a.id)).length
    const attRows = [...(att.data || []), ...(gatt.data || [])]
    const attTotal = attRows.length
    const attPresent = attRows.filter((r) => r.status && r.status !== 'absent').length
    const attendancePct = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : null
    const weekly = doneRows.filter((c) => c.done_at && withinDays(c.done_at, 7)).length
    const effVals = (eff.data || []).map((r) => r.effort).filter((v) => v != null)
    const avgLoad = effVals.length ? (effVals.reduce((s, v) => s + v, 0) / effVals.length).toFixed(1) : null
    setStats({
      open, attendancePct, weekly, avgLoad, fbCount: fbc?.count ?? 0,
      // הרצף סופר כל פעילות באפליקציה — ביצוע תרגיל, סיכום אימון ותיעוד מטרה.
      // קודם נספרו רק תרגילים ששלח המאמן, ועם תרגיל אחד במסד הרצף היה תקוע על 0.
      streak: computeStreak([
        ...doneRows.map((c) => c.done_at),
        ...(eff.data || []).map((r) => r.created_at),
        ...(glogs.data || []).map((r) => r.created_at),
      ].filter(Boolean)),
    })
  }, [session.user.id])
  useEffect(() => { loadStats() }, [loadStats])

  // סדר הבית לפי הבעלים: טיימר → יעדים בגדול → המשוב האחרון → סיכום המאמן
  // → הודעות מהמאמן → סטטיסטיקות → כתבות. הציטוט מגיע מה-shell לכל המסכים.
  return (
    <div className="pl-screen pl-home-rich">
      <HomeHero profile={profile} membership={membership} session={session} stats={stats} setView={setView}
        onFeedback={() => setFbOpen(true)} refreshKey={fbRefresh} />

      {!membership && (
        <div className="pl-stagger"><JoinTeam session={session} onJoined={onJoined} compact /></div>
      )}

      {/* סדר 1.12: משוב אחרון → משימות לתרגול → הלו"ז השבועי הגדול →
          סיכום המאמן → רצועת סרטונים. היעדים ירדו מהבית — חוץ מיעד
          האימון הקרוב שחי בתוך כרטיס האימון בבאנר. */}
      {membership && <div className="pl-stagger"><LastPracticeFeedback session={session} membership={membership} setView={setView} key={`f${fbRefresh}`} /></div>}

      {membership && <div className="pl-stagger"><HomeTasks session={session} setView={setView} key={`t${fbRefresh}`} /></div>}

      {membership && <div className="pl-stagger"><HomeWeek session={session} membership={membership} setView={setView} /></div>}

      {membership && <div className="pl-stagger"><LastTeamReview membership={membership} me={session.user.id} /></div>}

      {membership && <div className="pl-stagger"><HomeVideos setView={setView} /></div>}

      {membership && (
        <div className="pl-stagger">
          <button type="button" className="plh-msg-cta" onClick={() => setView('coach')} disabled={restricted}>
            <Send size={18} /> {L('שלח הודעה למאמן', 'Message your coach')}
          </button>
          {restricted && (
            <RestrictedNote>
              {L('שליחת הודעות נפתחת אחרי אישור ההורה. את מה שהמאמן כתב לך אפשר לקרוא בכל רגע.',
                 'Sending messages opens after your parent approves. You can read what your coach wrote you at any time.')}
            </RestrictedNote>
          )}
        </div>
      )}

      {/* הגיליון לא נפתח כלל לחשבון מוגבל: session_effort חסומה בשרת,
          ומילוי טופס שלם שנדחה בשליחה גרוע מכפתור מושבת עם הסבר. */}
      {membership && !restricted && (
        <FeedbackSheet session={session} membership={membership} open={fbOpen}
          onClose={() => setFbOpen(false)} onSent={() => { loadStats(); setFbRefresh((k) => k + 1) }} />
      )}
    </div>
  )
}

// מתג מצב-כהה מונפש (משתמש באותו מנגנון של ThemeToggle)
function DarkSwitch() {
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')
  useEffect(() => {
    const sync = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark')
    window.addEventListener('themechange', sync)
    return () => window.removeEventListener('themechange', sync)
  }, [])
  const toggle = () => {
    const next = !dark
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('theme', next ? 'dark' : 'light')
    window.dispatchEvent(new Event('themechange'))
  }
  return (
    <button className={dark ? 'plp-switch on' : 'plp-switch'} onClick={toggle} role="switch" aria-checked={dark} aria-label={L('מצב כהה', 'Dark mode')}>
      <span className="plp-switch-knob" />
    </button>
  )
}

// ---------- כרטיס: ההרשאות שההורה אישר + הנפקת קישור ניהול ----------
// עד היום לשחקן הקטין לא הייתה שום נוכחות של ההסכמה במסך: הוא לא ראה מה
// ההורה אישר, ובעיקר — לא היה לו שום דרך לשלוח להורה קישור לשינוי ההחלטה.
// הורה שסירב פעם אחת (או שאיבד את קישור הניהול שקיבל בסיום) היה נעול על
// ההחלטה הראשונה לנצח, וזה סותר את ההבטחה המשפטית שאפשר להתחרט בכל רגע.
// הכרטיס הזה הוא היציאה מהמבוי הסתום, והוא בטוח בדיוק בגלל נעילת מייל
// האפוטרופוס: קישור ניהול חדש תמיד מגיע לאותו הורה שכבר הכריע פעם אחת.
const CONSENT_TONE = { granted: 'on', denied: 'off', revoked: 'off' }

function ParentConsentCard({ profile }) {
  const [phase, setPhase] = useState('loading') // loading | ready | error | hidden
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [sentTo, setSentTo] = useState('') // מסירה בצד שרת — אין טוקן ביד הקטין
  const [expires, setExpires] = useState('')

  const load = useCallback(async () => {
    setPhase('loading')
    const res = await myConsentState()
    if (res.ok) {
      setSt(res)
      // בגיר (או חשבון בלי תאריך לידה שהשרת לא מסווג כקטין) — אין הורה בתמונה
      setPhase(res.is_minor === false ? 'hidden' : 'ready')
      return
    }
    // מסד שטרם הריץ את מיגרציית ההסכמות, או חשבון בלי שורת פרופיל: הכרטיס
    // פשוט לא קיים. לא מציגים לילד בן 13 שגיאה על פונקציה חסרה בשרת.
    if (res.notDeployed || res.reason === 'no_profile' || res.reason === 'not_authenticated') {
      setPhase('hidden')
      return
    }
    setPhase('error')
  }, [])
  useEffect(() => { load() }, [load])

  const send = async () => {
    setBusy(true)
    const res = await requestManageLink()
    setBusy(false)
    if (res.ok && (res.link || res.sent_to)) {
      setLink(res.link || '')
      setSentTo(res.sent_to || '')
      setExpires((res.expires_at || '').split('T')[0])
      toast.success(res.link
        ? L('נוצר קישור ניהול להורה', 'A management link was created for your parent')
        : L('שלחנו קישור ניהול למייל של ההורה', "We emailed a management link to your parent"))
      return
    }
    // הצלחה בלי קישור ובלי כתובת — אין מה להציג, וגם לא קרה כאן כישלון
    if (res.ok) { toast.success(L('הבקשה נשלחה', 'The request was sent')); return }
    if (res.notDeployed) {
      toast.error(L('האפשרות הזו עדיין לא פעילה בשרת — פנו למאמן/ת',
        'This is not live on the server yet — talk to your coach'))
      return
    }
    toast.error(consentRequestError(res.reason))
  }

  if (phase === 'hidden') return null

  const label = <p className="pl-section-label" style={{ marginTop: 20 }}>{L('אישור ההורה', 'Parental consent')}</p>

  if (phase === 'loading') {
    return <>{label}<SkeletonCards count={1} lines={3} /></>
  }

  // שגיאת שליפה חייבת להיראות כשגיאה עם דרך חזרה — לא ככרטיס ריק
  if (phase === 'error') {
    return (
      <>
        {label}
        <div className="plc-card plc-error" role="alert">
          <span className="plc-ic danger"><AlertTriangle size={20} /></span>
          <div className="plc-head-txt">
            <strong>{L('לא הצלחנו לטעון את ההרשאות', 'We could not load your permissions')}</strong>
            <span className="muted small">{L('ייתכן שזו תקלת רשת זמנית.', 'This may be a temporary network problem.')}</span>
          </div>
          <button type="button" className="btn-soft plc-retry" onClick={load}>
            <RefreshCw size={15} /> {L('נסו שוב', 'Try again')}
          </button>
        </div>
      </>
    )
  }

  const state = st?.state || {}
  const guardianEmail = (st?.guardian_email || profile?.guardian_email || '').trim()
  const guardianName = (st?.guardian_name || profile?.guardian_name || '').trim()
  const minorName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
  const answered = CONSENT_TYPES.some((t) => state[t])

  return (
    <>
      {label}
      <section className="plc-card">
        <div className="plc-head">
          <span className="plc-ic"><ShieldCheck size={20} /></span>
          <div className="plc-head-txt">
            <strong>{L('מה ההורה שלך אישר', 'What your parent approved')}</strong>
            <span className="muted small">
              {L('ההחלטות האלה שייכות להורה בלבד, והוא יכול לשנות אותן בכל רגע.',
                 'These decisions belong to your parent alone, and they can change them at any time.')}
            </span>
          </div>
        </div>

        {/* מסמך ההסכמה עודכן מאז ההחלטה האחרונה — צריך אישור מחודש */}
        {st?.needs_reconsent && (
          <p className="plc-alert" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              {L('טופס ההסכמה עודכן מאז שההורה שלך אישר. שלחו לו קישור ניהול כדי שיאשר את הגרסה החדשה.',
                 'The consent form was updated since your parent approved. Send them a management link so they can approve the new version.')}
            </span>
          </p>
        )}

        <ul className="plc-list">
          {CONSENT_TYPES.map((t) => {
            const v = state[t] || null
            const tone = CONSENT_TONE[v] || 'none'
            return (
              <li key={t} className={`plc-row ${tone}`}>
                <span className="plc-row-ic" aria-hidden="true">
                  {v === 'granted' ? <Check size={15} /> : v ? <X size={15} /> : <Clock size={15} />}
                </span>
                <span className="plc-row-body">
                  <strong>{consentLabel(t)}</strong>
                  <span className="muted small">{consentHelp(t)}</span>
                </span>
                <span className={`plc-val v-${v || 'none'}`}>{consentValueLabel(v)}</span>
              </li>
            )
          })}
        </ul>

        <div className="plc-guardian">
          <Mail size={15} aria-hidden="true" />
          <span className="plc-row-body">
            <span className="muted small">{L('ההורה או האחראי הרשום בחשבון', 'The parent or guardian on record')}</span>
            <strong dir="ltr">{guardianEmail || L('לא הוזן', 'Not provided')}</strong>
            {guardianName && <span className="muted small">{guardianName}</span>}
          </span>
        </div>

        <p className="plc-note">
          {L('הקישור צמוד למייל הזה בלבד. מרגע שההורה קיבל החלטה ראשונה אי אפשר להחליף את מייל ההורה בחשבון — כך שכל קישור ניהול חדש חוזר תמיד לאותו הורה, ואי אפשר להפנות אותו למישהו אחר.',
             'The link is tied to this email only. Once your parent has made a first decision, the parent email on the account can no longer be changed — so every new management link always goes back to the same parent, and cannot be redirected to anyone else.')}
        </p>

        <div className="plc-actions">
          <button type="button" className="btn-primary" onClick={send} disabled={busy} aria-busy={busy}>
            {busy && <span className="btn-spinner" aria-hidden="true" />}
            <Link2 size={16} /> {(link || sentTo)
              ? L('שליחת קישור ניהול מחדש', 'Send a management link again')
              : L('שליחת קישור ניהול להורה', 'Send a management link to my parent')}
          </button>
        </div>

        {(link || sentTo) && (
          <div className="plc-link-box">
            <span className="muted small">
              {sentTo
                ? L('שלחנו קישור ניהול אל:', 'We sent a management link to:')
                : L('קישור הניהול להורה:', 'The management link for your parent:')}
            </span>
            <code className="plc-link" dir="ltr">{sentTo || link}</code>
            {expires && (
              <span className="muted small">
                {L('תקף עד ', 'Valid until ')}<bdi dir="ltr">{expires}</bdi>
              </span>
            )}
            {/* כפתורי השיתוף רק כשהטוקן באמת ביד הקטין; במסירה בצד שרת אין
                מה להעתיק ואין מה לשלוח */}
            {link && (
              <div className="plc-actions">
                <button type="button" className="btn-soft" onClick={() => waShare(consentManageShareText(minorName, link))}>
                  <MessageCircle size={16} /> {L('שליחה בוואטסאפ', 'Send on WhatsApp')}
                </button>
                <button type="button" className="btn-soft" onClick={() => copyText(link, L('קישור הניהול הועתק', 'Management link copied'))}>
                  <Copy size={16} /> {L('העתקת הקישור', 'Copy link')}
                </button>
              </div>
            )}
          </div>
        )}

        {!answered && (
          <p className="muted small plc-foot">
            {L('עוד לא נרשמה שום החלטה של הורה בחשבון הזה. אם החשבון עדיין ממתין לאישור — הקישור שצריך לשלוח הוא קישור האישור הראשוני, לא קישור הניהול.',
               'No parental decision is recorded on this account yet. If the account is still waiting for approval, the link to send is the initial approval link, not the management link.')}
          </p>
        )}
      </section>
    </>
  )
}

// ============================================================
//  «המידע שלי» — זכות עיון
// ============================================================
// מדיניות הפרטיות כבר מבטיחה שאפשר לראות מה מוחזק על המשתמש, אבל עד היום לא
// הייתה לזה שום דרך באפליקציה. הבטחה בלי כפתור היא לא הבטחה.
//
// הטעינה עצלה בכוונה: הייצוא שולף עשרות טבלאות, ואין שום סיבה להריץ אותו בכל
// כניסה לפרופיל. הסעיפים נבנים דינמית מהמפתחות שה-RPC החזיר, ולא מרשימה קשיחה
// בקוד — כך שאם הסוכן שכתב את ה-SQL הוסיף עוד טבלה, היא תופיע כאן מעצמה
// (בקבוצת «עוד מידע») ולא תיבלע בשקט.

// שורות שם־ערך של אובייקט אחד. ערכים מקוננים (אובייקט/מערך בתוך שורה) לא
// נדחסים ל-JSON על המסך — הם עולים מעלה כתת-גושים משלהם.
function DataRow({ row }) {
  return (
    <dl className="mdt-dl">
      {Object.entries(row).map(([k, v]) => (
        <div className="mdt-dl-row" key={k}>
          <dt>{dataFieldLabel(k)}</dt>
          <dd dir="auto">{dataValueText(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

// גוש אחד של הייצוא: אובייקט שטוח, מערך שורות, אובייקט מקונן או מספר בלבד
function DataBlock({ entryKey, value, depth = 0 }) {
  const [all, setAll] = useState(false)
  const title = dataSectionLabel(entryKey)

  // מספר בלבד — הייצוא ספר ולא שמר תוכן. אומרים את זה במפורש ליד המספר.
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return (
      <div className="mdt-block">
        <h4 className="mdt-block-t">{title}</h4>
        <p className="mdt-scalar">
          <bdi>{dataValueText(value)}</bdi>
          {typeof value === 'number' && (
            <span className="muted small"> {L('(מספר בלבד, בלי התוכן)', '(a count only, not the content)')}</span>
          )}
        </p>
      </div>
    )
  }

  const isList = Array.isArray(value)
  const rows = isList ? value : [value]
  const objRows = rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r))
  const flatRows = rows.filter((r) => !r || typeof r !== 'object' || Array.isArray(r))

  // אובייקט יחיד שיש בתוכו טבלאות (למשל activity: { streak, feedback:[...] }):
  // השדות הפשוטים נשארים כאן, והמקוננים יורדים לתת-גושים עם כותרת משלהם —
  // אחרת הם היו מוצגים כמחרוזת JSON, וזה כבר לא «המידע שלי בשפה פשוטה».
  const nested = []
  let plain = objRows
  if (!isList && objRows.length === 1 && depth < 2) {
    const flat = {}
    for (const [k, v] of Object.entries(objRows[0])) {
      // רשימת ערכים פשוטים (שנתונים, למשל) נשארת בשורה אחת; רק טבלה אמיתית
      // או אובייקט מקונן זוכים לגוש נפרד
      const isTable = Array.isArray(v)
        ? v.some((x) => x && typeof x === 'object')
        : !!v && typeof v === 'object' && Object.keys(v).length > 0
      if (isTable) nested.push({ key: `${entryKey}.${k}`, value: v })
      else flat[k] = v
    }
    plain = Object.keys(flat).length > 0 ? [flat] : []
  }

  const shown = all ? plain : plain.slice(0, 3)
  const hidden = plain.length - shown.length

  return (
    <div className="mdt-block">
      <h4 className="mdt-block-t">
        {title}
        {isList && <span className="mdt-badge"><bdi>{rows.length}</bdi></span>}
      </h4>

      {shown.map((row, i) => <DataRow row={row} key={i} />)}

      {/* ערכים פשוטים בתוך מערך (רשימת שנתונים, למשל) */}
      {flatRows.length > 0 && (
        <p className="mdt-scalar" dir="auto">{flatRows.map((v) => dataValueText(v)).join(', ')}</p>
      )}

      {nested.map((n) => <DataBlock key={n.key} entryKey={n.key} value={n.value} depth={depth + 1} />)}

      {hidden > 0 && (
        <button type="button" className="mdt-more" onClick={() => setAll(true)}>
          <ChevronDown size={15} aria-hidden="true" />
          {L('הצגת עוד ', 'Show ')}<bdi>{hidden}</bdi>{L('', ' more')}
        </button>
      )}
    </div>
  )
}

function MyDataCard() {
  const [phase, setPhase] = useState('idle') // idle | loading | ready | error | missing
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    setPhase('loading')
    const res = await myDataExport()
    if (res.ok) {
      setData(res.data || {})
      setPhase('ready')
      return
    }
    // מסד שטרם הריץ את המיגרציה — לא שגיאה, פשוט עוד לא קיים
    if (res.notDeployed) { setPhase('missing'); return }
    setPhase('error')
  }, [])

  const groups = useMemo(() => (data ? groupDataSections(data) : []), [data])
  const summaries = useMemo(() => (data ? summaryOnlyItems(data) : []), [data])
  const generatedAt = data ? exportGeneratedAt(data) : ''

  const save = (kind) => {
    const text = kind === 'json' ? exportToJsonText(data) : exportToCsvText(data)
    // קובץ CSV שיש בו רק BOM = אין שום חלק טבלאי. עדיף לומר את זה מלהוריד ריק.
    // trim מנקה גם את ה-BOM עצמו (U+FEFF נחשב תו לבן ב-JS), ולכן זו בדיקה מספקת.
    if (!text || text.trim().length === 0) {
      toast.error(L('אין מה להוריד עדיין', 'There is nothing to download yet'))
      return
    }
    const ok = downloadTextFile(exportFileName(kind), text, kind === 'json' ? 'application/json' : 'text/csv')
    toast[ok ? 'success' : 'error'](ok
      ? L('הקובץ ירד למכשיר', 'The file was downloaded')
      : L('ההורדה נחסמה בדפדפן — נסו מהמחשב', 'The download was blocked — try from a computer'))
  }

  const label = <p className="pl-section-label" style={{ marginTop: 20 }}>{L('המידע שלי', 'My data')}</p>

  return (
    <>
      {label}
      <section className="mdt-card">
        <div className="mdt-head">
          <span className="mdt-ic"><Database size={20} /></span>
          <div className="mdt-head-txt">
            <strong>{L('מה שמור עליך אצלנו', 'What we hold about you')}</strong>
            <span className="muted small">
              {L('זה המידע שלך. אפשר לראות אותו כאן ולהוריד אותו למכשיר.',
                 'This is your data. You can see it here and download it to your device.')}
            </span>
          </div>
        </div>

        {phase === 'idle' && (
          <div className="mdt-actions">
            <button type="button" className="btn-primary" onClick={load}>
              <Eye size={16} /> {L('הצגת המידע שלי', 'Show my data')}
            </button>
          </div>
        )}

        {phase === 'loading' && <SkeletonCards count={2} lines={3} />}

        {/* שגיאת שליפה חייבת להיראות כשגיאה עם דרך חזרה — לא כמסך ריק */}
        {phase === 'error' && (
          <div className="mdt-alert" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{L('לא הצלחנו לטעון את המידע. אולי זו תקלת רשת.',
                     'We could not load your data. It may be a network problem.')}</span>
            <button type="button" className="btn-soft mdt-retry" onClick={load}>
              <RefreshCw size={15} /> {L('נסו שוב', 'Try again')}
            </button>
          </div>
        )}

        {phase === 'missing' && (
          <p className="muted small mdt-foot" role="status">
            {L('האפשרות הזו עוד לא פעילה בשרת. אפשר לבקש את המידע מהמאמן/ת בינתיים.',
               'This is not live on the server yet. You can ask your coach for your data meanwhile.')}
          </p>
        )}

        {phase === 'ready' && groups.length === 0 && (
          <p className="muted small mdt-foot">
            {L('חוץ מפרטי החשבון עוד לא נאסף עליך מידע.',
               'Apart from your account details, nothing has been collected about you yet.')}
          </p>
        )}

        {phase === 'ready' && groups.length > 0 && (
          <>
            {groups.map((g) => (
              <div className="mdt-group" key={g.id}>
                <h3 className="mdt-group-t">{g.title}</h3>
                {g.entries.map((e) => <DataBlock key={e.key} entryKey={e.key} value={e.value} />)}
              </div>
            ))}

            {/* יושר על החלקים המסוכמים: מונה בלי תוכן נראה על המסך כמו «זה הכל»,
                ולכן אומרים במפורש שזו ספירה ולא התוכן עצמו. */}
            {summaries.length > 0 && (
              <div className="mdt-note" role="note">
                <Info size={16} aria-hidden="true" />
                <div className="mdt-note-body">
                  <strong>{L('מה שמופיע כאן כמספר בלבד', 'What appears here as a number only')}</strong>
                  <p className="muted small">
                    {L('בחלקים האלה שמרנו רק כמה יש, לא את התוכן. למשל הודעות — נספרות, לא מוצגות.',
                       'For these we kept only how many there are, not the content. Messages, for example, are counted and not shown.')}
                  </p>
                  <ul className="mdt-sum">
                    {summaries.map((s) => (
                      <li key={s.key}>
                        <span>{dataSectionLabel(s.key)}</span>
                        <b><bdi>{s.count == null ? '—' : s.count}</bdi></b>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="mdt-actions">
              <button type="button" className="btn-soft" onClick={() => save('json')}>
                <FileJson size={16} /> {L('הורדה כ-JSON', 'Download JSON')}
              </button>
              <button type="button" className="btn-soft" onClick={() => save('csv')}>
                <FileSpreadsheet size={16} /> {L('הורדה כטבלה (CSV)', 'Download table (CSV)')}
              </button>
              <button type="button" className="btn-soft mdt-refresh" onClick={load}>
                <RefreshCw size={15} /> {L('רענון', 'Refresh')}
              </button>
            </div>

            <p className="muted small mdt-foot">
              <Download size={13} aria-hidden="true" />{' '}
              {L('JSON שומר הכול בדיוק כפי שהוא. CSV נפתח באקסל, ומכיל רק את החלקים שהם טבלה.',
                 'JSON keeps everything exactly as it is. CSV opens in Excel and holds only the table-like parts.')}
            </p>
            <p className="muted small mdt-foot">
              {L('חסר לך משהו כאן, או שרצית לראות גם את התוכן ולא רק את המספר? בקשו מהמאמן/ת או שלחו פנייה למנהל המערכת.',
                 'Something missing, or want the content and not just the count? Ask your coach or send a request to the admin.')}
              {generatedAt && (
                <>
                  {' '}
                  {L('המידע נאסף ב-', 'Collected on ')}
                  <bdi>{dataValueText(generatedAt)}</bdi>
                </>
              )}
            </p>
          </>
        )}
      </section>
    </>
  )
}

// ---------- מסך: פרופיל (זהות, סטטיסטיקות, קבוצות, הגדרות) ----------
function PlayerProfile({ session, profile, membership, memberships, onEdit, onJoined, onSignOut, setView }) {
  const [st, setSt] = useState(null)
  useEffect(() => {
    ;(async () => {
      const [compl, att, eff] = await Promise.all([
        supabase.from('assignment_completions').select('assignment_id, done_at').eq('player_id', session.user.id),
        supabase.from('practice_attendance').select('status'),
        supabase.from('session_effort').select('effort').eq('player_id', session.user.id),
      ])
      const doneRows = compl.data || []
      const attRows = att.data || []
      const attTotal = attRows.length
      const attPresent = attRows.filter((r) => r.status && r.status !== 'absent').length
      const attendancePct = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : null
      // 1.7 — רצף הימים ירד מהפרופיל; במקומו ממוצע הקושי מהדיווחים
      const effs = (eff.data || []).map((r) => r.effort).filter((v) => v != null)
      const avgLoad = effs.length ? (effs.reduce((s, v) => s + v, 0) / effs.length).toFixed(1) : null
      // בוצע = done_at מלא (שורה בלי done_at = התקדמות חלקית בלבד)
      setSt({ done: doneRows.filter((c) => c.done_at).length, avgLoad, attendancePct })
    })()
  }, [session.user.id])

  const role = [L('שחקן', 'Player'), profile.position, profile.birth_year ? `${L('שנתון', 'b.')} ${profile.birth_year}` : null].filter(Boolean).join(' · ')

  return (
    <div className="pl-screen pl-narrow">
      {/* 18a — הירו הנייבי של הפרופיל: אווטאר בצד, שם ומטא לצדו,
          כמו בכל שאר מסכי השחקן */}
      <div className="plp-head">
        <Avatar name={`${profile.first_name} ${profile.last_name || ''}`} url={profile.avatar_url} size={72} />
        <div className="plp-head-txt">
          <span className="plp-eyebrow">{L('הפרופיל שלי', 'My profile')}</span>
          <h2 className="plp-name" dir="auto">{profile.first_name} {profile.last_name}</h2>
          <span className="plp-role">{role}</span>
        </div>
      </div>

      {st && (
        <div className="plt-trio" style={{ marginTop: 18 }}>
          <div className="plt-stat"><b className="green">{st.attendancePct != null ? `${st.attendancePct}%` : '—'}</b><span>{L('נוכחות', 'Attendance')}</span></div>
          <div className="plt-stat"><b className="brand" dir="ltr">{st.avgLoad ?? '—'}</b><span>{L('עומס ממוצע', 'Avg load')}</span></div>
          <div className="plt-stat"><b>{st.done}</b><span>{L('תרגילים', 'Drills')}</span></div>
        </div>
      )}

      <p className="pl-section-label" style={{ marginTop: 18 }}>{L('הקבוצות שלי', 'My teams')}</p>
      {memberships.length === 0 ? (
        <JoinTeam session={session} onJoined={onJoined} compact />
      ) : (
        <ul className="plp-teams">
          {memberships.map((m) => (
            <li key={m.id} className="plp-team">
              <span className="plp-team-badge">{(trTeam(m.team) || '?').slice(0, 2)}</span>
              <div className="plp-team-body">
                <strong>{trTeam(m.team)}</strong>
                <span className="muted small">{coachName(m.coach)}</span>
              </div>
              <span className={`plp-team-status st-${m.status}`}>
                {m.status === 'approved' ? L('מאושר', 'Approved') : m.status === 'pending' ? L('ממתין', 'Pending') : L('נדחה', 'Declined')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button className="plp-edit" onClick={onEdit}><Pencil size={16} /> {L('עריכת פרטים', 'Edit details')}</button>
      {memberships.length > 0 && (
        <button className="plp-join-more" onClick={() => setView('home')}>{L('הצטרפות לקבוצה נוספת', 'Join another team')}</button>
      )}

      {/* לשחקן בגיר אין הורה מאשר — הכרטיס כולו יורד מהמסך */}
      {!isAdultPlayer(profile) && <ParentConsentCard profile={profile} />}

      {/* זכות עיון — פתוח לכל שחקן, קטין או בגיר */}
      <MyDataCard />


      <p className="pl-section-label" style={{ marginTop: 20 }}>{L('הגדרות', 'Settings')}</p>
      <div className="plp-settings">
        <div className="plp-set-row">
          <span className="plp-set-ic"><Moon size={17} /></span>
          <span className="plp-set-label">{L('מצב כהה', 'Dark mode')}</span>
          <DarkSwitch />
        </div>
        <div className="plp-set-row">
          <span className="plp-set-ic"><Globe size={17} /></span>
          <span className="plp-set-label">{L('שפה', 'Language')}</span>
          <span className="plp-set-ctrl"><LanguageToggle /></span>
        </div>
        {/* שינוי סיסמה מתוך הפרופיל (TODO §13) */}
        <ChangePassword />
        <button className="plp-set-row plp-logout" onClick={onSignOut}>
          <span className="plp-set-ic brand"><LogOut size={17} /></span>
          <span className="plp-set-label">{L('התנתקות', 'Sign out')}</span>
        </button>
        {/* 1.15 — נתיב בקשת מחיקת חשבון (טבלה מ-supabase_legal_launch.sql; fallback למייל) */}
        <button
          className="plp-set-row plp-delreq"
          onClick={async () => {
            const ok = window.confirm(L(
              'לבקש מחיקת חשבון? נטפל בבקשה בתוך 30 יום, וניצור קשר במייל של החשבון.',
              'Request account deletion? We handle requests within 30 days and reply to your account email.'))
            if (!ok) return
            const { error } = await supabase.from('account_deletion_requests').insert({ user_id: session.user.id })
            if (error) {
              window.location.href = 'mailto:agam15122003@gmail.com?subject=' + encodeURIComponent('בקשת מחיקת חשבון CourtSide')
              return
            }
            toast.success(L('הבקשה נרשמה — נחזור אליך במייל', 'Request logged — we will reply by email'))
          }}
        >
          <span className="plp-set-ic"><X size={17} /></span>
          <span className="plp-set-label">{L('בקשת מחיקת חשבון', 'Request account deletion')}</span>
        </button>
      </div>
    </div>
  )
}

// ---------- מסך: וידאו (רכיב עזר לניווט) ----------
// (PlayerVideos מוגדר למעלה)

// ============================================================
// האפליקציה של השחקן — מעטפת + ניווט
// ============================================================
// ניווט ממוקד (משוב הבעלים 25.7): "הקבוצה שלי" מוזג לתוך הלו"ז, צ'אט הקבוצה
// עלה לניווט, והקהילה (0 פוסטים) ירדה — המסך נשאר בקוד וניתן להחזרה.
// 1.13 — הצ'אטים אוחדו לתוך «הקבוצה והלו״ז» (ארבע לשוניות), והטאבים
// הנפרדים שלהם ירדו מהניווט. יעדי עומק ישנים (coach/teamchat) עדיין עובדים.
const PLAYER_NAV = [
  { id: 'home', label: ['בית', 'Home'], Icon: HomeIcon },
  { id: 'drills', label: ['המשימות שלי', 'My tasks'], Icon: Dumbbell },
  { id: 'goals', label: ['היעדים שלי', 'My goals'], Icon: Target, team: true },
  { id: 'schedule', label: ['הקבוצה והלו״ז', 'Team & schedule'], short: ['הקבוצה', 'Team'], Icon: CalendarDays, team: true },
  { id: 'feedback', label: ['האימונים שלי', 'My sessions'], Icon: MessageSquareHeart, team: true },
  { id: 'videos', label: ['מדיה', 'Media'], Icon: MonitorPlay },
  { id: 'profile', label: ['פרופיל', 'Profile'], Icon: User },
]
// חמשת היעדים של המוקאפ (מסך 3b במסמך המסירה): בית · המשימות שלי ·
// האימונים שלי · הקבוצה · פרופיל. עד היום ישבו כאן שני יעדי צ׳אט
// (coach + teamchat) שתפסו 40% מהסרגל, בעוד היעדים והלו״ז היו במגירה בלבד.
const PLAYER_BOTTOM = ['home', 'drills', 'feedback', 'schedule', 'profile']

export default function PlayerDashboard({ session, profile, onProfileReload, restricted: restrictedProp, canSelfConfirm = false }) {
  const [view, setView] = useState('home')
  const [drawer, setDrawer] = useState(false)
  const [editing, setEditing] = useState(false)
  const [memberships, setMemberships] = useState(null)
  const [sendingLink, setSendingLink] = useState(false)
  // editing במפתח: בעריכת פרופיל אף פריט אינו פעיל והפס צריך להיעלם
  const [navRef, navBox] = useNavMarker(`${view}:${editing}`)

  // ה-prop מגיע מהדשבורד (שם יושב השער היחיד); הנפילה לחישוב המקומי היא
  // רק בשביל קורא שעדיין לא מעביר אותו — לא בשביל להכריע אחרת.
  const restricted = restrictedProp ?? isRestricted(profile)
  // אותו כפתור מוצע ליד כל פעולה חסומה — ולכן השליחה עצמה חיה כאן, פעם אחת
  const sendLink = useCallback(async () => {
    setSendingLink(true)
    await sendParentLink(profile, onProfileReload)
    setSendingLink(false)
  }, [profile, onProfileReload])
  const restrictedCtx = useMemo(
    () => (restricted ? { restricted: true, sendLink, sending: sendingLink } : RESTRICTED_OFF),
    [restricted, sendLink, sendingLink],
  )

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

  // יעד ההתראה נגזר במקום אחד — עד היום הפעמון בטופבר ובמגירה שלחו
  // לשני מקומות שונים לאותה התראה עצמה.
  const navFromNotification = (v) => setView(
    ['coach', 'goals', 'feedback', 'community', 'drills', 'teamchat', 'schedule'].includes(v)
      ? v
      : v === 'messages' ? 'coach' : 'drills'
  )

  const nav = PLAYER_NAV
  const label = (item) => L(item.label[0], item.label[1])

  const renderView = () => {
    if (editing) {
      return (
        <>
          {/* profiles מוחרגת בכוונה משער הכתיבה — עריכת הפרטים חייבת לעבוד.
              מה שכן חסום הוא ההעלאה ל-storage (supabase_private_media.sql),
              ולכן ההסבר צמוד לטופס. restricted יורד ל-ProfileForm כדי
              שהבעלים של הקובץ הזה יוכל להשבית שם את בורר התמונה. */}
          {restricted && (
            <RestrictedNote block>
              {L('אפשר לערוך כאן הכול. רק העלאת תמונת פרופיל מחכה לאישור ההורה.',
                 'You can edit everything here. Only uploading a profile photo waits for your parent.')}
            </RestrictedNote>
          )}
          <ProfileForm
            session={session}
            profile={profile}
            restricted={restricted}
            onSaved={() => { setEditing(false); onProfileReload?.() }}
            onCancel={() => setEditing(false)}
          />
        </>
      )
    }
    // בלי קבוצה המסך ממילא מציג «הצטרפו עם קוד» (LockedFeature) — ודווקא
    // *זו* הפעולה שהשרת מתיר. הסבר על צ'אט חסום מעליה רק היה מבלבל.
    const note = restricted && (hasTeam || view === 'community')
      ? RESTRICTED_SCREEN[view]?.()
      : null
    const content = renderScreen()
    return note ? <><RestrictedNote block>{note}</RestrictedNote>{content}</> : content
  }

  // ה-switch עצמו לא השתנה — הוא רק ירד לפונקציה משלו כדי ש-renderView
  // יוכל להקדים לו את הסבר המצב המוגבל בלי לשכפל אותו בכל ענף.
  // restricted יורד גם לילדים שהכתיבה שלהם חיה אצלם (שורת הכתיבה בצ'אטים,
  // מלבן הפוסט בקהילה, תיעוד יעד): הקובץ הזה לא רשאי לגעת בהם, וה-prop הוא
  // הקצה שדרכו הבעלים שלהם משבית את הפקד עצמו.
  const renderScreen = () => {
    switch (view) {
      case 'drills': return <MyAssignments session={session} />
      case 'coach':
        return hasTeam
          ? <PlayerTeamHub session={session} membership={membership} coach={coach} restricted={restricted} initialTab="coach"
              ScheduleView={<PlayerSchedule session={session} membership={membership} />} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('המאמן שלי', 'My coach')}
              desc={L('כדי לכתוב למאמן צריך קודם להצטרף לקבוצה שלו.', 'To message your coach, join their team first.')} />
      case 'feedback':
        return hasTeam
          ? <PlayerTimeline session={session} membership={membership} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('האימונים שלי', 'My sessions')}
              desc={L('ההיסטוריה שלך — משוב, עומס ויעדים לכל אימון — נפתחת ברגע שתצטרף לקבוצה.', 'Your history — feedback, effort and goals per session — opens once you join a team.')} />
      case 'goals':
        return hasTeam
          ? <MyGoals session={session} membership={membership} restricted={restricted} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('היעדים שלי', 'My goals')}
              desc={L('המאמן יגדיר לך יעדים ברגע שתצטרף לקבוצה. הצטרפו עם קוד מהמאמן.', 'Your coach sets goals once you join a team. Join with a code from your coach.')} />
      case 'schedule':
        return hasTeam
          ? <PlayerTeamHub session={session} membership={membership} coach={coach} restricted={restricted} initialTab="schedule"
              ScheduleView={<PlayerSchedule session={session} membership={membership} />} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('לוח האימונים והמשחקים', 'Schedule')}
              desc={L('לו״ז האימונים והמשחקים של הקבוצה יופיע כאן. הצטרפו לקבוצה עם קוד מהמאמן.', 'Your team’s practices and games appear here. Join a team with a code from your coach.')} />
      case 'videos': return <PlayerVideos />
      case 'teamchat':
        return hasTeam
          ? <PlayerTeamHub session={session} membership={membership} coach={coach} restricted={restricted} initialTab="chat"
              ScheduleView={<PlayerSchedule session={session} membership={membership} />} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('צ׳אט הקבוצה', 'Team chat')}
              desc={L('צ׳אט הקבוצה נפתח ברגע שהמאמן מאשר אתכם. הצטרפו עם קוד מהמאמן.', 'Team chat opens once your coach approves you. Join with a code from your coach.')} />
      case 'community': return <PlayerCommunity session={session} profile={profile} restricted={restricted} />
      case 'team':
        // קישורים ישנים ממשיכים לעבוד — נפתח על לשונית «הקבוצה שלי»
        return hasTeam
          ? <PlayerTeamHub session={session} membership={membership} coach={coach} restricted={restricted} initialTab="team"
              ScheduleView={<PlayerSchedule session={session} membership={membership} />} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('הקבוצה והלו״ז', 'Team & schedule')}
              desc={L('כאן תראו את חברי הקבוצה והאימון הבא. הצטרפו לקבוצה עם קוד מהמאמן.', 'See your teammates and next practice here. Join a team with a code from your coach.')} />
      case 'profile':
        return <PlayerProfile session={session} profile={profile} membership={membership} memberships={memberships} onEdit={() => setEditing(true)} onJoined={loadMemberships} onSignOut={signOut} setView={setView} />
      default: return <PlayerHome session={session} profile={profile} membership={membership} setView={setView} onJoined={loadMemberships} />
    }
  }

  return (
    <RestrictedCtx.Provider value={restrictedCtx}>
    <div className="layout pl-layout">
      <header className="mobile-topbar">
        <button className="drawer-toggle" onClick={() => setDrawer(true)} aria-label={L('תפריט', 'Menu')}><Menu size={22} /></button>
        <div className="sidebar-brand">
          <Logo size={26} />
          <span>CourtSide</span>
        </div>
        <div className="topbar-actions">
          <Notifications session={session} onNavigate={navFromNotification} />
          {/* ב-4 מהסקירה: תמה ושפה ירדו מהסרגל — הן במגירה ובפרופיל */}
        </div>
      </header>

      {drawer && <div className="drawer-overlay" onClick={() => setDrawer(false)} />}
      <aside className={drawer ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-brand">
          <Logo size={30} />
          <span>CourtSide</span>
          <span className="sidebar-bell"><Notifications session={session} onNavigate={navFromNotification} /></span>
          <button className="drawer-close" onClick={() => setDrawer(false)} aria-label={L('סגור', 'Close')}><X size={20} /></button>
        </div>
        <span className="pl-role-chip"><Dumbbell size={13} /> {L('שחקן', 'Player')}</span>
        <nav className="sidebar-nav" ref={navRef}>
          {navBox && (
            <span
              className="nav-marker"
              aria-hidden="true"
              style={{ '--nm-y': `${navBox.y}px`, '--nm-h': `${navBox.h}px` }}
            />
          )}
          {nav.map((item) => (
            <button key={item.id} className={view === item.id && !editing ? 'nav-item active' : 'nav-item'} aria-current={view === item.id && !editing ? 'page' : undefined} onClick={() => { setEditing(false); setView(item.id) }}>
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
        {/* מחוץ ל-.main-inner בכוונה: ל-main-inner יש key לפי המסך, וכל
            ניווט היה מרכיב את הבאנר מחדש ומוחק את הקישור שכבר נשלח. */}
        {restricted && (
          <PendingBanner
            profile={profile}
            canSelfConfirm={canSelfConfirm}
            onEditProfile={() => setEditing(true)}
            onRecheck={onProfileReload}
          />
        )}
        <div className="main-inner" key={editing ? 'edit' : view}>
          {/* גדר בטיחות: קריסה במסך אחד לא מוחקת את כל אזור השחקן */}
          <ErrorBoundary screen={`player:${editing ? 'edit' : view}`}>{renderView()}</ErrorBoundary>
          {/* ציטוט מעורר השראה בכל המסכים (חוץ מהצ'אטים — שם הגובה קבוע והוא שובר את שורת הכתיבה) */}
          {/* הציטוט אינו במוקאפ של הבית (3b) — הוא נשאר בשאר המסכים */}
          {!editing && !['home', 'teamchat', 'coach', 'community'].includes(view) && <PlayerQuote />}
        </div>
      </main>

      <nav className="bottom-nav" aria-label={L('ניווט', 'Navigation')}>
        {PLAYER_BOTTOM.map((id) => {
          const item = nav.find((n) => n.id === id)
          return (
            <button
              key={id}
              className={view === id && !editing ? 'bn-item active' : 'bn-item'}
              aria-label={label(item)}
              aria-current={view === id && !editing ? 'page' : undefined}
              onClick={() => { setEditing(false); setView(id) }}
            >
              <span className="bn-ic"><item.Icon size={20} /></span>
              <span className="bn-lbl">{item.short ? L(item.short[0], item.short[1]) : label(item)}</span>
            </button>
          )
        })}
      </nav>
    </div>
    </RestrictedCtx.Provider>
  )
}
