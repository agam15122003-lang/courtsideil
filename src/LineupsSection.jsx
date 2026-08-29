import { useEffect, useRef, useState } from 'react'
import { Plus, X, Users2, Copy, Lock, Trash2 } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { notDeployed } from './PlanNotebook'
import { cachedRead, cachePut, enqueue, isNetErr } from './offline'

// הרכבים מוכנים לאימון — 29.8.2026, לבקשת הבעלים:
// זוגות / שלשות / רביעיות / חמישיות שמכינים מראש, בתחתית דף התוכנית.
//
// ⚠ פרטי לחלוטין: נשמר בטבלה נפרדת (plan_lineups) עם הרשאות «רק המאמן».
//   תוכנית ששותפה לקהילה לא חושפת את ההרכבים — מי שפותח אותה לא מקבל
//   את השורה בכלל (RLS), לא רק לא רואה אותה.
// ⚠ כל שינוי נשמר מיד — אותו מודל כמו הנוכחות במסך האימון.
//
// props:
//   session - המשתמש המחובר
//   planId  - התוכנית (אין planId = התוכנית טרם נשמרה, והמקטע מוסתר)
//   team    - הקבוצה של התוכנית (לצורך «העתקה מהאימון הקודם»)
//   roster  - הסגל שכבר טעון אצל ההורה: [{id, name, number}]

const SIZES = [
  { n: 2, he: 'זוג', en: 'Pair' },
  { n: 3, he: 'שלשה', en: 'Trio' },
  { n: 4, he: 'רביעייה', en: 'Four' },
  { n: 5, he: 'חמישייה', en: 'Five' },
]
const sizeLabel = (n) => {
  const s = SIZES.find((x) => x.n === n)
  return s ? L(s.he, s.en) : L(`קבוצה של ${n}`, `Group of ${n}`)
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export default function LineupsSection({ session, planId, team, roster }) {
  const me = session.user.id
  const [groups, setGroups] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [sqlMissing, setSqlMissing] = useState(false)
  const [prev, setPrev] = useState(null) // ההרכבים מהאימון הקודם של אותה קבוצה
  const saveTimer = useRef(0)

  const byId = new Map((roster || []).map((p) => [p.id, p]))

  // ---------- טעינה ----------
  useEffect(() => {
    if (!planId) return
    let alive = true
    ;(async () => {
      // עטוף במטמון — ההרכבים זמינים גם בלי רשת
      const { data, error } = await cachedRead(`lineups:${planId}`, () => supabase
        .from('plan_lineups').select('groups').eq('plan_id', planId).maybeSingle())
      if (!alive) return
      if (error) {
        if (notDeployed(error)) setSqlMissing(true)
        setLoaded(true)
        return
      }
      setGroups(Array.isArray(data?.groups) ? data.groups : [])
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [planId])

  // «העתקה מהאימון הקודם» — ההרכבים האחרונים של אותה קבוצה, מתוכנית אחרת
  useEffect(() => {
    if (!planId || !team || sqlMissing || !loaded || groups.length) { setPrev(null); return }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('plan_lineups')
        .select('plan_id, groups, updated_at, plan:training_plans(name, team)')
        .eq('coach_id', me)
        .order('updated_at', { ascending: false })
        .limit(20)
      if (!alive || error) return
      const hit = (data || []).find((r) =>
        r.plan_id !== planId && r.plan?.team === team && Array.isArray(r.groups) && r.groups.length)
      setPrev(hit || null)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, team, sqlMissing, loaded, groups.length])

  // ---------- שמירה מיידית (בהשהיה קצרצרה — הקשות רצופות מתאחדות) ----------
  const persist = (next) => {
    setGroups(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const row = { plan_id: planId, coach_id: me, groups: next, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('plan_lineups').upsert(row)
      if (error && isNetErr(error)) {
        // אין רשת — לתור היציאה, והעותק השמור מתעדכן כדי שכניסה מחדש תציג נכון
        if (await enqueue({ kind: 'lineups-upsert', row })) {
          cachePut(`lineups:${planId}`, { groups: next })
          return
        }
      }
      if (error) {
        if (notDeployed(error)) setSqlMissing(true)
        else toast.error(L('ההרכבים לא נשמרו — נסו שוב.', 'The lineups were not saved — try again.'))
      } else {
        cachePut(`lineups:${planId}`, { groups: next })
      }
    }, 400)
  }
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // ---------- פעולות ----------
  const addGroup = (size) => {
    const count = groups.filter((g) => g.size === size).length
    persist([...groups, { id: newId(), size, name: `${sizeLabel(size)} ${count + 1}`, players: [] }])
  }
  const removeGroup = (id) => persist(groups.filter((g) => g.id !== id))
  const addPlayer = (gid, playerId) => {
    if (!playerId) return
    persist(groups.map((g) => (g.id === gid && !g.players.includes(playerId) ? { ...g, players: [...g.players, playerId] } : g)))
  }
  const removePlayer = (gid, playerId) =>
    persist(groups.map((g) => (g.id === gid ? { ...g, players: g.players.filter((p) => p !== playerId) } : g)))
  const copyPrev = () => {
    if (!prev) return
    // מעתיקים רק שחקנים שעדיין בסגל — מי שהוסר לא חוזר בדלת האחורית
    const cleaned = prev.groups.map((g) => ({ ...g, id: newId(), players: (g.players || []).filter((p) => byId.has(p)) }))
    persist(cleaned)
    toast.success(L('ההרכבים הועתקו מהאימון הקודם', 'Lineups copied from the previous practice'))
  }

  if (!planId) return null

  return (
    <section className="nbk-lineups" aria-label={L('הרכבים לאימון', 'Practice lineups')}>
      <div className="nbk-att-h">
        <span className="nbk-att-title"><Users2 size={16} /> {L('הרכבים לאימון', 'Practice lineups')}</span>
        <span className="muted small nbk-lineups-private"><Lock size={12} aria-hidden="true" /> {L('נשמר רק אצלך', 'Visible only to you')}</span>
      </div>

      {sqlMissing ? (
        <p className="muted small nbk-att-hint">
          {L('כדי להשתמש בהרכבים צריך להריץ במסד את supabase_lineups_29_8.sql.', 'To use lineups, run supabase_lineups_29_8.sql on the database.')}
        </p>
      ) : !loaded ? (
        <p className="muted small nbk-att-hint">{L('טוען…', 'Loading…')}</p>
      ) : (
        <>
          <p className="muted small nbk-att-hint">
            {L('זוגות, שלשות או חמישיות שמכינים מראש. מי שפותח את התוכנית — גם אם שיתפת אותה — לא רואה את זה.',
               'Pairs, trios or fives prepared ahead of practice. Anyone else opening the plan — even a shared one — cannot see this.')}
          </p>

          {groups.length === 0 && prev && (
            <button type="button" className="btn-soft nbk-lineups-copy" onClick={copyPrev}>
              <Copy size={14} /> {L('העתקה מהאימון הקודם', 'Copy from the previous practice')}
              {prev.plan?.name ? <span className="muted"> · {prev.plan.name}</span> : null}
            </button>
          )}

          <div className="nbk-lineups-groups">
            {groups.map((g) => {
              const free = (roster || []).filter((p) => !g.players.includes(p.id))
              return (
                <div key={g.id} className="nbk-lineup">
                  <div className="nbk-lineup-h">
                    <b>{g.name || sizeLabel(g.size)}</b>
                    <span className="muted small" dir="ltr">{g.players.length}/{g.size}</span>
                    <button type="button" className="icon-btn nbk-lineup-del" onClick={() => removeGroup(g.id)} aria-label={L(`מחיקת ${g.name || sizeLabel(g.size)}`, `Delete ${g.name || sizeLabel(g.size)}`)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="chips nbk-lineup-chips">
                    {g.players.map((pid) => {
                      const p = byId.get(pid)
                      return (
                        <span key={pid} className="chip static">
                          {p ? <>{p.number ? <bdi className="muted">{p.number} · </bdi> : null}{p.name}</> : L('שחקן שהוסר מהסגל', 'Removed player')}
                          <button type="button" className="nbk-linked-x" onClick={() => removePlayer(g.id, pid)} aria-label={L('הסרה מההרכב', 'Remove from lineup')}>
                            <X size={12} />
                          </button>
                        </span>
                      )
                    })}
                    {g.players.length < g.size && free.length > 0 && (
                      <select
                        className="nbk-lineup-add"
                        value=""
                        onChange={(e) => addPlayer(g.id, e.target.value)}
                        aria-label={L('הוספת שחקן להרכב', 'Add a player to the lineup')}
                      >
                        <option value="">{L('+ שחקן…', '+ Player…')}</option>
                        {free.map((p) => (
                          <option key={p.id} value={p.id}>{p.number ? `${p.number} · ` : ''}{p.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="nbk-lineups-add" role="group" aria-label={L('הוספת הרכב', 'Add a lineup')}>
            {SIZES.map((s) => (
              <button key={s.n} type="button" className="btn-ghost" onClick={() => addGroup(s.n)}>
                <Plus size={14} /> {L(s.he, s.en)}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
