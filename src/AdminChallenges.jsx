import { useCallback, useEffect, useState } from 'react'
import { Brain, RefreshCw } from 'lucide-react'
import { L } from './i18n'
import { toast } from './toast'
import { adminQuizzes, buildQuiz, setQuizStatus } from './game'

// AdminChallenges — מסך הניהול של עולם הכדורסל.
//
// ⚠ 19.8.2026: **האתגר השבועי הוסר מהמוצר** יחד עם העלאת הווידאו של
// שחקנים, לפי החלטת הבעלים לצמצם את החשיפה של קטינים. שלוש הלשוניות
// שלו — הבנק, בקרת הקליפים וייצוא הטופ-5 — נמחקו מכאן. נשארו החידונים.
//
// שום נתון לא נמחק: אתגרים, הגשות וקליפים שכבר קיימים נשארים במסד
// ובאחסון, וכל מדיניות הקריאה עליהם לא נגעה. החזרה = revert של הקומיט
// **וגם** החזרת ההרשאות שנשללו ב-supabase_game_challenge_off_19_8.sql.

// ===== חידונים =====
function QuizTab() {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', count: 8, difficulty: '', seconds: 20 })

  const load = useCallback(async () => {
    const r = await adminQuizzes()
    setRows(r.ok ? (r.rows || []) : [])
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    setBusy(true)
    const r = await buildQuiz({
      title: form.title.trim() || L('החידון השבועי', 'Weekly quiz'),
      count: Number(form.count) || 8,
      difficulty: form.difficulty || null,
      seconds: Number(form.seconds) || 20,
    })
    setBusy(false)
    const d = r.data || {}
    if (!r.ok || d.ok === false) { toast.error(d.message || L('הבנייה נכשלה', 'Build failed')); return }
    toast.success(L(`נבנה חידון עם ${d.questions} שאלות — עכשיו פתח אותו`, `Built with ${d.questions} questions — now open it`))
    setForm({ ...form, title: '' })
    load()
  }

  const setStatus = async (id, status) => {
    const r = await setQuizStatus(id, status)
    if (!r.ok) { toast.error(r.message || L('נכשל', 'Failed')); return }
    toast.success(status === 'open' ? L('החידון פתוח לשחקנים', 'Quiz is live') : L('החידון נסגר', 'Quiz closed'))
    load()
  }

  return (
    <div className="gm-adm-list">
      <div className="gm-adm-card">
        <b>{L('חידון שבועי רשמי', 'Official weekly quiz')}</b>
        <p className="muted small">
          {L('לא חובה — השחקנים בונים לעצמם חידון בכל רגע. זה כאן בשביל אירוע שבועי שנספר בלי תקרה.',
             "Optional — players build their own any time. This is for a weekly event that counts without a daily cap.")}
        </p>
        <div className="gm-adm-form">
          <label>
            {L('שם (לא חובה)', 'Title (optional)')}
            <input type="text" value={form.title} maxLength={60}
              placeholder={L('החידון השבועי', 'Weekly quiz')}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            {L('מספר שאלות', 'Questions')}
            <input type="number" min="3" max="15" dir="ltr" value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value })} />
          </label>
          <label>
            {L('קושי', 'Difficulty')}
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option value="">{L('מעורב (מומלץ)', 'Mixed (recommended)')}</option>
              <option value="easy">{L('קל', 'Easy')}</option>
              <option value="medium">{L('בינוני', 'Medium')}</option>
              <option value="hard">{L('קשה', 'Hard')}</option>
            </select>
          </label>
          <label>
            {L('שניות לשאלה', 'Seconds per question')}
            <input type="number" min="5" max="120" dir="ltr" value={form.seconds}
              onChange={(e) => setForm({ ...form, seconds: e.target.value })} />
          </label>
          <div className="gm-adm-actions">
            <button type="button" className="btn-primary" disabled={busy} onClick={create}>
              <Brain size={15} /> {L('בנה חידון', 'Build quiz')}
            </button>
          </div>
        </div>
      </div>

      {rows.map((z) => (
        <div key={z.id} className="gm-adm-card">
          <div className="gm-adm-head">
            <span className="gm-adm-title">
              <b>{z.title}</b>
              <span className={`gm-badge gm-badge--${z.status === 'open' ? 'open' : z.status === 'closed' ? 'closed' : 'draft'}`}>
                {z.status === 'open' ? L('פתוח', 'Open') : z.status === 'closed' ? L('נסגר', 'Closed') : L('טיוטה', 'Draft')}
              </span>
            </span>
            <span className="muted small" dir="ltr">{(z.question_ids || []).length} · {z.seconds_per_q}s</span>
          </div>
          <div className="gm-adm-actions">
            {z.status !== 'open' && (
              <button type="button" className="btn-primary" onClick={() => setStatus(z.id, 'open')}>
                <Play size={14} /> {L('פתח לשחקנים', 'Open to players')}
              </button>
            )}
            {z.status === 'open' && (
              <button type="button" className="btn-secondary" onClick={() => setStatus(z.id, 'closed')}>
                {L('סגור', 'Close')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== המסך =====
export default function AdminChallenges() {
  const [nonce, setNonce] = useState(0)

  return (
    <div className="gm-admin">
      <div className="gm-adm-top">
        <h2><Brain size={19} aria-hidden="true" /> {L('חידוני כדורסל', 'Basketball quizzes')}</h2>
        <button type="button" className="icon-btn" onClick={() => setNonce((n) => n + 1)} aria-label={L('רענון', 'Refresh')}>
          <RefreshCw size={15} />
        </button>
      </div>
      <QuizTab key={nonce} />
    </div>
  )
}
