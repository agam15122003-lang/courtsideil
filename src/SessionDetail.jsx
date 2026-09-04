import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Flame, Crown, StickyNote, Save, Check, Minus, Target } from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { PLAYER_SIDE, COACH_LOGS } from './flags'
import { sendNotification } from './notify'
import { confirmDialog } from './confirm'
import Avatar from './Avatar'
import { MOOD_BY_KEY } from './FeedbackSheet'
import { SkeletonRoster } from './Skeleton'
import { ErrorState } from './states'

const ATT = [
  { id: 'present', label: ['נוכח', 'Present'], tone: 'green' },
  { id: 'late', label: ['איחר', 'Late'], tone: 'orange' },
  { id: 'absent', label: ['נעדר', 'Absent'], tone: 'red' },
]

// ===== צד המאמן בלבד (22.8) =====
// עם צד שחקן פתוח: המאמץ מדורג על ידי השחקנים, וכאן המאמן רק רואה דוח.
// בלי צד שחקן: המאמן שואל את השחקנים בסוף האימון («כמה קשה היה, 1–10?»)
// ורושם בעצמו — וגם מסמן לכל שחקן אם עמד ביעד (המיקוד הקבוצתי + יעדים
// אישיים). הכול נשמר על שורת הסגל (roster_id), ראו supabase_coach_only_22_8.sql.
// השורות שהשחקן דירג בעצמו (אם יהיו בעתיד) ממשיכות להיקרא ולהיות מוצגות.
//
// 3.9 — שתי אמיתות: המאמן רושם **תמיד** על שורת הסגל (COACH_LOGS), גם כשצד
// השחקן פתוח; מה שהשחקן דירג בעצמו (player_id) נקרא ומוצג **לצד** מה שהמאמן
// רשם, לא במקומו. COACH_MODE לא נגזר יותר מ-PLAYER_SIDE — אחרת הדלקת צד
// השחקן מחקה למאמן את שורת העומס, «עמד ביעד» וכל מה שנרשם מ-22.8.
const COACH_MODE = COACH_LOGS
const EFFORT_OPTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
// כל הטווחים של PlayerGoals.PERIODS — בלי חצי-שנתי ושנתי יעדים ארוכי-טווח
// פשוט לא הופיעו כאן לסימון «עמד ביעד»
const MARK_PERIODS = ['session', 'week', 'month', 'half_year', 'year']
const missingCol = (e, col) => !!e && new RegExp(col, 'i').test(e.message || '')
const SQL_HINT = () => L('כדי לרשום עומס ויעדים לשחקנים צריך להריץ את supabase_coach_only_22_8.sql', 'Logging load and goals per player needs supabase_coach_only_22_8.sql')

// דף סקירת אימון/משחק למאמן — נוכחות + משוב אישי + הערה כללית + MVP.
// props: session, entry {id, team, date, start_time, session_type?, opponent?}, onClose
export default function SessionDetail({ session, entry, onClose }) {
  const me = session.user.id
  const team = entry.team
  const sessionType = entry.session_type || 'practice'
  const sessionId = entry.id
  const sessionDate = entry.date
  const [roster, setRoster] = useState(null)
  const [loadErr, setLoadErr] = useState(false) // שליפת הסגל נכשלה — לא «אין שחקנים»
  const [att, setAtt] = useState({})        // {rosterId: status}
  const loadedAtt = useRef({})              // הנוכחות שהייתה שמורה בפתיחה — כדי למחוק סימון שבוטל
  const [efforts, setEfforts] = useState({}) // {rosterId: 1..10} — דירוג עצמי של השחקן (קריאה בלבד)
  const [coachEff, setCoachEff] = useState({}) // {rosterId: 1..10} — מה שהמאמן רשם
  const [acks, setAcks] = useState({}) // {rosterId: {auth, acked}} — 'ראיתי' על סיכום השחקן
  const [playerNotes, setPlayerNotes] = useState({}) // {rosterId: מה שהשחקן רשם}
  const [moods, setMoods] = useState({})     // {rosterId: moodKey}
  const [focuses, setFocuses] = useState({}) // {rosterId: [labels]}
  const [goalMarks, setGoalMarks] = useState({})     // {rosterId: [{title, met}]} — סימוני השחקן
  const [goalOpts, setGoalOpts] = useState({})       // {rosterId: [{id, title}]} — מה שהמאמן יכול לסמן
  const [coachMarks, setCoachMarks] = useState({})   // {rosterId: {goalId: true|false}}
  const loadedMarks = useRef({})                     // מה שהיה שמור בפתיחה — כדי למחוק סימון שבוטל
  const [note, setNote] = useState({})      // {rosterId: text}
  const [openNote, setOpenNote] = useState({})
  const [fbId, setFbId] = useState({})      // {rosterId: existing feedback row id}
  const [mvp, setMvp] = useState(null)      // rosterId
  const [overall, setOverall] = useState('')
  const [saving, setSaving] = useState(false)
  const [hadReview, setHadReview] = useState(false) // כבר נשמר דוח בעבר? (כדי לא לשלוח התראות כפולות)
  const dirty = useRef(false)   // נגעו במשהו שלא נשמר? (סגירה בטעות = איבוד הסקירה)
  const closing = useRef(false) // דיאלוג היציאה כבר פתוח — טאפ נוסף על הרקע לא יפתח עוד אחד

  const load = useCallback(async () => {
    setLoadErr(false)
    const { data: rp, error: rosterErr } = await supabase
      .from('team_players')
      .select('id, name, number, position, player_id')
      .eq('coach_id', me).eq('team', team).order('number')
    // שגיאת שליפה אינה «אין שחקנים» — משאירים roster=null (save לא כותב) ומציגים שגיאה
    if (rosterErr) { setLoadErr(true); setRoster(null); return }
    const players = rp || []
    setRoster(players)
    const byAuth = {}; for (const p of players) if (p.player_id) byAuth[p.player_id] = p.id
    // שורה → מזהה סגל: roster_id (22.8) כשיש, אחרת דרך חשבון השחקן
    const ridOf = (r) => r.roster_id || (r.player_id ? byAuth[r.player_id] : null)

    const attP = sessionType === 'game'
      ? supabase.from('game_attendance').select('player_id, status').eq('game_id', sessionId)
      : supabase.from('practice_attendance').select('player_id, status').eq('coach_id', me).eq('team', team).eq('session_date', sessionDate)
    // select('*') בכל מקום: העמודות של 22.8 (roster_id/source) ושל
    // engagement2 (coach_ack) עשויות עוד לא להתקיים — כוכבית לא נופלת עליהן.
    const [{ data: aRows }, { data: fRows }, { data: rev }, { data: eRows }, { data: gmRows }, goalsRes] = await Promise.all([
      attP,
      supabase.from('player_feedback').select('*').eq('coach_id', me).eq('session_id', sessionId),
      supabase.from('session_reviews').select('*').eq('coach_id', me).eq('session_type', sessionType).eq('session_id', sessionId).maybeSingle(),
      supabase.from('session_effort').select('*').eq('coach_id', me).eq('session_id', sessionId),
      supabase.from('session_goal_marks').select('*, goal:player_goals(title)').eq('coach_id', me).eq('session_id', sessionId),
      COACH_MODE
        ? supabase.from('player_goals').select('*').eq('coach_id', me).eq('status', 'active').in('period', MARK_PERIODS)
        : Promise.resolve({ data: [] }),
    ])
    const a = {}; for (const r of aRows || []) a[r.player_id] = r.status; setAtt(a)
    loadedAtt.current = a
    const nt = {}, fid = {}
    for (const r of fRows || []) {
      const rid = ridOf(r); if (!rid) continue
      if (r.content) nt[rid] = r.content
      fid[rid] = r.id
    }
    setNote(nt); setFbId(fid)
    const ef = {}, ce = {}, pn = {}, md = {}, fc = {}, ak = {}
    for (const r of eRows || []) {
      const rid = ridOf(r); if (!rid) continue
      if (r.source === 'coach') { ce[rid] = r.effort; continue }
      ef[rid] = r.effort
      if (r.note) pn[rid] = r.note
      if (r.mood) md[rid] = r.mood
      if (Array.isArray(r.focus) && r.focus.length) fc[rid] = r.focus
      if (r.player_id && 'coach_ack' in r) ak[rid] = { auth: r.player_id, acked: r.coach_ack === true }
    }
    setEfforts(ef); setCoachEff(ce); setPlayerNotes(pn); setMoods(md); setFocuses(fc); setAcks(ak)
    const gm = {}, cm = {}
    for (const r of gmRows || []) {
      const rid = ridOf(r); if (!rid) continue
      if (r.roster_id) { (cm[rid] = cm[rid] || {})[r.goal_id] = r.met === true; continue }
      ;(gm[rid] = gm[rid] || []).push({ title: r.goal?.title || L('יעד', 'Goal'), met: r.met })
    }
    setGoalMarks(gm); setCoachMarks(cm); loadedMarks.current = cm
    // מה המאמן יכול לסמן לכל שחקן: המיקוד הקבוצתי + היעדים האישיים שלו
    if (COACH_MODE) {
      const goals = goalsRes.data || []
      const focus = goals.filter((g) => !g.player_id && !g.roster_id && g.team === team)
      const opts = {}
      for (const p of players) {
        const mine = goals.filter((g) => (g.roster_id && g.roster_id === p.id) || (g.player_id && p.player_id && g.player_id === p.player_id))
        opts[p.id] = [...focus, ...mine].map((g) => ({ id: g.id, title: g.title, team: !g.player_id && !g.roster_id }))
      }
      setGoalOpts(opts)
    }
    setHadReview(!!rev)
    if (rev) {
      setOverall(rev.overall_note || '')
      if (rev.mvp_player_id && byAuth[rev.mvp_player_id]) setMvp(byAuth[rev.mvp_player_id])
      else if (rev.mvp_name) { const p = players.find((x) => x.name === rev.mvp_name); if (p) setMvp(p.id) }
    }
    dirty.current = false // מה שנטען מהמסד אינו «שינוי שלא נשמר»
  }, [me, team, sessionDate, sessionId, sessionType])

  // סגירה מבוקשת (רקע / X / Escape): על אייפד כף היד נופלת על השוליים הכהים,
  // ועד עכשיו זה מחק סקירה שלמה בלי אזהרה.
  const requestClose = useCallback(async () => {
    if (!dirty.current) { onClose(); return }
    if (closing.current) return
    closing.current = true
    const ok = await confirmDialog({
      title: L('לצאת בלי לשמור?', 'Leave without saving?'),
      message: L('הנוכחות, העומס וההערות שרשמת לא נשמרו.', 'The attendance, load and notes you logged were not saved.'),
      confirmText: L('צא בלי לשמור', 'Leave without saving'),
      cancelText: L('חזרה לסקירה', 'Back to the review'),
      danger: true,
    })
    closing.current = false
    if (ok) onClose()
  }, [onClose])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  const setP = (setter) => (rid, val) => { dirty.current = true; setter((c) => ({ ...c, [rid]: val })) }
  // סימון יעד: ריק → עמד ✓ → לא עמד — → ריק
  const cycleMark = (rid, goalId) => {
    dirty.current = true
    setCoachMarks((c) => {
      const cur = c[rid]?.[goalId]
      const next = cur === undefined ? true : cur === true ? false : undefined
      const row = { ...(c[rid] || {}) }
      if (next === undefined) delete row[goalId]; else row[goalId] = next
      return { ...c, [rid]: row }
    })
  }

  const save = async () => {
    if (!roster) return
    setSaving(true)
    dirty.current = false
    const byId = Object.fromEntries(roster.map((p) => [p.id, p]))
    let sqlMissing = false
    // כתיבה שנכשלה (רשת של אולם ספורט) — לא סוגרים את החלון ולא אומרים «נשמר»,
    // מחזירים את מצב «יש שינוי שלא נשמר» כדי שהמאמן ינסה שוב בלי לאבד שורה.
    const fail = (msg, e) => { dirty.current = true; setSaving(false); toast.error(msg + (e?.message || '')) }

    // 1) נוכחות
    const marks = Object.entries(att).filter(([, s]) => s)
    if (marks.length) {
      const { error } = sessionType === 'game'
        ? await supabase.from('game_attendance').upsert(marks.map(([rid, status]) => ({ coach_id: me, team, game_id: sessionId, player_id: rid, status })), { onConflict: 'game_id,player_id' })
        : await supabase.from('practice_attendance').upsert(marks.map(([rid, status]) => ({ coach_id: me, team, session_date: sessionDate, player_id: rid, status })), { onConflict: 'coach_id,team,session_date,player_id' })
      if (error) { fail(L('שמירת הנוכחות נכשלה: ', 'Saving attendance failed: '), error); return }
    }
    // סימון נוכחות שהיה שמור ובוטל — בלי המחיקה הוא היה חוזר בפתיחה הבאה
    const clearedAtt = Object.keys(loadedAtt.current).filter((rid) => !att[rid])
    if (clearedAtt.length) {
      const q = sessionType === 'game'
        ? supabase.from('game_attendance').delete().eq('game_id', sessionId).in('player_id', clearedAtt)
        : supabase.from('practice_attendance').delete().eq('coach_id', me).eq('team', team).eq('session_date', sessionDate).in('player_id', clearedAtt)
      const { error } = await q
      if (error) { fail(L('מחיקת סימון נוכחות נכשלה: ', 'Clearing an attendance mark failed: '), error); return }
    }

    // 1ב) עומס שהמאמן רשם (צד המאמן בלבד) — שורה לכל שחקן, על שורת הסגל
    if (COACH_MODE) {
      // ⚠ player_id נשאר ריק בכוונה גם לשחקן מקושר: unique (session_id, player_id)
      // של הדירוג העצמי עדיין בתוקף, ושורת מאמן עם player_id הייתה מתנגשת
      // בשורת השחקן (ונכתבת דרך המדיניות שלו). roster_id הוא הזהות היחידה.
      const rows = Object.entries(coachEff).filter(([, v]) => v).map(([rid, effort]) => ({
        coach_id: me, team, session_type: sessionType, session_id: sessionId, session_date: sessionDate,
        roster_id: rid, player_id: null, effort: Number(effort), source: 'coach',
      }))
      if (rows.length) {
        const { error } = await supabase.from('session_effort').upsert(rows, { onConflict: 'session_id,roster_id' })
        if (error) { if (missingCol(error, 'roster_id|source')) sqlMissing = true; else { fail(L('שמירת העומס נכשלה: ', 'Saving the load failed: '), error); return } }
      }
      // עומס שנמחק (לחיצה שנייה על אותו מספר מנקה) — מפתח עם ערך ריק קיים רק אם
      // נטען מהמסד או נבחר ובוטל; בלי המחיקה הערך הישן היה חוזר בפתיחה הבאה.
      const cleared = Object.entries(coachEff).filter(([, v]) => !v).map(([rid]) => rid)
      if (cleared.length) {
        const { error } = await supabase.from('session_effort').delete()
          .eq('coach_id', me).eq('session_id', sessionId).eq('source', 'coach').in('roster_id', cleared)
        if (error && !missingCol(error, 'roster_id|source')) { fail(L('מחיקת העומס נכשלה: ', 'Clearing the load failed: '), error); return }
      }
      // 1ג) «עמד ביעד» — סימוני המאמן
      const gmRows = []
      for (const [rid, byGoal] of Object.entries(coachMarks)) {
        for (const [goalId, met] of Object.entries(byGoal)) {
          if (met === undefined) continue
          gmRows.push({ coach_id: me, session_id: sessionId, goal_id: goalId, roster_id: rid, player_id: null, met: !!met })
        }
      }
      if (gmRows.length) {
        const { error } = await supabase.from('session_goal_marks').upsert(gmRows, { onConflict: 'session_id,goal_id,roster_id' })
        if (error) { if (missingCol(error, 'roster_id')) sqlMissing = true; else { fail(L('שמירת סימוני היעדים נכשלה: ', 'Saving the goal marks failed: '), error); return } }
      }
      // סימון שהיה שמור ובוטל (חזר ל«ריק») — מוחקים, אחרת הוא חוזר בפתיחה הבאה
      const gone = []
      for (const [rid, byGoal] of Object.entries(loadedMarks.current)) {
        for (const goalId of Object.keys(byGoal)) if (coachMarks[rid]?.[goalId] === undefined) gone.push({ rid, goalId })
      }
      if (gone.length) {
        const res = await Promise.all(gone.map(({ rid, goalId }) =>
          supabase.from('session_goal_marks').delete().match({ session_id: sessionId, goal_id: goalId, roster_id: rid, coach_id: me })))
        const err = res.find((r) => r.error)?.error
        if (err && !missingCol(err, 'roster_id')) { fail(L('מחיקת סימון יעד נכשלה: ', 'Clearing a goal mark failed: '), err); return }
      }
    }

    // 2) הערה אישית לכל שורת סגל.
    // 3.9 — פרטיות בפיילוט: ההערה שנכתבת כאן היא **של המאמן בלבד** — roster_id
    // מלא, player_id ריק (השחקן קורא player_feedback רק לפי player_id — fb_player_read),
    // ובלי התראה לשחקן גם כשצד השחקן פתוח. משוב מפורש לשחקן נשאר ב«שליחת
    // משוב לשחקן» (Teams / PlayerCard).
    // 3.9 — גם בעדכון שולחים player_id:null: הערה שנערכת בתיבה הזו היא פרטית
    // בהגדרה. בלי זה, הערה ישנה שנשמרה עם player_id (22.8–3.9, או לפני 22.8)
    // נשארת גלויה לשחקן — והתווית «רק אתה רואה» משקרת בדיוק עליה. ניקוי
    // חד-פעמי להערות הישנות: ראו supabase_roster_link_merge_3_9.sql.
    const notified = new Set()
    for (const p of roster) {
      const nt = (note[p.id] || '').trim() || null
      if (!nt && !fbId[p.id]) continue
      const payload = {
        coach_id: me, roster_id: p.id, content: nt,
        session_type: sessionType, session_id: sessionId, session_date: sessionDate,
        opponent: entry.opponent || null,
      }
      if (fbId[p.id]) {
        let { error } = await supabase.from('player_feedback').update({ ...payload, player_id: null }).eq('id', fbId[p.id])
        // מסד שטרם הריץ 22.8: אין roster_id, והשורה שם ממוקשת ב-player_id —
        // לא נוגעים בו (איפוס היה מייתם את השורה גם מהמאמן)
        if (error && missingCol(error, 'roster_id')) ({ error } = await supabase.from('player_feedback').update({ ...payload, roster_id: undefined }).eq('id', fbId[p.id]))
        if (error) { fail(L('שמירת ההערה האישית נכשלה: ', 'Saving the personal note failed: '), error); return }
      } else {
        let { error } = await supabase.from('player_feedback').insert({ ...payload, player_id: null })
        if (error && missingCol(error, 'roster_id')) {
          // 3.9 — מסד שטרם הריץ 22.8: אין roster_id, ושורה שם נכתבת רק על
          // player_id — כלומר גלויה לשחקן. הערה «רק אתה רואה» לא נכתבת לעמודה
          // שהשחקן קורא: מתנהגים כמו בלי חשבון — מבקשים להריץ את ה-SQL.
          // (הניסיון הקודם גם נכשל תמיד — ה-payload עוד הכיל roster_id.)
          sqlMissing = true; continue
        }
        if (error) { fail(L('שמירת ההערה האישית נכשלה: ', 'Saving the personal note failed: '), error); return }
      }
    }

    // 3) סקירת אימון (הערה כללית / MVP)
    const mvpP = mvp ? byId[mvp] : null
    const { error: revErr } = await supabase.from('session_reviews').upsert({
      coach_id: me, team, session_type: sessionType, session_id: sessionId, session_date: sessionDate,
      overall_note: overall.trim() || null,
      mvp_name: mvpP ? mvpP.name : null, mvp_player_id: mvpP?.player_id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'coach_id,session_type,session_id' })
    if (revErr) { fail(L('שמירת סיכום האימון נכשלה: ', 'Saving the session summary failed: '), revErr); return }
    if (PLAYER_SIDE && mvpP?.player_id && !notified.has(mvpP.player_id)) {
      sendNotification({ to: mvpP.player_id, actor: me, type: 'message', content: L('נבחרת ל-MVP של האימון! 🏀', 'You were picked MVP of the session! 🏀'), nav: 'feedback' })
      notified.add(mvpP.player_id)
    }

    // סיכום אוטומטי לצ'אט הקבוצה — בשמירה הראשונה בלבד, כדי לא להציף בעריכות.
    // סוגר את המעגל: השחקנים רואים את השורה בלי שהמאמן יקליד אותה פעמיים.
    // (צד המאמן בלבד: אין צ׳אט קבוצתי ואין מי שיקרא)
    if (PLAYER_SIDE && !hadReview) {
      const dateLbl2 = sessionDate ? new Date(sessionDate + 'T00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : ''
      const parts = [
        sessionType === 'game'
          ? `📋 סיכום המשחק${entry.opponent ? ` נגד ${entry.opponent}` : ''}${dateLbl2 ? ` (${dateLbl2})` : ''}`
          : `📋 סיכום האימון${dateLbl2 ? ` (${dateLbl2})` : ''}`,
        overall.trim() || null,
        mvpP ? `🏀 MVP: ${mvpP.name}` : null,
      ].filter(Boolean)
      if (parts.length > 1) {
        await supabase.from('team_messages').insert({ coach_id: me, team, content: parts.join('\n') })
      }
    }

    // התראה אחת "הסיכום מוכן" לשחקנים שלא קיבלו התראה אישית — רק בשמירה הראשונה
    if (PLAYER_SIDE && !hadReview) {
      const dateLbl = sessionDate ? new Date(sessionDate + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric' }) : ''
      for (const p of roster) {
        if (!p.player_id || notified.has(p.player_id)) continue
        sendNotification({
          to: p.player_id, actor: me, type: 'message',
          content: sessionType === 'game'
            ? L(`סיכום המשחק${dateLbl ? ` של ${dateLbl}` : ''} מוכן 🏀`, `Game recap${dateLbl ? ` for ${dateLbl}` : ''} is ready 🏀`)
            : L(`סיכום האימון${dateLbl ? ` של ${dateLbl}` : ''} מוכן 🏀`, `Practice recap${dateLbl ? ` for ${dateLbl}` : ''} is ready 🏀`),
          nav: 'feedback',
        })
      }
    }

    setSaving(false)
    if (sqlMissing) { dirty.current = true; toast.error(SQL_HINT()); return }
    toast.success(L('הסקירה נשמרה', 'Session saved'))
    onClose()
  }

  const present = Object.values(att).filter((s) => s && s !== 'absent').length
  const marked = Object.values(att).filter(Boolean).length
  // «כולם נוכחים» — 12 טאפים הופכים לאחד; אותו כפתור מנקה כשכולם כבר מסומנים
  const allPresent = !!roster && roster.length > 0 && roster.every((p) => att[p.id] === 'present')
  const toggleAllPresent = () => {
    if (!roster) return
    dirty.current = true
    setAtt((c) => { const n = { ...c }; for (const p of roster) n[p.id] = allPresent ? '' : 'present'; return n })
  }
  // ממוצע קבוצתי: מה שהמאמן רשם + מה שהשחקנים דירגו (שחקן שיש לו שניהם — של המאמן)
  const effVals = roster
    ? roster.map((p) => Number(coachEff[p.id]) || efforts[p.id] || null).filter(Boolean)
    : []
  const avgEffort = effVals.length ? (effVals.reduce((s, v) => s + v, 0) / effVals.length) : null

  const body = (
    <div className="sd-modal" onClick={() => requestClose()}>
      <div className="sd-inner" onClick={(e) => e.stopPropagation()}>
        <header className={`sd-hero ${sessionType}`}>
          <button className="icon-btn sd-close" onClick={() => requestClose()} aria-label={L('סגור', 'Close')}><X size={18} /></button>
          <span className="sd-badge">{sessionType === 'game' ? L('סקירת משחק', 'Game review') : L('סקירת אימון', 'Practice review')}</span>
          <h2>{sessionType === 'game' && entry.opponent ? `${trTeam(team)} — ${entry.opponent}` : trTeam(team)}</h2>
          <span className="sd-date">
            {sessionDate ? new Date(sessionDate + 'T00:00').toLocaleDateString(L('he-IL', 'en-US'), { weekday: 'long', day: 'numeric', month: 'numeric' }) : ''}
            {entry.start_time ? ` · ${String(entry.start_time).slice(0, 5)}` : ''}
            {marked > 0 ? ` · ${L('נוכחות', 'Attendance')} ${present}/${marked}` : ''}
          </span>
          {avgEffort != null && (
            <span className="sd-avg"><Flame size={14} /> {L('עומס קבוצתי ממוצע', 'Team avg load')} {avgEffort.toFixed(1)}/10 · {effVals.length} {COACH_MODE ? L('נרשמו', 'logged') : L('דירגו', 'rated')}</span>
          )}
        </header>

        <div className="sd-scroll">
          <p className="sd-hint">
            {COACH_MODE
              ? PLAYER_SIDE
                /* 3.9 — שתי אמיתות: המאמן רושם, והדירוג העצמי של שחקן מחובר מופיע לצידו */
                ? L('נוכחות, עומס, יעדים והערה פרטית — הכול נרשם על ידך. שחקן מחובר שדירג את עצמו — הדירוג שלו יופיע ליד שלך.',
                    'Attendance, load, goals and a private note — all logged by you. A connected player who rated himself shows next to your rating.')
                : L('נוכחות, עומס, יעדים ומילה אישית — הכול נרשם על ידך. שאל את השחקנים בסוף האימון «כמה קשה היה, 1 עד 10?» ורשום לכל אחד.',
                  'Attendance, load, goals and a personal line — all logged by you. Ask the players at the end of practice “how hard was it, 1 to 10?” and log it per player.')
              : L('נוכחות, משוב אישי ו-MVP נקבעים על ידך. את המאמץ מדרגים השחקנים בעצמם בסוף האימון.', 'You set attendance, personal notes and MVP. Players rate their own effort after practice.')}
          </p>

          {loadErr ? (
            /* שליפת הסגל נכשלה — שגיאה עם «נסה שוב», לא «אין שחקנים» */
            <ErrorState compact onRetry={load} />
          ) : roster === null ? (
            <SkeletonRoster count={6} />
          ) : roster.length === 0 ? (
            <p className="muted small">{L('אין שחקנים בסגל של הקבוצה הזו עדיין.', 'No players in this team roster yet.')}</p>
          ) : (
            <>
            <button type="button" className="btn-soft sd-allpresent" onClick={toggleAllPresent}>
              <Check size={15} /> {allPresent ? L('ניקוי הנוכחות', 'Clear attendance') : L('כולם נוכחים', 'Everyone present')}
            </button>
            <ul className="sd-roster">
              {roster.map((p) => {
                // 3.9 — המאמן רושם על כל שורת סגל (COACH_LOGS), ולכן כל שורה
                // «מחוברת» לרישום; linked = יש חשבון שחקן (דירוג עצמי, «ראיתי»)
                const connected = COACH_MODE || !!p.player_id
                const linked = !!p.player_id
                const eff = efforts[p.id]
                const opts = goalOpts[p.id] || []
                // 4.9 — פיילוט: כשהשחקן כבר דירג את עצמו והמאמן לא רשם,
                // הדירוג העצמי הוא התג הראשי ושורת ה-1–10 יורדת — הבעלים
                // ממלא רק למי שלא דיווח. רשם המאמן בכל זאת? שני התגים מוצגים.
                // == null ולא falsy: מאמן שניקה עומס שרשם ('' ) עדיין רואה את שורת ה-1–10
                const selfPrimary = COACH_MODE && linked && !!eff && coachEff[p.id] == null
                return (
                  <li key={p.id} className="sd-row">
                    <div className="sd-row-top">
                      {p.number ? <span className="pl-mate-num">{p.number}</span> : <Avatar name={p.name} size={30} />}
                      <span className="sd-name">{p.name}{!connected && <span className="muted small"> · {L('לא מחובר', 'not connected')}</span>}</span>
                      {COACH_MODE ? (
                        /* תצוגה בלבד — הבחירה עברה לשורת המספרים 1–10 מתחת (טאפ אחד
                           במקום בורר שנפתח, נגלל ונסגר, פעם לכל שחקן על המגרש) */
                        <>
                          {/* 4.9 — דיווח עצמי בלי רישום מאמן: הדירוג העצמי הוא התג הראשי */}
                          {selfPrimary ? (
                            <span className="sd-eff-badge on" title={L('מאמץ (דירוג עצמי של השחקן)', 'Effort (player self-rated)')}>
                              <Flame size={13} /> <bdi dir="ltr">{eff}/10</bdi> · {L('דיווח עצמי', 'self')}
                            </span>
                          ) : (
                            <span className={coachEff[p.id] ? 'sd-eff-badge on' : 'sd-eff-badge'} title={L('עומס האימון לשחקן (1–10)', 'Practice load for the player (1–10)')}>
                              <Flame size={13} /> {coachEff[p.id] ? `${coachEff[p.id]}/10` : L('עומס', 'Load')}
                            </span>
                          )}
                          {/* 3.9 — הדירוג העצמי של שחקן מקושר מוצג לצד מה שהמאמן רשם, לא במקומו */}
                          {!selfPrimary && linked && eff && <span className="sd-eff-badge" title={L('מאמץ (דירוג עצמי של השחקן)', 'Effort (player self-rated)')}>{L('השחקן: ', 'Player: ')}<bdi dir="ltr">{eff}/10</bdi></span>}
                        </>
                      ) : connected && (
                        <span className={eff ? 'sd-eff-badge on' : 'sd-eff-badge'} title={L('מאמץ (דירוג עצמי)', 'Effort (self-rated)')}>
                          <Flame size={13} /> {eff ? `${eff}/10` : L('טרם דירג', '—')}
                        </span>
                      )}
                      <button className={mvp === p.id ? 'sd-mvp on' : 'sd-mvp'} onClick={() => { dirty.current = true; setMvp(mvp === p.id ? null : p.id) }} title={L('MVP', 'MVP')} aria-pressed={mvp === p.id}>
                        <Crown size={16} />
                      </button>
                    </div>
                    <div className="sd-row-ctl">
                      <div className="sd-att">
                        {ATT.map((a) => (
                          <button key={a.id} className={att[p.id] === a.id ? `sd-att-btn ${a.tone} on` : 'sd-att-btn'} onClick={() => setP(setAtt)(p.id, att[p.id] === a.id ? '' : a.id)}>
                            {L(a.label[0], a.label[1])}
                          </button>
                        ))}
                      </div>
                      {connected && (
                        <button className={openNote[p.id] || note[p.id] ? 'sd-note-btn on' : 'sd-note-btn'} onClick={() => setP(setOpenNote)(p.id, !openNote[p.id])} title={L('הערה פרטית — רק אתה רואה', 'Private note — only you')} aria-label={L('הערה פרטית — רק אתה רואה', 'Private note — only you')}>
                          <StickyNote size={15} />
                        </button>
                      )}
                    </div>
                    {/* עומס 1–10 בטאפ אחד; לחיצה שנייה על אותו מספר מנקה.
                        4.9 — לא מוצג כשיש דיווח עצמי בלי רישום מאמן (selfPrimary):
                        הבעלים ממלא רק למי שלא דיווח. */}
                    {COACH_MODE && !selfPrimary && (
                      <div className="sd-effort" role="group" aria-label={L(`עומס לשחקן ${p.name}`, `Load for ${p.name}`)}>
                        <span className="sd-effort-lbl">{L('עומס', 'Load')}</span>
                        {EFFORT_OPTS.map((n) => (
                          <button key={n} type="button" className={coachEff[p.id] === n ? 'sd-e on' : 'sd-e'} aria-pressed={coachEff[p.id] === n}
                            onClick={() => setP(setCoachEff)(p.id, coachEff[p.id] === n ? '' : n)}>{n}</button>
                        ))}
                      </div>
                    )}
                    {connected && (openNote[p.id] || note[p.id]) && (
                      /* 3.9 — הערה פרטית של המאמן (roster_id בלבד, בלי התראה) */
                      <input className="finder-input sd-note-input" value={note[p.id] || ''} onChange={(e) => setP(setNote)(p.id, e.target.value)} aria-label={L('הערה פרטית — רק אתה רואה', 'Private note — only you')} placeholder={L('הערה פרטית — רק אתה רואה. מה בלט אצלו היום...', 'Private note — only you. What stood out today...')} maxLength={300} />
                    )}
                    {/* «עמד ביעד?» — המאמן מסמן (צד המאמן בלבד): ריק → ✓ → — → ריק */}
                    {COACH_MODE && opts.length > 0 && (
                      <div className="sd-gm-row" role="group" aria-label={L(`יעדים של ${p.name}`, `${p.name}'s goals`)}>
                        {opts.map((g) => {
                          const m = coachMarks[p.id]?.[g.id]
                          return (
                            <button key={g.id} type="button"
                              className={'sd-gm' + (m === true ? ' met' : m === false ? ' miss' : '')}
                              onClick={() => cycleMark(p.id, g.id)}
                              aria-pressed={m === true}
                              title={m === true ? L('עמד ביעד', 'Met') : m === false ? L('לא עמד', 'Missed') : L('לא סומן', 'Not marked')}>
                              {m === true ? <Check size={12} /> : m === false ? <Minus size={12} /> : <Target size={12} />}
                              {g.title}{g.team ? <span className="sd-gm-team">{L('קבוצתי', 'team')}</span> : null}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {connected && (moods[p.id] || focuses[p.id]) && (
                      <div className="sd-mf">
                        {moods[p.id] && MOOD_BY_KEY[moods[p.id]] && (
                          <span className="sd-mood" style={{ color: MOOD_BY_KEY[moods[p.id]].col, background: 'var(--surface-alt, var(--bg))' }}>
                            {L(MOOD_BY_KEY[moods[p.id]].label[0], MOOD_BY_KEY[moods[p.id]].label[1])}
                          </span>
                        )}
                        {(focuses[p.id] || []).map((f, i) => <span key={i} className="sd-focus">{f}</span>)}
                      </div>
                    )}
                    {PLAYER_SIDE && connected && playerNotes[p.id] && (
                      <div className="sd-player-note"><span className="sd-player-note-lbl">{L('השחקן רשם:', 'Player wrote:')}</span> {playerNotes[p.id]}</div>
                    )}
                    {/* "ראיתי 👍" — טאפ אחד שאומר לנער שהסיכום שלו לא נעלם לחלל (צד שחקן פתוח בלבד) */}
                    {PLAYER_SIDE && connected && acks[p.id] && (
                      acks[p.id].acked ? (
                        <span className="sd-ack done"><Check size={13} /> {L('סימנת שראית', 'Marked as seen')}</span>
                      ) : (
                        <button type="button" className="sd-ack" onClick={async () => {
                          const { error } = await supabase.rpc('ack_session_effort', { p_session_id: sessionId, p_player_id: acks[p.id].auth })
                          if (error) { toast.error(L('הסימון נכשל', 'Failed to mark')); return }
                          setAcks((a) => ({ ...a, [p.id]: { ...a[p.id], acked: true } }))
                          sendNotification({ to: acks[p.id].auth, actor: me, type: 'message', content: L('המאמן ראה את הסיכום שלך 👍', 'Your coach saw your summary 👍'), nav: 'feedback' })
                        }}>
                          👍 {L('ראיתי — שלח לשחקן', 'Seen — tell the player')}
                        </button>
                      )
                    )}
                    {connected && goalMarks[p.id] && goalMarks[p.id].length > 0 && (
                      <div className="sd-goal-marks">
                        {goalMarks[p.id].map((g, i) => (
                          <span key={i} className={g.met ? 'sd-goal-mark met' : 'sd-goal-mark miss'}>
                            {g.met ? <Check size={12} /> : <Minus size={12} />} {g.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            </>
          )}

          <label className="sd-overall">
            {/* 3.9 — הסיכום הכללי נקרא על ידי חברי הקבוצה (sr_member_read) — לפי PLAYER_SIDE, לא לפי מי רושם */}
            <span>{!PLAYER_SIDE ? L('סיכום האימון (נשמר להיסטוריה)', 'Session summary (saved to history)') : L('סיכום האימון (נשמר להיסטוריה, גלוי לשחקנים מחוברים)', 'Session summary (saved to history, visible to connected players)')}</span>
            <textarea className="finder-input" value={overall} onChange={(e) => { dirty.current = true; setOverall(e.target.value) }} rows={3} placeholder={L('איך היה האימון? על מה עבדנו, מה בלט...', 'How was the session? What we worked on, what stood out...')} maxLength={2000} />
          </label>
        </div>

        <footer className="sd-foot">
          <button className="btn-primary sd-save" onClick={save} disabled={saving} aria-busy={saving}>
            {saving && <span className="btn-spinner" aria-hidden="true" />}
            <Save size={16} /> {L('שמירת הסקירה', 'Save review')}
          </button>
        </footer>
      </div>
    </div>
  )

  return createPortal(body, document.body)
}
