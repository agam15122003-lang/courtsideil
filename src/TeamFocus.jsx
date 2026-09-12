import { useState, useEffect, useCallback } from 'react'
import { Users2, Plus, X, Check, Send as SendIcon, Pencil } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { sendNotification } from './notify'
import { L } from './i18n'
import { PLAYER_SIDE } from './flags'

// "המיקוד של הקבוצה" — עד שלוש נקודות קצרות שכל שחקני הקבוצה רואים אצלם,
// ונשאלים עליהן בסיכום האימון. מחליף שלוש תיבות טקסט חופשי (שבוע/חודש/עונה)
// שאף שחקן לא ראה מהן אות ואי אפשר היה למדוד.
//
// למה בלי שינוי סכמה: שורה ב-player_goals עם player_id = null ו-team מוגדר היא
// כבר "מטרה קבוצתית" — ה-RLS מתיר לשחקני הקבוצה לקרוא אותה
// (supabase_player_goals.sql: pg_player_read), מסך היעדים של השחקן מסמן אותה
// בתג "קבוצתי", וגיליון סיכום האימון שולף אותה בלי סינון שחקן ולכן היא נכנסת
// לשאלה "עמדת ביעדים היום?" ונרשמת ל-session_goal_marks.
// period='week' חובה: FeedbackSheet שולף רק period בתוך session/week/month.

const MAX = 3

// 12.9 — מה נחשב «תיקון ניסוח» של אותה נקודת מיקוד, ומה החלפה מלאה שלה.
// למה זה קריטי: ההבחנה הזו קובעת אם סימוני session_goal_marks הישנים ממשיכים
// להיתלות באותו יעד (ורצועת המגמה ממשיכה) או שהיעד נסגר ונפתח חדש (והשחקנים
// מקבלים הודעה). זיהוי רחב מדי הורס את הזרימה הנפוצה ביותר במסך — המאמן מוחק
// «תקשורת בהגנה» ומקליד «ריבאונד» באותה שורה — ואז המגמה של הנקודה הישנה
// מוצגת על הנקודה החדשה, והשחקנים לא מקבלים הודעה בכלל.
// לכן: ניסוח = אותו טקסט אחרי נרמול (ניקוד/פיסוק/רווחים/רישיות), או הרחבה
// שמתחילה באותן מילים בדיוק («ריבאונד» → «ריבאונד — לחסום ולתפוס»).
// כל שאר השינויים חוזרים לנתיב הישן: סגירת הישן + פתיחת חדש + הודעה.
const normFocus = (s) => String(s || '')
  .toLowerCase()
  .replace(/\p{M}+/gu, '') // ניקוד וטעמים — מסירים לפני הפיסוק כדי לא לפצל מילה
  .replace(/[^\p{L}\p{N}]+/gu, ' ') // פיסוק, מקפים, גרשיים
  .trim()

const isReword = (oldTitle, newTitle) => {
  const a = normFocus(oldTitle)
  const b = normFocus(newTitle)
  if (!a || !b) return false
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  // רישא קצרה מדי («מ» → «מסירה נוספת») היא במקרים רבים הקלדה חדשה לגמרי,
  // ולכן דורשים לפחות ארבעה תווים ושהרישא תסתיים בגבול מילה.
  if (short.length < 4) return false
  return long.startsWith(`${short} `)
}

// נקודות מיקוד נפוצות — טאפ אחד, בלי הקלדה
const FOCUS_CHIPS = [
  ['תקשורת בהגנה', 'Talk on defense'],
  ['ריבאונד — לחסום ולתפוס', 'Rebound — box out'],
  ['חזרה מהירה להגנה', 'Fast transition D'],
  ['פחות איבודי כדור', 'Fewer turnovers'],
  ['מסירה נוספת', 'One more pass'],
  ['יד שמאל', 'Weak hand'],
]

export default function TeamFocus({ coachId, team }) {
  const [points, setPoints] = useState(null) // [{id, title}]
  const [metBy, setMetBy] = useState({}) // goal_id -> {met, total}
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(['', '', ''])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const base = () => supabase
      .from('player_goals')
      .select('id, title, created_at')
      .eq('coach_id', coachId)
      .eq('team', team)
      .is('player_id', null)
      .neq('status', 'done')
      .order('created_at', { ascending: true })
    // roster_id ריק (22.8): יעד אישי לשורת סגל הוא גם player_id ריק — ובלי
    // הסינון הזה הוא היה מופיע כאן כנקודת מיקוד של כל הקבוצה.
    // מסד שטרם הריץ supabase_coach_only_22_8.sql: נופלים לשאילתה בלי העמודה.
    let { data, error } = await base().is('roster_id', null)
    if (error && /roster_id/i.test(error.message || '')) ({ data, error } = await base())
    if (error) { setPoints([]); return }
    const rows = (data || []).slice(0, MAX)
    setPoints(rows)
    setEditing(rows.length === 0) // אין מיקוד? הריק הוא הטופס, לא פרסומת
    setDraft([rows[0]?.title || '', rows[1]?.title || '', rows[2]?.title || ''])

    // מדידה: כמה שחקנים סימנו ✓ לכל נקודה — לא רק באימון האחרון אלא במגמה
    // (עד 4 אימונים אחרונים), כדי שרואים אם הקבוצה מתקדמת: 2/6 → 4/6 → 5/6.
    if (rows.length === 0) { setMetBy({}); return }
    const { data: marks } = await supabase
      .from('session_goal_marks')
      .select('goal_id, met, session_id, created_at')
      .in('goal_id', rows.map((r) => r.id))
      .order('created_at', { ascending: false })
    const perGoal = {}
    for (const m of marks || []) {
      const g = (perGoal[m.goal_id] = perGoal[m.goal_id] || new Map())
      if (!g.has(m.session_id)) g.set(m.session_id, { met: 0, total: 0, ts: m.created_at })
      const a = g.get(m.session_id)
      a.total += 1
      if (m.met) a.met += 1
    }
    const agg = {}
    for (const [goalId, sessions] of Object.entries(perGoal)) {
      agg[goalId] = [...sessions.values()]
        .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
        .slice(-4) // מהישן לחדש
    }
    setMetBy(agg)
  }, [coachId, team])

  useEffect(() => { load() }, [load])

  const setLine = (i, v) => setDraft((d) => d.map((x, k) => (k === i ? v : x)))
  const addChip = (label) => {
    const i = draft.findIndex((x) => !x.trim())
    if (i === -1) { toast.error(L('שלוש נקודות זה המקסימום — זו כל הנקודה.', 'Three points is the max — that is the whole idea.')); return }
    setLine(i, label)
  }

  const save = async () => {
    if (busy) return
    const trimmed = draft.map((t) => t.trim())
    const wanted = trimmed.filter(Boolean).slice(0, MAX)
    setBusy(true)

    const pts = points || []
    const keepTitles = new Set(wanted)
    const existingTitles = new Set(pts.map((p) => p.title))

    // 12.9 — תיקון ניסוח של נקודה קיימת הוא **עריכה**, לא נקודה חדשה. עד היום
    // ההשוואה הייתה על הטקסט בלבד, ולכן שינוי תו אחד («תקשורת בהגנה» →
    // «תקשורת בהגנה!») סגר את היעד הישן (status='done') ופתח שורה עם id חדש:
    // כל סימוני session_goal_marks נשארו תלויים ביעד הסגור, ורצועת המגמה
    // חזרה ל«עדיין לא סומן» — והשחקנים קיבלו שוב הודעה על מיקוד «חדש».
    // הטופס מסודר לפי מקום (draft[i] ↔ points[i]), ולכן שינוי טקסט באותה שורה
    // **שהוא תיקון ניסוח** (isReword) הוא עריכה של אותו יעד. שני התנאים
    // הנוספים נועדו לא לבלבל הזזה בין השורות עם עריכה: אם הטקסט הישן עדיין
    // מופיע במקום אחר, או שהטקסט החדש הוא נקודה קיימת אחרת — זו הזזה,
    // ומטפלים בה כמו קודם.
    const renames = []
    for (let i = 0; i < pts.length; i++) {
      const t = trimmed[i]
      const old = pts[i].title
      if (!t || t === old || keepTitles.has(old) || existingTitles.has(t)) continue
      if (!isReword(old, t)) continue // החלפה מלאה → סגירה + פתיחה + הודעה
      renames.push({ id: pts[i].id, title: t })
    }
    if (renames.length) {
      const res = await Promise.all(renames.map((r) => supabase.from('player_goals')
        .update({ title: r.title, updated_at: new Date().toISOString() }).eq('id', r.id)))
      const err = res.find((r) => r.error)?.error
      if (err) {
        setBusy(false)
        console.error('TeamFocus.save rename:', err.message || err)
        toast.error(L('עדכון נקודת המיקוד נכשל — בדקו את החיבור ונסו שוב', 'Updating the focus point failed — check your connection and try again'))
        return
      }
    }
    const renamedIds = new Set(renames.map((r) => r.id))
    const renamedTitles = new Set(renames.map((r) => r.title))

    // נקודה שהוסרה מסומנת done ולא נמחקת — כדי לא לאבד את סימוני האימונים
    const toClose = pts.filter((p) => !renamedIds.has(p.id) && !keepTitles.has(p.title))
    if (toClose.length) {
      await supabase.from('player_goals')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .in('id', toClose.map((p) => p.id))
    }

    const existing = new Set([...pts.filter((p) => !renamedIds.has(p.id)).map((p) => p.title), ...renamedTitles])
    const fresh = wanted.filter((t) => !existing.has(t))
    // 12.9 — הטוסט בסוף הבטיח «נשלח לשחקנים» גם כשלא נשלחה שום הודעה
    // (תיקון ניסוח, מחיקת נקודה, או הזזה בין שורות). מעכשיו הוא מדווח את מה
    // שקרה בפועל — אחרת המאמן בטוח שהקבוצה יודעת, וזה לא נכון.
    let notified = false
    if (fresh.length) {
      const { error } = await supabase.from('player_goals').insert(
        fresh.map((title) => ({
          coach_id: coachId, player_id: null, team,
          period: 'week', title, metric_type: 'checkbox',
        }))
      )
      if (error) {
        setBusy(false)
        // 12.9 — error.message הגולמי («TypeError: Failed to fetch») הודבק עד היום
        // לתוך משפט עברי ולא אמר למאמן שום דבר שאפשר לעשות. הטכני לקונסול.
        console.error('TeamFocus.save insert:', error.message || error)
        toast.error(L('שמירת המיקוד נכשלה — בדקו את החיבור ונסו שוב', 'Saving the focus failed — check your connection and try again'))
        return
      }
      // מודיעים לשחקנים המחוברים — זו כל ההבטחה של המסך הזה
      // (צד המאמן בלבד: אין חברויות ואין למי להודיע)
      const { data: members } = PLAYER_SIDE
        ? await supabase
            .from('team_memberships')
            .select('player_id')
            .eq('coach_id', coachId).eq('team', team).eq('status', 'approved')
        : { data: [] }
      for (const m of members || []) {
        notified = true
        sendNotification({
          to: m.player_id, actor: coachId, type: 'message',
          content: L('המאמן עדכן את המיקוד של הקבוצה', 'Your coach updated the team focus'),
          nav: 'goals',
        })
      }
    }

    setBusy(false)
    setEditing(false)
    toast.success(wanted.length
      ? (notified ? L('המיקוד נשמר ונשלח לשחקנים', 'Focus saved and sent to the players') : L('המיקוד נשמר', 'Focus saved'))
      : L('המיקוד הנוכחי הסתיים', 'Current focus ended'))
    load()
  }

  if (points === null) return null

  const metLine = (id) => {
    const arr = metBy[id]
    if (!arr || !arr.length) return PLAYER_SIDE
      ? L('עדיין לא סומן — יופיע אחרי האימון הבא', 'Not marked yet — appears after the next practice')
      // 12.9 — «סיכום אימון» הוא השם היחיד של הזרימה הזו בכל האפליקציה (היו
      // «סקירה»/«סיכום»/«דוח» לאותו מסך אחד, והמאמן לא יכול היה לדעת שזה אותו דבר)
      : L('עדיין לא סומן — מסמנים בסיכום האימון', 'Not marked yet — mark it in the practice summary')
    const a = arr[arr.length - 1]
    return L(`באימון האחרון · ${a.met} מתוך ${a.total} סימנו`, `Last practice · ${a.met} of ${a.total} marked it`)
  }

  return (
    <div className="tf-card">
      <div className="tf-top">
        <span className="tf-top-ic"><Users2 size={17} /></span>
        <div>
          <h3>{L('המיקוד של הקבוצה', 'Team focus')}</h3>
          <p className="muted small">{L('מה שאנחנו עובדים עליו עכשיו', 'What we are working on right now')}</p>
        </div>
      </div>

      {!editing ? (
        <>
          <ol className="tf-points">
            {points.map((p) => (
              <li key={p.id} className="tf-point">
                <span className="tf-point-title">{p.title}</span>
                <span className={metBy[p.id]?.length ? 'tf-met' : 'tf-met none'}>{metLine(p.id)}</span>
                {(metBy[p.id] || []).length >= 2 && (
                  <span className="tf-trend" title={L('מהאימון הישן לחדש', 'Oldest to newest practice')}>
                    {metBy[p.id].map((s, i) => (
                      /* 12.9 — X/Y תמיד dir="ltr" (DESIGN.md §4): בלי זה סדר שני המספרים תלוי בהקשר */
                      <b key={i} dir="ltr" className={i === metBy[p.id].length - 1 ? 'on' : ''}>{s.met}/{s.total}</b>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="tf-note"><Check size={14} /> {PLAYER_SIDE
            ? L('כל השחקנים רואים את זה, ובסוף כל אימון נשאלים אם עמדו בו.', 'Every player sees this, and is asked after each practice whether they met it.')
            : L('בסיכום כל אימון תסמן לכל שחקן אם עמד בזה — וכאן תראה את המגמה.', 'In each practice summary you mark per player whether they met it — and the trend shows here.')}</p>
          <button type="button" className="btn-soft tf-cta" onClick={() => setEditing(true)}>
            <Pencil size={15} /> {L('שינוי המיקוד', 'Change the focus')}
          </button>
        </>
      ) : (
        <>
          {draft.map((v, i) => (
            <div key={i} className="tf-row">
              <input
                className="finder-input"
                value={v}
                maxLength={60}
                onChange={(e) => setLine(i, e.target.value)}
                placeholder={i === 0 ? L('נקודת מיקוד — קצר וברור', 'Focus point — short and clear') : L('נקודה נוספת (לא חובה)', 'Another point (optional)')}
                aria-label={L(`נקודת מיקוד ${i + 1}`, `Focus point ${i + 1}`)}
              />
              {v && (
                <button type="button" className="icon-btn tf-clear" onClick={() => setLine(i, '')} aria-label={L('נקה', 'Clear')}>
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          <div className="pg-chips tf-chips">
            {FOCUS_CHIPS.map(([he, en]) => (
              <button key={he} type="button" className="pg-chip" onClick={() => addChip(L(he, en))}>
                <Plus size={12} /> {L(he, en)}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary tf-cta" onClick={save} disabled={busy}>
            <SendIcon size={15} /> {draft.some((d) => d.trim())
              ? (PLAYER_SIDE ? L('שמירה ושליחה לשחקנים', 'Save and send to players') : L('שמירת המיקוד', 'Save the focus'))
              : L('סיום המיקוד הנוכחי', 'End the current focus')}
          </button>
          {points.length > 0 && (
            <button type="button" className="btn-ghost tf-cta" onClick={() => { setEditing(false); load() }}>
              {L('ביטול', 'Cancel')}
            </button>
          )}
        </>
      )}
    </div>
  )
}
