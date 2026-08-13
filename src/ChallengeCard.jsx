import { useCallback, useEffect, useRef, useState } from 'react'
import { Flame, Timer, Upload, Check, X, Hourglass, RefreshCw, Video } from 'lucide-react'
import { L } from './i18n'
import { toast } from './toast'
import { burstConfetti } from './confetti'
import { uploadVideo } from './storage'
import ChallengeFeed from './ChallengeFeed'
import {
  activeChallenge, gameMe, gameSettings, mySubmission, submitChallenge,
  joinCourt, serverNow, syncServerClock,
} from './game'

// ChallengeCard — האתגר הפעיל במסך «המגרש» של השחקן.
//
// הזרימה: רואים את האתגר והחוקים → «אני בפנים» → מצלמים → מעלים קליפ +
// מדווחים תוצאה → ממתינים לאישור המאמן. אפשר להחליף את ההגשה עד סגירת
// החלון (עד 5 גרסאות) — הגרסה האחרונה קובעת.
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

function CountdownLabel({ closesAt }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const r = remainingParts(closesAt)
  if (!r) return <span className="gm-chal-closed-tag">{L('החלון נסגר', 'Window closed')}</span>
  const pad = (n) => String(n).padStart(2, '0')
  return (
    <span className="gm-chal-timer" dir="ltr" aria-label={L('זמן שנותר', 'Time left')}>
      <Timer size={14} aria-hidden="true" />
      {r.d > 0 ? `${r.d}d ${pad(r.h)}:${pad(r.m)}` : `${pad(r.h)}:${pad(r.m)}:${pad(r.s)}`}
    </span>
  )
}

// «pending» בפיד החי פירושו באוויר — אין שער אישור. «approved» = המאמן
// אימת את התוצאה (תג ✓ בפיד), «rejected» = הוסרה עם סיבה.
const STATUS_TAG = {
  pending:  ['ההגשה שלך באוויר! 🔥', "You're on the feed! 🔥", Check],
  approved: ['התוצאה אומתה ✓', 'Score verified ✓', Check],
  rejected: ['ההגשה הוסרה', 'Entry removed', X],
}

export default function ChallengeCard() {
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
  const fileRef = useRef(null)

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
  }, [])

  useEffect(() => { load() }, [load])

  if (state === 'loading') return <div className="loader" role="status" aria-label={L('טוען', 'Loading')} />
  if (state === 'notDeployed' || state === 'error') return null   // הטבלאות מטפלות בהודעה
  if (state === 'none') {
    return (
      <div className="gm-chal gm-chal--none">
        <Flame size={22} aria-hidden="true" />
        <div>
          <b>{L('אין אתגר פתוח כרגע', 'No open challenge right now')}</b>
          <p className="muted small">{L('האתגר הבא נפתח בקרוב — שווה לחזור.', 'The next one opens soon — check back.')}</p>
        </div>
      </div>
    )
  }

  const open = remainingParts(ch.closes_at) !== null && ch.status === 'open'
  const canPlay = !!me?.can_play
  const maxMb = settings?.video_max_mb || 50
  const maxSec = settings?.video_max_seconds || 65

  const doJoin = async () => {
    const r = await joinCourt('challenge')
    if (r.ok) { toast.success(L('אתה בפנים! 🏀', "You're in! 🏀")); load() }
    else toast.error(L('לא הצלחנו לצרף אותך', "Couldn't join"))
  }

  const doSubmit = async () => {
    const score = Number(form.score)
    if (!file && !sub) { toast.error(L('צריך לבחור קליפ', 'Pick a clip first')); return }
    if (!Number.isFinite(score) || score < 0) {
      toast.error(L('מה התוצאה? צריך מספר', 'Enter your score as a number')); return
    }
    setBusy(true)
    try {
      let path = sub?.media_path || null
      if (file) {
        path = await uploadVideo(file, uid, ch.id, { maxMb, maxSeconds: maxSec })
      }
      const r = await submitChallenge({
        challengeId: ch.id, uid, mediaPath: path, score,
        allowPublish: form.allowPublish, noOthers: form.noOthers,
        existingId: sub?.id || null,
      })
      if (!r.ok) {
        toast.error(r.message || L('ההגשה נכשלה', 'Submission failed'))
        return
      }
      burstConfetti()
      toast.success(sub ? L('ההגשה הוחלפה', 'Submission replaced') : L('ההגשה נקלטה! 🔥', 'Submitted! 🔥'))
      setEditing(false)
      setFile(null)
      load()
    } catch (e) {
      toast.error(e?.message || L('ההעלאה נכשלה', 'Upload failed'))
    } finally {
      setBusy(false)
    }
  }

  const Tag = sub ? STATUS_TAG[sub.status] : null
  const TagIcon = Tag ? Tag[2] : null
  const showForm = open && canPlay && (!sub || editing || sub.status === 'rejected')

  return (
    <div className="gm-chal">
      <div className="gm-chal-head">
        <span className="gm-chal-title">
          <Flame size={18} aria-hidden="true" />
          <b>{ch.title}</b>
        </span>
        <CountdownLabel closesAt={ch.closes_at} />
      </div>

      {ch.subtitle && <p className="gm-chal-sub">{ch.subtitle}</p>}
      <p className="gm-chal-metric">{ch.metric_label}</p>
      <p className="muted small gm-chal-rules">{ch.rules_text || settings?.challenge_rules}</p>
      {ch.prize && (
        <p className="gm-chal-prize">🏆 {L('הפרס', 'Prize')}: {ch.prize}{ch.sponsor_name ? ` · ${ch.sponsor_name}` : ''}</p>
      )}

      {/* מצב ההגשה שלי */}
      {sub && Tag && !editing && (
        <div className={`gm-chal-status is-${sub.status}`}>
          <TagIcon size={15} aria-hidden="true" />
          <div>
            <b>{L(Tag[0], Tag[1])}</b>
            {sub.status === 'approved' && (
              <span className="muted small"> · {L('התוצאה', 'Score')}: <bdi>{sub.approved_score ?? sub.reported_score}</bdi></span>
            )}
            {sub.status === 'rejected' && sub.reject_reason && (
              <p className="muted small gm-chal-reason">{sub.reject_reason}</p>
            )}
          </div>
          {open && sub.status !== 'approved' && (
            <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
              <RefreshCw size={14} /> {L('הגשה מחדש', 'Resubmit')}
            </button>
          )}
        </div>
      )}

      {/* לא מחובר למגרש עדיין */}
      {open && canPlay && !me?.participant && !sub && (
        <button type="button" className="btn-primary gm-chal-join" onClick={doJoin}>
          {L('אני בפנים 🏀', "I'm in 🏀")}
        </button>
      )}

      {/* קטין שממתין לאישור, או פרופיל חסר */}
      {open && !canPlay && (
        <p className="gm-chal-locked muted small">
          {L('כדי להגיש צריך פרופיל מלא (שם + תאריך לידה), ולקטינים — אישור הורה. הכל בעמוד הפרופיל.',
             'To submit you need a complete profile (name + birth date), and minors need parental approval — all in your profile page.')}
        </p>
      )}

      {/* טופס ההגשה */}
      {showForm && (me?.participant || sub) && (
        <div className="gm-chal-form">
          <input
            ref={fileRef} type="file" accept="video/*" hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Video size={15} /> {file ? file.name : sub ? L('החלף קליפ', 'Replace clip') : L('בחר קליפ', 'Pick a clip')}
          </button>
          <p className="muted small">
            {L(`טייק אחד, עד ${Math.floor(maxSec / 5) * 5} שניות, עד ${maxMb}MB — צלמו ב-720p.`,
               `One take, up to ${Math.floor(maxSec / 5) * 5}s, up to ${maxMb}MB — film in 720p.`)}
          </p>

          <label className="gm-chal-score">
            {ch.metric_label}
            <input
              type="number" inputMode="numeric" min="0" dir="ltr"
              value={form.score}
              onChange={(e) => setForm({ ...form, score: e.target.value })}
              placeholder={ch.metric_unit || ''}
            />
          </label>

          <label className="gm-chal-chk">
            <input type="checkbox" checked={form.noOthers}
              onChange={(e) => setForm({ ...form, noOthers: e.target.checked })} />
            {L('בקליפ מופיע רק אני', "Only I appear in the clip")}
          </label>
          <label className="gm-chal-chk">
            <input type="checkbox" checked={form.allowPublish}
              onChange={(e) => setForm({ ...form, allowPublish: e.target.checked })} />
            {L('אם אעלה לטופ-5 — מותר לפרסם את הקליפ שלי באינסטגרם', 'If I make top-5 — my clip may go on Instagram')}
          </label>

          {sub && (
            <p className="muted small">{L(`גרסה ${sub.version} מתוך 5 — ההגשה האחרונה קובעת.`, `Version ${sub.version} of 5 — the last one counts.`)}</p>
          )}

          <div className="gm-chal-actions">
            <button type="button" className="btn-primary" onClick={doSubmit} disabled={busy}>
              <Upload size={15} /> {busy ? L('מעלה…', 'Uploading…') : L('הגש', 'Submit')}
            </button>
            {editing && (
              <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setFile(null) }}>
                {L('ביטול', 'Cancel')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* הפיד החי — כולם רואים את כולם, בלי תגובות. מחיקה עצמית מהשורה שלי. */}
      <ChallengeFeed challenge={ch} myUid={uid} metricDir={ch.metric_dir || 'desc'} onChanged={load} />
    </div>
  )
}
