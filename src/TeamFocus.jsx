import { useState, useEffect, useCallback } from 'react'
import { Users2, Plus, X, Check, Send as SendIcon, Pencil } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { sendNotification } from './notify'
import { L } from './i18n'

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
    const { data, error } = await supabase
      .from('player_goals')
      .select('id, title, created_at')
      .eq('coach_id', coachId)
      .eq('team', team)
      .is('player_id', null)
      .neq('status', 'done')
      .order('created_at', { ascending: true })
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
    const wanted = draft.map((t) => t.trim()).filter(Boolean).slice(0, MAX)
    setBusy(true)

    // נקודה שהוסרה מסומנת done ולא נמחקת — כדי לא לאבד את סימוני האימונים
    const keepTitles = new Set(wanted)
    const toClose = (points || []).filter((p) => !keepTitles.has(p.title))
    if (toClose.length) {
      await supabase.from('player_goals')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .in('id', toClose.map((p) => p.id))
    }

    const existing = new Set((points || []).map((p) => p.title))
    const fresh = wanted.filter((t) => !existing.has(t))
    if (fresh.length) {
      const { error } = await supabase.from('player_goals').insert(
        fresh.map((title) => ({
          coach_id: coachId, player_id: null, team,
          period: 'week', title, metric_type: 'checkbox',
        }))
      )
      if (error) {
        setBusy(false)
        toast.error(L('השמירה נכשלה: ', 'Save failed: ') + error.message)
        return
      }
      // מודיעים לשחקנים המחוברים — זו כל ההבטחה של המסך הזה
      const { data: members } = await supabase
        .from('team_memberships')
        .select('player_id')
        .eq('coach_id', coachId).eq('team', team).eq('status', 'approved')
      for (const m of members || []) {
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
      ? L('המיקוד נשמר ונשלח לשחקנים', 'Focus saved and sent to the players')
      : L('המיקוד הנוכחי הסתיים', 'Current focus ended'))
    load()
  }

  if (points === null) return null

  const metLine = (id) => {
    const arr = metBy[id]
    if (!arr || !arr.length) return L('עדיין לא סומן — יופיע אחרי האימון הבא', 'Not marked yet — appears after the next practice')
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
                      <b key={i} className={i === metBy[p.id].length - 1 ? 'on' : ''}>{s.met}/{s.total}</b>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="tf-note"><Check size={14} /> {L('כל השחקנים רואים את זה, ובסוף כל אימון נשאלים אם עמדו בו.', 'Every player sees this, and is asked after each practice whether they met it.')}</p>
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
              ? L('שמירה ושליחה לשחקנים', 'Save and send to players')
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
