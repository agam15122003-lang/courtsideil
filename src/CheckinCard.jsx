// ============================================================
// 4.9.2026 — צ'ק-אין בוקר (פיילוט): שלוש שאלות — שינה, אנרגיה, גוף.
// ============================================================
// כרטיס ראשון בבית השחקן, כל יום מ-06:00 עד חצות (גם בימים בלי אימון;
// ביום אימון הכותרת מכוונת לאימון). כל טאפ נשמר מיד; אחרי שלוש תשובות
// הכרטיס מתקפל ל«נשמר · המאמן רואה» — בלי להציג את התשובות. עריכה
// אפשרית עד חצות (טאפ פשוט מעדכן את אותה שורה).
//
// בלי טקסט חופשי. «כואב» פותח אזורי כאב (רשימה סגורה) + «מפריע לשחק?».
// «אני חולה היום» — קישור קטן. «לא היום» — מסתיר את הכרטיס להיום דרך
// localStorage בלבד, שום דבר לא נכתב למסד.
//
// הלקוח שורד פרוד בלי supabase_checkins_4_9.sql: כל שגיאת שליפה —
// הכרטיס פשוט לא מרונדר (דפוס HomeRsvp). שורת סגל עם wellness_off
// (ההורה ביקש «בלי שאלות») — אותו דבר. קטין שממתין לאישור הורה מקבל
// שורת הסבר + כפתור «שליחת הקישור להורה» במקום הכרטיס.
import { useEffect, useRef, useState } from 'react'
import { Sun, Check, Lock, Pencil } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { confirmDialog } from './confirm' // 4.9 — אישור לפני «אני חולה היום»
import { L } from './i18n'

// תאריך לפי שעון ישראל — לא toISOString (שנותן UTC: ב-01:00 בלילה
// toISOString עוד מחזיר את אתמול, והדיווח היה נכתב על היום הלא נכון).
export function localDate(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d)
  } catch {
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
}
// השעה לפי שעון ישראל — חלון ההצגה הוא 06:00–24:00
function ilHour() {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false,
    }).format(new Date()))
  } catch { return new Date().getHours() }
}

const SKIP_KEY = 'checkin_not_today' // «לא היום» — ערך = התאריך שהוסתר

// אזורי הכאב — אותה רשימה סגורה בדיוק כמו ה-CHECK במסד
export const PAIN_AREAS = [
  { key: 'knee', he: 'ברך', en: 'Knee' },
  { key: 'ankle_foot', he: 'קרסול/כף רגל', en: 'Ankle/foot' },
  { key: 'back', he: 'גב', en: 'Back' },
  { key: 'shoulder_arm', he: 'כתף/יד', en: 'Shoulder/arm' },
  { key: 'head', he: 'ראש', en: 'Head' },
  { key: 'other', he: 'אחר', en: 'Other' },
]
// מילים לרצועת המאמן (NextPractice) — מרוכז כאן כדי שלא ישוכפל.
// 4.9 — טווחי השינה כטוקנים מספריים (לא «6-7 שעות» כמחרוזת אחת): בגיליון
// המאמן הם נעטפים <bdi dir="ltr"> — מוסכמת dir=ltr על מספרים, «10+» מתהפך
// בתוך שורה עברית. המילה «שעות» מתווספת שם בנפרד.
export const SLEEP_RANGES = ['<6', '6-7', '7-8', '8-9', '9-10', '10+']
export const ENERGY_WORDS = [['גמור', 'Wiped'], ['עייף', 'Tired'], ['בסדר', 'OK'], ['טוב', 'Good'], ['מלא אנרגיה', 'Full of energy']]
export const BODY_WORDS = [['בסדר', 'Fine'], ['קצת תפוס', 'A bit stiff'], ['כואב', 'In pain']]
export const painAreaLabel = (k) => {
  const a = PAIN_AREAS.find((x) => x.key === k)
  return a ? L(a.he, a.en) : k
}

const SLEEP_CHIPS = SLEEP_RANGES.map((label, v) => ({ v, label })) // 4.9 — מאותו מקור כמו הגיליון

export default function CheckinCard({ session, membership, restrictedCtx }) {
  const me = session.user.id
  const today = localDate()
  // מדד הפיילוט: מרינדור ראשון עד התשובה השלישית
  const mountTs = useRef(Date.now())
  const [state, setState] = useState('loading') // loading | off | ready
  const [row, setRow] = useState(null)          // השורה של היום (אם קיימת)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false) // «שינוי» אחרי שהכרטיס התקפל
  const [practiceToday, setPracticeToday] = useState(false)
  const [skipped, setSkipped] = useState(() => {
    try { return localStorage.getItem(SKIP_KEY) === today } catch { return false }
  })

  useEffect(() => {
    if (!membership) { setState('off'); return }
    let alive = true
    ;(async () => {
      // שורת הסגל שלי — בלעדיה אין למי לכתוב (וגם ה-RLS יחסום);
      // select('*') כדי לא ליפול על מסד בלי העמודה wellness_off
      const { data: tp, error: tpErr } = await supabase.from('team_players')
        .select('*').eq('player_id', me)
        .eq('coach_id', membership.coach_id).eq('team', membership.team).limit(1)
      if (!alive) return
      const rosterRow = tp && tp[0]
      if (tpErr || !rosterRow || rosterRow.wellness_off) { setState('off'); return }
      // הדיווח של היום (אם כבר עניתי) — כל שגיאה כאן, כולל טבלה שטרם
      // נוצרה (42P01/PGRST205), פשוט מכבה את הכרטיס בשקט
      const { data: cr, error: crErr } = await supabase.from('player_checkins')
        .select('*').eq('player_id', me).eq('checkin_date', today).maybeSingle()
      if (!alive) return
      if (crErr) { setState('off'); return }
      setRow(cr || null)
      setState('ready')
      // יש אימון היום? רק לניסוח הכותרת — כשל שקט משאיר ניסוח כללי
      try {
        const { data: slots } = await supabase.from('team_practice_slots')
          .select('weekday').eq('coach_id', membership.coach_id).eq('team', membership.team)
        if (!alive) return
        const wd = new Date(today + 'T12:00').getDay()
        if ((slots || []).some((s) => Number(s.weekday) === wd)) setPracticeToday(true)
      } catch { /* ניסוח כללי */ }
    })()
    return () => { alive = false }
  }, [me, membership, today])

  // שמירה מיידית בכל טאפ. אין upsert: הייחודיות במסד היא אינדקס חלקי
  // ש-PostgREST לא יודע לכוון אליו on_conflict — לכן insert, ואם השורה
  // כבר קיימת (23505, למשל ממכשיר שני) — שליפה ועדכון.
  const save = async (patch) => {
    if (busy) return
    setBusy(true)
    const merged = { ...(row || {}), ...patch }
    // התשובה השלישית סוגרת את המדידה — פעם אחת בלבד
    if (merged.sleep_bucket != null && merged.energy != null && merged.body != null && merged.fill_ms == null) {
      patch = { ...patch, fill_ms: Date.now() - mountTs.current }
    }
    let error = null
    if (row?.id) {
      ;({ error } = await supabase.from('player_checkins').update(patch).eq('id', row.id))
    } else {
      const base = {
        player_id: me, coach_id: membership.coach_id, team: membership.team,
        checkin_date: today, source: 'player', ...patch,
      }
      let res = await supabase.from('player_checkins').insert(base).select('*').maybeSingle()
      if (res.error?.code === '23505') {
        // כבר יש שורה להיום (מכשיר אחר) — עוברים לעדכון שלה. 4.9 — שולפים
        // את **כל** השורה וממזגים אותה למצב: בלי זה תשובות שנשמרו מהמכשיר
        // האחר לא הופיעו כאן (הצ'יפים נראו ריקים) עד רענון.
        const { data: ex } = await supabase.from('player_checkins')
          .select('*').eq('player_id', me).eq('checkin_date', today).maybeSingle()
        if (ex?.id) res = { ...(await supabase.from('player_checkins').update(patch).eq('id', ex.id)), data: ex }
      }
      error = res.error
      if (!error && res.data?.id) Object.assign(merged, res.data)
    }
    setBusy(false)
    if (error) { toast.error(L('לא הצלחנו לשמור — נסה שוב', "Couldn't save — try again")); return }
    setRow({ ...merged, ...patch })
  }

  const notToday = () => {
    try { localStorage.setItem(SKIP_KEY, today) } catch { /* ignore */ }
    setSkipped(true)
  }

  // חלון ההצגה: כל יום מ-06:00 עד חצות
  if (ilHour() < 6) return null
  if (skipped || state === 'loading' || state === 'off') return null

  // קטין שממתין לאישור הורה — שורה אחת עם המוצא הקבוע, בלי כרטיס
  // (הכתיבה ממילא חסומה בשרת — player_checkins_active_gate)
  if (restrictedCtx?.restricted) {
    return (
      <section className="nh-card pc4-card">
        <p className="rstr-note" role="note">
          <Lock size={13} aria-hidden="true" />
          <span className="rstr-txt">
            {L('הצ׳ק-אין של הבוקר נפתח אחרי אישור ההורה.', 'The morning check-in opens after your parent approves.')}{' '}
            <button type="button" className="rstr-cta" onClick={restrictedCtx.sendLink} disabled={restrictedCtx.sending} aria-busy={restrictedCtx.sending}>
              {L('שליחת הקישור להורה', 'Send the link to my parent')}
            </button>
          </span>
        </p>
      </section>
    )
  }

  const done = !!row && ((row.sleep_bucket != null && row.energy != null && row.body != null) || row.sick)

  // «נשמר · המאמן רואה» — בלי להציג את התשובות. «שינוי» פותח חזרה (עד חצות)
  if (done && !editing) {
    return (
      <section className="nh-card pc4-card pc4-done-card">
        <span className="pc4-done" role="status">
          <Check size={15} aria-hidden="true" /> {L('נשמר · המאמן רואה', 'Saved · your coach sees it')}
        </span>
        {!row.sick && (
          <button type="button" className="pc4-link" onClick={() => setEditing(true)}>
            <Pencil size={12} aria-hidden="true" /> {L('שינוי', 'Change')}
          </button>
        )}
      </section>
    )
  }

  const chipRow = (label, chips, cur, onPick, ltr) => (
    <div className="pc4-q">
      <span className="pc4-q-lbl">{label}</span>
      <div className="chips pc4-chips" role="group" aria-label={label}>
        {chips.map((c) => (
          <button key={c.v} type="button" disabled={busy}
            className={cur === c.v ? 'chip selected' : 'chip'} aria-pressed={cur === c.v}
            onClick={() => onPick(c.v)}>
            {ltr ? <bdi dir="ltr">{c.label}</bdi> : c.label}
          </button>
        ))}
      </div>
    </div>
  )

  const togglePain = (key) => {
    const cur = Array.isArray(row?.pain_area) ? row.pain_area : []
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
    save({ pain_area: next.length ? next : null })
  }

  return (
    <section className="nh-card pc4-card">
      <div className="pc4-head">
        <span className="pc4-ic" aria-hidden="true"><Sun size={17} /></span>
        <div className="pc4-head-tx">
          <strong>{L('הצ׳ק-אין של הבוקר', 'Morning check-in')}</strong>
          <span className="pc4-sub">
            {practiceToday
              ? L('יש אימון היום — שלוש שאלות לפני שמגיעים', 'Practice today — three questions before you arrive')
              : L('שלוש שאלות קטנות, פחות מחצי דקה', 'Three quick questions, under half a minute')}
          </span>
        </div>
      </div>

      {chipRow(L('כמה ישנת הלילה?', 'How much did you sleep?'), SLEEP_CHIPS,
        row?.sleep_bucket ?? null, (v) => save({ sleep_bucket: v }), true)}
      {chipRow(L('איך האנרגיה?', 'How is your energy?'),
        ENERGY_WORDS.map((w, i) => ({ v: i + 1, label: L(w[0], w[1]) })),
        row?.energy ?? null, (v) => save({ energy: v }))}
      {chipRow(L('איך הגוף מרגיש?', 'How does your body feel?'),
        BODY_WORDS.map((w, i) => ({ v: i + 1, label: L(w[0], w[1]) })),
        row?.body ?? null, (v) => save({ body: v, ...(v !== 3 ? { pain_area: null, pain_blocks: null } : {}) }))}

      {row?.body === 3 && (
        <>
          <div className="pc4-q">
            <span className="pc4-q-lbl">{L('איפה כואב?', 'Where does it hurt?')}</span>
            <div className="chips pc4-chips" role="group" aria-label={L('איפה כואב?', 'Where does it hurt?')}>
              {PAIN_AREAS.map((a) => {
                const on = Array.isArray(row?.pain_area) && row.pain_area.includes(a.key)
                return (
                  <button key={a.key} type="button" disabled={busy}
                    className={on ? 'chip selected' : 'chip'} aria-pressed={on}
                    onClick={() => togglePain(a.key)}>
                    {L(a.he, a.en)}
                  </button>
                )
              })}
            </div>
          </div>
          {chipRow(L('מפריע לשחק?', 'Does it stop you playing?'),
            [{ v: true, label: L('כן', 'Yes') }, { v: false, label: L('לא', 'No') }],
            row?.pain_blocks ?? null, (v) => save({ pain_blocks: v }))}
        </>
      )}

      <div className="pc4-foot">
        {/* 4.9 — אישור לפני שמסמנים חולה: טאפ בטעות היה יוצר דגל אדום אצל
            המאמן בלי דרך לבטל מהמסך (הכרטיס מתקפל בלי «שינוי» כשחולה) */}
        <button type="button" className="pc4-link" disabled={busy} onClick={async () => {
          const ok = await confirmDialog({
            title: L('אתה חולה היום?', 'Are you sick today?'),
            message: L('המאמן יראה את זה ויֵדע שאתה לא מגיע.', 'Your coach will see this and know you are out.'),
            confirmText: L('כן, אני חולה', "Yes, I'm sick"), danger: false,
          })
          if (ok) save({ sick: true })
        }}>
          {L('אני חולה היום', "I'm sick today")}
        </button>
        {/* 4.9 — «סגירה» בזמן עריכה: אחרי «שינוי» הכרטיס נשאר פתוח בכוונה
            (אולי מתקנים כמה תשובות) — הקישור מקפל חזרה ל«נשמר» */}
        {editing && done && (
          <button type="button" className="pc4-link pc4-link-grey" onClick={() => setEditing(false)}>
            {L('סגירה', 'Close')}
          </button>
        )}
        {!row && (
          <button type="button" className="pc4-link pc4-link-grey" onClick={notToday}>
            {L('לא היום', 'Not today')}
          </button>
        )}
      </div>
    </section>
  )
}
