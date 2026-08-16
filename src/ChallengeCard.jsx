import { useCallback, useEffect, useRef, useState } from 'react'
import { Timer, Upload, Check, X, RefreshCw, Video, Flame } from 'lucide-react'
import { L } from './i18n'
import { toast } from './toast'
import { burstConfetti } from './confetti'
import { uploadVideo } from './storage'
import { playSound } from './bwSound'
import ChallengeFeed from './ChallengeFeed'
import { withUnit, useBoundaryTick } from './bwUtil'
import {
  activeChallenge, gameMe, gameSettings, mySubmission, submitChallenge,
  joinCourt, serverNow, syncServerClock,
} from './game'

// ChallengeCard — האתגר הפעיל בדף האתגר של עולם הכדורסל.
//
// הזרימה: רואים את האתגר והחוקים → «אני בפנים» → מצלמים → מעלים קליפ +
// מדווחים תוצאה → ממתינים לאישור המאמן. אפשר להחליף את ההגשה עד סגירת
// החלון (עד 5 גרסאות) — הגרסה האחרונה קובעת.
//
// המראה לפי מסמך העיצוב BasketballWorldV2 (bw-*): כרטיס עם קופסה כתומה
// לכותרת האתגר, כפתור «אני בפנים», טופס קצר, ותיבת «ההגשה באוויר».
// הפיד החי הוא כרטיס נפרד (ChallengeFeed) מתחתיו.
//
// ⚠ הטיימר רץ על שעון **השרת** (serverNow), לא על שעון המכשיר: ילד עם
// שעון שמקדים בשלוש דקות היה רואה «נותרו 3 שניות», לוחץ, ונחסם — ובצדק
// לפי השעון שלו. אין ויכוחים עם שעון אחד.

function remainingParts(closesAt) {
  const ms = new Date(closesAt).getTime() - serverNow().getTime()
  if (!Number.isFinite(ms) || ms <= 0) return null
  const s = Math.floor(ms / 1000)
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

function CountdownChip({ closesAt, opensAt }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  // אתגר במצב open אבל opens_at בעתיד — השרת עוד לא מקבל הגשות
  if (opensAt && new Date(opensAt).getTime() > serverNow().getTime()) {
    return <span className="bw-chip bw-chip--mut">{L(`נפתח ב${closesText(opensAt)}`, `opens ${closesText(opensAt)}`)}</span>
  }
  const r = remainingParts(closesAt)
  if (!r) return <span className="bw-chip bw-chip--mut">{L('החלון נסגר', 'Window closed')}</span>
  const pad = (n) => String(n).padStart(2, '0')
  return (
    <span className="bw-chip bw-chip--ch bw-chip--timer" role="timer">
      <Timer size={13} aria-hidden="true" />
      <span className="bw-sr">{L('נותרו ', 'Time left ')}</span>
      {r.d > 0 && <span>{L(r.d === 1 ? 'יום' : r.d === 2 ? 'יומיים' : `${r.d} ימים`, `${r.d}d`)}</span>}
      <bdi dir="ltr">{r.d > 0 ? `${pad(r.h)}:${pad(r.m)}` : `${pad(r.h)}:${pad(r.m)}:${pad(r.s)}`}</bdi>
    </span>
  )
}

// «pending» בפיד החי פירושו באוויר — אין שער אישור. «approved» = המאמן
// אימת את התוצאה, «rejected» = הוסרה עם סיבה.
const STATUS_TX = {
  pending:  ['ההגשה באוויר', "You're on the feed", 'ממתין לאימות', 'awaiting verification'],
  approved: ['התוצאה אומתה ✓', 'Score verified ✓', '', ''],
  rejected: ['ההגשה הוסרה', 'Entry removed', '', ''],
  blocked:  ['ההגשה הוסרה על ידי המאמן', 'Removed by the coach', '', ''],
}

function closesText(closesAt) {
  if (!closesAt) return ''
  return new Intl.DateTimeFormat(L('he-IL', 'en-GB'), { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })
    .format(new Date(closesAt))
}

export default function ChallengeCard({ onChanged }) {
  const [state, setState] = useState('loading') // loading | none | ready | notDeployed | error
  const [ch, setCh] = useState(null)
  const [me, setMe] = useState(null)
  const [settings, setSettings] = useState(null)
  const [sub, setSub] = useState(null)
  const [uid, setUid] = useState(null)
  const [form, setForm] = useState({ score: '', allowPublish: false, noOthers: false })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [feedKey, setFeedKey] = useState(0)
  const fileRef = useRef(null)
  // רינדור אחד בדיוק כשהחלון נפתח וכשהוא נסגר — בלי זה הטופס נשאר נעול
  // אחרי opens_at, או נשאר פתוח אחרי closes_at, עד שהמשתמש מרענן.
  useBoundaryTick([ch?.opens_at, ch?.closes_at])

  const load = useCallback(async () => {
    setState('loading')
    syncServerClock()
    const [c, m, s] = await Promise.all([activeChallenge(), gameMe(), gameSettings()])
    if (c.notDeployed) { setState('notDeployed'); return }
    if (!c.ok) { setState('error'); return }
    setMe(m.ok ? m.me : null)
    setSettings(s.ok ? s.settings : null)
    if (!c.challenge) { setState('none'); return }
    setCh(c.challenge)
    const my = await mySubmission(c.challenge.id)
    if (my.ok) { setSub(my.submission); setUid(my.uid) }
    setState('ready')
    setFeedKey((k) => k + 1)
  }, [])

  useEffect(() => { load() }, [load])

  if (state === 'loading') return <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />
  if (state === 'notDeployed' || state === 'error') {
    return (
      <div className="bw-card bw-empty">
        <b>{L('לא הצלחנו לטעון את האתגר', "Couldn't load the challenge")}</b>
        <button type="button" className="bw-ghost bw-ghost--ch" onClick={load}>{L('נסה שוב', 'Try again')}</button>
      </div>
    )
  }
  if (state === 'none') {
    return (
      <div className="bw-card bw-empty">
        <Flame size={24} aria-hidden="true" />
        <b>{L('אין אתגר פתוח כרגע', 'No open challenge right now')}</b>
        <p className="bw-mut12">{L('האתגר הבא נפתח בקרוב — שווה לחזור.', 'The next one opens soon — check back.')}</p>
      </div>
    )
  }

  // «פתוח» = status open, אחרי opens_at ולפני closes_at — בדיוק כמו
  // game_challenge_open בשרת. האדמין יכול לפתוח אתגר עם opens_at עתידי,
  // ואז ה-RLS דוחה הגשה שהקליפ שלה כבר עלה.
  const notYetOpen = ch.status === 'open' && !!ch.opens_at && new Date(ch.opens_at).getTime() > serverNow().getTime()
  const open = ch.status === 'open' && !notYetOpen && remainingParts(ch.closes_at) !== null
  // עד 5 גרסאות (game_submissions_guard) — בגרסה 5 אין «הגשה מחדש», ובוודאי
  // לא העלאה של קליפ שידרוס את הקודם לפני שהשרת ידחה את השורה
  const MAX_VER = 5
  const canResubmit = (sub?.version ?? 0) < MAX_VER
  // ⚠ me===null פירושו «game_me לא נטען» (רשת), לא «הפרופיל חסר». השרת
  //   ממילא אוכף, ולכן לא נועלים את הטופס ולא מאשימים את השחקן בטעות.
  const canPlay = !me || !!me.can_play
  const profileBlocked = !!me && !me.can_play
  const maxMb = settings?.video_max_mb || 50
  const maxSec = settings?.video_max_seconds || 65

  const doJoin = async () => {
    const r = await joinCourt('challenge')
    if (r.ok) { toast.success(L('אתה בפנים! מצלמים טייק אחד 🏀', "You're in! Film one take 🏀")); playSound('start'); load(); onChanged?.() }
    else toast.error(L('לא הצלחנו לצרף אותך', "Couldn't join"))
  }

  const doSubmit = async () => {
    const score = Number(form.score)
    if (sub && !canResubmit) { toast.error(L('הגעת למספר ההגשות המרבי (5) — ההגשה האחרונה נשמרה', 'Max 5 submissions reached — your last one stands')); playSound('bad'); return }
    if (!file && !sub) { toast.error(L('צריך לבחור קליפ קודם', 'Pick a clip first')); playSound('bad'); return }
    if (!Number.isFinite(score) || score < 0 || form.score === '') {
      toast.error(L('מה התוצאה? צריך מספר', 'Enter your score as a number')); playSound('bad'); return
    }
    setBusy(true)
    try {
      let path = sub?.media_path || null
      if (file) path = await uploadVideo(file, uid, ch.id, { maxMb, maxSeconds: maxSec })
      const r = await submitChallenge({
        challengeId: ch.id, uid, mediaPath: path, score,
        allowPublish: form.allowPublish, noOthers: form.noOthers,
        existingId: sub?.id || null,
      })
      if (!r.ok) { toast.error(r.message || L('ההגשה נכשלה', 'Submission failed')); return }
      burstConfetti(); playSound('finish')
      toast.success(sub ? L('ההגשה הוחלפה — האחרונה קובעת', 'Submission replaced — the last one counts') : L('ההגשה נקלטה! אתה על הפיד 🔥', 'Submitted! You’re on the feed 🔥'))
      setEditing(false); setFile(null)
      load(); onChanged?.()
    } catch (e) {
      toast.error(e?.message || L('ההעלאה נכשלה', 'Upload failed'))
    } finally {
      setBusy(false)
    }
  }

  const tx = sub ? STATUS_TX[sub.status] : null
  const showForm = open && canPlay && (!sub || (canResubmit && (editing || sub.status === 'rejected')))
  const myScore = sub ? (sub.approved_score ?? sub.reported_score) : null

  return (
    <>
      <div className="bw-card">
        <div className="bw-card-head">
          <h2 className="bw-card-title">{L('האתגר השבועי', 'Weekly challenge')}</h2>
          <CountdownChip closesAt={ch.closes_at} opensAt={ch.opens_at} />
        </div>

        <div className="bw-chbox">
          <span className="bw-chbox-ring" aria-hidden="true" />
          <div className="bw-chbox-k">
            {ch.seq ? L(`אתגר #${ch.seq} · `, `Challenge #${ch.seq} · `) : ''}
            {notYetOpen ? L(`נפתח ב${closesText(ch.opens_at)}`, `opens ${closesText(ch.opens_at)}`)
              : open ? L(`נסגר ב${closesText(ch.closes_at)}`, `closes ${closesText(ch.closes_at)}`) : L('החלון נסגר', 'window closed')}
          </div>
          <div className="bw-chbox-title">{ch.title}</div>
          <p className="bw-chbox-sub">{ch.subtitle || ch.metric_label}</p>
        </div>

        {ch.subtitle && ch.metric_label && <p className="bw-txt13">{ch.metric_label}</p>}
        <p className="bw-mut12">{ch.rules_text || settings?.challenge_rules || L('טייק אחד רצוף · הטיימר בפריים · הסל והקולע בפריים', 'One continuous take · timer in frame · hoop and shooter in frame')}</p>
        {/* הפרס מוצג רק כשהשרת מתיר פרסים (prizes_enabled — נעול עד אישור
            משפטי) — הבטחת פרס שאסור לחלק גרועה מאין פרס. */}
        <span className="bw-pill bw-pill--ch bw-pill--wrap">
          {ch.prize && settings?.prizes_enabled
            ? `🏆 ${L('הפרס', 'Prize')}: ${ch.prize}${ch.sponsor_name ? ` · ${ch.sponsor_name}` : ''}${ch.min_entries_for_prize > 1 ? ` · ${L(`מ-${ch.min_entries_for_prize} הגשות`, `from ${ch.min_entries_for_prize} entries`)}` : ''}`
            : L('התוצאה קובעת את המקום · המאמן מאמת כל הגשה', 'Your score sets your rank · the coach verifies every entry')}
        </span>

        {/* מצב ההגשה שלי */}
        {sub && tx && !editing && (
          <div className={`bw-okbox is-${sub.status}`}>
            {sub.status === 'rejected' || sub.status === 'blocked' ? <X size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
            <span className="bw-okbox-tx">
              {L(tx[0], tx[1])}
              {myScore !== null && <> · <bdi>{withUnit(myScore, ch.metric_unit)}</bdi></>}
              {tx[2] && <> · {L(tx[2], tx[3])}</>}
              {sub.status === 'rejected' && sub.reject_reason && <span className="bw-mut11 bw-block">{sub.reject_reason}</span>}
              {open && !canResubmit && sub.status !== 'approved' && <span className="bw-mut11 bw-block">{L(`הגעת ל-${MAX_VER} גרסאות — ההגשה האחרונה נשמרה`, `${MAX_VER} versions used — your last one stands`)}</span>}
            </span>
            {open && canResubmit && (sub.status === 'pending' || sub.status === 'rejected') && (
              <button type="button" className="bw-link bw-link--ok" onClick={() => setEditing(true)}>
                <RefreshCw size={13} aria-hidden="true" /> {L('הגשה מחדש', 'Resubmit')}
              </button>
            )}
          </div>
        )}

        {notYetOpen && (
          <p className="bw-mut12 bw-locked">{L('האתגר פורסם אבל ההגשה עוד לא נפתחה — חוזרים בשעה שכתובה למעלה.', 'The challenge is published but submissions are not open yet — come back at the time above.')}</p>
        )}

        {/* לא מחובר למגרש עדיין */}
        {open && canPlay && !me?.participant && !sub && (
          <button type="button" className="bw-btn bw-btn--ch" onClick={doJoin}>{L('אני בפנים', "I'm in")}</button>
        )}

        {/* קטין שממתין לאישור, או פרופיל חסר */}
        {open && profileBlocked && (
          <p className="bw-mut12 bw-locked">
            {L('כדי להגיש צריך פרופיל מלא (שם + תאריך לידה), ולקטינים — אישור הורה. הכל בעמוד הפרופיל.',
               'To submit you need a complete profile (name + birth date), and minors need parental approval — all in your profile page.')}
          </p>
        )}

        {/* טופס ההגשה */}
        {showForm && (me?.participant || sub) && (
          <div className="bw-chform">
            <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { setFile(e.target.files?.[0] || null); if (e.target.files?.[0]) playSound('click') }} />
            <button type="button" className="bw-dash" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Video size={15} aria-hidden="true" /> {file ? `${file.name} ✓` : sub ? L('החלף קליפ', 'Replace clip') : L('בחר קליפ מהמצלמה', 'Pick a clip from your camera')}
            </button>
            <p className="bw-mut11">
              {L(`טייק אחד, עד ${Math.floor(maxSec / 5) * 5} שניות, עד ${maxMb}MB — צלמו ב-720p.`, `One take, up to ${Math.floor(maxSec / 5) * 5}s, up to ${maxMb}MB — film in 720p.`)}
            </p>
            <div className="bw-chform-row">
              <input
                type="number" inputMode="numeric" min="0" dir="ltr" className="bw-input"
                value={form.score} aria-label={ch.metric_label}
                onChange={(e) => setForm({ ...form, score: e.target.value })}
                placeholder={ch.metric_unit || ch.metric_label || '0'}
              />
              <button type="button" className="bw-btn bw-btn--ok bw-btn--sm" onClick={doSubmit} disabled={busy}>
                <Upload size={14} aria-hidden="true" /> {busy ? L('מעלה…', 'Uploading…') : L('הגש', 'Submit')}
              </button>
            </div>
            <label className="bw-chk">
              <input type="checkbox" checked={form.noOthers} onChange={(e) => setForm({ ...form, noOthers: e.target.checked })} />
              {L('בקליפ מופיע רק אני', 'Only I appear in the clip')}
            </label>
            <label className="bw-chk">
              <input type="checkbox" checked={form.allowPublish} onChange={(e) => setForm({ ...form, allowPublish: e.target.checked })} />
              {L('אם אעלה לטופ-5 — מותר לפרסם את הקליפ שלי באינסטגרם', 'If I make top-5 — my clip may go on Instagram')}
            </label>
            {sub && <p className="bw-mut11">{L(`גרסה ${sub.version} מתוך ${MAX_VER} — ההגשה האחרונה קובעת.`, `Version ${sub.version} of ${MAX_VER} — the last one counts.`)}</p>}
            {editing && (
              <button type="button" className="bw-link" onClick={() => { setEditing(false); setFile(null) }}>{L('ביטול', 'Cancel')}</button>
            )}
          </div>
        )}
      </div>

      {/* הפיד החי — כרטיס נפרד. כולם רואים את כולם, בלי תגובות. */}
      <ChallengeFeed key={feedKey} challenge={ch} myUid={uid} onChanged={() => { load(); onChanged?.() }} />
    </>
  )
}
