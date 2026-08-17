import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import {
  Home as HomeIcon, Dumbbell, MessageSquareHeart, MonitorPlay, Users, User,
  Menu, X, Check, Clock, Star, CalendarDays, Users2, MessageSquare, MessagesSquare, Send,
  ShieldCheck, Hourglass, Trophy, Flame, Lock, Newspaper,
  Sparkles, Zap, Crown, CalendarCheck, Timer, Target, Play, ClipboardList,
  ArrowLeft, Eye, Moon, Globe, LogOut, Pencil, UserCheck,
  MessageCircle, Copy, Link2, RefreshCw, AlertTriangle, Mail,
  Database, Download, FileJson, FileSpreadsheet, Info, ChevronDown, UserPlus,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, cnt, trTeam } from './i18n'
import useNavMarker from './useNavMarker'
import useFocusTrap from './useFocusTrap'
import PocketNav from './PocketNav'
import HomeVideos from './HomeVideos'
import CourtArt from './CourtArt'
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
import BasketballWorld from './BasketballWorld'
import { MyGoals, GoalChart } from './PlayerGoals'
import PlayerTimeline from './PlayerTimeline'
import FeedbackSheet, { MOOD_BY_KEY } from './FeedbackSheet'
import BasketballIcon from './BasketballIcon'
import PlayerScreen, { initialsOf } from './PlayerScreen'
import { requestJoinByCode, myMemberships } from './players'
import { waShare, copyText } from './share'
import {
  myConsentState, requestManageLink, isAdultPlayer, consentRequestError,
  consentManageShareText, CONSENT_TYPES, consentLabel, consentHelp, consentValueLabel,
  myDataExport, groupDataSections, summaryOnlyItems, exportGeneratedAt,
  dataSectionLabel, dataFieldLabel, dataValueText,
  exportToJsonText, exportToCsvText, exportFileName, downloadTextFile,
  siteUrl,
} from './consent'
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

      {/* קוד אימון אישי — ערוץ נפרד לגמרי מהקבוצה. יושב כאן כי זה בדיוק
          המקום שאליו מגיע מי שנרשם לאפליקציה בשביל מאמן אישי ואין לו
          קבוצה בכלל. */}
      {!compact && <PersonalCoachJoin />}
    </div>
  )
}

// ---------- הצטרפות למאמן אישי בקוד ----------
// נפרד מ-JoinTeam במכוון: קוד הקבוצה פותח קבוצה, והקוד הזה פותח קשר
// אישי. ערבוב השניים היה נותן למאמן ערוץ שלא התכוון לפתוח.
// compact — בתוך כרטיס אחר (מסך «המשימות שלי»), בלי כותרת ואייקון משלו.
// onSent — נקרא אחרי בקשה שנשלחה, כדי שההורה-רכיב יטען מחדש את הרשימה.
function PersonalCoachJoin({ compact = false, onSent }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    if (code.length < 6) return
    setBusy(true)
    const { data, error } = await supabase.rpc('request_personal_coach', { p_code: code })
    setBusy(false)
    if (error) {
      // הפונקציה נוספת ב-supabase_personal_code_4_8.sql. עד שהיא תרוץ,
      // אין להאשים את המשתמש בקוד שגוי.
      toast.error(/function .* does not exist|PGRST202/i.test(error.message || '')
        ? L('הפיצ׳ר עוד לא הופעל. פנה למאמן.', 'Not enabled yet. Ask your coach.')
        : L('הבקשה נכשלה: ', 'Request failed: ') + error.message)
      return
    }
    if (!data?.ok) {
      toast.error(
        data?.reason === 'rate' ? L('יותר מדי ניסיונות. נסה שוב בעוד שעה.', 'Too many attempts. Try again in an hour.')
          : data?.reason === 'self' ? L('זה הקוד שלך.', "That's your own code.")
            : L('קוד לא נמצא — בדוק אותו מול המאמן', 'Code not found — check it with your coach'),
      )
      return
    }
    setCode('')
    setSent(true)
    toast.success(data.reason === 'already'
      ? L('כבר שלחת בקשה למאמן הזה', 'You already requested this coach')
      : L('הבקשה נשלחה למאמן לאישור', 'Request sent to the coach'))
    onSent?.()
  }

  const inner = (
    <>
      <div className="pl-join-row">
        <input
          className="finder-input pl-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={L('קוד המאמן', 'Coach code')}
          dir="ltr"
          aria-label={L('קוד המאמן האישי', 'Personal coach code')}
        />
        <button className="btn-primary" style={{ marginTop: 0 }} onClick={submit} disabled={busy || code.length < 6}>
          {busy ? L('בודק...', 'Checking...') : L('שליחת בקשה', 'Request')}
        </button>
      </div>
      {sent && (
        <div className="pl-waiting">
          <Hourglass size={16} />
          {L('הבקשה נשלחה. המאמן צריך לאשר, ואם אתה מתחת לגיל 18 — גם ההורה.',
             'Request sent. The coach approves, and if you are under 18 so does a parent.')}
        </div>
      )}
    </>
  )

  // compact — כבר יש כותרת בכרטיס העוטף, ושתי כותרות זו כפילות.
  if (compact) return inner

  return (
    <div className="pl-join-card">
      <span className="pl-join-ic"><UserPlus size={30} /></span>
      <h2>{L('מאמן אישי', 'Personal coach')}</h2>
      <p className="muted">
        {L('יש לך קוד ממאמן אישי? הזן אותו כאן. זה לא קוד הקבוצה.',
           'Got a code from a personal coach? Enter it here. This is not the team code.')}
      </p>
      {inner}
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
// ערכים משותפים לכרטיס המשימה ולבאנר שלה — שניהם מציגים את אותה שורה
// מ-player_assignments, רק בשתי צורות.
function assignmentBits(a, compl) {
  const drill = a.drill
  const target = Number(a.target_value) || 0
  const prog = Number(compl?.progress_value) || 0
  return {
    drill,
    target,
    prog,
    hasTarget: target > 0,
    pct: target > 0 ? Math.min(100, Math.round((prog / target) * 100)) : 0,
    reached: target > 0 && prog >= target,
    yt: a.video_url ? getYouTubeId(a.video_url) : null,
    vidUrl: a.video_url ? safeUrl(a.video_url) : null,
    title: drill?.title || a.title || (a.plan ? a.plan.name : L('תרגיל', 'Drill')),
    cat: drill?.category,
    desc: drill?.description || a.note,
    unitStr: a.unit ? ` ${a.unit}` : '',
    dueTx: a.due_date
      ? new Date(a.due_date + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' })
      : null,
  }
}

// ---------- משימות: הבאנר של המשימה הקרובה ----------
// המסמך מצייר משימה אחת גדולה («500 עונשין השבוע») עם מונה, פס התקדמות
// וצ׳יפים מהירים. כאן זו תמיד משימה **אמיתית**: הפתוחה הראשונה, ומעדיפים
// כזו עם יעד מספרי — רק לה יש מה למנות.
function TaskHero({ a, compl, onToggleDone, onProgress }) {
  const [custom, setCustom] = useState('')
  // assignment_completions ברשימת השערים בשרת — כל רישום יידחה ב-RLS,
  // ולכן הפקדים מושבתים ולא «נכשלים».
  const { restricted } = useRestricted()
  const { drill, hasTarget, target, prog, pct, reached, yt, vidUrl, title, cat, desc, unitStr, dueTx } =
    assignmentBits(a, compl)

  const logCustom = () => {
    const n = Number(custom)
    if (n > 0) onProgress(a, n)
    setCustom('')
  }

  return (
    <div className="ps-hero">
      <div className="ps-hero-row">
        <b className="ps-hero-kick">
          {dueTx ? L(`המשימה הקרובה · עד ${dueTx}`, `Next task · by ${dueTx}`) : L('המשימה הקרובה', 'Next task')}
        </b>
        {hasTarget && <span className="ps-hero-pill" dir="ltr">{pct}%</span>}
      </div>
      <b className="ps-hero-title">{title}</b>
      {hasTarget ? (
        <>
          <div className="ps-hero-nums">
            <b className="ps-hero-num" dir="ltr">{prog}</b>
            <span className="ps-hero-sub">
              {L(`מתוך ${target}${unitStr} · `, `of ${target}${unitStr} · `)}
              {reached ? L('הושלם', 'complete') : L(`נשארו ${target - prog}`, `${target - prog} to go`)}
            </span>
          </div>
          <div className="ps-hero-track">
            <span className="ps-hero-bar" style={{ inlineSize: `${pct}%` }} />
          </div>
          {!reached && (
            <div className="ps-hero-acts">
              <button type="button" className="ps-hero-chip" onClick={() => onProgress(a, 10)} disabled={restricted}>+10</button>
              <button type="button" className="ps-hero-chip" onClick={() => onProgress(a, 25)} disabled={restricted}>+25</button>
              <input
                className="ps-hero-in" type="number" dir="ltr" min="1" value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') logCustom() }}
                placeholder={L('כמות', 'How many')}
                aria-label={L('כמה ביצעת?', 'How many did you do?')}
                disabled={restricted}
              />
              <button type="button" className="ps-hero-btn" onClick={logCustom} disabled={restricted || !custom}>
                {L('הוסף', 'Add')}
              </button>
            </div>
          )}
          {reached && (
            <div className="ps-hero-done">
              <b className="ps-h">{L('הגעת ליעד — נשאר רק לסמן', 'Target reached — just mark it')}</b>
              <button type="button" className="ps-btn" onClick={() => onToggleDone(a.id, false)} disabled={restricted}>
                <Check size={17} aria-hidden="true" /> {L('סמן כבוצע', 'Mark done')}
              </button>
            </div>
          )}
        </>
      ) : (
        // המטא (קטגוריה · אישי/קבוצתי · משך) מוצג בבלוק שמתחת — בלי כפילות
        <div className="ps-hero-acts">
          <button type="button" className="ps-hero-btn" onClick={() => onToggleDone(a.id, false)} disabled={restricted}>
            <Check size={15} aria-hidden="true" /> {L('סמן כבוצע', 'Mark done')}
          </button>
        </div>
      )}
      {/* ⚠ ההוראות והסרטון חייבים לחיות גם כאן. המשימה שעולה לבאנר יורדת
          מרשימת הכרטיסים, ובלי הבלוק הזה תרגיל עם תיאור וסרטון הדגמה היה
          מאבד את שניהם בדיוק כשהוא המשימה הקרובה ביותר. */}
      {(desc || yt || vidUrl || drill?.duration_minutes) && (
        <div className="ps-hero-done">
          {desc && <DrillText text={desc} className="ps-mut" />}
          <div className="ps-steps">
            {drill?.duration_minutes && (
              <span className="ps-chip ps-chip--mut"><Clock size={12} aria-hidden="true" /> {drill.duration_minutes} {L("דק'", 'min')}</span>
            )}
            <span className="ps-chip ps-chip--mut">{a.player_id ? L('נשלח אליך אישית', 'Sent to you') : L('לכל הקבוצה', 'Whole team')}</span>
            {cat && <span className="ps-chip ps-chip--mut">{cat}</span>}
          </div>
          {(yt || vidUrl) && (
            <a
              className="ps-media" href={vidUrl || '#'} target="_blank" rel="noopener noreferrer"
              style={yt ? { backgroundImage: `url("https://img.youtube.com/vi/${yt}/hqdefault.jpg")` } : undefined}
            >
              <span className="ps-play"><Play size={16} fill="currentColor" aria-hidden="true" /></span>
              <span className="ps-media-tag">{yt ? L('סרטון הדגמה · YouTube', 'Demo · YouTube') : L('לצפייה בסרטון', 'Watch video')}</span>
            </a>
          )}
        </div>
      )}
      {/* ⚠ ‏.rstr-note שקוף וצבוע ב---text-muted — על באנר צבעוני הוא לא
          נקרא. הקופסה הלבנה מחזירה לו את הרקע שלו, וה-CTA לשליחת קישור
          להורה נשמר (בלעדיו הקטין תקוע בלי דרך לצאת מהמצב). */}
      {restricted && (
        <div className="ps-hero-done">
          <RestrictedNote>
            {L('אפשר לבצע את התרגיל — רישום הביצוע באפליקציה נפתח אחרי שההורה יאשר.',
               'You can do the drill — logging it in the app opens once your parent approves.')}
          </RestrictedNote>
        </div>
      )}
    </div>
  )
}

function AssignmentCard({ a, compl, onToggleDone, onProgress }) {
  const [custom, setCustom] = useState('') // קלט "כמה עשיתי?"
  const [customOpen, setCustomOpen] = useState(false)
  // assignment_completions נמצאת ברשימת השערים בשרת — כל רישום ביצוע
  // או התקדמות יידחה ב-RLS, ולכן הכפתורים מושבתים ולא «נכשלים».
  const { restricted } = useRestricted()
  const { drill, hasTarget, target, prog, pct, reached, yt, vidUrl, title, cat, desc, unitStr, dueTx } =
    assignmentBits(a, compl)

  const logCustom = () => {
    const n = Number(custom)
    if (n > 0) onProgress(a, n)
    setCustom(''); setCustomOpen(false)
  }

  return (
    <article className="ps-card">
      <div className="ps-card-head">
        <h2 className="ps-h">{title}</h2>
        {cat && <span className="ps-chip ps-chip--mut">{cat}</span>}
      </div>
      {desc && <DrillText text={desc} className="ps-mut" />}
      <div className="ps-steps">
        {drill?.duration_minutes && (
          <span className="ps-chip ps-chip--mut"><Clock size={12} aria-hidden="true" /> {drill.duration_minutes} {L("דק'", 'min')}</span>
        )}
        {dueTx && (
          <span className="ps-chip ps-chip--acc"><CalendarDays size={12} aria-hidden="true" /> {L('עד', 'by')} {dueTx}</span>
        )}
        <span className="ps-chip ps-chip--mut">{a.player_id ? L('נשלח אליך אישית', 'Sent to you') : L('לכל הקבוצה', 'Whole team')}</span>
      </div>
      {(yt || vidUrl) && (
        <a
          className="ps-media" href={vidUrl || '#'} target="_blank" rel="noopener noreferrer"
          style={yt ? { backgroundImage: `url("https://img.youtube.com/vi/${yt}/hqdefault.jpg")` } : undefined}
        >
          <span className="ps-play"><Play size={16} fill="currentColor" aria-hidden="true" /></span>
          <span className="ps-media-tag">{yt ? L('סרטון הדגמה · YouTube', 'Demo · YouTube') : L('לצפייה בסרטון', 'Watch video')}</span>
        </a>
      )}
      {hasTarget ? (
        <>
          <div className="ps-card-head">
            <span className="ps-lbl">{L('ההתקדמות שלך', 'Your progress')}</span>
            {/* X/Y בתוך טקסט עברי — dir="ltr" כדי שהסלאש לא יתהפך */}
            <b className="ps-num ps-end" dir="ltr">{prog}/{target}{unitStr}</b>
          </div>
          <div className="ps-track"><span style={{ inlineSize: `${pct}%` }} /></div>
          <div className="ps-steps">
            <button type="button" className="ps-add" onClick={() => onProgress(a, 10)} disabled={restricted}>+10</button>
            <button type="button" className="ps-add" onClick={() => onProgress(a, 25)} disabled={restricted}>+25</button>
            {customOpen ? (
              <>
                <input
                  className="ps-in" type="number" dir="ltr" min="1" autoFocus value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') logCustom() }}
                  placeholder="50" aria-label={L('כמה ביצעת?', 'How many did you do?')}
                />
                <button type="button" className="ps-add" onClick={logCustom} aria-label={L('שמירת ערך', 'Save value')}>
                  <Check size={14} aria-hidden="true" />
                </button>
              </>
            ) : (
              <button type="button" className="ps-add" onClick={() => setCustomOpen(true)} disabled={restricted}>
                {L('כמה עשיתי?', 'Log amount')}
              </button>
            )}
          </div>
          {/* תרגיל שנפתח מחדש כשההתקדמות כבר על היעד — דרך מפורשת לסמן שוב בוצע */}
          {reached && (
            <button type="button" className="ps-btn" onClick={() => onToggleDone(a.id, false)} disabled={restricted}>
              <Check size={17} aria-hidden="true" /> {L('סמן כבוצע', 'Mark done')}
            </button>
          )}
        </>
      ) : (
        <button type="button" className="ps-btn" onClick={() => onToggleDone(a.id, false)} disabled={restricted}>
          <Check size={17} aria-hidden="true" /> {L('סמן כבוצע', 'Mark done')}
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

// שורת משימה שבוצעה — במסמך אלה שורות ההיסטוריה בתחתית המסך.
// לחיצה פותחת אותה מחדש, בדיוק כמו הכרטיס הירוק שהיה כאן קודם.
function DoneRow({ a, compl, onToggleDone }) {
  const { restricted } = useRestricted()
  const { hasTarget, target, prog, title, unitStr } = assignmentBits(a, compl)
  return (
    <button
      type="button" className="ps-linkrow" onClick={() => onToggleDone(a.id, true)}
      aria-pressed="true" disabled={restricted}
    >
      <span className="ps-okdot" aria-hidden="true"><Check size={14} /></span>
      <span className="ps-row-main">
        <b className="ps-t13b">{title}</b>
        <span className="ps-lbl">
          {hasTarget
            ? L(`בוצע · ${prog}/${target}${unitStr}`, `Done · ${prog}/${target}${unitStr}`)
            : L('בוצע · כל הכבוד', 'Done · nice work')}
        </span>
      </span>
      <span className="ps-chip ps-chip--ok">{L('בוצע', 'Done')}</span>
    </button>
  )
}

// ---------- הפקת קישור אישור להורה, למאמן אישי מסוים ----------
// אותו רעיון כמו קישור ההסכמה הראשי: הקטין מייצר, ומעביר להורה בוואטסאפ.
// אין תשתית מייל בפרויקט, ולכן זו הדרך — מתועד כפער ידוע ב-HANDOFF.
function ParentLinkButton({ coachId, coachName }) {
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)

  const make = async () => {
    if (!coachId) return
    setBusy(true)
    const { data, error } = await supabase.rpc('create_trainee_consent_request', { p_coach: coachId })
    setBusy(false)
    if (error || !data?.ok) {
      const reason = data?.reason
      // ⚠ רק PGRST202 פירושו «ה-RPC אינו קיים». התאמה רחבה על
      // /function .* does not exist/ תפסה גם שגיאה **מתוך** הפונקציה —
      // קריאה לפונקציה חסרה בגוף שלה — והציגה «הפיצ׳ר לא הופעל» על מסד
      // שהמיגרציה בו רצה בהצלחה. זה הסתיר את התקלה האמיתית (digest של
      // pgcrypto שאינו בנתיב החיפוש) וכיוון אותנו למקום הלא נכון.
      const rpcMissing = error?.code === 'PGRST202'
      toast.error(
        rpcMissing
          ? L('הפיצ׳ר עוד לא הופעל. פנה למאמן.', 'Not enabled yet. Ask your coach.')
          : reason === 'need_guardian'
            ? L('אין הורה רשום בחשבון שלך. השלם קודם את אישור ההורה בהגדרות.',
                'No guardian on file. Complete the parent approval in settings first.')
            : reason === 'no_bond'
              ? L('אין קשר פעיל עם המאמן הזה.', 'No pending connection with this coach.')
              // כל השאר: מציגים את מה שהשרת אמר. הודעה גנרית עולה זמן.
              : L('לא הצלחנו לייצר קישור: ', 'Could not create a link: ') + (error?.message || reason || ''),
      )
      return
    }
    setLink(`${siteUrl()}/#/consent/${data.token}`)
  }

  const share = () => {
    const text = L(
      `היי, אני רוצה להתאמן אישית עם ${coachName}. צריך את האישור שלך — הקישור כאן: ${link}`,
      `Hi, I'd like to train one-on-one with ${coachName}. It needs your approval: ${link}`,
    )
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener')
  }

  if (!link) {
    return (
      <button type="button" className="wl-chip" onClick={make} disabled={busy}>
        <Link2 size={13} /> {busy ? L('רגע...', 'One moment...') : L('שליחת קישור להורה', 'Send a link to a parent')}
      </button>
    )
  }

  return (
    <div className="pl-pcoach-link">
      <input className="finder-input" readOnly value={link} dir="ltr" onFocus={(e) => e.target.select()} />
      <div className="pl-pcoach-link-row">
        <button type="button" className="wl-chip ok" onClick={share}>
          <MessageCircle size={13} /> {L('שליחה בוואטסאפ', 'Send on WhatsApp')}
        </button>
        <button
          type="button"
          className="wl-chip"
          onClick={async () => {
            try { await navigator.clipboard.writeText(link); toast.success(L('הקישור הועתק', 'Link copied')) }
            catch { toast.error(L('ההעתקה נכשלה — סמן והעתק', 'Copy failed — select and copy')) }
          }}
        >
          <Copy size={13} /> {L('העתקה', 'Copy')}
        </button>
      </div>
      <p className="muted small" style={{ margin: '6px 0 0' }}>
        {L('הקישור תקף 14 יום ומיועד להורה בלבד.', 'The link is valid for 14 days and is meant for a parent only.')}
      </p>
    </div>
  )
}

// ---------- המאמנים האישיים שלי ----------
// יושב מעל «המשימות שלי» ולא בטאב נפרד: המשימות מהמאמן האישי נוחתות
// ממילא באותה רשימה (player_assignments), והכרטיס הזה עונה על השאלה
// «ממי זה הגיע» בלי להוסיף יעד ניווט שמינימנו.
// שם המאמן ותיאור הסטטוס — שניהם מוצגים גם בכרטיס וגם בגיליון
const coachDisplayName = (r) =>
  `${r.coach?.first_name || ''} ${r.coach?.last_name || ''}`.trim() || L('מאמן', 'Coach')
const statusTx = (s) =>
  s === 'active' ? L('מאמן פעיל', 'Active coach')
    : s === 'pending_parent' ? L('ממתין לאישור ההורה', 'Waiting for a parent')
      : L('ממתין לאישור המאמן', 'Waiting for the coach')

function MyPersonalCoaches({ session, bell, setView }) {
  const [cardOf, setCardOf] = useState(null) // השורה שהגיליון פתוח עליה
  // ⚠ מתחיל כמערך ריק ולא כ-null, במכוון.
  // הגרסה הקודמת התחילה ב-null והחזירה null עד שהשאילתה ענתה — כלומר
  // הכרטיס **לא היה קיים** בזמן הטעינה, וכל תקלה בצד השרת (טבלה חסרה,
  // הרשאה, בקשה שלא נפתרת) הסתירה אותו לגמרי. הכרטיס הוא נקודת הכניסה
  // היחידה להזנת קוד המאמן — אסור שהוא יהיה תלוי בתשובה כלשהי מהשרת.
  // עכשיו הוא מרונדר תמיד, והנתונים רק ממלאים אותו.
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [tick, setTick] = useState(0) // טעינה מחדש אחרי בקשה שנשלחה

  useEffect(() => {
    let alive = true
    ;(async () => {
      // ⚠ רק עמודות מהרשימה המותרת של privacy4 — עמודה אסורה אחת
      // מפילה את כל השאילתה עם permission denied.
      const { data, error } = await supabase
        .from('personal_trainees')
        .select('id, status, coach:profiles!personal_trainees_coach_id_fkey(id, first_name, last_name, club)')
        .eq('player_id', session.user.id)
        .neq('status', 'ended')
      if (!alive) return
      // טבלה חסרה = המיגרציה טרם רצה. לא מציגים כלום, לא מקפיצים שגיאה.
      setRows(error ? [] : data || [])
    })().catch(() => { if (alive) setRows([]) })
    // ה-catch אינו קישוט: rows===null הוא המצב היחיד שבו הכרטיס אינו
    // מרונדר בכלל, ובקשה שלא נפתרת הייתה משאירה אותו שם לנצח — בדיוק
    // סוג התקיעה השקטה שהפילה את מסך הטעינה הראשי (App.jsx).
    return () => { alive = false }
  }, [session.user.id, tick])


  const active = rows.filter((r) => r.status === 'active')
  const pending = rows.filter((r) => r.status !== 'active')
  const band = [
    { value: rows.length, label: L('מאמנים', 'Coaches') },
    { value: active.length, label: L('פעילים', 'Active') },
    { value: pending.length, label: L('ממתינים', 'Pending') },
  ]

  return (
    <PlayerScreen page="pcoach" band={rows.length ? band : null} bell={bell}>
      {/* במסמך הבאנר הוא **כרטיס המאמן** — לחיצה פותחת גיליון עם הפרטים */}
      {rows.map((r) => (
        <button key={r.id} type="button" className="ps-coach" onClick={() => setCardOf(r)}>
          <span className="ps-av-lg" aria-hidden="true">{initialsOf(coachDisplayName(r))}</span>
          <span className="ps-coach-tx">
            <span className="ps-hero-kick">{L('המאמן האישי שלי', 'My personal coach')}</span>
            <b className="ps-hero-title">{coachDisplayName(r)}</b>
            <span className="ps-hero-sub">
              {r.coach?.club ? r.coach.club + ' · ' : ''}{statusTx(r.status)}
            </span>
          </span>
          <span className="ps-coach-end">
            <span className="ps-hero-pill">{L('כרטיס מאמן', 'Coach card')}</span>
            <ChevronFwd size={16} />
          </span>
        </button>
      ))}

      {/* ⚠ אישור ההורה נשאר על המסך עצמו ולא רק בגיליון: בלי אישור לא מגיעות
          מהמאמן הזה שום משימות, וזו הפעולה היחידה שמוציאה את השחקן מהמצב
          התקוע. כפתור שמתגלה רק אחרי לחיצה על הכרטיס הוא כפתור שלא נלחץ. */}
      {rows.filter((r) => r.status === 'pending_parent').map((r) => (
        <div key={'p' + r.id} className="ps-card">
          <div className="ps-card-head">
            <b className="ps-h">{L('אישור ההורה', 'Parental approval')}</b>
            <span className="ps-chip ps-chip--acc">{coachDisplayName(r)}</span>
          </div>
          <p className="ps-mut">
            {L('כדי להתחיל, ההורה שלך צריך לאשר את המאמן הזה. עד אז לא יגיעו ממנו משימות.',
               'To start, your parent needs to approve this coach. No tasks arrive until then.')}
          </p>
          <ParentLinkButton
            coachId={r.coach?.id}
            coachName={`${r.coach?.first_name || ''} ${r.coach?.last_name || ''}`.trim()}
          />
        </div>
      ))}

      {rows.length === 0 && (
        <div className="ps-card">
          <div className="ps-empty">
            <span className="ps-empty-ic"><UserPlus size={20} aria-hidden="true" /></span>
            <b>{L('אין לך עדיין מאמן אישי', 'No personal coach yet')}</b>
            <p>{L('מאמן שעובד איתך אחד על אחד, בנפרד מהקבוצה. המשימות שהוא שולח מופיעות ב«המשימות שלי».',
                  'A coach who works with you one-on-one, separately from the team. Tasks they send appear under “My tasks”.')}</p>
          </div>
        </div>
      )}

      <div className="ps-cols">
        <div className="ps-card">
          <div className="ps-card-head">
            <b className="ps-h">{rows.length ? L('הוספת מאמן', 'Add a coach') : L('יש לי קוד', 'I have a code')}</b>
            <button type="button" className="ps-add" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
              {adding ? L('סגירה', 'Close') : L('הזנת קוד', 'Enter a code')}
            </button>
          </div>
          {adding
            ? <PersonalCoachJoin compact onSent={() => { setAdding(false); setTick((n) => n + 1) }} />
            : <p className="ps-mut">{L('קיבלת קוד ממאמן? הזן אותו כאן והבקשה תישלח אליו.',
                                       'Got a code from a coach? Enter it here and the request goes to them.')}</p>}
        </div>

        {/* «מה המאמן נתן לי» מהמסמך — קיצורי דרך אמיתיים, לא נתוני דמה */}
        {setView && (
          <div className="ps-card">
            <b className="ps-h">{L('מה המאמן נתן לי', 'What my coach gave me')}</b>
            <button type="button" className="ps-linkrow" onClick={() => setView('drills')}>
              <span className="ps-grow ps-t13">{L('המשימות שלי', 'My tasks')}</span>
              <span className="ps-linkrow-go">{L('לפתוח', 'Open')}</span>
            </button>
            <button type="button" className="ps-linkrow" onClick={() => setView('goals')}>
              <span className="ps-grow ps-t13">{L('היעדים שלי', 'My goals')}</span>
              <span className="ps-linkrow-go">{L('לפתוח', 'Open')}</span>
            </button>
            <button type="button" className="ps-linkrow" onClick={() => setView('videos')}>
              <span className="ps-grow ps-t13">{L('סרטוני לימוד', 'Media')}</span>
              <span className="ps-linkrow-go">{L('לפתוח', 'Open')}</span>
            </button>
          </div>
        )}
      </div>

      {cardOf && <CoachCardSheet row={cardOf} onClose={() => setCardOf(null)} />}
    </PlayerScreen>
  )
}

// ---------- גיליון «כרטיס מאמן» ----------
// ⚠ ‏createPortal ל-body בכוונה: ‎.main-inner מסיים אנימציית view-enter עם
// transform, וזה הופך אותו ל-containing block לכל position:fixed שבתוכו —
// השכבה הייתה נכלאת בתוך העמודה ולא מכסה את המסך.
function CoachCardSheet({ row, onClose }) {
  const ref = useFocusTrap(true, onClose)
  // נעילת גלילת הרקע כל עוד הגיליון פתוח — אותה מכניקה כמו AddGoalSheet
  // ו-FeedbackSheet. בלעדיה המסך שמאחורי הכיסוי נגלל בזמן שהמיקוד לכוד
  // בדיאלוג, ו-aria-modal מפסיק לתאר את מה שקורה על המסך.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  const c = row.coach || {}
  return createPortal(
    <div className="ps ps-overlay" data-page="pcoach">
      <button type="button" className="ps-scrim" onClick={onClose} aria-label={L('סגירה', 'Close')} />
      <div className="ps-sheet" ref={ref} role="dialog" aria-modal="true" aria-label={L('כרטיס מאמן', 'Coach card')}>
        <div className="ps-sheet-head">
          <span className="ps-av-lg ps-av-lg--soft" aria-hidden="true">
            {initialsOf(coachDisplayName(row))}
          </span>
          <span className="ps-sheet-tx">
            <span className="ps-sheet-kick">{L('כרטיס מאמן', 'Coach card')}</span>
            <b className="ps-sheet-title">{coachDisplayName(row)}</b>
            {c.club && <span className="ps-mut">{c.club}</span>}
          </span>
          <button type="button" className="ps-x" onClick={onClose} aria-label={L('סגירה', 'Close')}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="ps-sheet-sec">
          <b className="ps-h">{L('הסטטוס שלי אצלו', 'My status with them')}</b>
          <div className={row.status === 'active' ? 'ps-row ps-row--ok' : 'ps-row'}>
            <span className="ps-grow ps-t13">{statusTx(row.status)}</span>
            <span className={row.status === 'active' ? 'ps-chip ps-chip--ok' : 'ps-chip ps-chip--acc'}>
              {row.status === 'active' ? L('פעיל', 'Active') : L('ממתין', 'Pending')}
            </span>
          </div>
        </div>

        {row.status === 'pending_parent' && (
          <div className="ps-sheet-sec">
            <b className="ps-h">{L('אישור ההורה', 'Parental approval')}</b>
            <p className="ps-mut">
              {L('כדי להתחיל, ההורה שלך צריך לאשר את המאמן הזה. עד אז לא יגיעו ממנו משימות.',
                 'To start, your parent needs to approve this coach. No tasks arrive until then.')}
            </p>
            <ParentLinkButton coachId={c.id} coachName={`${c.first_name || ''} ${c.last_name || ''}`.trim()} />
          </div>
        )}

        {row.status === 'pending_coach' && (
          <p className="ps-mut">
            {L('הבקשה נשלחה — המאמן צריך לאשר אותה אצלו באפליקציה.',
               'Request sent — your coach needs to approve it on their side.')}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}

function MyAssignments({ session, bell, coachName, onCoach }) {
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

  // שלד תואם-צורה במקום ספינר — הרשימה לא קופצת מריק למלא.
  // ⚠ בתוך PlayerScreen: הקנבס החדש מוריד את הסרגל העליון במובייל, ומסך
  // בלי באנר היה נשאר בלי כותרת ובלי פעמון בזמן הטעינה.
  if (items === null) {
    return (
      <PlayerScreen page="tasks" bell={bell} coach={coachName} onCoach={onCoach}>
        <SkeletonCards count={3} lines={2} />
      </PlayerScreen>
    )
  }
  const openItems = items.filter((a) => !isDone(a))
  const doneItems = items.filter(isDone)
  const openCount = openItems.length
  const doneCount = doneItems.length
  // האחוז מחשיב גם התקדמות חלקית — 100 מתוך 200 שווה חצי תרגיל
  const pct = items.length ? Math.round((items.reduce((s, a) => s + frac(a), 0) / items.length) * 100) : 0

  // הבאנר הוא המשימה הפתוחה הראשונה, ומעדיפים אחת עם יעד מספרי — היא זו
  // שהמסמך מצייר (מונה + פס + צ׳יפים). כשאין כזו, הראשונה שיש.
  const heroItem = filter === 'done' ? null : (openItems.find((a) => Number(a.target_value) > 0) || openItems[0] || null)
  const cardItems = (filter === 'done' ? [] : openItems).filter((a) => a !== heroItem)
  // ההיסטוריה מוצגת כשהמשתמש ביקש אותה, או כשאין יותר מה לעשות
  const showHistory = doneCount > 0 && (filter !== 'open' || openCount === 0)

  const band = [
    { value: openCount, label: L('פתוחות', 'Open') },
    { value: `${pct}%`, label: L('התקדמות', 'Progress') },
    { value: doneCount, label: L('הושלמו', 'Completed') },
  ]

  return (
    <PlayerScreen page="tasks" band={items.length ? band : null} bell={bell} coach={coachName} onCoach={onCoach}>
      {items.length === 0 ? (
        <div className="ps-card">
          <div className="ps-empty">
            <span className="ps-empty-ic"><Dumbbell size={20} aria-hidden="true" /></span>
            <b>{L('עוד לא קיבלת תרגילים', 'No drills yet')}</b>
            <p>{L('כשהמאמן ישלח לך תרגיל, הוא יופיע כאן.', 'When your coach sends you a drill, it shows up here.')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="ps-steps" role="group" aria-label={L('סינון משימות', 'Filter tasks')}>
            {[['open', L('לביצוע', 'To do'), openCount], ['done', L('בוצעו', 'Done'), doneCount], ['all', L('הכל', 'All'), items.length]].map(([k, lbl, n]) => (
              <button key={k} type="button" className={filter === k ? 'ps-filter is-on' : 'ps-filter'}
                aria-pressed={filter === k} onClick={() => setFilter(k)}>{lbl} · {n}</button>
            ))}
          </div>

          {heroItem && (
            <TaskHero key={heroItem.id} a={heroItem} compl={complBy[heroItem.id]} onToggleDone={toggleDone} onProgress={addProgress} />
          )}

          {/* «אפס משימות פתוחות» — במסמך זה מצב ריק חוגג, לא הודעת מערכת */}
          {!heroItem && filter !== 'done' && (
            <div className="ps-card">
              <div className="ps-empty">
                <span className="ps-empty-ic ps-empty-ic--ok"><Check size={22} aria-hidden="true" /></span>
                <b>{L('אפס משימות פתוחות', 'No open tasks')}</b>
                <p>{L('סיימת הכול. משימות חדשות יופיעו כאן ברגע שהמאמן ישלח.', 'All done. New tasks appear here the moment your coach sends them.')}</p>
              </div>
            </div>
          )}

          {cardItems.length > 0 && (
            <div className="ps-cols">
              {cardItems.map((a) => (
                <AssignmentCard key={a.id} a={a} compl={complBy[a.id]} onToggleDone={toggleDone} onProgress={addProgress} />
              ))}
            </div>
          )}

          {showHistory && (
            <div className="ps-card">
              <b className="ps-h">{L('היסטוריה', 'History')}</b>
              {doneItems.map((a) => (
                <DoneRow key={a.id} a={a} compl={complBy[a.id]} onToggleDone={toggleDone} />
              ))}
            </div>
          )}

          {filter === 'done' && doneCount === 0 && (
            <div className="ps-card">
              <p className="ps-mut">{L('עוד לא סימנת תרגילים כבוצעו.', 'No drills marked done yet.')}</p>
            </div>
          )}
        </>
      )}
    </PlayerScreen>
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
function RsvpButtons({ session, membership, sessionId, sessionDate, hero = false }) {
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

  // hero — אותה לוגיקה בדיוק, בלבוש של הבאנר במסמך העיצוב.
  // ⚠ שתי תשובות ולא שלוש: השרת מכיר yes/no בלבד, ו«אאחר» של המסמך אינו
  //    קיים ב-practice_rsvp. כפתור שלישי כאן היה מבטיח מה שלא נשמר.
  if (hero) {
    return (
      <>
        <span className="ps-hero-note">
          {mine === 'yes' ? L('אישרת הגעה', "You're coming")
            : mine === 'no' ? L('הודעת שלא תגיע', "You're not coming")
            : L('מגיע לאימון?', 'Coming to practice?')}
        </span>
        <div className="ps-rsvp">
          <button type="button" className={mine === 'yes' ? 'is-on' : undefined}
            onClick={() => answer('yes')} disabled={busy || restricted} aria-pressed={mine === 'yes'}>
            {L('מגיע', 'Coming')}
          </button>
          <button type="button" className={mine === 'no' ? 'is-on' : undefined}
            onClick={() => setAskReason((v) => !v)} disabled={busy || restricted} aria-pressed={mine === 'no'}>
            {L('לא אגיע', "Can't make it")}
          </button>
        </div>
        {askReason && (
          <div className="ps-hero-acts">
            <input
              className="ps-hero-in ps-hero-in--wide" type="text" value={reason} maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder={L('למה? (לא חובה)', 'Why? (optional)')}
              aria-label={L('סיבה', 'Reason')}
              onKeyDown={(e) => { if (e.key === 'Enter') answer('no', reason.trim()) }}
            />
            <button type="button" className="ps-hero-btn" disabled={busy} onClick={() => answer('no', reason.trim())}>
              {L('שליחה', 'Send')}
            </button>
          </div>
        )}
        {restricted && (
          <div className="ps-hero-done">
            <RestrictedNote>
              {L('אישור הגעה נשמר אצל המאמן, ולכן הוא נפתח רק אחרי אישור ההורה.',
                 'Your attendance answer is saved with your coach, so it opens only after your parent approves.')}
            </RestrictedNote>
          </div>
        )}
      </>
    )
  }

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
  const [pickedDay, setPickedDay] = useState(null) // null = «היום», או היום הראשון עם אירוע
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
    // session_id נשמר בנפרד מ-id: ל-id יש קידומת (s/p/g) שמונעת התנגשות
    // מפתחות, ואישור ההגעה בבאנר צריך את המזהה הנקי. חיתוך התו הראשון
    // מ-id היה עובד היום ונשבר בשקט ברגע שמישהו ישנה את הקידומת.
    const list = [
      ...expandSlots(slots || [], 0, 30).map((o) => ({ kind: 'practice', id: 's' + o.session_id, session_id: o.session_id, date: o.date, time: o.start_time, end: o.end_time, title: L('אימון קבוצתי', 'Team practice'), location: o.location })),
      ...(pr || []).filter((e) => e.date).map((e) => ({ kind: 'practice', id: 'p' + e.id, session_id: e.id, date: e.date, time: e.start_time, end: e.end_time, title: e.plan?.name || L('אימון קבוצתי', 'Team practice'), location: e.location })),
      ...(gm || []).map((g) => ({ kind: 'game', id: 'g' + g.id, session_id: g.id, date: g.game_date, time: g.game_time, title: g.opponent ? L(`נגד ${g.opponent}`, `vs ${g.opponent}`) : L('משחק', 'Game'), location: g.location })),
    ].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    setItems(list)
    setSlotRows(slots || [])
  }, [membership])

  useEffect(() => { load() }, [load])

  // הלו״ז יושב בתוך המעטפת של PlayerTeamHub, ולכן כאן שלד בלבד
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

  const todayYmd = wkYmd(new Date())
  // היום שנבחר ברשת: מה שהמשתמש לחץ, אחרת היום (אם הוא בשבוע המוצג),
  // אחרת היום הראשון שיש בו אירוע, אחרת ראשון.
  const fallbackDay = weekDays.find((d) => d.date === todayYmd)?.date
    || weekDays.find((d) => d.items.length)?.date
    || weekDays[0].date
  const activeDay = weekDays.some((d) => d.date === pickedDay) ? pickedDay : fallbackDay
  const dayRow = weekDays.find((d) => d.date === activeDay)
  const dayItems = (dayRow?.items || []).slice().sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
  const weekCount = weekDays.reduce((n, d) => n + d.items.length, 0)
  const weekPractices = weekDays.reduce((n, d) => n + d.items.filter((e) => e.kind === 'practice').length, 0)
  const weekGames = weekCount - weekPractices
  const dayNames = L(['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'])
  const kindTx = (ev) => ev.kind === 'game'
    ? (ev.opponent ? L(`נגד ${ev.opponent}`, `vs ${ev.opponent}`) : L('משחק', 'Game'))
    : (ev.plan?.name || L('אימון קבוצה', 'Team practice'))
  const evTone = (ev) => ev.kind === 'game' ? 'warn' : ev.recurring ? 'ok' : 'acc'

  return (
    <>
      {items.length === 0 ? (
        <div className="ps-card">
          <div className="ps-empty">
            <span className="ps-empty-ic"><CalendarDays size={20} aria-hidden="true" /></span>
            <b>{L('אין אירועים קרובים', 'Nothing coming up')}</b>
            <p>{L('ברגע שהמאמן יוסיף אימונים ומשחקים ללו״ז — הם יופיעו כאן אוטומטית.', 'When your coach adds practices and games, they show up here automatically.')}</p>
          </div>
        </div>
      ) : (
        next && (
          <div className="ps-hero">
            <div className="ps-hero-row">
              <b className="ps-hero-kick">
                {next.kind === 'game' ? <BasketballIcon size={13} /> : <Flame size={13} aria-hidden="true" />}{' '}
                {dayLabel(next.date)}
              </b>
              <span className="ps-hero-pill">{next.kind === 'game' ? L('משחק', 'Game') : L('אימון', 'Practice')}</span>
            </div>
            <b className="ps-hero-title">
              {next.title}{next.time ? ` · ${String(next.time).slice(0, 5)}` : ''}
            </b>
            {/* ⚠ טווח השעות ב-bdi dir="ltr": המקף הוא תו ניטרלי, ובפסקה
                RTL הוא הופך את סדר שני המספרים — 17:30–19:00 נצבע 19:00–17:30 */}
            <span className="ps-hero-sub">
              {next.location || L('פרטים נוספים אצל המאמן', 'More details from your coach')}
              {next.end && next.time && (
                <> · <bdi dir="ltr">{String(next.time).slice(0, 5)}–{String(next.end).slice(0, 5)}</bdi></>
              )}
            </span>
            {/* אישור הגעה יושב בבאנר — במסמך זו הפעולה הראשונה במסך */}
            {next.kind === 'practice' && next.date >= todayYmd && (
              <RsvpButtons hero session={session} membership={membership}
                sessionId={next.session_id} sessionDate={next.date} />
            )}
          </div>
        )
      )}

      {/* 1.2 — שבוע אחד ברשת, במקום רשימה אנכית ארוכה */}
      <div className="ps-card">
        <div className="ps-card-head">
          <b className="ps-h" dir="ltr">{weekLabel}</b>
          <span className="ps-chip ps-chip--mut">
            {weekCount === 0
              ? L('שבוע פנוי', 'Free week')
              : [weekPractices ? cnt(weekPractices, L('אימון אחד', 'practice'), L('אימונים', 'practices')) : null,
                 weekGames ? cnt(weekGames, L('משחק אחד', 'game'), L('משחקים', 'games')) : null]
                .filter(Boolean).join(' · ')}
          </span>
          <span className="ps-steps">
            <button type="button" className="ps-hbtn ps-hbtn--quiet"
              onClick={() => setWeekStart(wkAdd(weekStart, -7))} aria-label={L('שבוע קודם', 'Previous week')}>
              <ChevronBack size={16} aria-hidden="true" />
            </button>
            <button type="button" className="ps-add" onClick={() => { setWeekStart(wkSunday(new Date())); setPickedDay(null) }}>
              {L('היום', 'Today')}
            </button>
            <button type="button" className="ps-hbtn ps-hbtn--quiet"
              onClick={() => setWeekStart(wkAdd(weekStart, 7))} aria-label={L('שבוע הבא', 'Next week')}>
              <ChevronFwd size={16} aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className="ps-week">
          {weekDays.map((d, i) => {
            const dt = new Date(d.date + 'T00:00')
            const on = d.date === activeDay
            return (
              <button key={d.date} type="button" className={on ? 'ps-day is-on' : 'ps-day'}
                aria-pressed={on} onClick={() => setPickedDay(d.date)}
                aria-label={`${dayNames[i]} ${dt.getDate()} · ${cnt(d.items.length, L('אירוע אחד', 'event'), L('אירועים', 'events'))}`}>
                <span className="ps-day-nm">{dayNames[i]}</span>
                <span className={d.date === todayYmd ? 'ps-day-num is-today' : 'ps-day-num'}>{dt.getDate()}</span>
                <span className="ps-day-dots" aria-hidden="true">
                  {d.items.slice(0, 3).map((ev) => (
                    <span key={ev.key} className={`ps-dot ps-dot--${evTone(ev)}`} />
                  ))}
                </span>
                <span className="ps-day-evs" aria-hidden="true">
                  {d.items.slice(0, 3).map((ev) => (
                    <span key={ev.key} className={`ps-day-ev ps-day-ev--${evTone(ev)}`}>
                      <b dir="ltr">{String(ev.start_time || '').slice(0, 5) || '—'}</b>
                      {ev.kind === 'game' ? L('משחק', 'Game') : L('אימון', 'Practice')}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* היום שנבחר — האירועים שלו, עם אישור ההגעה מתחת לכל אימון עתידי */}
      <div className="ps-card">
        <div className="ps-card-head">
          <b className="ps-h">
            {activeDay === todayYmd ? L('היום · ', 'Today · ') : ''}
            {new Date(activeDay + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'long' })}
          </b>
          <span className="ps-chip ps-chip--mut">
            {dayItems.length === 0 ? L('ללא אירועים', 'No events') : cnt(dayItems.length, L('אירוע אחד', 'event'), L('אירועים', 'events'))}
          </span>
        </div>
        {dayItems.length === 0 ? (
          <div className="ps-empty">
            <span className="ps-empty-ic"><CalendarDays size={20} aria-hidden="true" /></span>
            <b>{L('יום חופש', 'Rest day')}</b>
            <p>{L('אין אימון או משחק. זמן טוב למשימות שקיבלת.', 'No practice or game. A good time for the tasks you were given.')}</p>
          </div>
        ) : dayItems.map((ev) => (
          <div key={ev.key} className="ps-card ps-card--sub">
            <div className="ps-row ps-row--bare">
              <span className={`ps-bar-i ps-bar-i--${evTone(ev) === 'acc' ? 'acc' : evTone(ev)}`} aria-hidden="true" />
              <span className="ps-row-main">
                <b className="ps-t13b">{kindTx(ev)}</b>
                <span className="ps-lbl">{ev.location || (ev.kind === 'game' ? L('משחק ליגה', 'League game') : L('אימון קבוצה', 'Team practice'))}</span>
              </span>
              <span className="ps-row-end">
                <b className="ps-num" dir="ltr">{String(ev.start_time || '').slice(0, 5) || '—'}</b>
                {ev.end_time && <span className="ps-lbl" dir="ltr">{String(ev.end_time).slice(0, 5)}</span>}
              </span>
            </div>
            {/* ⚠ לא פעמיים לאותו אימון. הבאנר כבר מציג אישור הגעה לאירוע
                הבא, ואם הוא גם היום הנבחר — שני עותקים של RsvpButtons היו
                מחזיקים state נפרד לאותה שורה ב-practice_rsvp, מציגים
                תשובות סותרות, ודורסים זה את זה אצל המאמן. */}
            {ev.kind === 'practice' && ev.date >= todayYmd && ev.session_id !== next?.session_id && (
              <div className="ps-slot">
                <RsvpButtons session={session} membership={membership} sessionId={ev.session_id} sessionDate={ev.date} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 1.8 — «אימונים שהיו» ירד מהלו"ז הפעיל; הארכיון המלא נמצא
          ב«האימונים שלי» (PlayerTimeline). */}
    </>
  )
}

// ---------- מסך: וידאו (סינון לפי קטגוריה + נגן מוטמע) ----------
const PAGE = 12 // כמה סרטונים מוצגים בכל פעם

function PlayerVideos({ bell, coachName, onCoach }) {
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

  // ⚠ בתוך PlayerScreen — ראה ההערה ב-MyAssignments
  if (videos === null) {
    return (
      <PlayerScreen page="media" bell={bell} coach={coachName} onCoach={onCoach}>
        <SkeletonMedia count={6} />
      </PlayerScreen>
    )
  }

  // מדף "המאמן ממליץ": אם יש סרטונים מסומנים בכוכב, ברירת המחדל היא המדף
  // הקטן — לא קיר של 106 סרטונים. "כל הסרטונים" פותח את הספרייה המלאה.
  const featured = videos.filter((v) => v.featured)
  const shelfMode = featured.length > 0 && !allOpen && cat === 'all'
  const cats = ['all', ...VIDEO_CATEGORIES.filter((c) => videos.some((v) => v.category === c))]
  const pool = shelfMode ? featured : videos
  const shown = cat === 'all' ? pool : pool.filter((v) => v.category === cat)
  const visible = shelfMode ? shown : shown.slice(0, limit)

  // המסמך מסדר את המדיה ב**רצועות** לפי נושא ולא בקיר אחד של כרטיסים.
  // כשמסננים לקטגוריה אחת יש רצועה אחת; במדף המומלצים — רצועה אחת מסומנת.
  const strips = shelfMode
    ? [{ key: 'featured', title: L('המאמן ממליץ', 'Coach recommends'), vids: visible }]
    : cat !== 'all'
      ? [{ key: cat, title: cat, vids: visible }]
      : cats.slice(1)
        .map((c) => ({ key: c, title: c, vids: visible.filter((v) => v.category === c) }))
        .filter((r) => r.vids.length > 0)
        // סרטון בלי קטגוריה (או קטגוריה שאינה ברשימה) לא ייפול בין הכיסאות
        .concat((() => {
          const rest = visible.filter((v) => !cats.slice(1).includes(v.category))
          return rest.length ? [{ key: '__rest', title: L('עוד סרטונים', 'More videos'), vids: rest }] : []
        })())

  const band = [
    { value: videos.length, label: L('סרטוני מאמן', 'Coach videos') },
    { value: cats.length - 1, label: L('נושאים', 'Topics') },
    { value: PODCASTS.length, label: L('פודקאסטים', 'Podcasts') },
  ]

  const openVid = (v) => {
    const yt = getYouTubeId(v.url)
    if (yt) setPlaying({ id: yt, title: v.title })
    else window.open(safeUrl(v.url) || '#', '_blank')
  }

  return (
    <PlayerScreen page="media" band={band} bell={bell} coach={coachName} onCoach={onCoach}>
      {/* 1.11 — מתג סרטונים/פודקאסטים, אותה פריסה כמו אצל המאמן */}
      <div className="ps-card">
        <div className="ps-card-head">
          <b className="ps-h">{L('הסרטונים שהמאמן שיתף', 'What your coach shared')}</b>
          <span className="ps-chip ps-chip--mut">YouTube</span>
        </div>
        <div className="ps-steps" role="group" aria-label={L('סינון מדיה', 'Filter media')}>
          <button type="button" className={mediaMode === 'videos' && cat === 'all' && !allOpen ? 'ps-filter is-on' : 'ps-filter'}
            aria-pressed={mediaMode === 'videos' && cat === 'all' && !allOpen}
            onClick={() => { setMediaMode('videos'); setCat('all'); setAllOpen(false); setLimit(PAGE) }}>
            {L('הכל', 'All')}
          </button>
          {mediaMode === 'videos' && cats.slice(1).map((c) => (
            <button key={c} type="button" className={cat === c ? 'ps-filter is-on' : 'ps-filter'}
              aria-pressed={cat === c}
              onClick={() => { setCat(c); setAllOpen(true); setLimit(PAGE) }}>
              {c}
            </button>
          ))}
          <button type="button" className={mediaMode === 'podcasts' ? 'ps-filter is-on' : 'ps-filter'}
            aria-pressed={mediaMode === 'podcasts'} onClick={() => setMediaMode('podcasts')}>
            {L('פודקאסטים', 'Podcasts')}
          </button>
        </div>
      </div>

      {mediaMode === 'podcasts' ? (
        <div className="ps-card">
          <b className="ps-h">{L('פודקאסטים', 'Podcasts')}</b>
          {PODCASTS.map((p) => (
            <a key={p.title} className="ps-linkrow" href={p.url} target="_blank" rel="noreferrer">
              <span className="ps-row-main">
                <b className="ps-t13b">{p.title}</b>
                <span className="ps-lbl">{p.desc}</span>
              </span>
              <span className="ps-chip ps-chip--mut">{p.lang}</span>
              <span className="ps-linkrow-go">{L('פתח', 'Open')}</span>
            </a>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="ps-card">
          <div className="ps-empty">
            <span className="ps-empty-ic"><MonitorPlay size={20} aria-hidden="true" /></span>
            <b>{L('אין סרטונים כרגע', 'No videos yet')}</b>
            <p>{L('המאמן יוסיף כאן סרטוני תרגול — לפי קטגוריות.', 'Your coach will add training videos here, by category.')}</p>
          </div>
        </div>
      ) : (
        <>
          {strips.map((row) => (
            <div key={row.key} className="ps-card">
              <div className="ps-card-head">
                <b className="ps-h">
                  {row.key === 'featured' && <Star size={14} fill="currentColor" aria-hidden="true" />} {row.title}
                </b>
                <span className="ps-chip ps-chip--mut">
                  {cnt(row.vids.length, L('סרטון אחד', 'video'), L('סרטונים', 'videos'))}
                </span>
              </div>
              {/* רצועה נגללת בטלפון, רשת בדסקטופ — כמו במסמך */}
              <div className="ps-strip ps-scrollrow">
                {row.vids.map((v) => {
                  const yt = getYouTubeId(v.url)
                  return (
                    <button key={v.id} type="button" className="ps-vid" onClick={() => openVid(v)}>
                      <span className="ps-thumb" style={yt ? { backgroundImage: `url("https://img.youtube.com/vi/${yt}/hqdefault.jpg")` } : undefined}>
                        <span className="ps-play"><Play size={16} fill="currentColor" aria-hidden="true" /></span>
                      </span>
                      {/* dir=auto — כותרות באנגלית בתוך עמוד RTL הציגו סימני פיסוק בצד הלא נכון */}
                      <b className="ps-vid-tt" dir="auto">{cleanVideoTitle(v.title)}</b>
                      {v.category && <span className="ps-vid-meta">{v.category}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {shelfMode ? (
            <button type="button" className="ps-btn-ghost" onClick={() => setAllOpen(true)}>
              {L(`לכל הסרטונים (${videos.length})`, `All videos (${videos.length})`)}
            </button>
          ) : (
            <>
              {featured.length > 0 && (
                <button type="button" className="ps-btn-ghost" onClick={() => { setAllOpen(false); setCat('all') }}>
                  <Star size={14} fill="currentColor" aria-hidden="true" /> {L('חזרה למומלצים של המאמן', "Back to coach's picks")}
                </button>
              )}
              {shown.length > limit && (
                <button type="button" className="ps-btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
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
    </PlayerScreen>
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
function HomeRsvp({ session, membership, next, variant }) {
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

  // ---- גרסת «לוח» (11.8, מסמך העיצוב 3a) ----
  // שני כפתורים גדולים בתוך הבאנר, ומתחתיהם שורת אישור אחת שמשקפת
  // את מה שנשמר. פאנל הסיבה נשאר — הוא הדרך היחידה לומר «למה לא».
  if (variant === 'board') {
    return (
      <div className="nh-rsvp-ask">
        <div className="nh-rsvp-btns">
          <button
            type="button"
            className={mine === 'yes' ? 'nh-btn nh-btn-primary on' : 'nh-btn nh-btn-primary'}
            onClick={() => answer('yes')}
            disabled={busy || restricted}
            aria-pressed={mine === 'yes'}
          >
            <Check size={16} aria-hidden="true" /> {L('אני מגיע', "I'm coming")}
          </button>
          <button
            type="button"
            className={mine === 'no' ? 'nh-btn nh-btn-ghost on' : 'nh-btn nh-btn-ghost'}
            onClick={() => setAskReason((v) => !v)}
            disabled={busy || restricted}
            aria-pressed={mine === 'no'}
          >
            {L('לא אגיע', "Can't make it")}
          </button>
        </div>
        <p className="nh-rsvp-note">
          {mine === 'yes'
            ? L('רשמנו שאתה מגיע — המאמן רואה', "You're marked as coming — your coach sees it")
            : mine === 'no'
              ? L('רשמנו שלא תגיע — המאמן רואה', "You're marked as not coming — your coach sees it")
              : L(`מגיע ${dayLabel(next.date)}? המאמן רואה את התשובה מיד`, `Coming ${dayLabel(next.date)}? Your coach sees the answer right away`)}
        </p>
        {restricted && (
          <RestrictedNote>
            {L('אישור הגעה נשמר אצל המאמן, ולכן הוא נפתח רק אחרי אישור ההורה.',
               'Your attendance answer is saved with your coach, so it opens only after your parent approves.')}
          </RestrictedNote>
        )}
        {askReason && (
          <div className="nh-rsvp-reason">
            <input
              type="text"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder={L('למה? (לא חובה) — למשל: שיעור, פציעה...', 'Why? (optional) — e.g. class, injury...')}
              onKeyDown={(e) => { if (e.key === 'Enter') answer('no', reason.trim()) }}
            />
            <button type="button" className="nh-btn nh-btn-ghost" disabled={busy} onClick={() => answer('no', reason.trim())}>
              {L('שליחה', 'Send')}
            </button>
          </div>
        )}
      </div>
    )
  }

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

// ---------- בית: «השבוע שלי» — שלושת האירועים הבאים (מסך 3b) ----------
// 1.12 — הלו"ז השבועי הגדול בבית: רכיב הרשימה המשותף (1.2) לשבוע הנוכחי,
// כולל כפתורי אישור הגעה על אימונים קרובים.
const hmShort = (t) => (t ? String(t).slice(0, 5) : '')
function HomeWeek({ session, membership, setView, variant }) {
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

  // ---- גרסת «הלו״ז להמשך» (11.8, מסמך העיצוב 3a) ----
  // רשימה קדימה של שלושת המועדים הבאים, לא רצועת שבעה ימים: המסמך
  // שם את הכרטיס בטור הצדדי, שם אין רוחב לשבע עמודות.
  if (variant === 'card') {
    const todayY = wkYmd(new Date())
    const upcoming = days
      .flatMap((d) => d.items.map((ev) => ({ ...ev, date: d.date })))
      .filter((ev) => ev.date >= todayY)
      .sort((a, b) => (a.date + String(a.start_time || '')).localeCompare(b.date + String(b.start_time || '')))
      .slice(0, 3)
    return (
      <section className="nh-card nh-week">
        <div className="nh-card-head">
          <h2 className="nh-card-title">{L('הלו״ז להמשך', 'What’s next')}</h2>
          <button type="button" className="nh-link" onClick={() => setView('schedule')}>
            {L('ללו״ז המלא', 'Full schedule')} <ChevronFwd size={14} aria-hidden="true" />
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="nh-empty">{L('אין אימונים או משחקים בשבוע הזה.', 'No practices or games this week.')}</p>
        ) : (
          <div className="nh-week-rows">
            {upcoming.map((ev, i) => {
              const dt = new Date(ev.date + 'T00:00')
              return (
                <button
                  key={ev.key}
                  type="button"
                  className={i === 0 ? 'nh-week-row is-next' : 'nh-week-row'}
                  onClick={() => setView('schedule')}
                >
                  <span className="nh-week-day">
                    <b>{dt.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'short' })}</b>
                    <span dir="ltr">{dt.getDate()}</span>
                  </span>
                  <span className="nh-week-tx">
                    <b>{ev.kind === 'game'
                      ? <>{L('משחק', 'Game')}{ev.opponent ? ` · ${ev.opponent}` : ''}</>
                      : (ev.team ? trTeam(ev.team) : L('אימון', 'Practice'))}</b>
                    <span>{ev.location || (ev.plan?.name ? L(`תוכנית: ${ev.plan.name}`, `Plan: ${ev.plan.name}`) : L('אולם הקבוצה', 'Team venue'))}</span>
                  </span>
                  <span className="nh-week-time" dir="ltr">{hmShort(ev.start_time) || ''}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  // רצועת שבעה ימים (9.8, «הגרסה הנקייה») — לוח שידורים במקום רשימה:
  // היום בכתום עם תגית, אימון = שבב חם, משחק = שבב לילה, יום ריק = נקודה.
  // אישור ההגעה נשאר בבאנר ובלו״ז המלא — הרצועה היא תצוגה בלבד.
  const todayStr = wkYmd(new Date())
  return (
    <section className="plh-weekband-sec">
      <div className="plhg-head">
        <p className="pl-section-label"><CalendarDays size={15} /> {L('הלו״ז השבועי', 'This week')}</p>
        <button className="plhg-all" onClick={() => setView('schedule')}>{L('ללו״ז המלא', 'Full schedule')} <ArrowFwd size={14} /></button>
      </div>
      <div className="pwb">
        {days.map((d) => {
          const dt = new Date(d.date + 'T00:00')
          const isToday = d.date === todayStr
          const sorted = [...d.items].sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
          return (
            <div key={d.date} className={'pwb-day' + (isToday ? ' today' : '')}>
              {isToday && <span className="pwb-tag">{L('היום', 'Today')}</span>}
              <p className="pwb-name">
                {dt.toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'short' })}
                <b><bdi dir="ltr">{`${dt.getDate()}.${dt.getMonth() + 1}`}</bdi></b>
              </p>
              {sorted.length === 0 && <span className="pwb-none" aria-hidden="true" />}
              {sorted.map((ev) => (
                <button key={ev.key} type="button"
                  className={'pwb-ev' + (ev.kind === 'game' ? ' gm' : '')}
                  onClick={() => setView('schedule')}>
                  {ev.kind === 'game'
                    ? <>{L('משחק', 'Game')}{ev.opponent ? ` · ${ev.opponent}` : ''}</>
                    : (ev.team || L('אימון', 'Practice'))}
                  <small dir="ltr">{hmShort(ev.start_time) || ''}{ev.end_time ? `–${hmShort(ev.end_time)}` : ''}</small>
                </button>
              ))}
            </div>
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

// ---------- סולם המאמץ המהיר, בבאנר ----------
// תשובה אחת בלחיצה אחת, במקום לפתוח גיליון בשביל מספר יחיד. הגיליון
// המלא נשאר מתחתיו למי שרוצה לכתוב יותר — זה לא מחליף אותו.
//
// המשפט «המאמן רואה את הממוצע של הקבוצה» אינו נימוס: בלעדיו נער מדרג
// לפי מה שנוח לומר למאמן, לא לפי מה שהרגיש, והנתון מאבד את ערכו.
function EffortScale({ session, sessionId, sessionDate }) {
  const [val, setVal] = useState(null)
  const [busy, setBusy] = useState(false)

  const send = async (n) => {
    setBusy(true)
    const { error } = await supabase.from('session_effort').insert({
      player_id: session.user.id,
      session_id: sessionId,
      session_date: sessionDate,
      effort: n,
    })
    setBusy(false)
    if (error) {
      toast.error(L('לא הצלחנו לשמור: ', 'Could not save: ') + error.message)
      return
    }
    setVal(n)
  }

  if (val !== null) {
    return (
      <div className="plh-effort done" role="status">
        <Check size={16} aria-hidden="true" />
        {L('רשמת ', 'You logged ')}<b className="num" dir="ltr">{val}</b>{L(' מתוך 10 — תודה', ' out of 10 — thanks')}
      </div>
    )
  }

  return (
    <div className="plh-effort">
      <span className="plh-effort-h">
        {L('המאמן רואה את הממוצע של הקבוצה, לא מי אמר מה.',
           'Your coach sees the team average, not who said what.')}
      </span>
      <div className="plh-scale" role="group" aria-label={L('דירוג מאמץ מ-1 עד 10', 'Rate effort from 1 to 10')}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button key={n} type="button" disabled={busy} onClick={() => send(n)} aria-label={String(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="plh-scale-ends">
        <span>{L('קל', 'Easy')}</span>
        <span>{L('קשה מאוד', 'Very hard')}</span>
      </div>
    </div>
  )
}

function HomeHero({ profile, membership, onFeedback, refreshKey, session, onNotification }) {
  const [next, setNext] = useState(undefined)
  const [now, setNow] = useState(Date.now())
  const [quoteIdx] = useState(() => Math.floor(Math.random() * COACHING_QUOTES.length))
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
      // sessionId/date נשמרים כדי שהסולם המהיר יוכל לכתוב ישירות
      // ל-session_effort בלי לפתוח את הגיליון המלא.
      setSummary(eff && eff.length
        ? { state: 'done' }
        // session_id ולא id — המועמדים נבנים ב-1780 עם session_id בלבד,
        // ולכן הסולם המהיר מעולם לא עבר את התנאי שלו (סקירה 11.8)
        : { state: 'ask', kind: endedToday.kind, sessionId: endedToday.session_id, date: endedToday.date })
    })()
  }, [membership, profile.id, refreshKey])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const hour = new Date().getHours()
  const greet = hour < 12 ? L('בוקר טוב', 'Good morning') : hour < 18 ? L('צהריים טובים', 'Good afternoon') : L('ערב טוב', 'Good evening')

  // «עכשיו» — מרגע תחילת האימון ועד סופו. שאר משתני הספירה ירדו יחד
  // עם ההצגה הישנה של התג; הלוח מציג שעה גדולה ויום+מקום מתחתיה.
  let started = false
  if (next) {
    const start = new Date(`${next.date}T${next.start_time || '00:00'}`)
    started = start.getTime() - now <= 0 && new Date(`${next.date}T${next.end_time || next.start_time || '23:59'}`).getTime() >= now
  }
  const isGame = next?.kind === 'game'

  // הציטוט בבאנר (מסמך העיצוב 3a) — מתוך אותה רשימה של שאר האפליקציה,
  // נבחר פעם אחת לכל טעינה כדי שלא יתחלף מתחת לאצבע.
  const quote = COACHING_QUOTES[quoteIdx % COACHING_QUOTES.length]

  // ---------------------------------------------------------------------
  // 11.8.2026 — הבאנר נבנה מחדש לפי מסמך העיצוב «דפי בית», כיוון 3a.
  // מרחב שמות חדש nh-* (ראה את ההסבר בראש הבלוק המקביל ב-index.css).
  // סדר המסמך: ברכה ופעמון → ציטוט → «האימון הקרוב» ענק → אישור הגעה →
  // שורת האישורים. כשאין אימון קרוב אבל יש אימון שהסתיים היום בלי סיכום,
  // אותו מקום מציג את «איך היה האימון היום?» — הלולאה שהמסמך לא צייר
  // אבל היא הסיבה שנער פותח את האפליקציה.
  // ---------------------------------------------------------------------
  return (
    <header className={isGame ? 'nh-hero nh-hero-game' : 'nh-hero'}>
      <span className="nh-hero-art" aria-hidden="true"><CourtArt variant="home" /></span>

      <div className="nh-hero-top">
        <Avatar name={`${profile.first_name || ''} ${profile.last_name || ''}`} url={profile.avatar_url} size={42} />
        <div className="nh-hero-who">
          <span className="nh-hero-date">{greet}</span>
          <h1 className="nh-hero-greet">{profile.first_name || L('שחקן', 'Player')}</h1>
        </div>
        <span className="nh-hero-bell"><Notifications session={session} onNavigate={onNotification} /></span>
      </div>

      <p className="nh-quote">
        <span className="nh-quote-mark" aria-hidden="true">״</span>
        <span className="nh-quote-tx">
          {L(quote.text, quote.text_en)}
          <span className="nh-quote-by"> — {L(quote.author, quote.author_en)}</span>
        </span>
      </p>

      {next ? (
        <div className="nh-pnext">
          <span className="nh-next-tag">
            <Clock size={12} aria-hidden="true" />
            {started
              ? (isGame ? L('עכשיו', 'Now') : L('האימון עכשיו', 'Practice now'))
              : (isGame ? L('המשחק הקרוב', 'Next game') : L('האימון הקרוב', 'Next practice'))}
          </span>
          <h2 className="nh-pnext-time">
            {dayLabel(next.date)}{next.start_time ? <> · <span dir="ltr">{next.start_time.slice(0, 5)}</span></> : null}
          </h2>
          <p className="nh-pnext-meta">
            {[next.location, next.title].filter(Boolean).join(' · ')}
          </p>
          {membership && !isGame && <NextPracticeGoal session={session} membership={membership} />}
          {session && <HomeRsvp session={session} membership={membership} next={next} variant="board" />}
        </div>
      ) : (
        <div className="nh-pnext nh-pnext-empty">
          <span className="nh-next-tag"><Clock size={12} aria-hidden="true" /> {L('האימון הקרוב', 'Next practice')}</span>
          <h2 className="nh-pnext-time">{L('אין אימון בלו״ז', 'Nothing scheduled')}</h2>
          <p className="nh-pnext-meta">
            {membership
              ? L('ברגע שהמאמן יקבע אימון הוא יופיע כאן.', 'As soon as your coach schedules a practice it shows up here.')
              : L('מצטרפים לקבוצה עם קוד מהמאמן ומתחילים.', 'Join your team with a code from your coach.')}
          </p>
        </div>
      )}

      {summary?.state === 'ask' && (
        <div className="nh-ask">
          <strong className="nh-ask-title">
            {summary.kind === 'game' ? L('איך היה המשחק היום?', 'How was the game today?') : L('איך היה האימון היום?', 'How was practice today?')}
          </strong>
          {!restricted && summary.sessionId && (
            <EffortScale session={session} sessionId={summary.sessionId} sessionDate={summary.date} />
          )}
          <button type="button" className="nh-btn nh-btn-primary nh-ask-cta" onClick={onFeedback} disabled={restricted}>
            <Send size={16} aria-hidden="true" /> {L('מלא סיכום אימון', 'Log session summary')}
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
        <span className="nh-done"><Check size={14} aria-hidden="true" /> {L('הסיכום של היום אצל המאמן', "Today's summary is with your coach")}</span>
      )}
    </header>
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
  // מצב ריק עם כיוון (7.8) — הכרטיס הקר נשאר, מסביר מה יגיע אליו
  if (!rev) {
    return (
      <section className="pl-block plr-card">
        <p className="pl-section-label">{L('סיכום האימון האחרון', 'Last practice recap')}</p>
        <p className="plr-note">
          {L('אחרי כל אימון המאמן כותב סיכום קצר לקבוצה — מה עבד, על מה ממשיכים. הסיכום הבא יופיע כאן.', 'After every practice your coach writes a short team recap — what worked, what comes next. The next one shows up here.')}
        </p>
      </section>
    )
  }
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
function HomeTasks({ session, setView, variant }) {
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
    // משימות שנסגרו היום נשארות ברשימה (מסמך העיצוב מראה שורה מסומנת
    // עם קו חוצה, והמונה «1/3» סופר אותן) — מה שנסגר לפני היום יורד.
    const doneToday = (c) => c?.done_at && withinDays(c.done_at, 1)
    setRows(
      (asg || [])
        .filter((a) => (a.status || 'active') !== 'archived')
        .filter((a) => { const c = by.get(a.id); return !c?.done_at || doneToday(c) })
        .slice(0, 3)
        .map((a) => ({ a, prog: Number(by.get(a.id)?.progress_value) || 0, done: !!by.get(a.id)?.done_at })),
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

  // סימון «בוצע» מהעיגול שבמסמך — עובד גם למשימה בלי יעד מספרי,
  // שבה הרישום ההדרגתי לא רלוונטי בכלל.
  const complete = async (a) => {
    const target = Number(a.target_value) || null
    const { error } = await supabase.from('assignment_completions')
      .upsert({ assignment_id: a.id, player_id: me, progress_value: target, done_at: new Date().toISOString() })
    if (error) { toast.error(L('השמירה נכשלה', 'Save failed')); return }
    toast.success(L('סיימת את התרגיל! 🎉', 'Drill complete! 🎉'))
    burstConfetti()
    load()
  }

  if (rows === null) return null

  // ---- גרסת «כרטיס» (11.8, מסמך העיצוב 3a) ----
  // כותרת כתומה, שורה לכל משימה עם עיגול סימון, פס התקדמות ומונה,
  // וקישור «לכל המשימות שלי». המסמך קורא לכרטיס «המשימות לאימון הקרוב»,
  // אבל למשימה אין שיוך לאימון בבסיס הנתונים — ולכן הכותרת נשארת
  // «המשימות שלי», מה שהיא באמת.
  if (variant === 'card') {
    const done = rows.filter((r) => r.done).length
    return (
      <section className="nh-card nh-tasks">
        <div className="nh-card-head nh-tasks-head">
          <h2 className="nh-card-title">{L('המשימות שלי', 'My tasks')}</h2>
          {rows.length > 0 && <span className="nh-chip" dir="ltr">{done}/{rows.length}</span>}
        </div>
        {rows.length === 0 ? (
          <p className="nh-empty">
            {L('אין משימות פתוחות כרגע — כל תרגיל שהמאמן ישלח ינחת כאן.', "No open tasks right now — every drill your coach sends lands here.")}
            {' '}
            <button type="button" className="nh-empty-cta" onClick={() => setView('drills')}>{L('לספריית התרגילים ←', 'Browse the drill library')}</button>
          </p>
        ) : (
          <div className="nh-task-rows">
            {rows.map(({ a, prog, done: isDone }) => {
              const target = Number(a.target_value)
              const title = a.drill?.title || a.title || (a.plan ? a.plan.name : L('תרגיל', 'Drill'))
              const pct = target > 0 ? Math.min(100, Math.round((prog / target) * 100)) : 0
              return (
                <div key={a.id} className={isDone ? 'nh-task done' : 'nh-task'}>
                  <button
                    type="button"
                    className="nh-task-tick"
                    onClick={() => complete(a)}
                    disabled={restricted || isDone}
                    aria-label={isDone ? L('בוצע', 'Done') : L('סימון כבוצע', 'Mark as done')}
                    title={L('סימון כבוצע', 'Mark as done')}
                  >
                    {isDone && <Check size={14} aria-hidden="true" />}
                  </button>
                  <button type="button" className="nh-task-body" onClick={() => setView('drills')}>
                    <span className="nh-task-top">
                      <b>{title}</b>
                      {target > 0 && <span className="nh-task-num" dir="ltr">{prog}/{target}{a.unit ? ` ${a.unit}` : ''}</span>}
                    </span>
                    {isDone
                      ? <span className="nh-task-sub done"><Check size={12} aria-hidden="true" /> {L('הושלם · המאמן רואה', 'Done · your coach sees it')}</span>
                      : target > 0
                        ? <span className="nh-task-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                        : <span className="nh-task-sub">{a.note || L('משימה מהמאמן', 'Task from your coach')}</span>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <button type="button" className="nh-card-foot" onClick={() => setView('drills')}>
          {L('לכל המשימות שלי', 'All my tasks')} <ChevronFwd size={14} aria-hidden="true" />
        </button>
        {restricted && (
          <RestrictedNote>
            {L('רישום ההתקדמות נשמר אצל המאמן, ולכן הוא נפתח אחרי אישור ההורה.',
               'Your progress is saved with your coach, so logging it opens after your parent approves.')}
          </RestrictedNote>
        )}
      </section>
    )
  }

  // מצב ריק עם כיוון (7.8) — «מה עליי לעשות» הוא לב המסך גם כשאין משימות
  if (rows.length === 0) {
    return (
      <section className="pl-block plht">
        <div className="plhg-head">
          <p className="pl-section-label"><Dumbbell size={15} /> {L('משימות לתרגול', 'Tasks to practice')}</p>
          <button className="plhg-all" onClick={() => setView('drills')}>{L('הכל', 'All')} <ArrowFwd size={14} /></button>
        </div>
        <p className="plh-empty">
          {L('אין משימות פתוחות כרגע — כל תרגיל שהמאמן ישלח ינחת כאן.', "No open tasks right now — every drill your coach sends lands here.")}
          {' '}
          <button type="button" className="plh-empty-cta" onClick={() => setView('drills')}>{L('לספריית התרגילים ←', 'Browse the drill library')}</button>
        </p>
      </section>
    )
  }
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

  // (7.8) המקטע נשאר גם בלי נתונים — plfb2-none נותן את הכיוון
  if (!membership || !data) return null
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

function PlayerHome({ session, profile, membership, setView, onJoined, onNotification }) {
  const { restricted } = useRestricted()
  const [fbOpen, setFbOpen] = useState(false)
  const [fbRefresh, setFbRefresh] = useState(0) // מרענן את ההירו אחרי שליחת סיכום
  // (11.8) לוח המספרים ירד מהבית עם מסמך העיצוב, ואיתו שבע השאילתות
  // ששירתו אותו בלבד — הן רצו בכל כניסה לבית והתוצאה לא הוצגה בשום מקום.

  // ---------------------------------------------------------------------
  // 11.8.2026 — בית השחקן לפי מסמך העיצוב «דפי בית», כיוון 3a:
  // לוח → המשימות שלי → המשוב האחרון → סרטונים בשבילך. בדסקטופ שני
  // טורים: הראשי נושא את המשימות והמשוב, והצדדי את הלו״ז והסרטונים.
  // ---------------------------------------------------------------------
  return (
    <div className="nh nh-player">
      <HomeHero
        profile={profile}
        membership={membership}
        session={session}
        onFeedback={() => setFbOpen(true)}
        refreshKey={fbRefresh}
        onNotification={onNotification}
      />

      {!membership && <JoinTeam session={session} onJoined={onJoined} compact />}

      {membership && (
        <div className="nh-cols">
          <div className="nh-main">
            <div className="nh-o-tasks"><HomeTasks session={session} setView={setView} variant="card" key={`t${fbRefresh}`} /></div>
            <div className="nh-o-fb">
              <section className="nh-card nh-fb">
                <div className="nh-card-head">
                  <h2 className="nh-card-title">{L('המשוב האחרון', 'Latest feedback')}</h2>
                  <button type="button" className="nh-link" onClick={() => setView('feedback')}>
                    {L('לכל המשובים', 'All feedback')} <ChevronFwd size={14} aria-hidden="true" />
                  </button>
                </div>
                <LastPracticeFeedback session={session} membership={membership} setView={setView} key={`f${fbRefresh}`} />
                <LastTeamReview membership={membership} me={session.user.id} />
              </section>
            </div>
          </div>

          <div className="nh-side">
            <div className="nh-o-week"><HomeWeek session={session} membership={membership} setView={setView} variant="card" /></div>
            <div className="nh-o-videos">
              <HomeVideos onOpen={() => setView('videos')} heading={L('סרטונים בשבילך', 'Videos for you')} cta={L('לכל המדיה', 'All media')} />
            </div>
          </div>
        </div>
      )}

      {/* הגיליון לא נפתח כלל לחשבון מוגבל: session_effort חסומה בשרת,
          ומילוי טופס שלם שנדחה בשליחה גרוע מכפתור מושבת עם הסבר. */}
      {membership && !restricted && (
        <FeedbackSheet session={session} membership={membership} open={fbOpen}
          onClose={() => setFbOpen(false)} onSent={() => setFbRefresh((k) => k + 1)} />
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
function PlayerProfile({ session, profile, membership, memberships, onEdit, onJoined, onSignOut, setView, bell, coachName: coachNameProp, onCoach }) {
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
  const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
  const approved = memberships.filter((m) => m.status === 'approved')

  const band = st ? [
    { value: st.attendancePct != null ? `${st.attendancePct}%` : '—', label: L('נוכחות', 'Attendance') },
    { value: st.done, label: L('תרגילים בוצעו', 'Drills done') },
    { value: st.avgLoad ?? '—', label: L('עומס ממוצע', 'Avg load') },
  ] : null

  return (
    <PlayerScreen page="profile" band={band} bell={bell} coach={coachNameProp} onCoach={onCoach}>
      {/* במסמך הפרופיל נפתח בבאנר זהות — אווטאר גדול, שם, ותפקיד */}
      <div className="ps-hero">
        <div className="ps-prof">
          <span className="ps-prof-av">
            {profile.avatar_url
              ? <Avatar name={fullName} url={profile.avatar_url} size={64} />
              : initialsOf(fullName)}
          </span>
          <span className="ps-coach-tx">
            <span className="ps-hero-kick">
              {approved.length ? trTeam(approved[0].team) : L('שחקן', 'Player')}
            </span>
            <b className="ps-hero-title" dir="auto">{profile.first_name} {profile.last_name}</b>
            <span className="ps-hero-sub">{role}</span>
          </span>
        </div>
        <div className="ps-hero-acts">
          <button type="button" className="ps-hero-btn" onClick={onEdit}>
            <Pencil size={14} aria-hidden="true" /> {L('עריכת פרטים', 'Edit details')}
          </button>
        </div>
      </div>

      <div className="ps-cols">
        <div className="ps-card">
          <b className="ps-h">{L('הקבוצות שלי', 'My teams')}</b>
          {memberships.length === 0 ? (
            <div className="ps-slot"><JoinTeam session={session} onJoined={onJoined} compact /></div>
          ) : (
            <>
              {memberships.map((m) => (
                <div key={m.id} className={m.status === 'approved' ? 'ps-row ps-row--acc' : 'ps-row'}>
                  <span className={m.status === 'approved' ? 'ps-team-av' : 'ps-team-av ps-team-av--mut'} aria-hidden="true">
                    {(trTeam(m.team) || '?').slice(0, 2)}
                  </span>
                  <span className="ps-row-main">
                    <b className="ps-t13b">{trTeam(m.team)}</b>
                    <span className="ps-lbl">{coachName(m.coach)}</span>
                  </span>
                  <span className={m.status === 'approved' ? 'ps-chip ps-chip--ok' : 'ps-chip ps-chip--mut'}>
                    {m.status === 'approved' ? L('מאושר', 'Approved') : m.status === 'pending' ? L('ממתין', 'Pending') : L('נדחה', 'Declined')}
                  </span>
                </div>
              ))}
              <button type="button" className="ps-add" onClick={() => setView('home')}>
                {L('הצטרפות לקבוצה נוספת', 'Join another team')}
              </button>
            </>
          )}
        </div>

        <div className="ps-card">
          <b className="ps-h">{L('הגדרות', 'Settings')}</b>
          <div className="ps-set">
            <span className="ps-set-ic" aria-hidden="true"><Moon size={16} /></span>
            <span className="ps-grow ps-t13">{L('מצב כהה', 'Dark mode')}</span>
            <DarkSwitch />
          </div>
          <div className="ps-set">
            <span className="ps-set-ic" aria-hidden="true"><Globe size={16} /></span>
            <span className="ps-grow ps-t13">{L('שפה', 'Language')}</span>
            <LanguageToggle />
          </div>
          {/* שינוי סיסמה מתוך הפרופיל (TODO §13) */}
          <div className="ps-slot"><ChangePassword /></div>
          <button type="button" className="ps-set" onClick={onSignOut}>
            <span className="ps-set-ic" aria-hidden="true"><LogOut size={16} /></span>
            <span className="ps-grow ps-t13">{L('התנתקות', 'Sign out')}</span>
            <span className="ps-set-val">{L('יציאה', 'Out')}</span>
          </button>
          {/* 1.15 — נתיב בקשת מחיקת חשבון (טבלה מ-supabase_legal_launch.sql; fallback למייל) */}
          <button
            type="button"
            className="ps-set"
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
            <span className="ps-set-ic" aria-hidden="true"><X size={16} /></span>
            <span className="ps-grow ps-t13">{L('בקשת מחיקת חשבון', 'Request account deletion')}</span>
          </button>
        </div>
      </div>

      {/* לשחקן בגיר אין הורה מאשר — הכרטיס כולו יורד מהמסך.
          שני הכרטיסים האלה אינם במסמך העיצוב; הם מקבלים את הקנבס
          החדש דרך ‎.ps-slot ושומרים על המרקאפ המשפטי שלהם. */}
      {!isAdultPlayer(profile) && (
        <div className="ps-card"><div className="ps-slot"><ParentConsentCard profile={profile} /></div></div>
      )}

      {/* זכות עיון — פתוח לכל שחקן, קטין או בגיר */}
      <div className="ps-card"><div className="ps-slot"><MyDataCard /></div></div>
    </PlayerScreen>
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
  { id: 'drills', label: ['המשימות שלי', 'My tasks'], short: ['המשימות', 'Tasks'], Icon: Dumbbell },
  // יעד משלו ולא כרטיס בתוך «המשימות שלי»: זה ערוץ נפרד מהקבוצה, ובלי
  // שורה משלו בתפריט אין דרך למצוא אותו. בלי team:true — הוא זמין גם
  // לשחקן בלי קבוצה, וזה בדיוק מי שמגיע לאפליקציה בשביל מאמן אישי.
  { id: 'pcoach', label: ['המאמן האישי', 'Personal coach'], Icon: UserPlus },
  { id: 'goals', label: ['היעדים שלי', 'My goals'], Icon: Target, team: true },
  { id: 'schedule', label: ['הקבוצה והלו״ז', 'Team & schedule'], short: ['הקבוצה', 'Team'], Icon: CalendarDays, team: true },
  { id: 'feedback', label: ['האימונים שלי', 'My sessions'], short: ['האימונים', 'Sessions'], Icon: MessageSquareHeart, team: true },
  { id: 'videos', label: ['מדיה', 'Media'], Icon: MonitorPlay },
  // «עולם הכדורסל» — העולם התחרותי. אחרון לפני «פרופיל» (בקשת הבעלים):
  // הוא יעד שחוזרים אליו בכוונה, לא משהו שנתקלים בו בדרך למשימות.
  // במכוון **בלי team:true**: כל שחקן רשום מוזמן, גם בלי מאמן ובלי קבוצה
  // — זה בדיוק הקהל שמגיע מהלינק בוואטסאפ ומהאינסטגרם.
  { id: 'boards', label: ['עולם הכדורסל', 'Basketball world'], short: ['הכדורסל', 'World'], Icon: Trophy },
  { id: 'profile', label: ['פרופיל', 'Profile'], Icon: User },
]
// חמשת היעדים של המוקאפ (מסך 3b במסמך המסירה): בית · המשימות שלי ·
// האימונים שלי · הקבוצה · פרופיל. עד היום ישבו כאן שני יעדי צ׳אט
// (coach + teamchat) שתפסו 40% מהסרגל, בעוד היעדים והלו״ז היו במגירה בלבד.
// ניווט־הכיס (11.8, מסמך העיצוב 3a): ארבעה יעדים בגלולה — והכפתור
// הכתום שביניהם פותח את שמונת הפיצ׳רים בגיליון (כולל פרופיל ויעדים).
// ⚠ בדיוק ארבעה. PocketNav מפצל את הרשימה לשניים (Math.ceil(n/2)) משני
// צדי הכפתור המרכזי, ופריט חמישי שובר את הסימטריה של מסמך העיצוב 3a.
// לכן «המגרש» נכנס לגלולה רק אצל מי שאין לו קבוצה — אצלו «הקבוצה והלו״ז»
// ממילא נעול, וכיסא בגלולה מתפנה.
const pocketNavFor = (hasTeam) =>
  hasTeam
    ? ['home', 'drills', 'feedback', 'schedule']
    : ['home', 'boards', 'drills', 'feedback']

// המסכים שעברו לשפה של PlayerScreens.dc.html (17.8). הם חולקים קנבס
// אחד (#F1F5FD / כהה), הבאנר שלהם הוא הכותרת, ולכן הסרגל העליון יורד
// אצלם במובייל — בדיוק כמו בבית וב«עולם הכדורסל».
// ⚠ ‏coach/team/teamchat נמצאים ברשימה כי שלושתם מרנדרים את PlayerTeamHub,
// כלומר את אותו מסך «הקבוצה והלו״ז» עם לשונית פתוחה אחרת.
const PS_VIEWS = ['drills', 'goals', 'schedule', 'pcoach', 'videos', 'profile', 'coach', 'team', 'teamchat', 'feedback']
// אלה שמתחלפים ב-LockedFeature לשחקן בלי קבוצה — ואז אין באנר, ולכן גם
// אסור להוריד את הסרגל העליון
const PS_TEAM_VIEWS = ['goals', 'schedule', 'coach', 'team', 'teamchat', 'feedback']

export default function PlayerDashboard({ session, profile, onProfileReload, restricted: restrictedProp, canSelfConfirm = false }) {
  // נחיתה מכוונת: מי שהגיע מלינק המגרש (#/court) נוחת על המגרש ולא על
  // הבית הכללי. בלי זה כל לינק שנשלח בוואטסאפ מפיל את השחקן במסך הבית
  // והוא צריך למצוא לבד את מה שהובטח לו בהודעה.
  const [view, setView] = useState(() => {
    try {
      const v = localStorage.getItem('pending_view')
      if (v) {
        localStorage.removeItem('pending_view')
        if (['boards', 'drills', 'home'].includes(v)) return v
      }
    } catch { /* ignore */ }
    return 'home'
  })
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
  // ⚠ יעד שאינו ברשימה נופל ל«המשימות שלי» — ולכן התראת «זכית באתגר»
  // הייתה פותחת את מסך המשימות. כל יעד חדש חייב להיכנס לכאן.
  const navFromNotification = (v) => setView(
    ['coach', 'goals', 'feedback', 'community', 'drills', 'teamchat', 'schedule', 'boards'].includes(v)
      ? v
      : v === 'messages' ? 'coach' : 'drills'
  )

  const nav = PLAYER_NAV
  const label = (item) => L(item.label[0], item.label[1])

  // ---- המסכים בשפת PlayerScreens ----
  // ⚠ שתי חריגות, ושתיהן מאותה סיבה: הקנבס החדש מוריד את הסרגל העליון
  //    במובייל כי הבאנר הוא הכותרת. מסך שאין לו באנר יישאר בלי שום כותרת.
  //    (א) עריכת הפרופיל היא טופס רגיל.
  //    (ב) שחקן בלי קבוצה מקבל LockedFeature במקום חמשת מסכי הקבוצה.
  const isPs = !editing && PS_VIEWS.includes(view) && (hasTeam || !PS_TEAM_VIEWS.includes(view))
  // הפעמון יורד לתוך הבאנר של המסך (הסרגל העליון מוסתר שם במובייל).
  // אלמנט חדש בכל רינדור במכוון: ‎.main-inner ממילא ממותג ב-key לפי המסך.
  const psBell = <Notifications session={session} onNavigate={navFromNotification} />
  const psCoachName = coach ? coachName(coach) : null
  // כפתור המאמן בכותרת מוביל ל«המאמן האישי». במסך הזה עצמו אין לאן ללכת.
  const psOnCoach = view === 'pcoach' ? null : () => setView('pcoach')

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
    // ps — המידע שכל אחד מששת המסכים צריך לבאנר שלו (פעמון, שם המאמן
    // לכפתור הקיצור, וניווט אליו). מרוכז כאן כדי שלא ישוכפל בשש קריאות.
    const ps = { bell: psBell, coachName: psCoachName, onCoach: psOnCoach, setView }
    switch (view) {
      case 'drills': return <MyAssignments session={session} {...ps} />
      case 'pcoach': return <MyPersonalCoaches session={session} {...ps} />
      case 'coach':
        return hasTeam
          ? <PlayerTeamHub session={session} membership={membership} coach={coach} restricted={restricted} initialTab="coach" {...ps}
              ScheduleView={<PlayerSchedule session={session} membership={membership} restricted={restricted} />} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('המאמן שלי', 'My coach')}
              desc={L('כדי לכתוב למאמן צריך קודם להצטרף לקבוצה שלו.', 'To message your coach, join their team first.')} />
      case 'feedback':
        return hasTeam
          ? <PlayerTimeline session={session} membership={membership} {...ps} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('האימונים שלי', 'My sessions')}
              desc={L('ההיסטוריה שלך — משוב, עומס ויעדים לכל אימון — נפתחת ברגע שתצטרף לקבוצה.', 'Your history — feedback, effort and goals per session — opens once you join a team.')} />
      case 'goals':
        return hasTeam
          ? <MyGoals session={session} membership={membership} restricted={restricted} {...ps} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('היעדים שלי', 'My goals')}
              desc={L('המאמן יגדיר לך יעדים ברגע שתצטרף לקבוצה. הצטרפו עם קוד מהמאמן.', 'Your coach sets goals once you join a team. Join with a code from your coach.')} />
      case 'schedule':
        return hasTeam
          ? <PlayerTeamHub session={session} membership={membership} coach={coach} restricted={restricted} initialTab="schedule" {...ps}
              ScheduleView={<PlayerSchedule session={session} membership={membership} restricted={restricted} />} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('לוח האימונים והמשחקים', 'Schedule')}
              desc={L('לו״ז האימונים והמשחקים של הקבוצה יופיע כאן. הצטרפו לקבוצה עם קוד מהמאמן.', 'Your team’s practices and games appear here. Join a team with a code from your coach.')} />
      case 'videos': return <PlayerVideos {...ps} />
      case 'teamchat':
        return hasTeam
          ? <PlayerTeamHub session={session} membership={membership} coach={coach} restricted={restricted} initialTab="chat" {...ps}
              ScheduleView={<PlayerSchedule session={session} membership={membership} restricted={restricted} />} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('צ׳אט הקבוצה', 'Team chat')}
              desc={L('צ׳אט הקבוצה נפתח ברגע שהמאמן מאשר אתכם. הצטרפו עם קוד מהמאמן.', 'Team chat opens once your coach approves you. Join with a code from your coach.')} />
      case 'community': return <PlayerCommunity session={session} profile={profile} restricted={restricted} />
      case 'team':
        // קישורים ישנים ממשיכים לעבוד — נפתח על לשונית «הקבוצה שלי»
        return hasTeam
          ? <PlayerTeamHub session={session} membership={membership} coach={coach} restricted={restricted} initialTab="team" {...ps}
              ScheduleView={<PlayerSchedule session={session} membership={membership} restricted={restricted} />} />
          : <LockedFeature session={session} onJoined={loadMemberships}
              title={L('הקבוצה והלו״ז', 'Team & schedule')}
              desc={L('כאן תראו את חברי הקבוצה והאימון הבא. הצטרפו לקבוצה עם קוד מהמאמן.', 'See your teammates and next practice here. Join a team with a code from your coach.')} />
      case 'boards':
        // הפעמון עובר פנימה: במסך הזה הסרגל העליון יורד במובייל
        return <BasketballWorld bell={<Notifications session={session} onNavigate={navFromNotification} />} />
      case 'profile':
        return <PlayerProfile session={session} profile={profile} membership={membership} memberships={memberships} onEdit={() => setEditing(true)} onJoined={loadMemberships} onSignOut={signOut} setView={setView} bell={psBell} coachName={psCoachName} onCoach={psOnCoach} />
      default: return <PlayerHome session={session} profile={profile} membership={membership} setView={setView} onJoined={loadMemberships} onNotification={navFromNotification} />
    }
  }

  return (
    <RestrictedCtx.Provider value={restrictedCtx}>
    <div className={isPs ? 'layout pl-layout ps-host' : 'layout pl-layout'} data-view={editing ? 'edit' : view}>
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
        {/* data-view (7.8) — מאפשר ל-CSS לשחרר את תקרת הרוחב בבית בלבד,
            באותו מנגנון כמו אצל המאמן */}
        <div className={isPs ? 'main-inner ps-view' : 'main-inner'} data-view={editing ? 'edit' : view} key={editing ? 'edit' : view}>
          {/* גדר בטיחות: קריסה במסך אחד לא מוחקת את כל אזור השחקן */}
          <ErrorBoundary screen={`player:${editing ? 'edit' : view}`}>{renderView()}</ErrorBoundary>
          {/* ציטוט מעורר השראה בכל המסכים (חוץ מהצ'אטים — שם הגובה קבוע והוא שובר את שורת הכתיבה) */}
          {/* הציטוט אינו במוקאפ של הבית (3b), של «עולם הכדורסל», ולא של
              ששת מסכי PlayerScreens (17.8) — הם נסגרים בכרטיס משלהם */}
          {!editing && !isPs && !['home', 'teamchat', 'coach', 'community', 'boards'].includes(view) && <PlayerQuote />}
        </div>
      </main>

      {/* ניווט־הכיס (11.8, מסמך העיצוב 3a) — גלולה צפה עם ארבעה יעדים
          וכפתור מרכזי שפותח את כל הפיצ׳רים, במקום שורת הניווט הישנה */}
      <PocketNav
        activeId={editing ? null : view}
        onNavigate={(id) => { setEditing(false); setView(id); setDrawer(false) }}
        items={pocketNavFor(hasTeam).map((id) => {
          const item = nav.find((n) => n.id === id)
          return { id, label: item.short ? L(item.short[0], item.short[1]) : label(item), Icon: item.Icon }
        })}
        all={nav.map((item) => ({ id: item.id, label: label(item), Icon: item.Icon }))}
        footer={
          <>
            <span className="pkn-who">
              <Avatar name={`${profile.first_name} ${profile.last_name || ''}`} url={profile.avatar_url} size={34} />
              <span>
                <span className="pkn-who-nm">{profile.first_name} {profile.last_name}</span>
                <span className="pkn-who-sub">{membership ? trTeam(membership.team) : L('שחקן', 'Player')}</span>
              </span>
            </span>
            <span className="pkn-tools">
              <LanguageToggle />
              <ThemeToggle />
              <button className="btn-ghost" onClick={signOut} aria-label={L('התנתקות', 'Sign out')}>
                <LogOut size={15} aria-hidden="true" />
              </button>
            </span>
          </>
        }
      />
    </div>
    </RestrictedCtx.Provider>
  )
}
