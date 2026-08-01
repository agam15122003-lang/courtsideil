// «הקבוצה והלו"ז» (מסמך ההשקה 1.13) — אזור אחד לשחקן עם ארבע לשוניות:
// לו"ז · הקבוצה שלי · צ'אט הקבוצה · המאמן שלי.
// «המאמן שלי» כולל ארבעה כפתורי בקשה מהירים שיוצרים הודעה מובנית בצ'אט:
// יעד חדש · פציעה/מחלה (מעדכן גם זמינות) · לא אגיע לאימון (נרשם באישורי
// ההגעה עם סיבה) · בקשת שיחה אישית.

import { useState, useEffect } from 'react'
import {
  CalendarDays, Users, MessagesSquare, MessageSquare, Target,
  HeartPulse, CalendarX, Phone, Trophy, MapPin,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './toast'
import { L, trTeam } from './i18n'
import { sendNotification } from './notify'
import { expandSlots } from './sessionId'
import TeamChat from './TeamChat'
import CoachChat from './CoachChat'
import LeagueTable from './LeagueTable'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ilShort = (s) => { const d = new Date(s + 'T00:00'); return isNaN(d) ? s : `${d.getDate()}.${d.getMonth() + 1}` }

const TABS = [
  { id: 'schedule', label: ['לו"ז', 'Schedule'], Icon: CalendarDays },
  { id: 'team', label: ['הקבוצה שלי', 'My team'], Icon: Users },
  { id: 'chat', label: ['צ\'אט הקבוצה', 'Team chat'], Icon: MessagesSquare },
  { id: 'coach', label: ['המאמן שלי', 'My coach'], Icon: MessageSquare },
]

// ---------- הקבוצה שלי: סגל יבש + המשחק הבא + טבלת הליגה ----------
function MyTeamTab({ membership }) {
  const [mates, setMates] = useState(null)
  const [nextGame, setNextGame] = useState(null)
  const [iba, setIba] = useState(null) // {league_id, league_name, iba_team_name} או null

  useEffect(() => {
    if (!membership) return
    let alive = true
    ;(async () => {
      const [rosterRes, gameRes, ibaRes] = await Promise.all([
        supabase.rpc('team_roster', { _coach: membership.coach_id, _team: membership.team }),
        supabase.from('team_games').select('*')
          .eq('coach_id', membership.coach_id).eq('team', membership.team)
          .gte('game_date', ymd(new Date())).order('game_date').limit(1),
        // קריאת חברי קבוצה דורשת את supabase_team_hub.sql — עד אז הטבלה פשוט לא מוצגת
        supabase.from('team_iba').select('league_id, league_name, iba_team_name')
          .eq('coach_id', membership.coach_id).eq('team', membership.team).maybeSingle(),
      ])
      if (!alive) return
      if (rosterRes.error) {
        const legacy = await supabase.from('team_players')
          .select('id, name, number, position')
          .eq('coach_id', membership.coach_id).eq('team', membership.team).order('number')
        if (!alive) return
        setMates(legacy.data || [])
      } else {
        setMates(rosterRes.data || [])
      }
      setNextGame(gameRes.data?.[0] || null)
      setIba(ibaRes.error ? null : ibaRes.data)
    })()
    return () => { alive = false }
  }, [membership])

  return (
    <div className="pth-team">
      {nextGame && (
        <div className="pth-nextgame">
          <span className="pth-nextgame-ic" aria-hidden="true"><Trophy size={18} /></span>
          <div className="pth-nextgame-tx">
            <b>{nextGame.opponent ? L(`המשחק הבא: נגד ${nextGame.opponent}`, `Next game: vs ${nextGame.opponent}`) : L('המשחק הבא', 'Next game')}</b>
            <span className="muted small">
              <bdi dir="ltr">{ilShort(nextGame.game_date)}</bdi>
              {nextGame.game_time && <> · <bdi dir="ltr">{String(nextGame.game_time).slice(0, 5)}</bdi></>}
              {nextGame.location && <> · <MapPin size={11} aria-hidden="true" /> {nextGame.location}</>}
            </span>
          </div>
        </div>
      )}

      <p className="pl-section-label"><Users size={15} /> {L('הסגל', 'Roster')}</p>
      {mates === null ? null : mates.length === 0 ? (
        <p className="muted small">{L('אין עדיין שחקנים בסגל.', 'No players in the roster yet.')}</p>
      ) : (
        <ul className="pls-roster-list pth-roster">
          {mates.map((m) => (
            <li key={m.id}>
              {m.number ? <span className="pl-mate-num">{m.number}</span> : <span className="pl-mate-num">·</span>}
              <span className="pls-roster-name">{m.name}</span>
              {m.position && <span className="muted small">{m.position}</span>}
            </li>
          ))}
        </ul>
      )}

      {iba?.league_id && (
        <div className="pth-league">
          <p className="pl-section-label"><Trophy size={15} /> {L('טבלת הליגה', 'League table')}</p>
          <LeagueTable leagueId={iba.league_id} leagueName={iba.league_name} highlight={iba.iba_team_name || membership.team} />
        </div>
      )}
    </div>
  )
}

// ---------- המאמן שלי: בקשות מהירות + צ'אט ----------
function QuickRequests({ session, membership, coach }) {
  const me = session.user.id
  const [mode, setMode] = useState(null) // null | 'injury' | 'miss'
  const [note, setNote] = useState('')
  const [injKind, setInjKind] = useState('injured')
  const [busy, setBusy] = useState(false)

  const sendChat = async (text) => {
    const { error } = await supabase.from('messages').insert({ sender_id: me, recipient_id: membership.coach_id, content: text })
    if (!error) sendNotification({ to: membership.coach_id, actor: me, type: 'message', content: L('שלח לך הודעה', 'sent you a message'), nav: 'messages' })
    return !error
  }

  const askGoal = async () => {
    setBusy(true)
    const ok = await sendChat(L('🎯 בקשה מהאפליקציה: אשמח שתציב לי יעד חדש.', '🎯 App request: I would love a new goal.'))
    setBusy(false)
    ok ? toast.success(L('הבקשה נשלחה למאמן', 'Request sent')) : toast.error(L('השליחה נכשלה', 'Failed to send'))
  }

  const askTalk = async () => {
    setBusy(true)
    const ok = await sendChat(L('💬 בקשה מהאפליקציה: אשמח לשיחה אישית כשנוח לך.', '💬 App request: I would love a personal chat when convenient.'))
    setBusy(false)
    ok ? toast.success(L('הבקשה נשלחה למאמן', 'Request sent')) : toast.error(L('השליחה נכשלה', 'Failed to send'))
  }

  // עדכון פציעה/מחלה — מעדכן גם את הזמינות בכרטיס השחקן (RPC מ-1.7) וגם מודיע למאמן
  const sendInjury = async () => {
    setBusy(true)
    const { error: availErr } = await supabase.rpc('set_my_availability', { _status: injKind, _note: note.trim() || null })
    const kindTxt = injKind === 'sick' ? L('חולה', 'sick') : L('פצוע', 'injured')
    const ok = await sendChat(L(`🤕 עדכון מהאפליקציה: אני ${kindTxt}${note.trim() ? ` — ${note.trim()}` : ''}.`, `🤕 App update: I'm ${kindTxt}${note.trim() ? ` — ${note.trim()}` : ''}.`))
    setBusy(false)
    if (ok) {
      toast.success(availErr
        ? L('המאמן עודכן בהודעה', 'Coach notified')
        : L('המאמן עודכן והסטטוס שלך בכרטיס השחקן התעדכן', 'Coach notified and your availability updated'))
      setMode(null); setNote('')
    } else toast.error(L('השליחה נכשלה', 'Failed to send'))
  }

  // לא אגיע לאימון — נרשם באישורי ההגעה של האימון הקרוב, עם הסיבה
  const sendMiss = async () => {
    setBusy(true)
    const { data: slots } = await supabase.from('team_practice_slots').select('*')
      .eq('coach_id', membership.coach_id).eq('team', membership.team)
    const { data: entries } = await supabase.from('schedule_entries').select('id, date')
      .eq('created_by', membership.coach_id).eq('team', membership.team)
      .gte('date', ymd(new Date())).order('date').limit(5)
    const cands = [
      ...expandSlots(slots || [], 0, 14).map((o) => ({ session_id: o.session_id, date: o.date })),
      ...(entries || []).map((e) => ({ session_id: e.id, date: e.date })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const next = cands[0] || null
    if (next) {
      const row = {
        coach_id: membership.coach_id, team: membership.team,
        session_id: next.session_id, session_date: next.date,
        player_id: me, response: 'no',
      }
      let { error } = await supabase.from('practice_rsvp')
        .upsert({ ...row, reason: note.trim() || null }, { onConflict: 'session_id,player_id' })
      if (error) await supabase.from('practice_rsvp').upsert(row, { onConflict: 'session_id,player_id' })
    }
    const ok = await sendChat(L(`🙋 עדכון מהאפליקציה: לא אגיע לאימון הקרוב${note.trim() ? ` — ${note.trim()}` : ''}.`, `🙋 App update: I can't make the next practice${note.trim() ? ` — ${note.trim()}` : ''}.`))
    setBusy(false)
    if (ok) { toast.success(L('המאמן עודכן ונרשם באישורי ההגעה', 'Coach notified and RSVP saved')); setMode(null); setNote('') }
    else toast.error(L('השליחה נכשלה', 'Failed to send'))
  }

  return (
    <div className="pth-quick">
      <p className="pl-section-label">{L('בקשות מהירות', 'Quick requests')}</p>
      <div className="pth-quick-grid">
        <button type="button" className="pth-quick-btn" disabled={busy} onClick={askGoal}>
          <Target size={16} /> {L('בקשת יעד חדש', 'New goal request')}
        </button>
        <button type="button" className={'pth-quick-btn' + (mode === 'injury' ? ' on' : '')} disabled={busy}
          onClick={() => { setMode(mode === 'injury' ? null : 'injury'); setNote('') }}>
          <HeartPulse size={16} /> {L('עדכון פציעה/מחלה', 'Injury / illness')}
        </button>
        <button type="button" className={'pth-quick-btn' + (mode === 'miss' ? ' on' : '')} disabled={busy}
          onClick={() => { setMode(mode === 'miss' ? null : 'miss'); setNote('') }}>
          <CalendarX size={16} /> {L('לא אגיע לאימון', "Can't make practice")}
        </button>
        <button type="button" className="pth-quick-btn" disabled={busy} onClick={askTalk}>
          <Phone size={16} /> {L('בקשת שיחה אישית', 'Personal chat request')}
        </button>
      </div>

      {mode === 'injury' && (
        <div className="pth-quick-form">
          <div className="pth-quick-kind">
            <button type="button" className={injKind === 'injured' ? 'chip selected' : 'chip'} onClick={() => setInjKind('injured')}>{L('פצוע', 'Injured')}</button>
            <button type="button" className={injKind === 'sick' ? 'chip selected' : 'chip'} onClick={() => setInjKind('sick')}>{L('חולה', 'Sick')}</button>
          </div>
          <input className="finder-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)}
            placeholder={L('פירוט (לא חובה) — למשל: נקע בקרסול', 'Details (optional)')} />
          <button type="button" className="btn-primary" style={{ marginTop: 0 }} disabled={busy} onClick={sendInjury}>
            {busy ? L('שולח…', 'Sending…') : L('עדכון המאמן', 'Notify coach')}
          </button>
        </div>
      )}
      {mode === 'miss' && (
        <div className="pth-quick-form">
          <input className="finder-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)}
            placeholder={L('סיבה (לא חובה) — למשל: מבחן מחר', 'Reason (optional)')} />
          <button type="button" className="btn-primary" style={{ marginTop: 0 }} disabled={busy} onClick={sendMiss}>
            {busy ? L('שולח…', 'Sending…') : L('עדכון המאמן', 'Notify coach')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function PlayerTeamHub({ session, membership, coach, initialTab, ScheduleView }) {
  const [tab, setTab] = useState(initialTab || 'schedule')
  useEffect(() => { if (initialTab) setTab(initialTab) }, [initialTab])

  return (
    <div className="pl-screen pth">
      <div className="tabs pth-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'tab active' : 'tab'}
            aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            <t.Icon size={15} aria-hidden="true" /> {L(t.label[0], t.label[1])}
          </button>
        ))}
      </div>

      {tab === 'schedule' && ScheduleView}
      {tab === 'team' && <MyTeamTab membership={membership} />}
      {tab === 'chat' && (
        <TeamChat session={session} coachId={membership.coach_id} team={membership.team} isCoach={false} />
      )}
      {tab === 'coach' && (
        <>
          <QuickRequests session={session} membership={membership} coach={coach} />
          <CoachChat session={session} coach={coach} />
        </>
      )}
    </div>
  )
}
